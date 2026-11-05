import type {AuthUser} from './server-auth';
import type {DatabaseSync} from 'node:sqlite';
export function projectProfile(db:DatabaseSync,project:number,user:number){
 const row=db.prepare('SELECT p.*,r.permissions_json AS role_permissions,r.project_id AS role_project,r.name AS role_name FROM project_user_permissions p LEFT JOIN project_permission_roles r ON r.id=p.role_id WHERE p.project_id=? AND p.user_id=?').get(project,user) as (Record<string,unknown>&{revision:number;scope_version:number;role_id:number|null;permissions_json:string})|undefined;
 if(!row)return null;
 const raw=row.role_id?(Number(row.role_project)===project?row.role_permissions:'[]'):row.permissions_json;
 return {...row,permissions:JSON.parse(String(raw??'[]')) as string[]};
}
export function projectMemberGroups(db:DatabaseSync,project:number,user:number){return db.prepare("SELECT g.id,g.leader_user_id FROM content_groups g JOIN project_member_groups m ON m.group_id=g.id AND m.project_id=g.account_id WHERE m.project_id=? AND m.user_id=? AND g.status='active'").all(project,user);}

export function applyProjectProfile(db:DatabaseSync,user:AuthUser){
 if(!user.projectId)return;
 const profile=projectProfile(db,user.projectId,user.id);
 if(!profile||Number(profile.scope_version??1)<2)return;
 user.projectConfigured=true;
 const membership=projectMemberGroups(db,user.projectId,user.id).map(g=>Number(g.id));
 const led=db.prepare("SELECT id FROM content_groups WHERE account_id=? AND leader_user_id=? AND status='active'").all(user.projectId,user.id).map(g=>Number(g.id));
 user.projectGroupIds=[...new Set([...membership,...led])];
 user.primaryGroupId=user.projectGroupIds.includes(user.primaryGroupId??0)?user.primaryGroupId:user.projectGroupIds[0]??null;
 user.groupScopes={upload:user.projectGroupIds,review:user.projectGroupIds,view:led};
}
