import os,json,base64,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
state=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];out=Path('/tmp/orbit-combined-screenshots');out.mkdir(exist_ok=True);checks=0
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':960});n,v=state['adminCookie'].split('=',1);context.add_cookies([{'name':n,'value':v,'url':base}])
 h={'x-orbit-project-id':str(state['a'])};stamp=str(int(time.time()))
 def req(path,body=None,method='GET',status=200):
  global checks
  r=context.request.fetch(base+path,method=method,headers=h,data=body);assert r.status==status,(path,r.status,r.text());checks+=1;return r.json()
 def change(id,action,**fields):
  row=req('/api/cross-records?id='+str(id))['row'];return req('/api/cross-records/'+str(id),{'action':action,'revision':row['revision'],**fields},'PATCH')
 def seed(kind,title):
  id=req('/api/cross-records',{'kind':kind,'title':title,'parentId':state['mother'] if kind=='package' else None,'packageType':'main'},'POST',201)['id']
  if kind=='mother':change(id,'save',productCategoryId=state['category'])
  image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==')
  upload=context.request.post(base+f'/api/cross-records/{id}/files',headers=h,multipart={'file':{'name':'审核图.png','mimeType':'image/png','buffer':image}});assert upload.status==201,upload.text();change(id,'submit');return id
 mother_title='合并审核母版'+stamp;product_title='合并审核产品'+stamp
 mother=seed('mother',mother_title);product=seed('package',product_title);viewer_title='权限校验母版'+stamp;viewer_mother=seed('mother',viewer_title)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(base);page.locator(f"#project-tab-{state['a']}").click();nav=page.get_by_role('navigation',name='项目二级导航')
 expect(nav.get_by_role('button')).to_have_count(4);assert nav.get_by_role('button',name='母版审核',exact=True).count()==0;assert nav.get_by_role('button',name='产品包审核',exact=True).count()==0;checks+=3
 nav.get_by_role('button',name='母版库',exact=True).click();tabs=page.get_by_role('tablist',name='资料范围');expect(tabs.get_by_role('tab').first).to_contain_text('待审核');expect(tabs.get_by_role('tab').first).to_have_attribute('aria-selected','true');checks+=2
 page.get_by_role('button',name='列表',exact=True).click();page.get_by_role('textbox',name='搜索名称',exact=True).fill(mother_title);table=page.locator('.cross-workspace table');expect(table).to_contain_text(mother_title);assert '编号' not in table.inner_text();assert '#'+str(mother) not in table.inner_text();checks+=2
 page.screenshot(path=str(out/'母版库与审核.png'));page.get_by_role('button',name=mother_title,exact=True).click();detail=page.locator('.cross-detail-page')
 expect(detail.get_by_role('tab').first).to_have_text('资料与备注');expect(detail.get_by_role('tab').last).to_have_text('操作记录');expect(detail.get_by_role('tabpanel').locator('.cross-remarks')).to_be_visible();assert '#'+str(mother) not in detail.locator('.cross-heading-title').inner_text();assert detail.locator('.cross-review-actions').count()==0;checks+=4
 detail.get_by_role('button',name='审核',exact=True).click();modal=page.get_by_role('dialog',name='母版审核');reject=modal.get_by_role('button',name='退回修改',exact=True);expect(reject).to_be_enabled();reject.click();expect(modal.get_by_role('alert')).to_contain_text('请填写问题位置及退回原因');expect(modal.get_by_role('textbox',name='退回原因')).to_be_focused();assert req('/api/cross-records?id='+str(mother))['row']['status']=='pending';checks+=4
 page.screenshot(path=str(out/'审核必填提示.png'));modal.get_by_role('textbox',name='退回原因').fill('第1张图需要调整');reject.click();expect(modal).not_to_be_visible();expect(detail.locator('.cross-status')).to_contain_text('已退回');checks+=2
 detail.get_by_role('tab',name='关联产品包').click();assert detail.get_by_role('textbox',name='备注',exact=True).count()==0;detail.get_by_role('tab',name='操作记录',exact=True).click();expect(detail).to_contain_text('第1张图需要调整');assert detail.get_by_role('textbox',name='备注',exact=True).count()==0;checks+=2
 page.get_by_role('button',name='返回上一级',exact=True).click();expect(tabs.get_by_role('tab').first).to_have_attribute('aria-selected','true');assert page.get_by_role('button',name=mother_title,exact=True).count()==0;tabs.get_by_role('tab').filter(has_text='资料库').click();expect(page.get_by_role('button',name=mother_title,exact=True)).to_be_visible();checks+=3
 tabs.get_by_role('tab',name='使用规则',exact=True).click();expect(page.locator('.cross-library-rules')).to_contain_text('审核通过');checks+=1
 nav.get_by_role('button',name='产品包管理',exact=True).click();expect(tabs.get_by_role('tab').first).to_have_attribute('aria-selected','true');page.get_by_role('button',name='列表',exact=True).click();page.get_by_role('textbox',name='搜索名称或编号',exact=True).fill(product_title);page.get_by_role('button',name=product_title,exact=True).click();detail.get_by_role('button',name='审核',exact=True).click();product_modal=page.get_by_role('dialog',name='产品包审核');expect(product_modal.get_by_role('button',name='退回修改',exact=True)).to_be_enabled();checks+=2
 product_modal.get_by_role('button',name='退回修改',exact=True).click();expect(product_modal.get_by_role('alert')).to_be_visible();product_modal.get_by_role('button',name='审核通过',exact=True).click();expect(product_modal).not_to_be_visible();expect(detail.locator('.cross-status')).to_contain_text('已通过');checks+=3
 page.get_by_role('button',name='返回上一级',exact=True).click();expect(tabs.get_by_role('tab').first).to_have_attribute('aria-selected','true');assert page.get_by_role('button',name=product_title,exact=True).count()==0;tabs.get_by_role('tab').filter(has_text='资料库').click();expect(page.get_by_role('button',name=product_title,exact=True)).to_be_visible();checks+=2
 page.screenshot(path=str(out/'产品包库与审核.png'))
 # Dashboard shortcuts select the merged pending tab rather than an obsolete page.
 nav.get_by_role('button',name='项目工作台',exact=True).click();page.get_by_role('button').filter(has_text='待审核母版').click();expect(nav.get_by_role('button',name='母版库',exact=True)).to_have_attribute('aria-current','page');expect(tabs.get_by_role('tab').first).to_have_attribute('aria-selected','true');checks+=2
 for width in [1024,540]:
  page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(150)
  if width<=760 and page.get_by_role('button',name='收起导航',exact=True).count():page.get_by_role('button',name='收起导航',exact=True).click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2');page.screenshot(path=str(out/f'合并库-{width}.png'));checks+=1
 viewer=browser.new_context(viewport={'width':1440,'height':960});n,v=state['viewerCookie'].split('=',1);viewer.add_cookies([{'name':n,'value':v,'url':base}]);vp=viewer.new_page();vp.on('dialog',lambda d:d.accept());vp.goto(base);vp.locator(f"#project-tab-{state['a']}").click();vp.get_by_role('navigation',name='项目二级导航').get_by_role('button',name='母版库',exact=True).click();vp.get_by_role('button',name='列表',exact=True).click();vp.get_by_role('button',name=viewer_title,exact=True).click();expect(vp.locator('.cross-detail-page')).to_be_visible();assert vp.get_by_role('button',name='审核',exact=True).count()==0
 r=viewer.request.patch(base+'/api/cross-records/'+str(viewer_mother),headers=h,data={'action':'approve','revision':req('/api/cross-records?id='+str(viewer_mother))['row']['revision']});assert r.status==403;checks+=2
 assert not errors,errors;browser.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False))
