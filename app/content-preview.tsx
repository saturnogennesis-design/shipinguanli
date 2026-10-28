"use client";
import {currentProjectMediaUrl} from "@/lib/client-project-fetch";
import {useEffect,useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";

export async function makeCover(file:File):Promise<Blob|null>{
  const url=URL.createObjectURL(file);
  try {
    const media=file.type.startsWith("image/")?new Image():document.createElement("video");
    if(media instanceof HTMLVideoElement){media.muted=true;media.preload="auto";}
    await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error("封面生成超时")),12000);
      const done=()=>{clearTimeout(timeout);resolve();};
      media.onerror=()=>{clearTimeout(timeout);reject(new Error("浏览器不支持此素材"));};
      if(media instanceof HTMLVideoElement){media.onloadeddata=done;}else media.onload=done;
      media.src=url;
    });
    const width=media instanceof HTMLVideoElement?media.videoWidth:media.naturalWidth;
    const height=media instanceof HTMLVideoElement?media.videoHeight:media.naturalHeight;
    if(!width||!height)return null;
    const canvas=document.createElement("canvas");canvas.width=Math.min(640,width);canvas.height=Math.round(height*canvas.width/width);
    canvas.getContext("2d")?.drawImage(media,0,0,canvas.width,canvas.height);
    const result=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",0.8));
    if(media instanceof HTMLVideoElement){media.pause();media.removeAttribute("src");media.load();}
    return result;
  }catch{return null;}finally{URL.revokeObjectURL(url);}
}
export async function uploadContentFile(url:string,options:RequestInit){
  const response=await fetch(url,options);
  if(response.ok&&options.body instanceof File){
    const data=await response.clone().json();
    if(data.versionId && data.coverEligible!==false){
      let coverSource=options.body;
      if(data.coverFileUrl){try{const source=await fetch(data.coverFileUrl,{signal:options.signal});if(source.ok){const blob=await source.blob();coverSource=new File([blob],"cover.jpg",{type:blob.type});}}catch{}}
      const blob=await makeCover(coverSource);
      if(blob)await fetch(`/api/content-versions/${data.versionId}/cover`,{method:"PUT",headers:{"content-type":"image/jpeg"},body:blob,signal:options.signal}).catch(()=>undefined);
    }
  }
  return response;
}
export function ContentPreview({code,versionId,title,kind,comment="",label="",summary="",hoverEnabled=true,onOpen}:{code:string;versionId?:number;title:string;kind:string;comment?:string;label?:string;summary?:string;hoverEnabled?:boolean;onOpen?:()=>void}){
  const [hover,setHover]=useState(false),[open,setOpen]=useState(false),[failed,setFailed]=useState(false);
  const [urls,setUrls]=useState<string[]>([]),[error,setError]=useState(""),[index,setIndex]=useState(0);
  const [canEditCover,setCanEditCover]=useState(false),[coverVersion,setCoverVersion]=useState<number|undefined>(versionId),[coverTick,setCoverTick]=useState(0),[coverNotice,setCoverNotice]=useState("");
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const root=useRef<HTMLSpanElement|null>(null);
  const popup=useRef<HTMLDivElement|null>(null);
  const [position,setPosition]=useState({left:8,top:8});
  const hold=()=>{if(timer.current)clearTimeout(timer.current);};
  const leave=()=>{hold();timer.current=setTimeout(()=>setHover(false),180);};
  const activate=()=>{hold();setHover(false);if(onOpen)onOpen();else setOpen(true);};
  useEffect(()=>{const target=root.current;if(!target||!hoverEnabled)return;const enter=()=>{hold();timer.current=setTimeout(()=>setHover(true),250);};target.addEventListener("mouseenter",enter);target.addEventListener("mouseleave",leave);return()=>{target.removeEventListener("mouseenter",enter);target.removeEventListener("mouseleave",leave);hold();};},[hoverEnabled]);
  useLayoutEffect(()=>{if(!hover)return;const place=()=>{const anchor=root.current?.getBoundingClientRect(),box=popup.current;if(!anchor||!box)return;const w=box.offsetWidth,h=box.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;let left=anchor.right+8;if(left+w>vw-8)left=anchor.left-w-8;if(left<8)left=Math.max(8,Math.min(anchor.left,vw-w-8));setPosition({left,top:Math.max(8,Math.min(anchor.top,vh-h-8))});};place();const observer=new ResizeObserver(place);if(popup.current)observer.observe(popup.current);window.addEventListener("resize",place);window.addEventListener("scroll",place,true);return()=>{observer.disconnect();window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);};},[hover]);
  const cover=versionId?currentProjectMediaUrl(`/api/content-versions/${versionId}/cover?t=${coverTick}`):"";
  useEffect(()=>{setFailed(false);},[versionId]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{
    if(!open)return; const controller=new AbortController();setUrls([]);setError("");setIndex(0);
    fetch(`/api/contents/${encodeURIComponent(code)}/versions`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      const data=await response.json();if(!response.ok)throw new Error(data.error??"预览加载失败");
      const version=data.versions.find((v:{id:number;current:boolean})=>versionId?v.id===versionId:v.current);
      setCanEditCover(Boolean(data.canEditCover));setCoverVersion(version?.id);
      const next=version?.files?.length?version.files.map((f:{fileUrl:string})=>f.fileUrl).filter(Boolean):version?.fileUrl?[version.fileUrl]:[];
      if(!next.length)throw new Error("文件尚未上传完成或不可查看");
      setUrls(next);
    }).catch(reason=>{if(reason.name!=="AbortError")setError(reason.message);});
    return()=>controller.abort();
  },[open,code,versionId]);
  return <span ref={root} className="content-preview-trigger">
    <button className="content-cover-button" aria-label={`预览${title}`} onFocus={()=>{if(hoverEnabled){hold();setHover(true);}}} onBlur={leave} onClick={e=>{e.stopPropagation();activate();}}>
      {cover&&!failed?<img loading="lazy" src={cover} alt={title} onError={()=>setFailed(true)}/>:<span>{kind==="视频"?"▶":"▤"}</span>}
      {label?<small>{label}</small>:null}
    </button>
    {hoverEnabled&&hover&&!open&&createPortal(<div ref={popup} style={position} className="content-hover-preview anchored-content-preview" role="button" tabIndex={0} aria-label={`查看${title}详情`} onMouseEnter={hold} onMouseLeave={leave} onFocus={hold} onBlur={leave} onClick={e=>{e.stopPropagation();activate();}} onKeyDown={e=>{if(e.key==="Escape"){setHover(false);e.stopPropagation();}if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();activate();}}}>{cover&&!failed?<img src={cover} alt={title}/>:<div className="preview-placeholder">暂无封面，点击查看内容</div>}<strong>{title}</strong>{summary?<p>{summary}</p>:null}{comment?<p>审核评语：{comment}</p>:null}</div>,document.body)}
    {open&&createPortal(<div className="modal-backdrop" onClick={()=>setOpen(false)}><section className="modal quick-content-preview" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}>
      <header><h3>{title}</h3><button autoFocus onClick={()=>setOpen(false)} aria-label="关闭预览">×</button></header>
      {error?<p role="alert">{error}</p>:!urls.length?<p>正在加载素材…</p>:kind==="视频"?<video controls preload="metadata" src={urls[0]} onError={()=>setError("视频加载失败或编码不受浏览器支持，请检查原文件")}/>:<><img src={urls[index]} alt={`${title} 第${index+1}张`}/><nav><button disabled={!index} onClick={()=>setIndex(index-1)}>上一张</button><span>{index+1}/{urls.length}</span><button disabled={index===urls.length-1} onClick={()=>setIndex(index+1)}>下一张</button></nav></>}
      {canEditCover&&coverVersion?<label className="cover-pick">补选封面<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setCoverNotice("正在生成封面…");const blob=await makeCover(file);if(!blob){setCoverNotice("图片无法读取，请换一张");return;}const response=await fetch(`/api/content-versions/${coverVersion}/cover`,{method:"PUT",headers:{"content-type":"image/jpeg"},body:blob});if(response.ok){setFailed(false);setCoverTick(n=>n+1);setCoverNotice("封面已保存");}else{const data=await response.json();setCoverNotice(data.error??"封面保存失败");}}}/></label>:null}
      {coverNotice?<p role="status">{coverNotice}</p>:null}
      {comment?<p className="quick-review-comment">审核评语：{comment}</p>:null}
    </section></div>,document.body)}
  </span>;
}
