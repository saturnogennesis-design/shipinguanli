import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
import sharp from 'sharp';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});
const {getMediaStore}=await import('../lib/media-store.ts');const {imageThumbnail}=await import('../lib/image-thumbnail.ts');
test('large image has a bounded cached derivative; original and conditional authorization response stay separate',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'orbit-thumbnail-')),previous=process.env.ORBIT_MEDIA_DIR;process.env.ORBIT_MEDIA_DIR=dir;t.after(async()=>{if(previous===undefined)delete process.env.ORBIT_MEDIA_DIR;else process.env.ORBIT_MEDIA_DIR=previous;await rm(dir,{recursive:true,force:true});});
 const store=getMediaStore(),key='products/large.png';const original=await sharp({create:{width:1800,height:1400,channels:3,background:'#a24020'}}).png().toBuffer();await store.put(key,new Blob([original]).stream(),{httpMetadata:{contentType:'image/png'}});
 const request=()=>new Request('http://localhost/image?thumb=1');const first=await imageThumbnail(request(),key,await store.get(key));assert.equal(first.status,200);const output=Buffer.from(await first.arrayBuffer()),meta=await sharp(output).metadata();assert.equal(meta.format,'webp');assert.ok(meta.width<=320&&meta.height<=320);assert.ok(output.length<original.length);const etag=first.headers.get('etag');
 const files=(await readdir(join(dir,'.thumbnails'))).filter(name=>name.endsWith('.webp'));assert.equal(files.length,1);const before=await stat(join(dir,'.thumbnails',files[0]));
 const repeated=await imageThumbnail(request(),key,await store.get(key));assert.deepEqual(Buffer.from(await repeated.arrayBuffer()),output);assert.equal((await stat(join(dir,'.thumbnails',files[0]))).mtimeMs,before.mtimeMs);
 const cached=await imageThumbnail(new Request('http://localhost/image',{headers:{'if-none-match':etag}}),key,await store.get(key));assert.equal(cached.status,304);assert.equal(cached.body,null);assert.match(cached.headers.get('cache-control'),/private.*must-revalidate/);
 const source=await store.get(key);assert.deepEqual(Buffer.from(await new Response(source.body).arrayBuffer()),original);
 const replacement=await sharp({create:{width:900,height:700,channels:3,background:'#2050c0'}}).png().toBuffer();await store.put(key,new Blob([replacement]).stream(),{httpMetadata:{contentType:'image/png'}});
 const updated=await imageThumbnail(new Request('http://localhost/image',{headers:{'if-none-match':etag}}),key,await store.get(key));assert.equal(updated.status,200);assert.notEqual(updated.headers.get('etag'),etag);await updated.arrayBuffer();assert.equal((await readdir(join(dir,'.thumbnails'))).filter(name=>name.endsWith('.webp')).length,1);
});
test('video frame queue limits decoders, cancels queued work and reuses bounded frames',async t=>{
 const previous=globalThis.document;let active=0,max=0,started=0;
 globalThis.document={createElement(type){if(type==='canvas')return {getContext:()=>({drawImage(){}}),toBlob(callback){queueMicrotask(()=>callback(new Blob(['frame'],{type:'image/jpeg'})));}};
 let timer;const video={videoWidth:1920,videoHeight:1080,duration:1,readyState:2,currentTime:0,seeking:false,pause(){},load(){},removeAttribute(){clearTimeout(timer);if(video.running){active--;video.running=false;}}};Object.defineProperty(video,'src',{set(){active++;started++;max=Math.max(max,active);video.running=true;timer=setTimeout(()=>{video.onloadedmetadata?.();video.onloadeddata?.();},15);}});return video;}};
 t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});const {videoThumbnail}=await import('../lib/client-thumbnails.ts');const prefix='queue-'+Date.now();
 const tasks=Array.from({length:8},(_,index)=>videoThumbnail(prefix+index,new AbortController().signal));const cancelled=new AbortController(),job=videoThumbnail(prefix+'cancelled',cancelled.signal);cancelled.abort();await assert.rejects(job,{name:'AbortError'});const result=await Promise.all(tasks);assert.equal(result.length,8);assert.ok(max<=2);assert.equal(active,0);assert.equal(started,8);await videoThumbnail(prefix+1,new AbortController().signal);assert.equal(started,8);
});
