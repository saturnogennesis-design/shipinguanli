import {getCurrentUser,applyProjectProfile,projectPermission} from '@/lib/server-auth';
import {getLocalDatabase} from '@/db';
import {allowedProjectIds,isProjectMaster} from '@/lib/project-visibility';
import {projectPermissionCatalog} from '@/lib/project-permission-catalog';
export const dynamic='force-dynamic';
export async function GET(request:Request){const user=await getCurrentUser(request);if(!user)return Response.json({error:'请先登录'},{status:401});const raw=new URL(request.url).searchParams.get('projectId');if(raw){const id=Number(raw),db=getLocalDatabase();if(!allowedProjectIds(db,user).includes(id))return Response.json({error:'没有项目访问权限'},{status:403});user.projectId=id;applyProjectProfile(user);const type=String(db.prepare('SELECT project_type FROM short_video_accounts WHERE id=?').get(id)?.project_type);user.permissions=projectPermissionCatalog(type).flatMap(g=>g.permissions).filter(p=>projectPermission(user,p.key,id)).map(p=>p.key);return Response.json({user:{...user,projectMaster:isProjectMaster(db,user)}});}return Response.json({user});}
