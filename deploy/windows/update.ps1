param(
  [string]$InstallDir = "D:\OrbitVideoApp"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator, then run update.ps1 again."
  }
}

Assert-Administrator
$sourceDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$configPath = Join-Path $InstallDir "deploy\windows\orbit-config.ps1"
if (-not (Test-Path $configPath)) { throw "Existing installation was not found at $InstallDir." }
. $configPath

$pnpmCommand = Get-Command pnpm.cmd -ErrorAction Stop
$task = Get-ScheduledTask -TaskName "OrbitVideoServer" -ErrorAction SilentlyContinue

Write-Host "Stopping the existing server before updating..."
$installedStopScript = Join-Path $InstallDir "deploy\windows\stop-server.ps1"
$sourceStopScript = Join-Path $sourceDir "deploy\windows\stop-server.ps1"
if (-not (Test-Path $installedStopScript)) {
  Copy-Item -LiteralPath $sourceStopScript -Destination $installedStopScript -Force
}
& $installedStopScript
Write-Host "Creating a database backup before updating..."
& (Join-Path $InstallDir "deploy\windows\backup.ps1")

$updated = $false
try {
  & robocopy $sourceDir $InstallDir /E /R:2 /W:2 /XD node_modules .git .wrangler dist data outputs /XF *.zip orbit-config.ps1 | Out-Host
  if ($LASTEXITCODE -gt 7) { throw "Application update copy failed with robocopy code $LASTEXITCODE." }

  Push-Location $InstallDir
  try {
    & $pnpmCommand.Source install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
    & $pnpmCommand.Source run build
    if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
  } finally {
    Pop-Location
  }
  if ($task) {
    $serverScript = Join-Path $InstallDir "deploy\windows\start-server.ps1"
    $serverAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$serverScript`""
    $serverSettings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable -MultipleInstances IgnoreNew
    Set-ScheduledTask -TaskName "OrbitVideoServer" -Action $serverAction -Settings $serverSettings | Out-Null
  }
  $updated = $true
} finally {
  if ($task) {
    Start-ScheduledTask -TaskName "OrbitVideoServer"
    Start-Sleep -Seconds 8
  }
}

if (-not $updated) { throw "Update did not complete. The server task has been restarted." }
& (Join-Path $InstallDir "deploy\windows\check-server.ps1")
Write-Host "Orbit Video Server update completed. Database and media files were preserved."
