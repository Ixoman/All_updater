import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldAlert, X, Wrench } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { PreflightResult, ServiceRuntimeStatus, ServiceStartupType } from '../shared/types';

interface PreflightModalProps {
    isOpen: boolean;
    result: PreflightResult | null;
    onContinue: () => void;
    onCancel: () => void;
}

type CheckKey = keyof PreflightResult['checks'];

export const PreflightModal: React.FC<PreflightModalProps> = ({
    isOpen,
    result,
    onContinue,
    onCancel
}) => {
    const { t } = useLanguage();
    const [actionError, setActionError] = React.useState<string | null>(null);
    const handleCancel = React.useCallback(() => {
        setActionError(null);
        onCancel();
    }, [onCancel]);
    const handleContinue = React.useCallback(() => {
        setActionError(null);
        onContinue();
    }, [onContinue]);
    const checks: CheckKey[] = ['admin', 'winget', 'vssService', 'taskScheduler', 'restoreQuery'];
    const canContinue = result?.overall !== 'error';
    const continueRef = useRef<HTMLButtonElement>(null);
    const riskLevel = result?.overall === 'ok' ? 'low' : result?.overall === 'warning' ? 'medium' : 'high';
    const checkLabelKeys: Record<CheckKey, Parameters<typeof t>[0]> = {
        admin: 'preflightCheckAdmin',
        winget: 'preflightCheckWinget',
        vssService: 'preflightCheckVssService',
        taskScheduler: 'preflightCheckTaskScheduler',
        restoreQuery: 'preflightCheckRestoreQuery'
    };
    const runtimeKeyMap: Record<ServiceRuntimeStatus, Parameters<typeof t>[0]> = {
        running: 'preflightRuntimeRunning',
        stopped: 'preflightRuntimeStopped',
        paused: 'preflightRuntimePaused',
        missing: 'preflightRuntimeMissing',
        unknown: 'preflightRuntimeUnknown'
    };
    const startupKeyMap: Record<ServiceStartupType, Parameters<typeof t>[0]> = {
        automatic: 'preflightStartupAutomatic',
        manual: 'preflightStartupManual',
        disabled: 'preflightStartupDisabled',
        unknown: 'preflightStartupUnknown'
    };
    const stripStructuredDetail = (detail: string, prefix: string): string => {
        if (!detail.startsWith(prefix)) return detail;
        return detail.slice(prefix.length).trim();
    };

    const getCheckDetail = (key: CheckKey): string | undefined => {
        if (!result) return undefined;
        const fallback = result.details[key];
        if (key === 'admin' && fallback) {
            if (fallback.startsWith('code=not-elevated')) {
                return [t('preflightAdminAdvice'), t('preflightNoAutoFix')].join('\n');
            }
            if (fallback.startsWith('code=admin-check-failed;')) {
                const output = stripStructuredDetail(fallback, 'code=admin-check-failed; output=');
                return [t('preflightAdminCheckFailed'), output].join('\n');
            }
            return fallback;
        }

        if (key === 'winget' && fallback) {
            if (fallback.startsWith('code=winget-missing')) {
                return [t('preflightWingetMissingAdvice'), t('preflightNoAutoFix')].join('\n');
            }
            if (fallback.startsWith('code=winget-error;')) {
                const output = stripStructuredDetail(fallback, 'code=winget-error; output=');
                return [t('preflightWingetGeneralAdvice'), output].join('\n');
            }
            return fallback;
        }

        if (key !== 'vssService' && key !== 'taskScheduler') return fallback;

        const serviceState = result.serviceStates?.[key];
        if (!serviceState) return fallback;

        const lines = [
            `${t('preflightServiceRuntime')}: ${t(runtimeKeyMap[serviceState.status])}`,
            `${t('preflightServiceStartup')}: ${t(startupKeyMap[serviceState.startType])}`
        ];

        if (serviceState.startType === 'disabled') {
            lines.push(key === 'vssService' ? t('preflightVssAdviceDisabled') : t('preflightTaskAdviceDisabled'));
        } else if (serviceState.status !== 'running') {
            lines.push(key === 'vssService' ? t('preflightVssAdviceNotRunning') : t('preflightTaskAdviceNotRunning'));
        }

        lines.push(t('preflightNoAutoFix'));
        return lines.join('\n');
    };

    useEffect(() => {
        if (!isOpen || !result) return;
        continueRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel();
            } else if (event.key === 'Enter' && canContinue) {
                event.preventDefault();
                handleContinue();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [canContinue, handleCancel, handleContinue, isOpen, result]);

    if (!isOpen || !result) return null;

    const runQuickAction = (action: () => Promise<void>) => {
        setActionError(null);
        void action().catch((error) => {
            console.error('[PreflightModal] Quick action failed:', error);
            setActionError(t('preflightActionFailed'));
        });
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-white/10 overflow-hidden"
                >
                    <div className="relative bg-gradient-to-r from-blue-700 to-indigo-700 p-6 text-white">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-8 w-8 text-white/90" />
                            <div>
                                <h2 className="text-xl font-bold">{t('preflightTitle')}</h2>
                                <p className="text-white/85 text-sm">{t('preflightDesc')}</p>
                            </div>
                        </div>
                        <button onClick={handleCancel} className="absolute top-4 right-4 rounded-full bg-white/20 p-1 hover:bg-white/30 text-white">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className={(
                            riskLevel === 'low'
                                ? 'rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
                                : riskLevel === 'medium'
                                    ? 'rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300'
                                    : 'rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
                        )}>
                            {t('preflightRiskLabel')}: {riskLevel === 'low' ? t('preflightRiskLow') : riskLevel === 'medium' ? t('preflightRiskMedium') : t('preflightRiskHigh')}
                        </div>

                        <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-sky-100">
                            {result.overall === 'ok' && t('preflightOverallOk')}
                            {result.overall === 'warning' && t('preflightOverallWarning')}
                            {result.overall === 'error' && t('preflightOverallError')}
                        </div>

                        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                            {checks.map((key) => {
                                const ok = result.checks[key];
                                const detail = getCheckDetail(key);
                                return (
                                    <div
                                        key={key}
                                        className="rounded-lg border border-slate-300 bg-white p-3 dark:border-white/10 dark:bg-slate-900/40"
                                    >
                                        <div className="flex items-center gap-2">
                                            {ok ? (
                                                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                            ) : (
                                                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                            )}
                                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                                {t(checkLabelKeys[key])}
                                            </p>
                                        </div>
                                        {detail && (
                                            <p className="mt-2 text-xs text-slate-900 dark:text-sky-300 whitespace-pre-wrap break-words font-mono">
                                                {detail}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {(!result.checks.winget || !result.checks.vssService || !result.checks.taskScheduler || !result.checks.restoreQuery) && (
                            <div className="rounded-lg border border-slate-300 bg-slate-100 p-3 dark:border-white/10 dark:bg-white/5">
                                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-sky-200">
                                    {t('preflightQuickActions')}
                                </p>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {!result.checks.winget && (
                                        <button
                                            onClick={() => {
                                                runQuickAction(async () => {
                                                    await window.ipcRenderer.invoke('system:open-url', 'https://aka.ms/getwinget');
                                                });
                                            }}
                                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                <ExternalLink className="h-3.5 w-3.5" />
                                                {t('preflightActionGetWinget')}
                                            </span>
                                        </button>
                                    )}
                                    {(!result.checks.vssService || !result.checks.taskScheduler) && (
                                        <button
                                            onClick={() => {
                                                runQuickAction(async () => {
                                                    await window.ipcRenderer.invoke('system:open-services-console');
                                                });
                                            }}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
                                        >
                                            {t('preflightActionOpenServices')}
                                        </button>
                                    )}
                                    {(!result.checks.restoreQuery || !result.checks.vssService || !result.checks.taskScheduler) && (
                                        <button
                                            onClick={() => {
                                                runQuickAction(async () => {
                                                    await window.ipcRenderer.invoke('system:open-system-restore');
                                                });
                                            }}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
                                        >
                                            {t('preflightActionOpenSystemProtection')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {actionError && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                                {actionError}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button
                                onClick={handleCancel}
                                className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
                            >
                                {t('preflightCancel')}
                            </button>
                            <button
                                onClick={handleContinue}
                                disabled={!canContinue}
                                ref={continueRef}
                                className="rounded-lg border border-blue-500/40 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-500/30 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                            >
                                {canContinue ? t('preflightContinue') : t('preflightFixFirst')}
                            </button>
                        </div>

                        {!canContinue && (
                            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300 flex items-center gap-2">
                                <Wrench className="h-4 w-4" />
                                {t('preflightBlockingNote')}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
