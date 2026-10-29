"""Publishing interactions and global project settings, using a disposable local database."""
import json,os,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
state=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];passed=0
out=Path('/workspace/qa-next/screenshots');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1440,'height':900})
 name,value=state['adminCookie'].split('=',1);context.add_cookies([{'name':name,'value':value,'url':base}]);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.get_by_role('heading',name='选择项目开始工作').wait_for()
 assert page.get_by_role('button',name='发布目标账号管理',exact=True).count()==0;passed+=1
 page.get_by_role('button',name='项目管理',exact=True).click();page.wait_for_load_state('networkidle')
 project_row=page.locator('.module-table tbody tr').filter(has=page.get_by_role('button',name='独立项目B',exact=True));project_row.get_by_role('button',name='维护项目').click();page.get_by_role('button',name='业务分类',exact=True).click();page.wait_for_load_state('networkidle')
 expect(page.locator('.module-table').get_by_text('配置验收分类',exact=True)).to_be_visible();assert page.locator('.module-table').get_by_text('口播',exact=True).count()==0;passed+=1
 page.get_by_role('button',name='＋ 新增业务分类',exact=True).click();dialog=page.get_by_role('dialog',name='新增业务分类');dialog.get_by_label('名称',exact=True).fill('界面验收分类'+str(time.time_ns()));dialog.get_by_role('button',name='保存',exact=True).click();expect(dialog).to_have_count(0);expect(page.locator('.module-table tbody tr')).not_to_have_count(1);passed+=1
 page.get_by_role('button',name='发布目标账号',exact=True).click();page.wait_for_load_state('networkidle');expect(page.locator('.module-table').get_by_text('项目B配置验收目标',exact=True)).to_be_visible();assert page.locator('.module-table').get_by_text('十乐主号',exact=True).count()==0;passed+=1
 page.screenshot(path=str(out/'project-settings.png'))
 page.once('dialog',lambda d:d.accept());page.locator(f"#project-tab-{state['a']}").click();page.get_by_role('heading',name='我的待办',exact=True).wait_for();assert page.get_by_role('navigation',name='项目二级导航').get_by_role('button',name='内容小组',exact=True).count()==0;assert page.get_by_role('navigation',name='项目二级导航').get_by_role('button',name='业务分类',exact=True).count()==0;passed+=1
 page.get_by_role('button',name='发布管理',exact=True).click();page.locator('.condition-filter-controls>label').filter(has_text='关联商品').locator('select').select_option(label='独立产品');page.wait_for_load_state('networkidle');expect(page.locator('.publish-light-table .content-cover-button')).to_have_count(2);page.wait_for_function('()=>{const b=document.querySelector(".publish-light-table .content-cover-button");return b?.querySelector("img")?.naturalWidth>0||b?.querySelector("video")?.readyState>=2}');passed+=1
 page.get_by_role('button',name='预览十乐测试成片',exact=True).click();preview=page.get_by_role('dialog',name='十乐测试成片',exact=True);preview.wait_for();assert preview.locator('video').count()==1;preview.get_by_role('button',name='关闭预览').click();expect(preview).to_have_count(0);passed+=1
 def row(title):return page.locator('.publish-light-table tbody tr').filter(has=page.get_by_role('button',name=title,exact=True))
 def lamp(title,lit):return row(title).get_by_role('button',name='十乐副号：'+('已发布' if lit else '未发布'),exact=True)
 def confirm_click(locator,accept):
  page.once('dialog',lambda d:d.accept() if accept else d.dismiss());locator.click()
 confirm_click(lamp('十乐测试成片',True),False);expect(lamp('十乐测试成片',True)).to_have_attribute('aria-pressed','true');passed+=1
 confirm_click(lamp('十乐测试成片',True),True);expect(lamp('十乐测试成片',False)).to_be_visible();passed+=1
 dialogs=[]
 def unexpected(d):dialogs.append(d.message);d.dismiss()
 page.on('dialog',unexpected);lamp('十乐测试成片',False).click();expect(lamp('十乐测试成片',True)).to_be_visible();page.remove_listener('dialog',unexpected);assert not dialogs;passed+=1
 confirm_click(lamp('十乐测试成片',True),True);expect(lamp('十乐测试成片',False)).to_be_visible();confirm_click(lamp('批量点亮验收第二条',True),True);expect(lamp('批量点亮验收第二条',False)).to_be_visible()
 page.get_by_role('checkbox',name='选择当前结果',exact=True).check();confirm_click(page.get_by_role('button',name='批量点亮十乐副号'),False);expect(lamp('十乐测试成片',False)).to_be_visible();expect(lamp('批量点亮验收第二条',False)).to_be_visible();passed+=1
 confirm_click(page.get_by_role('button',name='批量点亮十乐副号'),True);expect(lamp('十乐测试成片',True)).to_be_visible();expect(lamp('批量点亮验收第二条',True)).to_be_visible();expect(page.get_by_role('button',name='批量点亮十乐副号')).to_be_disabled();passed+=1
 # Source-product filter must exclude a product linked only in per-target publishing details.
 page.locator('.condition-filter-controls>label').filter(has_text='关联商品').locator('select').select_option(label='仅发布资料更换的商品');expect(page.locator('.publish-light-table tbody tr')).to_have_count(0);passed+=1
 page.locator('.condition-filter-controls>label').filter(has_text='关联商品').locator('select').select_option(label='独立产品');expect(page.locator('.publish-light-table tbody tr')).to_have_count(2);passed+=1
 page.locator('.condition-filter-controls>label').filter(has_text='上传人').locator('select').select_option(label='项目验收管理员');page.locator('.condition-filter-controls>label').filter(has_text='业务分类').locator('select').select_option(label='口播');expect(page.locator('.publish-light-table tbody tr')).to_have_count(2);expect(page.get_by_role('checkbox',name='选择当前结果')).not_to_be_checked();passed+=1
 page.screenshot(path=str(out/'publishing-list.png'))
 page.get_by_role('button',name='十乐测试成片',exact=True).click();detail=page.locator('.publishing-original .unified-detail');detail.wait_for();assert detail.locator('.detail-preview').is_visible();assert detail.get_by_role('heading',name='内容基础信息').is_visible();assert page.get_by_role('heading',name='发布操作日志').is_visible();passed+=1
 page.screenshot(path=str(out/'publishing-detail.png'));detail.locator('.back-square').click();page.get_by_role('button',name='收起导航',exact=True).click();page.set_viewport_size({'width':540,'height':760});page.locator('.publish-light-table').scroll_into_view_if_needed();rail=page.get_by_role('region',name='当前表格横向滚动');rail.wait_for();page.wait_for_timeout(250);expect(rail).to_be_visible();assert rail.bounding_box()['y']<760;passed+=1
 assert not errors,errors;print(json.dumps({'passed':passed,'pageErrors':errors}));browser.close()
