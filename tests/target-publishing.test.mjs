import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {writeTargetPublishing,writeTargetPublishingBatch}=await import('../lib/target-publishing.ts');
const {visibleProjectIds,bindProjectRequest}=await import('../lib/project-access.ts');
const dir=new URL('../drizzle/',import.meta.url);
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(dir).filter(n=>/^\d+.*\.sql$/.test(n)).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
 const project=Number(db.prepare("SELECT id FROM short_video_accounts WHERE name='十乐'").get().id);
 db.prepare("INSERT INTO short_video_accounts(id,platform_id,code,name) SELECT 200,platform_id,'B','项目B' FROM short_video_accounts LIMIT 1").run();
 db.exec(`INSERT INTO roles(id,code,name) VALUES(100,'test','测试');
 INSERT INTO users(id,username,display_name,password_hash,role_id) VALUES(100,'one','甲','test',100),(101,'two','乙','test',100);
 INSERT INTO content_groups(id,code,name,account_id) VALUES(100,'groupA','A组',${project}),(200,'groupB','B组',200);
 INSERT INTO product_masters(id,project_id,name,created_by_user_id) VALUES(100,${project},'产品',100),(200,200,'产品',100);
 INSERT INTO contents(id,code,title,content_type,account_id,group_id,uploader_user_id,review_status,product_master_id) VALUES(100,'A','内容A','video',${project},100,100,'approved',100);
 INSERT INTO content_versions(id,content_id,version_number,file_name,storage_path,mime_type,file_size,uploaded_by_user_id,upload_status) VALUES(100,100,1,'a.mp4','a.mp4','video/mp4',4,100,'complete');
 INSERT INTO publishing_targets(id,project_id,name) VALUES(100,${project},'主号'),(101,${project},'副号'),(200,200,'B账号');`);
 db.prepare('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)').run(project,100,100);db.prepare('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)').run(200,100,100);
 return {db,project};
}
function write(db,project,overrides={}){return writeTargetPublishing(db,{projectId:project,contentCode:'A',targetId:100,userId:100,expectedRevision:0,published:true,...overrides});}
test('multiple targets on one content have independent lights and operator logs',t=>{
 const {db,project}=fixture(t);write(db,project);write(db,project,{targetId:101,userId:101});
 assert.equal(db.prepare('SELECT count(*) n FROM publishing_records WHERE published=1').get().n,2);
 assert.deepEqual(db.prepare('SELECT operator_user_id FROM publishing_events ORDER BY id').all().map(row=>Number(row.operator_user_id)),[100,101]);
});
test('stale operator cannot overwrite another operator status',t=>{const {db,project}=fixture(t);write(db,project);assert.throws(()=>write(db,project,{userId:101,published:false}),/已被其他人员更新/);assert.equal(db.prepare('SELECT published FROM publishing_records').get().published,1);});
test('another operator can update with a fresh revision, preserving audit history',t=>{const {db,project}=fixture(t);write(db,project);write(db,project,{userId:101,expectedRevision:1,published:false});assert.equal(db.prepare('SELECT count(*) n FROM publishing_events').get().n,2);assert.equal(db.prepare('SELECT published FROM publishing_records').get().published,0);});
test('cross-project targets and product links are rejected',t=>{const {db,project}=fixture(t);assert.throws(()=>write(db,project,{targetId:200}),/不属于/);assert.throws(()=>write(db,project,{published:undefined,details:{productMasterId:200}}),/不属于/);});
test('no-product publishing works and source product remains unchanged',t=>{const {db,project}=fixture(t);write(db,project,{published:undefined,details:{productMasterId:null,title:'独立文案'}});write(db,project,{expectedRevision:1});assert.equal(db.prepare('SELECT product_master_id FROM publishing_records').get().product_master_id,null);assert.equal(db.prepare('SELECT product_master_id FROM contents WHERE id=100').get().product_master_id,100);});
test('first target record defaults to source product unless explicitly cancelled',t=>{const {db,project}=fixture(t);write(db,project);assert.equal(db.prepare('SELECT product_master_id FROM publishing_records').get().product_master_id,100);});
test('inactive targets retain history and can be unlit but cannot get new publications',t=>{const {db,project}=fixture(t);write(db,project);db.exec("UPDATE publishing_targets SET status='inactive' WHERE id=100");assert.throws(()=>write(db,project,{expectedRevision:1}),/停用/);write(db,project,{expectedRevision:1,published:false});assert.equal(db.prepare('SELECT published FROM publishing_records').get().published,0);});
test('event failure rolls back record creation and status',t=>{const {db,project}=fixture(t);db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON publishing_events BEGIN SELECT RAISE(ABORT,'failure');END;");assert.throws(()=>write(db,project));assert.equal(db.prepare('SELECT count(*) n FROM publishing_records').get().n,0);});
test('system management visibility alone does not grant project entry',t=>{const {db}=fixture(t);assert.deepEqual(visibleProjectIds(db,{id:101,roleCode:'manager',permissions:['admin.view','business.view'],primaryGroupId:null,groupScopes:{}}),[]);});
test('per-request project checks reject forged headers and cross-project object edits',async t=>{
 const {db,project}=fixture(t);const user=()=>({id:100,roleCode:'super_admin',permissions:['*'],deniedPermissions:[],primaryGroupId:100,groupScopes:{view:[100,200]}});
 const req=(path,p,data)=>new Request('http://local'+path,{headers:{'x-orbit-project-id':String(p),...(data?{'content-type':'application/json'}:{})},...(data?{method:'PATCH',body:JSON.stringify(data)}:{})});
 assert.equal((await bindProjectRequest(db,req('/api/contents/A',200),user())).status,403);
 assert.equal((await bindProjectRequest(db,req('/api/product-masters',200,{id:100,name:'rename'}),user())).status,403);
 assert.equal((await bindProjectRequest(db,req('/api/product-masters?id=100',200),user())).status,403);
 const actor=user();assert.equal(await bindProjectRequest(db,req('/api/contents',project),actor),null);assert.deepEqual(actor.groupScopes.view,[100]);
});

test('an existing source product can remain linked after it is disabled without blocking publishing',t=>{const {db,project}=fixture(t);db.exec("UPDATE product_masters SET status='inactive' WHERE id=100");write(db,project);assert.equal(db.prepare('SELECT published FROM publishing_records').get().published,1);assert.equal(db.prepare('SELECT product_master_id FROM publishing_records').get().product_master_id,100);});

test('batch lights share one transaction, retain product details and avoid duplicate logs for lit rows',t=>{
 const {db,project}=fixture(t);
 write(db,project,{published:false,details:{productMasterId:null,title:'独立发布标题'}});
 const result=writeTargetPublishingBatch(db,{projectId:project,userId:101,targetId:100,items:[{contentCode:'A',expectedRevision:1}]});
 assert.equal(result[0].revision,2);assert.equal(db.prepare('SELECT product_master_id FROM publishing_records').get().product_master_id,null);
 const count=db.prepare('SELECT count(*) n FROM publishing_events').get().n;
 assert.equal(writeTargetPublishingBatch(db,{projectId:project,userId:101,targetId:100,items:[{contentCode:'A',expectedRevision:2}]})[0].unchanged,true);
 assert.equal(db.prepare('SELECT count(*) n FROM publishing_events').get().n,count);
 assert.equal(db.prepare('SELECT product_master_id FROM contents').get().product_master_id,100);
});
test('batch stale revisions or foreign content roll back every previous record and log',t=>{
 const {db,project}=fixture(t);
 for(const item of [{contentCode:'A',expectedRevision:99},{contentCode:'missing',expectedRevision:0}]){
  assert.throws(()=>writeTargetPublishingBatch(db,{projectId:project,userId:100,targetId:100,items:[{contentCode:'A',expectedRevision:0},item]}));
  assert.equal(db.prepare('SELECT count(*) n FROM publishing_records').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM publishing_events').get().n,0);
 }
});

test('batch updates two contents together and invalid targets roll back without events',t=>{
 const {db,project}=fixture(t);
 db.exec(`INSERT INTO contents(id,code,title,content_type,account_id,group_id,uploader_user_id,review_status) SELECT 101,'A2','第二条','video',account_id,group_id,uploader_user_id,'approved' FROM contents WHERE id=100;
 INSERT INTO content_versions(id,content_id,version_number,file_name,storage_path,mime_type,file_size,uploaded_by_user_id,upload_status) VALUES(101,101,1,'b.mp4','b.mp4','video/mp4',4,100,'complete');`);
 const items=[{contentCode:'A',expectedRevision:0},{contentCode:'A2',expectedRevision:0}];
 assert.throws(()=>writeTargetPublishingBatch(db,{projectId:project,userId:100,targetId:200,items}));
 assert.equal(db.prepare('SELECT count(*) n FROM publishing_events').get().n,0);
 const result=writeTargetPublishingBatch(db,{projectId:project,userId:101,targetId:100,items});
 assert.equal(result.length,2);assert.equal(db.prepare('SELECT count(*) n FROM publishing_records WHERE published=1').get().n,2);
 assert.equal(db.prepare('SELECT count(*) n FROM publishing_events WHERE operator_user_id=101').get().n,2);
});
