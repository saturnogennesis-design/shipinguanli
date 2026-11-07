import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {requireUser} from '@/lib/server-auth';
export async function GET(request:Request){const auth=await requireUser(request);if(!auth.user)return auth.response;const base=join(process.cwd(),'dist','client'),assets:{path:string;size:number;sha256:string}[]=[];async function walk(relative:string){for(const item of await readdir(join(base,relative),{withFileTypes:true})){const path=relative?relative+'/'+item.name:item.name;if(item.isDirectory())await walk(path);else if(item.isFile()&&/\.(js|css|svg|woff2?|png|ico)$/.test(path)){const bytes=await readFile(join(base,path));assets.push({path:'/'+path,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}await walk('');return Response.json({protocol:2,assets,build:createHash('sha256').update(JSON.stringify(assets)).digest('hex')},{headers:{'cache-control':'no-store'}});}
