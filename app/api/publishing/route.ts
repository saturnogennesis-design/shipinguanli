import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contentVersions, contents, platformContents, platforms, productMasters, products, publicationCopies, shortVideoAccounts, users } from "@/db/schema";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { publishingAccountIds } from "@/lib/v3-access";
import { syncProductMasterCatalog } from "@/lib/product-catalog";

export const dynamic = "force-dynamic";

function parseTopics(value: string | null) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [] as string[];
  }
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "publishing.view")) return Response.json({ error: "没有查看发布管理的权限" }, { status: 403 });

  const db = getDb();
  await syncProductMasterCatalog();
  const accountIds=await publishingAccountIds(auth.user);
  if(!accountIds.length)return Response.json({contents:[],options:{platforms:[],accounts:[],products:[]},emptyReason:"no_publishing_accounts",emptyMessage:"当前账号还没有配置负责发布的短视频账号，请由管理员在员工职责中设置发布运营范围。"});
  const sourceRows = await db.select({
    id: contents.id, code: contents.code, title: contents.title, contentType: contents.contentType,
    productId: contents.productId, productMasterId: contents.productMasterId, productName: sql<string|null>`coalesce(${productMasters.name},${products.name})`, productCode: products.code, productMasterImagePath: productMasters.imageStoragePath, productMasterStatus: productMasters.status,
    uploaderName: users.displayName, uploaderUserId:users.id, contentColor:users.contentColor, versionNumber: contents.latestVersionNumber,
    versionId: contentVersions.id, fileName: contentVersions.fileName, fileSize: contentVersions.fileSize, approvedAt: contents.updatedAt,
  }).from(contents)
    .innerJoin(users, eq(contents.uploaderUserId, users.id))
    .leftJoin(products, eq(contents.productId, products.id))
    .leftJoin(productMasters, eq(contents.productMasterId, productMasters.id))
    .innerJoin(contentVersions, and(eq(contentVersions.contentId, contents.id), eq(contentVersions.versionNumber, contents.latestVersionNumber), eq(contentVersions.uploadStatus, "complete"), isNull(contentVersions.deletedAt)))
    .where(and(inArray(contents.accountId,accountIds),eq(contents.reviewStatus, "approved"),isNull(contents.deletedAt),isNull(contents.archivedAt)))
    .orderBy(desc(contents.updatedAt), desc(contents.id)).limit(500);

  const sourceIds = sourceRows.map((row) => row.id);
  const assignmentRows = sourceIds.length ? await db.select({
    id: platformContents.id, sourceContentId: platformContents.sourceContentId,
    platformId: platforms.id, platformCode: platforms.code, platformName: platforms.name,
    accountId: shortVideoAccounts.id, accountName: shortVideoAccounts.name,
    productMasterId: platformContents.productMasterId, publishStatus: platformContents.publishStatus,
    publishedAt: platformContents.publishedAt, handlerUserId:platformContents.handlerUserId,handlingStartedAt:platformContents.handlingStartedAt,rowVersion:platformContents.rowVersion,copyTitle: publicationCopies.title,
    copyBody: publicationCopies.body, topicsJson: publicationCopies.topicsJson,
  }).from(platformContents)
    .innerJoin(platforms, eq(platformContents.platformId, platforms.id))
    .leftJoin(shortVideoAccounts, eq(platformContents.accountId, shortVideoAccounts.id))
    .leftJoin(publicationCopies, eq(publicationCopies.platformContentId, platformContents.id))
    .where(and(inArray(platformContents.sourceContentId, sourceIds), isNull(platformContents.deletedAt)))
    .orderBy(asc(platforms.sortOrder), asc(platforms.id)) : [];

  const platformOptions = await db.select({ id: platforms.id, code: platforms.code, name: platforms.name, iconStoragePath: platforms.iconStoragePath, sortOrder: platforms.sortOrder, status: platforms.status }).from(platforms).orderBy(asc(platforms.sortOrder), asc(platforms.id));
  const accountOptions = await db.select({ id: shortVideoAccounts.id, platformId: shortVideoAccounts.platformId, code: shortVideoAccounts.code, name: shortVideoAccounts.name, status: shortVideoAccounts.status }).from(shortVideoAccounts).where(and(eq(shortVideoAccounts.status, "active"),inArray(shortVideoAccounts.id,accountIds))).orderBy(asc(shortVideoAccounts.name));
  const productOptions = await db.select({ id: productMasters.id, name: productMasters.name, status: productMasters.status, imageStoragePath: productMasters.imageStoragePath }).from(productMasters).orderBy(asc(productMasters.name));
  const productNames=[...new Set([...sourceRows.map((row)=>row.productName),...productOptions.map((row)=>row.name)].filter((name):name is string=>Boolean(name)))];
  const masterRows=productNames.length?await db.select({id:productMasters.id,name:productMasters.name,imageStoragePath:productMasters.imageStoragePath}).from(productMasters).where(and(inArray(productMasters.name,productNames),eq(productMasters.status,"active"))).orderBy(asc(productMasters.id)):[];
  const masterByName=new Map<string,string>();
  for(const item of masterRows)if(item.imageStoragePath&&!masterByName.has(item.name))masterByName.set(item.name,`/api/product-masters/${item.id}/image`);

  const assignmentsByContent = new Map<number, typeof assignmentRows>();
  for (const assignment of assignmentRows) {
    const current = assignmentsByContent.get(assignment.sourceContentId) ?? [];
    current.push(assignment); assignmentsByContent.set(assignment.sourceContentId, current);
  }
  return Response.json({
    currentUserId:auth.user.id,
    contents: sourceRows.map((row) => ({
      ...row,
      productImageUrl: row.productMasterId&&row.productMasterStatus==="active"&&row.productMasterImagePath ? `/api/product-masters/${row.productMasterId}/image` : row.productMasterId ? null : row.productName ? masterByName.get(row.productName) ?? null : null,
      coverUrl: row.versionId ? `/api/content-versions/${row.versionId}/cover` : null,
      assignments: (assignmentsByContent.get(row.id) ?? []).map((assignment) => ({
        id: assignment.id, platformId: assignment.platformId, platformCode: assignment.platformCode,
        platformName: assignment.platformName, accountId: assignment.accountId, accountName: assignment.accountName,
        productMasterId: assignment.productMasterId, publishStatus: assignment.publishStatus, publishedAt: assignment.publishedAt,handlerUserId:assignment.handlerUserId,handlingStartedAt:assignment.handlingStartedAt,rowVersion:assignment.rowVersion,
        copy: { title: assignment.copyTitle ?? "", body: assignment.copyBody ?? "", topics: parseTopics(assignment.topicsJson) },
      })),
    })),
    options: { platforms: platformOptions, accounts: accountOptions, products: productOptions.map(item=>({id:item.id,name:item.name,status:item.status,imageUrl:item.imageStoragePath?`/api/product-masters/${item.id}/image`:null})) },
  });
}
