import {isProjectMaster} from './project-visibility';
import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission,type AuthUser} from './server-auth';
import {visibleProjectIds} from './project-access';
export function crossAccess(user:AuthUser){
 const admin=isProjectMaster(getLocalDatabase(),user)||user.roleCode==='super_admin'||hasPermission(user,'business.accounts');
 const canAssign=admin||hasPermission(user,'cross.assign');
 return {admin,canAssign,canReview:admin||hasPermission(user,'cross.review'),canCreate:canAssign||hasPermission(user,'cross.create'),canView:admin||hasPermission(user,'cross.view')||hasPermission(user,'cross.create')||hasPermission(user,'cross.review')||hasPermission(user,'cross.assign')||hasPermission(user,'cross.download'),canDownload:admin||hasPermission(user,'cross.download')};
}
export async function requireCross(request:Request){
 const auth=await requireUser(request);if(!auth.user)return {response:auth.response};
 const user=auth.user,db=getLocalDatabase();
 if(!user.projectId||!visibleProjectIds(db,user).includes(user.projectId))return {response:Response.json({error:'没有项目访问权限'},{status:403})};
 if(db.prepare('SELECT project_type FROM short_video_accounts WHERE id=?').get(user.projectId)?.project_type!=='cross_border')return {response:Response.json({error:'该功能仅用于跨境项目'},{status:409})};
 const access=crossAccess(user);if(!access.canView)return {response:Response.json({error:'没有资料查看权限'},{status:403})};
 return {user,db,access};
}
