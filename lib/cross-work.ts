import type {DatabaseSync} from 'node:sqlite';
import type {CrossRecord} from './cross-workflow';
import {publication} from './cross-publication';
import {responsible} from './cross-assignment';
export type WorkAccess={canCreate:boolean;canEdit:boolean;canReview:boolean;canPublish?:boolean};
export function crossWork(db:DatabaseSync,row:CrossRecord,user:number,access:WorkAccess){
 const active=(row.lifecycle??'active')==='active',owner=responsible(row),children=db.prepare("SELECT id,status FROM cross_records WHERE parent_id=? AND lifecycle='active' AND kind=? AND (kind<>'package' OR package_type='main')").all(row.id,row.kind==='clue'?'mother':'package'),produced=children.some(c=>['pending','approved'].includes(String(c.status))),pub=publication(db,row);
 const waitingChildren=row.kind==='package'&&row.package_type==='main'&&Boolean(db.prepare("SELECT 1 FROM cross_records WHERE main_id=? AND project_id=? AND lifecycle='active' AND status<>'approved'").get(row.id,row.project_id));
 const workState=!active?'inactive':['draft','rejected','pending'].includes(row.status)?row.status:row.kind==='package'?(row.package_type!=='main'?'done':pub?'published':waitingChildren?'children_pending':'publish'):produced?'done':'produce';
 const actionable=active&&((owner===user||row.creator_id===user)&&(['draft','rejected'].includes(workState)?access.canEdit||access.canCreate:workState==='produce'&&access.canCreate)||workState==='pending'&&access.canReview||workState==='publish'&&Boolean(access.canPublish));
 return {workState,workOwner:owner,actionable,produced,isPublished:Boolean(pub),publisherName:pub?.publisherName??null,publishedAt:pub?.published_at??null};
}
