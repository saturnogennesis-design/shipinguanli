import {requireCross} from '@/lib/cross-auth';
import {crossRow,changeCross} from '@/lib/cross-workflow';
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){
 const auth=await requireCross(request);if(!auth.user)return auth.response;const {db,user,access}=auth;
 const id=Number((await context.params).id),row=crossRow(db,id,user.projectId!);if(!row)return Response.json({error:'资料不存在或不属于当前项目'},{status:404});
 const body=await request.json().catch(()=>null);if(!body)return Response.json({error:'参数无效'},{status:400});
 if(!access.canAssign&&row.creator_id!==user.id&&row.maker_id!==user.id&&!['approve','reject'].includes(body.action))return Response.json({error:'没有修改该资料的权限'},{status:403});
 if(['approve','reject'].includes(body.action)&&!access.canReview)return Response.json({error:'没有审核权限'},{status:403});
 if(body.makerId!==undefined&&Number(body.makerId)!==row.maker_id&&!access.canAssign)return Response.json({error:'仅项目管理员可以指定其他制作人'},{status:403});
 try{return Response.json({row:changeCross(db,{id,project:user.projectId!,actor:user.id,revision:Number(body.revision),action:body.action,body,canReview:access.canReview,canEdit:access.canCreate&&(access.canAssign||row.creator_id===user.id||row.maker_id===user.id)})});}catch(error){return Response.json({error:(error as Error).message},{status:409});}
}
