import { and, eq } from "drizzle-orm";
import { getDb, getLocalDatabase } from "@/db";
import { workReportAttachments, workReports } from "@/db/schema";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { getMediaStore } from "@/lib/media-store";
import { reportAccess, reportLists } from "@/lib/report-service";
import { canEditReportAttachments } from "@/lib/report-attachments";
import { atomicWrite, PublishingConflict } from "@/lib/publishing-write";
import { writeAudit } from "@/lib/audit";
import { convertLegacyOffice, OfficeConversionError } from "@/lib/office-convert";
type Context={params:Promise<{id:string;attachmentId:string}>};
export async function GET(request:Request,context:Context){
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const params=await context.params,id=Number(params.id),attachmentId=Number(params.attachmentId);
  if(!reportAccess(auth.user))return Response.json({error:"没有工作报备权限"},{status:403});
  const lists=await reportLists(auth.user);if(![...lists.reports,...lists.cc].some(row=>row.id===id))return Response.json({error:"无权查看该报备"},{status:403});
  const [row]=await getDb().select().from(workReportAttachments).where(and(eq(workReportAttachments.id,attachmentId),eq(workReportAttachments.reportId,id)));
  if(!row)return Response.json({error:"附件不存在"},{status:404});
  const store=getMediaStore(),query=new URL(request.url).searchParams,preview=query.get("preview")==="1",extension=row.fileName.toLowerCase().split(".").pop();
  let object=await store.get(row.storagePath);if(!object)return Response.json({error:"附件文件不存在"},{status:404});
  if(preview&&(extension==="doc"||extension==="xls")) {
    try {
      const cacheKey=`work-reports/${id}/previews/${row.id}.pdf`,cached=await store.get(cacheKey);
      if(cached){await object.body.cancel();object=cached;}
      else {
        const bytes=await convertLegacyOffice(object.body,extension);
        await store.put(cacheKey,new Blob([new Uint8Array(bytes)]).stream(),{httpMetadata:{contentType:"application/pdf"}});
        object=(await store.get(cacheKey))!;
      }
    }catch(error){if(error instanceof OfficeConversionError)return Response.json({error:error.message},{status:error.status});throw error;}
  }
  const download=query.get("download")==="1",headers=new Headers({"cache-control":"private, no-store","x-content-type-options":"nosniff","x-frame-options":"SAMEORIGIN"});
  object.writeHttpMetadata(headers);
  const fileName=preview&&(extension==="doc"||extension==="xls")?row.fileName+".pdf":row.fileName;
  headers.set("content-type",preview&&(extension==="doc"||extension==="xls")?"application/pdf":row.mimeType);
  headers.set("content-disposition",`${download?"attachment":"inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return new Response(object.body,{headers});
}
export async function DELETE(request:Request,context:Context){
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const params=await context.params,id=Number(params.id),attachmentId=Number(params.attachmentId),db=getDb();
  const user={id:auth.user.id,canReceive:hasPermission(auth.user,"report.receive"),canCreate:hasPermission(auth.user,"report.create")};
  const [report]=await db.select().from(workReports).where(eq(workReports.id,id));
  if(!report||!canEditReportAttachments(report,user))return Response.json({error:"当前状态或权限不允许删除附件"},{status:403});
  let path:string;
  try {
    path=atomicWrite(getLocalDatabase(),()=>{
      const local=getLocalDatabase(),current=local.prepare("SELECT submitter_user_id AS submitterUserId,recipient_user_id AS recipientUserId,status,template_code AS templateCode FROM work_reports WHERE id=?").get(id) as typeof report|undefined;
      if(!current||!canEditReportAttachments(current,user))throw new PublishingConflict("报备状态已变化，请刷新后重试");
      const attachment=local.prepare("DELETE FROM work_report_attachments WHERE id=? AND report_id=? RETURNING storage_path").get(attachmentId,id);
      if(!attachment)throw new PublishingConflict("附件已删除，请刷新后重试");
      return String(attachment.storage_path);
    });
  }catch(error){if(error instanceof PublishingConflict)return Response.json({error:error.message},{status:409});throw error;}
  const cleanup=await Promise.allSettled([getMediaStore().delete(path),getMediaStore().delete(`work-reports/${id}/previews/${attachmentId}.pdf`)]);
  if(cleanup.some(result=>result.status==="rejected")) {
    await writeAudit(request,{userId:user.id,action:"report.attachment_cleanup",objectType:"work_report",objectId:String(id),result:"failure",details:{attachmentId,path}});
    return Response.json({ok:true,warning:"附件已移除，文件清理失败，请管理员检查操作日志"});
  }
  return Response.json({ok:true});
}
