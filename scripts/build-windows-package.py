#!/usr/bin/env python3
"""Build an online Windows install/update ZIP from a committed source tree."""
import hashlib,json,subprocess,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0')
folders={'app','lib','db','drizzle','public','deploy','docs'}
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
required={'Install.cmd','Update.cmd','deploy/windows/launch-install.ps1','deploy/windows/launch-update.ps1','deploy/windows/verify-package.ps1','drizzle/0040_cross_product_sampling.sql','drizzle/0041_cross_source_lock.sql','安装包使用说明.md','V3.22-需求对账与验收.md'}
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
