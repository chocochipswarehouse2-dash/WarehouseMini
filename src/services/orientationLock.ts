/**
 * Screen Orientation Service for WMS
 * Locks screen orientation to Portrait on mobile phones / installed PWAs
 * so Android WebAPK does not override the device's system Portrait Lock setting,
 * while keeping Windows & macOS desktop layouts unaffected.
 */

function isMobilePhoneDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isPhoneUA = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const shortestSide = window.screen
    ? Math.min(window.screen.width || 9999, window.screen.height || 9999)
    : 9999;
  return isPhoneUA || shortestSide < 768;
}

export async function lockOrientationToPortrait(): Promise<boolean> {
  if (typeof window === 'undefined' || !isMobilePhoneDevice()) return false;

  try {
    const orientation: any =
      window.screen?.orientation ||
      (window.screen as any)?.mozOrientation ||
      (window.screen as any)?.msOrientation;

    if (orientation && typeof orientation.lock === 'function') {
      try {
        await orientation.lock('portrait-primary');
        return true;
      } catch {
        await orientation.lock('portrait');
        return true;
      }
    }

    const legacyLock =
      (window.screen as any)?.lockOrientation ||
      (window.screen as any)?.mozLockOrientation ||
      (window.screen as any)?.msLockOrientation;

    if (typeof legacyLock === 'function') {
      return Boolean(legacyLock.call(window.screen, 'portrait-primary') || legacyLock.call(window.screen, 'portrait'));
    }
  } catch {
    // Ignore errors on browsers that restrict orientation.lock outside standalone/fullscreen mode
  }
  return false;
}

export function unlockOrientation(): boolean {
  if (typeof window === 'undefined') return false;
  // On mobile phones, never call orientation.unlock() because WebAPK manifests
  // with cached 'any' orientation will revert to FULL_SENSOR and ignore system portrait lock.
  if (isMobilePhoneDevice()) {
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

export async function lockOrientationWithFullscreen(): Promise<boolean> {
  return lockOrientationToPortrait();
}

/**
 * Enforces portrait orientation lock on mobile devices across app launch,
 * tab focus/resume, and user interactions so the app never auto-rotates
 * when the phone is locked to portrait.
 */
export function setupOrientationAutoLock() {
  if (typeof window === 'undefined' || !isMobilePhoneDevice()) return;

  const applyLock = () => {
    void lockOrientationToPortrait();
  };

  applyLock();

  // Re-apply when returning to the PWA from background (Android WebAPK Activity resume)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      applyLock();
    }
  });
  window.addEventListener('focus', applyLock, { passive: true });
  window.addEventListener('pageshow', applyLock, { passive: true });
  window.addEventListener('orientationchange', applyLock, { passive: true });

  // Also attempt lock on first user interaction in case browser requires gesture
  const onFirstInteraction = () => {
    applyLock();
  };
  window.addEventListener('touchstart', onFirstInteraction, { once: true, passive: true });
  window.addEventListener('click', onFirstInteraction, { once: true, passive: true });
}
