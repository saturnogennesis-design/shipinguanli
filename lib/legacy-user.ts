import {getLocalDatabase} from '@/db';
import type {AuthUser} from './server-auth';
export async function legacyUser(id:number,base:AuthUser){
 const db=getLocalDatabase(),row=db.prepare('SELECT u.*,r.code AS role_code,r.permissions_json FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?').get(id)!;
 const {dutyPermissions}=await import('@/lib/permissions');const scopes:Record<string,number[]>={},responsibilities:Record<string,number[]>={};
 for(const r of db.prepare('SELECT group_id,scope_type FROM user_group_scopes WHERE user_id=?').all(id))(scopes[String(r.scope_type)]??=[]).push(Number(r.group_id));
 const primary=Number(row.primary_group_id)||null;if(primary)(scopes.upload??=[]).push(primary);
 for(const r of db.prepare('SELECT account_id,responsibility_type FROM user_account_responsibilities WHERE user_id=?').all(id)){const key=String(r.responsibility_type),mapped=key==='material'||key==='material_upload'?'materialUpload':key==='material_review'?'materialReview':key==='publisher'?'publishing':key;(responsibilities[mapped]??=[]).push(Number(r.account_id));}
 const overrides=db.prepare('SELECT permission_key,effect FROM user_permission_overrides WHERE user_id=?').all(id),denied=overrides.filter(r=>r.effect==='deny').map(r=>String(r.permission_key));
 return {...base,id,roleCode:String(row.role_code),projectId:undefined,primaryGroupId:primary,groupScopes:scopes,permissions:[...JSON.parse(String(row.permissions_json)),...dutyPermissions({primaryGroupId:primary,groupScopes:scopes,accountResponsibilities:responsibilities}),...overrides.filter(r=>r.effect==='allow').map(r=>String(r.permission_key))].filter(k=>!denied.includes(k)),deniedPermissions:denied};
}
