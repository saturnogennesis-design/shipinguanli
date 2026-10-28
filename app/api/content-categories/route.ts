import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission} from '@/lib/server-auth';
import {writeAudit} from '@/lib/audit';
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 return Response.json({items:getLocalDatabase().prepare('SELECT * FROM content_categories WHERE project_id=? ORDER BY sort_order,id').all(auth.user.projectId!),canManage:hasPermission(auth.user,'business.accounts')});
}
export async function POST(request:Request){return save(request);}
export async function PATCH(request:Request){return save(request);}
async function save(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;if(!hasPermission(auth.user,'business.accounts'))return Response.json({error:'没有分类维护权限'},{status:403});
 const body=await request.json().catch(()=>null),name=String(body?.name??'').trim().slice(0,80),db=getLocalDatabase();if(!name)return Response.json({error:'请填写分类名称'},{status:400});
 let id=Number(body.id);
 try{if(request.method==='PATCH'){
 if(!db.prepare('SELECT id FROM content_categories WHERE id=? AND project_id=?').get(id,auth.user.projectId!))return Response.json({error:'分类不属于当前项目'},{status:403});
 db.prepare('UPDATE content_categories SET name=?,status=?,sort_order=? WHERE id=?').run(name,body.status==='inactive'?'inactive':'active',Number(body.sortOrder)||0,id);
 }else id=Number(db.prepare('INSERT INTO content_categories(project_id,name,sort_order) VALUES(?,?,?) RETURNING id').get(auth.user.projectId!,name,Number(body.sortOrder)||0)!.id);
 }catch{return Response.json({error:'该项目已有同名分类'},{status:409});}
 await writeAudit(request,{userId:auth.user.id,action:'content_category.save',objectType:'content_category',objectId:String(id),details:{projectId:auth.user.projectId,name}});return Response.json({ok:true,id});
}
