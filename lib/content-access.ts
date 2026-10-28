import {and,eq,inArray,isNull,or,sql} from "drizzle-orm";
import {contents,contentVersions,reviews} from "@/db/schema";
import {getDb} from "@/db";
import {groupScopeIds,hasGroupScope,hasPermission,type AuthUser} from "./server-auth";

export function companyContentAccess(user:AuthUser){
 return user.roleCode==="super_admin";
}
// Public alone does not make ordinary employee work visible to peers.
export function contentVisibility(user:AuthUser){
 const viewGroups=groupScopeIds(user,"view");
 const managed=viewGroups.length?inArray(contents.groupId,viewGroups):sql`0=1`;
 return and(isNull(contents.deletedAt),companyContentAccess(user)?sql`1=1`:or(eq(contents.uploaderUserId,user.id),managed))!;
}
export async function canReadContentVersion(user:AuthUser,versionId:number){
 const [row]=await getDb().select({owner:contents.uploaderUserId,groupId:contents.groupId,status:contents.reviewStatus,visibility:contents.visibility,current:contents.latestVersionNumber,version:contentVersions.versionNumber}).from(contentVersions).innerJoin(contents,eq(contents.id,contentVersions.contentId)).where(and(eq(contentVersions.id,versionId),isNull(contents.deletedAt),isNull(contentVersions.deletedAt))).limit(1);
 if(!row)return false;
 const reviewer=hasPermission(user,"review.process");
 const scoped=companyContentAccess(user)||row.owner===user.id||hasGroupScope(user,"view",row.groupId)||(reviewer&&hasGroupScope(user,"review",row.groupId)&&["pending","reviewing"].includes(row.status));
 if(scoped&&(row.current===row.version||hasPermission(user,"version.view")||reviewer))return true;
 if(row.visibility!=="public"||!row.groupId||user.primaryGroupId!==row.groupId)return false;
 const [recommendation]=await getDb().select({id:reviews.id}).from(reviews).where(and(eq(reviews.versionId,versionId),eq(reviews.recommended,true),isNull(reviews.recommendationRemovedAt))).limit(1);
 return Boolean(recommendation);
}
