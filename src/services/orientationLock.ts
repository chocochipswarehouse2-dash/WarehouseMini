/**
 * Screen Orientation Service for WMS
 *
 * Uses standard non-intrusive Screen Orientation API ('portrait-primary' / 'portrait')
 * paired with `/manifest-portrait.json` (`"orientation": "portrait"`).
 * Never triggers HTML5 Fullscreen (`requestFullscreen`) and never blocks touch swiping/scrolling.
 */

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isMobilePhoneDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isPhoneUA =
    /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) &&
    !/iPad|Tablet/i.test(ua);
  const shortestScreen = window.screen
    ? Math.min(window.screen.width || 9999, window.screen.height || 9999)
    : 9999;
  const shortestInner = Math.min(window.innerWidth || 9999, window.innerHeight || 9999);
  return (isPhoneUA || shortestScreen < 600) && shortestInner < 600;
}

export async function lockOrientationToPortrait(): Promise<boolean> {
  // Screen orientation lock is prohibited and throws SecurityError inside iframes
  if (typeof window === 'undefined' || isRunningInIframe() || !isMobilePhoneDevice()) return false;

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
        try {
          await orientation.lock('portrait');
          return true;
        } catch {
          return false;
        }
      }
    }

    const legacyLock =
      (window.screen as any)?.lockOrientation ||
      (window.screen as any)?.mozLockOrientation ||
      (window.screen as any)?.msLockOrientation;

    if (typeof legacyLock === 'function') {
      return Boolean(
        legacyLock.call(window.screen, 'portrait-primary') ||
          legacyLock.call(window.screen, 'portrait')
      );
    }
  } catch {
    // Ignore when browser does not allow orientation.lock in regular tab or iframe
  }
  return false;
}

export async function lockOrientationWithFullscreen(): Promise<boolean> {
  return lockOrientationToPortrait();
}

export function unlockOrientation(): boolean {
  if (typeof window === 'undefined' || isRunningInIframe()) return false;
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

  void lockOrientationToPortrait();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void lockOrientationToPortrait();
    }
  });
}
