import React from 'react';
import { clsx } from 'clsx';
import { CircleHelp, LayoutDashboard, History, Moon, Sun, Languages } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import logo from '../assets/logo.png';
import { TroubleshootingModal } from './TroubleshootingModal';

interface LayoutProps {
    children: React.ReactNode;
    darkMode: boolean;
    toggleDarkMode: () => void;
    activeTab: 'dashboard' | 'history';
    onTabChange: (tab: 'dashboard' | 'history') => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, darkMode, toggleDarkMode, activeTab, onTabChange }) => {
    const { language, setLanguage, t } = useLanguage();
    const [userDataPath, setUserDataPath] = React.useState<string | null>(null);
    const [showTroubleshooting, setShowTroubleshooting] = React.useState(false);

    const openLogs = React.useCallback(() => {
        void window.ipcRenderer.invoke('system:open-logs').catch((error) => {
            console.error('Failed to open logs:', error);
        });
    }, []);

    React.useEffect(() => {
        const fetchPath = async () => {
            try {
                const path = await window.ipcRenderer.invoke('system:get-userdata-path');
                setUserDataPath(path);
            } catch (error) {
                console.error('Failed to get user data path:', error);
            }
        };
        fetchPath();
    }, []);

    return (
        <div className={clsx("flex h-screen w-full flex-col overflow-hidden transition-colors duration-300 font-sans selection:bg-blue-500/30 md:flex-row", darkMode ? "dark theme-dark bg-[#070b14] text-sky-100" : "theme-light bg-[#f4f7ff] text-slate-950")}>

            {/* Sidebar */}
            <aside className="relative z-20 flex w-full flex-col overflow-y-auto border-b border-slate-300 bg-white/90 backdrop-blur-xl md:w-64 md:min-w-[16rem] md:border-b-0 md:border-r dark:border-white/5 dark:bg-black/20">
                <div className="flex h-16 items-center gap-3 px-6 border-b border-slate-200 dark:border-white/5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 overflow-hidden">
                        <img src={logo} alt="Logo" className="h-full w-full object-cover" />
                    </div>
                    <h1 className="text-lg font-bold tracking-tight text-black dark:text-gray-100 transition-colors">All Updater</h1>
                </div>

                <nav className="flex flex-wrap gap-2 p-4 md:flex-1 md:flex-col md:gap-1">
                    <button
                        onClick={() => onTabChange('dashboard')}
                        className={clsx(
                            "flex min-w-[140px] flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 md:w-full md:min-w-0 md:flex-none",
                            activeTab === 'dashboard'
                                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:shadow-none"
                                : "text-slate-900 hover:bg-slate-200 dark:text-sky-100 dark:hover:bg-white/5"
                        )}
                    >
                        <LayoutDashboard className="h-4 w-4" />
                        {t('dashboard')}
                    </button>

                    <button
                        onClick={() => onTabChange('history')}
                        className={clsx(
                            "flex min-w-[140px] flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 md:w-full md:min-w-0 md:flex-none",
                            activeTab === 'history'
                                ? "bg-blue-600 text-white shadow-md shadow-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:shadow-none"
                                : "text-slate-900 hover:bg-slate-200 dark:text-sky-100 dark:hover:bg-white/5"
                        )}
                    >
                        <History className="h-4 w-4" />
                        {t('history')}
                    </button>

                    <div className="px-3 py-2">
                        <div className="h-px w-full bg-slate-300 dark:bg-white/5" />
                    </div>

                </nav>
                <div className="space-y-2 border-t border-slate-200 p-4 dark:border-white/5">
                    <button
                        onClick={() => setShowTroubleshooting(true)}
                        className="flex w-full items-center justify-between rounded-lg p-2 text-sm font-bold text-black transition-colors hover:bg-gray-100 dark:text-sky-100 dark:hover:bg-white/5"
                    >
                        <span className="flex items-center gap-2">
                            <CircleHelp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            {t('troubleshooting')}
                        </span>
                    </button>

                    {/* Idioma Selector */}
                    <div className="flex items-center justify-between rounded-lg p-2 text-sm font-bold text-black dark:text-sky-100">
                        <span className="flex items-center gap-2">
                            <Languages className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            {t('language')}
                        </span>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setLanguage('en')}
                                className={clsx("px-1.5 py-0.5 rounded text-[10px] uppercase font-bold transition-all shadow-sm", language === 'en' ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700")}
                            >
                                EN
                            </button>
                            <button
                                onClick={() => setLanguage('es')}
                                className={clsx("px-1.5 py-0.5 rounded text-[10px] uppercase font-bold transition-all shadow-sm", language === 'es' ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700")}
                            >
                                ES
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={toggleDarkMode}
                        className="flex w-full items-center justify-between rounded-lg p-2 text-sm font-bold text-black hover:bg-gray-100 dark:text-sky-100 dark:hover:bg-white/5 transition-all duration-200"
                    >
                        <span className="flex items-center gap-2">
                            {darkMode ? <Moon className="h-4 w-4 text-indigo-400" /> : <Sun className="h-4 w-4 text-amber-500" />}
                            {darkMode ? t('darkMode') : t('lightMode')}
                        </span>
                        <div className={clsx(
                            "h-5 w-10 p-0.5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center transition-all duration-500",
                            darkMode ? "justify-end bg-indigo-500/20" : "justify-start"
                        )}>
                            <div className="h-4 w-4 rounded-full bg-white shadow-md border border-slate-200 dark:border-transparent" />
                        </div>
                    </button>
                </div>

            </aside>

            {/* Main Content */}
            <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 md:p-8">
                    <div className="h-full w-full flex flex-col px-2 sm:px-4">
                        {children}
                    </div>
                </div>
            </main>

            <TroubleshootingModal
                isOpen={showTroubleshooting}
                onClose={() => setShowTroubleshooting(false)}
                userDataPath={userDataPath}
                onOpenLogs={openLogs}
            />
        </div>
    );
};
