import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base=process.env.ORBIT_E2E_BASE_URL,state=JSON.parse(await readFile(process.env.ORBIT_QA_STATE_FILE,'utf8')),dbPath=process.env.ORBIT_QA_DB_PATH,media=process.env.ORBIT_QA_MEDIA_DIR;
if(!dbPath?.startsWith('/tmp/')||!media?.startsWith('/tmp/'))throw Error('Temporary QA database and media required');
const admin=state.adminCookie;let checks=0;
async function req(path,{cookie=admin,project,body,method=body?'POST':'GET',status=200}={}){const r=await fetch(base+path,{method,headers:{cookie,...(project?{'x-orbit-project-id':String(project)}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(d));checks++;return d;}
const stamp=Date.now(),short=(await req('/api/projects',{body:{name:'项目授权短视频'+stamp},status:201})).id,cross=(await req('/api/projects',{body:{name:'项目授权跨境'+stamp,projectType:'cross_border'},status:201})).id;
const systemRole=(await req('/api/admin',{body:{entity:'role',name:'员工基础'+stamp,permissions:[]},status:201})).id;
const people={};for(const who of ['alice','bob','leader','reader','manager']){
 const id=(await req('/api/admin',{body:{entity:'user',username:who+stamp,displayName:who+'授权验收',roleId:systemRole,password:'Roles-QA-2026!'},status:201})).id;
 const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:who+stamp,password:'Roles-QA-2026!'})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];await req('/api/auth/change-password',{cookie,body:{currentPassword:'Roles-QA-2026!',newPassword:'Roles-QA-2026!2'}});people[who]={id,cookie};
}
await req(`/api/projects/${short}/visibility`,{body:{userIds:Object.values(people).map(p=>p.id)},method:'PUT'});await req(`/api/projects/${cross}/visibility`,{body:{userIds:[people.alice.id,people.bob.id,people.manager.id]},method:'PUT'});
const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON');const g1=Number(db.prepare('SELECT id FROM content_groups WHERE account_id=?').get(short).id),g2=Number(db.prepare('INSERT INTO content_groups(code,name,account_id) VALUES(?,?,?) RETURNING id').get('QA-G-'+stamp,'第二制作组',short).id),cg=Number(db.prepare('SELECT id FROM content_groups WHERE account_id=?').get(cross).id);db.prepare('UPDATE content_groups SET leader_user_id=? WHERE id=?').run(people.leader.id,g1);
const roleA=(await req('/api/admin/project-permissions',{body:{projectId:short,name:'内容制作角色',permissions:['content.upload','content.edit','content.submit','version.view']},status:201})).id;
const roleB=(await req('/api/admin/project-permissions',{body:{projectId:cross,name:'跨境制作角色',permissions:['cross.create','cross.edit']},status:201})).id;
async function configure(who,project,permissions,groupIds,roleId=null){const d=await req('/api/admin/project-permissions?projectId='+project),p=d.users.find(p=>p.id===people[who].id);return req('/api/admin/project-permissions',{method:'PUT',body:{projectId:project,userId:p.id,revision:p.revision,roleId,permissions,groupIds}});}
await configure('alice',short,[],[g1],roleA);await configure('bob',short,[],[g1],roleA);await configure('leader',short,['content.view','version.view','analytics.view'],[g1]);await configure('reader',short,['review.view'],[g1]);await configure('alice',cross,[],[cg],roleB);await configure('bob',cross,['cross.review'],[cg]);
await req('/api/admin/project-permissions',{method:'PUT',body:{projectId:short,userId:people.alice.id,revision:1,permissions:['cross.review'],groupIds:[g1]},status:409});await req('/api/admin/project-permissions',{method:'PUT',body:{projectId:short,userId:people.alice.id,revision:1,permissions:[],roleId:roleB,groupIds:[g1]},status:409});await req('/api/admin/project-permissions',{body:{projectId:short,name:'错误类型',permissions:['cross.view']},status:409});await req('/api/admin/project-permissions',{method:'PUT',body:{projectId:short,userId:people.alice.id,revision:1,permissions:[],groupIds:[cg]},status:409});
const catalog=await req('/api/admin/project-permissions?projectId='+cross);assert.deepEqual(catalog.groups.map(g=>g.key),['cross']);checks++;const sc=await req('/api/admin/project-permissions?projectId='+short);assert.ok(!sc.groups.some(g=>g.key==='cross'));checks++;
const projectList=await req('/api/projects',{cookie:people.alice.cookie});assert.ok(projectList.projects.find(p=>p.id===short).capabilities.content);assert.ok(projectList.projects.find(p=>p.id===cross).capabilities.cross);checks+=2;
await req('/api/cross-records',{cookie:people.alice.cookie,project:cross});await req('/api/cross-records',{cookie:people.reader.cookie,project:cross,status:403});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');await mkdir(media+'/roles',{recursive:true});await writeFile(media+'/roles/test.png',png);
function content(name,owner,group,status='draft'){
 const code='ROLE-'+stamp+'-'+name,id=Number(db.prepare("INSERT INTO contents(code,title,content_type,uploader_user_id,account_id,group_id,review_status) VALUES(?,?,'image_text',?,?,?,?) RETURNING id").get(code,name,owner,short,group,status).id);
 const version=Number(db.prepare("INSERT INTO content_versions(content_id,version_number,file_name,storage_path,mime_type,file_size,uploaded_by_user_id,upload_status) VALUES(?,1,'test.png','roles/test.png','image/png',?,?,'complete') RETURNING id").get(id,png.length,owner).id);
 const file=Number(db.prepare("INSERT INTO content_version_files(version_id,position,file_name,storage_path,mime_type,file_size,upload_status) VALUES(?,1,'test.png','roles/test.png','image/png',?,'complete') RETURNING id").get(version,png.length).id);return {id,code,version,file};
}
const own=content('本人私密',people.alice.id,g1),pending=content('本组待审',people.alice.id,g1,'pending'),foreign=content('别组待审',people.bob.id,g2,'pending');
async function list(who){return (await req('/api/contents',{cookie:people[who].cookie,project:short})).contents;}
let rows=await list('alice');assert.ok(rows.some(r=>r.code===own.code));checks++;rows=await list('bob');assert.ok(!rows.some(r=>r.code===own.code));checks++;rows=await list('leader');assert.ok(rows.some(r=>r.code===own.code)&&!rows.some(r=>r.code===foreign.code));checks++;
await req(`/api/contents/${own.code}/versions`,{cookie:people.bob.cookie,project:short,status:403});await req(`/api/contents/${own.code}/versions`,{cookie:people.leader.cookie,project:short});
const denied=await fetch(base+`/api/content-version-files/${own.file}/file?projectId=${short}`,{headers:{cookie:people.bob.cookie}});assert.equal(denied.status,403);checks++;
const allowed=await fetch(base+`/api/content-version-files/${own.file}/file?projectId=${short}`,{headers:{cookie:people.leader.cookie}});assert.equal(allowed.status,200);assert.deepEqual(Buffer.from(await allowed.arrayBuffer()),png);checks+=2;
await req('/api/contents/'+own.code,{cookie:people.leader.cookie,project:short,method:'PATCH',body:{action:'update',title:'不能改'},status:403});await req('/api/review-sessions',{cookie:people.reader.cookie,project:short,body:{contentCodes:[pending.code]},status:403});
const pendingRows=(await req('/api/reviews/pending',{cookie:people.reader.cookie,project:short})).contents;assert.ok(pendingRows.some(r=>r.code===pending.code)&&!pendingRows.some(r=>r.code===foreign.code));checks++;await req('/api/contents/'+pending.code+'/versions',{cookie:people.reader.cookie,project:short});await req('/api/contents/'+own.code+'/versions',{cookie:people.reader.cookie,project:short,status:403});
// A project role update is live for both assignees, and affects no other project.
let r=(await req('/api/admin/project-permissions?projectId='+short)).roles.find(r=>r.id===roleA);await req('/api/admin/project-permissions',{method:'PATCH',body:{projectId:short,id:r.id,revision:r.revision,name:r.name,permissions:['content.view','version.view']}});await req('/api/contents',{cookie:people.alice.cookie,project:short,body:{},status:403});await req('/api/contents',{cookie:people.bob.cookie,project:short,body:{},status:403});await req('/api/cross-records',{cookie:people.alice.cookie,project:cross,body:{kind:'clue',title:'仍可制作'},status:201});
// Explicit custom mode detaches only this person from the shared role.
await configure('bob',short,['content.upload','content.edit'],[g1]);assert.equal((await req('/api/admin/project-permissions?projectId='+short)).users.find(p=>p.id===people.bob.id).roleId,null);checks++;
// Public only after review recommendation; access stays within the project.
db.prepare("UPDATE contents SET visibility='public' WHERE id=?").run(own.id);assert.ok(!(await list('bob')).some(r=>r.code===own.code));checks++;
db.prepare("INSERT INTO reviews(content_id,version_id,reviewer_user_id,decision,comment,recommended) VALUES(?,?,?,'approved','公开案例',1)").run(own.id,own.version,people.leader.id);assert.ok((await list('bob')).some(r=>r.code===own.code));checks++;await req('/api/contents/'+own.code+'/versions',{cookie:people.bob.cookie,project:short});
// Revoking the independent project switch defeats both roles and custom grants.
await req(`/api/projects/${short}/visibility`,{body:{userIds:Object.values(people).filter(p=>p.id!==people.alice.id).map(p=>p.id)},method:'PUT'});await req('/api/contents',{cookie:people.alice.cookie,project:short,status:403});const blocked=await fetch(base+`/api/content-version-files/${own.file}/file?projectId=${short}`,{headers:{cookie:people.alice.cookie}});assert.equal(blocked.status,403);checks++;
await req(`/api/projects/${short}/visibility`,{cookie:people.bob.cookie,method:'PUT',body:{userIds:[people.alice.id]},status:403});
await req('/api/admin/project-permissions',{method:'PATCH',body:{projectId:cross,id:roleA,revision:1,name:'跨项目篡改',permissions:['cross.view']},status:409});
// Older role/override changes cannot add business permissions over a saved project profile.
db.prepare("INSERT INTO user_permission_overrides(user_id,permission_key,effect) VALUES(?,'cross.review','allow')").run(people.alice.id);const access=(await req('/api/cross-records',{cookie:people.alice.cookie,project:cross})).access;assert.equal(access.canReview,false);checks++;
// Privileged permission managers still cannot operate the master project switch.
for(const key of ['admin.view','admin.roles','business.accounts','audit.view'])db.prepare("INSERT INTO user_permission_overrides(user_id,permission_key,effect) VALUES(?,?,'allow')").run(people.manager.id,key);
await req('/api/admin/project-permissions?projectId='+short,{cookie:people.manager.cookie});
await req(`/api/projects/${short}/visibility`,{cookie:people.manager.cookie,method:'PUT',body:{userIds:[people.alice.id]},status:403});
// Read-only status cannot download files from unrelated workflows or gain review actions.
await req('/api/material-sets',{cookie:people.leader.cookie,project:short,status:403});
const publicVersion=(await req('/api/contents/'+own.code+'/versions',{cookie:people.bob.cookie,project:short})).versions;assert.equal(publicVersion.length,1);checks++;
const vr=await req('/api/versions',{cookie:people.leader.cookie,project:short});assert.ok(vr.contents.some(r=>r.code===own.code)&&!vr.contents.some(r=>r.code===foreign.code));checks++;
// Scope changes revoke an already acquired review session as well.
await configure('reader',short,['review.process'],[g1]);const session=(await req('/api/review-sessions',{cookie:people.reader.cookie,project:short,body:{contentCodes:[pending.code]},status:201})).sessionId;
await configure('reader',short,['review.process'],[g2]);await req('/api/review-sessions/'+session,{cookie:people.reader.cookie,project:short,status:404});
// A separate page-view grant opens the catalogue without enabling catalogue edits.
await configure('manager',short,['business.view','content.view'],[]);await req('/api/product-masters',{cookie:people.manager.cookie,project:short});await req('/api/product-masters',{cookie:people.manager.cookie,project:short,body:{name:'只读不能新增'},status:403});
db.prepare("INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,'content.update','content',?,?)").run(people.alice.id,pending.code,JSON.stringify({title:'私密待审日志'}));
const logs=(await req('/api/audit-logs',{cookie:people.manager.cookie})).logs;assert.ok(!logs.some(log=>log.objectId===pending.code));checks++;
const privatePublished=content('别组私密已发布',people.bob.id,g2,'approved');const target=Number(db.prepare('INSERT INTO publishing_targets(project_id,name) VALUES(?,?) RETURNING id').get(short,'统计权限验收').id);
for(const row of [own,privatePublished]){const record=Number(db.prepare('INSERT INTO publishing_records(content_id,target_id,version_id,published,updated_by_user_id) VALUES(?,?,?,1,?) RETURNING id').get(row.id,target,row.version,people.leader.id).id);db.prepare("INSERT INTO publishing_metrics(record_id,recorded_on,views,recorded_by_user_id) VALUES(?,'2026-11-05',10,?)").run(record,people.leader.id);}
const analytics=await req('/api/analytics',{cookie:people.leader.cookie,project:short});assert.ok(analytics.published.some(row=>row.title==='本人私密')&&!analytics.published.some(row=>row.title==='别组私密已发布'));assert.equal(analytics.totals.contentCount,1);assert.equal(analytics.metrics.length,1);checks+=3;
// History purge follows its explicit project permission, never just the global admin title.
await req('/api/versions',{cookie:people.bob.cookie,project:short,method:'DELETE',body:{versionIds:[]},status:403});
await configure('leader',short,['content.view','version.delete'],[g1]);assert.equal((await req('/api/versions',{cookie:people.leader.cookie,project:short})).canDeleteHistory,true);checks++;
await req('/api/versions',{cookie:people.leader.cookie,project:short,method:'DELETE',body:{versionIds:[]},status:400});
await req('/api/contents/trash',{cookie:people.bob.cookie,project:short,method:'DELETE',body:{codes:[]},status:403});
// Publishing is an operation, not a blanket grant over other people's private work.
await configure('manager',short,['publishing.assign','publishing.status','publishing.download'],[]);
const pool=await req('/api/publishing',{cookie:people.manager.cookie,project:short});assert.ok(!pool.contents.some(row=>row.code===privatePublished.code));checks++;
await req('/api/contents/'+privatePublished.code+'/versions',{cookie:people.manager.cookie,project:short,status:403});
await req('/api/publishing/download',{cookie:people.manager.cookie,project:short,body:{codes:[privatePublished.code]},status:403});
await req('/api/publishing/'+privatePublished.code,{cookie:people.manager.cookie,project:short,method:'PATCH',body:{targetId:target,expectedRevision:1,published:false},status:403});
await req('/api/publishing/batch',{cookie:people.manager.cookie,project:short,body:{targetId:target,items:[{contentCode:privatePublished.code,expectedRevision:1}]},status:403});
await writeFile(process.env.ORBIT_QA_STATE_FILE,JSON.stringify({...state,permissionQA:{short,cross,g1,g2,roleA,roleB,people,own,pending,foreign}}));db.close();console.log(JSON.stringify({checks,perProjectRoles:true,rolePropagation:true,privateScope:true,readOnlyReview:true,masterGate:true}));
