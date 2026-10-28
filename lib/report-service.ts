import { and, eq, or, inArray, desc, aliasedTable } from "drizzle-orm";
import { getDb } from "@/db";
import { users, workReports, workReportCc, workReportHidden, workReportCcHidden, workReportRecipientReads, reportTemplates, reportTemplateAssignments, departments, productMasters } from "@/db/schema";
import { hasPermission, type AuthUser } from "./server-auth";
export const reportDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export const reportAccess=(u:AuthUser)=>["report.create","report.receive","report.cc"].some(p=>hasPermission(u,p));
export async function assigned(u:AuthUser){
 const db=getDb();const rows=await db.select({id:reportTemplates.id,name:reportTemplates.name,code:reportTemplates.code,fieldsJson:reportTemplates.fieldsJson}).from(reportTemplates).innerJoin(reportTemplateAssignments,eq(reportTemplateAssignments.templateId,reportTemplates.id)).where(and(eq(reportTemplateAssignments.userId,u.id),eq(reportTemplates.active,true)));
 return hasPermission(u,"report.create")?rows:[];
}
export async function people(u:AuthUser){
 return getDb().select({id:users.id,name:users.displayName,username:users.username,departmentId:users.departmentId,departmentName:departments.name}).from(users).leftJoin(departments,eq(users.departmentId,departments.id)).where(eq(users.status,"active"));
}
export async function reportLists(u:AuthUser){
 const db:any=getDb(),recipient=aliasedTable(users,"recipient"),sender=aliasedTable(users,"sender");
 const reportRows=await db.select({report:workReports,submitterName:users.displayName,recipientName:recipient.displayName,productName:productMasters.name,productStatus:productMasters.status,productImagePath:productMasters.imageStoragePath,readAt:workReportRecipientReads.readAt}).from(workReports).innerJoin(users,eq(users.id,workReports.submitterUserId)).leftJoin(recipient,eq(recipient.id,workReports.recipientUserId)).leftJoin(productMasters,eq(productMasters.id,workReports.productMasterId)).leftJoin(workReportRecipientReads,and(eq(workReportRecipientReads.reportId,workReports.id),eq(workReportRecipientReads.userId,workReports.recipientUserId))).where(or(eq(workReports.submitterUserId,u.id),and(eq(workReports.recipientUserId,u.id),eq(workReports.status,"submitted")))).orderBy(desc(workReports.updatedAt));
 const hidden=await db.select().from(workReportHidden).where(eq(workReportHidden.userId,u.id));
 const reports=reportRows.map(({report,...names}:any)=>{const productActive=names.productStatus==="active";return {...report,...names,productName:productActive?names.productName:null,title:report.templateCode==="RPT-SPOKEN-COPY"?`${productActive?names.productName:"无商品"}的文案`:`${names.submitterName}的日报`,productImageUrl:productActive&&names.productImagePath&&report.productMasterId?`/api/product-masters/${report.productMasterId}/image`:null,key:"report-"+report.id,kind:"report",hidden:hidden.some((h:any)=>h.reportId===report.id),incoming:report.submitterUserId!==u.id,canCc:report.status==="submitted"&&hasPermission(u,"report.cc"),canEdit:report.templateCode==="RPT-SPOKEN-COPY"&&report.status==="submitted"&&report.recipientUserId===u.id&&hasPermission(u,"report.receive"),path:[{id:report.submitterUserId,name:names.submitterName},{id:report.recipientUserId,name:names.recipientName??"未选择"}],arrows:["提交"]};});
 const ccRows=await db.select({cc:workReportCc,report:workReports,submitterName:users.displayName,fromName:sender.displayName,toName:recipient.displayName,productName:productMasters.name,productStatus:productMasters.status}).from(workReportCc).innerJoin(workReports,eq(workReports.id,workReportCc.reportId)).innerJoin(users,eq(users.id,workReports.submitterUserId)).leftJoin(sender,eq(sender.id,workReportCc.fromUserId)).innerJoin(recipient,eq(recipient.id,workReportCc.userId)).leftJoin(productMasters,eq(productMasters.id,workReports.productMasterId)).where(or(eq(workReportCc.userId,u.id),eq(workReportCc.fromUserId,u.id))).orderBy(desc(workReportCc.createdAt),desc(workReportCc.id));
 const ccHidden=await db.select().from(workReportCcHidden).where(eq(workReportCcHidden.userId,u.id));
 const cc=ccRows.map(({cc,report,submitterName,fromName,toName,productName,productStatus,productImagePath}:any)=>({
  id:report.id,key:"cc-"+cc.id,kind:"cc",ccId:cc.id,fromUserId:cc.fromUserId,toUserId:cc.userId,submitterName,recipientName:toName,productName:productStatus==="active"?productName:null,productImageUrl:productStatus==="active"&&productImagePath&&report.productMasterId?`/api/product-masters/${report.productMasterId}/image`:null,title:report.templateCode==="RPT-SPOKEN-COPY"?`${productStatus==="active"?productName:"无商品"}的文案`:`${submitterName}的日报`,templateCode:report.templateCode,reportDate:report.reportDate,submittedAt:report.submittedAt,ccAt:cc.createdAt,remark:cc.remark,readAt:cc.readAt,incoming:cc.userId===u.id,hidden:ccHidden.some((h:any)=>h.ccId===cc.id),canCc:false,canEdit:false,status:"submitted",
   path:cc.fromUserId===report.recipientUserId?[{id:report.submitterUserId,name:submitterName},{id:cc.fromUserId,name:fromName??"历史抄送人"},{id:cc.userId,name:toName}]:[{id:cc.fromUserId,name:fromName??"历史抄送人"},{id:cc.userId,name:toName}],
   arrows:cc.fromUserId===report.recipientUserId?["提交","抄送"]:["抄送"]
 }));
 return {reports,cc};
}
export async function validRecipient(id:number,u:AuthUser){
 if(!id||id===u.id)return false;
 const [p]=await getDb().select({id:users.id}).from(users).where(and(eq(users.id,id),eq(users.status,"active")));
 return Boolean(p);
}
export function plain(value:unknown){return String(value??"").replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/(?:div|p|li)>/gi,"\n").replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function numberedField(value:unknown){
 const valueText=plain(value).trim();
 if(!valueText.replace(/^\s*\d+[.、)]\s*/gm,"").trim())return "";
 const parts=valueText.split(/(?=^\s*\d+[.、)]\s*)/gm).map(item=>item.trim()).filter(Boolean);
 if(!parts.length)return "";
 return parts.map((item,index)=>`${index+1}. ${item.replace(/^\s*\d+[.、)]\s*/,"").trim()}`).join("\n\n");
}
export function reportFields(body:any){return {completed:numberedField(body.completed),plan:numberedField(body.plan),remark:plain(body.remark).trim()};}
