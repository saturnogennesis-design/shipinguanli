param([switch]$UpdateOnly)
$ErrorActionPreference='Stop'
$target=Join-Path $env:LOCALAPPDATA 'OrbitEmployee'
$app=Join-Path $target 'app'
$data=Join-Path $target 'data'
if($UpdateOnly -and -not(Test-Path $app)){throw '尚未安装员工端，请先运行 InstallEmployee.cmd。'}
New-Item -ItemType Directory -Force -Path $app,$data | Out-Null
$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $target /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw '无法保护员工端数据目录，请检查当前 Windows 账号权限。'}
function Test-SupportedNode([string]$Path) {
 if(-not $Path -or -not(Test-Path -LiteralPath $Path)){return $false}
 try {
  $text=(& $Path -p 'process.versions.node' 2>$null | Out-String).Trim()
  if($LASTEXITCODE -ne 0 -or $text -notmatch '^([0-9]+)\.([0-9]+)\.([0-9]+)$'){return $false}
  return ([int]$Matches[1] -gt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -ge 13))
 } catch { return $false }
}
# An unreadable old executable is not a reason to discard data or abort the update.
function Test-VerifiedNode([string]$Path,[string]$ExpectedHash) {
 try {
  if(-not(Test-Path -LiteralPath $Path -PathType Leaf)){return $false}
  $hash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
  return ($hash -eq $ExpectedHash -and (Test-SupportedNode $Path))
 } catch { return $false }
}
$bundled=Join-Path $PSScriptRoot 'runtime\node.exe'
$manifestPath=Join-Path $PSScriptRoot 'runtime\node-runtime.json'
$node=$null
if((Test-Path -LiteralPath $bundled) -and (Test-Path -LiteralPath $manifestPath)) {
 $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
 $osArch=if($env:PROCESSOR_ARCHITEW6432){$env:PROCESSOR_ARCHITEW6432}else{$env:PROCESSOR_ARCHITECTURE}
 if($osArch -ne 'AMD64' -or $manifest.arch -ne 'x64'){throw '本安装包适用于 Windows x64。请勿在 32 位或 ARM Windows 上运行。'}
 if($manifest.version -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$' -or $manifest.sha256 -notmatch '^[a-f0-9]{64}$'){throw '运行环境清单无效，请重新下载并完整解压安装包。'}
 Write-Host '正在校验并准备员工端自带的运行环境，无需另装 Node.js...'
 $actual=(Get-FileHash -LiteralPath $bundled -Algorithm SHA256).Hash.ToLowerInvariant()
 if($actual -ne $manifest.sha256){throw '运行环境校验失败，请重新下载并完整解压安装包。'}
 $runtimeRoot=Join-Path $target 'runtime'
 New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
 $prefix=$manifest.version+'-'+$actual.Substring(0,12)
 # Reuse verified copies. Never replace an executable which Windows cannot read.
 $candidates=@(Get-ChildItem -LiteralPath $runtimeRoot -Directory -ErrorAction SilentlyContinue | Where-Object {$_.Name -like ($prefix+'-*')} | Sort-Object LastWriteTime -Descending | Select-Object -First 3)
 foreach($candidate in $candidates) {
  $candidateNode=Join-Path $candidate.FullName 'node.exe'
  if(Test-VerifiedNode $candidateNode $actual){$node=$candidateNode;break}
 }
 $legacyNode=Join-Path (Join-Path $runtimeRoot $manifest.version) 'node.exe'
 if(-not $node -and (Test-VerifiedNode $legacyNode $actual)){$node=$legacyNode}
 if(-not $node) {
  $runtime=Join-Path $runtimeRoot ($prefix+'-'+[Guid]::NewGuid().ToString('N'))
  $temporary=Join-Path $runtime 'node.tmp'
  try {
   New-Item -ItemType Directory -Path $runtime | Out-Null
   Copy-Item -LiteralPath $bundled -Destination $temporary
   if((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $actual){throw '运行环境复制校验失败。'}
   $node=Join-Path $runtime 'node.exe'
   Move-Item -LiteralPath $temporary -Destination $node
   Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime\LICENSE.txt') -Destination $runtime
   if(-not(Test-VerifiedNode $node $actual)){throw '新的运行环境无法读取或启动。'}
  } catch {
   Remove-Item -LiteralPath $runtime -Recurse -Force -ErrorAction SilentlyContinue
   throw ('无法准备新的员工端运行环境。原有资料和待同步文件已保留，旧程序尚未停止。请检查此路径的访问权限或安全软件拦截记录：'+$runtime+'。原因：'+$_.Exception.Message)
  }
 }
} else {
 $command=Get-Command node -ErrorAction SilentlyContinue
 if($command){$node=$command.Source}
 if(-not(Test-SupportedNode $node)){throw '运行环境文件缺失。请完整解压新版员工端安装包，保留 runtime 文件夹后重试。'}
}
if(-not(Test-SupportedNode $node)){throw '自带运行环境无法启动。请确认 Windows 为受支持的 x64 版本，并检查安全软件是否拦截 node.exe。'}
# Stop only this user's employee supervisor/worker, never the content server.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains((Join-Path $app 'start.mjs')) -or $_.CommandLine.Contains((Join-Path $app 'server.mjs')) -or $_.CommandLine.Contains((Join-Path $data 'releases'))) } | ForEach-Object {
 $owner=Invoke-CimMethod -InputObject $_ -MethodName GetOwner
 if(($owner.Domain+'\'+$owner.User) -eq $identity){Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
}
# The queue/cache live outside app; updating never removes or overwrites data.
Get-ChildItem $PSScriptRoot -File | Where-Object {$_.Extension -in '.mjs','.md'} | Copy-Item -Destination $app -Force
Copy-Item (Join-Path $PSScriptRoot 'ui') -Destination $app -Recurse -Force
Remove-Item (Join-Path $data 'active-release.json') -Force -ErrorAction SilentlyContinue
$launcher=Join-Path $target 'LaunchEmployee.vbs'
# Quote paths independently; no shell interpolation of employee content.
$vbs='Set shell = CreateObject("WScript.Shell")'+"`r`n"+'shell.Run """'+$node+'"" ""'+(Join-Path $app 'start.mjs')+'"" --open", 0, False'
[IO.File]::WriteAllText($launcher,$vbs,[Text.Encoding]::Unicode)
$startup=Join-Path ([Environment]::GetFolderPath('Startup')) 'OrbitEmployee.vbs'
$startupText='WScript.Sleep 30000'+"`r`n"+'Set shell = CreateObject("WScript.Shell")'+"`r`n"+'shell.Run """'+$node+'"" ""'+(Join-Path $app 'start.mjs')+'"" --background", 0, False'
[IO.File]::WriteAllText($startup,$startupText,[Text.Encoding]::Unicode)
$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Orbit Employee.lnk'))
$shortcut.TargetPath='wscript.exe';$shortcut.Arguments='"'+$launcher+'"';$shortcut.Save()
Start-Process wscript.exe -ArgumentList ('"'+$launcher+'"')
Write-Host 'Employee client installed. Open the desktop shortcut; enter the server address and employee account.'
Write-Host 'Data remains in %LOCALAPPDATA%\OrbitEmployee\data. Never delete it while uploads are pending.'
