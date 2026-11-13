"""Batch clue UI, real upload protocol and retry; temporary QA database only."""
import os,json,time,struct,zlib,base64
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];assert base.startswith('http://127.0.0.1:');prefix='批量验收'+str(time.time_ns());checks=0;errors=[];out=Path('/tmp/v332-screenshots');out.mkdir(exist_ok=True)
def png():
 def ck(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+ck(b'IHDR',struct.pack('>IIBBBBB',80,80,8,2,0,0,0))+ck(b'IDAT',zlib.compress((b'\0'+b'\xb7\xd0\xe8'*80)*80))+ck(b'IEND',b'')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1500,'height':960});n,v=s['cookie'].split('=',1);context.add_cookies([{'name':n,'value':v,'url':base}]);page=context.new_page();page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)))
 def confirm(yes=True):
  d=page.get_by_role('dialog');expect(d).to_be_visible();d.get_by_role('button',name='确认继续' if yes else '取消',exact=True).click()
 def items():
  r=context.request.get(base+'/api/cross-records?projectId='+str(s['project']));assert r.status==200,r.text();return [r for r in r.json()['items'] if r['title'].startswith(prefix)]
 page.goto(base,wait_until='networkidle');print('loaded',flush=True);page.locator('#project-tab-'+str(s['project'])).click();confirm();nav=page.get_by_role('navigation',name='项目二级导航');nav.get_by_role('button',name='线索库',exact=True).click();page.get_by_role('button',name='新增线索',exact=True).click();expect(page.get_by_role('heading',name='批量新建线索',exact=True)).to_be_visible();checks+=1;print('composer opened',flush=True)
 for _ in range(3):page.get_by_role('button',name='＋ 新增一条线索',exact=True).click()
 entries=page.locator('.clue-batch-entry');expect(entries).to_have_count(4);checks+=1
 a,b,c=[entries.nth(i) for i in range(3)]
 a.get_by_label('线索名称',exact=True).fill(prefix+'甲');a.get_by_label('标签（关键词）',exact=True).fill('戒指，银色,戒指,');a.get_by_label('来源（选填）',exact=True).fill('测试来源');expect(a.locator('.clue-tag-chips>.clue-tag')).to_have_count(2);checks+=1
 a.locator('.clue-batch-drop').evaluate('(e,b64)=>{const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],"拖入甲.png",{type:"image/png"}));e.dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:d}));}',base64.b64encode(png()).decode());expect(a.locator('.clue-batch-image')).to_have_count(1);checks+=1
 b.get_by_label('线索名称',exact=True).fill(prefix+'乙');b.get_by_text('选择已有标签',exact=True).click();b.get_by_role('button',name='戒指 ＋',exact=True).click();b.get_by_label('标签（关键词）',exact=True).fill('金色');b.get_by_label('标签（关键词）',exact=True).press('Enter');b.get_by_label('选择线索图片').set_input_files({'name':'乙.png','mimeType':'image/png','buffer':png()});expect(b.get_by_label('分配给',exact=True)).to_have_value('public');expect(b.locator('.clue-tag-chips>.clue-tag')).to_have_count(2);checks+=2
 c.get_by_label('线索名称',exact=True).fill(prefix+'待补充');page.screenshot(path=str(out/'batch-ready.png'));print('filled',flush=True);page.get_by_role('button',name='统一提交',exact=True).click();expect(page.get_by_role('dialog')).to_contain_text('本次提交 2 条');expect(page.get_by_role('dialog')).to_contain_text('1 条空白');expect(page.get_by_role('dialog')).to_contain_text('1 条内容不全');confirm(False);assert not items();checks+=4
 # Fail second record's first chunk; the first succeeds once, empty is removed, incomplete stays.
 count={'puts':0}
 def fail(route):
  if route.request.method=='PUT':
   count['puts']+=1
   if count['puts']==2:route.fulfill(status=503,json={'error':'模拟第二条上传中断'});return
  route.continue_()
 page.route('**/api/offline-uploads?*',fail);page.get_by_role('button',name='统一提交',exact=True).click();confirm();expect(page.get_by_role('alert')).to_contain_text('模拟第二条上传中断',timeout=30000);expect(entries).to_have_count(2);assert [x['title'] for x in items()]==[prefix+'甲'];checks+=3
 page.unroute('**/api/offline-uploads?*',fail);page.get_by_role('button',name='统一提交',exact=True).click();confirm();expect(entries).to_have_count(1,timeout=30000);expect(entries.get_by_label('线索名称',exact=True)).to_have_value(prefix+'待补充');assert sorted(x['title'] for x in items())==[prefix+'乙',prefix+'甲'];checks+=3
 # Going back or using navigation requires explicit discard; cancel retains form and files.
 page.get_by_role('button',name='← 返回线索库',exact=True).click();expect(page.get_by_role('dialog')).to_contain_text('退出将清除');confirm(False);expect(entries).to_have_count(1);nav.get_by_role('button',name='母版库',exact=True).click();confirm(False);expect(entries.get_by_label('线索名称',exact=True)).to_have_value(prefix+'待补充');checks+=3
 nav.get_by_role('button',name='母版库',exact=True).click();confirm();expect(page.locator('.clue-batch-composer')).to_have_count(0);nav.get_by_role('button',name='线索库',exact=True).click();page.get_by_role('button',name='新增线索',exact=True).click();expect(entries).to_have_count(1);expect(entries.get_by_label('线索名称',exact=True)).to_have_value('');entries.get_by_text('选择已有标签',exact=True).click();expect(entries.get_by_role('button',name='金色 ＋',exact=True)).to_be_visible();checks+=4
 # All-incomplete submission keeps data; completely empty confirmed row can be cleared safely.
 entries.get_by_label('线索名称',exact=True).fill(prefix+'不完整');page.get_by_role('button',name='统一提交',exact=True).click();confirm();expect(entries.get_by_label('线索名称',exact=True)).to_have_value(prefix+'不完整');entries.get_by_role('button',name='移除此条',exact=True).click();confirm();expect(entries.get_by_label('线索名称',exact=True)).to_have_value('');checks+=2
 # No Web Crypto: use HTTP fallback and still produce a verified original once.
 page.evaluate("Object.defineProperty(window.crypto,'subtle',{value:undefined,configurable:true})");entries.get_by_label('线索名称',exact=True).fill(prefix+'内网HTTP');entries.get_by_label('标签（关键词）',exact=True).fill('内网,');entries.get_by_label('选择线索图片').set_input_files({'name':'http.png','mimeType':'image/png','buffer':png()});page.get_by_role('button',name='统一提交',exact=True).click();confirm();expect(entries.get_by_label('线索名称',exact=True)).to_have_value('',timeout=30000);assert len(items())==3;checks+=2

 # Existing employee protocol: each row is saved locally once, then waits for host confirmation.
 page.evaluate("window.__ORBIT_EMPLOYEE__={protocol:2}");jobs={}
 def employee(route):
  path=route.request.url.split('/employee-api/')[1].split('?')[0]
  if path=='drafts':
   body=route.request.post_data_json;jobs[body['key']]=body;route.fulfill(json={'id':body['key'],'uploadMap':[0]})
  elif path=='ready':route.fulfill(json={'detail':{'row':{'id':-42}},'savedLocally':True})
  else:route.fulfill(json={'ok':True})
 page.route('**/employee-api/**',employee);entries.get_by_label('线索名称',exact=True).fill(prefix+'员工本机');entries.get_by_label('标签（关键词）',exact=True).fill('本机,');entries.get_by_label('选择线索图片').set_input_files({'name':'local.png','mimeType':'image/png','buffer':png()});page.get_by_role('button',name='统一提交',exact=True).click();confirm();expect(page.locator('.clue-batch-result')).to_contain_text('等待主机确认');assert len(jobs)==1 and next(iter(jobs.values()))['draft']['submit'] is True;assert len(items())==3;checks+=3;page.unroute('**/employee-api/**',employee);page.evaluate('delete window.__ORBIT_EMPLOYEE__')
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='收起导航',exact=True).click();page.get_by_role('button',name='＋ 新增一条线索',exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(out/'batch-narrow.png'));checks+=1
 assert not errors,errors;browser.close();print(json.dumps({'checks':checks,'pageErrors':errors,'screenshots':str(out)},ensure_ascii=False))
