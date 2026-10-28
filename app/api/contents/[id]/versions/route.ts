import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { contentVersionFiles, contentVersions, contents,reviews, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hasGroupScope,hasPermission, requireUser } from "@/lib/server-auth";
import {getMediaStore} from "@/lib/media-store";

type RouteContext = { params: Promise<{ id: string }> };

function safeFileName(value: string) {
  // eslint-disable-next-line no-control-regex -- uploaded file names must strip ASCII control characters
  return value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "file";
}
function fileKind(fileName:string,mimeType=""){if(mimeType.startsWith("video/")||/\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(fileName))return "video";if(mimeType.startsWith("image/")||/\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(fileName))return "image";return "unknown";}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const code = (await context.params).id;
  const [content] = await getDb().select().from(contents).where(and(eq(contents.code, code), isNull(contents.deletedAt))).limit(1);
  if (!content) return Response.json({ error: "内容不存在" }, { status: 404 });
  const scoped=content.uploaderUserId===auth.user.id||companyContentAccess(auth.user)||(hasPermission(auth.user,"review.process")&&Boolean(content.groupId)&&hasGroupScope(auth.user,"review",content.groupId!)&&["pending","reviewing"].includes(content.reviewStatus));
  if(!scoped)return Response.json({error:"当前账号无权查看此内容；推荐案例仅在工作台中查看"},{status:403});
  const canViewHistory=scoped&&(hasPermission(auth.user,"version.view")||hasPermission(auth.user,"review.process"));
  const visibleVersionCondition=canViewHistory?undefined:eq(contentVersions.versionNumber,content.latestVersionNumber);
  const versions = await getDb().select({ id: contentVersions.id, versionNumber: contentVersions.versionNumber, fileName: contentVersions.fileName, fileSize: contentVersions.fileSize, mimeType: contentVersions.mimeType, uploadStatus: contentVersions.uploadStatus,reviewStatus:contentVersions.reviewStatus,reviewSubmittedAt:contentVersions.reviewSubmittedAt,supersededAt:contentVersions.supersededAt,sourcePurgedAt:contentVersions.sourcePurgedAt, uploaderName: users.displayName, createdAt: contentVersions.createdAt }).from(contentVersions)
    .innerJoin(users, eq(contentVersions.uploadedByUserId, users.id))
    .where(and(eq(contentVersions.contentId, content.id),visibleVersionCondition, isNull(contentVersions.deletedAt)))
    .orderBy(desc(contentVersions.versionNumber));
  const versionIds=new Set(versions.map((version)=>version.id));const files=(await getDb().select({id:contentVersionFiles.id,versionId:contentVersionFiles.versionId,position:contentVersionFiles.position,fileName:contentVersionFiles.fileName,fileSize:contentVersionFiles.fileSize,mimeType:contentVersionFiles.mimeType,uploadStatus:contentVersionFiles.uploadStatus,draftEditToken:contentVersionFiles.draftEditToken}).from(contentVersionFiles).where(isNull(contentVersionFiles.draftEditToken)).orderBy(contentVersionFiles.position)).filter((file)=>versionIds.has(file.versionId));
  const recommendationRows=versionIds.size?await getDb().select({id:reviews.id,versionId:reviews.versionId,decision:reviews.decision,comment:reviews.comment,recommendedAt:reviews.createdAt,recommenderName:users.displayName}).from(reviews).innerJoin(users,eq(reviews.reviewerUserId,users.id)).where(and(eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).orderBy(desc(reviews.createdAt),desc(reviews.id)):[];const recommendationByVersion=new Map<number,(typeof recommendationRows)[number]>();for(const recommendation of recommendationRows)if(versionIds.has(recommendation.versionId)&&!recommendationByVersion.has(recommendation.versionId))recommendationByVersion.set(recommendation.versionId,recommendation);
  return Response.json({ canEditCover:content.uploaderUserId===auth.user.id&&(hasPermission(auth.user,"content.upload")||hasPermission(auth.user,"version.upload")), content: { code: content.code, title: content.title, latestVersionNumber: content.latestVersionNumber },historyRestricted:!canViewHistory, versions: versions.map((version)=>({ ...version, current: version.versionNumber === content.latestVersionNumber,recommendation:recommendationByVersion.get(version.id)??null, fileUrl: version.uploadStatus === "complete"&&version.mimeType!=="application/x-image-set" ? `/api/content-versions/${version.id}/file` : null,files:files.filter((file)=>file.versionId===version.id).map((file)=>({...file,fileUrl:file.uploadStatus==="complete"?`/api/content-version-files/${file.id}/file`:null})) })) });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user,"version.upload")) return Response.json({error:"没有上传新版本的权限"},{status:403});
  const code = (await context.params).id;
  const [content] = await getDb().select().from(contents).where(and(eq(contents.code, code), isNull(contents.deletedAt))).limit(1);
  if (!content) return Response.json({ error: "内容不存在" }, { status: 404 });
  if (content.uploaderUserId !== auth.user.id) return Response.json({ error: "只有原上传人可以上传此内容的新版本" }, { status: 403 });
  if (content.archivedAt) return Response.json({error:"请先恢复归档内容"},{status:409});
  if (content.reviewStatus !== "rejected") return Response.json({ error: "只有已驳回内容可以上传新版本" }, { status: 409 });
  const payload = await request.json() as { fileName?: string; mimeType?: string; fileSize?: number; durationSeconds?:number|null;files?:Array<{fileName?:string;mimeType?:string;fileSize?:number}> };
  const files=payload.files?.length?payload.files:[{fileName:payload.fileName,mimeType:payload.mimeType,fileSize:payload.fileSize}];
  if(content.contentType==="video"&&(files.length!==1||!files[0].fileName||fileKind(files[0].fileName,files[0].mimeType)!=="video"))return Response.json({error:"视频新版本只能上传一个视频文件"},{status:400});
  if(content.contentType==="image_text"&&(files.length<1||files.length>20||files.some((file)=>!file.fileName||fileKind(file.fileName,file.mimeType)!=="image")))return Response.json({error:"图文新版本必须重新上传1至20张完整图片，不能混入视频"},{status:400});
  if(files.some((file)=>!Number.isSafeInteger(file.fileSize)||(file.fileSize??0)<1||(file.fileSize??0)>5*1024*1024*1024))return Response.json({ error: "文件信息无效或单个文件超过5GB" }, { status: 400 });
  const versionNumber = content.latestVersionNumber + 1;
  const totalSize=files.reduce((sum,file)=>sum+(file.fileSize??0),0);const videoFile=files[0];
  const [existingNext]=await getDb().select({id:contentVersions.id,uploadStatus:contentVersions.uploadStatus}).from(contentVersions).where(and(eq(contentVersions.contentId,content.id),eq(contentVersions.versionNumber,versionNumber),isNull(contentVersions.deletedAt))).limit(1);
  if(existingNext)return Response.json({error:existingNext.uploadStatus==="complete"?"当前驳回稿已经生成下一版本":"已有尚未完成的新版本上传，请退出上传后重试"},{status:409});
  const now=new Date().toISOString();
  const [version] = await getDb().insert(contentVersions).values({ contentId: content.id, versionNumber, fileName: content.contentType==="image_text"?`${files.length}张图片`:videoFile.fileName!, storagePath: content.contentType==="image_text"?`contents/${content.code}/v${versionNumber}`:`contents/${content.code}/v${versionNumber}/${safeFileName(videoFile.fileName!)}`, mimeType: content.contentType==="image_text"?"application/x-image-set":videoFile.mimeType || "application/octet-stream", fileSize:totalSize, durationSeconds:content.contentType==="video"&&Number.isFinite(payload.durationSeconds)?Math.max(0,Math.round(payload.durationSeconds!)):null, uploadStatus: "pending",reviewStatus:"draft",businessActivityAt:now, uploadedByUserId: auth.user.id }).returning();
  const uploads:Array<{fileId?:number;uploadUrl:string}>=[];
  if(content.contentType==="video")uploads.push({uploadUrl:`/api/content-versions/${version.id}/file`});else for(let index=0;index<files.length;index++){const file=files[index];const [created]=await getDb().insert(contentVersionFiles).values({versionId:version.id,position:index+1,fileName:file.fileName!,storagePath:`contents/${content.code}/v${versionNumber}/${String(index+1).padStart(3,"0")}-${safeFileName(file.fileName!)}`,mimeType:file.mimeType||"application/octet-stream",fileSize:file.fileSize!,uploadStatus:"pending"}).returning();uploads.push({fileId:created.id,uploadUrl:`/api/content-version-files/${created.id}/file`});}
  await writeAudit(request, { userId: auth.user.id, action: "content.version_prepare", objectType: "content_version", objectId: String(version.id), details: { contentCode: code, versionNumber,fileCount:files.length } });
  return Response.json({ versionId: version.id, versionNumber, uploadUrl:uploads[0]?.uploadUrl,uploads }, { status: 201 });
}

export async function DELETE(request:Request,context:RouteContext){const auth=await requireUser(request);if(!auth.user)return auth.response;const code=(await context.params).id;const body=await request.json().catch(()=>({})) as {versionId?:number};const db=getDb();const [record]=await db.select({contentId:contents.id,owner:contents.uploaderUserId,latest:contents.latestVersionNumber,versionId:contentVersions.id,versionNumber:contentVersions.versionNumber,uploadStatus:contentVersions.uploadStatus,storagePath:contentVersions.storagePath,mimeType:contentVersions.mimeType}).from(contents).innerJoin(contentVersions,eq(contentVersions.contentId,contents.id)).where(and(eq(contents.code,code),eq(contentVersions.id,Number(body.versionId)||0))).limit(1);if(!record)return Response.json({error:"临时版本不存在"},{status:404});if(record.owner!==auth.user.id)return Response.json({error:"只有原上传人可以取消此版本"},{status:403});if(record.versionNumber<=record.latest||record.uploadStatus==="complete")return Response.json({error:"已生效版本不能按临时上传取消"},{status:409});const files=await db.select().from(contentVersionFiles).where(eq(contentVersionFiles.versionId,record.versionId));for(const file of files)await getMediaStore().delete(file.storagePath).catch(()=>undefined);if(record.mimeType!=="application/x-image-set")await getMediaStore().delete(record.storagePath).catch(()=>undefined);await db.delete(contentVersionFiles).where(eq(contentVersionFiles.versionId,record.versionId));await db.delete(contentVersions).where(eq(contentVersions.id,record.versionId));await writeAudit(request,{userId:auth.user.id,action:"content.version_upload_cancel",objectType:"content_version",objectId:String(record.versionId),details:{contentCode:code,versionNumber:record.versionNumber}});return Response.json({ok:true});}
import {companyContentAccess} from "@/lib/content-access";
