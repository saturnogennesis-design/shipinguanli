import {randomUUID} from 'node:crypto';
import {requireCross} from '@/lib/cross-auth';
import {crossRow,crossEvent} from '@/lib/cross-workflow';
import {getMediaStore} from '@/lib/media-store';
import {atomicWrite} from '@/lib/publishing-write';
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){
 const auth=await requireCross(request);if(!auth.user)return auth.response;const {db,user,access}=auth,id=Number((await context.params).id),row=crossRow(db,id,user.projectId!);
 if(!row)return Response.json({error:'资料不存在'},{status:404});
 if(!access.canCreate||(!access.canAssign&&row.creator_id!==user.id&&row.maker_id!==user.id))return Response.json({error:'没有上传权限'},{status:403});
 if(!['draft','rejected'].includes(row.status))return Response.json({error:'当前版本已锁定'},{status:409});
 if(Number(request.headers.get('content-length'))>22*1024*1024)return Response.json({error:'图片不能超过20MB'},{status:413});
 let total=0;const limited=request.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){total+=chunk.byteLength;if(total>22*1024*1024)throw Error('上传过大');controller.enqueue(chunk);}}));const form=limited?await new Response(limited,{headers:request.headers}).formData().catch(()=>null):null,file=form?.get('file');if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<=0||file.size>20*1024*1024)return Response.json({error:'请选择20MB以内的 JPG、PNG、WebP 图片'},{status:400});
 const key=`cross/${user.projectId}/${id}/${randomUUID()}`,store=getMediaStore();await store.put(key,file.stream(),{httpMetadata:{contentType:file.type}});
 try{const fileId=atomicWrite(db,()=>{const current=crossRow(db,id,user.projectId!)!;if(current.revision!==row.revision||!['draft','rejected'].includes(current.status))throw Error('资料已更新，请刷新后重试');
 if(Number(db.prepare('SELECT count(*) n FROM cross_files WHERE record_id=? AND active=1').get(id)!.n)>=50)throw Error('每份资料最多50张图片');
 const result=db.prepare('INSERT INTO cross_files(record_id,storage_path,file_name,mime_type,file_size,uploader_id) VALUES(?,?,?,?,?,?) RETURNING id').get(id,key,file.name.slice(0,180),file.type,file.size,user.id)!;
 db.prepare('UPDATE cross_records SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id);crossEvent(db,current,user.id,'upload',{fileId:result.id,name:file.name});return result.id;});return Response.json({id:fileId},{status:201});}catch(error){await store.delete(key);return Response.json({error:(error as Error).message},{status:409});}
}

export async function DELETE(request:Request,context:Context){
 const auth=await requireCross(request);if(!auth.user)return auth.response;const {db,user,access}=auth,id=Number((await context.params).id),row=crossRow(db,id,user.projectId!);
 if(!row)return Response.json({error:'资料不存在'},{status:404});if(!access.canCreate||(!access.canAssign&&row.creator_id!==user.id&&row.maker_id!==user.id))return Response.json({error:'没有修改权限'},{status:403});
 const body=await request.json().catch(()=>null);try{atomicWrite(db,()=>{if(!['draft','rejected'].includes(row.status)||row.revision!==Number(body?.revision))throw Error('版本已锁定或资料已更新');
 const file=db.prepare('SELECT id FROM cross_files WHERE id=? AND record_id=? AND active=1').get(Number(body?.fileId),id);if(!file)throw Error('图片不存在');
 db.prepare('UPDATE cross_files SET active=0 WHERE id=?').run(Number(file.id));db.prepare('UPDATE cross_records SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(id);crossEvent(db,row,user.id,'remove_image',{fileId:file.id});});return Response.json({ok:true});}catch(error){return Response.json({error:(error as Error).message},{status:409});}
}
