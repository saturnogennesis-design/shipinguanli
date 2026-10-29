"""Viewport and dialog regressions against synthetic data on an isolated local server."""
import base64,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
state=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];passed=0
out=Path('/workspace/qa-projects/responsive');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':900})
 name,value=state['adminCookie'].split('=',1);context.add_cookies([{'name':name,'value':value,'url':base}])
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base);page.get_by_role('heading',name='选择项目开始工作').wait_for()
 page.once('dialog',lambda d:d.accept());page.locator(f"#project-tab-{state['a']}").click();page.get_by_role('heading',name='我的待办',exact=True).wait_for()
 assert page.locator('.metric-card').count()>=3;passed+=1
 # The sidebar can be hidden and reopened without resetting the selected project/module.
 before=page.locator('.project-workspace').bounding_box()['width'];page.get_by_role('button',name='收起导航',exact=True).click();assert not page.locator('#primary-navigation').is_visible();assert page.locator('.project-workspace').bounding_box()['width']>before;passed+=1
 page.get_by_role('button',name='展开导航',exact=True).click();assert page.locator('#primary-navigation').is_visible();passed+=1
 headers={'x-orbit-project-id':str(state['a'])}
 title='界面验收素材套：标题遮挡与关闭检查'
 existing=context.request.get(base+'/api/material-sets',headers=headers).json()['items']
 item=next((row for row in existing if row['title']==title),None)
 if not item:
  image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=')
  res=context.request.post(base+'/api/material-sets',headers=headers,data={'title':title,'description':'滚动到下面时，正文不得穿透标题栏。'*20,'category':'产品展示','productMasterId':state['productA'],'accountId':state['a'],'files':[{'fileName':f'素材{i}.png','mimeType':'image/png','fileSize':len(image)} for i in range(26)]});assert res.status==201,res.text();item=res.json()
  for upload in item['uploads']:
   r=context.request.put(base+upload['uploadUrl'],headers={**headers,'content-type':'image/png'},data=image);assert r.ok,r.text()
 page.get_by_role('button',name='素材中心',exact=True).click();page.get_by_text(title,exact=True).click()
 dialog=page.get_by_role('dialog',name=title);dialog.wait_for();body=dialog.locator(':scope > .dialog-body');header=dialog.locator(':scope > header')
 assert body.evaluate('(el)=>el.scrollHeight>el.clientHeight');passed+=1
 header_before=header.bounding_box();body.evaluate('(el)=>el.scrollTop=el.scrollHeight');page.wait_for_timeout(150);assert abs(header.bounding_box()['y']-header_before['y'])<1;assert header.evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(255, 255, 255)';passed+=1
 close=dialog.get_by_role('button',name='关闭弹窗');assert close.is_enabled();box=close.bounding_box();assert page.evaluate('([x,y])=>document.elementFromPoint(x,y).closest("button")?.getAttribute("aria-label")',[box['x']+box['width']/2,box['y']+box['height']/2])=='关闭弹窗';passed+=1
 page.screenshot(path=str(out/'material-header.png'));close.click();assert dialog.count()==0;passed+=1
 # Preview and edit windows keep the original material detail intact when they close.
 page.get_by_text(title,exact=True).click();dialog=page.get_by_role('dialog',name=title);dialog.locator('.v3-file-list>button').first.click();preview=page.get_by_role('dialog',name='素材预览 · 1 / 26');preview.wait_for();assert dialog.get_by_role('button',name='关闭弹窗').is_disabled();preview.get_by_role('button',name='关闭弹窗').click();assert dialog.get_by_role('button',name='关闭弹窗').is_enabled();passed+=1
 dialog.get_by_role('button',name='编辑素材套',exact=True).click();edit=page.get_by_role('dialog',name='编辑素材套',exact=True);edit.wait_for();edit.get_by_role('button',name='关闭弹窗').click();assert edit.count()==0;dialog.get_by_role('button',name='关闭弹窗').click();passed+=1
 page.get_by_role('button',name='产品库',exact=True).first.click();page.wait_for_load_state('networkidle');page.get_by_role('button',name='修改',exact=True).first.click();edit=page.get_by_role('dialog',name='修改产品');edit.wait_for();edit.get_by_role('button',name='关闭弹窗').click();assert edit.count()==0;passed+=1
 # Content details use the same opaque header/body structure.
 page.get_by_role('button',name='内容池',exact=True).click();page.wait_for_load_state('networkidle');page.get_by_role('button',name='预览十乐测试成片',exact=True).click();content=page.get_by_role('dialog',name='内容详情',exact=True);content.wait_for();assert content.locator(':scope > .dialog-body').count()==1;content.get_by_role('button',name='关闭弹窗').click();assert content.count()==0;passed+=1
 # Draft editing has an actionable X: confirm discard, or cancel and keep editing.
 draft_title='界面验收草稿关闭确认'
 existing=context.request.get(base+'/api/contents',headers=headers).json()['contents'];draft=next((row for row in existing if row['title']==draft_title),None)
 if not draft:
  image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=')
  group=context.request.get(base+'/api/groups?scope=upload',headers=headers).json()['groups'][0]['id']
  res=context.request.post(base+'/api/contents',headers=headers,data={'groupId':group,'items':[{'title':draft_title,'contentType':'image_text','productMasterId':state['productA'],'files':[{'fileName':'draft.png','mimeType':'image/png','fileSize':len(image)}]}]});assert res.status==201,res.text();draft=res.json()['items'][0]
  r=context.request.put(base+draft['uploads'][0]['uploadUrl'],headers={**headers,'content-type':'image/png'},data=image);assert r.ok,r.text()
 page.get_by_role('button',name='内容池',exact=True).click();page.wait_for_load_state('networkidle');page.get_by_role('button',name='预览'+draft_title,exact=True).click();content=page.get_by_role('dialog',name='内容详情',exact=True);content.get_by_role('button',name='编辑草稿',exact=True).click();page.once('dialog',lambda d:d.dismiss());content.get_by_role('button',name='关闭弹窗').click();assert content.get_by_role('button',name='保存修改').is_visible();passed+=1
 page.once('dialog',lambda d:d.accept());content.get_by_role('button',name='关闭弹窗').click();assert content.count()==0;passed+=1
 page.get_by_role('button',name='版本管理',exact=True).click();page.wait_for_load_state('networkidle');page.get_by_role('button',name='查看版本',exact=True).first.click();page.get_by_role('heading',name='文件版本记录',exact=True).wait_for();assert page.locator('.version-detail-history').bounding_box()['width']<=page.locator('.project-workspace').bounding_box()['width'];page.locator('.drilldown-header button').first.click();passed+=1
 # Every exposed module is audited at desktop and smaller laptop size.
 modules=['项目工作台','素材中心','产品库','内容池','审核中心','发布管理','版本管理','数据统计','通知公告','工作报备','项目管理','组织与权限','报备模板','配置中心','操作日志']
 for width,height in [(1440,900),(1024,720)]:
  page.set_viewport_size({'width':width,'height':height})
  for module in modules:
   page.locator('#primary-navigation').get_by_role('button',name=module,exact=True).click();page.wait_for_load_state('networkidle');page.wait_for_timeout(100)
   assert page.locator('.project-topbar h1').inner_text()==module
   bad=page.evaluate('''()=>{const el=document.querySelector('.project-workspace');return el.scrollWidth>el.clientWidth+2}''');assert not bad,f'{module}: outer horizontal overflow at {width}'
   passed+=1
 # A wide table has an immediately reachable horizontal rail and synchronizes with it.
 page.get_by_role('button',name='发布管理',exact=True).click();page.get_by_role('button',name='收起导航',exact=True).click();page.set_viewport_size({'width':540,'height':760});page.wait_for_timeout(250)
 rail=page.get_by_role('region',name='当前表格横向滚动');rail.wait_for();assert rail.bounding_box()['y']<760;rail.evaluate('(el)=>el.scrollLeft=el.scrollWidth');page.wait_for_timeout(100);assert page.locator('.project-content .table-wrap').evaluate('(el)=>el.scrollLeft>0');passed+=1
 page.get_by_role('button',name='十乐测试成片',exact=True).click();small=page.locator('.publishing-original .unified-detail');small.wait_for();box=small.bounding_box();assert box['x']>=0 and box['x']+box['width']<=542;passed+=1
 small.locator('.back-square').click();assert small.count()==0;passed+=1
 page.set_viewport_size({'width':1440,'height':900});page.get_by_role('button',name='展开导航',exact=True).click();page.get_by_role('button',name='项目工作台',exact=True).click();page.get_by_role('heading',name='我的待办',exact=True).wait_for();page.screenshot(path=str(out/'workbench.png'))
 assert not errors,errors
 print(json.dumps({'passed':passed,'pageErrors':errors}));browser.close()
