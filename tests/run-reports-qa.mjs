import {spawn} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const dir=mkdtempSync(join(tmpdir(),"orbit-reports-qa-"));
const base="http://127.0.0.1:3147";
const server=spawn(process.execPath,["node_modules/vinext/dist/cli.js","start","--port","3147","--hostname","127.0.0.1"],{env:{...process.env,ORBIT_DB_PATH:join(dir,"qa.sqlite"),ORBIT_MEDIA_DIR:join(dir,"media")},stdio:["ignore","pipe","pipe"]});
let output="";server.stdout.on("data",x=>output+=x);server.stderr.on("data",x=>output+=x);
try{
 let ready=false;
 for(let i=0;i<60;i++){if(server.exitCode!==null)throw Error(output);try{const r=await fetch(base+"/api/system/health");if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw Error("Test server failed to start "+output);
 const test=spawn(process.execPath,["tests/reports-privacy.e2e.mjs"],{env:{...process.env,ORBIT_E2E_BASE_URL:base},stdio:"inherit"});
 const result=await new Promise(resolve=>test.on("exit",resolve));if(result!==0)throw Error("Report tests failed");
 console.log("Verified isolated database: "+dir);
}finally{server.kill("SIGTERM");}
