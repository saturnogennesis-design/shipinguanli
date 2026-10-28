import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";

test("employee permission overrides migrate without changing shared roles",()=>{
  const db=new DatabaseSync(":memory:"),dir=new URL("../drizzle/",import.meta.url);
  for(const name of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL(name,dir),"utf8"));
  const role=db.prepare("INSERT INTO roles(code,name,data_scope,permissions_json) VALUES('staff_override','员工','self','[\"content.view\"]') RETURNING id").get();
  const user=db.prepare("INSERT INTO users(username,display_name,password_hash,role_id,must_change_password) VALUES('permission_user','权限员工','x',?,0) RETURNING id").get(role.id);
  db.prepare("INSERT INTO user_permission_overrides(user_id,permission_key,effect) VALUES(?,'asset.upload','allow'),(?,'content.download','deny')").run(user.id,user.id);
  db.prepare("UPDATE roles SET permissions_json='[\"content.view\",\"content.download\"]' WHERE id=?").run(role.id);
  const rows=db.prepare("SELECT permission_key,effect FROM user_permission_overrides WHERE user_id=? ORDER BY permission_key").all(user.id).map(row=>({...row}));
  assert.deepEqual(rows,[{permission_key:"asset.upload",effect:"allow"},{permission_key:"content.download",effect:"deny"}]);
  assert.equal(db.prepare("SELECT permissions_json FROM roles WHERE id=?").get(role.id).permissions_json,'["content.view","content.download"]');
  db.close();
});
