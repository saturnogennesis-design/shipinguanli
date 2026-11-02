import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
const base=process.env.ORBIT_E2E_BASE_URL,state=JSON.parse(await readFile(process.env.ORBIT_QA_STATE_FILE,'utf8')),dbPath=process.env.ORBIT_QA_DB_PATH;
if(!base||!dbPath?.startsWith('/tmp/orbit-'))throw Error('Isolated temporary release fixture required');
let checks=0;const headers={cookie:state.adminCookie,'x-orbit-project-id':String(state.a)};
async function req(path,body,status=200,custom=headers){const r=await fetch(base+path,{method:body?'PATCH':'GET',headers:{...custom,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(d));checks++;return d;}
async function detail(id){return req('/api/cross-records?id='+id);}
async function change(id,action,body={},status=200,custom=headers){const row=(await detail(id)).row;return req('/api/cross-records/'+id,{action,revision:row.revision,...body},status,custom);}
const initial=await detail(state.main),oldVersions=initial.versions.map(v=>v.snapshot_json),summary=(await req('/api/cross-records')).summary;
await change(state.main,'sample',{sampled:true});assert.equal((await detail(state.main)).row.isSampled,true);assert.equal((await detail(state.child)).row.isSampled,true);assert.deepEqual((await detail(state.main)).versions.map(v=>v.snapshot_json),oldVersions);checks+=3;
await change(state.main,'sample',{sampled:false},403,{...headers,cookie:state.viewerCookie});await change(state.child,'sample',{sampled:false},409);
await change(state.child,'delete');await change(state.main,'archive');assert.equal((await req('/api/cross-records')).summary.package,summary.package-2);await change(state.main,'sample',{sampled:false},409);await change(state.main,'delete');assert.equal((await req('/api/cross-records')).summary.package,summary.package-2);await change(state.main,'restore');assert.equal((await req('/api/cross-records')).summary.package,summary.package-2);await change(state.main,'unarchive');assert.equal((await req('/api/cross-records')).summary.package,summary.package-1);await change(state.child,'restore');assert.equal((await req('/api/cross-records')).summary.package,summary.package);checks+=5;
const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON');const actor=Number(db.prepare("SELECT id FROM users WHERE username='hjt'").get().id),project=Number(db.prepare("SELECT id FROM short_video_accounts WHERE project_type='short_video' ORDER BY id LIMIT 1").get().id),suffix=Date.now();
db.exec('BEGIN IMMEDIATE');
try{const target=Number(db.prepare('INSERT INTO publishing_targets(project_id,name) VALUES(?,?) RETURNING id').get(project,'统计验收目标'+suffix).id);
 for(const [i,status] of ['active','archived','deleted'].entries()){
  const content=Number(db.prepare("INSERT INTO contents(code,title,content_type,uploader_user_id,account_id,review_status,archived_at,deleted_at) VALUES(?,?,'video',?,?,'approved',?,?) RETURNING id").get('STAT-'+suffix+'-'+i,'统计样本'+status,actor,project,status==='archived'?'2026-11-01 00:00:00':null,status==='deleted'?'2026-11-01 00:00:00':null).id);
  const version=Number(db.prepare("INSERT INTO content_versions(content_id,version_number,file_name,storage_path,mime_type,file_size,uploaded_by_user_id) VALUES(?,1,'synthetic.mp4',?,'video/mp4',1,?) RETURNING id").get(content,'synthetic/stat-'+suffix+'-'+i,actor).id);
  const record=Number(db.prepare('INSERT INTO publishing_records(content_id,target_id,version_id,published,updated_by_user_id) VALUES(?,?,?,1,?) RETURNING id').get(content,target,version,actor).id);
  db.prepare("INSERT INTO publishing_metrics(record_id,recorded_on,views,recorded_by_user_id) VALUES(?,'2026-11-02',?,?)").run(record,100+i,actor);
 }db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
const stats=await req('/api/analytics',undefined,200,{cookie:state.adminCookie,'x-orbit-project-id':String(project)});
assert.equal(stats.totals.contentCount,1);assert.equal(stats.totals.publicationCount,1);assert.equal(stats.metrics.length,1);assert.equal(stats.metrics[0].views,100);checks+=4;
console.log(JSON.stringify({checks,samplingPersisted:true,samplingInheritance:true,statisticsExcludeArchivedAndDeleted:true}));
