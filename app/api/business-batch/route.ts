import {deletionBlockInfo} from '@/lib/deletion-blockers';
import {createHash,randomBytes} from 'node:crypto';
import {bindProjectRequest} from '@/lib/project-access';
import {requireUser,hasPermission,getSessionTokenHash,userForSessionHash,authorizeInternalRequest} from '@/lib/server-auth';
import {getLocalDatabase} from '@/db';
import {visibleProjectIds} from '@/lib/project-access';
import {batchActions,batchRecord,rowRevision,runBatchItem,batchSignature,batchReceipt,saveBatchReceipt,type BatchAction,type BatchOptions} from '@/lib/business-batch';
import {permanentlyDelete,type BusinessKind} from '@/lib/permanent-delete';
import {GET as crossDelivery} from '../cross-records/[id]/delivery/route';
import {GET as materialDelivery} from '../material-sets/[id]/download/route';
import {GET as contentDelivery} from '../content-versions/[id]/file/route';
import {GET as imageDelivery} from '../content-version-files/[id]/file/route';
import {zipStream} from '@/lib/zip-stream';
export async function POST(request:Request){
 const auth=await requireUser(request);if(!auth.user)return auth.response;let user=auth.user;const db=getLocalDatabase();
 if(!user.projectId||!visibleProjectIds(db,user).includes(user.projectId))return Response.json({error:'没有项目访问权限'},{status:403});
 const body=await request.json().catch(()=>null);
 if(body?.action==='download'&&body.mode==='download'){
  if(!['cross','content','material'].includes(body.kind)||!Array.isArray(body.items)||!body.items.length||body.items.length>100)return Response.json({error:'请选择1至100条资料'},{status:400});
  const keys: number[]=[];const failures: string[]=[];
  for(const item of body.items)try{const row=batchRecord(db,user,body.kind,item.key);runBatchItem(db,user,body.kind,Number(row.id),'download',{},rowRevision(row),true);keys.push(Number(row.id));}catch(error){failures.push((error as Error).message);}
  if(!keys.length)return Response.json({error:failures[0]??'没有可下载的资料'},{status:409});
  const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex'),sessionHash=await getSessionTokenHash(request);
  if(!sessionHash)return Response.json({error:'请重新登录后下载'},{status:401});
  db.prepare('DELETE FROM business_download_tickets WHERE expires_at<?').run(Date.now());
  db.prepare('INSERT INTO business_download_tickets(token_hash,session_hash,user_id,project_id,kind,keys_json,expires_at) VALUES(?,?,?,?,?,?,?)').run(hash,sessionHash,user.id,user.projectId,body.kind,JSON.stringify({keys:[...new Set(keys)],skipped:failures}),Date.now()+120000);
  const url=new URL('/api/business-batch',request.url);url.searchParams.set('ticket',token);return Response.json({url:url.href,count:keys.length,skipped:failures.length});
 }

 if(!body||!['cross','content','material'].includes(body.kind)||!batchActions.includes(body.action)||body.action==='download'||!Array.isArray(body.items)||body.items.length<1||body.items.length>100||!['preview','execute'].includes(body.mode))return Response.json({error:'批量参数无效，每次最多100条'},{status:400});
 if(body.mode==='execute'&&(body.confirmed!==true||typeof body.requestKey!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(body.requestKey)))return Response.json({error:'请先检查并确认批量操作'},{status:400});
 const kind=body.kind as BusinessKind,action=body.action as BatchAction,options=(body.options??{}) as BatchOptions,seen=new Set<string>(),results=[];
 for(const item of body.items){const key=item?.key;
  if(!['string','number'].includes(typeof key)||typeof key==='string'&&key.length>120||typeof key==='number'&&(!Number.isSafeInteger(key)||key<=0)||seen.has(String(key))){results.push({key,ok:false,error:'资料编号无效或重复'});continue;}seen.add(String(key));
  try{
   const live=await requireUser(new Request(request.url,{headers:request.headers}));if(!live.user||!live.user.projectId)throw Error('登录或项目权限已变化，请重新进入项目');user=live.user;
   if(body.mode==='execute'&&Number.isSafeInteger(key)){if(action==='purge'&&user.roleCode!=='super_admin')throw Error('只有超级管理员可彻底删除');const prior=batchReceipt(db,user,body.requestKey,kind,Number(key),batchSignature(action,options));if(prior){results.push({...prior,key,ok:true,replayed:true});continue;}}
   const row=batchRecord(db,user,kind,key),revision=body.mode==='preview'?rowRevision(row):item.revision;
   if(!Number.isSafeInteger(revision))throw Error('资料修订号无效');
   if(action==='purge'&&body.mode==='execute'){
    runBatchItem(db,user,kind,key,action,options,revision,true);
    const result={key,id:Number(row.id),title:String(row.title),revision,ok:true};
    const deleted=await permanentlyDelete(db,{kind,id:Number(row.id),project:user.projectId!,actor:user.id,revision,onDeleted:()=>saveBatchReceipt(db,user,body.requestKey,kind,Number(row.id),batchSignature(action,options),{...result,cleanupPending:true})});
    db.prepare('UPDATE business_batch_receipts SET result_json=? WHERE user_id=? AND project_id=? AND request_key=? AND kind=? AND record_id=?').run(JSON.stringify({...result,cleanupPending:deleted.cleanupPending}),user.id,user.projectId!,body.requestKey,kind,Number(row.id));results.push({...result,cleanupPending:deleted.cleanupPending});
   }else{const result=runBatchItem(db,user,kind,key,action,options,revision,body.mode==='preview',body.requestKey);results.push({...result,key,ok:true});}
  }catch(error){let blockers;try{if(action==='purge'){const r=batchRecord(db,user,kind,key);blockers=deletionBlockInfo(db,user,kind,Number(r.id));}}catch{/* Never expose references of an inaccessible record. */}results.push({key,ok:false,error:(error as Error).message,...(blockers?.blocked?{blockers}:{})});}
 }
 return Response.json({results,success:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length});
}
function safe(name:string){return [...name].map(c=>c.charCodeAt(0)<32||'<>:"/\\|?*'.includes(c)?'-':c).join('').slice(0,80)||'资料';}
export async function GET(request:Request){
 const db=getLocalDatabase(),q=new URL(request.url).searchParams,ticket=q.get('ticket');
 let user,kind:BusinessKind,keys:string[],sessionHash='';let initialSkipped:string[]=[];
 if(ticket){
  if(!/^[a-f0-9]{64}$/.test(ticket))return Response.json({error:'下载链接无效'},{status:403});
  const hash=createHash('sha256').update(ticket).digest('hex');const grant=db.prepare('SELECT * FROM business_download_tickets WHERE token_hash=? AND used=0 AND expires_at>?').get(hash,Date.now());
  if(!grant)return Response.json({error:'下载链接已失效，请重新选择下载'},{status:403});
  sessionHash=String(grant.session_hash);user=await userForSessionHash(sessionHash);if(!user||user.id!==grant.user_id)return Response.json({error:'登录已失效，请重新登录下载'},{status:401});
  const bound=new URL(request.url);bound.searchParams.set('projectId',String(grant.project_id));const error=await bindProjectRequest(db,new Request(bound),user);if(error)return error;
  const consumed=db.prepare('UPDATE business_download_tickets SET used=1 WHERE token_hash=? AND used=0').run(hash);if(!consumed.changes)return Response.json({error:'下载链接已使用'},{status:403});
  kind=String(grant.kind) as BusinessKind;const saved=JSON.parse(String(grant.keys_json));keys=saved.keys.map(String);initialSkipped=saved.skipped;
 }else{
  const auth=await requireUser(request);if(!auth.user)return auth.response;user=auth.user;kind=q.get('kind') as BusinessKind;keys=(q.get('ids')??'').split(',').filter(Boolean);
 }
 if(!['cross','content','material'].includes(kind)||!user.projectId||!visibleProjectIds(db,user).includes(user.projectId))return Response.json({error:'下载参数或项目权限无效'},{status:403});
 if(!keys.length||keys.length>100)return Response.json({error:'请选择1至100条资料'},{status:400});
 const currentUser=user;
 const results:Array<{name:string;open:()=>Promise<ReadableStream|null>}>=[],skipped:string[]=[...initialSkipped];
 for(const key of [...new Set(keys)])try{
  const row=batchRecord(db,currentUser,kind,Number(key)),id=Number(row.id);runBatchItem(db,currentUser,kind,id,'download',{},rowRevision(row),true);
  const requestFor=async(path:string)=>{const fresh=sessionHash?await userForSessionHash(sessionHash):await userForSessionHash(await getSessionTokenHash(request));if(!fresh)throw Error('登录已失效');const headers=new Headers(request.headers);headers.set('x-orbit-project-id',String(currentUser.projectId));headers.delete('range');return authorizeInternalRequest(new Request(new URL(path,request.url),{headers}),fresh);};
  if(kind==='cross'||kind==='material'){
   const path=kind==='cross'?`/api/cross-records/${id}/delivery`:`/api/material-sets/${id}/download`,handler=kind==='cross'?crossDelivery:materialDelivery;
   results.push({name:safe(String(row.title))+'-'+id+'.zip',open:async()=>{const response=await handler(await requestFor(path),{params:Promise.resolve({id:String(id)})});if(!response.ok)throw Error('下载权限或状态已变化');return response.body;}});
  }else{
   if(!hasPermission(currentUser,'content.download'))throw Error('没有下载权限');const version=db.prepare("SELECT * FROM content_versions WHERE content_id=? AND version_number=? AND deleted_at IS NULL AND upload_status='complete'").get(id,Number(row.latest_version_number));if(!version)throw Error('文件未就绪');
   const files=version.mime_type==='application/x-image-set'?db.prepare('SELECT id,file_name FROM content_version_files WHERE version_id=? ORDER BY position').all(Number(version.id)):[{id:version.id,file_name:version.file_name}];
   for(const [index,file] of files.entries()){const image=version.mime_type==='application/x-image-set',path=image?`/api/content-version-files/${file.id}/file`:`/api/content-versions/${file.id}/file`,handler=image?imageDelivery:contentDelivery;results.push({name:safe(String(row.title))+'-'+id+'/'+String(index+1).padStart(3,'0')+'-'+safe(String(file.file_name)),open:async()=>{batchRecord(db,currentUser,kind,id);const response=await handler(await requestFor(path),{params:Promise.resolve({id:String(file.id)})});if(!response.ok)throw Error('文件权限或状态已变化');return response.body;}});}
  }
 }catch(error){skipped.push(key+'：'+(error as Error).message);}
 if(!results.length)return Response.json({error:skipped.join('；')||'没有可下载资料'},{status:409});
 if(skipped.length)results.push({name:'未下载说明.txt',open:async()=>new Blob([skipped.join('\n')]).stream()});
 return new Response(zipStream(results),{headers:{'content-type':'application/zip','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent('批量资料.zip'),'cache-control':'private, no-store'}});
}
