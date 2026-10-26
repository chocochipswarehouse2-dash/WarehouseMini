export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('Browser does not support notifications.');
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    await registerBackgroundOrderSync();
    return 'granted';
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await registerBackgroundOrderSync();
    }
    return permission;
  }
  return Notification.permission;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermissionStatus(): NotificationPermission {
  if (!isNotificationSupported()) {
    return 'denied';
  }
  return Notification.permission;
}

const NOTIFIED_IDS_STORAGE_KEY = 'wms_notified_order_ids_v1';
const LAST_CHECK_TS_STORAGE_KEY = 'wms_last_order_check_ts_v1';

export function loadPersistedNotifiedOrderIds(): string[] {
  try {
    const raw = localStorage.getItem(NOTIFIED_IDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function savePersistedNotifiedOrderIds(ids: Iterable<string>): void {
  try {
    const arr = Array.from(new Set(Array.from(ids).filter(Boolean))).slice(-350);
    localStorage.setItem(NOTIFIED_IDS_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // ignore storage quota errors
  }
}

export function getLastOrderCheckTimestamp(): number | null {
  try {
    const raw = localStorage.getItem(LAST_CHECK_TS_STORAGE_KEY);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

export function setLastOrderCheckTimestamp(ts: number = Date.now()): void {
  try {
    localStorage.setItem(LAST_CHECK_TS_STORAGE_KEY, String(ts));
  } catch {
    // ignore
  }
}

/**
 * Registers Periodic Background Sync & Background Sync on supported PWA browsers (Chrome/Edge Android & Desktop)
 */
export async function registerBackgroundOrderSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    // 1. Periodic Background Sync (fires periodically even when PWA window is closed on Android/Desktop PWA)
    if ('periodicSync' in registration) {
      try {
        const status = await (navigator as any).permissions?.query?.({
          name: 'periodic-background-sync',
        });
        if (!status || status.state === 'granted') {
          await (registration as any).periodicSync.register('wms-order-sync', {
            minInterval: 60 * 1000, // 1 minute minimum interval request
          });
        }
      } catch {
        // Fallback direct attempt
        try {
          await (registration as any).periodicSync.register('wms-order-sync', {
            minInterval: 60 * 1000,
          });
        } catch {}
      }
    }

    // 2. One-off Background Sync
    if ('sync' in registration) {
      try {
        await (registration as any).sync.register('wms-order-sync');
      } catch {}
    }
  } catch {}
}

/**
 * Configures the Service Worker background watcher with Supabase credentials and role info
 */
export async function configureServiceWorkerOrderWatcher(params: {
  enabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  isAdmin: boolean;
  storeName?: string;
  username?: string;
  notifiedIds?: string[];
  lastCheckedAt?: number;
}): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await registerBackgroundOrderSync();
    const registration = await navigator.serviceWorker.ready;
    const targetSw = navigator.serviceWorker.controller || registration.active;
    if (targetSw) {
      targetSw.postMessage({
        type: 'WMS_CONFIGURE_SW_WATCHER',
        ...params,
      });
    }
  } catch {}
}

export async function syncNotifiedOrdersToServiceWorker(notifiedIds: string[]): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const targetSw = navigator.serviceWorker.controller || registration.active;
    if (targetSw) {
      targetSw.postMessage({
        type: 'WMS_SYNC_NOTIFIED_ORDERS',
        notifiedIds,
      });
    }
  } catch {}
}

export async function showPushNotification(
  title: string,
  options?: NotificationOptions & { url?: string; page?: string }
) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    await requestNotificationPermission();
  }

  if (Notification.permission !== 'granted') return;

  const defaultOptions: any = {
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [250, 100, 250, 100, 400],
    tag: options?.tag || 'wms-notification-' + Date.now(),
    renotify: true,
    requireInteraction: options?.requireInteraction ?? true,
    data: {
      url: options?.url || '/',
      page: options?.page || '',
    },
    ...options,
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && 'showNotification' in registration) {
        await registration.showNotification(title, defaultOptions);
        return;
      }
    }
  } catch (e) {
    console.warn('ServiceWorker notification fallback to regular Notification:', e);
  }

  try {
    const notif = new Notification(title, defaultOptions);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch (e) {
    console.error('Failed to show notification:', e);
  }
}
