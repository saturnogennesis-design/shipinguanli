import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
test("V1.8 migration preserves old content and defaults to active",()=>{
 const db=new DatabaseSync(":memory:");
 const dir=new URL("../drizzle/",import.meta.url);
 for(const name of readdirSync(dir).filter(n=>/^\d+.*\.sql$/.test(n)&&n<"0014").sort())db.exec(readFileSync(new URL(name,dir),"utf8"));
 db.exec("INSERT INTO roles(id,code,name) VALUES(99,'migration_test','Migration'); INSERT INTO users(id,username,display_name,password_hash,role_id) VALUES(99,'migration_test','Migration','test',99); INSERT INTO contents(code,title,content_type,uploader_user_id,review_status) VALUES('MIG-OLD','Preserved','video',99,'rejected');");
 db.exec(readFileSync(new URL("0014_content_board.sql",dir),"utf8"));
 const row=db.prepare("SELECT title,review_status,archived_at,archive_reason FROM contents WHERE code='MIG-OLD'").get();
 assert.equal(row.title,"Preserved");assert.equal(row.review_status,"rejected");assert.equal(row.archived_at,null);assert.equal(row.archive_reason,"");
 db.close();
});
