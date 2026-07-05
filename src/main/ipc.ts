import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { WingetService } from './services/winget.js';
import { SystemRestoreService } from './services/restore.js';
import { SettingsService, type UserSettings } from './services/settings.js';
import { LoggerService } from './services/logger.js';
import { SystemService } from './services/system.js';
import { HistoryService } from './services/history.js';
import { AppUpdateService } from './services/app-update.js';
import { PreflightService } from './services/preflight.js';
import { DiagnosticsService } from './services/diagnostics.js';
import { IgnoreService } from './services/ignore.js';
import { assertWithinIpcRateLimit, pruneExpiredIpcRateLimits, type IpcRateLimitConfig } from './ipc-rate-limit.js';
import type { HistoryItem } from '../shared/types.js';
import log from 'electron-log/main'; // Import directly to access transport

const historyService = new HistoryService();
const restoreService = new SystemRestoreService();
const settingsService = new SettingsService();
const logger = new LoggerService();
const systemService = new SystemService();
const wingetService = new WingetService(systemService, historyService);
const appUpdateService = new AppUpdateService();
const preflightService = new PreflightService();
const diagnosticsService = new DiagnosticsService(logger);
const ignoreService = new IgnoreService();
const approvedRendererPaths = new Set<string>();
const ipcRateLimitState = new Map<string, { windowStartedAt: number; count: number }>();

const IPC_RATE_LIMITS = {
    wingetCheckUpdates: { windowMs: 5000, maxCalls: 2 },
    wingetGetHealth: { windowMs: 5000, maxCalls: 6 },
    systemCheckDataFolder: { windowMs: 5000, maxCalls: 12 },
    systemCheckAppUpdate: { windowMs: 10000, maxCalls: 4 },
    systemRunPreflight: { windowMs: 10000, maxCalls: 3 },
    systemExportDiagnostics: { windowMs: 30000, maxCalls: 2 }
} satisfies Record<string, IpcRateLimitConfig>;

const settingKeys: readonly (keyof UserSettings)[] = [
    'theme',
    'language',
    'fontSize',
    'hasSeenOnboarding'
];

function isSettingsKey(key: string): key is keyof UserSettings {
    return settingKeys.includes(key as keyof UserSettings);
}

function setSettingSafely(key: keyof UserSettings, value: unknown): void {
    switch (key) {
        case 'theme':
            if (value === 'dark' || value === 'light' || value === 'system') {
                settingsService.set('theme', value);
                return;
            }
            break;
        case 'language':
            if (value === 'en' || value === 'es') {
                settingsService.set('language', value);
                return;
            }
            break;
        case 'fontSize':
            if (value === 'small' || value === 'medium' || value === 'large') {
                settingsService.set('fontSize', value);
                return;
            }
            break;
        case 'hasSeenOnboarding':
            if (typeof value === 'boolean') {
                settingsService.set('hasSeenOnboarding', value);
                return;
            }
            break;
        default:
            break;
    }

    throw new Error(`Invalid value for setting ${key}`);
}

const historyStatuses = new Set<HistoryItem['status']>([
    'success',
    'failed',
    'skipped',
    'inapplicable',
    'reboot',
    'in-use',
    'security-error'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, key: string, maxLength: number): string {
    const value = record[key];
    if (typeof value !== 'string') {
        throw new Error(`Invalid ${key}`);
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength) {
        throw new Error(`Invalid ${key}`);
    }

    return trimmed;
}

function readOptionalString(record: Record<string, unknown>, key: string, maxLength: number): string | undefined {
    const value = record[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') {
        throw new Error(`Invalid ${key}`);
    }

    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.length > maxLength) {
        throw new Error(`Invalid ${key}`);
    }

    return trimmed;
}

function validateHistoryEntryPayload(entry: unknown): Omit<HistoryItem, 'date'> {
    if (!isRecord(entry)) {
        throw new Error('Invalid history entry');
    }

    const status = entry.status;
    if (typeof status !== 'string' || !historyStatuses.has(status as HistoryItem['status'])) {
        throw new Error('Invalid history status');
    }

    const validated: Omit<HistoryItem, 'date'> = {
        id: readRequiredString(entry, 'id', 256),
        appName: readRequiredString(entry, 'appName', 200),
        version: readRequiredString(entry, 'version', 128),
        status: status as HistoryItem['status']
    };

    const previousVersion = readOptionalString(entry, 'previousVersion', 128);
    if (previousVersion) {
        validated.previousVersion = previousVersion;
    }

    const details = readOptionalString(entry, 'details', 2000);
    if (details) {
        validated.details = details;
    }

    return validated;
}

function validatePackageIdInput(id: unknown): string {
    if (typeof id !== 'string') {
        throw new Error('Invalid package id');
    }

    const trimmed = id.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,255}$/.test(trimmed)) {
        throw new Error('Invalid package id');
    }

    return trimmed;
}

function validateOptionalVersionInput(version: unknown): string | undefined {
    if (version === undefined || version === null) return undefined;
    if (typeof version !== 'string') {
        throw new Error('Invalid package version');
    }

    const trimmed = version.trim();
    if (!trimmed) return undefined;
    if (trimmed.length > 128 || Array.from(trimmed).some((char) => char.charCodeAt(0) < 32)) {
        throw new Error('Invalid package version');
    }

    return trimmed;
}

function normalizePathForPolicy(targetPath: string): string {
    const resolved = path.resolve(targetPath);
    try {
        return fs.realpathSync.native(resolved);
    } catch {
        return resolved;
    }
}

function isPathInside(parentPath: string, targetPath: string): boolean {
    const relative = path.relative(parentPath, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function registerApprovedRendererPath(targetPath?: string): void {
    if (!targetPath || typeof targetPath !== 'string') return;
    const normalized = normalizePathForPolicy(targetPath);
    approvedRendererPaths.add(normalized);

    try {
        const stat = fs.statSync(normalized);
        if (stat.isFile()) {
            approvedRendererPaths.add(path.dirname(normalized));
        }
    } catch {
        approvedRendererPaths.add(path.dirname(normalized));
    }
}

function assertSafeRendererPath(targetPath: string): string {
    if (!targetPath || typeof targetPath !== 'string') {
        throw new Error('Invalid path.');
    }

    const normalizedTarget = normalizePathForPolicy(targetPath);
    const userDataPath = normalizePathForPolicy(app.getPath('userData'));
    if (isPathInside(userDataPath, normalizedTarget)) {
        return normalizedTarget;
    }

    if (approvedRendererPaths.has(normalizedTarget)) {
        return normalizedTarget;
    }

    throw new Error('Path is outside allowed local app locations.');
}

function enforceIpcRateLimit(
    event: IpcMainInvokeEvent,
    channel: string,
    config: IpcRateLimitConfig
): void {
    const key = `${event.sender.id}:${channel}`;
    pruneExpiredIpcRateLimits(ipcRateLimitState, config.windowMs);
    assertWithinIpcRateLimit(ipcRateLimitState, key, config);
}

export function setupIPC() {
    console.log('[IPC] Setting up IPC handlers...');

    // Winget
    ipcMain.handle('winget:check-updates', async (event) => {
        enforceIpcRateLimit(event, 'winget:check-updates', IPC_RATE_LIMITS.wingetCheckUpdates);
        console.log('[IPC] winget:check-updates handler called');
        logger.info('Checking for updates...');
        return await wingetService.getAvailableUpdates();
    });

    console.log('[IPC] IPC handlers registered successfully');

    ipcMain.handle('winget:install-update', async (event, id: string) => {
        logger.info(`Installing update for ${id}`);
        try {
            return await wingetService.installUpdate(id, (logLine) => {
                event.sender.send('winget:log', logLine);
            });
        } catch (error) {
            const typedError = error as Error & { technicalDetails?: string };
            const errorMessage = typedError?.message || String(error);
            const technicalDetails = typedError?.technicalDetails;
            logger.error(
                technicalDetails
                    ? `Install failed for ${id}: ${errorMessage} | details: ${technicalDetails}`
                    : `Install failed for ${id}: ${errorMessage}`
            );
            throw error;
        }
    });

    ipcMain.handle('winget:get-release-notes-url', async (_, id: string) => {
        if (!id || typeof id !== 'string') {
            throw new Error('Invalid package id');
        }
        return await wingetService.getReleaseNotesUrl(id);
    });

    ipcMain.handle('winget:get-health', async (event) => {
        enforceIpcRateLimit(event, 'winget:get-health', IPC_RATE_LIMITS.wingetGetHealth);
        return await wingetService.getHealth();
    });

    ipcMain.handle('system:set-online-state', async (_, isOnline: boolean) => {
        wingetService.setOnlineState(Boolean(isOnline));
    });

    // System Restore
    ipcMain.handle('system:create-restore-point', async (_, description: string) => {
        logger.info(`Creating restore point: ${description}`);
        const result = await restoreService.createRestorePoint(description);
        if (result.success) {
            logger.info(
                `Restore point created successfully. sequence=${result.sequenceNumber ?? 'n/a'} description="${result.description ?? 'n/a'}"`
            );
        } else {
            logger.warn(
                `Restore point creation failed. reason=${result.reason || 'unknown'} details=${result.details || 'n/a'}`
            );
        }
        return result;
    });

    ipcMain.handle('system:verify-restore-point', async (_, sequenceNumber: number, description: string) => {
        logger.info(`Verifying restore point after batch. sequence=${sequenceNumber} description="${description}"`);
        const result = await restoreService.verifyRestorePoint(sequenceNumber, description);
        if (result.confirmed) {
            logger.info(
                `Restore point still confirmed after batch. sequence=${result.sequenceNumber} description="${result.actualDescription || description}"`
            );
        } else {
            logger.warn(
                `Restore point could not be confirmed after batch. sequence=${sequenceNumber} description="${description}" details=${result.details || 'n/a'}`
            );
        }
        return result;
    });

    // Settings
    ipcMain.handle('settings:get', (_, key: string) => {
        if (!isSettingsKey(key)) {
            throw new Error(`Invalid settings key: ${key}`);
        }
        return settingsService.get(key);
    });
    ipcMain.handle('settings:set', (_, key: string, value: unknown) => {
        if (!isSettingsKey(key)) {
            throw new Error(`Invalid settings key: ${key}`);
        }
        setSettingSafely(key, value);
    });

    // Logs
    ipcMain.handle('system:open-logs', async () => {
        try {
            const logFile = log.transports.file.getFile();
            // Try enabling console logging too
            log.transports.console.level = 'debug';

            if (logFile) {
                console.log('Opening log file at:', logFile.path);
                await shell.showItemInFolder(logFile.path);
            } else {
                console.error('Log file object is null');
            }
        } catch (error) {
            console.error(`Failed to open logs: ${error}`);
        }
    });

    ipcMain.handle('system:is-elevated', async () => {
        return await wingetService.isElevated();
    });

    ipcMain.handle('system:get-info', async () => {
        return systemService.getSystemInfo();
    });

    ipcMain.handle('system:get-userdata-path', async () => {
        return (await import('electron')).app.getPath('userData');
    });

    ipcMain.handle('system:check-data-folder', async (event) => {
        enforceIpcRateLimit(event, 'system:check-data-folder', IPC_RATE_LIMITS.systemCheckDataFolder);
        return systemService.checkUserDataWritable();
    });

    ipcMain.handle('system:open-url', async (_, url: string) => {
        if (!/^https?:\/\//i.test(url)) {
            throw new Error('Invalid URL protocol');
        }
        await shell.openExternal(url);
    });

    ipcMain.handle('system:show-item-in-folder', async (_, targetPath: string) => {
        const safePath = assertSafeRendererPath(targetPath);
        await shell.showItemInFolder(safePath);
    });

    ipcMain.handle('system:open-path', async (_, targetPath: string) => {
        const safePath = assertSafeRendererPath(targetPath);
        const error = await shell.openPath(safePath);
        if (error) {
            throw new Error(error);
        }
    });

    ipcMain.handle('system:open-system-restore', async () => {
        await systemService.openSystemProtection();
    });

    ipcMain.handle('system:open-services-console', async () => {
        await systemService.openServicesConsole();
    });

    ipcMain.handle('system:check-app-update', async (event) => {
        enforceIpcRateLimit(event, 'system:check-app-update', IPC_RATE_LIMITS.systemCheckAppUpdate);
        logger.info('Checking for app updates (GitHub release)...');
        return await appUpdateService.checkLatestVersion();
    });

    ipcMain.handle('system:download-app-update', async (event) => {
        logger.info('Downloading approved app update asset');
        const result = await appUpdateService.downloadUpdateAsset(event.sender);
        if (result.filePath) {
            registerApprovedRendererPath(result.filePath);
        }
        return result;
    });

    ipcMain.handle('system:cancel-app-update-download', async () => {
        logger.info('Canceling active app update download');
        return appUpdateService.cancelActiveDownload();
    });

    ipcMain.handle('system:run-preflight', async (event) => {
        enforceIpcRateLimit(event, 'system:run-preflight', IPC_RATE_LIMITS.systemRunPreflight);
        logger.info('Running preflight checks...');
        return await preflightService.run();
    });

    ipcMain.handle('system:export-diagnostics', async (event) => {
        enforceIpcRateLimit(event, 'system:export-diagnostics', IPC_RATE_LIMITS.systemExportDiagnostics);
        logger.info('Exporting diagnostics package...');
        const result = await diagnosticsService.exportDiagnostics();
        if (result.filePath) {
            registerApprovedRendererPath(result.filePath);
        }
        return result;
    });

    // History
    ipcMain.handle('history:get', async () => historyService.getHistory());
    ipcMain.handle('history:add', async (_, entry: unknown) => {
        historyService.addEntry(validateHistoryEntryPayload(entry));
    });
    ipcMain.handle('history:clear', async () => {
        historyService.clearHistory();
    });
    ipcMain.handle('system:factory-reset', async () => {
        historyService.clearHistory();
        ignoreService.clearAll();
        settingsService.set('language', 'en');
        settingsService.set('hasSeenOnboarding', false);
    });

    // Ignore rules
    ipcMain.handle('ignore:get-active', async () => {
        return ignoreService.getActiveRules();
    });
    ipcMain.handle('ignore:add-temporary', async (_, id: unknown, availableVersion: unknown, days: number) => {
        return ignoreService.addTemporaryIgnore(
            validatePackageIdInput(id),
            validateOptionalVersionInput(availableVersion),
            days
        );
    });

    // Logger Pass-through
    ipcMain.on('log:info', (_, msg: string) => logger.info(msg));
    ipcMain.on('log:error', (_, msg: string) => logger.error(msg));
}
