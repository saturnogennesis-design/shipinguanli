$ErrorActionPreference = 'Stop'
try {
  $install = $PSScriptRoot
  $config = Join-Path $install 'deploy\windows\orbit-config.ps1'
  if (-not (Test-Path -LiteralPath $config)) {
    $install = Read-Host 'Enter the host installation folder (example D:\OrbitVideoApp)'
    $config = Join-Path $install 'deploy\windows\orbit-config.ps1'
  }
  if (-not (Test-Path -LiteralPath $config)) { throw 'Host configuration not found. No data was changed.' }
  $settings = [IO.File]::ReadAllText($config)
  $dbMatch = [regex]::Match($settings, '(?m)^\s*\$DatabasePath\s*=\s*''((?:[^'']|'''')*)''\s*$')
  $nodeMatch = [regex]::Match($settings, '(?m)^\s*\$NodePath\s*=\s*''((?:[^'']|'''')*)''\s*$')
  if (-not $dbMatch.Success -or -not $nodeMatch.Success) { throw 'Unable to read configured database or Node path. No data was changed.' }
  $database = $dbMatch.Groups[1].Value.Replace("''", "'")
  $node = $nodeMatch.Groups[1].Value.Replace("''", "'")
  $output = Join-Path $PSScriptRoot ('task-check-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
  & $node --no-warnings (Join-Path $PSScriptRoot 'export-task-check.mjs') --db $database --install-dir $install --output $output
  if ($LASTEXITCODE -ne 0) { throw 'Export failed. No repair was performed.' }
  Write-Host ('Send this JSON report for task diagnosis: ' + $output)
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
