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
                "group relative overflow-hidden rounded-xl border p-4 shadow-sm transition-all hover:shadow-md",
                isInapplicable
                    ? "cursor-default border-amber-300 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-900/10"
                    : isSelected
                        ? "cursor-pointer border-blue-500 bg-blue-50/50 dark:border-blue-500/50 dark:bg-blue-900/10"
                        : "cursor-pointer border-slate-300 bg-white hover:border-blue-500 hover:bg-slate-50 dark:border-white/5 dark:bg-black/20 dark:hover:border-white/10 dark:hover:bg-black/30"
            )}
        >
            <div className="flex min-w-0 items-center gap-4">
                {/* Checkbox Area */}
                <div className={clsx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-all",
                    isInapplicable
                        ? "border-amber-500/50 text-amber-600 bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400"
                        : isSelected
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-gray-400 bg-transparent text-transparent group-hover:border-blue-500 dark:border-gray-600"
                )}>
                    {isInapplicable ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" strokeWidth={3} />}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                        <h3 className="truncate pr-1 text-lg font-bold text-black dark:text-gray-100">{update.name}</h3>
                        {/* Source badge */}
                        <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider text-slate-900 dark:bg-white/10 dark:text-sky-300">
                            {update.source || 'winget'}
                        </span>
                    </div>

                    <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-slate-900 dark:text-sky-300">
                        <span className="font-mono text-xs font-bold break-all">{update.id}</span>
                    </div>

                    {isInapplicable ? (
                        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                            {isManualUninstall ? t('updateManualUninstall') : t('updateInapplicable')}
                        </div>
                    ) : (
                        <div className="mt-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-3 text-sm sm:flex-nowrap sm:gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-900 dark:text-slate-500">{t('current')}</span>
                                    <span className={clsx("font-bold text-sm", isUnknown ? "text-amber-800" : "text-black dark:text-gray-300")}>
                                        {isUnknown ? (
                                            <span className="flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3" /> {t('unknown')}
                                            </span>
                                        ) : update.version}
                                    </span>
                                </div>
                                <ArrowRight className="h-4 w-4 text-slate-500" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-900 dark:text-slate-500">{t('new')}</span>
                                    <span className="font-bold text-sm text-emerald-700 dark:text-emerald-400">{update.available}</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
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
