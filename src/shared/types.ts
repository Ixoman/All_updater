export interface AppUpdate {
    name: string;
    id: string;
    version: string;
    available: string;
    source: string;
    previousStatus?: 'inapplicable' | 'failed' | 'skipped';
    previousDetails?: string;
}

export interface WingetResult {
    updates: AppUpdate[];
    rawOutput: string;
}

export interface HistoryItem {
    id: string;
    appName: string;
    version: string;
    previousVersion?: string;
    status: 'success' | 'failed' | 'skipped' | 'inapplicable' | 'reboot' | 'in-use' | 'security-error';
    date: string;
    details?: string;
}

export type RestoreFailureReason =
    | 'system-protection-disabled'
    | 'frequency-limit'
    | 'access-denied'
    | 'service-unavailable'
    | 'verification-failed'
    | 'command-failed'
    | 'unknown';

export interface RestorePointResult {
    success: boolean;
    reason?: RestoreFailureReason;
    details?: string;
    sequenceNumber?: number;
    description?: string;
}

export type ServiceRuntimeStatus = 'running' | 'stopped' | 'paused' | 'missing' | 'unknown';
export type ServiceStartupType = 'automatic' | 'manual' | 'disabled' | 'unknown';

export interface ServiceState {
    status: ServiceRuntimeStatus;
    startType: ServiceStartupType;
}

export interface RestorePointVerificationResult {
    confirmed: boolean;
    sequenceNumber: number;
    expectedDescription: string;
    actualDescription?: string;
    details?: string;
}

export interface AppVersionCheckResult {
    success: boolean;
    offline?: boolean;
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion?: string;
    releaseUrl?: string;
    assetName?: string;
    assetUrl?: string;
    assetSha256?: string;
    error?: string;
}

export interface AppUpdateDownloadProgress {
    fileName: string;
    downloadedBytes: number;
    totalBytes: number;
    percent: number | null;
}

export interface AppUpdateDownloadResult {
    success: boolean;
    canceled?: boolean;
    filePath?: string;
    hashVerified?: boolean;
    hashExpected?: string;
    hashActual?: string;
    error?: string;
}

export interface PreflightResult {
    success: boolean;
    overall: 'ok' | 'warning' | 'error';
    checks: {
        admin: boolean;
        winget: boolean;
        vssService: boolean;
        taskScheduler: boolean;
        restoreQuery: boolean;
    };
    details: Partial<Record<'admin' | 'winget' | 'vssService' | 'taskScheduler' | 'restoreQuery', string>>;
    serviceStates?: Partial<Record<'vssService' | 'taskScheduler', ServiceState>>;
}

export interface DiagnosticsExportResult {
    success: boolean;
    canceled?: boolean;
    filePath?: string;
    error?: string;
}

export interface IgnoreRule {
    id: string;
    availableVersion?: string;
    until: string;
    createdAt: string;
}

export interface WingetHealthStatus {
    installed: boolean;
    version?: string;
    sourcesHealthy: boolean;
    sourceSummary?: string;
    error?: string;
}

export interface DataFolderStatus {
    path: string;
    writable: boolean;
    details?: string;
}
