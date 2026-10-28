import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
let sqlite,user,reads,conversions;
const media=new Map();
const schema={workReports:{__table:'work_reports',id:'id'},workReportAttachments:{__table:'work_report_attachments',id:'id',reportId:'report_id'}};
const moduleUrl=source=>'data:text/javascript,'+encodeURIComponent(source);
const api={
  getDb(){return {select(){return {from(table){return {where(condition){
    const parts=condition.op==='and'?condition.parts:[condition];
    const sql='SELECT * FROM '+table.__table+' WHERE '+parts.map(item=>item.column+' = ?').join(' AND ');
    return Promise.resolve(sqlite.prepare(sql).all(...parts.map(item=>item.value)).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),value]))));
  }};}};}};},
  getLocalDatabase(){return sqlite;},
  async requireUser(){return user?{user,response:null}:{user:null,response:Response.json({error:'请先登录'},{status:401})};},
  hasPermission(current,permission){return current.permissions.includes(permission);},
  reportAccess(current){return current.permissions.some(p=>['report.create','report.receive','report.cc'].includes(p));},
  async reportLists(current){return {reports:current.visible?[{id:1}]:[],cc:[]};},
  getMediaStore(){return {
    async put(key,body,options){media.set(key,{bytes:new Uint8Array(await new Response(body).arrayBuffer()),type:options.httpMetadata.contentType});},
    async get(key){reads++;const file=media.get(key);if(!file)return null;return {body:new Blob([file.bytes]).stream(),writeHttpMetadata(headers){headers.set('content-type',file.type);headers.set('content-length',String(file.bytes.length));}};},
    async delete(key){media.delete(key);},
  };},
  async writeAudit(){},
  async convertLegacyOffice(){conversions++;return new TextEncoder().encode('%PDF-1.7 legacy converted');},
};
globalThis.__reportRouteTest=api;globalThis.__reportRouteSchema=schema;
const aliases={
 '@/db':['getDb','getLocalDatabase'], '@/lib/server-auth':['requireUser','hasPermission'],
 '@/lib/report-service':['reportAccess','reportLists'], '@/lib/media-store':['getMediaStore'], '@/lib/audit':['writeAudit'],
};
registerHooks({resolve(specifier,context,next){
  if(specifier==='drizzle-orm')return {url:moduleUrl('export const eq=(column,value)=>({column,value});export const and=(...parts)=>({op:"and",parts});'),shortCircuit:true};
  if(specifier==='@/db/schema')return {url:moduleUrl('export const {workReports,workReportAttachments}=globalThis.__reportRouteSchema;'),shortCircuit:true};
  if(aliases[specifier])return {url:moduleUrl('export const {'+aliases[specifier].join(',')+'}=globalThis.__reportRouteTest;'),shortCircuit:true};
  if(specifier==='@/lib/office-convert')return {url:moduleUrl('export const {convertLegacyOffice}=globalThis.__reportRouteTest;export class OfficeConversionError extends Error {}'),shortCircuit:true};
  if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
  return next(specifier,context);
}});
const collection=await import('../app/api/reports/[id]/attachments/route.ts');
const item=await import('../app/api/reports/[id]/attachments/[attachmentId]/route.ts');
function reset(t){
 sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE work_reports(id INTEGER PRIMARY KEY, submitter_user_id INTEGER,recipient_user_id INTEGER,status TEXT,template_code TEXT);
 CREATE TABLE work_report_attachments(id INTEGER PRIMARY KEY,report_id INTEGER REFERENCES work_reports(id),file_name TEXT,mime_type TEXT,file_size INTEGER,storage_path TEXT,uploaded_by_user_id INTEGER,created_at TEXT);
 INSERT INTO work_reports VALUES(1,1,2,'draft','RPT-DAILY');`);
 user={id:1,permissions:['report.create'],visible:true};reads=0;conversions=0;media.clear();
}
const context={params:Promise.resolve({id:'1',attachmentId:'1'})};
function request(fileName='日报.pdf',bytes='%PDF-1.7 sample',mime='application/pdf'){
 const form=new FormData();form.append('file',new File([bytes],fileName,{type:mime}));
 return new Request('http://local/api/reports/1/attachments',{method:'POST',body:form});
}
function insert(name='日报.pdf',type='application/pdf'){
 sqlite.prepare('INSERT INTO work_report_attachments VALUES(1,1,?,?,10,\'stored\',1,\'now\')').run(name,type);
 media.set('stored',{bytes:new TextEncoder().encode('%PDF-1.7 original'),type});
}
test('unauthenticated users cannot upload or read attachment',async t=>{
 reset(t);user=null;assert.equal((await collection.POST(request(),context)).status,401);assert.equal((await item.GET(new Request('http://local/file'),context)).status,401);assert.equal(reads,0);
});
test('draft owner uploads a PDF with a canonical content type and private metadata',async t=>{
 reset(t);const response=await collection.POST(request('日报.PDF','%PDF-1.7 content','text/html'),context);
 assert.equal(response.status,201);const result=await response.json();assert.equal(result.mimeType,'application/pdf');assert.equal(result.storagePath,undefined);assert.equal(sqlite.prepare('SELECT count(*) n FROM work_report_attachments').get().n,1);
});
test('submitted daily attachments reject uploads from both sender and recipient',async t=>{
 reset(t);sqlite.exec("UPDATE work_reports SET status='submitted'");assert.equal((await collection.POST(request(),context)).status,403);
 user={id:2,permissions:['report.receive'],visible:true};assert.equal((await collection.POST(request(),context)).status,403);assert.equal(media.size,0);
});
test('unrelated and CC readers cannot edit someone else draft',async t=>{
 reset(t);user={id:3,permissions:['report.create','report.cc'],visible:true};assert.equal((await collection.POST(request(),context)).status,403);
});
test('invalid signature and disallowed extension never reach media store',async t=>{
 reset(t);assert.equal((await collection.POST(request('file.docx','MZ executable'),context)).status,415);assert.equal((await collection.POST(request('file.exe'),context)).status,415);assert.equal(media.size,0);
});
test('attachment count limit removes staged media and preserves existing files',async t=>{
 reset(t);for(let i=1;i<=10;i++)sqlite.prepare("INSERT INTO work_report_attachments(id,report_id,file_name,storage_path) VALUES(?,1,'old.pdf',?)").run(i,'old-'+i);
 assert.equal((await collection.POST(request(),context)).status,409);assert.equal(media.size,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM work_report_attachments').get().n,10);
});
test('oversized request is rejected before parsing the body',async t=>{
 reset(t);const response=await collection.POST(new Request('http://local/upload',{method:'POST',headers:{'content-length':String(22*1024*1024)},body:'too large'}),context);
 assert.equal(response.status,413);assert.equal(media.size,0);
});
test('authorized reader downloads original bytes with private headers',async t=>{
 reset(t);insert();const response=await item.GET(new Request('http://local/file?download=1'),context);
 assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment;/);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(await response.text(),'%PDF-1.7 original');
});
test('unauthorized users cannot access a cached preview or trigger conversion',async t=>{
 reset(t);insert('old.doc','application/msword');media.set('work-reports/1/previews/1.pdf',{bytes:new Uint8Array(),type:'application/pdf'});user.visible=false;
 assert.equal((await item.GET(new Request('http://local/file?preview=1'),context)).status,403);assert.equal(reads,0);assert.equal(conversions,0);
});
test('legacy preview converts once and download still returns original',async t=>{
 reset(t);insert('old.doc','application/msword');
 for(let i=0;i<2;i++){const response=await item.GET(new Request('http://local/file?preview=1'),context);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(await response.text(),/legacy converted/);}
 assert.equal(conversions,1);assert.equal(await (await item.GET(new Request('http://local/file?download=1'),context)).text(),'%PDF-1.7 original');
});
test('draft attachment deletion cleans original and cached preview',async t=>{
 reset(t);insert();media.set('work-reports/1/previews/1.pdf',{bytes:new Uint8Array(),type:'application/pdf'});
 assert.equal((await item.DELETE(new Request('http://local/file',{method:'DELETE'}),context)).status,200);assert.equal(media.size,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM work_report_attachments').get().n,0);
});
test('submitted daily attachment cannot be deleted by sender',async t=>{
 reset(t);insert();sqlite.exec("UPDATE work_reports SET status='submitted'");assert.equal((await item.DELETE(new Request('http://local/file',{method:'DELETE'}),context)).status,403);assert.equal(media.size,1);
});
