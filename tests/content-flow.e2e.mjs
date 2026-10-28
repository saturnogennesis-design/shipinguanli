import assert from "node:assert/strict";

const baseUrl=process.env.ORBIT_E2E_BASE_URL;
if(!baseUrl)throw new Error("ORBIT_E2E_BASE_URL is required");

let cookie="";
async function request(path,options={}) {
  const headers=new Headers(options.headers);
  if(cookie)headers.set("cookie",cookie);
  const response=await fetch(`${baseUrl}${path}`,{...options,headers});
  const setCookie=response.headers.get("set-cookie");
  if(setCookie)cookie=setCookie.split(";",1)[0];
  const text=await response.text();
  let data={};try{data=text?JSON.parse(text):{};}catch{data={text};}
  if(!response.ok)throw new Error(`${options.method??"GET"} ${path} -> ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

const suffix=Date.now().toString(36);
const setup=await request("/api/setup");
assert.equal(setup.setupRequired,true,"flow test requires a fresh database");
await request("/api/setup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:`flow_${suffix}`.slice(0,32),displayName:"内容流程测试管理员",password:"FlowTest-2026!"})});
const [defaultGroup]=(await request("/api/groups?scope=upload")).groups;
assert.ok(defaultGroup?.id,"setup should create a default content group");

const business=await request("/api/business-data");
const platform=business.platforms.find((item)=>item.code==="dy")??business.platforms[0];
assert.ok(platform?.id,"a platform should be seeded during setup");

const store=await request("/api/business-data",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entity:"store",platformCode:platform.code,name:"流程测试店铺",code:`ST-${suffix}`,status:"active"})});
const account=await request("/api/business-data",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entity:"account",platformCode:platform.code,name:"流程测试账号",code:`AC-${suffix}`,platformHandle:`flow_${suffix}`,status:"active"})});
await request("/api/admin",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({entity:"group",id:defaultGroup.id,name:defaultGroup.name,accountId:account.id,departmentId:defaultGroup.departmentId,themeColor:defaultGroup.themeColor,description:defaultGroup.description,businessDirection:defaultGroup.businessDirection,status:"active",leaderUserId:defaultGroup.leaderUserId})});
const product=await request("/api/business-data",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entity:"product",platformCode:platform.code,storeId:store.id,name:"流程测试商品",code:`PR-${suffix}`,productType:"测试产品",status:"active"})});
await request("/api/business-data",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({entity:"accountProducts",accountId:account.id,productIds:[product.id]})});

const firstFile=new TextEncoder().encode("orbit-video-version-one");
const created=await request("/api/contents",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items:[{title:"完整内容流程测试",contentType:"video",files:[{fileName:"flow-v1.mp4",mimeType:"video/mp4",fileSize:firstFile.byteLength}],productId:product.id,accountId:account.id,visibility:"private",remark:"自动化流程测试"}]})});
const content=created.items[0];
assert.ok(content.contentCode);
await request(content.uploads[0].uploadUrl,{method:"PUT",headers:{"content-type":"video/mp4","content-length":String(firstFile.byteLength)},body:firstFile});
await request(`/api/contents/${content.contentCode}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"submit"})});

const pending=await request("/api/reviews/pending?status=pending");
assert.ok(pending.contents.some((item)=>item.code===content.contentCode),"submitted content should enter pending review");
const preReviewCookie=cookie;
const reviewerRole=await request("/api/admin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entity:"role",name:"自有范围审核测试",dataScope:"self",permissions:["review.view","review.process"]})});
await request("/api/admin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entity:"user",username:"reviewer_"+suffix,password:"Reviewer-Test!2026",displayName:"审核测试员工",roleId:reviewerRole.id,primaryGroupId:defaultGroup.id})});
await request("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:"reviewer_"+suffix,password:"Reviewer-Test!2026"})});
const reviewerVersions=await request(`/api/contents/${content.contentCode}/versions`);
assert.ok(reviewerVersions.versions[0].fileUrl,"reviewer can preview queued private content");
await request(reviewerVersions.versions[0].fileUrl);
cookie=preReviewCookie;
const rejectionSession=await request("/api/review-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contentCodes:[content.contentCode]})});
const rejectionQueue=await request(`/api/review-sessions/${rejectionSession.sessionId}`);
await request(`/api/review-sessions/${rejectionSession.sessionId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({queueItemId:rejectionQueue.items[0].queueItemId,decision:"rejected",comment:"测试驳回：请上传修改版本；作为反面案例供团队参考",recommended:true})});
await request(`/api/review-sessions/${rejectionSession.sessionId}`,{method:"POST"});

const rejected=(await request("/api/contents")).contents.find((item)=>item.code===content.contentCode);
assert.equal(rejected.reviewStatus,"rejected");
assert.match(rejected.rejectionReason,/测试驳回/);
assert.equal(rejected.featured,true,"rejected content can also be a recommendation case");

await expectStatus(`/api/contents/${content.contentCode}`,409,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"archive",reason:"暂停测试修改"})});
await request(`/api/contents/${content.contentCode}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"archive",reason:"暂停测试修改",confirmRecommendationCancellation:true})});
assert.ok(!(await request("/api/contents?board=true")).contents.some(item=>item.code===content.contentCode),"archived rejected item leaves active lanes");
const archived=(await request("/api/contents?archived=true&board=true")).contents.find(item=>item.code===content.contentCode);
assert.equal(archived.reviewStatus,"rejected","archive preserves decision");
assert.match(archived.reviewComment,/测试驳回/);
assert.equal(archived.featured,false,"archiving a recommendation removes its marker after confirmation");
assert.equal((await request(`/api/contents/${content.contentCode}/versions`)).versions.length,1,"archive preserves versions");
await request(`/api/contents/${content.contentCode}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"unarchive"})});

const secondFile=new TextEncoder().encode("orbit-video-version-two-approved");
const nextVersion=await request(`/api/contents/${content.contentCode}/versions`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({files:[{fileName:"flow-v2.mp4",mimeType:"video/mp4",fileSize:secondFile.byteLength}]})});
await request(nextVersion.uploads[0].uploadUrl,{method:"PUT",headers:{"content-type":"video/mp4","content-length":String(secondFile.byteLength)},body:secondFile});
const resubmitted=(await request("/api/contents")).contents.find((item)=>item.code===content.contentCode);
assert.equal(resubmitted.reviewStatus,"pending");
assert.equal(resubmitted.latestVersionNumber,2);

const approvalSession=await request("/api/review-sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contentCodes:[content.contentCode]})});
const approvalQueue=await request(`/api/review-sessions/${approvalSession.sessionId}`);
await request(`/api/review-sessions/${approvalSession.sessionId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({queueItemId:approvalQueue.items[0].queueItemId,decision:"approved",comment:"修改完成，同意发布；可作为团队参考案例",recommended:true})});
await request(`/api/review-sessions/${approvalSession.sessionId}`,{method:"POST"});

const featuredContent=(await request("/api/contents")).contents.find((item)=>item.code===content.contentCode);
assert.equal(featuredContent.featured,true);
assert.equal(featuredContent.visibility,"public");
assert.match(featuredContent.featuredReason,/团队参考案例/);
const featuredDashboard=await request("/api/dashboard");
assert.ok(featuredDashboard.featured.some((item)=>item.code===content.contentCode),"featured content should appear on the workbench");

const filterSaved=await request("/api/filters",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({moduleKey:"contents",name:"流程测试推荐案例",conditions:[{field:"recommended",operator:"eq",value:true}]})});
assert.ok(filterSaved.id,"saved filter should be persisted");
const filterList=await request("/api/filters?module=contents");
assert.ok(filterList.saved.some((item)=>item.id===filterSaved.id));
const filteredPath=(rules)=>`/api/contents?${new URLSearchParams({rules:JSON.stringify(rules)})}`;
const andFiltered=await request(filteredPath([{join:"and",field:"query",operator:"contains",value:"完整内容"},{join:"and",field:"reviewStatus",operator:"eq",value:"已通过"}]));
assert.ok(andFiltered.contents.some((item)=>item.code===content.contentCode),"AND conditions should all apply");
const orFiltered=await request(filteredPath([{join:"or",field:"query",operator:"contains",value:"不存在的标题"},{join:"or",field:"owner",operator:"eq",value:"内容流程测试管理员"}]));
assert.ok(orFiltered.contents.some((item)=>item.code===content.contentCode),"OR conditions should match any branch");
const excluded=await request(filteredPath([{join:"exclude",field:"query",operator:"contains",value:"完整内容流程测试"}]));
assert.ok(!excluded.contents.some((item)=>item.code===content.contentCode),"excluded matches should not be returned");
const today=new Date().toISOString().slice(0,10);
const dateFiltered=await request(filteredPath([{join:"and",field:"createdAt",operator:"eq",value:today}]));
assert.ok(dateFiltered.contents.some((item)=>item.code===content.contentCode),"date equality should include the whole selected day");

const initialPublishing=(await request("/api/publishing")).contents.find((item)=>item.code===content.contentCode);
assert.ok(initialPublishing?.assignments[0],"approved content should automatically enter publishing");
await request(`/api/publishing/${content.contentCode}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"start",assignmentId:initialPublishing.assignments[0].id,expectedVersion:initialPublishing.assignments[0].rowVersion})});
const claimedPublishing=(await request("/api/publishing")).contents.find(item=>item.code===content.contentCode);
const catalogProductId=claimedPublishing.productMasterId;
assert.ok(catalogProductId,"legacy content should be linked to the unified catalog");
assert.equal(claimedPublishing.assignments[0].productMasterId,catalogProductId,"approval should carry the catalog product into publishing");
await request(`/api/publishing/${content.contentCode}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({expectedAssignments:claimedPublishing.assignments.map(item=>({id:item.id,rowVersion:item.rowVersion})),assignments:[{platformId:platform.id,accountId:account.id,productMasterId:catalogProductId,copy:{title:"流程测试发布标题",body:"流程测试发布文案",topics:["流程测试","内部验收"]}}]})});
const savedPublishing=(await request("/api/publishing")).contents.find(item=>item.code===content.contentCode);
await request(`/api/publishing/${content.contentCode}/platforms/${platform.code}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({published:true,expectedVersion:savedPublishing.assignments[0].rowVersion})});

const publishing=await request("/api/publishing");
const published=publishing.contents.find((item)=>item.code===content.contentCode);
assert.equal(published.assignments[0].publishStatus,"published");
assert.equal(published.assignments[0].productMasterId,catalogProductId);
assert.equal(published.assignments[0].copy.title,"流程测试发布标题");
const finalBusiness=await request("/api/business-data");
assert.ok(finalBusiness.publishedContents.some((item)=>item.id===content.contentCode),"published content should enter business data");


async function expectStatus(path,status,options={}){
 const headers=new Headers(options.headers);headers.set("cookie",cookie);
 const response=await fetch(baseUrl+path,{...options,headers});
 assert.equal(response.status,status,await response.text());
}
const json=(body,method="POST")=>({method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
await expectStatus(`/api/contents/${content.contentCode}`,409,{method:"DELETE"});
const board=await request("/api/contents?board=true");
assert.equal(board.pagination.laneTotals[3],1);
assert.equal(board.contents.find(item=>item.code===content.contentCode).reviewComment,"修改完成，同意发布；可作为团队参考案例");
for(const field of ["fileSize","duration","imageCount","recommended"]){
 const result=await request(filteredPath([{join:"and",field,operator:field==="recommended"?"eq":"gte",value:field==="recommended"?"是":"0"}]));
 assert.ok(Array.isArray(result.contents),"metadata filter query and count both execute: "+field);
}
await request("/api/filters",json({id:filterSaved.id,name:"更新后的模板",conditions:[{field:"query",operator:"contains",value:"流程"}],view:{sort:"oldest",group:"employee"},isShared:true},"PATCH"));
const renamed=(await request("/api/filters?module=contents")).saved.find(item=>item.id===filterSaved.id);
assert.equal(renamed.view.group,"employee");assert.equal(renamed.isShared,true);
const adminCookie=cookie;
const role=await request("/api/admin",json({entity:"role",name:"删除权限边界测试",dataScope:"company",permissions:["content.view","content.upload","content.edit","content.submit","content.delete","content.trash_purge","version.upload","version.delete"]}));
const employee=await request("/api/admin",json({entity:"user",username:"employee_"+suffix,password:"Employee-Test!2026",displayName:"测试员工",roleId:role.id,primaryGroupId:defaultGroup.id}));
await request("/api/content-colors",json({id:employee.id,color:"#cab7ef"},"PATCH"));
await request("/api/auth/login",json({username:"employee_"+suffix,password:"Employee-Test!2026"}));
await expectStatus("/api/contents/trash",403,json({codes:[content.contentCode]},"DELETE"));
await expectStatus("/api/versions",403,json({versionIds:[1]},"DELETE"));
await expectStatus("/api/content-colors",403);
await expectStatus("/api/filters",403,json({id:filterSaved.id,name:"越权修改",conditions:[]},"PATCH"));
const drafts=[];
for(let i=0;i<22;i++){
 const createdDraft=await request("/api/contents",json({items:[{title:"四栏分页测试"+i,contentType:"video",files:[{fileName:"tiny.mp4",mimeType:"video/mp4",fileSize:4}]}]}));
 drafts.push(createdDraft.items[0]);
}
const employeeBoard=await request("/api/contents?board=true");
assert.equal(employeeBoard.pagination.laneTotals[0],22);
assert.equal(employeeBoard.contents.filter(item=>item.reviewStatus==="draft").length,20);
assert.ok(!employeeBoard.contents.some(item=>item.code===content.contentCode),"a recommendation must not leak into another employee's content pool");
const laterBoard=await request('/api/contents?board=true&lanePages=[2,1,1,1]&lanePageSizes=[20,20,20,20]');
assert.equal(laterBoard.contents.filter(item=>item.reviewStatus==="draft").length,2);
assert.ok(employeeBoard.contents.filter(item=>item.reviewStatus==="draft").every(item=>item.contentColor==="#cab7ef"));
const privateDraft=drafts[0];
await request(privateDraft.uploads[0].uploadUrl,{method:"PUT",headers:{"content-type":"video/mp4"},body:new Uint8Array([1,2,3,4])});
const privateRow=(await request("/api/contents?code="+privateDraft.contentCode)).contents[0];
await request(`/api/content-versions/${privateRow.versionId}/cover`,{method:"PUT",headers:{"content-type":"image/jpeg"},body:new Uint8Array([255,216,255,217])});
const employeeCookie=cookie;
cookie=adminCookie;
await request("/api/contents/"+privateDraft.contentCode,json({action:"update",visibility:"public"},"PATCH"));
cookie=employeeCookie;
await expectStatus("/api/contents/"+privateDraft.contentCode,409,json({action:"archive",reason:"不再处理"},"PATCH"));
await request("/api/contents/"+privateDraft.contentCode,{method:"DELETE"});
assert.ok((await request("/api/contents/trash")).contents.some(item=>item.code===privateDraft.contentCode));
await request("/api/contents/trash",json({codes:[privateDraft.contentCode]}));
await request("/api/contents/"+privateDraft.contentCode,{method:"DELETE"});
cookie=adminCookie;
await request("/api/contents/trash",json({codes:[privateDraft.contentCode]},"DELETE"));
await expectStatus(`/api/content-versions/${privateRow.versionId}/cover`,404);
await request("/api/filters?id="+filterSaved.id,{method:"DELETE"});
console.log(JSON.stringify({v18:true,archiveRestore:true,independentLanes:true,metadataFilters:true,templateManagement:true,employeeColors:true,superAdminPurge:true,linkedDeletionBlocked:true}));

console.log(JSON.stringify({ok:true,contentCode:content.contentCode,latestVersion:2,reviewStatus:"approved",publishStatus:"published",platform:platform.name,productId:product.id,accountId:account.id}));
