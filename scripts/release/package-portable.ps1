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
  throw "Expected portable artifact not found: $exePath. Run 'npm run build:portable' first."
}

$zipName = "All-Updater-v$version-portable.zip"
$zipPath = Join-Path $releaseDir $zipName

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("all-updater-package-" + [guid]::NewGuid().ToString('N'))

try {
  New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null
  Copy-Item -LiteralPath $exePath -Destination (Join-Path $stagingDir $exeName) -Force
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stagingDir,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )
} finally {
  if (Test-Path $stagingDir) {
    Remove-Item $stagingDir -Recurse -Force
  }
}

Write-Host "Portable ZIP package created: $zipPath"
