import { LocalUserRecord, PeminjamanRecord, ChannelStockItem } from '../types';

export const FALLBACK_CHANNEL_STOCKS: ChannelStockItem[] = [];

export function getLocalUsers(): LocalUserRecord[] {
  try {
    const raw = localStorage.getItem('wms_local_users');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveLocalUsersList(users: LocalUserRecord[]) {
  try {
    localStorage.setItem('wms_local_users', JSON.stringify(users));
  } catch {
    // ignore
  }
}

export function getLocalPeminjamanRecords(): PeminjamanRecord[] {
  try {
    const raw = localStorage.getItem('wms_peminjaman_records');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveLocalPeminjamanRecords(records: PeminjamanRecord[]) {
  try {
    localStorage.setItem('wms_peminjaman_records', JSON.stringify(records));
  } catch {
    // ignore
  }
}

export function generatePeminjamanId(): string {
  const currentCount = parseInt(localStorage.getItem('wms_peminjaman_seq') || '1', 10) + 1;
  localStorage.setItem('wms_peminjaman_seq', String(currentCount));
  return `PJM-${String(currentCount).padStart(6, '0')}`;
}
