import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const directory=new URL('../drizzle/',import.meta.url);
function legacy(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const name of readdirSync(directory).filter(name=>/^\d+.*\.sql$/.test(name)&&name<'0034').sort())db.exec(readFileSync(new URL(name,directory),'utf8'));return db;}
test('existing business moves to 十乐 without changing content, versions, media paths, employees or daily reports',()=>{
 const db=legacy();
 db.exec(`INSERT INTO roles(id,code,name) VALUES(90,'fixture','普通角色');
 INSERT INTO users(id,username,display_name,password_hash,role_id) VALUES(90,'fixture','原员工','test-hash',90);
 INSERT INTO platforms(id,code,name) VALUES(90,'fixture','旧平台');
 INSERT INTO short_video_accounts(id,platform_id,code,name) VALUES(90,90,'old','旧业务账号');
 INSERT INTO content_groups(id,code,name,account_id) VALUES(90,'fixture','原小组',90);
 INSERT INTO user_account_responsibilities(user_id,account_id,responsibility_type) VALUES(90,90,'publisher');
 INSERT INTO product_masters(id,name,created_by_user_id) VALUES(90,'原产品',90);
 INSERT INTO contents(id,code,title,content_type,account_id,group_id,uploader_user_id,review_status,product_master_id) VALUES(90,'OLD-CONTENT','原成片','video',90,90,90,'approved',90);
 INSERT INTO content_versions(id,content_id,version_number,file_name,storage_path,mime_type,file_size,uploaded_by_user_id,upload_status) VALUES(90,90,1,'old.mp4','original/path.mp4','video/mp4',100,90,'complete');
 INSERT INTO platform_contents(id,source_content_id,version_id,platform_id,account_id,publish_status) VALUES(90,90,90,90,90,'published');
 INSERT INTO work_reports(id,code,report_date,submitter_user_id,status,completed) VALUES(90,'OLD-DAILY','2026-10-28',90,'draft','原日报');`);
 db.exec(readFileSync(new URL('0034_projects_and_targets.sql',directory),'utf8'));
 const project=db.prepare("SELECT * FROM short_video_accounts WHERE status='active'").get();assert.equal(project.name,'十乐');
 assert.equal(db.prepare('SELECT account_id FROM contents WHERE id=90').get().account_id,project.id);
 assert.equal(db.prepare('SELECT project_id FROM product_masters WHERE id=90').get().project_id,project.id);
 assert.equal(db.prepare('SELECT storage_path FROM content_versions WHERE id=90').get().storage_path,'original/path.mp4');
 assert.equal(db.prepare('SELECT title FROM contents WHERE id=90').get().title,'原成片');
 assert.equal(db.prepare('SELECT completed FROM work_reports WHERE id=90').get().completed,'原日报');
 assert.ok(db.prepare('SELECT deleted_at FROM platform_contents WHERE id=90').get().deleted_at);
 assert.equal(db.prepare('SELECT count(*) n FROM publishing_targets').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM publishing_records').get().n,0);
 assert.equal(db.prepare('SELECT count(*) n FROM users WHERE id=90').get().n,1);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
test('fresh schema creates one default project and independent target/category tables',()=>{
 const db=legacy();db.exec(readFileSync(new URL('0034_projects_and_targets.sql',directory),'utf8'));
 assert.equal(db.prepare("SELECT name FROM short_video_accounts WHERE status='active'").get().name,'十乐');
 assert.equal(db.prepare('SELECT count(*) n FROM content_categories').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM publishing_targets').get().n,0);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
