import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { hasPermission, requireUser } from "@/lib/server-auth";

export const dynamic="force-dynamic";
export async function GET(request:Request){const auth=await requireUser(request);if(!auth.user)return auth.response;if(!hasPermission(auth.user,"audit.view"))return Response.json({error:"没有查看操作日志的权限"},{status:403});const rows=await getDb().select({id:auditLogs.id,userId:auditLogs.userId,userName:users.displayName,action:auditLogs.action,objectType:auditLogs.objectType,objectId:auditLogs.objectId,result:auditLogs.result,detailsJson:auditLogs.detailsJson,ipAddress:auditLogs.ipAddress,createdAt:auditLogs.createdAt}).from(auditLogs).leftJoin(users,eq(auditLogs.userId,users.id)).orderBy(desc(auditLogs.createdAt),desc(auditLogs.id)).limit(2000);return Response.json({logs:rows.map((item)=>{let details:unknown={};try{details=JSON.parse(item.detailsJson);}catch{details={raw:item.detailsJson};}return {...item,details};})});}
