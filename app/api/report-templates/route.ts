import { and,eq,inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { reportTemplates,reportTemplateAssignments,users } from "@/db/schema";
import { requireUser,hasPermission } from "@/lib/server-auth";
async function fixed(userId:number){
 const db=getDb();await db.insert(reportTemplates).values({name:"日报",code:"RPT-DAILY",createdByUserId:userId,fieldsJson:'[{"key":"completed","type":"numbered"},{"key":"plan","type":"numbered"},{"key":"remark","type":"textarea"}]'}).onConflictDoNothing();

 return db.select().from(reportTemplates).where(inArray(reportTemplates.code,["RPT-DAILY"]));
}
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"report.template_manage"))return Response.json({error:"没有模板分配权限"},{status:403});
 const db=getDb(),templates=await fixed(auth.user.id);
 return Response.json({templates,assignments:templates.length?await db.select().from(reportTemplateAssignments).where(inArray(reportTemplateAssignments.templateId,templates.map(t=>t.id))):[],users:await db.select({id:users.id,name:users.displayName}).from(users).where(eq(users.status,"active"))});
}
export async function POST(){return Response.json({error:"系统模板不可新增、编辑或删除"},{status:405});}
export async function PATCH(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"report.template_manage"))return Response.json({error:"没有模板分配权限"},{status:403});
 const db=getDb(),templates=await fixed(auth.user.id),body=await request.json().catch(()=>({})),t=templates.find(item=>item.id===Number(body.id));
 if(body.action!=="assign"||!t)return Response.json({error:"请选择有效的固定模板"},{status:400});
 const ids:number[]=[...new Set<number>((Array.isArray(body.userIds)?body.userIds:[]).map(Number))];
 const active=ids.length?await db.select({id:users.id}).from(users).where(and(inArray(users.id,ids),eq(users.status,"active"))):[];
 if(active.length!==ids.length)return Response.json({error:"部分账号无效，请刷新"},{status:400});
 const remove=db.delete(reportTemplateAssignments).where(eq(reportTemplateAssignments.templateId,t.id));
 if(ids.length)await db.batch([remove,db.insert(reportTemplateAssignments).values(ids.map(userId=>({userId,templateId:t.id,reminderEnabled:false})))]);
 else await remove;
 return Response.json({ok:true});
}
