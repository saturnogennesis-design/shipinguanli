import os,json,re
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ['ORBIT_E2E_BASE_URL'];state=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());passed=0
out=Path('/workspace/qa-cross/screenshots');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':900});name,value=state['adminCookie'].split('=',1);context.add_cookies([{'name':name,'value':value,'url':base}]);page=context.new_page();errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
 page.goto(base);page.get_by_role('button',name='项目管理',exact=True).click();page.get_by_role('button',name=re.compile('新增项目$')).click();dialog=page.get_by_role('dialog').last
 dialog.locator('select').first.wait_for();assert dialog.locator('select').first.locator('option').all_text_contents()==['短视频项目','跨境项目'];passed+=1
 dialog.get_by_role('button',name='取消',exact=True).click()
 page.once('dialog',lambda d:d.accept());page.locator(f"#project-tab-{state['c']}").click();page.get_by_role('heading',name='项目工作台',exact=True).last.wait_for();passed+=1
 nav=page.get_by_role('navigation',name='项目二级导航');assert nav.get_by_role('button').all_text_contents()==['项目工作台','线索库','母版库','产品包管理','审核中心'];passed+=1
 for module in ['线索库','母版库','产品包管理','审核中心']:
  nav.get_by_role('button',name=module,exact=True).click();page.locator('.cross-workspace table').wait_for();page.wait_for_timeout(300);assert not re.search(r'etsy|listing|店铺|倒计时',page.locator('.project-content').inner_text(),re.I);passed+=1
 nav.get_by_role('button',name='产品包管理',exact=True).click();page.get_by_role('button',name='戒指成品资料',exact=True).click();dialog=page.get_by_role('dialog').last;dialog.get_by_text('产品包制作丙',exact=True).wait_for(state='attached');assert dialog.get_by_text('追溯线索',exact=True).is_visible();assert dialog.get_by_text('戒指参考线索',exact=True).is_visible();passed+=1
 dialog.locator('summary').filter(has_text='来源母版对照').click();assert dialog.get_by_text('材质银，尺寸18mm，已补充标注',exact=True).is_visible();passed+=1
 dialog.locator('summary').filter(has_text='提交版本').click();dialog.get_by_role('button',name='V1 · 查看只读快照',exact=True).click();history=page.get_by_role('dialog').last;assert history.get_by_text('制作人：产品包制作丙',exact=True).is_visible();passed+=1
 history.get_by_role('button',name='关闭弹窗',exact=True).click();dialog=page.get_by_role('dialog').last
 with page.expect_download() as info:
  page.once('dialog',lambda d:d.accept());dialog.get_by_role('link',name='下载交付包',exact=True).click()
 assert info.value.suggested_filename.endswith('.zip');passed+=1
 dialog.get_by_role('button',name='关闭弹窗',exact=True).click()
 for width,height in [(1440,900),(1024,720),(540,800)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(500);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2');passed+=1
  page.get_by_role('button',name='戒指成品资料',exact=True).click();dialog=page.get_by_role('dialog').last;box=dialog.bounding_box();assert box['width']<=width and box['x']>=0;passed+=1
  page.screenshot(path=str(out/f'package-{width}.png'));dialog.get_by_role('button',name='关闭弹窗',exact=True).click()
 page.set_viewport_size({'width':1440,'height':900});nav.get_by_role('button',name='线索库',exact=True).click();page.get_by_role('button',name=re.compile('新增线索$')).click();dialog=page.get_by_role('dialog').last;dialog.get_by_label('名称',exact=True).fill('浏览器创建线索');dialog.get_by_role('button',name='建立草稿',exact=True).click();dialog=page.get_by_role('dialog').last;dialog.get_by_label('线索说明',exact=True).fill('浏览器录入说明');dialog.get_by_role('button',name='保存资料',exact=True).click();dialog=page.get_by_role('dialog').last;page.once('dialog',lambda d:d.accept());dialog.get_by_role('button',name='提交线索',exact=True).click();page.get_by_role('dialog').last.get_by_text('已通过 · V1',exact=True).wait_for();passed+=1
 page.get_by_role('dialog').last.get_by_role('button',name='关闭弹窗',exact=True).click();page.once('dialog',lambda d:d.accept());page.locator(f"#project-tab-{state['a']}").click();page.get_by_role('heading',name='项目工作台',exact=True).last.wait_for();assert nav.get_by_role('button',name='内容池',exact=True).is_visible();assert nav.get_by_role('button',name='线索库',exact=True).count()==0;passed+=1
 assert not errors,errors
 browser.close();print(json.dumps({'passed':passed,'pageErrors':errors,'responsive':True,'confidentialLabels':True},ensure_ascii=False))
