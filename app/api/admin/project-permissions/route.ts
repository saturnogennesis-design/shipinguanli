import {permissionGranted} from '@/lib/permissions';
import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission,projectPermission,getCurrentUser} from '@/lib/server-auth';
import {maySeeProject,isProjectMaster} from '@/lib/project-visibility';
import {projectPermissionCatalog,projectPermissionKeys,projectRolePresets} from '@/lib/project-permission-catalog';
import {projectProfile,projectMemberGroups} from '@/lib/project-profile';
import {atomicWrite} from '@/lib/publishing-write';
import type {DatabaseSync} from 'node:sqlite';
function audit(db:DatabaseSync,actor:number,project:number,action:string,details:unknown){db.prepare('INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?)').run(actor,action,'project',String(project),JSON.stringify(details));}
async function context(request:Request,write=false){const auth=await requireUser(request);if(!auth.user)return {response:auth.response};if(!hasPermission(auth.user,write?'admin.roles':'admin.view'))return {response:Response.json({error:'没有项目权限配置权限'},{status:403})};return {user:auth.user,db:getLocalDatabase()};}
export async function GET(request:Request){
 const auth=await context(request);if(!auth.user)return auth.response;const {db,user}=auth,id=Number(new URL(request.url).searchParams.get('projectId'));
 if(!maySeeProject(db,user,id))return Response.json({error:'没有项目访问权限'},{status:403});
 const project=db.prepare('SELECT project_type FROM short_video_accounts WHERE id=?').get(id);if(!project)return Response.json({error:'项目不存在'},{status:404});
 const groups=projectPermissionCatalog(String(project.project_type)),people=db.prepare("SELECT id,username,display_name AS name FROM users WHERE status='active' ORDER BY display_name").all();
 const memberGroups=db.prepare("SELECT id,name,leader_user_id AS leaderId FROM content_groups WHERE account_id=? AND status='active' ORDER BY name").all(id);
 const users=[];for(const p of people){const profile=projectProfile(db,id,Number(p.id));
  // Resolve the actual legacy role + duties + personal overrides, not just the role JSON.
  const legacy=profile?null:await legacyUser(Number(p.id),user);
  const source=legacy??user;
  const selectedGroups=profile?projectMemberGroups(db,id,Number(p.id)).map(g=>Number(g.id)):db.prepare('SELECT g.id FROM content_groups g WHERE g.account_id=? AND (EXISTS(SELECT 1 FROM group_memberships m WHERE m.group_id=g.id AND m.user_id=?) OR EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.primary_group_id=g.id))').all(id,p.id,p.id).map(g=>Number(g.id));
  users.push({id:p.id,name:p.name,username:p.username,master:isProjectMaster(db,{id:Number(p.id)}),visible:maySeeProject(db,{id:Number(p.id)},id),configured:!!profile,scopeVersion:Number(profile?.scope_version??0),revision:Number(profile?.revision??0),roleId:profile?.role_id??null,groupIds:selectedGroups,grants:profile&&Number(profile.scope_version)>=2?profile.permissions:undefined,permissions:groups.flatMap(g=>g.permissions).filter(k=>profile?(Number(profile.scope_version)>=2?projectPermissionKeys(profile.permissions).includes(k.key):permissionGranted(projectPermissionKeys(profile.permissions),k.key)):projectPermission(source,k.key,id)).map(k=>k.key)});
 }
 return Response.json({groups,users,memberGroups,roles:db.prepare('SELECT id,name,permissions_json,revision FROM project_permission_roles WHERE project_id=? ORDER BY name').all(id).map(r=>({...r,permissions:JSON.parse(String(r.permissions_json))})),presets:projectRolePresets(String(project.project_type)),projectType:project.project_type,canManage:hasPermission(user,'admin.roles')});
}
// Build legacy effective grants with the same rules as login, while retaining the target identity.
async function legacyUser(id:number,base:NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>){
 const db=getLocalDatabase(),row=db.prepare('SELECT u.*,r.code AS role_code,r.permissions_json FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?').get(id)!;
 const {dutyPermissions}=await import('@/lib/permissions');const scopes:Record<string,number[]>={},responsibilities:Record<string,number[]>={};
 for(const r of db.prepare('SELECT group_id,scope_type FROM user_group_scopes WHERE user_id=?').all(id))(scopes[String(r.scope_type)]??=[]).push(Number(r.group_id));
 const primary=Number(row.primary_group_id)||null;if(primary)(scopes.upload??=[]).push(primary);
 for(const r of db.prepare('SELECT account_id,responsibility_type FROM user_account_responsibilities WHERE user_id=?').all(id)){const key=String(r.responsibility_type),mapped=key==='material'||key==='material_upload'?'materialUpload':key==='material_review'?'materialReview':key==='publisher'?'publishing':key;(responsibilities[mapped]??=[]).push(Number(r.account_id));}
 const overrides=db.prepare('SELECT permission_key,effect FROM user_permission_overrides WHERE user_id=?').all(id),denied=overrides.filter(r=>r.effect==='deny').map(r=>String(r.permission_key));
 return {...base,id,roleCode:String(row.role_code),projectId:undefined,primaryGroupId:primary,groupScopes:scopes,permissions:[...JSON.parse(String(row.permissions_json)),...dutyPermissions({primaryGroupId:primary,groupScopes:scopes,accountResponsibilities:responsibilities}),...overrides.filter(r=>r.effect==='allow').map(r=>String(r.permission_key))].filter(k=>!denied.includes(k)),deniedPermissions:denied};
}
export async function PUT(request:Request){
 const auth=await context(request,true);if(!auth.user)return auth.response;const {db,user}=auth,body=await request.json().catch(()=>null),project=Number(body?.projectId),userId=Number(body?.userId);
 if(!maySeeProject(db,user,project))return Response.json({error:'没有项目访问权限'},{status:403});
 if(isProjectMaster(db,{id:userId}))return Response.json({error:'hjt主账号权限不能替换'},{status:409});
 try{atomicWrite(db,()=>{
  if(!db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(userId))throw Error('员工不存在');
  const type=String(db.prepare('SELECT project_type FROM short_video_accounts WHERE id=?').get(project)?.project_type),valid=new Set(projectPermissionCatalog(type).flatMap(g=>g.permissions.map(p=>p.key)));
  const old=projectProfile(db,project,userId);if(Number(old?.revision??0)!==Number(body.revision))throw Error('权限已更新，请重新载入');
  const roleId=Number(body.roleId)||null,role=roleId?db.prepare('SELECT permissions_json FROM project_permission_roles WHERE id=? AND project_id=?').get(roleId,project):null;if(roleId&&!role)throw Error('角色不属于当前项目');
  const permissions=role?JSON.parse(String(role.permissions_json)):body.permissions;
  if(!Array.isArray(permissions)||permissions.some(k=>typeof k!=='string'||!valid.has(k)))throw Error('权限与当前项目类型不匹配');
  const groupIds=body.groupIds===undefined?projectMemberGroups(db,project,userId).map(g=>Number(g.id)):body.groupIds;
  if(!Array.isArray(groupIds)||groupIds.some(g=>!Number.isSafeInteger(g)||!db.prepare("SELECT id FROM content_groups WHERE id=? AND account_id=? AND status='active'").get(g,project)))throw Error('小组不属于当前项目');
  db.prepare('INSERT INTO project_user_permissions(project_id,user_id,permissions_json,updated_by,role_id,scope_version) VALUES(?,?,?,?,?,2) ON CONFLICT(project_id,user_id) DO UPDATE SET permissions_json=excluded.permissions_json,role_id=excluded.role_id,scope_version=2,revision=project_user_permissions.revision+1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').run(project,userId,JSON.stringify([...new Set(permissions)]),user.id,roleId);
  db.prepare('DELETE FROM project_member_groups WHERE project_id=? AND user_id=?').run(project,userId);for(const id of new Set<number>(groupIds))db.prepare('INSERT INTO project_member_groups(project_id,user_id,group_id) VALUES(?,?,?)').run(project,userId,id);
  audit(db,user.id,project,'admin.project_permissions',{userId,before:old?.permissions??null,permissions,roleId,groupIds});
 });return Response.json({ok:true});}catch(e){return Response.json({error:(e as Error).message},{status:409});}
}
export async function POST(request:Request){return saveRole(request);}
export async function PATCH(request:Request){return saveRole(request);}
async function saveRole(request:Request){const auth=await context(request,true);if(!auth.user)return auth.response;const {db,user}=auth,body=await request.json().catch(()=>null),project=Number(body?.projectId);if(!maySeeProject(db,user,project))return Response.json({error:'没有项目访问权限'},{status:403});try{const id=atomicWrite(db,()=>{
 const type=String(db.prepare('SELECT project_type FROM short_video_accounts WHERE id=?').get(project)?.project_type),valid=new Set(projectPermissionCatalog(type).flatMap(g=>g.permissions.map(p=>p.key))),name=String(body.name??'').trim();if(!name||name.length>80)throw Error('请填写80字以内角色名称');
 const permissions=body.permissions;if(!Array.isArray(permissions)||permissions.some(k=>typeof k!=='string'||!valid.has(k)))throw Error('权限与当前项目类型不匹配');
 let id=Number(body.id);if(request.method==='PATCH'){const old=db.prepare('SELECT revision FROM project_permission_roles WHERE id=? AND project_id=?').get(id,project);if(!old||Number(old.revision)!==Number(body.revision))throw Error('角色已更新，请重新载入');db.prepare('UPDATE project_permission_roles SET name=?,permissions_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?').run(name,JSON.stringify([...new Set(permissions)]),id,project);}else id=Number(db.prepare('INSERT INTO project_permission_roles(project_id,name,permissions_json) VALUES(?,?,?) RETURNING id').get(project,name,JSON.stringify([...new Set(permissions)]))!.id);
 audit(db,user.id,project,'admin.project_role',{id,name,permissions});return id;
 });return Response.json({ok:true,id},{status:request.method==='POST'?201:200});}catch(e){return Response.json({error:(e as Error).message.includes('UNIQUE')?'角色名称已存在':(e as Error).message},{status:409});}}
