import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.ORBIT_E2E_BASE_URL,state=JSON.parse(await readFile(process.env.ORBIT_QA_STATE_FILE,'utf8'));
if(!base)throw Error('Requires isolated test service');let cookie=state.adminCookie,passed=0;
async function req(path,body,status=200){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie,'x-orbit-project-id':String(state.a),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const raw=await response.text();assert.equal(response.status,status,path+' '+raw);passed++;const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];return JSON.parse(raw);}
const group=(await req('/api/groups?scope=upload')).groups[0].id;
const role=(await req('/api/admin',{entity:'role',name:'小组范围验收角色',permissions:[]},201)).id;
const username='member_'+Date.now().toString(36);
await req('/api/admin',{entity:'user',username,displayName:'小组范围验收员工',password:'Member-QA-2026!',roleId:role,primaryGroupId:group},201);
await req('/api/auth/login',{username,password:'Member-QA-2026!'});
const projects=(await req('/api/projects')).projects;assert.equal(projects.length,1);assert.equal(projects[0].id,state.a);
const memberships=(await req('/api/groups?scope=membership')).groups;assert.equal(memberships.length,1);assert.equal(memberships[0].id,group);
assert.equal((await req('/api/groups?scope=view')).groups.length,0);
assert.equal((await req('/api/contents')).contents.length,0,'membership must not grant access to peers content');
console.log(JSON.stringify({passed,ownGroupVisible:true,noPeerContentGrant:true}));
