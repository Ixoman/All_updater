import React from 'react';
import { ArrowDownToLine, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useLanguage } from '../context/LanguageContext';

interface InstallStateOverlayProps {
  isCreatingRestore: boolean;
  isInstalling: boolean;
  currentInstallingApp: string | null;
  currentLogLine: string | null;
  logEntries: string[];
  showDetailedLog: boolean;
  isOnline: boolean;
  currentAppProgress: number | null;
  currentAppProgressMode: 'real' | 'estimated' | null;
  installProgress: { current: number; total: number } | null;
  estimatedRemainingSeconds: number | null;
  cancelBatchRequested: boolean;
  onCancelBatch: () => void;
  onToggleDetailedLog: () => void;
}

export const InstallStateOverlay: React.FC<InstallStateOverlayProps> = ({
  isCreatingRestore,
  isInstalling,
  currentInstallingApp,
  currentLogLine,
  logEntries,
  showDetailedLog,
  isOnline,
  currentAppProgress,
  currentAppProgressMode,
  installProgress,
  estimatedRemainingSeconds,
  cancelBatchRequested,
  onCancelBatch,
  onToggleDetailedLog
}) => {
  const { t } = useLanguage();

  if (isCreatingRestore) {
    return (
      <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md transition-all">
        <div className="flex flex-col items-center space-y-6 rounded-3xl border border-white/10 bg-white p-12 shadow-2xl dark:bg-slate-800">
          <div className="relative">
            <div className="absolute -inset-4 animate-pulse rounded-full bg-blue-500/20 blur-xl" />
            <RefreshCw className="relative h-16 w-16 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
          <div className="space-y-2 text-center">
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">{t('creatingRestore')}</h3>
            <p className="max-w-xs text-slate-800 dark:text-sky-100">
              {t('restoreWait')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInstalling) return null;

  const batchPercent = ((installProgress?.current || 0) / (installProgress?.total || 1)) * 100;

  return (
    <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md transition-all">
      <div className="flex flex-col items-center space-y-6 rounded-3xl border border-white/10 bg-white p-12 shadow-2xl dark:bg-slate-800">
        <div className="relative">
          <div className="absolute -inset-4 animate-pulse rounded-full bg-blue-500/20 blur-xl" />
          <ArrowDownToLine className="relative h-16 w-16 animate-bounce text-blue-600 dark:text-blue-400" />
        </div>
        <div className="space-y-2 text-center">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">{t('installingUpdates')}</h3>
          <p className="max-w-xs font-medium text-slate-800 dark:text-sky-100">
            {t('updatingApp')} <span className="text-blue-600 dark:text-blue-400">{currentInstallingApp}</span>
          </p>
          {currentLogLine && (
            <p className="max-w-[250px] truncate text-[10px] italic text-blue-700/80 animate-pulse dark:text-blue-400/50">
              {currentLogLine}
            </p>
          )}
          {!isOnline && (
            <p className="max-w-xs text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {t('installNetworkLostWarning')}
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
                style={{ width: `${batchPercent}%` }}
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
          <button
            onClick={onToggleDetailedLog}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
          >
            {showDetailedLog ? t('installHideLog') : t('installShowLog')}
          </button>
          {showDetailedLog && (
            <div className="rounded-xl border border-slate-300 bg-slate-100 p-2 dark:border-white/10 dark:bg-black/20">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-sky-100">
                {t('installLogTitle')}
              </p>
              <div className="max-h-32 overflow-y-auto rounded-lg bg-white/80 p-2 text-[11px] font-mono text-slate-800 dark:bg-black/30 dark:text-sky-100">
                {logEntries.length === 0 ? (
                  <p className="italic opacity-70">{t('installLogEmpty')}</p>
                ) : (
                  logEntries.map((entry, index) => (
                    <p key={`${index}-${entry}`} className="break-words">
                      {entry}
                    </p>
                  ))
                )}
              </div>
            </div>
          )}
          <button
            onClick={onCancelBatch}
            disabled={cancelBatchRequested}
            className={clsx(
              'w-full rounded-xl border px-3 py-2 text-xs font-bold transition-colors',
              cancelBatchRequested
                ? 'cursor-not-allowed border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300'
                : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10'
            )}
          >
            {cancelBatchRequested ? t('updateBatchCancelPending') : t('updateBatchCancelAction')}
          </button>
        </div>
      </div>
    </div>
  );
};
