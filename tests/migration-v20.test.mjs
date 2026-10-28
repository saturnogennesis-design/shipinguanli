import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";

test("V2.0 migration preserves old data and creates group and revision foundations",()=>{
  const db=new DatabaseSync(":memory:");const dir=new URL("../drizzle/",import.meta.url);
  for(const name of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)&&name<"0017").sort())db.exec(readFileSync(new URL(name,dir),"utf8"));
  db.exec("INSERT INTO roles(id,code,name) VALUES(90,'legacy','旧角色'); INSERT INTO users(id,username,display_name,password_hash,role_id) VALUES(91,'legacy','旧员工','x',90); INSERT INTO contents(id,code,title,content_type,uploader_user_id,review_status) VALUES(92,'OLD-CHAIN','保留内容','video',91,'rejected'); INSERT INTO content_versions(id,content_id,version_number,file_name,storage_path,mime_type,file_size,upload_status,uploaded_by_user_id) VALUES(93,92,1,'old.mp4','contents/old.mp4','video/mp4',123,'complete',91);");
  db.exec(readFileSync(new URL("0017_group_revision_foundation.sql",dir),"utf8"));
  const content=db.prepare("SELECT group_id,review_status FROM contents WHERE id=92").get();
  const version=db.prepare("SELECT review_status,source_purged_at FROM content_versions WHERE id=93").get();
  assert.ok(content.group_id);assert.equal(content.review_status,"rejected");assert.equal(version.review_status,"rejected");assert.equal(version.source_purged_at,null);
  assert.equal(db.prepare("SELECT is_primary FROM group_memberships WHERE user_id=91").get().is_primary,1);
  assert.equal(db.prepare("SELECT scope_type FROM user_group_scopes WHERE user_id=91").get().scope_type,"upload");
  db.close();
});

test("V2.0 enforces one membership and one scoped grant per group",()=>{
  const db=new DatabaseSync(":memory:");const dir=new URL("../drizzle/",import.meta.url);for(const name of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL(name,dir),"utf8"));
  const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(row=>row.name);
  for(const name of ["idx_group_membership_unique","idx_user_group_scope_unique","idx_content_versions_review_status","idx_platform_contents_version"])assert.ok(indexes.includes(name));db.close();
});
