import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
let running=0;
export class OfficeConversionError extends Error {
  status:number;
  constructor(message:string,status=422){super(message);this.status=status;}
}
async function executable() {
  if(process.env.ORBIT_OFFICE_EXECUTABLE?.trim())return process.env.ORBIT_OFFICE_EXECUTABLE.trim();
  if(process.platform!=="win32")return "libreoffice";
  for(const root of [process.env.ProgramFiles,process.env["ProgramFiles(x86)"]].filter((value):value is string=>Boolean(value))) {
    const path=join(root,"LibreOffice","program","soffice.com");
    try{await access(path);return path;}catch{}
  }
  throw new OfficeConversionError("服务器尚未配置文档转换组件，请管理员安装 LibreOffice 后再预览；仍可下载原件",503);
}
function convert(command:string,args:string[]) {
  return new Promise<void>((resolve,reject)=>{
    const child=spawn(command,args,{stdio:"ignore",windowsHide:true,shell:false,detached:process.platform!=="win32"});
    let timedOut=false;
    const timer=setTimeout(()=>{
      timedOut=true;
      if(child.pid&&process.platform==="win32")spawn("taskkill",["/PID",String(child.pid),"/T","/F"],{stdio:"ignore",windowsHide:true,shell:false}).on("error",()=>child.kill());
      else if(child.pid){try{process.kill(-child.pid,"SIGKILL");}catch{child.kill("SIGKILL");}}
    },45_000);
    child.on("error",error=>{clearTimeout(timer);reject(new OfficeConversionError((error as NodeJS.ErrnoException).code==="ENOENT"?"服务器尚未配置 LibreOffice，暂时无法预览旧版文档；仍可下载原件":"文档转换组件无法启动，请联系管理员",503));});
    child.on("close",code=>{clearTimeout(timer);if(code===0&&!timedOut)resolve();else reject(new OfficeConversionError("文档转换失败或超时，请确认文件未加密且可以正常打开"));});
  });
}
export async function convertLegacyOffice(body:ReadableStream,extension:"doc"|"xls") {
  if(running>=2)throw new OfficeConversionError("文档预览正在处理中，请稍后重试",429);
  running++;
  let directory:string|undefined;
  try {
    const command=await executable();directory=await mkdtemp(join(tmpdir(),"orbit-office-"));
    const output=join(directory,"output"),profile=join(directory,"profile");
    await mkdir(output);await mkdir(join(profile,"user"),{recursive:true});
    await writeFile(join(profile,"user","registrymodifications.xcu"),`<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>`);
    const input=join(directory,`document.${extension}`);
    await pipeline(Readable.fromWeb(body as never),createWriteStream(input,{flags:"wx"}));
    if((await stat(input)).size>20*1024*1024)throw new OfficeConversionError("文件超过预览大小限制",413);
    await convert(command,[`-env:UserInstallation=${pathToFileURL(profile).href}`,"--headless","--norestore","--nodefault","--convert-to","pdf","--outdir",output,input]);
    const pdf=join(output,"document.pdf");
    let size=0;try{size=(await stat(pdf)).size;}catch{throw new OfficeConversionError("文档无法转换，请确认文件未加密且可以正常打开");}
    if(size<5||size>50*1024*1024)throw new OfficeConversionError("文档预览结果过大或为空，请下载原件查看");
    const bytes=await readFile(pdf);
    if(bytes.subarray(0,5).toString()!=="%PDF-")throw new OfficeConversionError("文档转换结果无效");
    return bytes;
  }finally{running--;if(directory)await rm(directory,{recursive:true,force:true}).catch(()=>{});}
}
