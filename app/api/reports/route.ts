import { and,eq,desc } from "drizzle-orm";
import { getDb, getLocalDatabase } from "@/db";
import { workReports,workReportHidden,workReportCcHidden,productMasters,workReportActivityLogs } from "@/db/schema";
import { requireUser } from "@/lib/server-auth";
import { assigned,people,reportLists,reportDate,reportAccess,validRecipient,reportFields } from "@/lib/report-service";
import { deleteReportDraft } from "@/lib/report-delete";
import { PublishingConflict } from "@/lib/publishing-write";
import { getMediaStore } from "@/lib/media-store";
import { writeAudit } from "@/lib/audit";
import { randomToken } from "@/lib/security";
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const u=auth.user;
 if(!reportAccess(u))return Response.json({error:"没有工作报备权限"},{status:403});
 const [lists,templates,persons,products]=await Promise.all([reportLists(u),assigned(u),people(u),getDb().select({id:productMasters.id,name:productMasters.name,imageStoragePath:productMasters.imageStoragePath}).from(productMasters).where(eq(productMasters.status,"active"))]);
 const [last]=await getDb().select({recipientUserId:workReports.recipientUserId}).from(workReports).where(and(eq(workReports.submitterUserId,u.id),eq(workReports.status,"submitted"))).orderBy(desc(workReports.submittedAt)).limit(1);
 return Response.json({...lists,users:persons,templates,products:products.map(p=>({...p,imageUrl:p.imageStoragePath?`/api/product-masters/${p.id}/image`:null})),currentUserId:u.id,canCreate:templates.length>0,lastRecipientUserId:last?.recipientUserId??null});
}
export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const u=auth.user,db=getDb(),body=await request.json().catch(()=>({}));
 if(!reportAccess(u))return Response.json({error:"没有工作报备权限"},{status:403});
 if(["hide","unhide","delete"].includes(body.action)){
   const lists=await reportLists(u),row=[...lists.reports,...lists.cc].find(r=>r.key===body.key);
   if(!row)return Response.json({error:"无权操作该记录"},{status:403});
   if(body.action==="delete"){
     if(row.kind!=="report"||row.incoming||row.status!=="draft")return Response.json({error:"只能删除自己的草稿"},{status:403});
     let paths: string[];
     try { paths = deleteReportDraft(getLocalDatabase(), row.id, u.id); }
     catch (error) {
       if (error instanceof PublishingConflict) return Response.json({error:error.message},{status:409});
       throw error;
     }
     const cleanup = await Promise.allSettled(paths.map(path => getMediaStore().delete(path)));
     const failedPaths = paths.filter((_, index) => cleanup[index].status === "rejected");
     if (failedPaths.length) {
       await writeAudit(request,{userId:u.id,action:"report.attachment_cleanup",objectType:"work_report",objectId:String(row.id),result:"failure",details:{paths:failedPaths}});
       return Response.json({ok:true,warning:"草稿已删除，部分附件文件清理失败，请管理员检查操作日志"});
     }
   }else if("ccId" in row){
     if(body.action==="hide")await db.insert(workReportCcHidden).values({ccId:row.ccId,userId:u.id}).onConflictDoNothing();
     else await db.delete(workReportCcHidden).where(and(eq(workReportCcHidden.ccId,row.ccId),eq(workReportCcHidden.userId,u.id)));
   }else{
     if(body.action==="hide")await db.insert(workReportHidden).values({reportId:row.id,userId:u.id}).onConflictDoNothing();
     else await db.delete(workReportHidden).where(and(eq(workReportHidden.reportId,row.id),eq(workReportHidden.userId,u.id)));
   }
   return Response.json({ok:true});
 }
 const templates=await assigned(u),template=templates.find((t:any)=>t.code===String(body.templateCode||"RPT-DAILY"));
 if(!template)return Response.json({error:"未分配该报备模板"},{status:403});
 const spoken=template.code==="RPT-SPOKEN-COPY",fields=reportFields(body),recipient=Number(body.recipientUserId)||null,productId=Number(body.productMasterId)||null,submitted=body.action==="submit";
 if(spoken&&productId){const [p]=await db.select({id:productMasters.id}).from(productMasters).where(and(eq(productMasters.id,productId),eq(productMasters.status,"active")));if(!p)return Response.json({error:"请选择有效商品"},{status:400});}
 if(spoken&&!productId)return Response.json({error:"请选择商品"},{status:400});
 if(recipient&&!await validRecipient(recipient,u))return Response.json({error:"请选择有效的接收人"},{status:400});
 if(submitted&&(!fields.completed||(!spoken&&!fields.plan)||!recipient))return Response.json({error:spoken?"请填写口播文案、选择商品和接收人":"请填写今日工作、明日计划并选择接收人"},{status:400});
 const now=new Date().toISOString();
 const [report]=await db.insert(workReports).values({...fields,templateCode:template.code,title:spoken?`${productId?"":"无商品"}的文案`:"日报",productMasterId:spoken?productId:null,code:"RB-"+randomToken(12),reportDate:reportDate(),submitterUserId:u.id,recipientUserId:recipient,status:submitted?"submitted":"draft",submittedAt:submitted?now:null,lastEditedAt:now,updatedAt:now}).returning();
 if(spoken&&submitted)await db.insert(workReportActivityLogs).values({reportId:report.id,userId:u.id,action:"submit",detailsJson:JSON.stringify({productMasterId:productId}),createdAt:now});
 return Response.json({report},{status:201});
}
