$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$configPath = Join-Path $PSScriptRoot "orbit-config.ps1"
if (-not (Test-Path $configPath)) { throw "Configuration not found. Run install.ps1 first." }
. $configPath

$healthUrl = "http://127.0.0.1:$Port/api/system/health"
$lastError = ""
$details = $null
for ($attempt = 1; $attempt -le 12; $attempt += 1) {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 10
    if ($response.status -eq "ok" -and $response.database -eq "ready" -and $response.media -eq "ready") {
      $response | ConvertTo-Json -Depth 5
      Write-Host "Orbit Video Server is ready."
      exit 0
    }
    $lastError = "Health response was not ready: $($response | ConvertTo-Json -Compress -Depth 5)"
  } catch {
    # Windows PowerShell 在部分网络异常下会把 ErrorDetails 置为 $null；
    # 严格模式下直接读取 $null.Message 会遮盖真正的服务错误。
    $details = $_.ErrorDetails
    $lastError = if ($null -ne $details -and -not [string]::IsNullOrWhiteSpace([string]$details.Message)) { [string]$details.Message } else { [string]$_.Exception.Message }
  }
  Start-Sleep -Seconds 3
}

$errorLog = Join-Path $AppDir "logs\server-error.log"
if (Test-Path $errorLog) {
  Write-Host "Recent server errors:"
  Get-Content $errorLog -Tail 40 | Out-Host
}
throw "Server health check failed after 36 seconds. $lastError"
