export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIpadOs = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  return /iPhone|iPad|iPod/i.test(ua) || isIpadOs;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as any).standalone === true
    );
  } catch {
    return false;
  }
}

/** iPhone/iPad hanya mendukung notifikasi jika web app sudah ditambahkan ke Layar Utama (iOS 16.4+) */
export function needsIosHomeScreenInstall(): boolean {
  return isIosDevice() && !isStandalonePwa();
}

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

async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/pwa-extras.js', { scope: '/' }).catch(() => undefined);
    }
    if (reg && (reg.active || reg.waiting || reg.installing)) {
      if (reg.active) return reg;
    }
    // Wait up to 2500ms for serviceWorker.ready so it never hangs indefinitely
    const readyReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    return readyReg || reg || null;
  } catch {
    return null;
  }
}

/**
 * Registers Periodic Background Sync & Background Sync on supported PWA browsers (Chrome/Edge Android & Desktop)
 */
export async function registerBackgroundOrderSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await getActiveServiceWorkerRegistration();
    if (!registration) return;
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
  isPicker?: boolean;
  isWarehouseOnly?: boolean;
  canProduksi?: boolean;
  isCustomerService?: boolean;
  storeName?: string;
  username?: string;
  displayName?: string;
  userRole?: string;
  notifiedIds?: string[];
  lastCheckedAt?: number;
}): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await registerBackgroundOrderSync();
    const registration = await getActiveServiceWorkerRegistration();
    const targetSw =
      navigator.serviceWorker.controller ||
      registration?.active ||
      registration?.waiting ||
      registration?.installing;
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
    const registration = await getActiveServiceWorkerRegistration();
    const targetSw =
      navigator.serviceWorker.controller ||
      registration?.active ||
      registration?.waiting;
    if (targetSw) {
      targetSw.postMessage({
        type: 'WMS_SYNC_NOTIFIED_ORDERS',
        notifiedIds,
      });
    }
  } catch {}
}

export async function triggerServiceWorkerCheckNow(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await getActiveServiceWorkerRegistration();
    const targetSw = navigator.serviceWorker.controller || registration?.active;
    if (targetSw) {
      targetSw.postMessage({ type: 'WMS_CHECK_ORDERS_NOW' });
    }
  } catch {}
}

export async function showPushNotification(
  title: string,
  options?: NotificationOptions & {
    url?: string;
    page?: string;
    subTab?: string;
    manualSubTab?: string;
    orderId?: string;
    isAlter?: boolean;
    hrSection?: string;
    produksiTab?: string;
    kodeProduksi?: string;
    roomId?: string;
    roomName?: string;
    actions?: Array<{
      action: string;
      title: string;
      type?: string;
      placeholder?: string;
    }>;
  }
) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    await requestNotificationPermission();
  }

  if (Notification.permission !== 'granted') return;

  const mergedData = {
    url: options?.url || '/',
    page: options?.page || '',
    subTab: options?.subTab || '',
    manualSubTab: options?.manualSubTab || '',
    orderId: options?.orderId || '',
    isAlter: Boolean(options?.isAlter),
    hrSection: options?.hrSection || '',
    produksiTab: options?.produksiTab || '',
    kodeProduksi: options?.kodeProduksi || '',
    roomId: options?.roomId || '',
    roomName: options?.roomName || '',
    ...(options?.data && typeof options.data === 'object' ? options.data : {}),
  };

  const defaultOptions: any = {
    ...options,
    icon: options?.icon || '/icon-192.png',
    badge: options?.badge || '/icon-192.png',
    vibrate: (options as any)?.vibrate || [250, 100, 250, 100, 400],
    tag: options?.tag || 'wms-notification-' + Date.now(),
    renotify: true,
    requireInteraction: options?.requireInteraction ?? true,
    data: mergedData,
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await getActiveServiceWorkerRegistration();
      if (registration && 'showNotification' in registration) {
        try {
          await registration.showNotification(title, defaultOptions);
          return;
        } catch {
          // Fallback 1: If browser rejects `type: 'text'` inline reply action, retry with button actions only
          if (Array.isArray(defaultOptions.actions) && defaultOptions.actions.length > 0) {
            try {
              const buttonOnlyOptions = {
                ...defaultOptions,
                actions: defaultOptions.actions.map((a: any) => ({
                  action: a.action,
                  title: a.title,
                })),
              };
              await registration.showNotification(title, buttonOnlyOptions);
              return;
            } catch {
              // Fallback 2: Retry without `actions` property
              const noActionsOptions = { ...defaultOptions };
              delete noActionsOptions.actions;
              await registration.showNotification(title, noActionsOptions);
              return;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('ServiceWorker notification fallback to regular Notification:', e);
  }

  try {
    const cleanOptions = { ...defaultOptions };
    delete cleanOptions.actions;
    const notif = new Notification(title, cleanOptions);
    notif.onclick = () => {
      window.focus();
      if (mergedData.page || mergedData.roomId || mergedData.orderId) {
        window.dispatchEvent(
          new CustomEvent('wms_inapp_notification_click', {
            detail: mergedData,
          })
        );
      }
      notif.close();
    };
  } catch (e) {
    console.warn('Failed to show notification:', e);
  }
}
