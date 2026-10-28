import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=process.env.ORBIT_E2E_BASE_URL,stateFile=process.env.ORBIT_QA_STATE_FILE;if(!base||!stateFile)throw Error('Requires isolated server state from projects.e2e.mjs');
const state=JSON.parse(await readFile(stateFile,'utf8'));let project=state.a,passed=0;
async function req(path,body,method=body===undefined?'GET':'POST',status=200){const response=await fetch(base+path,{method,headers:{cookie:state.adminCookie,'x-orbit-project-id':String(project),...(body&&!(body instanceof Uint8Array)?{'content-type':'application/json'}:{})},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)});const raw=await response.text();assert.equal(response.status,status,path+' '+raw);passed++;return JSON.parse(raw);}
async function pending(productId,title){const group=(await req('/api/groups?scope=upload')).groups[0].id;const bytes=new TextEncoder().encode('review-queue-fixture');const content=(await req('/api/contents',{groupId:group,items:[{title,contentType:'video',productMasterId:productId,files:[{fileName:'queue.mp4',mimeType:'video/mp4',fileSize:bytes.length}]}]},'POST',201)).items[0];await req(content.uploads[0].uploadUrl,bytes,'PUT');await req('/api/contents/'+content.contentCode,{action:'submit'},'PATCH');return content.contentCode;}
const a=await pending(state.productA,'十乐审核队列验收');const sa=(await req('/api/review-sessions',{contentCodes:[a]},'POST',201)).sessionId;
project=state.b;assert.equal((await req('/api/review-sessions')).session,null);const b=await pending(state.productB,'项目B审核队列验收');const sb=(await req('/api/review-sessions',{contentCodes:[b]},'POST',201)).sessionId;
assert.notEqual(sa,sb);await req('/api/review-sessions/'+sa,undefined,'GET',403);assert.equal((await req('/api/review-sessions')).session.id,sb);
project=state.a;assert.equal((await req('/api/review-sessions')).session.id,sa);const qa=await req('/api/review-sessions/'+sa);assert.ok(qa.items.every(row=>row.code===a||row.contentCode===a),'A queue must contain only A content');
console.log(JSON.stringify({passed,independentReviewQueues:true,oldQueuePreserved:true}));
