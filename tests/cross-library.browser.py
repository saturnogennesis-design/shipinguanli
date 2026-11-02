import os,json,base64,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
state=json.loads(Path(os.environ.get('ORBIT_QA_STATE_FILE','/tmp/orbit-layout-state.json')).read_text())
base=os.environ['ORBIT_E2E_BASE_URL'];out=Path('/tmp/orbit-tabs-screenshots');out.mkdir(exist_ok=True);checks=0
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':960});n,v=state['adminCookie'].split('=',1)
 context.add_cookies([{'name':n,'value':v,'url':base}]);page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));accept_dialog=lambda d:d.accept();page.on('dialog',accept_dialog)
 page.goto(base);page.locator(f"#project-tab-{state['a']}").click();nav=page.get_by_role('navigation',name='项目二级导航')
 nav.get_by_role('button',name='线索库',exact=True).click();q=page.get_by_role('textbox',name='搜索名称')
 scopes=page.get_by_role('tablist',name='资料范围');expect(scopes.get_by_role('tab')).to_have_count(1);expect(scopes.get_by_role('tab').first).to_have_attribute('aria-selected','true');checks+=2
 q.fill('关联线索A');page.get_by_role('button',name='列表',exact=True).click();page.get_by_text('关联线索A',exact=True).click()
 detail=page.locator('.cross-detail-page');expect(detail.get_by_role('tab',name='资料与备注',exact=True)).to_be_visible();assert detail.get_by_role('textbox',name='名称',exact=True).count()==0
 assert detail.get_by_role('button',name='编辑线索',exact=True).count()==0;assert detail.get_by_role('button',name='复制新建',exact=True).count()==0;checks+=3
 detail.get_by_role('tab',name='母版').click();expect(detail.get_by_role('button',name='新建母版',exact=True)).to_be_visible();expect(detail.locator('.cross-related-card')).to_have_count(1)
 page.screenshot(path=str(out/'关联母版-桌面.png'));detail.locator('.cross-related-card').first.click();expect(page.locator('.cross-detail-page h2')).to_have_text('关联母版A');checks+=2
 page.get_by_role('button',name='返回上一级',exact=True).click();expect(detail.get_by_role('tab',name='母版')).to_have_attribute('aria-selected','true');checks+=1
 assert detail.get_by_role('button',name='进入资料库筛选结果 →',exact=True).count()==0
 detail.locator('.cross-related-card').first.click();detail.get_by_role('tab',name='产品包').click();expect(detail.locator('.cross-related-list>.cross-relation-item')).to_have_count(1);detail.get_by_role('button',name='展开关联主图A',exact=True).click();expect(detail.locator('.cross-relation-open').filter(has_text='独立回收子包')).to_be_visible();checks+=2
 detail.locator('.cross-relation-open').filter(has_text='关联主图A').click();detail.get_by_role('tab',name='子包').click();expect(detail.locator('.cross-relation-open')).to_have_count(1);checks+=1
 page.get_by_role('button',name='返回上一级',exact=True).click();expect(detail.get_by_role('tab',name='产品包')).to_have_attribute('aria-selected','true');expect(detail.get_by_role('button',name='收起关联主图A',exact=True)).to_have_attribute('aria-expanded','true')
 page.get_by_role('button',name='返回上一级',exact=True).click();expect(detail.get_by_role('tab',name='母版')).to_have_attribute('aria-selected','true');page.get_by_role('button',name='返回上一级',exact=True).click();expect(q).to_have_value('关联线索A');checks+=2
 # Copy is a secondary external action and cancelling confirmation creates nothing.
 count=page.request.get(base+'/api/cross-records',headers={'x-orbit-project-id':str(state['a'])}).json()['items']
 assert page.get_by_role('button',name='复制新建',exact=True).count()==0
 page.remove_listener('dialog',accept_dialog);page.once('dialog',lambda d:d.dismiss());page.get_by_label('更多操作：关联线索A',exact=True).select_option('copy')
 later=page.request.get(base+'/api/cross-records',headers={'x-orbit-project-id':str(state['a'])}).json()['items'];assert len(later)==len(count);checks+=2
 page.on('dialog',accept_dialog);page.get_by_role('button',name='清空条件',exact=True).click();current=page.request.get(base+'/api/cross-records?id='+str(state['free']),headers={'x-orbit-project-id':str(state['a'])}).json()['row'];next_version=current['version_number']+1;next_title='浏览器提交第'+str(next_version)+'版';q.fill(current['title']);page.get_by_text(current['title'],exact=True).click()
 detail.get_by_role('button',name='编辑线索',exact=True).click();editor=page.locator('.cross-edit-page');editor.get_by_role('textbox',name='名称',exact=True).fill(next_title);editor.get_by_role('button',name='提交新版本',exact=True).click()
 expect(detail.locator('h2')).to_have_text(next_title);detail.get_by_role('tab',name='操作记录',exact=True).click()
 expect(detail.locator('.cross-version-event').filter(has_text='V'+str(next_version))).to_be_visible();detail.get_by_role('button',name='只看版本',exact=True).click();expect(detail.locator('.cross-version-list>button')).to_have_count(next_version)
 detail.locator('.cross-version-list>button').last.click();modal=page.get_by_role('dialog').last;expect(modal).to_contain_text('可编辑线索');modal.get_by_role('button',name='关闭弹窗',exact=True).click();checks+=3
 page.screenshot(path=str(out/'版本与日志-桌面.png'));detail.get_by_role('button',name='时间线',exact=True).click();checks+=1
 # Notes are present only in the first functional detail tab.
 detail.get_by_role('tab',name='资料与备注',exact=True).click()
 detail.get_by_role('textbox',name='备注',exact=True).fill('本轮简洁备注');detail.get_by_role('button',name='保存备注',exact=True).click();expect(detail.locator('.cross-remark-list')).to_contain_text('本轮简洁备注')
 remarks=detail.locator('.cross-remarks');remarks.locator(':scope>summary').click();assert not remarks.evaluate('(e)=>e.open');remarks.locator(':scope>summary').click();checks+=2
 detail.get_by_role('tab',name='资料与备注',exact=True).click();page.screenshot(path=str(out/'资料详情-桌面.png'))
 for width in [1440,1024,540]:
  page.set_viewport_size({'width':width,'height':960});page.wait_for_timeout(150)
  if width<=760 and page.get_by_role('button',name='收起导航',exact=True).count():page.get_by_role('button',name='收起导航',exact=True).click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2');page.screenshot(path=str(out/f'详情-{width}.png'));checks+=1
 page.set_viewport_size({'width':1440,'height':960})
 if page.get_by_role('button',name='展开导航',exact=True).count():page.get_by_role('button',name='展开导航',exact=True).click()
 page.get_by_role('button',name='返回上一级',exact=True).click();page.get_by_role('button',name='清空条件',exact=True).click();page.get_by_role('button',name='新增线索',exact=True).click()
 editor=page.locator('.cross-edit-page');name='页签验收线索'+str(int(time.time()));editor.get_by_role('textbox',name='名称',exact=True).fill(name);editor.get_by_label('关键字（多个可用逗号分隔）').fill('页签,缩略图')
 image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==');editor.locator('input[type=file]').first.set_input_files({'name':'预览.png','mimeType':'image/png','buffer':image});expect(editor.locator('.cross-pending-thumb')).to_be_visible();checks+=1
 page.screenshot(path=str(out/'编辑表单-桌面.png'));editor.get_by_role('button',name='提交线索',exact=True).click();expect(detail).to_be_visible();detail.get_by_role('tab',name='母版').click();detail.get_by_role('button',name='新建母版',exact=True).click();expect(page.locator('.cross-edit-page')).to_be_visible();page.get_by_role('button',name='返回上一级',exact=True).click();expect(detail.locator('h2')).to_have_text(name);expect(detail.get_by_role('tab',name='母版')).to_have_attribute('aria-selected','true');checks+=2;page.get_by_role('button',name='返回上一级',exact=True).click();q.fill(name);checks+=1
 page.get_by_label('更多操作：'+name,exact=True).select_option('archive');page.get_by_label('更多视图',exact=True).select_option('archived');expect(page.get_by_text(name,exact=True)).to_be_visible();page.get_by_label('更多操作：'+name,exact=True).select_option('delete');page.get_by_label('更多视图',exact=True).select_option('deleted');expect(page.get_by_text(name,exact=True)).to_be_visible()
 page.get_by_role('row').filter(has_text=name).get_by_role('button',name='恢复',exact=True).click();page.get_by_label('更多视图',exact=True).select_option('archived');expect(page.get_by_text(name,exact=True)).to_be_visible();checks+=3
 assert not errors,errors;browser.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False))
