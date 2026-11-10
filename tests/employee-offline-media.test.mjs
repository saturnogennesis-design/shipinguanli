import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EmployeeClient} from '../employee-client/server.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'orbit-offline-media-')),app=new EmployeeClient(root,{port:0});
 t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 app.store.login('test:1',{id:1,displayName:'测试员工'},'session=test','http://127.0.0.1:39999');
 const ns=app.account.ns;app.store.set('catalog:'+ns,[{id:10,permissions:['cross.view','content.view']}]);app.store.set('allowed-projects:'+ns,[10]);
 await app.start();app.port=app.server.address().port;clearTimeout(app.startTimer);clearInterval(app.timer);
 return {app,ns,url:'http://127.0.0.1:'+app.port,headers:{'x-local-token':app.token,'x-orbit-project-id':'10'}};
}
async function record(app,ns,kind,file){const k='10:'+kind+':1';await app.store.putRecord(ns,k,10,{files:[file]},'v1');return k;}
async function blob(app,ns,key,bytes,mime){const path=app.store.cachePath(ns,key);await writeFile(path,bytes);app.store.db.prepare('INSERT INTO blobs VALUES(?,?,?,?,?,?)').run(ns,key,path,bytes.length,mime,Date.now());return path;}

test('离线跨境缩略图读取已缓存的缩略图，不要求原图已缓存',async t=>{
 const {app,ns,url,headers}=await fixture(t),k=await record(app,ns,'cross',{id:9,name:'大图.jpg',size:1000000,mime:'image/jpeg',url:'/api/cross-records/files/9?projectId=10'});
 await blob(app,ns,k+'|0|thumb',Buffer.from('thumbnail'),'image/jpeg');
 const r=await fetch(url+'/api/cross-records/files/9?projectId=10&thumb=1',{headers});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(await r.text(),'thumbnail');
});
test('离线视频封面使用file路径对应的封面缓存，不返回视频原件',async t=>{
 const {app,ns,url,headers}=await fixture(t),k=await record(app,ns,'video',{id:9,name:'视频.mp4',size:1000000,mime:'video/mp4',url:'/api/content-versions/9/file?projectId=10'});
 await blob(app,ns,k+'|0|thumb',Buffer.from('cover'),'image/jpeg');
 const r=await fetch(url+'/api/content-versions/9/cover?projectId=10',{headers});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(await r.text(),'cover');
});
test('主机断开后缓存原件支持Range与HEAD，未缓存原件明确报错',async t=>{
 const {app,ns,url,headers}=await fixture(t),k=await record(app,ns,'cross',{id:9,name:'图片.jpg',size:6,mime:'image/jpeg',url:'/api/cross-records/files/9?projectId=10'});
 await blob(app,ns,k+'|0|original',Buffer.from('abcdef'),'image/jpeg');app.online=true;app.remote=async()=>{throw Error('host offline');};
 let r=await fetch(url+'/api/cross-records/files/9?projectId=10',{headers:{...headers,range:'bytes=2-4'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-4/6');assert.equal(await r.text(),'cde');
 r=await fetch(url+'/api/cross-records/files/9?projectId=10',{method:'HEAD',headers});assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),'6');assert.equal(await r.text(),'');
 app.online=false;r=await fetch(url+'/api/cross-records/files/10?projectId=10',{headers});assert.equal(r.ok,false);assert.match((await r.json()).error,/尚未缓存/);
});
test('离线缓存仍隔离项目和账号，撤回入口不返回缓存字节',async t=>{
 const {app,ns,url,headers}=await fixture(t),k=await record(app,ns,'cross',{id:9,name:'图片.jpg',size:4,mime:'image/jpeg',url:'/api/cross-records/files/9?projectId=10'});
 await blob(app,ns,k+'|0|original',Buffer.from('data'),'image/jpeg');
 let r=await fetch(url+'/api/cross-records/files/9?projectId=11',{headers:{...headers,'x-orbit-project-id':'11'}});assert.equal(r.status,403);
 app.store.set('allowed-projects:'+ns,[]);r=await fetch(url+'/api/cross-records/files/9?projectId=10',{headers});assert.equal(r.status,403);
 app.store.login('other:2',{id:2},'session=other','http://127.0.0.1:39999');app.store.set('allowed-projects:other:2',[10]);app.store.set('catalog:other:2',[{id:10,permissions:['cross.view']}]);
 r=await fetch(url+'/api/cross-records/files/9?projectId=10',{headers});assert.equal(r.ok,false);assert.match((await r.json()).error,/尚未缓存/);
});
