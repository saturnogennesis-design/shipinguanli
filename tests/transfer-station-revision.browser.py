"""Temporary QA DB only: transfer selection/reset, project-wide reads, own-only mutations and media."""
import os,json,sqlite3,time,io,zipfile,struct,zlib
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/') and base.startswith('http://127.0.0.1:');db=sqlite3.connect(path);checks=0;errors=[];out=Path('/tmp/v3318-screenshots');out.mkdir(exist_ok=True)
prefix='中转验收'+str(time.time_ns());project=db.execute("INSERT INTO short_video_accounts(platform_id,code,name,project_type) SELECT platform_id,?,?,'cross_border' FROM short_video_accounts LIMIT 1 RETURNING id",(prefix,prefix)).fetchone()[0];other=db.execute("INSERT INTO short_video_accounts(platform_id,code,name,project_type) SELECT platform_id,?,?,'cross_border' FROM short_video_accounts LIMIT 1 RETURNING id",(prefix+'other',prefix+'other')).fetchone()[0]
for proj in [project,other]:
 for who,rights in [('owner',['transfer.upload','transfer.download','transfer.delete','transfer.archive']),('receiver',['transfer.view','transfer.download','transfer.delete','transfer.archive']),('reviewer',['transfer.view'])]:
  uid=s['people'][who]['id'];db.execute('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)',(proj,uid,s['adminId']));db.execute('INSERT INTO project_user_permissions(project_id,user_id,permissions_json,updated_by,scope_version) VALUES(?,?,?,?,2)',(proj,uid,json.dumps(rights),s['adminId']))
 db.execute('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)',(proj,s['adminId'],s['adminId']))
db.commit()
def png():
 def ck(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+ck(b'IHDR',struct.pack('>IIBBBBB',24,24,8,2,0,0,0))+ck(b'IDAT',zlib.compress((b'\0'+b'\x55\x99\xcc'*24)*24))+ck(b'IEND',b'')
def docx():
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>临时文件共享预览测试</w:t></w:r></w:p></w:body></w:document>')
 return b.getvalue()
with sync_playwright() as p:
 a=p.request.new_context()
 def headers(who='owner',proj=project):return {'cookie':s['adminCookie'] if who=='admin' else s['people'][who]['cookie'],'x-orbit-project-id':str(proj)}
 def api(url,data=None,who='owner',method=None,status=200,proj=project,extra=None):
  global checks
  r=a.fetch(base+url,headers={**headers(who,proj),**(extra or {})},data=data,method=method or ('POST' if data is not None else 'GET'));assert r.status==status,(url,r.status,r.text());checks+=1;return r
 def catalog(who='owner'):return api('/api/transfer-packages',who=who).json()['items']
 def pack(id,who='owner'):return next(p for p in catalog(who) if p['id']==id)
 pid=api('/api/transfer-packages',{'title':'临时共享资料','contentType':'document'} ,status=201).json()['id']
 def upload(name,data):return api('/api/transfer-packages/'+str(pid)+'?fileSize='+str(len(data))+'&fileName='+__import__('urllib.parse',fromlist=['quote']).quote(name),data,extra={'content-type':'application/octet-stream'},status=201).json()['id']
 image=upload('图片.png',png());text=upload('说明.txt','临时文件说明'.encode());word=upload('资料.docx',docx());video=upload('演示.mp4',Path('/tmp/transfer-preview-test.mp4').read_bytes());unsupported=upload('未知.bin',b'unknown')
 assert pack(pid,'receiver')['canDelete'] is False;assert pack(pid,'receiver')['canArchive'] is False;assert pack(pid,'reviewer')['files'];checks+=3
 for who in ['receiver','admin']:
  api('/api/transfer-packages/'+str(pid),{'action':'delete','revision':pack(pid)['revision']},who,'PATCH',403)
  api('/api/transfer-files/'+str(image),{'revision':pack(pid)['revision']},who,'DELETE',403)
 api('/api/transfer-packages/'+str(pid),b'a','receiver','POST',403,extra={'content-type':'application/octet-stream','x-orbit-file-size':'1'})
 api('/api/transfer-files/'+str(image)+'?preview=1',who='receiver',proj=other,status=404)
 api('/api/transfer-files/'+str(image),who='reviewer',status=403)
 assert api('/api/transfer-files/'+str(image)+'?preview=1',who='reviewer').headers['content-type']=='image/png';checks+=1
 before=db.execute("SELECT count(*) FROM audit_logs WHERE action='transfer.download_file'").fetchone()[0]
 assert api('/api/transfer-files/'+str(text)+'?preview=1',who='reviewer').text()=='临时文件说明';assert zipfile.ZipFile(io.BytesIO(api('/api/transfer-files/'+str(image),who='receiver').body())).read('图片.png')==png();assert db.execute("SELECT count(*) FROM audit_logs WHERE action='transfer.download_file'").fetchone()[0]==before+1;checks+=3
 r=api('/api/transfer-files/'+str(video)+'?preview=1',who='reviewer',status=206,extra={'range':'bytes=0-7'});assert len(r.body())==8 and r.headers['content-type']=='video/mp4';checks+=1
 api('/api/transfer-files/'+str(unsupported)+'?preview=1',who='reviewer',status=415)
 rev=pack(pid)['revision'];api('/api/transfer-files/'+str(text),{'revision':rev-1},method='DELETE',status=409);api('/api/transfer-files/'+str(text),{'revision':rev},method='DELETE');assert text not in [f['id'] for f in pack(pid)['files']];checks+=1
 api('/api/transfer-files/'+str(text),status=404);api('/api/transfer-files/'+str(text)+'?preview=1',status=404)
 payload=api('/api/transfer-packages/'+str(pid),'',who='receiver',method='GET').body();z=zipfile.ZipFile(io.BytesIO(payload));assert len(z.namelist())==4 and not any(n.endswith('说明.txt') for n in z.namelist());checks+=1
 api('/api/transfer-files/'+str(text),{'revision':pack(pid)['revision']},method='PATCH');assert text in [f['id'] for f in pack(pid)['files']];checks+=1
 # Preflight returns structured status and never records a completed download.
 count=db.execute("SELECT count(*) FROM audit_logs WHERE action='transfer.download'").fetchone()[0];api('/api/transfer-packages/'+str(pid)+'?check=1');assert db.execute("SELECT count(*) FROM audit_logs WHERE action='transfer.download'").fetchone()[0]==count;checks+=1
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def open_page(who):
  c=b.new_context(viewport={'width':1450,'height':950},accept_downloads=True);n,v=(s['adminCookie'] if who=='admin' else s['people'][who]['cookie']).split('=',1);c.add_cookies([{'name':n,'value':v,'url':base}]);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='networkidle');page.locator('#project-tab-'+str(project)).click();page.get_by_role('dialog').get_by_role('button',name='确认继续',exact=True).click();page.locator('[aria-label="项目二级导航"]').get_by_role('button',name='中转站',exact=True).click();expect(page.locator('.transfer-station')).to_be_visible();return page
 page=open_page('owner');page.get_by_role('button',name='上传文件包',exact=True).click();dialog=page.get_by_role('dialog',name='上传临时文件包');dialog.get_by_label('文件包名称').fill('选错测试');dialog.get_by_label('选择临时文件').set_input_files([{'name':'选错.txt','mimeType':'text/plain','buffer':b'wrong'},{'name':'保留.txt','mimeType':'text/plain','buffer':b'keep'}]);expect(dialog.locator('.transfer-selected-files li')).to_have_count(2);dialog.get_by_role('button',name='移除所选文件：选错.txt').click();expect(dialog.locator('.transfer-selected-files li')).to_have_count(1);checks+=2
 dialog.get_by_role('button',name='关闭弹窗',exact=True).click();page.get_by_role('button',name='上传文件包',exact=True).click();dialog=page.get_by_role('dialog',name='上传临时文件包');expect(dialog.get_by_label('文件包名称')).to_have_value('');expect(dialog.locator('.transfer-selected-files li')).to_have_count(0);checks+=2
 dialog.get_by_label('选择临时文件').set_input_files({'name':'可重选.txt','mimeType':'text/plain','buffer':b'reselect'});dialog.get_by_role('button',name='清空待上传').click();dialog.get_by_label('选择临时文件').set_input_files({'name':'可重选.txt','mimeType':'text/plain','buffer':b'reselect'});expect(dialog.locator('.transfer-selected-files li')).to_have_count(1);checks+=1;dialog.press('Escape');page.get_by_role('button',name='上传文件包',exact=True).click();dialog=page.get_by_role('dialog',name='上传临时文件包');expect(dialog.locator('.transfer-selected-files li')).to_have_count(0);checks+=1
 # Dragging adds files; closing by Cancel clears them as well.
 dialog.locator('.transfer-drop').evaluate("e=>{const d=new DataTransfer();d.items.add(new File(['drag'],'拖入.txt',{type:'text/plain'}));e.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:d}));}");expect(dialog.locator('.transfer-selected-files')).to_contain_text('拖入.txt');checks+=1;dialog.get_by_role('button',name='取消',exact=True).click()
 # Partially uploaded files can be removed after a later file fails; no silent repeat of successful uploads.
 page.get_by_role('button',name='上传文件包',exact=True).click();dialog=page.get_by_role('dialog',name='上传临时文件包');dialog.get_by_label('文件包名称').fill('部分失败');dialog.get_by_label('业务内容',exact=True).select_option('document');dialog.get_by_label('选择临时文件').set_input_files([{'name':'已传.txt','mimeType':'text/plain','buffer':b'first'},{'name':'失败.txt','mimeType':'text/plain','buffer':b'second'}])
 def fail_second(route):
  if 'fileName=' in route.request.url and '%E5%A4%B1%E8%B4%A5' in route.request.url:route.fulfill(status=409,content_type='application/json',body='{"error":"测试网络失败"}')
  else:route.continue_()
 page.route('**/api/transfer-packages/*',fail_second);dialog.get_by_role('button',name='确认上传',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('测试网络失败');expect(dialog.locator('.transfer-selected-files')).to_contain_text('已上传');checks+=2;dialog.get_by_role('button',name='移除所选文件：已传.txt').click();confirm=page.get_by_role('dialog',name='操作确认');confirm.get_by_role('button',name='确认继续').click();expect(dialog.locator('.transfer-selected-files li')).to_have_count(1);checks+=1;dialog.get_by_role('button',name='取消',exact=True).click();page.unroute('**/api/transfer-packages/*',fail_second)
 article=page.locator('article[data-package-id="'+str(pid)+'"]');article.get_by_text('文件明细',exact=True).click();page.screenshot(path=str(out/'transfer-files.png'))
 # Download buttons yield real browser download events with the actual payload.
 with page.expect_download() as dl:article.locator('details').first.locator('div').filter(has_text='说明.txt').get_by_role('button',name='下载',exact=True).click()
 assert zipfile.ZipFile(dl.value.path()).read('说明.txt')=='临时文件说明'.encode();assert dl.value.suggested_filename=='临时共享资料.zip';checks+=1
 with page.expect_download() as dl:article.get_by_role('button',name='整包下载',exact=True).click()
 assert zipfile.ZipFile(dl.value.path()).testzip() is None;checks+=1
 # Missing originals produce an in-page explanation, instead of an apparently inert download.
 missing=upload('缺失原件.txt',b'missing');page=open_page('owner');article=page.locator('article[data-package-id="'+str(pid)+'"]');article.get_by_text('文件明细',exact=True).click();storage=db.execute('SELECT storage_path FROM transfer_files WHERE id=?',(missing,)).fetchone()[0];original=Path(os.environ['ORBIT_QA_MEDIA_DIR'])/storage;backup=original.with_name(original.name+'.qa-backup');original.rename(backup)
 try:
  article.locator('details').first.locator('div').filter(has_text='缺失原件.txt').get_by_role('button',name='下载',exact=True).click();expect(page.locator('.transfer-station>p[role="alert"]')).to_contain_text('原文件缺失');article.get_by_role('button',name='整包下载',exact=True).click();expect(page.locator('.transfer-station>p[role="alert"]')).to_contain_text('文件缺失');checks+=2
 finally:backup.rename(original)
 # The visible own-file controls remove and restore without deleting the stored original.
 article.locator('details').first.locator('div').filter(has_text='说明.txt').get_by_role('button',name='移除',exact=True).click();page.get_by_role('dialog',name='操作确认').get_by_role('button',name='确认继续').click();expect(article.locator('details').first).not_to_contain_text('说明.txt');article.locator('.transfer-removed summary').click();article.locator('.transfer-removed').get_by_role('button',name='恢复文件').click();page.get_by_role('dialog',name='操作确认').get_by_role('button',name='确认继续').click();expect(article.locator('details').first).to_contain_text('说明.txt');checks+=2
 # View-only member sees others' files, can preview but has no mutation or download buttons.
 viewer=open_page('reviewer');va=viewer.locator('article[data-package-id="'+str(pid)+'"]');va.get_by_text('文件明细',exact=True).click();expect(va.get_by_role('button',name='移除',exact=True)).to_have_count(0);expect(va.get_by_role('button',name='移入回收站',exact=True)).to_have_count(0);expect(va.get_by_role('button',name='下载',exact=True)).to_have_count(0);checks+=3
 def preview(name):va.locator('details').first.locator('div').filter(has_text=name).get_by_role('button',name='预览',exact=True).click()
 preview('说明.txt');expect(viewer.locator('.transfer-text-preview')).to_contain_text('临时文件说明');checks+=1;viewer.get_by_role('dialog').get_by_role('button',name='关闭弹窗').click()
 preview('图片.png');expect(viewer.locator('.cross-gallery-original')).to_be_visible();viewer.wait_for_function("document.querySelector('.cross-gallery-original')?.naturalWidth>0");viewer.keyboard.press('ArrowRight');expect(viewer.get_by_role('dialog')).to_have_attribute('aria-label','说明.txt');checks+=2;viewer.get_by_role('dialog').get_by_role('button',name='关闭弹窗').click()
 # Older client proxies can return error JSON with HTTP 200; show that error rather than parsing it as Office.
 viewer.route('**/api/transfer-files/'+str(word)+'?*',lambda route:route.fulfill(status=200,content_type='application/json',body='{"error":"主机原件暂不可读取"}'));preview('资料.docx');expect(viewer.get_by_role('dialog').get_by_role('alert')).to_contain_text('主机原件暂不可读取');checks+=1;viewer.get_by_role('dialog').get_by_role('button',name='关闭弹窗').click();viewer.unroute('**/api/transfer-files/'+str(word)+'?*')
 preview('资料.docx');expect(viewer.get_by_role('dialog')).to_contain_text('临时文件共享预览测试');viewer.screenshot(path=str(out/'transfer-document.png'));checks+=1;viewer.get_by_role('dialog').get_by_role('button',name='关闭弹窗').click()
 preview('演示.mp4');viewer.wait_for_function("document.querySelector('video')?.readyState>=1");checks+=1;viewer.get_by_role('dialog').get_by_role('button',name='关闭弹窗').click()
 assert not errors,errors;checks+=1;b.close();Path('/tmp/v3318-state.json').write_text(json.dumps({'project':project,'package':pid}));print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False));db.close()
