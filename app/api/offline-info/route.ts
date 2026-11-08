import {requireUser} from '@/lib/server-auth';
import {getLocalDatabase} from '@/db';
export async function GET(request:Request){const auth=await requireUser(request);if(!auth.user)return auth.response;return Response.json({protocol:2,userId:auth.user.id,serverId:getLocalDatabase().prepare('SELECT server_id FROM offline_server_identity WHERE id=1').get()!.server_id,version:'3.27.0',employeeVersion:'1.2.0'});}
