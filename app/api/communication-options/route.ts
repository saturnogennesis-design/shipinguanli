import {asc,eq} from "drizzle-orm";
import {getDb} from "@/db";
import {contentGroups,departments,groupMemberships,roles,users} from "@/db/schema";
import {requireUser,hasPermission} from "@/lib/server-auth";
export async function GET(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;
 const canUpload=hasPermission(auth.user,"asset.upload"),canPublish=hasPermission(auth.user,"notice.publish"),canBrowseMaterials=hasPermission(auth.user,"asset.view");
 if(!canUpload&&!canPublish)return Response.json({canUpload,canPublish,canBrowseMaterials,users:[],roles:[],departments:[],groups:[]});
 const db=getDb();
 const [people,roleRows,departmentRows,groupRows,memberships]=await Promise.all([
  db.select({id:users.id,name:users.displayName,color:users.contentColor,departmentId:users.departmentId,roleId:users.roleId}).from(users).where(eq(users.status,"active")).orderBy(asc(users.displayName)),
  db.select({id:roles.id,name:roles.name}).from(roles).orderBy(asc(roles.name)),
  db.select({id:departments.id,name:departments.name,parentId:departments.parentId}).from(departments).orderBy(asc(departments.name)),
  db.select({id:contentGroups.id,name:contentGroups.name}).from(contentGroups).where(eq(contentGroups.status,"active")).orderBy(asc(contentGroups.name)),
  db.select({userId:groupMemberships.userId,groupId:groupMemberships.groupId}).from(groupMemberships),
 ]);
 const groupsByUser=new Map<number,number[]>();for(const row of memberships)(groupsByUser.get(row.userId)??(groupsByUser.set(row.userId,[]),groupsByUser.get(row.userId)!)).push(row.groupId);
 return Response.json({canUpload,canPublish,canBrowseMaterials,users:people.map(person=>({...person,groupIds:groupsByUser.get(person.id)??[]})),roles:roleRows,departments:departmentRows,groups:groupRows});
}
