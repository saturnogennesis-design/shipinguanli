"use client";
import { readBusinessContext } from "@/app/business-context";
let installed=false;
const roots=new Set(['cross-records','contents','content-versions','content-version-files','material-sets','material-files','materials','product-masters','reviews','review-sessions','versions','publishing','analytics','dashboard','groups','business-data','content-categories','filters']);
export function installProjectFetch(){
 if(installed||typeof window==='undefined')return;installed=true;
 const original=window.fetch.bind(window);
 window.fetch=(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),window.location.href);
  if(url.origin!==window.location.origin||!roots.has(url.pathname.split('/')[2]))return original(input,init);
  const project=readBusinessContext();const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
  if(project)headers.set('x-orbit-project-id',String(project.accountId));else headers.delete('x-orbit-project-id');
  return original(input,{...init,headers}).then(async response=>{if(response.status===403&&project){const data=await response.clone().json().catch(()=>({}));if(/项目/.test(data.error??'')&&readBusinessContext()?.accountId===project.accountId)window.dispatchEvent(new Event('orbit-project-access-revoked'));}return response;});
 };
}
// Media elements do not use fetch; route their URLs through an explicit project query.
export function projectMediaUrl(url:string,projectId:number){if(!url.startsWith('/api/'))return url;return url+(url.includes('?')?'&':'?')+'projectId='+projectId;}

export function currentProjectMediaUrl(url:string){
 const context=typeof window!=='undefined'?readBusinessContext():null;
 return context?projectMediaUrl(url,context.accountId):url;
}
