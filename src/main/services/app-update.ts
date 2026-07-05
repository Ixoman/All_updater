import { app, dialog, type WebContents } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
    AppUpdateDownloadProgress,
    AppUpdateDownloadResult,
    AppVersionCheckResult
} from '../../shared/types';

interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
    size?: number;
    digest?: string;
}

interface GitHubReleaseResponse {
    tag_name: string;
    html_url: string;
    draft?: boolean;
    prerelease?: boolean;
    assets: GitHubReleaseAsset[];
    body?: string;
}

type AppUpdateChannel = 'stable' | 'beta';

interface ParsedSemanticVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
}

interface ApprovedAppUpdateCandidate {
    latestVersion: string;
    releaseUrl: string;
    assetName: string;
    assetUrl: string;
    assetSizeBytes: number;
    assetSha256?: string;
}

interface SignatureVerificationResult {
    verified: boolean;
    status: 'valid' | 'unsigned' | 'invalid' | 'unknown';
    subject?: string;
    message?: string;
}

export class AppUpdateService {
    private readonly owner = 'Ixoman';
    private readonly repo = 'All_updater';
    private readonly versionCheckTimeoutMs = 12000;
    private readonly downloadTimeoutMs = 15 * 60 * 1000;
    private readonly maxDownloadBytes = 300 * 1024 * 1024;
    private readonly updateChannel: AppUpdateChannel = process.env.ALL_UPDATER_UPDATE_CHANNEL === 'beta' ? 'beta' : 'stable';
    private approvedCandidate: ApprovedAppUpdateCandidate | null = null;
    private activeDownloadController: AbortController | null = null;
    private activeDownloadCancelRequested = false;

    private normalizeVersion(version: string): string {
        return version.trim().replace(/^v/i, '');
    }

    private parseSemanticVersion(version: string): ParsedSemanticVersion | null {
        const normalized = this.normalizeVersion(version).split('+')[0];
        const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);
        if (!match) return null;

        return {
            major: Number.parseInt(match[1] ?? '0', 10),
            minor: Number.parseInt(match[2] ?? '0', 10),
            patch: Number.parseInt(match[3] ?? '0', 10),
            prerelease: match[4] ? match[4].split('.') : []
        };
    }

    private comparePrerelease(left: string[], right: string[]): number {
        if (left.length === 0 && right.length === 0) return 0;
        if (left.length === 0) return 1;
        if (right.length === 0) return -1;

        const max = Math.max(left.length, right.length);
        for (let i = 0; i < max; i++) {
            const l = left[i];
            const r = right[i];
            if (l === undefined) return -1;
            if (r === undefined) return 1;
            if (l === r) continue;

            const lNumber = /^\d+$/.test(l) ? Number.parseInt(l, 10) : null;
            const rNumber = /^\d+$/.test(r) ? Number.parseInt(r, 10) : null;
            if (lNumber !== null && rNumber !== null) {
                return lNumber > rNumber ? 1 : -1;
            }
            if (lNumber !== null) return -1;
            if (rNumber !== null) return 1;
            return l > r ? 1 : -1;
        }

        return 0;
    }

    private compareVersions(left: string, right: string): number {
        const leftVersion = this.parseSemanticVersion(left);
        const rightVersion = this.parseSemanticVersion(right);
        if (!leftVersion || !rightVersion) {
            return this.normalizeVersion(left).localeCompare(this.normalizeVersion(right), undefined, { numeric: true });
        }

        for (const key of ['major', 'minor', 'patch'] as const) {
            if (leftVersion[key] > rightVersion[key]) return 1;
            if (leftVersion[key] < rightVersion[key]) return -1;
        }

        return this.comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
    }

    private isNetworkError(message: string): boolean {
        return /fetch failed|network|enet|econn|enotfound|timed?out|offline|aborted|socket hang up/i.test(message);
    }

    private async fetchJson<T>(url: string, signal: AbortSignal): Promise<{ ok: true; payload: T } | { ok: false; status: number }> {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'All-Updater'
            },
            signal
        });

        if (!response.ok) {
            return { ok: false, status: response.status };
        }

        return { ok: true, payload: (await response.json()) as T };
    }

    private async fetchCandidateRelease(signal: AbortSignal): Promise<{ release?: GitHubReleaseResponse; status?: number }> {
        if (this.updateChannel === 'stable') {
            const latest = await this.fetchJson<GitHubReleaseResponse>(
                `https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`,
                signal
            );
            return latest.ok ? { release: latest.payload } : { status: latest.status };
        }

        const releases = await this.fetchJson<GitHubReleaseResponse[]>(
            `https://api.github.com/repos/${this.owner}/${this.repo}/releases?per_page=20`,
            signal
        );
        if (!releases.ok) return { status: releases.status };

        return {
            release: releases.payload.find((release) => !release.draft)
        };
    }

    private selectPreferredAsset(assets: GitHubReleaseAsset[]): GitHubReleaseAsset | undefined {
        const portableZip = assets.find(asset => /portable/i.test(asset.name) && /\.zip$/i.test(asset.name));
        if (portableZip) return portableZip;

        const portableExe = assets.find(asset => /portable/i.test(asset.name) && /\.exe$/i.test(asset.name));
        if (portableExe) return portableExe;

        const anyZip = assets.find(asset => /\.zip$/i.test(asset.name));
        if (anyZip) return anyZip;

        return assets.find(asset => /\.exe$/i.test(asset.name));
    }

    private extractSha256Digest(rawDigest?: string): string | undefined {
        if (!rawDigest) return undefined;
        const normalized = rawDigest.trim().toLowerCase();
        const match = normalized.match(/^sha256:([a-f0-9]{64})$/i);
        return match?.[1];
    }

    private formatReleaseNotes(body?: string): string | undefined {
        if (!body) return undefined;
        const compact = body
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (!compact) return undefined;
        return compact.length > 1400 ? `${compact.slice(0, 1400).trim()}...` : compact;
    }

    private writeAuditEvent(event: string, details: Record<string, unknown> = {}): void {
        try {
            const auditPath = path.join(app.getPath('userData'), 'app_update_audit.jsonl');
            const entry = {
                date: new Date().toISOString(),
                event,
                ...details
            };
            fs.appendFileSync(auditPath, `${JSON.stringify(entry)}\n`, 'utf8');
        } catch {
            // Audit logging must never block update checks or downloads.
        }
    }

    private isAllowedDownloadHost(hostname: string): boolean {
        return hostname === 'github.com' || hostname.endsWith('.github.com') || hostname === 'objects.githubusercontent.com';
    }

    private isExpectedReleaseUrl(rawUrl: string, tagName: string): boolean {
        try {
            const url = new URL(rawUrl);
            return url.protocol === 'https:'
                && url.hostname === 'github.com'
                && url.pathname === `/${this.owner}/${this.repo}/releases/tag/${encodeURIComponent(tagName)}`;
        } catch {
            return false;
        }
    }

    private isExpectedAssetUrl(rawUrl: string, tagName: string, assetName: string): boolean {
        try {
            const url = new URL(rawUrl);
            const expectedPrefix = `/${this.owner}/${this.repo}/releases/download/${encodeURIComponent(tagName)}/`;
            return url.protocol === 'https:'
                && url.hostname === 'github.com'
                && url.pathname.startsWith(expectedPrefix)
                && decodeURIComponent(url.pathname.slice(expectedPrefix.length)) === assetName;
        } catch {
            return false;
        }
    }

    private validateAssetForRelease(asset: GitHubReleaseAsset | undefined, tagName: string): { ok: true; safeName: string; sizeBytes: number } | { ok: false; error: string } {
        if (!asset?.name || !asset.browser_download_url) {
            return { ok: false, error: 'No downloadable release asset found.' };
        }

        const safeName = this.sanitizeDownloadFileName(asset.name);
        if (!safeName) {
            return { ok: false, error: 'Release asset filename is not allowed.' };
        }

        if (!this.isExpectedAssetUrl(asset.browser_download_url, tagName, safeName)) {
            return { ok: false, error: 'Release asset URL does not match the expected repository and tag.' };
        }

        const sizeBytes = Number.isFinite(asset.size) ? Number(asset.size) : 0;
        if (sizeBytes <= 0) {
            return { ok: false, error: 'Release asset size is missing.' };
        }

        if (sizeBytes > this.maxDownloadBytes) {
            return { ok: false, error: 'Release asset is larger than the allowed maximum.' };
        }

        return { ok: true, safeName, sizeBytes };
    }

    async checkLatestVersion(): Promise<AppVersionCheckResult> {
        const currentVersion = this.normalizeVersion(app.getVersion());
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.versionCheckTimeoutMs);
        this.approvedCandidate = null;
        this.writeAuditEvent('check-started', { currentVersion, channel: this.updateChannel });

        try {
            const { release: payload, status } = await this.fetchCandidateRelease(controller.signal);
            if (!payload) {
                this.writeAuditEvent('check-failed', { currentVersion, channel: this.updateChannel, status });
                return {
                    success: false,
                    hasUpdate: false,
                    channel: this.updateChannel,
                    currentVersion,
                    error: status ? `GitHub API HTTP ${status}` : 'No release found for selected update channel.'
                };
            }

            const tagName = payload.tag_name || '';
            const latestVersion = this.normalizeVersion(tagName);
            const isPrerelease = Boolean(payload.prerelease);
            if (this.updateChannel === 'stable' && isPrerelease) {
                this.writeAuditEvent('check-prerelease-ignored', { currentVersion, latestVersion, tagName });
                return {
                    success: true,
                    hasUpdate: false,
                    channel: this.updateChannel,
                    prerelease: true,
                    currentVersion,
                    latestVersion,
                    releaseUrl: payload.html_url,
                    releaseNotes: this.formatReleaseNotes(payload.body),
                    error: 'Latest release is a prerelease and stable channel ignores it.'
                };
            }

            if (tagName && payload.html_url && !this.isExpectedReleaseUrl(payload.html_url, tagName)) {
                this.writeAuditEvent('check-failed', { currentVersion, tagName, reason: 'unexpected-release-url' });
                return {
                    success: false,
                    hasUpdate: false,
                    channel: this.updateChannel,
                    currentVersion,
                    error: 'GitHub release URL does not match the expected repository.'
                };
            }

            const hasUpdate = latestVersion
                ? this.compareVersions(latestVersion, currentVersion) > 0
                : false;
            const asset = this.selectPreferredAsset(payload.assets || []);
            const assetValidation = this.validateAssetForRelease(asset, tagName);
            if (hasUpdate && assetValidation.ok && asset) {
                this.approvedCandidate = {
                    latestVersion,
                    releaseUrl: payload.html_url,
                    assetName: assetValidation.safeName,
                    assetUrl: asset.browser_download_url,
                    assetSizeBytes: assetValidation.sizeBytes,
                    assetSha256: this.extractSha256Digest(asset.digest)
                };
                this.writeAuditEvent('candidate-approved', {
                    currentVersion,
                    latestVersion,
                    tagName,
                    assetName: assetValidation.safeName,
                    assetSizeBytes: assetValidation.sizeBytes,
                    hashAvailable: Boolean(this.approvedCandidate.assetSha256)
                });
            }
            this.writeAuditEvent('check-completed', {
                currentVersion,
                latestVersion,
                tagName,
                hasUpdate,
                canDownload: Boolean(this.approvedCandidate),
                assetError: assetValidation.ok ? undefined : assetValidation.error
            });

            return {
                success: true,
                hasUpdate,
                canDownload: Boolean(this.approvedCandidate),
                channel: this.updateChannel,
                prerelease: isPrerelease,
                currentVersion,
                latestVersion,
                releaseUrl: payload.html_url,
                releaseNotes: this.formatReleaseNotes(payload.body),
                assetName: assetValidation.ok ? assetValidation.safeName : asset?.name,
                assetSizeBytes: assetValidation.ok ? assetValidation.sizeBytes : undefined,
                error: assetValidation.ok ? undefined : assetValidation.error
            };
        } catch (error) {
            const message = String(error);
            this.writeAuditEvent('check-failed', { currentVersion, channel: this.updateChannel, error: message });
            return {
                success: false,
                hasUpdate: false,
                currentVersion,
                offline: this.isNetworkError(message),
                error: message
            };
        } finally {
            clearTimeout(timer);
        }
    }

    private getUniqueFilePath(folderPath: string, safeFileName: string): string {
        const parsed = path.parse(safeFileName);
        let candidate = path.join(folderPath, safeFileName);
        let counter = 1;

        while (fs.existsSync(candidate)) {
            candidate = path.join(folderPath, `${parsed.name} (${counter})${parsed.ext}`);
            counter++;
        }

        return candidate;
    }

    private getStagingFolder(version: string): string {
        const safeVersion = version.replace(/[^0-9A-Za-z._-]/g, '_') || 'unknown';
        const folderPath = path.join(app.getPath('userData'), 'updates', safeVersion);
        fs.mkdirSync(folderPath, { recursive: true });
        return folderPath;
    }

    private cleanupPartialFiles(folderPath: string): void {
        try {
            for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
                if (entry.isFile() && entry.name.endsWith('.part')) {
                    fs.rmSync(path.join(folderPath, entry.name), { force: true });
                }
            }
        } catch {
            // Staging cleanup is best-effort.
        }
    }

    private getAvailableBytes(folderPath: string): number | null {
        try {
            const stats = fs.statfsSync(folderPath);
            return stats.bavail * stats.bsize;
        } catch {
            return null;
        }
    }

    private validateDiskSpace(stagingFolder: string, targetFolder: string, assetSizeBytes: number): string | null {
        const marginBytes = 25 * 1024 * 1024;
        const stagingRoot = path.parse(path.resolve(stagingFolder)).root.toLowerCase();
        const targetRoot = path.parse(path.resolve(targetFolder)).root.toLowerCase();
        const stagingAvailable = this.getAvailableBytes(stagingFolder);
        const targetAvailable = this.getAvailableBytes(targetFolder);

        if (stagingRoot === targetRoot) {
            const available = stagingAvailable ?? targetAvailable;
            if (available !== null && available < (assetSizeBytes * 2) + marginBytes) {
                return 'InsufficientDiskSpace: Not enough free space for staged and final copies.';
            }
            return null;
        }

        if (stagingAvailable !== null && stagingAvailable < assetSizeBytes + marginBytes) {
            return 'InsufficientDiskSpace: Not enough free space in the staging folder.';
        }

        if (targetAvailable !== null && targetAvailable < assetSizeBytes + marginBytes) {
            return 'InsufficientDiskSpace: Not enough free space in the selected target folder.';
        }

        return null;
    }

    private sanitizeDownloadFileName(fileName: string): string | null {
        const trimmed = fileName.trim();
        if (!trimmed || trimmed.length > 180) return null;
        if (trimmed === '.' || trimmed === '..') return null;
        if (path.basename(trimmed) !== trimmed) return null;
        if (path.win32.basename(trimmed) !== trimmed) return null;
        if (path.posix.basename(trimmed) !== trimmed) return null;
        if (/[<>:"|?*]/.test(trimmed)) return null;
        if (Array.from(trimmed).some((char) => char.charCodeAt(0) < 32)) return null;

        const extension = path.extname(trimmed).toLowerCase();
        if (extension !== '.zip' && extension !== '.exe') return null;

        return trimmed;
    }

    private emitProgress(sender: WebContents, progress: AppUpdateDownloadProgress): void {
        sender.send('app-update:download-progress', progress);
    }

    private async computeSha256(filePath: string): Promise<string> {
        return await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('error', (error) => reject(error));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    }

    private readJsonRecord(raw: string): Record<string, unknown> | null {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return null;
        }

        return null;
    }

    private async verifyExecutableSignature(filePath: string): Promise<SignatureVerificationResult> {
        try {
            const { execa } = await import('execa');
            const script = [
                '$sig = Get-AuthenticodeSignature -LiteralPath $args[0]',
                '[pscustomobject]@{',
                'Status = [string]$sig.Status;',
                'StatusMessage = [string]$sig.StatusMessage;',
                'Subject = [string]$sig.SignerCertificate.Subject',
                '} | ConvertTo-Json -Compress'
            ].join(' ');
            const { stdout } = await execa('powershell', [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                script,
                filePath
            ], { reject: false, timeout: 30000 });
            const record = this.readJsonRecord(stdout.trim());
            const status = typeof record?.Status === 'string' ? record.Status : 'Unknown';
            const message = typeof record?.StatusMessage === 'string' ? record.StatusMessage : undefined;
            const subject = typeof record?.Subject === 'string' && record.Subject.trim() ? record.Subject.trim() : undefined;

            if (status === 'Valid') {
                return { verified: true, status: 'valid', subject, message };
            }

            if (status === 'NotSigned') {
                return { verified: false, status: 'unsigned', message };
            }

            if (status === 'HashMismatch' || status === 'NotTrusted' || status === 'UnknownError') {
                return { verified: false, status: 'invalid', subject, message: message || status };
            }

            return { verified: false, status: 'unknown', subject, message: message || status };
        } catch (error) {
            return { verified: false, status: 'unknown', message: String(error) };
        }
    }

    private listExecutableFiles(folderPath: string): string[] {
        const results: string[] = [];
        const walk = (currentPath: string) => {
            for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
                const entryPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    walk(entryPath);
                } else if (entry.isFile() && /\.exe$/i.test(entry.name)) {
                    results.push(entryPath);
                }
            }
        };

        walk(folderPath);
        return results;
    }

    private async verifyZipSignature(filePath: string): Promise<SignatureVerificationResult> {
        const tempFolder = fs.mkdtempSync(path.join(app.getPath('temp'), 'all-updater-signature-'));

        try {
            const { execa } = await import('execa');
            const script = 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force';
            const expand = await execa('powershell', [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                script,
                filePath,
                tempFolder
            ], { reject: false, timeout: 60000 });
            if (expand.exitCode !== 0) {
                return { verified: false, status: 'unknown', message: expand.stderr || 'Could not inspect ZIP contents.' };
            }

            const executables = this.listExecutableFiles(tempFolder).slice(0, 30);
            if (executables.length === 0) {
                return { verified: false, status: 'unknown', message: 'No executable found inside ZIP.' };
            }

            let sawUnsigned = false;
            let sawUnknown = false;
            let firstMessage: string | undefined;

            for (const executable of executables) {
                const signature = await this.verifyExecutableSignature(executable);
                if (signature.verified) {
                    return signature;
                }
                if (signature.status === 'invalid') {
                    return signature;
                }
                if (signature.status === 'unsigned') sawUnsigned = true;
                if (signature.status === 'unknown') sawUnknown = true;
                firstMessage ||= signature.message;
            }

            if (sawUnsigned) {
                return { verified: false, status: 'unsigned', message: firstMessage };
            }

            return { verified: false, status: sawUnknown ? 'unknown' : 'unsigned', message: firstMessage };
        } finally {
            try {
                fs.rmSync(tempFolder, { recursive: true, force: true });
            } catch {
                // Ignore cleanup errors for the temporary inspection folder.
            }
        }
    }

    private async verifyDownloadedAssetSignature(filePath: string): Promise<SignatureVerificationResult> {
        const extension = path.extname(filePath).toLowerCase();
        if (extension === '.exe') {
            return await this.verifyExecutableSignature(filePath);
        }
        if (extension === '.zip') {
            return await this.verifyZipSignature(filePath);
        }

        return { verified: false, status: 'unknown', message: 'Unsupported asset extension.' };
    }

    private signatureResultToDownloadFields(signature: SignatureVerificationResult): Pick<AppUpdateDownloadResult, 'signatureVerified' | 'signatureStatus' | 'signatureSubject' | 'signatureMessage'> {
        return {
            signatureVerified: signature.verified,
            signatureStatus: signature.status,
            signatureSubject: signature.subject,
            signatureMessage: signature.message
        };
    }

    async downloadUpdateAsset(
        sender: WebContents
    ): Promise<AppUpdateDownloadResult> {
        if (this.activeDownloadController) {
            this.writeAuditEvent('download-rejected', { reason: 'already-active' });
            return { success: false, error: 'An app update download is already active.' };
        }

        if (!this.approvedCandidate) {
            this.writeAuditEvent('download-rejected', { reason: 'no-approved-candidate' });
            return { success: false, error: 'No approved app update candidate. Check for updates first.' };
        }

        const { assetUrl, assetName, assetSizeBytes, assetSha256 } = this.approvedCandidate;
        const safeFileName = this.sanitizeDownloadFileName(assetName);
        if (!safeFileName) {
            this.writeAuditEvent('download-rejected', { reason: 'invalid-filename', assetName });
            return { success: false, error: 'Invalid download filename.' };
        }

        const folder = await dialog.showOpenDialog({
            title: 'Select download folder / Selecciona carpeta de descarga',
            defaultPath: app.getPath('downloads'),
            properties: ['openDirectory', 'createDirectory']
        });

        if (folder.canceled || folder.filePaths.length === 0) {
            this.writeAuditEvent('download-canceled', { reason: 'folder-dialog' });
            return { success: false, canceled: true };
        }

        const targetFolder = folder.filePaths[0];
        const targetPath = this.getUniqueFilePath(targetFolder, safeFileName);
        const stagingFolder = this.getStagingFolder(this.approvedCandidate.latestVersion);
        this.cleanupPartialFiles(stagingFolder);
        const diskSpaceError = this.validateDiskSpace(stagingFolder, targetFolder, assetSizeBytes);
        if (diskSpaceError) {
            this.writeAuditEvent('download-rejected', { reason: 'insufficient-disk-space', error: diskSpaceError });
            return { success: false, error: diskSpaceError };
        }

        const stagedPath = this.getUniqueFilePath(stagingFolder, safeFileName);
        const tempPath = `${stagedPath}.part`;
        this.writeAuditEvent('download-started', {
            latestVersion: this.approvedCandidate.latestVersion,
            assetName: safeFileName,
            assetSizeBytes
        });

        const controller = new AbortController();
        this.activeDownloadController = controller;
        this.activeDownloadCancelRequested = false;
        const timer = setTimeout(() => controller.abort(), this.downloadTimeoutMs);

        try {
            const response = await fetch(assetUrl, {
                method: 'GET',
                headers: { 'User-Agent': 'All-Updater' },
                redirect: 'follow',
                signal: controller.signal
            });

            if (!response.ok || !response.body) {
                this.writeAuditEvent('download-failed', { assetName: safeFileName, status: response.status });
                return { success: false, error: `Download failed with HTTP ${response.status}` };
            }

            const totalBytes = Number.parseInt(response.headers.get('content-length') || '0', 10) || 0;
            if (response.url) {
                const responseUrl = new URL(response.url);
                if (responseUrl.protocol !== 'https:' || !this.isAllowedDownloadHost(responseUrl.hostname)) {
                    this.writeAuditEvent('download-failed', { assetName: safeFileName, reason: 'untrusted-redirect', host: responseUrl.hostname });
                    return { success: false, error: 'Download redirected to an untrusted host.' };
                }
            }
            if (totalBytes > this.maxDownloadBytes || totalBytes > assetSizeBytes) {
                this.writeAuditEvent('download-failed', { assetName: safeFileName, reason: 'size-exceeded', totalBytes, assetSizeBytes });
                return { success: false, error: 'Download size exceeds the approved release asset size.' };
            }

            let downloadedBytes = 0;

            const nodeReadable = Readable.fromWeb(
                response.body as unknown as Parameters<typeof Readable.fromWeb>[0]
            );
            nodeReadable.on('data', (chunk: Buffer) => {
                downloadedBytes += chunk.length;
                if (downloadedBytes > this.maxDownloadBytes || downloadedBytes > assetSizeBytes) {
                    controller.abort();
                    return;
                }

                const percent = totalBytes > 0
                    ? Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)))
                    : null;

                this.emitProgress(sender, {
                    fileName: safeFileName,
                    downloadedBytes,
                    totalBytes,
                    percent
                });
            });

            await pipeline(nodeReadable, fs.createWriteStream(tempPath, { flags: 'wx' }));
            fs.renameSync(tempPath, stagedPath);

            this.emitProgress(sender, {
                fileName: safeFileName,
                downloadedBytes: totalBytes || downloadedBytes,
                totalBytes,
                percent: 100
            });

            if (assetSha256) {
                const actualSha256 = await this.computeSha256(stagedPath);
                const matches = actualSha256.toLowerCase() === assetSha256.toLowerCase();
                if (!matches) {
                    try {
                        fs.unlinkSync(stagedPath);
                    } catch {
                        // Ignore cleanup errors
                    }

                    this.writeAuditEvent('verification-failed', { assetName: safeFileName, reason: 'hash-mismatch' });
                    return {
                        success: false,
                        error: 'HashMismatch: Downloaded file hash does not match expected release hash.',
                        hashExpected: assetSha256,
                        hashActual: actualSha256
                    };
                }

                const signature = await this.verifyDownloadedAssetSignature(stagedPath);
                if (signature.status === 'invalid') {
                    try {
                        fs.unlinkSync(stagedPath);
                    } catch {
                        // Ignore cleanup errors
                    }

                    this.writeAuditEvent('verification-failed', { assetName: safeFileName, reason: 'signature-invalid', signatureMessage: signature.message });
                    return {
                        success: false,
                        error: 'SignatureInvalid: Downloaded file signature is invalid.',
                        hashExpected: assetSha256,
                        hashActual: actualSha256,
                        ...this.signatureResultToDownloadFields(signature)
                    };
                }

                fs.copyFileSync(stagedPath, targetPath);
                this.writeAuditEvent('download-completed', {
                    assetName: safeFileName,
                    filePath: targetPath,
                    hashVerified: true,
                    signatureStatus: signature.status
                });

                return {
                    success: true,
                    filePath: targetPath,
                    hashVerified: true,
                    hashExpected: assetSha256,
                    hashActual: actualSha256,
                    ...this.signatureResultToDownloadFields(signature)
                };
            }

            const signature = await this.verifyDownloadedAssetSignature(stagedPath);
            if (signature.status === 'invalid') {
                try {
                    fs.unlinkSync(stagedPath);
                } catch {
                    // Ignore cleanup errors
                }

                this.writeAuditEvent('verification-failed', { assetName: safeFileName, reason: 'signature-invalid', signatureMessage: signature.message });
                return {
                    success: false,
                    error: 'SignatureInvalid: Downloaded file signature is invalid.',
                    hashVerified: false,
                    ...this.signatureResultToDownloadFields(signature)
                };
            }

            fs.copyFileSync(stagedPath, targetPath);
            this.writeAuditEvent('download-completed', {
                assetName: safeFileName,
                filePath: targetPath,
                hashVerified: false,
                signatureStatus: signature.status
            });

            return {
                success: true,
                filePath: targetPath,
                hashVerified: false,
                ...this.signatureResultToDownloadFields(signature)
            };
        } catch (error) {
            try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch {
                // ignore cleanup errors
            }

            if (this.activeDownloadCancelRequested) {
                this.writeAuditEvent('download-canceled', { reason: 'user-request' });
                return { success: false, canceled: true };
            }

            this.writeAuditEvent('download-failed', { assetName: safeFileName, error: String(error) });
            return {
                success: false,
                error: String(error)
            };
        } finally {
            clearTimeout(timer);
            if (this.activeDownloadController === controller) {
                this.activeDownloadController = null;
                this.activeDownloadCancelRequested = false;
            }
        }
    }

    cancelActiveDownload(): boolean {
        if (!this.activeDownloadController) return false;
        this.activeDownloadCancelRequested = true;
        this.activeDownloadController.abort();
        return true;
    }
}
