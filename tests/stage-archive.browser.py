"""Real API stage archive chain + browser task history; synthetic /tmp fixtures only."""
import os,json,time,sqlite3,struct,zlib,io,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/') and base.startswith('http://127.0.0.1:');project=s['project'];prefix='阶段归档'+str(time.time_ns());db=sqlite3.connect(path)
for code,media in [('main','image'),('document','document'),('video','video')]:db.execute('INSERT INTO cross_business_types(project_id,code,name,media_type) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',(project,code,{'main':'产品主图','document':'文档','video':'视频'}[code],media))
category=db.execute('INSERT INTO cross_product_categories(project_id,name) VALUES(?,?) RETURNING id',(project,prefix)).fetchone()[0];db.commit();db.close();checks=0;errors=[];out=Path('/tmp/v332-screenshots');out.mkdir(exist_ok=True)
def png():
 def ck(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+ck(b'IHDR',struct.pack('>IIBBBBB',32,32,8,2,0,0,0))+ck(b'IDAT',zlib.compress((b'\0'+b'\xa8\xc2\xdf'*32)*32))+ck(b'IEND',b'')
with sync_playwright() as p:
 api=p.request.new_context(extra_http_headers={'cookie':s['cookie'],'x-orbit-project-id':str(project)})
 def call(url,data=None,method=None,status=200):
  global checks
  r=api.fetch(base+url,method=method or ('POST' if data is not None else 'GET'),data=data);assert r.status==status,(url,r.status,r.text());checks+=1;return r.json()
 def detail(id):return call('/api/cross-records?id='+str(id))
 def act(id,action,extra=None,status=200):return call('/api/cross-records/'+str(id),{'action':action,'revision':detail(id)['row']['revision'],**(extra or {})},method='PATCH',status=status)
 def tasks():return call('/api/cross-records/tasks?workspace=1')['items']
 def start(t):return call('/api/cross-records/tasks',{'action':'start','id':t['id'],'revision':t['revision']})['id']
 def upload(id,name,mime,data):
  global checks
  r=api.post(base+'/api/cross-records/'+str(id)+'/files',multipart={'file':{'name':name,'mimeType':mime,'buffer':data}});assert r.status in (200,201),(r.status,r.text());checks+=1
 def finish(id,title,document=False):
  act(id,'save',{'title':title,'productCategoryId':category,'data':{'keywords':'归档测试'}});upload(id,'资料.pdf' if document else '图.png','application/pdf' if document else 'image/png',b'%PDF-1.4\n%%EOF' if document else png());act(id,'submit');act(id,'approve')
 clue=call('/api/cross-records',{'kind':'clue','title':prefix+'线索','assigneeId':s['adminId'],'requestKey':prefix+'-clue'},status=201)['id'];act(clue,'save',{'title':prefix+'线索','data':{'keywords':'归档,继续'}});upload(clue,'线索.png','image/png',png());act(clue,'submit');t=next(t for t in tasks() if t['source_id']==clue and t['stage']=='mother');act(clue,'archive');t=next(t for t in tasks() if t['id']==t['id'] and t['source_id']==clue);assert t['status']=='todo';checks+=1;mother=start(t);finish(mother,prefix+'母版');act(mother,'archive');product_task=next(t for t in tasks() if t['stage']=='product' and t['source_id']==mother);assert product_task['status']=='todo';main=start(product_task);finish(main,prefix+'产品');act(main,'archive',status=409);checks+=1
 doc_task_id=call('/api/cross-records/tasks',{'action':'create','ids':[main],'type':'document','assignee':s['adminId'],'priority':0,'requestKey':prefix+'-doc'},status=201)['ids'][0];doc=start(next(t for t in tasks() if t['id']==doc_task_id));finish(doc,prefix+'文档',True)
 video_task_id=call('/api/cross-records/tasks',{'action':'create','ids':[main],'type':'video','assignee':s['adminId'],'priority':1,'requestKey':prefix+'-video'},status=201)['ids'][0];act(main,'publish',{'requestKey':prefix+'-publish'});assert detail(main)['row']['isPublished'];act(doc,'archive');latest=detail(main);assert latest['row']['isPublished'] and any(t['code']=='document' for t in latest['row']['approvedChildTypes']);checks+=2;act(main,'archive');video=start(next(t for t in tasks() if t['id']==video_task_id));act(video,'save',{'title':prefix+'后续视频','data':{}});alltasks=tasks();assert all(next(t for t in alltasks if t['result_id']==id)['status']=='archived' for id in [mother,main,doc]);assert next(t for t in alltasks if t['result_id']==video)['status']=='making';checks+=2
 # Archiving completed documentation does not remove it from the published product's archive download.
 intent=call('/api/cross-records/'+str(main)+'/delivery',{'group':True,'publish':False});r=api.get(base+intent['url']);assert r.status==200,r.text();z=zipfile.ZipFile(io.BytesIO(r.body()));assert any(n.endswith('.pdf') for n in z.namelist()) and any(n.endswith('.png') for n in z.namelist());checks+=2
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1450,'height':950});n,v=s['cookie'].split('=',1);context.add_cookies([{'name':n,'value':v,'url':base}]);page=context.new_page();page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='networkidle');page.locator('#project-tab-'+str(project)).click();page.get_by_role('dialog').get_by_role('button',name='确认继续').click();select=page.locator('select[aria-label="任务状态筛选"]:visible');expect(select).to_have_value('operate');expect(page.locator('[data-task-id="'+str(next(t for t in alltasks if t['result_id']==mother)['id'])+'"]').first).to_have_count(0);select.select_option('archived');expect(page.locator('tr[data-task-id="'+str(next(t for t in alltasks if t['result_id']==mother)['id'])+'"]')).to_be_visible();page.screenshot(path=str(out/'archived-tasks.png'));checks+=3
 # The archived task opens read-only, rather than saying its source is unavailable.
 page.locator('tr[data-task-id="'+str(next(t for t in alltasks if t['result_id']==mother)['id'])+'"]').get_by_role('button').first.click();expect(page.locator('.cross-detail-page')).to_be_visible();expect(page.locator('.cross-detail-page .cross-status')).to_contain_text('已归档');checks+=2
 assert not errors,errors;browser.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False))
