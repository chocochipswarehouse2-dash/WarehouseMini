// Extra Service Worker Listeners for Push Notifications, Background Sync & Periodic Order Watcher

const SW_DB_NAME = 'wms_sw_bg_db';
const SW_STORE_NAME = 'sw_state';
const SW_CONFIG_KEY = 'watcher_config';

function openSwDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SW_STORE_NAME)) {
        db.createObjectStore(SW_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getSwConfig() {
  try {
    const db = await openSwDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(SW_STORE_NAME, 'readonly');
      const store = tx.objectStore(SW_STORE_NAME);
      const getReq = store.get(SW_CONFIG_KEY);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveSwConfig(cfg) {
  try {
    const db = await openSwDb();
    await new Promise((resolve) => {
      const tx = db.transaction(SW_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SW_STORE_NAME);
      store.put(cfg, SW_CONFIG_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    // ignore IndexedDB errors
  }
}

/**
 * Check Supabase REST API directly from Service Worker for new orders
 * Works even when no client tab is focused (during periodicsync, sync, push, or SW wake-up)
 */
async function checkNewOrdersInBackground() {
  const cfg = await getSwConfig();
  if (!cfg || !cfg.enabled || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    return;
  }

  // Check if any window client is currently visible & focused; if so, let the main thread handle audio + toast + push
  try {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasFocusedClient = clientList.some((c) => c.focused || c.visibilityState === 'visible');
    if (hasFocusedClient) {
      return;
    }
  } catch {}

  const headers = {
    apikey: cfg.supabaseAnonKey,
    Authorization: `Bearer ${cfg.supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };

  const notifiedSet = new Set(Array.isArray(cfg.notifiedIds) ? cfg.notifiedIds : []);
  const lastCheckMs = Number(cfg.lastCheckedAt) || Date.now() - 15 * 60 * 1000;
  const nowMs = Date.now();
  const MAX_AGE_MS = 12 * 60 * 60 * 1000;
  let updated = false;
  const newlyNotifiedIds = [];

  // 1. Jika Admin/Superadmin: Cek pesanan baru (Manual Shipment & Alter) + Retur Barang
  if (cfg.isAdmin) {
    try {
      const msUrl = `${cfg.supabaseUrl}/rest/v1/manual_shipment?select=id,no_pesanan,no_transaksi_customer,nama_pengirim,pic_store,nama_tujuan,jasa_kirim,qty,items,notes_paket,created_at&order=created_at.desc&limit=12`;
      const res = await fetch(msUrl, { method: 'GET', headers });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          for (const r of rows.reverse()) {
            const noPesanan = String(r.no_pesanan || '').trim().toUpperCase();
            const noTrans = String(r.no_transaksi_customer || '').trim().toUpperCase();
            const rowId = String(r.id || '').trim().toUpperCase();
            const rawNotes = String(r.notes_paket || '');

            if (noPesanan.startsWith('RTR-') || rawNotes.includes('[RETUR_BARANG]:')) {
              continue;
            }

            const primaryKey = noPesanan || noTrans || rowId;
            if (!primaryKey) continue;

            const alreadyNotified =
              (noPesanan && notifiedSet.has(noPesanan)) ||
              (noTrans && notifiedSet.has(noTrans)) ||
              (rowId && notifiedSet.has(rowId));

            const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
            if (!alreadyNotified && rowTs >= lastCheckMs - 60000 && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
              if (noPesanan) {
                notifiedSet.add(noPesanan);
                newlyNotifiedIds.push(noPesanan);
              }
              if (noTrans) {
                notifiedSet.add(noTrans);
                newlyNotifiedIds.push(noTrans);
              }
              if (rowId) {
                notifiedSet.add(rowId);
                newlyNotifiedIds.push(rowId);
              }
              updated = true;

              const isAlter =
                noPesanan.startsWith('AR-') ||
                noPesanan.startsWith('ALT-') ||
                noPesanan.startsWith('REP-') ||
                rawNotes.includes('[ALTERATION_REPAIR]:');
              const storeName = String(r.nama_pengirim || 'Store').trim();
              const orderId = String(r.no_transaksi_customer || r.no_pesanan || 'Pesanan Baru').trim();
              const customerName = String(r.nama_tujuan || 'Customer').trim();
              const jasaKirim = String(r.jasa_kirim || 'Ekspedisi').trim();

              let parsedItems = [];
              if (Array.isArray(r.items)) parsedItems = r.items;
              else if (typeof r.items === 'string' && r.items.trim()) {
                try {
                  const p = JSON.parse(r.items);
                  if (Array.isArray(p)) parsedItems = p;
                } catch {}
              }
              const totalQty =
                parsedItems.length > 0
                  ? parsedItems.reduce((sum, it) => sum + (Number(it && it.qty) || 1), 0)
                  : Number(r.qty) || 1;

              const title = isAlter
                ? `✂️ Form Alter/Repair Baru — ${storeName}`
                : `🛍️ Pesanan Baru dari ${storeName}`;
              const body = `Order #${orderId} • Customer: ${customerName} (${totalQty} pcs via ${jasaKirim})`;

              await self.registration.showNotification(title, {
                body,
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                vibrate: [300, 120, 300, 120, 500],
                tag: `manual-shipment-${primaryKey}`,
                renotify: true,
                requireInteraction: true,
                data: { url: '/', page: 'pesanan_saya' },
              });
            }
          }
        }
      }
    } catch {}

    // Cek juga tiket Retur Barang baru untuk Admin
    try {
      const rtrUrl = `${cfg.supabaseUrl}/rest/v1/retur_barang?select=id,no_retur,nama_customer,created_at&order=created_at.desc&limit=5`;
      const resRtr = await fetch(rtrUrl, { method: 'GET', headers });
      if (resRtr.ok) {
        const rowsRtr = await resRtr.json();
        if (Array.isArray(rowsRtr)) {
          for (const r of rowsRtr.reverse()) {
            const noRetur = String(r.no_retur || '').trim().toUpperCase();
            if (!noRetur || notifiedSet.has(noRetur)) continue;
            const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
            if (rowTs >= lastCheckMs - 60000 && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
              notifiedSet.add(noRetur);
              newlyNotifiedIds.push(noRetur);
              updated = true;

              await self.registration.showNotification('🔄 Tiket Retur Barang Baru!', {
                body: `Tiket #${noRetur} atas nama ${r.nama_customer || 'Customer'} baru diajukan di Pusat Resolusi.`,
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                vibrate: [250, 100, 250],
                tag: `retur-new-${noRetur}`,
                renotify: true,
                requireInteraction: true,
                data: { url: '/', page: 'pusat_resolusi' },
              });
            }
          }
        }
      }
    } catch {}
  }

  // 2. Jika Admin/Superadmin ATAU Picker: Cek Permintaan Peminjaman Sementara (SPS) baru
  if (cfg.isAdmin || cfg.isPicker) {
    try {
      const spsUrl = `${cfg.supabaseUrl}/rest/v1/peminjaman?select=id,no_peminjaman,pic,keperluan,sku,nama_produk,qty,created_at&order=created_at.desc&limit=15`;
      const resSps = await fetch(spsUrl, { method: 'GET', headers });
      if (resSps.ok) {
        const rowsSps = await resSps.json();
        if (Array.isArray(rowsSps) && rowsSps.length > 0) {
          const spsGroups = new Map();
          for (const r of rowsSps) {
            const noSps = String(r.no_peminjaman || '').trim().toUpperCase();
            if (!noSps) continue;
            if (!spsGroups.has(noSps)) {
              spsGroups.set(noSps, {
                noSps,
                pic: String(r.pic || 'Peminjam').trim(),
                keperluan: String(r.keperluan || 'Peminjaman SPS').trim(),
                created_at: r.created_at,
                totalQty: 0,
                skuCount: 0,
              });
            }
            const g = spsGroups.get(noSps);
            g.totalQty += Number(r.qty) || 1;
            g.skuCount += 1;
          }

          for (const g of Array.from(spsGroups.values()).reverse()) {
            if (notifiedSet.has(g.noSps)) continue;
            const rowTs = g.created_at ? new Date(g.created_at).getTime() : nowMs;
            if (rowTs >= lastCheckMs - 60000 && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
              notifiedSet.add(g.noSps);
              newlyNotifiedIds.push(g.noSps);
              updated = true;

              await self.registration.showNotification(`📋 Permintaan SPS Baru — ${g.pic}`, {
                body: `Invoice #${g.noSps} • ${g.keperluan} (${g.skuCount} SKU / ${g.totalQty} pcs). Buka untuk proses picking.`,
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                vibrate: [250, 100, 250, 100, 450],
                tag: `sps-new-${g.noSps}`,
                renotify: true,
                requireInteraction: true,
                data: { url: '/', page: 'picking_tasks' },
              });
            }
          }
        }
      }
    } catch {}
  }

  if (updated) {
    const trimmedIds = Array.from(notifiedSet).slice(-300);
    await saveSwConfig({
      ...cfg,
      notifiedIds: trimmedIds,
      lastCheckedAt: nowMs,
    });

    // Beritahu tab client jika ada yang terbuka di background
    try {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        client.postMessage({
          type: 'WMS_SW_ORDERS_NOTIFIED',
          notifiedIds: newlyNotifiedIds,
          timestamp: nowMs,
        });
      }
    } catch {}
  } else {
    await saveSwConfig({
      ...cfg,
      lastCheckedAt: nowMs,
    });
  }
}

// Keep a gentle background interval while the Service Worker thread is alive
let swCheckInterval = null;
function ensureSwBackgroundTimer() {
  if (swCheckInterval) return;
  swCheckInterval = setInterval(() => {
    checkNewOrdersInBackground().catch(() => {});
  }, 25000);
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'WMS_CONFIGURE_SW_WATCHER') {
    ensureSwBackgroundTimer();
    event.waitUntil(
      (async () => {
        const existing = (await getSwConfig()) || {};
        const mergedIds = Array.from(
          new Set([...(existing.notifiedIds || []), ...(Array.isArray(data.notifiedIds) ? data.notifiedIds : [])])
        ).slice(-300);

        await saveSwConfig({
          enabled: Boolean(data.enabled),
          supabaseUrl: data.supabaseUrl || existing.supabaseUrl || '',
          supabaseAnonKey: data.supabaseAnonKey || existing.supabaseAnonKey || '',
          isAdmin: Boolean(data.isAdmin),
          isPicker: Boolean(data.isPicker),
          storeName: data.storeName || '',
          username: data.username || '',
          notifiedIds: mergedIds,
          lastCheckedAt: data.lastCheckedAt || existing.lastCheckedAt || Date.now(),
        });
      })()
    );
  } else if (data.type === 'WMS_SYNC_NOTIFIED_ORDERS') {
    event.waitUntil(
      (async () => {
        const existing = (await getSwConfig()) || {};
        const mergedIds = Array.from(
          new Set([...(existing.notifiedIds || []), ...(Array.isArray(data.notifiedIds) ? data.notifiedIds : [])])
        ).slice(-300);
        await saveSwConfig({
          ...existing,
          notifiedIds: mergedIds,
          lastCheckedAt: Date.now(),
        });
      })()
    );
  } else if (data.type === 'WMS_CHECK_ORDERS_NOW') {
    ensureSwBackgroundTimer();
    event.waitUntil(checkNewOrdersInBackground());
  }
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'WMS Warehouse Pro',
    body: 'Ada pembaruan aktivitas gudang.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: '/',
    page: '',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text();
    }
  } else {
    // Jika push tanpa payload, cek langsung ke Supabase dari Service Worker
    event.waitUntil(checkNewOrdersInBackground());
    return;
  }

  const options = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    vibrate: [300, 120, 300, 120, 500],
    tag: data.tag || 'wms-push-notif',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/',
      page: data.page || '',
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const targetPage = (event.notification.data && event.notification.data.page) || '';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          client.focus();
          if (targetPage) {
            client.postMessage({ type: 'WMS_NOTIFICATION_CLICK', page: targetPage });
          }
          return;
        }
      }
      if (clients.openWindow) {
        const openUrl = targetPage ? `${targetUrl}?page=${encodeURIComponent(targetPage)}` : targetUrl;
        return clients.openWindow(openUrl);
      }
    })
  );
});

self.addEventListener('sync', (event) => {
  ensureSwBackgroundTimer();
  event.waitUntil(checkNewOrdersInBackground());
});

self.addEventListener('periodicsync', (event) => {
  ensureSwBackgroundTimer();
  event.waitUntil(checkNewOrdersInBackground());
});
