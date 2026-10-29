"""Browser acceptance against the isolated projects test server, not production."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
state=json.loads(Path(os.environ.get('ORBIT_QA_STATE_FILE','/workspace/qa-projects/state.json')).read_text())
base=os.environ.get('ORBIT_E2E_BASE_URL','http://127.0.0.1:3100')
passed=0
def select_project(page, project_id, accept=True):
 def handle(dialog):
  assert '未保存的内容将自动清除' in dialog.message
  dialog.accept() if accept else dialog.dismiss()
 page.once('dialog',handle)
 page.locator(f'#project-tab-{project_id}').click()

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000})
 name,value=state['adminCookie'].split('=',1);context.add_cookies([{'name':name,'value':value,'url':base}])
 page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.goto(base);page.get_by_role('heading',name='选择项目开始工作').wait_for();passed+=1
 assert page.get_by_role('button',name='项目管理',exact=True).is_visible();passed+=1
 assert page.get_by_role('button',name='发布目标账号管理',exact=True).count()==0;assert page.get_by_role('navigation',name='项目二级导航').count()==0;passed+=1
 assert page.get_by_role('button',name='平台与店铺',exact=True).count()==0;passed+=1
 assert page.get_by_role('navigation',name='全局事项').get_by_role('button',name='工作报备').is_visible()
 assert page.get_by_role('navigation',name='系统操作与全局配置').get_by_role('button',name='项目管理',exact=True).is_visible()
 top=page.locator('.project-global-nav').bounding_box();bottom=page.locator('.project-system-nav').bounding_box();assert top['y']<bottom['y'];assert bottom['y']+bottom['height']<=1000;passed+=1
 select_project(page,state['a']);page.get_by_role('heading',name='项目工作台',exact=True).last.wait_for();passed+=1
 page.get_by_role('button',name='发布管理',exact=True).click();page.get_by_role('button',name='十乐测试成片',exact=True).click();page.locator('.publishing-original .unified-detail').wait_for();passed+=1
 select_project(page,state['b'],False);assert page.locator('.publishing-original .unified-detail').is_visible();assert page.locator(f"#project-tab-{state['a']}").get_attribute('aria-selected')=='true';passed+=1
 select_project(page,state['b']);page.get_by_role('heading',name='项目工作台',exact=True).last.wait_for();assert page.locator('.publishing-original').count()==0;passed+=1
 assert page.locator('.project-topbar').get_by_text('当前项目：独立项目B',exact=True).is_visible();passed+=1
 page.get_by_role('button',name='内容池',exact=True).click();page.wait_for_timeout(800);assert '十乐测试成片' not in page.locator('.project-content').inner_text();passed+=1
 # Every project switch resets the module, not merely the filters.
 select_project(page,state['a']);page.get_by_role('heading',name='项目工作台',exact=True).last.wait_for();passed+=1
 page.get_by_role('button',name='工作报备',exact=True).click();page.get_by_role('heading',name='工作报备',exact=True).last.wait_for();assert page.get_by_role('option',name='口播文案',exact=True).count()==0;passed+=1
 # Configure daily template for the synthetic admin through normal API.
 page.evaluate('''async()=>{const p=await(await fetch('/api/projects')).json();const t=await(await fetch('/api/report-templates')).json();await fetch('/api/report-templates',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'assign',id:t.templates[0].id,userIds:[p.currentUserId]})});}''')
 page.reload();page.get_by_role('heading',name='选择项目开始工作').wait_for();page.get_by_role('button',name='工作报备',exact=True).click();page.get_by_role('button',name='新建日报',exact=True).wait_for();page.get_by_role('button',name='新建日报',exact=True).click()
 assert page.locator('.report-upload-label').get_by_text('上传附件').is_visible();assert page.locator('.report-upload-label').get_by_text('＋',exact=True).is_visible();passed+=1
 # Per-tab project state: changing one tab must not redirect requests in another tab.
 other=context.new_page();other.goto(base);other.get_by_role('heading',name='选择项目开始工作').wait_for();select_project(other,state['b']);other.get_by_role('heading',name='项目工作台',exact=True).last.wait_for()
 page.get_by_role('button',name='退出',exact=True).click();page.get_by_role('button',name='确认',exact=True).click();select_project(page,state['a']);page.get_by_role('heading',name='项目工作台',exact=True).last.wait_for()
 first=page.evaluate('async()=> (await(await fetch("/api/dashboard")).json()).project.id');second=other.evaluate('async()=> (await(await fetch("/api/dashboard")).json()).project.id');assert first==state['a'] and second==state['b'];passed+=1
 assert not errors,errors
 Path('/workspace/qa-projects').mkdir(exist_ok=True)
 page.screenshot(path='/workspace/qa-projects/project-workbench.png',full_page=True)
 print(json.dumps({'passed':passed,'pageErrors':errors}));browser.close()
