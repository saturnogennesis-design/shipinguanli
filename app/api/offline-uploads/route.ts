import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {getLocalDatabase} from '@/db';
import {requireUser,hasPermission,hasGroupScope} from '@/lib/server-auth';
import {getMediaStore} from '@/lib/media-store';
import {OFFLINE_CHUNK,offlineTask,beginOffline,validateOfflineDraft,commitOfflineDraft,digest,verifyOfflineSignature,type OfflineDraft} from '@/lib/offline-upload';
const busy=new Set<string>();
async function authorize(request:Request){const auth=await requireUser(request);if(!auth.user)return {user:null,db:null,response:auth.response} as const;const db=getLocalDatabase(),cross=db.prepare('SELECT project_type FROM short_video_accounts WHERE id=?').get(auth.user.projectId!)?.project_type==='cross_border';if(!hasPermission(auth.user,cross?'cross.create':'content.upload'))return {user:null,db:null,response:Response.json({error:'没有新建上传权限'},{status:403})} as const;return {...auth,db};}
async function limitedJson(request:Request){let n=0;const chunks:Uint8Array[]=[];if(!request.body)return null;const reader=request.body.getReader();while(true){const item=await reader.read();if(item.done)break;n+=item.value.length;if(n>150000){await reader.cancel();throw Error('任务信息过大');}chunks.push(item.value);}return JSON.parse(Buffer.concat(chunks).toString());}
function status(db:ReturnType<typeof getLocalDatabase>,user:number,id:string,project:number){const t=offlineTask(db,user,id,project);return {chunkSize:OFFLINE_CHUNK,result:t.result_json?JSON.parse(t.result_json):null,chunks:db.prepare('SELECT file_index AS fileIndex,part_index AS partIndex,sha256 FROM offline_upload_chunks WHERE user_id=? AND task_id=?').all(user,id)};}
export async function GET(request:Request){const a=await authorize(request);if(!a.user||!a.db)return a.response;try{return Response.json(status(a.db,a.user.id,new URL(request.url).searchParams.get('task')??'',a.user.projectId!));}catch{return Response.json({error:'任务不存在'},{status:404});}}
export async function POST(request:Request){const a=await authorize(request);if(!a.user||!a.db)return a.response;const {user,db}=a;if(Number(request.headers.get('content-length'))>150000)return Response.json({error:'任务信息过大'},{status:413});const body=await limitedJson(request).catch(()=>null);if(!body)return Response.json({error:'任务参数无效'},{status:400});const lock=user.id+':'+body.task;
 if(busy.has(lock))return Response.json({error:'任务处理中，请稍后重试'},{status:409});busy.add(lock);
 try{
 if(body.action!=='complete'){beginOffline(db,user.id,user.projectId!,String(body.task),body.draft);return Response.json(status(db,user.id,body.task,user.projectId!));}
 const task=offlineTask(db,user.id,body.task,user.projectId!);if(task.result_json)return Response.json({result:JSON.parse(task.result_json)});
 const draft=JSON.parse(task.payload_json) as OfflineDraft;validateOfflineDraft(db,user.id,user.projectId!,draft);const store=getMediaStore(),keys:string[]=[];
 for(let i=0;i<draft.files.length;i++){
  const file=draft.files[i],chunks=db.prepare('SELECT * FROM offline_upload_chunks WHERE user_id=? AND task_id=? AND file_index=? ORDER BY part_index').all(user.id,body.task,i);
  if(chunks.length!==Math.ceil(file.size/OFFLINE_CHUNK)||chunks.some((r,n)=>r.part_index!==n))throw Error('文件尚未完整上传');
  const key=`offline-content/${user.id}/${body.task}/${i}-${file.sha256}`,hash=createHash('sha256');let total=0;let head=new Uint8Array();
  async function* source(){for(const chunk of chunks){const object=await store.get(String(chunk.storage_key));if(!object)throw Error('暂存分块缺失，请重新上传');for await(const bytes of Readable.fromWeb(object.body as never)){const b=Buffer.from(bytes);if(!total)head=new Uint8Array(b.subarray(0,16));hash.update(b);total+=b.length;yield b;}}if(total!==file.size||hash.digest('hex')!==file.sha256)throw Error('完整文件校验失败');verifyOfflineSignature(file,head);}
  await store.put(key,Readable.toWeb(Readable.from(source())) as ReadableStream,{httpMetadata:{contentType:file.mime}});keys.push(key);
 }
 // Awaiting file writes never holds a SQLite transaction. Re-authenticate after assembly.
 const fresh=await authorize(new Request(request.url,{headers:request.headers}));if(!fresh.user||!fresh.db)return fresh.response;
 const group=fresh.user.primaryGroupId;if(draft.kind==='video'||draft.kind==='image_text'){if(!group||!hasGroupScope(fresh.user,'upload',group))throw Error('项目上传范围已变更');}
 const result=commitOfflineDraft(db,task,keys,group??null);
 const chunks=db.prepare('SELECT storage_key FROM offline_upload_chunks WHERE user_id=? AND task_id=?').all(user.id,body.task);for(const chunk of chunks)await store.delete(String(chunk.storage_key)).catch(()=>undefined);db.prepare('DELETE FROM offline_upload_chunks WHERE user_id=? AND task_id=?').run(user.id,body.task);
 return Response.json({result});
 }catch(e){return Response.json({error:(e as Error).message},{status:409});}finally{busy.delete(lock);}}
export async function PUT(request:Request){const a=await authorize(request);if(!a.user||!a.db)return a.response;const {user,db}=a,q=new URL(request.url).searchParams,taskId=q.get('task')??'',fileIndex=Number(q.get('file')),part=Number(q.get('part'));
 try{const task=offlineTask(db,user.id,taskId,user.projectId!);if(task.result_json)return Response.json({result:JSON.parse(task.result_json)});const files=(JSON.parse(task.payload_json) as OfflineDraft).files,file=files[fileIndex];if(!Number.isInteger(fileIndex)||!file||!Number.isInteger(part)||part<0||part>=Math.ceil(file.size/OFFLINE_CHUNK))throw Error('分块位置无效');
 const expected=Math.min(OFFLINE_CHUNK,file.size-part*OFFLINE_CHUNK);if(!request.body)throw Error('分块为空');const reader=request.body.getReader(),buffers:Uint8Array[]=[];let n=0;while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>expected){await reader.cancel();throw Error('分块过大');}buffers.push(r.value);}if(n!==expected)throw Error('分块大小不一致');const bytes=Buffer.concat(buffers),sha=digest(bytes);if(sha!==request.headers.get('x-orbit-sha256'))throw Error('分块校验失败');
 const old=db.prepare('SELECT sha256 FROM offline_upload_chunks WHERE user_id=? AND task_id=? AND file_index=? AND part_index=?').get(user.id,taskId,fileIndex,part);if(old){if(old.sha256!==sha)throw Error('已上传分块内容不一致');return Response.json({ok:true});}
 const key=`offline-staging/${user.id}/${taskId}/${fileIndex}/${part}-${sha}`;await getMediaStore().put(key,new Blob([bytes]).stream());db.prepare('INSERT OR IGNORE INTO offline_upload_chunks(user_id,task_id,file_index,part_index,sha256,byte_size,storage_key) VALUES(?,?,?,?,?,?,?)').run(user.id,taskId,fileIndex,part,sha,n,key);return Response.json({ok:true});
 }catch(e){return Response.json({error:(e as Error).message},{status:409});}}
export async function DELETE(request:Request){const a=await authorize(request);if(!a.user||!a.db)return a.response;const id=new URL(request.url).searchParams.get('task')??'',{db,user}=a;try{const task=offlineTask(db,user.id,id,user.projectId!);if(task.result_json)throw Error('已完成任务不能取消');const chunks=db.prepare('SELECT storage_key FROM offline_upload_chunks WHERE user_id=? AND task_id=?').all(user.id,id);for(const row of chunks)await getMediaStore().delete(String(row.storage_key));db.prepare('DELETE FROM offline_upload_chunks WHERE user_id=? AND task_id=?').run(user.id,id);db.prepare('DELETE FROM offline_uploads WHERE user_id=? AND task_id=? AND result_json IS NULL').run(user.id,id);return Response.json({ok:true});}catch(e){return Response.json({error:(e as Error).message},{status:409});}}
