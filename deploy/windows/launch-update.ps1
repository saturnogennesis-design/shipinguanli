param([string]$InstallDir = "D:\OrbitVideoApp")
$ErrorActionPreference = "Stop"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -InstallDir `"$InstallDir`""
  Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait
  exit
}
try {
  & (Join-Path $PSScriptRoot "update.ps1") -InstallDir $InstallDir
  Write-Host "Update finished. Refresh the browser with Ctrl+F5." -ForegroundColor Green
} catch {
  Write-Host $_ -ForegroundColor Red
} finally {
  Read-Host "Press Enter to close"
}
