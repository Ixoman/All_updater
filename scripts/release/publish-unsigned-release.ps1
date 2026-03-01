[CmdletBinding()]
param(
  [string]$Repo = 'Ixoman/All_updater',
  [string]$Target = 'dev'
)

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$packageJsonPath = Join-Path $workspaceRoot 'package.json'

if (-not (Test-Path $packageJsonPath)) {
  throw "Could not find package.json at $packageJsonPath"
}

$ghCommand = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghCommand) {
  throw "GitHub CLI (gh) is required for unsigned GitHub publishing."
}

$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$version = $packageJson.version

if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Could not read version from package.json"
}

$tag = "v$version"
$releaseDir = Join-Path $workspaceRoot 'release'
$zipPath = Join-Path $releaseDir "All-Updater-v$version-portable.zip"
$notesPath = Join-Path $workspaceRoot "RELEASE_NOTES_v$version.md"

if (-not (Test-Path $zipPath)) {
  throw "Expected ZIP artifact not found: $zipPath. Run 'npm run release:portable:unsigned' first."
}

if (-not (Test-Path $notesPath)) {
  throw "Release notes file not found: $notesPath"
}

$releaseExists = $false

& gh release view $tag --repo $Repo *> $null
if ($LASTEXITCODE -eq 0) {
  $releaseExists = $true
}

if ($releaseExists) {
  & gh release upload $tag $zipPath --clobber --repo $Repo
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload unsigned ZIP to existing release $tag"
  }
  Write-Host "Updated existing GitHub release $tag with $zipPath"
  exit 0
}

& gh release create $tag $zipPath --title $tag --notes-file $notesPath --repo $Repo --target $Target
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create GitHub release $tag"
}

Write-Host "Created GitHub release $tag with $zipPath"
