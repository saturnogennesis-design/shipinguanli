import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];errors=[];checks=0
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def new():
  c=b.new_context(viewport={'width':1440,'height':900});n,v=s['adminCookie'].split('=',1);c.add_cookies([{'name':n,'value':v,'url':base}]);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));return page
 page=new();hits=[0]
 def once(route):
  hits[0]+=1
  if hits[0]==1:route.fulfill(status=200,body='')
  else:route.continue_()
 page.route('**/api/projects',once);page.goto(base,wait_until='networkidle');expect(page.locator('.project-tabs button')).not_to_have_count(0);expect(page.locator('.project-load-error')).to_have_count(0);assert hits[0]>=2;checks+=3
 page=new();fail=[True]
 page.route('**/api/projects',lambda r:r.fulfill(status=200,body='') if fail[0] else r.continue_());page.goto(base,wait_until='networkidle');error=page.locator('.project-load-error');expect(error).to_contain_text('/api/projects');expect(error).not_to_contain_text('Unexpected end');expect(page.locator('.project-topbar')).to_contain_text('admin配置验收');checks+=3;fail[0]=False;error.get_by_role('button',name='重新加载',exact=True).click();expect(page.locator('.project-tabs button')).not_to_have_count(0);expect(error).to_have_count(0);checks+=2
 page=new();fail=[True];hits=[0]
 def auth(route):
  hits[0]+=1
  if hits[0]>1 and fail[0]:route.fulfill(status=200,body='{"user":')
  else:route.continue_()
 page.route('**/api/auth/me',auth);page.goto(base,wait_until='networkidle');expect(page.locator('.project-load-error')).to_contain_text('/api/auth/me');expect(page.locator('.project-tabs button')).not_to_have_count(0);checks+=2;fail[0]=False;page.locator('.project-load-error').get_by_role('button',name='重新加载',exact=True).click();expect(page.locator('.project-load-error')).to_have_count(0);expect(page.locator('.project-topbar')).to_contain_text('admin配置验收');checks+=2
 # Automatic poll also clears a stale error without navigating away.
 page=new();fail=[True];page.route('**/api/projects',lambda r:r.fulfill(status=502,body='<html>upstream unavailable</html>') if fail[0] else r.continue_());page.goto(base,wait_until='networkidle');expect(page.locator('.project-load-error')).to_contain_text('HTTP 502');fail[0]=False;expect(page.locator('.project-load-error')).to_have_count(0,timeout=12000);expect(page.locator('.project-tabs button')).not_to_have_count(0);checks+=3
 assert not errors,errors;checks+=1;b.close();print(json.dumps({'checks':checks,'pageErrors':errors}))
