import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { materialClaims, materialDownloads, materialFiles, materialSets } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getMediaStore } from "@/lib/media-store";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { zipStream } from "@/lib/zip-stream";
import { hasId, materialAccountIds } from "@/lib/v3-access";

type Context={params:Promise<{id:string}>};
function fail(message:string,status=400){return Response.json({error:message},{status});}
function safe(value:string){return [...value].map(character=>character.charCodeAt(0)<32||'<>:"/\\|?*'.includes(character)?"-":character).join("").replace(/[. ]+$/g,"").trim().slice(0,100)||"素材";}

export async function GET(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;if(!hasPermission(auth.user,"asset.view"))return fail("没有查看素材的权限",403);const id=Number((await context.params).id);if(!Number.isInteger(id))return fail("素材套参数无效");
 const db=getDb();const [set]=await db.select().from(materialSets).where(eq(materialSets.id,id)).limit(1);if(!set||set.status!=="admitted"||set.deletedAt)return fail("只有已入库素材可以下载",409);
 const [claimAccounts,reviewAccounts]=await Promise.all([materialAccountIds(auth.user,"claim"),materialAccountIds(auth.user,"review")]),elevated=set.uploaderUserId===auth.user.id||hasId(reviewAccounts,set.accountId);if(!hasId(claimAccounts,set.accountId)&&!elevated)return fail("素材套不在你的下载范围内",403);
 const files=await db.select().from(materialFiles).where(and(eq(materialFiles.setId,id),eq(materialFiles.uploadStatus,"complete"),isNull(materialFiles.draftEditToken))).orderBy(materialFiles.position);if(!files.length)return fail("素材套没有可下载的完整文件",409);const missing=await getMediaStore().missing(files.map(file=>file.storagePath));if(missing.length)return fail(`有${missing.length}个素材文件缺失，请联系管理员检查存储盘`,409);
 const used=new Map<string,number>(),entries=files.map((file,index)=>{const base=`${String(index+1).padStart(3,"0")}-${safe(file.fileName)}`,seen=used.get(base)??0;used.set(base,seen+1);const name=seen?`${base}-${seen+1}`:base;return {name,open:async()=>((await getMediaStore().get(file.storagePath))?.body??null)};});const totalBytes=files.reduce((sum,file)=>sum+file.fileSize,0),now=new Date().toISOString();
 const [[claim],previousDownloads]=await Promise.all([db.select().from(materialClaims).where(and(eq(materialClaims.setId,id),eq(materialClaims.userId,auth.user.id))).limit(1),db.select({id:materialDownloads.id}).from(materialDownloads).where(and(eq(materialDownloads.setId,id),eq(materialDownloads.userId,auth.user.id)))]);
 const operations=[claim?db.update(materialClaims).set({claimedAt:previousDownloads.length?claim.claimedAt:now,releasedAt:null}).where(eq(materialClaims.id,claim.id)):db.insert(materialClaims).values({setId:id,userId:auth.user.id,claimedAt:now}),db.insert(materialDownloads).values({setId:id,userId:auth.user.id,fileCount:files.length,totalBytes,createdAt:now})];await db.batch(operations as never);await writeAudit(request,{userId:auth.user.id,action:"material_set.download_claim",objectType:"material_set",objectId:String(id),details:{fileCount:files.length,totalBytes,firstDownload:previousDownloads.length===0}});
 return new Response(zipStream(entries),{headers:{"content-type":"application/zip","content-disposition":`attachment; filename*=UTF-8''${encodeURIComponent(`${safe(set.title)}-${safe(set.code)}.zip`)}`,"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
}
