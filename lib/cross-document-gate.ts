import type {DatabaseSync} from 'node:sqlite';
import type {CrossRecord} from './cross-workflow';
import {taskWorkspaceEnabled} from './cross-task-scope';
// Preview is permitted by file visibility. This gate controls delivery, never grants visibility.
export function documentDownloadBlocker(db:DatabaseSync,row:CrossRecord):string|null {
 if(!taskWorkspaceEnabled(db,row.project_id)||row.kind!=='package')return null;
 const document=db.prepare("SELECT 1 FROM cross_business_types WHERE project_id=? AND code=? AND media_type='document'").get(row.project_id,row.package_type);
 if(document&&(row.status!=='approved'||row.lifecycle!=='active'))return '文档子包尚未审核通过，不可下载';
 if(row.package_type!=='main')return null;
 if(db.prepare("SELECT 1 FROM cross_records r JOIN cross_business_types t ON t.project_id=r.project_id AND t.code=r.package_type WHERE r.project_id=? AND r.main_id=? AND r.lifecycle='active' AND t.media_type='document' AND r.status<>'approved' LIMIT 1").get(row.project_id,row.id))return '文档子包尚未审核通过，整个产品包不可下载或发布';
 if(db.prepare("SELECT 1 FROM cross_tasks task JOIN cross_business_types t ON t.project_id=task.project_id AND t.code=task.package_type WHERE task.project_id=? AND task.source_id=? AND task.stage='child' AND task.result_id IS NULL AND task.status<>'cancelled' AND t.media_type='document' LIMIT 1").get(row.project_id,row.id))return '还有待上传的文档子包任务，整个产品包不可下载或发布';
 return null;
}
