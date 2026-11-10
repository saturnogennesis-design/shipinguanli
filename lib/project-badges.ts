import {crossWork} from './cross-work';
import {unreadCrossNotes} from './cross-note-reads';
import {responsible} from './cross-assignment';
import {isProjectMaster} from './project-visibility';
import type {DatabaseSync} from 'node:sqlite';
import type {AuthUser} from './server-auth';
import {projectPermission} from './server-auth';
import {recordVisible,fileVisible,type CrossRecord,type CrossFile} from './cross-workflow';
export function updateToken(db:DatabaseSync,kind:string,id:number,user:number){
 if(kind==='cross')return String(db.prepare('SELECT coalesce(max(id),0) AS n FROM cross_events WHERE record_id=? AND actor_id<>?').get(id,user)!.n);
 return ['SELECT coalesce(max(id),0) AS n FROM reviews WHERE content_id=? AND reviewer_user_id<>?','SELECT coalesce(max(id),0) AS n FROM publishing_events WHERE content_id=? AND operator_user_id<>?',"SELECT coalesce(max(a.id),0) AS n FROM audit_logs a JOIN contents c ON c.id=? WHERE a.object_type='content' AND coalesce(a.user_id,0)<>? AND (a.object_id=CAST(c.id AS TEXT) OR instr(','||a.object_id||',',','||c.code||',')>0)"].map(q=>String(db.prepare(q).get(id,user)!.n)).join(':');
}
export function markProjectRead(db:DatabaseSync,user:AuthUser,kind:string,id:number){if(!user.projectId)return;db.prepare('INSERT INTO project_update_reads(user_id,project_id,kind,record_id,token) VALUES(?,?,?,?,?) ON CONFLICT(user_id,project_id,kind,record_id) DO UPDATE SET token=excluded.token').run(user.id,user.projectId,kind,id,updateToken(db,kind,id,user.id));}
export function projectBadge(db:DatabaseSync,user:AuthUser,project:number,type:string){
 const unread=new Set<string>(),pending=new Set<string>();const modules:Record<string,{pending:Set<string>;updates:Set<string>}>={};const can=(k:string)=>projectPermission(user,k,project);
 const seen=(kind:string,id:number)=>String(db.prepare('SELECT token FROM project_update_reads WHERE user_id=? AND project_id=? AND kind=? AND record_id=?').get(user.id,project,kind,id)?.token??'');
 if(type==='cross_border'&&can('cross.view')){
 const rows=db.prepare("SELECT * FROM cross_records WHERE project_id=? AND lifecycle='active'").all(project) as CrossRecord[];
 for(const r of rows){if(!recordVisible(db,r,user))continue;
  const work=crossWork(db,r,user.id,{canCreate:can('cross.create'),canEdit:can('cross.edit'),canReview:can('cross.review'),canPublish:can('cross.publish')});if(work.actionable)pending.add('c'+r.id);
  if(can('cross.review')&&r.status==='pending'&&(db.prepare('SELECT * FROM cross_files WHERE record_id=? AND active=1').all(r.id) as CrossFile[]).every(f=>fileVisible(db,f,user)))pending.add('c'+r.id);
  if(unreadCrossNotes(db,user,project,r.id)>0)unread.add('c'+r.id);
  const token=updateToken(db,'cross',r.id,user.id);if(responsible(r)===user.id&&token!=='0'&&token!==seen('cross',r.id))unread.add('c'+r.id);
 const key=r.kind==='clue'?'线索库':r.kind==='mother'?'母版库':'产品管理';const bucket=modules[key]??(modules[key]={pending:new Set(),updates:new Set()});if(pending.has('c'+r.id))bucket.pending.add('c'+r.id);if(unread.has('c'+r.id))bucket.updates.add('c'+r.id);
 }
 }else if(type==='short_video'){
 const rows=db.prepare('SELECT id,uploader_user_id,review_status FROM contents WHERE account_id=? AND deleted_at IS NULL AND archived_at IS NULL').all(project);
 for(const r of rows){const id=Number(r.id);if(can('review.process')&&['pending','reviewing'].includes(String(r.review_status))&&(Number(r.uploader_user_id)!==user.id||isProjectMaster(db,user))&&(r.review_status==='pending'||!db.prepare('SELECT 1 FROM content_review_locks WHERE content_id=? AND reviewer_user_id<>? AND datetime(expires_at)>CURRENT_TIMESTAMP').get(id,user.id)))pending.add('v'+id);if(Number(r.uploader_user_id)===user.id&&['content.view','version.view','review.view','publishing.view'].some(can)){const token=updateToken(db,'video',id,user.id);if(token!=='0:0:0'&&token!==seen('video',id))unread.add('v'+id);}}
 }
 return {modules:Object.fromEntries(Object.entries(modules).map(([k,v])=>[k,{pending:v.pending.size,updates:v.updates.size}])),pending:pending.size,updates:unread.size,total:new Set([...pending,...unread]).size};
}
