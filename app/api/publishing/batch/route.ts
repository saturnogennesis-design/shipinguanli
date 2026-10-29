import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission} from '@/lib/server-auth';
import {publishingAccountIds} from '@/lib/v3-access';
import {writeTargetPublishingBatch} from '@/lib/target-publishing';
import {PublishingConflict} from '@/lib/publishing-write';
export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,'publishing.status')||!(await publishingAccountIds(auth.user)).includes(auth.user.projectId!))return Response.json({error:'没有本项目的发布操作权限'},{status:403});
 const body=await request.json().catch(()=>null);
 if(!body||!Number.isSafeInteger(body.targetId)||body.targetId<=0||!Array.isArray(body.items)||body.items.length<1||body.items.length>200||body.items.some((item:unknown)=>!item||typeof item!=='object'||!('contentCode' in item)||typeof item.contentCode!=='string'||!item.contentCode||!('expectedRevision' in item)||!Number.isSafeInteger(item.expectedRevision)||Number(item.expectedRevision)<0)||new Set(body.items.map((item:{contentCode:string})=>item.contentCode)).size!==body.items.length)return Response.json({error:'请选择1至200条不同的内容，并刷新发布状态后重试'},{status:400});
 try{return Response.json({ok:true,results:writeTargetPublishingBatch(getLocalDatabase(),{projectId:auth.user.projectId!,targetId:body.targetId,userId:auth.user.id,items:body.items})});}
 catch(error){if(error instanceof PublishingConflict)return Response.json({error:error.message},{status:409});throw error;}
}
