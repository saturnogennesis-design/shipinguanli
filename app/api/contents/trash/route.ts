import { and, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contentMetrics, contentReviewLocks, contentVersionFiles, contentVersions, contents, platformContents, productMasters, products, publicationCopies, publicationEvents, reviewQueueItems, reviews, shortVideoAccounts, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getMediaStore } from "@/lib/media-store";
import { hasPermission, requireUser } from "@/lib/server-auth";
import {randomUUID} from "node:crypto";
import { syncProductMasterCatalog } from "@/lib/product-catalog";

export const dynamic="force-dynamic";

function codesFrom(value:unknown){
  return Array.isArray(value)?[...new Set(value.filter((item):item is string=>typeof item==="string"&&item.trim().length>0).map((item)=>item.trim()))].slice(0,100):[];
}

export async function GET(request:Request){
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  if(!hasPermission(auth.user,"content.delete"))return Response.json({error:"没有查看回收站的权限"},{status:403});
  const company=companyContentAccess(auth.user);
  await syncProductMasterCatalog();
  const where=company?isNotNull(contents.deletedAt):and(isNotNull(contents.deletedAt),eq(contents.uploaderUserId,auth.user.id));
  const rows=await getDb().select({id:contents.id,code:contents.code,title:contents.title,contentType:contents.contentType,reviewStatus:contents.reviewStatus,trashPreviousStatus:contents.trashPreviousStatus,latestVersionNumber:contents.latestVersionNumber,deletedAt:contents.deletedAt,createdAt:contents.createdAt,uploaderUserId:users.id,contentColor:users.contentColor,uploaderName:users.displayName,productName:sql<string|null>`coalesce(${productMasters.name},${products.name})`,accountName:shortVideoAccounts.name}).from(contents).innerJoin(users,eq(contents.uploaderUserId,users.id)).leftJoin(products,eq(contents.productId,products.id)).leftJoin(productMasters,eq(contents.productMasterId,productMasters.id)).leftJoin(shortVideoAccounts,eq(contents.accountId,shortVideoAccounts.id)).where(where).orderBy(desc(contents.deletedAt)).limit(1000);
  return Response.json({contents:rows,canPurge:auth.user.roleCode==="super_admin"});
}

export async function POST(request:Request){
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  if(!hasPermission(auth.user,"content.delete"))return Response.json({error:"没有恢复内容的权限"},{status:403});
  const payload=await request.json() as {codes?:unknown};const codes=codesFrom(payload.codes);if(!codes.length)return Response.json({error:"请选择需要恢复的内容"},{status:400});
  const company=companyContentAccess(auth.user);
  const rows=await getDb().select({id:contents.id,code:contents.code,uploaderUserId:contents.uploaderUserId,trashPreviousStatus:contents.trashPreviousStatus}).from(contents).where(and(inArray(contents.code,codes),isNotNull(contents.deletedAt)));
  const allowed=rows.filter((item)=>company||item.uploaderUserId===auth.user!.id);if(!allowed.length)return Response.json({error:"没有可恢复的内容"},{status:403});
  const now=new Date().toISOString();
  for(const item of allowed){await getDb().update(contents).set({deletedAt:null,reviewStatus:item.trashPreviousStatus??"draft",trashPreviousStatus:null,updatedAt:now}).where(eq(contents.id,item.id));await getDb().update(platformContents).set({deletedAt:null,updatedAt:now}).where(eq(platformContents.sourceContentId,item.id));}
  await writeAudit(request,{userId:auth.user.id,action:"content.trash_restore",objectType:"content",objectId:allowed.map((item)=>item.code).join(","),details:{count:allowed.length}});
  return Response.json({ok:true,count:allowed.length});
}

export async function DELETE(request:Request){
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  if(auth.user.roleCode!=="super_admin")return Response.json({error:"只有超级管理员可以永久删除文件"},{status:403});
  const payload=await request.json() as {codes?:unknown};const codes=codesFrom(payload.codes);if(!codes.length)return Response.json({error:"请选择需要永久删除的内容"},{status:400});
  const selected=await getDb().select({id:contents.id,code:contents.code}).from(contents).where(and(inArray(contents.code,codes),isNotNull(contents.deletedAt)));if(!selected.length)return Response.json({error:"所选内容不在回收站"},{status:404});
  const contentIds=selected.map((item)=>item.id);
  const versions=await getDb().select({id:contentVersions.id,storagePath:contentVersions.storagePath,mimeType:contentVersions.mimeType,coverPath:contentVersions.coverPath}).from(contentVersions).where(inArray(contentVersions.contentId,contentIds));
  const versionIds=versions.map((item)=>item.id);
  const files=versionIds.length?await getDb().select({storagePath:contentVersionFiles.storagePath}).from(contentVersionFiles).where(inArray(contentVersionFiles.versionId,versionIds)):[];
  const assignments=await getDb().select({id:platformContents.id}).from(platformContents).where(inArray(platformContents.sourceContentId,contentIds));const assignmentIds=assignments.map((item)=>item.id);
  const [published]=await getDb().select({id:platformContents.id}).from(platformContents).where(and(inArray(platformContents.sourceContentId,contentIds),eq(platformContents.publishStatus,"published"))).limit(1);
  const [recommended]=await getDb().select({id:reviews.id}).from(reviews).where(and(inArray(reviews.contentId,contentIds),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).limit(1);
  if(published||recommended)return Response.json({error:"所选内容仍有关联发布或推荐案例，不能永久删除"},{status:409});
  const mediaKeys=[...new Set([...files.map(item=>item.storagePath),...versions.filter(item=>item.mimeType!=="application/x-image-set").map(item=>item.storagePath),...versions.map(item=>item.coverPath).filter((key):key is string=>Boolean(key))])];
  // Refuse shared keys: no deletion may damage another content/version.
  for(const key of mediaKeys){
    const [otherVersion]=await getDb().select({id:contentVersions.id}).from(contentVersions).where(and(notInArray(contentVersions.contentId,contentIds),or(eq(contentVersions.storagePath,key),eq(contentVersions.coverPath,key)))).limit(1);
    const [otherFile]=await getDb().select({id:contentVersionFiles.id}).from(contentVersionFiles).where(and(eq(contentVersionFiles.storagePath,key),versionIds.length?notInArray(contentVersionFiles.versionId,versionIds):undefined)).limit(1);
    if(otherVersion||otherFile)return Response.json({error:"文件仍被其他内容引用，已阻止删除"},{status:409});
  }
  const store=getMediaStore(),missing=await store.missing(mediaKeys);
  if(missing.length){await writeAudit(request,{userId:auth.user.id,action:"content.trash_purge_repair_required",objectType:"content",objectId:codes.join(","),details:{missing}});return Response.json({error:"部分原文件已经缺失，已停止永久删除，避免记录与文件再次不一致。请先完成媒体修复。",repairRequired:true,missingCount:missing.length},{status:409});}
  let quarantined:Awaited<ReturnType<typeof store.quarantine>>=[];
  try{quarantined=await store.quarantine(mediaKeys,randomUUID());}
  catch(error){await writeAudit(request,{userId:auth.user.id,action:"content.trash_purge_failed",objectType:"content",objectId:codes.join(","),details:{phase:"quarantine",error:String(error)}});return Response.json({error:"文件预处理失败，所有已移动文件均已恢复，记录仍在回收站。"},{status:500});}
  const db=getDb();
  const mutations=[];
  if(assignmentIds.length){mutations.push(db.delete(publicationEvents).where(inArray(publicationEvents.platformContentId,assignmentIds)),db.delete(contentMetrics).where(inArray(contentMetrics.platformContentId,assignmentIds)),db.delete(publicationCopies).where(inArray(publicationCopies.platformContentId,assignmentIds)));}
  mutations.push(db.delete(platformContents).where(inArray(platformContents.sourceContentId,contentIds)),db.delete(contentReviewLocks).where(inArray(contentReviewLocks.contentId,contentIds)),db.delete(reviewQueueItems).where(inArray(reviewQueueItems.contentId,contentIds)),db.delete(reviews).where(inArray(reviews.contentId,contentIds)));
  if(versionIds.length)mutations.push(db.delete(contentVersionFiles).where(inArray(contentVersionFiles.versionId,versionIds)));
  mutations.push(db.delete(contentVersions).where(inArray(contentVersions.contentId,contentIds)),db.delete(contents).where(inArray(contents.id,contentIds)));
  try{await db.batch(mutations as never);}catch(error){await store.restoreQuarantine(quarantined);await writeAudit(request,{userId:auth.user.id,action:"content.trash_purge_failed",objectType:"content",objectId:codes.join(","),details:{phase:"database",error:String(error)}});return Response.json({error:"数据库删除失败，文件已恢复，记录仍在回收站。"},{status:500});}
  let cleanupPending=false;try{await store.deleteQuarantine(quarantined);}catch(error){cleanupPending=true;await writeAudit(request,{userId:auth.user.id,action:"content.trash_quarantine_cleanup_pending",objectType:"content",objectId:codes.join(","),details:{error:String(error),quarantineCount:quarantined.length}});}
  await writeAudit(request,{userId:auth.user.id,action:"content.trash_purge",objectType:"content",objectId:selected.map((item)=>item.code).join(","),details:{count:selected.length,fileCount:mediaKeys.length}});
  return Response.json({ok:true,count:selected.length,cleanupPending});
}
import {companyContentAccess} from "@/lib/content-access";
