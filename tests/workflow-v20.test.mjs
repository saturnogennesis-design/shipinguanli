import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("V2.0 group scope is enforced in content and review APIs",()=>{
  const content=readFileSync(new URL("../app/api/contents/route.ts",import.meta.url),"utf8");
  const review=readFileSync(new URL("../app/api/reviews/pending/route.ts",import.meta.url),"utf8");
  assert.match(content,/hasGroupScope\(auth\.user,"upload"/);assert.match(content,/groupId:requestedGroupId/);
  assert.match(review,/groupScopeIds\(auth\.user,"review"\)/);assert.match(review,/ne\(contents\.uploaderUserId,auth\.user\.id\)/);
});

test("V2.0 preserves revision audit while source files can be purged",()=>{
  const versions=readFileSync(new URL("../app/api/versions/route.ts",import.meta.url),"utf8");
  assert.match(versions,/sourcePurgedAt:now/);assert.match(versions,/uploadStatus:"purged"/);assert.doesNotMatch(versions,/delete\(contentVersions\)/);
  const publishing=readFileSync(new URL("../app/api/publishing\/\[code\]\/route.ts",import.meta.url),"utf8");assert.match(publishing,/versionId:latestVersion\.id/);
});

test("V2.0 presents one workbench queue and group selection",()=>{
  const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");const modules=readFileSync(new URL("../app/modules.tsx",import.meta.url),"utf8");
  assert.match(page,/>我的待办</);assert.doesNotMatch(page,/>我的内容待办</);assert.doesNotMatch(page,/>审核待办</);
  assert.match(modules,/内容小组/);assert.match(modules,/group-scope-strip/);assert.match(modules,/内容归属小组/);
});
