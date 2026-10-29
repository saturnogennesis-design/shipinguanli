import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readdirSync,readFileSync} from 'node:fs';
const dir=new URL('../drizzle/',import.meta.url);
test('lamp appearance upgrade preserves target identities, states and publishing logs',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');try{
 for(const name of readdirSync(dir).filter(name=>/^\d+.*\.sql$/.test(name)&&name<'0036').sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
 const project=db.prepare('SELECT id FROM short_video_accounts LIMIT 1').get().id;
 db.exec(`INSERT INTO roles(id,code,name) VALUES(90,'lamp-test','测试');INSERT INTO users(id,username,display_name,password_hash,role_id) VALUES(90,'lamp-test','员工','test',90);
 INSERT INTO publishing_targets(id,project_id,name,status,sort_order) VALUES(90,${project},'原发布目标','inactive',7);
 INSERT INTO contents(id,code,title,content_type,account_id,uploader_user_id,review_status) VALUES(90,'LAMP','原内容','video',${project},90,'approved');
 INSERT INTO content_versions(id,content_id,version_number,file_name,storage_path,mime_type,file_size,uploaded_by_user_id,upload_status) VALUES(90,90,1,'original.mp4','original/path','video/mp4',4,90,'complete');
 INSERT INTO publishing_records(id,content_id,target_id,version_id,published,revision,updated_by_user_id) VALUES(90,90,90,90,1,4,90);
 INSERT INTO publishing_events(record_id,content_id,target_id,operator_user_id,action) VALUES(90,90,90,90,'published');`);
 db.exec(readFileSync(new URL('0036_target_lamp_appearance.sql',dir),'utf8'));
 const row=db.prepare('SELECT * FROM publishing_targets WHERE id=90').get();assert.equal(row.lamp_text,'');assert.equal(row.lamp_color,'#2ca576');assert.equal(row.name,'原发布目标');assert.equal(row.status,'inactive');assert.equal(row.sort_order,7);
 assert.equal(db.prepare('SELECT published FROM publishing_records WHERE id=90').get().published,1);assert.equal(db.prepare('SELECT revision FROM publishing_records WHERE id=90').get().revision,4);assert.equal(db.prepare('SELECT count(*) n FROM publishing_events').get().n,1);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
