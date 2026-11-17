"""Real ordinary-member task editing through workbench, list, detail and inline tab."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];assert base.startswith('http://127.0.0.1:');checks=0;errors=[];out=Path('/tmp/v3322-screenshots');out.mkdir(exist_ok=True);pdf=b'%PDF-1.4\n%%EOF'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1500,'height':960});n,v=s['cookies']['worker'].split('=',1);context.add_cookies([{'name':n,'value':v,'url':base}]);page=context.new_page();page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)));reads=[];page.on('request',lambda r:reads.append(r.url) if '/api/cross-records?' in r.url and 'editing=1' in r.url else None)
 def confirm(yes=True):page.get_by_role('dialog').get_by_role('button',name='确认继续' if yes else '取消',exact=True).click()
 def child():
  r=context.request.get(base+'/api/cross-records?id='+str(s['child']),headers={'x-orbit-project-id':str(s['project'])});assert r.status==200,r.text();return r.json()
 def editor():return page.locator('.cross-edit-page:visible')
 def stable_editor():
  global checks
  expect(editor()).to_be_visible();page.wait_for_timeout(500);expect(editor()).to_be_visible();expect(editor().get_by_role('button',name='保存草稿',exact=True)).to_be_enabled();checks+=3
 page.goto(base,wait_until='networkidle');page.locator('#project-tab-'+str(s['project'])).click();confirm();nav=page.get_by_role('navigation',name='项目二级导航');page.get_by_role('tab',name='产品与子包').click();task=page.locator('tr[data-task-id="'+str(s['task'])+'"]:visible');task.get_by_role('button',name='继续制作',exact=True).click();stable_editor();assert reads;checks+=1
 # A late editing refresh cannot reopen the old editor after switching modules.
 editor().get_by_role('button',name='取消编辑',exact=True).click();expect(editor()).to_have_count(0);held=[]
 def delay(route):held.append(route)
 page.route('**/api/cross-records?*editing=1*',delay);page.get_by_role('button',name='继续上传子包',exact=True).click()
 for _ in range(50):
  if held:break
  page.wait_for_timeout(20)
 assert held;nav.get_by_role('button',name='母版库',exact=True).click();expect(page.locator('.project-topbar h1')).to_have_text('母版库');held[0].continue_();page.wait_for_timeout(500);expect(editor()).to_have_count(0);expect(page.locator('.project-topbar h1')).to_have_text('母版库');page.unroute('**/api/cross-records?*editing=1*',delay);checks+=3
 nav.get_by_role('button',name='项目工作台',exact=True).click();page.get_by_role('tab',name='产品与子包').click();page.locator('tr[data-task-id="'+str(s['task'])+'"]:visible').get_by_role('button',name='继续制作',exact=True).click();stable_editor()
 # Local inputs and selected files survive shell refresh/synchronization events.
 editor().get_by_label('名称',exact=True).fill('未保存的子包名称');editor().locator('input[type=file]').first.set_input_files({'name':'未保存.pdf','mimeType':'application/pdf','buffer':pdf});page.evaluate("window.dispatchEvent(new Event('orbit-employee-synced'))");page.wait_for_timeout(250);expect(editor().get_by_label('名称',exact=True)).to_have_value('未保存的子包名称');expect(editor().locator('.cross-file-tile')).to_contain_text('未保存.pdf');checks+=2
 editor().get_by_role('button',name='取消编辑',exact=True).click();confirm(False);expect(editor()).to_be_visible();checks+=1;editor().get_by_role('button',name='取消编辑',exact=True).click();confirm();expect(editor()).to_have_count(0);assert child()['files']==[];checks+=2
 # Cancelled initialEditing must not prevent re-entering the same child task.
 page.get_by_role('button',name='继续上传子包',exact=True).click();stable_editor();editor().get_by_label('名称',exact=True).fill('子包上传验收');editor().locator('input[type=file]').first.set_input_files({'name':'子包文档.pdf','mimeType':'application/pdf','buffer':pdf});page.screenshot(path=str(out/'subpackage-edit.png'));editor().get_by_role('button',name='保存草稿',exact=True).click();expect(editor()).to_have_count(0,timeout=20000);d=child();assert d['row']['status']=='draft' and len(d['files'])==1 and d['files'][0]['file_name']=='子包文档.pdf';checks+=2
 page.get_by_role('button',name='继续上传子包',exact=True).click();stable_editor();editor().get_by_role('button',name='取消编辑',exact=True).click();expect(editor()).to_have_count(0);checks+=1
 # Product list more-menu uses the same assigned task, not a new child record.
 nav.get_by_role('button',name='产品管理').click();root=page.locator('tr[data-record-id="'+str(s['main'])+'"]');root.locator('.scoped-row-menu>summary').click();root.get_by_role('button',name='上传子包',exact=True).click();stable_editor();editor().get_by_role('button',name='取消编辑',exact=True).click();expect(editor()).to_have_count(0);page.get_by_role('button',name='返回上一级',exact=True).click();checks+=1
 # Inline child tab can enter, save and return without dropping selected attachments.
 root=page.locator('tr[data-record-id="'+str(s['main'])+'"]');root.locator('strong').first.click();page.locator('#cross-detail-tab-'+str(s['main'])+'-related').click();panel=page.locator('[data-child-id="'+str(s['child'])+'"]');panel.get_by_role('button',name='上传子包',exact=True).click();stable_editor();editor().locator('input[type=file]').first.set_input_files({'name':'补充文档.pdf','mimeType':'application/pdf','buffer':pdf});editor().get_by_role('button',name='保存草稿',exact=True).click();expect(editor()).to_have_count(0,timeout=20000);assert len(child()['files'])==2;expect(page.locator('#cross-detail-tab-'+str(s['main'])+'-related')).to_have_attribute('aria-selected','true');checks+=2
 panel.get_by_role('button',name='上传子包',exact=True).click();stable_editor();before=len(reads);page.wait_for_timeout(500);assert len(reads)==before;editor().get_by_role('button',name='提交审核',exact=True).click();confirm();expect(editor()).to_have_count(0,timeout=20000);d=child();assert d['row']['status']=='pending' and len(d['files'])==2;checks+=3
 assert not errors,errors;browser.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False))
