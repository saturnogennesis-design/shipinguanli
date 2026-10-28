import { and,desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { contentReviewLocks, contentVersions, contents, platformContents, productMasters, products, reviewQueueItems,reviews } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import {companyContentAccess} from "@/lib/content-access";
import { hasPermission, requireUser } from "@/lib/server-auth";

type RouteContext = { params: Promise<{ id: string }> };

async function findContent(code: string) {
  const [record] = await getDb().select().from(contents).where(and(eq(contents.code, code), isNull(contents.deletedAt))).limit(1);
  return record;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const code = (await context.params).id;
  const record = await findContent(code);
  if (!record) return Response.json({ error: "内容不存在" }, { status: 404 });
  const payload = await request.json() as { action?: "archive" | "unarchive" | "submit" | "withdraw" | "update" | "feature" | "unfeature" | string; reason?: string; title?: string; remark?: string; productId?: number | null; productMasterId?: number | null; accountId?: number | null; visibility?: "private" | "public"; featuredReason?:string; featuredTags?:string[];confirmRecommendationCancellation?:boolean };
  const ownsContent = record.uploaderUserId === auth.user.id;
  const canManageRecommendation=payload.action==="unfeature"&&(hasPermission(auth.user,"content.feature")||hasPermission(auth.user,"review.recommend"));
  if (!ownsContent && !companyContentAccess(auth.user) && !canManageRecommendation) return Response.json({ error: "无权操作此内容" }, { status: 403 });
  const db = getDb();

  if (payload.action === "archive" || payload.action === "unarchive") {
    if (!hasPermission(auth.user,"content.archive")) return Response.json({error:"没有归档管理权限"},{status:403});
    const archive = payload.action === "archive";
    if (archive === Boolean(record.archivedAt)) return Response.json({error:"内容状态已改变，请刷新"},{status:409});
    const reason = payload.reason?.trim() ?? "";
    if (archive&&record.reviewStatus==="draft")return Response.json({error:"草稿不能归档；不再需要的草稿请移入回收站"},{status:409});
    if (archive && !reason) return Response.json({error:"请填写归档原因"},{status:400});
    const now = new Date().toISOString();
    const recommendations=archive?await db.select({id:reviews.id}).from(reviews).where(and(eq(reviews.contentId,record.id),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))):[];
    if(recommendations.length&&!payload.confirmRecommendationCancellation)return Response.json({error:"此内容包含推荐版本，归档将同时取消推荐",requiresRecommendationConfirmation:true,recommendationCount:1},{status:409});
    const reset=!archive&&["pending","reviewing"].includes(record.reviewStatus);
    await db.batch([
      ...(recommendations.length?[db.update(reviews).set({recommendationRemovedAt:now,recommendationRemovedByUserId:auth.user.id,updatedAt:now}).where(and(eq(reviews.contentId,record.id),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt)))]:[]),
      db.update(contents).set({archivedAt:archive?now:null,archiveReason:archive?reason:record.archiveReason,archivedByUserId:archive?auth.user.id:record.archivedByUserId,reviewStatus:reset?"draft":record.reviewStatus,reviewSubmittedAt:reset?null:record.reviewSubmittedAt,featured:archive?false:record.featured,featuredReason:archive?"":record.featuredReason,featuredTagsJson:archive?"[]":record.featuredTagsJson,featuredByUserId:archive?null:record.featuredByUserId,featuredAt:archive?null:record.featuredAt,updatedAt:now,businessActivityAt:now}).where(eq(contents.id,record.id)),
      ...(reset?[db.update(contentVersions).set({reviewStatus:"draft",reviewSubmittedAt:null,businessActivityAt:now,updatedAt:now}).where(and(eq(contentVersions.contentId,record.id),eq(contentVersions.versionNumber,record.latestVersionNumber)))]:[]),
      db.delete(contentReviewLocks).where(eq(contentReviewLocks.contentId,record.id)),
      db.update(reviewQueueItems).set({removedAt:now,updatedAt:now}).where(and(eq(reviewQueueItems.contentId,record.id),isNull(reviewQueueItems.removedAt))),
    ] as never);
    await writeAudit(request,{userId:auth.user.id,action:archive?"content.archive":"content.unarchive",objectType:"content",objectId:code,details:{reason,reviewStatus:record.reviewStatus}});
    return Response.json({ok:true});
  }
  if (record.archivedAt) return Response.json({error:"内容已归档，请先恢复再操作"},{status:409});

  if (payload.action === "submit") {
    if (!hasPermission(auth.user,"content.submit")) return Response.json({error:"没有提交审核的权限"},{status:403});
    if (record.reviewStatus !== "draft") return Response.json({ error: "只有草稿可以提交审核" }, { status: 409 });
    const [version] = await db.select({ id:contentVersions.id,uploadStatus: contentVersions.uploadStatus }).from(contentVersions).where(and(eq(contentVersions.contentId, record.id), eq(contentVersions.versionNumber, record.latestVersionNumber), isNull(contentVersions.deletedAt))).limit(1);
    if (!version || version.uploadStatus !== "complete") return Response.json({ error: "文件尚未上传完成" }, { status: 409 });
    const now=new Date().toISOString();
    const changed=await db.update(contents).set({ reviewStatus: "pending",reviewSubmittedAt:now,businessActivityAt:now, updatedAt: now }).where(and(eq(contents.id, record.id),eq(contents.reviewStatus,"draft"),isNull(contents.archivedAt),isNull(contents.deletedAt))).returning({id:contents.id});
    if(!changed.length)return Response.json({error:"内容状态已变化，请刷新后重试"},{status:409});
    await db.update(contentVersions).set({reviewStatus:"pending",reviewSubmittedAt:now,businessActivityAt:now,updatedAt:now}).where(eq(contentVersions.id,version.id));
    await writeAudit(request, { userId: auth.user.id, action: "content.submit_review", objectType: "content", objectId: code });
    return Response.json({ ok: true, reviewStatus: "pending" });
  }

  if (payload.action === "withdraw") {
    if (!hasPermission(auth.user,"content.withdraw")) return Response.json({error:"没有撤回审核的权限"},{status:403});
    if (record.reviewStatus !== "pending") return Response.json({ error: "只有待审核内容可以撤回" }, { status: 409 });
    const [lock] = await db.select({ id: contentReviewLocks.id }).from(contentReviewLocks).where(and(eq(contentReviewLocks.contentId, record.id), gt(contentReviewLocks.expiresAt, new Date().toISOString()))).limit(1);
    if (lock) return Response.json({ error: "内容已进入审核队列，不能撤回" }, { status: 409 });
    const now=new Date().toISOString();
    await db.update(contents).set({ reviewStatus: "draft",reviewSubmittedAt:null,businessActivityAt:now, updatedAt: now }).where(eq(contents.id, record.id));
    await db.update(contentVersions).set({reviewStatus:"draft",reviewSubmittedAt:null,businessActivityAt:now,updatedAt:now}).where(and(eq(contentVersions.contentId,record.id),eq(contentVersions.versionNumber,record.latestVersionNumber)));
    await writeAudit(request, { userId: auth.user.id, action: "content.withdraw", objectType: "content", objectId: code });
    return Response.json({ ok: true, reviewStatus: "draft" });
  }

  if (payload.action === "update") {
    if (!hasPermission(auth.user,"content.edit")) return Response.json({error:"没有编辑草稿的权限"},{status:403});
    if (record.reviewStatus !== "draft") return Response.json({ error: "只有草稿可以编辑基础信息" }, { status: 409 });
    const title = payload.title === undefined ? record.title : payload.title.trim();
    if (!title) return Response.json({ error: "标题不能为空" }, { status: 400 });
    const visibility = payload.visibility === "public" && hasPermission(auth.user, "content.set_public") ? "public" : payload.visibility === "private" ? "private" : record.visibility;
    const now=new Date().toISOString();
    const nextMasterId=payload.productMasterId===undefined?record.productMasterId:(payload.productMasterId||null);
    if(nextMasterId){const [master]=await db.select({id:productMasters.id}).from(productMasters).where(and(eq(productMasters.id,nextMasterId),eq(productMasters.status,"active"))).limit(1);if(!master)return Response.json({error:"所选商品不存在或已停用"},{status:409});}
    if(payload.productMasterId===null&&payload.productId===undefined&&!record.productId)return Response.json({error:"请选择所属商品"},{status:400});
    await db.update(contents).set({ title, remark: payload.remark?.trim() ?? record.remark, productId: payload.productId === undefined ? record.productId : payload.productId, productMasterId: nextMasterId, accountId: payload.accountId === undefined ? record.accountId : payload.accountId, visibility,businessActivityAt:now, updatedAt: now }).where(eq(contents.id, record.id));
    await writeAudit(request, { userId: auth.user.id, action: "content.update", objectType: "content", objectId: code });
    return Response.json({ ok: true });
  }

  if (payload.action === "prepare_draft_file") return Response.json({error:"旧版文件替换入口已停用，请使用草稿编辑中的保存或取消"},{status:410});

  if (payload.action === "feature") {
    return Response.json({error:"推荐案例必须在审核时与通过或驳回结果一起提交"},{status:409});
  }

  if (payload.action === "unfeature") {
    if (!hasPermission(auth.user,"content.feature")&&!hasPermission(auth.user,"review.recommend")) return Response.json({error:"没有取消推荐案例的权限"},{status:403});
    const now=new Date().toISOString();
    const [version]=await db.select({id:contentVersions.id}).from(contentVersions).where(and(eq(contentVersions.contentId,record.id),eq(contentVersions.versionNumber,record.latestVersionNumber),isNull(contentVersions.deletedAt))).limit(1);
    const [recommendation]=version?await db.select({id:reviews.id}).from(reviews).where(and(eq(reviews.versionId,version.id),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).orderBy(desc(reviews.createdAt),desc(reviews.id)).limit(1):[];
    if(!recommendation)return Response.json({error:"当前版本没有可取消的推荐案例"},{status:404});
    await db.update(reviews).set({recommendationRemovedAt:now,recommendationRemovedByUserId:auth.user.id,updatedAt:now}).where(eq(reviews.id,recommendation.id));
    await db.update(contents).set({featured:false,featuredReason:"",featuredTagsJson:"[]",featuredByUserId:null,featuredAt:null,businessActivityAt:now,updatedAt:now}).where(eq(contents.id,record.id));
    await writeAudit(request,{userId:auth.user.id,action:"content.recommendation_remove",objectType:"review",objectId:String(recommendation.id),details:{contentCode:code,versionNumber:record.latestVersionNumber}});
    return Response.json({ok:true,featured:false});
  }
  return Response.json({ error: "操作类型无效" }, { status: 400 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user,"content.delete")) return Response.json({error:"没有删除内容的权限"},{status:403});
  const code = (await context.params).id;
  const record = await findContent(code);
  if (!record) return Response.json({ error: "内容不存在" }, { status: 404 });
  if (record.uploaderUserId !== auth.user.id && !companyContentAccess(auth.user)) return Response.json({ error: "无权删除此内容" }, { status: 403 });
  const canDiscardAny=auth.user.roleCode==="super_admin";
  if (["pending","reviewing"].includes(record.reviewStatus)) return Response.json({error:"请先撤回或结束审核，再移入回收站"},{status:409});
  const [published] = await getDb().select({id:platformContents.id}).from(platformContents).where(and(eq(platformContents.sourceContentId,record.id),eq(platformContents.publishStatus,"published"))).limit(1);
  const [recommended] = await getDb().select({id:reviews.id}).from(reviews).where(and(eq(reviews.contentId,record.id),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).limit(1);
  if (published || recommended) return Response.json({error:"内容有已发布记录或推荐案例，请先处理关联，或使用归档保留记录"},{status:409});
  if (!["draft", "rejected"].includes(record.reviewStatus)&&!canDiscardAny) return Response.json({ error: "当前流程状态不能删除" }, { status: 409 });
  const now=new Date().toISOString();
  const restoreStatus=record.reviewStatus==="reviewing"?"pending":record.reviewStatus;
  await getDb().update(contents).set({ deletedAt: now, trashPreviousStatus:restoreStatus, updatedAt: now }).where(eq(contents.id, record.id));
  await getDb().update(platformContents).set({deletedAt:now,updatedAt:now}).where(eq(platformContents.sourceContentId,record.id));
  await getDb().delete(contentReviewLocks).where(eq(contentReviewLocks.contentId,record.id));
  await getDb().update(reviewQueueItems).set({removedAt:now,updatedAt:now}).where(eq(reviewQueueItems.contentId,record.id));
  await writeAudit(request, { userId: auth.user.id, action: "content.delete", objectType: "content", objectId: code });
  return Response.json({ ok: true });
}
