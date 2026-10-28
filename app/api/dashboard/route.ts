import { and, asc, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contentReviewLocks,
  contentVersions,
  contents,
  noticeReceipts,
  notices,
  platformContents,
  products,
  reviewQueueItems,
  reviewSessions,
  reviews,
  users,
} from "@/db/schema";
import { groupScopeIds,hasPermission, requireUser } from "@/lib/server-auth";
import { materialAccountIds, publishingAccountIds } from "@/lib/v3-access";
import {contentVisibility} from "@/lib/content-access";

export const dynamic = "force-dynamic";

type ContentRow = {
  id: number;
  code: string;
  title: string;
  contentType: string;
  productName: string | null;
  productCode: string | null;
  uploaderUserId: number;
  uploaderName: string;
  visibility: string;
  reviewStatus: string;
  latestVersionNumber: number;
  businessActivityAt: string | null;
  reviewSubmittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function activityTime(item: ContentRow) {
  return item.businessActivityAt || item.updatedAt || item.createdAt;
}

function taskRank(item: ContentRow, userId: number) {
  if (item.uploaderUserId === userId && item.reviewStatus === "rejected") return 0;
  if (item.uploaderUserId === userId && item.reviewStatus === "draft") return 1;
  if (item.uploaderUserId === userId) return 2;
  return 3;
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  const db = getDb();
  const canReview = hasPermission(auth.user, "review.process");
  const canProcessReview = hasPermission(auth.user, "review.process");
  const visible = and(contentVisibility(auth.user),isNull(contents.archivedAt));
  const contentRows: ContentRow[] = await db
    .select({
      id: contents.id,
      code: contents.code,
      title: contents.title,
      contentType: contents.contentType,
      productName: products.name,
      productCode: products.code,
      uploaderUserId: contents.uploaderUserId,
      uploaderName: users.displayName,
      contentColor:users.contentColor,
      visibility: contents.visibility,
      reviewStatus: contents.reviewStatus,
      latestVersionNumber: contents.latestVersionNumber,
      businessActivityAt: contents.businessActivityAt,
      reviewSubmittedAt: contents.reviewSubmittedAt,
      createdAt: contents.createdAt,
      updatedAt: contents.updatedAt,
    })
    .from(contents)
    .innerJoin(users, eq(contents.uploaderUserId, users.id))
    .leftJoin(products, eq(contents.productId, products.id))
    .where(visible);

  const contentIds = contentRows.map((item) => item.id);
  const idSet = new Set(contentIds);
  const contentTasks = [...contentRows]
    .sort((left, right) => {
      const rankDifference = taskRank(left, auth.user.id) - taskRank(right, auth.user.id);
      if (rankDifference) return rankDifference;
      const oldestFirst = taskRank(left, auth.user.id) <= 1;
      const comparison = activityTime(left).localeCompare(activityTime(right));
      return oldestFirst ? comparison : -comparison;
    })
    .slice(0, 10)
    .map((item) => ({ ...item, activityAt: activityTime(item), taskPriority: taskRank(item, auth.user.id) }));

  const assignmentRows = contentIds.length
    ? (
        await db
          .select({
            sourceContentId: platformContents.sourceContentId,
            publishStatus: platformContents.publishStatus,
            publishedAt: platformContents.publishedAt,
            deletedAt: platformContents.deletedAt,
          })
          .from(platformContents)
      ).filter((item) => idSet.has(item.sourceContentId) && !item.deletedAt)
    : [];
  const publishedSources = new Set(
    assignmentRows.filter((item) => item.publishStatus === "published").map((item) => item.sourceContentId),
  );
  const pendingPublishSources = new Set(
    contentRows
      .filter((item) => item.reviewStatus === "approved" && !publishedSources.has(item.id))
      .map((item) => item.id),
  );
  for (const item of assignmentRows) if (item.publishStatus !== "published") pendingPublishSources.add(item.sourceContentId);

  const now = new Date();
  const nowIso = now.toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - 6);
  weekStart.setUTCHours(0, 0, 0, 0);
  const statusCounts = Object.fromEntries(
    ["draft", "pending", "reviewing", "approved", "rejected"].map((status) => [
      status,
      contentRows.filter((item) => item.reviewStatus === status).length,
    ]),
  );

  let reviewTasks: Array<Record<string, unknown>> = [];
  if (canReview) {
    const reviewGroups=groupScopeIds(auth.user,"review");if(!reviewGroups.length&&auth.user.primaryGroupId)reviewGroups.push(auth.user.primaryGroupId);
    const reviewScope=auth.user.roleCode==="super_admin"?sql`1=1`:reviewGroups.length?inArray(contents.groupId,reviewGroups):sql`0=1`;
    const reviewRows = await db
      .select({
        id: contents.id,
        code: contents.code,
        title: contents.title,
        contentType: contents.contentType,
        uploaderName: users.displayName,
        uploaderUserId:contents.uploaderUserId,contentColor:users.contentColor,
        reviewStatus: contents.reviewStatus,
        versionNumber: contents.latestVersionNumber,
        reviewSubmittedAt: contents.reviewSubmittedAt,
        createdAt: contents.createdAt,
      })
      .from(contents)
      .innerJoin(users, eq(contents.uploaderUserId, users.id))
      .where(and(inArray(contents.reviewStatus, ["pending", "reviewing"]),reviewScope,auth.user.roleCode==="super_admin"?undefined:ne(contents.uploaderUserId,auth.user.id), and(isNull(contents.deletedAt),isNull(contents.archivedAt))));
    const reviewIds = reviewRows.map((item) => item.id);
    const activeLocks = reviewIds.length
      ? await db
          .select({ contentId: contentReviewLocks.contentId, reviewerUserId: contentReviewLocks.reviewerUserId })
          .from(contentReviewLocks)
          .where(and(inArray(contentReviewLocks.contentId, reviewIds), gt(contentReviewLocks.expiresAt, nowIso)))
      : [];
    const lockByContent = new Map(activeLocks.map((item) => [item.contentId, item.reviewerUserId]));
    const [activeSession] = await db
      .select({ id: reviewSessions.id })
      .from(reviewSessions)
      .where(
        and(
          eq(reviewSessions.reviewerUserId, auth.user.id),
          eq(reviewSessions.status, "active"),
          gt(reviewSessions.expiresAt, nowIso),
        ),
      )
      .orderBy(desc(reviewSessions.id))
      .limit(1);
    const queued = activeSession
      ? await db
          .select({ contentId: reviewQueueItems.contentId, position: reviewQueueItems.position })
          .from(reviewQueueItems)
          .where(and(eq(reviewQueueItems.sessionId, activeSession.id), isNull(reviewQueueItems.removedAt)))
          .orderBy(asc(reviewQueueItems.position))
      : [];
    const queuePosition = new Map(queued.map((item) => [item.contentId, item.position]));
    reviewTasks = reviewRows
      .map((item) => {
        const queuedPosition = queuePosition.get(item.id);
        const lockedByCurrent = lockByContent.get(item.id) === auth.user.id;
        const priority = queuedPosition !== undefined ? 0 : lockedByCurrent ? 1 : 2;
        const submittedAt = item.reviewSubmittedAt || item.createdAt;
        const waitingHours = Math.max(0, Math.floor((now.getTime() - new Date(submittedAt).getTime()) / 3600000));
        return { ...item, priority, queuePosition: queuedPosition ?? null, lockedByCurrent, submittedAt, waitingHours };
      })
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority;
        if (left.priority === 0) return Number(left.queuePosition ?? 0) - Number(right.queuePosition ?? 0);
        return String(left.submittedAt).localeCompare(String(right.submittedAt));
      })
      .slice(0, 10);
  }

  const recommendationScope=auth.user.roleCode==="super_admin"
    ? sql`1=1`
    : auth.user.primaryGroupId
      ? eq(contents.groupId,auth.user.primaryGroupId)
      : eq(contents.uploaderUserId,auth.user.id);
  const recommendationRows=await db.select({
    id:contents.id,code:contents.code,title:contents.title,contentType:contents.contentType,
    productName:products.name,productCode:products.code,uploaderUserId:contents.uploaderUserId,
    uploaderName:users.displayName,contentColor:users.contentColor,visibility:contents.visibility,
    reviewStatus:contents.reviewStatus,latestVersionNumber:contents.latestVersionNumber,
    businessActivityAt:contents.businessActivityAt,reviewSubmittedAt:contents.reviewSubmittedAt,
    createdAt:contents.createdAt,updatedAt:contents.updatedAt,versionId:contentVersions.id,
    versionNumber:contentVersions.versionNumber,decision:reviews.decision,comment:reviews.comment,
    recommendedAt:reviews.createdAt,recommenderUserId:reviews.reviewerUserId,
  }).from(reviews)
    .innerJoin(contentVersions,eq(contentVersions.id,reviews.versionId))
    .innerJoin(contents,eq(contents.id,reviews.contentId))
    .innerJoin(users,eq(users.id,contents.uploaderUserId))
    .leftJoin(products,eq(products.id,contents.productId))
    .where(and(recommendationScope,eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt),isNull(contentVersions.deletedAt),isNull(contents.deletedAt),isNull(contents.archivedAt)))
    .orderBy(desc(reviews.createdAt),desc(reviews.id)).limit(200);
  const recommenderIds=[...new Set(recommendationRows.map(row=>row.recommenderUserId))];
  const recommenderRows=recommenderIds.length?await db.select({id:users.id,name:users.displayName}).from(users).where(inArray(users.id,recommenderIds)):[];
  const recommenderNames=new Map(recommenderRows.map(row=>[row.id,row.name]));
  const featured=recommendationRows.map(row=>({
    id:row.id,code:row.code,title:row.title,contentType:row.contentType,productName:row.productName,productCode:row.productCode,
    uploaderUserId:row.uploaderUserId,uploaderName:row.uploaderName,contentColor:row.contentColor,visibility:row.visibility,
    reviewStatus:row.reviewStatus,latestVersionNumber:row.latestVersionNumber,businessActivityAt:row.businessActivityAt,
    reviewSubmittedAt:row.reviewSubmittedAt,createdAt:row.createdAt,updatedAt:row.updatedAt,featured:true,
    featuredReason:row.comment,featuredAt:row.recommendedAt,recommendationDecision:row.decision,
    recommenderName:recommenderNames.get(row.recommenderUserId)??"审核人员",recommendedVersionId:row.versionId,recommendedVersionNumber:row.versionNumber,
  }));
  const [materialAccounts,publishingAccounts]=await Promise.all([materialAccountIds(auth.user,"view"),publishingAccountIds(auth.user)]);
  const hasContentRange=auth.user.roleCode==="super_admin"||Boolean(auth.user.primaryGroupId)||Object.values(auth.user.groupScopes).some(ids=>ids.length>0)||contentRows.some(item=>item.uploaderUserId===auth.user.id);
  const hasReviewRange=auth.user.roleCode==="super_admin"||Boolean(auth.user.primaryGroupId)||groupScopeIds(auth.user,"review").length>0;
  const moduleAccess:Record<string,boolean>={
    "内容池":hasPermission(auth.user,"content.view")&&hasContentRange,
    "审核中心":hasPermission(auth.user,"review.process")&&hasReviewRange,
    "发布管理":hasPermission(auth.user,"publishing.view")&&publishingAccounts.length>0,
    "版本管理":hasPermission(auth.user,"version.view")&&hasContentRange,
    "素材中心":hasPermission(auth.user,"asset.view")&&materialAccounts.length>0,
  };
  let noticeTasks:Array<Record<string,unknown>>=[];
  if(hasPermission(auth.user,"notice.view")){
    const rows=await db.select({id:notices.id,title:notices.title,body:notices.body,requiresReply:notices.requiresReply,createdAt:notices.createdAt,authorUserId:notices.authorUserId,authorName:users.displayName,contentColor:users.contentColor,readAt:noticeReceipts.readAt,
      replied:sql<number>`EXISTS (SELECT 1 FROM notice_replies rp WHERE rp.notice_id=${notices.id} AND rp.user_id=${auth.user.id})`,
      attachmentCount:sql<number>`(SELECT count(*) FROM notice_attachments na WHERE na.notice_id=${notices.id} AND na.upload_status='complete')`,
    }).from(noticeReceipts).innerJoin(notices,eq(notices.id,noticeReceipts.noticeId)).innerJoin(users,eq(users.id,notices.authorUserId)).where(and(eq(noticeReceipts.userId,auth.user.id),eq(notices.publishStatus,"published")));
    noticeTasks=rows.filter(item=>item.requiresReply?!item.replied:!item.readAt).sort((left,right)=>{const leftRank=left.requiresReply?(left.readAt?0:1):2,rightRank=right.requiresReply?(right.readAt?0:1):2;if(leftRank!==rightRank)return leftRank-rightRank;return leftRank<2?left.createdAt.localeCompare(right.createdAt):right.createdAt.localeCompare(left.createdAt);}).slice(0,5).map(item=>({...item,actionRequired:true,statusText:item.requiresReply?(item.readAt?"已读待回复":"未读需回复"):"未读"}));
  }

  return Response.json({
    user: {
      id: auth.user.id,
      displayName: auth.user.displayName,
      roleName: auth.user.roleName,
      roleCode: auth.user.roleCode,
      dataScope: auth.user.dataScope,
      permissions: auth.user.permissions,
      deniedPermissions:auth.user.deniedPermissions,
      moduleAccess,
      canReview,
      canProcessReview,
    },
    summary: {
      pendingReview: canReview ? statusCounts.pending ?? 0 : 0,
      reviewing: canReview ? statusCounts.reviewing ?? 0 : 0,
      pendingPublish: pendingPublishSources.size,
      publishedThisMonth: assignmentRows.filter(
        (item) => item.publishStatus === "published" && String(item.publishedAt ?? "") >= monthStart,
      ).length,
      publishedThisWeek: assignmentRows.filter(
        (item) => item.publishStatus === "published" && String(item.publishedAt ?? "") >= weekStart.toISOString(),
      ).length,
      totalAssets: contentRows.length,
      videoAssets: contentRows.filter((item) => item.contentType === "video").length,
      imageTextAssets: contentRows.filter((item) => item.contentType === "image_text").length,
      privateAssets: contentRows.filter((item) => item.visibility === "private").length,
      approved: statusCounts.approved ?? 0,
    },
    statusCounts,
    contentTasks,
    recent: contentTasks,
    reviewTasks,
    noticeTasks,
    featured,
    checkedAt: nowIso,
  });
}
