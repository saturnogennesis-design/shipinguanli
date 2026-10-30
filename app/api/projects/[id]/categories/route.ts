import {maySeeProject} from '@/lib/project-visibility';
import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission} from '@/lib/server-auth';
import {writeAudit} from '@/lib/audit';
type Context={params:Promise<{id:string}>};
async function handle(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,'business.accounts'))return Response.json({error:'没有项目配置权限'},{status:403});
 const projectId=Number((await context.params).id),db=getLocalDatabase();
 if(!Number.isSafeInteger(projectId)||!db.prepare('SELECT id FROM short_video_accounts WHERE id=?').get(projectId))return Response.json({error:'项目不存在'},{status:404});
 if(!maySeeProject(db,auth.user,projectId))return Response.json({error:'没有项目访问权限'},{status:403});
 if(request.method==='GET')return Response.json({items:db.prepare('SELECT * FROM content_categories WHERE project_id=? ORDER BY sort_order,id').all(projectId)});
 const body=await request.json().catch(()=>null),name=String(body?.name??'').trim().slice(0,80);if(!name)return Response.json({error:'请填写业务分类名称'},{status:400});
 let id=Number(body.id);
 try{if(request.method==='PATCH'){
  if(!db.prepare('SELECT id FROM content_categories WHERE id=? AND project_id=?').get(id,projectId))return Response.json({error:'分类不属于所维护的项目'},{status:403});
  db.prepare('UPDATE content_categories SET name=?,status=?,sort_order=? WHERE id=?').run(name,body.status==='inactive'?'inactive':'active',Number(body.sortOrder)||0,id);
 }else id=Number(db.prepare('INSERT INTO content_categories(project_id,name,sort_order) VALUES(?,?,?) RETURNING id').get(projectId,name,Number(body.sortOrder)||0)!.id);
 }catch{return Response.json({error:'该项目已有同名分类'},{status:409});}
 await writeAudit(request,{userId:auth.user.id,action:'content_category.save',objectType:'content_category',objectId:String(id),details:{projectId,name}});
 return Response.json({ok:true,id},{status:request.method==='POST'?201:200});
}
export const GET=handle;export const POST=handle;export const PATCH=handle;
