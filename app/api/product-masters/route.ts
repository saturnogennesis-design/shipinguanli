import { asc, count, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { materialSets, productMasters } from "@/db/schema";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { writeAudit } from "@/lib/audit";
import { syncProductMasterCatalog } from "@/lib/product-catalog";

function error(message:string,status=400){return Response.json({error:message},{status});}
function cleanName(value:unknown){return String(value??"").trim().slice(0,120);}

export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 const canUseCatalog=hasPermission(auth.user,"asset.view")||hasPermission(auth.user,"asset.upload")||hasPermission(auth.user,"content.view")||hasPermission(auth.user,"content.upload")||hasPermission(auth.user,"report.create")||hasPermission(auth.user,"business.product_masters");
 if(!canUseCatalog)return error("没有查看素材产品库的权限",403);
 await syncProductMasterCatalog();
 const includeInactive=new URL(request.url).searchParams.get("all")==="1"&&hasPermission(auth.user,"business.product_masters");
 const rows=await getDb().select().from(productMasters).where(includeInactive?undefined:eq(productMasters.status,"active")).orderBy(asc(productMasters.name));
 return Response.json({items:rows.map(row=>({...row,imageUrl:row.imageStoragePath?`/api/product-masters/${row.id}/image?v=${encodeURIComponent(row.updatedAt)}`:null}))});
}

export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"business.product_masters")&&!hasPermission(auth.user,"asset.upload"))return error("没有新增素材产品的权限",403);
 const body=await request.json().catch(()=>null) as {name?:unknown,imageType?:unknown}|null;
 const name=cleanName(body?.name);if(!name)return error("请填写产品名称");
 const [duplicate]=await getDb().select({id:productMasters.id}).from(productMasters).where(eq(productMasters.name,name)).limit(1);if(duplicate)return error("产品名称已存在，请直接修改或启用已有产品",409);
 const imageType=String(body?.imageType??"");
 if(imageType&&!['image/jpeg','image/png','image/webp'].includes(imageType))return error("产品图片仅支持 JPG、PNG 或 WebP");
 const imageStoragePath=imageType?`product-masters/${randomUUID()}`:null;
 const [row]=await getDb().insert(productMasters).values({name,imageStoragePath,createdByUserId:auth.user.id}).returning();
 return Response.json({...row,imageUploadUrl:imageStoragePath?`/api/product-masters/${row.id}/image`:null},{status:201});
}

export async function PATCH(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"business.product_masters"))return error("没有维护素材产品库的权限",403);
 const body=await request.json().catch(()=>null) as {id?:unknown,name?:unknown,status?:unknown,imageType?:unknown}|null,id=Number(body?.id);
 if(!Number.isInteger(id)||id<=0)return error("产品参数无效");
 const [current]=await getDb().select().from(productMasters).where(eq(productMasters.id,id)).limit(1);if(!current)return error("产品不存在",404);
 const changes:{name?:string;status?:string;imageStoragePath?:string;updatedAt:string}={updatedAt:new Date().toISOString()};
 if(body?.name!==undefined){const name=cleanName(body.name);if(!name)return error("请填写产品名称");changes.name=name;}
 if(body?.status!==undefined){const status=String(body.status);if(!['active','inactive'].includes(status))return error("产品状态无效");changes.status=status;}
 const imageType=String(body?.imageType??"");if(imageType){if(!['image/jpeg','image/png','image/webp'].includes(imageType))return error("产品图片仅支持 JPG、PNG 或 WebP");changes.imageStoragePath=current.imageStoragePath??`product-masters/${randomUUID()}`;}
 const [row]=await getDb().update(productMasters).set(changes).where(eq(productMasters.id,id)).returning();
 await writeAudit(request,{userId:auth.user.id,action:"product_master.update",objectType:"product_master",objectId:String(id),details:{name:row.name,imageChanged:Boolean(imageType)}});
 return Response.json({...row,imageUrl:row.imageStoragePath?`/api/product-masters/${row.id}/image`:null,imageUploadUrl:imageType?`/api/product-masters/${row.id}/image`:null});
}

export async function DELETE(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"business.product_masters"))return error("没有删除素材产品的权限",403);
 const id=Number(new URL(request.url).searchParams.get("id"));if(!Number.isInteger(id)||id<=0)return error("产品参数无效");
 const db=getDb(),[row]=await db.select().from(productMasters).where(eq(productMasters.id,id)).limit(1);if(!row)return error("产品不存在",404);
 const [usage]=await db.select({total:count()}).from(materialSets).where(eq(materialSets.productMasterId,id));
 await db.update(productMasters).set({status:"inactive",updatedAt:new Date().toISOString()}).where(eq(productMasters.id,id));
 await writeAudit(request,{userId:auth.user.id,action:"product_master.remove",objectType:"product_master",objectId:String(id),details:{name:row.name,referencedMaterialSets:Number(usage.total),historyPreserved:true}});
 return Response.json({ok:true,referencedMaterialSets:Number(usage.total),historyPreserved:true});
}
