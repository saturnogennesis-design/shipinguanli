import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {atomicWrite} from './publishing-write';
import {crossRow,validateParent,validatePackage,recordVisible,crossEvent,type CrossRecord} from './cross-workflow';
import {reportFileType,matchesReportSignature,reportAttachmentName} from './report-attachments';
export const OFFLINE_CHUNK=1024*1024;
export type OfflineFile={name:string;size:number;mime:string;sha256:string};
export type OfflineDraft={title:string;kind:'clue'|'mother'|'package'|'video'|'image_text';parentId?:number|null;mainId?:number|null;packageType?:string;productCategoryId?:number|null;productMasterId?:number|null;data:Record<string,string>;files:OfflineFile[]};
export type OfflineTask={user_id:number;task_id:string;project_id:number;payload_json:string;result_json:string|null};
export const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function offlineTask(db:DatabaseSync,user:number,id:string,project:number){const row=db.prepare('SELECT * FROM offline_uploads WHERE user_id=? AND task_id=? AND project_id=?').get(user,id,project) as OfflineTask|undefined;if(!row)throw Error('上传任务不存在');return row;}
export function validateOfflineDraft(db:DatabaseSync,user:number,project:number,body:OfflineDraft){
 if(!body||!['clue','mother','package','video','image_text'].includes(body.kind)||typeof body.title!=='string'||!body.title.trim()||body.title.length>160)throw Error('请填写有效资料名称');
 if(!body.data||typeof body.data!=='object'||Array.isArray(body.data)||Object.values(body.data).some(v=>typeof v!=='string')||JSON.stringify(body.data).length>100000)throw Error('资料内容无效');
 const cross=db.prepare('SELECT project_type FROM short_video_accounts WHERE id=?').get(project)?.project_type==='cross_border';
 if(cross!==['clue','mother','package'].includes(body.kind))throw Error('资料类型与项目不匹配');
 let media='image';
 if(cross){const parent=validateParent(db,project,body.kind as 'clue'|'mother'|'package',body.parentId??null);if(parent&&!recordVisible(db,parent,{id:user}))throw Error('无权访问来源资料');
 if(body.kind==='package'){const type=db.prepare("SELECT media_type FROM cross_business_types WHERE project_id=? AND code=? AND status='active'").get(project,body.packageType??'main');if(!type)throw Error('业务分类已停用');media=String(type.media_type);const main=body.mainId?crossRow(db,body.mainId,project):null;if(main&&!recordVisible(db,main,{id:user}))throw Error('无权访问所属产品');validatePackage(db,{project_id:project,kind:'package',parent_id:body.parentId??null,main_id:body.mainId??null,package_type:body.packageType??'main'} as CrossRecord);}
 if(body.productCategoryId&&!db.prepare("SELECT 1 FROM cross_product_categories WHERE id=? AND project_id=? AND status='active'").get(body.productCategoryId,project))throw Error('产品分类已停用');
 }else{media=body.kind==='video'?'video':'image';if(!db.prepare("SELECT 1 FROM product_masters WHERE id=? AND project_id=? AND status='active'").get(body.productMasterId??null,project))throw Error('请选择本项目有效商品');}
 const files=body.files;if(!Array.isArray(files)||files.length>(media==='video'?1:cross&&media==='image'?50:20)||(!cross&&!files.length))throw Error('附件数量无效');
 for(const f of files){if(!f||typeof f.name!=='string'||!f.name||f.name.length>180||!Number.isSafeInteger(f.size)||f.size<1||f.size>(cross?(media==='video'?512:20)*1024*1024:5*1024**3)||!/^([a-f0-9]{64})$/.test(f.sha256))throw Error('附件信息或校验值无效');
 if(media==='image'&&!['image/jpeg','image/png','image/webp',...(!cross?['image/gif']:[])].includes(f.mime)||media==='video'&&!['video/mp4','video/webm'].includes(f.mime)||media==='document'&&reportFileType(f.name,'RPT-DAILY')?.mimeType!==f.mime)throw Error('文件格式与资料类型不符');}
 return media;
}
export function beginOffline(db:DatabaseSync,user:number,project:number,id:string,payload:OfflineDraft){
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('上传任务标识无效');
 const old=db.prepare('SELECT * FROM offline_uploads WHERE user_id=? AND task_id=?').get(user,id) as OfflineTask|undefined;
 if(old){if(old.project_id!==project||old.payload_json!==JSON.stringify(payload))throw Error('任务标识已使用且内容不一致');return old;}
 validateOfflineDraft(db,user,project,payload);
 const pending=db.prepare('SELECT payload_json FROM offline_uploads WHERE user_id=? AND result_json IS NULL').all(user);const size=pending.reduce((n,r)=>n+(JSON.parse(String(r.payload_json)) as OfflineDraft).files.reduce((sum,f)=>sum+f.size,0),0);
 if(pending.length>=100||size+payload.files.reduce((sum,f)=>sum+f.size,0)>20*1024**3)throw Error('未完成上传过多，请先完成或取消旧任务');
 db.prepare('INSERT INTO offline_uploads(user_id,task_id,project_id,payload_json) VALUES(?,?,?,?)').run(user,id,project,JSON.stringify(payload));return offlineTask(db,user,id,project);
}
// All linking and idempotency receipts commit together, after bytes have been verified.
export function commitOfflineDraft(db:DatabaseSync,task:OfflineTask,keys:string[],uploadGroup:number|null){return atomicWrite(db,()=>{
 const current=offlineTask(db,task.user_id,task.task_id,task.project_id);if(current.result_json)return JSON.parse(current.result_json);
 const body=JSON.parse(current.payload_json) as OfflineDraft;validateOfflineDraft(db,task.user_id,task.project_id,body);const user=task.user_id,project=task.project_id,now=new Date().toISOString();let result:{kind:string;id:number;code?:string;status:string};
 if(['clue','mother','package'].includes(body.kind)){
 const parent=body.parentId?crossRow(db,body.parentId,project):null;
 const row=db.prepare("INSERT INTO cross_records(project_id,kind,parent_id,main_id,package_type,product_category_id,title,body_json,creator_id,maker_id,source_locked) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *").get(project,body.kind,body.parentId??null,body.mainId??null,body.packageType??'main',body.kind==='package'?parent?.product_category_id??null:body.productCategoryId??null,body.title.trim(),JSON.stringify(body.data),user,user,body.parentId?1:0) as CrossRecord;
 body.files.forEach((f,i)=>db.prepare('INSERT INTO cross_files(record_id,storage_path,file_name,mime_type,file_size,uploader_id,position) VALUES(?,?,?,?,?,?,?)').run(row.id,keys[i],reportAttachmentName(f.name),f.mime,f.size,user,i));crossEvent(db,row,user,'create',{offlineTask:task.task_id});result={kind:'cross',id:row.id,status:'draft'};
 }else{
 if(!uploadGroup||!db.prepare("SELECT 1 FROM content_groups WHERE id=? AND account_id=? AND status='active'").get(uploadGroup,project))throw Error('项目上传配置已变更');
 const code='CNT-OFF-'+randomUUID(),video=body.kind==='video';const id=Number(db.prepare("INSERT INTO contents(code,title,content_type,product_master_id,account_id,uploader_user_id,group_id,visibility,review_status,remark,business_activity_at) VALUES(?,?,?,?,?,?,?,'private','draft',?,?) RETURNING id").get(code,body.title.trim(),body.kind,body.productMasterId!,project,user,uploadGroup,body.data.remark??'',now)!.id);
 const version=Number(db.prepare("INSERT INTO content_versions(content_id,version_number,file_name,storage_path,mime_type,file_size,uploaded_by_user_id,upload_status,review_status,business_activity_at,checksum_sha256) VALUES(?,1,?,?,?,?,?,'complete','draft',?,?) RETURNING id").get(id,video?body.files[0].name:body.files.length+'张图片',video?keys[0]:'offline/'+task.task_id,video?body.files[0].mime:'application/x-image-set',body.files.reduce((n,f)=>n+f.size,0),user,now,video?body.files[0].sha256:null)!.id);
 if(!video)body.files.forEach((f,i)=>db.prepare("INSERT INTO content_version_files(version_id,position,file_name,storage_path,mime_type,file_size,upload_status) VALUES(?,?,?,?,?,?,'complete')").run(version,i+1,reportAttachmentName(f.name),keys[i],f.mime,f.size));
 db.prepare("INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,'content.offline_create','content',?,?)").run(user,code,JSON.stringify({projectId:project,offlineTask:task.task_id}));result={kind:'video',id,code,status:'draft'};
 }
 db.prepare('UPDATE offline_uploads SET result_json=? WHERE user_id=? AND task_id=?').run(JSON.stringify(result),user,task.task_id);return result;
 });}
export function verifyOfflineSignature(file:OfflineFile,head:Uint8Array){
 const ext=file.name.split('.').pop()?.toLowerCase()??'';
 if(file.mime.startsWith('image/')){const type=file.mime.split('/')[1];if(!matchesReportSignature(type==='jpeg'?'jpg':type,head))throw Error('图片文件内容与格式不符');}
 else if(file.mime.startsWith('video/')){if(file.mime==='video/mp4'&&new TextDecoder().decode(head.slice(4,8))!=='ftyp'||file.mime==='video/webm'&&!(head[0]===0x1a&&head[1]===0x45&&head[2]===0xdf&&head[3]===0xa3))throw Error('视频文件内容与格式不符');}
 else if(!matchesReportSignature(ext,head))throw Error('文档文件内容与格式不符');
}
