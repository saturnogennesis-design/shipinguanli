import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {materials} from "@/db/schema";
import {requireUser,hasPermission} from "@/lib/server-auth";
import {communicationError,getMaterial,InputError,materialDto,recipients,requiredText} from "@/lib/communication";
import {getMediaStore} from "@/lib/media-store";
import {writeAudit} from "@/lib/audit";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){const auth=await requireUser(request);if(!auth.user)return auth.response;try{return Response.json(materialDto(await getMaterial(auth.user,Number((await context.params).id)),auth.user));}catch(e){return communicationError(e);}}
export async function PATCH(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{const row=await getMaterial(auth.user,Number((await context.params).id));if(!hasPermission(auth.user,"asset.upload")||(row.ownerUserId!==auth.user.id&&auth.user.roleCode!=="super_admin"))throw new InputError("无权维护此素材",403);
 const body=await request.json();const audience=await recipients(body.audience);
 await getDb().update(materials).set({title:requiredText(body.title,"素材标题",120),description:String(body.description??"").slice(0,2000),audienceJson:JSON.stringify(audience),downloadable:body.downloadable===true,updatedAt:new Date().toISOString()}).where(eq(materials.id,row.id));
 await writeAudit(request,{userId:auth.user.id,action:"material.update",objectType:"material",objectId:String(row.id),details:{downloadable:body.downloadable===true,recipientCount:audience.length}});
 return Response.json({ok:true});}catch(e){return communicationError(e);}
}
export async function DELETE(request:Request,context:Context){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 try{const row=await getMaterial(auth.user,Number((await context.params).id));if(row.ownerUserId!==auth.user.id||row.uploadStatus!=="pending")throw new InputError("仅可取消本人未完成的上传",409);
 await getMediaStore().delete(row.storagePath);await getDb().delete(materials).where(eq(materials.id,row.id));return Response.json({ok:true});}catch(e){return communicationError(e);}
}
