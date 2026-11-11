"""Scoped production regression, temporary database and test sessions only."""
import os,json,time,sqlite3,io,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ['ORBIT_E2E_BASE_URL'];s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());w=json.loads(Path('/tmp/v331-state.json').read_text());path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/');project=w['project'];checks=0;errors=[];out=Path('/tmp/v3313-screenshots');out.mkdir(exist_ok=True)
def docx():
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>文档大屏审核预览测试</w:t></w:r></w:p></w:body></w:document>')
 return b.getvalue()
def pdf():
 stream=b'BT /F1 20 Tf 50 750 Td (QA document preview) Tj ET';objs=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream'];b=b'%PDF-1.4\n';offsets=[0]
 for i,obj in enumerate(objs,1):offsets.append(len(b));b+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
 x=len(b);b+=b'xref\n0 6\n0000000000 65535 f \n'+b''.join(('%010d 00000 n \n'%i).encode() for i in offsets[1:])+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(x).encode()+b'\n%%EOF';return b
with sync_playwright() as p:
 a=p.request.new_context()
 def cookie(who):return s['adminCookie'] if who=='admin' else s['people'][who]['cookie']
 def headers(who='admin'):return {'cookie':cookie(who),'x-orbit-project-id':str(project)}
 def api(url,body=None,who='admin',status=200,method=None):
  global checks
  r=a.fetch(base+url,headers=headers(who),method=method or ('POST' if body is not None else 'GET'),data=body);assert r.status==status,(url,r.status,r.text());checks+=1;return r.json()
 def detail(id,who='admin'):return api('/api/cross-records?id='+str(id)+'&background=1',who=who)
 def change(id,action,body={},who='admin',status=200):return api('/api/cross-records/'+str(id),{'action':action,'revision':detail(id,who)['row']['revision'],**body},who,status,'PATCH')
 # Finish only the old synthetic source's unstarted tasks, so publication assertions are deterministic.
 for t in api('/api/cross-records/tasks')['items']:
  if t['stage']=='child' and t['source_id']==w['main'] and not t['result_id'] and t['status']=='todo':api('/api/cross-records/tasks',{'action':'cancel','id':t['id'],'revision':t['revision'],'reason':'完成旧测试准备'})
 change(w['main'],'publish',{'requestKey':'before-doc-'+str(time.time_ns())});assert detail(w['main'])['row']['isPublished'];checks+=1
 task=api('/api/cross-records/tasks',{'action':'create','ids':[w['main']],'type':'document','assignee':s['people']['owner']['id'],'priority':2,'requestKey':'document-'+str(time.time_ns())},status=201)['ids'][0];t=next(t for t in api('/api/cross-records/tasks',who='owner')['items'] if t['id']==task)
 main=detail(w['main'])['row'];assert not main['isPublished'] and main['downloadBlockReason'];checks+=2;api('/api/cross-records/'+str(w['main'])+'/delivery',{'group':True},status=409)
 child=api('/api/cross-records/tasks',{'action':'start','id':task,'revision':t['revision']},who='owner')['id'];files=[]
 for name,mime,content in [('审核资料.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',docx()),('产品说明.pdf','application/pdf',pdf())]:
  r=a.post(base+'/api/cross-records/'+str(child)+'/files',headers=headers('owner'),multipart={'file':{'name':name,'mimeType':mime,'buffer':content}});assert r.status==201,r.text();files.append(r.json()['id']);checks+=1
 for body in [{'group':True},{'group':False},{'group':True,'publish':True}]:api('/api/cross-records/'+str(w['main'])+'/delivery',body,status=409)
 api('/api/cross-records/'+str(w['main'])+'/delivery?group=1',status=409);api('/api/cross-records/'+str(child)+'/delivery',{},status=409)
 api('/api/business-batch',{'action':'download','mode':'download','kind':'cross','items':[{'key':w['main']}]},status=409)
 for query in ['?download=1','?download=1&preview=1']:
  r=a.get(base+'/api/cross-records/files/'+str(files[0])+query,headers=headers('owner'));assert r.status==409,r.text();checks+=1
 change(w['main'],'publish',status=409)
 db=sqlite3.connect(path);db.execute('INSERT OR IGNORE INTO project_leaders(project_id,user_id) VALUES(?,?)',(project,s['people']['reviewer']['id']));db.commit()
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def page_for(who='admin'):
  c=b.new_context(viewport={'width':1600,'height':960});n,v=cookie(who).split('=',1);c.add_cookies([{'name':n,'value':v,'url':base}]);page=c.new_page();page.on('dialog',lambda d:d.accept());page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='networkidle');page.locator('#project-tab-'+str(project)).click();expect(page.locator('.scoped-dashboard')).to_be_visible();return page
 page=page_for();expect(page.locator('.scoped-dashboard .task-panel-scroll article')).to_have_count(0);expect(page.locator('.scoped-dashboard .task-quick-item')).not_to_have_count(0);checks+=2;page.get_by_role('button',name='人员看板',exact=True).click();board=page.get_by_role('region',name='人员悬浮看板');expect(board).to_be_visible();board.locator('summary').click();board.get_by_role('button',name='清空',exact=True).click();board.get_by_label('owner配置验收',exact=True).check();board.locator('summary').click();expect(board.locator('.board-person-cards article')).to_have_count(1);board.locator('.board-owner-name').click();filters=page.locator('.scoped-dashboard').get_by_label('任务负责人筛选');assert filters.count()==2
 for f in filters.all():expect(f).to_have_value(str(s['people']['owner']['id']))
 checks+=4;page.screenshot(path=str(out/'workbench-board.png'));board.get_by_role('button',name='收起看板',exact=True).click();page.get_by_role('button',name='人员看板',exact=True).click();expect(board).to_be_visible();board.get_by_role('button',name='收起看板',exact=True).click();checks+=1
 nav=page.get_by_role('navigation',name='项目二级导航');nav.get_by_role('button',name='产品管理').click();row=page.locator('[data-record-id="'+str(w['main'])+'"]');menu=row.locator('.scoped-row-menu');expect(row.get_by_role('button',name='上传子包',exact=True)).to_have_count(0);expect(row.get_by_role('button',name='新建子包任务',exact=True)).to_have_count(0);checks+=2;menu.locator('summary').click();expect(menu.get_by_role('button',name='上传子包',exact=True)).to_be_visible();expect(menu.get_by_role('button',name='新建子包任务',exact=True)).to_be_visible();page.locator('.scoped-flow-heading h3').click();expand=row.locator('.scoped-expand-children');expect(expand).to_have_attribute('aria-expanded','false');expect(expand).to_contain_text('⌄');expand.click();expect(expand).to_have_attribute('aria-expanded','true');expect(expand).to_contain_text('⌃');checks+=6;page.screenshot(path=str(out/'product-list.png'))
 docrow=page.locator('[data-record-id="'+str(child)+'"]');docrow.get_by_role('button',name='预览封面：'+detail(child)['row']['title'],exact=True).click();expect(page.locator('.wide-document-dialog').get_by_text('文档大屏审核预览测试',exact=True)).to_be_visible();page.locator('.wide-document-dialog').get_by_role('button',name='关闭弹窗',exact=True).click();checks+=1
 change(child,'submit',who='owner');change(child,'reject',{'reason':'检查退回拦截'});api('/api/cross-records/'+str(w['main'])+'/delivery',{'group':True},status=409);change(child,'submit',who='owner')
 reviewer=page_for('reviewer');reviewer.get_by_role('navigation',name='项目二级导航').get_by_role('button',name='产品管理').click();main=reviewer.locator('[data-record-id="'+str(w['main'])+'"]');main.locator('.scoped-expand-children').click();childrow=reviewer.locator('[data-record-id="'+str(child)+'"]');childrow.get_by_role('button',name='审核',exact=True).click();expect(reviewer.locator('.cross-detail-page')).to_be_visible();reviewer.get_by_role('button',name='审核',exact=True).click();review=reviewer.get_by_role('dialog',name='产品包审核',exact=True);expect(review.locator('.cross-review-documents button')).to_have_count(2);checks+=1;review.locator('.cross-review-documents button').first.click();wide=reviewer.locator('.wide-document-dialog');expect(wide).to_be_visible();assert wide.bounding_box()['width']>1400;assert wide.bounding_box()['height']>800;expect(wide.get_by_text('文档大屏审核预览测试',exact=True)).to_be_visible();expect(wide.get_by_role('link',name='下载原件')).to_have_count(0);checks+=4;reviewer.screenshot(path=str(out/'document-review.png'));wide.get_by_role('button',name='下一个文档').click();expect(wide.locator('iframe')).to_be_visible();expect(wide.locator('header h2')).to_have_text('产品说明.pdf');checks+=2;reviewer.wait_for_timeout(3000);reviewer.screenshot(path=str(out/'pdf-preview.png'));wide.locator('header h2').click();reviewer.keyboard.press('ArrowLeft');expect(wide.get_by_text('文档大屏审核预览测试',exact=True)).to_be_visible();checks+=1
 reviewer.set_viewport_size({'width':900,'height':640});assert reviewer.evaluate('document.documentElement.scrollWidth<=innerWidth');expect(wide.get_by_role('button',name='关闭弹窗',exact=True)).to_be_in_viewport();checks+=2;reviewer.screenshot(path=str(out/'document-small.png'));wide.get_by_role('button',name='关闭弹窗',exact=True).click();expect(review).to_be_visible();checks+=1
 r=a.get(base+'/api/cross-records/files/'+str(files[0]),headers=headers('reviewer'));assert r.status==200;checks+=1;r=a.get(base+'/api/cross-records/files/'+str(files[0])+'?download=1',headers=headers('reviewer'));assert r.status==403;checks+=1;r=a.get(base+'/api/cross-records/files/'+str(files[0]),headers=headers('receiver'));assert r.status==404;checks+=1
 review.get_by_role('button',name='审核通过',exact=True).click();expect(review).not_to_be_visible();main=detail(w['main'])['row'];assert not main['isPublished'] and main['workState']=='publish' and not main['downloadBlockReason'];checks+=3
 intent=api('/api/cross-records/'+str(w['main'])+'/delivery',{'group':True});r=a.get(base+intent['url'],headers=headers());assert r.status==200 and r.body().startswith(b'PK');assert not detail(w['main'])['row']['isPublished'];checks+=2;r=a.get(base+'/api/cross-records/files/'+str(files[0])+'?download=1',headers=headers('owner'));assert r.status==200;checks+=1
 change(child,'publish',status=409);change(w['main'],'publish',{'requestKey':'after-document-'+str(task)});assert detail(w['main'])['row']['isPublished'];checks+=1
 # A page refresh must not invalidate a publication or repeat an approve event.
 before=db.execute("SELECT count(*) FROM cross_events WHERE record_id=? AND action='approve'",(child,)).fetchone()[0]
 for _ in range(3):api('/api/cross-records/tasks');assert detail(w['main'])['row']['isPublished']
 assert db.execute("SELECT count(*) FROM cross_events WHERE record_id=? AND action='approve'",(child,)).fetchone()[0]==before;checks+=1
 assert not errors,errors;checks+=1;Path('/tmp/v3313-state.json').write_text(json.dumps({'project':project,'main':w['main'],'child':child,'files':files,'task':task}));b.close();db.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False))
