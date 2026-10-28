import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";

test("direct announcement attachments migrate while old announcements stay published",()=>{
  const db=new DatabaseSync(":memory:"),dir=new URL("../drizzle/",import.meta.url);
  for(const name of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    if(name==="0022_notice_direct_attachments.sql"){
      const role=db.prepare("INSERT INTO roles(code,name,data_scope,permissions_json) VALUES('notice_migration','公告迁移','self','[]') RETURNING id").get();
      const user=db.prepare("INSERT INTO users(username,display_name,password_hash,role_id,must_change_password) VALUES('notice_migration','公告迁移','x',?,0) RETURNING id").get(role.id);
      db.prepare("INSERT INTO notices(title,body,author_user_id,material_ids_json) VALUES('旧公告','保留原公告',?,'[]')").run(user.id);
    }
    db.exec(readFileSync(new URL(name,dir),"utf8"));
  }
  const notice=db.prepare("SELECT requires_reply,publish_status FROM notices WHERE title='旧公告'").get();
  assert.deepEqual({...notice},{requires_reply:0,publish_status:"published"});
  const noticeId=db.prepare("SELECT id FROM notices WHERE title='旧公告'").get().id;
  db.prepare("INSERT INTO notice_attachments(notice_id,position,file_name,mime_type,file_size,storage_path) VALUES(?,1,'a.jpg','image/jpeg',10,'notices/1/a')").run(noticeId);
  assert.equal(db.prepare("SELECT count(*) AS total FROM notice_attachments WHERE notice_id=?").get(noticeId).total,1);
  db.close();
});

test("announcement UI uses explicit read and persistent reply reminders without auto archive",()=>{
  const ui=readFileSync(new URL("../app/communication-center.tsx",import.meta.url),"utf8");
  const dashboard=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
  const api=readFileSync(new URL("../app/api/notices/[id]/route.ts",import.meta.url),"utf8");
  assert.match(ui,/公告图片或视频/);
  assert.match(ui,/要求员工回复/);
  assert.match(ui,/确认已阅/);
  assert.match(dashboard,/待处理通知/);
  assert.match(ui,/每页<select/);
  assert.match(ui,/pageSize:String\(pageSize\)/);
  assert.match(api,/notice\.read_confirm/);
  assert.doesNotMatch(`${ui}\n${dashboard}\n${api}`,/autoArchive|自动归档/);
});

test("material product library exposes edit image replacement and history-safe removal",()=>{
  const ui=readFileSync(new URL("../app/material-center-v3.tsx",import.meta.url),"utf8");
  const route=readFileSync(new URL("../app/api/product-masters/route.ts",import.meta.url),"utf8");
  assert.match(ui,/修改产品/);
  assert.match(ui,/更换产品图片/);
  assert.match(ui,/删除产品/);
  assert.match(route,/product_master\.update/);
  assert.match(route,/product_master\.remove/);
  assert.match(route,/historyPreserved:true/);
});
