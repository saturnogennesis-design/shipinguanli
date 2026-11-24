import {requireUser} from '@/lib/server-auth';
import {getLocalDatabase} from '@/db';
import {recordDevice} from '@/lib/employee-sync-control';
export async function POST(request:Request){const a=await requireUser(request);if(!a.user)return a.response;const raw=await request.text();if(raw.length>2000000)return Response.json({error:'报告过大'},{status:413});try{return Response.json({commands:recordDevice(getLocalDatabase(),a.user.id,JSON.parse(raw))});}catch(e){return Response.json({error:(e as Error).message},{status:409});}}
