import {fork,spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
const base=dirname(fileURLToPath(import.meta.url)),root=process.env.ORBIT_EMPLOYEE_DATA??join(process.env.LOCALAPPDATA??process.env.HOME??'.','OrbitEmployee','data'),port=Number(process.env.ORBIT_EMPLOYEE_PORT)||3199;
await mkdir(root,{recursive:true});const pointer=join(root,'active-release.json');let release=base;try{const p=JSON.parse(await readFile(pointer,'utf8'));if(resolve(p.path).startsWith(resolve(join(root,'releases'))+'/')||resolve(p.path).startsWith(resolve(join(root,'releases'))+'\\'))release=p.path;}catch{/* Fresh install. */}
const available=await new Promise(r=>{const s=createServer();s.once('error',()=>r(false));s.listen(port,'127.0.0.1',()=>s.close(()=>r(true)));});
function open(){if(process.platform==='win32')spawn('rundll32',['url.dll,FileProtocolHandler','http://127.0.0.1:'+port],{detached:true,stdio:'ignore'}).unref();}
if(!available){if(process.argv.includes('--open'))open();process.exit(0);}
let previous=base,restarts=0;
function run(path){const child=fork(join(path,'server.mjs'),[],{env:{...process.env,ORBIT_EMPLOYEE_DATA:root},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});let ready=false,update=null;const timer=setTimeout(()=>{if(!ready)child.kill();},30000);child.on('message',msg=>{if(msg.ready){ready=true;clearTimeout(timer);setTimeout(()=>{if(child.connected)restarts=0;},60000).unref();if(process.argv.includes('--open'))open();}if(msg.update){const u=resolve(msg.update),allowed=resolve(join(root,'releases'));if(u.startsWith(allowed+'/')||u.startsWith(allowed+'\\')){update=u;child.kill();}}});child.on('exit',async()=>{clearTimeout(timer);if(update){previous=path;await writeFile(pointer,JSON.stringify({path:update}));run(update);}else if(!ready&&path!==previous){await writeFile(pointer,JSON.stringify({path:previous}));run(previous);}else if(++restarts<=3)setTimeout(()=>run(path),5000);});}
run(release);
