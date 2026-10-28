import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("announcement audience uses one employee tree with quick scopes and overwrite confirmation",()=>{
  const ui=readFileSync(new URL("../app/communication-center.tsx",import.meta.url),"utf8");
  const options=readFileSync(new URL("../app/api/communication-options/route.ts",import.meta.url),"utf8");
  const content=readFileSync(new URL("../app/modules.tsx",import.meta.url),"utf8");
  assert.match(ui,/组织架构精确选择/);
  assert.match(ui,/按内容小组/);
  assert.match(ui,/按部门/);
  assert.match(ui,/按角色/);
  assert.match(ui,/应用新的快捷范围会替换当前勾选/);
  assert.match(ui,/users:matched,departments:\[\],roles:\[\]/);
  assert.match(options,/groupMemberships/);
  assert.match(options,/groupIds/);
  assert.match(content,/archive-confirm-dialog/);
  assert.match(content,/archive-reason-field/);
});
