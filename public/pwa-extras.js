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
  console.log('[Service Worker] Push Notification received:', event);
  
  const title = 'Warehouse Mini';
  const options = {
    body: event.data ? event.data.text() : 'Update baru tersedia!',
    icon: '/WarehouseMini/icon-192.png',
    badge: '/WarehouseMini/icon-192.png'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click — open or focus the app window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/WarehouseMini/') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/WarehouseMini/');
    })
  );
});
