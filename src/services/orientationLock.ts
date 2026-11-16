/**
 * Screen Orientation Service for WMS
 *
 * Uses strict 'portrait-primary' via Screen Orientation API (never fallback to
 * 'portrait' / SENSOR_PORTRAIT which triggers accelerometer rotation on some Android ROMs)
 * paired with `/manifest-portrait.json` (`"orientation": "portrait-primary"`).
 * Supports per-device `'follow_os'` mode for Android OEMs whose WindowManager overrides
 * OS portrait lock when a web app calls `screen.orientation.lock()`.
 */

export type OrientationPreference = 'portrait_lock' | 'follow_os';

const ORIENTATION_PREF_KEY = 'wms_orientation_mode';

let autoLockListenersBound = false;

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as any)?.standalone === true
    );
  } catch {
    return false;
  }
}

export function getOrientationPreference(): OrientationPreference {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem(ORIENTATION_PREF_KEY);
      if (saved === 'follow_os' || saved === 'portrait_lock') {
        return saved;
      }
    }
  } catch {}
  return 'portrait_lock';
}

export function isMobilePhoneDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTabletUA =
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua));
  if (isTabletUA) return false;

  const isPhoneUA =
    /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);

  const hasCoarseTouch =
    (navigator.maxTouchPoints || 0) > 0 &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  const shortestScreen = window.screen
    ? Math.min(window.screen.width || 9999, window.screen.height || 9999)
    : 9999;
  const shortestInner = Math.min(window.innerWidth || 9999, window.innerHeight || 9999);

  // Include phones with Desktop Site / Zoom-out / High DPI (shortestScreen < 768 + coarse touch)
  // while keeping Desktop/Laptop (>= 1024 fine pointer) and Tablets out.
  if (isPhoneUA) return shortestScreen < 768 || shortestInner < 768;
  return hasCoarseTouch && shortestScreen < 768 && shortestInner < 1024;
}

export async function lockOrientationToPortrait(): Promise<boolean> {
  // Screen orientation lock is prohibited and throws SecurityError inside iframes
  if (typeof window === 'undefined' || isRunningInIframe() || !isMobilePhoneDevice()) return false;
  if (getOrientationPreference() === 'follow_os') return false;

  try {
    const orientation: any =
      window.screen?.orientation ||
      (window.screen as any)?.mozOrientation ||
      (window.screen as any)?.msOrientation;

    if (orientation && typeof orientation.lock === 'function') {
      try {
        // Use strictly 'portrait-primary' (NOT 'portrait' which activates SENSOR_PORTRAIT on Android!)
        await orientation.lock('portrait-primary');
        return true;
      } catch {
        return false;
      }
    }

    const legacyLock =
      (window.screen as any)?.lockOrientation ||
      (window.screen as any)?.mozLockOrientation ||
      (window.screen as any)?.msLockOrientation;

    if (typeof legacyLock === 'function') {
      return Boolean(legacyLock.call(window.screen, 'portrait-primary'));
    }
  } catch {
    // Ignore when browser does not allow orientation.lock in regular tab or iframe
  }
  return false;
}

export async function lockOrientationWithFullscreen(): Promise<boolean> {
  return lockOrientationToPortrait();
}

export function unlockOrientation(force = false): boolean {
  if (typeof window === 'undefined' || isRunningInIframe()) return false;
  if (!force && isMobilePhoneDevice() && getOrientationPreference() === 'portrait_lock') {
    void lockOrientationToPortrait();
    return false;
  }

  try {
    const orientation =
      window.screen?.orientation ||
      (window.screen as any)?.mozOrientation ||
      (window.screen as any)?.msOrientation;

    if (orientation && typeof orientation.unlock === 'function') {
      orientation.unlock();
      return true;
    }
  } catch {
    // Ignore
  }
  return false;
}

export async function setOrientationPreference(mode: OrientationPreference): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(ORIENTATION_PREF_KEY, mode);
    }
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_orientation_pref_changed', { detail: { mode } }));
  }

  if (mode === 'follow_os') {
    return unlockOrientation(true);
  }
  return lockOrientationToPortrait();
}

export function setupOrientationAutoLock() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || isRunningInIframe()) return;

  try {
    const docEl = document.documentElement;
    docEl.classList.remove('wms-force-portrait-landscape');
    docEl.style.removeProperty('--wms-portrait-w');
    docEl.style.removeProperty('--wms-portrait-h');
    docEl.style.removeProperty('--wms-portrait-transform');
    docEl.style.removeProperty('transform');

    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => {});
    }
  } catch {
    // Ignore
  }

  const applyCurrentMode = () => {
    if (getOrientationPreference() === 'follow_os') {
      unlockOrientation(true);
    } else {
      void lockOrientationToPortrait();
    }
  };

  applyCurrentMode();

  if (autoLockListenersBound) return;
  autoLockListenersBound = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      applyCurrentMode();
    }
  });

  window.addEventListener('focus', () => {
    applyCurrentMode();
  });

  window.addEventListener('orientationchange', () => {
    setTimeout(applyCurrentMode, 80);
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      setTimeout(applyCurrentMode, 80);
    }
  });

  try {
    if (window.screen?.orientation && typeof window.screen.orientation.addEventListener === 'function') {
      window.screen.orientation.addEventListener('change', () => {
        if (
          getOrientationPreference() === 'portrait_lock' &&
          window.screen.orientation.type?.startsWith('landscape')
        ) {
          void lockOrientationToPortrait();
        }
      });
    }
  } catch {}

  // Retry once on first user touch gesture if browser deferred orientation.lock before interaction
  const handleFirstGesture = () => {
    applyCurrentMode();
    window.removeEventListener('pointerdown', handleFirstGesture);
  };
  window.addEventListener('pointerdown', handleFirstGesture, { passive: true });
}
