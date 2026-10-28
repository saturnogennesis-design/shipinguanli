import { and, count, eq, isNotNull, isNull, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { materialFiles, materialSets } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getMediaStore } from "@/lib/media-store";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { hasId, materialAccountIds } from "@/lib/v3-access";

type Context={params:Promise<{id:string}>};
const allowedTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"]);
function fail(message:string,status=400){return Response.json({error:message},{status});}
function text(value:unknown,max:number){return String(value??"").trim().slice(0,max);}
async function editable(request:Request,id:number){const auth=await requireUser(request);if(!auth.user)return {auth,row:null,response:auth.response};const [row]=await getDb().select().from(materialSets).where(eq(materialSets.id,id)).limit(1);if(!row)return {auth,row:null,response:fail("素材套不存在",404)};const accounts=await materialAccountIds(auth.user,"upload");if(!hasPermission(auth.user,"asset.upload")||row.uploaderUserId!==auth.user.id||!["draft","rejected"].includes(row.status)||row.deletedAt||!hasId(accounts,row.accountId))return {auth,row:null,response:fail("当前状态或权限不允许修改素材文件",403)};return {auth,row,response:null};}
async function cleanup(id:number,token?:string){const db=getDb();const where=and(eq(materialFiles.setId,id),token?eq(materialFiles.draftEditToken,token):isNotNull(materialFiles.draftEditToken));const rows=await db.select().from(materialFiles).where(where);for(const file of rows){await getMediaStore().delete(file.storagePath).catch(()=>undefined);if(file.coverPath)await getMediaStore().delete(file.coverPath).catch(()=>undefined);}if(rows.length)await db.delete(materialFiles).where(where);return rows.length;}

export async function POST(request:Request,context:Context){
 const id=Number((await context.params).id);if(!Number.isInteger(id))return fail("素材套参数无效");const access=await editable(request,id);if(access.response)return access.response;
 const body=await request.json().catch(()=>null) as {files?:unknown}|null,files=Array.isArray(body?.files)?body.files as Array<{fileName?:unknown;mimeType?:unknown;fileSize?:unknown}>:[];if(!files.length)return fail("请选择要添加的素材文件");
 const db=getDb();const [currentRows,lastRows]=await Promise.all([db.select({value:count()}).from(materialFiles).where(and(eq(materialFiles.setId,id),isNull(materialFiles.draftEditToken))),db.select({value:max(materialFiles.position)}).from(materialFiles).where(and(eq(materialFiles.setId,id),isNull(materialFiles.draftEditToken)))]);if((currentRows[0]?.value??0)+files.length>300)return fail("每套素材最多保留300个文件");
 const cleaned:Array<{fileName:string;mimeType:string;fileSize:number}>=[];for(const file of files){const fileName=text(file.fileName,255),mimeType=String(file.mimeType??""),fileSize=Number(file.fileSize);if(!fileName)return fail("素材文件缺少名称");if(!allowedTypes.has(mimeType))return fail(`${fileName} 的格式暂不支持`);if(!Number.isSafeInteger(fileSize)||fileSize<=0||fileSize>4*1024*1024*1024)return fail(`${fileName} 的大小无效或超过4GB`);cleaned.push({fileName,mimeType,fileSize});}
 await cleanup(id);const token=randomUUID(),start=Number(lastRows[0]?.value??0)+100,created=await db.insert(materialFiles).values(cleaned.map((file,index)=>({setId:id,position:start+index,...file,draftEditToken:token,storagePath:`material-sets/${id}/draft-${token}-${randomUUID()}`}))).returning();
 await writeAudit(request,{userId:access.auth.user!.id,action:"material_set.edit_prepare",objectType:"material_set",objectId:String(id),details:{count:created.length}});
 return Response.json({token,uploads:created.map(file=>({id:file.id,fileName:file.fileName,uploadUrl:`/api/material-files/${file.id}/file`}))},{status:201});
}

export async function DELETE(request:Request,context:Context){
 const id=Number((await context.params).id);if(!Number.isInteger(id))return fail("素材套参数无效");const access=await editable(request,id);if(access.response)return access.response;const body=await request.json().catch(()=>null) as {token?:unknown}|null,token=text(body?.token,100);if(!token)return fail("临时编辑会话无效");
 const removed=await cleanup(id,token);await writeAudit(request,{userId:access.auth.user!.id,action:"material_set.edit_cancel",objectType:"material_set",objectId:String(id),details:{files:removed}});return Response.json({ok:true});
}
