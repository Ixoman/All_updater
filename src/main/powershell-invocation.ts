export interface PowerShellInvocation {
    script: string;
    env: Record<string, string>;
}

const signaturePathVariable = 'ALL_UPDATER_SIGNATURE_PATH';
const zipPathVariable = 'ALL_UPDATER_ZIP_PATH';
const zipDestinationVariable = 'ALL_UPDATER_ZIP_DESTINATION';

export function createSignaturePowerShellInvocation(filePath: string): PowerShellInvocation {
    return {
        script: [
            `$filePath = $env:${signaturePathVariable}`,
            "if ([string]::IsNullOrWhiteSpace($filePath)) { throw 'Missing signature file path.' }",
            '$sig = Get-AuthenticodeSignature -LiteralPath $filePath',
            '[pscustomobject]@{ Status = [string]$sig.Status; StatusMessage = [string]$sig.StatusMessage; Subject = [string]$sig.SignerCertificate.Subject } | ConvertTo-Json -Compress'
        ].join('; '),
        env: { [signaturePathVariable]: filePath }
    };
}

export function createZipExpandPowerShellInvocation(
    filePath: string,
    destinationPath: string
): PowerShellInvocation {
    return {
        script: [
            `$archivePath = $env:${zipPathVariable}`,
            `$destinationPath = $env:${zipDestinationVariable}`,
            "if ([string]::IsNullOrWhiteSpace($archivePath) -or [string]::IsNullOrWhiteSpace($destinationPath)) { throw 'Missing ZIP inspection path.' }",
            'Add-Type -AssemblyName System.IO.Compression.FileSystem',
            '[System.IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $destinationPath)'
        ].join('; '),
        env: {
            [zipPathVariable]: filePath,
            [zipDestinationVariable]: destinationPath
        }
    };
}
