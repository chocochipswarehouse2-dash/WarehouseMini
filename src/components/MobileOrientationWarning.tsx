import React, { useEffect, useState } from 'react';
import { Smartphone, Lock } from 'lucide-react';
import {
  isMobilePhoneDevice,
  lockOrientationToPortrait,
  lockOrientationWithFullscreen,
} from '../services/orientationLock';

/**
 * Shown ONLY if a mobile phone's OS/WebAPK rotates into landscape BEFORE the user
 * has tapped the screen once (e.g. when launched from an old Home Screen shortcut
 * created before the manifest was updated to portrait).
 * A single tap anywhere on the overlay immediately activates the native Portrait Lock
 * and snaps the Android Activity back to Portrait.
 */
export const MobileOrientationWarning: React.FC = () => {
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      if (!isMobilePhoneDevice()) {
        setIsMobileLandscape(false);
        return;
      }

      // Do not trigger if an input/textarea is focused (virtual keyboard open in portrait)
      const activeEl = document.activeElement;
      const isEditing =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable);

      if (isEditing) {
        setIsMobileLandscape(false);
        return;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;
      const landscape = w > h && h < 520;
      setIsMobileLandscape(landscape);

      if (landscape) {
        void lockOrientationToPortrait();
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation, { passive: true });
    window.addEventListener('orientationchange', checkOrientation, { passive: true });
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isMobileLandscape) return null;

  const handleLockPortraitNow = async () => {
    await lockOrientationWithFullscreen();
    setTimeout(() => {
      if (window.innerWidth <= window.innerHeight) {
        setIsMobileLandscape(false);
      }
    }, 150);
  };

  return (
    <div
      onClick={handleLockPortraitNow}
      onTouchEnd={handleLockPortraitNow}
      className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white select-none cursor-pointer print:hidden"
    >
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
          <Smartphone className="w-6 h-6" />
        </div>
        <h3 className="text-base font-extrabold tracking-tight text-white">
          Mode Potret Terkunci
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Ketuk layar <b>1 kali di mana saja</b> untuk mengunci layar ke <b>Mode Potret (Tegak)</b> secara otomatis.
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleLockPortraitNow();
          }}
          className="mt-1 w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
        >
          <Lock className="w-4 h-4" />
          <span>Kunci Layar ke Potret Sekarang</span>
        </button>
        <p className="text-[11px] text-slate-400 leading-snug pt-1">
          Tips: Jika Anda membuka dari ikon Home Screen lama, hapus ikon lama lalu tambahkan ulang ke Home Screen agar sistem Android memperbarui kunci orientasi.
        </p>
      </div>
    </div>
  );
};
