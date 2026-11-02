"use client";
/* eslint-disable @next/next/no-img-element -- Full-size authenticated original is loaded only in the open preview. */
import {useEffect,useState} from 'react';
import {CenterDialog} from './communication-center';
import {ThumbnailImage} from './thumbnail-image';

export function ContentImageGallery({urls,title}:{urls:string[];title:string}){
 const [index,setIndex]=useState<number|null>(null);
 useEffect(()=>{if(index===null)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setIndex(null);return;}if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setIndex(i=>Math.max(0,Math.min(urls.length-1,(i??0)+(event.key==='ArrowLeft'?-1:1))));}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[index,urls.length]);
 return <><div className="real-image-preview">{urls.map((url,i)=><button type="button" className="content-image-enlarge" key={url} aria-label={`放大查看${title} 第${i+1}张`} onClick={()=>setIndex(i)}><ThumbnailImage src={url+(url.includes('?')?'&':'?')+'thumb=1'} alt={`${title} 第${i+1}张`}/></button>)}</div>{index!==null?<CenterDialog title="图文大图预览" onClose={()=>setIndex(null)}><div className="content-image-lightbox"><img src={urls[index]} alt={`${title} 第${index+1}张`}/><nav aria-label="图片切换"><button type="button" disabled={index===0} onClick={()=>setIndex(index-1)}>← 上一张</button><span role="status">{index+1} / {urls.length}</span><button type="button" disabled={index===urls.length-1} onClick={()=>setIndex(index+1)}>下一张 →</button></nav></div></CenterDialog>:null}</>;
}
