// Background Sync
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background Sync event triggered:', event.tag);
});

// Periodic Background Sync
self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Periodic Sync event triggered:', event.tag);
});

// Push Notifications
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Warehouse Mini',
    body: 'Update baru tersedia!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'wms-push-' + Date.now(),
    data: { url: '/', page: 'pesanan_saya' },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || 'wms-notification',
    renotify: true,
    vibrate: [250, 100, 250, 100, 400],
    data: payload.data || { url: '/' },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

// Message listener from client page to trigger native SW notification reliably on Android/iOS
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_WMS_NOTIFICATION') {
    const { title, options } = event.data;
    if (title && self.registration && self.registration.showNotification) {
      event.waitUntil(self.registration.showNotification(title, options || {}));
    }
  }
});

// Notification Click — open or focus the app window and navigate to target module
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = (event.notification && event.notification.data) || {};
  const targetUrl = notifData.url || '/';
  const targetPage = notifData.page || null;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            client.postMessage({
              type: 'WMS_NOTIFICATION_CLICK',
              url: targetUrl,
              page: targetPage,
            });
          } catch {}
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
