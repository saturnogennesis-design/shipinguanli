import {transferZipHeaders,transferZipEntries} from '@/lib/transfer-display';
import {zipStream} from '@/lib/zip-stream';
import {transferMime,transferPreviewType} from '@/lib/transfer-media';
import {convertLegacyOffice,OfficeConversionError} from '@/lib/office-convert';
import {atomicWrite} from '@/lib/publishing-write';
import {requireTransfer,transferVisible,transferOwns,type TransferPackage} from '@/lib/transfer-auth';
import {getMediaStore} from '@/lib/media-store';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const a=await requireTransfer(request);if(!a.user)return a.response;const f=a.db.prepare('SELECT * FROM transfer_files WHERE id=?').get(Number((await context.params).id));const row=f?a.db.prepare('SELECT * FROM transfer_packages WHERE id=?').get(Number(f.package_id)) as TransferPackage:undefined;
 if(!f||f.deleted_at||!row||!transferVisible(a.db,row,a.user))return Response.json({error:'文件不存在或无权访问'},{status:404});
 const query=new URL(request.url).searchParams,preview=query.get('preview')==='1'&&query.get('download')!=='1';if(row.lifecycle==='deleted'||!preview&&!a.access.download)return Response.json({error:'没有下载权限或文件包在回收站'},{status:403});
 if(!preview){const store=getMediaStore();if((await store.missing([String(f.storage_path)])).length)return Response.json({error:'原文件缺失，请检查主机媒体目录或恢复备份'},{status:404});if(query.get('check')==='1')return Response.json({ok:true});a.db.prepare('INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?)').run(a.user.id,'transfer.download_file','transfer_package',String(row.id),JSON.stringify({projectId:a.user.projectId,fileId:f.id}));return new Response(zipStream([{name:transferZipEntries([f as {file_name:unknown}])[0],open:async()=>{const fresh=a.db.prepare('SELECT p.lifecycle,f.deleted_at FROM transfer_files f JOIN transfer_packages p ON p.id=f.package_id WHERE f.id=? AND p.project_id=?').get(f.id,a.user.projectId!);if(!fresh||fresh.lifecycle==='deleted'||fresh.deleted_at)throw Error('文件已被移除或包状态改变');return (await store.get(String(f.storage_path)))?.body??null;}}]),{headers:transferZipHeaders(String(row.title))});}
 const kind=transferPreviewType(String(f.file_name)),mime=transferMime(String(f.file_name));
 if(preview&&!kind)return Response.json({error:'此格式暂不支持在线预览，请下载原件查看'},{status:415});
 if(preview&&(kind==='text'&&Number(f.file_size)>2*1024*1024||kind==='document'&&Number(f.file_size)>50*1024*1024))return Response.json({error:'文件较大，暂不支持在线预览，请下载原件查看'},{status:413});
 const store=getMediaStore();let object=await store.get(String(f.storage_path),preview&&['video','audio'].includes(kind??'')?{range:request.headers}:undefined);if(!object)return Response.json({error:'原文件缺失，请检查主机媒体目录或恢复备份'},{status:404});
 if(query.get('check')==='1'){await object.body.cancel();return Response.json({ok:true});}
 const ext=String(f.file_name).toLowerCase().split('.').pop(),legacy=preview&&(ext==='doc'||ext==='xls');
 if(legacy){try{const key=`transfer-previews/${f.id}.pdf`,cached=await store.get(key);if(cached){await object.body.cancel();object=cached;}else{const bytes=await convertLegacyOffice(object.body,ext as 'doc'|'xls');await store.put(key,new Blob([new Uint8Array(bytes)]).stream(),{httpMetadata:{contentType:'application/pdf'}});object=(await store.get(key))!;}}catch(e){return Response.json({error:(e as Error).message},{status:e instanceof OfficeConversionError?e.status:422});}}
 const headers=new Headers({'cache-control':'private, no-store','x-content-type-options':'nosniff','x-frame-options':'SAMEORIGIN'});object.writeHttpMetadata(headers);headers.set('content-type',preview?(legacy?'application/pdf':mime):'application/octet-stream');headers.set('content-disposition',`${preview?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(String(f.file_name))}`);if(preview&&['video','audio'].includes(kind??''))headers.set('accept-ranges','bytes');if(object.range)headers.set('content-range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);

 return new Response(object.body,{status:object.range?206:200,headers});
}

async function changeFile(request:Request,context:{params:Promise<{id:string}>},restore:boolean){
 const a=await requireTransfer(request);if(!a.user)return a.response;const {db,user,access}=a;
 const f=db.prepare('SELECT * FROM transfer_files WHERE id=?').get(Number((await context.params).id));const row=f?db.prepare('SELECT * FROM transfer_packages WHERE id=?').get(Number(f.package_id)) as TransferPackage:undefined;
 if(!f||!row||!transferVisible(db,row,user))return Response.json({error:'文件不存在或无权访问'},{status:404});
 if(!access.delete||!transferOwns(row,user)||Number(f.uploader_id)!==user.id)return Response.json({error:'需要删除权限，且只能移除或恢复自己的文件'},{status:403});
 const body=await request.json().catch(()=>null);
 try{atomicWrite(db,()=>{const fresh=db.prepare('SELECT * FROM transfer_packages WHERE id=?').get(row.id)!;if(fresh.lifecycle!=='active'||Number(body?.revision)!==Number(fresh.revision))throw Error('文件包状态已更新，请刷新后重试');
 const current=db.prepare('SELECT deleted_at FROM transfer_files WHERE id=?').get(f.id)!;if(restore?!current.deleted_at:Boolean(current.deleted_at))throw Error('文件状态已更新，请刷新后重试');
 if(restore){const stats=db.prepare('SELECT count(*) n,coalesce(sum(file_size),0) bytes FROM transfer_files WHERE package_id=? AND deleted_at IS NULL').get(row.id)!;if(Number(stats.n)>=100||Number(stats.bytes)+Number(f.file_size)>5*1024**3)throw Error('恢复后超过每包100个文件或5GB限制');}
 db.prepare('UPDATE transfer_files SET deleted_at=? WHERE id=?').run(restore?null:new Date().toISOString(),f.id);db.prepare('UPDATE transfer_packages SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
 db.prepare('INSERT INTO audit_logs(user_id,action,object_type,object_id,details_json) VALUES(?,?,?,?,?)').run(user.id,restore?'transfer.restore_file':'transfer.remove_file','transfer_package',String(row.id),JSON.stringify({projectId:user.projectId,fileId:f.id}));});return Response.json({ok:true});}catch(e){return Response.json({error:(e as Error).message},{status:409});}
}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){return changeFile(request,context,false);}
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return changeFile(request,context,true);}
