/**
 * Screen Orientation Lock Service for WMS
 * Ensures mobile screens remain in Portrait orientation (upright)
 * during barcode scanning and warehouse operations, preventing accidental
 * flips to landscape mode when the phone is tilted.
 */

export async function lockOrientationToPortrait(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const orientation =
      window.screen?.orientation ||
      (window.screen as any)?.mozOrientation ||
      (window.screen as any)?.msOrientation;

    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('portrait');
      return true;
    }
  } catch {
    // In standard browser tabs, lock() may reject unless in fullscreen or standalone PWA
  }
  return false;
}

/**
 * Force locks to portrait by requesting fullscreen first if required by mobile browsers
 */
export async function lockOrientationWithFullscreen(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const docEl = document.documentElement as any;
    if (!document.fullscreenElement && docEl) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen().catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen().catch(() => {});
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen().catch(() => {});
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen().catch(() => {});
      }
    }

    return await lockOrientationToPortrait();
  } catch (err) {
    console.warn('Orientation lock with fullscreen error:', err);
    return false;
  }
}

/**
 * Automatically attaches listeners to enforce portrait orientation
 */
export function setupOrientationAutoLock() {
  if (typeof window === 'undefined') return;

  const tryLock = () => {
    lockOrientationToPortrait();
  };

  // Immediate attempt
  tryLock();

  // Attempt on first few user gestures (required by browser security models)
  window.addEventListener('touchstart', tryLock, { passive: true, once: false });
  window.addEventListener('pointerdown', tryLock, { passive: true, once: false });
  window.addEventListener('click', tryLock, { passive: true, once: false });

  // When returning from background / tab switch
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tryLock();
    }
  });
  window.addEventListener('focus', tryLock);

  // If orientation changes to landscape, attempt to re-lock to portrait immediately
  if (window.screen?.orientation) {
    window.screen.orientation.addEventListener('change', () => {
      const type = window.screen.orientation.type || '';
      if (type.includes('landscape')) {
        tryLock();
      }
    });
  } else {
    window.addEventListener('orientationchange', tryLock);
  }
}
