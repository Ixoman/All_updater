import { execa } from 'execa';
import type { AppUpdate, WingetHealthStatus } from '../../shared/types';
import type { HistoryService } from './history';
import { SystemService } from './system';

export class WingetService {
    private systemService: SystemService;
    private historyService?: Pick<HistoryService, 'getHistory'>;
    private readonly debugWinget = process.env.ALL_UPDATER_DEBUG_WINGET === '1';
    private readonly unknownVersionCooldownMs = 12 * 60 * 60 * 1000;

    constructor(systemService: SystemService = new SystemService(), historyService?: Pick<HistoryService, 'getHistory'>) {
        this.systemService = systemService;
        this.historyService = historyService;
    }

    private debug(...args: unknown[]): void {
        if (this.debugWinget) {
            console.log(...args);
        }
    }

    private isDisableInteractivityUnsupported(output: string): boolean {
        return /(disable-interactivity).*(unknown|unsupported|invalid|unrecognized)|unknown option.*disable-interactivity|no option named.*disable-interactivity/i.test(output);
    }

    private isIncludeUnknownUnsupported(output: string): boolean {
        return /(include-unknown).*(unknown|unsupported|invalid|unrecognized)|unknown option.*include-unknown|no option named.*include-unknown/i.test(output);
    }

    private async runWingetCommandWithFallback(
        args: string[],
        options: { timeout: number, includeAll: boolean }
    ): Promise<{ stdout: string, stderr: string, all: string }> {
        const queue: string[][] = [
            [...args, '--disable-interactivity'],
            [...args]
        ];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const attemptArgs = queue.shift()!;
            const key = attemptArgs.join('\u0000');
            if (visited.has(key)) continue;
            visited.add(key);

            const result = await execa('winget', attemptArgs, {
                reject: false,
                timeout: options.timeout,
                encoding: 'utf8',
                ...(options.includeAll ? { all: true } : {})
            });

            const stdout = result.stdout || '';
            const stderr = result.stderr || '';
            const allOutput = options.includeAll
                ? (result as { all?: string }).all || `${stdout}\n${stderr}`
                : `${stdout}\n${stderr}`;
            const combined = `${stdout}\n${stderr}\n${allOutput}`;

            if (attemptArgs.includes('--disable-interactivity') && this.isDisableInteractivityUnsupported(combined)) {
                console.warn('[WingetService] --disable-interactivity unsupported. Retrying without it...');
                queue.push(attemptArgs.filter(arg => arg !== '--disable-interactivity'));
                continue;
            }

            if (attemptArgs.includes('--include-unknown') && this.isIncludeUnknownUnsupported(combined)) {
                console.warn('[WingetService] --include-unknown unsupported. Retrying without it...');
                queue.push(attemptArgs.filter(arg => arg !== '--include-unknown'));
                continue;
            }

            return { stdout, stderr, all: allOutput };
        }

        return { stdout: '', stderr: '', all: '' };
    }

    private containsNoUpdatesMessage(output: string): boolean {
        const normalized = output
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const includeChecks = [
            'no se han encontrado actualizaciones',
            'no se encontraron actualizaciones disponibles',
            'no hay actualizaciones disponibles',
            'numeros de version que no se pueden determinar',
            'nmeros de versin que no se pueden determinar',
            'version numbers that cannot be determined',
            'no updates found',
            'no updates available',
            'no available upgrade found',
            'no applicable update found',
            'no installed package found matching input criteria',
            'no packages found matching input criteria',
            'up to date',
            'esta actualizado'
        ];

        if (includeChecks.some(pattern => normalized.includes(pattern))) {
            return true;
        }

        const regexChecks = [
            /no se encontr.*paquete.*coincid.*criterios? de entrada/,
            /no se encontr.*ning.*paquete.*criterios? de entrada/,
            /version numbers?.*cannot be determined/,
            /nmeros? de versin.*no se pueden determinar/,
            /no installed package found matching input criteria/,
            /no packages found matching input criteria/
        ];

        return regexChecks.some(regex => regex.test(normalized));
    }

    private isProgressOnlyNoise(output: string): boolean {
        const lines = output
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
        if (lines.length === 0) return false;

        const progressLikeLines = lines.filter(
            line => /\b\d{1,3}%\b/.test(line) || /ÔûÆ|â–|█|▒|▓/.test(line)
        );
        const meaningfulTextLines = lines.filter(
            line => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(line) && !/\b\d{1,3}%\b/.test(line)
        );

        return progressLikeLines.length > 0 && meaningfulTextLines.length === 0;
    }

    private isLikelySourceName(value: string): boolean {
        const trimmed = value.trim();
        if (!trimmed) return false;
        if (trimmed.length < 2 || trimmed.length > 64) return false;
        if (/\s|\|/.test(trimmed)) return false;
        if (/^https?:\/\//i.test(trimmed)) return false;
        return /^[a-z0-9][a-z0-9._-]*$/i.test(trimmed);
    }

    private looksLikeSourceArgument(value: string): boolean {
        const trimmed = value.trim();
        if (!trimmed) return false;
        if (/^(https?:\/\/|ms-windows-store:\/\/)/i.test(trimmed)) return true;
        if (/^[a-z]+:\/\/[^\s]+$/i.test(trimmed)) return true;
        return false;
    }

    private extractSourceNamesFromListOutput(output: string): string[] {
        if (!output.trim()) return [];
        // eslint-disable-next-line no-control-regex
        const cleaned = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '\n');
        const lines = cleaned
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
        const unique = new Set<string>();

        for (const line of lines) {
            const normalized = this.normalizeText(line);
            if (
                normalized.startsWith('name ') ||
                normalized.startsWith('nombre ') ||
                normalized.startsWith('nom ') ||
                normalized.includes('argument') ||
                normalized.includes('explicito') ||
                normalized.includes('explicit')
            ) {
                continue;
            }
            if (/^-+$/.test(line) || /^-+\s+-+/.test(line)) continue;

            const match = line.match(/^([a-z0-9][a-z0-9._-]{1,})\s{2,}(\S+)(?:\s{2,}\S+)?$/i);
            if (!match) continue;

            const sourceName = match[1].trim();
            const sourceArgument = match[2].trim();
            if (!this.isLikelySourceName(sourceName)) continue;
            if (!this.looksLikeSourceArgument(sourceArgument)) continue;
            unique.add(sourceName);
        }

        return Array.from(unique);
    }

    private collectSourceNamesFromJson(payload: unknown): string[] {
        const unique = new Set<string>();
        const stack: unknown[] = [payload];

        while (stack.length > 0) {
            const current = stack.pop();
            if (!current || typeof current !== 'object') continue;
            if (Array.isArray(current)) {
                for (const item of current) stack.push(item);
                continue;
            }

            const node = current as Record<string, unknown>;
            const nameCandidates = [node.Name, node.name, node.SourceName, node.sourceName];
            for (const candidate of nameCandidates) {
                if (typeof candidate !== 'string') continue;
                const sourceName = candidate.trim();
                if (this.isLikelySourceName(sourceName)) {
                    unique.add(sourceName);
                }
            }

            for (const value of Object.values(node)) {
                if (value && typeof value === 'object') {
                    stack.push(value);
                }
            }
        }

        return Array.from(unique);
    }

    private parseWingetSourceListJsonOutput(rawOutput: string): string[] | null {
        if (!rawOutput?.trim()) return null;
        const firstBrace = rawOutput.indexOf('{');
        const firstBracket = rawOutput.indexOf('[');
        const startCandidates = [firstBrace, firstBracket].filter(index => index >= 0);
        if (startCandidates.length === 0) return null;

        const jsonStart = Math.min(...startCandidates);
        const jsonText = rawOutput.slice(jsonStart);

        try {
            const payload = JSON.parse(jsonText) as unknown;
            return this.collectSourceNamesFromJson(payload);
        } catch {
            return null;
        }
    }

    private hasPotentialPackageLikeLine(lines: string[]): boolean {
        return lines.some((line) => {
            const trimmed = line.trim();
            if (!trimmed || this.isIgnorableOutputLine(trimmed) || this.isSeparatorLine(trimmed)) return false;
            return /\b[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+){1,}\b/.test(trimmed) || /\b[A-Z0-9]{8,}\b/.test(trimmed);
        });
    }

    private isOutputEffectivelyEmptyOrNoise(output: string): boolean {
        if (!output.trim()) return true;
        if (this.containsNoUpdatesMessage(output)) return true;
        if (this.isProgressOnlyNoise(output)) return true;

        // eslint-disable-next-line no-control-regex
        const cleaned = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '\n');
        const lines = cleaned.split('\n');
        if (this.areAllNonEmptyLinesIgnorable(lines)) return true;
        return !this.hasPotentialPackageLikeLine(lines);
    }

    async getAvailableUpdates(): Promise<AppUpdate[]> {
        try {
            this.debug('[WingetService] Starting update check...');
            let updates = await this.tryGetUpdatesFromJson();
            let textOutput = '';
            let retriedWithUpgrade = false;

            if (updates === null) {
                // Fallback: localized text parsing for older/quirky winget outputs.
                const args = ['list', '--upgrade-available', '--include-unknown', '--accept-source-agreements'];

                const textResult = await this.runWingetCommandWithFallback(args, {
                    timeout: 60000,
                    includeAll: true
                });
                textOutput = textResult.all;
                this.debug('[WingetService] Winget text command finished. Parsing output...');
                this.debug('[WingetService] Raw stdout length:', textOutput.length);

                try {
                    updates = this.parseWingetOutput(textOutput);
                } catch (parseError) {
                    if (this.isOutputEffectivelyEmptyOrNoise(textOutput)) {
                        this.debug('[WingetService] No updates detected from text output.');
                        updates = [];
                    } else {
                        console.warn('[WingetService] Primary text parse failed. Retrying with upgrade output...', parseError);
                        const retryResult = await this.runWingetCommandWithFallback(
                            ['upgrade', '--include-unknown', '--accept-source-agreements', '--accept-package-agreements'],
                            { timeout: 45000, includeAll: true }
                        );
                        textOutput = retryResult.all;
                        retriedWithUpgrade = true;
                        try {
                            updates = this.parseWingetOutput(textOutput);
                        } catch (retryParseError) {
                            if (this.isOutputEffectivelyEmptyOrNoise(textOutput)) {
                                this.debug('[WingetService] No updates detected after upgrade retry.');
                                updates = [];
                            } else {
                                throw retryParseError;
                            }
                        }
                    }
                }
            }

            this.debug('[WingetService] Parsed updates count:', updates.length);
            if (updates.length > 0) {
                this.debug('[WingetService] First update:', JSON.stringify(updates[0]));
            }

            // AUTO-HEALING: Only if search fails with known error codes or specific "ambiguous" output that isn't really ambiguous (winget quirk)
            const isAmbiguousError = textOutput.includes('Se encontraron varios paquetes instalados') || textOutput.includes('coinciden con los criterios de entrada');
            const isSourceError = textOutput.includes('0x8a15005e') || textOutput.includes('0x8a150001');

            if (!retriedWithUpgrade && textOutput && updates.length === 0 && (isSourceError || isAmbiguousError)) {
                console.warn('[WingetService] Source error or Ambiguous output detected. Retrying with minimal flags...');

                // If it was a source error, try to heal sources first
                if (isSourceError) {
                    await this.ensureSourcesHealthy();
                }

                // Retry with a minimal upgrade command.
                // This often fixes the "ambiguous" list behavior on some systems.
                const retryResult = await this.runWingetCommandWithFallback(
                    ['upgrade', '--include-unknown', '--accept-source-agreements', '--accept-package-agreements'],
                    {
                        timeout: 45000,
                        includeAll: true
                    }
                );
                updates = this.isOutputEffectivelyEmptyOrNoise(retryResult.all)
                    ? []
                    : this.parseWingetOutput(retryResult.all);
                retriedWithUpgrade = true;
            }

            if (textOutput && updates.length === 0 && isSourceError) {
                throw new Error('WingetSourceIssue: Winget sources are unhealthy or unavailable.');
            }

            if (this.historyService) {
                // updates = updates.filter(u => !this.historyService.isVersionSkipped(u.id, u.available));
                const history = this.historyService.getHistory(); // Assuming getHistory is public or I can access it
                updates = updates
                    .filter(u => {
                        // If the installed version is unknown and this exact target version
                        // was already installed successfully, hide it in subsequent checks.
                        if (!this.isUnknownInstalledVersion(u.version)) return true;
                        const latestForVersion = this.getLatestHistoryEntryForVersion(u.id, u.available, history);
                        if (latestForVersion && (latestForVersion.status === 'success' || latestForVersion.status === 'reboot')) {
                            return false;
                        }

                        const temporarilySuppressed = this.isUnknownVersionTemporarilySuppressed(
                            u.id,
                            u.available,
                            history
                        );
                        return !temporarilySuppressed;
                    })
                    .map(u => {
                    const found = history.find((h) => h.id === u.id && h.version === u.available);
                    if (found && (found.status === 'inapplicable' || found.status === 'skipped')) {
                        return { ...u, previousStatus: found.status, previousDetails: found.details };
                    }
                    return u;
                });
            }

            this.debug(`[WingetService] Parsed ${updates.length} updates after filtering.`);
            return updates;
        } catch (error) {
            const err = error as { code?: string, message?: string };
            const message = err.message || '';
            if (
                err.code === 'ENOENT' ||
                /ENOENT|not found|not recognized|No se reconoce/i.test(message)
            ) {
                throw new Error('WingetNotFound: winget executable is missing.');
            }

            if (/WingetOutputParseError/i.test(message)) {
                throw new Error('WingetOutputUnparseable: Winget output format could not be read.');
            }

            if (/0x8a15005e|0x8a150001|source.+(failed|error|invalid|broken)|msstore source/i.test(message)) {
                throw new Error('WingetSourceIssue: Winget sources are unavailable.');
            }

            if (/access is denied|permiso denegado|administrator privileges|required elevation|elevation/i.test(message)) {
                throw new Error('WingetAccessDenied: Administrator privileges are required.');
            }

            console.error('[WingetService] Failed to check updates:', error);
            throw error;
        }
    }

    async ensureSourcesHealthy(): Promise<void> {
        try {
            this.debug('[WingetService] Resetting winget sources...');
            await execa('winget', ['source', 'reset', '--force'], { timeout: 30000 });
            await execa('winget', ['source', 'update'], { timeout: 60000 });
        } catch (e) {
            console.error('[WingetService] Failed to heal sources:', e);
        }
    }

    private normalizeText(value: string): string {
        return value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    private extractFirstHttpUrl(value: string): string | null {
        const match = value.match(/https?:\/\/[^\s<>"'`]+/i);
        if (!match) return null;
        return match[0].replace(/[),.;]+$/, '');
    }

    private findReleaseNotesUrlInJsonNode(node: unknown, allowLooseStringMatch = false): string | null {
        if (node == null) return null;
        if (typeof node === 'string') {
            return allowLooseStringMatch ? this.extractFirstHttpUrl(node) : null;
        }
        if (Array.isArray(node)) {
            for (const child of node) {
                const found = this.findReleaseNotesUrlInJsonNode(child, allowLooseStringMatch);
                if (found) return found;
            }
            return null;
        }
        if (typeof node !== 'object') return null;

        const record = node as Record<string, unknown>;

        for (const [key, value] of Object.entries(record)) {
            const normalizedKey = this.normalizeText(key).replace(/\s+/g, '');
            const isReleaseNotesUrlKey =
                /releasenotesurl|releasenoteurl|urlnotasdeversion|notasdeversionurl/.test(normalizedKey);
            const isReleaseNotesTextKey =
                /releasenotes|notasdeversion/.test(normalizedKey);

            if ((isReleaseNotesUrlKey || isReleaseNotesTextKey) && typeof value === 'string') {
                const found = this.extractFirstHttpUrl(value);
                if (found) return found;
            }

            if (isReleaseNotesUrlKey || isReleaseNotesTextKey) {
                const nested = this.findReleaseNotesUrlInJsonNode(value, true);
                if (nested) return nested;
                continue;
            }

            if (value && typeof value === 'object') {
                const nested = this.findReleaseNotesUrlInJsonNode(value, false);
                if (nested) return nested;
            }
        }

        return null;
    }

    private parseReleaseNotesUrlFromJsonOutput(rawOutput: string): string | null {
        if (!rawOutput?.trim()) return null;
        const firstBrace = rawOutput.indexOf('{');
        const firstBracket = rawOutput.indexOf('[');
        const candidates = [firstBrace, firstBracket].filter(index => index >= 0);
        if (candidates.length === 0) return null;

        const jsonStart = Math.min(...candidates);
        const jsonText = rawOutput.slice(jsonStart);

        try {
            const payload = JSON.parse(jsonText) as unknown;
            return this.findReleaseNotesUrlInJsonNode(payload);
        } catch {
            return null;
        }
    }

    private parseReleaseNotesUrlFromTextOutput(output: string): string | null {
        if (!output?.trim()) return null;
        // eslint-disable-next-line no-control-regex
        const cleaned = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '\n');
        const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean);
        const markerRegex = /(release\s*notes?\s*url|url\s*de\s*notas?\s*de\s*version|notas?\s*de\s*version\s*url)/i;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const normalizedLine = this.normalizeText(line);
            if (!markerRegex.test(normalizedLine)) continue;

            const direct = this.extractFirstHttpUrl(line);
            if (direct) return direct;

            for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
                const neighborUrl = this.extractFirstHttpUrl(lines[j]);
                if (neighborUrl) return neighborUrl;
            }
        }

        return null;
    }

    async getReleaseNotesUrl(id: string): Promise<string | null> {
        const baseArgs = [
            'show',
            '--id', id,
            '--exact',
            '--accept-source-agreements',
            '--accept-package-agreements'
        ];

        try {
            const jsonResult = await this.runWingetCommandWithFallback(
                [...baseArgs, '--output', 'json'],
                { timeout: 45000, includeAll: false }
            );
            const jsonUrl = this.parseReleaseNotesUrlFromJsonOutput(jsonResult.stdout);
            if (jsonUrl) return jsonUrl;
        } catch (error) {
            this.debug('[WingetService] Could not parse release notes URL from JSON output:', error);
        }

        try {
            const textResult = await this.runWingetCommandWithFallback(baseArgs, {
                timeout: 45000,
                includeAll: true
            });
            return this.parseReleaseNotesUrlFromTextOutput(textResult.all);
        } catch (error) {
            this.debug('[WingetService] Could not read release notes URL from text output:', error);
            return null;
        }
    }

    private emitWingetOutputToLog(rawChunk: string, onLog?: (log: string) => void): void {
        if (!onLog) return;
        const lines = rawChunk
            .split(/\r?\n|\r/g)
            .map(line => line.trim())
            .filter(Boolean);

        for (const line of lines) {
            onLog(line);
        }
    }

    private buildWingetErrorCombinedText(error: { message?: string; stdout?: string; stderr?: string }): string {
        return `${error.message || ''}\n${error.stdout || ''}\n${error.stderr || ''}`;
    }

    private async hasObsRelatedProcessRunning(): Promise<boolean> {
        try {
            const { stdout } = await execa(
                'powershell',
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    "$names=@('obs64','obs32','obs-browser-page','obs-ffmpeg-mux','obs-webrtc-mux'); " +
                    "$running=Get-Process -Name $names -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique; " +
                    "if($running){$running -join ','}"
                ],
                { reject: false, timeout: 10000 }
            );
            return stdout.trim().length > 0;
        } catch {
            // Fail-open to avoid false negatives on systems where process query is restricted.
            return true;
        }
    }

    private async shouldTreatFileInUseAsRunningApp(id: string): Promise<boolean> {
        if (id !== 'OBSProject.OBSStudio') {
            return true;
        }

        const obsRunning = await this.hasObsRelatedProcessRunning();
        if (!obsRunning) {
            console.warn('[WingetService] OBS in-use signal received, but no OBS process was detected.');
            return false;
        }

        return true;
    }

    async installUpdate(id: string, onLog?: (log: string) => void): Promise<void> {
        this.debug(`[WingetService] Installing update: ${id}`);
        const arch = this.systemService.getWingetArch();

        const baseArgs = [
            'upgrade',
            '--id', id,
            '--silent',
            '--architecture', arch,
            '--include-unknown',
            '--accept-package-agreements',
            '--accept-source-agreements'
        ];

        const runCmd = async (args: string[]) => {
            const subprocess = execa('winget', args, { all: true });

            if (subprocess.all) {
                subprocess.all.on('data', (data) => {
                    this.emitWingetOutputToLog(data.toString(), onLog);
                });
            } else {
                if (subprocess.stdout) {
                    subprocess.stdout.on('data', (data) => {
                        this.emitWingetOutputToLog(data.toString(), onLog);
                    });
                }
                if (subprocess.stderr) {
                    subprocess.stderr.on('data', (data) => {
                        this.emitWingetOutputToLog(data.toString(), onLog);
                    });
                }
            }

            try {
                await subprocess;
            } catch (error: unknown) {
                const wingetError = error as { exitCode?: number, message?: string, stdout?: string, stderr?: string };
                const unsupportedCombined = this.buildWingetErrorCombinedText(wingetError);
                if (args.includes('--include-unknown') && this.isIncludeUnknownUnsupported(unsupportedCombined)) {
                    console.warn(`[WingetService] --include-unknown unsupported for ${id}. Retrying without it...`);
                    await runCmd(args.filter(arg => arg !== '--include-unknown'));
                    return;
                }
                const code = wingetError.exitCode;
                const normalizedCombined = unsupportedCombined.toLowerCase();
                // 3010/1641: common Windows reboot-required, -1978335206: winget reboot-required variant
                if (
                    code === 3010 ||
                    code === 1641 ||
                    code === -1978335206 ||
                    /reboot required|restart required|requires reboot|requires restart|system restart|debe reiniciar|requiere reiniciar/.test(normalizedCombined)
                ) {
                    throw new Error(`RebootRequired: The update for ${id} was installed but a system restart is required.`);
                }
                // 0x8A150005: App in use
                if (code === -1978335227) {
                    const shouldTreatAsRunningApp = await this.shouldTreatFileInUseAsRunningApp(id);
                    if (!shouldTreatAsRunningApp) {
                        throw new Error(`FileLockDetected: ${id} installer reported file lock, but no related process was detected.`);
                    }
                    throw new Error(`AppInUse: Could not update ${id} because it is currently running.`);
                }
                throw error;
            }
        };

        try {
            await runCmd(baseArgs);
        } catch (error: unknown) {
            const wingetError = error as {
                exitCode?: number;
                message?: string;
                stdout?: string;
                stderr?: string;
            };
            const combinedErrorText = this.buildWingetErrorCombinedText(wingetError);
            const normalizedCombined = combinedErrorText.toLowerCase();
            // Check for inapplicability or other common Winget "not found" quirks
            const isInapplicable =
                /inapplicable|no se ha encontrado ninguna actualizaci[oó]n aplicable|no se encontr[oó] ning[uú]n paquete|no applicable update found|no update needed/i.test(combinedErrorText) ||
                wingetError.exitCode === -1978335221;

            const isTechMismatch =
                wingetError.exitCode === 2316632107 ||
                wingetError.exitCode === -1978335189 ||
                /tecnolog[ií]a de instalaci[oó]n es diferente|installation technology is different/i.test(combinedErrorText);

            // NEW: Hash Mismatch (0x8a150011 / 2316632081)
            const isHashMismatch =
                wingetError.exitCode === 2316632081 ||
                /installer hash does not match|el hash del instalador no coincide/i.test(combinedErrorText);

            // File-in-use must rely on explicit signal text (exit code 6 is too generic and causes false positives).
            const isFileInUse =
                /files modified by the installer are currently in use|otra aplicación está usando los archivos modificados|otra aplicacion esta usando los archivos modificados|file in use|archivo en uso|application is currently running|aplicaci[oó]n.*(en uso|ejecuci[oó]n)/i.test(normalizedCombined);

            if (isHashMismatch) {
                console.warn(`[WingetService] Hash mismatch for ${id}. Security risk.`);
                throw new Error(`HashMismatch: Installer security check failed. The vendor may have changed the file.`);
            }

            if (isFileInUse) {
                const shouldTreatAsRunningApp = await this.shouldTreatFileInUseAsRunningApp(id);
                if (!shouldTreatAsRunningApp) {
                    throw new Error(`FileLockDetected: ${id} installer reported file lock, but no related process was detected.`);
                }
                console.warn(`[WingetService] File in use for ${id}.`);
                throw new Error(`AppInUse: The application is currently running. Please close it.`);
            }

            if (isInapplicable || isTechMismatch) {
                console.warn(`[WingetService] Update for ${id} is inapplicable/mismatch. Retrying with force for good measure, or failing gracefully.`);

                // If it's tech mismatch, attempt force install fallback
                if (isTechMismatch) {
                    console.warn(`[WingetService] Tech mismatch for ${id}. Attempting fallback to 'install --force'...`);
                    try {
                        // Use 'install' instead of 'upgrade' to bypass the check, with --force
                        const fallbackArgs = [
                            'install',
                            '--id', id,
                            '--silent',
                            '--force',
                            '--architecture', arch,
                            '--accept-package-agreements',
                            '--accept-source-agreements'
                        ];
                        await execa('winget', fallbackArgs);
                        this.debug(`[WingetService] Force install fallback for ${id} succeeded.`);
                        return;
                    } catch (fallbackError: unknown) {
                        console.error(`[WingetService] Force install fallback for ${id} failed:`, fallbackError);
                        throw new Error(`Inapplicable: Manual uninstall required. Different installation technology and force install failed.`);
                    }
                }

                try {
                    await runCmd([...baseArgs, '--force']);
                    this.debug(`[WingetService] Force update for ${id} succeeded.`);
                    return;
                } catch {
                    console.error(`[WingetService] Force update for ${id} also failed.`);
                    throw new Error(`Inapplicable: The installer reports no update is needed for ${id} on this system, or the package ID is temporarily unreachable.`);
                }
            }
            throw error;
        }
    }

    async isElevated(): Promise<boolean> {
        try {
            await execa('net', ['session'], { reject: true });
            return true;
        } catch {
            try {
                const { stdout } = await execa('powershell', [
                    '-NoProfile',
                    '-NonInteractive',
                    '-Command',
                    "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
                ], { reject: false });

                return stdout.trim().toLowerCase() === 'true';
            } catch {
                return false;
            }
        }
    }

    async getHealth(): Promise<WingetHealthStatus> {
        try {
            const versionResult = await execa('winget', ['--version'], {
                reject: false,
                timeout: 15000
            });
            const version = (versionResult.stdout || '').trim();
            if (versionResult.exitCode !== 0 || !version) {
                const details = `${versionResult.stdout || ''}\n${versionResult.stderr || ''}`.trim() || `exitCode=${versionResult.exitCode ?? 'null'}`;
                return {
                    installed: false,
                    sourcesHealthy: false,
                    error: details
                };
            }

            let sourceOutput = '';
            let sourceNames: string[] = [];

            const jsonSourceResult = await this.runWingetCommandWithFallback(
                ['source', 'list', '--output', 'json'],
                { timeout: 25000, includeAll: true }
            );
            sourceOutput = jsonSourceResult.all.trim();
            const sourceNamesFromJson = this.parseWingetSourceListJsonOutput(jsonSourceResult.stdout);
            if (sourceNamesFromJson && sourceNamesFromJson.length > 0) {
                sourceNames = sourceNamesFromJson;
            }

            if (sourceNames.length === 0) {
                const textSourceResult = await this.runWingetCommandWithFallback(
                    ['source', 'list'],
                    { timeout: 25000, includeAll: true }
                );
                sourceOutput = textSourceResult.all.trim();
                sourceNames = this.extractSourceNamesFromListOutput(sourceOutput);
            }

            const normalized = this.normalizeText(sourceOutput);
            const normalizedSourceNames = sourceNames.map((name) => this.normalizeText(name));
            const hasKnownSource =
                normalizedSourceNames.includes('winget') ||
                normalizedSourceNames.includes('msstore') ||
                /\bwinget\b|\bmsstore\b/.test(normalized);
            const hasSourceErrors =
                /0x8a1500|source.+(failed|error|invalid|broken)|msstore.+(failed|error)|no sources?|no hay fuentes?|fuentes?.+(error|fall)/.test(normalized);
            const sourcesHealthy = hasKnownSource && !hasSourceErrors;
            const sourceSummary = sourceNames.join(', ');

            return {
                installed: true,
                version,
                sourcesHealthy,
                sourceSummary: sourceSummary || undefined
            };
        } catch (error) {
            return {
                installed: false,
                sourcesHealthy: false,
                error: String(error)
            };
        }
    }

    private async tryGetUpdatesFromJson(): Promise<AppUpdate[] | null> {
        const jsonArgsCandidates = [
            ['list', '--upgrade-available', '--include-unknown', '--accept-source-agreements', '--output', 'json'],
            ['upgrade', '--include-unknown', '--accept-source-agreements', '--accept-package-agreements', '--output', 'json']
        ];

        for (const args of jsonArgsCandidates) {
            try {
                const jsonResult = await this.runWingetCommandWithFallback(args, {
                    timeout: 60000,
                    includeAll: false
                });
                const parsed = this.parseWingetJsonOutput(jsonResult.stdout);
                if (parsed !== null) {
                    if (parsed.length > 0) {
                        return parsed;
                    }

                    if (this.isOutputEffectivelyEmptyOrNoise(jsonResult.all)) {
                        return [];
                    }
                }
            } catch (error) {
                console.warn('[WingetService] JSON output parsing failed, falling back to text parser:', error);
            }
        }
        return null;
    }

    private parseWingetJsonOutput(rawOutput: string): AppUpdate[] | null {
        if (!rawOutput?.trim()) return null;
        const firstBrace = rawOutput.indexOf('{');
        const firstBracket = rawOutput.indexOf('[');
        const startCandidates = [firstBrace, firstBracket].filter(index => index >= 0);
        if (startCandidates.length === 0) return null;

        const jsonStart = Math.min(...startCandidates);
        const jsonText = rawOutput.slice(jsonStart);

        let payload: unknown;
        try {
            payload = JSON.parse(jsonText);
        } catch {
            return null;
        }

        const packageObjects = this.extractPackageObjects(payload);
        if (!packageObjects) return null;

        const updates = packageObjects
            .map(pkg => this.mapJsonPackageToUpdate(pkg))
            .filter((pkg): pkg is AppUpdate => pkg !== null);

        return updates;
    }

    private extractPackageObjects(payload: unknown): Record<string, unknown>[] | null {
        if (!payload || typeof payload !== 'object') return null;

        const root = payload as Record<string, unknown>;
        if (Array.isArray(root.Packages)) {
            return root.Packages.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
        }

        if (Array.isArray(root.Sources)) {
            const packages: Record<string, unknown>[] = [];
            for (const source of root.Sources) {
                if (!source || typeof source !== 'object') continue;
                const sourceRecord = source as Record<string, unknown>;
                if (Array.isArray(sourceRecord.Packages)) {
                    packages.push(
                        ...(sourceRecord.Packages.filter(item => item && typeof item === 'object') as Record<string, unknown>[])
                    );
                }
            }
            return packages;
        }

        if (Array.isArray(payload)) {
            return payload.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
        }

        return null;
    }

    private mapJsonPackageToUpdate(pkg: Record<string, unknown>): AppUpdate | null {
        const name = this.readFirstString(pkg, ['PackageName', 'Name']);
        const id = this.readFirstString(pkg, ['PackageIdentifier', 'Id', 'PackageId']);
        const version = this.readFirstString(pkg, ['InstalledVersion', 'Version']) || 'Unknown';
        const available = this.readFirstString(pkg, ['AvailableVersion', 'Available']);
        const source = this.readFirstString(pkg, ['Source']) || 'winget';

        if (!name || !available || !this.isLikelyPackageId(id, { name, version, available })) {
            return null;
        }

        return { name, id, version, available, source };
    }

    private readFirstString(obj: Record<string, unknown>, keys: string[]): string {
        for (const key of keys) {
            const value = obj[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return '';
    }

    private isLikelyPackageId(
        id: string,
        context?: { name?: string, version?: string, available?: string }
    ): boolean {
        const value = id.trim();
        if (!value || value === '-' || value.toUpperCase() === 'ID') return false;
        if (/\s/.test(value)) return false;

        const currentVersion = context?.version?.trim();
        const nextVersion = context?.available?.trim();
        if (currentVersion && value === currentVersion) return false;
        if (nextVersion && value === nextVersion) return false;
        if (/^\d+(?:[.\-_]\d+)+$/.test(value)) return false;
        if (/^v?\d+(?:\.\d+){1,}$/.test(value)) return false;
        const hasDelimiter = /[._-]/.test(value);
        const isStoreLike = /^[A-Z0-9]{8,}$/.test(value);
        if (!hasDelimiter && !isStoreLike) return false;
        if (value.length < 2) return false;
        return true;
    }

    private isUnknownInstalledVersion(version: string): boolean {
        const normalized = version.trim().toLowerCase();
        return normalized === 'unknown' ||
            normalized === '<unknown>' ||
            normalized === 'desconocido' ||
            normalized === '<desconocido>' ||
            normalized === 'desconocida' ||
            normalized === '<desconocida>' ||
            normalized === '-';
    }

    private isUnknownVersionTemporarilySuppressed(
        id: string,
        availableVersion: string,
        history: Array<{ id: string; version: string; status: string; date: string }>
    ): boolean {
        const latestForVersion = this.getLatestHistoryEntryForVersion(id, availableVersion, history);
        if (!latestForVersion) return false;
        // Keep suppression narrow to avoid hiding valid retries for actionable failures.
        if (!['inapplicable'].includes(latestForVersion.status)) return false;

        const cutoff = Date.now() - this.unknownVersionCooldownMs;
        const timestamp = Date.parse(latestForVersion.date);
        if (!Number.isFinite(timestamp)) return false;
        return timestamp >= cutoff;
    }

    private getLatestHistoryEntryForVersion(
        id: string,
        version: string,
        history: Array<{ id: string; version: string; status: string; date: string }>
    ): { id: string; version: string; status: string; date: string } | null {
        let latest: { id: string; version: string; status: string; date: string } | null = null;
        let latestTimestamp = Number.NEGATIVE_INFINITY;

        for (const entry of history) {
            if (entry.id !== id || entry.version !== version) continue;
            const timestamp = Date.parse(entry.date);
            if (!Number.isFinite(timestamp)) continue;
            if (latest === null || timestamp >= latestTimestamp) {
                latest = entry;
                latestTimestamp = timestamp;
            }
        }

        return latest;
    }

    private isIgnorableOutputLine(line: string): boolean {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (trimmed.startsWith('-')) return true;
        if (/^\d+\s+paquete/.test(trimmed) || /^\d+\s+package/.test(trimmed)) return true;
        if (this.containsNoUpdatesMessage(trimmed)) return true;
        return false;
    }

    private isSeparatorLine(line: string): boolean {
        const trimmed = line.trim();
        if (!trimmed) return false;
        return /^-+(?:\s+-+)+$/.test(trimmed);
    }

    private areAllNonEmptyLinesIgnorable(lines: string[]): boolean {
        const nonEmpty = lines.map(line => line.trim()).filter(Boolean);
        if (nonEmpty.length === 0) return true;
        return nonEmpty.every(line => this.isIgnorableOutputLine(line) || this.isSeparatorLine(line));
    }

    private parseDataLinesWithRegex(lines: string[]): AppUpdate[] {
        const updates: AppUpdate[] = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (this.isIgnorableOutputLine(trimmed)) continue;

            const match = line.match(/^(.*?)\s{2,}(\S+)\s{2,}(\S+)\s{2,}(\S+)(?:\s{2,}(\S+))?\s*$/);
            if (match) {
                const [, rawName, rawId, rawVersion, rawAvailable, rawSource] = match;
                const name = rawName.trim();
                const id = rawId.trim();
                const version = rawVersion.trim();
                const available = rawAvailable.trim();
                const source = rawSource?.trim() || 'winget';

                if (!name || !available || !this.isLikelyPackageId(id, { name, version, available })) {
                    continue;
                }
                updates.push({ name, id, version, available, source });
                continue;
            }

            const tokenParsed = this.parseDataLineByTokens(trimmed);
            if (tokenParsed) {
                updates.push(tokenParsed);
            }
        }
        return updates;
    }

    private parseDataLineByTokens(trimmedLine: string): AppUpdate | null {
        const tokens = trimmedLine.split(/\s+/).filter(Boolean);
        if (tokens.length < 4) return null;

        const tryCandidate = (hasSource: boolean): AppUpdate | null => {
            const minTokens = hasSource ? 5 : 4;
            if (tokens.length < minTokens) return null;

            const availableIndex = hasSource ? tokens.length - 2 : tokens.length - 1;
            const versionIndex = hasSource ? tokens.length - 3 : tokens.length - 2;
            const idIndex = hasSource ? tokens.length - 4 : tokens.length - 3;
            const nameTokens = tokens.slice(0, idIndex);

            if (nameTokens.length === 0) return null;

            const name = nameTokens.join(' ');
            const id = tokens[idIndex];
            const version = tokens[versionIndex];
            const available = tokens[availableIndex];
            const source = hasSource ? tokens[tokens.length - 1] : 'winget';

            if (!this.isLikelyPackageId(id, { name, version, available })) return null;
            if (!available.trim()) return null;

            return { name, id, version, available, source };
        };

        return tryCandidate(true) ?? tryCandidate(false);
    }

    private parseWingetOutput(output: string): AppUpdate[] {
        // Clean ANSI escape codes and progress bar artifacts
        // eslint-disable-next-line no-control-regex
        let cleaned = output.replace(/\x1b\[[0-9;]*m/g, ''); // Remove ANSI color codes
        cleaned = cleaned.replace(/\r/g, '\n'); // Treat CR as new line to split progress frames

        const lines = cleaned.split('\n');
        const separatorIndex = lines.findIndex(line => this.isSeparatorLine(line));
        if (separatorIndex !== -1) {
            const dataLines = lines.slice(separatorIndex + 1);
            const parsed = this.parseDataLinesWithRegex(dataLines);
            if (parsed.length > 0) {
                return parsed;
            }
        }

        const parsedWithoutHeader = this.parseDataLinesWithRegex(lines);
        if (parsedWithoutHeader.length > 0) {
            return parsedWithoutHeader;
        }

        const candidateLines = lines
            .map(line => line.trim())
            .filter(Boolean)
            .filter(line => !this.isIgnorableOutputLine(line) && !this.isSeparatorLine(line));
        const hasParsableRows = candidateLines.some(line => this.parseDataLineByTokens(line) !== null);
        if (!hasParsableRows) {
            return [];
        }

        if (this.isOutputEffectivelyEmptyOrNoise(output)) {
            return [];
        }

        throw new Error('WingetOutputParseError: Could not parse updates table from winget output.');
    }
}
