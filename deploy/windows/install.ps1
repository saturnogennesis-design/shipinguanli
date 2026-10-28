param(
  [string]$InstallDir = "D:\OrbitVideoApp",
  [string]$DatabaseDir = "",
  [string]$MediaDir = "F:\OrbitVideoMedia",
  [string]$BackupDir = "",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator, then run install.ps1 again."
  }
}

function Resolve-DefaultDataDrive {
  if (Test-Path "D:\") { return "D:\OrbitVideoData" }
  return "C:\OrbitVideoData"
}

function Resolve-MediaDirectory {
  param([string]$Requested)
  if ($Requested) { return $Requested }
  $volume = Get-Volume | Where-Object { $_.FileSystemLabel -eq "TOSHIBA" -and $_.DriveLetter } | Select-Object -First 1
  if (-not $volume) {
    throw "TOSHIBA media drive was not found. Connect it or pass -MediaDir explicitly."
  }
  return "$($volume.DriveLetter):\OrbitVideoMedia"
}

function Ensure-MediaDirectory {
  param([string]$Path)
  try {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    & icacls.exe $Path /grant "SYSTEM:(OI)(CI)M" /T /C | Out-Host
    if ($LASTEXITCODE -gt 0) { throw "icacls exited with code $LASTEXITCODE" }
    if (-not (Test-Path $Path)) { throw "media directory was not created" }
  } catch {
    throw "Media directory is unavailable or not writable: $Path. Connect the F: drive or pass -MediaDir with a local path. Details: $($_.Exception.Message)"
  }
}

function Copy-Application {
  param([string]$Source, [string]$Destination)
  $sourceFull = [IO.Path]::GetFullPath($Source).TrimEnd('\')
  $destinationFull = [IO.Path]::GetFullPath($Destination).TrimEnd('\')
  if ($sourceFull -eq $destinationFull) { return }
  New-Item -ItemType Directory -Force -Path $destinationFull | Out-Null
  & robocopy $sourceFull $destinationFull /E /R:2 /W:2 /XD node_modules .git .wrangler dist data outputs /XF *.zip | Out-Host
  if ($LASTEXITCODE -gt 7) { throw "Application copy failed with robocopy code $LASTEXITCODE." }
}

Assert-Administrator

if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port must be between 1024 and 65535." }
$sourceDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
Copy-Application -Source $sourceDir -Destination $InstallDir

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "Node.js 22 or newer is required. Install the Node.js 22 LTS Windows x64 version, then rerun this script."
}
$nodeVersion = & $nodeCommand.Source -p "process.versions.node"
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 22) { throw "Node.js 22 or newer is required. Current version: $nodeVersion" }

$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $pnpmCommand) {
  & npm.cmd install --global pnpm@11.19.0
  if ($LASTEXITCODE -ne 0) { throw "pnpm installation failed." }
  $pnpmCommand = Get-Command pnpm.cmd -ErrorAction Stop
}

if (-not $DatabaseDir) { $DatabaseDir = Join-Path (Resolve-DefaultDataDrive) "database" }
$MediaDir = Resolve-MediaDirectory -Requested $MediaDir
if (-not $BackupDir) {
  $BackupDir = if (Test-Path "E:\") { "E:\OrbitVideoBackups" } else { Join-Path (Resolve-DefaultDataDrive) "backups" }
}

New-Item -ItemType Directory -Force -Path $DatabaseDir, $BackupDir, (Join-Path $InstallDir "logs") | Out-Null
Ensure-MediaDirectory -Path $MediaDir

$configPath = Join-Path $InstallDir "deploy\windows\orbit-config.ps1"
$databasePath = Join-Path $DatabaseDir "orbit-video.sqlite"
$nodePath = $nodeCommand.Source
@"
`$AppDir = '$($InstallDir.Replace("'", "''"))'
`$NodePath = '$($nodePath.Replace("'", "''"))'
`$DatabasePath = '$($databasePath.Replace("'", "''"))'
`$MediaDir = '$($MediaDir.Replace("'", "''"))'
`$BackupDir = '$($BackupDir.Replace("'", "''"))'
`$Port = $Port
"@ | Set-Content -Encoding UTF8 $configPath

Push-Location $InstallDir
try {
  & $pnpmCommand.Source install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
  & $pnpmCommand.Source run build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
} finally {
  Pop-Location
}

$serverTaskName = "OrbitVideoServer"
$serverScript = Join-Path $InstallDir "deploy\windows\start-server.ps1"
$serverAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$serverScript`""
$serverTrigger = New-ScheduledTaskTrigger -AtStartup
$serverTrigger.Delay = "PT1M"
$serverSettings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable -MultipleInstances IgnoreNew
$systemPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $serverTaskName -Action $serverAction -Trigger $serverTrigger -Settings $serverSettings -Principal $systemPrincipal -Force | Out-Null

$backupTaskName = "OrbitVideoDatabaseBackup"
$backupScript = Join-Path $InstallDir "deploy\windows\backup.ps1"
$backupAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
$backupTrigger = New-ScheduledTaskTrigger -Daily -At "02:00"
$backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName $backupTaskName -Action $backupAction -Trigger $backupTrigger -Settings $backupSettings -Principal $systemPrincipal -Force | Out-Null

$firewallName = "Orbit Video LAN TCP $Port"
Get-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null

Start-ScheduledTask -TaskName $serverTaskName
Start-Sleep -Seconds 5

$addresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254*" -and $_.PrefixOrigin -ne "WellKnown"
} | Select-Object -ExpandProperty IPAddress -Unique
$lines = @(
  "Orbit Video Server",
  "Local URL: http://127.0.0.1:$Port/",
  "LAN URLs:"
) + ($addresses | ForEach-Object { "http://$($_):$Port/" }) + @(
  "Database: $databasePath",
  "Media: $MediaDir",
  "Backup: $BackupDir"
)
$infoPath = Join-Path $InstallDir "deployment-info.txt"
$lines | Set-Content -Encoding UTF8 $infoPath
$lines | ForEach-Object { Write-Host $_ }
Write-Host "Installation completed. Open the Local URL on this server to create the first administrator."
