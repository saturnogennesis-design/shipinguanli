$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$configPath = Join-Path $PSScriptRoot "orbit-config.ps1"
if (-not (Test-Path $configPath)) { throw "Configuration not found. Run install.ps1 first." }
. $configPath

if (-not (Test-Path $DatabasePath)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $DatabasePath -Parent) | Out-Null
}
try {
  New-Item -ItemType Directory -Force -Path $MediaDir | Out-Null
  & icacls.exe $MediaDir /grant "SYSTEM:(OI)(CI)M" /T /C | Out-Null
} catch {
  throw "Media directory is unavailable or not writable: $MediaDir. Connect the F: drive or repair the configured media path. Details: $($_.Exception.Message)"
}
if (-not (Test-Path $MediaDir)) { throw "Media directory is unavailable: $MediaDir" }

$env:NODE_ENV = "production"
$env:ORBIT_DB_PATH = $DatabasePath
$env:ORBIT_MEDIA_DIR = $MediaDir
$env:ORBIT_MIGRATIONS_DIR = Join-Path $AppDir "drizzle"

$logDir = Join-Path $AppDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$serviceLogPath = Join-Path $logDir "service.log"
$outputLogPath = Join-Path $logDir "server-output.log"
$errorLogPath = Join-Path $logDir "server-error.log"
$cliPath = Join-Path $AppDir "node_modules\vinext\dist\cli.js"
Set-Location $AppDir

while ($true) {
  if (-not (Test-Path $MediaDir)) {
    "[$(Get-Date -Format s)] Media directory unavailable: $MediaDir. Retrying in 15 seconds." | Add-Content -Encoding UTF8 $serviceLogPath
    Start-Sleep -Seconds 15
    continue
  }

  "[$(Get-Date -Format s)] Starting Orbit Video Server on port $Port with database $DatabasePath" | Add-Content -Encoding UTF8 $serviceLogPath
  try {
    $arguments = "`"$cliPath`" start -p $Port -H 0.0.0.0"
    $process = Start-Process -FilePath $NodePath -ArgumentList $arguments -WorkingDirectory $AppDir -RedirectStandardOutput $outputLogPath -RedirectStandardError $errorLogPath -PassThru -Wait -WindowStyle Hidden
    "[$(Get-Date -Format s)] Server process exited with code $($process.ExitCode). Restarting in 5 seconds." | Add-Content -Encoding UTF8 $serviceLogPath
  } catch {
    "[$(Get-Date -Format s)] Server launch failed: $($_.Exception.Message). Restarting in 5 seconds." | Add-Content -Encoding UTF8 $serviceLogPath
  }
  Start-Sleep -Seconds 5
}
