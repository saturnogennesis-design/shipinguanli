import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const base=process.env.ORBIT_E2E_BASE_URL;if(!base)throw Error('isolated server required');const s=JSON.parse(await readFile('/workspace/qa-v321/state.json','utf8')),headers={cookie:s.masterCookie,'x-orbit-project-id':String(s.a),'content-type':'application/json'};let checks=0;
const detail=await fetch(base+'/api/cross-records?id='+s.doc,{headers});assert.equal(detail.status,200);checks++;const file=(await detail.json()).files.find(f=>f.id===s.f1);const prior=file.shared_json;
const write=async(userIds,expectedShared)=>{const r=await fetch(base+'/api/cross-records/files/'+s.f1,{method:'PATCH',headers,body:JSON.stringify({userIds,expectedShared})});checks++;return r;};
const results=await Promise.all([write([s.reviewer],prior),write([s.otherAdmin],prior)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const winner=results[0].status===200?[s.reviewer]:[s.otherAdmin];assert.equal((await write(JSON.parse(prior),JSON.stringify(winner))).status,200);
console.log(JSON.stringify({checks,concurrentSharingCAS:true,originalPermissionsRestored:true}));
