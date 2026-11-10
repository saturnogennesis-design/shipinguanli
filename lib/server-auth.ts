import {commonExpanded} from './common-permissions';
import {projectProfile,applyProjectProfile as bindProfile} from './project-profile';
import {projectPermissionGranted,projectPermissionKeys} from './project-permission-catalog';
import {isProjectMaster} from './project-visibility';
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
  projectConfigured?: boolean;
  projectLeader?:boolean;
  commonConfigured?:boolean;
  projectGroupIds?: number[];
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
  return userForSessionHash(await getSessionTokenHash(request));
}
// Server-only use: a download ticket refers to an existing, still-active session.
export async function userForSessionHash(tokenHash:string): Promise<AuthUser | null> {
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
  const common=getLocalDatabase().prepare('SELECT permissions_json FROM user_common_permissions WHERE user_id=?').get(row.id);
  if(common){const saved=commonExpanded(JSON.parse(String(common.permissions_json)));permissions=[...permissions.filter(k=>/^(cross|transfer|asset|content|review|publishing|version|analytics)\./.test(k)||k.startsWith('business.')&&k!=='business.accounts'),...saved];}
  return {
    id: row.id,
    commonConfigured:!!common,
    username: row.username,
    displayName: row.displayName,
    mustChangePassword: row.mustChangePassword,
    roleCode: row.roleCode,
    roleName: row.roleName,
    dataScope: row.dataScope,
    permissions:isProjectMaster(getLocalDatabase(),row)?['*']:commonExpanded(permissions),
    deniedPermissions:isProjectMaster(getLocalDatabase(),row)?[]:deniedPermissions,
    primaryGroupId: row.primaryGroupId,
    groupScopes,
  };
}

const internalUsers=new WeakMap<Request,AuthUser>();
export function authorizeInternalRequest(request:Request,user:AuthUser){internalUsers.set(request,structuredClone(user));return request;}
export async function requireUser(request: Request) {
  const user = internalUsers.get(request)??await getCurrentUser(request);
  if (!user) return { user: null, response: Response.json({ error: "请先登录" }, { status: 401 }) } as const;
  const projectError=await bindProjectRequest(getLocalDatabase(),request,user);
  if(projectError)return {user:null,response:projectError} as const;
  return { user, response: null } as const;
}

export function projectPermission(user:AuthUser,permission:string,projectId:number){
 const db=getLocalDatabase();
 if(isProjectMaster(db,user))return true;
 const profile=projectProfile(db,projectId,user.id);
 if(profile)return Number(profile.scope_version)>=2?projectPermissionGranted(profile.permissions,permission):permissionGranted(projectPermissionKeys(profile.permissions),permission);
 if(db.prepare('SELECT 1 FROM user_common_permissions WHERE user_id=?').get(user.id))return false;
 // Legacy work assigned in project A must not become a write grant in project B.
 if(user.roleCode!=='super_admin'){
  const assigned=(types:string[])=>Boolean(db.prepare(`SELECT 1 FROM user_account_responsibilities WHERE user_id=? AND account_id=? AND responsibility_type IN (${types.map(()=>'?').join(',')})`).get(user.id,projectId,...types));
  const scoped=(scope:string)=>Boolean(db.prepare("SELECT 1 FROM content_groups g WHERE g.account_id=? AND g.status='active' AND (g.id=(SELECT primary_group_id FROM users WHERE id=?) OR EXISTS(SELECT 1 FROM user_group_scopes s WHERE s.user_id=? AND s.group_id=g.id AND s.scope_type=?))").get(projectId,user.id,user.id,scope));
  if((permission==='content.upload'||permission==='version.upload')&&!scoped('upload'))return false;
  if(permission.startsWith('review.')&&!scoped('review'))return false;
  if(permission.startsWith('publishing.')&&!assigned(['publisher']))return false;
  if(permission.startsWith('asset.')){
   const member=Boolean(db.prepare("SELECT 1 FROM content_groups g JOIN group_memberships m ON m.group_id=g.id WHERE g.account_id=? AND m.user_id=? AND g.status='active'").get(projectId,user.id));
   if(permission==='asset.upload'&&!assigned(['material','material_upload']))return false;
   if(permission==='asset.review'&&!assigned(['material','material_review']))return false;
   if(!member&&!assigned(['material','material_upload','material_review']))return false;
  }
 }
 // Existing projects retain their role baseline until an explicit project profile is saved.
 const legacy=permission==='cross.edit'?'cross.create':permission;
 if(permission.endsWith('.view')){const prefix=permission.split('.')[0]+'.';if(user.permissions.some(key=>key.startsWith(prefix)&&!user.deniedPermissions.includes(key)))return true;}
 return user.roleCode==='super_admin'||(!user.deniedPermissions.includes(permission)&&(permissionGranted(user.permissions,permission)||!user.deniedPermissions.includes(legacy)&&permissionGranted(user.permissions,legacy)));
}
export function hasPermission(user: AuthUser, permission: string) {
 if(user.commonConfigured&&!user.projectId&&!isProjectMaster(getLocalDatabase(),user))return commonExpanded(user.permissions).includes(permission);
 if(user.projectId&&/^(cross|transfer|asset|content|review|publishing|version|analytics|business)\./.test(permission))return projectPermission(user,permission,user.projectId);
  return isProjectMaster(getLocalDatabase(),user) || (!user.commonConfigured&&user.roleCode === "super_admin") || ((user.commonConfigured||!user.deniedPermissions.includes(permission))&&permissionGranted(commonExpanded(user.permissions), permission));
}

export function groupScopeIds(user:AuthUser,scopeType:string){
  return [...new Set(user.groupScopes[scopeType]??[])];
}

export function hasGroupScope(user:AuthUser,scopeType:string,groupId:number|null|undefined){
  if(user.projectConfigured&&scopeType==="review")return true;
  if(user.projectLeader&&scopeType==="view")return true;
  if(!groupId)return false;
  if(user.projectConfigured)return (scopeType==="view"?user.groupScopes.view??[]:user.projectGroupIds??[]).includes(groupId);
  if(user.roleCode==="super_admin")return true;
  const assigned=groupScopeIds(user,scopeType);
  if(assigned.includes(groupId))return true;
  return (scopeType==="upload"||scopeType==="review")&&!assigned.length&&user.primaryGroupId===groupId;
}

export function applyProjectProfile(user:AuthUser){bindProfile(getLocalDatabase(),user);}
