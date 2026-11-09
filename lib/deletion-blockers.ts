import type {DatabaseSync} from 'node:sqlite';
import type {AuthUser} from './server-auth';
import {hasPermission} from './server-auth';
import {maySeeProject} from './project-visibility';
import {crossRow,recordVisible,type CrossRecord} from './cross-workflow';
import {crossAccess} from './cross-auth';
import {contentScopeSql} from './content-scope';
import {deletionPlan,deletionFileKeys,sharedFileReferences,type BusinessKind} from './permanent-delete';
export type DeleteBlockItem={id:number;kind:BusinessKind;title:string;type:string;state:string;reason:string;historical:boolean;canOpen:boolean};
export type DeleteBlockInfo={blocked:boolean;reason:string;items:DeleteBlockItem[];restricted:boolean;more:number};
export function deletionBlockInfo(db:DatabaseSync,user:AuthUser,kind:BusinessKind,id:number):DeleteBlockInfo{
 const info:DeleteBlockInfo={blocked:false,reason:'',items:[],restricted:false,more:0};const project=user.projectId;
 if(!project||!maySeeProject(db,user,project))return info;
 const source=kind==='cross'?crossRow(db,id,project):db.prepare('SELECT * FROM '+(kind==='content'?'contents':'material_sets')+' WHERE id=? AND account_id=?').get(id,project);
 if(!source||kind==='cross'&&(!hasPermission(user,'cross.view')||!recordVisible(db,source as CrossRecord,user)))return info;
 if(kind==='content'&&(!['content.view','version.view','review.view','publishing.view'].some(k=>hasPermission(user,k))||!db.prepare(`SELECT 1 FROM contents c WHERE c.id=? AND c.account_id=? AND ${contentScopeSql(user)}`).get(id,project)))return info;
 if(kind==='material'&&!hasPermission(user,'asset.view'))return info;
 try{deletionPlan(db,kind,id,project);return info;}catch(error){info.blocked=true;const message=(error as Error).message;info.reason=/^(资料|请|仍|其他资料|附件)/.test(message)?message:'关联信息暂时无法校验，请联系管理员检查历史资料。';}
 const refs=new Map<string,{kind:string;id:number;reasons:Set<string>;historical:boolean}>();
 const add=(type:string,owner:number,reason:string,historical=false)=>{if(type===kind&&owner===id)return;const key=type+':'+owner,ref=refs.get(key)??{kind:type,id:owner,reasons:new Set<string>(),historical:false};ref.reasons.add(reason);ref.historical||=historical;refs.set(key,ref);};
 if(kind==='cross'){
  const rows=db.prepare('SELECT * FROM cross_records WHERE id<>? AND (parent_id=? OR main_id=? OR copied_from_id=?)').all(id,id,id,id);
  for(const row of rows){if(Number(row.parent_id)===id||Number(row.main_id)===id)add('cross',Number(row.id),'关联下级资料');if(Number(row.copied_from_id)===id)add('cross',Number(row.id),'复制来源',true);}
  for(const row of db.prepare('SELECT record_id FROM cross_copy_notes WHERE source_record_id=? AND record_id<>?').all(id,id))add('cross',Number(row.record_id),'来源备注副本',true);
  for(const row of db.prepare('SELECT record_id,version_number,snapshot_json FROM cross_versions WHERE record_id<>?').all(id)){try{const s=JSON.parse(String(row.snapshot_json));if([s.parentId,s.mainId].map(Number).includes(id))add('cross',Number(row.record_id),'历史版本 V'+row.version_number+' 引用',true);}catch{/* Malformed history remains protected by the authoritative deletion check. */}}
 }
 for(const key of deletionFileKeys(db,kind,id))for(const ref of sharedFileReferences(db,key))add(ref.kind,Number(ref.owner),'共用附件',true);
 let visible=0;
 for(const ref of refs.values()){
  let row:Record<string,unknown>|undefined,type='',state='';
  if(ref.kind==='cross'){
   const r=crossRow(db,ref.id,project),access=crossAccess(user,db);if(r&&access.canView&&recordVisible(db,r,user)&&(r.lifecycle!=='deleted'||access.canDelete)){row=r as CrossRecord&Record<string,unknown>;type=({clue:'线索',mother:'母版',package:'产品包'})[r.kind];state=r.lifecycle==='deleted'?'回收站':r.lifecycle==='archived'?'已归档':({draft:'草稿',pending:'待审核',approved:r.kind==='clue'?'已提交':'已通过',rejected:'已退回'} as Record<string,string>)[r.status]??'正常';}
  }else if(ref.kind==='content'&&['content.view','version.view','review.view','publishing.view'].some(k=>hasPermission(user,k))){row=db.prepare(`SELECT c.* FROM contents c WHERE c.id=? AND c.account_id=? AND ${contentScopeSql(user)}`).get(ref.id,project);if(row?.deleted_at&&!hasPermission(user,'content.delete'))row=undefined;type='短视频内容';}
  else if(ref.kind==='material'&&hasPermission(user,'asset.view')){row=db.prepare('SELECT * FROM material_sets WHERE id=? AND account_id=?').get(ref.id,project);const claimOnly=hasPermission(user,'asset.claim')&&!['asset.upload','asset.review','asset.archive','asset.delete','business.product_masters'].some(k=>hasPermission(user,k))&&user.roleCode!=='super_admin';if(row&&(row.deleted_at&&!hasPermission(user,'asset.delete')||claimOnly&&row.status!=='admitted'))row=undefined;type='素材套';}
  if(!row){info.restricted=true;continue;}
  state||=row.deleted_at?'回收站':row.archived_at||row.status==='archived'?'已归档':({draft:'草稿',pending:'待审核',reviewing:'审核中',approved:'已通过',admitted:'已入库',rejected:'已退回'} as Record<string,string>)[String(row.review_status??row.status)]??'正常';
  visible++;if(info.items.length<100)info.items.push({id:ref.id,kind:ref.kind as BusinessKind,title:String(row.title),type,state,reason:[...ref.reasons].join('；'),historical:ref.historical,canOpen:ref.kind==='cross'});
 }
 info.more=Math.max(0,visible-info.items.length);return info;
}
