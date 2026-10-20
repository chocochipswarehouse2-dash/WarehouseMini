/**
 * Screen Orientation Service for WMS
 * Allows screen orientation to follow the user's native device Auto-Rotate
 * or Portrait Lock system setting on Android, iOS, Windows, and macOS.
 */

export function unlockOrientation(): boolean {
  if (typeof window === 'undefined') return false;

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
    // Ignore if unlock is not supported in the current browser context
  }
  return false;
}

export async function lockOrientationToPortrait(): Promise<boolean> {
  return unlockOrientation();
}

export async function lockOrientationWithFullscreen(): Promise<boolean> {
  return unlockOrientation();
}

/**
 * Ensures any previous PWA orientation lock is released so the app
 * strictly follows the phone's built-in Auto-Rotate setting.
 */
export function setupOrientationAutoLock() {
  if (typeof window === 'undefined') return;
  unlockOrientation();
}
