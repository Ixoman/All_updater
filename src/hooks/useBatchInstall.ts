import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastType } from '../components/Toast';
import type { TranslationKey } from '../shared/translations';
import {
  parseEstimatedPercentFromWingetLog,
  parsePercentFromWingetLog
} from '../utils/app-helpers';

interface UseBatchInstallParams {
  addToast: (message: string, type?: ToastType) => void;
  t: (key: TranslationKey) => string;
}

export type AppProgressMode = 'real' | 'estimated';

export function useBatchInstall({ addToast, t }: UseBatchInstallParams) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [isCreatingRestore, setIsCreatingRestore] = useState(false);
  const [cancelBatchRequested, setCancelBatchRequested] = useState(false);
  const [currentInstallingApp, setCurrentInstallingApp] = useState<string | null>(null);
  const [currentLogLine, setCurrentLogLine] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<string[]>([]);
  const [showDetailedLog, setShowDetailedLog] = useState(false);
  const [currentAppProgress, setCurrentAppProgress] = useState<number | null>(null);
  const [currentAppProgressMode, setCurrentAppProgressMode] = useState<AppProgressMode | null>(null);
  const [installProgress, setInstallProgress] = useState<{ current: number; total: number } | null>(null);
  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const estimatedProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchTimingRef = useRef<{ startedAt: number; total: number; completed: number } | null>(null);
  const installOfflineToastShownRef = useRef(false);
  const cancelBatchRequestedRef = useRef(false);
  const currentItemStartedAtRef = useRef<number | null>(null);
  const recentItemDurationsRef = useRef<number[]>([]);

  const pushLogEntry = useCallback((entry: string) => {
    setLogEntries((previous) => {
      if (previous[previous.length - 1] === entry) {
        return previous;
      }

      const next = [...previous, entry];
      return next.slice(-40);
    });
  }, []);

  const stopEstimatedAppProgress = useCallback(() => {
    if (estimatedProgressTimerRef.current !== null) {
      clearInterval(estimatedProgressTimerRef.current);
      estimatedProgressTimerRef.current = null;
    }
  }, []);

  const startEstimatedAppProgress = useCallback(() => {
    stopEstimatedAppProgress();
    setCurrentAppProgressMode('estimated');
    estimatedProgressTimerRef.current = setInterval(() => {
      setCurrentAppProgress((prev) => {
        if (prev === null) return 3;
        if (prev >= 92) return prev;
        const step = prev < 25 ? 3 : prev < 55 ? 2 : 1;
        return Math.min(prev + step, 92);
      });
    }, 1200);
  }, [stopEstimatedAppProgress]);

  const resetBatchInstallState = useCallback(() => {
    stopEstimatedAppProgress();
    setIsInstalling(false);
    setIsCreatingRestore(false);
    setInstallProgress(null);
    setCurrentInstallingApp(null);
    setCurrentLogLine(null);
    setLogEntries([]);
    setShowDetailedLog(false);
    setCurrentAppProgress(null);
    setCurrentAppProgressMode(null);
    setEstimatedRemainingSeconds(null);
    batchTimingRef.current = null;
    cancelBatchRequestedRef.current = false;
    currentItemStartedAtRef.current = null;
    recentItemDurationsRef.current = [];
    setCancelBatchRequested(false);
  }, [stopEstimatedAppProgress]);

  const beginInstallSession = useCallback(() => {
    stopEstimatedAppProgress();
    setIsInstalling(true);
    setIsCreatingRestore(false);
    setInstallProgress(null);
    setCurrentInstallingApp(null);
    setCurrentLogLine(null);
    setLogEntries([]);
    setShowDetailedLog(false);
    setCurrentAppProgress(null);
    setCurrentAppProgressMode(null);
    setEstimatedRemainingSeconds(null);
    batchTimingRef.current = null;
    cancelBatchRequestedRef.current = false;
    currentItemStartedAtRef.current = null;
    recentItemDurationsRef.current = [];
    setCancelBatchRequested(false);
  }, [stopEstimatedAppProgress]);

  const initializeBatchProgress = useCallback((total: number) => {
    setInstallProgress({ current: 0, total });
    batchTimingRef.current = { startedAt: Date.now(), total, completed: 0 };
    setEstimatedRemainingSeconds(null);
  }, []);

  const updateBatchProgress = useCallback((current: number, total: number) => {
    setInstallProgress({ current, total });

    if (batchTimingRef.current) {
      batchTimingRef.current.completed = current;
      batchTimingRef.current.total = total;
      return;
    }

    batchTimingRef.current = { startedAt: Date.now(), total, completed: current };
  }, []);

  const markBatchItemStarted = useCallback(() => {
    currentItemStartedAtRef.current = Date.now();
  }, []);

  const markBatchItemCompleted = useCallback(() => {
    const startedAt = currentItemStartedAtRef.current;
    currentItemStartedAtRef.current = null;
    if (startedAt === null) return;

    const durationMs = Math.max(0, Date.now() - startedAt);
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;

    recentItemDurationsRef.current = [...recentItemDurationsRef.current, durationMs].slice(-6);
  }, []);

  const toggleDetailedLog = useCallback(() => {
    setShowDetailedLog((previous) => !previous);
  }, []);

  const requestBatchCancel = useCallback(() => {
    if (!isInstalling || cancelBatchRequestedRef.current) return;
    cancelBatchRequestedRef.current = true;
    setCancelBatchRequested(true);
    setCurrentLogLine(t('updateBatchCancelPending'));
    addToast(t('updateBatchCancelPending'), 'warning');
  }, [addToast, isInstalling, t]);

  const isBatchCancelRequested = useCallback(() => cancelBatchRequestedRef.current, []);

  useEffect(() => {
    const handleLog = (_event: unknown, log: string) => {
      const cleanLog = log.replace(/\[#+ -+\]/g, '').trim();
      if (!cleanLog) return;

      setCurrentLogLine(cleanLog);
      pushLogEntry(cleanLog);

      const realPercent = parsePercentFromWingetLog(cleanLog);
      if (realPercent !== null) {
        stopEstimatedAppProgress();
        setCurrentAppProgressMode('real');
        setCurrentAppProgress((prev) => Math.max(prev ?? 0, realPercent));
        return;
      }

      const estimatedPercent = parseEstimatedPercentFromWingetLog(cleanLog);
      if (estimatedPercent !== null) {
        setCurrentAppProgressMode((prev) => (prev === 'real' ? prev : 'estimated'));
        setCurrentAppProgress((prev) => Math.max(prev ?? 0, estimatedPercent));
      }
    };

    window.ipcRenderer.on('winget:log', handleLog);
    return () => {
      window.ipcRenderer.off('winget:log', handleLog);
      stopEstimatedAppProgress();
    };
  }, [pushLogEntry, stopEstimatedAppProgress]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    void window.ipcRenderer.invoke('system:set-online-state', isOnline).catch((error) => {
      console.error('[useBatchInstall] Failed to sync online state:', error);
    });
  }, [isOnline]);

  useEffect(() => {
    if (!isInstalling) {
      installOfflineToastShownRef.current = false;
      return;
    }

    if (!isOnline && !installOfflineToastShownRef.current) {
      installOfflineToastShownRef.current = true;
      addToast(t('installNetworkLostWarning'), 'warning');
      return;
    }

    if (isOnline) {
      installOfflineToastShownRef.current = false;
    }
  }, [addToast, isInstalling, isOnline, t]);

  useEffect(() => {
    if (!isInstalling || !batchTimingRef.current || !installProgress) return;

    const updateEstimate = () => {
      const timing = batchTimingRef.current;
      if (!timing) {
        setEstimatedRemainingSeconds(null);
        return;
      }

      const completed = installProgress.current;
      const total = installProgress.total;
      if (completed <= 0 || total <= 0 || completed >= total) {
        setEstimatedRemainingSeconds(completed >= total ? 0 : null);
        return;
      }

      const elapsedMs = Math.max(0, Date.now() - timing.startedAt);
      const progressFraction = currentAppProgress !== null && completed < total
        ? Math.max(0, Math.min(0.99, currentAppProgress / 100))
        : 0;
      const effectiveCompleted = Math.max(0.1, Math.min(total, completed + progressFraction));
      const elapsedAverageMs = elapsedMs / effectiveCompleted;

      const recentDurations = recentItemDurationsRef.current;
      let estimatedPerItemMs = elapsedAverageMs;

      if (recentDurations.length > 0) {
        const weightedTotal = recentDurations.reduce((sum, duration, index) => sum + duration * (index + 1), 0);
        const weightSum = recentDurations.reduce((sum, _duration, index) => sum + (index + 1), 0);
        const weightedRecentMs = weightedTotal / weightSum;
        estimatedPerItemMs = (weightedRecentMs * 0.7) + (elapsedAverageMs * 0.3);
      }

      const remainingItems = Math.max(0, total - effectiveCompleted);
      const estimateSeconds = Math.round((estimatedPerItemMs * remainingItems) / 1000);
      setEstimatedRemainingSeconds(Math.max(0, estimateSeconds));
    };

    updateEstimate();
    const intervalId = window.setInterval(updateEstimate, 1000);
    return () => window.clearInterval(intervalId);
  }, [currentAppProgress, installProgress, isInstalling]);

  return {
    isInstalling,
    isCreatingRestore,
    cancelBatchRequested,
    currentInstallingApp,
    currentLogLine,
    logEntries,
    showDetailedLog,
    currentAppProgress,
    currentAppProgressMode,
    installProgress,
    estimatedRemainingSeconds,
    isOnline,
    setIsCreatingRestore,
    setCurrentInstallingApp,
    setCurrentLogLine,
    setCurrentAppProgress,
    setCurrentAppProgressMode,
    startEstimatedAppProgress,
    stopEstimatedAppProgress,
    markBatchItemStarted,
    markBatchItemCompleted,
    toggleDetailedLog,
    beginInstallSession,
    initializeBatchProgress,
    updateBatchProgress,
    requestBatchCancel,
    isBatchCancelRequested,
    resetBatchInstallState
  };
}
