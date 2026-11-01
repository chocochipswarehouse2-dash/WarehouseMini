// Self-healing no-op development Service Worker
// Prevents installation errors for stale /dev-sw.js?dev-sw registrations and cleanly unregisters itself.

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    self.registration
      .unregister()
      .then(function () {
        return self.clients.matchAll({ type: 'window' });
      })
      .catch(function () {})
  );
});
