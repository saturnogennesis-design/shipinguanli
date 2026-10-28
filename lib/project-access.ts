import type { DatabaseSync } from "node:sqlite";
import type { AuthUser } from "./server-auth";
export function visibleProjectIds(db:DatabaseSync,user:AuthUser):number[]{
 if(user.roleCode==='super_admin')return db.prepare("SELECT id FROM short_video_accounts WHERE status='active'").all().map(row=>Number(row.id));
 return db.prepare(`SELECT DISTINCT p.id FROM short_video_accounts p WHERE p.status='active' AND (
 EXISTS(SELECT 1 FROM user_account_responsibilities r WHERE r.account_id=p.id AND r.user_id=?) OR
 EXISTS(SELECT 1 FROM content_groups g WHERE g.account_id=p.id AND g.status='active' AND (
 g.id=? OR EXISTS(SELECT 1 FROM group_memberships m WHERE m.group_id=g.id AND m.user_id=?) OR
 EXISTS(SELECT 1 FROM user_group_scopes s WHERE s.group_id=g.id AND s.user_id=?) OR
 EXISTS(SELECT 1 FROM user_group_responsibilities r WHERE r.group_id=g.id AND r.user_id=?))))`)
 .all(user.id,user.primaryGroupId,user.id,user.id,user.id).map(row=>Number(row.id));
}
const roots=new Set(['contents','content-versions','content-version-files','material-sets','material-files','materials','product-masters','reviews','review-sessions','versions','publishing','analytics','dashboard','groups','business-data','content-categories','filters']);
export function isProjectPath(path:string){return roots.has(path.split('/')[2]??'');}
export async function bindProjectRequest(db:DatabaseSync,request:Request,user:AuthUser):Promise<Response|null>{
 const url=new URL(request.url);if(!isProjectPath(url.pathname))return null;
 const id=Number(request.headers.get('x-orbit-project-id')??url.searchParams.get('projectId'));
 if(url.pathname==='/api/filters'&&!id)return null;
 if(!Number.isSafeInteger(id)||id<=0)return Response.json({error:'请先进入一个项目'},{status:409});
 if(!visibleProjectIds(db,user).includes(id))return Response.json({error:'没有访问该项目的权限'},{status:403});
 user.projectId=id;
 const groups=db.prepare("SELECT id FROM content_groups WHERE account_id=? AND status='active'").all(id).map(row=>Number(row.id));
 user.groupScopes=Object.fromEntries(Object.entries(user.groupScopes).map(([key,values])=>[key,values.filter(value=>groups.includes(value))]));
 if(!groups.includes(user.primaryGroupId??0))user.primaryGroupId=null;
 const segments=url.pathname.split('/').slice(2),root=segments[0],object=segments[1];
 let owner:number|undefined;
 const row=(sql:string,value:string|number)=>db.prepare(sql).get(value) as {project_id:number}|undefined;
 if(object){
  if(root==='contents'&&!['batch','next-title','trash','upload-session'].includes(object))owner=row('SELECT account_id AS project_id FROM contents WHERE code=?',object)?.project_id;
  if(root==='material-sets'&&/^\d+$/.test(object))owner=row('SELECT account_id AS project_id FROM material_sets WHERE id=?',Number(object))?.project_id;
  if(root==='product-masters'&&/^\d+$/.test(object))owner=row('SELECT project_id FROM product_masters WHERE id=?',Number(object))?.project_id;
  if(root==='review-sessions'&&/^\d+$/.test(object))owner=row('SELECT project_id FROM review_sessions WHERE id=?',Number(object))?.project_id;
  if(root==='content-versions'&&/^\d+$/.test(object))owner=row('SELECT c.account_id AS project_id FROM content_versions v JOIN contents c ON c.id=v.content_id WHERE v.id=?',Number(object))?.project_id;
  if(root==='content-version-files'&&/^\d+$/.test(object))owner=row('SELECT c.account_id AS project_id FROM content_version_files f JOIN content_versions v ON v.id=f.version_id JOIN contents c ON c.id=v.content_id WHERE f.id=?',Number(object))?.project_id;
  if(root==='material-files'&&/^\d+$/.test(object))owner=row('SELECT s.account_id AS project_id FROM material_files f JOIN material_sets s ON s.id=f.set_id WHERE f.id=?',Number(object))?.project_id;
  if(root==='materials'&&/^\d+$/.test(object))owner=row('SELECT account_id AS project_id FROM material_sets WHERE legacy_material_id=?',Number(object))?.project_id;
 }
 if(root==='product-masters'&&!object&&url.searchParams.get('id'))owner=row('SELECT project_id FROM product_masters WHERE id=?',Number(url.searchParams.get('id')))?.project_id;
 if(owner!==undefined&&owner!==id)return Response.json({error:'该记录不属于当前项目'},{status:403});
 if(request.headers.get('content-type')?.includes('application/json')){
  const body=await request.clone().json().catch(()=>null);
  if(body&&typeof body==='object'){
   if(root==='product-masters'&&body.id&&row('SELECT project_id FROM product_masters WHERE id=?',Number(body.id))?.project_id!==id)return Response.json({error:'产品不属于当前项目'},{status:403});
   const items=[body,...(Array.isArray(body.items)?body.items:[])];
   for(const item of items){
    if(item.accountId!=null&&Number(item.accountId)!==id)return Response.json({error:'不能在当前项目操作其他项目的数据'},{status:403});
    for(const [field,sql] of [['productMasterId','SELECT project_id FROM product_masters WHERE id=?'],['groupId','SELECT account_id AS project_id FROM content_groups WHERE id=?'],['categoryId',"SELECT project_id FROM content_categories WHERE id=? AND status='active'"]] as const){
     if(item[field]!=null&&Number(item[field])>0&&row(sql,Number(item[field]))?.project_id!==id)return Response.json({error:'所选产品、小组或分类不属于当前项目'},{status:403});
    }
   }
   for(const versionId of Array.isArray(body.versionIds)?body.versionIds:[]){if(row('SELECT c.account_id AS project_id FROM content_versions v JOIN contents c ON c.id=v.content_id WHERE v.id=?',Number(versionId))?.project_id!==id)return Response.json({error:'版本不属于当前项目'},{status:403});}
   const codes=[...(Array.isArray(body.codes)?body.codes:[]),...(Array.isArray(body.contentCodes)?body.contentCodes:[])];
   for(const code of codes)if(typeof code==='string'&&row('SELECT account_id AS project_id FROM contents WHERE code=?',code)?.project_id!==id)return Response.json({error:'批量选择包含其他项目或无效内容'},{status:403});
  }
 }
 return null;
}
