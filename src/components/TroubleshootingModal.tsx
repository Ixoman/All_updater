import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wrench, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface TroubleshootingModalProps {
    isOpen: boolean;
    onClose: () => void;
    userDataPath?: string | null;
    onOpenLogs?: () => void;
}

interface TroubleshootingItem {
    title: string;
    steps: string[];
}

export const TroubleshootingModal: React.FC<TroubleshootingModalProps> = ({ isOpen, onClose, userDataPath, onOpenLogs }) => {
    const { language, t } = useLanguage();
    const closeRef = useRef<HTMLButtonElement>(null);

    const items: TroubleshootingItem[] = language === 'es'
        ? [
            {
                title: 'Winget no aparece o falla',
                steps: [
                    'Instala/actualiza App Installer desde Microsoft Store.',
                    'Ejecuta la app como Administrador.',
                    'Si hay error de sources, ejecuta: winget source reset --force y winget source update.'
                ]
            },
            {
                title: 'No se crea punto de restauración',
                steps: [
                    'Abre "Crear un punto de restauración" y habilita protección en C:.',
                    'Verifica servicios VSS y Programador de tareas en estado Running.',
                    'Revisa restore_debug.txt en la carpeta data.'
                ]
            },
            {
                title: 'Aplicación en uso al actualizar',
                steps: [
                    'Cierra la app objetivo y revisa bandeja del sistema.',
                    'Si sigue en uso, finaliza procesos relacionados desde Administrador de tareas.',
                    'Reintenta desde el modal de conflicto.'
                ]
            },
            {
                title: 'Versión actual desconocida',
                steps: [
                    'Puede ser un comportamiento normal de algunos manifiestos de winget.',
                    'Si ya se instaló esa versión con éxito, no debería reaparecer en checks siguientes.',
                    'Si reaparece, revisa historial y ejecuta diagnóstico.'
                ]
            },
            {
                title: 'Error de hash (seguridad)',
                steps: [
                    'No instales ese paquete en ese momento.',
                    'Espera a que el proveedor sincronice manifest/instalador.',
                    'Vuelve a intentar más tarde.'
                ]
            },
            {
                title: 'No se puede verificar versión de la app',
                steps: [
                    'Comprueba conexión a internet.',
                    'Verifica que el repositorio/release sea público.',
                    'La app sigue funcionando sin este check.'
                ]
            }
        ]
        : [
            {
                title: 'Winget is missing or failing',
                steps: [
                    'Install/update App Installer from Microsoft Store.',
                    'Run the app as Administrator.',
                    'If sources fail, run: winget source reset --force and winget source update.'
                ]
            },
            {
                title: 'Restore point is not created',
                steps: [
                    'Open "Create a restore point" and enable protection on C:.',
                    'Verify VSS and Task Scheduler services are Running.',
                    'Check restore_debug.txt in the data folder.'
                ]
            },
            {
                title: 'Application in use while updating',
                steps: [
                    'Close the target app and check system tray.',
                    'If still in use, end related processes in Task Manager.',
                    'Retry from the conflict modal.'
                ]
            },
            {
                title: 'Current version appears as unknown',
                steps: [
                    'This can be normal for some winget manifests.',
                    'If that target version was already installed successfully, it should not reappear.',
                    'If it reappears, review history and export diagnostics.'
                ]
            },
            {
                title: 'Hash mismatch (security)',
                steps: [
                    'Do not install that package at this moment.',
                    'Wait for vendor manifest/installer synchronization.',
                    'Retry later.'
                ]
            },
            {
                title: 'Could not verify app version',
                steps: [
                    'Check internet connection.',
                    'Ensure repository/release is public.',
                    'App remains functional without this check.'
                ]
            }
        ];

    useEffect(() => {
        if (!isOpen) return;
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="w-full max-w-3xl overflow-hidden rounded-lg border border-white/10 bg-white shadow-2xl dark:bg-slate-900"
                >
                    <div className="relative bg-slate-900 p-5 text-white">
                        <div className="flex items-center gap-3">
                            <Wrench className="h-6 w-6 text-white/90" />
                            <h2 className="text-xl font-bold">{t('troubleshootingTitle')}</h2>
                        </div>
                        <button onClick={onClose} className="absolute top-4 right-4 rounded-full bg-white/20 p-1 hover:bg-white/30 text-white">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
                        {items.map((item) => (
                            <div key={item.title} className="rounded-lg border border-slate-300 bg-slate-100 p-4 dark:border-white/10 dark:bg-white/5">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">{item.title}</h3>
                                <ul className="space-y-1">
                                    {item.steps.map((step) => (
                                        <li key={step} className="text-xs text-slate-900 dark:text-sky-300">- {step}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}

                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs dark:border-blue-500/15 dark:bg-blue-900/10">
                            <p className="font-bold text-blue-900 dark:text-blue-300">{t('dataTransparencyTitle')}</p>
                            <p className="mt-1 font-medium leading-relaxed text-slate-800 dark:text-sky-100">
                                {t('dataTransparency')}
                            </p>
                            <code className="mt-2 block w-full break-all rounded border border-blue-200 bg-white px-2 py-1.5 font-mono text-[10px] text-slate-800 dark:border-transparent dark:bg-black/20 dark:text-sky-100">
                                {userDataPath || '...'}
                            </code>
                            {onOpenLogs && (
                                <button
                                    onClick={onOpenLogs}
                                    className="mt-2 rounded border border-blue-200 bg-white px-2 py-1.5 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:border-white/10 dark:bg-white/5 dark:text-blue-300 dark:hover:bg-white/10"
                                >
                                    {t('openLogs')}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-slate-300 p-4 dark:border-white/10">
                        <button
                            onClick={onClose}
                            ref={closeRef}
                            className="w-full rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-sky-100 dark:hover:bg-white/10"
                        >
                            {t('troubleshootingClose')}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
