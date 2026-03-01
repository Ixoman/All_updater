import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useLanguage } from '../context/LanguageContext';
import type { HistoryItem } from '../shared/types';

interface SummaryStats {
  summaryTotal: number;
  summaryFailedCount: number;
  summaryUpdatedCount: number;
  summaryRebootCount: number;
  summaryNoChangeCount: number;
  summaryActionNeededCount: number;
  hasRetryableSummaryItems: boolean;
  hasSuccessfulResults: boolean;
}

interface RestoreVerificationSummaryState {
  status: 'confirmed' | 'missing' | 'unverified';
  message: string;
  details?: string;
}

interface SummaryModalProps {
  isOpen: boolean;
  batchResults: HistoryItem[];
  summaryStats: SummaryStats;
  restoreVerificationSummary: RestoreVerificationSummaryState | null;
  exportingDiagnostics: boolean;
  onRetryFailed: () => void;
  onExportDiagnostics: () => void;
  onOpenSystemProtection?: () => void;
  onClose: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({
  isOpen,
  batchResults,
  summaryStats,
  restoreVerificationSummary,
  exportingDiagnostics,
  onRetryFailed,
  onExportDiagnostics,
  onOpenSystemProtection,
  onClose
}) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  let message = t('summarySuccess');
  if (summaryStats.summaryFailedCount === summaryStats.summaryTotal) {
    message = t('summaryFailed');
  } else if (summaryStats.summaryFailedCount > 0) {
    message = t('summaryPartial');
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md transition-all">
      <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-3xl border border-black/10 bg-white p-8 shadow-2xl dark:border-white/10 dark:bg-slate-800">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{t('summaryTitle')}</h3>
            <p className="text-slate-900 dark:text-sky-100">{t('summaryDesc')}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-slate-200 dark:hover:bg-white/10"
          >
            <XCircle className="h-6 w-6 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          <div className="mb-4 rounded-2xl border border-slate-300 bg-slate-100 p-6 dark:border-white/10 dark:bg-white/5">
            <p className="text-center text-xl font-medium italic leading-relaxed text-slate-900 dark:text-sky-100">
              {message}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{t('summaryCountUpdated')}</p>
              <p className="text-xl font-bold text-emerald-800 dark:text-emerald-200">{summaryStats.summaryUpdatedCount}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">{t('summaryCountReboot')}</p>
              <p className="text-xl font-bold text-blue-800 dark:text-blue-200">{summaryStats.summaryRebootCount}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">{t('summaryCountNoChange')}</p>
              <p className="text-xl font-bold text-amber-800 dark:text-amber-200">{summaryStats.summaryNoChangeCount}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/40 dark:bg-rose-900/20">
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">{t('summaryCountActionNeeded')}</p>
              <p className="text-xl font-bold text-rose-800 dark:text-rose-200">{summaryStats.summaryActionNeededCount}</p>
            </div>
          </div>

          {restoreVerificationSummary && (
            <div className={clsx(
              'rounded-2xl border p-4',
              restoreVerificationSummary.status === 'confirmed'
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20'
                : restoreVerificationSummary.status === 'missing'
                  ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20'
                  : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20'
            )}>
              <p className={clsx(
                'text-sm font-bold',
                restoreVerificationSummary.status === 'confirmed'
                  ? 'text-emerald-800 dark:text-emerald-300'
                  : restoreVerificationSummary.status === 'missing'
                    ? 'text-red-800 dark:text-red-300'
                    : 'text-amber-800 dark:text-amber-300'
              )}>
                {restoreVerificationSummary.message}
              </p>
              {restoreVerificationSummary.details && (
                <p className="mt-2 whitespace-pre-wrap text-xs font-mono text-slate-900 dark:text-sky-100">
                  {restoreVerificationSummary.details}
                </p>
              )}
              {restoreVerificationSummary.status === 'confirmed' && onOpenSystemProtection && (
                <button
                  onClick={onOpenSystemProtection}
                  className="mt-3 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-900/40 dark:bg-white/5 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                >
                  {t('preflightActionOpenSystemProtection')}
                </button>
              )}
            </div>
          )}

          {batchResults.map((result, index) => (
            <div key={`${result.id}-${index}`} className="flex items-center gap-4 rounded-2xl border border-slate-300 bg-slate-100 p-4 dark:border-white/5 dark:bg-white/5">
              <div className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm',
                result.status === 'success' ? 'bg-green-500 text-white'
                  : result.status === 'reboot' ? 'bg-blue-600 text-white'
                    : result.status === 'in-use' ? 'bg-amber-500 text-white'
                      : result.status === 'inapplicable' ? 'bg-amber-500 text-white'
                        : result.status === 'security-error' ? 'bg-orange-600 text-white'
                          : 'bg-red-500 text-white'
              )}>
                {result.status === 'success' && <CheckCircle className="h-5 w-5" />}
                {result.status === 'reboot' && <RefreshCw className="h-5 w-5" />}
                {result.status === 'in-use' && <AlertTriangle className="h-5 w-5" />}
                {result.status === 'inapplicable' && <AlertCircle className="h-5 w-5" />}
                {result.status === 'security-error' && <AlertTriangle className="h-5 w-5" />}
                {result.status === 'failed' && <XCircle className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate font-bold text-slate-900 dark:text-white">{result.appName}</h4>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-900 dark:text-sky-100">
                  {t('versionLabel')} {result.version}
                </p>
                <p className="text-xs font-medium italic text-slate-900 dark:text-sky-100">
                  {result.status === 'success' ? t('statusSuccess')
                    : result.status === 'reboot' ? t('statusReboot')
                      : result.status === 'in-use' ? t('statusInUse')
                        : result.status === 'inapplicable' ? t('statusInapplicable')
                          : result.status === 'security-error' ? t('statusSecurity')
                            : t('statusFailed')}
                </p>
              </div>
            </div>
          ))}

          {summaryStats.hasSuccessfulResults && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                <RefreshCw className="h-4 w-4" />
                {t('restartRecommendation')}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {summaryStats.hasRetryableSummaryItems && (
            <button
              onClick={onRetryFailed}
              className="rounded-2xl border border-amber-300 bg-amber-50 py-3 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
            >
              {t('summaryRetryFailed')}
            </button>
          )}
          <button
            onClick={onExportDiagnostics}
            disabled={exportingDiagnostics}
            className={clsx(
              'rounded-2xl border py-3 text-sm font-bold transition-colors',
              exportingDiagnostics
                ? 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-500'
                : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10'
            )}
          >
            {exportingDiagnostics ? `${t('exportDiagnostics')}...` : t('summaryExportDiagnostics')}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-2xl bg-blue-600 py-4 font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] hover:bg-blue-700 active:scale-[0.98] dark:hover:bg-blue-500"
        >
          {summaryStats.summaryFailedCount === summaryStats.summaryTotal ? t('thanksNothing') : t('closeSuccess')}
        </button>
      </div>
    </div>
  );
};
