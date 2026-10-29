import {createHash} from 'node:crypto';
import sharpModule from 'sharp';
import type SharpFactory from 'sharp/lib/index.js';
import {getMediaStore,type LocalMediaObject} from './media-store';
// Vinext's ambient next stub marks sharp as unknown; use the installed library's types.
const sharp=sharpModule as typeof SharpFactory;
const pending=new Map<string,Promise<Uint8Array>>();
let active=0;const waiting:Array<()=>void>=[];
async function limited<T>(job:()=>Promise<T>){if(active>=2)await new Promise<void>(resolve=>waiting.push(resolve));else active++;try{return await job();}finally{const next=waiting.shift();if(next)next();else active--;}}
const cancel=(object:LocalMediaObject)=>object.body.cancel().catch(()=>{});
// Authorization is performed by each route before calling this cache. Originals stay untouched.
export async function imageThumbnail(request:Request,key:string,source:LocalMediaObject){
 const identity=createHash('sha256').update(key).digest('hex');
 const version=createHash('sha256').update(`thumb-v1:${source.httpEtag}`).digest('hex');
 const etag=`"${version}"`,headers=new Headers({'content-type':'image/webp','cache-control':'private, max-age=0, must-revalidate','etag':etag,'x-content-type-options':'nosniff'});
 if(request.headers.get('if-none-match')?.split(',').map(value=>value.trim()).includes(etag)){await cancel(source);return new Response(null,{status:304,headers});}
 if(source.size>32*1024*1024){await cancel(source);return Response.json({error:'图片过大，无法生成缩略图'},{status:413});}
 const store=getMediaStore(),cacheKey=`.thumbnails/${identity}.webp`,cached=await store.get(cacheKey);
 if(cached?.customMetadata?.sourceVersion===version){await cancel(source);headers.set('content-length',String(cached.size));return new Response(cached.body,{headers});}
 if(cached)await cancel(cached);
 const jobKey=identity+version;let task=pending.get(jobKey);
 if(task)await cancel(source);
 else{
  task=limited(async()=>{
   const bytes=await new Response(source.body).arrayBuffer();
   const output=await sharp(bytes,{limitInputPixels:24_000_000,animated:false}).rotate().resize(320,320,{fit:'inside',withoutEnlargement:true}).webp({quality:72,effort:3}).toBuffer();
   await store.put(cacheKey,new Blob([new Uint8Array(output)]).stream(),{httpMetadata:{contentType:'image/webp'},customMetadata:{sourceVersion:version}});
   return new Uint8Array(output);
  });pending.set(jobKey,task);
 }
 try{const bytes=await task;headers.set('content-length',String(bytes.byteLength));return new Response(new Uint8Array(bytes),{headers});}
 catch{return Response.json({error:'图片无法生成缩略图，请点击查看原件'},{status:415});}
 finally{if(pending.get(jobKey)===task)pending.delete(jobKey);}
}
