param(
  [string]$InstallDir = "D:\OrbitVideoApp",
  [string]$MediaDir = "F:\OrbitVideoMedia"
)
$ErrorActionPreference = "Stop"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -InstallDir `"$InstallDir`" -MediaDir `"$MediaDir`""
  $process = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  exit $process.ExitCode
}
$exitCode = 0
try {
  & (Join-Path $PSScriptRoot "verify-package.ps1")
  $configPath = Join-Path $InstallDir "deploy\windows\orbit-config.ps1"
  if (Test-Path $configPath) {
    throw "An existing installation was found at $InstallDir. Close this window and run Update.cmd from the extracted package instead."
  }
  & (Join-Path $PSScriptRoot "install.ps1") -InstallDir $InstallDir -MediaDir $MediaDir
  & (Join-Path $InstallDir "deploy\windows\check-server.ps1")
  Write-Host "Installation finished. Open deployment-info.txt in the application folder for the server address." -ForegroundColor Green
} catch {
  $exitCode = 1
  Write-Host $_ -ForegroundColor Red
} finally {
  Read-Host "Press Enter to close"
}
exit $exitCode
