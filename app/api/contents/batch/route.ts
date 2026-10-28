import {and,eq,inArray,isNotNull,isNull} from "drizzle-orm";
import {getDb} from "@/db";
import {contentReviewLocks,contentVersions,contents,platformContents,reviewQueueItems,reviews} from "@/db/schema";
import {writeAudit} from "@/lib/audit";
import {companyContentAccess} from "@/lib/content-access";
import {hasPermission,requireUser} from "@/lib/server-auth";

type BatchAction="archive"|"unarchive"|"trash";
function safeCodes(value:unknown){return Array.isArray(value)?[...new Set(value.filter((item):item is string=>typeof item==="string"&&item.trim().length>0).map(item=>item.trim()))].slice(0,100):[];}

export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 const body=await request.json().catch(()=>({})) as {action?:BatchAction;codes?:unknown;reason?:string;confirmRecommendationCancellation?:boolean};
 const action=body.action,codes=safeCodes(body.codes);if(!action||!codes.length)return Response.json({error:"请选择需要处理的内容"},{status:400});
 const permission=action==="trash"?"content.delete":"content.archive";if(!hasPermission(auth.user,permission))return Response.json({error:action==="trash"?"没有移入回收站的权限":"没有归档管理权限"},{status:403});
 const db=getDb();const records=await db.select().from(contents).where(and(inArray(contents.code,codes),isNull(contents.deletedAt)));if(records.length!==codes.length)return Response.json({error:"部分内容已不存在或状态已经变化，请刷新后重试"},{status:409});
 const company=companyContentAccess(auth.user);if(records.some(item=>item.uploaderUserId!==auth.user!.id&&!company))return Response.json({error:"所选内容中包含无权操作的内容"},{status:403});
 const ids=records.map(item=>item.id);const now=new Date().toISOString();
 if(action==="archive"){
  const reason=body.reason?.trim()??"";if(!reason)return Response.json({error:"请填写归档原因"},{status:400});
  if(records.some(item=>item.archivedAt))return Response.json({error:"所选内容中包含已经归档的内容"},{status:409});
  if(records.some(item=>item.reviewStatus==="draft"))return Response.json({error:"草稿不能归档；不再需要的草稿请移入回收站"},{status:409});
 }
 if(action==="unarchive"&&records.some(item=>!item.archivedAt))return Response.json({error:"所选内容中包含未归档内容"},{status:409});
 if(action==="trash"){
  if(records.some(item=>["pending","reviewing"].includes(item.reviewStatus)))return Response.json({error:"待审核或审核中的内容不能直接删除，请使用归档"},{status:409});
  if(records.some(item=>item.reviewStatus==="approved"&&auth.user!.roleCode!=="super_admin"))return Response.json({error:"已通过内容只有超级管理员可以移入回收站"},{status:403});
  const [published]=await db.select({id:platformContents.id}).from(platformContents).where(and(inArray(platformContents.sourceContentId,ids),eq(platformContents.publishStatus,"published"),isNull(platformContents.deletedAt))).limit(1);
  if(published)return Response.json({error:"所选内容中存在已发布记录，请先处理发布关联后再删除；归档不会影响外部平台内容"},{status:409});
 }
 const activeRecommendations=await db.select({id:reviews.id,contentId:reviews.contentId}).from(reviews).where(and(inArray(reviews.contentId,ids),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt)));
 const recommendationCount=new Set(activeRecommendations.map(item=>item.contentId)).size;
 if(recommendationCount&&!body.confirmRecommendationCancellation)return Response.json({error:`所选内容中有 ${recommendationCount} 条包含推荐版本，继续操作将同时取消推荐`,requiresRecommendationConfirmation:true,recommendationCount},{status:409});
 const mutations=[];
 if(activeRecommendations.length)mutations.push(db.update(reviews).set({recommendationRemovedAt:now,recommendationRemovedByUserId:auth.user.id,updatedAt:now}).where(inArray(reviews.id,activeRecommendations.map(item=>item.id))));
 if(action==="archive"){
  mutations.push(db.update(contents).set({archivedAt:now,archiveReason:body.reason!.trim(),archivedByUserId:auth.user.id,featured:false,featuredReason:"",featuredTagsJson:"[]",featuredByUserId:null,featuredAt:null,businessActivityAt:now,updatedAt:now}).where(inArray(contents.id,ids)));
  mutations.push(db.delete(contentReviewLocks).where(inArray(contentReviewLocks.contentId,ids)));
  mutations.push(db.update(reviewQueueItems).set({removedAt:now,updatedAt:now}).where(and(inArray(reviewQueueItems.contentId,ids),isNull(reviewQueueItems.removedAt))));
 }else if(action==="unarchive"){
  for(const item of records){
   const reset=["pending","reviewing"].includes(item.reviewStatus);
   mutations.push(db.update(contents).set({
    archivedAt:null,
    reviewStatus:reset?"draft":item.reviewStatus,
    reviewSubmittedAt:reset?null:item.reviewSubmittedAt,
    businessActivityAt:now,
    updatedAt:now,
   }).where(eq(contents.id,item.id)));
   if(reset){
    mutations.push(db.update(contentVersions).set({
     reviewStatus:"draft",
     reviewSubmittedAt:null,
     businessActivityAt:now,
     updatedAt:now,
    }).where(and(
     eq(contentVersions.contentId,item.id),
     eq(contentVersions.versionNumber,item.latestVersionNumber),
    )));
   }
  }
 }else{
  for(const item of records)mutations.push(db.update(contents).set({deletedAt:now,trashPreviousStatus:item.reviewStatus,featured:false,featuredReason:"",featuredTagsJson:"[]",featuredByUserId:null,featuredAt:null,updatedAt:now}).where(eq(contents.id,item.id)));
  mutations.push(db.update(platformContents).set({deletedAt:now,updatedAt:now}).where(inArray(platformContents.sourceContentId,ids)));
  mutations.push(db.delete(contentReviewLocks).where(inArray(contentReviewLocks.contentId,ids)));
  mutations.push(db.update(reviewQueueItems).set({removedAt:now,updatedAt:now}).where(and(inArray(reviewQueueItems.contentId,ids),isNull(reviewQueueItems.removedAt))));
 }
 await db.batch(mutations as never);
 await writeAudit(request,{userId:auth.user.id,action:`content.batch_${action}`,objectType:"content",objectId:codes.join(","),details:{count:records.length,recommendationsCancelled:recommendationCount,reason:body.reason?.trim()??""}});
 return Response.json({ok:true,count:records.length,recommendationsCancelled:recommendationCount});
}
