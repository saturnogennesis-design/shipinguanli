"""Cross-border revision regression. Synthetic accounts and /tmp DB/media only."""
import os,json,time,sqlite3,io,zipfile,struct,zlib
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ['ORBIT_E2E_BASE_URL'];s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/') and base.startswith('http://127.0.0.1:');db=sqlite3.connect(path);checks=0;errors=[];out=Path('/tmp/v3316-screenshots');out.mkdir(exist_ok=True)
prefix='子包流转验收'+str(time.time_ns());project=db.execute("INSERT INTO short_video_accounts(platform_id,code,name,project_type) SELECT platform_id,?,?,'cross_border' FROM short_video_accounts LIMIT 1 RETURNING id",(prefix,prefix)).fetchone()[0]
for who,rights in [('owner',['cross.create','cross.edit','cross.board','cross.publish','cross.unpublish','transfer.download','transfer.upload']),('reviewer',['cross.view','cross.review','cross.board']),('receiver',['cross.create','cross.edit','cross.board'])]:
 uid=s['people'][who]['id'];db.execute('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)',(project,uid,s['adminId']));db.execute('INSERT INTO project_user_permissions(project_id,user_id,permissions_json,updated_by,scope_version) VALUES(?,?,?,?,2)',(project,uid,json.dumps(rights),s['adminId']))
db.execute('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)',(project,s['adminId'],s['adminId']));db.execute('INSERT INTO cross_task_workspaces(project_id,enabled) VALUES(?,1)',(project,));db.execute('INSERT INTO project_leaders(project_id,user_id) VALUES(?,?)',(project,s['people']['reviewer']['id']))
cat=db.execute("INSERT INTO cross_product_categories(project_id,name) VALUES(?,'戒指') RETURNING id",(project,)).fetchone()[0]
for code,name,media,requires in [('main','产品主图','image',0),('document','文档','document',1),('video','视频','video',1)]:db.execute('INSERT INTO cross_business_types(project_id,code,name,media_type,requires_main) VALUES(?,?,?,?,?)',(project,code,name,media,requires))
db.commit()
def png():
 def ck(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+ck(b'IHDR',struct.pack('>IIBBBBB',64,64,8,2,0,0,0))+ck(b'IDAT',zlib.compress((b'\0'+b'\x89\xa8\xc9'*64)*64))+ck(b'IEND',b'')
def docx():
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>文档审核预览内容</w:t></w:r></w:p></w:body></w:document>')
 return b.getvalue()
with sync_playwright() as p:
 a=p.request.new_context()
 def headers(who='admin'):return {'cookie':s['adminCookie'] if who=='admin' else s['people'][who]['cookie'],'x-orbit-project-id':str(project)}
 def api(url,body=None,who='admin',status=200,method=None):
  global checks
  r=a.fetch(base+url,headers=headers(who),method=method or ('POST' if body is not None else 'GET'),data=body);assert r.status==status,(url,r.status,r.text());checks+=1;return r.json()
 def detail(id,who='admin'):return api('/api/cross-records?id='+str(id)+'&background=1',who=who)['row']
 def change(id,action,body={},who='admin',status=200):return api('/api/cross-records/'+str(id),{'action':action,'revision':detail(id,who)['revision'],**body},who,status,'PATCH')
 def tasks(who='admin',workspace=False):return api('/api/cross-records/tasks'+('?workspace=1' if workspace else ''),who=who)['items']
 def tget(id,who='admin'):return next(t for t in tasks(who,True) if t['id']==id)
 def start(t,who):return api('/api/cross-records/tasks',{'action':'start','id':t['id'],'revision':t['revision']},who)['id']
 def upload(id,who='owner',document=False):
  global checks
  r=a.post(base+'/api/cross-records/'+str(id)+'/files',headers=headers(who),multipart={'file':{'name':'审核资料.docx' if document else '封面.png','mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document' if document else 'image/png','buffer':docx() if document else png()}});assert r.status==201,r.text();checks+=1;return r.json()['id']
 # Start with no child tasks; main approval never invents video or document work.
 clue=api('/api/cross-records',{'kind':'clue','title':'七月星河戒指','assigneeId':s['people']['owner']['id']},status=201)['id'];change(clue,'save',{'data':{'keywords':'精工 戒指'}});upload(clue,'admin');change(clue,'submit')
 mother_task=next(t for t in tasks('owner') if t['stage']=='mother' and t['source_id']==clue);mother=start(mother_task,'owner');change(mother,'save',{'productCategoryId':cat},'owner');upload(mother);change(mother,'submit',who='owner');change(mother,'approve')
 main_task=next(t for t in tasks('owner') if t['stage']=='product' and t['source_id']==mother);main=start(main_task,'owner');change(main,'save',{'data':{'productTitle':'七月星河戒指','description':'产品资料正文','tags':'银饰'}},'owner');upload(main);change(main,'submit',who='owner');change(main,'approve')
 assert not [t for t in tasks('admin',True) if t['stage']=='child'];assert detail(main)['workState']=='children_unassigned';checks+=2
 api('/api/cross-records/'+str(main)+'/delivery',{'group':True},status=409);change(main,'publish',status=409)
 api('/api/cross-records',{'kind':'package','parentId':mother,'mainId':main,'packageType':'video'},status=400)
 def create(typ,owner,key,status=201):return api('/api/cross-records/tasks',{'action':'create','ids':[main],'type':typ,'assignee':s['people'][owner]['id'],'priority':2 if typ=='document' else 1,'requestKey':key},status=status)
 doc_task=create('document','owner','doc')['ids'][0];assert create('document','owner','doc')['ids']==[doc_task];checks+=1;create('document','owner','doc-duplicate',409);video_task=create('video','receiver','video')['ids'][0]
 assert detail(main)['workState']=='children_making';assert len(tasks('admin',True))>len(tasks('admin'));assert len(tasks('reviewer',True))==0;assert all(t['assignee_id']==s['people']['owner']['id'] for t in tasks('owner',True));checks+=4
 # Publication does not permit the task assigner to start another person's work.
 api('/api/cross-records/tasks',{'action':'start','id':doc_task,'revision':tget(doc_task)['revision']},status=409)
 doc=start(tget(doc_task),'owner');file=upload(doc,document=True);change(doc,'save',{'data':{}},'owner');change(doc,'submit',who='owner');tasks('owner');assert detail(main)['workState']=='children_review';checks+=1
 # Every package pending audit is present in records, reviewer has no other person's task list.
 assert any(r['id']==doc and r['status']=='pending' for r in api('/api/cross-records',who='reviewer')['items']);checks+=1
 change(doc,'reject',{'reason':'调整文档内容'},'reviewer');td=tget(doc_task);assert td['status']=='todo' and td['canCancel'];assert detail(main)['workState']=='children_rejected';checks+=2
 # Keep this task for final document approval; a separate rejected video will test cancellation later.
 change(doc,'submit',who='owner');change(doc,'approve',who='reviewer');tasks('owner');assert detail(main)['workState']=='publish';assert any(t['mediaType']=='document' for t in detail(main)['approvedChildTypes']);checks+=2
 change(main,'publish',who='owner');assert detail(main)['isPublished'];checks+=1
 # Video starts and is reviewed after product publication, without invalidating publication.
 video=start(tget(video_task),'receiver');db.execute("INSERT INTO cross_files(record_id,storage_path,file_name,mime_type,file_size,uploader_id) VALUES(?,?,'video.mp4','video/mp4',4,?)",(video,'qa3316/video-'+str(video)+'.mp4',s['people']['receiver']['id']));media=Path(os.environ['ORBIT_QA_MEDIA_DIR'])/'qa3316';media.mkdir(parents=True,exist_ok=True);(media/('video-'+str(video)+'.mp4')).write_bytes(b'test');db.commit();change(video,'save',{'inheritProduct':True,'data':{}},'receiver');change(video,'submit',who='receiver');assert detail(main)['isPublished'];checks+=1;change(video,'approve',who='reviewer');assert detail(main)['isPublished'];assert {t['mediaType'] for t in detail(main)['approvedChildTypes']}=={'document','video'};checks+=2
 # Downloads still stream authorized originals and record the actual downloader.
 d=api('/api/cross-records/'+str(main)+'/delivery',{'group':True},'admin');r=a.get(base+d['url'],headers=headers());assert r.status==200;r.body();assert db.execute("SELECT 1 FROM cross_events WHERE record_id=? AND action='download_complete'",(main,)).fetchone();checks+=2
 # New same-type work is permitted only after the previous task completed; cancel a rejected result.
 cancel_task=create('video','receiver','video-second')['ids'][0];newvideo=start(tget(cancel_task),'receiver');current=tget(cancel_task);api('/api/cross-records/tasks',{'action':'cancel','id':cancel_task,'revision':current['revision'],'reason':'不制作'},status=409)
 db.execute("INSERT INTO cross_files(record_id,storage_path,file_name,mime_type,file_size,uploader_id) VALUES(?,?,'video.mp4','video/mp4',4,?)",(newvideo,'qa3316/video-'+str(video)+'.mp4#copy-'+str(newvideo),s['people']['receiver']['id']));db.commit();change(newvideo,'save',{'inheritProduct':True,'data':{}},'receiver');change(newvideo,'submit',who='receiver');change(newvideo,'reject',{'reason':'不再制作'},'reviewer');current=tget(cancel_task);assert current['status']=='todo';checks+=1
 api('/api/cross-records/tasks',{'action':'cancel','id':cancel_task,'revision':current['revision'],'reason':'取消本次补充'},status=200);assert not any(t['id']==cancel_task for t in tasks('admin',True));assert detail(newvideo)['status']=='rejected';change(newvideo,'submit',who='receiver',status=409);assert detail(main)['isPublished'];checks+=3
 # Project-scoped transfer capability exists without adding transfer to public permissions.
 projects=api('/api/projects',who='owner')['projects'];assert next(r for r in projects if r['id']==project)['capabilities']['transfer'];api('/api/transfer-packages',who='owner');checks+=1
 # Prepare actionable work for UI review, without copying product information.
 inline_task=create('document','owner','inline-doc')['ids'][0];inline_doc=start(tget(inline_task),'owner');upload(inline_doc,document=True);change(inline_doc,'save',{'data':{}},'owner');change(inline_doc,'submit',who='owner');extra_video_task=create('video','receiver','ui-cancel')['ids'][0]
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def page_for(who,width=1500,height=960):
  c=browser.new_context(viewport={'width':width,'height':height},accept_downloads=True);n,v=(s['adminCookie'] if who=='admin' else s['people'][who]['cookie']).split('=',1);c.add_cookies([{'name':n,'value':v,'url':base}]);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='networkidle');
  if width<=760:page.get_by_role('button',name='展开导航',exact=True).click()
  page.locator('#project-tab-'+str(project)).click();page.get_by_role('dialog').get_by_role('button',name='确认继续',exact=True).click();expect(page.locator('.task-stage-tabs')).to_be_visible();return page
 page=page_for('admin');page.get_by_role('tab',name='产品与子包').click();expect(page.locator('.task-workbench-list:visible .task-navigation-table')).to_be_visible();expect(page.locator('.task-workbench-list:visible').get_by_label('任务负责人筛选')).to_be_visible();page.screenshot(path=str(out/'admin-workbench.png'));checks+=2
 # Product list, tags, expand rows, exact audit navigation and compact confirmation alignment.
 nav=page.locator('[aria-label="项目二级导航"]');nav.get_by_role('button',name='产品管理').click();page.get_by_role('tab',name='待审核',exact=True).click();audit_row=page.locator('tr[data-record-id="'+str(inline_doc)+'"]');expect(audit_row).to_contain_text('文档');checks+=1;page.get_by_role('tab',name='全部',exact=True).click();row=page.locator('tr[data-record-id="'+str(main)+'"]');expect(row).to_contain_text('已发布');expect(row.locator('.approved-child-tag.media-document')).to_contain_text('文档');expect(row.locator('.approved-child-tag.media-video')).to_contain_text('视频');row.get_by_role('button',name='子包').click();expect(page.locator('.child-task-entry')).not_to_have_count(0);page.screenshot(path=str(out/'product-child-list.png'));checks+=4
 row.locator('summary').click();row.get_by_role('button',name='下载产品包',exact=True).click();dialog=page.get_by_role('dialog',name='确认下载',exact=True);expect(dialog).to_be_visible();assert dialog.evaluate("e=>getComputedStyle(e).textAlign")=='left';assert dialog.locator('.dialog-body').evaluate("e=>getComputedStyle(e).textAlign")=='left';assert dialog.evaluate('e=>e.getBoundingClientRect().width')<=570;checks+=3;page.screenshot(path=str(out/'download-confirm.png'));dialog.get_by_role('button',name='取消',exact=True).click();expect(dialog).to_have_count(0)
 # Parent child tab shows and operates the full child content in place, without navigation.
 row.locator('.scoped-record-main strong').click();expect(page.locator('.scoped-editor-frame>.cross-editor')).to_be_visible();parent_title=page.locator('.scoped-editor-frame>.cross-editor>.cross-page-heading h2').inner_text();page.locator('.cross-detail-tabs').first.get_by_role('tab',name='子包',exact=False).click();expect(page.locator('.inline-child-panel')).to_have_count(4);expect(page.locator('.inline-child-panel').first.locator('.cross-detail-file-grid')).to_be_visible();expect(page.get_by_role('tab',name='产品资料',exact=True)).to_have_count(0);checks+=3
 page.locator('.cross-detail-tabs').first.get_by_role('tab',name='资料与备注',exact=True).click();expect(page.locator('.scoped-editor-frame>.cross-editor>.cross-page-heading h2')).to_have_text(parent_title);page.locator('.cross-detail-tabs').first.get_by_role('tab',name='子包',exact=False).click();expect(page.locator('.inline-child-panel')).to_have_count(4);expect(page.locator('.inline-child-panel .cross-detail-page')).to_have_count(4);page.screenshot(path=str(out/'inline-subpackages.png'));checks+=2
 # Preview a document and approve it inside the parent child tab; no extra detail navigation.
 child_panel=page.locator('.inline-child-panel[data-child-id="'+str(inline_doc)+'"]');child_panel.get_by_role('button',name='审核',exact=True).click();review=page.get_by_role('dialog',name='产品包审核',exact=True);expect(review).to_be_visible();review.locator('.cross-review-documents button').first.click();expect(page.locator('.wide-document-dialog')).to_be_visible();expect(page.locator('.wide-document-dialog')).to_contain_text('文档审核预览内容');page.locator('.wide-document-dialog').get_by_role('button',name='关闭弹窗',exact=True).click();review.get_by_role('button',name='审核通过',exact=True).click();expect(review).to_have_count(0);expect(page.locator('.scoped-editor-frame>.cross-editor>.cross-page-heading h2')).to_have_text(parent_title);expect(page.locator('.inline-child-panel')).to_have_count(4);assert detail(inline_doc)['status']=='approved';checks+=6
 # A pending main and a pending child share an audit queue, with their actual type displayed.
 nav.get_by_role('button',name='项目工作台',exact=True).click();page.get_by_role('tab',name='产品与子包',exact=False).click();taskrow=page.locator('tr[data-task-id="'+str(extra_video_task)+'"]');taskrow.locator('summary').click();taskrow.get_by_role('button',name='取消任务',exact=True).click();cancel_dialog=page.get_by_role('dialog',name='取消子包任务',exact=True);cancel_dialog.get_by_label('取消任务原因').fill('不需要补充视频');cancel_dialog.get_by_role('button',name='确认取消任务',exact=True).click();expect(cancel_dialog).to_have_count(0);expect(taskrow).to_have_count(0);checks+=2
 # Reviewer/leader may see review records, never other people's task selectors or board cards.
 leader=page_for('reviewer');expect(leader.locator('[aria-label="任务负责人筛选"]')).to_have_count(0);expect(leader.locator('.task-navigation-table tbody tr:visible')).to_have_count(0);checks+=2
 ownerpage=page_for('owner');expect(ownerpage.locator('[aria-label="任务负责人筛选"]')).to_have_count(0);expect(ownerpage.locator('[aria-label="项目二级导航"]').get_by_role('button',name='中转站',exact=True)).to_be_visible();ownerpage.locator('[aria-label="项目二级导航"]').get_by_role('button',name='中转站',exact=True).click();expect(ownerpage.locator('.transfer-station')).to_be_visible();checks+=3
 # Small screen: confirmation header/footer stay reachable and centered within viewport.
 mobile=page_for('admin',600,760);mobile.get_by_role('button',name='收起导航').click() if mobile.get_by_role('button',name='收起导航').count() else None
 mobile.get_by_role('button',name='退出登录').focus();mobile.screenshot(path=str(out/'small-workbench.png'));assert not errors,errors;checks+=1
 Path('/tmp/v3316-state.json').write_text(json.dumps({'project':project,'main':main,'doc':doc,'video':video,'clue':clue,'mother':mother,'docTask':doc_task,'videoTask':video_task}));browser.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False));db.close()
