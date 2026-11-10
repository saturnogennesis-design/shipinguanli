import os,json,time,sqlite3,struct,zlib
from pathlib import Path
from playwright.sync_api import sync_playwright
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];project=s['cross'];checks=0;path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/');db=sqlite3.connect(path)
for who,rights in [('owner',['cross.create','cross.edit','cross.board','cross.publish','cross.unpublish']),('reviewer',['cross.create','cross.edit','cross.board','cross.review'])]:db.execute('UPDATE project_user_permissions SET permissions_json=?,scope_version=2 WHERE project_id=? AND user_id=?',(json.dumps(rights),project,s['people'][who]['id']))
db.execute('DELETE FROM project_leaders WHERE project_id=? AND user_id=?',(project,s['people']['reviewer']['id']));db.commit()
def png():
 def ck(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+ck(b'IHDR',struct.pack('>IIBBBBB',16,16,8,2,0,0,0))+ck(b'IDAT',zlib.compress((b'\0'+b'\x44\x88\xcc'*16)*16))+ck(b'IEND',b'')
with sync_playwright() as p:
 c=p.request.new_context()
 def api(url,b=None,method=None,who='admin',status=200,proj=project):
  global checks
  cookie=s['adminCookie'] if who=='admin' else s['people'][who]['cookie'];r=c.fetch(base+url,method=method or ('POST' if b is not None else 'GET'),headers={'cookie':cookie,'x-orbit-project-id':str(proj)},data=b);assert r.status==status,(url,r.status,r.text());checks+=1;return r.json()
 def detail(id,who='admin'):return api('/api/cross-records?id='+str(id)+'&background=1',who=who)
 def change(id,action,data={},who='admin',status=200):return api('/api/cross-records/'+str(id),{'action':action,'revision':detail(id,who)['row']['revision'],**data},'PATCH',who,status)
 def tasks(who='admin'):return api('/api/cross-records/tasks',who=who)['items']
 def task(stage,source,who='admin'):return next(t for t in tasks(who) if t['stage']==stage and t['source_id']==source)
 def start(t,who='owner'):return api('/api/cross-records/tasks',{'action':'start','id':t['id'],'revision':t['revision']},who=who)['id']
 def upload(id,who='owner',pdf=False):
  cookie=s['people'][who]['cookie'];r=c.post(base+'/api/cross-records/'+str(id)+'/files',headers={'cookie':cookie,'x-orbit-project-id':str(project)},multipart={'file':{'name':'test.pdf' if pdf else 'test.png','mimeType':'application/pdf' if pdf else 'image/png','buffer':b'%PDF-1.4\nexample' if pdf else png()}});assert r.status==201,r.text()
 catalog=api('/api/cross-records');assert catalog['taskWorkspace'];checks+=1;cat=catalog['categories'][0]['id'];prefix='左右联动验收'+str(time.time_ns())
 clue=api('/api/cross-records',{'kind':'clue','title':prefix+'线索','assigneeId':s['people']['owner']['id']},status=201)['id'];change(clue,'save',{'data':{'keywords':'来源任务'}});change(clue,'submit');change(clue,'urgency',{'urgency':2})
 t=task('mother',clue,'owner');assert t['result_id'] is None and t['assignee_id']==s['people']['owner']['id'];checks+=1
 mother=start(t);assert start(t)==mother;change(mother,'save',{'productCategoryId':cat},who='owner');upload(mother);change(mother,'submit',who='owner');assert task('mother',clue,'owner')['status']=='pending';assert detail(clue)['row']['urgency']==0;checks+=2
 change(mother,'reject',{'reason':'修改母版细节'});assert task('mother',clue,'owner')['status']=='rejected';assert detail(clue)['row']['urgency']==2;checks+=2
 change(mother,'submit',who='owner');change(mother,'approve');t=task('product',mother,'owner');assert t['result_id'] is None;checks+=1
 main=start(t);assert start(t)==main;change(main,'save',{'data':{'productTitle':'已继承产品标题','description':'产品描述','tags':'标签'}},who='owner');upload(main);change(main,'submit',who='owner');change(main,'approve')
 api('/api/cross-records',{'kind':'package','title':'重复主包','parentId':mother,'packageType':'main'},status=400)
 def newchild(key,typ='document',who='admin'):
  return api('/api/cross-records/tasks',{'action':'create','ids':[main],'type':typ,'priority':2,'assignee':s['people']['reviewer']['id'],'requestKey':key},who=who,status=201)['ids'][0]
 one=newchild(prefix+'-1');assert newchild(prefix+'-1')==one;two=newchild(prefix+'-2');assert one!=two;checks+=2
 api('/api/cross-records/tasks',{'action':'create','ids':[main],'type':'main','priority':0,'assignee':s['people']['owner']['id'],'requestKey':prefix+'-bad'},status=409)
 api('/api/cross-records/tasks',{'action':'create','ids':[main],'type':'document','priority':0,'assignee':s['people']['owner']['id'],'requestKey':prefix+'-deny'},who='owner',status=409)
 change(main,'publish',status=409)
 childtask=next(t for t in tasks('reviewer') if t['id']==one);assert childtask['canStart'];checks+=1
 child=start(childtask,'reviewer');assert json.loads(detail(child,'reviewer')['row']['body_json'])['productTitle']=='已继承产品标题';checks+=1
 upload(child,'reviewer',True);change(child,'submit',who='reviewer');change(child,'approve');assert next(t for t in tasks('reviewer') if t['id']==one)['status']=='approved';checks+=1
 unstarted=next(t for t in tasks() if t['id']==two);api('/api/cross-records/tasks',{'action':'cancel','id':two,'revision':unstarted['revision'],'reason':''},status=409);api('/api/cross-records/tasks',{'action':'cancel','id':two,'revision':unstarted['revision'],'reason':'不再需要'});assert next(t for t in tasks() if t['id']==two)['status']=='cancelled';checks+=1
 change(main,'publish');change(main,'unpublish',{'reason':'继续验收'});three=newchild(prefix+'-3','video')
 third=next(t for t in tasks('reviewer') if t['id']==three);api('/api/cross-records/tasks',{'action':'read','id':three,'revision':third['revision']},who='reviewer');assert not next(t for t in tasks('reviewer') if t['id']==three)['unread'];checks+=1
 # No task API and no one-mother restriction in an unenabled cross-border project.
 other=api('/api/projects',{'name':prefix+'其他跨境','projectType':'cross_border'},status=201)['id'];assert not api('/api/cross-records',proj=other)['taskWorkspace'];checks+=1;api('/api/cross-records/tasks',proj=other,status=409)
 admin=api('/api/auth/me')['user']['id'];cur=db.execute("INSERT INTO cross_records(project_id,kind,title,creator_id,maker_id,status,version_number) VALUES(?,'mother','其他项目母版',?,?,'approved',1)",(other,admin,admin));otherMother=cur.lastrowid;db.commit()
 for i in range(2):api('/api/cross-records',{'kind':'package','title':'其他项目产品'+str(i),'parentId':otherMother,'packageType':'main'},proj=other,status=201)
 api('/api/projects/'+str(other)+'/task-workspace',{'enabled':True},'PUT',who='owner',status=403)
 # A new approved mother stays a source task without an empty product record.
 waitingClue=api('/api/cross-records',{'kind':'clue','title':prefix+'待制作线索','assigneeId':s['people']['owner']['id']},status=201)['id'];change(waitingClue,'save',{'data':{'keywords':'待制作'}});change(waitingClue,'submit');change(waitingClue,'urgency',{'urgency':1});
 waitingMother=api('/api/cross-records',{'kind':'mother','parentId':waitingClue,'title':prefix+'待制作产品母版'},status=201)['id'];change(waitingMother,'save',{'productCategoryId':cat});None
 # Use task start for the owner to avoid confusing uploaded and assigned makers.
 t=task('mother',waitingClue);assert t['result_id']==waitingMother;change(waitingMother,'assign',{'assigneeId':s['people']['owner']['id']});upload(waitingMother,'owner');change(waitingMother,'submit',who='owner');change(waitingMother,'approve')
 public=api('/api/cross-records',{'kind':'clue','title':prefix+'公开线索','assigneeId':None},status=201)['id'];change(public,'save',{'data':{'keywords':'公开'}});change(public,'submit');change(public,'urgency',{'urgency':2});tasks()
 state={'prefix':prefix,'clue':clue,'mother':mother,'main':main,'child':child,'childTask':three,'waitingMother':waitingMother,'public':public,'other':other,'project':project};Path('/tmp/v331-state.json').write_text(json.dumps(state));print(json.dumps({'checks':checks,'stateFile':'/tmp/v331-state.json'}))
