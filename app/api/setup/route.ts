import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contentGroups, departments, groupMemberships, roles, shortVideoAccounts, userGroupScopes, users } from "@/db/schema";
import { createSession, sessionCookie } from "@/lib/server-auth";
import { hashPassword } from "@/lib/security";
import { writeAudit } from "@/lib/audit";
import {employeeColor} from "@/lib/content-presentation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [row] = await getDb().select({ count: count() }).from(users);
    return Response.json({ setupRequired: row.count === 0 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "数据库尚未初始化" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const db = getDb();
  const [existing] = await db.select({ count: count() }).from(users);
  if (existing.count > 0) return Response.json({ error: "系统已经完成初始化" }, { status: 409 });

  const payload = await request.json() as { username?: string; displayName?: string; password?: string };
  const username = payload.username?.trim().toLowerCase() ?? "";
  const displayName = payload.displayName?.trim() ?? "";
  const password = payload.password ?? "";
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return Response.json({ error: "登录账号需为3至32位字母、数字或 ._-" }, { status: 400 });
  if (!displayName) return Response.json({ error: "请填写管理员姓名" }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "初始密码至少8位" }, { status: 400 });

  const [department] = await db.insert(departments).values({ name: "公司" }).returning();
  const [role] = await db.insert(roles).values({ code: "super_admin", name: "超级管理员", dataScope: "company", permissionsJson: JSON.stringify(["*"]) }).returning();
  const platformIds:number[]=[];
  for (const platform of [
    { code: "dy", name: "抖音", sortOrder: 1 },
    { code: "ks", name: "快手", sortOrder: 2 },
    { code: "xhs", name: "小红书", sortOrder: 3 },
  ]) platformIds.push(await envDbInsertPlatform(platform));
  let [defaultAccount]=await db.select().from(shortVideoAccounts).where(eq(shortVideoAccounts.code,"default_dy")).limit(1);
  if(!defaultAccount)[defaultAccount]=await db.insert(shortVideoAccounts).values({platformId:platformIds[0],code:"default_dy",name:"默认短视频账号"}).returning();
  let [defaultGroup]=await db.select().from(contentGroups).where(eq(contentGroups.code,"legacy_default")).limit(1);
  if(!defaultGroup)[defaultGroup]=await db.insert(contentGroups).values({code:"default",name:"内容一组",accountId:defaultAccount.id,departmentId:department.id,description:"初始化默认内容小组"}).returning();
  else await db.update(contentGroups).set({name:defaultGroup.name?.trim()||"内容一组",accountId:defaultAccount.id,departmentId:department.id,updatedAt:new Date().toISOString()}).where(eq(contentGroups.id,defaultGroup.id));
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ username, displayName, passwordHash, departmentId: department.id,primaryGroupId:defaultGroup.id, roleId: role.id, mustChangePassword: false }).returning();
  await db.insert(groupMemberships).values({userId:user.id,groupId:defaultGroup.id,isPrimary:true});
  for(const scopeType of ["view","upload","review"])await db.insert(userGroupScopes).values({userId:user.id,groupId:defaultGroup.id,scopeType,grantedByUserId:user.id});

  await db.update(users).set({contentColor:employeeColor(user.id)}).where(eq(users.id,user.id));

  await writeAudit(request, { userId: user.id, action: "system.initialize", objectType: "system", objectId: "local", details: { username } });
  const session = await createSession(user.id);
  return Response.json({ user: { id: user.id, username, displayName, role: "超级管理员" } }, { status: 201, headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } });
}

async function envDbInsertPlatform(platform: { code: string; name: string; sortOrder: number }) {
  const db = getDb();
  const { platforms } = await import("@/db/schema");
  const [existing] = await db.select({ id: platforms.id }).from(platforms).where(eq(platforms.code, platform.code)).limit(1);
  if (existing)return existing.id;
  const [created]=await db.insert(platforms).values(platform).returning({id:platforms.id});return created.id;
}
