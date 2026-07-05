import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppVersionCheckResult } from '../shared/types';
import type { TranslationKey } from '../shared/translations';
import type { ToastType } from '../components/Toast';

interface UseAppUpdateParams {
    addToast: (message: string, type?: ToastType) => void;
    t: (key: TranslationKey) => string;
}

export interface DownloadGuideState {
    filePath: string;
    isZip: boolean;
}

export function useAppUpdate({ addToast, t }: UseAppUpdateParams) {
    const [appUpdateInfo, setAppUpdateInfo] = useState<AppVersionCheckResult | null>(null);
    const [checkingAppVersion, setCheckingAppVersion] = useState(false);
    const [downloadingAppUpdate, setDownloadingAppUpdate] = useState(false);
    const [appUpdateProgress, setAppUpdateProgress] = useState<number | null>(null);
    const [lastDownloadedUpdatePath, setLastDownloadedUpdatePath] = useState<string | null>(null);
    const [downloadGuideState, setDownloadGuideState] = useState<DownloadGuideState | null>(null);
    const initialAppVersionCheckDoneRef = useRef(false);

    const runInitialAppVersionCheck = useCallback(async () => {
        if (initialAppVersionCheckDoneRef.current) return;
        initialAppVersionCheckDoneRef.current = true;

        try {
            const result = await window.ipcRenderer.invoke('system:check-app-update');
            setAppUpdateInfo(result);
        } catch (error) {
            console.error('[useAppUpdate] Silent app-update check failed:', error);
        }
    }, []);

    const checkAppUpdate = useCallback(async (silent = false) => {
        setCheckingAppVersion(true);
        try {
            const result = await window.ipcRenderer.invoke('system:check-app-update');
            setAppUpdateInfo(result);

            if (silent) return;

            if (!result.success) {
                if (result.offline) {
                    addToast(t('appUpdateOffline'), 'info');
                } else {
                    addToast(t('appUpdateCheckFailed'), 'warning');
                }
                return;
            }

            if (result.hasUpdate) {
                addToast(`${t('appUpdateAvailable')}: v${result.latestVersion}`, 'info');
            } else {
                addToast(t('appUpdateNoUpdates'), 'info');
            }
        } catch (error) {
            console.error('[useAppUpdate] Failed to check app version:', error);
            if (!silent) {
                addToast(t('appUpdateCheckFailed'), 'warning');
            }
        } finally {
            setCheckingAppVersion(false);
        }
    }, [addToast, t]);

    const downloadAppUpdate = useCallback(async () => {
        if (!appUpdateInfo?.canDownload || !appUpdateInfo.assetName) {
            addToast(t('appUpdateMissingAsset'), 'warning');
            return;
        }

        setDownloadingAppUpdate(true);
        setAppUpdateProgress(0);
        setLastDownloadedUpdatePath(null);
        setDownloadGuideState(null);
        try {
            const result = await window.ipcRenderer.invoke('system:download-app-update');

            if (result.canceled) {
                addToast(t('appUpdateDownloadCanceled'), 'info');
                return;
            }

            if (result.success) {
                addToast(t('appUpdateDownloadSuccess'), 'success');
                const isZip = /\.zip$/i.test(appUpdateInfo.assetName);
                if (result.filePath) {
                    setLastDownloadedUpdatePath(result.filePath);
                    setDownloadGuideState({ filePath: result.filePath, isZip });
                    addToast(`${t('appUpdateSavedTo')} ${result.filePath}`, 'info');
                }
                if (result.hashVerified) {
                    addToast(t('appUpdateHashVerified'), 'success');
                } else {
                    addToast(t('appUpdateHashUnavailable'), 'warning');
                }
                if (result.signatureVerified) {
                    addToast(t('appUpdateSignatureVerified'), 'success');
                } else if (result.signatureStatus === 'unsigned' || result.signatureStatus === 'unknown') {
                    addToast(t('appUpdateSignatureUnsigned'), 'warning');
                }
                addToast(isZip ? t('appUpdateAfterDownloadZip') : t('appUpdateAfterDownloadExe'), 'warning');
                return;
            }

            console.error('[useAppUpdate] App update download failed:', result.error);
            if ((result.error || '').includes('HashMismatch')) {
                addToast(t('appUpdateHashMismatch'), 'error');
                return;
            }
            if ((result.error || '').includes('SignatureInvalid')) {
                addToast(t('appUpdateSignatureInvalid'), 'error');
                return;
            }
            if ((result.error || '').includes('InsufficientDiskSpace')) {
                addToast(t('appUpdateInsufficientSpace'), 'error');
                return;
            }
            addToast(t('appUpdateDownloadFailed'), 'error');
        } catch (error) {
            console.error('[useAppUpdate] App update download threw error:', error);
            addToast(t('appUpdateDownloadFailed'), 'error');
        } finally {
            setDownloadingAppUpdate(false);
            setTimeout(() => setAppUpdateProgress(null), 500);
        }
    }, [addToast, appUpdateInfo, t]);

    const closeDownloadGuide = useCallback(() => {
        setDownloadGuideState(null);
    }, []);

    const cancelAppUpdateDownload = useCallback(async () => {
        try {
            await window.ipcRenderer.invoke('system:cancel-app-update-download');
        } catch (error) {
            console.error('[useAppUpdate] Failed to cancel app update download:', error);
        }
    }, []);

    useEffect(() => {
        const handleAppUpdateProgress = (_event: unknown, progress: { percent: number | null }) => {
            setAppUpdateProgress(progress.percent);
        };

        window.ipcRenderer.on('app-update:download-progress', handleAppUpdateProgress);
        return () => window.ipcRenderer.off('app-update:download-progress', handleAppUpdateProgress);
    }, []);

    const hasAppUpdateBanner = useMemo(
        () => Boolean(appUpdateInfo?.success && appUpdateInfo.hasUpdate),
        [appUpdateInfo]
    );

    return {
        appUpdateInfo,
        checkingAppVersion,
        downloadingAppUpdate,
        appUpdateProgress,
        lastDownloadedUpdatePath,
        downloadGuideState,
        hasAppUpdateBanner,
        runInitialAppVersionCheck,
        checkAppUpdate,
        downloadAppUpdate,
        cancelAppUpdateDownload,
        closeDownloadGuide
    };
}
