import {asc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {contentGroups,departments,shortVideoAccounts,users} from "@/db/schema";
import {groupScopeIds,hasPermission,requireUser} from "@/lib/server-auth";

export const dynamic="force-dynamic";

export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 const url=new URL(request.url),scope=String(url.searchParams.get("scope")||"view");
 const permission=scope==="review"?"review.process":scope==="upload"?"content.upload":"content.view";
 if(!hasPermission(auth.user,permission))return Response.json({error:"没有对应的小组访问权限"},{status:403});
 const rows=await getDb().select({id:contentGroups.id,code:contentGroups.code,name:contentGroups.name,accountId:contentGroups.accountId,accountName:shortVideoAccounts.name,coverPath:contentGroups.coverPath,themeColor:contentGroups.themeColor,description:contentGroups.description,businessDirection:contentGroups.businessDirection,status:contentGroups.status,departmentId:contentGroups.departmentId,departmentName:departments.name,leaderUserId:contentGroups.leaderUserId,leaderName:users.displayName}).from(contentGroups).leftJoin(shortVideoAccounts,eq(shortVideoAccounts.id,contentGroups.accountId)).leftJoin(departments,eq(contentGroups.departmentId,departments.id)).leftJoin(users,eq(contentGroups.leaderUserId,users.id)).where(eq(contentGroups.status,"active")).orderBy(asc(contentGroups.name));
 const allowed=new Set(groupScopeIds(auth.user,scope));
 if((scope==="upload"||scope==="review")&&!allowed.size&&auth.user.primaryGroupId)allowed.add(auth.user.primaryGroupId);
 const groups=auth.user.roleCode==="super_admin"?rows:rows.filter(row=>allowed.has(row.id));
 return Response.json({primaryGroupId:auth.user.primaryGroupId,scope,groups});
}
