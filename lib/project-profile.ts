import {isProjectMaster} from './project-visibility';
import type {AuthUser} from './server-auth';
import type {DatabaseSync} from 'node:sqlite';
export function projectProfile(db:DatabaseSync,project:number,user:number){
 const row=db.prepare('SELECT p.*,r.permissions_json AS role_permissions,r.project_id AS role_project,r.name AS role_name FROM project_user_permissions p LEFT JOIN project_permission_roles r ON r.id=p.role_id WHERE p.project_id=? AND p.user_id=?').get(project,user) as (Record<string,unknown>&{revision:number;scope_version:number;role_id:number|null;permissions_json:string})|undefined;
 if(!row)return null;
 const raw=row.permissions_json;
 return {...row,permissions:JSON.parse(String(raw??'[]')) as string[]};
}
export function projectMemberGroups(db:DatabaseSync,project:number,user:number){return db.prepare("SELECT g.id,g.leader_user_id FROM content_groups g JOIN project_member_groups m ON m.group_id=g.id AND m.project_id=g.account_id WHERE m.project_id=? AND m.user_id=? AND g.status='active'").all(project,user);}

export function applyProjectProfile(db:DatabaseSync,user:AuthUser){
 if(!user.projectId)return;


 user.projectConfigured=true;
 const all=db.prepare("SELECT id FROM content_groups WHERE account_id=? AND status='active'").all(user.projectId).map(g=>Number(g.id));
 const leader=Boolean(db.prepare('SELECT 1 FROM project_leaders WHERE project_id=? AND user_id=?').get(user.projectId,user.id));
 user.projectLeader=leader;
 user.projectGroupIds=all;
 if(isProjectMaster(db,user)){user.projectConfigured=false;user.projectLeader=true;user.primaryGroupId=all[0]??null;user.groupScopes={upload:all,review:all,view:all};return;}
 user.primaryGroupId=all[0]??null;
 user.groupScopes={upload:all,review:all,view:leader?all:[]};
}
