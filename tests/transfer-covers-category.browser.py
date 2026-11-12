"""Synthetic transfer covers, classification and ZIP contract checks; /tmp database only."""
import os,json,time,sqlite3,io,zipfile,struct,zlib
from pathlib import Path
from urllib.parse import quote,unquote
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];path=os.environ['ORBIT_QA_DB_PATH'];assert path.startswith('/tmp/') and base.startswith('http://127.0.0.1:');db=sqlite3.connect(path);checks=0;errors=[];out=Path('/tmp/v3319-screenshots');out.mkdir(exist_ok=True);prefix='封面验收'+str(time.time_ns());project=db.execute("INSERT INTO short_video_accounts(platform_id,code,name,project_type) SELECT platform_id,?,?,'cross_border' FROM short_video_accounts LIMIT 1 RETURNING id",(prefix,'中转站封面验收')).fetchone()[0]
for who,rights in [('owner',['transfer.upload','transfer.download','transfer.delete']),('reviewer',['transfer.view'])]:
 uid=s['people'][who]['id'];db.execute('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)',(project,uid,s['adminId']));db.execute('INSERT INTO project_user_permissions(project_id,user_id,permissions_json,updated_by,scope_version) VALUES(?,?,?,?,2)',(project,uid,json.dumps(rights),s['adminId']))
db.execute('INSERT INTO project_visibility(project_id,user_id,granted_by) VALUES(?,?,?)',(project,s['adminId'],s['adminId']));db.commit()
def png():
 def ck(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+ck(b'IHDR',struct.pack('>IIBBBBB',120,90,8,2,0,0,0))+ck(b'IDAT',zlib.compress((b'\0'+b'\x73\x9d\xb8'*120)*90))+ck(b'IEND',b'')
def docx():
 b=io.BytesIO()
 with zipfile.ZipFile(b,'w') as z:z.writestr(zipfile.ZipInfo('word/document.xml',date_time=(2026,1,1,0,0,0)),'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>文档封面与原件分离验收</w:t></w:r></w:p></w:body></w:document>')
 return b.getvalue()
with sync_playwright() as p:
 a=p.request.new_context()
 def headers(who='owner'):return {'cookie':s['adminCookie'] if who=='admin' else s['people'][who]['cookie'],'x-orbit-project-id':str(project)}
 def api(url,data=None,method=None,who='owner',status=200,extra=None):
  global checks
  r=a.fetch(base+url,headers={**headers(who),**(extra or {})},method=method or ('POST' if data is not None else 'GET'),data=data);assert r.status==status,(url,r.status,r.text());checks+=1;return r
 def packs():return api('/api/transfer-packages').json()['items']
 def row(id):return next(p for p in packs() if p['id']==id)
 def create(title,typ='document'):return api('/api/transfer-packages',{'title':title,'contentType':typ},status=201).json()['id']
 def upload(pack,name,data):return api('/api/transfer-packages/'+str(pack)+'?fileSize='+str(len(data))+'&fileName='+quote(name),data,extra={'content-type':'application/octet-stream'},status=201).json()['id']
 api('/api/transfer-packages',{'title':'缺分类'},status=400);api('/api/transfer-packages',{'title':'错分类','contentType':'anything'},status=400)
 pack=create('旅行手册');doc=upload(pack,'说明.docx',docx());assert not row(pack)['hasCover'];checks+=1
 def cover_url(file=None,revision=None):return '/api/transfer-packages/'+str(pack)+'/cover?projectId='+str(project)+'&revision='+str(row(pack)['revision'] if revision is None else revision)+(('&fileId='+str(file)) if file else '')
 def setcover(file=None,who='owner',data=None,status=200,revision=None):
  data=png() if data is None else data;return api(cover_url(file,revision)+'&fileSize='+str(len(data)),data,who=who,status=status,extra={'content-type':'image/png'})
 setcover(doc);assert row(pack)['hasCover'] and row(pack)['files'][0]['hasCover'];assert row(pack)['files'][0]['customCover'];checks+=2
 r=api(cover_url(doc),who='reviewer');assert r.headers['content-type']=='image/webp' and r.body()[:4]==b'RIFF';checks+=1;api(cover_url(doc),who='reviewer',status=304,extra={'if-none-match':r.headers['etag']})
 setcover(doc,who='reviewer',status=403);setcover(doc,who='admin',status=403);setcover(doc,data=b'not-image',status=409)
 setcover(revision=row(pack)['revision']-1,status=409);setcover();assert row(pack)['customCover'];checks+=1
 api('/api/transfer-files/'+str(doc),who='reviewer',status=403);assert api('/api/transfer-files/'+str(doc)+'?preview=1',who='reviewer').body()==docx();checks+=1
 # Covers are absent from all archives, and original names/content remain intact.
 single=api('/api/transfer-files/'+str(doc));assert unquote(single.headers['content-disposition'].split("filename*=UTF-8''")[1])=='旅行手册.zip';z=zipfile.ZipFile(io.BytesIO(single.body()));assert z.namelist()==['说明.docx'] and z.read('说明.docx')==docx();checks+=2
 upload(pack,'说明.docx',docx());whole=api('/api/transfer-packages/'+str(pack));z=zipfile.ZipFile(io.BytesIO(whole.body()));assert z.namelist()==['说明.docx','说明 (2).docx'];assert len(row(pack)['files'])==2;checks+=2
 api(cover_url(doc),method='DELETE');assert not row(pack)['files'][0]['customCover'];api(cover_url(doc),status=404);api(cover_url(),method='DELETE');assert not row(pack)['hasCover'];checks+=2
 image=upload(pack,'照片.png',png());assert row(pack)['hasCover'] and not row(pack)['customCover'];checks+=1
 legacy=db.execute("INSERT INTO transfer_packages(project_id,title,creator_id) VALUES(?,'旧文件包',?) RETURNING id",(project,s['people']['owner']['id'])).fetchone()[0];db.commit();assert row(legacy)['contentType'] is None;checks+=1
 imagepack=create('图片参考','image');videopack=create('视频参考','video')
 for i in range(12):create('旅行资料'+str(i))
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def page_for(who='owner'):
  c=browser.new_context(viewport={'width':1450,'height':950},accept_downloads=True);n,v=(s['adminCookie'] if who=='admin' else s['people'][who]['cookie']).split('=',1);c.add_cookies([{'name':n,'value':v,'url':base}]);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='networkidle');page.locator('#project-tab-'+str(project)).click();page.get_by_role('dialog').get_by_role('button',name='确认继续').click();page.locator('[aria-label="项目二级导航"]').get_by_role('button',name='中转站',exact=True).click();return page
 page=page_for();view=page.get_by_role('group',name='中转站展示方式');expect(view.get_by_role('button',name='列表',exact=True)).to_have_attribute('aria-pressed','true');checks+=1
 page.get_by_label('搜索临时文件包').fill('旅行');page.get_by_label('业务内容筛选').select_option('document');article=page.locator('article[data-package-id="'+str(pack)+'"]');article.get_by_text('文件明细',exact=True).click();scroll=page.locator('.transfer-results');scroll.evaluate('e=>e.scrollTop=150');top=scroll.evaluate('e=>e.scrollTop');view.get_by_role('button',name='卡片',exact=True).click();expect(page.locator('.transfer-view-grid')).to_be_visible();expect(page.get_by_label('搜索临时文件包')).to_have_value('旅行');expect(page.get_by_label('业务内容筛选')).to_have_value('document');assert article.locator('details').first.get_attribute('open') is not None;page.wait_for_timeout(100);assert abs(scroll.evaluate('e=>e.scrollTop')-top)<3;checks+=5;page.screenshot(path=str(out/'transfer-cards.png'));view.get_by_role('button',name='列表',exact=True).click()
 page.get_by_label('搜索临时文件包').fill('');page.get_by_label('业务内容筛选').select_option('image');expect(page.locator('.transfer-results>article')).to_have_count(1);checks+=1;page.get_by_label('业务内容筛选').select_option('')
 # Existing unclassified records can be classified without reuploading files.
 old=page.locator('article[data-package-id="'+str(legacy)+'"]');old.get_by_role('button',name='添加文件').click();dialog=page.get_by_role('dialog',name='添加临时文件');dialog.get_by_label('业务内容',exact=True).select_option('image');dialog.get_by_role('button',name='保存设置').click();expect(dialog).to_have_count(0);assert row(legacy)['contentType']=='image' and row(legacy)['files']==[];checks+=1
 # Individual document covers are available in both display modes.
 article=page.locator('article[data-package-id="'+str(pack)+'"]');article.get_by_text('文件明细',exact=True).click();article.get_by_role('button',name='设置封面：说明.docx').first.click();dialog=page.get_by_role('dialog',name='设置文件封面');dialog.get_by_label('选择新封面').set_input_files({'name':'文档封面.png','mimeType':'image/png','buffer':png()});dialog.get_by_role('button',name='保存封面').click();expect(dialog).to_have_count(0);expect(article.locator('.transfer-file-name img').first).to_be_visible();assert article.locator('.transfer-file-name>span:last-child').first.bounding_box()['width']>100;checks+=2
 # New upload requires a type and can save a package cover plus a separate document cover.
 page.get_by_role('button',name='上传文件包',exact=True).click();dialog=page.get_by_role('dialog',name='上传临时文件包');dialog.get_by_label('文件包名称').fill('封面上传验收');dialog.get_by_role('button',name='确认上传',exact=True).click();expect(dialog.get_by_role('alert')).to_contain_text('业务内容');checks+=1;dialog.get_by_label('业务内容',exact=True).select_option('document');dialog.get_by_label('文件包封面').set_input_files({'name':'包封面.png','mimeType':'image/png','buffer':png()});dialog.get_by_label('选择临时文件').set_input_files({'name':'新增资料.docx','mimeType':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','buffer':docx()});dialog.locator('.transfer-pending-cover summary').click();dialog.get_by_label('文件封面：新增资料.docx').set_input_files({'name':'文档封面.png','mimeType':'image/png','buffer':png()});dialog.get_by_role('button',name='确认上传',exact=True).click();expect(dialog).to_have_count(0,timeout=15000);new=next(p for p in packs() if p['title']=='封面上传验收');assert new['customCover'] and new['files'][0]['customCover'] and len(new['files'])==1;checks+=1
 page.locator('.transfer-results').evaluate('e=>e.scrollTop=0');page.screenshot(path=str(out/'transfer-list.png'));view.get_by_role('button',name='卡片',exact=True).click();page.locator('.transfer-results').evaluate('e=>e.scrollTop=0');page.screenshot(path=str(out/'transfer-cards.png'));view.get_by_role('button',name='列表',exact=True).click();newarticle=page.locator('article[data-package-id="'+str(new['id'])+'"]');newarticle.get_by_text('文件明细',exact=True).click()
 for target in [newarticle.get_by_role('button',name='整包下载',exact=True),newarticle.get_by_role('button',name='下载',exact=True)]:
  with page.expect_download() as download:target.click()
  assert download.value.suggested_filename=='封面上传验收.zip';assert zipfile.ZipFile(download.value.path()).namelist()==['新增资料.docx'];checks+=2
 viewer=page_for('reviewer');va=viewer.locator('article[data-package-id="'+str(new['id'])+'"]');expect(va.locator('.transfer-package-cover img')).to_be_visible();expect(va.get_by_role('button',name='设置封面',exact=True)).to_have_count(0);checks+=2
 assert not errors,errors;checks+=1;browser.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False));db.close()
