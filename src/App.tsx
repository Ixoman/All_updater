import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Layout } from './components/Layout';
import { UpdateCard } from './components/UpdateCard';
import { RestoreModal } from './components/RestoreModal';
import { RestoreFailureModal } from './components/RestoreFailureModal';
import { RestoreVerificationAlertModal } from './components/RestoreVerificationAlertModal';
import { PreflightModal } from './components/PreflightModal';
import { OnboardingModal } from './components/OnboardingModal';
import { ConflictModal } from './components/ConflictModal';
import { DownloadGuideModal } from './components/DownloadGuideModal';
import { HistoryView } from './components/HistoryView.tsx';
import { InstallStateOverlay } from './components/InstallStateOverlay';
import { SummaryModal } from './components/SummaryModal';
import type {
  AppUpdate,
  DataFolderStatus,
  HistoryItem,
  IgnoreRule,
  WingetHealthStatus
} from './shared/types';
import { RefreshCw, CheckCircle, Coffee, ArrowDownToLine, CheckSquare, Square, XCircle, FileText, FolderOpen, Wifi, WifiOff } from 'lucide-react';
import { ToastContainer, type ToastType } from './components/Toast';
import { useLanguage } from './context/LanguageContext';
import { useAppUpdate } from './hooks/useAppUpdate';
import { useBatchInstall } from './hooks/useBatchInstall';
import { useReleaseNotes } from './hooks/useReleaseNotes';
import { useUpdateFlow } from './hooks/useUpdateFlow';
import { clsx } from 'clsx';
import {
  buildIgnoreRuleKey,
  isUpdateIgnoredByRule,
} from './utils/app-helpers';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

type ThemeMode = 'dark' | 'light' | 'system';

export default function App() {
  const { t, language } = useLanguage();
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [systemInfo, setSystemInfo] = useState<{ arch: string, locale: string } | null>(null);
  const [isWingetMissing, setIsWingetMissing] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [darkMode, setDarkMode] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const [ignoredUntilById, setIgnoredUntilById] = useState<Partial<Record<string, string>>>({});
  const [ignoredHiddenCount, setIgnoredHiddenCount] = useState(0);
  const [wingetHealth, setWingetHealth] = useState<WingetHealthStatus | null>(null);
  const [checkingWingetHealth, setCheckingWingetHealth] = useState(false);
  const [dataFolderStatus, setDataFolderStatus] = useState<DataFolderStatus | null>(null);
  const initializedRef = useRef(false);
  const themeSaveAttemptRef = useRef(0);
  const historyWriteWarningShownRef = useRef(false);
  const lastDataFolderWritableRef = useRef<boolean | null>(null);
  const checkUpdatesRef = useRef<null | (() => Promise<void>)>(null);
  const selectableUpdates = updates.filter(u => u.previousStatus !== 'inapplicable');
  const allSelectableSelected = selectableUpdates.length > 0 && selectedIds.size === selectableUpdates.length;
  const activeIgnoredRulesCount = Object.keys(ignoredUntilById).length;
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
  };

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const resetHistoryWriteWarning = useCallback(() => {
    historyWriteWarningShownRef.current = false;
  }, []);

  const {
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
    closeDownloadGuide
  } = useAppUpdate({ addToast, t });

  const {
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
  } = useBatchInstall({ addToast, t });

  const batchInstallController = useMemo(() => ({
    beginInstallSession,
    resetBatchInstallState,
    initializeBatchProgress,
    updateBatchProgress,
    markBatchItemStarted,
    markBatchItemCompleted,
    setIsCreatingRestore,
    setCurrentInstallingApp,
    setCurrentLogLine,
    setCurrentAppProgress,
    setCurrentAppProgressMode,
    startEstimatedAppProgress,
    stopEstimatedAppProgress,
    isBatchCancelRequested
  }), [
    beginInstallSession,
    resetBatchInstallState,
    initializeBatchProgress,
    updateBatchProgress,
    markBatchItemStarted,
    markBatchItemCompleted,
    setIsCreatingRestore,
    setCurrentInstallingApp,
    setCurrentLogLine,
    setCurrentAppProgress,
    setCurrentAppProgressMode,
    startEstimatedAppProgress,
    stopEstimatedAppProgress,
    isBatchCancelRequested
  ]);

  const {
    releaseNotesUrlById,
    resetReleaseNotesState,
    prefetchReleaseNotesForUpdates,
    openReleaseNotesForUpdate
  } = useReleaseNotes({ addToast, t });

  const resolveDarkMode = (mode: ThemeMode): boolean => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  };

  const refreshDataFolderStatus = useCallback(async (silent = true) => {
    try {
      const status = await window.ipcRenderer.invoke('system:check-data-folder');
      setDataFolderStatus(status);
      const previousWritable = lastDataFolderWritableRef.current;
      lastDataFolderWritableRef.current = status.writable;

      const becameNotWritable = previousWritable === true && !status.writable;
      const firstDetectionNotWritable = previousWritable === null && !status.writable;
      if (!silent ? !status.writable : (becameNotWritable || firstDetectionNotWritable)) {
        addToast(t('dataFolderNotWritableToast'), 'error');
      }
    } catch (error) {
      console.error('[App] Failed to validate data folder:', error);
    }
  }, [addToast, t]);

  const refreshWingetHealth = useCallback(async (silent = true) => {
    setCheckingWingetHealth(true);
    try {
      const status = await window.ipcRenderer.invoke('winget:get-health');
      setWingetHealth(status);
      if (!silent && (!status.installed || !status.sourcesHealthy)) {
        addToast(t('wingetHealthNeedsAttention'), 'warning');
      }
    } catch (error) {
      console.error('[App] Failed to read winget health:', error);
      if (!silent) {
        addToast(t('wingetHealthUnknown'), 'warning');
      }
    } finally {
      setCheckingWingetHealth(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initializeApp = async () => {
      try {
        const info = await window.ipcRenderer.invoke('system:get-info');
        setSystemInfo(info);
      } catch (error) {
        console.error('[App] Failed to load system info:', error);
      }

      try {
        const theme = await window.ipcRenderer.invoke('settings:get', 'theme');
        const normalizedTheme: ThemeMode = theme === 'dark' || theme === 'light' || theme === 'system' ? theme : 'system';
        setThemeMode(normalizedTheme);
        setDarkMode(resolveDarkMode(normalizedTheme));
      } catch (error) {
        console.error('[App] Failed to load theme settings:', error);
        setThemeMode('system');
        setDarkMode(resolveDarkMode('system'));
      }

      try {
        const hasSeenOnboarding = await window.ipcRenderer.invoke('settings:get', 'hasSeenOnboarding');
        if (!hasSeenOnboarding) setShowOnboarding(true);
      } catch (error) {
        console.error('[App] Failed to load onboarding settings:', error);
        setShowOnboarding(true);
      }

      await refreshDataFolderStatus(false);

      void runInitialAppVersionCheck();

      void refreshWingetHealth(true);
    };

    void initializeApp();
  }, [refreshDataFolderStatus, refreshWingetHealth, runInitialAppVersionCheck]);

  useEffect(() => {
    if (themeMode !== 'system' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setDarkMode(mediaQuery.matches);
    handleChange();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [themeMode]);

  useEffect(() => {
    const handleFocus = () => { void refreshDataFolderStatus(true); };
    window.addEventListener('focus', handleFocus);
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refreshDataFolderStatus(true);
    }, 180000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(intervalId);
    };
  }, [refreshDataFolderStatus]);

  useEffect(() => {
    const handleFocus = () => { void refreshWingetHealth(true); };
    const handleOnlineRefresh = () => { void refreshWingetHealth(true); };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnlineRefresh);
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refreshWingetHealth(true);
    }, 300000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnlineRefresh);
      window.clearInterval(intervalId);
    };
  }, [refreshWingetHealth]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const toggleTheme = () => {
    const previousMode = themeMode;
    const previousDark = darkMode;
    const nextMode: ThemeMode = darkMode ? 'light' : 'dark';
    const saveAttempt = ++themeSaveAttemptRef.current;
    setThemeMode(nextMode);
    setDarkMode(nextMode === 'dark');
    void window.ipcRenderer.invoke('settings:set', 'theme', nextMode).catch((error) => {
      if (saveAttempt !== themeSaveAttemptRef.current) return;
      console.error('[App] Failed to persist theme:', error);
      setThemeMode(previousMode);
      setDarkMode(previousDark);
      addToast(t('settingsSaveWarning'), 'warning');
    });
  };

  const handleOnboardingClose = (dontShowAgain: boolean) => {
    setShowOnboarding(false);
    if (dontShowAgain) {
      void window.ipcRenderer.invoke('settings:set', 'hasSeenOnboarding', true).catch((error) => {
        console.error('[App] Failed to persist onboarding preference:', error);
        setShowOnboarding(true);
        addToast(t('settingsSaveWarning'), 'warning');
      });
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const addHistoryEntrySafely = async (entry: Omit<HistoryItem, 'date'>): Promise<void> => {
    try {
      await window.ipcRenderer.invoke('history:add', entry);
    } catch (error) {
      console.error('[App] Failed to write history entry:', error, entry);
      if (!historyWriteWarningShownRef.current) {
        historyWriteWarningShownRef.current = true;
        addToast(t('historyWriteWarning'), 'warning');
      }
    }
  };

  const {
    showRestoreModal,
    conflictState,
    restoreDecisionState,
    restoreVerificationAlert,
    showSummary,
    batchResults,
    preflightResult,
    runningPreflight,
    restoreVerificationSummary,
    summaryStats,
    handleUpdateClick,
    processUpdates,
    retryFailedFromSummary,
    hideSummary,
    closeRestoreVerificationAlert,
    closeRestoreModal,
    handleRestoreDecisionContinue,
    handleRestoreDecisionCancel,
    handlePreflightContinue,
    handlePreflightCancel,
    clearFlowState
  } = useUpdateFlow({
    addToast,
    t,
    updates,
    selectedIds,
    setUpdates,
    setSelectedIds,
    addHistoryEntrySafely,
    resetHistoryWriteWarning,
    refreshUpdatesAfterBatch: async () => {
      if (checkUpdatesRef.current) {
        await checkUpdatesRef.current();
      }
    },
    batchInstall: batchInstallController
  });

  const exportDiagnostics = async () => {
    setExportingDiagnostics(true);
    try {
      const result = await window.ipcRenderer.invoke('system:export-diagnostics');
      if (result.canceled) {
        addToast(t('exportDiagnosticsCanceled'), 'info');
        return;
      }
      if (result.success) {
        addToast(t('exportDiagnosticsSuccess'), 'success');
        if (result.filePath) {
          addToast(`${t('appUpdateSavedTo')} ${result.filePath}`, 'info');
        }
        return;
      }
      addToast(t('exportDiagnosticsFailed'), 'error');
    } catch (error) {
      console.error('[App] Failed to export diagnostics:', error);
      addToast(t('exportDiagnosticsFailed'), 'error');
    } finally {
      setExportingDiagnostics(false);
    }
  };

  const formatLocalDateTime = (isoDate: string): string => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    const locale = language === 'es' ? 'es-ES' : 'en-US';
    return parsed.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCompactText = (value: string, limit = 220): string => {
    const compact = value.replace(/\s+/g, ' ').trim();
    if (compact.length <= limit) return compact;
    return `${compact.slice(0, limit)}...`;
  };

  const ignoreUpdateForSevenDays = async (update: AppUpdate) => {
    try {
      const rule = await window.ipcRenderer.invoke('ignore:add-temporary', update.id, update.available, 7) as IgnoreRule;
      const ruleKey = buildIgnoreRuleKey(rule.id, rule.availableVersion);
      setIgnoredUntilById((prev) => ({ ...prev, [ruleKey]: rule.until }));
      setUpdates((prev) => prev.filter((item) => item.id !== update.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(update.id);
        return next;
      });
      addToast(
        t('ignoreApplied')
          .replace('{app}', update.name)
          .replace('{date}', formatLocalDateTime(rule.until)),
        'info'
      );
    } catch (error) {
      console.error(`[App] Failed to ignore update ${update.id}:`, error);
      addToast(t('ignoreApplyFailed'), 'error');
    }
  };

  const checkUpdates = async () => {
    setLoading(true);
    setUpdates([]);
    resetReleaseNotesState();
    setIgnoredHiddenCount(0);
    setHasChecked(false);
    const minLoadTime = new Promise(resolve => setTimeout(resolve, 800));
    const fetchUpdates = window.ipcRenderer.invoke('winget:check-updates');
    const fetchIgnoreRules = window.ipcRenderer.invoke('ignore:get-active');

    try {
      const [available, activeIgnoreRules] = await Promise.all([fetchUpdates, fetchIgnoreRules, minLoadTime]) as [AppUpdate[], IgnoreRule[], unknown];
      const activeIgnoreMap = Object.fromEntries(
        activeIgnoreRules.map((rule) => [buildIgnoreRuleKey(rule.id, rule.availableVersion), rule.until])
      );
      setIgnoredUntilById(activeIgnoreMap);
      const filteredAvailable = available.filter((update) => !activeIgnoreRules.some((rule) => isUpdateIgnoredByRule(update, rule)));
      const hiddenCount = available.length - filteredAvailable.length;
      setIgnoredHiddenCount(hiddenCount);
      if (hiddenCount > 0) {
        addToast(t('ignoreHiddenCount').replace('{count}', String(hiddenCount)), 'info');
      }

      setUpdates(filteredAvailable);
      void prefetchReleaseNotesForUpdates(filteredAvailable);
      // Only auto-select updates that are NOT inapplicable
      const installable = filteredAvailable.filter((u) => u.previousStatus !== 'inapplicable');
      const installableIds = new Set(installable.map((u) => u.id));
      setSelectedIds((previous) => {
        const preserved = new Set(Array.from(previous).filter((id) => installableIds.has(id)));
        if (preserved.size > 0 || (hasChecked && previous.size === 0)) {
          return preserved;
        }
        return new Set(installable.map((u) => u.id));
      });
      setHasChecked(true);
      setIsWingetMissing(false);
      void refreshWingetHealth(true);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error("[App] Failed to check updates:", error);
      if (
        errorMessage.includes('WingetNotFound') ||
        errorMessage.includes('ENOENT') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('not recognized')
      ) {
        setIsWingetMissing(true);
        setHasChecked(true);
      } else if (errorMessage.includes('WingetSourceIssue')) {
        setIsWingetMissing(false);
        addToast(t('wingetSourceIssue'), 'warning');
        setHasChecked(false);
      } else if (errorMessage.includes('WingetAccessDenied')) {
        setIsWingetMissing(false);
        addToast(t('wingetPermissionIssue'), 'error');
        setHasChecked(false);
      } else if (
        errorMessage.includes('WingetOutputUnparseable') ||
        errorMessage.includes('WingetOutputParseError')
      ) {
        setIsWingetMissing(false);
        addToast(t('wingetParseIssue'), 'error');
        setHasChecked(false);
      } else {
        setIsWingetMissing(false);
        addToast(t('checkFailedTryAgain'), 'error');
        setHasChecked(false);
      }
    } finally {
      setLoading(false);
    }
  };
  checkUpdatesRef.current = checkUpdates;

  const openSystemProtection = async () => {
    try {
      await window.ipcRenderer.invoke('system:open-system-restore');
    } catch (error) {
      console.error('[App] Failed to open System Protection:', error);
      addToast(t('preflightActionFailed'), 'warning');
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableUpdates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableUpdates.map(u => u.id)));
    }
  };

  return (
    <Layout
      darkMode={darkMode}
      toggleDarkMode={toggleTheme}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'dashboard' ? (
        <div className="mx-auto flex w-full max-w-7xl h-full flex-col gap-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight text-black dark:text-white transition-colors">{t('dashboard')}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-sky-100">{t('manageApps')}</p>
                {systemInfo && (
                  <span className="flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    {systemInfo.arch} • {systemInfo.locale}
                  </span>
                )}
                <span className={clsx(
                  "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                  isOnline
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
                )}>
                  {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  {isOnline ? t('networkOnline') : t('networkOffline')}
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              {!isInstalling && !isCreatingRestore && !hasAppUpdateBanner && (
                <button
                  onClick={() => checkAppUpdate(false)}
                  disabled={!isOnline || checkingAppVersion}
                  className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-slate-900 shadow-sm transition-all hover:bg-gray-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:border-white/10 dark:bg-white/5 dark:text-sky-200 dark:hover:bg-white/10 dark:hover:text-blue-400"
                  title={t('appUpdateCheck')}
                >
                  <RefreshCw className={clsx("h-5 w-5", checkingAppVersion && "animate-spin")} />
                  <span className="text-left leading-tight">
                    <span className="block text-[11px] font-bold">{t('appUpdateHeaderHint')}</span>
                    <span className="block text-[10px] font-medium text-slate-800 dark:text-sky-100">
                      {t('appUpdateCurrent')}: {appUpdateInfo?.currentVersion ? `v${appUpdateInfo.currentVersion}` : t('unknown')}
                    </span>
                  </span>
                </button>
              )}

              {!isInstalling && !isCreatingRestore && (
                <button
                  onClick={exportDiagnostics}
                  disabled={exportingDiagnostics}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-slate-900 shadow-sm transition-all hover:bg-gray-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:border-white/10 dark:bg-white/5 dark:text-sky-200 dark:hover:bg-white/10 dark:hover:text-blue-400"
                  title={t('exportDiagnostics')}
                >
                  <FileText className={clsx("h-5 w-5", exportingDiagnostics && "animate-pulse")} />
                  <span className="text-xs font-semibold">{t('exportDiagnosticsAction')}</span>
                </button>
              )}

              {!isInstalling && !isCreatingRestore && (
                <button
                  onClick={() => { void refreshWingetHealth(false); }}
                  disabled={checkingWingetHealth}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-slate-900 shadow-sm transition-all hover:bg-gray-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:border-white/10 dark:bg-white/5 dark:text-sky-200 dark:hover:bg-white/10 dark:hover:text-blue-400"
                  title={t('wingetHealthRefresh')}
                >
                  <RefreshCw className={clsx("h-5 w-5", checkingWingetHealth && "animate-spin")} />
                  <span className="text-xs font-semibold">{t('wingetHealthRefresh')}</span>
                </button>
              )}

              {updates.length > 0 && !loading && !isInstalling && (
                <button
                  onClick={checkUpdates}
                  className="flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white p-2.5 text-slate-900 shadow-sm transition-all hover:bg-gray-50 hover:text-blue-600 sm:w-auto dark:border-white/10 dark:bg-white/5 dark:text-sky-200 dark:hover:bg-white/10 dark:hover:text-blue-400"
                  title={t('refresh')}
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              )}

              {(isInstalling || isCreatingRestore) && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 dark:border-blue-900/30 dark:bg-blue-900/20">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent dark:border-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {isCreatingRestore ? t('creatingRestore') + '...' : `${t('updatingApp')} ${installProgress?.current || 0}/${installProgress?.total || 0}`}
                  </span>
                </div>
              )}

              {updates.length > 0 && !isInstalling && (
                <button
                  onClick={() => { void handleUpdateClick(); }}
                  disabled={selectedIds.size === 0 || runningPreflight}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-105 hover:from-blue-500 hover:to-indigo-500 disabled:scale-100 disabled:opacity-50 disabled:grayscale sm:w-auto"
                >
                  <ArrowDownToLine className={clsx("h-5 w-5", runningPreflight && "animate-pulse")} />
                  <span>{runningPreflight ? t('preflightRunning') : `${t('updateSelected')} (${selectedIds.size})`}</span>
                </button>
              )}
            </div>
          </div>

          {appUpdateInfo?.success && appUpdateInfo.hasUpdate && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-500/20 dark:bg-blue-900/10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-blue-900 dark:text-blue-300">{t('appUpdateAvailable')}</p>
                  <p className="text-xs font-medium text-slate-900 dark:text-sky-200">
                    {t('appUpdateCurrent')}: v{appUpdateInfo.currentVersion} • {t('appUpdateLatest')}: v{appUpdateInfo.latestVersion}
                  </p>
                  <p className="text-[11px] text-slate-800 dark:text-sky-100">
                    {t('appUpdatePrivacyNote')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={downloadAppUpdate}
                    disabled={downloadingAppUpdate || !appUpdateInfo.assetUrl || !appUpdateInfo.assetName}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {downloadingAppUpdate ? t('appUpdateDownloading') : t('appUpdateDownload')}
                  </button>
                  {appUpdateInfo.releaseUrl && (
                    <button
                      onClick={() => window.ipcRenderer.invoke('system:open-url', appUpdateInfo.releaseUrl!)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-sky-200 dark:hover:bg-white/10"
                    >
                      {t('appUpdateOpenRelease')}
                    </button>
                  )}
                  {lastDownloadedUpdatePath && (
                    <button
                      onClick={() => window.ipcRenderer.invoke('system:show-item-in-folder', lastDownloadedUpdatePath)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-sky-200 dark:hover:bg-white/10"
                    >
                      <span className="inline-flex items-center gap-1">
                        <FolderOpen className="h-3.5 w-3.5" />
                        {t('appUpdateOpenFolder')}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {downloadingAppUpdate && (
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300 dark:bg-blue-400"
                      style={{ width: `${appUpdateProgress ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-900 dark:text-sky-100">
                    {appUpdateProgress !== null
                      ? `${t('appUpdateDownloading')} ${appUpdateProgress}%`
                      : t('appUpdateDownloading')}
                  </p>
                </div>
              )}
            </div>
          )}

          {dataFolderStatus && !dataFolderStatus.writable && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
              <p className="text-sm font-bold text-red-900 dark:text-red-300">{t('dataFolderNotWritableTitle')}</p>
              <p className="mt-1 text-xs font-medium text-red-800 dark:text-red-200">{t('dataFolderNotWritableBody')}</p>
              <p className="mt-2 break-all rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-mono text-slate-900 dark:border-red-900/40 dark:bg-black/20 dark:text-sky-100">
                {dataFolderStatus.path}
              </p>
              <button
                onClick={() => window.ipcRenderer.invoke('system:open-path', dataFolderStatus.path)}
                className="mt-2 rounded border border-red-300 bg-white px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-white/5 dark:text-red-300 dark:hover:bg-red-900/20"
              >
                {t('openDataFolder')}
              </button>
            </div>
          )}

          {wingetHealth && (
            <div className="rounded-xl border border-slate-300 bg-white p-4 dark:border-white/10 dark:bg-black/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-sky-100">{t('wingetHealthTitle')}</p>
                <span className={clsx(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  wingetHealth.installed && wingetHealth.sourcesHealthy
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                )}>
                  {wingetHealth.installed && wingetHealth.sourcesHealthy ? t('wingetHealthOk') : t('wingetHealthNeedsAttention')}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border border-slate-200 bg-slate-100 px-2 py-1 dark:border-white/10 dark:bg-white/5">
                  <p className="font-bold text-slate-900 dark:text-sky-100">{t('wingetHealthInstalled')}</p>
                  <p className="text-slate-800 dark:text-sky-200">{wingetHealth.installed ? t('wingetHealthYes') : t('wingetHealthNo')}</p>
                </div>
                <div className="rounded border border-slate-200 bg-slate-100 px-2 py-1 dark:border-white/10 dark:bg-white/5">
                  <p className="font-bold text-slate-900 dark:text-sky-100">{t('wingetHealthVersion')}</p>
                  <p className="text-slate-800 dark:text-sky-200">{wingetHealth.version || t('unknown')}</p>
                </div>
                <div className="rounded border border-slate-200 bg-slate-100 px-2 py-1 dark:border-white/10 dark:bg-white/5">
                  <p className="font-bold text-slate-900 dark:text-sky-100">{t('wingetHealthSources')}</p>
                  <p className="text-slate-800 dark:text-sky-200">{wingetHealth.sourcesHealthy ? t('wingetHealthYes') : t('wingetHealthNo')}</p>
                </div>
                <div className="rounded border border-slate-200 bg-slate-100 px-2 py-1 dark:border-white/10 dark:bg-white/5">
                  <p className="font-bold text-slate-900 dark:text-sky-100">{t('wingetHealthNetwork')}</p>
                  <p className="text-slate-800 dark:text-sky-200">{isOnline ? t('networkOnline') : t('networkOffline')}</p>
                </div>
              </div>
              {wingetHealth.sourceSummary && (
                <p className="mt-2 text-[11px] font-medium text-slate-800 dark:text-sky-200 break-words">
                  {t('wingetHealthSourcesDetected').replace('{sources}', wingetHealth.sourceSummary)}
                </p>
              )}
              {wingetHealth.error && (
                <p className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-300 break-words">
                  {formatCompactText(wingetHealth.error)}
                </p>
              )}
            </div>
          )}

          {ignoredHiddenCount > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              <p>{t('ignoreHiddenCount').replace('{count}', String(ignoredHiddenCount))}</p>
              <p className="mt-1 text-xs">{t('ignoreActiveRules').replace('{count}', String(activeIgnoredRulesCount))}</p>
            </div>
          )}

          {isWingetMissing ? (
            <div className="flex flex-1 flex-col items-center justify-center space-y-6 py-20 text-center">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-red-500/20 blur-xl dark:bg-red-400/10" />
                <XCircle className="relative h-24 w-24 text-red-500" strokeWidth={1} />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-2xl font-bold text-black dark:text-white">{t('wingetMissing')}</h3>
                <p className="text-slate-900 dark:text-sky-100">
                  {t('wingetMissingDesc')}
                </p>
                <button
                  onClick={() => window.ipcRenderer.invoke('system:open-url', 'https://aka.ms/getwinget')}
                  className="mt-4 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {t('getWinget')}
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-1 flex-col items-center justify-center space-y-8 py-20 text-center animate-in fade-in zoom-in duration-500">
              <div className="relative">
                <div className="absolute -inset-8 rounded-full bg-blue-500/10 blur-2xl animate-pulse dark:bg-blue-400/5" />
                <div className="relative flex items-center justify-center">
                  <div className="h-24 w-24 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin dark:border-slate-800 dark:border-t-blue-500" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-16 w-16 rounded-full bg-slate-50 dark:bg-slate-900 shadow-inner" />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 dark:from-blue-400 dark:to-indigo-400 animate-pulse transition-all">
                  {t('checking')}...
                </h3>
                <p className="text-black dark:text-sky-200 font-bold max-w-xs mx-auto leading-relaxed text-lg">
                  {t('scanningBody')}
                </p>
              </div>
            </div>
          ) : !hasChecked ? (
            <div className="flex flex-1 flex-col items-center justify-center space-y-6 py-20 text-center">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-blue-500/20 blur-xl dark:bg-blue-400/10" />
                <Coffee className="relative h-24 w-24 text-slate-900/40 dark:text-slate-600" strokeWidth={1} />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-2xl font-bold text-black dark:text-white">{t('readyTitle')}</h3>
              <p className="font-medium text-slate-900 dark:text-sky-100">{t('readyDesc')}</p>
              </div>
              <button
                onClick={checkUpdates}
                className="group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-slate-900 px-8 py-4 text-lg font-bold text-white shadow-xl transition-all hover:scale-105 hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-gray-100"
              >
                <RefreshCw className="h-6 w-6 transition-transform group-hover:rotate-180" />
                {t('checkUpdates')}
              </button>
              <p className="text-xl sm:text-2xl mt-8 font-bold text-slate-900 dark:text-sky-100 animate-in fade-in slide-in-from-top-2 duration-700 delay-300 max-w-2xl px-4 leading-relaxed">
                {t('footerLove')} <span className="text-blue-600 dark:text-blue-400">Samuel</span>.
                <br />
                {t('footerAI')}
                <span className="inline-block align-middle ml-2 animate-pulse">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-red-500" style={{ shapeRendering: 'crispEdges' }}>
                    <path d="M4 4h4v4H4zM16 4h4v4h-4zM2 8h4v4H2zM8 8h8v4H8zM18 8h4v4h-4zM2 12h4v4H2zM6 16h4v4H6zM10 20h4v4h-4zM14 16h4v4h-4zM18 12h4v4h-4z" fill="currentColor" />
                  </svg>
                </span>
              </p>
            </div>
          ) : updates.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center space-y-6 py-20 text-center">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-emerald-500/20 blur-xl dark:bg-emerald-400/10" />
                <CheckCircle className="relative h-24 w-24 text-emerald-600 dark:text-emerald-500" strokeWidth={1} />
              </div>
              <h3 className="text-2xl font-bold text-black dark:text-white">{t('allClean')}</h3>
              <p className="font-medium text-slate-900 dark:text-sky-100 text-lg">{t('allCleanDesc')}</p>
              <button
                onClick={checkUpdates}
                className="mt-4 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {t('checkAgain')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-black/20">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-3 text-sm font-medium text-slate-900 hover:text-blue-600 dark:text-sky-200 dark:hover:text-blue-400"
                >
                  {allSelectableSelected ? (
                    <CheckSquare className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Square className="h-5 w-5 text-slate-400" />
                  )}
                  <span>{t('selectAll')}</span>
                </button>
                <span className="text-sm font-medium text-slate-900 dark:text-sky-100">
                  {updates.length} {t('updatesAvailable')}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {updates.map(update => (
                  <UpdateCard
                    key={update.id}
                    update={update}
                    isSelected={selectedIds.has(update.id)}
                    onToggle={() => toggleSelect(update.id)}
                    releaseNotesUrl={releaseNotesUrlById[update.id]}
                    onOpenReleaseNotes={typeof releaseNotesUrlById[update.id] === 'string'
                      ? () => { void openReleaseNotesForUpdate(update); }
                      : undefined}
                    onIgnoreFor7Days={() => { void ignoreUpdateForSevenDays(update); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <HistoryView
          onResetApp={() => {
            setShowOnboarding(true);
            setActiveTab('dashboard');
            setHasChecked(false);
            setUpdates([]);
            setSelectedIds(new Set());
            setIsWingetMissing(false);
            setIgnoredUntilById({});
            setIgnoredHiddenCount(0);
            clearFlowState();
          }}
        />
      )}

      <SummaryModal
        isOpen={showSummary}
        batchResults={batchResults}
        summaryStats={summaryStats}
        restoreVerificationSummary={restoreVerificationSummary}
        exportingDiagnostics={exportingDiagnostics}
        onRetryFailed={() => { void retryFailedFromSummary(); }}
        onExportDiagnostics={() => { void exportDiagnostics(); }}
        onOpenSystemProtection={() => { void openSystemProtection(); }}
        onClose={hideSummary}
      />

      {/* Conflict Modal */}
      {conflictState && (
        <ConflictModal
          appName={conflictState.appName}
          onRetry={conflictState.onRetry}
          onSkip={conflictState.onSkip}
        />
      )}

      {restoreDecisionState && (
        <RestoreFailureModal
          isOpen={Boolean(restoreDecisionState)}
          message={restoreDecisionState.message}
          details={restoreDecisionState.details}
          onContinue={handleRestoreDecisionContinue}
          onCancel={handleRestoreDecisionCancel}
        />
      )}

      {restoreVerificationAlert && (
        <RestoreVerificationAlertModal
          isOpen={Boolean(restoreVerificationAlert)}
          message={restoreVerificationAlert.message}
          details={restoreVerificationAlert.details}
          onClose={closeRestoreVerificationAlert}
        />
      )}

      {preflightResult && (
        <PreflightModal
          isOpen={Boolean(preflightResult)}
          result={preflightResult}
          onContinue={handlePreflightContinue}
          onCancel={handlePreflightCancel}
        />
      )}

      {/* Onboarding Modal */}
      {showOnboarding && <OnboardingModal onClose={handleOnboardingClose} />}

      <RestoreModal
        isOpen={showRestoreModal}
        onClose={closeRestoreModal}
        onConfirm={() => processUpdates(true)}
        onSkip={() => processUpdates(false)}
      />

      <InstallStateOverlay
        isCreatingRestore={isCreatingRestore}
        isInstalling={isInstalling}
        currentInstallingApp={currentInstallingApp}
        currentLogLine={currentLogLine}
        logEntries={logEntries}
        showDetailedLog={showDetailedLog}
        isOnline={isOnline}
        currentAppProgress={currentAppProgress}
        currentAppProgressMode={currentAppProgressMode}
        installProgress={installProgress}
        estimatedRemainingSeconds={estimatedRemainingSeconds}
        cancelBatchRequested={cancelBatchRequested}
        onCancelBatch={requestBatchCancel}
        onToggleDetailedLog={toggleDetailedLog}
      />

      <DownloadGuideModal
        guide={downloadGuideState}
        onClose={closeDownloadGuide}
      />

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </Layout>
  );
}
