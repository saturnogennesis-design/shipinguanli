param([switch]$IncludeMedia)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$configPath = Join-Path $PSScriptRoot "orbit-config.ps1"
if (-not (Test-Path $configPath)) { throw "Configuration not found. Run install.ps1 first." }
. $configPath

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destination = Join-Path $BackupDir $stamp
$databaseBackup = Join-Path $destination "database"
New-Item -ItemType Directory -Force -Path $databaseBackup | Out-Null

$taskName = "OrbitVideoServer"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$wasRunning = $task -and ($task.State -eq "Running")
if ($wasRunning) {
  & (Join-Path $PSScriptRoot "stop-server.ps1")
}

try {
  foreach ($path in @($DatabasePath, "$DatabasePath-wal", "$DatabasePath-shm")) {
    if (Test-Path $path) { Copy-Item -Force $path $databaseBackup }
  }

  if ($IncludeMedia) {
    $mediaDrive = (Split-Path $MediaDir -Qualifier).TrimEnd('\')
    $backupDrive = (Split-Path $BackupDir -Qualifier).TrimEnd('\')
    if ($mediaDrive -eq $backupDrive) { throw "Media backup must use a different physical drive or NAS location." }
    $mediaBackup = Join-Path $destination "media"
    & robocopy $MediaDir $mediaBackup /MIR /COPY:DAT /DCOPY:DAT /R:2 /W:2 | Out-Host
    if ($LASTEXITCODE -gt 7) { throw "Media backup failed with robocopy code $LASTEXITCODE." }
  }

  @(
    "created_at=$(Get-Date -Format o)",
    "database=$DatabasePath",
    "media=$MediaDir",
    "media_included=$IncludeMedia"
  ) | Set-Content -Encoding UTF8 (Join-Path $destination "backup-manifest.txt")
} finally {
  if ($wasRunning) { Start-ScheduledTask -TaskName $taskName }
}

Get-ChildItem $BackupDir -Directory | Sort-Object CreationTime -Descending | Select-Object -Skip 30 | Remove-Item -Recurse -Force
Write-Host "Backup completed: $destination"
