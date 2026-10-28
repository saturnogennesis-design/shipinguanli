import { and,eq,inArray,isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { users,workReports,workReportCc,workReportRecipientReads,productMasters,workReportActivityLogs,workReportAttachments } from "@/db/schema";
import { hasPermission,requireUser } from "@/lib/server-auth";
import { reportLists,reportAccess,reportDate,reportFields,validRecipient,assigned } from "@/lib/report-service";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const u=auth.user,db=getDb();
 if(!reportAccess(u))return Response.json({error:"没有工作报备权限"},{status:403});
 const lists=await reportLists(u),q=new URL(request.url).searchParams,ccId=Number(q.get("ccId")),id=Number((await params).id);
 const row=ccId?lists.cc.find((r:any)=>r.ccId===ccId&&r.id===id):lists.reports.find((r:any)=>r.id===id);
 if(!row)return Response.json({error:"无权查看该记录"},{status:403});
 let readAt=row.readAt;
 if(q.get("markRead")!=="0"&&row.incoming&&row.status==="submitted"&&!readAt){
   readAt=new Date().toISOString();
   if(ccId)await db.update(workReportCc).set({readAt}).where(and(eq(workReportCc.id,ccId),eq(workReportCc.userId,u.id),isNull(workReportCc.readAt)));
   else await db.insert(workReportRecipientReads).values({reportId:id,userId:u.id,readAt}).onConflictDoNothing();
   const [receipt]=ccId?await db.select({readAt:workReportCc.readAt}).from(workReportCc).where(eq(workReportCc.id,ccId)):await db.select({readAt:workReportRecipientReads.readAt}).from(workReportRecipientReads).where(and(eq(workReportRecipientReads.reportId,id),eq(workReportRecipientReads.userId,u.id)));
   readAt=receipt?.readAt??readAt;
 }
 const [report]=await db.select({completed:workReports.completed,plan:workReports.plan,remark:workReports.remark,lastEditedAt:workReports.lastEditedAt,recipientUserId:workReports.recipientUserId,templateCode:workReports.templateCode,productMasterId:workReports.productMasterId,productName:productMasters.name,productStatus:productMasters.status,productImagePath:productMasters.imageStoragePath}).from(workReports).leftJoin(productMasters,eq(productMasters.id,workReports.productMasterId)).where(eq(workReports.id,id));
 const logs=await db.select({id:workReportActivityLogs.id,action:workReportActivityLogs.action,detailsJson:workReportActivityLogs.detailsJson,createdAt:workReportActivityLogs.createdAt,userName:users.displayName}).from(workReportActivityLogs).innerJoin(users,eq(users.id,workReportActivityLogs.userId)).where(eq(workReportActivityLogs.reportId,id)).orderBy(workReportActivityLogs.createdAt,workReportActivityLogs.id);
 const attachments=await db.select().from(workReportAttachments).where(eq(workReportAttachments.reportId,id));
 const productActive=report?.productStatus==="active";
 return Response.json({report:{...row,...report,productName:productActive?report?.productName:null,title:report?.templateCode==="RPT-SPOKEN-COPY"?`${productActive?report?.productName:"无商品"}的文案`:row.title,productImageUrl:productActive&&report?.productImagePath&&report.productMasterId?`/api/product-masters/${report.productMasterId}/image`:null,attachments:attachments.map((file:any)=>({...file,url:`/api/reports/${id}/attachments/${file.id}`})),logs:logs.map((log:any)=>({...log,details:JSON.parse(log.detailsJson||"{}")})),...(row.kind==="cc"?{recipientUserId:undefined}:{}),ccRemark:row.kind==="cc"?("remark" in row?row.remark:""):"",readAt}});
}
export async function POST(request:Request,{params}:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const u=auth.user,db=getDb(),id=Number((await params).id);
 const [report]=await db.select().from(workReports).where(eq(workReports.id,id));
 if(!hasPermission(u,"report.cc")||!report||report.status!=="submitted"||(report.submitterUserId!==u.id&&report.recipientUserId!==u.id))return Response.json({error:"只有原提交人和原接收人可以抄送"},{status:403});
 const body=await request.json().catch(()=>({}));
 const previous=await db.select({userId:workReportCc.userId,fromUserId:workReportCc.fromUserId,level:workReportCc.level}).from(workReportCc).where(eq(workReportCc.reportId,id));
 if(body.action==="options"){
   const list=await db.select({id:users.id,name:users.displayName,departmentId:users.departmentId}).from(users).where(eq(users.status,"active"));
   return Response.json({users:list.filter(p=>p.id!==u.id&&p.id!==report.submitterUserId&&p.id!==report.recipientUserId).map(p=>({...p,disabled:previous.some(x=>x.userId===p.id),reason:previous.some(x=>x.userId===p.id&&x.fromUserId===u.id)?"已抄送":"不可选择"}))});
 }
 const ids:number[]=[...new Set<number>((Array.isArray(body.userIds)?body.userIds:[]).map(Number))];
 if(!ids.length||ids.some(id=>!Number.isSafeInteger(id)||id===u.id||id===report.submitterUserId||id===report.recipientUserId||previous.some(p=>p.userId===id)))return Response.json({error:"请选择未抄送过的有效账号"},{status:409});
 const valid=await db.select({id:users.id}).from(users).where(and(inArray(users.id,ids),eq(users.status,"active")));
 if(valid.length!==ids.length)return Response.json({error:"部分账号已停用，请重新选择"},{status:400});
 const now=new Date().toISOString();
 try{await db.batch([db.insert(workReportCc).values(ids.map(userId=>({reportId:id,userId,fromUserId:u.id,level:1,remark:String(body.remark??"").trim(),createdAt:now}))),db.insert(workReportActivityLogs).values({reportId:id,userId:u.id,action:"cc",detailsJson:JSON.stringify({targetUserIds:ids,remark:String(body.remark??"").trim()}),createdAt:now})]);}catch{return Response.json({error:"抄送对象已发生变化，请刷新后重试"},{status:409});}
 return Response.json({ok:true});
}
export async function PATCH(request:Request,{params}:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const u=auth.user,db=getDb(),id=Number((await params).id);
 const [report]=await db.select().from(workReports).where(eq(workReports.id,id));
 if(report?.templateCode!=="RPT-DAILY")return Response.json({error:"口播文案报备已取消"},{status:410});
 const canOwnerEdit=report?.submitterUserId===u.id&&report?.status==="draft";
 const isSpoken=false;
 const canRecipientEdit=isSpoken&&report?.status==="submitted"&&report?.recipientUserId===u.id&&hasPermission(u,"report.receive");
 if(report&&report.submitterUserId===u.id&&!isSpoken&&report.status!=="draft")return Response.json({error:"已提交的日报不能编辑"},{status:409});
 if(!report||(!canOwnerEdit&&!canRecipientEdit))return Response.json({error:"当前账号没有修改权限"},{status:403});
 const body=await request.json().catch(()=>({})),fields=reportFields(body),recipient=Number(body.recipientUserId)||report.recipientUserId,submitted=body.action==="submit";
 if(canRecipientEdit&&!submitted)return Response.json({error:"接收人修改后必须直接提交"},{status:400});
 if(!isSpoken&&report.status!=="draft")return Response.json({error:"已提交的日报不能编辑"},{status:409});
 if(isSpoken&&body.productMasterId&&Number(body.productMasterId)!==report.productMasterId)return Response.json({error:"提交后不能更换商品"},{status:409});
 if(isSpoken&&!report.productMasterId)return Response.json({error:"该口播文案缺少商品，无法保存"},{status:409});
 if(isSpoken&&submitted){if(!report.productMasterId)return Response.json({error:"该文案缺少商品，不能提交"},{status:409});const [product]=await db.select({id:productMasters.id}).from(productMasters).where(and(eq(productMasters.id,report.productMasterId),eq(productMasters.status,"active")));if(!product)return Response.json({error:"原商品已停用，不能提交该文案"},{status:409});}
 if(recipient&&!(canRecipientEdit&&recipient===u.id)&&!await validRecipient(recipient,u))return Response.json({error:"请选择有效接收人"},{status:400});
 if(submitted&&(!fields.completed||(!isSpoken&&!fields.plan)||!recipient))return Response.json({error:isSpoken?"请填写口播文案并保留接收人":"请填写今日工作、明日计划，并选择接收人"},{status:400});
 const now=new Date().toISOString();
 const changed=await db.update(workReports).set({...fields,reportDate:reportDate(),recipientUserId:recipient,status:submitted?"submitted":"draft",submittedAt:submitted?(report.submittedAt??now):null,lastEditedAt:now,updatedAt:now}).where(and(eq(workReports.id,id),canRecipientEdit?eq(workReports.status,"submitted"):eq(workReports.status,"draft"))).returning({id:workReports.id});
 if(changed.length&&canRecipientEdit)await db.insert(workReportActivityLogs).values({reportId:id,userId:u.id,action:"edit_copy",detailsJson:JSON.stringify({remarkChanged:fields.remark!==report.remark}),createdAt:now});
 return changed.length?Response.json({ok:true}):Response.json({error:"日报状态已更新，请刷新"},{status:409});
}
