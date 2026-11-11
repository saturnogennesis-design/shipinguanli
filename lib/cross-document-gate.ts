import type {DatabaseSync} from 'node:sqlite';
import type {CrossRecord} from './cross-workflow';
import {taskWorkspaceEnabled} from './cross-task-scope';
export function approvedDocument(db:DatabaseSync,row:CrossRecord){return Boolean(db.prepare("SELECT 1 FROM cross_records r JOIN cross_business_types t ON t.project_id=r.project_id AND t.code=r.package_type WHERE r.project_id=? AND r.main_id=? AND r.lifecycle='active' AND r.status='approved' AND t.media_type='document' LIMIT 1").get(row.project_id,row.id));}
// Visibility remains independently enforced by the caller.
export function documentDownloadBlocker(db:DatabaseSync,row:CrossRecord):string|null {
 if(!taskWorkspaceEnabled(db,row.project_id)||row.kind!=='package')return null;
 if(row.package_type==='main')return approvedDocument(db,row)?null:'文档子包审核通过后才可下载或发布产品包';
 const document=db.prepare("SELECT 1 FROM cross_business_types WHERE project_id=? AND code=? AND media_type='document'").get(row.project_id,row.package_type);
 return document&&(row.status!=='approved'||row.lifecycle!=='active')?'文档子包尚未审核通过，不可下载':null;
}
export function childDeliveryState(db:DatabaseSync,row:CrossRecord){
 if(approvedDocument(db,row))return 'publish';
 const tasks=db.prepare("SELECT t.status,r.status AS resultStatus FROM cross_tasks t LEFT JOIN cross_records r ON r.id=t.result_id JOIN cross_business_types b ON b.project_id=t.project_id AND b.code=t.package_type WHERE t.project_id=? AND t.source_id=? AND t.stage='child' AND t.status NOT IN ('cancelled','superseded','blocked') AND b.media_type='document'").all(row.project_id,row.id);
 if(tasks.some(t=>t.resultStatus==='rejected'))return 'children_rejected';
 if(tasks.some(t=>t.status==='pending'||t.resultStatus==='pending'))return 'children_review';
 if(tasks.length)return 'children_making';
 // Existing video-only assignments are still making, but never satisfy the document gate.
 return db.prepare("SELECT 1 FROM cross_tasks WHERE project_id=? AND source_id=? AND stage='child' AND status NOT IN ('cancelled','superseded','blocked') LIMIT 1").get(row.project_id,row.id)?'children_making':'children_unassigned';
}
