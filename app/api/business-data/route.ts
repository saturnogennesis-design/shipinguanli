import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accountProducts, contents, platformContents, platforms, productMasters, products, shortVideoAccounts, stores, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hasPermission, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const activeStatus=(value:unknown)=>value==="inactive"?"inactive":"active";
const managePermission=(entity:string)=>entity==="product"?"business.products":entity==="account"||entity==="accountProducts"?"business.accounts":"business.platforms";

export async function GET(request:Request) {
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  if(!hasPermission(auth.user,"business.view"))return Response.json({error:"没有查看业务资料的权限"},{status:403});
  const db=getDb();
  const platformRows=await db.select({id:platforms.id,code:platforms.code,name:platforms.name,sortOrder:platforms.sortOrder,status:platforms.status,iconStoragePath:platforms.iconStoragePath,accountCount:sql<number>`count(distinct ${shortVideoAccounts.id})`}).from(platforms).leftJoin(shortVideoAccounts,eq(shortVideoAccounts.platformId,platforms.id)).groupBy(platforms.id).orderBy(asc(platforms.sortOrder),asc(platforms.id));
  const storeRows=await db.select({id:stores.id,platformId:stores.platformId,platformCode:platforms.code,code:stores.code,name:stores.name,status:stores.status}).from(stores).innerJoin(platforms,eq(stores.platformId,platforms.id)).orderBy(asc(stores.name));
  const accountRows=await db.select({id:shortVideoAccounts.id,platformId:shortVideoAccounts.platformId,platformCode:platforms.code,platformName:platforms.name,code:shortVideoAccounts.code,name:shortVideoAccounts.name,platformHandle:shortVideoAccounts.platformHandle,status:shortVideoAccounts.status,ownerName:users.displayName,productCount:sql<number>`count(distinct ${accountProducts.productId})`}).from(shortVideoAccounts).innerJoin(platforms,eq(shortVideoAccounts.platformId,platforms.id)).leftJoin(users,eq(shortVideoAccounts.ownerUserId,users.id)).leftJoin(accountProducts,eq(accountProducts.accountId,shortVideoAccounts.id)).groupBy(shortVideoAccounts.id).orderBy(asc(shortVideoAccounts.name));
  const [productRows,masterIdRows]=await Promise.all([
    db.select({id:products.id,platformId:products.platformId,platformCode:platforms.code,platformName:platforms.name,storeId:products.storeId,storeName:stores.name,code:products.code,name:products.name,productType:products.productType,status:products.status,ownerName:users.displayName}).from(products).innerJoin(platforms,eq(products.platformId,platforms.id)).innerJoin(stores,eq(products.storeId,stores.id)).leftJoin(users,eq(products.ownerUserId,users.id)).orderBy(asc(products.name)),
    db.select({id:productMasters.id,name:productMasters.name,imageStoragePath:productMasters.imageStoragePath}).from(productMasters).where(eq(productMasters.status,"active")).orderBy(asc(productMasters.id)),
  ]);
  const masterByName=new Map<string,{id:number;imageStoragePath:string|null}>();
  for(const master of masterIdRows)if(!masterByName.has(master.name))masterByName.set(master.name,master);
  const bindingRows=await db.select({accountId:accountProducts.accountId,productId:accountProducts.productId}).from(accountProducts).orderBy(asc(accountProducts.accountId),asc(accountProducts.productId));
  const publishedRows=(await db.select({id:contents.code,uploaderUserId:contents.uploaderUserId,contentColor:users.contentColor,title:contents.title,kind:contents.contentType,version:contents.latestVersionNumber,productId:platformContents.productId,productMasterId:platformContents.productMasterId,productCode:products.code,product:productMasters.name,productType:products.productType,productStatus:products.status,accountId:platformContents.accountId,account:shortVideoAccounts.name,platform:platforms.name,shop:stores.name,publishedAt:platformContents.publishedAt}).from(platformContents).innerJoin(contents,eq(platformContents.sourceContentId,contents.id)).innerJoin(users,eq(users.id,contents.uploaderUserId)).innerJoin(platforms,eq(platformContents.platformId,platforms.id)).leftJoin(shortVideoAccounts,eq(platformContents.accountId,shortVideoAccounts.id)).leftJoin(products,eq(platformContents.productId,products.id)).leftJoin(stores,eq(products.storeId,stores.id)).leftJoin(productMasters,eq(platformContents.productMasterId,productMasters.id)).where(and(contentVisibility(auth.user),eq(platformContents.publishStatus,"published"),isNull(platformContents.deletedAt)))).filter((row)=>row.accountId);
  return Response.json({
    platforms:platformRows,
    stores:storeRows,
    accounts:accountRows,
    // 旧平台／店铺商品保留历史维护；发布关联使用 productMasters。
    products:productRows.map(item=>{const master=masterByName.get(item.name);return {...item,imageUrl:master?.imageStoragePath&&master.id?`/api/product-masters/${master.id}/image`:null};}),
    productMasters:masterIdRows.map(item=>({...item,imageUrl:item.imageStoragePath&&item.id?`/api/product-masters/${item.id}/image`:null,code:`PM-${String(item.id).padStart(3,"0")}`})),
    bindings:bindingRows,
    publishedContents:publishedRows.map(item=>{const master=masterByName.get(item.product??"");return {...item,productImageUrl:master?.imageStoragePath&&master.id?`/api/product-masters/${master.id}/image`:null};})
  });
}

export async function POST(request:Request) {
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  const entity=String(body.entity??"");const name=String(body.name??"").trim();const code=String(body.code??"").trim();
  if(!hasPermission(auth.user,managePermission(entity)))return Response.json({error:"没有维护业务资料的权限：此类操作未授权"},{status:403});
  if(!name||!code)return Response.json({error:"名称和编号不能为空"},{status:400});
  const db=getDb();const now=new Date().toISOString();
  const findPlatform=async()=>{const platformCode=String(body.platformCode??"");const [row]=await db.select().from(platforms).where(eq(platforms.code,platformCode)).limit(1);return row;};
  try{
    if(entity==="platform"){const [created]=await db.insert(platforms).values({name,code,sortOrder:Number(body.sortOrder)||99,status:activeStatus(body.status)}).returning();await writeAudit(request,{userId:auth.user.id,action:"business.platform_create",objectType:"platform",objectId:String(created.id),details:{code}});return Response.json({ok:true,id:created.id},{status:201});}
    const platform=await findPlatform();if(!platform)return Response.json({error:"所属平台不存在"},{status:400});
    let createdId=0;
    if(entity==="store"){const [created]=await db.insert(stores).values({platformId:platform.id,name,code,status:activeStatus(body.status),updatedAt:now}).returning();createdId=created.id;}
    else if(entity==="account"){const [created]=await db.insert(shortVideoAccounts).values({platformId:platform.id,name,code,platformHandle:String(body.platformHandle??"").trim()||null,ownerUserId:auth.user.id,status:activeStatus(body.status),updatedAt:now}).returning();createdId=created.id;}
    else if(entity==="product"){const storeId=Number(body.storeId);const [store]=await db.select().from(stores).where(eq(stores.id,storeId)).limit(1);if(!store||store.platformId!==platform.id)return Response.json({error:"所属店铺与平台不匹配"},{status:400});const [created]=await db.insert(products).values({platformId:platform.id,storeId,name,code,productType:String(body.productType??"").trim()||null,ownerUserId:auth.user.id,status:activeStatus(body.status),updatedAt:now}).returning();const [catalogProduct]=await db.select({id:productMasters.id,status:productMasters.status}).from(productMasters).where(eq(productMasters.name,name)).orderBy(asc(productMasters.id)).limit(1);if(catalogProduct){if(catalogProduct.status!=="active")await db.update(productMasters).set({status:"active",updatedAt:now}).where(eq(productMasters.id,catalogProduct.id));}else await db.insert(productMasters).values({name,status:"active",createdByUserId:auth.user.id,updatedAt:now});createdId=created.id;}
    else return Response.json({error:"业务资料类型无效"},{status:400});
    await writeAudit(request,{userId:auth.user.id,action:`business.${entity}_create`,objectType:entity,objectId:String(createdId),details:{code,name,platformCode:platform.code}});return Response.json({ok:true,id:createdId},{status:201});
  }catch(error){return Response.json({error:error instanceof Error&&error.message.includes("UNIQUE")?"编号已存在，请更换编号":"保存业务资料失败"},{status:409});}
}

export async function PATCH(request:Request) {
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;const entity=String(body.entity??"");const id=Number(body.id);const db=getDb();const now=new Date().toISOString();
  if(!hasPermission(auth.user,managePermission(entity)))return Response.json({error:"没有维护业务资料的权限：此类操作未授权"},{status:403});
  if(!id)return Response.json({error:"业务资料编号无效"},{status:400});
  const [platform]=body.platformCode?await db.select().from(platforms).where(eq(platforms.code,String(body.platformCode))).limit(1):[];
  try{
    if(entity==="platform")await db.update(platforms).set({name:String(body.name??"").trim(),status:activeStatus(body.status),updatedAt:now}).where(eq(platforms.id,id));
    else if(entity==="store"){
      if(!platform)return Response.json({error:"所属平台不存在"},{status:400});
      await db.update(stores).set({platformId:platform.id,name:String(body.name??"").trim(),code:String(body.code??"").trim(),status:activeStatus(body.status),updatedAt:now}).where(eq(stores.id,id));
    } else if(entity==="account"){
      if(!platform)return Response.json({error:"所属平台不存在"},{status:400});
      const bound=await db.select({platformId:products.platformId}).from(accountProducts).innerJoin(products,eq(accountProducts.productId,products.id)).where(eq(accountProducts.accountId,id));
      if(bound.some((item)=>item.platformId!==platform.id))return Response.json({error:"该账号已有其他平台商品，需先解除绑定才能更换平台"},{status:409});
      await db.update(shortVideoAccounts).set({platformId:platform.id,name:String(body.name??"").trim(),code:String(body.code??"").trim(),platformHandle:String(body.platformHandle??"").trim()||null,status:activeStatus(body.status),updatedAt:now}).where(eq(shortVideoAccounts.id,id));
    } else if(entity==="product"){
      if(!platform)return Response.json({error:"所属平台不存在"},{status:400});const storeId=Number(body.storeId);const [store]=await db.select().from(stores).where(eq(stores.id,storeId)).limit(1);if(!store||store.platformId!==platform.id)return Response.json({error:"所属店铺与平台不匹配"},{status:400});
      const bound=await db.select({platformId:shortVideoAccounts.platformId}).from(accountProducts).innerJoin(shortVideoAccounts,eq(accountProducts.accountId,shortVideoAccounts.id)).where(eq(accountProducts.productId,id));
      if(bound.some((item)=>item.platformId!==platform.id))return Response.json({error:"该商品已绑定其他平台账号，需先解除绑定才能更换平台"},{status:409});
      await db.update(products).set({platformId:platform.id,storeId,name:String(body.name??"").trim(),code:String(body.code??"").trim(),productType:String(body.productType??"").trim()||null,status:activeStatus(body.status),updatedAt:now}).where(eq(products.id,id));
    } else return Response.json({error:"业务资料类型无效"},{status:400});
    await writeAudit(request,{userId:auth.user.id,action:`business.${entity}_update`,objectType:entity,objectId:String(id),details:body});return Response.json({ok:true});
  }catch(error){return Response.json({error:error instanceof Error&&error.message.includes("UNIQUE")?"编号已存在，请更换编号":"更新业务资料失败"},{status:409});}
}

export async function PUT(request:Request) {
  const auth=await requireUser(request);if(!auth.user)return auth.response;
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;const entity=String(body.entity??"");const db=getDb();const now=new Date().toISOString();
  if(!hasPermission(auth.user,managePermission(entity)))return Response.json({error:"没有维护业务资料的权限：此类操作未授权"},{status:403});
  if(entity==="platformOrder"){
    const ids=Array.isArray(body.ids)?body.ids.map(Number).filter(Boolean):[];for(let index=0;index<ids.length;index++)await db.update(platforms).set({sortOrder:index+1,updatedAt:now}).where(eq(platforms.id,ids[index]));
    await writeAudit(request,{userId:auth.user.id,action:"business.platform_reorder",objectType:"platform",objectId:"all",details:{ids}});return Response.json({ok:true});
  }
  if(entity!=="accountProducts")return Response.json({error:"业务资料操作无效"},{status:400});
  const accountId=Number(body.accountId);const productIds=Array.isArray(body.productIds)?body.productIds.map(Number).filter(Boolean):[];const [account]=await db.select().from(shortVideoAccounts).where(eq(shortVideoAccounts.id,accountId)).limit(1);if(!account)return Response.json({error:"短视频账号不存在"},{status:404});
  for(const productId of productIds){const [product]=await db.select().from(products).where(eq(products.id,productId)).limit(1);if(!product||product.platformId!==account.platformId)return Response.json({error:"账号只能绑定同一平台的商品"},{status:400});}
  await db.delete(accountProducts).where(eq(accountProducts.accountId,accountId));
  if(productIds.length)await db.insert(accountProducts).values(productIds.map((productId)=>({accountId,productId,boundByUserId:auth.user!.id,updatedAt:now})));
  await writeAudit(request,{userId:auth.user.id,action:"business.account_products_replace",objectType:"account",objectId:String(accountId),details:{productIds}});return Response.json({ok:true});
}
import {contentVisibility} from "@/lib/content-access";
