"""Focused presentation and assignment-only permission checks on /tmp QA fixtures."""
import os,json,sqlite3
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());w=json.loads(Path('/tmp/v3316-state.json').read_text());base=os.environ['ORBIT_E2E_BASE_URL'];path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/') and base.startswith('http://127.0.0.1:');db=sqlite3.connect(path);checks=0;errors=[];project=w['project'];uid=s['people']['receiver']['id'];prior=db.execute('SELECT permissions_json FROM project_user_permissions WHERE project_id=? AND user_id=?',(project,uid)).fetchone()[0]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def open_page(who):
  c=b.new_context(viewport={'width':1500,'height':950});n,v=(s['adminCookie'] if who=='admin' else s['people'][who]['cookie']).split('=',1);c.add_cookies([{'name':n,'value':v,'url':base}]);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='networkidle');page.locator('#project-tab-'+str(project)).click();page.get_by_role('dialog').get_by_role('button',name='确认继续',exact=True).click();expect(page.locator('[aria-label="项目二级导航"]')).to_be_visible();return page
 page=open_page('admin');nav=page.locator('[aria-label="项目二级导航"]')
 for label in ['项目工作台','线索库','母版库','产品管理']:
  nav.get_by_role('button',name=label,exact=False).click();expect(page.locator('.scoped-task-root')).to_be_visible();expect(page.locator('.scoped-board-toggle,.scoped-people-board')).to_have_count(0);expect(page.get_by_role('button',name='人员看板',exact=True)).to_have_count(0);checks+=3
 db.execute('UPDATE project_user_permissions SET permissions_json=? WHERE project_id=? AND user_id=?',(json.dumps(['cross.assign']),project,uid));db.commit()
 try:
  employee=open_page('receiver');employee.locator('[aria-label="项目二级导航"]').get_by_role('button',name='产品管理',exact=False).click();employee.get_by_role('tab',name='全部',exact=True).click();employee.locator('tr[data-record-id="'+str(w['main'])+'"] .scoped-record-main strong').click();employee.locator('.cross-detail-tabs').first.get_by_role('tab',name='子包',exact=False).click();button=employee.get_by_role('button',name='发布子包任务',exact=True);expect(button).to_be_visible();button.click();dialog=employee.get_by_role('dialog',name='发布子包任务',exact=True);expect(dialog.get_by_label('任务业务分类')).to_be_visible();expect(dialog.get_by_label('分配任务负责人')).to_be_visible();checks+=3;dialog.get_by_role('button',name='取消',exact=True).click();expect(dialog).to_have_count(0);checks+=1
 finally:db.execute('UPDATE project_user_permissions SET permissions_json=? WHERE project_id=? AND user_id=?',(prior,project,uid));db.commit()
 assert not errors,errors;checks+=1;b.close();db.close();print(json.dumps({'checks':checks,'pageErrors':errors}))
