// Screen Wake Lock API service to keep mobile screen awake during scanning

let wakeLockSentinel: WakeLockSentinel | null = null;
let isWakeLockRequested = false;

export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }

  try {
    isWakeLockRequested = true;
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    
    return true;
  } catch (err) {
    console.warn('Wake Lock error:', err);
    return false;
  }
}

export async function releaseScreenWakeLock(): Promise<void> {
  isWakeLockRequested = false;
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    } catch {
      // ignore
    }
  }
}

// Auto re-acquire wake lock when tab visibility changes back to visible
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && isWakeLockRequested && !wakeLockSentinel) {
      await requestScreenWakeLock();
    }
  });
}
