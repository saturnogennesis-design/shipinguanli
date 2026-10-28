import { and, eq, or, isNull, sql } from "drizzle-orm";
import { getDb, getLocalDatabase } from "@/db";
import { contentVersions, contents, platformContents, platforms, shortVideoAccounts, userAccountResponsibilities, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { PublishingConflict, savePublishingDetails, type PublishingSnapshot } from "@/lib/publishing-write";
import { publishingAccountIds } from "@/lib/v3-access";

type RouteContext = { params: Promise<{ code: string }> };
type AssignmentInput = { platformId: number; accountId?: number | null; productMasterId?:number|null; copy?: { title?: string; body?: string; topics?: string[] } };

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "publishing.assign")) return Response.json({ error: "没有分配发布平台与账号的权限" }, { status: 403 });
  const code = (await context.params).code;
  const payload = await request.json().catch(() => ({})) as { assignments?: AssignmentInput[]; expectedAssignments?: PublishingSnapshot[] };
  if (!payload || typeof payload !== "object") return Response.json({error:"发布资料参数无效"},{status:400});
  if (!Array.isArray(payload.expectedAssignments) || payload.expectedAssignments.some(item => !item || !Number.isSafeInteger(item.id) || !Number.isSafeInteger(item.rowVersion))) return Response.json({error:"请刷新页面后重新保存发布资料"},{status:409});
  if (!Array.isArray(payload.assignments) || payload.assignments.length > 20 || payload.assignments.some(item => !item || !Number.isSafeInteger(item.platformId) || (item.accountId != null && (!Number.isSafeInteger(item.accountId) || item.accountId <= 0)) || (item.productMasterId != null && (!Number.isSafeInteger(item.productMasterId) || item.productMasterId <= 0)) || (item.copy != null && ((item.copy.title !== undefined && typeof item.copy.title !== "string") || (item.copy.body !== undefined && typeof item.copy.body !== "string") || (item.copy.topics !== undefined && (!Array.isArray(item.copy.topics) || item.copy.topics.some(topic => typeof topic !== "string"))))))) return Response.json({error:"发布资料参数无效"},{status:400});
  const assignments = Array.isArray(payload.assignments) ? payload.assignments.slice(0, 20) : [];
  if (new Set(assignments.map((item) => item.platformId)).size !== assignments.length) return Response.json({ error: "同一平台只能分配一次" }, { status: 400 });

  const db = getDb();
  const [content] = await db.select({ id: contents.id, accountId:contents.accountId,archivedAt:contents.archivedAt, deletedAt:contents.deletedAt, reviewStatus: contents.reviewStatus,latestVersionNumber:contents.latestVersionNumber }).from(contents).where(eq(contents.code, code)).limit(1);
  if (content?.archivedAt||content?.deletedAt)return Response.json({error:"内容已归档或删除，不能继续发布操作"},{status:409});
  if (!content) return Response.json({ error: "内容不存在" }, { status: 404 });
  if (content.reviewStatus !== "approved") return Response.json({ error: "只有审核通过的内容可以进入发布管理" }, { status: 409 });
  const responsibleAccounts=await publishingAccountIds(auth.user);
  if(content.accountId&&!responsibleAccounts.includes(content.accountId))return Response.json({error:"该内容不在你负责的发布账号内"},{status:403});
  if(!content.accountId&&auth.user.roleCode!=="super_admin")return Response.json({error:"旧内容尚未归入短视频账号，请由管理员先完成归类"},{status:409});
  const [latestVersion]=await db.select({id:contentVersions.id}).from(contentVersions).where(and(eq(contentVersions.contentId,content.id),eq(contentVersions.versionNumber,content.latestVersionNumber))).limit(1);
  if(!latestVersion)return Response.json({error:"当前版本不存在，不能分配发布"},{status:409});

  for (const assignment of assignments) {
    const [platform] = await db.select({ id: platforms.id }).from(platforms).where(eq(platforms.id, assignment.platformId)).limit(1);
    if (!platform) return Response.json({ error: "目标发布平台不存在" }, { status: 400 });
    if (assignment.accountId) {
      if(content.accountId&&assignment.accountId!==content.accountId)return Response.json({error:"审核通过的内容只能进入原所属账号；跨账号请复制为新内容并重新审核"},{status:409});
      if(!responsibleAccounts.includes(assignment.accountId))return Response.json({error:"所选账号不在你的发布责任范围内"},{status:403});
      const [account] = await db.select({ id: shortVideoAccounts.id }).from(shortVideoAccounts).where(and(eq(shortVideoAccounts.id, assignment.accountId), eq(shortVideoAccounts.platformId, assignment.platformId), eq(shortVideoAccounts.status, "active"))).limit(1);
      if (!account) return Response.json({ error: "所选账号不属于对应平台或已停用" }, { status: 400 });
    }

  }

  const now = new Date().toISOString();
  try {
    savePublishingDetails(getLocalDatabase(), {
      contentId: content.id, userId: auth.user.id, accountIds: responsibleAccounts,
      expectedAssignments: payload.expectedAssignments, assignments,
      now,
    });
  } catch (error) {
    if (error instanceof PublishingConflict) return Response.json({error:error.message},{status:409});
    throw error;
  }
  await writeAudit(request, { userId: auth.user.id, action: "publishing.details_update", objectType: "content", objectId: code, details: { platformProducts:assignments.map((item)=>({platformId:item.platformId,productMasterId:item.productMasterId??null})), platformCount: assignments.length } });
  return Response.json({ ok: true });
}

export async function PATCH(request:Request,context:RouteContext){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,"publishing.assign"))return Response.json({error:"没有领取发布任务的权限"},{status:403});
 const code=(await context.params).code,body=await request.json().catch(()=>null) as {action?:unknown;assignmentId?:unknown;expectedVersion?:unknown;targetUserId?:unknown;reason?:unknown}|null;
 const action=String(body?.action??""),assignmentId=Number(body?.assignmentId),expectedVersion=Number(body?.expectedVersion);if(!Number.isInteger(assignmentId)||!Number.isInteger(expectedVersion))return Response.json({error:"发布任务参数无效"},{status:400});
 const db=getDb();const [row]=await db.select({id:platformContents.id,sourceContentId:platformContents.sourceContentId,accountId:platformContents.accountId,handlerUserId:platformContents.handlerUserId,rowVersion:platformContents.rowVersion,title:contents.title}).from(platformContents).innerJoin(contents,eq(contents.id,platformContents.sourceContentId)).where(and(eq(platformContents.id,assignmentId),eq(contents.code,code),isNull(platformContents.deletedAt))).limit(1);if(!row)return Response.json({error:"发布任务不存在"},{status:404});
 const accountIds=await publishingAccountIds(auth.user);if(!row.accountId||!accountIds.includes(row.accountId))return Response.json({error:"该任务不在你负责的发布账号内"},{status:403});
 const now=new Date().toISOString();let targetUserId:number|null=auth.user.id;
 if(action==="start"){
  const changed=await db.update(platformContents).set({handlerUserId:auth.user.id,handlingStartedAt:now,rowVersion:sql`${platformContents.rowVersion}+1`,updatedAt:now}).where(and(eq(platformContents.id,row.id),eq(platformContents.rowVersion,expectedVersion),or(isNull(platformContents.handlerUserId),eq(platformContents.handlerUserId,auth.user.id)))).returning({rowVersion:platformContents.rowVersion});
  if(!changed.length){const [latest]=await db.select({handlerUserId:platformContents.handlerUserId,rowVersion:platformContents.rowVersion}).from(platformContents).where(eq(platformContents.id,row.id)).limit(1);return Response.json({error:latest?.handlerUserId&&latest.handlerUserId!==auth.user.id?"该内容刚刚已被其他发布人员领取":"页面数据已更新，请刷新后重试",current:latest},{status:409});}
 }else if(action==="release"){
  if(row.handlerUserId!==auth.user.id&&!hasPermission(auth.user,"publishing.reassign"))return Response.json({error:"只能释放本人领取的任务；改派他人任务需要额外权限"},{status:403});
  targetUserId=null;const changed=await db.update(platformContents).set({handlerUserId:null,handlingStartedAt:null,rowVersion:sql`${platformContents.rowVersion}+1`,updatedAt:now}).where(and(eq(platformContents.id,row.id),eq(platformContents.rowVersion,expectedVersion))).returning({id:platformContents.id});if(!changed.length)return Response.json({error:"任务状态已变化，请刷新后重试"},{status:409});
 }else if(action==="reassign"){
  if(!hasPermission(auth.user,"publishing.reassign"))return Response.json({error:"没有改派发布任务的权限"},{status:403});const requested=Number(body?.targetUserId);if(!Number.isInteger(requested)||requested<=0)return Response.json({error:"请选择新的发布人员"},{status:400});
  const [target]=await db.select({id:users.id}).from(userAccountResponsibilities).innerJoin(users,eq(users.id,userAccountResponsibilities.userId)).where(and(eq(userAccountResponsibilities.accountId,row.accountId),eq(userAccountResponsibilities.responsibilityType,"publisher"),eq(userAccountResponsibilities.userId,requested),eq(users.status,"active"))).limit(1);if(!target)return Response.json({error:"所选人员不是该账号的有效发布负责人"},{status:400});targetUserId=target.id;
  const changed=await db.update(platformContents).set({handlerUserId:target.id,handlingStartedAt:now,rowVersion:sql`${platformContents.rowVersion}+1`,updatedAt:now}).where(and(eq(platformContents.id,row.id),eq(platformContents.rowVersion,expectedVersion))).returning({id:platformContents.id});if(!changed.length)return Response.json({error:"任务状态已变化，请刷新后重试"},{status:409});
 }else return Response.json({error:"不支持的发布任务操作"},{status:400});
 await writeAudit(request,{userId:auth.user.id,action:`publishing.${action}`,objectType:"platform_content",objectId:String(row.id),details:{previousHandlerUserId:row.handlerUserId,targetUserId,reason:String(body?.reason??"").slice(0,500)}});
 const [updated]=await db.select({handlerUserId:platformContents.handlerUserId,handlingStartedAt:platformContents.handlingStartedAt,rowVersion:platformContents.rowVersion}).from(platformContents).where(eq(platformContents.id,row.id)).limit(1);return Response.json(updated);
}
