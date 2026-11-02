import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base=process.env.ORBIT_E2E_BASE_URL,state=JSON.parse(await readFile(process.env.ORBIT_QA_STATE_FILE,'utf8'));if(!base)throw Error('Isolated QA fixture required');
let checks=0;const headers={cookie:state.adminCookie,'x-orbit-project-id':String(state.a)};
async function req(path,body,method=body?'POST':'GET',status=200){const r=await fetch(base+path,{method,headers:{...headers,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(d));checks++;return d;}
async function detail(id){return req('/api/cross-records?id='+id);}
async function change(id,action,body={},status=200){const row=(await detail(id)).row;return req('/api/cross-records/'+id,{action,revision:row.revision,...body},'PATCH',status);}
const lockedMother=(await req('/api/cross-records',{kind:'mother',title:'来源锁定母版',parentId:state.clue,sourceLocked:true},'POST',201)).id;assert.equal((await detail(lockedMother)).row.source_locked,1);checks++;
await change(lockedMother,'save',{parentId:null,sourceLocked:false},409);await change(lockedMother,'save',{productCategoryId:state.category});assert.equal((await detail(lockedMother)).row.parent_id,state.clue);checks++;
const other=(await req('/api/cross-records',{kind:'mother',title:'独立选择来源母版'},'POST',201)).id;await change(other,'save',{productCategoryId:state.category});
const form=new FormData();form.append('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64')],'source.png',{type:'image/png'}));const uploaded=await fetch(base+`/api/cross-records/${other}/files`,{method:'POST',headers,body:form});assert.equal(uploaded.status,201);checks++;await change(other,'submit');await change(other,'approve');
const lockedProduct=(await req('/api/cross-records',{kind:'package',title:'来源锁定产品',parentId:state.mother,packageType:'main',sourceLocked:true},'POST',201)).id;await change(lockedProduct,'save',{parentId:other,sourceLocked:false},409);assert.equal((await detail(lockedProduct)).row.parent_id,state.mother);checks++;
const independent=(await req('/api/cross-records',{kind:'package',title:'库内独立新建产品',parentId:state.mother,packageType:'main'},'POST',201)).id;await change(independent,'save',{parentId:other});assert.equal((await detail(independent)).row.parent_id,other);checks++;
await change(state.free,'note',{note:'接口较早备注'});await change(state.free,'note',{note:'接口最近备注'});const timeline=(await detail(state.free)).timeline;assert.equal(timeline[0].body,'接口最近备注');for(let i=1;i<timeline.length;i++)assert.ok(timeline[i-1].created_at>=timeline[i].created_at);checks+=2;
await req('/api/cross-records',{kind:'mother',title:'无效锁定',sourceLocked:true},'POST',400);
state.lockedMother=lockedMother;state.otherMother=other;state.lockedProduct=lockedProduct;state.independentProduct=independent;await writeFile(process.env.ORBIT_QA_STATE_FILE,JSON.stringify(state));
console.log(JSON.stringify({checks,originLocksPersisted:true,independentOriginSelectable:true,timelineNewestFirst:true}));
