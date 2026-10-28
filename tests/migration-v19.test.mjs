import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
test("V1.9 preserves existing content and colors, backfills old employee colors and access",()=>{
 const db=new DatabaseSync(":memory:"),dir=new URL("../drizzle/",import.meta.url);
 for(const name of readdirSync(dir).filter(n=>/^\d+.*\.sql$/.test(n)&&n<"0015").sort())db.exec(readFileSync(new URL(name,dir),"utf8"));
 db.exec(`INSERT INTO roles(id,code,name,permissions_json) VALUES(50,'old_employee','Old','["content.view","content.upload"]');
 INSERT INTO users(id,username,display_name,password_hash,role_id) VALUES(51,'old','Old','test',50);
 INSERT INTO users(id,username,display_name,password_hash,role_id,content_color) VALUES(52,'custom','Custom','test',50,'#edf1fa');
 INSERT INTO contents(code,title,content_type,uploader_user_id,review_status) VALUES('OLD','Keep','video',51,'rejected');`);
 db.exec(readFileSync(new URL("0015_communication.sql",dir),"utf8"));
 let hash=0;for(const c of "51")hash=(hash*31+c.charCodeAt(0))>>>0;
 assert.equal(db.prepare("SELECT content_color c FROM users WHERE id=51").get().c,["#edf1fa","#f0edfa","#eaf2f8","#f2eef6","#eceff5","#eaf3f5","#f0f0fa","#edf0f7"][hash%8]);
 assert.equal(db.prepare("SELECT content_color c FROM users WHERE id=52").get().c,"#edf1fa");
 const perms=JSON.parse(db.prepare("SELECT permissions_json p FROM roles WHERE id=50").get().p);for(const p of ["asset.view","asset.upload","notice.view"])assert.ok(perms.includes(p));assert.ok(!perms.includes("notice.publish"));
 assert.equal(db.prepare("SELECT review_status s FROM contents WHERE code='OLD'").get().s,"rejected");db.close();
});
test("V1.9 card operations are only in dialogs and employee configuration only in organization",()=>{
 const source=readFileSync(new URL("../app/modules.tsx",import.meta.url),"utf8");
 const pool=source.slice(source.indexOf("function ContentPool"),source.indexOf("function ReviewCenter"));
 assert.ok(!pool.includes("<EmployeeColors"));assert.match(pool,/content-board-grid/);assert.match(pool,/expanded-content-list/);assert.match(pool,/renderDetail/);
 const cardStart=pool.indexOf('className="content-board-card compact-content-card');assert.ok(cardStart>=0);const card=pool.slice(cardStart,pool.indexOf('</article>)',cardStart));
 assert.doesNotMatch(card,/<footer|提交审核|结束处理|type="checkbox"/);
 const organization=source.slice(source.indexOf("function OrganizationLive"));assert.match(organization,/员工识别颜色/);assert.match(organization,/contentColor/);
});
