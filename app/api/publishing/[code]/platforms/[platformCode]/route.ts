import { and, eq, isNull } from "drizzle-orm";
import { getDb, getLocalDatabase } from "@/db";
import { contents, platformContents, platforms } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { hasPermission, requireUser } from "@/lib/server-auth";
import { PublishingConflict, setPublishingStatus } from "@/lib/publishing-write";
import { publishingAccountIds } from "@/lib/v3-access";

type RouteContext = { params: Promise<{ code: string; platformCode: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUser(request);
  if (!auth.user) return auth.response;
  if (!hasPermission(auth.user, "publishing.status")) return Response.json({ error: "没有修改发布状态灯的权限" }, { status: 403 });
  const { code, platformCode } = await context.params;
  const payload = await request.json().catch(() => ({})) as { published?: boolean; expectedVersion?: number };
  if (typeof payload.published !== "boolean") return Response.json({ error: "发布状态参数无效" }, { status: 400 });
  if (!Number.isSafeInteger(payload.expectedVersion)) return Response.json({error:"请刷新页面后重新操作发布状态"},{status:409});
  const db = getDb();
  const [row] = await db.select({ id: platformContents.id, accountId: platformContents.accountId,handlerUserId:platformContents.handlerUserId, sourceContentId: contents.id }).from(platformContents)
    .innerJoin(contents, eq(platformContents.sourceContentId, contents.id))
    .innerJoin(platforms, eq(platformContents.platformId, platforms.id))
    .where(and(eq(contents.code, code), eq(platforms.code, platformCode), isNull(platformContents.deletedAt))).limit(1);
  if (!row) return Response.json({ error: "请先在详情页保存该目标平台" }, { status: 404 });
  if (payload.published && !row.accountId) return Response.json({ error: "点亮发布灯前必须选择该平台的发布账号" }, { status: 409 });
  const accountIds=await publishingAccountIds(auth.user);if(!row.accountId||!accountIds.includes(row.accountId))return Response.json({error:"该任务不在你负责的发布账号内"},{status:403});
  if(row.handlerUserId!==auth.user.id)return Response.json({error:row.handlerUserId?"该任务已由其他发布人员领取":"请先点击“开始发布”领取任务"},{status:409});
  const now = new Date().toISOString();
  try {
    setPublishingStatus(getLocalDatabase(), {id:row.id,userId:auth.user.id,accountIds,expectedVersion:payload.expectedVersion!,published:payload.published,now});
  } catch (error) {
    if (error instanceof PublishingConflict) return Response.json({error:error.message},{status:409});
    throw error;
  }
  await writeAudit(request, { userId: auth.user.id, action: payload.published ? "publishing.mark_published" : "publishing.mark_unpublished", objectType: "platform_content", objectId: String(row.id), details: { code, platformCode } });
  return Response.json({ ok: true, publishedAt: payload.published ? now : null });
}
