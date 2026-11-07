import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('ORBIT_EMPLOYEE_BASE_URL','http://127.0.0.1:3199');server=os.environ['ORBIT_E2E_BASE_URL'];checks=0
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);expect(page.get_by_role('heading',name='连接与同步')).to_be_visible();checks+=1
 page.locator('#server-origin').fill(server);page.locator('#login-name').fill('cfg-owner');page.locator('#login-password').fill('Config-QA-2026!2');page.get_by_role('button',name='连接并登录',exact=True).click();expect(page.locator('#username')).to_have_text('owner配置验收',timeout=20000);checks+=1
 page.locator('[data-tab=history]').click();expect(page.locator('#records tbody tr').first).to_be_visible(timeout=20000);checks+=1
 page.locator('#records [data-detail]').first.click();expect(page.locator('#detail')).to_be_visible();expect(page.locator('#detail-content')).to_contain_text('离线副本');page.locator('#detail-close').click();checks+=2
 # Stop synchronization; the actual disconnected restart is exercised by Node E2E.
 page.locator('#pause').click();expect(page.locator('#pause')).to_have_text('继续同步');checks+=1
 page.locator('[data-tab=new]').click();page.locator('#draft-project').select_option(label='跨境权限验收');page.locator('#draft-kind').select_option('clue');page.locator('#draft-title').fill('浏览器离线草稿');page.locator('#draft-keywords').fill('图片验收');page.locator('#draft-files').set_input_files({'name':'image.png','mimeType':'image/png','buffer':bytes.fromhex('89504e470d0a1a0a')+b'qa-image'});expect(page.locator('#chosen-files')).to_contain_text('image.png');checks+=1
 page.locator('#save-draft').click();expect(page.locator('#jobs')).to_contain_text('浏览器离线草稿');expect(page.locator('#jobs')).to_contain_text('等待上传');checks+=2
 token=page.locator('meta[name=local-token]').get_attribute('content');r=ctx.request.get(base+'/api/state',headers={'x-local-token':token});state=r.json();assert state['jobs'][0]['state']=='waiting';assert state['cacheLimit']==5*1024**3;checks+=2
 page.screenshot(path='/tmp/employee-offline-desktop.png',full_page=True);page.set_viewport_size({'width':820,'height':1000});page.locator('[data-tab=settings]').click();expect(page.locator('#login-form')).to_be_visible();page.screenshot(path='/tmp/employee-offline-narrow.png',full_page=True);checks+=1
 assert not errors,errors;checks+=1;b.close();print(json.dumps({'checks':checks,'login':True,'cachedHistory':True,'localDraftSaved':True,'responsive':True,'pageErrors':errors}))
