$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (Test-Path (Join-Path $PSScriptRoot "orbit-config.ps1")) {
  & (Join-Path $PSScriptRoot "stop-server.ps1")
}

foreach ($taskName in @("OrbitVideoServer", "OrbitVideoDatabaseBackup")) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
}
Write-Host "Scheduled tasks were removed. Application data and media files were preserved."
