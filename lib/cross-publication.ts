import {taskWorkspaceEnabled} from './cross-task-scope';
import {documentDownloadBlocker} from './cross-document-gate';
import type {DatabaseSync} from 'node:sqlite';
import {atomicWrite} from './publishing-write';
import {crossRow,crossEvent,recordVisible,type CrossRecord} from './cross-workflow';
export function groupSignature(db:DatabaseSync,row:CrossRecord){
 const records=taskWorkspaceEnabled(db,row.project_id)?[row,...db.prepare("SELECT r.* FROM cross_records r JOIN cross_business_types b ON b.project_id=r.project_id AND b.code=r.package_type WHERE r.main_id=? AND r.project_id=? AND r.lifecycle='active' AND r.status='approved' AND b.media_type='document' ORDER BY r.id").all(row.id,row.project_id)]:[row,...db.prepare("SELECT * FROM cross_records WHERE main_id=? AND project_id=? AND lifecycle='active' ORDER BY id").all(row.id,row.project_id)];
 return JSON.stringify(records.map(r=>[r.id,r.version_number,r.status]));
}
export function publication(db:DatabaseSync,row:CrossRecord){if(row.kind!=='package'||row.package_type!=='main')return null;return db.prepare('SELECT p.*,u.display_name AS publisherName FROM cross_publications p JOIN users u ON u.id=p.publisher_id WHERE record_id=? AND version_number=? AND active=1 AND group_signature=?').get(row.id,row.version_number,groupSignature(db,row))??null;}
export function setPublication(db:DatabaseSync,input:{id:number;project:number;actor:number;revision:number;publish:boolean;allowed:boolean;reason?:string;requestKey?:string}){return atomicWrite(db,()=>{
 const row=crossRow(db,input.id,input.project);if(!row||row.kind!=='package'||row.package_type!=='main')throw Error('只能标记整个产品包，子包不能单独发布');if(!input.allowed)throw Error('没有对应发布操作权限');if(row.lifecycle!=='active'||row.status!=='approved')throw Error('仅正常使用且审核通过的产品包可操作发布');
 if(input.publish&&!taskWorkspaceEnabled(db,row.project_id)&&db.prepare("SELECT 1 FROM cross_records WHERE main_id=? AND project_id=? AND lifecycle='active' AND status<>'approved'").get(row.id,row.project_id))throw Error('产品包仍有未通过审核的子包');
 if(input.publish){const blocked=documentDownloadBlocker(db,row);if(blocked)throw Error(blocked);const approved=db.prepare("SELECT * FROM cross_records WHERE main_id=? AND project_id=? AND lifecycle='active' AND status='approved'").all(row.id,row.project_id) as CrossRecord[];if(approved.some(child=>!recordVisible(db,child,{id:input.actor})))throw Error('部分已通过子包不在你的查看范围，请由有完整交付查看范围的发布人员处理');}const current=publication(db,row);if(input.publish&&current&&input.requestKey&&current.request_key===input.requestKey)return row;if(row.revision!==input.revision)throw Error('资料已更新，请刷新后重试');
 if(input.publish){if(current)throw Error('此产品包已发布，请勿重复标记');db.prepare('INSERT INTO cross_publications(record_id,version_number,publisher_id,request_key,group_signature) VALUES(?,?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET version_number=excluded.version_number,publisher_id=excluded.publisher_id,published_at=CURRENT_TIMESTAMP,active=1,request_key=excluded.request_key,group_signature=excluded.group_signature').run(row.id,row.version_number,input.actor,input.requestKey||null,groupSignature(db,row));}
 else {if(!current)throw Error('此产品包尚未发布');if(!input.reason?.trim()||input.reason.length>10000)throw Error('请填写10000字以内取消发布原因');db.prepare('UPDATE cross_publications SET active=0 WHERE record_id=?').run(row.id);}
 crossEvent(db,row,input.actor,input.publish?'publish':'unpublish',{reason:input.reason??'',previous:current,version:row.version_number});db.prepare('UPDATE cross_records SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);return crossRow(db,row.id,row.project_id)!;
 });}

// Stream integrity includes video changes, independently of the publication document gate.
export function deliverySignature(db:DatabaseSync,row:CrossRecord){return JSON.stringify([row,...db.prepare("SELECT * FROM cross_records WHERE main_id=? AND project_id=? AND lifecycle='active' ORDER BY id").all(row.id,row.project_id)].map(r=>[r.id,r.version_number,r.status,r.revision]));}
