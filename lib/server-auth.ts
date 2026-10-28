import { and, eq, gt } from "drizzle-orm";
import { getDb, getLocalDatabase } from "@/db";
import { roles, userAccountResponsibilities, userGroupScopes, userPermissionOverrides, userSessions, users } from "@/db/schema";
import { randomToken, sha256 } from "./security";
import { dutyPermissions, permissionGranted } from "./permissions";

import { bindProjectRequest } from "./project-access";

const SESSION_COOKIE = "orbit_session";
const SESSION_DAYS = 7;

export type AuthUser = {
  projectId?: number;
  id: number;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
  roleCode: string;
  roleName: string;
  dataScope: string;
  permissions: string[];
  deniedPermissions: string[];
  primaryGroupId: number | null;
  groupScopes: Record<string, number[]>;
};

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function sessionCookie(token: string, expiresAt: Date) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function createSession(userId: number) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getDb().insert(userSessions).values({ userId, tokenHash, expiresAt: expiresAt.toISOString() });
  return { token, expiresAt };
}

export async function getSessionTokenHash(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  return token ? sha256(token) : "";
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const tokenHash = await getSessionTokenHash(request);
  if (!tokenHash) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      mustChangePassword: users.mustChangePassword,
      roleCode: roles.code,
      roleName: roles.name,
      dataScope: roles.dataScope,
      permissionsJson: roles.permissionsJson,
      primaryGroupId: users.primaryGroupId,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(userSessions.tokenHash, tokenHash), gt(userSessions.expiresAt, new Date().toISOString()), eq(users.status, "active")))
    .limit(1);
  if (!row) return null;
  await db.update(userSessions).set({ lastSeenAt: new Date().toISOString() }).where(eq(userSessions.tokenHash, tokenHash));
  let permissions: string[] = [];
  try { permissions = JSON.parse(row.permissionsJson) as string[]; } catch { permissions = []; }
  const [scopeRows,responsibilityRows,overrideRows] = await Promise.all([
    db.select({groupId:userGroupScopes.groupId,scopeType:userGroupScopes.scopeType}).from(userGroupScopes).where(eq(userGroupScopes.userId,row.id)),
    db.select({accountId:userAccountResponsibilities.accountId,responsibilityType:userAccountResponsibilities.responsibilityType}).from(userAccountResponsibilities).where(eq(userAccountResponsibilities.userId,row.id)),
    db.select({permissionKey:userPermissionOverrides.permissionKey,effect:userPermissionOverrides.effect}).from(userPermissionOverrides).where(eq(userPermissionOverrides.userId,row.id)),
  ]);
  const groupScopes:Record<string,number[]>={};
  for(const scope of scopeRows)(groupScopes[scope.scopeType]??=[]).push(scope.groupId);
  if(row.primaryGroupId&&!groupScopes.upload?.includes(row.primaryGroupId))(groupScopes.upload??=[]).push(row.primaryGroupId);
  const accountResponsibilities:Record<string,number[]>={};
  for(const responsibility of responsibilityRows){
    const key=responsibility.responsibilityType==="material_upload"||responsibility.responsibilityType==="material"?"materialUpload":responsibility.responsibilityType==="material_review"?"materialReview":responsibility.responsibilityType==="publisher"?"publishing":responsibility.responsibilityType;
    (accountResponsibilities[key]??=[]).push(responsibility.accountId);
  }
  const allowed=overrideRows.filter(item=>item.effect==="allow").map(item=>item.permissionKey);
  const deniedPermissions=overrideRows.filter(item=>item.effect==="deny").map(item=>item.permissionKey);
  permissions=[...new Set([...permissions,...dutyPermissions({primaryGroupId:row.primaryGroupId,groupScopes,accountResponsibilities}),...allowed])].filter(key=>!deniedPermissions.includes(key));
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    mustChangePassword: row.mustChangePassword,
    roleCode: row.roleCode,
    roleName: row.roleName,
    dataScope: row.dataScope,
    permissions,
    deniedPermissions,
    primaryGroupId: row.primaryGroupId,
    groupScopes,
  };
}

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return { user: null, response: Response.json({ error: "请先登录" }, { status: 401 }) } as const;
  const projectError=await bindProjectRequest(getLocalDatabase(),request,user);
  if(projectError)return {user:null,response:projectError} as const;
  return { user, response: null } as const;
}

export function hasPermission(user: AuthUser, permission: string) {
  return user.roleCode === "super_admin" || (!user.deniedPermissions.includes(permission)&&permissionGranted(user.permissions, permission));
}

export function groupScopeIds(user:AuthUser,scopeType:string){
  return [...new Set(user.groupScopes[scopeType]??[])];
}

export function hasGroupScope(user:AuthUser,scopeType:string,groupId:number|null|undefined){
  if(user.roleCode==="super_admin")return true;
  if(!groupId)return false;
  const assigned=groupScopeIds(user,scopeType);
  if(assigned.includes(groupId))return true;
  return (scopeType==="upload"||scopeType==="review")&&!assigned.length&&user.primaryGroupId===groupId;
}
