import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";

test("V2.1 migration preserves content and adds draft staging and settings",()=>{
 const db=new DatabaseSync(":memory:"),dir=new URL("../drizzle/",import.meta.url);
 for(const name of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)&&name<"0018").sort())db.exec(readFileSync(new URL(name,dir),"utf8"));
 const group=db.prepare("SELECT id FROM content_groups ORDER BY id LIMIT 1").get();
 db.prepare("UPDATE content_groups SET name='' WHERE id=?").run(group.id);
 db.exec(readFileSync(new URL("0018_content_lifecycle_ui_settings.sql",dir),"utf8"));
 const columns=db.prepare("PRAGMA table_info(content_version_files)").all().map(row=>row.name);
 assert.ok(columns.includes("draft_edit_token"));
 assert.equal(db.prepare("SELECT name FROM content_groups WHERE id=?").get(group.id).name,"内容一组");
 db.prepare("INSERT INTO system_settings(key,value_text) VALUES('ui.upload_video_title_placeholder','示例标题')").run();
 assert.equal(db.prepare("SELECT value_text FROM system_settings WHERE key='ui.upload_video_title_placeholder'").get().value_text,"示例标题");
 db.close();
});
