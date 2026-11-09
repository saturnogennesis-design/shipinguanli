'use client';
/* eslint-disable @next/next/no-img-element, jsx-a11y/media-has-caption -- Originals load only for the explicitly selected preview. */
import {useEffect,useState} from 'react';
import {CenterDialog} from './communication-center';
import {DocumentPreview} from './report-attachments';
import {projectApi} from './project-management';
import {crossMedia} from './cross-media';
import type {StoredFile,Detail,Row} from './cross-types';
export type PreviewFile=StoredFile|File;
function local(file:PreviewFile):file is File{return file instanceof File;}
function mime(file:PreviewFile){return local(file)?file.type:file.mime_type;}
function name(file:PreviewFile){return local(file)?file.name:file.file_name;}
export function CrossMediaPreview({file,files,project,onClose,title}:{file:PreviewFile;files:PreviewFile[];project:number;onClose:()=>void;title?:string}){
 const images=files.filter(f=>mime(f).startsWith('image/'));
 const [index,setIndex]=useState(()=>Math.max(0,images.findIndex(f=>local(file)?f===file:!local(f)&&f.id===file.id)));
 const image=mime(file).startsWith('image/'),selected=image?images[Math.min(index,images.length-1)]??file:file;
 useEffect(()=>{if(!image||images.length<2)return;const handler=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable=true]')))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setIndex(i=>Math.max(0,Math.min(images.length-1,i+(event.key==='ArrowLeft'?-1:1))));}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[image,images.length]);
 if(!image&&!mime(file).startsWith('video/'))return <DocumentPreview file={local(file)?file:{id:file.id,fileName:file.file_name,fileSize:file.file_size,mimeType:file.mime_type,url:crossMedia(file.id,project)}} onClose={onClose}/>;
 return <CenterDialog title={title??(image?'图片预览':name(file))} onClose={onClose}><div className="cross-gallery" role="group" aria-label="资料图片预览">{image&&images.length>1?<button className="cross-gallery-arrow previous" aria-label="上一张图片" disabled={index===0} onClick={()=>setIndex(i=>Math.max(0,i-1))}>‹</button>:null}<SelectedMedia key={image?index:0} file={selected} project={project}/>{image&&images.length>1?<button className="cross-gallery-arrow next" aria-label="下一张图片" disabled={index>=images.length-1} onClick={()=>setIndex(i=>Math.min(images.length-1,i+1))}>›</button>:null}</div><div className="cross-gallery-caption"><strong>{name(selected)}</strong>{image?<span aria-live="polite">{Math.min(index+1,Math.max(images.length,1))} / {Math.max(images.length,1)}</span>:null}{image&&images.length>1?<small>点击左右箭头或使用键盘 ← → 切换</small>:null}</div></CenterDialog>;
}
function SelectedMedia({file,project}:{file:PreviewFile;project:number}){const [src]=useState(()=>local(file)?URL.createObjectURL(file):crossMedia(file.id,project)),[failed,setFailed]=useState(false);useEffect(()=>()=>{if(local(file))URL.revokeObjectURL(src);},[file,src]);return failed?<div className="cross-gallery-error" role="alert">此文件暂不可预览，请检查连接或当前查看权限。</div>:mime(file).startsWith('video/')?<video className="cross-gallery-original" controls preload="metadata" src={src} onError={()=>setFailed(true)}/>:<img className="cross-gallery-original" src={src} alt={name(file)} onError={()=>setFailed(true)}/>;}
export function CrossRecordPreview({row,project,onClose}:{row:Row;project:number;onClose:()=>void}){const [detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState('');useEffect(()=>{let live=true;void projectApi('/api/cross-records?id='+row.id+'&background=1').then(d=>{if(live)setDetail(d);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[row.id,project]);const file=detail?.files.find(f=>f.id===row.coverId&&(f.mime_type.startsWith('image/')||f.mime_type.startsWith('video/')))??detail?.files.find(f=>f.mime_type.startsWith('image/')||f.mime_type.startsWith('video/'));if(file&&detail)return <CrossMediaPreview title={row.title} file={file} files={detail.files} project={project} onClose={onClose}/>;return <CenterDialog title={row.title+' · 预览'} onClose={onClose}><p className="cross-preview-loading" role={error?'alert':'status'}>{error||(!detail?'正在读取可预览图片…':'此资料暂无可预览图片')}</p></CenterDialog>;}
