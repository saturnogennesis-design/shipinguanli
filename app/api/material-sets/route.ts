import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { materialDownloads, materialFiles, materialSets, materialSetViews, productMasters, shortVideoAccounts, systemSettings, users } from "@/db/schema";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { syncProductMasterCatalog } from "@/lib/product-catalog";
import { materialAccountIds } from "@/lib/v3-access";

const allowedTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"]);
const defaultCategories=["产品展示","使用演示","场景氛围","细节特写","人物口播","开箱过程","对比效果","包装物流","其他"];
const defaultTags=["横屏","竖屏","室内","室外","近景","中景","远景","人物出镜","节日活动"];
function fail(message:string,status=400){return Response.json({error:message},{status});}
function text(value:unknown,max:number){return String(value??"").trim().slice(0,max);}
function cleanList(value:string|undefined,fallback:string[]){const rows=String(value??"").split(/\r?\n|，|,/).map(item=>item.trim()).filter(Boolean);return rows.length?[...new Set(rows)].slice(0,100):fallback;}
function cleanTags(value:unknown){return [...new Set((Array.isArray(value)?value:[]).map(item=>text(item,40)).filter(Boolean))].slice(0,20);}
function parseTags(value:string){try{return cleanTags(JSON.parse(value||"[]"));}catch{return [];}}

export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"asset.view"))return fail("没有查看素材中心的权限",403);
 await syncProductMasterCatalog();
 const canUpload=hasPermission(auth.user,"asset.upload"),canReview=hasPermission(auth.user,"asset.review"),canClaim=hasPermission(auth.user,"asset.claim"),canManageProducts=hasPermission(auth.user,"business.product_masters"),canArchive=hasPermission(auth.user,"asset.archive"),canDelete=hasPermission(auth.user,"asset.delete");
 const claimOnly=canClaim&&!canUpload&&!canReview&&!canManageProducts&&!canArchive&&!canDelete&&auth.user.roleCode!=="super_admin";
 const url=new URL(request.url),requestedAction=claimOnly?"claim":url.searchParams.get("scope")==="review"?"review":"view";
 const accountIds=await materialAccountIds(auth.user,requestedAction),isSuper=auth.user.roleCode==="super_admin";
 if(!accountIds.length&&!isSuper)return Response.json({items:[],total:0,options:{accounts:[],uploadAccounts:[],products:[],categories:defaultCategories,tags:defaultTags},capabilities:{canUpload:false,canReview:false,canClaim:false,canManageProducts,canArchive:false,canDelete:false,claimOnly,trash:false}});
 const requestedStatus=url.searchParams.get("status")?.trim(),status=claimOnly?"admitted":requestedStatus;
 const trash=url.searchParams.get("trash")==="1"&&canDelete&&!claimOnly,accountId=Number(url.searchParams.get("accountId")),productId=Number(url.searchParams.get("productId")),category=text(url.searchParams.get("category"),80),q=text(url.searchParams.get("q"),100),page=Math.max(1,Math.floor(Number(url.searchParams.get("page"))||1)),pageSize=[20,50,100].includes(Number(url.searchParams.get("pageSize")))?Number(url.searchParams.get("pageSize")):20;
 const accountScope=isSuper?or(accountIds.length?inArray(materialSets.accountId,accountIds):undefined,isNull(materialSets.accountId)):inArray(materialSets.accountId,accountIds);
 const where=and(accountScope,trash?isNotNull(materialSets.deletedAt):isNull(materialSets.deletedAt),!trash&&status&&status!=="all"?eq(materialSets.status,status):undefined,Number.isInteger(accountId)&&accountIds.includes(accountId)?eq(materialSets.accountId,accountId):undefined,Number.isInteger(productId)&&productId>0?eq(materialSets.productMasterId,productId):undefined,category?eq(materialSets.category,category):undefined,q?or(like(materialSets.title,`%${q}%`),like(materialSets.description,`%${q}%`)):undefined);
 const db=getDb();const [total]=await db.select({value:count()}).from(materialSets).where(where);
 const rows=await db.select({set:materialSets,productName:productMasters.name,productImagePath:productMasters.imageStoragePath,accountName:shortVideoAccounts.name,uploaderName:users.displayName})
  .from(materialSets).leftJoin(productMasters,eq(productMasters.id,materialSets.productMasterId)).leftJoin(shortVideoAccounts,eq(shortVideoAccounts.id,materialSets.accountId)).innerJoin(users,eq(users.id,materialSets.uploaderUserId)).where(where).orderBy(desc(materialSets.updatedAt),desc(materialSets.id)).limit(pageSize).offset((page-1)*pageSize);
 const setIds=rows.map(row=>row.set.id);
 const [fileRows,downloadRows,viewRows,uploadAccountIds,accounts,products,settingRows]=await Promise.all([
  setIds.length?db.select({id:materialFiles.id,setId:materialFiles.setId,position:materialFiles.position,mimeType:materialFiles.mimeType,fileSize:materialFiles.fileSize}).from(materialFiles).where(and(inArray(materialFiles.setId,setIds),eq(materialFiles.uploadStatus,"complete"),isNull(materialFiles.draftEditToken))).orderBy(asc(materialFiles.position)):Promise.resolve([]),
  setIds.length?db.select({setId:materialDownloads.setId,userId:materialDownloads.userId,createdAt:materialDownloads.createdAt}).from(materialDownloads).where(inArray(materialDownloads.setId,setIds)):Promise.resolve([]),
  setIds.length?db.select({setId:materialSetViews.setId,viewedAt:materialSetViews.viewedAt}).from(materialSetViews).where(and(inArray(materialSetViews.setId,setIds),eq(materialSetViews.userId,auth.user.id))):Promise.resolve([]),
  materialAccountIds(auth.user,"upload"),
  db.select({id:shortVideoAccounts.id,name:shortVideoAccounts.name,code:shortVideoAccounts.code}).from(shortVideoAccounts).where(and(inArray(shortVideoAccounts.id,accountIds),eq(shortVideoAccounts.status,"active"))).orderBy(asc(shortVideoAccounts.name)),
  db.select({id:productMasters.id,name:productMasters.name,imageStoragePath:productMasters.imageStoragePath}).from(productMasters).where(eq(productMasters.status,"active")).orderBy(asc(productMasters.name)),
  db.select({key:systemSettings.key,valueText:systemSettings.valueText}).from(systemSettings).where(inArray(systemSettings.key,["materialCategories","materialTags"])),
 ]);
 const uploadAccounts=uploadAccountIds.length?await db.select({id:shortVideoAccounts.id,name:shortVideoAccounts.name,code:shortVideoAccounts.code}).from(shortVideoAccounts).where(and(inArray(shortVideoAccounts.id,uploadAccountIds),eq(shortVideoAccounts.status,"active"))).orderBy(asc(shortVideoAccounts.name)):[];
 const settings=Object.fromEntries(settingRows.map(row=>[row.key,row.valueText]));
 const items=rows.map(row=>{const files=fileRows.filter(file=>file.setId===row.set.id),downloads=downloadRows.filter(item=>item.setId===row.set.id),claimants=new Set(downloads.map(item=>item.userId)),mine=downloads.filter(item=>item.userId===auth.user!.id).map(item=>item.createdAt).sort();return {...row.set,tags:parseTags(row.set.tagsJson),productName:row.productName,productImageUrl:row.productImagePath&&row.set.productMasterId?`/api/product-masters/${row.set.productMasterId}/image`:null,accountName:row.accountName,uploaderName:row.uploaderName,fileCount:files.length,imageCount:files.filter(file=>file.mimeType.startsWith("image/")).length,videoCount:files.filter(file=>file.mimeType.startsWith("video/")).length,totalBytes:files.reduce((sum,file)=>sum+file.fileSize,0),coverFileId:files[0]?.id??null,coverMimeType:files[0]?.mimeType??null,claimCount:claimants.size,claimedByMe:mine.length>0,myClaimedAt:mine[0]??null,viewedByMe:viewRows.some(item=>item.setId===row.set.id)};});
 return Response.json({items,total:total.value,page,pageSize,options:{accounts,uploadAccounts,products:products.map(item=>({...item,imageUrl:item.imageStoragePath?`/api/product-masters/${item.id}/image`:null})),categories:cleanList(settings.materialCategories,defaultCategories),tags:cleanList(settings.materialTags,defaultTags)},capabilities:{canUpload:canUpload&&uploadAccountIds.length>0,canReview,canClaim,canManageProducts,canArchive,canDelete,claimOnly,trash}});
}

export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"asset.upload"))return fail("没有上传素材套的权限",403);
 await syncProductMasterCatalog();
 const body=await request.json().catch(()=>null) as {title?:unknown;description?:unknown;category?:unknown;tags?:unknown;productMasterId?:unknown;accountId?:unknown;files?:unknown}|null;
 const title=text(body?.title,120),description=text(body?.description,2000),category=text(body?.category,80),tags=cleanTags(body?.tags),productMasterId=Number(body?.productMasterId),accountId=Number(body?.accountId);
 if(!title)return fail("请填写素材套名称");if(!description)return fail("请填写素材套说明");if(!category)return fail("请选择素材分类");
 if(!Number.isInteger(productMasterId)||productMasterId<=0)return fail("请选择所属产品");
 const accountIds=await materialAccountIds(auth.user,"upload");if(!Number.isInteger(accountId)||!accountIds.includes(accountId))return fail("目标账号不在你的素材上传范围内",403);
 const files=Array.isArray(body?.files)?body.files as Array<{fileName?:unknown;mimeType?:unknown;fileSize?:unknown}>:[];
 if(!files.length)return fail("请至少选择一个素材文件");if(files.length>300)return fail("每套素材最多上传300个文件");
 const cleanFiles:Array<{fileName:string;mimeType:string;fileSize:number}>=[];
 for(let index=0;index<files.length;index++){const file=files[index],fileName=text(file.fileName,255),mimeType=String(file.mimeType??""),fileSize=Number(file.fileSize);if(!fileName)return fail(`第${index+1}个文件缺少文件名`);if(!allowedTypes.has(mimeType))return fail(`${fileName} 的格式暂不支持`);if(!Number.isSafeInteger(fileSize)||fileSize<=0||fileSize>4*1024*1024*1024)return fail(`${fileName} 的大小无效或超过4GB`);cleanFiles.push({fileName,mimeType,fileSize});}
 const db=getDb();const [product]=await db.select({id:productMasters.id}).from(productMasters).where(and(eq(productMasters.id,productMasterId),eq(productMasters.status,"active"))).limit(1);if(!product)return fail("所属产品不存在或已停用");
 const code=`MAT-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,6).toUpperCase()}`;
 const [set]=await db.insert(materialSets).values({code,title,description,category,tagsJson:JSON.stringify(tags),productMasterId,accountId,uploaderUserId:auth.user.id,status:"draft"}).returning();
 const created=await db.insert(materialFiles).values(cleanFiles.map((file,index)=>({setId:set.id,position:index+1,...file,storagePath:`material-sets/${set.id}/${randomUUID()}`}))).returning();
 return Response.json({id:set.id,code:set.code,uploads:created.map(file=>({id:file.id,fileName:file.fileName,uploadUrl:`/api/material-files/${file.id}/file`}))},{status:201});
}
