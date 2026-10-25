// Push Notification & Local Alert Service
import { isRunningInIframe } from './orientationLock';
import { ActivePage } from '../types';

const NOTIF_ENABLED_KEY = 'wms_push_notif_enabled';

export function isPushNotificationEnabled(): boolean {
  try {
    const saved = localStorage.getItem(NOTIF_ENABLED_KEY);
    if (saved !== null) return saved === 'true';
  } catch {}
  return true;
}

export function setPushNotificationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIF_ENABLED_KEY, String(enabled));
  } catch {}
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isRunningInIframe() || typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  try {
    if (Notification.permission === 'granted') {
      setPushNotificationEnabled(true);
      return 'granted';
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setPushNotificationEnabled(true);
    }
    return permission;
  } catch {
    return 'denied';
  }
}

export function isNotificationSupported(): boolean {
  if (isRunningInIframe()) return false;
  try {
    return typeof window !== 'undefined' && 'Notification' in window;
  } catch {
    return false;
  }
}

export function getNotificationPermissionStatus(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  try {
    return Notification.permission;
  } catch {
    return 'denied';
  }
}

export interface PushNotificationOptions {
  body?: string;
  icon?: string;
  tag?: string;
  page?: ActivePage;
  url?: string;
  requireInteraction?: boolean;
}

export async function showPushNotification(
  title: string,
  options?: PushNotificationOptions
): Promise<boolean> {
  if (!isNotificationSupported() || !isPushNotificationEnabled()) return false;

  try {
    if (Notification.permission !== 'granted') {
      return false;
    }

    const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    const defaultIcon = `${baseUrl}/icon-192.png`;
    const uniqueTag = options?.tag || `wms-notif-${Date.now()}`;
    const targetUrl = options?.url || `${baseUrl}/`;

    const swOptions: any = {
      body: options?.body || 'Aktivitas baru di Warehouse Mini',
      icon: options?.icon || defaultIcon,
      badge: defaultIcon,
      tag: uniqueTag,
      renotify: true,
      requireInteraction: options?.requireInteraction ?? false,
      vibrate: [250, 100, 250, 100, 400],
      data: {
        url: targetUrl,
        page: options?.page || null,
        timestamp: Date.now(),
      },
    };

    // 1. Prioritaskan ServiceWorkerRegistration.showNotification (Wajib untuk Android Chrome & PWA HP)
    if ('serviceWorker' in navigator) {
      try {
        const reg =
          (await navigator.serviceWorker.getRegistration()) ||
          (await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
          ]));

        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, swOptions);
          return true;
        }
      } catch (swErr) {
        console.warn('ServiceWorker showNotification fallback:', swErr);
      }

      // 2. Fallback kirim pesan ke active Service Worker controller jika ada
      if (navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_WMS_NOTIFICATION',
            title,
            options: swOptions,
          });
          return true;
        } catch {}
      }
    }

    // 3. Fallback Desktop Browser Notification API
    const desktopNotif = new Notification(title, {
      body: swOptions.body,
      icon: swOptions.icon,
      tag: uniqueTag,
    });

    desktopNotif.onclick = () => {
      try {
        window.focus();
        if (options?.page) {
          window.dispatchEvent(
            new CustomEvent('wms_navigate_page', { detail: { page: options.page } })
          );
        }
        desktopNotif.close();
      } catch {}
    };

    return true;
  } catch {
    // Ignore notification errors in restricted environments
    return false;
  }
}
