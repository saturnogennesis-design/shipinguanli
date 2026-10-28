import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("authentication merges role, duties, personal grants and explicit denies",()=>{
  const auth=readFileSync(new URL("../lib/server-auth.ts",import.meta.url),"utf8");
  const permissions=readFileSync(new URL("../lib/permissions.ts",import.meta.url),"utf8");
  const admin=readFileSync(new URL("../app/api/admin/route.ts",import.meta.url),"utf8");
  assert.match(auth,/dutyPermissions\(/);
  assert.match(auth,/\.\.\.allowed/);
  assert.match(auth,/filter\(key=>!deniedPermissions\.includes\(key\)\)/);
  assert.match(permissions,/materialUpload.*asset\.view.*asset\.upload/s);
  assert.match(admin,/syncPermissionOverrides/);
  assert.match(admin,/不能同时设为禁止/);
});
