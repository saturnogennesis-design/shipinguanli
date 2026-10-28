import {randomUUID} from "node:crypto";
import {and,asc,eq,isNotNull,isNull,max} from "drizzle-orm";
import {getDb} from "@/db";
import {contentVersionFiles,contentVersions,contents} from "@/db/schema";
import {writeAudit} from "@/lib/audit";
import {getMediaStore} from "@/lib/media-store";
import {hasPermission,requireUser} from "@/lib/server-auth";

type RouteContext={params:Promise<{id:string}>};
type FileInput={fileName?:string;mimeType?:string;fileSize?:number};

function safeFileName(value:string){return value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").slice(0,180)||"file";}
function kind(file:FileInput){const name=file.fileName??"",mime=file.mimeType??"";if(mime.startsWith("image/")||/\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(name))return "image";if(mime.startsWith("video/")||/\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(name))return "video";return "unknown";}

async function findDraft(code:string,userId:number){
 const [record]=await getDb().select({contentId:contents.id,code:contents.code,type:contents.contentType,owner:contents.uploaderUserId,status:contents.reviewStatus,archivedAt:contents.archivedAt,versionId:contentVersions.id,versionNumber:contentVersions.versionNumber,storagePath:contentVersions.storagePath,mimeType:contentVersions.mimeType}).from(contents).innerJoin(contentVersions,and(eq(contentVersions.contentId,contents.id),eq(contentVersions.versionNumber,contents.latestVersionNumber),isNull(contentVersions.deletedAt))).where(and(eq(contents.code,code),isNull(contents.deletedAt))).limit(1);
 if(!record)return {error:Response.json({error:"内容不存在"},{status:404})};
 if(record.owner!==userId)return {error:Response.json({error:"只有原上传人可以修改草稿文件"},{status:403})};
 if(record.status!=="draft"||record.archivedAt)return {error:Response.json({error:"只有未归档草稿可以修改文件"},{status:409})};
 return {record};
}

async function removeStage(versionId:number,token?:string){
 const db=getDb();const rows=await db.select().from(contentVersionFiles).where(and(eq(contentVersionFiles.versionId,versionId),token?eq(contentVersionFiles.draftEditToken,token):isNotNull(contentVersionFiles.draftEditToken)));
 for(const row of rows)await getMediaStore().delete(row.storagePath).catch(()=>undefined);
 if(rows.length)await db.delete(contentVersionFiles).where(and(eq(contentVersionFiles.versionId,versionId),token?eq(contentVersionFiles.draftEditToken,token):isNotNull(contentVersionFiles.draftEditToken)));
 return rows.length;
}

export async function POST(request:Request,context:RouteContext){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"content.edit"))return Response.json({error:"没有修改草稿的权限"},{status:403});
 const result=await findDraft((await context.params).id,auth.user.id);if("error" in result)return result.error;const record=result.record;
 const body=await request.json().catch(()=>({})) as {files?:FileInput[];removeFileIds?:number[]};const files=body.files??[];const removeIds=[...new Set((body.removeFileIds??[]).filter(Number.isSafeInteger))];
 if(files.length>20||files.some(file=>!file.fileName?.trim()||!Number.isSafeInteger(file.fileSize)||(file.fileSize??0)<1||(file.fileSize??0)>5*1024*1024*1024))return Response.json({error:"新增文件信息无效或单个文件超过5GB"},{status:400});
 const db=getDb();const committed=await db.select().from(contentVersionFiles).where(and(eq(contentVersionFiles.versionId,record.versionId),isNull(contentVersionFiles.draftEditToken))).orderBy(asc(contentVersionFiles.position));
 if(record.type==="image_text"){
  if(files.some(file=>kind(file)!=="image"))return Response.json({error:"图文草稿只能添加图片"},{status:400});
  if(removeIds.some(id=>!committed.some(file=>file.id===id)))return Response.json({error:"待删除图片已经变化，请刷新后重试"},{status:409});
  const finalCount=committed.length-removeIds.length+files.length;if(finalCount<1||finalCount>20)return Response.json({error:"一套图文需要保留1至20张图片"},{status:400});
 }else{
  if(files.length!==1||kind(files[0])!=="video")return Response.json({error:"视频草稿请选择一个新视频替换原文件"},{status:400});
 }
 if(!files.length&&!removeIds.length)return Response.json({error:"没有文件变更"},{status:400});
 await removeStage(record.versionId);
 const token=randomUUID();const [positionRow]=await db.select({value:max(contentVersionFiles.position)}).from(contentVersionFiles).where(eq(contentVersionFiles.versionId,record.versionId));const start=(positionRow?.value??0)+100;
 const uploads=[] as Array<{fileId:number;uploadUrl:string}>;
 for(let index=0;index<files.length;index++){
  const file=files[index];const [created]=await db.insert(contentVersionFiles).values({versionId:record.versionId,position:start+index,fileName:file.fileName!.trim(),storagePath:`contents/${record.code}/v${record.versionNumber}/draft-${token}-${String(index+1).padStart(3,"0")}-${safeFileName(file.fileName!)}`,mimeType:file.mimeType||"application/octet-stream",fileSize:file.fileSize!,uploadStatus:"pending",draftEditToken:token}).returning({id:contentVersionFiles.id});
  uploads.push({fileId:created.id,uploadUrl:`/api/content-version-files/${created.id}/file`});
 }
 await writeAudit(request,{userId:auth.user.id,action:"content.draft_media_prepare",objectType:"content",objectId:record.code,details:{token,added:files.length,removed:removeIds.length}});
 return Response.json({token,uploads},{status:201});
}

export async function PATCH(request:Request,context:RouteContext){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"content.edit"))return Response.json({error:"没有修改草稿的权限"},{status:403});
 const result=await findDraft((await context.params).id,auth.user.id);if("error" in result)return result.error;const record=result.record;
 const body=await request.json().catch(()=>({})) as {token?:string;removeFileIds?:number[];durationSeconds?:number|null};if(!body.token)return Response.json({error:"草稿编辑会话无效"},{status:400});
 const db=getDb();const staged=await db.select().from(contentVersionFiles).where(and(eq(contentVersionFiles.versionId,record.versionId),eq(contentVersionFiles.draftEditToken,body.token))).orderBy(asc(contentVersionFiles.position));
 if((record.type==="video"&&!staged.length)||staged.some(file=>file.uploadStatus!=="complete"))return Response.json({error:"新增文件尚未全部上传完成"},{status:409});
 const now=new Date().toISOString();const removeIds=[...new Set((body.removeFileIds??[]).filter(Number.isSafeInteger))];
 if(record.type==="image_text"){
  const committed=await db.select().from(contentVersionFiles).where(and(eq(contentVersionFiles.versionId,record.versionId),isNull(contentVersionFiles.draftEditToken))).orderBy(asc(contentVersionFiles.position));
  if(removeIds.some(id=>!committed.some(file=>file.id===id)))return Response.json({error:"原图片已经变化，请重新进入编辑"},{status:409});
  const removed=committed.filter(file=>removeIds.includes(file.id));const kept=committed.filter(file=>!removeIds.includes(file.id));const final=[...kept,...staged];if(final.length<1||final.length>20)return Response.json({error:"一套图文需要保留1至20张图片"},{status:400});
  await db.batch([
   ...committed.map(file=>db.update(contentVersionFiles).set({position:file.position+10000}).where(eq(contentVersionFiles.id,file.id))),
   ...staged.map(file=>db.update(contentVersionFiles).set({position:file.position+20000}).where(eq(contentVersionFiles.id,file.id))),
   ...final.map((file,index)=>db.update(contentVersionFiles).set({position:index+1,draftEditToken:null,updatedAt:now}).where(eq(contentVersionFiles.id,file.id))),
   db.update(contentVersions).set({fileName:`${final.length}张图片`,fileSize:final.reduce((sum,file)=>sum+file.fileSize,0),coverPath:null,uploadStatus:"complete",businessActivityAt:now,updatedAt:now}).where(eq(contentVersions.id,record.versionId)),
   db.update(contents).set({businessActivityAt:now,updatedAt:now}).where(eq(contents.id,record.contentId)),
  ] as never);
  for(const file of removed){await db.delete(contentVersionFiles).where(eq(contentVersionFiles.id,file.id));await getMediaStore().delete(file.storagePath).catch(()=>undefined);}
 }else{
  if(staged.length!==1)return Response.json({error:"视频草稿只能保留一个视频文件"},{status:409});const replacement=staged[0];const oldPath=record.storagePath;
  await db.batch([
   db.update(contentVersions).set({fileName:replacement.fileName,storagePath:replacement.storagePath,mimeType:replacement.mimeType,fileSize:replacement.fileSize,durationSeconds:Number.isFinite(body.durationSeconds)?Math.max(0,Math.round(body.durationSeconds!)):null,uploadStatus:"complete",coverPath:null,businessActivityAt:now,updatedAt:now}).where(eq(contentVersions.id,record.versionId)),
   db.delete(contentVersionFiles).where(eq(contentVersionFiles.id,replacement.id)),
   db.update(contents).set({businessActivityAt:now,updatedAt:now}).where(eq(contents.id,record.contentId)),
  ] as never);
  if(oldPath!==replacement.storagePath)await getMediaStore().delete(oldPath).catch(()=>undefined);
 }
 await writeAudit(request,{userId:auth.user.id,action:"content.draft_media_commit",objectType:"content",objectId:record.code,details:{added:staged.length,removed:removeIds.length}});
 return Response.json({ok:true});
}

export async function DELETE(request:Request,context:RouteContext){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const result=await findDraft((await context.params).id,auth.user.id);if("error" in result)return result.error;
 const body=await request.json().catch(()=>({})) as {token?:string};if(!body.token)return Response.json({error:"草稿编辑会话无效"},{status:400});const count=await removeStage(result.record.versionId,body.token);
 await writeAudit(request,{userId:auth.user.id,action:"content.draft_media_cancel",objectType:"content",objectId:result.record.code,details:{files:count}});return Response.json({ok:true});
}
