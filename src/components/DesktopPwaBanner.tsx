import React, { useState, useEffect } from 'react';
import { Monitor, X, ExternalLink } from 'lucide-react';

interface DesktopPwaBannerProps {
  onOpenInstallModal: () => void;
}

export const DesktopPwaBanner: React.FC<DesktopPwaBannerProps> = ({ onOpenInstallModal }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only show on desktop (not mobile) and only when NOT running in standalone window
    const isDesktop = typeof window !== 'undefined' && !/android|iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
    const isDismissed = localStorage.getItem('wms_dismiss_desktop_pwa_banner') === 'true';

    if (isDesktop && !isStandalone && !isDismissed) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const handleDismiss = () => {
    setShow(false);
    try {
      localStorage.setItem('wms_dismiss_desktop_pwa_banner', 'true');
    } catch {}
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white px-3 py-2 text-xs flex items-center justify-between border-b border-indigo-500/30 shadow-xs print:hidden">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shrink-0">
          <Monitor className="w-3.5 h-3.5" />
        </div>
        <div className="truncate">
          <span className="font-bold text-indigo-200">Tips Tampilan PC:</span>{' '}
          <span className="text-slate-300">
            Ingin Warehouse Mini tampil penuh sebagai jendela aplikasi desktop tanpa tab & bilah URL browser?
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <button
          type="button"
          onClick={onOpenInstallModal}
          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
        >
          <span>Buka Mode Aplikasi</span>
          <ExternalLink className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          title="Tutup pemberitahuan ini"
          className="p-1 text-slate-400 hover:text-white rounded-md transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
