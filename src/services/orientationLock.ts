/**
 * Screen Orientation Service for WMS
 *
 * Ensures mobile phones remain locked in Portrait orientation:
 * 1. Attempts direct W3C Screen Orientation API lock ('portrait-primary' / 'portrait').
 * 2. On browsers like Samsung Internet (`SamsungBrowser`) or Android shortcuts that were
 *    installed when the old manifest had `orientation: "any"` (`SCREEN_ORIENTATION_FULL_SENSOR`),
 *    `screen.orientation.lock()` throws `SecurityError` unless `document.fullscreenElement` is active.
 *    When a user gesture occurs (outside of input fields), this service enters Fullscreen and
 *    immediately locks the Android Activity to `SCREEN_ORIENTATION_PORTRAIT`.
 * 3. Never applies CSS `transform: rotate(...)` on `<html>` or `<body>`.
 */

let needsFullscreenForLock = false;

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

function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], label'
    )
  );
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
        needsFullscreenForLock = false;
        return true;
      } catch {
        try {
          await orientation.lock('portrait');
          needsFullscreenForLock = false;
          return true;
        } catch {
          needsFullscreenForLock = true;
        }
      }
    }

    const legacyLock =
      (window.screen as any)?.lockOrientation ||
      (window.screen as any)?.mozLockOrientation ||
      (window.screen as any)?.msLockOrientation;

    if (typeof legacyLock === 'function') {
      const ok = Boolean(
        legacyLock.call(window.screen, 'portrait-primary') ||
          legacyLock.call(window.screen, 'portrait')
      );
      if (ok) needsFullscreenForLock = false;
      return ok;
    }
  } catch {
    needsFullscreenForLock = true;
  }
  return false;
}

export async function lockOrientationWithFullscreen(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!isMobilePhoneDevice()) return false;

  try {
    const docEl: any = document.documentElement;
    const isFullscreen = Boolean(
      document.fullscreenElement || (document as any).webkitFullscreenElement
    );

    if (!isFullscreen && docEl) {
      const reqFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      if (typeof reqFs === 'function') {
        try {
          await reqFs.call(docEl, { navigationUI: 'hide' });
        } catch {
          // Ignore if fullscreen request is blocked
        }
      }
    }
  } catch {
    // Ignore
  }

  return lockOrientationToPortrait();
}

export function unlockOrientation(): boolean {
  if (typeof window === 'undefined') return false;
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
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Ensure any legacy CSS rotation classes/variables are removed
  try {
    const docEl = document.documentElement;
    docEl.classList.remove('wms-force-portrait-landscape');
    docEl.style.removeProperty('--wms-portrait-w');
    docEl.style.removeProperty('--wms-portrait-h');
    docEl.style.removeProperty('--wms-portrait-transform');
    docEl.style.removeProperty('transform');
  } catch {
    // Ignore
  }

  void lockOrientationToPortrait();

  const handleOrientationChange = () => {
    void lockOrientationToPortrait();
  };

  window.addEventListener('orientationchange', handleOrientationChange, { passive: true });
  if (
    window.screen?.orientation &&
    typeof window.screen.orientation.addEventListener === 'function'
  ) {
    window.screen.orientation.addEventListener('change', handleOrientationChange);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void lockOrientationToPortrait();
    }
  });

  const handleUserGesture = (ev: Event) => {
    if (!isMobilePhoneDevice()) return;
    if (isEditableElement(ev.target)) return;

    const isFullscreen = Boolean(
      document.fullscreenElement || (document as any).webkitFullscreenElement
    );
    const isLandscapeNow = window.innerWidth > window.innerHeight;
    const isSamsungBrowser = /SamsungBrowser/i.test(navigator.userAgent || '');

    if (!isFullscreen && (needsFullscreenForLock || isSamsungBrowser || isLandscapeNow)) {
      void lockOrientationWithFullscreen();
    } else {
      void lockOrientationToPortrait();
    }
  };

  window.addEventListener('touchend', handleUserGesture, { passive: true });
  window.addEventListener('pointerup', handleUserGesture, { passive: true });
  window.addEventListener('click', handleUserGesture, { passive: true });
}
