import {imageThumbnail} from '@/lib/image-thumbnail';
import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "@/db";
import { materialFiles, materialSets } from "@/db/schema";
import { getMediaStore } from "@/lib/media-store";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { hasId, materialAccountIds } from "@/lib/v3-access";
type Context={params:Promise<{id:string}>};
function fail(message:string,status=400){return Response.json({error:message},{status});}
async function lookup(id:number){return (await getDb().select({file:materialFiles,set:materialSets}).from(materialFiles).innerJoin(materialSets,eq(materialSets.id,materialFiles.setId)).where(eq(materialFiles.id,id)).limit(1))[0];}
export async function PUT(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const row=await lookup(Number((await context.params).id));if(!row)return fail("素材文件不存在",404);
 const accounts=await materialAccountIds(auth.user,"upload");if(!hasPermission(auth.user,"asset.upload")||row.set.uploaderUserId!==auth.user.id||!hasId(accounts,row.set.accountId)||!["draft","rejected"].includes(row.set.status))return fail("无权上传该素材文件",403);if(!request.body)return fail("文件为空");
 const claimed=await getDb().update(materialFiles).set({uploadStatus:"uploading"}).where(and(eq(materialFiles.id,row.file.id),inArray(materialFiles.uploadStatus,["pending","failed"]))).returning({id:materialFiles.id});if(!claimed.length)return fail("文件已上传或正在上传",409);
 let size=0;const hash=createHash("sha256");
 try{const stream=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.byteLength;if(size>row.file.fileSize)throw new Error("size");hash.update(chunk);controller.enqueue(chunk);},flush(){if(size!==row.file.fileSize)throw new Error("size");}}));await getMediaStore().put(row.file.storagePath,stream,{httpMetadata:{contentType:row.file.mimeType}});await getDb().update(materialFiles).set({uploadStatus:"complete",checksumSha256:hash.digest("hex"),updatedAt:new Date().toISOString()}).where(eq(materialFiles.id,row.file.id));return Response.json({ok:true});}
 catch{await getMediaStore().delete(row.file.storagePath).catch(()=>undefined);await getDb().update(materialFiles).set({uploadStatus:"failed"}).where(eq(materialFiles.id,row.file.id));return fail("上传未完成或文件大小不符，请重试");}
}
export async function GET(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const row=await lookup(Number((await context.params).id));if(!row)return fail("素材文件不存在",404);
 if(row.file.draftEditToken&&row.set.uploaderUserId!==auth.user.id)return fail("临时素材尚未保存",404);
 const canUpload=hasPermission(auth.user,"asset.upload"),canReview=hasPermission(auth.user,"asset.review"),canClaim=hasPermission(auth.user,"asset.claim"),canManageProducts=hasPermission(auth.user,"business.product_masters"),canArchive=hasPermission(auth.user,"asset.archive"),canDelete=hasPermission(auth.user,"asset.delete"),isSuper=auth.user.roleCode==="super_admin";
 const claimOnly=canClaim&&!canUpload&&!canReview&&!canManageProducts&&!canArchive&&!canDelete&&!isSuper;
 const viewAccounts=await materialAccountIds(auth.user,claimOnly?"claim":"view");if(!hasId(viewAccounts,row.set.accountId))return fail("素材文件不在你的查看范围内",403);
 if((claimOnly&&row.set.status!=="admitted")||(row.set.deletedAt&&!canDelete))return fail("素材文件不存在或暂不可领取",404);
 const download=new URL(request.url).searchParams.get("download")==="1";
 if(download)return fail("素材只支持整套压缩包下载，请返回素材套详情操作",400);
 const thumb=new URL(request.url).searchParams.get('thumb')==='1';
 if(thumb&&!row.file.mimeType.startsWith('image/'))return fail('视频缩略图尚未保存',404);
 const object=await getMediaStore().get(row.file.storagePath,thumb?undefined:{range:request.headers});if(!object)return fail("素材文件不存在或存储盘未连接",404);
 if(thumb)return imageThumbnail(request,row.file.storagePath,object);
 const headers=new Headers({"content-type":row.file.mimeType,"cache-control":"private, no-store","x-content-type-options":"nosniff","accept-ranges":"bytes","content-disposition":`${download?"attachment":"inline"}; filename*=UTF-8''${encodeURIComponent(row.file.fileName)}`});object.writeHttpMetadata(headers);if(object.range)headers.set("content-range",`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);return new Response(object.body,{status:object.range?206:200,headers});
}
