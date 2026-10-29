"use client";
const frames=new Map<string,Blob>();
let active=0;const waiting:Array<()=>void>=[];
const aborted=()=>new DOMException('Thumbnail cancelled','AbortError');
function slot(signal:AbortSignal):Promise<()=>void>{return new Promise((resolve,reject)=>{
 const cancel=()=>{const index=waiting.indexOf(grant);if(index>=0)waiting.splice(index,1);reject(aborted());};
 const grant=()=>{signal.removeEventListener('abort',cancel);if(signal.aborted){reject(aborted());return;}active++;let released=false;resolve(()=>{if(released)return;released=true;active--;waiting.shift()?.();});};
 if(signal.aborted)return reject(aborted());if(active<2)grant();else{waiting.push(grant);signal.addEventListener('abort',cancel,{once:true});}
 });}
// Called only after the authorized cover endpoint returns 404, never on denied access.
export async function videoThumbnail(url:string,signal:AbortSignal){
 const cached=frames.get(url);if(cached){frames.delete(url);frames.set(url,cached);return cached;}
 const release=await slot(signal);
 try{
  const blob=await new Promise<Blob>((resolve,reject)=>{
   const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='metadata';let target=0,done=false,capturing=false;
   const finish=(error?:Error,blob?:Blob)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);video.onloadedmetadata=null;video.onloadeddata=null;video.onseeked=null;video.onerror=null;video.pause();video.removeAttribute('src');video.load();if(error)reject(error);else if(blob)resolve(blob);};
   const cancel=()=>finish(aborted());const timer=setTimeout(()=>finish(new Error('Video thumbnail timed out')),8000);
   const capture=()=>{if(done||capturing||video.seeking||video.readyState<2||video.currentTime+.02<target)return;const width=video.videoWidth,height=video.videoHeight;if(!width||!height)return;capturing=true;const scale=Math.min(1,320/width,320/height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));canvas.getContext('2d')?.drawImage(video,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>finish(blob?undefined:new Error('Thumbnail not available'),blob??undefined),'image/jpeg',.72);};
   video.onloadedmetadata=()=>{target=Number.isFinite(video.duration)?Math.min(.1,video.duration/2):0;video.currentTime=target;};video.onloadeddata=capture;video.onseeked=capture;video.onerror=()=>finish(new Error('Video thumbnail not available'));signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();else video.src=url;
  });
  frames.set(url,blob);while(frames.size>80)frames.delete(frames.keys().next().value!);return blob;
 }finally{release();}
}
