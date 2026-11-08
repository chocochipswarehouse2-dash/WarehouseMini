import React from 'react';
import { X, Sun, Moon, Sparkles } from 'lucide-react';

interface ThemePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  setDarkMode?: (dark: boolean) => void;
  onToggleDarkMode?: () => void;
  darkVariant?: string;
  setDarkVariant?: (variant: string) => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
  themeFont?: string;
  setThemeFont?: (font: string) => void;
  themeFontSize?: string;
  setThemeFontSize?: (size: string) => void;
  themeIconStyle?: string;
  setThemeIconStyle?: (style: string) => void;
}

export const DARK_MODE_VARIANTS = [
  {
    id: 'soft',
    name: 'Soft Charcoal',
    desc: 'Abu Lembut (Default)',
    canvas: '#22252a',
    surface: '#282c33',
    card: '#30353e',
  },
  {
    id: 'dim',
    name: 'Twilight Dim',
    desc: 'Paling Terang & Kalem',
    canvas: '#2a3038',
    surface: '#313842',
    card: '#3a424e',
  },
  {
    id: 'warm',
    name: 'Warm Stone',
    desc: 'Hangat (Bebas Biru)',
    canvas: '#252220',
    surface: '#2d2926',
    card: '#36312d',
  },
  {
    id: 'sage',
    name: 'Sage Mist',
    desc: 'Hijau Abu Sejuk',
    canvas: '#212826',
    surface: '#28312e',
    card: '#303b37',
  },
  {
    id: 'zinc',
    name: 'Modern Zinc',
    desc: 'Monokrom Netral',
    canvas: '#18181b',
    surface: '#202024',
    card: '#27272a',
  },
];

export const ThemePickerModal: React.FC<ThemePickerModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  setDarkMode,
  onToggleDarkMode = () => {},
  darkVariant = 'soft',
  setDarkVariant = () => {},
  themeColor,
  setThemeColor,
  themeFont = 'sans',
  setThemeFont = () => {},
  themeFontSize = 'normal',
  setThemeFontSize = () => {},
  themeIconStyle = 'regular',
  setThemeIconStyle = () => {},
}) => {
  if (!isOpen) return null;

  const themes = [
    { id: 'rose', name: 'Rose / Pink', colorClass: 'bg-rose-500' },
    { id: 'pink', name: 'Pastel Pink', colorClass: 'bg-pink-400' },
    { id: 'fuchsia', name: 'Fuchsia', colorClass: 'bg-fuchsia-400' },
    { id: 'purple', name: 'Purple', colorClass: 'bg-purple-500' },
    { id: 'indigo', name: 'Midnight Indigo', colorClass: 'bg-indigo-500' },
    { id: 'blue', name: 'Ocean Blue', colorClass: 'bg-blue-500' },
    { id: 'sky', name: 'Pastel Sky', colorClass: 'bg-sky-400' },
    { id: 'cyan', name: 'Pastel Cyan', colorClass: 'bg-cyan-400' },
    { id: 'teal', name: 'Teal Forest', colorClass: 'bg-teal-500' },
    { id: 'emerald', name: 'Emerald', colorClass: 'bg-emerald-500' },
    { id: 'lime', name: 'Pastel Lime', colorClass: 'bg-lime-400' },
    { id: 'orange', name: 'Orange', colorClass: 'bg-orange-500' },
    { id: 'amber', name: 'Amber Sunset', colorClass: 'bg-amber-500' },
    { id: 'grey', name: 'Grey (Monokrom)', colorClass: 'bg-slate-500' },
  ];

  const fonts = [
    { id: 'sans', name: 'Default (Plus Jakarta)', class: 'font-sans' },
    { id: 'ios', name: 'iPhone (SF Pro)', class: 'font-ios' },
    { id: 'samsung', name: 'Samsung Sans', class: 'font-samsung' },
    { id: 'inter', name: 'Inter (Modern)', class: 'font-inter' },
    { id: 'rounded', name: 'Rounded (Quicksand)', class: 'font-rounded' },
    { id: 'serif', name: 'Serif (Playfair)', class: 'font-serif' },
    { id: 'mono', name: 'Monospace (Tech)', class: 'font-mono' },
  ];

  const iconStyles = [
    { id: 'light', name: 'Light', desc: 'Tipis (1.25px)', strokeWidth: 1.25 },
    { id: 'regular', name: 'Regular', desc: 'Standar (2.0px)', strokeWidth: 2 },
    { id: 'bold', name: 'Bold', desc: 'Tebal (2.75px)', strokeWidth: 2.75 },
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
                type="button"
                onClick={() => {
                  if (setDarkMode) setDarkMode(false);
                  else if (darkMode && onToggleDarkMode) onToggleDarkMode();
                }}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  !darkMode
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/20 shadow-xs font-black'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <Sun className={`w-4 h-4 ${!darkMode ? 'text-primary-500' : ''}`} />
                <span>Terang (Light)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (setDarkMode) setDarkMode(true);
                  else if (!darkMode && onToggleDarkMode) onToggleDarkMode();
                }}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  darkMode
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/20 shadow-xs font-black'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <Moon className={`w-4 h-4 ${darkMode ? 'text-primary-500' : ''}`} />
                <span>Gelap (Dark)</span>
              </button>
            </div>

            {/* Varian Dark Mode (5 Versi Lebih Light & Bebas Navy) */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Varian Mode Gelap (Lebih Terang & Kalem)
                </span>
                <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400">
                  {DARK_MODE_VARIANTS.find((v) => v.id === darkVariant)?.name || 'Soft Charcoal'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DARK_MODE_VARIANTS.map((v) => {
                  const isSelected = darkMode && darkVariant === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setDarkVariant(v.id);
                        if (!darkMode) {
                          if (setDarkMode) setDarkMode(true);
                          else onToggleDarkMode();
                        }
                      }}
                      className={`flex items-center gap-2.5 p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-2 ring-primary-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-lg shrink-0 border border-white/15 shadow-inner flex overflow-hidden"
                        title={`${v.name} — ${v.desc}`}
                      >
                        <span className="flex-1 h-full" style={{ backgroundColor: v.canvas }} />
                        <span className="flex-1 h-full" style={{ backgroundColor: v.card }} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold leading-tight truncate">{v.name}</div>
                        <div className="text-[9px] text-slate-400 font-normal leading-tight truncate mt-0.5">{v.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Theme Color Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Warna Aksen
            </label>
            <div className="grid grid-cols-3 gap-2">
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

          {/* Font Size & UI Scale Selection */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Ukuran Teks & Skala Halaman
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'compact', label: 'Ringkas', desc: 'PDA / Padat', iconClass: 'text-[11px]' },
                { id: 'normal', label: 'Standar', desc: 'Default WMS', iconClass: 'text-xs' },
                { id: 'large', label: 'Besar', desc: 'Nyaman / Lega', iconClass: 'text-sm' },
              ].map((sizeOpt) => (
                <button
                  key={sizeOpt.id}
                  type="button"
                  onClick={() => setThemeFontSize(sizeOpt.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs border cursor-pointer transition-all ${
                    themeFontSize === sizeOpt.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <span className={`font-black uppercase tracking-wider mb-0.5 ${sizeOpt.iconClass}`}>Aa</span>
                  <span className="font-bold text-[11px]">{sizeOpt.label}</span>
                  <span className="text-[9px] text-slate-400 font-normal">{sizeOpt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Icon Style Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Ketebalan Ikon (Icon Weight)
              </label>
              <span className="text-[10px] text-primary-600 dark:text-primary-400 font-semibold">
                {iconStyles.find((s) => s.id === themeIconStyle)?.name || 'Regular'} ({iconStyles.find((s) => s.id === themeIconStyle)?.desc || ''})
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {iconStyles.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    document.documentElement.setAttribute('data-theme-icon', style.id);
                    try { localStorage.setItem('wms_theme_icon', style.id); } catch {}
                    setThemeIconStyle(style.id);
                  }}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl text-xs border cursor-pointer transition-all ${
                    themeIconStyle === style.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold shadow-sm ring-1 ring-primary-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Sparkles
                    className={`w-4 h-4 mb-1 ${
                      themeIconStyle === style.id ? 'text-primary-500' : 'text-slate-500 dark:text-slate-400'
                    }`}
                    style={{ strokeWidth: style.strokeWidth }}
                  />
                  <span className="font-bold text-[11px] leading-tight">{style.name}</span>
                  <span className="text-[9px] text-slate-400 font-normal leading-tight mt-0.5">{style.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
