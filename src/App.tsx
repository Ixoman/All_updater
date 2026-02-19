import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from './components/Layout';
import { UpdateCard } from './components/UpdateCard';
import { RestoreModal } from './components/RestoreModal';
import { RestoreFailureModal } from './components/RestoreFailureModal';
import { RestoreVerificationAlertModal } from './components/RestoreVerificationAlertModal';
import { PreflightModal } from './components/PreflightModal';
import { OnboardingModal } from './components/OnboardingModal';
import { ConflictModal } from './components/ConflictModal';
import { HistoryView } from './components/HistoryView.tsx';
import type {
  AppUpdate,
  AppVersionCheckResult,
  DataFolderStatus,
  HistoryItem,
  IgnoreRule,
  PreflightResult,
  RestoreFailureReason,
  RestorePointResult,
  RestorePointVerificationResult,
  WingetHealthStatus
} from './shared/types';
import { RefreshCw, CheckCircle, Coffee, ArrowDownToLine, CheckSquare, Square, AlertCircle, XCircle, AlertTriangle, FileText, FolderOpen, Wifi, WifiOff } from 'lucide-react';
import { ToastContainer, type ToastType } from './components/Toast';
import { useLanguage } from './context/LanguageContext';
import { clsx } from 'clsx';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface RestoreVerificationSummaryState {
  status: 'confirmed' | 'missing' | 'unverified';
  message: string;
  details?: string;
}

type ThemeMode = 'dark' | 'light' | 'system';
type AppProgressMode = 'real' | 'estimated';
let hasRunInitialAppVersionCheck = false;

const parsePercentFromWingetLog = (logLine: string): number | null => {
  const matches = Array.from(logLine.matchAll(/(^|[^0-9])([0-9]{1,3})%(?![0-9])/g));
  if (matches.length === 0) return null;
  const raw = Number(matches[matches.length - 1][2]);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, raw));
};

const normalizeWingetLog = (value: string): string => (
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
);

const parseEstimatedPercentFromWingetLog = (logLine: string): number | null => {
  const normalized = normalizeWingetLog(logLine);
  const phaseRules: Array<{ percent: number, regex: RegExp }> = [
    { percent: 12, regex: /\bstarting|iniciando|initializing|inicializando\b/ },
    { percent: 28, regex: /\bdownloading|download|descargando|descarga|transferring|transfer\b/ },
    { percent: 45, regex: /\bextract|unpack|decompress|descomprim|expandiendo\b/ },
    { percent: 70, regex: /\binstalling|install|instaland|aplicando|applying|executing|ejecutando\b/ },
    { percent: 84, regex: /\bverifying|verify|verificando|verificar|hash|checksum\b/ },
    { percent: 95, regex: /\bfinalizing|finalizando|completing|completion|completado|completed|done|hecho|terminado|installed successfully|instalado correctamente\b/ }
  ];

  for (const rule of phaseRules) {
    if (rule.regex.test(normalized)) {
      return rule.percent;
    }
  }

  return null;
};

const normalizeIgnoreVersion = (value?: string): string => (value || '').trim();

const buildIgnoreRuleKey = (id: string, availableVersion?: string): string => {
  const normalizedVersion = normalizeIgnoreVersion(availableVersion);
  return normalizedVersion ? `${id}@@${normalizedVersion}` : `${id}@@*`;
};

const isUpdateIgnoredByRule = (update: AppUpdate, rule: IgnoreRule): boolean => {
  if (rule.id !== update.id) return false;
  const normalizedRuleVersion = normalizeIgnoreVersion(rule.availableVersion);
  if (!normalizedRuleVersion) return true;
  return normalizedRuleVersion === normalizeIgnoreVersion(update.available);
};

export default function App() {
  const { t, language } = useLanguage();
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isCreatingRestore, setIsCreatingRestore] = useState(false);
  const [conflictState, setConflictState] = useState<{ appName: string, onRetry: () => void, onSkip: () => void } | null>(null);
  const [restoreDecisionState, setRestoreDecisionState] = useState<{ message: string, details?: string, onContinue: () => void, onCancel: () => void } | null>(null);
  const [restoreVerificationAlert, setRestoreVerificationAlert] = useState<{ message: string, details?: string } | null>(null);
  const [currentInstallingApp, setCurrentInstallingApp] = useState<string | null>(null);
  const [currentLogLine, setCurrentLogLine] = useState<string | null>(null);
  const [currentAppProgress, setCurrentAppProgress] = useState<number | null>(null);
  const [currentAppProgressMode, setCurrentAppProgressMode] = useState<AppProgressMode | null>(null);
  const [installProgress, setInstallProgress] = useState<{ current: number, total: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [showSummary, setShowSummary] = useState(false);
  const [batchResults, setBatchResults] = useState<HistoryItem[]>([]);
  const [systemInfo, setSystemInfo] = useState<{ arch: string, locale: string } | null>(null);
  const [isWingetMissing, setIsWingetMissing] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [darkMode, setDarkMode] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppVersionCheckResult | null>(null);
  const [checkingAppVersion, setCheckingAppVersion] = useState(false);
  const [downloadingAppUpdate, setDownloadingAppUpdate] = useState(false);
  const [appUpdateProgress, setAppUpdateProgress] = useState<number | null>(null);
  const [lastDownloadedUpdatePath, setLastDownloadedUpdatePath] = useState<string | null>(null);
  const [downloadGuideState, setDownloadGuideState] = useState<{ filePath: string, isZip: boolean } | null>(null);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [runningPreflight, setRunningPreflight] = useState(false);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [restoreVerificationSummary, setRestoreVerificationSummary] = useState<RestoreVerificationSummaryState | null>(null);
  const [releaseNotesUrlById, setReleaseNotesUrlById] = useState<Partial<Record<string, string | null>>>({});
  const [releaseNotesLoadingById, setReleaseNotesLoadingById] = useState<Partial<Record<string, boolean>>>({});
  const [ignoredUntilById, setIgnoredUntilById] = useState<Partial<Record<string, string>>>({});
  const [ignoredHiddenCount, setIgnoredHiddenCount] = useState(0);
  const [wingetHealth, setWingetHealth] = useState<WingetHealthStatus | null>(null);
  const [checkingWingetHealth, setCheckingWingetHealth] = useState(false);
  const [dataFolderStatus, setDataFolderStatus] = useState<DataFolderStatus | null>(null);
  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState<number | null>(null);
  const initializedRef = useRef(false);
  const themeSaveAttemptRef = useRef(0);
  const historyWriteWarningShownRef = useRef(false);
  const pendingSelectedIdsRef = useRef<Set<string> | null>(null);
  const estimatedProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchTimingRef = useRef<{ startedAt: number, total: number, completed: number } | null>(null);
  const lastDataFolderWritableRef = useRef<boolean | null>(null);
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

  const getRestoreFailureMessage = (reason?: RestoreFailureReason): string => {
    if (reason === 'system-protection-disabled') return t('restoreFailDisabled');
    if (reason === 'frequency-limit') return t('restoreFailFrequency');
    if (reason === 'access-denied') return t('restoreFailAccess');
    if (reason === 'service-unavailable') return t('restoreFailService');
    if (reason === 'verification-failed') return t('restoreFailVerification');
    if (reason === 'command-failed') return t('restoreFailCommand');
    return t('restoreFailUnknown');
  };

  const resolveDarkMode = (mode: ThemeMode): boolean => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  };

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
    const handleLog = (_event: unknown, log: string) => {
      const cleanLog = log.replace(/\[#+ -+\]/g, '').trim();
      if (!cleanLog) return;
      setCurrentLogLine(cleanLog);
      const realPercent = parsePercentFromWingetLog(cleanLog);
      if (realPercent !== null) {
        stopEstimatedAppProgress();
        setCurrentAppProgressMode('real');
        setCurrentAppProgress((prev) => Math.max(prev ?? 0, realPercent));
        return;
      }

      const estimatedPercent = parseEstimatedPercentFromWingetLog(cleanLog);
      if (estimatedPercent !== null) {
        setCurrentAppProgressMode((prev) => prev === 'real' ? prev : 'estimated');
        setCurrentAppProgress((prev) => Math.max(prev ?? 0, estimatedPercent));
      }
    };

    window.ipcRenderer.on('winget:log', handleLog);
    return () => {
      window.ipcRenderer.off('winget:log', handleLog);
      stopEstimatedAppProgress();
    };
  }, [stopEstimatedAppProgress]);

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

      if (!hasRunInitialAppVersionCheck) {
        hasRunInitialAppVersionCheck = true;
        void window.ipcRenderer
          .invoke('system:check-app-update')
          .then((result) => setAppUpdateInfo(result))
          .catch((error) => console.error('[App] Silent app-update check failed:', error));
      }

      void refreshWingetHealth(true);
    };

    void initializeApp();
  }, [refreshDataFolderStatus, refreshWingetHealth]);

  useEffect(() => {
    const handleAppUpdateProgress = (_event: unknown, progress: { percent: number | null }) => {
      setAppUpdateProgress(progress.percent);
    };

    window.ipcRenderer.on('app-update:download-progress', handleAppUpdateProgress);
    return () => window.ipcRenderer.off('app-update:download-progress', handleAppUpdateProgress);
  }, []);

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

  useEffect(() => {
    if (!isInstalling || !batchTimingRef.current || !installProgress) {
      setEstimatedRemainingSeconds(null);
      return;
    }

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
      const averagePerCompletedMs = elapsedMs / completed;
      const remainingItems = Math.max(0, total - completed);
      const estimateSeconds = Math.round((averagePerCompletedMs * remainingItems) / 1000);
      setEstimatedRemainingSeconds(Math.max(0, estimateSeconds));
    };

    updateEstimate();
    const intervalId = setInterval(updateEstimate, 1000);
    return () => clearInterval(intervalId);
  }, [installProgress, isInstalling]);

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

  const checkAppUpdate = async (silent = false) => {
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
      console.error('[App] Failed to check app version:', error);
      if (!silent) {
        addToast(t('appUpdateCheckFailed'), 'warning');
      }
    } finally {
      setCheckingAppVersion(false);
    }
  };

  const downloadAppUpdate = async () => {
    if (!appUpdateInfo?.assetUrl || !appUpdateInfo.assetName) {
      addToast(t('appUpdateMissingAsset'), 'warning');
      return;
    }

    setDownloadingAppUpdate(true);
    setAppUpdateProgress(0);
    setLastDownloadedUpdatePath(null);
    setDownloadGuideState(null);
    try {
      const result = await window.ipcRenderer.invoke(
        'system:download-app-update',
        appUpdateInfo.assetUrl,
        appUpdateInfo.assetName,
        appUpdateInfo.assetSha256
      );

      if (result.canceled) {
        addToast(t('appUpdateDownloadCanceled'), 'info');
        return;
      }

      if (result.success) {
        addToast(t('appUpdateDownloadSuccess'), 'success');
        const isZip = !!appUpdateInfo?.assetName && /\.zip$/i.test(appUpdateInfo.assetName);
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
        addToast(isZip ? t('appUpdateAfterDownloadZip') : t('appUpdateAfterDownloadExe'), 'warning');
        return;
      }

      console.error('[App] App update download failed:', result.error);
      if ((result.error || '').includes('HashMismatch')) {
        addToast(t('appUpdateHashMismatch'), 'error');
        return;
      }
      addToast(t('appUpdateDownloadFailed'), 'error');
    } catch (error) {
      console.error('[App] App update download threw error:', error);
      addToast(t('appUpdateDownloadFailed'), 'error');
    } finally {
      setDownloadingAppUpdate(false);
      setTimeout(() => setAppUpdateProgress(null), 500);
    }
  };

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

  const openReleaseNotesForUpdate = async (update: AppUpdate) => {
    const { id } = update;
    const cachedUrl = releaseNotesUrlById[id];
    if (typeof cachedUrl === 'string' && cachedUrl.length > 0) {
      try {
        await window.ipcRenderer.invoke('system:open-url', cachedUrl);
      } catch (error) {
        console.error(`[App] Failed to open cached release notes URL for ${id}:`, error);
        addToast(t('releaseNotesUnavailable'), 'warning');
      }
      return;
    }

    if (cachedUrl === null) {
      addToast(t('releaseNotesUnavailable'), 'info');
      return;
    }

    if (releaseNotesLoadingById[id]) return;
    setReleaseNotesLoadingById((prev) => ({ ...prev, [id]: true }));

    try {
      const fetchedUrl = await window.ipcRenderer.invoke('winget:get-release-notes-url', id);
      const normalizedUrl = fetchedUrl && fetchedUrl.trim().length > 0 ? fetchedUrl : null;
      setReleaseNotesUrlById((prev) => ({ ...prev, [id]: normalizedUrl }));

      if (normalizedUrl) {
        await window.ipcRenderer.invoke('system:open-url', normalizedUrl);
      } else {
        addToast(t('releaseNotesUnavailable'), 'info');
      }
    } catch (error) {
      console.error(`[App] Failed to fetch release notes for ${id}:`, error);
      setReleaseNotesUrlById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      addToast(t('releaseNotesCheckFailed'), 'warning');
    } finally {
      setReleaseNotesLoadingById((prev) => ({ ...prev, [id]: false }));
    }
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
    setReleaseNotesUrlById({});
    setReleaseNotesLoadingById({});
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

  const handleUpdateClick = async (selectedOverride?: Set<string>) => {
    const effectiveSelected = selectedOverride ?? selectedIds;
    if (effectiveSelected.size === 0) return;
    pendingSelectedIdsRef.current = new Set(effectiveSelected);
    setRunningPreflight(true);
    try {
      const result = await window.ipcRenderer.invoke('system:run-preflight');
      if (!result.success || result.overall !== 'ok') {
        setPreflightResult(result);
        return;
      }
      setShowRestoreModal(true);
    } catch (error) {
      console.error('[App] Preflight failed unexpectedly:', error);
      addToast(t('preflightUnexpectedFailure'), 'warning');
      setShowRestoreModal(true);
    } finally {
      setRunningPreflight(false);
    }
  };

  const askContinueWithoutRestore = (message: string, details?: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setRestoreDecisionState({
        message,
        details,
        onContinue: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  };

  const processUpdates = async (createRestore: boolean) => {
    setShowRestoreModal(false);
    setIsInstalling(true);
    setBatchResults([]);
    setRestoreVerificationSummary(null);
    historyWriteWarningShownRef.current = false;
    let operationMarked = false;
    let createdRestoreMeta: { sequenceNumber: number; description: string } | null = null;
    const selectedSnapshot = pendingSelectedIdsRef.current
      ? new Set(pendingSelectedIdsRef.current)
      : new Set(selectedIds);
    pendingSelectedIdsRef.current = null;
    if (selectedSnapshot.size === 0) {
      setIsInstalling(false);
      addToast(t('summaryRetryNothing'), 'info');
      return;
    }
    try {
      await window.ipcRenderer.invoke('system:set-operation-active', true);
      operationMarked = true;

      if (createRestore) {
        setIsCreatingRestore(true);
        setCurrentLogLine(t('creatingRestore'));
        try {
          const result = await window.ipcRenderer.invoke('system:create-restore-point', "All Updater Auto-Restore") as RestorePointResult;
          if (!result.success) {
            const specificMessage = getRestoreFailureMessage(result.reason);
            console.error('[App] Restore point failed:', result);
            addToast(specificMessage, "error");
            setCurrentLogLine(specificMessage);
            const continueWithoutRestore = await askContinueWithoutRestore(specificMessage, result.details);
            setRestoreDecisionState(null);
            if (!continueWithoutRestore) {
              addToast(t('restoreFailedAbort'), "warning");
              return;
            }
            addToast(t('restoreContinueWithoutPoint'), "warning");
          } else if (typeof result.sequenceNumber === 'number' && typeof result.description === 'string') {
            createdRestoreMeta = {
              sequenceNumber: result.sequenceNumber,
              description: result.description
            };
          }
        } catch (e) {
          console.error("Failed to create restore point", e);
          const details = getErrorMessage(e);
          const unknownMessage = t('restoreFailUnknown');
          addToast(`${t('restoreFailedAbort')} ${unknownMessage}`, "error");
          setCurrentLogLine(unknownMessage);
          const continueWithoutRestore = await askContinueWithoutRestore(unknownMessage, details);
          setRestoreDecisionState(null);
          if (!continueWithoutRestore) {
            setCurrentLogLine(null);
            return;
          }
          addToast(t('restoreContinueWithoutPoint'), "warning");
        } finally {
          setIsCreatingRestore(false);
        }
      }

      const total = selectedSnapshot.size;
      let current = 0;
      const currentResults: HistoryItem[] = [];
      setInstallProgress({ current, total });
      batchTimingRef.current = { startedAt: Date.now(), total, completed: 0 };
      setEstimatedRemainingSeconds(null);

      const queue = Array.from(selectedSnapshot);

      // Iteration using while to allow "retry" without complex index math
      let i = 0;
      while (i < queue.length) {
        const id = queue[i];
        const update = updates.find(u => u.id === id);
        const appName = update?.name || id;
        const appVersion = update?.available || 'unknown';

        try {
          setCurrentInstallingApp(appName);
          setCurrentLogLine(null);
          setCurrentAppProgress(3);
          setCurrentAppProgressMode('estimated');
          startEstimatedAppProgress();

          // Wait for conflict resolution if needed
          let retry = true;
          while (retry) {
            try {
              retry = false;
              await window.ipcRenderer.invoke('winget:install-update', id);
            } catch (e: unknown) {
              const errorMessage = getErrorMessage(e);
              // Check specifically for AppInUse
              if (errorMessage.includes('AppInUse')) {
                // Show Conflict Modal and wait for user decision
                const userDecision = await new Promise<'retry' | 'skip'>((resolve) => {
                  setConflictState({
                    appName,
                    onRetry: () => resolve('retry'),
                    onSkip: () => resolve('skip')
                  });
                });

                setConflictState(null); // Close modal

                if (userDecision === 'retry') {
                  retry = true;
                  continue; // Loop internal while
                } else {
                  // Skip
                  throw e; // Re-throw to hit catch block as failed/skipped
                }
              }
              throw e; // Throw other errors
            }
          }

          const historyEntry: Omit<HistoryItem, 'date'> = {
            id,
            appName,
            version: appVersion, // This is the new version
            previousVersion: update?.version, // This is the old version
            status: 'success'
          };
          await addHistoryEntrySafely(historyEntry);
          currentResults.push({ ...historyEntry, date: new Date().toISOString() });

          addToast(`${t('updateSuccess')} ${appName}`, 'success');
          stopEstimatedAppProgress();
          setCurrentAppProgressMode('real');
          setCurrentAppProgress(100);

          setUpdates(prev => prev.filter(u => u.id !== id));
          setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } catch (e: unknown) {
          const errorMessage = getErrorMessage(e);
          console.error(`Failed to update ${id}`, e);
          const isInapplicable = errorMessage.includes('Inapplicable');
          const isReboot = errorMessage.includes('RebootRequired');
          const isInUse = errorMessage.includes('AppInUse');
          const isSecurity = errorMessage.includes('HashMismatch');
          const isFileLockDetected = errorMessage.includes('FileLockDetected');

          let status: 'failed' | 'inapplicable' | 'reboot' | 'in-use' | 'security-error' = 'failed';
          if (isInapplicable) status = 'inapplicable';
          if (isReboot) status = 'reboot';
          if (isInUse) status = 'in-use'; // Only if skipped
          if (isSecurity) status = 'security-error';

          const historyEntry: Omit<HistoryItem, 'date'> = {
            id,
            appName,
            version: appVersion,
            previousVersion: update?.version,
            status,
            details: errorMessage
          };
          await addHistoryEntrySafely(historyEntry);
          currentResults.push({ ...historyEntry, date: new Date().toISOString() });

          if (isInapplicable) {
            addToast(`${appName}: ${t('updateSkipped')}`, 'warning');
          } else if (isSecurity) {
            addToast(`${appName}: ${t('updateSecuritySkipped')}`, 'error');
          } else if (isReboot) {
            addToast(`${appName}: ${t('updateRebootPending')}`, 'warning');
            setUpdates(prev => prev.filter(u => u.id !== id));
            setSelectedIds(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          } else if (isInUse) {
            addToast(`${appName}: ${t('updateInUseSkipped')}`, 'warning');
          } else if (isFileLockDetected) {
            addToast(`${appName}: ${t('updateFileLockDetected')}`, 'warning');
          } else {
            addToast(`${t('updateFailed')} ${appName}`, 'error');
          }
        }
        current++;
        setInstallProgress({ current, total });
        if (batchTimingRef.current) {
          batchTimingRef.current.completed = current;
        }
        stopEstimatedAppProgress();
        setCurrentAppProgress(null);
        setCurrentAppProgressMode(null);
        i++;
      }

      if (createdRestoreMeta) {
        try {
          const verification = await window.ipcRenderer.invoke(
            'system:verify-restore-point',
            createdRestoreMeta.sequenceNumber,
            createdRestoreMeta.description
          ) as RestorePointVerificationResult;

          if (!verification.confirmed) {
            const message = t('restorePostBatchMissing');
            const detailLines = [
              `${t('restoreSequenceLabel')}: ${verification.sequenceNumber}`,
              `${t('restoreExpectedDescriptionLabel')}: ${verification.expectedDescription}`
            ];

            if (verification.actualDescription) {
              detailLines.push(`${t('restoreActualDescriptionLabel')}: ${verification.actualDescription}`);
            }
            if (verification.details) {
              detailLines.push(verification.details);
            }

            setRestoreVerificationAlert({
              message,
              details: detailLines.join('\n')
            });
            setRestoreVerificationSummary({
              status: 'missing',
              message,
              details: detailLines.join('\n')
            });
            addToast(message, 'error');
          } else {
            const detailLines = [
              `${t('restoreSequenceLabel')}: ${verification.sequenceNumber}`,
              `${t('restoreExpectedDescriptionLabel')}: ${verification.expectedDescription}`
            ];
            if (verification.actualDescription) {
              detailLines.push(`${t('restoreActualDescriptionLabel')}: ${verification.actualDescription}`);
            }
            setRestoreVerificationSummary({
              status: 'confirmed',
              message: t('restorePostBatchConfirmed'),
              details: detailLines.join('\n')
            });
          }
        } catch (verificationError) {
          const message = t('restorePostBatchUnverified');
          const details = getErrorMessage(verificationError);
          setRestoreVerificationAlert({ message, details });
          setRestoreVerificationSummary({
            status: 'unverified',
            message,
            details
          });
          addToast(message, 'warning');
        }
      }

      setBatchResults(currentResults);
      if (currentResults.length > 0) {
        setShowSummary(true);
      }
    } finally {
      stopEstimatedAppProgress();
      setIsInstalling(false);
      setIsCreatingRestore(false);
      setInstallProgress(null);
      setCurrentInstallingApp(null);
      setCurrentLogLine(null);
      setCurrentAppProgress(null);
      setCurrentAppProgressMode(null);
      setEstimatedRemainingSeconds(null);
      batchTimingRef.current = null;
      setConflictState(null);
      setRestoreDecisionState(null);
      setPreflightResult(null);
      if (operationMarked) {
        try {
          await window.ipcRenderer.invoke('system:set-operation-active', false);
        } catch (cleanupError) {
          console.error('Failed to reset operation state', cleanupError);
        }
      }
    }
  };

  const retryFailedFromSummary = async () => {
    const retryableStatuses = new Set(['failed', 'in-use', 'security-error']);
    const availableIds = new Set(updates.map((u) => u.id));
    const retryIds = batchResults
      .filter((item) => retryableStatuses.has(item.status))
      .map((item) => item.id)
      .filter((id) => availableIds.has(id));

    if (retryIds.length === 0) {
      addToast(t('summaryRetryNothing'), 'info');
      return;
    }

    setSelectedIds(new Set(retryIds));
    setShowSummary(false);
    await handleUpdateClick(new Set(retryIds));
  };

  const summaryTotal = batchResults.length;
  const summaryFailedCount = batchResults.filter(
    r => r.status === 'failed' || r.status === 'inapplicable' || r.status === 'in-use' || r.status === 'security-error'
  ).length;
  const summaryUpdatedCount = batchResults.filter((r) => r.status === 'success').length;
  const summaryRebootCount = batchResults.filter((r) => r.status === 'reboot').length;
  const summaryNoChangeCount = batchResults.filter((r) => r.status === 'inapplicable' || r.status === 'skipped').length;
  const summaryActionNeededCount = batchResults.filter((r) => r.status === 'failed' || r.status === 'in-use' || r.status === 'security-error').length;
  const retryableStatuses = new Set(['failed', 'in-use', 'security-error']);
  const availableUpdateIds = new Set(updates.map((u) => u.id));
  const retryableSummaryIds = batchResults
    .filter((r) => retryableStatuses.has(r.status))
    .map((r) => r.id)
    .filter((id) => availableUpdateIds.has(id));
  const hasRetryableSummaryItems = retryableSummaryIds.length > 0;
  const hasAppUpdateBanner = Boolean(appUpdateInfo?.success && appUpdateInfo.hasUpdate);

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
                    isLoadingReleaseNotes={Boolean(releaseNotesLoadingById[update.id])}
                    onOpenReleaseNotes={() => { void openReleaseNotesForUpdate(update); }}
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
            setShowSummary(false);
            setIsWingetMissing(false);
            setIgnoredUntilById({});
            setIgnoredHiddenCount(0);
          }}
        />
      )}

      {/* Summary Report Modal */}
      {showSummary && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-md transition-all p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-800 border border-black/10 dark:border-white/10 max-h-[80vh] flex flex-col">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{t('summaryTitle')}</h3>
                <p className="text-slate-900 dark:text-sky-100">{t('summaryDesc')}</p>
              </div>
              <button
                onClick={() => {
                  setShowSummary(false);
                  checkUpdates();
                }}
                className="rounded-full p-2 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              >
                <XCircle className="h-6 w-6 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {/* Logic for summary message */}
              {(() => {
                let message = t('summarySuccess');

                if (summaryFailedCount === summaryTotal) {
                  message = t('summaryFailed'); // Or use specific "inapplicable" one if needed
                } else if (summaryFailedCount > 0) {
                  message = t('summaryPartial');
                }

                return (
                  <div className="mb-4 rounded-2xl border border-slate-300 bg-slate-100 p-6 dark:border-white/10 dark:bg-white/5">
                    <p className="text-xl text-slate-900 dark:text-sky-100 italic text-center font-medium leading-relaxed">
                      {message}
                    </p>
                  </div>
                );
              })()}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{t('summaryCountUpdated')}</p>
                  <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{summaryUpdatedCount}</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">{t('summaryCountReboot')}</p>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-200">{summaryRebootCount}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">{t('summaryCountNoChange')}</p>
                  <p className="text-xl font-bold text-amber-800 dark:text-amber-200">{summaryNoChangeCount}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/40 dark:bg-rose-900/20">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">{t('summaryCountActionNeeded')}</p>
                  <p className="text-xl font-bold text-rose-800 dark:text-rose-200">{summaryActionNeededCount}</p>
                </div>
              </div>

              {restoreVerificationSummary && (
                <div className={clsx(
                  "rounded-2xl border p-4",
                  restoreVerificationSummary.status === 'confirmed'
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20"
                    : restoreVerificationSummary.status === 'missing'
                      ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
                      : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"
                )}>
                  <p className={clsx(
                    "text-sm font-bold",
                    restoreVerificationSummary.status === 'confirmed'
                      ? "text-emerald-800 dark:text-emerald-300"
                      : restoreVerificationSummary.status === 'missing'
                        ? "text-red-800 dark:text-red-300"
                        : "text-amber-800 dark:text-amber-300"
                  )}>
                    {restoreVerificationSummary.message}
                  </p>
                  {restoreVerificationSummary.details && (
                    <p className="mt-2 whitespace-pre-wrap text-xs font-mono text-slate-900 dark:text-sky-100">
                      {restoreVerificationSummary.details}
                    </p>
                  )}
                </div>
              )}

              {batchResults.map((res, i) => (
                <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-300 bg-slate-100 p-4 dark:border-white/5 dark:bg-white/5">
                  <div className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm",
                    res.status === 'success' ? "bg-green-500 text-white" :
                      res.status === 'reboot' ? "bg-blue-600 text-white" :
                        res.status === 'in-use' ? "bg-amber-500 text-white" :
                          res.status === 'inapplicable' ? "bg-amber-500 text-white" :
                        res.status === 'security-error' ? "bg-orange-600 text-white" :
                          "bg-red-500 text-white"
                  )}>
                    {res.status === 'success' && <CheckCircle className="h-5 w-5" />}
                    {res.status === 'reboot' && <RefreshCw className="h-5 w-5" />}
                    {res.status === 'in-use' && <AlertTriangle className="h-5 w-5" />}
                    {res.status === 'inapplicable' && <AlertCircle className="h-5 w-5" />}
                    {res.status === 'security-error' && <AlertTriangle className="h-5 w-5" />}
                    {res.status === 'failed' && <XCircle className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 dark:text-white truncate">{res.appName}</h4>
                    <p className="text-[10px] text-slate-900 dark:text-sky-100 font-bold uppercase tracking-wider mb-1">
                      {t('versionLabel')} {res.version}
                    </p>
                    <p className="text-xs text-slate-900 dark:text-sky-100 italic font-medium">
                      {res.status === 'success' ? t('statusSuccess') :
                        res.status === 'reboot' ? t('statusReboot') :
                          res.status === 'in-use' ? t('statusInUse') :
                            res.status === 'inapplicable' ? t('statusInapplicable') :
                              res.status === 'security-error' ? t('statusSecurity') :
                                t('statusFailed')}
                    </p>
                  </div>
                </div>
              ))}

              {batchResults.some(r => r.status === 'success' || r.status === 'reboot') && (
                <div className="rounded-2xl bg-blue-500/10 p-4 border border-blue-500/20">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {t('restartRecommendation')}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {hasRetryableSummaryItems && (
                <button
                  onClick={() => { void retryFailedFromSummary(); }}
                  className="rounded-2xl border border-amber-300 bg-amber-50 py-3 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  {t('summaryRetryFailed')}
                </button>
              )}
              <button
                onClick={exportDiagnostics}
                disabled={exportingDiagnostics}
                className={clsx(
                  "rounded-2xl border py-3 text-sm font-bold transition-colors",
                  exportingDiagnostics
                    ? "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-500"
                    : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
                )}
              >
                {exportingDiagnostics ? `${t('exportDiagnostics')}...` : t('summaryExportDiagnostics')}
              </button>
            </div>

            <button
              onClick={() => {
                setShowSummary(false);
                checkUpdates();
              }}
              className="mt-3 w-full rounded-2xl bg-blue-600 py-4 font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 dark:hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98]"
            >
              {summaryFailedCount === summaryTotal ? t('thanksNothing') : t('closeSuccess')}
            </button>
          </div>
        </div>
      )}

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
          onContinue={() => {
            restoreDecisionState.onContinue();
            setRestoreDecisionState(null);
          }}
          onCancel={() => {
            restoreDecisionState.onCancel();
            setRestoreDecisionState(null);
          }}
        />
      )}

      {restoreVerificationAlert && (
        <RestoreVerificationAlertModal
          isOpen={Boolean(restoreVerificationAlert)}
          message={restoreVerificationAlert.message}
          details={restoreVerificationAlert.details}
          onClose={() => setRestoreVerificationAlert(null)}
        />
      )}

      {preflightResult && (
        <PreflightModal
          isOpen={Boolean(preflightResult)}
          result={preflightResult}
          onContinue={() => {
            const canContinue = preflightResult.overall !== 'error';
            setPreflightResult(null);
            if (canContinue) {
              setShowRestoreModal(true);
            } else {
              pendingSelectedIdsRef.current = null;
            }
          }}
          onCancel={() => {
            pendingSelectedIdsRef.current = null;
            setPreflightResult(null);
          }}
        />
      )}

      {/* Onboarding Modal */}
      {showOnboarding && <OnboardingModal onClose={handleOnboardingClose} />}

      <RestoreModal
        isOpen={showRestoreModal}
        onClose={() => {
          pendingSelectedIdsRef.current = null;
          setShowRestoreModal(false);
        }}
        onConfirm={() => processUpdates(true)}
        onSkip={() => processUpdates(false)}
      />

      {isCreatingRestore && (
        <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md transition-all">
          <div className="flex flex-col items-center space-y-6 rounded-3xl bg-white p-12 shadow-2xl dark:bg-slate-800 border border-white/10">
            <div className="relative">
              <div className="absolute -inset-4 rounded-full bg-blue-500/20 blur-xl animate-pulse" />
              <RefreshCw className="relative h-16 w-16 animate-spin text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">{t('creatingRestore')}</h3>
              <p className="text-slate-800 dark:text-sky-100 max-w-xs">
                {t('restoreWait')}
              </p>
            </div>
          </div>
        </div>
      )}

      {isInstalling && !isCreatingRestore && (
        <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md transition-all">
          <div className="flex flex-col items-center space-y-6 rounded-3xl bg-white p-12 shadow-2xl dark:bg-slate-800 border border-white/10">
            <div className="relative">
              <div className="absolute -inset-4 rounded-full bg-blue-500/20 blur-xl animate-pulse" />
              <ArrowDownToLine className="relative h-16 w-16 animate-bounce text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-white">{t('installingUpdates')}</h3>
              <p className="text-slate-800 dark:text-sky-100 max-w-xs font-medium">
                {t('updatingApp')} <span className="text-blue-600 dark:text-blue-400">{currentInstallingApp}</span>
              </p>
              {currentLogLine && (
                <p className="text-[10px] text-blue-700/80 dark:text-blue-400/50 italic animate-pulse truncate max-w-[250px]">
                  {currentLogLine}
                </p>
              )}
            </div>
            <div className="w-full max-w-xs space-y-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-700 dark:text-sky-100">
                  {t('appProgress')}: {currentAppProgress !== null ? `${currentAppProgress}%` : t('unknown')}
                  {currentAppProgress !== null && currentAppProgressMode === 'estimated' ? ` (${t('estimatedLabel')})` : ''}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  {currentAppProgress !== null ? (
                    <div
                      className="h-full bg-blue-600 transition-all duration-300 dark:bg-blue-500"
                      style={{ width: `${currentAppProgress}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500/70 dark:bg-blue-400/70" />
                  )}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-700 dark:text-sky-100">
                  {t('batchProgress')}: {installProgress?.current || 0}/{installProgress?.total || 0}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className="h-full bg-indigo-600 transition-all duration-500 dark:bg-indigo-500"
                    style={{ width: `${((installProgress?.current || 0) / (installProgress?.total || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-[11px] font-semibold text-slate-700 dark:text-sky-100">
                {t('estimatedTimeRemaining')}{' '}
                {estimatedRemainingSeconds === null
                  ? t('unknown')
                  : estimatedRemainingSeconds < 60
                    ? t('lessThanOneMinute')
                    : t('aboutMinutes').replace('{minutes}', String(Math.max(1, Math.round(estimatedRemainingSeconds / 60))))}
              </p>
              <p className="text-[11px] font-medium text-slate-700 dark:text-sky-100">
                {t('installSlowNetworkHint')}
              </p>
            </div>
          </div>
        </div>
      )}

      {downloadGuideState && (
        <div className="fixed inset-0 z-[175] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('downloadGuideTitle')}</h3>
            <p className="mt-2 text-sm text-slate-800 dark:text-sky-100">
              {downloadGuideState.isZip ? t('downloadGuideZipIntro') : t('downloadGuideExeIntro')}
            </p>

            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-800 dark:text-sky-100">
              <li>{t('downloadGuideStepCloseCurrent')}</li>
              {downloadGuideState.isZip ? (
                <>
                  <li>{t('downloadGuideStepExtract')}</li>
                  <li>{t('downloadGuideStepRunExtracted')}</li>
                </>
              ) : (
                <li>{t('downloadGuideStepRunInstaller')}</li>
              )}
            </ol>

            <p className="mt-3 break-all rounded border border-slate-300 bg-slate-100 p-2 text-[11px] font-mono text-slate-900 dark:border-white/10 dark:bg-black/20 dark:text-sky-100">
              {downloadGuideState.filePath}
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => window.ipcRenderer.invoke('system:show-item-in-folder', downloadGuideState.filePath)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
              >
                {t('downloadGuideOpenFolder')}
              </button>
              <button
                onClick={() => setDownloadGuideState(null)}
                className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
              >
                {t('downloadGuideClose')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </Layout>
  );
}
