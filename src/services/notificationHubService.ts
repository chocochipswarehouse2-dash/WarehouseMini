/**
 * =============================================================================
 * WMS NOTIFICATION HUB SERVICE
 * =============================================================================
 * Menyimpan riwayat seluruh notifikasi relevan sesuai hak akses akun yang sedang
 * login. Semua popup melayang otomatis tertutup (auto-hide) dalam 10 detik,
 * sementara pengguna dapat melihat kembali notifikasi yang belum dibaca kapan
 * saja di Notification Hub (lengkap dengan fitur Mark All as Read & Deep Link).
 */

import { UserSession } from '../types';
import { canSessionReceiveNotification } from './permissions';

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
    const trimmed = items.slice(0, MAX_HUB_ITEMS);
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

  const now = Date.now();
  const existing = getNotificationHubItems();

  // Deduplikasi berdasarkan tag atau kombinasi title+body dalam rentang 45 detik terakhir
  const tagKey = String(target.tag || '').trim();
  const isDuplicate = existing.some((item) => {
    const timeDiff = Math.abs(now - item.timestamp);
    if (tagKey && item.target?.tag === tagKey && timeDiff < 45000) {
      return true;
    }
    if (item.title === cleanTitle && item.body === cleanBody && timeDiff < 15000) {
      return true;
    }
    return false;
  });

  if (isDuplicate) return null;

  const newItem: WmsNotificationHubItem = {
    id: `notif_${now}_${Math.random().toString(36).substring(2, 7)}`,
    title: cleanTitle || 'Notifikasi Sistem WMS',
    body: cleanBody,
    category,
    timestamp: now,
    read: false,
    target,
  };

  const next = [newItem, ...existing].slice(0, MAX_HUB_ITEMS);
  saveNotificationHubItems(next);
  return newItem;
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
  const next = items.filter((it) => it.id !== id);
  if (next.length !== items.length) {
    saveNotificationHubItems(next);
  }
}

export function clearAllNotifications(): void {
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
