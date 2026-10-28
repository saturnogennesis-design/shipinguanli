import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { contentMetrics, contents, platformContents, platforms, productMasters, shortVideoAccounts, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hasPermission, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const auth=await requireUser(request);if(!auth.user)return auth.response;if(!hasPermission(auth.user,"analytics.view"))return Response.json({error:"没有查看数据统计的权限"},{status:403});const db=getDb();
  const visible=contentVisibility(auth.user);
  const contentRows=await db.select({id:contents.id,title:contents.title,contentType:contents.contentType,reviewStatus:contents.reviewStatus,uploaderName:users.displayName,createdAt:contents.createdAt}).from(contents).innerJoin(users,eq(contents.uploaderUserId,users.id)).where(visible).orderBy(desc(contents.createdAt));
  const visibleIds=new Set(contentRows.map((item)=>item.id));
  const published=(await db.select({platformContentId:platformContents.id,sourceContentId:platformContents.sourceContentId,contentTitle:contents.title,contentType:contents.contentType,uploaderUserId:users.id,contentColor:users.contentColor,uploaderName:users.displayName,platform:platforms.name,account:shortVideoAccounts.name,product:productMasters.name,publishStatus:platformContents.publishStatus,publishedAt:platformContents.publishedAt}).from(platformContents).innerJoin(contents,eq(platformContents.sourceContentId,contents.id)).innerJoin(users,eq(contents.uploaderUserId,users.id)).innerJoin(platforms,eq(platformContents.platformId,platforms.id)).leftJoin(shortVideoAccounts,eq(platformContents.accountId,shortVideoAccounts.id)).leftJoin(productMasters,eq(platformContents.productMasterId,productMasters.id)).where(and(eq(platformContents.publishStatus,"published"),isNull(platformContents.deletedAt))).orderBy(desc(platformContents.publishedAt))).filter((item)=>visibleIds.has(item.sourceContentId));
  const publishedIds=new Set(published.map((item)=>item.platformContentId));
  const metricRows=(await db.select({id:contentMetrics.id,platformContentId:contentMetrics.platformContentId,recordedOn:contentMetrics.recordedOn,views:contentMetrics.views,likes:contentMetrics.likes,comments:contentMetrics.comments,shares:contentMetrics.shares,favorites:contentMetrics.favorites,recordedAt:contentMetrics.createdAt,recordedBy:users.displayName}).from(contentMetrics).innerJoin(users,eq(contentMetrics.recordedByUserId,users.id)).orderBy(desc(contentMetrics.createdAt),desc(contentMetrics.id))).filter((item)=>publishedIds.has(item.platformContentId));
  const publishedById=new Map(published.map((item)=>[item.platformContentId,item]));
  return Response.json({contents:contentRows,published,metrics:metricRows.map((metric)=>({...metric,...publishedById.get(metric.platformContentId)}))});
}

export async function POST(request:Request) {
  const auth=await requireUser(request);if(!auth.user)return auth.response;if(!hasPermission(auth.user,"analytics.edit"))return Response.json({error:"没有录入发布数据的权限"},{status:403});
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;const platformContentId=Number(body.platformContentId);const numbers={views:Number(body.views)||0,likes:Number(body.likes)||0,comments:Number(body.comments)||0,shares:Number(body.shares)||0,favorites:Number(body.favorites)||0};
  if(!platformContentId||Object.values(numbers).some((value)=>!Number.isSafeInteger(value)||value<0))return Response.json({error:"请选择已发布内容并填写有效的非负整数"},{status:400});
  const db=getDb();const [published]=await db.select({id:platformContents.id}).from(platformContents).where(and(eq(platformContents.id,platformContentId),eq(platformContents.publishStatus,"published"),isNull(platformContents.deletedAt))).limit(1);if(!published)return Response.json({error:"只能为已发布内容录入数据"},{status:400});
  const recordedOn=String(body.recordedOn??new Date().toISOString().slice(0,10));
  try{const [created]=await db.insert(contentMetrics).values({platformContentId,recordedOn,...numbers,recordedByUserId:auth.user.id}).returning();await writeAudit(request,{userId:auth.user.id,action:"analytics.metric_create",objectType:"platform_content",objectId:String(platformContentId),details:{recordedOn,...numbers}});return Response.json({ok:true,id:created.id},{status:201});}
  catch(error){return Response.json({error:error instanceof Error&&error.message.includes("UNIQUE")?"该发布内容今天已经录入过数据":"平台表现数据保存失败"},{status:409});}
}
import {contentVisibility} from "@/lib/content-access";
