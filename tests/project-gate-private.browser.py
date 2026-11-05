"""Master-only project gate/leader controls, including a non-master super administrator."""
import os,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
s=json.loads(Path(os.environ['ORBIT_QA_STATE_FILE']).read_text());base=os.environ['ORBIT_E2E_BASE_URL'];checks=0
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);admin=b.new_context(viewport={'width':1440,'height':1000});n,v=s['adminCookie'].split('=',1);admin.add_cookies([{'name':n,'value':v,'url':base}])
 def api(ctx,path,method='get',data=None,status=200):
  r=getattr(ctx.request,method)(base+path,**({'data':data} if data is not None else {}));assert r.status==status,(path,r.status,r.text());return r.json()
 catalog=api(admin,'/api/admin/project-permissions?projectId='+str(s['cross']));assert catalog['canSeeProjectGate'];assert 'users' in catalog;checks+=2
 role=next(r['id'] for r in api(admin,'/api/admin')['roles'] if r['code']=='super_admin');stamp=str(int(time.time()));username='gate-admin-'+stamp
 user=api(admin,'/api/admin','post',{'entity':'user','username':username,'displayName':'其他超级管理员验收','password':'Gate-QA-2026!','roleId':role},201)['id'];checks+=1
 gate=api(admin,f"/api/projects/{s['cross']}/visibility");api(admin,f"/api/projects/{s['cross']}/visibility",'put',{'userIds':list(set(gate['selected']+[user])),'leaderIds':gate['leaders']});checks+=1
 other=b.new_context(viewport={'width':1440,'height':1000});api(other,'/api/auth/login','post',{'username':username,'password':'Gate-QA-2026!'});api(other,'/api/auth/change-password','post',{'currentPassword':'Gate-QA-2026!','newPassword':'Gate-QA-2026!2'});checks+=2
 me=api(other,'/api/auth/me')['user'];assert me['roleCode']=='super_admin';checks+=1
 d=api(other,'/api/admin/project-permissions?projectId='+str(s['cross']));assert d['canSeeProjectGate'] is False;assert 'users' not in d and 'memberGroups' not in d;assert 'roles' in d;checks+=3
 api(other,f"/api/projects/{s['cross']}/visibility",status=403);api(other,f"/api/projects/{s['cross']}/visibility",'put',{'userIds':[user],'leaderIds':[user]},403);checks+=2
 assert not any(log['action']=='project.visibility' for log in api(other,'/api/audit-logs')['logs']);checks+=1
 assert api(other,'/api/admin')['groups']==[];checks+=1
 page=other.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base);page.get_by_role('button',name='组织与权限',exact=True).click();page.get_by_role('button',name='项目配置',exact=True).click();root=page.locator('.project-permissions');root.get_by_label('选择授权项目',exact=True).select_option(str(s['cross']));expect(root.get_by_role('heading',name='项目角色',exact=True)).to_be_visible();assert root.locator('.project-gate').count()==0;assert root.get_by_text('项目入口与项目长',exact=True).count()==0;assert root.get_by_label('允许进入',exact=True).count()==0;assert root.get_by_label('项目长',exact=True).count()==0;checks+=4
 root.get_by_role('button',name='新建角色',exact=True).click();dialog=page.get_by_role('dialog',name='新建项目角色');expect(dialog).to_be_visible();dialog.get_by_role('button',name='关闭弹窗',exact=True).click();checks+=1
 master=admin.new_page();master.goto(base);master.get_by_role('button',name='组织与权限',exact=True).click();master.get_by_role('button',name='项目配置',exact=True).click();master.locator('.project-permissions').get_by_label('选择授权项目',exact=True).select_option(str(s['cross']));expect(master.locator('.project-gate')).to_be_visible();checks+=1
 assert not errors,errors;b.close();print(json.dumps({'checks':checks,'nonMasterSuperAdminHidden':True,'masterVisible':True,'gateApiDenied':True,'auditRosterHidden':True}))
