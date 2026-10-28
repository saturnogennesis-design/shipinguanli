import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { contentVersionFiles, contentVersions, contents, reviews } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getMediaStore } from "@/lib/media-store";
import { hasPermission, requireUser } from "@/lib/server-auth";

type RouteContext = { params: Promise<{ id: string }> };

async function findFile(fileId:number) {
  const [record] = await getDb().select({ id:contentVersionFiles.id, versionId:contentVersionFiles.versionId, fileName:contentVersionFiles.fileName, storagePath:contentVersionFiles.storagePath, mimeType:contentVersionFiles.mimeType, fileSize:contentVersionFiles.fileSize, uploadStatus:contentVersionFiles.uploadStatus,draftEditToken:contentVersionFiles.draftEditToken, contentId:contentVersions.contentId, versionNumber:contentVersions.versionNumber, uploaderUserId:contents.uploaderUserId, visibility:contents.visibility, latestVersionNumber:contents.latestVersionNumber, archivedAt:contents.archivedAt,reviewStatus:contents.reviewStatus }).from(contentVersionFiles)
    .innerJoin(contentVersions,eq(contentVersionFiles.versionId,contentVersions.id)).innerJoin(contents,eq(contentVersions.contentId,contents.id))
    .where(and(eq(contentVersionFiles.id,fileId),isNull(contentVersions.deletedAt),isNull(contents.deletedAt))).limit(1);
  return record;
}

export async function PUT(request:Request,context:RouteContext) {
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const fileId=Number((await context.params).id);if(!Number.isSafeInteger(fileId))return Response.json({error:"文件无效"},{status:400});
  const record=await findFile(fileId);if(!record)return Response.json({error:"文件不存在"},{status:404});
  if(record.archivedAt)return Response.json({error:"请先恢复归档内容"},{status:409});const canUpload=record.versionNumber>record.latestVersionNumber?hasPermission(auth.user,"version.upload"):hasPermission(auth.user,"content.upload")||hasPermission(auth.user,"content.edit");if(!canUpload)return Response.json({error:"没有上传此文件的权限"},{status:403});
  if(record.uploaderUserId!==auth.user.id)return Response.json({error:"只有原上传人可以上传此文件"},{status:403});
  if(record.uploadStatus==="complete")return Response.json({error:"该文件已经上传，不能覆盖"},{status:409});
  if(!request.body)return Response.json({error:"没有收到文件内容"},{status:400});
  const contentLength=Number(request.headers.get("content-length")??"0");if(contentLength>0&&contentLength!==record.fileSize)return Response.json({error:"文件大小与登记信息不一致"},{status:400});
  await getMediaStore().put(record.storagePath,request.body,{httpMetadata:{contentType:record.mimeType},customMetadata:{fileName:encodeURIComponent(record.fileName),contentId:String(record.contentId),versionId:String(record.versionId),fileId:String(record.id)}});
  const db=getDb();await db.update(contentVersionFiles).set({uploadStatus:"complete",updatedAt:new Date().toISOString()}).where(eq(contentVersionFiles.id,fileId));
  if(record.draftEditToken){
    await writeAudit(request,{userId:auth.user.id,action:"content.draft_media_upload",objectType:"content_version_file",objectId:String(fileId),details:{versionId:record.versionId,size:record.fileSize}});
    return Response.json({ok:true,staged:true,versionId:record.versionId});
  }
  const pending=await db.select({id:contentVersionFiles.id}).from(contentVersionFiles).where(and(eq(contentVersionFiles.versionId,record.versionId),eq(contentVersionFiles.uploadStatus,"pending"))).limit(1);
  if(!pending.length){const now=new Date().toISOString();await db.update(contentVersions).set({uploadStatus:"complete",reviewStatus:record.versionNumber>record.latestVersionNumber?"pending":undefined,reviewSubmittedAt:record.versionNumber>record.latestVersionNumber?now:undefined,businessActivityAt:now,updatedAt:now}).where(eq(contentVersions.id,record.versionId));if(record.versionNumber>record.latestVersionNumber&&record.reviewStatus==="rejected"){await db.update(contentVersions).set({supersededAt:now,updatedAt:now}).where(and(eq(contentVersions.contentId,record.contentId),eq(contentVersions.versionNumber,record.latestVersionNumber)));await db.update(contents).set({latestVersionNumber:record.versionNumber,reviewStatus:"pending",reviewSubmittedAt:now,businessActivityAt:now,updatedAt:now}).where(eq(contents.id,record.contentId));}else await db.update(contents).set({businessActivityAt:now,updatedAt:now}).where(eq(contents.id,record.contentId));}
  await writeAudit(request,{userId:auth.user.id,action:"content.file_upload",objectType:"content_version_file",objectId:String(fileId),details:{versionId:record.versionId,size:record.fileSize}});
  const [coverFile]=!pending.length?await db.select({id:contentVersionFiles.id}).from(contentVersionFiles).where(and(eq(contentVersionFiles.versionId,record.versionId),eq(contentVersionFiles.position,1))).limit(1):[];
  return Response.json({ok:true,versionId:record.versionId,coverFileUrl:coverFile?`/api/content-version-files/${coverFile.id}/file`:null,coverEligible:!pending.length,versionComplete:!pending.length});
}

export async function GET(request:Request,context:RouteContext) {
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const fileId=Number((await context.params).id);if(!Number.isSafeInteger(fileId))return Response.json({error:"文件无效"},{status:400});
  const record=await findFile(fileId);if(!record||record.uploadStatus!=="complete")return Response.json({error:"文件不存在或尚未上传完成"},{status:404});
  if(record.draftEditToken&&record.uploaderUserId!==auth.user.id)return Response.json({error:"草稿编辑尚未保存"},{status:403});
  const canRead=await canReadContentVersion(auth.user,record.versionId);if(!canRead)return Response.json({error:"无权查看此文件"},{status:403});
  const canReadHistory=hasPermission(auth.user,"version.view")||hasPermission(auth.user,"review.view");if(record.versionNumber!==record.latestVersionNumber&&!canReadHistory){const [recommendation]=await getDb().select({id:reviews.id}).from(reviews).where(and(eq(reviews.versionId,record.versionId),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).limit(1);if(!recommendation)return Response.json({error:"没有查看历史版本的权限"},{status:403});}
  const object=await getMediaStore().get(record.storagePath,{range:request.headers});if(!object)return Response.json({error:"原文件不存在或媒体存储盘未连接"},{status:404});
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set("etag",object.httpEtag);headers.set("accept-ranges","bytes");headers.set("content-disposition",`inline; filename*=UTF-8''${encodeURIComponent(record.fileName)}`);
  return new Response(object.body,{status:request.headers.has("range")?206:200,headers});
}
import {canReadContentVersion} from "@/lib/content-access";
