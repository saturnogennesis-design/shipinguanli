import type {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {hasPermission,type AuthUser} from './server-auth';
import {maySeeProject} from './project-visibility';
import {contentScopeSql,contentMutationScopeSql} from './content-scope';
import {crossAccess} from './cross-auth';
import {crossRow,recordVisible,changeCross,crossLifecycle,type CrossRecord} from './cross-workflow';
import {assignCross,prioritizeCross,ownsCrossWork} from './cross-assignment';
import {atomicWrite} from './publishing-write';
import {deletionPlan,type BusinessKind} from './permanent-delete';
export type BatchAction='assign'|'urgency'|'submit'|'withdraw'|'archive'|'unarchive'|'delete'|'restore'|'purge'|'download';
export const batchActions:BatchAction[]=['assign','urgency','submit','withdraw','archive','unarchive','delete','restore','purge','download'];
export type BatchOptions={assigneeId?:number|null;urgency?:number;reason?:string;resubmissionNote?:string;confirmRecommendationCancellation?:boolean};
export function batchRecord(db:DatabaseSync,user:AuthUser,kind:BusinessKind,key:string|number){
 const project=user.projectId;if(!project||!maySeeProject(db,user,project))throw Error('没有项目访问权限');
 const projectType=db.prepare('SELECT project_type FROM short_video_accounts WHERE id=?').get(project)?.project_type;
 if((kind==='cross')!==(projectType==='cross_border'))throw Error('资料类型与项目不匹配');
 if(kind==='cross'){
  if(!hasPermission(user,'cross.view'))throw Error('没有资料查看权限');
  const row=crossRow(db,Number(key),project);if(!row||!recordVisible(db,row,user))throw Error('资料不存在或无权访问');return row as CrossRecord&Record<string,unknown>;
 }
 if(kind==='content'){
  if(!['content.view','version.view','review.view','publishing.view'].some(p=>hasPermission(user,p)))throw Error('没有内容查看权限');
  const row=db.prepare(`SELECT c.* FROM contents c WHERE c.account_id=? AND (c.code=? OR c.id=?) AND ${contentScopeSql(user)}`).get(project,String(key),typeof key==='number'?key:0);if(!row)throw Error('资料不存在或无权访问');return row;
 }
 if(!hasPermission(user,'asset.view'))throw Error('没有素材查看权限');
 const row=db.prepare('SELECT * FROM material_sets WHERE account_id=? AND id=?').get(project,Number(key));if(!row)throw Error('资料不存在或无权访问');return row;
}
export function rowRevision(row:Record<string,unknown>){return Number(row.revision??row.sync_revision);}
function permission(user:AuthUser,key:string){if(!hasPermission(user,key))throw Error('没有此操作权限');}
function audit(db:DatabaseSync,user:AuthUser,kind:BusinessKind,row:Record<string,unknown>,action:string,options:BatchOptions){db.prepare('INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?)').run(user.id,kind==='content'?'content.batch_'+action:'material_set.'+action,kind==='content'?'content':'material_set',String(kind==='content'?row.code:row.id),JSON.stringify({projectId:user.projectId,previousStatus:row.review_status??row.status,reason:options.reason??''}));}
export function changeBatchRecord(db:DatabaseSync,user:AuthUser,kind:BusinessKind,key:string|number,action:BatchAction,options:BatchOptions,revision:number){
 const row=batchRecord(db,user,kind,key),id=Number(row.id),project=user.projectId!;
 if(rowRevision(row)!==revision)throw Error('资料已更新，请重新检查后操作');
 if(action==='purge'){if(user.roleCode!=='super_admin')throw Error('只有超级管理员可彻底删除');deletionPlan(db,kind,id,project);return row;}
 if(kind==='cross'){
  const r=row as CrossRecord,access=crossAccess(user,db),input={id,project,actor:user.id,revision};
  if(r.lifecycle==='deleted'&&!access.canDelete)throw Error('没有回收站访问权限');
  if(action==='assign')return assignCross(db,{...input,assignee:options.assigneeId,canAssign:access.canAssign});
  if(action==='urgency')return prioritizeCross(db,{...input,urgency:options.urgency});
  if(['archive','unarchive','delete','restore'].includes(action))return crossLifecycle(db,{...input,action,canArchive:access.canArchive,canDelete:access.canDelete});
  if(action==='download'){if(!access.canDownload||r.kind!=='package'||r.lifecycle!=='active'||r.status!=='approved')throw Error('仅有下载权限的已通过产品包可下载');return row;}
  if(!['submit','withdraw'].includes(action))throw Error('不支持的操作');
  if(!access.canAssign&&!ownsCrossWork(r,user.id))throw Error('没有修改该资料的权限');
  return changeCross(db,{...input,action,canReview:false,canEdit:access.canEdit||access.canCreate&&r.version_number===0});
 }
 if(['assign','urgency'].includes(action))throw Error('当前资料不支持此操作');
 const now=new Date().toISOString(),deleted=Boolean(row.deleted_at),archived=Boolean(row.archived_at)||row.status==='archived';
 if(kind==='content'){
  if(action!=='download'&&!db.prepare(`SELECT 1 FROM contents c WHERE id=? AND ${contentMutationScopeSql(user)}`).get(id))throw Error('没有操作该资料的权限');
  if(action==='download'){permission(user,'content.download');if(deleted||archived||row.review_status!=='approved')throw Error('仅正常使用的已通过内容可下载');return row;}
  permission(user,({submit:'content.submit',withdraw:'content.withdraw',archive:'content.archive',unarchive:'content.archive',delete:'content.delete',restore:'content.delete'} as Record<string,string>)[action]??'__unsupported');
  if(action==='restore'){if(!deleted)throw Error('资料不在回收站');db.prepare('UPDATE contents SET deleted_at=NULL,review_status=coalesce(trash_previous_status,\'draft\'),trash_previous_status=NULL,updated_at=? WHERE id=?').run(now,id);db.prepare('UPDATE platform_contents SET deleted_at=NULL,updated_at=? WHERE source_content_id=?').run(now,id);}
  else{
   if(deleted)throw Error('请先从回收站恢复资料');
   if(archived&&action!=='unarchive'&&action!=='delete')throw Error('请先取消归档');
   if(action==='submit'){
    if(row.review_status!=='draft')throw Error('只有草稿可提交；已退回内容需先编辑并上传新版本');
    const v=db.prepare("SELECT * FROM content_versions WHERE content_id=? AND version_number=? AND deleted_at IS NULL AND upload_status='complete'").get(id,Number(row.latest_version_number));if(!v)throw Error('文件尚未上传完成');
    db.prepare("UPDATE contents SET review_status='pending',review_submitted_at=?,business_activity_at=?,updated_at=? WHERE id=?").run(now,now,now,id);db.prepare("UPDATE content_versions SET review_status='pending',review_submitted_at=?,business_activity_at=?,updated_at=? WHERE id=?").run(now,now,now,Number(v.id));
   }else if(action==='withdraw'){
    if(row.review_status!=='pending')throw Error('仅待审核内容可撤回');if(db.prepare('SELECT 1 FROM content_review_locks WHERE content_id=? AND datetime(expires_at)>CURRENT_TIMESTAMP').get(id))throw Error('内容正在审核，不能撤回');
    db.prepare("UPDATE contents SET review_status='draft',review_submitted_at=NULL,business_activity_at=?,updated_at=? WHERE id=?").run(now,now,id);db.prepare("UPDATE content_versions SET review_status='draft',review_submitted_at=NULL,business_activity_at=?,updated_at=? WHERE content_id=? AND version_number=?").run(now,now,id,Number(row.latest_version_number));db.prepare('DELETE FROM review_queue_items WHERE content_id=?').run(id);
   }else if(['archive','unarchive','delete'].includes(action)){
    if(action==='archive'&&(archived||row.review_status==='draft'))throw Error('草稿或已归档内容不能归档');if(action==='unarchive'&&!archived)throw Error('内容未归档');
    if(action==='archive'&&!options.reason?.trim())throw Error('请填写归档原因');
    if(action==='delete'){
     if(['pending','reviewing'].includes(String(row.review_status)))throw Error('请先撤回审核再删除');if(row.review_status==='approved'&&user.roleCode!=='super_admin')throw Error('已通过内容仅超级管理员可删除');
     if(db.prepare("SELECT 1 FROM platform_contents WHERE source_content_id=? AND publish_status='published' AND deleted_at IS NULL").get(id))throw Error('请先处理已发布的关联资料');
    }
    const recommended=db.prepare('SELECT 1 FROM reviews WHERE content_id=? AND recommended=1 AND recommendation_removed_at IS NULL').get(id);
    if(recommended&&action!=='unarchive'&&!options.confirmRecommendationCancellation)throw Error('包含推荐版本，请勾选确认同时取消推荐');
    if(action!=='unarchive')db.prepare('UPDATE reviews SET recommendation_removed_at=?,recommendation_removed_by_user_id=?,updated_at=? WHERE content_id=? AND recommended=1 AND recommendation_removed_at IS NULL').run(now,user.id,now,id);
    if(action==='delete'){db.prepare("UPDATE contents SET deleted_at=?,trash_previous_status=review_status,featured=0,featured_reason='',featured_tags_json='[]',featured_by_user_id=NULL,featured_at=NULL,updated_at=? WHERE id=?").run(now,now,id);db.prepare('UPDATE platform_contents SET deleted_at=?,updated_at=? WHERE source_content_id=?').run(now,now,id);}
    else if(action==='archive')db.prepare("UPDATE contents SET archived_at=?,archive_reason=?,archived_by_user_id=?,featured=0,featured_reason='',featured_tags_json='[]',featured_by_user_id=NULL,featured_at=NULL,business_activity_at=?,updated_at=? WHERE id=?").run(now,options.reason!.trim(),user.id,now,now,id);
    else {const reset=['pending','reviewing'].includes(String(row.review_status));db.prepare('UPDATE contents SET archived_at=NULL,review_status=?,review_submitted_at=?,business_activity_at=?,updated_at=? WHERE id=?').run(reset?'draft':String(row.review_status),reset?null:row.review_submitted_at as string|null,now,now,id);if(reset)db.prepare("UPDATE content_versions SET review_status='draft',review_submitted_at=NULL,business_activity_at=?,updated_at=? WHERE content_id=? AND version_number=?").run(now,now,id,Number(row.latest_version_number));}
    db.prepare('DELETE FROM content_review_locks WHERE content_id=?').run(id);db.prepare('UPDATE review_queue_items SET removed_at=?,updated_at=? WHERE content_id=? AND removed_at IS NULL').run(now,now,id);
   }else throw Error('不支持的操作');
  }
 }else{
  if(action==='download'){permission(user,'asset.claim');if(deleted||row.status!=='admitted')throw Error('仅已入库素材可下载');return row;}
  permission(user,['submit','withdraw'].includes(action)?'asset.upload':['archive','unarchive'].includes(action)?'asset.archive':'asset.delete');
  if(['submit','withdraw'].includes(action)&&Number(row.uploader_user_id)!==user.id)throw Error('仅上传人可提交或撤回素材');
  if(action==='restore'){if(!deleted)throw Error('资料不在回收站');db.prepare('UPDATE material_sets SET deleted_at=NULL,deleted_by_user_id=NULL,updated_at=? WHERE id=?').run(now,id);}
  else{
   if(deleted)throw Error('请先恢复素材');
   if(action==='submit'){
    if(!['draft','rejected'].includes(String(row.status)))throw Error('仅草稿或已退回素材可提交');if(!String(row.description).trim()||!String(row.category).trim())throw Error('请补充素材说明和分类');
    if(!db.prepare("SELECT 1 FROM material_files WHERE set_id=? AND draft_edit_token IS NULL AND upload_status='complete'").get(id)||db.prepare("SELECT 1 FROM material_files WHERE set_id=? AND draft_edit_token IS NULL AND upload_status<>'complete'").get(id))throw Error('文件缺失或未上传完成');
    if(row.status==='rejected'&&!options.resubmissionNote?.trim())throw Error('请填写重新提交的修改说明');
    db.prepare("UPDATE material_sets SET status='pending',resubmission_note=?,submitted_at=?,reviewed_at=NULL,reviewer_user_id=NULL,updated_at=? WHERE id=?").run(options.resubmissionNote?.trim()??'',now,now,id);
    db.prepare("INSERT INTO material_reviews(set_id,reviewer_user_id,decision,comment,resubmission_note) VALUES(?,?,'submitted','',?)").run(id,user.id,options.resubmissionNote?.trim()??'');
   }else if(action==='withdraw'){
    if(row.status!=='pending')throw Error('仅待审核素材可撤回');db.prepare("UPDATE material_sets SET status='draft',submitted_at=NULL,updated_at=? WHERE id=?").run(now,id);db.prepare("INSERT INTO material_reviews(set_id,reviewer_user_id,decision,comment) VALUES(?,?,'withdrawn','撤回审核')").run(id,user.id);
   }else if(action==='archive'){
    if(row.status!=='admitted')throw Error('仅已入库素材可归档');db.prepare("UPDATE material_sets SET status='archived',archived_at=?,archived_by_user_id=?,updated_at=? WHERE id=?").run(now,user.id,now,id);
   }else if(action==='unarchive'){
    if(!archived)throw Error('素材未归档');db.prepare("UPDATE material_sets SET status='admitted',archived_at=NULL,updated_at=? WHERE id=?").run(now,id);
   }else if(action==='delete'){
    if(row.status==='pending')throw Error('请先撤回审核再删除');db.prepare('UPDATE material_sets SET deleted_at=?,deleted_by_user_id=?,updated_at=? WHERE id=?').run(now,user.id,now,id);
   }else throw Error('不支持的操作');
  }
 }
 audit(db,user,kind,row,action,options);return row;
}
export function batchSignature(action:BatchAction,options:BatchOptions){return createHash('sha256').update(JSON.stringify([action,options.assigneeId??null,options.urgency??null,options.reason??'',options.resubmissionNote??'',Boolean(options.confirmRecommendationCancellation)])).digest('hex');}
export function batchReceipt(db:DatabaseSync,user:AuthUser,key:string,kind:BusinessKind,id:number,signature:string){const row=db.prepare('SELECT * FROM business_batch_receipts WHERE user_id=? AND project_id=? AND request_key=? AND kind=? AND record_id=?').get(user.id,user.projectId!,key,kind,id);if(!row)return null;if(row.signature!==signature)throw Error('重复请求参数不一致');return JSON.parse(String(row.result_json));}
export function saveBatchReceipt(db:DatabaseSync,user:AuthUser,key:string,kind:BusinessKind,id:number,signature:string,result:unknown){db.prepare('INSERT INTO business_batch_receipts(user_id,project_id,request_key,kind,record_id,signature,result_json) VALUES(?,?,?,?,?,?,?)').run(user.id,user.projectId!,key,kind,id,signature,JSON.stringify(result));}
export function runBatchItem(db:DatabaseSync,user:AuthUser,kind:BusinessKind,key:string|number,action:BatchAction,options:BatchOptions,revision:number,dryRun=false,requestKey=''){
 return atomicWrite(db,()=>{const row=batchRecord(db,user,kind,key),signature=batchSignature(action,options),id=Number(row.id);if(!dryRun&&requestKey){const prior=batchReceipt(db,user,requestKey,kind,id,signature);if(prior)return prior;}
 const before={id,title:String(row.title),revision:rowRevision(row),key};changeBatchRecord(db,user,kind,key,action,options,revision);if(!dryRun&&requestKey)saveBatchReceipt(db,user,requestKey,kind,id,signature,before);return before;},{rollback:dryRun});
}
