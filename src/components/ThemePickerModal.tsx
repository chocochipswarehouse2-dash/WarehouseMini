import React from 'react';
import { X, Sun, Moon, Sparkles } from 'lucide-react';

interface ThemePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
  themeFont?: string;
  setThemeFont?: (font: string) => void;
  themeIconStyle?: string;
  setThemeIconStyle?: (style: string) => void;
}

export const ThemePickerModal: React.FC<ThemePickerModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  onToggleDarkMode,
  themeColor,
  setThemeColor,
  themeFont = 'sans',
  setThemeFont = () => {},
  themeIconStyle = 'regular',
  setThemeIconStyle = () => {},
}) => {
  if (!isOpen) return null;

  const themes = [
    { id: 'rose', name: 'Rose / Pink', colorClass: 'bg-rose-500' },
    { id: 'blue', name: 'Ocean Blue', colorClass: 'bg-blue-500' },
    { id: 'teal', name: 'Teal Forest', colorClass: 'bg-teal-500' },
    { id: 'emerald', name: 'Emerald', colorClass: 'bg-emerald-500' },
    { id: 'purple', name: 'Purple', colorClass: 'bg-purple-500' },
    { id: 'indigo', name: 'Midnight Indigo', colorClass: 'bg-indigo-500' },
    { id: 'orange', name: 'Orange', colorClass: 'bg-orange-500' },
    { id: 'amber', name: 'Amber Sunset', colorClass: 'bg-amber-500' },
    { id: 'grey', name: 'Grey (Monokrom)', colorClass: 'bg-slate-500' },
  ];

  const fonts = [
    { id: 'sans', name: 'Default (Plus Jakarta)', class: 'font-sans' },
    { id: 'rounded', name: 'Rounded (Quicksand)', class: 'font-rounded' },
    { id: 'inter', name: 'Inter (Modern)', class: 'font-inter' },
    { id: 'serif', name: 'Serif (Playfair)', class: 'font-serif' },
    { id: 'mono', name: 'Monospace (Tech)', class: 'font-mono' },
  ];

  const iconStyles = [
    { id: 'light', name: 'Light (Tipis)' },
    { id: 'regular', name: 'Regular (Default)' },
    { id: 'bold', name: 'Bold (Tebal)' },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-500" />
            Sesuaikan Tampilan
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Dark Mode Toggle */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Mode Warna
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => !darkMode && onToggleDarkMode()}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  !darkMode
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <Sun className={`w-4 h-4 ${!darkMode ? 'text-primary-500' : ''}`} />
                Terang
              </button>
              <button
                onClick={() => darkMode && onToggleDarkMode()}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  darkMode
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <Moon className={`w-4 h-4 ${darkMode ? 'text-primary-500' : ''}`} />
                Gelap
              </button>
            </div>
          </div>

          {/* Theme Color Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Warna Aksen
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setThemeColor(theme.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                    themeColor === theme.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full ${theme.colorClass}`}></span>
                  {theme.name}
                </button>
              ))}
            </div>
          </div>
          {/* Font Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Jenis Huruf (Font)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {fonts.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => setThemeFont(font.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border cursor-pointer transition-all ${
                    themeFont === font.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm font-bold'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 font-medium'
                  } ${font.class}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${themeFont === font.id ? 'bg-primary-500' : 'bg-transparent'}`}></span>
                  <span className="truncate">{font.name}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Icon Style Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Gaya Ikon (Icon Pack)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {iconStyles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setThemeIconStyle(style.id)}
                  className={`flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs border cursor-pointer transition-all ${
                    themeIconStyle === style.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 ${themeIconStyle === style.id ? 'text-primary-500' : ''}`} style={{ strokeWidth: style.id === 'light' ? 1.25 : style.id === 'bold' ? 2.75 : 2 }} />
                  <span className="hidden sm:inline">{style.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
