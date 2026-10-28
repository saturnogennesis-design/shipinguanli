param([string]$InstallDir = "D:\OrbitVideoApp")

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$configPath = Join-Path $InstallDir "deploy\windows\orbit-config.ps1"
if (-not (Test-Path $configPath)) { throw "安装目录不存在：$InstallDir" }
. $configPath

New-Item -ItemType Directory -Force -Path $MediaDir | Out-Null
& icacls.exe $MediaDir /grant "SYSTEM:(OI)(CI)M" /T /C | Out-Host
if ($LASTEXITCODE -gt 0) { throw "媒体目录权限设置失败：$MediaDir" }

Stop-ScheduledTask -TaskName "OrbitVideoServer" -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName "OrbitVideoServer"
Write-Host "媒体目录已修复：$MediaDir" -ForegroundColor Green
Write-Host "平台地址：http://127.0.0.1:$Port/"
