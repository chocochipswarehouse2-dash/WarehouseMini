// Extra Service Worker Listeners for Push Notifications, Background Sync & Periodic Order Watcher

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function safeShowNotification(title, options) {
  if (!self.registration || typeof self.registration.showNotification !== 'function') {
    return;
  }
  const opts = {
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    ...options,
    requireInteraction: false,
  };

  // Kirim payload notifikasi ke client tab yang terbuka agar langsung masuk ke Notification Hub
  try {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const d = opts.data || {};
    for (const c of allClients) {
      c.postMessage({
        type: 'WMS_SW_NOTIFICATION_FIRED',
        title,
        body: opts.body || '',
        timestamp: Date.now(),
        target: {
          page: d.page || (d.roomId ? 'live_chat' : undefined),
          subTab: d.subTab || undefined,
          manualSubTab: d.manualSubTab || undefined,
          orderId: d.orderId || undefined,
          isAlter: Boolean(d.isAlter),
          hrSection: d.hrSection || undefined,
          produksiTab: d.produksiTab || undefined,
          kodeProduksi: d.kodeProduksi || undefined,
          roomId: d.roomId || undefined,
          roomName: d.roomName || undefined,
          tag: opts.tag || undefined,
        },
      });
    }
  } catch {}

  try {
    await self.registration.showNotification(title, opts);
  } catch {
    if (Array.isArray(opts.actions) && opts.actions.length > 0) {
      try {
        const buttonOnlyOpts = {
          ...opts,
          actions: opts.actions.map((a) => ({ action: a.action, title: a.title })),
        };
        await self.registration.showNotification(title, buttonOnlyOpts);
      } catch {
        const noActionsOpts = { ...opts };
        delete noActionsOpts.actions;
        try {
          await self.registration.showNotification(title, noActionsOpts);
        } catch {}
      }
    }
  }

  // Auto-hide popup notifikasi OS setelah 10 detik (tetap tersimpan di Notification Hub)
  if (opts.tag) {
    setTimeout(() => {
      try {
        if (self.registration && typeof self.registration.getNotifications === 'function') {
          self.registration
            .getNotifications({ tag: opts.tag })
            .then((list) => {
              if (Array.isArray(list)) {
                list.forEach((n) => {
                  try {
                    n.close();
                  } catch {}
                });
              }
            })
            .catch(() => {});
        }
      } catch {}
    }, 10000);
  }
}

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
 * Check Supabase REST API directly from Service Worker for new orders & live chats
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
    const hasFocusedClient = clientList.some((c) => c.focused && c.visibilityState === 'visible');
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

              await safeShowNotification(title, {
                body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [300, 120, 300, 120, 500],
                tag: `manual-shipment-${primaryKey}`,
                renotify: true,
                requireInteraction: true,
                data: {
                  url: '/pesanan-saya',
                  page: 'pesanan_saya',
                  subTab: 'manual_shipment',
                  manualSubTab: 'rekap',
                  orderId: noPesanan || orderId,
                  isAlter,
                },
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

              await safeShowNotification('🔄 Tiket Retur Barang Baru!', {
                body: `Tiket #${noRetur} atas nama ${r.nama_customer || 'Customer'} baru diajukan di Pusat Resolusi.`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
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

  // 2. Jika Admin/Superadmin ATAU Picker: Cek Permintaan SPS baru & Tugas Picking (picking_list) baru
  if (cfg.isAdmin || cfg.isPicker) {
    // 2A-1. Cek Permintaan Peminjaman Sementara (SPS) baru
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

              await safeShowNotification(`📋 Permintaan SPS Baru — ${g.pic}`, {
                body: `Invoice #${g.noSps} • ${g.keperluan} (${g.skuCount} SKU / ${g.totalQty} pcs). Buka untuk proses picking.`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [250, 100, 250, 100, 450],
                tag: `sps-new-${g.noSps}`,
                renotify: true,
                requireInteraction: true,
                data: { url: '/', page: 'picking_tasks', subTab: 'picking_tasks' },
              });
            }
          }
        }
      }
    } catch {}

    // 2A-2. Cek Tugas Picking Baru (picking_list)
    try {
      const pckUrl = `${cfg.supabaseUrl}/rest/v1/picking_list?select=id,no_sj,tujuan,nama_produk,sku,created_at&order=created_at.desc&limit=20`;
      const resPck = await fetch(pckUrl, { method: 'GET', headers });
      if (resPck.ok) {
        const rowsPck = await resPck.json();
        if (Array.isArray(rowsPck) && rowsPck.length > 0) {
          const pckGroups = new Map();
          for (const r of rowsPck) {
            const noSj = String(r.no_sj || '').trim().toUpperCase();
            if (!noSj) continue;
            if (!pckGroups.has(noSj)) {
              pckGroups.set(noSj, {
                noSj,
                tujuan: String(r.tujuan || 'Gudang').trim(),
                created_at: r.created_at,
                skuCount: 0,
              });
            }
            const g = pckGroups.get(noSj);
            g.skuCount += 1;
          }

          for (const g of Array.from(pckGroups.values()).reverse()) {
            if (notifiedSet.has(g.noSj)) continue;
            const rowTs = g.created_at ? new Date(g.created_at).getTime() : nowMs;
            if (rowTs >= lastCheckMs - 60000 && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
              notifiedSet.add(g.noSj);
              newlyNotifiedIds.push(g.noSj);
              updated = true;

              await safeShowNotification('📋 Tugas Picking Baru Masuk!', {
                body: `SJ #${g.noSj} (${g.skuCount} item) - Tujuan: ${g.tujuan}. Buka untuk mulai picking.`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [250, 100, 250, 100, 450],
                tag: `picking-task-${g.noSj}`,
                renotify: true,
                requireInteraction: true,
                data: { url: '/', page: 'picking_tasks', subTab: 'picking_tasks' },
              });
            }
          }
        }
      }
    } catch {}
  }

  // 2A-3. Khusus Admin/Warehouse ATAU Tim Produksi: Cek Antrian Hitung Ulang Fisik Baru (recount_active_queue)
  if (cfg.isAdmin || cfg.canProduksi) {
    try {
      const recUrl = `${cfg.supabaseUrl}/rest/v1/wms_system_docs?select=content,updated_at&section_id=eq.recount_active_queue&limit=1`;
      const resRec = await fetch(recUrl, { method: 'GET', headers });
      if (resRec.ok) {
        const rowsRec = await resRec.json();
        if (Array.isArray(rowsRec) && rowsRec.length > 0 && rowsRec[0] && rowsRec[0].content) {
          let parsedMap = rowsRec[0].content;
          if (typeof parsedMap === 'string') {
            try {
              parsedMap = JSON.parse(parsedMap);
            } catch {
              parsedMap = {};
            }
          }
          if (parsedMap && typeof parsedMap === 'object') {
            for (const [code, val] of Object.entries(parsedMap)) {
              const cleanCode = String(code || '').trim().toUpperCase();
              if (!cleanCode || cleanCode === 'DUMMY') continue;
              const dedupKey = `RECOUNT_${cleanCode}`;
              if (notifiedSet.has(dedupKey)) continue;
              const meta = typeof val === 'object' && val !== null ? val : {};
              const rowTs = meta.added_at ? new Date(meta.added_at).getTime() : nowMs;
              if (rowTs >= lastCheckMs - 60000 && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
                notifiedSet.add(dedupKey);
                newlyNotifiedIds.push(dedupKey);
                updated = true;

                const addedBy = String(meta.added_by || 'Buyer / Auditor').trim();
                const catatan = String(meta.catatan_petunjuk || (typeof val === 'string' ? val : 'Perlu verifikasi hitung ulang fisik')).trim();

                await safeShowNotification(`🔄 Tugas Hitung Ulang Fisik — Kode ${cleanCode}`, {
                  body: `Oleh: ${addedBy} • ${catatan}`,
                  icon: '/icon-192.png',
                  badge: '/icon-192.png',
                  vibrate: [250, 100, 250, 100, 400],
                  tag: `recount-queue-${cleanCode}`,
                  renotify: true,
                  requireInteraction: true,
                  data: {
                    url: '/',
                    page: 'produksi',
                    produksiTab: 'audit_hitung_ulang',
                    kodeProduksi: cleanCode,
                  },
                });
              }
            }
          }
        }
      }
    } catch {}
  }

  // 2A-4. Khusus Customer Service (CS): Cek Update Status Retur Barang (diproses / dikirim / resi terbit)
  if (cfg.isCustomerService) {
    try {
      const csRtrUrl = `${cfg.supabaseUrl}/rest/v1/retur_barang?select=id,no_retur,nama_customer,status,no_resi,no_sj_gudang_retur,updated_at&order=updated_at.desc&limit=8`;
      const resCsRtr = await fetch(csRtrUrl, { method: 'GET', headers });
      if (resCsRtr.ok) {
        const rowsCsRtr = await resCsRtr.json();
        if (Array.isArray(rowsCsRtr)) {
          for (const r of rowsCsRtr.reverse()) {
            const noRetur = String(r.no_retur || '').trim().toUpperCase();
            if (!noRetur) continue;
            const status = String(r.status || '').trim().toLowerCase();
            const resi = String(r.no_resi || '').trim();
            const sj = String(r.no_sj_gudang_retur || '').trim();
            if (status === 'diterima' && !resi && !sj) continue;

            const stateSignature = resi ? `RESI_${resi}` : sj ? `SJ_${sj}` : `STATUS_${status}`;
            const dedupKey = `RTR_UPD_${noRetur}_${stateSignature}`;
            if (notifiedSet.has(dedupKey)) continue;

            const updTs = r.updated_at ? new Date(r.updated_at).getTime() : nowMs;
            if (updTs >= lastCheckMs - 60000 && Math.abs(nowMs - updTs) <= MAX_AGE_MS) {
              notifiedSet.add(dedupKey);
              newlyNotifiedIds.push(dedupKey);
              updated = true;

              const customer = r.nama_customer || 'Customer';
              const title = resi
                ? `🚚 Retur Selesai — Resi Pengganti Terbit (#${noRetur})`
                : `🔄 Update Status Retur #${noRetur}`;
              const body = resi
                ? `Customer: ${customer} • No. Resi Pengganti: ${resi}`
                : `Customer: ${customer} • Status: ${status === 'diproses' ? 'Diproses Gudang' : status.toUpperCase()}${sj ? ` (SJ: ${sj})` : ''}`;

              await safeShowNotification(title, {
                body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [200, 100, 250],
                tag: `retur-upd-${noRetur}`,
                renotify: true,
                requireInteraction: true,
                data: {
                  url: '/',
                  page: 'pusat_resolusi',
                  orderId: noRetur,
                },
              });
            }
          }
        }
      }
    } catch {}
  }

  // 2B. Khusus Akun `warehouse` ONLY: Cek Pengajuan Lembur, Ijin/Cuti & Ijin Pulang Cepat Baru
  const isWarehouseUser =
    Boolean(cfg.isWarehouseOnly) ||
    String(cfg.username || '').trim().toLowerCase() === 'warehouse' ||
    String(cfg.username || '').trim().toLowerCase() === 'chocochips.warehouse2@gmail.com';

  if (isWarehouseUser) {
    // a) Cek Pengajuan Lembur Baru
    try {
      const lmbUrl = `${cfg.supabaseUrl}/rest/v1/lembur?select=*&order=created_at.desc&limit=8`;
      const resLmb = await fetch(lmbUrl, { method: 'GET', headers });
      if (resLmb.ok) {
        const rowsLmb = await resLmb.json();
        if (Array.isArray(rowsLmb)) {
          for (const r of rowsLmb.reverse()) {
            const key = `HR_LMB_${String(r.id || '').trim().toUpperCase()}`;
            if (!r.id || notifiedSet.has(key)) continue;
            const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
            if (rowTs >= lastCheckMs - 60000 && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
              notifiedSet.add(key);
              newlyNotifiedIds.push(key);
              updated = true;

              const empName = String(r.nama || r.nik || 'Karyawan').trim();
              const tgl = String(r.tanggal || '').slice(0, 10);
              const jam = `${String(r.jam_mulai || '--:--').slice(0, 5)} - ${String(r.jam_selesai || '--:--').slice(0, 5)}`;
              const alasan = String(r.alasan_lembur || r.deskripsi || '-').trim();

              await safeShowNotification(`⚡ Pengajuan Lembur Baru — ${empName}`, {
                body: `Tanggal: ${tgl} (${jam}) • Alasan: ${alasan}`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [250, 100, 250, 100, 400],
                tag: `hr-lembur-${r.id}`,
                renotify: true,
                requireInteraction: true,
                data: { url: '/hr-approval', page: 'hr_approval', hrSection: 'lembur' },
              });
            }
          }
        }
      }
    } catch {}

    // b) Cek Pengajuan Ijin / Cuti / Sakit / Ijin Pulang Cepat Baru
    try {
      const cutiUrl = `${cfg.supabaseUrl}/rest/v1/perijinan_cuti?select=*&order=created_at.desc&limit=8`;
      const resCuti = await fetch(cutiUrl, { method: 'GET', headers });
      if (resCuti.ok) {
        const rowsCuti = await resCuti.json();
        if (Array.isArray(rowsCuti)) {
          for (const r of rowsCuti.reverse()) {
            const key = `HR_CUTI_${String(r.id || '').trim().toUpperCase()}`;
            const rawTglMulai = String(r.tgl_mulai || r.tanggal_mulai || '').slice(0, 10);
            const rawTglSelesai = String(r.tgl_selesai || r.tanggal_selesai || '').slice(0, 10);
            const ipcDedupKey = `HR_IPC_${String(r.nik || '').trim().toUpperCase()}_${rawTglMulai}`;
            if (!r.id || notifiedSet.has(key)) continue;
            const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
            if (rowTs >= lastCheckMs - 60000 && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
              notifiedSet.add(key);
              newlyNotifiedIds.push(key);
              if (String(r.jenis || '').toLowerCase().includes('pulang')) {
                notifiedSet.add(ipcDedupKey);
                newlyNotifiedIds.push(ipcDedupKey);
              }
              updated = true;

              const empName = String(r.nama || r.nik || 'Karyawan').trim();
              const jenis = String(r.jenis || 'Ijin/Cuti').trim();
              const tglLabel = rawTglSelesai && rawTglSelesai !== rawTglMulai ? `${rawTglMulai} s/d ${rawTglSelesai}` : rawTglMulai;
              const ket = String(r.alasan || r.keterangan || '-').trim();

              await safeShowNotification(`🌴 Pengajuan ${jenis} Baru — ${empName}`, {
                body: `Tanggal: ${tglLabel} • Ket: ${ket}`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [250, 100, 250, 100, 400],
                tag: `hr-cuti-${r.id}`,
                renotify: true,
                requireInteraction: true,
                data: { url: '/hr-approval', page: 'hr_approval', hrSection: 'cuti' },
              });
            }
          }
        }
      }
    } catch {}

    // c) Cek Izin Pulang Cepat (jika diajukan langsung dari halaman Presensi)
    try {
      const ipcUrl = `${cfg.supabaseUrl}/rest/v1/izin_pulang_cepat?select=*&order=created_at.desc&limit=6`;
      const resIpc = await fetch(ipcUrl, { method: 'GET', headers });
      if (resIpc.ok) {
        const rowsIpc = await resIpc.json();
        if (Array.isArray(rowsIpc)) {
          for (const r of rowsIpc.reverse()) {
            const key = `HR_IPA_${String(r.id || '').trim().toUpperCase()}`;
            const ipcDedupKey = `HR_IPC_${String(r.nik || '').trim().toUpperCase()}_${String(r.tanggal || '').slice(0, 10)}`;
            if (!r.id || notifiedSet.has(key) || notifiedSet.has(ipcDedupKey)) continue;
            const rowTs = r.created_at ? new Date(r.created_at).getTime() : nowMs;
            if (rowTs >= lastCheckMs - 60000 && Math.abs(nowMs - rowTs) <= MAX_AGE_MS) {
              notifiedSet.add(key);
              notifiedSet.add(ipcDedupKey);
              newlyNotifiedIds.push(key, ipcDedupKey);
              updated = true;

              const empName = String(r.nama || r.nik || 'Karyawan').trim();
              const tgl = String(r.tanggal || '').slice(0, 10);
              const jamPulang = String(r.jam_pulang_rencana || r.jam_pulang_awal || '--:--').slice(0, 5);
              const alasan = String(r.alasan || '-').trim();

              await safeShowNotification(`🏃 Pengajuan Ijin Pulang Cepat — ${empName}`, {
                body: `Tanggal: ${tgl} (Pulang Jam ${jamPulang}) • Ket: ${alasan}`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                vibrate: [250, 100, 250, 100, 400],
                tag: `hr-ipa-${r.id}`,
                renotify: true,
                requireInteraction: true,
                data: { url: '/hr-approval', page: 'hr_approval', hrSection: 'izin_pulang' },
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
      const chatIdxUrl = `${cfg.supabaseUrl}/rest/v1/wms_system_docs?select=content&or=(section_id.eq.wms_chat_rooms_index_v1,doc_key.eq.wms_chat_rooms_index_v1)&limit=1`;
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

              await safeShowNotification(notifTitle, {
                body: notifBody,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
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
      `${cfg.supabaseUrl}/rest/v1/wms_system_docs?select=content&or=(section_id.eq.${encodeURIComponent(msgsDocKey)},doc_key.eq.${encodeURIComponent(msgsDocKey)})&limit=1`,
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
    if (messages.length > 0) await fetch(`${cfg.supabaseUrl}/rest/v1/wms_system_docs?on_conflict=section_id`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        section_id: msgsDocKey, doc_key: msgsDocKey,
        content: messages,
        updated_at: nowIso,
      }),
    });

    // 2. Perbarui indeks ruang chat (wms_chat_rooms_index_v1)
    const idxRes = await fetch(
      `${cfg.supabaseUrl}/rest/v1/wms_system_docs?select=content&or=(section_id.eq.wms_chat_rooms_index_v1,doc_key.eq.wms_chat_rooms_index_v1)&limit=1`,
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

        if (rooms.length > 0) await fetch(`${cfg.supabaseUrl}/rest/v1/wms_system_docs?on_conflict=section_id`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            section_id: 'wms_chat_rooms_index_v1', doc_key: 'wms_chat_rooms_index_v1',
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

// Keep a responsive background interval while the Service Worker thread is alive
let swCheckInterval = null;
function ensureSwBackgroundTimer() {
  if (swCheckInterval) return;
  // Cek berkala setiap 20 detik di background Service Worker saat tab tidak sedang fokus
  swCheckInterval = setInterval(() => {
    checkNewOrdersInBackground().catch(() => {});
  }, 20000);
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
          isWarehouseOnly: Boolean(data.isWarehouseOnly),
          canProduksi: Boolean(data.canProduksi),
          isCustomerService: Boolean(data.isCustomerService),
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
    icon: '/icon-192.png',
    badge: '/icon-192.png',
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
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: [300, 120, 300, 120, 500],
    tag: data.tag || 'wms-push-notif',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || '/',
      page: data.page || '',
      roomId: data.roomId || '',
      roomName: data.roomName || '',
      roomType: data.roomType || '',
      lastMessageId: data.lastMessageId || '',
    },
  };

  // Notifikasi Live Chat dari Web Push: sediakan Balas Cepat & Tandai Dibaca (seperti WhatsApp)
  if (data.chat && data.roomId) {
    options.vibrate = [200, 100, 200];
    options.actions = [
      { action: 'chat_reply', type: 'text', title: '💬 Balas Cepat', placeholder: 'Ketik balasan pesan...' },
      { action: 'chat_mark_read', title: '✓✓ Tandai Dibaca' },
    ];
  }

  event.waitUntil(
    (async () => {
      // Jika aplikasi sedang terbuka & terlihat, tab utama sudah menampilkan toast + bunyi sendiri → hindari notifikasi ganda
      try {
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (clientList.some((c) => c.focused && c.visibilityState === 'visible')) return;
      } catch {}
      await safeShowNotification(data.title, options);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  const notifData = (event.notification && event.notification.data) || {};
  const targetUrl = notifData.url || '/';
  const targetPage = notifData.page || (notifData.roomId ? 'live_chat' : '');
  const targetSubTab = notifData.subTab || '';
  const targetManualSubTab = notifData.manualSubTab || '';
  const targetOrderId = notifData.orderId || '';
  const targetIsAlter = Boolean(notifData.isAlter);
  const targetHrSection = notifData.hrSection || '';
  const targetProduksiTab = notifData.produksiTab || '';
  const targetKodeProduksi = notifData.kodeProduksi || '';
  const targetRoomId = notifData.roomId || '';
  const action = event.action || '';
  const inlineReplyText = typeof event.reply === 'string' ? event.reply.trim() : '';

  event.notification.close();

  // 1. Jika user mengetik balasan langsung dari Notification Bar (Inline Direct Reply)
  if (action === 'chat_reply' && inlineReplyText && targetRoomId) {
    event.waitUntil(
      handleBackgroundChatAction('chat_reply', targetRoomId, inlineReplyText).then(async (ok) => {
        if (ok) {
          await safeShowNotification('✓ Balasan Terkirim', {
            body: `"${inlineReplyText}" → ${notifData.roomName || 'Ruang Chat'}`,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
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

  const clickPayload = {
    type: 'WMS_NOTIFICATION_CLICK',
    page: targetPage,
    subTab: targetSubTab,
    manualSubTab: targetManualSubTab,
    orderId: targetOrderId,
    isAlter: targetIsAlter,
    hrSection: targetHrSection,
    produksiTab: targetProduksiTab,
    kodeProduksi: targetKodeProduksi,
    roomId: targetRoomId,
    timestamp: Date.now(),
  };

  // Broadcast via BroadcastChannel agar semua tab & frame menerima sinyal klik secara instan
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('wms_notif_click_channel_v1');
      bc.postMessage(clickPayload);
      setTimeout(() => bc.close(), 500);
    }
  } catch {}

  // 3. Default: Fokuskan atau buka jendela aplikasi dan arahkan langsung ke halaman / sub-tab / pesanan / ruang chat terkait
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      if (windowClients && windowClients.length > 0) {
        let focusedAny = false;
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          try {
            client.postMessage(clickPayload);
          } catch {}
          if (!focusedAny && 'focus' in client) {
            try {
              await client.focus();
              focusedAny = true;
            } catch {}
          }
        }
        return;
      }
      if (clients.openWindow) {
        const params = [];
        if (targetPage) params.push(`page=${encodeURIComponent(targetPage)}`);
        if (targetSubTab) params.push(`subTab=${encodeURIComponent(targetSubTab)}`);
        if (targetManualSubTab) params.push(`manualSubTab=${encodeURIComponent(targetManualSubTab)}`);
        if (targetOrderId) params.push(`order=${encodeURIComponent(targetOrderId)}`);
        if (targetHrSection) params.push(`hrSection=${encodeURIComponent(targetHrSection)}`);
        if (targetProduksiTab) params.push(`produksiTab=${encodeURIComponent(targetProduksiTab)}`);
        if (targetKodeProduksi) params.push(`kodeProduksi=${encodeURIComponent(targetKodeProduksi)}`);
        if (targetRoomId) params.push(`room=${encodeURIComponent(targetRoomId)}`);
        const openUrl = params.length > 0 ? `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}${params.join('&')}` : targetUrl;
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
