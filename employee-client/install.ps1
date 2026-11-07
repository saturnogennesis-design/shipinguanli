param([switch]$UpdateOnly)
$ErrorActionPreference='Stop'
$node=(Get-Command node -ErrorAction SilentlyContinue).Source
if(-not $node){throw 'Please install Node.js 22.13 or newer from https://nodejs.org, then run again.'}
$version=& $node -p 'process.versions.node'
$parts=$version.Split('.')
if([int]$parts[0] -lt 22 -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -lt 13)){throw 'Node.js 22.13 or newer is required.'}
$target=Join-Path $env:LOCALAPPDATA 'OrbitEmployee'
$app=Join-Path $target 'app'
$data=Join-Path $target 'data'
if($UpdateOnly -and -not(Test-Path $app)){throw 'Employee client is not installed. Run InstallEmployee.cmd first.'}
New-Item -ItemType Directory -Force -Path $app,$data | Out-Null
# Restrict local cached files, upload queue and credentials to this Windows user.
$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $target /inheritance:r /grant:r "${identity}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' /T /C | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to restrict employee data directory permissions.'}
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
