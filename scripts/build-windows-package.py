#!/usr/bin/env python3
"""Build an online Windows install/update ZIP from a committed source tree."""
import hashlib,json,subprocess,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
folders={'app','lib','db','drizzle','public','deploy','docs','employee-client'}
root_files={'Install.cmd','Update.cmd','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','next-env.d.ts','next.config.ts','vite.config.ts','postcss.config.mjs','eslint.config.mjs','drizzle.config.ts'}
files=[]
for name in sorted(n for n in tracked if n):
 p=Path(name)
 if not (p.parts[0] in folders or len(p.parts)==1 and (name in root_files or p.suffix=='.md')):continue
 if p.name=='orbit-config.ps1' or p.suffix in {'.sqlite','.db'}:raise RuntimeError('Private runtime file in source tree: '+name)
 data=(root/p).read_bytes()
 committed=subprocess.check_output(['git','show',f'{commit}:{name}'],cwd=root)
 if data!=committed:raise RuntimeError('Commit source changes before packaging: '+name)
 if p.suffix.lower() in {'.ps1','.cmd'}:
  data=data.decode('utf-8-sig').replace('\r\n','\n').replace('\n','\r\n').encode('utf-8')
  if p.suffix.lower()=='.ps1':data=b'\xef\xbb\xbf'+data
 files.append((name,data))
required={'drizzle/0049_cross_work_and_transfer.sql','app/cross-workboard.tsx','app/cross-publication.tsx','app/transfer-station.tsx','lib/cross-work.ts','lib/cross-publication.ts','V3.30-制作待办与整包发布验收.md','app/cross-media-preview.tsx','lib/deletion-blockers.ts','V3.29.1-多图预览与删除关联验收.md','app/business-batch.tsx','app/api/business-batch/route.ts','drizzle/0048_business_batch_receipts.sql','V3.29-批量操作与页面重排验收.md','app/clue-library-view.tsx','V3.28-线索布局与返回刷新验收.md','drizzle/0047_assignment_and_permanent_delete.sql','lib/permanent-delete.ts','V3.27-线索分配删除与每日同步验收.md','drizzle/0046_content_sync_revision.sql','app/api/employee-shell/route.ts','employee-client/original-system.mjs','V3.26-同页无感同步验收.md','drizzle/0045_offline_uploads.sql','employee-client/server.mjs','employee-client/ui/index.html','Install.cmd','Update.cmd','deploy/windows/launch-install.ps1','deploy/windows/launch-update.ps1','deploy/windows/verify-package.ps1','drizzle/0040_cross_product_sampling.sql','drizzle/0041_cross_source_lock.sql','drizzle/0042_project_roles.sql','drizzle/0043_account_project_configuration.sql','drizzle/0044_project_update_reads.sql','安装包使用说明.md','V3.22-需求对账与验收.md','V3.23-项目权限配置与验收.md','V3.24-账号与项目配置验收.md'}
assert required.issubset({name for name,_ in files})
manifest={'version':version,'sourceCommit':commit,'packageKind':'windows-online-install-update','requires':{'node':'>=22.13.0','networkDuringInstall':True},'files':[{'path':name,'sha256':hashlib.sha256(data).hexdigest()} for name,data in files]}
folder=f'OrbitVideoSetup-v{version}'
out=root/'installers'/f'{folder}.zip';out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for name,data in files:z.writestr(folder+'/'+name,data)
 z.writestr(folder+'/release-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8'))
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 for entry in manifest['files']:assert hashlib.sha256(z.read(folder+'/'+entry['path'])).hexdigest()==entry['sha256']
sha=hashlib.sha256(out.read_bytes()).hexdigest()
out.with_suffix('.zip.sha256').write_text(sha+'  '+out.name+'\n')
print(json.dumps({'path':str(out),'version':version,'sourceCommit':commit,'files':len(files),'bytes':out.stat().st_size,'sha256':sha},ensure_ascii=False))
