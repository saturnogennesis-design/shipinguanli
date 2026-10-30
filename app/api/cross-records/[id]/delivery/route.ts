import {requireCross} from '@/lib/cross-auth';
import {crossRow,crossEvent} from '@/lib/cross-workflow';
import {getMediaStore} from '@/lib/media-store';
import {zipStream} from '@/lib/zip-stream';
import {atomicWrite} from '@/lib/publishing-write';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 const auth=await requireCross(request);if(!auth.user)return auth.response;const {db,user,access}=auth;if(!access.canDownload)return Response.json({error:'没有下载交付包权限'},{status:403});const id=Number((await context.params).id),row=crossRow(db,id,user.projectId!);
 if(!row||row.kind!=='package')return Response.json({error:'产品包不存在'},{status:404});if(row.status!=='approved')return Response.json({error:'仅审核通过版本可以生成交付包'},{status:409});
 const version=db.prepare('SELECT snapshot_json FROM cross_versions WHERE record_id=? AND version_number=?').get(id,row.version_number);if(!version)return Response.json({error:'通过版本不存在'},{status:409});
 const snapshot=JSON.parse(String(version.snapshot_json)),files=snapshot.files as {id:number;file_name:string}[],store=getMediaStore();
 const sources=files.map(file=>db.prepare('SELECT storage_path,mime_type FROM cross_files WHERE id=? AND record_id=?').get(file.id,id));
 if(sources.some(source=>!source)|| (await store.missing(sources.map(source=>String(source!.storage_path)))).length)return Response.json({error:'原始图片缺失，无法生成完整交付包'},{status:409});
 const text=['Title',snapshot.data.productTitle??'','Tags',snapshot.data.tags??'','Description',snapshot.data.description??''].join('\n\n');
 // Only formal fields and original images enter the delivery; internal remarks stay private.
 const entries=[{name:'content.txt',open:async()=>new Blob([text]).stream()},...sources.map((source,index)=>({name:`images/${String(index+1).padStart(2,'0')}.${source!.mime_type==='image/png'?'png':source!.mime_type==='image/webp'?'webp':'jpg'}`,open:async()=>(await store.get(String(source!.storage_path)))?.body??null}))];
 atomicWrite(db,()=>crossEvent(db,row,user.id,'delivery',{version:row.version_number}));
 return new Response(zipStream(entries),{headers:{'content-type':'application/zip','cache-control':'private, no-store','content-disposition':`attachment; filename="delivery-${id}-v${row.version_number}.zip"; filename*=UTF-8''${encodeURIComponent('交付包-'+id+'-V'+row.version_number+'.zip')}`}});
}
