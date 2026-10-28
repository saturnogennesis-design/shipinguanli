import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contentGroups, contentReviewLocks, contentVersions, contents, platformContents, products, reviewQueueItems, reviewSessions, reviews, shortVideoAccounts, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hasPermission, requireUser } from "@/lib/server-auth";

type RouteContext = { params: Promise<{ id: string }> };

async function ownedSession(sessionId: number, userId: number) {
  const [session] = await getDb().select().from(reviewSessions).where(and(eq(reviewSessions.id, sessionId), eq(reviewSessions.reviewerUserId, userId))).limit(1);
  return session;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireUser(request); if (!auth.user) return auth.response;
  if (!hasPermission(auth.user,"review.process")) return Response.json({error:"没有查看审核队列的权限"},{status:403});
  const sessionId = Number((await context.params).id); const session = await ownedSession(sessionId, auth.user.id);
  if (!session) return Response.json({ error: "审核队列不存在" }, { status: 404 });
  const items = await getDb().select({ queueItemId: reviewQueueItems.id, position: reviewQueueItems.position, draftDecision: reviewQueueItems.draftDecision, draftComment: reviewQueueItems.draftComment, draftRecommended:reviewQueueItems.draftRecommended, removedAt: reviewQueueItems.removedAt, contentId: contents.id, code: contents.code, title: contents.title, contentType: contents.contentType, uploaderUserId:contents.uploaderUserId,contentColor:users.contentColor,uploaderName: users.displayName, productName: products.name, versionNumber: contentVersions.versionNumber, versionId: contentVersions.id, fileName: contentVersions.fileName, fileSize: contentVersions.fileSize }).from(reviewQueueItems)
    .innerJoin(contents, eq(reviewQueueItems.contentId, contents.id)).innerJoin(users, eq(contents.uploaderUserId, users.id)).leftJoin(products, eq(contents.productId, products.id)).innerJoin(contentVersions, eq(reviewQueueItems.versionId, contentVersions.id))
    .where(eq(reviewQueueItems.sessionId, sessionId)).orderBy(asc(reviewQueueItems.position));
  return Response.json({ session, items,canRecommend:hasPermission(auth.user,"review.recommend"),canProcess:hasPermission(auth.user,"review.process") });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUser(request); if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "review.process")) return Response.json({ error: "没有执行内容审核的权限" }, { status: 403 });
  const sessionId = Number((await context.params).id); const session = await ownedSession(sessionId, auth.user.id);
  if (!session || session.status !== "active") return Response.json({ error: "审核队列已经结束" }, { status: 409 });
  const payload = await request.json() as { queueItemId?: number; decision?: "approved" | "rejected" | null; comment?: string; recommended?:boolean; removed?: boolean };
  const [item] = await getDb().select().from(reviewQueueItems).where(and(eq(reviewQueueItems.id, payload.queueItemId ?? 0), eq(reviewQueueItems.sessionId, sessionId))).limit(1);
  if (!item) return Response.json({ error: "队列内容不存在" }, { status: 404 });
  const now = new Date().toISOString();
  if(payload.recommended&&!hasPermission(auth.user,"review.recommend"))return Response.json({error:"没有推荐案例的权限"},{status:403});
  const comment=payload.removed?"":payload.comment?.trim()??"";
  if(payload.recommended&&!comment)return Response.json({error:"推荐案例必须填写审核评语"},{status:400});
  await getDb().update(reviewQueueItems).set({ draftDecision: payload.removed ? null : payload.decision ?? null, draftComment: comment, draftRecommended:payload.removed?false:Boolean(payload.recommended), removedAt: payload.removed ? now : null, updatedAt: now }).where(eq(reviewQueueItems.id, item.id));
  if (payload.removed) {
    await getDb().delete(contentReviewLocks).where(and(eq(contentReviewLocks.sessionId, sessionId), eq(contentReviewLocks.contentId, item.contentId)));
    await getDb().update(contents).set({ reviewStatus: "pending", updatedAt: now }).where(and(eq(contents.id, item.contentId), eq(contents.reviewStatus, "reviewing")));
    await getDb().update(contentVersions).set({reviewStatus:"pending",updatedAt:now}).where(eq(contentVersions.id,item.versionId));
  }
  return Response.json({ ok: true });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireUser(request); if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "review.process")) return Response.json({ error: "没有执行内容审核的权限" }, { status: 403 });
  const sessionId = Number((await context.params).id); const session = await ownedSession(sessionId, auth.user.id);
  if (!session || session.status !== "active") return Response.json({ error: "审核队列已经结束" }, { status: 409 });
  const items = await getDb().select().from(reviewQueueItems).where(eq(reviewQueueItems.sessionId, sessionId));
  const active = items.filter((item) => !item.removedAt);
  if (active.some((item) => !item.draftDecision)) return Response.json({ error: "队列中还有未审核内容" }, { status: 409 });
  if (active.some((item) => item.draftDecision === "rejected" && !item.draftComment.trim())) return Response.json({ error: "驳回内容必须填写审核意见" }, { status: 400 });
  if(active.some((item)=>item.draftRecommended&&!item.draftComment.trim()))return Response.json({error:"推荐案例必须填写审核评语"},{status:400});
  if(active.some((item)=>item.draftRecommended)&&!hasPermission(auth.user,"review.recommend"))return Response.json({error:"没有推荐案例的权限"},{status:403});
  const db = getDb(); const now = new Date().toISOString();
  for (const item of items) {
    if (!item.removedAt && item.draftDecision) {
      await db.insert(reviews).values({ contentId: item.contentId, versionId: item.versionId, reviewerUserId: auth.user.id, decision: item.draftDecision, comment: item.draftComment,recommended:item.draftRecommended });
      await db.update(contentVersions).set({reviewStatus:item.draftDecision,businessActivityAt:now,updatedAt:now}).where(eq(contentVersions.id,item.versionId));
      await db.update(contents).set({reviewStatus:item.draftDecision,visibility:item.draftRecommended?"public":undefined,featured:item.draftRecommended,featuredReason:item.draftRecommended?item.draftComment:"",featuredTagsJson:"[]",featuredByUserId:item.draftRecommended?auth.user.id:null,featuredAt:item.draftRecommended?now:null,businessActivityAt:now,updatedAt:now}).where(eq(contents.id,item.contentId));
      if(item.draftDecision==="approved"){
        const [source]=await db.select({storedAccountId:contents.accountId,accountId:sql<number|null>`coalesce(${contents.accountId},${contentGroups.accountId})`,productId:contents.productId,productMasterId:contents.productMasterId,platformId:shortVideoAccounts.platformId}).from(contents).leftJoin(contentGroups,eq(contentGroups.id,contents.groupId)).leftJoin(shortVideoAccounts,eq(shortVideoAccounts.id,sql`coalesce(${contents.accountId},${contentGroups.accountId})`)).where(eq(contents.id,item.contentId)).limit(1);
        if(source?.accountId&&source.platformId){if(!source.storedAccountId)await db.update(contents).set({accountId:source.accountId,updatedAt:now}).where(eq(contents.id,item.contentId));const [existing]=await db.select({id:platformContents.id}).from(platformContents).where(and(eq(platformContents.sourceContentId,item.contentId),eq(platformContents.platformId,source.platformId))).limit(1);if(existing)await db.update(platformContents).set({versionId:item.versionId,accountId:source.accountId,productId:source.productId,productMasterId:source.productMasterId,deletedAt:null,publishStatus:"pending",publishedAt:null,handlerUserId:null,handlingStartedAt:null,rowVersion:sql`${platformContents.rowVersion}+1`,updatedAt:now}).where(eq(platformContents.id,existing.id));else await db.insert(platformContents).values({sourceContentId:item.contentId,versionId:item.versionId,platformId:source.platformId,accountId:source.accountId,productId:source.productId,productMasterId:source.productMasterId,publishStatus:"pending"});}
      }
    } else {
      await db.update(contents).set({ reviewStatus: "pending", updatedAt: now }).where(eq(contents.id, item.contentId));
      await db.update(contentVersions).set({reviewStatus:"pending",updatedAt:now}).where(eq(contentVersions.id,item.versionId));
    }
  }
  await db.delete(contentReviewLocks).where(eq(contentReviewLocks.sessionId, sessionId));
  await db.update(reviewSessions).set({ status: "submitted", submittedAt: now, updatedAt: now }).where(eq(reviewSessions.id, sessionId));
  await writeAudit(request, { userId: auth.user.id, action: "review.session_submit", objectType: "review_session", objectId: String(sessionId), details: { approved: active.filter((item)=>item.draftDecision==="approved").length, rejected: active.filter((item)=>item.draftDecision==="rejected").length,recommended:active.filter((item)=>item.draftRecommended).length } });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireUser(request); if (!auth.user) return auth.response;
  if (!hasPermission(auth.user,"review.process")) return Response.json({error:"没有取消审核队列的权限"},{status:403});
  const sessionId = Number((await context.params).id); const session = await ownedSession(sessionId, auth.user.id);
  if (!session || session.status !== "active") return Response.json({ error: "审核队列已经结束" }, { status: 409 });
  const items = await getDb().select({ contentId: reviewQueueItems.contentId }).from(reviewQueueItems).where(eq(reviewQueueItems.sessionId, sessionId)); const now = new Date().toISOString();
  for (const item of items) await getDb().update(contents).set({ reviewStatus: "pending", updatedAt: now }).where(eq(contents.id, item.contentId));
  for (const item of items) await getDb().update(contentVersions).set({reviewStatus:"pending",updatedAt:now}).where(eq(contentVersions.contentId,item.contentId));
  await getDb().delete(contentReviewLocks).where(eq(contentReviewLocks.sessionId, sessionId));
  await getDb().update(reviewSessions).set({ status: "cancelled", updatedAt: now }).where(eq(reviewSessions.id, sessionId));
  await writeAudit(request, { userId: auth.user.id, action: "review.session_cancel", objectType: "review_session", objectId: String(sessionId) });
  return Response.json({ ok: true });
}
