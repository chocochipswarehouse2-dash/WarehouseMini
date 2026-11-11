/**
 * =============================================================================
 * WMS NOTIFICATION HUB SERVICE
 * =============================================================================
 * Menyimpan & menyinkronkan riwayat seluruh notifikasi relevan sesuai hak akses
 * akun yang sedang login (dari Realtime foreground, Service Worker background,
 * OS Notification Tray `reg.getNotifications()`, dan Live Backfill Supabase).
 * Semua popup melayang otomatis tertutup (auto-hide) dalam 10 detik,
 * sementara pengguna dapat melihat kembali notifikasi yang belum dibaca kapan
 * saja di Notification Hub (lengkap dengan fitur Mark All as Read & Deep Link).
 */

import { UserSession } from '../types';
import {
  canSessionReceiveNotification,
  isWarehouseAccountOnly,
  canReceiveAdminOrderNotif,
  canReceivePickingAndSpsNotif,
  canReceiveRecountNotif,
  canReceiveEmployeeOwnHrNotif,
  isCustomerServiceSession,
  isStoreAccountSession,
  isPeminjamOnlySession,
  isEmployeeMatchingRecord,
  isStoreMatchingOrderRecord,
  hasPermission,
} from './permissions';
import { supabaseFetch } from './supabase';

export type WmsNotifCategory =
  | 'pesanan'
  | 'picking'
  | 'sps'
  | 'retur'
  | 'produksi'
  | 'hr'
  | 'so'
  | 'chat'
  | 'system';

export interface WmsNotificationTarget {
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
  tag?: string;
}

export interface WmsNotificationHubItem {
  id: string;
  title: string;
  body: string;
  category: WmsNotifCategory;
  timestamp: number;
  read: boolean;
  target: WmsNotificationTarget;
}

const MAX_HUB_ITEMS = 120;
const HUB_EVENT_NAME = 'wms_notification_hub_updated';

export function getActiveSessionFromStorage(): UserSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const username = localStorage.getItem('wms_session_username');
    const role = localStorage.getItem('wms_user_role');
    if (username && role) {
      let permissions = undefined;
      try {
        const permStr = localStorage.getItem('wms_user_permissions');
        if (permStr) permissions = JSON.parse(permStr);
      } catch {}
      return {
        token: localStorage.getItem('wms_session_token') || '',
        username,
        name: localStorage.getItem('wms_session_name') || username,
        role: role as any,
        permissions,
        nik: localStorage.getItem('wms_user_nik') || undefined,
        store_code: localStorage.getItem('wms_user_store_code') || undefined,
        store_name: localStorage.getItem('wms_user_store_name') || undefined,
        endpointUrl: '',
      };
    }

    const rawLegacy = localStorage.getItem('wms_session');
    if (rawLegacy) {
      const parsed = JSON.parse(rawLegacy);
      if (parsed && parsed.username) return parsed as UserSession;
    }
  } catch {}
  return null;
}

function getActiveUsernameKey(): string {
  if (typeof window === 'undefined') return 'guest';
  try {
    const u1 = localStorage.getItem('wms_session_username');
    if (u1 && u1.trim()) return u1.trim().toLowerCase();
    const s = getActiveSessionFromStorage();
    if (s?.username) return s.username.trim().toLowerCase();
  } catch {}
  return 'guest';
}

function getStorageKey(username?: string): string {
  const userKey = username ? username.trim().toLowerCase() : getActiveUsernameKey();
  return `wms_notif_hub_v1_${userKey || 'guest'}`;
}

function getDismissedStorageKey(username?: string): string {
  const userKey = username ? username.trim().toLowerCase() : getActiveUsernameKey();
  return `wms_notif_hub_dismissed_v1_${userKey || 'guest'}`;
}

function getDismissedTagsSet(username?: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(getDismissedStorageKey(username));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map((x) => String(x)));
  } catch {}
  return new Set();
}

function saveDismissedTagsSet(tags: Set<string>, username?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(tags).slice(-400);
    localStorage.setItem(getDismissedStorageKey(username), JSON.stringify(arr));
  } catch {}
}

export function inferNotifCategory(
  title: string,
  target: WmsNotificationTarget
): WmsNotifCategory {
  const t = `${title} ${target.tag || ''} ${target.page || ''} ${target.subTab || ''}`.toLowerCase();
  if (target.roomId || t.includes('live-chat') || t.includes('pesan baru') || t.includes('chat')) {
    return 'chat';
  }
  if (target.page === 'pusat_resolusi' || t.includes('retur') || t.includes('rtr-')) {
    return 'retur';
  }
  if (t.includes('sps') || target.page === 'peminjaman') {
    return 'sps';
  }
  if (target.page === 'picking_tasks' || target.subTab === 'picking_tasks' || t.includes('picking')) {
    return 'picking';
  }
  if (
    target.page === 'hr_approval' ||
    target.page === 'lembur_cuti' ||
    t.includes('lembur') ||
    t.includes('cuti') ||
    t.includes('ijin') ||
    t.includes('izin')
  ) {
    return 'hr';
  }
  if (target.page === 'produksi' || t.includes('hitung ulang') || t.includes('recount')) {
    return 'produksi';
  }
  if (target.subTab === 'so_approval' || target.page === 'stock_opname' || t.includes('stock opname') || t.includes('so ')) {
    return 'so';
  }
  if (
    target.page === 'pesanan_saya' ||
    target.subTab === 'manual_shipment' ||
    t.includes('pesanan') ||
    t.includes('alter') ||
    t.includes('resi')
  ) {
    return 'pesanan';
  }
  return 'system';
}

export function getNotificationHubItems(username?: string): WmsNotificationHubItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(username));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Filter out any legacy/stale notifications that do not match the current user's role & permissions
    const activeSession = getActiveSessionFromStorage();
    if (!activeSession) return parsed;

    const validItems = parsed.filter((item: WmsNotificationHubItem) =>
      canSessionReceiveNotification(activeSession, item.category, item.target)
    );

    if (validItems.length !== parsed.length) {
      try {
        localStorage.setItem(getStorageKey(username), JSON.stringify(validItems));
      } catch {}
    }

    return validItems;
  } catch {
    return [];
  }
}

function saveNotificationHubItems(items: WmsNotificationHubItem[], username?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);
    const trimmed = sorted.slice(0, MAX_HUB_ITEMS);
    localStorage.setItem(getStorageKey(username), JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent(HUB_EVENT_NAME));
  } catch (err) {
    console.warn('[NotificationHub] Gagal menyimpan daftar notifikasi:', err);
  }
}

export function getUnreadNotificationCount(username?: string): number {
  const items = getNotificationHubItems(username);
  return items.reduce((acc, it) => acc + (it.read ? 0 : 1), 0);
}

export function addNotificationToHub(params: {
  title: string;
  body: string;
  category?: WmsNotifCategory;
  target?: WmsNotificationTarget;
  timestamp?: number;
  read?: boolean;
}): WmsNotificationHubItem | null {
  if (typeof window === 'undefined') return null;
  const cleanTitle = String(params.title || '').trim();
  const cleanBody = String(params.body || '').trim();
  if (!cleanTitle && !cleanBody) return null;

  const target: WmsNotificationTarget = params.target || {};
  const category = params.category || inferNotifCategory(cleanTitle, target);

  // Strict Role & Permission Gatekeeper:
  // Tolak otomatis jika notifikasi tidak sesuai hak akses akun yang sedang login!
  const activeSession = getActiveSessionFromStorage();
  if (activeSession && !canSessionReceiveNotification(activeSession, category, target)) {
    return null;
  }

  const itemTs = Number(params.timestamp) > 0 ? Number(params.timestamp) : Date.now();
  const existing = getNotificationHubItems();
  const tagKey = String(target.tag || '').trim();

  if (tagKey) {
    const existingIdx = existing.findIndex((it) => it.target?.tag === tagKey);
    if (existingIdx !== -1) {
      // Jika konten berubah (misal update status/resi), perbarui item yang ada
      const prev = existing[existingIdx];
      if (prev.title !== cleanTitle || prev.body !== cleanBody) {
        const updatedItem: WmsNotificationHubItem = {
          ...prev,
          title: cleanTitle,
          body: cleanBody,
          timestamp: Math.max(prev.timestamp, itemTs),
          read: params.read !== undefined ? params.read : false,
          target: { ...prev.target, ...target },
        };
        const next = [...existing];
        next[existingIdx] = updatedItem;
        saveNotificationHubItems(next);
        return updatedItem;
      }
      return prev;
    }
  } else {
    const isDuplicate = existing.some(
      (item) =>
        item.title === cleanTitle &&
        item.body === cleanBody &&
        Math.abs(itemTs - item.timestamp) < 30000
    );
    if (isDuplicate) return null;
  }

  const newItem: WmsNotificationHubItem = {
    id: `notif_${itemTs}_${Math.random().toString(36).substring(2, 7)}`,
    title: cleanTitle || 'Notifikasi Sistem WMS',
    body: cleanBody,
    category,
    timestamp: itemTs,
    read: params.read ?? false,
    target,
  };

  const next = [newItem, ...existing];
  saveNotificationHubItems(next);
  return newItem;
}

export function upsertNotificationsBatchToHub(
  batch: Array<{
    title: string;
    body: string;
    category?: WmsNotifCategory;
    target?: WmsNotificationTarget;
    timestamp: number;
    read?: boolean;
  }>,
  username?: string
): void {
  if (typeof window === 'undefined' || !Array.isArray(batch) || batch.length === 0) return;
  const activeSession = getActiveSessionFromStorage();
  if (!activeSession) return;

  const existing = getNotificationHubItems(username);
  const dismissedTags = getDismissedTagsSet(username);
  const existingByTag = new Map<string, WmsNotificationHubItem>();
  for (const item of existing) {
    if (item.target?.tag) {
      existingByTag.set(item.target.tag, item);
    }
  }

  let changed = false;
  const mergedList = [...existing];

  for (const raw of batch) {
    const cleanTitle = String(raw.title || '').trim();
    const cleanBody = String(raw.body || '').trim();
    if (!cleanTitle && !cleanBody) continue;

    const target: WmsNotificationTarget = raw.target || {};
    const category = raw.category || inferNotifCategory(cleanTitle, target);

    if (!canSessionReceiveNotification(activeSession, category, target)) {
      continue;
    }

    const tagKey = String(target.tag || '').trim();
    if (tagKey && dismissedTags.has(tagKey)) {
      continue;
    }

    const ts = Number(raw.timestamp) > 0 ? Number(raw.timestamp) : Date.now();

    if (tagKey && existingByTag.has(tagKey)) {
      const prev = existingByTag.get(tagKey)!;
      if (prev.title !== cleanTitle || prev.body !== cleanBody) {
        prev.title = cleanTitle;
        prev.body = cleanBody;
        if (ts > prev.timestamp) prev.timestamp = ts;
        changed = true;
      }
      continue;
    }

    const newItem: WmsNotificationHubItem = {
      id: `notif_${ts}_${Math.random().toString(36).substring(2, 7)}`,
      title: cleanTitle || 'Notifikasi Sistem WMS',
      body: cleanBody,
      category,
      timestamp: ts,
      read: raw.read ?? false,
      target,
    };

    if (tagKey) {
      existingByTag.set(tagKey, newItem);
    }
    mergedList.push(newItem);
    changed = true;
  }

  if (changed) {
    saveNotificationHubItems(mergedList, username);
  }
}

export function markNotificationAsRead(id: string): void {
  const items = getNotificationHubItems();
  let changed = false;
  const next = items.map((it) => {
    if (it.id === id && !it.read) {
      changed = true;
      return { ...it, read: true };
    }
    return it;
  });
  if (changed) {
    saveNotificationHubItems(next);
  }
}

export function markAllNotificationsAsRead(): void {
  const items = getNotificationHubItems();
  const hasUnread = items.some((it) => !it.read);
  if (!hasUnread) return;
  const next = items.map((it) => (it.read ? it : { ...it, read: true }));
  saveNotificationHubItems(next);
}

export function deleteNotificationItem(id: string): void {
  const items = getNotificationHubItems();
  const targetItem = items.find((it) => it.id === id);
  if (targetItem?.target?.tag) {
    const dismissed = getDismissedTagsSet();
    dismissed.add(targetItem.target.tag);
    saveDismissedTagsSet(dismissed);
  }
  const next = items.filter((it) => it.id !== id);
  if (next.length !== items.length) {
    saveNotificationHubItems(next);
  }
}

export function clearAllNotifications(): void {
  const items = getNotificationHubItems();
  const dismissed = getDismissedTagsSet();
  for (const it of items) {
    if (it.target?.tag) {
      dismissed.add(it.target.tag);
    }
  }
  saveDismissedTagsSet(dismissed);
  saveNotificationHubItems([]);
}

export function subscribeNotificationHub(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(HUB_EVENT_NAME, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(HUB_EVENT_NAME, handler);
    window.removeEventListener('storage', handler);
  };
}

let isSyncingHub = false;
let lastSyncMs = 0;

/**
 * Menyinkronkan Notification Hub dengan:
 * 1. Notifikasi yang sedang aktif di Notification Tray OS/Android (`reg.getNotifications()`)
 * 2. Aktivitas terbaru dari Supabase yang sesuai 100% dengan Role & Hak Akses Akun yang sedang login
 */
export async function syncNotificationHubWithLiveSources(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (isSyncingHub) return;
  if (!force && now - lastSyncMs < 15000) return;

  const session = getActiveSessionFromStorage();
  if (!session || !session.username) return;

  isSyncingHub = true;
  lastSyncMs = now;

  try {
    const batch: Array<{
      title: string;
      body: string;
      category?: WmsNotifCategory;
      target?: WmsNotificationTarget;
      timestamp: number;
      read?: boolean;
    }> = [];

    // 1. Tarik seluruh notifikasi aktif dari Android / Desktop OS Notification Tray (ServiceWorkerRegistration.getNotifications)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.getNotifications === 'function') {
          const osNotifs = await reg.getNotifications();
          for (const n of osNotifs) {
            const d = (n.data || {}) as any;
            const nTs = Number((n as any).timestamp) || now;
            const nTag = n.tag || d.tag || `os-notif-${n.title}-${nTs}`;
            const target: WmsNotificationTarget = {
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
              tag: nTag,
            };
            batch.push({
              title: n.title || 'Notifikasi WMS',
              body: n.body || '',
              target,
              timestamp: nTs,
              read: false,
            });
            // Tutup otomatis notifikasi di tray OS jika sudah tampil > 10 detik agar tray HP bersih
            if (now - nTs > 10000) {
              try {
                n.close();
              } catch {}
            }
          }
        }
      } catch {}
    }

    // 2. Tarik aktivitas terbaru dari Supabase sesuai Role & Hak Akses Akun
    const isWarehouse = isWarehouseAccountOnly(session);
    const isAdmin = canReceiveAdminOrderNotif(session);
    const isStore = isStoreAccountSession(session);
    const isCS = isCustomerServiceSession(session);
    const isPicker = canReceivePickingAndSpsNotif(session);
    const isPeminjamOnly = isPeminjamOnlySession(session);
    const canSps = isAdmin || isPicker || isPeminjamOnly || hasPermission(session, 'menu_ops_peminjaman');
    const canProduksi = canReceiveRecountNotif(session);
    const canEmployeeOwnHr = canReceiveEmployeeOwnHrNotif(session);
    const canChat = hasPermission(session, 'menu_live_chat');

    const tasks: Promise<void>[] = [];

    // A. HR (Lembur, Ijin/Cuti, Izin Pulang Cepat):
    //    - Akun `warehouse` menerima semua pengajuan HR terbaru
    //    - Karyawan yang punya akses Presensi menerima HANYA pengajuan miliknya sendiri
    //    - Akun `admin`, `store`, `CS`, `peminjam` TIDAK menerima notifikasi HR
    if (isWarehouse || canEmployeeOwnHr) {
      tasks.push(
        (async () => {
          try {
            const [lemburRows, cutiRows, ipcRows] = await Promise.all([
              supabaseFetch<any[]>('lembur', 'GET', null, 'select=*&order=created_at.desc&limit=15').catch(() => []),
              supabaseFetch<any[]>('perijinan_cuti', 'GET', null, 'select=*&order=created_at.desc&limit=15').catch(() => []),
              supabaseFetch<any[]>('izin_pulang_cepat', 'GET', null, 'select=*&order=created_at.desc&limit=10').catch(() => []),
            ]);

            if (Array.isArray(lemburRows)) {
              for (const r of lemburRows) {
                if (!r?.id) continue;
                const isMine = isEmployeeMatchingRecord(session, r);
                if (!isWarehouse && !isMine) continue;

                const empName = String(r.nama || r.nik || 'Karyawan').trim();
                const tgl = String(r.tanggal || '').slice(0, 10);
                const jam = `${String(r.jam_mulai || '--:--').slice(0, 5)} - ${String(r.jam_selesai || '--:--').slice(0, 5)}`;
                const alasan = String(r.alasan_lembur || r.deskripsi || '-').trim();
                const status = String(r.status || 'Pending').trim();
                const statusLower = status.toLowerCase();
                const ts = r.updated_at
                  ? new Date(r.updated_at).getTime()
                  : r.created_at
                  ? new Date(r.created_at).getTime()
                  : now;

                if (isWarehouse) {
                  batch.push({
                    title: `⚡ Pengajuan Lembur — ${empName}`,
                    body: `Tanggal: ${tgl} (${jam}) • Alasan: ${alasan} [${status}]`,
                    category: 'hr',
                    timestamp: isNaN(ts) ? now : ts,
                    read: statusLower === 'approved' || statusLower === 'disetujui' || statusLower === 'rejected' || statusLower === 'ditolak',
                    target: {
                      page: 'hr_approval',
                      hrSection: 'lembur',
                      tag: `hr-lembur-${r.id}`,
                    },
                  });
                } else if (isMine) {
                  const isApproved = statusLower === 'approved' || statusLower === 'disetujui';
                  const isRejected = statusLower === 'rejected' || statusLower === 'ditolak';
                  const title = isApproved
                    ? '✅ Pengajuan Lembur Disetujui!'
                    : isRejected
                    ? '❌ Pengajuan Lembur Ditolak'
                    : '⚡ Pengajuan Lembur Anda Terkirim';
                  batch.push({
                    title,
                    body: `Tanggal: ${tgl} (${jam}) • Alasan: ${alasan} • Status: ${status}`,
                    category: 'hr',
                    timestamp: isNaN(ts) ? now : ts,
                    read: false,
                    target: {
                      page: 'lembur_cuti',
                      tag: `hr-emp-lembur-${r.id}-${statusLower}`,
                    },
                  });
                }
              }
            }

            if (Array.isArray(cutiRows)) {
              for (const r of cutiRows) {
                if (!r?.id) continue;
                const isMine = isEmployeeMatchingRecord(session, r);
                if (!isWarehouse && !isMine) continue;

                const empName = String(r.nama || r.nik || 'Karyawan').trim();
                const jenis = String(r.jenis || 'Ijin/Cuti').trim();
                const tglMulai = String(r.tgl_mulai || r.tanggal_mulai || '').slice(0, 10);
                const tglSelesai = String(r.tgl_selesai || r.tanggal_selesai || '').slice(0, 10);
                const tglLabel = tglSelesai && tglSelesai !== tglMulai ? `${tglMulai} s/d ${tglSelesai}` : tglMulai;
                const ket = String(r.alasan || r.keterangan || '-').trim();
                const status = String(r.status || 'Pending').trim();
                const statusLower = status.toLowerCase();
                const ts = r.updated_at
                  ? new Date(r.updated_at).getTime()
                  : r.created_at
                  ? new Date(r.created_at).getTime()
                  : now;

                if (isWarehouse) {
                  batch.push({
                    title: `🌴 Pengajuan ${jenis} — ${empName}`,
                    body: `Tanggal: ${tglLabel} • Ket: ${ket} [${status}]`,
                    category: 'hr',
                    timestamp: isNaN(ts) ? now : ts,
                    read: statusLower === 'approved' || statusLower === 'disetujui' || statusLower === 'rejected' || statusLower === 'ditolak',
                    target: {
                      page: 'hr_approval',
                      hrSection: 'cuti',
                      tag: `hr-cuti-${r.id}`,
                    },
                  });
                } else if (isMine) {
                  const isApproved = statusLower === 'approved' || statusLower === 'disetujui';
                  const isRejected = statusLower === 'rejected' || statusLower === 'ditolak';
                  const title = isApproved
                    ? `✅ Pengajuan ${jenis} Disetujui!`
                    : isRejected
                    ? `❌ Pengajuan ${jenis} Ditolak`
                    : `🌴 Pengajuan ${jenis} Anda Terkirim`;
                  batch.push({
                    title,
                    body: `Tanggal: ${tglLabel} • Ket: ${ket} • Status: ${status}`,
                    category: 'hr',
                    timestamp: isNaN(ts) ? now : ts,
                    read: false,
                    target: {
                      page: 'lembur_cuti',
                      tag: `hr-emp-cuti-${r.id}-${statusLower}`,
                    },
                  });
                }
              }
            }

            if (Array.isArray(ipcRows)) {
              for (const r of ipcRows) {
                if (!r?.id) continue;
                const isMine = isEmployeeMatchingRecord(session, r);
                if (!isWarehouse && !isMine) continue;

                const empName = String(r.nama || r.nik || 'Karyawan').trim();
                const tgl = String(r.tanggal || '').slice(0, 10);
                const jamPulang = String(r.jam_pulang_rencana || r.jam_pulang_awal || '--:--').slice(0, 5);
                const alasan = String(r.alasan || '-').trim();
                const status = String(r.status || 'Pending').trim();
                const statusLower = status.toLowerCase();
                const ts = r.created_at ? new Date(r.created_at).getTime() : now;

                if (isWarehouse) {
                  batch.push({
                    title: `🏃 Ijin Pulang Cepat — ${empName}`,
                    body: `Tanggal: ${tgl} (Pulang Jam ${jamPulang}) • Ket: ${alasan} [${status}]`,
                    category: 'hr',
                    timestamp: isNaN(ts) ? now : ts,
                    read: statusLower === 'approved' || statusLower === 'disetujui' || statusLower === 'rejected' || statusLower === 'ditolak',
                    target: {
                      page: 'hr_approval',
                      hrSection: 'izin_pulang',
                      tag: `hr-ipa-${r.id}`,
                    },
                  });
                } else if (isMine) {
                  batch.push({
                    title: `🏃 Ijin Pulang Cepat Anda (${status})`,
                    body: `Tanggal: ${tgl} (Jam ${jamPulang}) • Ket: ${alasan}`,
                    category: 'hr',
                    timestamp: isNaN(ts) ? now : ts,
                    read: false,
                    target: {
                      page: 'lembur_cuti',
                      tag: `hr-emp-ipa-${r.id}-${statusLower}`,
                    },
                  });
                }
              }
            }
          } catch {}
        })()
      );
    }

    // B. Pesanan Store / Manual Shipment / Alterasi:
    //    - Admin & Warehouse menerima semua pesanan store terbaru
    //    - Akun Store HANYA menerima pesanan/alter milik store itu sendiri
    if (isAdmin || isStore) {
      tasks.push(
        (async () => {
          try {
            const msRows = await supabaseFetch<any[]>(
              'manual_shipment',
              'GET',
              null,
              'select=id,no_pesanan,no_transaksi_customer,nama_pengirim,pic_store,nama_tujuan,jasa_kirim,qty,notes_paket,status_pekerjaan,no_resi,created_at,updated_at&order=created_at.desc&limit=25'
            ).catch(() => []);

            if (Array.isArray(msRows)) {
              for (const r of msRows) {
                const noPesanan = String(r.no_pesanan || '').trim().toUpperCase();
                const rawNotes = String(r.notes_paket || '');
                if (noPesanan.startsWith('RTR-') || rawNotes.includes('[RETUR_BARANG]:')) continue;

                if (isStore && !isStoreMatchingOrderRecord(session, r)) {
                  continue;
                }

                const orderId = String(r.no_transaksi_customer || r.no_pesanan || r.id || '').trim();
                if (!orderId) continue;

                const isAlter =
                  noPesanan.startsWith('AR-') ||
                  noPesanan.startsWith('ALT-') ||
                  noPesanan.startsWith('REP-') ||
                  rawNotes.includes('[ALTERATION_REPAIR]:');
                const storeName = String(r.nama_pengirim || 'Store').trim();
                const customerName = String(r.nama_tujuan || 'Customer').trim();
                const jasaKirim = String(r.jasa_kirim || 'Ekspedisi').trim();
                const qty = Number(r.qty) || 1;
                const resi = String(r.no_resi || '').trim();
                const statusPekerjaan = String(r.status_pekerjaan || '').trim();
                const ts = r.updated_at
                  ? new Date(r.updated_at).getTime()
                  : r.created_at
                  ? new Date(r.created_at).getTime()
                  : now;

                const title = isStore
                  ? resi
                    ? `📦 Resi Pesanan #${orderId} Terbit`
                    : isAlter
                    ? `✂️ Form Alter/Repair #${orderId}`
                    : `🛍️ Pesanan Store #${orderId}`
                  : isAlter
                  ? `✂️ Form Alter/Repair Baru — ${storeName}`
                  : `🛍️ Pesanan Baru dari ${storeName}`;

                const body = `Order #${orderId} • Customer: ${customerName} (${qty} pcs via ${jasaKirim})${
                  resi ? ` • Resi: ${resi}` : statusPekerjaan ? ` • Status: ${statusPekerjaan.toUpperCase()}` : ''
                }`;

                batch.push({
                  title,
                  body,
                  category: 'pesanan',
                  timestamp: isNaN(ts) ? now : ts,
                  read: Boolean(resi),
                  target: {
                    page: 'pesanan_saya',
                    subTab: 'manual_shipment',
                    manualSubTab: 'rekap',
                    orderId: noPesanan || orderId,
                    isAlter,
                    tag: `manual-shipment-${noPesanan || orderId}`,
                  },
                });
              }
            }
          } catch {}
        })()
      );
    }

    // C. Pusat Resolusi / Retur Barang (Admin, Warehouse, & Customer Service):
    if (isAdmin || isCS) {
      tasks.push(
        (async () => {
          try {
            const rtrRows = await supabaseFetch<any[]>(
              'retur_barang',
              'GET',
              null,
              'select=id,no_retur,nama_customer,status,no_resi,no_sj_gudang_retur,created_at,updated_at&order=created_at.desc&limit=15'
            ).catch(() => []);

            if (Array.isArray(rtrRows)) {
              for (const r of rtrRows) {
                const noRetur = String(r.no_retur || '').trim().toUpperCase();
                if (!noRetur) continue;
                const customer = String(r.nama_customer || 'Customer').trim();
                const status = String(r.status || 'diterima').trim().toLowerCase();
                const resi = String(r.no_resi || '').trim();
                const sj = String(r.no_sj_gudang_retur || '').trim();
                const ts = r.updated_at
                  ? new Date(r.updated_at).getTime()
                  : r.created_at
                  ? new Date(r.created_at).getTime()
                  : now;

                const title = resi
                  ? `🚚 Retur Selesai — Resi #${noRetur}`
                  : `🔄 Tiket Retur Barang #${noRetur}`;
                const body = `Customer: ${customer} • Status: ${status.toUpperCase()}${
                  resi ? ` • Resi: ${resi}` : sj ? ` • SJ: ${sj}` : ''
                }`;

                batch.push({
                  title,
                  body,
                  category: 'retur',
                  timestamp: isNaN(ts) ? now : ts,
                  read: status === 'dikirim' || Boolean(resi),
                  target: {
                    page: 'pusat_resolusi',
                    orderId: noRetur,
                    tag: `retur-new-${noRetur}`,
                  },
                });
              }
            }
          } catch {}
        })()
      );
    }

    // D. Tugas Picking (Admin, Warehouse, & Picker/Karyawan Gudang):
    if (isAdmin || isPicker) {
      tasks.push(
        (async () => {
          try {
            const pckRows = await supabaseFetch<any[]>(
              'picking_list',
              'GET',
              null,
              'select=id,no_sj,tujuan,nama_produk,sku,status,created_at&order=created_at.desc&limit=30'
            ).catch(() => []);

            if (Array.isArray(pckRows) && pckRows.length > 0) {
              const groups = new Map<string, any>();
              for (const r of pckRows) {
                const noSj = String(r.no_sj || '').trim().toUpperCase();
                if (!noSj) continue;
                if (!groups.has(noSj)) {
                  groups.set(noSj, {
                    noSj,
                    tujuan: String(r.tujuan || 'Gudang').trim(),
                    created_at: r.created_at,
                    skuCount: 0,
                    allDone: true,
                  });
                }
                const g = groups.get(noSj)!;
                g.skuCount += 1;
                const st = String(r.status || '').toLowerCase();
                if (st !== 'done' && st !== 'selesai' && st !== 'completed') {
                  g.allDone = false;
                }
              }

              for (const g of Array.from(groups.values()).slice(0, 12)) {
                const ts = g.created_at ? new Date(g.created_at).getTime() : now;
                batch.push({
                  title: `📋 Tugas Picking — SJ #${g.noSj}`,
                  body: `${g.skuCount} item • Tujuan: ${g.tujuan}. Buka untuk mulai picking.`,
                  category: 'picking',
                  timestamp: isNaN(ts) ? now : ts,
                  read: Boolean(g.allDone),
                  target: {
                    page: 'picking_tasks',
                    subTab: 'picking_tasks',
                    tag: `picking-task-${g.noSj}`,
                  },
                });
              }
            }
          } catch {}
        })()
      );
    }

    // E. Peminjaman Sementara / SPS (Admin, Warehouse, Picker, & Akun Khusus SPS/Peminjam):
    if (canSps) {
      tasks.push(
        (async () => {
          try {
            const spsRows = await supabaseFetch<any[]>(
              'peminjaman',
              'GET',
              null,
              'select=id,no_peminjaman,pic,keperluan,sku,nama_produk,qty,status,created_at&order=created_at.desc&limit=25'
            ).catch(() => []);

            if (Array.isArray(spsRows) && spsRows.length > 0) {
              const groups = new Map<string, any>();
              for (const r of spsRows) {
                const noSps = String(r.no_peminjaman || '').trim().toUpperCase();
                if (!noSps) continue;
                if (!groups.has(noSps)) {
                  groups.set(noSps, {
                    noSps,
                    pic: String(r.pic || 'Peminjam').trim(),
                    keperluan: String(r.keperluan || 'Peminjaman SPS').trim(),
                    created_at: r.created_at,
                    skuCount: 0,
                    totalQty: 0,
                    isReturned: true,
                  });
                }
                const g = groups.get(noSps)!;
                g.skuCount += 1;
                g.totalQty += Number(r.qty) || 1;
                const st = String(r.status || '').toLowerCase();
                if (!st.includes('kembali') && !st.includes('selesai')) {
                  g.isReturned = false;
                }
              }

              for (const g of Array.from(groups.values()).slice(0, 10)) {
                const ts = g.created_at ? new Date(g.created_at).getTime() : now;
                batch.push({
                  title: `📦 Peminjaman SPS — ${g.pic}`,
                  body: `Invoice #${g.noSps} • ${g.keperluan} (${g.skuCount} SKU / ${g.totalQty} pcs)`,
                  category: 'sps',
                  timestamp: isNaN(ts) ? now : ts,
                  read: Boolean(g.isReturned),
                  target: {
                    page: isPeminjamOnly ? 'peminjaman' : 'picking_tasks',
                    subTab: 'picking_tasks',
                    tag: `sps-new-${g.noSps}`,
                  },
                });
              }
            }
          } catch {}
        })()
      );
    }

    // F. Produksi & Audit Hitung Ulang (Admin, Warehouse, & Tim Produksi):
    if (canProduksi) {
      tasks.push(
        (async () => {
          try {
            const docRows = await supabaseFetch<any[]>(
              'wms_system_docs',
              'GET',
              null,
              'select=content,updated_at&section_id=eq.recount_active_queue&limit=1'
            ).catch(() => []);

            if (Array.isArray(docRows) && docRows.length > 0 && docRows[0]?.content) {
              let parsedMap = docRows[0].content;
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
                  const meta = typeof val === 'object' && val !== null ? (val as any) : {};
                  const addedBy = String(meta.added_by || 'Buyer / Auditor').trim();
                  const catatan = String(
                    meta.catatan_petunjuk || (typeof val === 'string' ? val : 'Perlu verifikasi hitung ulang fisik')
                  ).trim();
                  const ts = meta.added_at ? new Date(meta.added_at).getTime() : now;

                  batch.push({
                    title: `🔄 Tugas Hitung Ulang Fisik — Kode ${cleanCode}`,
                    body: `Oleh: ${addedBy} • ${catatan}`,
                    category: 'produksi',
                    timestamp: isNaN(ts) ? now : ts,
                    read: false,
                    target: {
                      page: 'produksi',
                      produksiTab: 'audit_hitung_ulang',
                      kodeProduksi: cleanCode,
                      tag: `recount-queue-${cleanCode}`,
                    },
                  });
                }
              }
            }
          } catch {}
        })()
      );
    }

    // G. Live Chat & Ruang Diskusi:
    if (canChat) {
      tasks.push(
        (async () => {
          try {
            const me = String(session.username || '').trim().toLowerCase();
            const chatRows = await supabaseFetch<any[]>(
              'wms_system_docs',
              'GET',
              null,
              'select=content&or=(section_id.eq.wms_chat_rooms_index_v1,doc_key.eq.wms_chat_rooms_index_v1)&limit=1'
            ).catch(() => []);

            if (Array.isArray(chatRows) && chatRows.length > 0 && chatRows[0]?.content) {
              let rooms = chatRows[0].content;
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
                    (p: any) => String(p || '').trim().toLowerCase() === me
                  );
                  if (!isParticipant || !room.last_message_text) continue;

                  const lastSender = String(room.last_message_sender || '').trim().toLowerCase();
                  if (lastSender === me) continue;

                  const isUnread =
                    Array.isArray(room.unread_by) &&
                    room.unread_by.some((u: any) => String(u || '').trim().toLowerCase() === me);
                  const senderLabel = String(
                    room.last_message_sender_name || room.last_message_sender || 'Rekan Tim'
                  ).trim();
                  const ts = room.last_message_at
                    ? new Date(room.last_message_at).getTime()
                    : room.updated_at
                    ? new Date(room.updated_at).getTime()
                    : now;

                  batch.push({
                    title:
                      room.type === 'group'
                        ? `💬 [${room.name || 'Grup Diskusi'}] ${senderLabel}`
                        : `💬 Pesan dari ${senderLabel}`,
                    body: String(room.last_message_text || '').trim(),
                    category: 'chat',
                    timestamp: isNaN(ts) ? now : ts,
                    read: !isUnread,
                    target: {
                      page: 'live_chat',
                      roomId: room.id,
                      roomName: room.name || senderLabel,
                      tag: `wms-chat-${room.id}-${room.last_message_id || 'latest'}`,
                    },
                  });
                }
              }
            }
          } catch {}
        })()
      );
    }

    await Promise.all(tasks);

    if (batch.length > 0) {
      upsertNotificationsBatchToHub(batch, session.username);
    }
  } finally {
    isSyncingHub = false;
  }
}
