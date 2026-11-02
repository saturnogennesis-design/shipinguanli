param([string]$SourceRoot = ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))))
$ErrorActionPreference = "Stop"
$manifestPath = Join-Path $SourceRoot "release-manifest.json"
# Source checkouts do not include a generated release manifest.
if (-not (Test-Path -LiteralPath $manifestPath)) { return }
$root = [IO.Path]::GetFullPath($SourceRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$prefix = $root + [IO.Path]::DirectorySeparatorChar
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $manifest.files) {
  $path = [IO.Path]::GetFullPath((Join-Path $root $entry.path))
  if (-not $path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Invalid package manifest path."
  }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Package file is missing: $($entry.path)" }
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  if ($actual -ne $entry.sha256) { throw "Package file checksum failed: $($entry.path). Extract a fresh copy of the installation package." }
}
Write-Host "Package integrity verified: $($manifest.version)" -ForegroundColor Green
