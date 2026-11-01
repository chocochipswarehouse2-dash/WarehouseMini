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
      const msUrl = `${cfg.supabaseUrl}/rest/v1/manual_shipment?select=id,no_pesanan,no_transaksi_customer,nama_pengirim,pic_store,nama_tujuan,jasa_kirim,qty,notes_paket,created_at&order=created_at.desc&limit=10`;
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

  // 3. Cek Pesan Live Chat & Ruang Diskusi Baru untuk User yang sedang login
  if (cfg.username) {
    try {
      const me = String(cfg.username || '').trim().toLowerCase();
      const chatIdxUrl = `${cfg.supabaseUrl}/rest/v1/wms_system_docs?select=content&doc_key=eq.wms_chat_rooms_index_v1&limit=1`;
      const resChat = await fetch(chatIdxUrl, { method: 'GET', headers });
      if (resChat.ok) {
        const rowsChat = await resChat.json();
        if (Array.isArray(rowsChat) && rowsChat.length > 0 && rowsChat[0].content) {
          let rooms = rowsChat[0].content;
          if (typeof rooms === 'string') {
            try {
              rooms = JSON.parse(rooms);
            } catch {
              rooms = [];
            }
          }
          if (Array.isArray(rooms)) {
            for (const room of rooms) {
              if (!room || !room.id || !Array.isArray(room.participants)) continue;
              const isParticipant = room.participants.some(
                (p) => String(p || '').trim().toLowerCase() === me
              );
              if (!isParticipant) continue;

              const lastMsgId = String(room.last_message_id || '').trim();
              const lastSender = String(room.last_message_sender || '').trim().toLowerCase();
              const isUnread =
                Array.isArray(room.unread_by) &&
                room.unread_by.some((u) => String(u || '').trim().toLowerCase() === me);

              if (!lastMsgId || !isUnread || lastSender === me || notifiedSet.has(lastMsgId)) {
                continue;
              }

              notifiedSet.add(lastMsgId);
              newlyNotifiedIds.push(lastMsgId);
              updated = true;

              const senderLabel = String(room.last_message_sender_name || room.last_message_sender || 'Rekan Tim').trim();
              const notifTitle =
                room.type === 'group'
                  ? `💬 [${room.name || 'Grup Diskusi'}] ${senderLabel}`
                  : `💬 Pesan dari ${senderLabel}`;
              const notifBody = String(room.last_message_text || 'Mengirim pesan baru').trim();

              await self.registration.showNotification(notifTitle, {
                body: notifBody,
                icon: '/pwa-192x192.png',
                badge: '/pwa-192x192.png',
                vibrate: [200, 100, 200],
                tag: `wms-chat-${room.id}`,
                renotify: true,
                requireInteraction: true,
                actions: [
                  {
                    action: 'chat_reply',
                    type: 'text',
                    title: '💬 Balas Cepat',
                    placeholder: 'Ketik balasan pesan...',
                  },
                  {
                    action: 'chat_mark_read',
                    title: '✓✓ Tandai Dibaca',
                  },
                ],
                data: {
                  url: '/live-chat',
                  page: 'live_chat',
                  roomId: room.id,
                  roomName: room.name || senderLabel,
                  roomType: room.type || 'direct',
                  lastMessageId: lastMsgId,
                },
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

/**
 * Menangani aksi Balas Cepat (Inline Direct Reply) atau Tandai Dibaca (✓✓)
 * langsung dari Notification Bar HP/Desktop tanpa perlu membuka aplikasi WMS
 */
async function handleBackgroundChatAction(actionType, roomId, replyText) {
  const cfg = await getSwConfig();
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !cfg.username || !roomId) {
    return false;
  }

  const me = String(cfg.username).trim().toLowerCase();
  const myName = String(cfg.displayName || cfg.storeName || cfg.username).trim();
  const myRole = String(cfg.userRole || (cfg.isAdmin ? 'Superadmin' : 'Operator')).trim();
  const nowIso = new Date().toISOString();

  const headers = {
    apikey: cfg.supabaseAnonKey,
    Authorization: `Bearer ${cfg.supabaseAnonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  try {
    // 1. Ambil daftar pesan ruang chat terkait
    const msgsDocKey = `wms_chat_room_msgs_${roomId}`;
    const msgsRes = await fetch(
      `${cfg.supabaseUrl}/rest/v1/wms_system_docs?select=content&doc_key=eq.${encodeURIComponent(msgsDocKey)}&limit=1`,
      { method: 'GET', headers }
    );
    let messages = [];
    if (msgsRes.ok) {
      const rows = await msgsRes.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].content) {
        messages = typeof rows[0].content === 'string' ? JSON.parse(rows[0].content) : rows[0].content;
      }
    }
    if (!Array.isArray(messages)) messages = [];

    // Tandai seluruh pesan sebelumnya sebagai sudah dibaca (✓✓) oleh user ini
    const receipt = { username: me, name: myName, read_at: nowIso };
    messages = messages.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const readList = Array.isArray(m.read_by) ? m.read_by : [];
      const already = readList.some((r) => String(r && r.username || '').toLowerCase() === me);
      if (already) return m;
      return {
        ...m,
        read_by: [...readList, receipt],
      };
    });

    let newReplyMsg = null;
    if (actionType === 'chat_reply' && replyText && String(replyText).trim()) {
      const cleanReply = String(replyText).trim();
      newReplyMsg = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        room_id: roomId,
        sender_username: me,
        sender_name: myName,
        sender_role: myRole,
        sender_store: cfg.storeName || undefined,
        text: cleanReply,
        created_at: nowIso,
        read_by: [receipt],
      };
      messages.push(newReplyMsg);
      if (messages.length > 150) {
        messages = messages.slice(-150);
      }
    }

    // Simpan kembali daftar pesan ke wms_system_docs
    await fetch(`${cfg.supabaseUrl}/rest/v1/wms_system_docs?on_conflict=doc_key`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        doc_key: msgsDocKey,
        content: messages,
        updated_at: nowIso,
      }),
    });

    // 2. Perbarui indeks ruang chat (wms_chat_rooms_index_v1)
    const idxRes = await fetch(
      `${cfg.supabaseUrl}/rest/v1/wms_system_docs?select=content&doc_key=eq.wms_chat_rooms_index_v1&limit=1`,
      { method: 'GET', headers }
    );
    if (idxRes.ok) {
      const idxRows = await idxRes.json();
      let rooms =
        Array.isArray(idxRows) && idxRows.length > 0 && idxRows[0].content
          ? typeof idxRows[0].content === 'string'
            ? JSON.parse(idxRows[0].content)
            : idxRows[0].content
          : [];
      if (Array.isArray(rooms)) {
        rooms = rooms.map((r) => {
          if (!r || r.id !== roomId) return r;
          const otherMembers = (Array.isArray(r.participants) ? r.participants : []).filter(
            (p) => String(p || '').toLowerCase() !== me
          );
          const nextCounts = { ...(r.unread_counts || {}), [me]: 0 };
          let nextUnreadBy = (Array.isArray(r.unread_by) ? r.unread_by : []).filter(
            (u) => String(u || '').toLowerCase() !== me
          );

          if (newReplyMsg) {
            for (const om of otherMembers) {
              nextCounts[om] = (Number(nextCounts[om]) || 0) + 1;
            }
            nextUnreadBy = Array.from(new Set([...nextUnreadBy, ...otherMembers]));
            return {
              ...r,
              updated_at: nowIso,
              last_message_id: newReplyMsg.id,
              last_message_text: newReplyMsg.text,
              last_message_sender: me,
              last_message_sender_name: myName,
              last_message_at: nowIso,
              unread_by: nextUnreadBy,
              unread_counts: nextCounts,
            };
          }

          return {
            ...r,
            unread_by: nextUnreadBy,
            unread_counts: nextCounts,
          };
        });

        await fetch(`${cfg.supabaseUrl}/rest/v1/wms_system_docs?on_conflict=doc_key`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            doc_key: 'wms_chat_rooms_index_v1',
            content: rooms,
            updated_at: nowIso,
          }),
        });
      }
    }

    // Beritahu tab client jika ada yang terbuka di background
    try {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        client.postMessage({
          type: 'WMS_SW_CHAT_REPLIED',
          roomId,
          actionType,
          timestamp: Date.now(),
        });
      }
    } catch {}

    return true;
  } catch {
    return false;
  }
}

// Keep a gentle background interval while the Service Worker thread is alive
let swCheckInterval = null;
function ensureSwBackgroundTimer() {
  if (swCheckInterval) return;
  // Cek berkala di background Service Worker saat tab tidak sedang fokus
  swCheckInterval = setInterval(() => {
    checkNewOrdersInBackground().catch(() => {});
  }, 90000);
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

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
          displayName: data.displayName || existing.displayName || '',
          userRole: data.userRole || existing.userRole || '',
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
      roomId: data.roomId || '',
    },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  const notifData = (event.notification && event.notification.data) || {};
  const targetUrl = notifData.url || '/';
  const targetPage = notifData.page || '';
  const targetRoomId = notifData.roomId || '';
  const action = event.action || '';
  const inlineReplyText = typeof event.reply === 'string' ? event.reply.trim() : '';

  event.notification.close();

  // 1. Jika user mengetik balasan langsung dari Notification Bar (Inline Direct Reply)
  if (action === 'chat_reply' && inlineReplyText && targetRoomId) {
    event.waitUntil(
      handleBackgroundChatAction('chat_reply', targetRoomId, inlineReplyText).then(async (ok) => {
        if (ok) {
          await self.registration.showNotification('✓ Balasan Terkirim', {
            body: `"${inlineReplyText}" → ${notifData.roomName || 'Ruang Chat'}`,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `wms-chat-sent-${targetRoomId}`,
            silent: true,
            requireInteraction: false,
          });
        }
      })
    );
    return;
  }

  // 2. Jika user menekan tombol "✓✓ Tandai Dibaca" di Notification Bar tanpa buka aplikasi
  if (action === 'chat_mark_read' && targetRoomId) {
    event.waitUntil(handleBackgroundChatAction('chat_mark_read', targetRoomId, ''));
    return;
  }

  // 3. Default: Fokuskan atau buka jendela aplikasi dan arahkan langsung ke halaman / ruang chat terkait
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          client.focus();
          if (targetPage) {
            client.postMessage({
              type: 'WMS_NOTIFICATION_CLICK',
              page: targetPage,
              roomId: targetRoomId,
            });
          }
          return;
        }
      }
      if (clients.openWindow) {
        const params = [];
        if (targetPage) params.push(`page=${encodeURIComponent(targetPage)}`);
        if (targetRoomId) params.push(`room=${encodeURIComponent(targetRoomId)}`);
        const openUrl = params.length > 0 ? `${targetUrl}?${params.join('&')}` : targetUrl;
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
