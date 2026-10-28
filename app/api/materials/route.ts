import {and,count,desc,eq,like,sql} from "drizzle-orm";
import {listRules} from "@/lib/list-rules";
import {randomUUID} from "node:crypto";
import {getDb} from "@/db";
import {materials,users} from "@/db/schema";
import {requireUser,hasPermission} from "@/lib/server-auth";
import {communicationError,InputError,materialDto,materialVisible,recipients,requiredText} from "@/lib/communication";
import {writeAudit} from "@/lib/audit";
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"asset.view"))return Response.json({error:"无权查看素材中心"},{status:403});
 const url=new URL(request.url),page=Math.max(1,Math.min(100000,Math.floor(Number(url.searchParams.get("page"))||1))),pageSize=[20,50,100].includes(Number(url.searchParams.get("pageSize")))?Number(url.searchParams.get("pageSize")):20;
 const rules=listRules(url.searchParams.get("rules"),{query:{expression:sql`${materials.title}`},owner:{expression:sql`(SELECT display_name FROM users WHERE id=${materials.ownerUserId})`},createdAt:{expression:sql`${materials.createdAt}`,type:"date"},mimeType:{expression:sql`${materials.mimeType}`},fileSize:{expression:sql`${materials.fileSize}/1048576.0`,type:"number"},downloadable:{expression:sql`CASE WHEN ${materials.downloadable}=1 THEN '可下载' ELSE '只读' END`}});
 const condition=and(rules,materialVisible(auth.user),eq(materials.uploadStatus,"complete"),url.searchParams.get("q")?like(materials.title,`%${url.searchParams.get("q")?.slice(0,100)}%`):undefined);
 const db=getDb();const [total]=await db.select({total:count()}).from(materials).where(condition);
 const rows=await db.select({material:materials,ownerName:users.displayName,contentColor:users.contentColor}).from(materials).innerJoin(users,eq(users.id,materials.ownerUserId)).where(condition).orderBy(desc(materials.createdAt),desc(materials.id)).limit(pageSize).offset((page-1)*pageSize);
 return Response.json({items:rows.map(r=>({...materialDto(r.material,auth.user),ownerName:r.ownerName,contentColor:r.contentColor})),total:total.total,page,pageSize});
}
export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"asset.upload"))return Response.json({error:"没有素材上传权限"},{status:403});
 try{
 const body=await request.json();const title=requiredText(body.title,"素材标题",120),fileName=requiredText(body.fileName,"文件名",255);
 const fileSize=Number(body.fileSize),mimeType=String(body.mimeType??"");
 if(!Number.isSafeInteger(fileSize)||fileSize<=0||fileSize>512*1024*1024)throw new InputError("单文件大小须为1字节至512MB");
 if(!["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","audio/mpeg","audio/wav","application/pdf","text/plain","application/zip","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mimeType))throw new InputError("不支持此文件格式，请使用图片、MP4/WebM、音频、PDF、文本、Office文档或ZIP");
 const audience=await recipients(body.audience);
 const [row]=await getDb().insert(materials).values({title,description:String(body.description??"").slice(0,2000),ownerUserId:auth.user.id,audienceJson:JSON.stringify(audience),downloadable:body.downloadable===true,fileName,fileSize,mimeType,storagePath:`materials/${randomUUID()}`}).returning();
 await writeAudit(request,{userId:auth.user.id,action:"material.create",objectType:"material",objectId:String(row.id),details:{title,downloadable:row.downloadable,recipientCount:audience.length}});
 return Response.json({id:row.id,uploadUrl:`/api/materials/${row.id}/file`},{status:201});
 }catch(e){return communicationError(e);}
}
