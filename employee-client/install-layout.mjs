// Stage a verified Windows program in a fresh directory; never overwrite legacy app/data.
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const WINDOWS_APP_FILES=['start.mjs','server.mjs','store.mjs','updater.mjs','original-system.mjs','install-layout.mjs','README.md','ui/bridge.js','ui/connection.html','ui/index.html','ui/app.js','ui/style.css'];
export async function stageWindowsApp(source,target,manifest){
 if(!/^\d+\.\d+\.\d+$/.test(manifest.version)||!Array.isArray(manifest.files))throw Error('员工端安装清单无效');
 const verified=[];
 for(const name of WINDOWS_APP_FILES){
  const entries=manifest.files.filter(f=>f.path===name);
  if(entries.length!==1||!/^[a-f0-9]{64}$/.test(entries[0].sha256))throw Error('员工端文件清单无效：'+name);
  const bytes=await readFile(join(source,name));
  if(bytes.length>2*1024*1024||createHash('sha256').update(bytes).digest('hex')!==entries[0].sha256)throw Error('员工端程序校验失败：'+name);
  verified.push([name,bytes]);
 }
 const app=join(target,'programs','v'+manifest.version+'-'+randomUUID());
 await mkdir(app,{recursive:true,mode:0o700});
 try{
  for(const [name,bytes] of verified){
   const path=join(app,name);await mkdir(dirname(path),{recursive:true,mode:0o700});
   await writeFile(path,bytes,{flag:'wx',mode:0o600});
   if(createHash('sha256').update(await readFile(path)).digest('hex')!==manifest.files.find(f=>f.path===name).sha256)throw Error('员工端程序写入校验失败：'+name);
  }
  return app;
 }catch(error){await rm(app,{recursive:true,force:true}).catch(()=>{});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const [, ,source,target]=process.argv;const manifest=JSON.parse(await readFile(join(source,'employee-manifest.json'),'utf8'));console.log(await stageWindowsApp(source,target,manifest));}
 catch(error){console.error('无法准备新的员工端程序，原有data和未同步文件保留：'+error.message);process.exitCode=1;}
}
