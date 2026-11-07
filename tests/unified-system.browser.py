import os,json,time,base64,struct,zlib
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('ORBIT_EMPLOYEE_BASE_URL','http://127.0.0.1:3193');server=os.environ['ORBIT_E2E_BASE_URL'];checks=0
def chunk(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',32,32,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\x33\x88\xcc'*32)*32))+chunk(b'IEND',b'')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);context=browser.new_context(viewport={'width':1500,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def control(path='',method='get'):
  r=getattr(context.request,method)(os.environ.get('ORBIT_CONTROL_BASE_URL','http://127.0.0.1:3192')+'/'+path,headers={'x-test-token':'orbit-unified-browser-test'});assert r.ok,r.text();return r.json()
 control('online','post');page.goto(base)
 if page.get_by_role('heading',name='连接原系统').count():
  page.locator('#origin').fill(server);page.get_by_role('button',name='打开系统',exact=True).click()
 page.wait_for_timeout(1000)
 if page.get_by_role('button',name='退出登录',exact=True).count():page.get_by_role('button',name='退出登录',exact=True).click()
 expect(page.get_by_role('heading',name='进入内容管理平台')).to_be_visible(timeout=20000);checks+=1
 page.get_by_label('登录账号',exact=True).fill('cfg-owner');page.get_by_label('密码',exact=True).fill('Config-QA-2026!2');page.get_by_role('button',name='登录',exact=True).click();expect(page.get_by_role('heading',name='选择项目开始工作')).to_be_visible(timeout=30000);checks+=1
 for attempt in range(100):
  ready=page.evaluate("fetch('/employee-api/state').then(r=>r.json())")
  if ready.get('shellReady'):break
  page.wait_for_timeout(200)
 assert ready.get('shellReady'),ready;checks+=1
 page.on('dialog',lambda d:d.accept());page.get_by_role('tab',name='跨境权限验收').click();page.get_by_role('button',name='线索库',exact=True).click();expect(page.get_by_role('heading',name='线索库',level=2)).to_be_visible();checks+=1
 control('offline','post');page.get_by_role('button',name='新增线索',exact=True).click();title='原页面离线提交-'+str(time.time_ns());page.get_by_label('名称',exact=True).fill(title);page.get_by_label('关键字',exact=False).fill('离线原页面');page.locator('input[type=file]').first.set_input_files({'name':'image.png','mimeType':'image/png','buffer':png});page.get_by_role('button',name='提交线索',exact=True).click();expect(page.get_by_role('heading',name=title,exact=True).first).to_be_visible(timeout=15000);checks+=1
 for attempt in range(30):
  st=control()['state'];job=next((j for j in st['jobs'] if j['draft']['title']==title),None)
  if job and job['state']=='waiting':break
  page.wait_for_timeout(100)
 assert job['state']=='waiting',job;assert job['draft']['submit'] is True;checks+=2
 page.screenshot(path='/tmp/unified-original-offline.png',full_page=True)
 control('restart','post');page.reload();expect(page.get_by_role('heading',name='选择项目开始工作')).to_be_visible(timeout=20000);checks+=1;page.get_by_role('tab',name='跨境权限验收').click();page.get_by_role('button',name='线索库',exact=True).click();expect(page.get_by_text(title,exact=True).first).to_be_visible();checks+=1
 control('online','post')
 for attempt in range(150):
  st=control()['state'];job=next(j for j in st['jobs'] if j['draft']['title']==title)
  if job['state']=='complete':break
  page.wait_for_timeout(200)
 assert job['state']=='complete',job;assert json.loads(job['result'])['status']=='approved';checks+=2
 page.screenshot(path='/tmp/unified-original-synced.png',full_page=True);assert not errors,errors;checks+=1;browser.close();print(json.dumps({'checks':checks,'originalLogin':True,'originalProjectNavigation':True,'sameUploadAndSubmitPage':True,'offlineSubmit':True,'restartOffline':True,'automaticSync':True,'errors':errors},ensure_ascii=False))
