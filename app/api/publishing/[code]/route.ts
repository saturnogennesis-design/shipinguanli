import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission} from '@/lib/server-auth';
import {publishingAccountIds} from '@/lib/v3-access';
import {writeTargetPublishing} from '@/lib/target-publishing';
import {PublishingConflict} from '@/lib/publishing-write';
type Context={params:Promise<{code:string}>};
export async function PUT(request:Request,context:Context){return save(request,context,false);}
export async function PATCH(request:Request,context:Context){return save(request,context,true);}
async function save(request:Request,context:Context,statusOnly:boolean){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 if(!hasPermission(auth.user,statusOnly?'publishing.status':'publishing.assign')||!(await publishingAccountIds(auth.user)).includes(auth.user.projectId!))return Response.json({error:'没有本项目的发布操作权限'},{status:403});
 const body=await request.json().catch(()=>null);
 if(!body||!Number.isSafeInteger(body.targetId)||body.targetId<=0||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||(statusOnly&&typeof body.published!=='boolean'))return Response.json({error:'发布参数无效，请刷新后重试'},{status:400});
 if(!statusOnly&&((body.productMasterId!=null&&(!Number.isSafeInteger(body.productMasterId)||body.productMasterId<=0))||typeof body.title!=='string'||typeof body.body!=='string'||!Array.isArray(body.topics)||body.topics.some((item:unknown)=>typeof item!=='string')))return Response.json({error:'发布资料参数无效'},{status:400});
 try{return Response.json(writeTargetPublishing(getLocalDatabase(),{projectId:auth.user.projectId!,contentCode:(await context.params).code,targetId:body.targetId,userId:auth.user.id,expectedRevision:body.expectedRevision,...(statusOnly?{published:body.published}:{details:{productMasterId:body.productMasterId??null,title:body.title.slice(0,500),body:body.body.slice(0,20000),topics:body.topics.slice(0,50)}})}));}
 catch(error){if(error instanceof PublishingConflict)return Response.json({error:error.message},{status:409});throw error;}
}
