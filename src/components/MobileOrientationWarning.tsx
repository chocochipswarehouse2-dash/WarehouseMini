import React, { useEffect, useState } from 'react';
import { Smartphone, Lock, X } from 'lucide-react';
import { lockOrientationWithFullscreen } from '../services/orientationLock';

export const MobileOrientationWarning: React.FC = () => {
  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkOrientation = () => {
      // Mobile phone in landscape: height is short (typically < 500px) and width > height
      const isLandscape = window.innerWidth > window.innerHeight;
      const isMobileHeight = window.innerHeight <= 520;
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

      const matches = isLandscape && isMobileHeight && isTouch;
      setIsLandscapeMobile(matches);
      if (!matches) {
        setDismissed(false); // Reset dismissal once returned to portrait
      }
    };

    checkOrientation();

    window.addEventListener('resize', checkOrientation);
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', checkOrientation);
    } else {
      window.addEventListener('orientationchange', checkOrientation);
    }

    return () => {
      window.removeEventListener('resize', checkOrientation);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', checkOrientation);
      } else {
        window.removeEventListener('orientationchange', checkOrientation);
      }
    };
  }, []);

  if (!isLandscapeMobile || dismissed) return null;

  const handleLock = async () => {
    const success = await lockOrientationWithFullscreen();
    if (success) {
      setDismissed(true);
    }
  };

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] max-w-[94vw] w-auto animate-in fade-in slide-in-from-top-3 duration-200">
      <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white backdrop-blur-md px-3.5 py-2 rounded-2xl border border-amber-500/40 shadow-2xl flex items-center gap-2.5 text-xs">
        <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
          <Smartphone className="w-3.5 h-3.5 rotate-90" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[11px] text-amber-200 truncate">
            Posisi Layar Miring (Lanskap)
          </span>
          <button
            type="button"
            onClick={handleLock}
            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black rounded-lg text-[10px] flex items-center gap-1 transition-all cursor-pointer shadow-sm"
          >
            <Lock className="w-3 h-3 stroke-[2.5]" />
            <span>Kunci Tegak (Portrait)</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          title="Tutup"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
