import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("V2.1 stages draft media and hides staged files from ordinary version reads",()=>{
 const draft=readFileSync(new URL("../app/api/contents/[id]/draft-files/route.ts",import.meta.url),"utf8");
 const upload=readFileSync(new URL("../app/api/content-version-files/[id]/file/route.ts",import.meta.url),"utf8");
 const versions=readFileSync(new URL("../app/api/contents/[id]/versions/route.ts",import.meta.url),"utf8");
 assert.match(draft,/draftEditToken:token/);assert.match(draft,/content\.draft_media_commit/);assert.match(upload,/record\.draftEditToken&&record\.uploaderUserId!==auth\.user\.id/);assert.match(versions,/isNull\(contentVersionFiles\.draftEditToken\)/);
});

test("V2.1 disables the unsafe legacy draft replacement entry",()=>{
 const route=readFileSync(new URL("../app/api/contents/[id]/route.ts",import.meta.url),"utf8");
 assert.match(route,/旧版文件替换入口已停用/);assert.doesNotMatch(route,/action: "content\.draft_file_prepare"/);
});

test("V2.1 separates archive trash and purge permissions",()=>{
 const permissions=readFileSync(new URL("../lib/permissions.ts",import.meta.url),"utf8");const batch=readFileSync(new URL("../app/api/contents/batch/route.ts",import.meta.url),"utf8");
 for(const key of ["content.archive","content.delete","content.trash_purge"])assert.match(permissions,new RegExp(key.replace(".","\\.")));
 assert.match(batch,/requiresRecommendationConfirmation/);assert.match(batch,/reviewStatus==="draft"/);assert.match(batch,/reviewStatus:reset\?"draft"/);
});

test("V2.1 provides configurable placeholders and current-page selection",()=>{
 const source=readFileSync(new URL("../app/modules.tsx",import.meta.url),"utf8");const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.match(source,/function SettingsCenter/);assert.match(source,/选择当前页全部内容/);assert.match(source,/每页<select/);assert.match(page,/配置中心/);
});

test("workbench recommendations open a permission-aware dialog instead of the content pool",()=>{
 const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.match(page,/function RecommendationDialog/);assert.match(page,/id="recommendation-dialog-title">推荐案例/);assert.match(page,/can\("content\.feature"\)\|\|can\("review\.recommend"\)/);
 assert.doesNotMatch(page,/openModule\("内容池", "__featured__"\)/);
});
