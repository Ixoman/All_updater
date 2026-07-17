import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { RestoreFailureReason, RestorePointResult, RestorePointVerificationResult } from '../../shared/types';
import { isValidRestoreSequence, parseRestoreSequence } from '../restore-validation.js';

export class SystemRestoreService {
    private getRestoreLogPath(): string {
        return path.join(app.getPath('userData'), 'restore_debug.txt');
    }

    private writeRestoreLog(message: string): void {
        try {
            const line = `[${new Date().toISOString()}] ${message}\n`;
            fs.appendFileSync(this.getRestoreLogPath(), line, 'utf8');
        } catch (error) {
            console.error('[Restore] Could not write restore log:', error);
        }
    }

    private escapeSingleQuoted(text: string): string {
        return text.replace(/'/g, "''");
    }

    private async runPowerShellScript(script: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
        const result = await execa('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            script
        ], { reject: false });

        return {
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            exitCode: result.exitCode ?? null
        };
    }

    private async getLatestRestoreSequence(): Promise<number | null> {
        const script = "$ErrorActionPreference='SilentlyContinue'; $rp = Get-ComputerRestorePoint | Sort-Object SequenceNumber -Descending | Select-Object -First 1 SequenceNumber; if ($null -eq $rp) { '' } else { $rp.SequenceNumber }";
        const result = await this.runPowerShellScript(script);
        return parseRestoreSequence(result.stdout);
    }

    private async findRestoreSequenceByDescription(description: string): Promise<number | null> {
        const escapedDescription = this.escapeSingleQuoted(description);
        const script =
            "$ErrorActionPreference='SilentlyContinue'; " +
            `$target = '${escapedDescription}'; ` +
            "$rp = Get-ComputerRestorePoint | Where-Object { $_.Description -eq $target } | Sort-Object SequenceNumber -Descending | Select-Object -First 1 SequenceNumber; " +
            "if ($null -eq $rp) { '' } else { $rp.SequenceNumber }";

        const result = await this.runPowerShellScript(script);
        return parseRestoreSequence(result.stdout);
    }

    private async getRestorePointBySequence(sequenceNumber: number): Promise<{ sequenceNumber: number; description: string } | null> {
        if (!isValidRestoreSequence(sequenceNumber)) return null;

        const script =
            "$ErrorActionPreference='SilentlyContinue'; " +
            `$target = ${sequenceNumber}; ` +
            "$rp = Get-ComputerRestorePoint | Where-Object { $_.SequenceNumber -eq $target } | Select-Object -First 1 SequenceNumber, Description; " +
            "if ($null -eq $rp) { '' } else { ConvertTo-Json -InputObject $rp -Compress }";

        const result = await this.runPowerShellScript(script);
        const raw = result.stdout.trim();
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw) as { SequenceNumber?: unknown; Description?: unknown };
            const sequence = Number(parsed.SequenceNumber);
            if (!isValidRestoreSequence(sequence)) return null;
            return {
                sequenceNumber: sequence,
                description: typeof parsed.Description === 'string' ? parsed.Description : ''
            };
        } catch {
            return null;
        }
    }

    private normalize(text: string): string {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    private classifyRestoreFailure(output: string): RestoreFailureReason {
        const normalized = this.normalize(output);

        if (
            /system protection.*(turned off|disabled)|system restore.*disabled|proteccion del sistema.*desactiv|restauracion del sistema.*desactiv|no hay unidades que tengan habilitada la proteccion/.test(normalized)
        ) {
            return 'system-protection-disabled';
        }

        if (
            /already been created within the past|restore point.*frequency|ya se ha creado.*punto de restauracion|limite de frecuencia/.test(normalized)
        ) {
            return 'frequency-limit';
        }

        if (
            /access is denied|permiso denegado|administrator privileges|required elevation|elevacion/.test(normalized)
        ) {
            return 'access-denied';
        }

        if (
            /vss|volume shadow copy|software shadow copy provider|task scheduler|programador de tareas|rpc server|servicio.*sombra|servicio.*deshabilitad|service.*disabled|service.*not running/.test(normalized)
        ) {
            return 'service-unavailable';
        }

        if (
            /checkpoint-computer|restore point|punto de restauracion/.test(normalized)
        ) {
            return 'command-failed';
        }

        return 'unknown';
    }

    private buildDetails(stdout: string, stderr: string, exitCode: number | null): string {
        const merged = [stdout, stderr].filter(Boolean).join('\n').trim();
        const compact = merged.replace(/\s+/g, ' ').trim();
        const limited = compact.length > 900 ? `${compact.slice(0, 900)}...` : compact;
        return `exitCode=${exitCode ?? 'null'}; output=${limited || 'n/a'}`;
    }

    async createRestorePoint(description: string = "All Updater Auto-Restore"): Promise<RestorePointResult> {
        this.writeRestoreLog(`Restore request received. Description="${description}"`);
        try {
            const beforeSequence = await this.getLatestRestoreSequence();
            this.writeRestoreLog(`Before sequence=${beforeSequence ?? 'null'}`);

            const timestamp = new Date().toISOString();
            const fullDescription = `${description} [${timestamp}]`;
            const escapedDescription = fullDescription.replace(/'/g, "''");
            const command = `Checkpoint-Computer -Description '${escapedDescription}' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop`;

            const result = await execa('powershell', [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                command
            ], { reject: false });

            if (result.stdout) {
                console.log('[Restore] stdout:', result.stdout);
                this.writeRestoreLog(`Checkpoint stdout: ${result.stdout.replace(/\r?\n/g, ' | ')}`);
            }
            if (result.stderr) {
                console.error('[Restore] stderr:', result.stderr);
                this.writeRestoreLog(`Checkpoint stderr: ${result.stderr.replace(/\r?\n/g, ' | ')}`);
            }

            if (result.exitCode !== 0) {
                this.writeRestoreLog(`Checkpoint command failed with exitCode=${result.exitCode}`);
                const details = this.buildDetails(result.stdout || '', result.stderr || '', result.exitCode ?? null);
                const reason = this.classifyRestoreFailure(`${result.stdout || ''}\n${result.stderr || ''}`);
                this.writeRestoreLog(`Classified restore failure reason=${reason} details="${details}"`);
                return { success: false, reason, details };
            }

            const afterSequence = await this.getLatestRestoreSequence();
            const matchedSequence = await this.findRestoreSequenceByDescription(fullDescription);
            const created = matchedSequence !== null;

            if (!created) {
                this.writeRestoreLog(
                    `Checkpoint returned success but could not verify restore point by description. before=${beforeSequence ?? 'null'} after=${afterSequence ?? 'null'} matched=${matchedSequence ?? 'null'} description="${fullDescription}"`
                );
                const details = this.buildDetails(result.stdout || '', result.stderr || '', result.exitCode ?? null);
                this.writeRestoreLog(`Classified restore failure reason=verification-failed details="${details}"`);
                return { success: false, reason: 'verification-failed', details };
            }

            this.writeRestoreLog(`Restore point created successfully. matchedSequence=${matchedSequence} latestSequence=${afterSequence ?? 'null'} description="${fullDescription}"`);

            return {
                success: true,
                sequenceNumber: matchedSequence,
                description: fullDescription
            };
        } catch (error) {
            console.error('[Restore] Failed to create restore point:', error);
            this.writeRestoreLog(`Restore creation threw error: ${String(error)}`);
            return {
                success: false,
                reason: 'unknown',
                details: String(error)
            };
        }
    }

    async verifyRestorePoint(sequenceNumber: number, expectedDescription: string): Promise<RestorePointVerificationResult> {
        this.writeRestoreLog(`Post-batch verification requested. sequence=${sequenceNumber} expectedDescription="${expectedDescription}"`);
        try {
            const restorePoint = await this.getRestorePointBySequence(sequenceNumber);
            if (!restorePoint) {
                const details = `Restore point with sequence ${sequenceNumber} not found.`;
                this.writeRestoreLog(`Post-batch verification failed: ${details}`);
                return {
                    confirmed: false,
                    sequenceNumber,
                    expectedDescription,
                    details
                };
            }

            const descriptionMatches = restorePoint.description === expectedDescription;
            if (!descriptionMatches) {
                const details = `Sequence ${sequenceNumber} exists but description changed. expected="${expectedDescription}" actual="${restorePoint.description}"`;
                this.writeRestoreLog(`Post-batch verification failed: ${details}`);
                return {
                    confirmed: false,
                    sequenceNumber,
                    expectedDescription,
                    actualDescription: restorePoint.description,
                    details
                };
            }

            this.writeRestoreLog(`Post-batch verification confirmed. sequence=${sequenceNumber} description="${restorePoint.description}"`);
            return {
                confirmed: true,
                sequenceNumber,
                expectedDescription,
                actualDescription: restorePoint.description
            };
        } catch (error) {
            const details = `Verification threw error: ${String(error)}`;
            this.writeRestoreLog(`Post-batch verification failed: ${details}`);
            return {
                confirmed: false,
                sequenceNumber,
                expectedDescription,
                details
            };
        }
    }
}
