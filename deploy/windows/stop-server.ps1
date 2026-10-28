param([switch]$KeepTaskDisabled)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$configPath = Join-Path $PSScriptRoot "orbit-config.ps1"
if (-not (Test-Path $configPath)) { throw "Configuration not found. Run install.ps1 first." }
. $configPath

$taskName = "OrbitVideoServer"
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

$processIds = @()
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listeners) { $processIds += $listeners | Select-Object -ExpandProperty OwningProcess -Unique }

$escapedAppDir = [Regex]::Escape($AppDir)
$orbitProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and $_.CommandLine -match $escapedAppDir -and
  ($_.CommandLine -match "start-server\.ps1" -or $_.CommandLine -match "vinext.*start")
}
if ($orbitProcesses) { $processIds += $orbitProcesses | Select-Object -ExpandProperty ProcessId -Unique }

foreach ($processId in ($processIds | Sort-Object -Unique)) {
  if ($processId -and $processId -ne $PID) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

$deadline = (Get-Date).AddSeconds(15)
do {
  $stillListening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $stillListening) { break }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)

if ($stillListening) { throw "Port $Port is still occupied after stopping Orbit Video Server." }
Write-Host "Orbit Video Server processes stopped."
