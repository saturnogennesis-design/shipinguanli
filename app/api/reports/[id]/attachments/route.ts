import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, getLocalDatabase } from "@/db";
import { workReports, workReportAttachments } from "@/db/schema";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { getMediaStore } from "@/lib/media-store";
import { reportAccess, reportLists } from "@/lib/report-service";
import { canEditReportAttachments, matchesReportSignature, reportFileType, reportAttachmentName, MAX_REPORT_ATTACHMENTS, MAX_REPORT_FILE_BYTES } from "@/lib/report-attachments";
import { atomicWrite, PublishingConflict } from "@/lib/publishing-write";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const id=Number((await context.params).id);if(!reportAccess(auth.user))return Response.json({error:"没有工作报备权限"},{status:403});
  const lists=await reportLists(auth.user);if(![...lists.reports,...lists.cc].some(row=>row.id===id))return Response.json({error:"无权查看该报备"},{status:403});
  const rows=await getDb().select().from(workReportAttachments).where(eq(workReportAttachments.reportId,id));
  return Response.json({items:rows.map(row=>({id:row.id,fileName:row.fileName,fileSize:row.fileSize,mimeType:row.mimeType,url:`/api/reports/${id}/attachments/${row.id}`}))});
}
export async function POST(request:Request,context:Context){
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const user={id:auth.user.id,canReceive:hasPermission(auth.user,"report.receive"),canCreate:hasPermission(auth.user,"report.create")};
  const db=getDb(),id=Number((await context.params).id);
  const [report]=await db.select().from(workReports).where(eq(workReports.id,id));
  if(!report||!canEditReportAttachments(report,user))return Response.json({error:"只能为自己的草稿添加附件；已提交日报不可修改"},{status:403});
  const length=Number(request.headers.get("content-length"));
  if(length>MAX_REPORT_FILE_BYTES+1024*1024)return Response.json({error:"单个文档不能超过 20MB"},{status:413});
  const form=await request.formData();const file=form.get("file");
  if(!(file instanceof File))return Response.json({error:"请选择附件"},{status:400});
  const type=reportFileType(file.name,report.templateCode);
  if(!type)return Response.json({error:report.templateCode==="RPT-DAILY"?"日报附件仅支持 Word、Excel、PDF 文档":"示例图片仅支持 JPG、PNG、WebP 或 GIF"},{status:415});
  const limit=report.templateCode==="RPT-DAILY"?MAX_REPORT_FILE_BYTES:10*1024*1024;
  if(file.size<1||file.size>limit)return Response.json({error:`单个附件不能超过 ${limit/1024/1024}MB，且不能为空`},{status:413});
  if(!matchesReportSignature(type.extension,new Uint8Array(await file.slice(0,12).arrayBuffer())))return Response.json({error:"文件内容与扩展名不符，请选择有效的文档或图片"},{status:415});
  const storagePath=`work-reports/${id}/attachments/${randomUUID()}`,store=getMediaStore(),now=new Date().toISOString();
  await store.put(storagePath,file.stream(),{httpMetadata:{contentType:type.mimeType}});
  let row;
  try {
    row=atomicWrite(getLocalDatabase(),()=>{
      const current=getLocalDatabase().prepare("SELECT submitter_user_id AS submitterUserId, recipient_user_id AS recipientUserId, status, template_code AS templateCode FROM work_reports WHERE id=?").get(id) as typeof report|undefined;
      if(!current||!canEditReportAttachments(current,user))throw new PublishingConflict("报备已提交或删除，附件未添加，请刷新后重试");
      const count=getLocalDatabase().prepare("SELECT count(*) AS total FROM work_report_attachments WHERE report_id=?").get(id)!;
      if(Number(count.total)>=MAX_REPORT_ATTACHMENTS)throw new PublishingConflict(`每份报备最多添加 ${MAX_REPORT_ATTACHMENTS} 个附件`);
      return getLocalDatabase().prepare("INSERT INTO work_report_attachments(report_id,file_name,mime_type,file_size,storage_path,uploaded_by_user_id,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id")
        .get(id,reportAttachmentName(file.name),type.mimeType,file.size,storagePath,user.id,now)!;
    });
  } catch(error) {
    await store.delete(storagePath).catch(()=>{});
    if(error instanceof PublishingConflict)return Response.json({error:error.message},{status:409});
    throw error;
  }
  return Response.json({id:Number(row.id),fileName:reportAttachmentName(file.name),fileSize:file.size,mimeType:type.mimeType,url:`/api/reports/${id}/attachments/${row.id}`},{status:201});
}
