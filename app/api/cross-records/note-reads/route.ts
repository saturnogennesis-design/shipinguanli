import {requireCross} from '@/lib/cross-auth';
import {readCrossNotes} from '@/lib/cross-note-reads';
export async function POST(request:Request){const auth=await requireCross(request);if(!auth.user)return auth.response;const body=await request.json().catch(()=>null);if(!body||!Number.isSafeInteger(body.id)||body.id<=0||!Number.isSafeInteger(body.through))return Response.json({error:'参数无效'},{status:400});try{return Response.json({unreadNotes:readCrossNotes(auth.db,auth.user,body.id,body.through)});}catch(e){return Response.json({error:(e as Error).message},{status:403});}}
