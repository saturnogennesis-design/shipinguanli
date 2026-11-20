import type {DatabaseSync} from 'node:sqlite';
import {crossRow,recordVisible,type CrossRecord} from './cross-workflow';
import {taskWorkspaceEnabled} from './cross-task-scope';
import {publication} from './cross-publication';
import {approvedDocument} from './cross-document-gate';
export type MainProductSummary={id:number;title:string;status:string;lifecycle:string};
export type CurrentFlow={phase:'main'|'child'|'publish'|'unassigned'|'restricted';ownerName?:string;typeName?:string;state?:string};
export function crossFlowSummary(db:DatabaseSync,row:CrossRecord,user:{id:number},canDelete=false):{mainProduct?:MainProductSummary|null;mainProductRestricted?:boolean;currentFlow?:CurrentFlow[]}{
 if(!taskWorkspaceEnabled(db,row.project_id))return {};
 if(row.kind==='mother'&&row.status==='approved'){
  const products=db.prepare("SELECT * FROM cross_records WHERE project_id=? AND parent_id=? AND kind='package' AND package_type='main' ORDER BY updated_at DESC,id DESC").all(row.project_id,row.id) as CrossRecord[];
  const visible=products.find(r=>(r.lifecycle!=='deleted'||canDelete)&&recordVisible(db,r,user));
  return {mainProduct:visible?{id:visible.id,title:visible.title,status:visible.status,lifecycle:visible.lifecycle??'active'}:null,mainProductRestricted:products.length>0&&!visible};
 }
 if(row.kind!=='package'||row.package_type!=='main')return {};
 if(row.status!=='approved')return {currentFlow:[{phase:'main',ownerName:String(db.prepare('SELECT display_name FROM users WHERE id=?').get(row.maker_id)?.display_name??'未分配'),state:row.status}]};
 const flow:CurrentFlow[]=[],pub=publication(db,row),documentReady=approvedDocument(db,row);
 if(pub)flow.push({phase:'publish',ownerName:String(pub.publisherName),state:'published'});
 else if(documentReady)flow.push({phase:'publish',state:'waiting'});
 const tasks=db.prepare("SELECT t.*,b.name AS typeName,u.display_name AS ownerName FROM cross_tasks t LEFT JOIN cross_business_types b ON b.project_id=t.project_id AND b.code=t.package_type LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? AND t.source_id=? AND t.stage='child' AND t.status NOT IN ('cancelled','superseded','blocked') ORDER BY t.priority DESC,t.id").all(row.project_id,row.id);
 const bound=new Set<number>();let restricted=false;
 for(const task of tasks){
  const result=task.result_id?crossRow(db,Number(task.result_id),row.project_id):null;if(result)bound.add(result.id);
  if(result&&(result.lifecycle!=='active'||result.status==='approved'))continue;
  if(result&&!recordVisible(db,result,user)){restricted=true;continue;}
  if(!result&&!['todo','making','rejected','pending'].includes(String(task.status)))continue;
  flow.push({phase:'child',typeName:String(task.typeName??task.package_type),ownerName:task.ownerName?String(task.ownerName):'未分配',state:result?.status??String(task.status)});
 }
 // Historical uploads without a task still participate; never reveal out-of-scope children.
 for(const child of db.prepare("SELECT * FROM cross_records WHERE project_id=? AND main_id=? AND lifecycle='active' AND status<>'approved'").all(row.project_id,row.id) as CrossRecord[]){
  if(bound.has(child.id)||db.prepare("SELECT 1 FROM cross_tasks WHERE result_id=? AND status IN ('cancelled','superseded','blocked')").get(child.id))continue;
  if(!recordVisible(db,child,user)){restricted=true;continue;}
  const type=db.prepare('SELECT name FROM cross_business_types WHERE project_id=? AND code=?').get(row.project_id,child.package_type);
  flow.push({phase:'child',typeName:String(type?.name??child.package_type),ownerName:String(db.prepare('SELECT display_name FROM users WHERE id=?').get(child.maker_id)?.display_name??'未分配'),state:child.status});
 }
 if(!flow.length)flow.push({phase:restricted?'restricted':'unassigned'});
 return {currentFlow:flow.filter((v,i,all)=>all.findIndex(x=>x.phase===v.phase&&x.ownerName===v.ownerName&&x.typeName===v.typeName&&x.state===v.state)===i)};
}
