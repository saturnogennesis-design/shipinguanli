import {requireCross} from '@/lib/cross-auth';
import {crossRow,crossEvent,recordVisible,fileVisible,storageKey,type CrossRecord,type CrossFile} from '@/lib/cross-workflow';
import {getMediaStore} from '@/lib/media-store';
import {zipStream} from '@/lib/zip-stream';
import {atomicWrite} from '@/lib/publishing-write';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){
 const auth=await requireCross(request);if(!auth.user)return auth.response;const {db,user,access}=auth;
 if(!access.canDownload)return Response.json({error:'没有下载权限'},{status:403});
 const row=crossRow(db,Number((await context.params).id),user.projectId!);if(!row||row.kind!=='package'||!recordVisible(db,row,user))return Response.json({error:'产品包不存在或无权访问'},{status:404});if(row.status!=='approved')return Response.json({error:'仅审核通过资料可下载'},{status:409});
 const group=new URL(request.url).searchParams.get('group')==='1';if(group&&row.package_type!=='main')return Response.json({error:'请从主图产品整组下载'},{status:400});
 const candidates=group?[row,...db.prepare('SELECT * FROM cross_records WHERE main_id=? AND project_id=? ORDER BY id').all(row.id,row.project_id) as CrossRecord[]]:[row];
 const visible=candidates.filter(item=>recordVisible(db,item,user)),selected=visible.filter(item=>item.status==='approved');
 const store=getMediaStore(),entries:Array<{name:string;open:()=>Promise<ReadableStream|null>}>=[];let skipped=false;
 for(const item of selected){const v=db.prepare('SELECT snapshot_json FROM cross_versions WHERE record_id=? AND version_number=?').get(item.id,item.version_number);if(!v)return Response.json({error:'审核版本缺失'},{status:409});const snapshot=JSON.parse(String(v.snapshot_json)),prefix=`${item.id}-V${item.version_number}/`;
 const files=(snapshot.files as {id:number}[]).map(f=>db.prepare('SELECT * FROM cross_files WHERE id=? AND record_id=?').get(f.id,item.id) as CrossFile|undefined);if(files.some(f=>!f))return Response.json({error:'历史文件引用缺失'},{status:409});
 const authorized=files.filter((f):f is CrossFile=>Boolean(f)&&fileVisible(db,f!,user));if(authorized.length!==files.length)skipped=true;if(!authorized.length){if(!group)return Response.json({error:'没有当前产品包文件下载权限'},{status:403});continue;}
 if((await store.missing(authorized.map(f=>storageKey(f.storage_path)))).length)return Response.json({error:'原始文件缺失，无法生成完整交付包'},{status:409});
 if(item.package_type==='main')entries.push({name:prefix+'content.txt',open:async()=>new Blob([['Title',snapshot.data.productTitle??'','Tags',snapshot.data.tags??'','Description',snapshot.data.description??''].join('\n\n')]).stream()});
 authorized.forEach((f,index)=>{const suffix=f.file_name.split('.').pop()?.replace(/[^a-z0-9]/gi,'')||'bin';entries.push({name:prefix+String(index+1).padStart(2,'0')+'.'+suffix,open:async()=>{const fresh=db.prepare('SELECT * FROM cross_files WHERE id=?').get(f.id) as CrossFile;if(!fileVisible(db,fresh,user))throw Error('文件权限已变化，请重新下载');return (await store.get(storageKey(f.storage_path)))?.body??null;}});});}
 if(!entries.length)return Response.json({error:'没有可下载文件'},{status:403});
 const hints=[...(visible.some(item=>item.status!=='approved')?['未通过审核的子包未打包。']:[]),...(skipped?['仅打包当前账号获授权的文档。']:[])];if(hints.length)entries.push({name:'下载说明.txt',open:async()=>new Blob([hints.join('\n')]).stream()});
 atomicWrite(db,()=>crossEvent(db,row,user.id,'delivery',{group,versions:selected.map(item=>({id:item.id,version:item.version_number})),hints}));
 return new Response(zipStream(entries),{headers:{'content-type':'application/zip','cache-control':'private, no-store','content-disposition':`attachment; filename="delivery-${row.id}.zip"; filename*=UTF-8''${encodeURIComponent((group?'整组交付包':'交付包')+'-'+row.id+'.zip')}`}});
}
