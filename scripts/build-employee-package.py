#!/usr/bin/env python3
"""Package a committed, dependency-free employee client without any local data."""
import json,hashlib,zipfile,subprocess,argparse,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
args=argparse.ArgumentParser()
args.add_argument('--runtime-dir',type=Path,required=True)
options=args.parse_args()
version=re.search(r"VERSION='([^']+)'",(root/'employee-client/server.mjs').read_text()).group(1)
runtime=options.runtime_dir
runtime_info=json.loads((runtime/'node-runtime.json').read_text())
assert runtime_info['arch']=='x64'
assert re.fullmatch(r'v24\.\d+\.\d+',runtime_info['version'])
assert runtime_info['source']==f"https://nodejs.org/dist/{runtime_info['version']}/win-x64/node.exe"
assert hashlib.sha256((runtime/'node.exe').read_bytes()).hexdigest()==runtime_info['sha256']
assert (runtime/'node.exe').read_bytes()[:2]==b'MZ'
files=['InstallEmployee.cmd','UpdateEmployee.cmd','install.ps1','install-layout.mjs','start.mjs','server.mjs','store.mjs','updater.mjs','original-system.mjs','ui/bridge.js','ui/connection.html','README.md','ui/index.html','ui/app.js','ui/style.css']
folder='OrbitEmployee-v'+version
out=root/'installers'/f'{folder}.zip'
manifest={'version':version,'sourceCommit':commit,'packageKind':'windows-employee-client','requires':{'node':'>=22.13.0','server':'>=3.31.11','bundledNode':runtime_info['version'],'platform':'windows-x64','networkForRuntime':False},'files':[]}
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
 for name in ['node.exe','node-runtime.json','LICENSE.txt']:
  data=(runtime/name).read_bytes()
  manifest['files'].append({'path':'runtime/'+name,'sha256':hashlib.sha256(data).hexdigest()})
  z.writestr(folder+'/runtime/'+name,data)
 z.writestr(folder+'/employee-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode())
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 for f in manifest['files']:assert hashlib.sha256(z.read(folder+'/'+f['path'])).hexdigest()==f['sha256']
sha=hashlib.sha256(out.read_bytes()).hexdigest()
out.with_suffix('.zip.sha256').write_text(sha+'  '+out.name+'\n')
print(json.dumps({'path':str(out),'sourceCommit':commit,'bytes':out.stat().st_size,'sha256':sha}))
