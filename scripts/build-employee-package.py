#!/usr/bin/env python3
"""Package a committed, dependency-free employee client without any local data."""
import json,hashlib,zipfile,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
version='1.0.0'
files=['InstallEmployee.cmd','UpdateEmployee.cmd','install.ps1','start.mjs','server.mjs','store.mjs','updater.mjs','README.md','ui/index.html','ui/app.js','ui/style.css']
folder='OrbitEmployee-v'+version
out=root/'installers'/f'{folder}.zip'
manifest={'version':version,'sourceCommit':commit,'packageKind':'windows-employee-client','requires':{'node':'>=22.13.0','server':'>=3.25.0'},'files':[]}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for name in files:
  path='employee-client/'+name
  data=(root/path).read_bytes()
  if data!=subprocess.check_output(['git','show',f'{commit}:{path}'],cwd=root):raise RuntimeError('Commit before packaging: '+path)
  if name.endswith(('.ps1','.cmd')):
   data=data.decode('utf-8-sig').replace('\r\n','\n').replace('\n','\r\n').encode()
   if name.endswith('.ps1'):data=b'\xef\xbb\xbf'+data
  manifest['files'].append({'path':name,'sha256':hashlib.sha256(data).hexdigest()})
  z.writestr(folder+'/'+name,data)
 z.writestr(folder+'/employee-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode())
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 for f in manifest['files']:assert hashlib.sha256(z.read(folder+'/'+f['path'])).hexdigest()==f['sha256']
sha=hashlib.sha256(out.read_bytes()).hexdigest()
out.with_suffix('.zip.sha256').write_text(sha+'  '+out.name+'\n')
print(json.dumps({'path':str(out),'sourceCommit':commit,'bytes':out.stat().st_size,'sha256':sha}))
