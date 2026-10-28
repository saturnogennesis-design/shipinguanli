import { and, asc, eq, inArray, isNull, lt,ne,sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contentReviewLocks, contentVersions, contents, productMasters, products, users } from "@/db/schema";
import { groupScopeIds,hasGroupScope,hasPermission, requireUser } from "@/lib/server-auth";
import { syncProductMasterCatalog } from "@/lib/product-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "review.process")) return Response.json({ error: "没有查看待审核内容的权限" }, { status: 403 });
  const db = getDb();
  await syncProductMasterCatalog();
  const now = new Date().toISOString();
  const expiredLocks = await db.select({ id: contentReviewLocks.id, contentId: contentReviewLocks.contentId }).from(contentReviewLocks).where(lt(contentReviewLocks.expiresAt, now));
  for (const lock of expiredLocks) {
    await db.delete(contentReviewLocks).where(eq(contentReviewLocks.id, lock.id));
    await db.update(contents).set({ reviewStatus: "pending", updatedAt: now }).where(and(eq(contents.id, lock.contentId), eq(contents.reviewStatus, "reviewing")));
    await db.update(contentVersions).set({reviewStatus:"pending",updatedAt:now}).where(eq(contentVersions.contentId,lock.contentId));
  }
  const requestedStatus = new URL(request.url).searchParams.get("status") ?? "pending";
  const statuses = requestedStatus === "all" ? ["pending", "reviewing"] : requestedStatus === "reviewing" ? ["reviewing"] : ["pending"];
  const requestedGroup=new URL(request.url).searchParams.get("group");
  const reviewGroups=groupScopeIds(auth.user,"review");if(!reviewGroups.length&&auth.user.primaryGroupId)reviewGroups.push(auth.user.primaryGroupId);
  const groupCondition=auth.user.roleCode==="super_admin"?requestedGroup&&requestedGroup!=="all"?eq(contents.groupId,Number(requestedGroup)):sql`1=1`:requestedGroup&&requestedGroup!=="all"?hasGroupScope(auth.user,"review",Number(requestedGroup))?eq(contents.groupId,Number(requestedGroup)):sql`0=1`:reviewGroups.length?inArray(contents.groupId,reviewGroups):sql`0=1`;
  const rows = await db.select({
    id: contents.id, code: contents.code, title: contents.title, contentType: contents.contentType,
    reviewStatus: contents.reviewStatus, uploaderUserId:contents.uploaderUserId, contentColor:users.contentColor, uploaderName: users.displayName, productMasterId:contents.productMasterId, productName: sql<string|null>`coalesce(${productMasters.name},${products.name})`, productMasterImagePath:productMasters.imageStoragePath, productMasterStatus:productMasters.status,
    versionNumber: contents.latestVersionNumber, versionId: contentVersions.id, fileName: contentVersions.fileName,
    fileSize: contentVersions.fileSize, updatedAt: contents.updatedAt,reviewSubmittedAt:contents.reviewSubmittedAt,
  }).from(contents)
    .innerJoin(users, eq(contents.uploaderUserId, users.id))
    .leftJoin(products, eq(contents.productId, products.id))
    .leftJoin(productMasters, eq(contents.productMasterId, productMasters.id))
    .innerJoin(contentVersions, and(eq(contentVersions.contentId, contents.id), eq(contentVersions.versionNumber, contents.latestVersionNumber), eq(contentVersions.uploadStatus, "complete"), isNull(contentVersions.deletedAt)))
    .where(and(eq(contents.accountId,auth.user.projectId!),inArray(contents.reviewStatus, statuses),groupCondition,auth.user.roleCode==="super_admin"?undefined:ne(contents.uploaderUserId,auth.user.id), isNull(contents.deletedAt),isNull(contents.archivedAt)))
    .orderBy(asc(contents.reviewSubmittedAt), asc(contents.id)).limit(500);
  const productNames=[...new Set(rows.map((row)=>row.productName).filter((name):name is string=>Boolean(name)))];
  const masters=productNames.length?await db.select({id:productMasters.id,name:productMasters.name,imageStoragePath:productMasters.imageStoragePath}).from(productMasters).where(and(inArray(productMasters.name,productNames),eq(productMasters.status,"active"))).orderBy(asc(productMasters.id)):[];
  const productImages=new Map<string,string>();for(const item of masters)if(item.imageStoragePath&&!productImages.has(item.name))productImages.set(item.name,`/api/product-masters/${item.id}/image`);
  const reviewingIds = rows.filter((row) => row.reviewStatus === "reviewing").map((row) => row.id);
  const locks = reviewingIds.length
    ? await db.select({ contentId: contentReviewLocks.contentId, reviewerUserId: contentReviewLocks.reviewerUserId }).from(contentReviewLocks).where(inArray(contentReviewLocks.contentId, reviewingIds))
    : [];
  const reviewerIds = [...new Set(locks.map((lock) => lock.reviewerUserId))];
  const reviewers = reviewerIds.length
    ? await db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, reviewerIds))
    : [];
  const reviewerNames = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.displayName]));
  const lockOwners = new Map(locks.map((lock) => [lock.contentId, reviewerNames.get(lock.reviewerUserId) ?? "审核人员"]));
  return Response.json({ snapshotAt: new Date().toISOString(),canProcess:hasPermission(auth.user,"review.process"), contents: rows.map((row) => ({ ...row, productImageUrl:row.productMasterId&&row.productMasterStatus==="active"&&row.productMasterImagePath?`/api/product-masters/${row.productMasterId}/image`:row.productMasterId?null:row.productName?productImages.get(row.productName)??null:null, lockOwner: lockOwners.get(row.id) ?? null })) });
}
