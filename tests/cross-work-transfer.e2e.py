import os,json,time,sqlite3,struct,zlib
from pathlib import Path
from playwright.sync_api import sync_playwright
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];project=s['cross'];checks=0
path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/')
db=sqlite3.connect(path)
for who,keys in [('owner',['cross.create','cross.edit','cross.publish','cross.unpublish','cross.board','transfer.upload','transfer.download','transfer.archive','transfer.delete']),('reviewer',['cross.view','cross.review','transfer.view'])]:
 db.execute('UPDATE project_user_permissions SET permissions_json=?,scope_version=2 WHERE project_id=? AND user_id=?',(json.dumps(keys),project,s['people'][who]['id']))
db.commit()
def png():
 def ck(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+ck(b'IHDR',struct.pack('>IIBBBBB',16,16,8,2,0,0,0))+ck(b'IDAT',zlib.compress((b'\0'+b'\x44\x88\xcc'*16)*16))+ck(b'IEND',b'')
with sync_playwright() as p:
 c=p.request.new_context()
 def api(path,body=None,method=None,who='admin',status=200,raw=None,extra=None):
  global checks
  cookie=s['adminCookie'] if who=='admin' else s['people'][who]['cookie'];headers={'cookie':cookie,'x-orbit-project-id':str(project),**(extra or {})}
  r=c.fetch(base+path,method=method or ('POST' if body is not None else 'GET'),headers=headers,data=raw if raw is not None else body);assert r.status==status,(path,r.status,r.text());checks+=1;return r
 def d(id,who='admin'):return api('/api/cross-records?id='+str(id)+'&background=1',who=who).json()
 def change(id,action,body={},who='admin',status=200):return api('/api/cross-records/'+str(id),{'action':action,'revision':d(id,who)['row']['revision'],**body},'PATCH',who,status).json()
 def create(kind,title,parent=None,main=None):return api('/api/cross-records',{'kind':kind,'title':title,'parentId':parent,'mainId':main,'packageType':'document' if main else 'main'},status=201).json()['id']
 def upload(id,name='a.png',mime='image/png',data=None):
  r=c.post(base+'/api/cross-records/'+str(id)+'/files',headers={'cookie':s['adminCookie'],'x-orbit-project-id':str(project)},multipart={'file':{'name':name,'mimeType':mime,'buffer':data or png()}});assert r.status==201,r.text()
 prefix='工作流验收'+str(time.time_ns());catalog=api('/api/cross-records').json();cat=catalog['categories'][0]['id']
 clue=create('clue',prefix+'线索');change(clue,'save',{'data':{'keywords':'制作'}});change(clue,'assign',{'assigneeId':s['people']['owner']['id']});change(clue,'submit');change(clue,'urgency',{'urgency':2})
 assert d(clue,'owner')['row']['actionable'];checks+=1
 mother=create('mother',prefix+'母版',clue);change(mother,'save',{'productCategoryId':cat});upload(mother);change(mother,'assign',{'assigneeId':s['people']['owner']['id']});assert d(mother,'owner')['row']['creator_id']!=d(mother,'owner')['row']['maker_id'];checks+=1
 change(mother,'submit',who='owner');assert d(clue)['row']['urgency']==0;change(mother,'reject',{'reason':'测试修改'});assert d(clue)['row']['urgency']==2;change(mother,'submit',who='owner');change(mother,'approve');change(mother,'urgency',{'urgency':2})
 main=create('package',prefix+'产品包',mother);change(main,'save',{'data':{'productTitle':'产品标题','description':'产品描述','tags':'标签'}});upload(main);change(main,'submit');change(main,'approve')
 assert d(mother)['row']['urgency']==0;checks+=1
 child=create('package',prefix+'文档',mother,main);assert json.loads(d(child)['row']['body_json'])['productTitle']=='产品标题';checks+=1
 upload(child,'test.pdf','application/pdf',b'%PDF-1.4\nexample');change(child,'submit');change(main,'publish',status=409);change(child,'approve');change(child,'publish',status=409)
 change(main,'publish',{'requestKey':prefix});assert d(main)['row']['isPublished'];change(main,'unpublish',status=409);change(main,'unpublish',{'reason':'验收取消'});assert not d(main)['row']['isPublished'];checks+=2
 # Only download does not publish. A completed combination download publishes once.
 intent=api('/api/cross-records/'+str(main)+'/delivery',{'group':True,'publish':False}).json();r=api(intent['url']);assert r.body()[:2]==b'PK';assert not d(main)['row']['isPublished'];checks+=1
 api(intent['url'],status=409)
 intent=api('/api/cross-records/'+str(main)+'/delivery',{'group':True,'publish':True}).json();r=api(intent['url']);assert r.body()[:2]==b'PK';assert d(main)['row']['isPublished'];checks+=1
 assert db.execute("SELECT count(*) FROM cross_events WHERE record_id=? AND action='download_complete'",(main,)).fetchone()[0]>=2
 # View-only users may inspect authorized metadata, but cannot download or upload.
 pack=api('/api/transfer-packages',{'title':prefix+'临时包'},status=201).json()['id']
 api('/api/transfer-packages/'+str(pack),method='POST',raw=b'temporary',extra={'content-type':'application/octet-stream','x-orbit-file-name':'test.txt','x-orbit-file-size':'9'},status=201)
 api('/api/transfer-packages/'+str(pack),{'action':'archive','revision':2},'PATCH');api('/api/transfer-packages/'+str(pack),{'action':'delete','revision':3},'PATCH');api('/api/transfer-packages/'+str(pack),{'action':'restore','revision':4},'PATCH');assert next(x for x in api('/api/transfer-packages').json()['items'] if x['id']==pack)['lifecycle']=='archived';checks+=1
 api('/api/transfer-packages/'+str(pack),{'action':'unarchive','revision':5},'PATCH');r=api('/api/transfer-packages/'+str(pack));assert r.body()[:2]==b'PK';checks+=1
 api('/api/transfer-packages',{'title':'无权上传'},who='reviewer',status=403)
 own=api('/api/transfer-packages',{'title':prefix+'自己的包'},who='owner',status=201).json()['id'];api('/api/transfer-packages/'+str(own),method='POST',raw=b'test',extra={'content-type':'application/octet-stream','x-orbit-file-name':'own.txt','x-orbit-file-size':'4'},who='owner',status=201)
 assert all(x['id']!=pack for x in api('/api/transfer-packages',who='owner').json()['items']);checks+=1
 api('/api/transfer-packages/'+str(pack),who='owner',status=404)
 db.execute('INSERT OR IGNORE INTO project_leaders(project_id,user_id) VALUES(?,?)',(project,s['people']['reviewer']['id']));db.commit()
 listed=api('/api/transfer-packages',who='reviewer').json()['items'];file=next(x for x in listed if x['id']==pack)['files'][0];api('/api/transfer-files/'+str(file['id']),who='reviewer',status=403)
 api('/api/transfer-packages/'+str(pack),who='reviewer',status=403)
 state={'prefix':prefix,'clue':clue,'mother':mother,'main':main,'child':child,'pack':pack};Path('/tmp/v330-work-state.json').write_text(json.dumps(state));print(json.dumps({'checks':checks,'stateFile':'/tmp/v330-work-state.json'}))
