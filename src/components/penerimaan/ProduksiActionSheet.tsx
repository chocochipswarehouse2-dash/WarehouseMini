import React, { useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';

export interface ProduksiActionItem {
    id: string;
    label: string;
    description?: string;
    icon: React.ReactNode;
    onClick: () => void;
    tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
    disabled?: boolean;
    badge?: string;
}

export interface ProduksiActionGroup {
    title?: string;
    items: ProduksiActionItem[];
}

interface ProduksiActionSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    groups: ProduksiActionGroup[];
}

export const ProduksiActionSheet: React.FC<ProduksiActionSheetProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    groups,
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const nonEmptyGroups = groups
        .map((g) => ({ ...g, items: g.items.filter(Boolean) }))
        .filter((g) => g.items.length > 0);

    const getToneStyles = (tone?: ProduksiActionItem['tone']) => {
        switch (tone) {
            case 'primary':
                return {
                    iconBox: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
                    text: 'text-indigo-700 dark:text-indigo-300',
                };
            case 'success':
                return {
                    iconBox: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
                    text: 'text-emerald-700 dark:text-emerald-300',
                };
            case 'warning':
                return {
                    iconBox: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
                    text: 'text-amber-700 dark:text-amber-300',
                };
            case 'danger':
                return {
                    iconBox: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
                    text: 'text-rose-600 dark:text-rose-400',
                };
            default:
                return {
                    iconBox: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                    text: 'text-slate-800 dark:text-slate-100',
                };
        }
    };

    return (
        <div
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-0 sm:p-4 animate-in fade-in duration-150"
            onClick={onClose}
        >
            <div
                className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Mobile Drag Handle */}
                <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                </div>

                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-2 sm:pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                            {title}
                        </h3>
                        {subtitle && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup"
                        className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Action Groups */}
                <div className="overflow-y-auto px-3 sm:px-4 py-3 space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    {nonEmptyGroups.map((group, gIdx) => (
                        <div key={gIdx} className="space-y-1.5">
                            {group.title && (
                                <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                    {group.title}
                                </p>
                            )}
                            <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800/80 divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden">
                                {group.items.map((item) => {
                                    const tone = getToneStyles(item.tone);
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            disabled={item.disabled}
                                            onClick={() => {
                                                onClose();
                                                item.onClick();
                                            }}
                                            className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white dark:hover:bg-slate-800 active:bg-slate-100 dark:active:bg-slate-700/70 transition-colors disabled:opacity-45 disabled:pointer-events-none min-h-[52px]"
                                        >
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone.iconBox}`}>
                                                {item.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-semibold truncate ${tone.text}`}>
                                                        {item.label}
                                                    </span>
                                                    {item.badge && (
                                                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                </div>
                                                {item.description && (
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
