'use client';
import {projectApi} from './project-management';
import {employeeLocalMode,saveEmployeeContent} from './employee-sync';
import type {ClueEntry} from '@/lib/clue-batch';
import {clueTags} from '@/lib/clue-batch';
import {hashBlob as sha} from '@/lib/browser-sha256';
export async function submitClueEntry(row:ClueEntry,project:number,progress:(text:string)=>void){
 const draft={kind:'clue',title:row.title.trim(),assigneeId:row.assignee==='public'?null:Number(row.assignee),data:{keywords:clueTags(row.keywords).join(','),source:row.source.trim()},submit:true};
 if(employeeLocalMode()){await saveEmployeeContent({project,key:row.key,draft,files:row.files});return 'local';}
 const files=[];for(let i=0;i<row.files.length;i++){progress('校验图片 '+(i+1)+'/'+row.files.length);const f=row.files[i];files.push({name:f.name,mime:f.type,size:f.size,sha256:await sha(f)});}
 const state=await projectApi('/api/offline-uploads?projectId='+project,{task:row.key,draft:{...draft,files}});if(state.result)return 'host';
 for(let i=0;i<row.files.length;i++){const file=row.files[i];for(let part=0;part<Math.ceil(file.size/state.chunkSize);part++){const bytes=file.slice(part*state.chunkSize,(part+1)*state.chunkSize),checksum=await sha(bytes);if(state.chunks.some((c:{fileIndex:number;partIndex:number;sha256:string})=>c.fileIndex===i&&c.partIndex===part&&c.sha256===checksum))continue;progress('上传图片 '+(i+1)+'/'+row.files.length);const r=await fetch(`/api/offline-uploads?projectId=${project}&task=${row.key}&file=${i}&part=${part}`,{method:'PUT',headers:{'content-type':'application/octet-stream','x-orbit-project-id':String(project),'x-orbit-sha256':checksum},body:bytes});const data=await r.json();if(!r.ok)throw Error(data.error??'图片上传失败');}}
 await projectApi('/api/offline-uploads?projectId='+project,{action:'complete',task:row.key});return 'host';
}
export async function releaseClueEntry(row:ClueEntry,project:number){if(!row.locked)return;try{if(employeeLocalMode()){await projectApi('/api/job-action',{id:row.key,action:'remove',confirm:'删除未上传资料'});return;}const state=await projectApi(`/api/offline-uploads?projectId=${project}&task=${row.key}`);if(state.result)return;await projectApi(`/api/offline-uploads?projectId=${project}&task=${row.key}`,{},'DELETE');}catch(e){if((e as {details?:{status?:number}}).details?.status!==404&&!/任务不存在/.test((e as Error).message))throw e;}}
