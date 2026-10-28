import {and,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {materials} from "@/db/schema";
import {requireUser,hasPermission} from "@/lib/server-auth";
import {communicationError,getMaterial,InputError,materialDto} from "@/lib/communication";
import {getMediaStore} from "@/lib/media-store";
import {writeAudit} from "@/lib/audit";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{const row=await getMaterial(auth.user,Number((await context.params).id));if(row.uploadStatus!=="complete")throw new InputError("文件尚未上传完成",409);
 const download=new URL(request.url).searchParams.get("download")==="1";
 const inline=/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|wav)|application\/pdf|text\/plain)$/.test(row.mimeType);
 if((download||!inline)&&!materialDto(row,auth.user).canDownload)throw new InputError("此素材仅可在线查看，禁止下载原件",403);
 const object=await getMediaStore().get(row.storagePath,{range:request.headers});if(!object)throw new InputError("素材文件不存在或存储盘未连接",404);
 const headers=new Headers({"content-type":row.mimeType,"cache-control":"private, no-store","x-content-type-options":"nosniff","content-security-policy":"sandbox","accept-ranges":"bytes","content-disposition":`${download||!inline?"attachment":"inline"}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`});object.writeHttpMetadata(headers);
 if(object.range)headers.set("content-range",`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);
 if(download)await writeAudit(request,{userId:auth.user.id,action:"material.download",objectType:"material",objectId:String(row.id)});
 return new Response(object.body,{status:object.range?206:200,headers});}catch(e){return communicationError(e);}
}
export async function PUT(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{const row=await getMaterial(auth.user,Number((await context.params).id));if(!hasPermission(auth.user,"asset.upload")||row.ownerUserId!==auth.user.id)throw new InputError("无权上传文件",403);
 if(!request.body)throw new InputError("文件为空");
 const db=getDb();const claimed=await db.update(materials).set({uploadStatus:"uploading"}).where(and(eq(materials.id,row.id),eq(materials.uploadStatus,"pending"))).returning({id:materials.id});if(!claimed.length)throw new InputError("文件已上传或正在上传",409);
 let size=0;
 try{const stream=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.byteLength;if(size>row.fileSize)throw new Error("文件大小不符");controller.enqueue(chunk);},flush(){if(size!==row.fileSize)throw new Error("文件大小不符");}}));
 await getMediaStore().put(row.storagePath,stream,{httpMetadata:{contentType:row.mimeType}});
 await db.update(materials).set({uploadStatus:"complete",updatedAt:new Date().toISOString()}).where(eq(materials.id,row.id));
 }catch{await getMediaStore().delete(row.storagePath);await db.update(materials).set({uploadStatus:"pending"}).where(eq(materials.id,row.id));throw new InputError("上传未完成或文件大小不符，请重试");}
 return Response.json({ok:true});}catch(e){return communicationError(e);}
}
