import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface AppActionItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  badge?: string | number;
  disabled?: boolean;
  onClick: () => void;
}

export interface AppActionGroup {
  title?: string;
  items: AppActionItem[];
}

interface AppActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  groups: AppActionGroup[];
}

export const AppActionSheet: React.FC<AppActionSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  groups,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getToneClasses = (tone: AppActionItem['tone'] = 'default') => {
    switch (tone) {
      case 'primary':
        return 'text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 hover:bg-indigo-100/80 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50';
      case 'success':
        return 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 hover:bg-emerald-100/80 dark:bg-emerald-950/35 dark:hover:bg-emerald-900/50';
      case 'warning':
        return 'text-amber-700 dark:text-amber-300 bg-amber-50/60 hover:bg-amber-100/80 dark:bg-amber-950/35 dark:hover:bg-amber-900/50';
      case 'danger':
        return 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40';
      default:
        return 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/70';
    }
  };

  const getIconToneClasses = (tone: AppActionItem['tone'] = 'default') => {
    switch (tone) {
      case 'primary':
        return 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300';
      case 'success':
        return 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300';
      case 'warning':
        return 'bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300';
      case 'danger':
        return 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
    }
  };

  const visibleGroups = groups.filter((g) => g.items.length > 0);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle (Mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-2 sm:pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            aria-label="Tutup menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Groups */}
        <div className="overflow-y-auto px-3 sm:px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 space-y-3.5">
          {visibleGroups.map((group, gIdx) => (
            <div key={group.title || gIdx} className="space-y-1.5">
              {group.title && (
                <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {group.title}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      onClose();
                      item.onClick();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[46px] rounded-xl text-left transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.99] ${getToneClasses(
                      item.tone
                    )}`}
                  >
                    {item.icon && (
                      <span
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${getIconToneClasses(
                          item.tone
                        )}`}
                      >
                        {item.icon}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold leading-snug">{item.label}</div>
                      {item.description && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 truncate">
                          {item.description}
                        </div>
                      )}
                    </div>
                    {item.badge !== undefined && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
