import {imageThumbnail} from '@/lib/image-thumbnail';
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { productMasters } from "@/db/schema";
import { getMediaStore } from "@/lib/media-store";
import { hasPermission, requireUser } from "@/lib/server-auth";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"asset.view")&&!hasPermission(auth.user,"asset.upload")&&!hasPermission(auth.user,"content.view")&&!hasPermission(auth.user,"content.upload")&&!hasPermission(auth.user,"business.product_masters")&&!hasPermission(auth.user,"report.create")&&!hasPermission(auth.user,"report.receive")&&!hasPermission(auth.user,"report.cc")&&!hasPermission(auth.user,"publishing.view"))return Response.json({error:"无权查看"},{status:403});
 const [row]=await getDb().select().from(productMasters).where(eq(productMasters.id,Number((await context.params).id))).limit(1);
 if(!row?.imageStoragePath)return Response.json({error:"产品图片不存在"},{status:404});
 const object=await getMediaStore().get(row.imageStoragePath);if(!object)return Response.json({error:"产品图片文件不存在"},{status:404});
 if(new URL(request.url).searchParams.get('thumb')==='1')return imageThumbnail(request,row.imageStoragePath,object);
 const headers=new Headers({"cache-control":"private, no-store","x-content-type-options":"nosniff"});object.writeHttpMetadata(headers);return new Response(object.body,{headers});
}
export async function PUT(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 const [row]=await getDb().select().from(productMasters).where(eq(productMasters.id,Number((await context.params).id))).limit(1);
 if(!hasPermission(auth.user,"business.product_masters")&&!(hasPermission(auth.user,"asset.upload")&&row?.createdByUserId===auth.user.id))return Response.json({error:"没有上传该产品图片的权限"},{status:403});
 if(!row?.imageStoragePath||!request.body)return Response.json({error:"图片上传参数无效"},{status:400});
 const type=request.headers.get("content-type")??"";if(!['image/jpeg','image/png','image/webp'].includes(type))return Response.json({error:"产品图片仅支持 JPG、PNG 或 WebP"},{status:415});
 let size=0;const stream=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){size+=chunk.byteLength;if(size>10*1024*1024)throw new Error("图片不能超过10MB");controller.enqueue(chunk);}}));
 try{await getMediaStore().put(row.imageStoragePath,stream,{httpMetadata:{contentType:type}});return Response.json({ok:true});}catch{return Response.json({error:"图片上传失败，请重试"},{status:400});}
}
