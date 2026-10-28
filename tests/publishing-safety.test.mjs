import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context);
    throw error;
  }
}});
const { savePublishingDetails, setPublishingStatus, PublishingConflict } = await import('../lib/publishing-write.ts');
const { deleteReportDraft } = await import('../lib/report-delete.ts');

// Explicit memory-only fixtures: never import the app DB or execute migrations.
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE contents(id INTEGER PRIMARY KEY, account_id INTEGER, review_status TEXT, archived_at TEXT, deleted_at TEXT, latest_version_number INTEGER, product_id INTEGER, product_master_id INTEGER, business_activity_at TEXT, updated_at TEXT);
    CREATE TABLE platforms(id INTEGER PRIMARY KEY);
    CREATE TABLE products(id INTEGER PRIMARY KEY, platform_id INTEGER, status TEXT);
    CREATE TABLE product_masters(id INTEGER PRIMARY KEY, status TEXT);
    CREATE TABLE short_video_accounts(id INTEGER PRIMARY KEY, platform_id INTEGER, status TEXT);
    CREATE TABLE content_versions(id INTEGER PRIMARY KEY, content_id INTEGER, version_number INTEGER, upload_status TEXT, deleted_at TEXT);
    CREATE TABLE platform_contents(id INTEGER PRIMARY KEY, source_content_id INTEGER REFERENCES contents(id), version_id INTEGER, platform_id INTEGER, account_id INTEGER, product_id INTEGER REFERENCES products(id), product_master_id INTEGER REFERENCES product_masters(id), publish_owner_user_id INTEGER, handler_user_id INTEGER, handling_started_at TEXT, row_version INTEGER DEFAULT 0, publish_status TEXT DEFAULT 'pending', published_at TEXT, deleted_at TEXT, updated_at TEXT);
    CREATE TABLE publication_copies(id INTEGER PRIMARY KEY, platform_content_id INTEGER UNIQUE REFERENCES platform_contents(id),title TEXT,body TEXT,topics_json TEXT,source TEXT,updated_by_user_id INTEGER,updated_at TEXT);
    CREATE TABLE publication_events(id INTEGER PRIMARY KEY, platform_content_id INTEGER REFERENCES platform_contents(id),event_type TEXT,operator_user_id INTEGER);
    INSERT INTO contents VALUES(1,10,'approved',NULL,NULL,1,7,70,NULL,NULL);
    INSERT INTO platforms VALUES(1),(2);
    INSERT INTO products VALUES(7,1,'active'),(8,1,'active');
    INSERT INTO product_masters VALUES(70,'active'),(80,'active');
    INSERT INTO short_video_accounts VALUES(10,1,'active');
    INSERT INTO content_versions VALUES(100,1,1,'complete',NULL);
    INSERT INTO platform_contents(id,source_content_id,version_id,platform_id,account_id,product_id,product_master_id,handler_user_id) VALUES(20,1,100,1,10,7,70,3);
  `);
  return db;
}
function save(db, overrides={}) {
  return savePublishingDetails(db, {contentId:1,userId:3,accountIds:[10],expectedAssignments:[{id:20,rowVersion:0}],assignments:[{platformId:1,accountId:10,productMasterId:null,copy:{title:'新标题',body:'正文'}}],now:'2026-10-27T00:00:00Z',...overrides});
}
function status(db, overrides={}) {
  return setPublishingStatus(db,{id:20,userId:3,accountIds:[10],expectedVersion:0,published:true,now:'2026-10-27T00:00:00Z',...overrides});
}

test('publishing accepts no product and preserves it after saving again', t => {
  const db=fixture(t); save(db);
  assert.equal(db.prepare('SELECT product_master_id FROM platform_contents').get().product_master_id,null);
  save(db,{expectedAssignments:[{id:20,rowVersion:1}]});
  assert.equal(db.prepare('SELECT product_master_id FROM platform_contents').get().product_master_id,null);
  status(db,{expectedVersion:2});
  assert.equal(db.prepare('SELECT publish_status FROM platform_contents').get().publish_status,'published');
});
test('publishing can replace a product and keep the source association', t => {
  const db=fixture(t); save(db,{assignments:[{platformId:1,accountId:10,productMasterId:80}]});
  assert.equal(db.prepare('SELECT product_master_id FROM platform_contents').get().product_master_id,80);
  assert.equal(db.prepare('SELECT product_id FROM contents').get().product_id,7);
});
test('stale details cannot overwrite a newer save', t => {
  const db=fixture(t);save(db);assert.throws(()=>save(db),PublishingConflict);
  assert.equal(db.prepare('SELECT row_version FROM platform_contents').get().row_version,1);
});
test('reassigned or unclaimed tasks cannot save or change status', t => {
  const db=fixture(t);
  for (const handler of [4,null]) {
    db.prepare('UPDATE platform_contents SET handler_user_id=?').run(handler);
    assert.throws(()=>save(db),PublishingConflict);assert.throws(()=>status(db),PublishingConflict);
  }
});
test('status changes reject stale versions and duplicate submissions', t => {
  const db=fixture(t); status(db);assert.throws(()=>status(db),PublishingConflict);
  assert.equal(db.prepare('SELECT count(*) AS n FROM publication_events').get().n,1);
});
test('archived, deleted, or unapproved content cannot be published', t => {
  const db=fixture(t);
  for(const sql of ["UPDATE contents SET archived_at='now'","UPDATE contents SET archived_at=NULL,deleted_at='now'","UPDATE contents SET deleted_at=NULL,review_status='rejected'"]) {
    db.exec(sql);assert.throws(()=>save(db),PublishingConflict);assert.throws(()=>status(db),PublishingConflict);
  }
});
test('copy failure rolls back assignments, source product and version increments', t => {
  const db=fixture(t);db.exec("CREATE TRIGGER reject_copy BEFORE INSERT ON publication_copies BEGIN SELECT RAISE(ABORT,'simulated disk/constraint failure'); END;");
  assert.throws(()=>save(db));
  const row=db.prepare('SELECT * FROM platform_contents').get();assert.equal(row.product_master_id,70);assert.equal(row.product_id,7);assert.equal(row.row_version,0);
  assert.equal(db.prepare('SELECT product_id FROM contents').get().product_id,7);
});
test('event failure rolls back publish status and content timestamp', t => {
  const db=fixture(t);db.exec("CREATE TRIGGER reject_event BEFORE INSERT ON publication_events BEGIN SELECT RAISE(ABORT,'event failure'); END;");
  assert.throws(()=>status(db));assert.equal(db.prepare('SELECT publish_status FROM platform_contents').get().publish_status,'pending');
  assert.equal(db.prepare('SELECT updated_at FROM contents').get().updated_at,null);
});
test('changed assignment membership or unauthorized account rejects saving', t => {
  const db=fixture(t);assert.throws(()=>save(db,{expectedAssignments:[]}),PublishingConflict);
  assert.throws(()=>save(db,{accountIds:[]}),PublishingConflict);
  assert.throws(()=>save(db,{assignments:[{platformId:1,accountId:11}]}),PublishingConflict);
});
test('inactive and missing catalog products reject saving', t => {
  const db=fixture(t);db.exec("UPDATE product_masters SET status='inactive' WHERE id=80");
  assert.throws(()=>save(db,{assignments:[{platformId:1,accountId:10,productMasterId:80}]}),PublishingConflict);
  assert.throws(()=>save(db,{assignments:[{platformId:1,accountId:10,productMasterId:999}]}),PublishingConflict);
});
function reportFixture(t) {
  const db = new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE work_reports(id INTEGER PRIMARY KEY, submitter_user_id INTEGER,status TEXT);
    CREATE TABLE work_report_attachments(id INTEGER PRIMARY KEY,report_id INTEGER REFERENCES work_reports(id),storage_path TEXT);
    CREATE TABLE work_report_activity_logs(report_id INTEGER REFERENCES work_reports(id));
    CREATE TABLE work_report_hidden(report_id INTEGER REFERENCES work_reports(id));
    CREATE TABLE work_report_recipient_reads(report_id INTEGER REFERENCES work_reports(id));
    INSERT INTO work_reports VALUES(1,3,'draft');
    INSERT INTO work_report_attachments VALUES(1,1,'work-reports/1/image');
    INSERT INTO work_report_activity_logs VALUES(1);
    INSERT INTO work_report_hidden VALUES(1);
  `);return db;
}
test('deleting an attachment draft removes child rows and returns exact cleanup paths',t=>{
  const db=reportFixture(t);assert.deepEqual(deleteReportDraft(db,1,3),['work-reports/1/image','work-reports/1/previews/1.pdf']);
  assert.equal(db.prepare('SELECT count(*) AS n FROM work_reports').get().n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('submitted and other-user reports are preserved with attachments',t=>{
  const db=reportFixture(t);assert.throws(()=>deleteReportDraft(db,1,4),PublishingConflict);
  db.exec("UPDATE work_reports SET status='submitted'");assert.throws(()=>deleteReportDraft(db,1,3),PublishingConflict);
  assert.equal(db.prepare('SELECT count(*) AS n FROM work_report_attachments').get().n,1);
});
test('failed draft deletion rolls back attachment metadata',t=>{
  const db=reportFixture(t);db.exec("CREATE TRIGGER reject_report BEFORE DELETE ON work_reports BEGIN SELECT RAISE(ABORT,'delete failure'); END;");
  assert.throws(()=>deleteReportDraft(db,1,3));
  assert.equal(db.prepare('SELECT count(*) AS n FROM work_report_attachments').get().n,1);
});

test('new publishing tasks default to the source catalog product without changing the source',t=>{
  const db=fixture(t);db.exec('DELETE FROM platform_contents');
  save(db,{expectedAssignments:[],assignments:[{platformId:1,accountId:10}]});
  assert.equal(db.prepare('SELECT product_master_id FROM platform_contents').get().product_master_id,70);
  assert.equal(db.prepare('SELECT product_master_id FROM contents').get().product_master_id,70);
});
test('explicit no-product on a new task overrides the source default',t=>{
  const db=fixture(t);db.exec('DELETE FROM platform_contents');
  save(db,{expectedAssignments:[]});
  assert.equal(db.prepare('SELECT product_master_id FROM platform_contents').get().product_master_id,null);
});
test('a disabled historical association can be retained without blocking publication',t=>{
  const db=fixture(t);db.exec("UPDATE product_masters SET status='inactive' WHERE id=70");
  save(db,{assignments:[{platformId:1,accountId:10,productMasterId:70}]});
  status(db,{expectedVersion:1});
  assert.equal(db.prepare('SELECT publish_status FROM platform_contents').get().publish_status,'published');
});
test('no active product and no source product still allows a new publishing task',t=>{
  const db=fixture(t);db.exec("DELETE FROM platform_contents; UPDATE contents SET product_id=NULL,product_master_id=NULL; DELETE FROM product_masters");
  save(db,{expectedAssignments:[],assignments:[{platformId:1,accountId:10}]});
  assert.equal(db.prepare('SELECT product_master_id FROM platform_contents').get().product_master_id,null);
});
