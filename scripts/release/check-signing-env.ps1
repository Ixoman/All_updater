[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Get-FirstNonEmpty([string[]]$values) {
    foreach ($v in $values) {
        if (-not [string]::IsNullOrWhiteSpace($v)) { return $v }
    }
    return $null
}

$link = Get-FirstNonEmpty @($env:WIN_CSC_LINK, $env:CSC_LINK)
$name = Get-FirstNonEmpty @($env:WIN_CSC_NAME, $env:CSC_NAME)
$password = Get-FirstNonEmpty @($env:WIN_CSC_KEY_PASSWORD, $env:CSC_KEY_PASSWORD)

if (-not $link -and -not $name) {
    Write-Error @"
[signing:check] Missing signing identity.
Set one of:
  - WIN_CSC_LINK (or CSC_LINK) to .pfx path/url/base64
  - WIN_CSC_NAME (or CSC_NAME) for certificate subject in store
"@
}

if ($link) {
    $linkType = 'value'
    if ($link -match '^https?://') {
        $linkType = 'url'
    } elseif ($link -match '^(file://|[A-Za-z]:\\|\\\\)') {
        $linkType = 'path'
    } elseif ($link -match '^[A-Za-z0-9+/=]+$') {
        $linkType = 'base64'
    }

    if (-not $password) {
        Write-Warning "[signing:check] WIN_CSC_KEY_PASSWORD/CSC_KEY_PASSWORD is empty. If your .pfx is protected, build will fail."
    }

    Write-Host "[signing:check] Signing link detected ($linkType)."
} else {
    Write-Host "[signing:check] Signing identity by subject name detected."
}

Write-Host "[signing:check] OK - signing variables present."
