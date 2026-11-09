import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {storageKey} from './cross-workflow';
import {atomicWrite} from './publishing-write';
import {getMediaStore} from './media-store';
export type BusinessKind='cross'|'content'|'material';
export function deletionPlan(db:DatabaseSync,kind:BusinessKind,id:number,project:number){
 const table=kind==='cross'?'cross_records':kind==='content'?'contents':'material_sets',projectColumn=kind==='cross'?'project_id':'account_id';
 const row=db.prepare(`SELECT * FROM ${table} WHERE id=? AND ${projectColumn}=?`).get(id,project);if(!row)throw Error('资料不存在或已彻底删除');
 if(kind==='cross'){
 if(row.status==='pending')throw Error('请先撤回审核再彻底删除');
 if(db.prepare('SELECT 1 FROM cross_records WHERE id<>? AND (parent_id=? OR main_id=? OR copied_from_id=?)').get(id,id,id,id)||db.prepare('SELECT 1 FROM cross_copy_notes WHERE source_record_id=? AND record_id<>?').get(id,id))throw Error('仍有下级或历史副本引用，请先处理关联资料，不能连带删除');
 const references=db.prepare('SELECT snapshot_json FROM cross_versions WHERE record_id<>?').all(id);if(references.some(r=>{const s=JSON.parse(String(r.snapshot_json));return [s.parentId,s.mainId].map(Number).includes(id);}))throw Error('其他资料的历史版本仍引用此资料，不能彻底删除');
 }else if(kind==='content'){
 if(['pending','reviewing'].includes(String(row.review_status)))throw Error('请先撤回或结束审核再彻底删除');
 if(db.prepare('SELECT 1 FROM publishing_records WHERE content_id=? UNION ALL SELECT 1 FROM publishing_events WHERE content_id=? UNION ALL SELECT 1 FROM platform_contents WHERE source_content_id=?').get(id,id,id))throw Error('仍有发布资料或发布历史，不能彻底删除源内容');
 if(db.prepare('SELECT 1 FROM reviews WHERE content_id=? AND recommended=1 AND recommendation_removed_at IS NULL').get(id))throw Error('请先取消推荐案例再彻底删除');
 }else if(row.status==='pending')throw Error('请先结束审核再彻底删除');
 const files=kind==='cross'?db.prepare('SELECT storage_path,cover_path FROM cross_files WHERE record_id=?').all(id):kind==='material'?db.prepare('SELECT storage_path FROM material_files WHERE set_id=?').all(id):[...db.prepare("SELECT storage_path,cover_path FROM content_versions WHERE content_id=? AND mime_type<>'application/x-image-set'").all(id),...db.prepare('SELECT cover_path FROM content_versions WHERE content_id=?').all(id),...db.prepare('SELECT f.storage_path FROM content_version_files f JOIN content_versions v ON v.id=f.version_id WHERE v.content_id=?').all(id)];
 const keys=[...new Set(files.flatMap(r=>[r.storage_path,r.cover_path]).filter((k):k is string=>typeof k==='string'&&Boolean(k)).map(storageKey))];
 for(const key of keys){
 const references=[...db.prepare("SELECT record_id owner,storage_path,cover_path FROM cross_files WHERE substr(storage_path,1,instr(storage_path||'#copy-','#copy-')-1)=? OR cover_path=?").all(key,key).map(r=>({kind:'cross',owner:r.owner})),...db.prepare('SELECT content_id owner FROM content_versions WHERE storage_path=? OR cover_path=?').all(key,key).map(r=>({kind:'content',owner:r.owner})),...db.prepare('SELECT v.content_id owner FROM content_version_files f JOIN content_versions v ON v.id=f.version_id WHERE f.storage_path=?').all(key).map(r=>({kind:'content',owner:r.owner})),...db.prepare('SELECT set_id owner FROM material_files WHERE storage_path=?').all(key).map(r=>({kind:'material',owner:r.owner})),...db.prepare('SELECT id owner FROM materials WHERE storage_path=?').all(key).map(r=>({kind:'legacy',owner:r.owner}))];
 if(references.some(r=>r.kind!==kind||Number(r.owner)!==id))throw Error('附件仍被其他资料引用，已阻止彻底删除');
 }
 return {row,keys,table,stamp:JSON.stringify(row)};
}
export async function permanentlyDelete(db:DatabaseSync,input:{kind:BusinessKind;id:number;project:number;actor:number;title?:string;revision:number;onDeleted?:()=>void}){
 const plan=deletionPlan(db,input.kind,input.id,input.project),{row,keys}=plan;if(input.title!==undefined&&input.title!==row.title)throw Error('资料名称已变化，请刷新后重试');if(Number(row.revision??row.sync_revision)!==input.revision)throw Error('资料已更新，请刷新后重试');const store=getMediaStore(),missing=await store.missing(keys);const present=keys.filter(k=>!missing.includes(k)),quarantine=await store.quarantine(present,randomUUID());
 try{atomicWrite(db,()=>{const fresh=deletionPlan(db,input.kind,input.id,input.project);if(fresh.stamp!==plan.stamp)throw Error('资料已更新，删除已取消');
 if(input.kind==='cross'){db.prepare('INSERT INTO cross_purge_guard VALUES(?)').run(input.id);for(const t of ['cross_copy_notes','cross_notes','cross_versions','cross_events','cross_files'])db.prepare(`DELETE FROM ${t} WHERE record_id=?`).run(input.id);db.prepare('DELETE FROM cross_purge_guard WHERE record_id=?').run(input.id);}
 else if(input.kind==='material'){for(const t of ['material_set_views','material_reviews','material_claims','material_downloads','material_files'])db.prepare(`DELETE FROM ${t} WHERE set_id=?`).run(input.id);}
 else{for(const t of ['content_review_locks','review_queue_items','reviews'])db.prepare(`DELETE FROM ${t} WHERE content_id=?`).run(input.id);db.prepare('DELETE FROM content_version_files WHERE version_id IN (SELECT id FROM content_versions WHERE content_id=?)').run(input.id);db.prepare('DELETE FROM content_versions WHERE content_id=?').run(input.id);}
 db.prepare(`DELETE FROM ${plan.table} WHERE id=?`).run(input.id);
 const key=input.kind==='content'?String(row.code):String(input.id);db.prepare('INSERT INTO deleted_business_records(project_id,kind,record_key,actor_id) VALUES(?,?,?,?)').run(input.project,input.kind,key,input.actor);if(input.kind==='cross'&&row.create_key)db.prepare('INSERT INTO deleted_business_records(project_id,kind,record_key,actor_id) VALUES(?,?,?,?)').run(input.project,'cross_request',String(row.create_key),input.actor);
 if(input.kind==='cross')db.prepare('DELETE FROM cross_note_reads WHERE project_id=? AND record_id=?').run(input.project,input.id);
 db.prepare('DELETE FROM project_update_reads WHERE project_id=? AND kind=? AND record_id=?').run(input.project,input.kind==='content'?'video':input.kind,input.id);
 db.prepare('INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?)').run(input.actor,'business.permanent_delete',input.kind,key,JSON.stringify({projectId:input.project,title:row.title,fileCount:keys.length,missingFileCount:missing.length}));input.onDeleted?.();});}catch(e){await store.restoreQuarantine(quarantine);throw e;}
 let cleanupPending=false;try{await store.deleteQuarantine(quarantine);}catch{cleanupPending=true;db.prepare('INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?)').run(input.actor,'business.permanent_delete_cleanup_pending',input.kind,String(input.id),JSON.stringify({projectId:input.project,quarantineKeys:quarantine.map(f=>f.quarantineKey)}));}return {ok:true,cleanupPending};
}
