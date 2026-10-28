import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { contentVersions, contents, reviews } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getMediaStore } from "@/lib/media-store";
import { hasPermission, requireUser } from "@/lib/server-auth";

type RouteContext = { params: Promise<{ id: string }> };

async function findVersion(versionId: number) {
  const [record] = await getDb().select({
    id: contentVersions.id,
    contentId: contentVersions.contentId,
    fileName: contentVersions.fileName,
    storagePath: contentVersions.storagePath,
    mimeType: contentVersions.mimeType,
    fileSize: contentVersions.fileSize,
    uploadStatus: contentVersions.uploadStatus,
    versionNumber: contentVersions.versionNumber,
    uploaderUserId: contents.uploaderUserId,
    visibility: contents.visibility,
    latestVersionNumber: contents.latestVersionNumber,
    reviewStatus: contents.reviewStatus,
    archivedAt: contents.archivedAt,
  }).from(contentVersions).innerJoin(contents, eq(contentVersions.contentId, contents.id))
    .where(and(eq(contentVersions.id, versionId), isNull(contentVersions.deletedAt), isNull(contents.deletedAt))).limit(1);
  return record;
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const versionId = Number((await context.params).id);
  if (!Number.isSafeInteger(versionId)) return Response.json({ error: "文件版本无效" }, { status: 400 });
  const record = await findVersion(versionId);
  if (!record) return Response.json({ error: "文件版本不存在" }, { status: 404 });
  if(record.archivedAt)return Response.json({error:"请先恢复归档内容"},{status:409});
  const canUpload=record.versionNumber>record.latestVersionNumber?hasPermission(auth.user,"version.upload"):hasPermission(auth.user,"content.upload")||hasPermission(auth.user,"content.edit");
  if(!canUpload)return Response.json({error:"没有上传此文件的权限"},{status:403});
  if (record.uploaderUserId !== auth.user.id) return Response.json({ error: "只有原上传人可以上传此文件" }, { status: 403 });
  if (record.uploadStatus === "complete") return Response.json({ error: "该版本文件已经上传，不能覆盖" }, { status: 409 });
  if (!request.body) return Response.json({ error: "没有收到文件内容" }, { status: 400 });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 0 && contentLength !== record.fileSize) return Response.json({ error: "文件大小与登记信息不一致" }, { status: 400 });
  await getMediaStore().put(record.storagePath, request.body, { httpMetadata: { contentType: record.mimeType }, customMetadata: { fileName: encodeURIComponent(record.fileName), contentId: String(record.contentId), versionId: String(record.id) } });
  await getDb().update(contentVersions).set({ uploadStatus: "complete", updatedAt: new Date().toISOString() }).where(eq(contentVersions.id, versionId));
  if (record.versionNumber > record.latestVersionNumber && record.reviewStatus === "rejected") {
    const now=new Date().toISOString();
    await getDb().update(contentVersions).set({reviewStatus:"pending",reviewSubmittedAt:now,businessActivityAt:now,updatedAt:now}).where(eq(contentVersions.id,versionId));
    await getDb().update(contentVersions).set({supersededAt:now,updatedAt:now}).where(and(eq(contentVersions.contentId,record.contentId),eq(contentVersions.versionNumber,record.latestVersionNumber)));
    await getDb().update(contents).set({ latestVersionNumber: record.versionNumber, reviewStatus: "pending",reviewSubmittedAt:now,businessActivityAt:now, updatedAt: now }).where(eq(contents.id, record.contentId));
  }else{
    const now=new Date().toISOString();
    await getDb().update(contents).set({businessActivityAt:now,updatedAt:now}).where(eq(contents.id,record.contentId));
  }
  await writeAudit(request, { userId: auth.user.id, action: "content.file_upload", objectType: "content_version", objectId: String(versionId), details: { size: record.fileSize } });
  return Response.json({ ok: true, versionId });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const versionId = Number((await context.params).id);
  if (!Number.isSafeInteger(versionId)) return Response.json({ error: "文件版本无效" }, { status: 400 });
  const record = await findVersion(versionId);
  if (!record || record.uploadStatus !== "complete") return Response.json({ error: "文件不存在或尚未上传完成" }, { status: 404 });
  const canRead = await canReadContentVersion(auth.user,record.id);
  if (!canRead) return Response.json({ error: "无权查看此文件" }, { status: 403 });
  const canReadHistory=hasPermission(auth.user,"version.view")||hasPermission(auth.user,"review.view");
  if(record.versionNumber!==record.latestVersionNumber&&!canReadHistory){
    const [recommendation]=await getDb().select({id:reviews.id}).from(reviews).where(and(eq(reviews.versionId,record.id),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).limit(1);
    if(!recommendation)return Response.json({error:"没有查看历史版本的权限"},{status:403});
  }
  const object = await getMediaStore().get(record.storagePath, { range: request.headers });
  if (!object) return Response.json({ error: "原文件不存在或媒体存储盘未连接" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(record.fileName)}`);
  if ("range" in object && object.range) {
    const range = object.range as { offset: number; length: number };
    headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
  }
  return new Response(object.body, { status: request.headers.has("range") ? 206 : 200, headers });
}
import {canReadContentVersion} from "@/lib/content-access";
