import type {DatabaseSync} from 'node:sqlite';
import {atomicWrite} from './publishing-write';
export type CrossKind='clue'|'mother'|'package';
export type CrossRecord={id:number;project_id:number;kind:CrossKind;parent_id:number|null;title:string;body_json:string;creator_id:number;maker_id:number;status:string;revision:number;version_number:number};
export const crossNames={clue:'线索',mother:'母版',package:'产品包'};
export function crossRow(db:DatabaseSync,id:number,project:number){return db.prepare('SELECT * FROM cross_records WHERE id=? AND project_id=?').get(id,project) as CrossRecord|undefined;}
export function crossEvent(db:DatabaseSync,row:CrossRecord,actor:number,action:string,details:unknown={}){
 db.prepare('INSERT INTO cross_events(record_id,actor_id,action,version_number,details_json) VALUES(?,?,?,?,?)').run(row.id,actor,action,row.version_number,JSON.stringify(details));
 db.prepare('INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?)').run(actor,'cross.'+action,'cross_record',String(row.id),JSON.stringify({projectId:row.project_id,kind:row.kind,version:row.version_number,details}));
}
export function crossMember(db:DatabaseSync,id:number,project:number){return Boolean(db.prepare(`SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='active' AND (r.code='super_admin' OR EXISTS(SELECT 1 FROM user_account_responsibilities a WHERE a.user_id=u.id AND a.account_id=?) OR EXISTS(SELECT 1 FROM content_groups g WHERE g.account_id=? AND g.status='active' AND (g.id=u.primary_group_id OR EXISTS(SELECT 1 FROM group_memberships m WHERE m.user_id=u.id AND m.group_id=g.id) OR EXISTS(SELECT 1 FROM user_group_scopes s WHERE s.user_id=u.id AND s.group_id=g.id) OR EXISTS(SELECT 1 FROM user_group_responsibilities d WHERE d.user_id=u.id AND d.group_id=g.id))))`).get(id,project,project));}
export function validateParent(db:DatabaseSync,project:number,kind:CrossKind,parentId:number|null){
 if(kind==='clue'){if(parentId!==null)throw Error('线索不关联上级资料');return null;}
 const parent=parentId?crossRow(db,parentId,project):null;
 if(!parent||parent.kind!==(kind==='mother'?'clue':'mother'))throw Error(kind==='mother'?'请选择本项目的线索':'请选择本项目的母版');
 if(kind==='package'&&parent.status!=='approved')throw Error('只能根据已确认的母版制作产品包');return parent;
}
export function changeCross(db:DatabaseSync,input:{id:number;project:number;actor:number;revision:number;action:string;body?:Record<string,unknown>;canReview:boolean;canEdit:boolean}){
 return atomicWrite(db,()=>{
 const row=crossRow(db,input.id,input.project);if(!row)throw Error('资料不存在');if(row.revision!==input.revision)throw Error('资料已被其他人更新，请刷新后重试');
 const body=input.body??{},action=input.action;
 if(['approve','reject'].includes(action)){
  if(!input.canReview)throw Error('没有审核权限');if(row.status!=='pending')throw Error('资料已不在待审核状态');
  if(action==='reject'&&!String(body.reason??'').trim())throw Error('请填写退回原因和问题位置');
  db.prepare('UPDATE cross_records SET status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(action==='approve'?'approved':'rejected',row.id);
 }else{
  if(!input.canEdit)throw Error('只有提交人、制作人或项目管理员可以修改');
  if(action==='save'){
   if(!['draft','rejected'].includes(row.status))throw Error('当前版本已锁定，请先创建修订草稿');
   const title=String(body.title??row.title).trim().slice(0,160);if(!title)throw Error('请填写名称');
   const parentId=row.kind==='clue'?null:Number(body.parentId??row.parent_id);validateParent(db,row.project_id,row.kind,parentId);
   const makerId=Number(body.makerId??row.maker_id);if(row.kind==='clue'&&makerId!==row.creator_id)throw Error('线索提交人不能更换');if(!crossMember(db,makerId,row.project_id))throw Error('制作人未获授权进入当前项目');
   const payload=body.data===undefined?JSON.parse(row.body_json):body.data;
   if(!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>100000)throw Error('资料内容无效或过长');
   const categoryId=Number((payload as Record<string,unknown>).categoryId);if(categoryId&&!db.prepare("SELECT id FROM content_categories WHERE id=? AND project_id=? AND status='active'").get(categoryId,row.project_id)&&categoryId!==Number(JSON.parse(row.body_json).categoryId))throw Error('业务分类不属于当前项目或已停用');
   db.prepare('UPDATE cross_records SET title=?,parent_id=?,maker_id=?,body_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(title,parentId,makerId,JSON.stringify(payload),row.id);
  }else if(action==='revise'){
   if(row.status!=='approved')throw Error('仅已通过资料可以建立修订草稿');
   db.prepare("UPDATE cross_records SET status='draft',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
  }else if(action==='submit'){
   if(!['draft','rejected'].includes(row.status))throw Error('当前状态不能提交');
   const parent=validateParent(db,row.project_id,row.kind,row.parent_id),data=JSON.parse(row.body_json);
   const files=db.prepare('SELECT id,file_name,mime_type,file_size,uploader_id FROM cross_files WHERE record_id=? AND active=1 ORDER BY id').all(row.id);
   if(row.kind!=='clue'&&!files.length)throw Error('请至少上传一张图片');
   if(row.kind==='package'&&(!String(data.productTitle??'').trim()||!String(data.description??'').trim()))throw Error('请完整填写商品标题和商品描述');
   const version=row.version_number+1;
   const snapshot={title:row.title,parentId:row.parent_id,parentVersion:parent?.version_number??null,parentTitle:parent?.title??null,makerName:db.prepare('SELECT display_name FROM users WHERE id=?').get(row.maker_id)?.display_name,creatorName:db.prepare('SELECT display_name FROM users WHERE id=?').get(row.creator_id)?.display_name,data,files,makerId:row.maker_id,creatorId:row.creator_id,submitterId:input.actor,submitNote:String(body.submitNote??'').slice(0,5000)};
   db.prepare('INSERT INTO cross_versions(record_id,version_number,snapshot_json,submitter_id) VALUES(?,?,?,?)').run(row.id,version,JSON.stringify(snapshot),input.actor);
   db.prepare("UPDATE cross_records SET status=?,version_number=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.kind==='clue'?'approved':'pending',version,row.id);row.version_number=version;
  }else if(action==='withdraw'){
   if(row.status!=='pending')throw Error('仅待审核资料可以撤回');db.prepare("UPDATE cross_records SET status='draft',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
  }else throw Error('不支持的操作');
 }
 crossEvent(db,row,input.actor,action,action==='save'?{before:{title:row.title,parentId:row.parent_id,makerId:row.maker_id,data:JSON.parse(row.body_json)},after:body}:body);
 return crossRow(db,row.id,row.project_id)!;
 });
}
