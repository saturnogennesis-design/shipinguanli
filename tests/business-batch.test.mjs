import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {registerHooks} from 'node:module';import {pathToFileURL} from 'node:url';
const root=mkdtempSync(join(tmpdir(),'orbit-batch-unit-'));process.env.ORBIT_DB_PATH=join(root,'db.sqlite');process.env.ORBIT_MEDIA_DIR=join(root,'media');
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('@/')){for(const suffix of ['.ts','/index.ts'])try{return next(pathToFileURL(join(process.cwd(),s.slice(2)+suffix)).href,c);}catch{}}if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))return next(s+'.ts',c);throw e;}}});
const {getLocalDatabase}=await import('../db/index.ts');const db=getLocalDatabase();
const {runBatchItem,rowRevision,batchRecord}=await import('../lib/business-batch.ts');const {atomicWrite}=await import('../lib/publishing-write.ts');const {unreadCrossNotes,readCrossNotes}=await import('../lib/cross-note-reads.ts');
test.after(()=>{db.close();rmSync(root,{recursive:true,force:true});});let serial=0;
function setup(type='cross_border'){
 const tag='batch'+(++serial);const role=Number(db.prepare("INSERT INTO roles(code,name) VALUES(?,?) RETURNING id").get(tag,tag).id);
 const owner=Number(db.prepare("INSERT INTO users(username,display_name,password_hash,role_id) VALUES(?,?,'x',?) RETURNING id").get(tag+'a','制作人',role).id),other=Number(db.prepare("INSERT INTO users(username,display_name,password_hash,role_id) VALUES(?,?,'x',?) RETURNING id").get(tag+'b','其他人',role).id);
 const project=Number(db.prepare("INSERT INTO short_video_accounts(platform_id,code,name,project_type) SELECT platform_id,?,?,? FROM short_video_accounts LIMIT 1 RETURNING id").get(tag,tag,type).id);
 for(const id of [owner,other])db.prepare('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)').run(project,id,owner);
 const permissions=['cross.view','cross.create','cross.edit','cross.archive','cross.delete','cross.assign','content.view','content.submit','content.withdraw','content.archive','content.delete','content.download','asset.view','asset.upload','asset.archive','asset.delete','asset.claim'];
 for(const id of [owner,other])db.prepare('INSERT INTO project_user_permissions(project_id,user_id,permissions_json,scope_version,updated_by) VALUES(?,?,?,2,?)').run(project,id,JSON.stringify(permissions),owner);
 const user={id:owner,username:tag+'a',roleCode:'employee',projectId:project,projectConfigured:true,permissions,deniedPermissions:[],groupScopes:{}};
 return {owner,other,project,user};
}
function clue(f,title='线索'){return Number(db.prepare("INSERT INTO cross_records(project_id,kind,title,creator_id,maker_id,body_json) VALUES(?,'clue',?,?,?,'{\"keywords\":\"验收\"}') RETURNING id").get(f.project,title,f.owner,f.owner).id);}
function row(kind,id){return db.prepare('SELECT * FROM '+({cross:'cross_records',content:'contents',material:'material_sets'})[kind]+' WHERE id=?').get(id);}
function run(f,kind,id,action,options={},preview=false,key=''){return runBatchItem(db,f.user,kind,id,action,options,rowRevision(row(kind,id)),preview,key);}
test('nested preview rolls back records, versions, receipts and audits; actual submit is idempotent',()=>{
 const f=setup(),id=clue(f),before=row('cross',id),audit=Number(db.prepare('SELECT count(*) n FROM audit_logs').get().n);
 run(f,'cross',id,'submit',{},true);assert.deepEqual(row('cross',id),before);assert.equal(db.prepare('SELECT count(*) n FROM cross_versions WHERE record_id=?').get(id).n,0);assert.equal(db.prepare('SELECT count(*) n FROM audit_logs').get().n,audit);
 const result=run(f,'cross',id,'submit',{},false,'repeat-submit-0001');assert.equal(row('cross',id).version_number,1);
 assert.deepEqual(runBatchItem(db,f.user,'cross',id,'submit',{},before.revision,false,'repeat-submit-0001'),result);assert.equal(row('cross',id).version_number,1);
 assert.throws(()=>runBatchItem(db,f.user,'cross',id,'delete',{},before.revision,false,'different-request-0001'),/已更新/);
});
test('batch delete never cascades through active descendants; a blocked record does not prevent processing another',()=>{
 const f=setup(),parent=clue(f,'有母版'),free=clue(f,'可删除');db.prepare("INSERT INTO cross_records(project_id,kind,parent_id,title,creator_id,maker_id) VALUES(?,'mother',?,'母版',?,?)").run(f.project,parent,f.owner,f.owner);
 assert.throws(()=>run(f,'cross',parent,'delete'),/下级/);run(f,'cross',free,'delete');assert.equal(row('cross',parent).lifecycle,'active');assert.equal(row('cross',free).lifecycle,'deleted');run(f,'cross',free,'restore');assert.equal(row('cross',free).lifecycle,'active');
});
test('assignment preview never transfers work; actual transfer leaves historical mother ownership fixed and priority remains leader-only',()=>{
 const f=setup(),id=clue(f);run(f,'cross',id,'assign',{assigneeId:f.other},true);assert.equal(row('cross',id).assignee_id,f.owner);
 db.prepare("INSERT INTO cross_records(project_id,kind,parent_id,title,creator_id,maker_id) VALUES(?,'mother',?,'历史母版',?,?)").run(f.project,id,f.owner,f.owner);
 run(f,'cross',id,'assign',{assigneeId:f.other});assert.equal(row('cross',id).assignee_id,f.other);assert.equal(db.prepare('SELECT creator_id FROM cross_records WHERE parent_id=?').get(id).creator_id,f.owner);
 assert.throws(()=>run(f,'cross',id,'urgency',{urgency:2}),/无权访问/);db.prepare('INSERT INTO project_leaders VALUES(?,?)').run(f.project,f.owner);run(f,'cross',id,'urgency',{urgency:2});assert.equal(row('cross',id).urgency,2);
});
test('project gates and per-project operation grants cannot be bypassed with batch IDs',()=>{
 const f=setup(),id=clue(f);db.prepare('UPDATE project_user_permissions SET permissions_json=? WHERE project_id=? AND user_id=?').run('["cross.view"]',f.project,f.owner);assert.throws(()=>run(f,'cross',id,'delete'),/权限/);db.prepare('DELETE FROM project_visibility WHERE project_id=? AND user_id=?').run(f.project,f.owner);assert.throws(()=>batchRecord(db,f.user,'cross',id),/项目/);
});
test('content withdraw rejects review locks, stays atomic and refuses deletion before withdrawal',()=>{
 const f=setup('short_video'),id=Number(db.prepare("INSERT INTO contents(code,title,content_type,uploader_user_id,account_id,review_status) VALUES(?,'待审核','video',?,?,'pending') RETURNING id").get('content-'+serial,f.owner,f.project).id);
 db.prepare("INSERT INTO content_versions(content_id,version_number,file_name,mime_type,file_size,storage_path,uploaded_by_user_id,upload_status,review_status) VALUES(?,1,'x.mp4','video/mp4',3,'qa/x',?,'complete','pending')").run(id,f.owner);
 assert.throws(()=>run(f,'content',id,'delete'),/撤回/);
 const session=Number(db.prepare("INSERT INTO review_sessions(reviewer_user_id,expires_at) VALUES(?,datetime('now','+1 hour')) RETURNING id").get(f.other).id);db.prepare("INSERT INTO content_review_locks(content_id,reviewer_user_id,session_id,expires_at) VALUES(?,?,?,datetime('now','+1 hour'))").run(id,f.other,session);assert.throws(()=>run(f,'content',id,'withdraw'),/正在审核/);db.prepare('DELETE FROM content_review_locks WHERE content_id=?').run(id);
 run(f,'content',id,'withdraw',{},true);assert.equal(row('content',id).review_status,'pending');run(f,'content',id,'withdraw');assert.equal(row('content',id).review_status,'draft');assert.equal(db.prepare('SELECT review_status FROM content_versions WHERE content_id=?').get(id).review_status,'draft');run(f,'content',id,'delete');run(f,'content',id,'restore');assert.equal(row('content',id).review_status,'draft');
});
test('material batch submission requires complete files and rejected-work explanation; withdraw is pending-only',()=>{
 const f=setup('short_video'),id=Number(db.prepare("INSERT INTO material_sets(code,title,description,category,account_id,uploader_user_id,status) VALUES(?,'素材','说明','分类',?,?,'rejected') RETURNING id").get('material-'+serial,f.project,f.owner).id);
 assert.throws(()=>run(f,'material',id,'submit'),/文件/);
 db.prepare("INSERT INTO material_files(set_id,position,file_name,mime_type,file_size,storage_path,upload_status) VALUES(?,1,'x.png','image/png',3,'qa/image','complete')").run(id);assert.throws(()=>run(f,'material',id,'submit'),/修改说明/);
 run(f,'material',id,'submit',{resubmissionNote:'已修改'},true);assert.equal(row('material',id).status,'rejected');run(f,'material',id,'submit',{resubmissionNote:'已修改'});assert.equal(row('material',id).status,'pending');assert.throws(()=>run(f,'material',id,'delete'),/撤回/);run(f,'material',id,'withdraw');assert.equal(row('material',id).status,'draft');assert.throws(()=>run(f,'material',id,'withdraw'),/仅待审核/);
});
test('remark unread excludes own notes, is account-specific, monotonic and never clears later remarks',()=>{
 const f=setup(),id=clue(f);const note=author=>Number(db.prepare("INSERT INTO cross_notes(record_id,author_id,body) VALUES(?,?,'新增备注') RETURNING id").get(id,author).id);
 note(f.owner);const seen=note(f.other);assert.equal(unreadCrossNotes(db,f.user,f.project,id),1);const newer=note(f.other);readCrossNotes(db,f.user,id,seen);assert.equal(unreadCrossNotes(db,f.user,f.project,id),1);readCrossNotes(db,f.user,id,newer);readCrossNotes(db,f.user,id,seen);assert.equal(unreadCrossNotes(db,f.user,f.project,id),0);assert.throws(()=>readCrossNotes(db,f.user,id,newer+100),/无效/);
});
test('an inner failure rolls back only the nested operation and preserves the outer transaction',()=>{
 let okay=false;atomicWrite(db,()=>{assert.throws(()=>atomicWrite(db,()=>{throw Error('inner');}),/inner/);assert.equal(db.isTransaction,true);okay=true;});assert.equal(okay,true);assert.equal(db.isTransaction,false);
});
test('nested batches work with a SQLite connection adapter lacking isTransaction',()=>{
 const legacy={exec:db.exec.bind(db),prepare:db.prepare.bind(db)};
 atomicWrite(legacy,()=>{atomicWrite(legacy,()=>db.prepare("INSERT INTO roles(code,name) VALUES('minimum-node','compatibility')").run());});assert.ok(db.prepare("SELECT 1 FROM roles WHERE code='minimum-node'").get());atomicWrite(legacy,()=>atomicWrite(legacy,()=>db.prepare("INSERT INTO roles(code,name) VALUES('preview-minimum','rollback')").run()),{rollback:true});assert.equal(db.prepare("SELECT 1 FROM roles WHERE code='preview-minimum'").get(),undefined);
});
