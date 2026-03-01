import React from 'react';
import { useLanguage } from '../context/LanguageContext';

interface DownloadGuideState {
  filePath: string;
  isZip: boolean;
}

interface DownloadGuideModalProps {
  guide: DownloadGuideState | null;
  onClose: () => void;
}

export const DownloadGuideModal: React.FC<DownloadGuideModalProps> = ({ guide, onClose }) => {
  const { t } = useLanguage();

  if (!guide) return null;

  return (
    <div className="fixed inset-0 z-[175] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('downloadGuideTitle')}</h3>
        <p className="mt-2 text-sm text-slate-800 dark:text-sky-100">
          {guide.isZip ? t('downloadGuideZipIntro') : t('downloadGuideExeIntro')}
        </p>

        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-800 dark:text-sky-100">
          <li>{t('downloadGuideStepCloseCurrent')}</li>
          {guide.isZip ? (
            <>
              <li>{t('downloadGuideStepExtract')}</li>
              <li>{t('downloadGuideStepRunExtracted')}</li>
            </>
          ) : (
            <li>{t('downloadGuideStepRunInstaller')}</li>
          )}
        </ol>

        <p className="mt-3 break-all rounded border border-slate-300 bg-slate-100 p-2 text-[11px] font-mono text-slate-900 dark:border-white/10 dark:bg-black/20 dark:text-sky-100">
          {guide.filePath}
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => { void window.ipcRenderer.invoke('system:show-item-in-folder', guide.filePath); }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
          >
            {t('downloadGuideOpenFolder')}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
          >
            {t('downloadGuideClose')}
          </button>
        </div>
      </div>
    </div>
  );
};
