"""Real local employee HTTP server + Chromium; synthetic data and queue only in /tmp."""
import json,os,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path.cwd();temp=tempfile.TemporaryDirectory(prefix='orbit-conflict-browser-',dir='/tmp');state=Path(temp.name)/'ready.json'
script=r'''
import {EmployeeClient} from './employee-client/server.mjs';import {Readable} from 'node:stream';import {writeFile} from 'node:fs/promises';
const app=new EmployeeClient(process.env.QA_ROOT,{port:0}),s=app.store;s.login('test:1',{id:1,displayName:'测试员工'},'session=test','http://127.0.0.1:39999');const ns=app.account.ns;s.set('protocol:'+ns,2);s.set('allowed-projects:'+ns,[10]);s.set('catalog:'+ns,[{id:10,name:'测试项目',permissions:['cross.view','cross.create','cross.edit']}]);s.set('shell-ready:'+ns,true);app.online=true;app.sync=async()=>{};
app.original.remember('/api/cross-records?id=42',10,{row:{id:42,revision:1,title:'十一月菊花',status:'draft',kind:'package'},files:[]});const j=await app.original.prepare({project:10,draft:{title:'十一月菊花（本地）',kind:'package',target:{id:42,revision:1},data:{keywords:'本地关键词'},files:[{name:'待上传图片.png',mime:'image/png',size:4}],submit:true}});await app.original.saveFile(Readable.from([Buffer.from('test')]),j.id,0);app.original.ready(j.id);s.db.prepare("UPDATE jobs SET state='blocked',error='主机资料已更新，请处理冲突' WHERE id=?").run(j.id);app.api=async()=>({row:{title:'十一月菊花（主机）',status:'pending',revision:7,body_json:'{"keywords":"主机关键词"}'},files:[{file_name:'主机图片.png'}]});
app.original.serveRoot=async(req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','set-cookie':'orbit_local='+app.token+'; HttpOnly; SameSite=Strict; Path=/'});res.end('<!doctype html><html><head><style>*{margin:0}body{background:#eef2f7}button,a{font:inherit}dialog::backdrop{background:#18263b66}</style></head><body><h1>员工系统测试</h1><script src="/employee-bridge.js" data-token="'+app.token+'"></script></body></html>');};await app.start();app.port=app.server.address().port;await writeFile(process.env.QA_STATE,JSON.stringify({port:app.port}));process.on('SIGTERM',async()=>{await app.close();process.exit(0);});
'''
p=subprocess.Popen(['node','--input-type=module','-e',script],env={**os.environ,'QA_ROOT':temp.name,'QA_STATE':str(state)},stdout=subprocess.DEVNULL,stderr=open('/tmp/v33110-browser-server.log','w'))
try:
 import time
 for _ in range(100):
  if state.exists():break
  if p.poll() is not None:raise RuntimeError('fixture failed; see /tmp/v33110-browser-server.log')
  time.sleep(.05)
 url='http://127.0.0.1:'+str(json.loads(state.read_text())['port']);errors=[];checks=0
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1366,'height':900});page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url);page.locator('#employee-sync-status').click();dialog=page.get_by_role('dialog',name='处理同步冲突');expect(dialog).to_be_visible();expect(dialog).to_contain_text('主机最新');expect(dialog).to_contain_text('待审核');expect(dialog).to_contain_text('本地关键词');expect(dialog).to_contain_text('主机关键词');checks+=5
  rect=dialog.bounding_box();assert abs(rect['x']+rect['width']/2-683)<3 and rect['height']<=720;checks+=2;page.screenshot(path='/tmp/v33110-conflict.png')
  with page.expect_download() as event:dialog.get_by_role('link',name='下载本地修改记录').click()
  d=event.value;assert d.suggested_filename=='十一月菊花（本地）-本地修改.json';assert json.loads(Path(d.path()).read_text())['data']['keywords']=='本地关键词';checks+=2
  dialog.locator('summary').click()
  with page.expect_download() as event:dialog.get_by_role('link',name='待上传图片.png').click()
  assert Path(event.value.path()).read_bytes()==b'test';checks+=1
  dialog.get_by_role('button',name='关闭，稍后处理').click();expect(dialog).to_have_count(0);page.locator('#employee-sync-status').click();expect(dialog).to_be_visible();checks+=1
  page.on('dialog',lambda d:d.accept());dialog.get_by_role('button',name='查看主机版本（保留本地）').click();expect(dialog).to_have_count(0);page.locator('#employee-sync-status').click();expect(dialog).to_contain_text('已暂存本地修改');expect(dialog.get_by_role('link',name='下载本地修改记录')).to_be_visible();checks+=2
  page.set_viewport_size({'width':390,'height':640});box=dialog.bounding_box();assert box['width']<=358 and box['height']<=512;checks+=1
  assert not errors,errors;browser.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshot':'/tmp/v33110-conflict.png'},ensure_ascii=False))
finally:p.terminate();p.wait(timeout=10);temp.cleanup()
