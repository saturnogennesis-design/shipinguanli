import {requireUser,hasPermission} from './server-auth';
import {getLocalDatabase} from '@/db';
import {crossLeader} from './cross-assignment';
export type TransferPackage={id:number;project_id:number;creator_id:number;title:string;lifecycle:string;previous_lifecycle:string;revision:number};
export async function requireTransfer(request:Request){const auth=await requireUser(request);if(!auth.user)return {response:auth.response};const user=auth.user,db=getLocalDatabase();if(!user.projectId||!hasPermission(user,'transfer.view'))return {response:Response.json({error:'没有中转站访问权限'},{status:403})};return {user,db,access:{upload:hasPermission(user,'transfer.upload'),download:hasPermission(user,'transfer.download'),archive:hasPermission(user,'transfer.archive'),delete:hasPermission(user,'transfer.delete')}};}
export function transferVisible(db:ReturnType<typeof getLocalDatabase>,row:TransferPackage,user:{id:number;projectId?:number}){return row.project_id===user.projectId&&(row.creator_id===user.id||crossLeader(db,user,row.project_id));}
