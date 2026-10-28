import { and, asc, desc, eq, gte,gt,inArray, isNull,like,lt,lte,ne,not, or,sql,type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { contentGroups, contentVersionFiles, contentVersions, contents, productMasters, products, reviews, shortVideoAccounts, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hasGroupScope, hasPermission, requireUser } from "@/lib/server-auth";
import { randomToken } from "@/lib/security";
import { syncProductMasterCatalog } from "@/lib/product-catalog";

type CreateItem = {
  title?: string;
  contentType?: "video" | "image_text";
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  durationSeconds?: number | null;
  productId?: number | null;
  productMasterId?: number | null;
  accountId?: number | null;
  visibility?: "private" | "public";
  remark?: string;
  groupId?: number | null;
  files?: { fileName?: string; mimeType?: string; fileSize?: number; durationSeconds?: number | null }[];
};

function safeFileName(value: string) {
  return value.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "file";
}

function codeFor(index: number) {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `CNT-${date}-${randomToken(4).toUpperCase()}-${String(index + 1).padStart(2, "0")}`;
}

function fileKind(fileName: string, mimeType = "") {
  if (mimeType.startsWith("video/") || /\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(fileName)) return "video";
  if (mimeType.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(fileName)) return "image";
  return "unknown";
}

export const dynamic = "force-dynamic";

type FilterRule={join?:"and"|"or"|"exclude";field:string;operator:string;value:unknown};
function parseRules(value:string|null){try{return (JSON.parse(value??"[]") as FilterRule[]).filter((rule)=>rule&&typeof rule.field==="string").slice(0,30);}catch{return [] as FilterRule[];}}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user,"content.view")) return Response.json({error:"没有查看内容池的权限"},{status:403});
  const db = getDb();
  await syncProductMasterCatalog();
  const params=new URL(request.url).searchParams;const page=Math.max(1,Number(params.get("page"))||1);const pageSize=[20,50,100].includes(Number(params.get("pageSize")))?Number(params.get("pageSize")):50;
  const visible = contentVisibility(auth.user);
  const conditions:SQL[]=[visible,params.get("archived")==="true"?sql`${contents.archivedAt} is not null`:isNull(contents.archivedAt)];const requestedGroup=params.get("group");if(requestedGroup==="mine")conditions.push(eq(contents.uploaderUserId,auth.user.id));else if(requestedGroup&&requestedGroup!=="all"){const groupId=Number(requestedGroup);if(!Number.isSafeInteger(groupId)||!hasGroupScope(auth.user,"view",groupId))return Response.json({error:"没有查看该小组内容的权限"},{status:403});conditions.push(eq(contents.groupId,groupId));}const code=params.get("code")?.trim();if(code)conditions.push(eq(contents.code,code));const query=params.get("q")?.trim();if(query)conditions.push(or(like(contents.title,`%${query}%`),like(contents.code,`%${query}%`),like(products.name,`%${query}%`),like(productMasters.name,`%${query}%`),like(shortVideoAccounts.name,`%${query}%`),like(users.displayName,`%${query}%`))!);const status=params.get("status");if(status&&status!=="all")conditions.push(eq(contents.reviewStatus,status));const contentType=params.get("type");if(contentType&&contentType!=="all")conditions.push(eq(contents.contentType,contentType));const visibility=params.get("visibility");if(visibility&&visibility!=="all")conditions.push(eq(contents.visibility,visibility));const owner=params.get("owner");if(owner)conditions.push(eq(users.displayName,owner));const product=params.get("product");if(product)conditions.push(or(eq(products.name,product),eq(productMasters.name,product))!);const account=params.get("account");if(account)conditions.push(eq(shortVideoAccounts.name,account));const createdFrom=params.get("createdFrom");if(createdFrom)conditions.push(gte(contents.createdAt,`${createdFrom} 00:00:00`));const createdTo=params.get("createdTo");if(createdTo)conditions.push(lte(contents.createdAt,`${createdTo} 23:59:59`));
  const localized:Record<string,Record<string,string>>={reviewStatus:{草稿:"draft",待审核:"pending",审核中:"reviewing",已通过:"approved",已驳回:"rejected"},contentType:{视频:"video",图文:"image_text"},visibility:{仅本人和管理员:"private",全部可见:"public"}};
  const rules=parseRules(params.get("rules"));
  const rulePredicate=(rule:FilterRule):SQL|undefined=>{const raw=String(rule.value??"");let value=localized[rule.field]?.[raw]??raw;if(rule.field==="version")value=value.replace(/^v/i,"");const computed=({recommended:sql<number>`exists(select 1 from reviews filter_reviews where filter_reviews.version_id = ${contentVersions.id} and filter_reviews.recommended = 1 and filter_reviews.recommendation_removed_at is null)`,imageCount:sql<number>`(select count(*) from content_version_files filter_files where filter_files.version_id = ${contentVersions.id} and filter_files.draft_edit_token is null)`} as Record<string,SQL>);const column=({reviewStatus:contents.reviewStatus,contentType:contents.contentType,owner:users.displayName,group:contentGroups.name,product:sql<string>`coalesce(${productMasters.name},${products.name})`,account:shortVideoAccounts.name,visibility:contents.visibility,createdAt:contents.createdAt,fileSize:contentVersions.fileSize,duration:contentVersions.durationSeconds,version:contents.latestVersionNumber,...computed} as Record<string,any>)[rule.field];if(rule.field==="query"){const match=or(like(contents.title,`%${value}%`),like(contents.code,`%${value}%`),like(products.name,`%${value}%`),like(productMasters.name,`%${value}%`),like(shortVideoAccounts.name,`%${value}%`),like(users.displayName,`%${value}%`))!;return rule.operator==="not_contains"?not(match):match;}if(!column)return undefined;if(rule.field==="recommended")value=["是","true","1"].includes(value.toLowerCase())?"1":"0";if(rule.operator==="empty")return or(isNull(column),eq(column,""))!;if(rule.operator==="not_empty")return not(or(isNull(column),eq(column,""))!);if(rule.operator==="contains")return like(column,`%${value}%`);if(rule.operator==="not_contains")return not(like(column,`%${value}%`));if(rule.operator==="neq")return ne(column,value as never);if(rule.operator==="after")return gte(column,`${value} 00:00:00` as never);if(rule.operator==="before")return lte(column,`${value} 23:59:59` as never);if(rule.operator==="gt")return gt(column,value as never);if(rule.operator==="gte")return gte(column,value as never);if(rule.operator==="lt")return lt(column,value as never);if(rule.operator==="lte")return lte(column,value as never);if(rule.field==="createdAt"&&rule.operator==="eq"){const start=new Date(`${value}T00:00:00.000Z`);if(Number.isNaN(start.getTime()))return undefined;const endDay=new Date(start.getTime()+86400000).toISOString().slice(0,10);return and(gte(column,`${value} 00:00:00`),lt(column,`${endDay} 00:00:00`))!;}return eq(column,value as never);};
  const andRules:SQL[]=[],orRules:SQL[]=[],excludeRules:SQL[]=[];for(const rule of rules){const predicate=rulePredicate(rule);if(!predicate)continue;if(rule.join==="or")orRules.push(predicate);else if(rule.join==="exclude")excludeRules.push(predicate);else andRules.push(predicate);}conditions.push(...andRules);if(orRules.length)conditions.push(or(...orRules)!);conditions.push(...excludeRules.map((item)=>not(item)));
  const recommendedFilter=params.get("recommended");if(recommendedFilter==="true"){const recommendedContentRows=await db.select({contentId:contents.id}).from(reviews).innerJoin(contentVersions,eq(reviews.versionId,contentVersions.id)).innerJoin(contents,and(eq(contentVersions.contentId,contents.id),eq(contentVersions.versionNumber,contents.latestVersionNumber))).where(and(eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt)));const ids=[...new Set(recommendedContentRows.map((item)=>item.contentId))];if(!ids.length)return Response.json({contents:[],pagination:{page,pageSize,total:0,totalPages:0},currentUserId:auth.user.id,canRecommend:hasPermission(auth.user,"review.recommend"),canFeature:hasPermission(auth.user,"content.feature")});conditions.push(inArray(contents.id,ids));}
  const where=and(...conditions);const [countRow]=await db.select({total:sql<number>`count(distinct ${contents.id})`}).from(contents).innerJoin(users,eq(contents.uploaderUserId,users.id)).leftJoin(products,eq(contents.productId,products.id)).leftJoin(productMasters,eq(contents.productMasterId,productMasters.id)).leftJoin(shortVideoAccounts,eq(contents.accountId,shortVideoAccounts.id)).leftJoin(contentVersions,and(eq(contentVersions.contentId,contents.id),eq(contentVersions.versionNumber,contents.latestVersionNumber),isNull(contentVersions.deletedAt))).where(where);
  const rowsQuery = () => db.select({
    id: contents.id,
    code: contents.code,
    title: contents.title,
    contentType: contents.contentType,
    productId: contents.productId,
    productMasterId: contents.productMasterId,
    productName: sql<string|null>`coalesce(${productMasters.name},${products.name})`,
    productMasterImagePath: productMasters.imageStoragePath,
    productMasterStatus: productMasters.status,
    accountId: contents.accountId,
    accountName: shortVideoAccounts.name,
    uploaderUserId: contents.uploaderUserId,
    uploaderName: users.displayName,
    groupId:contents.groupId,
    groupName:contentGroups.name,
    contentColor:users.contentColor,
    archivedAt:contents.archivedAt,
    archiveReason:contents.archiveReason,
    reviewSubmittedAt:contents.reviewSubmittedAt,
    visibility: contents.visibility,
    remark: contents.remark,
    reviewStatus: contents.reviewStatus,
    latestVersionNumber: contents.latestVersionNumber,
    featured: contents.featured,
    featuredReason: contents.featuredReason,
    featuredTagsJson: contents.featuredTagsJson,
    featuredAt: contents.featuredAt,
    businessActivityAt:contents.businessActivityAt,
    updatedAt: contents.updatedAt,
    createdAt: contents.createdAt,
    versionId: contentVersions.id,
    fileName: contentVersions.fileName,
    fileSize: contentVersions.fileSize,
    durationSeconds: contentVersions.durationSeconds,
    mimeType: contentVersions.mimeType,
    uploadStatus: contentVersions.uploadStatus,
  }).from(contents)
    .innerJoin(users, eq(contents.uploaderUserId, users.id))
    .leftJoin(contentGroups,eq(contents.groupId,contentGroups.id))
    .leftJoin(products, eq(contents.productId, products.id))
    .leftJoin(productMasters, eq(contents.productMasterId, productMasters.id))
    .leftJoin(shortVideoAccounts, eq(contents.accountId, shortVideoAccounts.id))
    .leftJoin(contentVersions, and(eq(contentVersions.contentId, contents.id), eq(contentVersions.versionNumber, contents.latestVersionNumber), isNull(contentVersions.deletedAt)))
    .$dynamic();
  const lanes=[["draft"],["pending","reviewing"],["rejected"],["approved"]];
  let lanePages:number[]=[],lanePageSizes:number[]=[];
  try { lanePages=JSON.parse(params.get("lanePages")??"[]");lanePageSizes=JSON.parse(params.get("lanePageSizes")??"[]"); } catch {}
  const board=params.get("board")==="true" && !code;
  const orderNewest=params.get("sort")==="newest";
  const laneTotals=board ? await db.select({status:contents.reviewStatus,total:sql<number>`count(*)`}).from(contents).innerJoin(users,eq(contents.uploaderUserId,users.id)).leftJoin(products,eq(contents.productId,products.id)).leftJoin(productMasters,eq(contents.productMasterId,productMasters.id)).leftJoin(shortVideoAccounts,eq(contents.accountId,shortVideoAccounts.id)).leftJoin(contentVersions,and(eq(contentVersions.contentId,contents.id),eq(contentVersions.versionNumber,contents.latestVersionNumber),isNull(contentVersions.deletedAt))).where(where).groupBy(contents.reviewStatus) : [];
  const rows = board ? (await Promise.all(lanes.map((statuses,index)=>rowsQuery()
    .where(and(where,inArray(contents.reviewStatus,statuses)))
    .orderBy(...((index===1&&!orderNewest)||params.get("sort")==="oldest"?[sql`coalesce(${contents.reviewSubmittedAt},${contents.createdAt}) asc`,sql`${contents.id} asc`]:[desc(contents.businessActivityAt),desc(contents.id)]))
    .limit([20,50,100].includes(Number(lanePageSizes[index]))?Number(lanePageSizes[index]):20).offset((Math.max(1,Number(lanePages[index])||1)-1)*([20,50,100].includes(Number(lanePageSizes[index]))?Number(lanePageSizes[index]):20))))).flat()
    : await rowsQuery().where(where).orderBy(desc(contents.businessActivityAt),desc(contents.id)).limit(pageSize).offset((page-1)*pageSize);
  const versionIds=rows.map((row)=>row.versionId).filter((id):id is number=>id!==null);
  const imageFiles=versionIds.length?await db.select({versionId:contentVersionFiles.versionId}).from(contentVersionFiles).where(and(inArray(contentVersionFiles.versionId,versionIds),isNull(contentVersionFiles.draftEditToken))):[];
  const imageCounts=new Map<number,number>();
  for(const file of imageFiles)imageCounts.set(file.versionId,(imageCounts.get(file.versionId)??0)+1);
  const recommendedRows=versionIds.length?await db.select({id:reviews.id,versionId:reviews.versionId,decision:reviews.decision,comment:reviews.comment,recommendedAt:reviews.createdAt,recommenderName:users.displayName}).from(reviews).innerJoin(users,eq(reviews.reviewerUserId,users.id)).where(and(inArray(reviews.versionId,versionIds),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).orderBy(desc(reviews.createdAt),desc(reviews.id)):[];
  const recommendedByVersion=new Map<number,(typeof recommendedRows)[number]>();for(const review of recommendedRows)if(!recommendedByVersion.has(review.versionId))recommendedByVersion.set(review.versionId,review);
  const rejectedIds = rows.filter((row) => row.reviewStatus === "rejected").map((row) => row.id);
  const rejectionRows = rejectedIds.length ? await db.select({ contentId: reviews.contentId, comment: reviews.comment, createdAt: reviews.createdAt, id: reviews.id }).from(reviews).where(and(inArray(reviews.contentId, rejectedIds), eq(reviews.decision, "rejected"))).orderBy(desc(reviews.createdAt), desc(reviews.id)) : [];
  const latestRejections = new Map<number,{comment:string;createdAt:string}>();
  for (const review of rejectionRows) if (!latestRejections.has(review.contentId)) latestRejections.set(review.contentId, { comment: review.comment, createdAt: review.createdAt });
  const recentReviews=versionIds.length?await db.select({versionId:reviews.versionId,comment:reviews.comment}).from(reviews).where(inArray(reviews.versionId,versionIds)).orderBy(desc(reviews.createdAt),desc(reviews.id)):[];
  const commentByVersion=new Map<number,string>();for(const review of recentReviews)if(!commentByVersion.has(review.versionId))commentByVersion.set(review.versionId,review.comment);
  const total=Number(countRow?.total??0);
  const productNames=[...new Set(rows.map((row)=>row.productName).filter((name):name is string=>Boolean(name)))];
  const productImageRows=productNames.length?await db.select({id:productMasters.id,name:productMasters.name,imageStoragePath:productMasters.imageStoragePath}).from(productMasters).where(and(inArray(productMasters.name,productNames),eq(productMasters.status,"active"))).orderBy(asc(productMasters.id)):[];
  const productImageByName=new Map<string,string>();
  for(const item of productImageRows)if(item.imageStoragePath&&!productImageByName.has(item.name))productImageByName.set(item.name,`/api/product-masters/${item.id}/image`);
  return Response.json({
    contents:rows.map((row)=>{
      const recommendation=row.versionId?recommendedByVersion.get(row.versionId):undefined;
      return {...row,productImageUrl:row.productMasterId&&row.productMasterStatus==="active"&&row.productMasterImagePath?`/api/product-masters/${row.productMasterId}/image`:row.productMasterId?null:row.productName?productImageByName.get(row.productName)??null:null,reviewComment:row.versionId?commentByVersion.get(row.versionId)??"": "",recommended:Boolean(recommendation),recommendationDecision:recommendation?.decision??null,recommendationComment:recommendation?.comment??null,recommendedAt:recommendation?.recommendedAt??null,recommenderName:recommendation?.recommenderName??null,featured:Boolean(recommendation),featuredReason:recommendation?.comment??"",featuredTags:[],imageCount:row.versionId?imageCounts.get(row.versionId)??0:0,rejectionReason:latestRejections.get(row.id)?.comment??null,rejectedAt:latestRejections.get(row.id)?.createdAt??null};
    }),
    pagination:{page,pageSize,total,totalPages:Math.ceil(total/pageSize),laneTotals:lanes.map(statuses=>laneTotals.filter(row=>statuses.includes(row.status)).reduce((sum,row)=>sum+Number(row.total),0))},
    currentUserId:auth.user.id,
    canRecommend:hasPermission(auth.user,"review.recommend"),
    canFeature:hasPermission(auth.user,"content.feature"),
  });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user,"content.upload")) return Response.json({error:"没有上传新内容的权限"},{status:403});
  const payload = await request.json() as { items?: CreateItem[];groupId?:number|null };
  const items = payload.items ?? [];
  if (items.length < 1 || items.length > 20) return Response.json({ error: "每次必须创建1至20条内容" }, { status: 400 });
  const contentTypes = new Set(items.map((item) => item.contentType));
  if (contentTypes.size !== 1) return Response.json({ error: "图片和视频不能混合上传" }, { status: 400 });
  if (items[0]?.contentType === "image_text" && items.length !== 1) return Response.json({ error: "图文每次只能提交一套，一套图文只生成一条内容" }, { status: 400 });
  for (const item of items) {
    const files = item.files?.length ? item.files : [{ fileName:item.fileName, mimeType:item.mimeType, fileSize:item.fileSize }];
    if (!item.title?.trim() || files.some((file) => !file.fileName?.trim())) return Response.json({ error: "标题和文件不能为空" }, { status: 400 });
    if (item.contentType !== "video" && item.contentType !== "image_text") return Response.json({ error: "内容类型无效" }, { status: 400 });
    if (item.contentType === "video" && (files.length !== 1 || fileKind(files[0].fileName!, files[0].mimeType) !== "video")) return Response.json({ error: "视频批量上传中只能包含视频文件" }, { status: 400 });
    if (item.contentType === "image_text" && (files.length < 1 || files.length > 20 || files.some((file) => fileKind(file.fileName!, file.mimeType) !== "image"))) return Response.json({ error: "一套图文必须包含1至20张图片，不能混入视频" }, { status: 400 });
    if (files.some((file) => !Number.isSafeInteger(file.fileSize) || (file.fileSize ?? 0) < 1 || (file.fileSize ?? 0) > 5 * 1024 * 1024 * 1024)) return Response.json({ error: "单个文件大小必须在5GB以内" }, { status: 400 });
    const masterId=Number(item.productMasterId),legacyId=Number(item.productId);
    if ((!Number.isSafeInteger(masterId)||masterId<1)&&(!Number.isSafeInteger(legacyId)||legacyId<1)) return Response.json({ error: "请选择所属商品后再上传内容" }, { status: 400 });
  }

  const created = [];
  const db = getDb();
  const now=new Date().toISOString();
  const requestedGroupId=Number(payload.groupId??items[0]?.groupId??auth.user.primaryGroupId);
  if(!Number.isSafeInteger(requestedGroupId)||!hasGroupScope(auth.user,"upload",requestedGroupId))return Response.json({error:"请选择有上传权限的内容归属组"},{status:403});
  const [targetGroup]=await db.select({id:contentGroups.id,status:contentGroups.status,name:contentGroups.name,accountId:contentGroups.accountId}).from(contentGroups).where(eq(contentGroups.id,requestedGroupId)).limit(1);
  if(!targetGroup||targetGroup.status!=="active")return Response.json({error:"所选小组不存在或已停用"},{status:409});
  if(!targetGroup.accountId)return Response.json({error:"所选小组尚未归入短视频账号，请联系管理员完成配置"},{status:409});
  if(items.some(item=>item.accountId&&item.accountId!==targetGroup.accountId))return Response.json({error:"内容账号必须与所属小组的账号一致"},{status:409});
  const productIds=[...new Set(items.map(item=>Number(item.productId)).filter((id)=>Number.isSafeInteger(id)&&id>0))];
  const masterIds=[...new Set(items.map(item=>Number(item.productMasterId)).filter((id)=>Number.isSafeInteger(id)&&id>0))];
  const [activeProducts,activeMasters]=await Promise.all([
    productIds.length?db.select({id:products.id}).from(products).where(and(inArray(products.id,productIds),eq(products.status,"active"))):Promise.resolve([]),
    masterIds.length?db.select({id:productMasters.id}).from(productMasters).where(and(inArray(productMasters.id,masterIds),eq(productMasters.status,"active"))):Promise.resolve([]),
  ]);
  if(activeProducts.length!==productIds.length||activeMasters.length!==masterIds.length)return Response.json({error:"所选商品不存在或已停用，请重新选择商品"},{status:409});
  const legacyMasterByProductId=new Map<number,number>();
  if(productIds.length){
    const legacyRows=await db.select({id:products.id,name:products.name,status:products.status}).from(products).where(inArray(products.id,productIds));
    for(const legacy of legacyRows){
      const [existing]=await db.select({id:productMasters.id,status:productMasters.status}).from(productMasters).where(and(eq(productMasters.name,legacy.name),eq(productMasters.status,"active"))).orderBy(productMasters.id).limit(1);
      const master=existing??(await db.insert(productMasters).values({name:legacy.name,status:"active",createdByUserId:auth.user.id}).returning({id:productMasters.id}))[0];
      if(master)legacyMasterByProductId.set(legacy.id,master.id);
    }
  }
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const files = item.files?.length ? item.files : [{ fileName:item.fileName, mimeType:item.mimeType, fileSize:item.fileSize }];
    const code = codeFor(index);
    const normalizedMasterId=Number(item.productMasterId)>0?Number(item.productMasterId):legacyMasterByProductId.get(Number(item.productId))??null;
    const [content] = await db.insert(contents).values({
      code,
      title: item.title!.trim(),
      contentType: item.contentType!,
      productId: item.productId ?? null,
      productMasterId: normalizedMasterId,
      accountId: targetGroup.accountId,
      uploaderUserId: auth.user.id,
      groupId:requestedGroupId,
      visibility: item.visibility === "public" && hasPermission(auth.user, "content.set_public") ? "public" : "private",
      remark: item.remark?.trim() ?? "",
      reviewStatus: "draft",
      businessActivityAt:now,
    }).returning();
    const totalSize = files.reduce((sum, file) => sum + (file.fileSize ?? 0), 0);
    const versionLabel = item.contentType === "image_text" ? `${files.length}张图片` : files[0].fileName!;
    const versionStoragePath = item.contentType === "image_text" ? `contents/${code}/v1` : `contents/${code}/v1/${safeFileName(files[0].fileName!)}`;
    const [version] = await db.insert(contentVersions).values({
      contentId: content.id,
      versionNumber: 1,
      fileName: versionLabel,
      storagePath: versionStoragePath,
      mimeType: item.contentType === "image_text" ? "application/x-image-set" : (files[0].mimeType || "application/octet-stream"),
      fileSize: totalSize,
      durationSeconds: item.contentType === "video" && Number.isFinite(item.durationSeconds) ? Math.max(0, Math.round(item.durationSeconds!)) : null,
      uploadStatus: "pending",
      uploadedByUserId: auth.user.id,
      reviewStatus:"draft",businessActivityAt:now,
    }).returning();
    const uploadFiles:{fileId?:number;uploadUrl:string}[] = [];
    if (item.contentType === "video") uploadFiles.push({ uploadUrl:`/api/content-versions/${version.id}/file` });
    else for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const [storedFile] = await db.insert(contentVersionFiles).values({ versionId:version.id, position:fileIndex + 1, fileName:file.fileName!, storagePath:`contents/${code}/v1/${String(fileIndex + 1).padStart(3,"0")}-${safeFileName(file.fileName!)}`, mimeType:file.mimeType || "application/octet-stream", fileSize:file.fileSize!, uploadStatus:"pending" }).returning();
      uploadFiles.push({ fileId:storedFile.id, uploadUrl:`/api/content-version-files/${storedFile.id}/file` });
    }
    created.push({ contentId: content.id, contentCode: code, versionId: version.id, uploads:uploadFiles });
  }
  await writeAudit(request, { userId: auth.user.id, action: "content.create_batch", objectType: "content", objectId: created.map((item) => item.contentCode).join(","), details: { count: created.length, groupId:requestedGroupId,groupName:targetGroup.name,fileCount:items.reduce((sum,item)=>sum+(item.files?.length||1),0), contentType:items[0].contentType } });
  return Response.json({ items: created }, { status: 201 });
}
import {contentVisibility} from "@/lib/content-access";
