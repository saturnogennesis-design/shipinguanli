import {and,eq,inArray,sql} from "drizzle-orm";
import {getDb} from "@/db";
import {materials,noticeReceipts,notices,users} from "@/db/schema";
import {hasPermission,type AuthUser} from "@/lib/server-auth";

export class InputError extends Error { constructor(message:string,public status=400){super(message);} }
export const communicationError=(error:unknown)=>{if(!(error instanceof InputError))console.error("[communication]",error);return Response.json({error:error instanceof InputError?error.message:"操作失败，请稍后重试"},{status:error instanceof InputError?error.status:500});};
export function requiredText(value:unknown,label:string,max:number){if(typeof value!=="string"||!value.trim()||value.trim().length>max)throw new InputError(`${label}不能为空且不能超过${max}字`);return value.trim();}
export function ids(value:unknown):number[]{if(!Array.isArray(value)||value.length>2000||value.some(x=>!Number.isSafeInteger(x)||x<=0))throw new InputError("选择范围无效");return [...new Set(value)] as number[];}
export async function recipients(value:unknown){
 if(!value||typeof value!=="object")throw new InputError("请选择接收范围");
 const selection=value as {all?:boolean;users?:unknown;departments?:unknown;roles?:unknown};
 const selected=ids(selection.users??[]),deps=ids(selection.departments??[]),roles=ids(selection.roles??[]);
 const people=await getDb().select({id:users.id,departmentId:users.departmentId,roleId:users.roleId}).from(users).where(eq(users.status,"active"));
 const result=people.filter(u=>selection.all===true||selected.includes(u.id)||deps.includes(u.departmentId??0)||roles.includes(u.roleId)).map(u=>u.id);
 if(!result.length)throw new InputError("请选择至少一名有效接收人");
 return result;
}
export const materialVisible=(user:AuthUser)=>user.roleCode==="super_admin"?sql`1=1`:sql`(${materials.ownerUserId}=${user.id} OR EXISTS (SELECT 1 FROM json_each(${materials.audienceJson}) WHERE value=${user.id}))`;
export function mayReadMaterial(user:AuthUser,row:typeof materials.$inferSelect){return hasPermission(user,"asset.view")&&(user.roleCode==="super_admin"||row.ownerUserId===user.id||(JSON.parse(row.audienceJson) as number[]).includes(user.id));}
export async function getMaterial(user:AuthUser,id:number){
 const [row]=await getDb().select().from(materials).where(eq(materials.id,id)).limit(1);
 if(!row||!mayReadMaterial(user,row))throw new InputError("素材不存在或无权查看",404);
 return row;
}
export function materialDto(row:typeof materials.$inferSelect,user:AuthUser){
 const {storagePath,audienceJson,...safe}=row;void storagePath;
 const canEdit=hasPermission(user,"asset.upload")&&(row.ownerUserId===user.id||user.roleCode==="super_admin");
 return {...safe,canEdit,audience:canEdit?JSON.parse(audienceJson):undefined,canDownload:row.downloadable||row.ownerUserId===user.id||user.roleCode==="super_admin"};
}
export async function getNotice(user:AuthUser,id:number){
 if(!hasPermission(user,"notice.view"))throw new InputError("无权查看公告",403);
 const [row]=await getDb().select().from(notices).where(eq(notices.id,id)).limit(1);
 if(!row)throw new InputError("公告不存在",404);
 if(row.publishStatus!=="published"&&row.authorUserId!==user.id&&user.roleCode!=="super_admin")throw new InputError("公告尚未发布完成",404);
 const [receipt]=await getDb().select().from(noticeReceipts).where(and(eq(noticeReceipts.noticeId,id),eq(noticeReceipts.userId,user.id))).limit(1);
 if(!receipt&&row.authorUserId!==user.id&&user.roleCode!=="super_admin")throw new InputError("公告不存在或无权查看",404);
 return {row,receipt};
}
export async function linkedMaterials(user:AuthUser,value:unknown,targets?:number[]){
 const selected=ids(value??[]);if(selected.length>20)throw new InputError("一次最多关联20项素材");
 const rows=selected.length?await getDb().select().from(materials).where(and(inArray(materials.id,selected),eq(materials.uploadStatus,"complete"))):[];
 if(rows.length!==selected.length||rows.some(row=>!mayReadMaterial(user,row)))throw new InputError("关联素材不存在、上传未完成或无权查看");
 if(targets&&rows.some(row=>targets.some(id=>id!==row.ownerUserId&&!(JSON.parse(row.audienceJson) as number[]).includes(id))))throw new InputError("部分接收人不在关联素材的查看范围内，请先调整素材范围");
 return selected;
}
