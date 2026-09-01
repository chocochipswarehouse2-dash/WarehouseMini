// Push Notification & Local Alert Service

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (e) {
    console.warn('Error requesting notification permission:', e);
    return 'denied';
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermissionStatus(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

export function showPushNotification(title: string, options?: { body?: string; icon?: string; tag?: string }) {
  if (!isNotificationSupported()) return;

  if (Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            body: options?.body || 'Aktivitas WMS Scanner baru',
            icon: options?.icon || '/WarehouseMini/icon-192.png',
            tag: options?.tag || 'wms-notification',
            vibrate: [200, 100, 200]
          } as NotificationOptions);
        });
      } else {
        new Notification(title, {
          body: options?.body,
          icon: options?.icon,
          tag: options?.tag
        });
      }
    } catch (e) {
      console.warn('Notification error:', e);
    }
  }
}
