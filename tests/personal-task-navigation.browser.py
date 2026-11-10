# Synthetic task responses test personal filtering without changing task data.
import json,sqlite3,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());w=json.loads(Path('/tmp/v331-state.json').read_text());base=os.environ['ORBIT_E2E_BASE_URL']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1600,'height':1000});n,v=s['adminCookie'].split('=',1);c.add_cookies([{'name':n,'value':v,'url':base}]);page=c.new_page();page.on('dialog',lambda d:d.accept());errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def tasks(route):
  response=route.fetch();d=response.json()
  if 'currentUserId' in d:
   out=[]
   for stage in ['mother','product','child']:
    conn=sqlite3.connect(os.environ['ORBIT_QA_DB_PATH']);covered={x[0] for x in conn.execute('select record_id from cross_files')};conn.close();example=next(t for t in d['items'] if t['stage']==stage and t['source_id'] in covered)
    for i,status in enumerate(['todo','making','rejected','pending','approved']):
     out.append(dict(example,id=90000+len(out),assignee_id=d['currentUserId'],status=status))
    out.append(dict(example,id=90000+len(out),assignee_id=None,status='todo'))
   d['items']=out
  route.fulfill(response=response,json=d)
 page.route('**/api/cross-records/tasks',tasks);page.goto(base,wait_until='domcontentloaded');page.wait_for_timeout(1500);page.locator('#project-tab-'+str(w['project'])).click(timeout=60000);expect(page.locator('.scoped-dashboard')).to_be_visible(timeout=60000);nav=page.get_by_role('navigation',name='项目二级导航')
 for name,title in [('母版库','我的线索任务'),('产品管理','我的产品任务')]:
  nav.get_by_role('button',name=name).click();panel=page.get_by_role('complementary',name=title);expect(panel).to_be_visible();expect(panel.locator('.task-quick-row')).to_have_count(3 if name=='母版库' else 6);expect(panel.locator('article')).to_have_count(0);expect(panel.locator('select')).to_have_count(0);expect(panel).not_to_contain_text('待审核');expect(panel).not_to_contain_text('已通过');panel.locator('.cross-cover').first.hover();expect(page.locator('.cross-hover-preview')).to_be_visible();panel.get_by_role('heading').hover();expect(page.locator('.cross-hover-preview')).to_have_count(0);panel.locator('.task-quick-row').first.click();expect(page.locator('.task-location-hint').or_(page.get_by_role('dialog'))).to_be_visible();
  if page.get_by_role('dialog').count():page.get_by_role('dialog').get_by_role('button',name='关闭',exact=True).first.click()
  page.screenshot(path='/tmp/v3311-'+name+'.png')
  assert panel.get_by_role('button',name='详情',exact=True).count()==0
  if name=='产品管理':
   expect(panel.locator('.task-type')).to_have_count(3 if name=='母版库' else 6)
   page.locator('.scoped-flow').get_by_role('button',name='新建子包任务',exact=True).first.click()
   dialog=page.get_by_role('dialog',name='新建子包任务',exact=True);expect(dialog).to_be_visible();assert dialog.bounding_box()['width']<=650
   assert dialog.get_by_label('分配任务负责人').bounding_box()['width']>150
   page.screenshot(path='/tmp/v3311-task-dialog.png')
   page.set_viewport_size({'width':760,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/v3311-task-dialog-narrow.png')
   dialog.get_by_role('button',name='取消',exact=True).click()
   page.set_viewport_size({'width':1600,'height':1000});row=page.locator('.scoped-flow tbody tr').first;row.locator('td').nth(1).click();expect(page.locator('.scoped-editor-frame')).to_be_visible()

 assert not errors,errors
 b.close();print('Personal navigation checks passed for mother and product; hover preview and locate; no page errors')
