import React, { useState, useEffect } from 'react';
import { X, Check, Sparkles, Layers, ShieldCheck, Palette, Smartphone, Layout, ArrowRight } from 'lucide-react';
import { LOGO_DESIGNS, getActiveLogoId, setActiveLogoId, LogoDesignOption } from './LogoDesigns';

interface LogoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLogo?: (logoId: string) => void;
}

export const LogoPreviewModal: React.FC<LogoPreviewModalProps> = ({
  isOpen,
  onClose,
  onSelectLogo,
}) => {
  const [selectedId, setSelectedId] = useState<string>(getActiveLogoId);
  const [activeTab, setActiveTab] = useState<'cards' | 'context'>('cards');
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  useEffect(() => {
    const handleChanged = (e: any) => {
      if (e.detail?.logoId) setSelectedId(e.detail.logoId);
    };
    window.addEventListener('wms_logo_changed', handleChanged);
    return () => window.removeEventListener('wms_logo_changed', handleChanged);
  }, []);

  if (!isOpen) return null;

  const handleApplyLogo = (id: string) => {
    setActiveLogoId(id);
    setSelectedId(id);
    if (onSelectLogo) onSelectLogo(id);
  };

  const handleCopyHex = (hex: string) => {
    try {
      navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      setTimeout(() => setCopiedHex(null), 1500);
    } catch {}
  };

  const activeDesign = LOGO_DESIGNS.find((d) => d.id === selectedId) || LOGO_DESIGNS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-amber-50/70 via-rose-50/40 to-slate-50 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-slate-900 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Palette className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Pratinjau Pilihan Logo Aplikasi
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  4 Konsep Desain
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bandingkan filosofi, palet warna, dan terapkan langsung ke seluruh tampilan aplikasi WMS.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('cards')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'cards'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Pilihan Desain
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('context')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'context'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Simulasi Tampilan
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {activeTab === 'cards' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {LOGO_DESIGNS.map((design, idx) => {
                const isSelected = selectedId === design.id;
                return (
                  <div
                    key={design.id}
                    className={`relative rounded-2xl border p-4 sm:p-5 transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-amber-500 dark:border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 dark:bg-amber-950/10 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Top Header Card */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div>
                            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                              {design.name}
                            </h3>
                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                              {design.category}
                            </span>
                          </div>
                        </div>

                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                            <Check className="w-3.5 h-3.5" />
                            <span>Aktif</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">
                            Konsep {idx + 1}
                          </span>
                        )}
                      </div>

                      {/* Visual SVG Showcase Container */}
                      <div className="p-4 rounded-xl bg-slate-900/5 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-center my-3 group">
                        <div className="transition-transform duration-300 group-hover:scale-105 drop-shadow-md">
                          {design.renderSvg(100)}
                        </div>
                      </div>

                      {/* Tagline & Descriptions */}
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {design.tagline}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {design.description}
                      </p>

                      {/* Filosofi Desain */}
                      <div className="mt-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-slate-700 dark:text-slate-200">Filosofi: </span>
                        {design.philosophy}
                      </div>

                      {/* Color Palette Swatches */}
                      <div className="mt-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                          Palet Warna Utama
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {design.palette.map((color) => (
                            <button
                              key={color.hex}
                              type="button"
                              onClick={() => handleCopyHex(color.hex)}
                              title={`Salin ${color.name} (${color.hex})`}
                              className="group flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 hover:border-amber-400 transition-colors"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                                style={{ backgroundColor: color.hex }}
                              />
                              <span className="font-mono text-[9px]">{color.hex}</span>
                            </button>
                          ))}
                          {copiedHex && (
                            <span className="text-[10px] text-emerald-600 font-bold ml-1 animate-pulse">
                              Tersalin!
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Apply Button */}
                    <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {isSelected ? 'Logo sedang digunakan' : 'Klik untuk memilih'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplyLogo(design.id)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            : 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs hover:shadow-amber-500/20'
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Terpilih</span>
                          </>
                        ) : (
                          <>
                            <span>Gunakan Logo Ini</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Context Tab: Real-World Simulation */}
          {activeTab === 'context' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200">
                <span className="font-bold">Simulasi Logo Terpilih: </span>
                Berikut adalah simulasi bagaimana logo <strong>"{activeDesign.name}"</strong> tampil di berbagai titik antarmuka sistem (Header Sidebar, Ikon Ponsel Android, dan Cetak Label).
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Header Desktop Sidebar Simulation */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Layout className="w-4 h-4 text-blue-500" />
                    <span>Header Sidebar Navigasi</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                      {activeDesign.renderSvg(32)}
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">
                        WMS
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-emerald-500 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Live Database</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Mobile App Icon (Squircle) */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Smartphone className="w-4 h-4 text-amber-500" />
                    <span>Ikon Aplikasi HP (Android/iOS)</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center gap-2">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg border border-white/20">
                      {activeDesign.renderSvg(64)}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Warehouse Mini
                    </span>
                  </div>
                </div>

                {/* 3. Cetak thermal / Faktur SPS */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Layers className="w-4 h-4 text-emerald-500" />
                    <span>Cetak Surat Jalan / SPS</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono text-[10px] space-y-2">
                    <div className="flex items-center justify-between border-b pb-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5">{activeDesign.renderSvg(20)}</div>
                        <span className="font-bold text-[11px]">CHOCOCHIPS WAREHOUSE</span>
                      </div>
                      <span>[SPS-2026]</span>
                    </div>
                    <div className="text-[9px] text-slate-500">
                      QC PASSED • PACKED & READY FOR DELIVERY
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>
              Logo aktif saat ini: <strong className="text-slate-900 dark:text-white">{activeDesign.name}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleApplyLogo('classic')}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Kembalikan Logo Klasik
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-xs font-bold transition-colors"
            >
              Selesai
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
