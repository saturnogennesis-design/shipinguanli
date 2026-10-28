import { and, asc, desc, eq, gt, inArray, isNull, lt,ne,sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contentReviewLocks, contentVersions, contents, reviewQueueItems, reviewSessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { groupScopeIds,hasPermission, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "review.process")) return Response.json({ error: "没有查看审核队列的权限" }, { status: 403 });
  const [session] = await getDb().select().from(reviewSessions).where(and(eq(reviewSessions.reviewerUserId, auth.user.id), eq(reviewSessions.status, "active"), gt(reviewSessions.expiresAt, new Date().toISOString()))).orderBy(desc(reviewSessions.id)).limit(1);
  return Response.json({ session: session ?? null,canProcess:hasPermission(auth.user,"review.process") });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "review.process")) return Response.json({ error: "没有执行内容审核的权限" }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { contentCodes?: string[] };
  const db = getDb();
  const now = new Date().toISOString();
  const expired = await db.select({ id: contentReviewLocks.id, contentId: contentReviewLocks.contentId }).from(contentReviewLocks).where(lt(contentReviewLocks.expiresAt, now));
  for (const lock of expired) {
    await db.delete(contentReviewLocks).where(eq(contentReviewLocks.id, lock.id));
    await db.update(contents).set({ reviewStatus: "pending", updatedAt: now }).where(and(eq(contents.id, lock.contentId), eq(contents.reviewStatus, "reviewing")));
    await db.update(contentVersions).set({reviewStatus:"pending",updatedAt:now}).where(eq(contentVersions.contentId,lock.contentId));
  }
  const [activeSession] = await db.select({ id: reviewSessions.id }).from(reviewSessions).where(and(eq(reviewSessions.reviewerUserId, auth.user.id), eq(reviewSessions.status, "active"), gt(reviewSessions.expiresAt, now))).orderBy(desc(reviewSessions.id)).limit(1);
  if (activeSession) return Response.json({ error: "您已有未提交的审核队列，请先继续处理", sessionId: activeSession.id }, { status: 409 });
  const reviewGroups=groupScopeIds(auth.user,"review");if(!reviewGroups.length&&auth.user.primaryGroupId)reviewGroups.push(auth.user.primaryGroupId);
  const conditions = [eq(contents.reviewStatus, "pending"),isNull(contents.archivedAt), isNull(contents.deletedAt),auth.user.roleCode==="super_admin"?undefined:ne(contents.uploaderUserId,auth.user.id),auth.user.roleCode==="super_admin"?sql`1=1`:reviewGroups.length?inArray(contents.groupId,reviewGroups):sql`0=1`].filter(Boolean) as any[];
  if (payload.contentCodes?.length) conditions.push(inArray(contents.code, payload.contentCodes.slice(0, 100)));
  const candidates = await db.select({ contentId: contents.id, code: contents.code, versionId: contentVersions.id }).from(contents)
    .innerJoin(contentVersions, and(eq(contentVersions.contentId, contents.id), eq(contentVersions.versionNumber, contents.latestVersionNumber), eq(contentVersions.uploadStatus, "complete"), isNull(contentVersions.deletedAt)))
    .where(and(...conditions)).orderBy(asc(contents.reviewSubmittedAt),asc(contents.id)).limit(100);
  if (!candidates.length) return Response.json({ error: "当前没有可以领取的待审核内容" }, { status: 409 });
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const [session] = await db.insert(reviewSessions).values({ reviewerUserId: auth.user.id, expiresAt }).returning();
  const acquiredContentIds: number[] = [];
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      await db.insert(contentReviewLocks).values({ contentId: candidate.contentId, sessionId: session.id, reviewerUserId: auth.user.id, expiresAt });
      acquiredContentIds.push(candidate.contentId);
      await db.insert(reviewQueueItems).values({ sessionId: session.id, contentId: candidate.contentId, versionId: candidate.versionId, position: index + 1 });
      await db.update(contents).set({ reviewStatus: "reviewing", updatedAt: now }).where(eq(contents.id, candidate.contentId));
      await db.update(contentVersions).set({reviewStatus:"reviewing",updatedAt:now}).where(eq(contentVersions.id,candidate.versionId));
    }
  } catch (error) {
    console.error("review session acquisition failed",error);
    await db.delete(contentReviewLocks).where(eq(contentReviewLocks.sessionId, session.id));
    await db.delete(reviewQueueItems).where(eq(reviewQueueItems.sessionId, session.id));
    await db.update(reviewSessions).set({ status: "cancelled", updatedAt: now }).where(eq(reviewSessions.id, session.id));
    for (const contentId of acquiredContentIds) await db.update(contents).set({ reviewStatus: "pending", updatedAt: now }).where(and(eq(contents.id, contentId), eq(contents.reviewStatus, "reviewing")));
    for (const contentId of acquiredContentIds) await db.update(contentVersions).set({reviewStatus:"pending",updatedAt:now}).where(eq(contentVersions.contentId,contentId));
    return Response.json({ error: "部分内容已被其他审核人员领取，请刷新后重试" }, { status: 409 });
  }
  await writeAudit(request, { userId: auth.user.id, action: "review.session_create", objectType: "review_session", objectId: String(session.id), details: { count: candidates.length } });
  return Response.json({ sessionId: session.id, count: candidates.length, expiresAt }, { status: 201 });
}
