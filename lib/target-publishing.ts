import type {DatabaseSync} from 'node:sqlite';
import {atomicWrite,PublishingConflict} from './publishing-write';
export function writeTargetPublishing(db:DatabaseSync,input:{projectId:number;contentCode:string;targetId:number;userId:number;expectedRevision:number;published?:boolean;details?:{productMasterId?:number|null;title?:string;body?:string;topics?:string[]}}){
 return atomicWrite(db,()=>{
  const content=db.prepare("SELECT c.*,v.id AS version_id FROM contents c JOIN content_versions v ON v.content_id=c.id AND v.version_number=c.latest_version_number WHERE c.code=? AND c.account_id=? AND c.review_status='approved' AND c.archived_at IS NULL AND c.deleted_at IS NULL AND v.deleted_at IS NULL AND v.upload_status='complete'").get(input.contentCode,input.projectId);
  if(!content)throw new PublishingConflict('内容已更新、归档或不属于当前项目');
  const target=db.prepare('SELECT * FROM publishing_targets WHERE id=? AND project_id=?').get(input.targetId,input.projectId);
  if(!target)throw new PublishingConflict('目标账号不属于当前项目');
  if(target.status!=='active'&&input.published!==false)throw new PublishingConflict('该发布目标已停用，不能新增发布或修改资料');
  const old=db.prepare('SELECT * FROM publishing_records WHERE content_id=? AND target_id=?').get(content.id as number,input.targetId);
  if(Number(old?.revision??0)!==input.expectedRevision)throw new PublishingConflict('该目标的发布记录已被其他人员更新，请刷新后重试');
  const details=input.details;
  const product=details&&'productMasterId' in details?details.productMasterId??null:old?old.product_master_id:content.product_master_id;
  if(product!=null){
   const row=db.prepare('SELECT * FROM product_masters WHERE id=? AND project_id=?').get(product as number,input.projectId);
   if(!row||(row.status!=='active'&&old?.product_master_id!==product&&content.product_master_id!==product))throw new PublishingConflict('所选产品不属于当前项目或已停用');
  }
  const published=input.published===undefined?Number(old?.published??0):Number(input.published),now=new Date().toISOString();
  const title=details?.title??String(old?.title??''),body=details?.body??String(old?.body??''),topics=details?.topics?JSON.stringify(details.topics):String(old?.topics_json??'[]');
  const publishedAt=input.published===undefined?old?.published_at??null:published?now:null;
  let id:number;
  if(old){id=Number(old.id);db.prepare('UPDATE publishing_records SET product_master_id=?,published=?,published_at=?,title=?,body=?,topics_json=?,revision=revision+1,updated_by_user_id=?,updated_at=? WHERE id=?').run(product as number|null,published,publishedAt as string|null,title,body,topics,input.userId,now,id);}
  else{id=Number(db.prepare('INSERT INTO publishing_records(content_id,target_id,version_id,product_master_id,published,published_at,title,body,topics_json,updated_by_user_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id').get(content.id as number,input.targetId,content.version_id as number,product as number|null,published,publishedAt as string|null,title,body,topics,input.userId,now)!.id);}
  const action=input.published===undefined?'details_update':published?'published':'unpublished';
  db.prepare('INSERT INTO publishing_events(record_id,content_id,target_id,operator_user_id,action,details_json) VALUES(?,?,?,?,?,?)').run(id,content.id as number,input.targetId,input.userId,action,JSON.stringify({targetName:target.name,previous:old?{published:old.published,productMasterId:old.product_master_id,title:old.title,body:old.body,topics:old.topics_json}:null,current:{published,productMasterId:product,title,body,topics}}));
  return {ok:true,revision:Number(old?.revision??0)+1,id};
 });
}
