"""Lamp preview, compact list layout and thumbnail-only loading on synthetic data."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
state=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];passed=0
out=Path('/workspace/qa-next/lamps');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1544,'height':900});name,value=state['adminCookie'].split('=',1);context.add_cookies([{'name':name,'value':value,'url':base}]);page=context.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.goto(base);page.get_by_role('button',name='项目管理',exact=True).click();project=page.locator('.module-table tbody tr').filter(has=page.get_by_role('button',name='十乐',exact=True));project.get_by_role('button',name='维护项目').click();page.get_by_role('button',name='发布目标账号',exact=True).click();target=page.locator('.module-table tbody tr').filter(has=page.get_by_text('十乐主号',exact=True));target.get_by_role('button',name='修改',exact=True).click();dialog=page.get_by_role('dialog',name='修改发布目标账号');dialog.get_by_label('灯内文字',exact=True).fill('视频号十乐');dialog.get_by_label('点亮颜色',exact=True).fill('#db2777')
 preview=dialog.get_by_label('发布灯效果预览');expect(preview.get_by_role('button',name='十乐主号：已发布')).to_have_text('视频号十乐');expect(preview.get_by_role('button',name='十乐主号：已发布').locator('.publishing-lamp-face')).to_have_css('background-color','rgb(219, 39, 119)');expect(preview.get_by_role('button',name='十乐主号：未发布').locator('.publishing-lamp-face')).to_have_css('background-color','rgb(201, 206, 214)');passed+=1
 page.screenshot(path=str(out/'lamp-preview.png'));dialog.get_by_role('button',name='保存',exact=True).click();expect(dialog).to_have_count(0);passed+=1
 page.once('dialog',lambda d:d.accept());page.locator(f"#project-tab-{state['a']}").click();page.get_by_role('button',name='发布管理',exact=True).click();row=page.locator('.publishing-list tbody tr').filter(has=page.get_by_role('button',name=state['layoutContentTitle'],exact=True));row.wait_for()
 title=row.locator('.publishing-content-title');expect(title).to_have_css('-webkit-line-clamp','2');assert title.bounding_box()['width']<=181;assert title.bounding_box()['height']<=43;assert title.get_attribute('title')==state['layoutContentTitle'];passed+=1
 label=row.locator('.publishing-product>span:last-child');expect(label).to_have_css('-webkit-line-clamp','2');assert label.bounding_box()['height']<=37;assert label.get_attribute('title')==state['thumbnailProductName'];passed+=1
 thumb=row.locator('.publishing-product img');expect(thumb).to_be_visible();page.wait_for_function('(el)=>el.complete&&el.naturalWidth>0',arg=thumb.element_handle());assert thumb.evaluate('(el)=>el.naturalWidth')<=320;passed+=1
 product_path=f"/api/product-masters/{state['thumbnailProduct']}/image";seen=[url for url in requests if product_path in url];assert seen and all('thumb=1' in url for url in seen);passed+=1
 row.locator('.publishing-product .product-image-button').click();large=page.get_by_role('dialog',name=state['thumbnailProductName']);expect(large).to_be_visible();img=large.locator('.product-lightbox img');page.wait_for_function('(el)=>el.complete&&el.naturalWidth>0',arg=img.element_handle());assert img.evaluate('(el)=>el.naturalWidth')==2400;large.get_by_role('button',name='关闭弹窗').click();passed+=1

 if row.get_by_role('button',name='十乐主号：已发布',exact=True).count():
  page.once('dialog',lambda d:d.accept());row.get_by_role('button',name='十乐主号：已发布',exact=True).click();expect(row.get_by_role('button',name='十乐主号：未发布',exact=True)).to_be_visible()
 lamp=row.get_by_role('button',name='十乐主号：未发布',exact=True);lamp.click();lamp=row.get_by_role('button',name='十乐主号：已发布',exact=True);expect(lamp).to_have_text('视频号十乐');expect(lamp.locator('.publishing-lamp-face')).to_have_css('background-color','rgb(219, 39, 119)');passed+=1
 assert row.locator('.target-lights small').count()==0;assert '桃符纪旗舰店' not in row.locator('.target-lights').inner_text();assert row.locator('.target-lights .publishing-lamp').count()==4;passed+=1
 expect(row.get_by_role('button',name='详情',exact=True)).to_have_css('white-space','nowrap');passed+=1
 page.screenshot(path=str(out/'publishing-compact.png'));page.set_viewport_size({'width':1024,'height':720});page.get_by_role('button',name='收起导航',exact=True).click();page.wait_for_timeout(250);expect(page.get_by_role('region',name='当前表格横向滚动')).to_be_visible();passed+=1
 assert not errors,errors;print(json.dumps({'passed':passed,'pageErrors':errors,'productLoadsThumbnailBeforePreview':True}));browser.close()
