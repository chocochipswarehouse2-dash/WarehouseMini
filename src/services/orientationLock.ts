/**
 * Screen Orientation Service for WMS
 *
 * Implements a 3-layer defense against unwanted auto-rotation on mobile phones:
 * 1. Manifest orientation: 'portrait-primary' in /manifest.json
 * 2. Runtime Screen Orientation API lock ('portrait-primary' / 'portrait') triggered
 *    on valid user activation events (touchend, pointerup, click) and lifecycle resume.
 * 3. Instant CSS/JS Viewport Counter-Rotation fallback: If an already-installed
 *    Android WebAPK (compiled previously with `orientation: "any"` -> `fullSensor`)
 *    or mobile browser ignores `screen.orientation.lock` and rotates the viewport
 *    into landscape (`innerWidth > innerHeight`), `html` is immediately counter-rotated
 *    (-90deg or +90deg matching the physical top of the phone) so the UI remains
 *    strictly upright in Portrait on the physical device screen.
 */

export function isMobilePhoneDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isPhoneUA = /Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua);
  const shortestScreen = window.screen
    ? Math.min(window.screen.width || 9999, window.screen.height || 9999)
    : 9999;
  const shortestInner = Math.min(window.innerWidth || 9999, window.innerHeight || 9999);
  return (isPhoneUA || shortestScreen < 600) && shortestInner < 600;
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
      return Boolean(
        legacyLock.call(window.screen, 'portrait-primary') ||
          legacyLock.call(window.screen, 'portrait')
      );
    }
  } catch {
    // Browser may reject lock() before user gesture or outside standalone/fullscreen mode
  }
  return false;
}

export function syncPortraitViewportFallback(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const docEl = document.documentElement;
  if (!docEl) return;

  if (!isMobilePhoneDevice()) {
    docEl.classList.remove('wms-force-portrait-landscape');
    docEl.style.removeProperty('--wms-portrait-w');
    docEl.style.removeProperty('--wms-portrait-h');
    docEl.style.removeProperty('--wms-portrait-transform');
    return;
  }

  const w = window.innerWidth;
  const h = window.innerHeight;

  if (w > h) {
    const rawAngle =
      typeof window.screen?.orientation?.angle === 'number'
        ? window.screen.orientation.angle
        : typeof (window as any).orientation === 'number'
          ? (window as any).orientation
          : 90;
    const normAngle = ((Number(rawAngle) % 360) + 360) % 360;
    const transformVal =
      normAngle === 270
        ? 'rotate(90deg) translateY(-100%)'
        : 'rotate(-90deg) translateX(-100%)';

    docEl.style.setProperty('--wms-portrait-w', `${h}px`);
    docEl.style.setProperty('--wms-portrait-h', `${w}px`);
    docEl.style.setProperty('--wms-portrait-transform', transformVal);
    docEl.classList.add('wms-force-portrait-landscape');
  } else {
    docEl.classList.remove('wms-force-portrait-landscape');
    docEl.style.removeProperty('--wms-portrait-w');
    docEl.style.removeProperty('--wms-portrait-h');
    docEl.style.removeProperty('--wms-portrait-transform');
  }
}

export function unlockOrientation(): boolean {
  if (typeof window === 'undefined') return false;
  if (isMobilePhoneDevice()) {
    void lockOrientationToPortrait();
    syncPortraitViewportFallback();
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

export function setupOrientationAutoLock() {
  if (typeof window === 'undefined') return;

  const applyAll = () => {
    void lockOrientationToPortrait();
    syncPortraitViewportFallback();
  };

  applyAll();

  const handleOrientationChange = () => {
    applyAll();
    setTimeout(applyAll, 60);
    setTimeout(applyAll, 200);
  };

  window.addEventListener('resize', syncPortraitViewportFallback, { passive: true });
  window.addEventListener('orientationchange', handleOrientationChange, { passive: true });
  if (
    window.screen?.orientation &&
    typeof window.screen.orientation.addEventListener === 'function'
  ) {
    window.screen.orientation.addEventListener('change', handleOrientationChange);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      applyAll();
    }
  });
  window.addEventListener('focus', applyAll, { passive: true });
  window.addEventListener('pageshow', applyAll, { passive: true });

  // Valid transient user activation events for Chromium's ScreenOrientationProvider
  const handleUserGesture = () => {
    void lockOrientationToPortrait();
  };
  window.addEventListener('touchend', handleUserGesture, { passive: true });
  window.addEventListener('pointerup', handleUserGesture, { passive: true });
  window.addEventListener('click', handleUserGesture, { passive: true });
}
