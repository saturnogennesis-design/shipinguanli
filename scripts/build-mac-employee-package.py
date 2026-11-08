#!/usr/bin/env python3
"""Bundle verified native Mac runtime with a committed employee client."""
import argparse,hashlib,json,re,stat,subprocess,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--runtime-dir',type=Path,required=True);args=p.parse_args()
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
version=re.search(r"VERSION='([^']+)'",(root/'employee-client/server.mjs').read_text()).group(1)
runtime=args.runtime_dir;info=json.loads((runtime/'node-runtime.json').read_text());arch=info['arch']
assert arch in ('arm64','x64') and re.fullmatch(r'v24\.\d+\.\d+',info['version'])
assert info['source']==f"https://nodejs.org/dist/{info['version']}/node-{info['version']}-darwin-{arch}.tar.gz"
node=(runtime/'node').read_bytes();assert hashlib.sha256(node).hexdigest()==info['sha256']
assert node[:4]==b'\xcf\xfa\xed\xfe' and int.from_bytes(node[4:8],'little')=={'arm64':0x100000c,'x64':0x1000007}[arch]
files=['InstallEmployee.command','UpdateEmployee.command','install-mac.mjs','start.mjs','server.mjs','store.mjs','updater.mjs','original-system.mjs','ui/bridge.js','ui/connection.html','README-Mac.md','ui/index.html','ui/app.js','ui/style.css']
folder=f'OrbitEmployee-Mac-{arch}-v{version}';out=root/'installers'/(folder+'.zip')
manifest={'version':version,'sourceCommit':commit,'packageKind':'mac-employee-client','requires':{'macOS':'>=13.5','server':'>=3.28.0','platform':'darwin-'+arch,'bundledNode':info['version'],'networkForRuntime':False},'files':[]}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 def add(name,data,executable=False):
  zi=zipfile.ZipInfo(folder+'/'+name);zi.create_system=3;zi.external_attr=(stat.S_IFREG|(0o755 if executable else 0o644))<<16;zi.compress_type=zipfile.ZIP_DEFLATED;z.writestr(zi,data);manifest['files'].append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'executable':executable})
 for name in files:
  path='employee-client/'+name;data=(root/path).read_bytes()
  assert data==subprocess.check_output(['git','show',f'{commit}:{path}'],cwd=root),'Commit before packaging: '+path
  add(name,data,name.endswith('.command'))
 for name in ['node','node-runtime.json','node.sha256','arch.txt','LICENSE.txt']:add('runtime/'+name,(runtime/name).read_bytes(),name=='node')
 z.writestr(folder+'/employee-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode())
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 for f in manifest['files']:
  assert hashlib.sha256(z.read(folder+'/'+f['path'])).hexdigest()==f['sha256']
  if f['executable']:assert z.getinfo(folder+'/'+f['path']).external_attr>>16&0o111
sha=hashlib.sha256(out.read_bytes()).hexdigest();out.with_suffix('.zip.sha256').write_text(sha+'  '+out.name+'\n')
print(json.dumps({'path':str(out),'sourceCommit':commit,'arch':arch,'bytes':out.stat().st_size,'sha256':sha}))
