"use client";
/* eslint-disable @next/next/no-img-element -- Bounded authenticated thumbnails are loaded as local blob URLs. */
import {useEffect,useRef,useState} from 'react';
import {videoThumbnail} from '@/lib/client-thumbnails';
export function ThumbnailImage({src,alt='',fallbackVideo,className=''}:{src:string;alt?:string;fallbackVideo?:string;className?:string}){
 const root=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(false),[url,setUrl]=useState('');
 useEffect(()=>{const element=root.current;if(!element)return;const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'120px'});observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{
  if(!visible)return;const controller=new AbortController();let objectUrl='';
  const load=async()=>{try{const response=await fetch(src,{signal:controller.signal});let blob:Blob;if(response.ok)blob=await response.blob();else if(response.status===404&&fallbackVideo)blob=await videoThumbnail(fallbackVideo,controller.signal);else return;if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}catch{/* Keep the lightweight placeholder; full preview remains available on click. */}};
  void load();return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);setUrl('');};
 },[src,fallbackVideo,visible]);
 return <span ref={root} className={`thumbnail-image ${className}`}>{url?<img decoding="async" src={url} alt={alt}/>:<span className="thumbnail-placeholder" aria-hidden="true">{fallbackVideo?'▶':'▧'}</span>}</span>;
}
