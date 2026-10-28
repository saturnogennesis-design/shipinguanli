import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { contentGroups, materialClaims, materialDownloads, materialFiles, materialReviews, materialSets, materialSetViews, productMasters, shortVideoAccounts, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { getMediaStore } from "@/lib/media-store";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { hasId, materialAccountIds } from "@/lib/v3-access";

type Context={params:Promise<{id:string}>};
type Body={action?:unknown;title?:unknown;description?:unknown;category?:unknown;tags?:unknown;productMasterId?:unknown;accountId?:unknown;decision?:unknown;comment?:unknown;resubmissionNote?:unknown;editToken?:unknown;removeFileIds?:unknown};
function fail(message:string,status=400){return Response.json({error:message},{status});}
function clean(value:unknown,max:number){return String(value??"").trim().slice(0,max);}
function cleanTags(value:unknown){return [...new Set((Array.isArray(value)?value:[]).map(item=>clean(item,40)).filter(Boolean))].slice(0,20);}
function parseTags(value:string){try{return cleanTags(JSON.parse(value||"[]"));}catch{return [];}}
async function record(id:number,userId:number,decision:string,comment:string,resubmissionNote="",changes:Record<string,unknown>={}){await getDb().insert(materialReviews).values({setId:id,reviewerUserId:userId,decision,comment,resubmissionNote,changesJson:JSON.stringify(changes)});}

export async function GET(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const id=Number((await context.params).id);if(!Number.isInteger(id))return fail("素材套参数无效");
 const [viewAccounts,reviewAccounts,claimAccounts,uploadAccounts]=await Promise.all([materialAccountIds(auth.user,"view"),materialAccountIds(auth.user,"review"),materialAccountIds(auth.user,"claim"),materialAccountIds(auth.user,"upload")]);
 const isSuper=auth.user.roleCode==="super_admin",accountScope=isSuper?or(viewAccounts.length?inArray(materialSets.accountId,viewAccounts):undefined,isNull(materialSets.accountId)):inArray(materialSets.accountId,viewAccounts);
 const [row]=await getDb().select({set:materialSets,productName:productMasters.name,productImagePath:productMasters.imageStoragePath,accountName:shortVideoAccounts.name,uploaderName:users.displayName}).from(materialSets).leftJoin(productMasters,eq(productMasters.id,materialSets.productMasterId)).leftJoin(shortVideoAccounts,eq(shortVideoAccounts.id,materialSets.accountId)).innerJoin(users,eq(users.id,materialSets.uploaderUserId)).where(and(eq(materialSets.id,id),accountScope)).limit(1);
 if(!row)return fail("素材套不存在或不在你的查看范围内",404);
 const canUpload=hasPermission(auth.user,"asset.upload"),canReviewPermission=hasPermission(auth.user,"asset.review"),canClaimPermission=hasPermission(auth.user,"asset.claim"),canManageProducts=hasPermission(auth.user,"business.product_masters"),canArchive=hasPermission(auth.user,"asset.archive"),canDeletePermission=hasPermission(auth.user,"asset.delete");
 const claimOnly=canClaimPermission&&!canUpload&&!canReviewPermission&&!canManageProducts&&!canArchive&&!canDeletePermission&&!isSuper;
 if((claimOnly&&row.set.status!=="admitted")||(row.set.deletedAt&&!canDeletePermission))return fail("素材套不存在或暂不可查看",404);
 const db=getDb();
 const markViewed=new URL(request.url).searchParams.get("markViewed")!=="0";
 if(markViewed&&!row.set.deletedAt){const [view]=await db.select({id:materialSetViews.id,viewedAt:materialSetViews.viewedAt}).from(materialSetViews).where(and(eq(materialSetViews.setId,id),eq(materialSetViews.userId,auth.user.id))).limit(1);if(!view)await db.insert(materialSetViews).values({setId:id,userId:auth.user.id});}
 const [files,rawReviews,rawClaims,downloads]=await Promise.all([
  db.select().from(materialFiles).where(and(eq(materialFiles.setId,id),isNull(materialFiles.draftEditToken))).orderBy(asc(materialFiles.position)),
  claimOnly?Promise.resolve([]):db.select({id:materialReviews.id,decision:materialReviews.decision,comment:materialReviews.comment,resubmissionNote:materialReviews.resubmissionNote,changesJson:materialReviews.changesJson,createdAt:materialReviews.createdAt,reviewerName:users.displayName}).from(materialReviews).innerJoin(users,eq(users.id,materialReviews.reviewerUserId)).where(eq(materialReviews.setId,id)).orderBy(desc(materialReviews.createdAt)),
  db.select({id:materialClaims.id,userId:materialClaims.userId,claimedAt:materialClaims.claimedAt,releasedAt:materialClaims.releasedAt,userName:users.displayName,primaryGroupId:users.primaryGroupId}).from(materialClaims).innerJoin(users,eq(users.id,materialClaims.userId)).where(eq(materialClaims.setId,id)).orderBy(desc(materialClaims.claimedAt)),
  db.select({userId:materialDownloads.userId,createdAt:materialDownloads.createdAt,fileCount:materialDownloads.fileCount}).from(materialDownloads).where(eq(materialDownloads.setId,id)).orderBy(desc(materialDownloads.createdAt)),
 ]);
 const groupIds=[...new Set(rawClaims.map(claim=>claim.primaryGroupId).filter((value):value is number=>Boolean(value)))];
 const groups=groupIds.length?await db.select({id:contentGroups.id,name:contentGroups.name}).from(contentGroups).where(inArray(contentGroups.id,groupIds)):[];
 const groupNames=new Map(groups.map(group=>[group.id,group.name||"未命名小组"]));
 const claims=rawClaims.map(claim=>{const userDownloads=downloads.filter(item=>item.userId===claim.userId).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));return {...claim,releasedAt:null,claimedAt:userDownloads[0]?.createdAt??claim.claimedAt,groupName:claim.primaryGroupId?groupNames.get(claim.primaryGroupId)??"原小组已变更":"未加入内容组",downloadCount:userDownloads.length,lastDownloadedAt:userDownloads.at(-1)?.createdAt??null};}).filter(claim=>claim.downloadCount>0);
 const myDownloads=downloads.filter(item=>item.userId===auth.user!.id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),claimedByMe=myDownloads.length>0,elevated=row.set.uploaderUserId===auth.user.id||hasId(reviewAccounts,row.set.accountId),canDownloadByScope=hasId(claimAccounts,row.set.accountId)||elevated;
 const completed=files.filter(file=>file.uploadStatus==="complete");
 return Response.json({...row.set,tags:parseTags(row.set.tagsJson),rejectionReason:claimOnly?"":row.set.rejectionReason,resubmissionNote:claimOnly?"":row.set.resubmissionNote,productName:row.productName,productImageUrl:row.productImagePath&&row.set.productMasterId?`/api/product-masters/${row.set.productMasterId}/image?projectId=${auth.user!.projectId}`:null,accountName:row.accountName,uploaderName:row.uploaderName,fileCount:completed.length,totalBytes:completed.reduce((sum,file)=>sum+file.fileSize,0),files:files.map(file=>({...file,fileUrl:`/api/material-files/${file.id}/file?projectId=${auth.user!.projectId}`})),reviews:rawReviews,claims,claimedByMe,myClaimedAt:myDownloads[0]?.createdAt??null,viewedByMe:markViewed,audienceMode:claimOnly?"claim":"manage",capabilities:{canReview:!row.set.deletedAt&&row.set.status==="pending"&&hasId(reviewAccounts,row.set.accountId),canClaim:false,canDownload:!row.set.deletedAt&&row.set.status==="admitted"&&canDownloadByScope,canEdit:!row.set.deletedAt&&row.set.uploaderUserId===auth.user.id&&["draft","rejected"].includes(row.set.status)&&hasId(uploadAccounts,row.set.accountId),canSubmit:!row.set.deletedAt&&row.set.uploaderUserId===auth.user.id&&["draft","rejected"].includes(row.set.status)&&hasId(uploadAccounts,row.set.accountId),canWithdraw:!row.set.deletedAt&&row.set.uploaderUserId===auth.user.id&&row.set.status==="admitted"&&hasId(uploadAccounts,row.set.accountId),canClassify:!row.set.deletedAt&&isSuper&&row.set.status==="needs_classification",canViewClaims:row.set.status==="admitted"&&hasId(viewAccounts,row.set.accountId),canDelete:!row.set.deletedAt&&canDeletePermission&&hasId(viewAccounts,row.set.accountId),canRestore:Boolean(row.set.deletedAt)&&canDeletePermission&&hasId(viewAccounts,row.set.accountId)}});
}

export async function PATCH(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;const id=Number((await context.params).id);if(!Number.isInteger(id))return fail("素材套参数无效");
 const body=await request.json().catch(()=>null) as Body|null,action=String(body?.action??"");const db=getDb();const [row]=await db.select().from(materialSets).where(eq(materialSets.id,id)).limit(1);if(!row)return fail("素材套不存在",404);
 const now=new Date().toISOString();
 if(action==="classify"){
  if(auth.user.roleCode!=="super_admin"||row.status!=="needs_classification")return fail("只有超级管理员可以归类旧素材",403);
  const title=clean(body?.title,120)||row.title,description=clean(body?.description,2000)||row.description,category=clean(body?.category,80)||row.category,productMasterId=Number(body?.productMasterId),accountId=Number(body?.accountId);
  if(!description||!category)return fail("请填写素材说明并选择分类");if(!Number.isInteger(productMasterId)||productMasterId<=0)return fail("请选择所属产品");if(!Number.isInteger(accountId)||accountId<=0)return fail("请选择目标账号");
  const [product]=await db.select({id:productMasters.id}).from(productMasters).where(and(eq(productMasters.id,productMasterId),eq(productMasters.status,"active"))).limit(1),[account]=await db.select({id:shortVideoAccounts.id}).from(shortVideoAccounts).where(and(eq(shortVideoAccounts.id,accountId),eq(shortVideoAccounts.status,"active"))).limit(1);
  if(!product||!account)return fail("产品或目标账号不存在");
  await db.update(materialSets).set({title,description,category,tagsJson:JSON.stringify(cleanTags(body?.tags)),productMasterId,accountId,status:"draft",updatedAt:now}).where(eq(materialSets.id,id));
 }else if(action==="edit"){
  if(!hasPermission(auth.user,"asset.upload")||row.uploaderUserId!==auth.user.id||!["draft","rejected"].includes(row.status))return fail("当前状态或权限不允许修改素材套",403);
  const title=clean(body?.title,120),description=clean(body?.description,2000),category=clean(body?.category,80),productMasterId=Number(body?.productMasterId),accountId=Number(body?.accountId),accounts=await materialAccountIds(auth.user,"upload");
  if(!title)return fail("请填写素材套名称");if(!description)return fail("请填写素材套说明");if(!category)return fail("请选择素材分类");if(!Number.isInteger(productMasterId)||productMasterId<=0)return fail("请选择所属产品");if(!hasId(accounts,accountId))return fail("目标账号不在你的素材上传范围内",403);
  const editToken=clean(body?.editToken,100),removeIds=[...new Set((Array.isArray(body?.removeFileIds)?body.removeFileIds:[]).map(Number).filter(Number.isSafeInteger))];
  const committed=await db.select().from(materialFiles).where(and(eq(materialFiles.setId,id),isNull(materialFiles.draftEditToken))).orderBy(asc(materialFiles.position));
  const staged=editToken?await db.select().from(materialFiles).where(and(eq(materialFiles.setId,id),eq(materialFiles.draftEditToken,editToken))).orderBy(asc(materialFiles.position)):[];
  if(editToken&&!staged.length)return fail("临时素材已失效，请重新选择文件",409);if(staged.some(file=>file.uploadStatus!=="complete"))return fail("新增素材尚未全部上传完成",409);if(removeIds.some(fileId=>!committed.some(file=>file.id===fileId)))return fail("原素材已经变化，请重新进入编辑",409);
  const removed=committed.filter(file=>removeIds.includes(file.id)),final=[...committed.filter(file=>!removeIds.includes(file.id)),...staged];if(final.length<1)return fail("素材套至少需要保留一个文件");if(final.length>300)return fail("每套素材最多保留300个文件");
  const changes={titleChanged:title!==row.title,descriptionChanged:description!==row.description,categoryChanged:category!==row.category,productChanged:productMasterId!==row.productMasterId,accountChanged:accountId!==row.accountId,addedFiles:staged.length,removedFiles:removed.length};
  // Drizzle's heterogeneous batch tuple has no useful incremental array type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const operations=[] as any[];
  if(staged.length||removed.length){for(const file of committed)operations.push(db.update(materialFiles).set({position:file.position+10000}).where(eq(materialFiles.id,file.id)));for(const file of staged)operations.push(db.update(materialFiles).set({position:file.position+20000}).where(eq(materialFiles.id,file.id)));for(const file of removed)operations.push(db.delete(materialFiles).where(eq(materialFiles.id,file.id)));for(let index=0;index<final.length;index++)operations.push(db.update(materialFiles).set({position:index+1,draftEditToken:null,updatedAt:now}).where(eq(materialFiles.id,final[index].id)));}
  operations.push(db.update(materialSets).set({title,description,category,tagsJson:JSON.stringify(cleanTags(body?.tags)),productMasterId,accountId,updatedAt:now}).where(eq(materialSets.id,id)));operations.push(db.insert(materialReviews).values({setId:id,reviewerUserId:auth.user.id,decision:"edited",comment:"",resubmissionNote:"",changesJson:JSON.stringify(changes)}));
  await db.batch(operations as never);for(const file of removed){await getMediaStore().delete(file.storagePath).catch(()=>undefined);if(file.coverPath)await getMediaStore().delete(file.coverPath).catch(()=>undefined);}
 }else if(action==="submit"){
  if(!hasPermission(auth.user,"asset.upload")||row.uploaderUserId!==auth.user.id||!["draft","rejected"].includes(row.status))return fail("当前状态或权限不允许提交",403);
  const [incomplete]=await db.select({id:materialFiles.id}).from(materialFiles).where(and(eq(materialFiles.setId,id),isNull(materialFiles.draftEditToken),inArray(materialFiles.uploadStatus,["pending","uploading"]))).limit(1);if(incomplete)return fail("仍有文件未上传完成");
  const [complete]=await db.select({id:materialFiles.id}).from(materialFiles).where(and(eq(materialFiles.setId,id),isNull(materialFiles.draftEditToken),eq(materialFiles.uploadStatus,"complete"))).limit(1);if(!complete)return fail("请至少保留一个已上传素材");if(!row.description.trim()||!row.category.trim())return fail("请先填写素材说明并选择分类");
  const note=clean(body?.resubmissionNote,1000);if(row.status==="rejected"&&!note)return fail("重新提交被驳回素材时，请填写修改内容");
  await db.update(materialSets).set({status:"pending",resubmissionNote:note,submittedAt:now,reviewedAt:null,reviewerUserId:null,updatedAt:now}).where(eq(materialSets.id,id));await record(id,auth.user.id,"submitted","",note);
 }else if(action==="review"){
  const accounts=await materialAccountIds(auth.user,"review");if(!hasPermission(auth.user,"asset.review")||!hasId(accounts,row.accountId)||row.status!=="pending")return fail("当前素材不在你的审核范围内",403);
  const decision=String(body?.decision??""),comment=clean(body?.comment,2000);if(!["approved","rejected"].includes(decision))return fail("审核结论无效");if(decision==="rejected"&&!comment)return fail("驳回时请填写原因");
  const status=decision==="approved"?"admitted":"rejected";await db.update(materialSets).set({status,rejectionReason:decision==="rejected"?comment:"",reviewedAt:now,reviewerUserId:auth.user.id,updatedAt:now}).where(and(eq(materialSets.id,id),eq(materialSets.status,"pending")));await record(id,auth.user.id,decision,comment,row.resubmissionNote);
 }else if(action==="withdraw"){
  const accounts=await materialAccountIds(auth.user,"upload");if(!hasPermission(auth.user,"asset.upload")||row.uploaderUserId!==auth.user.id||row.status!=="admitted"||!hasId(accounts,row.accountId))return fail("只有上传人可以撤回本人已入库素材",403);
  await db.update(materialSets).set({status:"draft",reviewedAt:null,reviewerUserId:null,updatedAt:now}).where(eq(materialSets.id,id));await record(id,auth.user.id,"withdrawn","撤回修改，修改后需重新提交审核");
 }else if(action==="archive"){
  const accounts=await materialAccountIds(auth.user,"review");if(!hasPermission(auth.user,"asset.archive")||!hasId(accounts,row.accountId))return fail("没有归档该素材套的权限",403);
  await db.update(materialSets).set({status:"archived",archivedAt:now,archivedByUserId:auth.user.id,updatedAt:now}).where(eq(materialSets.id,id));
 }else if(action==="delete"){
  const accounts=await materialAccountIds(auth.user,"view");if(!hasPermission(auth.user,"asset.delete")||!hasId(accounts,row.accountId)||row.deletedAt)return fail("没有删除该素材套的权限",403);
  await db.update(materialSets).set({deletedAt:now,deletedByUserId:auth.user.id,updatedAt:now}).where(eq(materialSets.id,id));
 }else if(action==="restore"){
  const accounts=await materialAccountIds(auth.user,"view");if(!hasPermission(auth.user,"asset.delete")||!hasId(accounts,row.accountId)||!row.deletedAt)return fail("没有恢复该素材套的权限",403);
  await db.update(materialSets).set({deletedAt:null,deletedByUserId:null,updatedAt:now}).where(eq(materialSets.id,id));
 }else return fail("不支持的操作");
 await writeAudit(request,{userId:auth.user.id,action:`material_set.${action}`,objectType:"material_set",objectId:String(id),details:{previousStatus:row.status}});
 const [updated]=await db.select().from(materialSets).where(eq(materialSets.id,id)).limit(1);return Response.json(updated);
}
