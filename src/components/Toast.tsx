import React, { useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { clsx } from 'clsx';
import { createToastAutoCloseHandler } from '../utils/toast-timer';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    id: string;
    message: string;
    type: ToastType;
    onClose: (id: string) => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ id, message, type, onClose, duration = 5000 }) => {
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const timer = setTimeout(createToastAutoCloseHandler(onCloseRef, id), duration);
        return () => clearTimeout(timer);
    }, [id, duration]);

    const icons = {
        success: <CheckCircle className="h-5 w-5 text-emerald-500" />,
        error: <XCircle className="h-5 w-5 text-rose-500" />,
        warning: <AlertCircle className="h-5 w-5 text-amber-500" />,
        info: <AlertCircle className="h-5 w-5 text-blue-500" />,
    };

    const styles = {
        success: "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
        error: "border-rose-600 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400",
        warning: "border-amber-600 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400",
        info: "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400",
    };

    return (
        <div className={clsx(
            "flex items-center gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-right-full duration-300",
            styles[type]
        )}>
            {icons[type]}
            <p className="text-sm font-bold">{message}</p>
            <button
                onClick={() => onClose(id)}
                className="ml-auto rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/5"
            >
                <X className="h-4 w-4 opacity-50 hover:opacity-100" />
            </button>
        </div>
    );
};

interface ToastContainerProps {
    toasts: { id: string; message: string; type: ToastType }[];
    onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
            {toasts.map((toast) => (
                <Toast key={toast.id} {...toast} onClose={onClose} />
            ))}
        </div>
    );
};
