import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {noticeAttachments,notices} from "@/db/schema";
import {requireUser} from "@/lib/server-auth";
import {communicationError,getNotice,InputError} from "@/lib/communication";
import {getMediaStore} from "@/lib/media-store";
type Context={params:Promise<{id:string}>};

async function attachment(id:number){
 const [row]=await getDb().select({file:noticeAttachments,notice:notices}).from(noticeAttachments).innerJoin(notices,eq(notices.id,noticeAttachments.noticeId)).where(eq(noticeAttachments.id,id)).limit(1);
 return row;
}

export async function PUT(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{
  const row=await attachment(Number((await context.params).id));if(!row)throw new InputError("公告附件不存在",404);
  if(row.notice.authorUserId!==auth.user.id||row.notice.publishStatus!=="uploading")throw new InputError("无权上传此公告附件",403);
  if(!request.body)throw new InputError("附件内容为空");
  const db=getDb();const claimed=await db.update(noticeAttachments).set({uploadStatus:"uploading"}).where(and(eq(noticeAttachments.id,row.file.id),eq(noticeAttachments.uploadStatus,"pending"))).returning({id:noticeAttachments.id});if(!claimed.length)throw new InputError("附件已上传或正在上传",409);
  let size=0;
  try{
   const stream=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.byteLength;if(size>row.file.fileSize)throw new Error("size");controller.enqueue(chunk);},flush(){if(size!==row.file.fileSize)throw new Error("size");}}));
   await getMediaStore().put(row.file.storagePath,stream,{httpMetadata:{contentType:row.file.mimeType}});
   await db.update(noticeAttachments).set({uploadStatus:"complete",updatedAt:new Date().toISOString()}).where(eq(noticeAttachments.id,row.file.id));
  }catch{
   await getMediaStore().delete(row.file.storagePath).catch(()=>undefined);await db.update(noticeAttachments).set({uploadStatus:"pending",updatedAt:new Date().toISOString()}).where(eq(noticeAttachments.id,row.file.id));throw new InputError("附件上传未完成或文件大小不符，请重试");
  }
  return Response.json({ok:true});
 }catch(e){return communicationError(e);}
}

export async function GET(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{
  const row=await attachment(Number((await context.params).id));if(!row||row.file.uploadStatus!=="complete")throw new InputError("公告附件不存在或尚未上传完成",404);
  await getNotice(auth.user,row.notice.id);
  const object=await getMediaStore().get(row.file.storagePath,{range:request.headers});if(!object)throw new InputError("公告附件文件不存在或存储盘未连接",404);
  const headers=new Headers({"content-type":row.file.mimeType,"cache-control":"private, no-store","x-content-type-options":"nosniff","content-security-policy":"sandbox","accept-ranges":"bytes","content-disposition":`inline; filename*=UTF-8''${encodeURIComponent(row.file.fileName)}`});object.writeHttpMetadata(headers);
  if(object.range)headers.set("content-range",`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);
  return new Response(object.body,{status:object.range?206:200,headers});
 }catch(e){return communicationError(e);}
}
