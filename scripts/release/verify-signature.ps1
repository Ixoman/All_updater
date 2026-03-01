[CmdletBinding()]
param(
    [string]$Path
)

$ErrorActionPreference = 'Stop'

function Resolve-ArtifactPath([string]$inputPath) {
    if (-not [string]::IsNullOrWhiteSpace($inputPath)) {
        if (-not (Test-Path $inputPath)) {
            throw "[signing:verify-artifact] File not found: $inputPath"
        }
        return (Resolve-Path $inputPath).Path
    }

    $candidates = Get-ChildItem -Path "release" -Filter "*.exe" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "\\win-unpacked\\" } |
        Sort-Object LastWriteTime -Descending

    if (-not $candidates -or $candidates.Count -eq 0) {
        throw "[signing:verify-artifact] No .exe artifacts found in ./release"
    }

    return $candidates[0].FullName
}

$artifact = Resolve-ArtifactPath $Path
$signature = Get-AuthenticodeSignature -FilePath $artifact

$status = $signature.Status.ToString()
$signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { "n/a" }
$timestamp = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { "n/a" }

Write-Host "[signing:verify-artifact] Artifact: $artifact"
Write-Host "[signing:verify-artifact] Status:   $status"
Write-Host "[signing:verify-artifact] Signer:   $signer"
Write-Host "[signing:verify-artifact] Timestamp:$timestamp"

if ($status -ne 'Valid') {
    throw "[signing:verify-artifact] Signature is not valid (status=$status)."
}

if (-not $signature.TimeStamperCertificate) {
    Write-Warning "[signing:verify-artifact] Signature is valid but timestamp is missing. Consider adding timestamp server for long-term trust."
}
