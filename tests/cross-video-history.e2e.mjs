import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
const base=process.env.ORBIT_E2E_BASE_URL;
if(!base||!process.env.ORBIT_QA_STATE_FILE)throw Error('Requires the isolated cross-library QA fixture');
const state=JSON.parse(await readFile(process.env.ORBIT_QA_STATE_FILE,'utf8'));
let checks=0;const headers={cookie:state.adminCookie,'x-orbit-project-id':String(state.a)};
async function req(path,init={},status=200){const r=await fetch(base+path,{...init,headers:{...headers,...init.headers}});assert.equal(r.status,status,path+' '+(r.status===status?'':await r.text()));checks++;return r;}
async function detail(){return (await req('/api/cross-records?id='+state.child)).json();}
async function action(name){const d=await detail();return req('/api/cross-records/'+state.child,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:name,revision:d.row.revision})});}
const dir=await mkdtemp(join(tmpdir(),'orbit-video-history-'));
try{
 const path=join(dir,'sample.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=128x128:d=0.4','-c:v','libx264','-pix_fmt','yuv420p',path],{timeout:30000});
 const video=await readFile(path),a=await sharp({create:{width:120,height:120,channels:3,background:'#3154df'}}).png().toBuffer(),b=await sharp({create:{width:120,height:120,channels:3,background:'#ddaa33'}}).png().toBuffer();
 assert.equal((await detail()).row.version_number,0,'Use a fresh QA fixture');
 const uploaded=await (await req(`/api/cross-records/${state.child}/files`,{method:'POST',headers:{'content-type':'video/mp4','x-orbit-file-name':'sample.mp4','x-orbit-file-size':String(video.length)},body:video},201)).json();
 await req(`/api/cross-records/files/${uploaded.id}/cover`,{method:'PUT',headers:{'content-type':'image/png'},body:a});
 const original=Buffer.from(await (await req(`/api/cross-records/files/${uploaded.id}?thumb=1`)).arrayBuffer());
 await action('submit');await action('withdraw');
 await req(`/api/cross-records/files/${uploaded.id}/cover`,{method:'PUT',headers:{'content-type':'image/png'},body:b});
 const current=(await detail()).files[0];assert.notEqual(current.id,uploaded.id);checks++;
 const historical=Buffer.from(await (await req(`/api/cross-records/files/${uploaded.id}?thumb=1`)).arrayBuffer());assert.deepEqual(historical,original);checks++;
 const latest=Buffer.from(await (await req(`/api/cross-records/files/${current.id}?thumb=1`)).arrayBuffer());assert.notDeepEqual(latest,original);checks++;
 await req(`/api/cross-records/files/${uploaded.id}/cover`,{method:'PUT',headers:{'content-type':'image/png'},body:b},403);
 await action('submit');await action('approve');const versions=(await detail()).versions;
 assert.equal(JSON.parse(versions.find(v=>v.version_number===1).snapshot_json).files[0].id,uploaded.id);assert.equal(JSON.parse(versions.find(v=>v.version_number===2).snapshot_json).files[0].id,current.id);checks+=2;
 await action('archive');await req(`/api/cross-records/${state.child}/delivery`,{},409);
 const zip=Buffer.from(await (await req(`/api/cross-records/${state.main}/delivery?group=1`)).arrayBuffer());assert.ok(zip.includes(Buffer.from('已归档子包未打包。')));checks++;
 console.log(JSON.stringify({checks,immutableVideoCover:true,archivedDeliveryExcluded:true}));
}finally{await rm(dir,{recursive:true,force:true});}
