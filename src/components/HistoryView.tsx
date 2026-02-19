import React, { useEffect, useState } from 'react';
import type { HistoryItem } from '../shared/types';
import { clsx } from 'clsx';
import { Clock, CheckCircle2, XCircle, AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface HistoryViewProps {
    onResetApp?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onResetApp }) => {
    const { t, setLanguage } = useLanguage();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [filter, setFilter] = useState<'all' | 'success' | 'issues' | 'failed' | 'inUse' | 'inapplicable' | 'reboot' | 'security'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const loadHistory = async () => {
            try {
                const data = await window.ipcRenderer.invoke('history:get');
                setHistory(data);
            } catch (error) {
                console.error('[HistoryView] Failed to load history:', error);
                setHistory([]);
            } finally {
                setLoading(false);
            }
        };
        void loadHistory();
    }, []);

    const handleClearHistory = async () => {
        try {
            await window.ipcRenderer.invoke('history:clear');
            setLanguage('en');
            setHistory([]);
            setShowClearConfirm(false);
            onResetApp?.();
        } catch (error) {
            console.error('[HistoryView] Failed to clear history:', error);
        }
    };

    const getSatiricalStatus = (item: HistoryItem) => {
        if (item.status === 'success') return t('historySuccess');
        if (item.status === 'inapplicable') return t('historyInapplicable');
        if (item.status === 'skipped') return t('historySkipped');
        if (item.status === 'reboot') return t('historyReboot');
        if (item.status === 'in-use') return t('historyInUse');
        if (item.status === 'security-error') return t('statusSecurity');
        return item.details || t('historyBroken');
    };

    const formatVersionValue = (version: string | undefined) => {
        if (!version) return '-';
        const normalized = version.trim().toLowerCase();
        const isUnknown =
            normalized === 'unknown' ||
            normalized === '<unknown>' ||
            normalized === 'desconocido' ||
            normalized === '<desconocido>' ||
            normalized === 'desconocida' ||
            normalized === '<desconocida>' ||
            normalized === '-';

        return isUnknown ? version : `v${version}`;
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    // History check removed to allow header rendering
    const normalizedQuery = searchQuery
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const filteredHistory = history.filter((item) => {
        if (filter === 'all') return true;
        if (filter === 'success') return item.status === 'success';
        if (filter === 'issues') return item.status === 'failed' || item.status === 'inapplicable' || item.status === 'in-use' || item.status === 'skipped' || item.status === 'security-error';
        if (filter === 'failed') return item.status === 'failed';
        if (filter === 'inUse') return item.status === 'in-use';
        if (filter === 'inapplicable') return item.status === 'inapplicable';
        if (filter === 'reboot') return item.status === 'reboot';
        if (filter === 'security') return item.status === 'security-error';
        return true;
    }).filter((item) => {
        if (!normalizedQuery) return true;
        const searchable = [
            item.appName,
            item.id,
            item.status,
            item.version,
            item.previousVersion || '',
            item.details || ''
        ]
            .join(' ')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        return searchable.includes(normalizedQuery);
    });

    return (
        <div className="space-y-6 relative">
            {showClearConfirm && (
                <div className="absolute top-0 right-0 left-0 z-50 flex flex-col gap-3 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-red-200 dark:border-red-900/50 animate-in fade-in slide-in-from-top-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full text-red-600 dark:text-red-400">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-900 dark:text-white text-sm">{t('resetAppConfirm')}</h4>
                            <p className="text-xs text-slate-800 dark:text-sky-100">{t('resetAppMessage')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                            onClick={() => setShowClearConfirm(false)}
                            className="px-3 py-1.5 text-xs font-bold text-gray-900 dark:text-sky-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-md transition-colors"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            onClick={handleClearHistory}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm transition-colors"
                        >
                            {t('confirm')}
                        </button>
                    </div>
                </div>
            )}

            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-black dark:text-white transition-colors">{t('history')}</h2>
                    <p className="text-sm font-medium text-gray-900 dark:text-sky-100">
                        {t('historyRecord')}
                    </p>
                </div>
                {!showClearConfirm && (
                    <button
                        onClick={() => setShowClearConfirm(true)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors font-medium border border-red-200 dark:border-transparent"
                    >
                        {t('resetApp')}
                    </button>
                )}
            </header>

            {history.length > 0 && (
                <div className="space-y-3">
                    <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={t('historySearchPlaceholder')}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-sky-100"
                    />

                    <div className="flex flex-wrap gap-2">
                        {[
                            { id: 'all', label: t('historyFilterAll') },
                            { id: 'success', label: t('historyFilterSuccess') },
                            { id: 'issues', label: t('historyFilterIssues') },
                            { id: 'failed', label: t('historyFilterFailed') },
                            { id: 'inUse', label: t('historyFilterInUse') },
                            { id: 'inapplicable', label: t('historyFilterInapplicable') },
                            { id: 'reboot', label: t('historyFilterReboot') },
                            { id: 'security', label: t('historyFilterSecurity') }
                        ].map((option) => (
                            <button
                                key={option.id}
                                onClick={() => setFilter(option.id as typeof filter)}
                                className={clsx(
                                    "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
                                    filter === option.id
                                        ? "border-blue-500 bg-blue-600 text-white"
                                        : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-200 dark:hover:bg-white/10"
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {history.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center space-y-4 text-slate-800 dark:text-sky-100">
                    <Clock className="h-16 w-16" />
                    <h2 className="text-xl font-bold">{t('historyEmpty')}</h2>
                    <p>{t('historyEmptySmall')}</p>
                </div>
            ) : filteredHistory.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center space-y-2 text-slate-800 dark:text-sky-100">
                    <AlertCircle className="h-10 w-10" />
                    <p className="text-sm font-medium">{normalizedQuery ? t('historySearchNoMatch') : t('historyEmptySmall')}</p>
                </div>
            ) : (
                <div className="relative space-y-10 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent dark:before:via-white/5">
                    {filteredHistory.map((item, idx) => (
                        <div key={idx} className="relative flex items-start group">
                            <div className={clsx(
                                "absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border-4 transition-all duration-300",
                                item.status === 'success' ? "bg-green-500 border-green-500/20 text-white" :
                                    item.status === 'reboot' ? "bg-blue-600 border-blue-500/20 text-white" :
                                        item.status === 'in-use' ? "bg-amber-500 border-amber-500/20 text-white" :
                                            item.status === 'inapplicable' ? "bg-amber-500 border-amber-500/20 text-white" :
                                                item.status === 'security-error' ? "bg-orange-600 border-orange-500/20 text-white" :
                                        "bg-red-500 border-red-500/20 text-white"
                            )}>
                                {item.status === 'success' && <CheckCircle2 className="h-5 w-5" />}
                                {item.status === 'reboot' && <RefreshCw className="h-5 w-5" />}
                                {item.status === 'in-use' && <AlertTriangle className="h-5 w-5" />}
                                {item.status === 'inapplicable' && <AlertCircle className="h-5 w-5" />}
                                {item.status === 'security-error' && <AlertTriangle className="h-5 w-5" />}
                                {item.status === 'failed' && <XCircle className="h-5 w-5" />}
                                {item.status === 'skipped' && <AlertCircle className="h-5 w-5 opacity-70" />}
                            </div>

                            <div className="ml-16 w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-300 dark:bg-white/5 dark:ring-white/10 transition-all duration-300 group-hover:shadow-md dark:group-hover:bg-white/10">
                                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <h3 className="font-bold text-black dark:text-white">{item.appName}</h3>
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-900 dark:text-sky-100">
                                        <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                        {new Date(item.date).toLocaleString()}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800 dark:text-sky-100">
                                    <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-800 dark:bg-white/10 dark:text-sky-200">
                                        {item.previousVersion
                                            ? `${formatVersionValue(item.previousVersion)} -> ${formatVersionValue(item.version)}`
                                            : formatVersionValue(item.version)}
                                    </span>
                                    <span className="h-1 w-1 rounded-full bg-slate-400 dark:bg-slate-700" />
                                    <span className={clsx(
                                        "font-medium italic",
                                        item.status === 'success' ? "text-green-600 dark:text-green-400" :
                                            item.status === 'reboot' ? "text-blue-600 dark:text-blue-400" :
                                                item.status === 'in-use' ? "text-amber-600 dark:text-amber-400" :
                                                    item.status === 'inapplicable' ? "text-amber-600 dark:text-amber-400" :
                                                        item.status === 'security-error' ? "text-orange-600 dark:text-orange-400" :
                                                "text-red-600 dark:text-red-400"
                                    )}>
                                        {getSatiricalStatus(item)}
                                    </span>
                                </div>
                                {item.details && (
                                    <div className="mt-3 rounded border border-slate-200 bg-slate-100 p-3 text-xs font-mono text-slate-900 overflow-x-auto dark:border-white/5 dark:bg-black/20 dark:text-sky-100">
                                        {item.details}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
