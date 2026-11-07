import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {requireUser} from '@/lib/server-auth';
const files=['server.mjs','store.mjs','updater.mjs','ui/index.html','ui/app.js','ui/style.css'];
export async function GET(request:Request){const auth=await requireUser(request);if(!auth.user)return auth.response;const file=new URL(request.url).searchParams.get('file');if(file){if(!files.includes(file))return Response.json({error:'文件不存在'},{status:404});return new Response(await readFile(join(process.cwd(),'employee-client',file)),{headers:{'content-type':'application/octet-stream','cache-control':'no-store'}});}const entries=await Promise.all(files.map(async path=>{const b=await readFile(join(process.cwd(),'employee-client',path));return {path,size:b.length,sha256:createHash('sha256').update(b).digest('hex')};}));return Response.json({version:'1.0.0',protocol:1,files:entries},{headers:{'cache-control':'no-store'}});}
