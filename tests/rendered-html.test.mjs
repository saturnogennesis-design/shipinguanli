import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const request = new Request("http://localhost/", { headers: { accept: "text/html" } });
  if (typeof worker === "function") return worker(request);
  return worker.fetch(request, { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the local-only authentication gate before the workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>内容中台｜公司短视频管理平台<\/title>/i);
  assert.match(html, /正在连接本地服务/);
  assert.match(html, /仅限公司内网访问/);
  const source = await readFile(new URL("../app/project-shell.tsx", import.meta.url), "utf8");
  assert.match(source, /我的待办/);
  assert.match(source, /审核中心/);
  assert.match(source, /发布管理/);
  assert.match(source, /版本管理/);
  assert.match(source, /项目管理/);
  assert.match(source, /发布目标账号管理/);
  const auth = await readFile(new URL("../app/auth-gate.tsx", import.meta.url), "utf8");
  assert.match(auth, /退出并切换账号/);
  assert.match(auth, /fetch\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
  assert.match(auth, /setMode\("login"\)/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/i);
});

test("keeps review decisions staged until batch confirmation", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const reviewCenter = source.slice(source.indexOf("function ReviewCenter"), source.indexOf("function LegacyPublisher"));
  assert.match(source, /待审核快照/);
  assert.match(source, /审核当前内容/);
  assert.match(source, /移出队列/);
  assert.match(source, /提交审核结果/);
  assert.match(source, /确认并退出/);
  assert.match(source, /驳回内容必须填写审核意见/);
  assert.match(source, /其他审核人员暂时无法重复领取/);
  assert.match(source, /\/api\/reviews\/pending\?status=/);
  assert.match(source, /\/api\/review-sessions/);
  assert.match(source, /已恢复上次未提交的审核队列/);
  assert.match(source, /approvedCount\s*\+\s*rejectedCount\s*!==\s*queue\.length/);
  assert.match(reviewCenter, /review-status-tabs/);
  assert.match(reviewCenter, /aria-pressed/);
  assert.doesNotMatch(reviewCenter, /<select[^>]*aria-label="审核状态筛选"/);
});

test("supports governed batch uploads and one unified content detail", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const detail = source.slice(source.indexOf("function ContentDetailPanel"), source.indexOf("function ContentPool"));
  assert.match(source, /视频可批量上传；图文一次提交一套；图片和视频不能混传/);
  assert.match(source, /批量改名称/);
  assert.match(source, /批量写备注/);
  assert.match(source, /批量撤回/);
  assert.match(source, /仅本人和管理员可见/);
  assert.match(source, /审核中的内容不能撤回或删除/);
  assert.match(source, /function ContentDetailPanel/);
  assert.match(source, /查看历史版本/);
  assert.match(detail, /openHistory/);
  assert.match(detail, /version-history-drawer/);
  assert.match(detail, /进入版本管理中心/);
  assert.match(detail, /\/api\/contents\/\$\{encodeURIComponent\(item\.id\)\}\/versions/);
  assert.doesNotMatch(detail, /history-button" onClick=\{\(\) => navigate/);
});

test("enforces separate video batches and single image-text sets", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const contentPool = source.slice(source.indexOf("function ContentPool"), source.indexOf("function ReviewCenter"));
  const contentsRoute = await readFile(new URL("../app/api/contents/route.ts", import.meta.url), "utf8");
  const fileRoute = await readFile(new URL("../app/api/content-version-files/[id]/file/route.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(contentPool, /视频上传只能选择视频文件，不能混入图片/);
  assert.match(contentPool, /图文上传只能选择图片，不能混入视频/);
  assert.match(contentPool, /以下图片共同组成一条图文内容/);
  assert.match(contentPool, /contentType\s*===\s*"视频"\s*\?\s*uploadRows\.map/);
  assert.match(contentsRoute, /图片和视频不能混合上传/);
  assert.match(contentsRoute, /图文每次只能提交一套/);
  assert.match(contentsRoute, /一套图文必须包含1至20张图片/);
  assert.match(schema, /contentVersionFiles/);
  assert.match(fileRoute, /versionComplete/);
});

test("separates draft edit and view modes and uploads the current draft file", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const contentPool = source.slice(source.indexOf("function ContentPool"), source.indexOf("function ReviewCenter"));
  const contentRoute = await readFile(new URL("../app/api/contents/[id]/route.ts", import.meta.url), "utf8");
  assert.match(contentPool, /detailMode/);
  assert.match(contentPool, /setDetailMode\("edit"\)/);
  assert.match(contentPool, /CenterDialog title="内容详情"/);
  assert.match(contentPool, /openDetail\(row\.id,\s*"view"\)/);
  assert.match(contentPool, /添加图片（可多选）/);
  assert.match(contentPool, /草稿修改已保存，不会生成新版本/);
  assert.match(contentPool, /\/draft-files/);
  assert.match(contentRoute, /只有草稿可以编辑基础信息/);
});

test("shows the latest rejection reason in rejected content details", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const contentsRoute = await readFile(new URL("../app/api/contents/route.ts", import.meta.url), "utf8");
  const detail = source.slice(source.indexOf("function ContentDetailPanel"), source.indexOf("function ContentPool"));
  assert.match(detail, /驳回原因/);
  assert.match(detail, /item\.rejectionReason/);
  assert.match(detail, /item\.rejectedAt/);
  assert.match(contentsRoute, /eq\(reviews\.decision, "rejected"\)/);
  assert.match(contentsRoute, /orderBy\(desc\(reviews\.createdAt\), desc\(reviews\.id\)\)/);
  assert.match(contentsRoute, /rejectionReason:/);
});

test("uses a content list and focused detail for version management", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const versions = source.slice(source.indexOf("function VersionCenter"), source.indexOf("function ProductManagement"));
  assert.match(versions, /一条内容一行/);
  assert.match(versions, /当前版本/);
  assert.match(versions, /版本总数/);
  assert.match(versions, /查看版本/);
  assert.match(versions, /文件版本记录/);
  assert.match(versions, /最新版本不可删除/);
  assert.match(source, /进入版本管理中心/);
  assert.match(source, /showHistory=\{false\}/);
});

test("allows new versions only after rejection and keeps version management read-delete only", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const contentPool = source.slice(source.indexOf("function ContentPool"), source.indexOf("function ReviewCenter"));
  const versions = source.slice(source.indexOf("function VersionCenter"), source.indexOf("function ProductManagement"));
  assert.match(contentPool, /detail\.status === "已驳回"/);
  assert.match(contentPool, /草稿修改已保存，不会生成新版本/);
  assert.match(contentPool, /确认上传新版本并重新提交审核/);
  assert.match(contentPool, /onResubmit\([\s\S]*updated,[\s\S]*versionFiles/);
  assert.match(versions, /删除历史版本/);
  assert.match(versions, /最新版本始终保留/);
  assert.match(versions, /selectedHistoricalCount/);
  assert.doesNotMatch(versions, /打开新版本上传/);
  assert.match(source, /await reloadContents\(\)/);
});

test("configures roles, employees, departments, and data scopes without hardcoded role checks", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const organization = source.slice(source.indexOf("function Organization"), source.indexOf("function AuditLog"));
  assert.match(organization, /permissionCatalog/);
  assert.match(organization, /makePermissions/);
  assert.match(organization, /本部门及下级部门/);
  assert.match(organization, /首次登录必须修改密码/);
  assert.match(organization, /角色权限/);
  assert.match(organization, /员工账号/);
  assert.match(organization, /部门管理/);
  assert.match(organization, /权限必须在接口层校验/);
  assert.match(organization, /修正审核状态/);
  assert.match(organization, /转移员工内容/);
});

test("filters operational analytics and keeps immutable audit records", async () => {
  const source = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const analytics = source.slice(source.indexOf("function Analytics"), source.indexOf("function Organization"));
  const audit = source.slice(source.indexOf("function AuditLog"), source.indexOf("export function ModuleView"));
  assert.match(analytics, /导出 Excel/);
  assert.match(analytics, /全部平台/);
  assert.match(analytics, /全部账号/);
  assert.match(analytics, /全部商品/);
  assert.match(analytics, /平台表现记录/);
  assert.match(analytics, /每次手工录入单独保留，不覆盖旧记录/);
  assert.match(audit, /日志不能修改或删除/);
  assert.match(audit, /登录失败/);
  assert.match(audit, /全部操作类型/);
  assert.match(audit, /导出日志/);
});

test("persists administration, audit logs, retired platform responses, previews, and version deletion", async () => {
  const modules = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const adminRoute = await readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
  const auditRoute = await readFile(new URL("../app/api/audit-logs/route.ts", import.meta.url), "utf8");
  const versionsRoute = await readFile(new URL("../app/api/versions/route.ts", import.meta.url), "utf8");
  const iconRoute = await readFile(new URL("../app/api/platforms/[code]/icon/route.ts", import.meta.url), "utf8");
  const contentVersionsRoute = await readFile(new URL("../app/api/contents/[id]/versions/route.ts", import.meta.url), "utf8");
  assert.match(modules, /<OrganizationLive/);
  assert.match(modules, /<AuditLogLive/);
  assert.match(modules, /<VersionCenterLive/);
  assert.match(modules, /real-video-preview/);
  assert.match(modules, /real-image-preview/);
  assert.match(adminRoute, /hashPassword/);
  assert.match(adminRoute, /当前登录账号不能停用或修改自己的角色/);
  assert.match(auditRoute, /auditLogs/);
  assert.match(versionsRoute, /versionNumber<item\.latestVersionNumber/);
  assert.match(versionsRoute, /content\.version_source_purge/);
  assert.match(iconRoute, /status:410/);
  assert.match(contentVersionsRoute, /contentVersionFiles/);
});

test("keeps parent list context and exposes readable content metadata filters", async () => {
  const modules = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const contentsRoute = await readFile(new URL("../app/api/contents/route.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(modules, /filterQuery/);
  assert.match(modules, /content-board/);
  assert.match(modules, /上传时间/);
  assert.match(modules, /formatDuration\(row\.durationSeconds\)/);
  assert.match(modules, /row\.imageCount/);
  assert.match(modules, /setDetailId\(""\)/);
  assert.match(contentsRoute, /createdAt: contents\.createdAt/);
  assert.match(contentsRoute, /imageCount/);
  assert.match(schema, /durationSeconds: integer\("duration_seconds"\)/);
  assert.match(css, /height:calc\(100vh - 118px\)/);
  assert.match(css, /\.queue-items \{ flex:1; min-height:0; overflow-x:hidden; overflow-y:auto/);
  assert.match(css, /Readability pass/);
});

test("manages deleted test content through a recoverable recycle bin", async () => {
  const modules = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const trashRoute = await readFile(new URL("../app/api/contents/trash/route.ts", import.meta.url), "utf8");
  const contentRoute = await readFile(new URL("../app/api/contents/[id]/route.ts", import.meta.url), "utf8");
  const permissions = await readFile(new URL("../lib/permissions.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(modules, /function ContentRecycleBin/);
  assert.match(modules, /\/api\/contents\/trash/);
  assert.match(modules, /恢复所选内容/);
  assert.match(modules, /确认永久删除/);
  assert.match(trashRoute, /content\.trash_restore/);
  assert.match(trashRoute, /content\.trash_purge/);
  assert.match(trashRoute, /store\.quarantine/);
  assert.match(trashRoute, /store\.restoreQuarantine/);
  assert.match(trashRoute, /contentVersionFiles/);
  assert.match(contentRoute, /trashPreviousStatus/);
  assert.match(permissions, /content\.trash_purge/);
  assert.match(schema, /trashPreviousStatus: text\("trash_previous_status"\)/);
});

test("binds neutral recommendation cases to review decisions and versions", async () => {
  const page = await readFile(new URL("../app/project-shell.tsx", import.meta.url), "utf8");
  const modules = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const contentRoute = await readFile(new URL("../app/api/contents/[id]/route.ts", import.meta.url), "utf8");
  const dashboardRoute = await readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8");
  const permissions = await readFile(new URL("../lib/permissions.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const reviewRoute = await readFile(new URL("../app/api/review-sessions/[id]/route.ts", import.meta.url), "utf8");
  assert.match(page, /推荐案例/);
  assert.match(page, /setPreview\(item\)/);
  assert.match(modules, /只看推荐案例/);
  assert.match(modules, /通过或驳回都可以推荐/);
  assert.match(modules, /推荐案例必须填写审核评语/);
  assert.match(contentRoute, /action === "feature"/);
  assert.match(reviewRoute, /draftRecommended/);
  assert.match(reviewRoute, /recommended:\s*item\.draftRecommended/);
  assert.match(reviewRoute, /visibility:\s*item\.draftRecommended\s*\?\s*"public"/);
  assert.match(reviewRoute, /featured:\s*item\.draftRecommended/);
  assert.match(reviewRoute, /featuredReason:\s*item\.draftRecommended\s*\?\s*item\.draftComment/);
  assert.match(dashboardRoute, /recommended/);
  assert.match(permissions, /review\.recommend/);
  assert.match(schema, /recommended:\s*integer\("recommended"/);
});

test("keeps the Windows server alive without PowerShell stream piping", async () => {
  const startScript = await readFile(new URL("../deploy/windows/start-server.ps1", import.meta.url), "utf8");
  const installScript = await readFile(new URL("../deploy/windows/install.ps1", import.meta.url), "utf8");
  const updateScript = await readFile(new URL("../deploy/windows/update.ps1", import.meta.url), "utf8");
  assert.match(startScript, /while \(\$true\)/);
  assert.match(startScript, /Start-Process/);
  assert.match(startScript, /RedirectStandardOutput/);
  assert.match(startScript, /Server process exited with code/);
  assert.doesNotMatch(startScript, /\*>>/);
  assert.match(installScript, /RestartCount 999/);
  assert.match(updateScript, /Set-ScheduledTask/);
  assert.match(updateScript, /RestartCount 999/);
  assert.match(updateScript, /Copy-Item -LiteralPath \$sourceStopScript -Destination \$installedStopScript/);
});

test("applies V1.6 permission, owner-version, dashboard, and unified-filter rules", async () => {
  const page = await readFile(new URL("../app/project-shell.tsx", import.meta.url), "utf8");
  const modules = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8");
  const versions = await readFile(new URL("../app/api/contents/[id]/versions/route.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8");
  const contents = await readFile(new URL("../app/api/contents/route.ts", import.meta.url), "utf8");
  const stopServer = await readFile(new URL("../deploy/windows/stop-server.ps1", import.meta.url), "utf8");
  assert.match(page, /我的待办/);
  assert.match(dashboard, /c\.account_id/);
  assert.match(dashboard, /slice\(0,10\)/);
  assert.match(versions, /只有原上传人可以上传此内容的新版本/);
  assert.match(versions, /recommendedVersionId/);
  assert.match(admin, /只有超级管理员可以修改员工姓名或重置密码/);
  assert.match(modules, /data\.canManageSensitiveAccounts/);
  assert.match(modules, /aria-label="筛选条件"/);
  assert.match(modules, /更多条件/);
  assert.match(modules, /开始日期/);
  assert.match(modules, /结束日期/);
  assert.match(contents, /createdFrom/);
  assert.match(contents, /createdTo/);
  assert.match(stopServer, /Get-NetTCPConnection/);
  assert.match(stopServer, /Stop-Process/);
});

test("uses one conventional condition filter across every operational list", async () => {
  const modules = await readFile(new URL("../app/modules.tsx", import.meta.url), "utf8");
  const filters = await readFile(new URL("../app/api/filters/route.ts", import.meta.url), "utf8");
  const filterComponent=modules.slice(modules.indexOf("export function RuleFilterBar"),modules.indexOf("type UnifiedContent"));
  assert.match(filterComponent, /condition-filter-controls/);
  assert.match(filterComponent, /primaryKeys/);
  assert.doesNotMatch(filterComponent, /超级筛选器|并且（AND）|或者（OR）|排除（NOT）/);
  for (const key of ["contents", "trash", "reviews", "publishing", "versions", "products", "accounts", "platform_stores", "published_contents", "analytics_metrics", "roles", "employees", "departments", "audit"]) {
    assert.match(modules, new RegExp(`moduleKey="${key}"`));
    assert.match(filters, new RegExp(`${key}:\\[`));
  }
  assert.match(filters, /key:"createdAt",label:"上传时间"/);
  assert.match(filters, /key:"publishStatus",label:"发布状态"/);
});

test("V1.8 has independent workflow lanes, archive and lazy version covers",async()=>{
  const modules=await readFile(new URL("../app/modules.tsx",import.meta.url),"utf8");
  const api=await readFile(new URL("../app/api/contents/route.ts",import.meta.url),"utf8");
  const preview=await readFile(new URL("../app/content-preview.tsx",import.meta.url),"utf8");
  assert.match(modules,/content-board-lane/);assert.match(modules,/lane-pagination/);assert.match(modules,/scrollPositions/);
  assert.match(api,/laneTotals/);assert.match(api,/contents.archivedAt/);
  assert.match(preview,/makeCover/);assert.match(preview,/createPortal/);assert.match(preview,/preload="metadata"/);
});
test("V1.8 permanent deletion is super-admin only and protects references",async()=>{
  const trash=await readFile(new URL("../app/api/contents/trash/route.ts",import.meta.url),"utf8");
  const versions=await readFile(new URL("../app/api/versions/route.ts",import.meta.url),"utf8");
  assert.match(trash,/auth.user.roleCode!=="super_admin"/);assert.match(trash,/otherVersion\|\|otherFile/);
  assert.match(trash,/publicationEvents/);assert.match(trash,/db.batch/);
  assert.match(versions,/推荐或发布使用中的版本不能清理源文件/);
});

test("material upload can create and automatically select a new product",async()=>{
  const center=await readFile(new URL("../app/material-center-v3.tsx",import.meta.url),"utf8");
  const products=await readFile(new URL("../app/api/product-masters/route.ts",import.meta.url),"utf8");
  const image=await readFile(new URL("../app/api/product-masters/[id]/image/route.ts",import.meta.url),"utf8");
  assert.match(center,/＋ 新增产品…/);
  assert.match(center,/title="新增产品"/);
  assert.match(center,/产品已新增并自动选中/);
  assert.match(center,/setProduct\(String\(row\.id\)\)/);
  assert.match(products,/hasPermission\(auth\.user,"asset\.upload"\)/);
  assert.match(image,/row\?\.createdByUserId===auth\.user\.id/);
});

test("recommendations stay out of peer content pools and version management",async()=>{
  const access=await readFile(new URL("../lib/content-access.ts",import.meta.url),"utf8");
  const versions=await readFile(new URL("../app/api/versions/route.ts",import.meta.url),"utf8");
  const detailVersions=await readFile(new URL("../app/api/contents/[id]/versions/route.ts",import.meta.url),"utf8");
  assert.doesNotMatch(access,/groupRecommendation/);
  assert.match(versions,/eq\(contents\.uploaderUserId,auth\.user\.id\)/);
  assert.doesNotMatch(versions,/contentVisibility\(auth\.user\)/);
  assert.match(detailVersions,/recommendedVersionId/);
  assert.doesNotMatch(detailVersions,/recommendedVersionIds/);
});
