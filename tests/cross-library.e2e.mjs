import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const base=process.env.ORBIT_E2E_BASE_URL;if(!base)throw Error('isolated server required');let cookie='',project=null,checks=0;
async function req(path,body,method=body===undefined?'GET':'POST',status=200){const r=await fetch(base+path,{method,headers:{cookie,...(project?{'x-orbit-project-id':String(project)}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(data));checks++;if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return data;}
assert.equal((await req('/api/setup')).setupRequired,true,'fresh QA database required');await req('/api/setup',{username:'hjt',displayName:'主账号',password:'Library-QA-2026!'},'POST',201);const adminCookie=cookie;
const a=(await req('/api/projects',{name:'跨境排版验收',projectType:'cross_border'},'POST',201)).id,b=(await req('/api/projects',{name:'跨境独立权限',projectType:'cross_border'},'POST',201)).id;
const role=(await req('/api/admin',{entity:'role',name:'资料查看员工',permissions:['cross.view']},'POST',201)).id;
const viewer=(await req('/api/admin',{entity:'user',username:'libraryviewer',displayName:'仅查看员工',password:'Library-Viewer-2026!',roleId:role},'POST',201)).id;
await req(`/api/projects/${a}/visibility`,{userIds:[viewer]},'PUT');await req(`/api/projects/${b}/visibility`,{userIds:[viewer]},'PUT');
await req(`/api/projects/${a}/cross-config`,{entity:'product',name:'饰品'},'POST');const category=(await req(`/api/projects/${a}/cross-config`)).products[0].id;project=a;
async function detail(id){return req('/api/cross-records?id='+id);}async function change(id,action,extra={},status=200){const row=(await detail(id)).row;return req('/api/cross-records/'+id,{action,revision:row.revision,...extra},'PATCH',status);}
async function create(kind,title,parentId=null){return (await req('/api/cross-records',{kind,title,parentId,packageType:'main'},'POST',201)).id;}
const clue=await create('clue','关联线索A');await change(clue,'save',{data:{keywords:'首饰,测试',source:'内部参考'}});await change(clue,'submit');await change(clue,'save',{title:'关联线索A'});
const mother=await create('mother','关联母版A',clue);await change(clue,'save',{title:'禁止覆盖'},409);
const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64'));
async function upload(id,status=201){const f=new FormData();f.append('file',new File([bytes],'参考.png',{type:'image/png'}));const r=await fetch(base+`/api/cross-records/${id}/files`,{method:'POST',headers:{cookie,'x-orbit-project-id':String(project)},body:f});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));checks++;return data.id;}
await upload(clue,409);await change(mother,'save',{productCategoryId:category});const file=await upload(mother);await change(mother,'submit');await change(mother,'approve');const main=await create('package','关联主图A',mother);await upload(main);await change(main,'submit');await change(main,'approve');assert.equal((await detail(clue)).related[0].id,mother);assert.equal((await detail(mother)).related[0].id,main);checks+=2;
await change(mother,'archive',{},409);await change(main,'archive');await change(mother,'archive');await change(mother,'delete');assert.equal((await detail(main)).row.parent_id,mother);await change(mother,'restore');assert.equal((await detail(mother)).row.lifecycle,'archived');await change(mother,'unarchive');await change(main,'unarchive');
project=null;const profiles=await req('/api/admin/project-permissions?projectId='+a);assert.ok(profiles.groups.flatMap(g=>g.permissions).some(p=>p.key==='cross.edit'));checks++;
await req('/api/admin/project-permissions',{projectId:a,userId:viewer,revision:0,permissions:['cross.view','cross.delete']},'PUT');await req('/api/admin/project-permissions',{projectId:a,userId:viewer,revision:0,permissions:[]},'PUT',409);
await req('/api/auth/login',{username:'libraryviewer',password:'Library-Viewer-2026!'});await req('/api/auth/change-password',{currentPassword:'Library-Viewer-2026!',newPassword:'Library-Viewer-2026!2'});const viewerCookie=cookie;project=a;
assert.equal((await req('/api/cross-records')).access.canEdit,false);await change(clue,'save',{title:'查看者改名'},403);await change(clue,'archive',{},409);await req('/api/cross-records',{kind:'clue',title:'禁止新建'},'POST',403);await upload(mother,403);await change(main,'delete');await change(main,'restore');
project=b;assert.equal((await req('/api/cross-records')).access.canDelete,false);checks++;
cookie=adminCookie;project=a;const free=await create('clue','可编辑线索');await change(free,'save',{data:{keywords:'新建'}});await change(free,'submit');await change(free,'save',{title:'可编辑线索'});await change(free,'note',{note:'简洁备注'});
project=null;await req('/api/admin/project-permissions',{projectId:a,userId:viewer,revision:1,permissions:['cross.view','cross.edit','cross.create','cross.archive','cross.delete']},'PUT');cookie=viewerCookie;project=a;const access=(await req('/api/cross-records')).access;assert.equal(access.canEdit,true);assert.equal(access.canArchive,true);project=b;assert.equal((await req('/api/cross-records')).access.canEdit,false);checks+=3;
cookie=adminCookie;project=a;
const child=(await req('/api/cross-records',{kind:'package',title:'独立回收子包',parentId:mother,mainId:main,packageType:'video'},'POST',201)).id;
await change(child,'archive',{},409);await change(child,'delete');assert.equal((await detail(child)).row.lifecycle,'deleted');await change(child,'restore');assert.equal((await detail(child)).row.lifecycle,'active');checks+=2;
project=null;await req('/api/admin/project-permissions',{projectId:a,userId:viewer,revision:2,permissions:['cross.view','cross.create','cross.edit','cross.archive','cross.delete']},'PUT');cookie=viewerCookie;project=a;
const own=await create('clue','本人权限验证');await change(own,'save',{data:{keywords:'权限'}});await change(own,'submit');cookie=adminCookie;project=null;await req('/api/admin/project-permissions',{projectId:a,userId:viewer,revision:3,permissions:['cross.view']},'PUT');cookie=viewerCookie;project=a;await change(own,'save',{title:'查看者本人也不能编辑'},409);await upload(own,403);
cookie=adminCookie;project=null;await req('/api/admin/project-permissions',{projectId:a,userId:viewer,revision:4,permissions:['cross.view','cross.create','cross.edit','cross.archive','cross.delete']},'PUT');
cookie=adminCookie;project=a;
const original=(await detail(free)).versions.find(v=>v.version_number===1).snapshot_json;
await change(free,'save',{title:'可编辑线索二版'});assert.equal((await detail(free)).row.status,'draft');await change(free,'submit');assert.equal((await detail(free)).row.version_number,2);assert.equal((await detail(free)).versions.find(v=>v.version_number===1).snapshot_json,original);checks+=3;
await upload(free);assert.equal((await detail(free)).row.status,'draft');await change(free,'submit');assert.equal((await detail(free)).row.version_number,3);checks+=2;
await change(free,'save',{title:'可编辑线索二版'});await change(free,'submit',{},409);assert.equal((await detail(free)).versions.length,3);checks++;
await change(free,'archive');await change(free,'delete');await change(free,'restore');assert.equal((await detail(free)).row.lifecycle,'archived');await change(free,'unarchive');checks++;
await change(mother,'archive',{},409);await change(main,'archive',{},409);await change(child,'delete');
for(const id of [main,mother]){await change(id,'archive');await change(id,'save',{title:'归档不可修改'},409);await change(id,'note',{note:'归档不可改'},409);await change(id,'submit',{},409);if(id===main){const r=await fetch(base+`/api/cross-records/${id}/delivery`,{headers:{cookie,'x-orbit-project-id':String(project)}});assert.equal(r.status,409);checks++;}await change(id,'delete');await change(id,'restore');assert.equal((await detail(id)).row.lifecycle,'archived');checks++;}
await change(child,'restore',{},409);await change(mother,'unarchive');await change(main,'unarchive');await change(child,'restore');

const relatedChildren=(await detail(main)).related;assert.ok(relatedChildren.some(r=>r.id===child));checks++;
await writeFile(process.env.ORBIT_QA_STATE_FILE??'/tmp/orbit-layout-state.json',JSON.stringify({adminCookie,viewerCookie,a,b,clue,mother,main,free,category,file,viewer,child,own,base}));console.log(JSON.stringify({checks,scopeIsolation:true,viewEditSeparation:true,lifecycle:true}));
