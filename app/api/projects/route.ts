import {isProjectMaster,allowedProjectIds,maySeeProject} from '@/lib/project-visibility';
import { getLocalDatabase } from '@/db';
import { requireUser,hasPermission } from '@/lib/server-auth';
import { visibleProjectIds } from '@/lib/project-access';
import { atomicWrite } from '@/lib/publishing-write';
import { writeAudit } from '@/lib/audit';
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 const db=getLocalDatabase(),ids=visibleProjectIds(db,auth.user),canManage=isProjectMaster(db,auth.user)||hasPermission(auth.user,'business.accounts');
 const all=db.prepare("SELECT id,name,code,status,project_type AS projectType FROM short_video_accounts ORDER BY id").all();
 const memberships=db.prepare('SELECT group_id FROM group_memberships WHERE user_id=?').all(auth.user.id).map(row=>Number(row.group_id));
 const groups=db.prepare("SELECT id,name,account_id AS accountId FROM content_groups WHERE status='active'").all();
 return Response.json({currentUserId:auth.user.id,permissions:auth.user.permissions,roleCode:auth.user.roleCode,canManage,projects:all.filter(row=>ids.includes(Number(row.id))).map(row=>({...row,groups:groups.filter(g=>g.accountId===row.id),capabilities:{
 cross:['cross.view','cross.create','cross.review','cross.assign','cross.download','business.accounts'].some(key=>hasPermission(auth.user!,key)),content:hasPermission(auth.user,'content.view')&&(auth.user.roleCode==='super_admin'||groups.some(g=>g.accountId===row.id&&[auth.user!.primaryGroupId,...Object.values(auth.user!.groupScopes).flat(),...memberships].includes(Number(g.id)))),versions:hasPermission(auth.user,'version.view'),review:row.projectType==='cross_border'?(hasPermission(auth.user,'cross.review')||hasPermission(auth.user,'business.accounts')):hasPermission(auth.user,'review.process')&&(auth.user.roleCode==='super_admin'||groups.some(g=>g.accountId===row.id&&auth.user!.groupScopes.review?.includes(Number(g.id)))),
 publishing:hasPermission(auth.user,'publishing.view')&&(auth.user.roleCode==='super_admin'||Boolean(db.prepare("SELECT 1 FROM user_account_responsibilities WHERE user_id=? AND account_id=? AND responsibility_type='publisher'").get(auth.user.id,row.id))),
 assets:hasPermission(auth.user,'asset.view')&&(auth.user.roleCode==='super_admin'||memberships.some(groupId=>groups.some(g=>g.id===groupId&&g.accountId===row.id))||Boolean(db.prepare("SELECT 1 FROM user_account_responsibilities WHERE user_id=? AND account_id=? AND responsibility_type IN ('material','material_upload','material_review')").get(auth.user.id,row.id))),products:hasPermission(auth.user,'business.product_masters')||hasPermission(auth.user,'asset.upload'),analytics:hasPermission(auth.user,'analytics.view')
 }})),canManageVisibility:isProjectMaster(db,auth.user),manageableProjects:canManage?all.filter(row=>allowedProjectIds(db,auth.user!,false).includes(Number(row.id))):[]});
}
export async function POST(request:Request){return change(request);}
export async function PATCH(request:Request){return change(request);}
async function change(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;if(!isProjectMaster(getLocalDatabase(),auth.user)&&!hasPermission(auth.user,'business.accounts'))return Response.json({error:'没有项目管理权限'},{status:403});
 const body=await request.json().catch(()=>null);if(!body||typeof body.name!=='string'||!body.name.trim())return Response.json({error:'请填写项目名称'},{status:400});
 const projectType=body.projectType??'short_video';if(!['short_video','cross_border'].includes(projectType))return Response.json({error:'项目类型无效'},{status:400});
 const name=body.name.trim().slice(0,100),db=getLocalDatabase();let id=Number(body.id);
 try{atomicWrite(db,()=>{
 if(request.method==='POST'&&!isProjectMaster(db,auth.user!))throw Error('只有hjt可以新增项目并配置可见性');
 if(request.method==='PATCH'){
  if(!maySeeProject(db,auth.user!,id))throw Error('没有项目访问权限');
  const existing=db.prepare('SELECT id,project_type FROM short_video_accounts WHERE id=?').get(id);if(!existing)throw Error('项目不存在');if(body.projectType!==undefined&&body.projectType!==existing.project_type)throw Error('项目类型创建后不可直接修改，请新建项目');
  db.prepare("UPDATE short_video_accounts SET name=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name,body.status==='inactive'?'inactive':'active',id);
 }else{
  const duplicate=db.prepare("SELECT id FROM short_video_accounts WHERE name=?").get(name);if(duplicate)throw Error('项目名称已存在');
  const platform=db.prepare("SELECT id FROM platforms WHERE code='__project_internal__'").get()!;
  const created=db.prepare("INSERT INTO short_video_accounts(platform_id,code,name,project_type) VALUES(?,?,?,?) RETURNING id").get(platform.id as number,'PRJ-'+crypto.randomUUID(),name,projectType)!;id=Number(created.id);
  db.prepare("INSERT INTO content_groups(code,name,account_id) VALUES(?,?,?)").run('GRP-'+crypto.randomUUID(),projectType==='cross_border'?'项目协作组':'内容一组',id);
  if(projectType==='cross_border')for(const [code,label,media,linked] of [['main','产品主图','image',0],['video','视频','video',1],['document','文档','document',1]])db.prepare('INSERT INTO cross_business_types(project_id,code,name,media_type,requires_main) VALUES(?,?,?,?,?)').run(id,code,label,media,linked);
 }
 });}catch(error){return Response.json({error:(error as Error).message},{status:409});}
 await writeAudit(request,{userId:auth.user.id,action:request.method==='PATCH'?'project.update':'project.create',objectType:'project',objectId:String(id),details:{name}});
 return Response.json({ok:true,id},{status:request.method==='POST'?201:200});
}
