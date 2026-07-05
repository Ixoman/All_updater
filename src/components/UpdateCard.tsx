import React from 'react';
import type { AppUpdate } from '../shared/types';
import { clsx } from 'clsx';
import { AlertCircle, ArrowRight, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';

interface UpdateCardProps {
    update: AppUpdate;
    isSelected: boolean;
    onToggle: () => void;
    releaseNotesUrl?: string | null;
    onOpenReleaseNotes?: () => void;
    onIgnoreFor7Days?: () => void;
}

export const UpdateCard: React.FC<UpdateCardProps> = ({
    update,
    isSelected,
    onToggle,
    releaseNotesUrl,
    onOpenReleaseNotes,
    onIgnoreFor7Days
}) => {
    const { t } = useLanguage();
    const normalizedInstalledVersion = update.version.trim().toLowerCase();
    const isUnknown =
        normalizedInstalledVersion === 'unknown' ||
        normalizedInstalledVersion === '<unknown>' ||
        normalizedInstalledVersion === 'desconocido' ||
        normalizedInstalledVersion === '<desconocido>' ||
        normalizedInstalledVersion === 'desconocida' ||
        normalizedInstalledVersion === '<desconocida>' ||
        normalizedInstalledVersion === '-';
    const isInapplicable = update.previousStatus === 'inapplicable';
    const isManualUninstall = update.previousDetails?.includes('Manual uninstall') || update.previousDetails?.includes('diferente');
    const hasReleaseNotesUrl = typeof releaseNotesUrl === 'string' && releaseNotesUrl.length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={isInapplicable ? undefined : onToggle}
            className={clsx(
                "group relative overflow-hidden rounded-lg border p-3 shadow-sm transition-colors hover:shadow-md",
                isInapplicable
                    ? "cursor-default border-amber-300 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-900/10"
                    : isSelected
                        ? "cursor-pointer border-blue-500 bg-blue-50/50 dark:border-blue-500/50 dark:bg-blue-900/10"
                        : "cursor-pointer border-slate-300 bg-white hover:border-blue-500 hover:bg-slate-50 dark:border-white/5 dark:bg-black/20 dark:hover:border-white/10 dark:hover:bg-black/30"
            )}
        >
            <div className="flex min-w-0 items-start gap-3">
                {/* Checkbox Area */}
                <div className={clsx(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    isInapplicable
                        ? "border-amber-500/50 text-amber-600 bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400"
                        : isSelected
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-gray-400 bg-transparent text-transparent group-hover:border-blue-500 dark:border-gray-600"
                )}>
                    {isInapplicable ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" strokeWidth={3} />}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h3 className="truncate pr-1 text-base font-bold leading-tight text-black dark:text-gray-100">{update.name}</h3>
                            <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-slate-700 dark:text-sky-300">{update.id}</p>
                        </div>
                        {/* Source badge */}
                        <span className="shrink-0 rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900 dark:bg-white/10 dark:text-sky-300">
                            {update.source || 'winget'}
                        </span>
                    </div>

                    {isInapplicable ? (
                        <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                            {isManualUninstall ? t('updateManualUninstall') : t('updateInapplicable')}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs sm:flex-nowrap">
                                <span className="font-bold uppercase tracking-wide text-slate-700 dark:text-slate-500">{t('current')}</span>
                                <span className={clsx("max-w-full truncate font-semibold", isUnknown ? "text-amber-800" : "text-black dark:text-gray-300")}>
                                        {isUnknown ? (
                                            <span className="flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3" /> {t('unknown')}
                                            </span>
                                        ) : update.version}
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                                <span className="font-bold uppercase tracking-wide text-slate-700 dark:text-slate-500">{t('new')}</span>
                                <span className="max-w-full truncate font-bold text-emerald-700 dark:text-emerald-400">{update.available}</span>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-3">
                                {hasReleaseNotesUrl && onOpenReleaseNotes && (
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onOpenReleaseNotes();
                                        }}
                                        className="text-xs font-semibold underline decoration-dotted underline-offset-2 transition-colors text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                                    >
                                        {t('releaseNotes')}
                                    </button>
                                )}
                                {onIgnoreFor7Days && (
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onIgnoreFor7Days();
                                        }}
                                        className="text-xs font-semibold text-amber-700 underline decoration-dotted underline-offset-2 transition-colors hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                                    >
                                        {t('ignoreFor7Days')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
