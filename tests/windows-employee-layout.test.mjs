import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {WINDOWS_APP_FILES,stageWindowsApp} from '../employee-client/install-layout.mjs';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'orbit-win-layout-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'解压目录 with spaces'),target=join(root,'用户目录');const manifest={version:'1.3.2',files:[]};
 for(const name of WINDOWS_APP_FILES){const bytes=Buffer.from('fixture '+name);await mkdir(join(source,name,'..'),{recursive:true});await writeFile(join(source,name),bytes);manifest.files.push({path:name,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await mkdir(join(target,'app'),{recursive:true});await writeFile(join(target,'app','README.md'),'old protected program');await chmod(join(target,'app','README.md'),0o400);
 await mkdir(join(target,'data','queue'),{recursive:true});await writeFile(join(target,'data','queue','unsent'),'unsent attachment');await writeFile(join(target,'data','client.sqlite'),'fixture database');
 return {source,target,manifest};
}
test('Windows app staging preserves legacy files, database and queue, supports spaces and repeated updates',async t=>{
 const {source,target,manifest}=await fixture(t);
 await chmod(join(source,'README.md'),0o400);
 const a=await stageWindowsApp(source,target,manifest),b=await stageWindowsApp(source,target,manifest);
 assert.notEqual(a,b);assert.equal(await readFile(join(a,'README.md'),'utf8'),'fixture README.md');
 for(const name of WINDOWS_APP_FILES)assert.deepEqual(await readFile(join(b,name)),await readFile(join(source,name)));
 assert.equal(await readFile(join(target,'app','README.md'),'utf8'),'old protected program');
 assert.equal(await readFile(join(target,'data','queue','unsent'),'utf8'),'unsent attachment');
 assert.equal(await readFile(join(target,'data','client.sqlite'),'utf8'),'fixture database');
});
test('corrupted or duplicate package entries cannot stage an app or alter data',async t=>{
 const {source,target,manifest}=await fixture(t);
 await assert.rejects(stageWindowsApp(source,target,{...manifest,files:[...manifest.files,manifest.files[0]]}),/清单无效/);
 await writeFile(join(source,'ui','app.js'),'corrupt');await assert.rejects(stageWindowsApp(source,target,manifest),/校验失败/);
 assert.deepEqual((await readdir(target)).sort(),['app','data']);
 assert.equal(await readFile(join(target,'data','queue','unsent'),'utf8'),'unsent attachment');
});
test('failed program directory creation leaves the legacy installation and pending work intact',async t=>{
 const {source,target,manifest}=await fixture(t);await writeFile(join(target,'programs'),'blocked directory fixture');
 await assert.rejects(stageWindowsApp(source,target,manifest));
 assert.equal(await readFile(join(target,'app','README.md'),'utf8'),'old protected program');
 assert.equal(await readFile(join(target,'data','queue','unsent'),'utf8'),'unsent attachment');
});
