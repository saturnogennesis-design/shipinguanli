"""Reproduce the reported result_id conflict through permanent deletion, using /tmp QA data only."""
import os,json,time,sqlite3
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/') and base.startswith('http://127.0.0.1:');project=s['cross'];checks=0;errors=[];out=Path('/tmp/v3315-screenshots');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 a=p.request.new_context();headers={'cookie':s['adminCookie'],'x-orbit-project-id':str(project)}
 def api(url,body=None,method=None,status=200):
  global checks
  r=a.fetch(base+url,headers=headers,method=method or ('POST' if body is not None else 'GET'),data=body);assert r.status==status,(url,r.status,r.text());checks+=1;return r.json()
 def detail(id):return api('/api/cross-records?id='+str(id)+'&background=1')['row']
 def change(id,action,body={}):return api('/api/cross-records/'+str(id),{'action':action,'revision':detail(id)['revision'],**body},'PATCH')
 prefix='冲突回归'+str(time.time_ns());clue=api('/api/cross-records',{'kind':'clue','title':prefix,'assigneeId':s['people']['owner']['id']},status=201)['id'];change(clue,'save',{'data':{'keywords':'冲突回归'}});change(clue,'submit');ids=[api('/api/cross-records',{'kind':'mother','title':prefix+'母版'+str(i),'parentId':clue},status=201)['id'] for i in range(2)]
 initial=api('/api/cross-records/tasks?workspace=1')['items'];first=next(t for t in initial if t['result_id']==ids[0]);surviving=next(t for t in initial if t['result_id']==ids[1]);db=sqlite3.connect(path)
 api('/api/permanent-delete',{'kind':'cross','id':ids[0],'confirmed':True,'revision':detail(ids[0])['revision']})
 for _ in range(3):
  projects=api('/api/projects')['projects'];current=next(p for p in projects if p['id']==project);assert not current.get('badgeUnavailable');checks+=1
 tasklist=api('/api/cross-records/tasks?workspace=1')['items'];assert len([t for t in tasklist if t['result_id']==ids[1]])==1;assert not [t for t in tasklist if t['id']==first['id']];assert next(t for t in tasklist if t['id']==surviving['id'])['result_id']==ids[1];checks+=3
 assert db.execute('SELECT status FROM cross_tasks WHERE id=?',(first['id'],)).fetchone()[0]=='superseded';assert db.execute('SELECT count(*) FROM cross_records WHERE id=? OR parent_id=?',(clue,clue)).fetchone()[0]==2;checks+=2
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1500,'height':900});n,v=s['adminCookie'].split('=',1);c.add_cookies([{'name':n,'value':v,'url':base}]);page=c.new_page();page.on('dialog',lambda d:d.accept());page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='networkidle');expect(page.locator('#project-tab-'+str(project))).to_be_visible();expect(page.locator('.project-load-error')).to_have_count(0);expect(page.locator('.project-badge-warning')).to_have_count(0);checks+=3;page.screenshot(path=str(out/'projects-restored.png'))
 # A future optional badge error must not turn the whole project list into HTTP 500.
 db.execute('DROP TRIGGER IF EXISTS qa_badge_fault');db.execute(f"CREATE TRIGGER qa_badge_fault BEFORE UPDATE ON cross_tasks WHEN NEW.project_id={int(project)} BEGIN SELECT RAISE(ABORT,'QA badge fault');END;");db.execute('UPDATE cross_records SET urgency=1 WHERE id=?',(clue,));db.commit()
 try:
  result=api('/api/projects');current=next(p for p in result['projects'] if p['id']==project);assert current['badgeUnavailable'] is True and current['badge'] is None;assert 'cross' in current['capabilities'];checks+=2
  page.reload(wait_until='networkidle');expect(page.locator('.project-badge-warning')).to_be_visible();expect(page.locator('#project-tab-'+str(project))).to_be_visible();expect(page.locator('.project-load-error')).to_have_count(0);checks+=3;page.screenshot(path=str(out/'optional-badge-warning.png'))
 finally:db.execute('DROP TRIGGER IF EXISTS qa_badge_fault');db.commit()
 expect(page.locator('.project-badge-warning')).to_have_count(0,timeout=12000);expect(page.locator('#project-tab-'+str(project))).to_be_visible();checks+=2;assert not next(p for p in api('/api/projects')['projects'] if p['id']==project).get('badgeUnavailable');checks+=1
 # Removing the last result should produce one real new task, not revive every old history slot.
 api('/api/permanent-delete',{'kind':'cross','id':ids[1],'confirmed':True,'revision':detail(ids[1])['revision']});live=[t for t in api('/api/cross-records/tasks?workspace=1')['items'] if t['stage']=='mother' and t['source_id']==clue];assert len(live)==1 and live[0]['result_id'] is None and live[0]['status']=='todo';checks+=1
 assert not errors,errors;checks+=1;b.close();db.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)}))
