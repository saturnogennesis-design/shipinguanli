import {and,eq,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {contents,contentVersions,contentVersionFiles,reviews} from "@/db/schema";
import {getMediaStore} from "@/lib/media-store";
import {requireUser,hasPermission} from "@/lib/server-auth";
type Context={params:Promise<{id:string}>};
async function authorize(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return {response:auth.response};
 const id=Number((await context.params).id);
 const [record]=await getDb().select({id:contentVersions.id,coverPath:contentVersions.coverPath,versionNumber:contentVersions.versionNumber,uploadStatus:contentVersions.uploadStatus,latestVersionNumber:contents.latestVersionNumber,uploaderUserId:contents.uploaderUserId,visibility:contents.visibility,reviewStatus:contents.reviewStatus}).from(contentVersions).innerJoin(contents,eq(contentVersions.contentId,contents.id)).where(and(eq(contentVersions.id,id),isNull(contents.deletedAt),isNull(contentVersions.deletedAt))).limit(1);
 if(!record)return {response:Response.json({error:"素材不存在"},{status:404})};
 if(!await canReadContentVersion(auth.user,id))return {response:Response.json({error:"无权查看素材"},{status:403})};
 if(record.versionNumber!==record.latestVersionNumber&&!hasPermission(auth.user,"version.view")&&!hasPermission(auth.user,"review.view")){
  const [recommendation]=await getDb().select({id:reviews.id}).from(reviews).where(and(eq(reviews.versionId,id),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).limit(1);
  if(!recommendation)return {response:Response.json({error:"无权查看历史素材"},{status:403})};
 }
 return {record,user:auth.user};
}
export async function GET(request:Request,context:Context){
 const result=await authorize(request,context);if(result.response)return result.response;
 let key=result.record!.coverPath;
 if(!key){const [first]=await getDb().select({storagePath:contentVersionFiles.storagePath}).from(contentVersionFiles).where(and(eq(contentVersionFiles.versionId,result.record!.id),eq(contentVersionFiles.position,1),eq(contentVersionFiles.uploadStatus,"complete"))).limit(1);key=first?.storagePath??null;}
 if(!key)return new Response(null,{status:404});
 const object=await getMediaStore().get(key);if(!object)return new Response(null,{status:404});
 const headers=new Headers({"cache-control":"private, no-store","x-content-type-options":"nosniff"});object.writeHttpMetadata(headers);
 return new Response(object.body,{headers});
}
export async function PUT(request:Request,context:Context){
 const result=await authorize(request,context);if(result.response)return result.response;
 if(result.record!.uploaderUserId!==result.user!.id||(!hasPermission(result.user!,"content.upload")&&!hasPermission(result.user!,"version.upload")))return Response.json({error:"只有原上传人可以生成封面"},{status:403});
 if(result.record!.uploadStatus!=="complete")return Response.json({error:"请先完成素材上传"},{status:409});
 if(Number(request.headers.get("content-length"))>1024*1024)return Response.json({error:"封面不得超过1MB"},{status:413});
 const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});
 const chunks:Uint8Array[]=[];let length=0;
 while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return Response.json({error:"封面必须为JPEG图片"},{status:400});
 const key=`covers/v${result.record!.id}.jpg`;
 await getMediaStore().put(key,new Blob([bytes]).stream(),{httpMetadata:{contentType:"image/jpeg"}});
 await getDb().update(contentVersions).set({coverPath:key}).where(eq(contentVersions.id,result.record!.id));
 return Response.json({ok:true});
}
import {canReadContentVersion} from "@/lib/content-access";
