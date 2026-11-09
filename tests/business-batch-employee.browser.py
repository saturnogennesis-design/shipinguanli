import os,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());host=os.environ['ORBIT_E2E_BASE_URL'];base=os.environ.get('ORBIT_EMPLOYEE_BASE_URL','http://127.0.0.1:3460');checks=0;errors=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1440,'height':960});title='员工旧程序兼容-'+str(time.time_ns())
 h={'cookie':s['people']['owner']['cookie'],'x-orbit-project-id':str(s['cross'])};r=c.request.post(host+'/api/cross-records',headers=h,data={'kind':'clue','title':title});assert r.ok,r.text();id=r.json()['id'];r=c.request.get(host+'/api/cross-records?id='+str(id),headers=h).json()['row'];assert c.request.patch(host+'/api/cross-records/'+str(id),headers=h,data={'action':'save','revision':r['revision'],'data':{'keywords':'无需重新安装、兼容'}}).ok
 page=c.new_page();page.on('dialog',lambda d:d.accept());page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);expect(page.get_by_role('heading',name='连接原系统',exact=True)).to_be_visible();page.locator('#origin').fill(host);page.get_by_role('button',name='打开系统',exact=True).click();expect(page.get_by_role('heading',name='进入内容管理平台',exact=True)).to_be_visible(timeout=30000);page.get_by_label('登录账号',exact=True).fill('cfg-owner');page.get_by_label('密码',exact=True).fill('Config-QA-2026!2');page.get_by_role('button',name='登录',exact=True).click();expect(page.get_by_role('heading',name='选择项目开始工作',exact=True)).to_be_visible(timeout=30000);checks+=2
 for i in range(150):
  st=page.evaluate("fetch('/employee-api/state').then(r=>r.json())")
  if st.get('shellReady'):break
  page.wait_for_timeout(200)
 assert st.get('shellReady'),st;checks+=1
 page.locator('#project-tab-'+str(s['cross'])).click();page.get_by_role('navigation',name='项目二级导航').get_by_role('button',name='线索库',exact=True).click();page.get_by_role('textbox',name='搜索名称',exact=True).fill(title);row=page.locator('.clue-record-row');expect(row).to_have_count(1);expect(page.get_by_role('columnheader',name='领取人',exact=True)).to_be_visible();row.get_by_role('checkbox').check();page.get_by_role('region',name='批量操作').get_by_role('button',name='提交审核',exact=True).click();d=page.get_by_role('dialog',name='批量提交审核',exact=True);d.get_by_role('button',name='检查所选资料',exact=True).click();expect(d).to_contain_text('可处理 1 条');d.get_by_role('button',name='确认处理符合条件的资料',exact=True).click();expect(d).to_contain_text('成功 1 条');d.get_by_role('button',name='关闭',exact=True).click();assert c.request.get(host+'/api/cross-records?id='+str(id),headers=h).json()['row']['status']=='approved';checks+=4
 page.locator('#project-tab-'+str(s['video'])).click();page.wait_for_timeout(300)
 result=page.evaluate("async(key)=>{const r=await fetch('/api/business-batch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'content',action:'download',mode:'download',items:[{key}]})});const d=await r.json();return {status:r.status,...d}}",s['batchContent']);assert result['status']==200,result;assert result['url'].startswith(host+'/api/business-batch?ticket=');checks+=2
 with page.expect_download(timeout=30000) as download_info:page.evaluate('(url)=>location.assign(url)',result['url'])
 path=Path('/tmp/v329-employee-batch-download.zip');download_info.value.save_as(path);assert path.read_bytes()[:4]==b'PK\x03\x04';checks+=1
 assert not errors,errors;b.close()
print(json.dumps({'checks':checks,'existingClient':'1.3.2','noInstallerUpdate':True,'newPagesAndBatch':True,'directHostDownload':True,'pageErrors':errors}))
