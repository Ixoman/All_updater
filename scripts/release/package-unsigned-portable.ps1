[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$packageJsonPath = Join-Path $workspaceRoot 'package.json'

if (-not (Test-Path $packageJsonPath)) {
  throw "Could not find package.json at $packageJsonPath"
}

$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$version = $packageJson.version

if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Could not read version from package.json"
}

$releaseDir = Join-Path $workspaceRoot 'release'
$exeName = "All Updater-$version.exe"
$exePath = Join-Path $releaseDir $exeName

if (-not (Test-Path $exePath)) {
  throw "Expected unsigned portable artifact not found: $exePath. Run 'npm run build:portable:unsigned' first."
}

$zipName = "All-Updater-v$version-portable.zip"
$zipPath = Join-Path $releaseDir $zipName

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path $exePath -DestinationPath $zipPath -CompressionLevel Optimal -Force

Write-Host "Unsigned ZIP package created: $zipPath"
