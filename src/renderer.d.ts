import type {
    AppUpdate,
    DiagnosticsExportResult,
    AppUpdateDownloadProgress,
    AppUpdateDownloadResult,
    AppVersionCheckResult,
    DataFolderStatus,
    HistoryItem,
    IgnoreRule,
    PreflightResult,
    RestorePointResult,
    RestorePointVerificationResult,
    WingetHealthStatus
} from './shared/types';

interface SystemInfo {
    arch: string;
    locale: string;
}

interface SettingsMap {
    theme: 'dark' | 'light' | 'system';
    language: 'en' | 'es';
    fontSize: 'small' | 'medium' | 'large';
    hasSeenOnboarding: boolean;
}

interface RendererEventMap {
    'winget:log': [log: string];
    'main-process-message': [message: string];
    'app-update:download-progress': [progress: AppUpdateDownloadProgress];
}

export interface IElectronAPI {
    invoke(channel: 'winget:check-updates'): Promise<AppUpdate[]>;
    invoke(channel: 'winget:install-update', id: string): Promise<void>;
    invoke(channel: 'winget:get-release-notes-url', id: string): Promise<string | null>;
    invoke(channel: 'winget:get-health'): Promise<WingetHealthStatus>;
    invoke(channel: 'system:create-restore-point', description: string): Promise<RestorePointResult>;
    invoke(channel: 'system:verify-restore-point', sequenceNumber: number, description: string): Promise<RestorePointVerificationResult>;
    invoke(channel: 'system:open-logs'): Promise<void>;
    invoke(channel: 'system:is-elevated'): Promise<boolean>;
    invoke(channel: 'system:get-info'): Promise<SystemInfo>;
    invoke<K extends keyof SettingsMap>(channel: 'settings:get', key: K): Promise<SettingsMap[K]>;
    invoke<K extends keyof SettingsMap>(channel: 'settings:set', key: K, value: SettingsMap[K]): Promise<void>;
    invoke(channel: 'system:set-operation-active', active: boolean): Promise<void>;
    invoke(channel: 'system:open-url', url: string): Promise<void>;
    invoke(channel: 'system:show-item-in-folder', targetPath: string): Promise<void>;
    invoke(channel: 'system:open-path', targetPath: string): Promise<void>;
    invoke(channel: 'system:open-system-restore'): Promise<void>;
    invoke(channel: 'system:open-services-console'): Promise<void>;
    invoke(channel: 'system:check-app-update'): Promise<AppVersionCheckResult>;
    invoke(channel: 'system:download-app-update', assetUrl: string, fileName: string, expectedSha256?: string): Promise<AppUpdateDownloadResult>;
    invoke(channel: 'system:run-preflight'): Promise<PreflightResult>;
    invoke(channel: 'system:export-diagnostics'): Promise<DiagnosticsExportResult>;
    invoke(channel: 'system:check-data-folder'): Promise<DataFolderStatus>;
    invoke(channel: 'history:get'): Promise<HistoryItem[]>;
    invoke(channel: 'history:add', entry: Omit<HistoryItem, 'date'>): Promise<void>;
    invoke(channel: 'history:clear'): Promise<void>;
    invoke(channel: 'ignore:get-active'): Promise<IgnoreRule[]>;
    invoke(channel: 'ignore:add-temporary', id: string, availableVersion: string | undefined, days: number): Promise<IgnoreRule>;
    invoke(channel: 'system:get-userdata-path'): Promise<string>;

    on<K extends keyof RendererEventMap>(
        channel: K,
        listener: (event: unknown, ...args: RendererEventMap[K]) => void
    ): void;
    off<K extends keyof RendererEventMap>(
        channel: K,
        listener: (event: unknown, ...args: RendererEventMap[K]) => void
    ): void;
    send(channel: 'log:info', message: string): void;
    send(channel: 'log:error', message: string): void;
}

declare global {
    interface Window {
        ipcRenderer: IElectronAPI;
    }
}
