import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
test("V3.8 to V3.9 preserves old reports, receipt times and unknown CC sender",()=>{
 const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
 const dir=new URL("../drizzle/",import.meta.url);
 for(const name of readdirSync(dir).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
   if(name.startsWith("0028")){
     const role=db.prepare("INSERT INTO roles(code,name) VALUES('qa','测试') RETURNING id").get();
     const a=db.prepare("INSERT INTO users(username,display_name,password_hash,role_id) VALUES('a','甲','x',?) RETURNING id").get(role.id);
     const b=db.prepare("INSERT INTO users(username,display_name,password_hash,role_id) VALUES('b','乙','x',?) RETURNING id").get(role.id);
     const r=db.prepare("INSERT INTO work_reports(code,report_date,submitter_user_id,recipient_user_id,status,completed) VALUES('OLD','2026-09-23',?,?,'submitted','旧内容') RETURNING id").get(a.id,b.id);
     db.prepare("INSERT INTO work_report_cc(report_id,user_id,remark,read_at) VALUES(?,?,'原备注','2026-09-22 11:00:00')").run(r.id,b.id);
   }
   db.exec(readFileSync(new URL(name,dir),"utf8"));
 }
 assert.equal(db.prepare("SELECT completed FROM work_reports WHERE code='OLD'").get().completed,"旧内容");
 const cc=db.prepare("SELECT from_user_id,remark,read_at FROM work_report_cc").get();
 assert.equal(cc.from_user_id,null);assert.equal(cc.remark,"原备注");assert.equal(cc.read_at,"2026-09-22 11:00:00");
 assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);db.close();
});
