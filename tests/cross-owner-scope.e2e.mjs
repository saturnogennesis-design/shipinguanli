import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFile,writeFile,mkdir} from 'node:fs/promises';
const state=JSON.parse(await readFile(process.env.ORBIT_QA_STATE_FILE,'utf8')),base=process.env.ORBIT_E2E_BASE_URL,path=process.env.ORBIT_QA_DB_PATH,media=process.env.ORBIT_MEDIA_DIR;if(!path?.startsWith('/tmp/')||!media?.startsWith('/tmp/'))throw Error('Temporary fixtures required');const {cross,people,adminCookie}=state;let checks=0;
async function req(url,who='owner',body,method=body?'PATCH':'GET',status=200,project=cross){const r=await fetch(base+url,{method,headers:{cookie:who==='admin'?adminCookie:people[who].cookie,'x-orbit-project-id':String(project),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.equal(r.status,status,url+' '+await r.clone().text());checks++;return r.headers.get('content-type')?.includes('application/json')?r.json():new Uint8Array(await r.arrayBuffer());}
const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');const owner=people.owner.id,peer=people.reviewer.id,lead=people.lead.id;
const insert=(kind,title,user,extra={})=>Number(db.prepare("INSERT INTO cross_records(project_id,kind,title,creator_id,maker_id,parent_id,main_id,package_type,status,version_number,body_json) VALUES(?,?,?,?,?,?,?,?,?,1,'{}') RETURNING id").get(cross,kind,title,user,user,extra.parent??null,extra.main??null,extra.type??'main',extra.status??'approved').id);
const a=insert('mother','SCOPE-OWNER',owner),b=insert('mother','SCOPE-PEER-SECRET',peer),main=insert('package','SCOPE-MAIN',owner,{parent:b}),doc=insert('package','SCOPE-DOC-SECRET',peer,{parent:b,main,type:'document'}),child=insert('package','SCOPE-CHILD-SECRET',peer,{parent:a});
await mkdir(media+'/scope',{recursive:true});const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1sAAAAASUVORK5CYII=','base64');await writeFile(media+'/scope/image.png',png);await writeFile(media+'/scope/private.pdf','%PDF-QA');
function file(record,user,document=false){return Number(db.prepare('INSERT INTO cross_files(record_id,storage_path,file_name,mime_type,file_size,uploader_id,shared_json) VALUES(?,?,?,?,?,?,?) RETURNING id').get(record,(document?'scope/private.pdf':'scope/image.png')+'#copy-'+record,document?'SCOPE-SECRET.pdf':'image.png',document?'application/pdf':'image/png',document?7:png.length,user,JSON.stringify([owner])).id);}
const secretClue=insert('clue','SCOPE-CLUE-SECRET',peer);db.prepare('UPDATE cross_records SET parent_id=? WHERE id=?').run(secretClue,a);const ownChild=insert('package','SCOPE-OWN-CHILD',owner,{parent:a});
const af=file(a,owner),bf=file(b,peer),mf=file(main,owner),df=file(doc,peer,true);file(child,peer);
for(const [id,f] of [[a,af],[b,bf],[main,mf],[doc,df]])db.prepare('INSERT INTO cross_versions(record_id,version_number,snapshot_json,submitter_id) VALUES(?,1,?,?)').run(id,JSON.stringify({title:'own version',parentId:id===main?b:id===a?secretClue:null,parentTitle:id===main?'SCOPE-PEER-SECRET':id===a?'SCOPE-CLUE-SECRET':null,data:{},files:[{id:f}]}),owner);
db.prepare("INSERT INTO cross_notes(record_id,author_id,body) VALUES(?,?,'SCOPE-NOTE-SECRET')").run(b,peer);
let list=await req('/api/cross-records');assert.ok(list.items.some(r=>r.id===a));assert.ok(!list.items.some(r=>[b,doc,child].includes(r.id)));assert.equal(list.items.find(r=>r.id===main).parentTitle,null);checks+=3;
const d=await req('/api/cross-records?id='+main);assert.equal(d.parent,null);assert.equal(d.reference,null);assert.equal(d.clue,null);assert.ok(!JSON.stringify(d).includes('SCOPE-PEER-SECRET'));assert.equal(JSON.parse(d.versions[0].snapshot_json).parentTitle,null);checks+=5;
const sourceDetail=await req('/api/cross-records?id='+ownChild);assert.equal(sourceDetail.reference.parentTitle,null);assert.equal(sourceDetail.parent.parentTitle,null);assert.equal(sourceDetail.clue,null);assert.ok(!JSON.stringify(sourceDetail).includes('SCOPE-CLUE-SECRET'));checks+=4;
assert.ok(!(await req('/api/cross-records?id='+a)).related.some(r=>r.id===child));checks++;
for(const id of [b,doc,child])await req('/api/cross-records?id='+id,'owner',undefined,'GET',404);
await req('/api/cross-records/'+b,'owner',{action:'note',note:'forge',revision:1},'PATCH',404);
await req('/api/cross-records','owner',{kind:'package',title:'forged',parentId:b},'POST',400);
for(const id of [bf,df])for(const suffix of ['', '?thumb=1'])await req('/api/cross-records/files/'+id+suffix,'owner',undefined,'GET',404);
await req('/api/cross-records/files/'+bf+'/cover','owner',{},'PUT',403);
db.prepare("UPDATE project_user_permissions SET permissions_json='[\"cross.create\",\"cross.edit\",\"cross.download\"]' WHERE project_id=? AND user_id=?").run(cross,owner);
await req('/api/cross-records/'+doc+'/delivery','owner',undefined,'GET',404);await req('/api/cross-records/'+main+'/delivery?group=1');
await req('/api/cross-records/files/'+df,'owner',{userIds:[owner]},'PATCH',409);
for(const id of [a,b,main,doc,child])await req('/api/cross-records?id='+id,'lead');
for(const id of [bf,df])await req('/api/cross-records/files/'+id,'lead');await req('/api/cross-records/files/'+bf+'?thumb=1','lead');
await req('/api/cross-records/'+b,'lead',{action:'approve',revision:1},'PATCH',403);
// Leadership never supplies the page permission, and a reviewer role never supplies leadership.
db.prepare("INSERT INTO project_user_permissions(project_id,user_id,permissions_json,updated_by,scope_version) VALUES(?,?,'[]',?,3) ON CONFLICT(project_id,user_id) DO UPDATE SET permissions_json='[]',scope_version=3").run(cross,lead,owner);
await req('/api/cross-records','lead',undefined,'GET',403);await req('/api/cross-records/files/'+bf,'lead',undefined,'GET',403);
await req('/api/cross-records?id='+a,'reviewer',undefined,'GET',404);
db.prepare("UPDATE project_user_permissions SET permissions_json='[\"cross.view\"]' WHERE project_id=? AND user_id=?").run(cross,lead);
db.prepare('DELETE FROM project_leaders WHERE project_id=? AND user_id=?').run(cross,lead);await req('/api/cross-records?id='+b,'lead',undefined,'GET',404);
db.prepare('INSERT INTO project_leaders(project_id,user_id) VALUES(?,?)').run(cross,lead);db.prepare('DELETE FROM project_visibility WHERE project_id=? AND user_id=?').run(cross,lead);await req('/api/cross-records','lead',undefined,'GET',403);
db.prepare('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)').run(cross,lead,owner);
await req('/api/cross-records?id='+b,'admin');
console.log(JSON.stringify({checks,ownerOnly:true,leaderScope:true,pageRequired:true,legacySharingIgnored:true,sourceRedacted:true}));db.close();
