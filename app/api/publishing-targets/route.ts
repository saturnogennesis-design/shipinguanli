import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission} from '@/lib/server-auth';
import {visibleProjectIds} from '@/lib/project-access';
import {writeAudit} from '@/lib/audit';
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const db=getLocalDatabase(),ids=visibleProjectIds(db,auth.user),canManage=hasPermission(auth.user,'business.accounts');
 const rows=db.prepare('SELECT t.*,p.name AS projectName FROM publishing_targets t JOIN short_video_accounts p ON p.id=t.project_id ORDER BY t.project_id,t.sort_order,t.id').all();
 return Response.json({items:canManage?rows:rows.filter(row=>ids.includes(Number(row.project_id))),canManage});
}
export async function POST(request:Request){return save(request);}
export async function PATCH(request:Request){return save(request);}
async function save(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;if(!hasPermission(auth.user,'business.accounts'))return Response.json({error:'没有发布目标配置权限'},{status:403});
 const body=await request.json().catch(()=>null),projectId=Number(body?.projectId),name=String(body?.name??'').trim().slice(0,100),db=getLocalDatabase();
 if(!name||!db.prepare("SELECT id FROM short_video_accounts WHERE id=? AND status='active'").get(projectId))return Response.json({error:'请选择有效项目并填写目标账号名称'},{status:400});
 let id=Number(body.id);
 try{if(request.method==='PATCH'){
  const row=db.prepare('SELECT * FROM publishing_targets WHERE id=?').get(id);if(!row)return Response.json({error:'目标账号不存在'},{status:404});
  if(row.project_id!==projectId)return Response.json({error:'目标账号不能改属其他项目，请在该项目新建账号'},{status:409});
  db.prepare('UPDATE publishing_targets SET name=?,status=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name,body.status==='inactive'?'inactive':'active',Number(body.sortOrder)||0,id);
 }else id=Number(db.prepare('INSERT INTO publishing_targets(project_id,name,sort_order) VALUES(?,?,?) RETURNING id').get(projectId,name,Number(body.sortOrder)||0)!.id);
 }catch{return Response.json({error:'本项目已存在同名目标账号'},{status:409});}
 await writeAudit(request,{userId:auth.user.id,action:'publishing_target.'+(request.method==='POST'?'create':'update'),objectType:'publishing_target',objectId:String(id),details:{projectId,name,status:body.status??'active'}});
 return Response.json({ok:true,id},{status:request.method==='POST'?201:200});
}
