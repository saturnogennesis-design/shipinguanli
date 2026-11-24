"""Actual employee runtime reports to a local host; commands defer during editing."""
import os,json,time,subprocess,tempfile,sqlite3
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());host=os.environ['ORBIT_E2E_BASE_URL'];assert host.startswith('http://127.0.0.1:')
root=Path(tempfile.mkdtemp(prefix='v336-client-',dir='/tmp'));ready=root/'ready.json';env={**os.environ,'QA_ROOT':str(root),'QA_HOST':host,'QA_AUTH':os.environ['ORBIT_QA_STATE_FILE'],'QA_READY':str(ready)};log=(root/'runtime.log').open('w');proc=subprocess.Popen(['node','tests/fixtures/employee-sync-server.mjs'],env=env,stdout=log,stderr=log);errors=[];checks=0
try:
 for _ in range(100):
  if ready.exists():break
  if proc.poll() is not None:raise AssertionError((root/'runtime.log').read_text())
  time.sleep(.2)
 assert ready.exists();r=json.loads(ready.read_text());db=sqlite3.connect(root/'employee.sqlite') if (root/'employee.sqlite').exists() else None
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);local=browser.new_page(viewport={'width':1300,'height':900});local.on('pageerror',lambda e:errors.append(str(e)));local.goto(r['url']);local.get_by_role('button',name='开始本地编辑').click();local.locator('#unsaved').fill('正在编辑，不能关闭或丢失');ctx=browser.new_context(viewport={'width':1560,'height':1000});n,v=s['cookies']['admin'].split('=',1);ctx.add_cookies([{'name':n,'value':v,'url':host}]);admin=ctx.new_page();admin.on('pageerror',lambda e:errors.append(str(e)))
  def devices():
   q=ctx.request.get(host+'/api/admin/sync-control');assert q.status==200,q.text();return q.json()['devices']
  def wait_device(test,timeout=25):
   end=time.time()+timeout
   while time.time()<end:
    d=next((d for d in devices() if d['id']==r['device']),None)
    if d and test(d):return d
    local.wait_for_timeout(400)
   raise AssertionError('Employee report did not reach expected state: '+str(d))
  wait_device(lambda d:d['report']['editing'] and len(d['report']['jobs'])==2);admin.goto(host,wait_until='networkidle');admin.get_by_role('button',name='员工同步管理',exact=True).click();admin.get_by_label('员工电脑',exact=True).select_option(r['device']);admin.get_by_role('checkbox',name='选择同步任务：员工实际未同步的母版',exact=True).check();admin.get_by_role('button',name='采用主机版本，保留本地备份',exact=True).click();dialog=admin.get_by_role('dialog',name='二次确认同步处理',exact=True);expect(dialog).to_contain_text('共 2 项');dialog.get_by_role('textbox',name='同步处理原因',exact=True).fill('真实员工端验收，保留本地修改及附件');dialog.get_by_role('button',name='确认下发处理',exact=True).click();expect(dialog).to_have_count(0);local.wait_for_timeout(1500);d=wait_device(lambda d:any(c['action']=='adopt_host' for c in d['commands']));assert next(c for c in d['commands'] if c['action']=='adopt_host')['status']=='pending';expect(local.locator('#unsaved')).to_have_value('正在编辑，不能关闭或丢失');assert Path(r['path']).exists();checks+=5
  local.get_by_role('button',name='保存并退出编辑',exact=True).click();d=wait_device(lambda d:any(c['action']=='adopt_host' and c['status']=='done' for c in d['commands']) and all(j['state']=='retained' for j in d['report']['jobs']));assert local.evaluate('window.savedEditorValue')=='正在编辑，不能关闭或丢失';assert Path(r['path']).exists();assert len(d['report']['jobs'])==2;local.screenshot(path='/tmp/v336-screenshots/employee-command-safe.png');checks+=4
  admin.get_by_role('button',name='刷新报告',exact=True).click();expect(admin.get_by_text('本地备份已保留',exact=True).first).to_be_visible();admin.get_by_role('checkbox',name='选择同步任务：员工实际未同步的母版',exact=True).check();admin.get_by_role('button',name='彻底清理本地备份',exact=True).click();dialog=admin.get_by_role('dialog',name='二次确认同步处理',exact=True);expect(dialog).to_contain_text('不能恢复');expect(dialog).to_contain_text('共 2 项');dialog.get_by_role('textbox',name='同步处理原因',exact=True).fill('验收临时附件已核对，彻底清理本地备份');dialog.get_by_role('button',name='确认下发处理',exact=True).click();expect(dialog).to_have_count(0);wait_device(lambda d:any(c['action']=='purge_local' and c['status']=='done' for c in d['commands']) and len(d['report']['jobs'])==0);assert not Path(r['path']).exists();expect(local.get_by_role('heading',name='员工正在使用的页面',exact=True)).to_be_visible();admin.get_by_role('button',name='刷新报告',exact=True).click();admin.screenshot(path='/tmp/v336-screenshots/host-command-acknowledged.png');checks+=5;assert not errors,errors;browser.close()
 print(json.dumps({'checks':checks,'pageErrors':errors,'fixture':str(root)},ensure_ascii=False))
finally:
 proc.terminate()
 try:proc.wait(timeout=10)
 except subprocess.TimeoutExpired:proc.kill();proc.wait()
 log.close()
