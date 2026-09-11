import {
  PengecekanSJRecord,
  PengecekanSJItem,
  PengecekanSJDraft,
  TarikanMDRecord,
} from '../types';
import { getStoredManualShipmentGasUrl } from './settings';

const CACHE_KEY_RECORDS = 'wms_cached_pengecekan_sj_records';
const CACHE_KEY_LEGACY = 'wms_cached_tarikan_md';
const CACHE_KEY_DRAFTS = 'wms_cached_pengecekan_sj_drafts';
const CACHE_KEY_OFFLINE_QUEUE = 'wms_offline_queue_pengecekan_sj';

const getGasUrl = (): string => {
  return getStoredManualShipmentGasUrl();
};

/**
 * Normalisasi data record yang didapat dari GAS atau local storage
 * Memastikan items tersimpan sebagai baris terstruktur (bukan hanya string JSON)
 */
function normalizeRecords(rawData: any[]): PengecekanSJRecord[] {
  if (!Array.isArray(rawData)) return [];

  // 1. Cek apakah rawData adalah baris-baris datar (flat rows) per item dari spreadsheet (sama kayak manual shipment)
  const isFlatRows = rawData.length > 0 && rawData[0] && typeof rawData[0] === 'object' && ('sku' in rawData[0] || 'code' in rawData[0]) && !('items' in rawData[0]);

  if (isFlatRows) {
    const grouped = new Map<string, PengecekanSJRecord>();
    for (const row of rawData) {
      const no_sj = String(row.no_sj || row.number_delivery || row['No SJ'] || '').trim();
      const source = String(row.source || row.asal || row['Source'] || '').trim();
      const destination = String(row.destination || row.tujuan || row['Destination'] || '').trim();
      const key = `${no_sj.toUpperCase()}___${source.toUpperCase()}___${destination.toUpperCase()}`;

      const sku = String(row.sku || row.code || '').trim();
      const nama_produk = String(row.nama_produk || row.product || row.variant || sku).trim();
      const category = row.category || row.kategori || '';
      const qty_sj = parseInt(row.qty_sj ?? row.qty ?? '0', 10) || 0;
      const qty_scan = parseInt(row.qty_scan ?? row.qty_terima ?? '0', 10) || 0;
      const selisih = parseInt(row.selisih ?? String(qty_scan - qty_sj), 10) || (qty_scan - qty_sj);
      const status_item = (row.status_item || (selisih === 0 ? 'COCOK' : selisih < 0 ? 'KURANG' : 'LEBIH')) as 'COCOK' | 'KURANG' | 'LEBIH';
      const status_sj = (row.status_sj || row.status || 'pending') as 'pending' | 'selesai' | 'cocok' | 'selisih';

      const item: PengecekanSJItem = {
        id: row.id || `${key}-${sku}-${Date.now()}`,
        no_sj,
        source,
        destination,
        tanggal_sj: String(row.tanggal_sj || row.date || '').trim(),
        sku,
        nama_produk,
        category,
        qty_sj,
        qty_scan,
        selisih,
        status_item,
        status_sj,
        is_unexpected: row.is_unexpected || qty_sj === 0,
        submitted_by: row.submitted_by || row.operator || '',
        created_at: row.created_at || new Date().toISOString(),
        catatan: row.catatan || '',
      };

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          no_sj,
          source,
          destination,
          tanggal_sj: item.tanggal_sj,
          status: status_sj,
          status_komparasi: 'COCOK',
          total_qty_sj: 0,
          total_qty_terima: 0,
          total_sku: 0,
          submitted_by: item.submitted_by || '',
          created_at: item.created_at || new Date().toISOString(),
          items: [],
        });
      }

      const rec = grouped.get(key)!;
      rec.items.push(item);
      rec.total_qty_sj += item.qty_sj;
      rec.total_qty_terima += item.qty_scan;
      rec.total_sku = rec.items.length;
      if (item.selisih !== 0) {
        rec.status_komparasi = 'SELISIH';
      }
    }
    return Array.from(grouped.values());
  }

  // 2. Format standar object record
  return rawData.map((d: any) => {
    let items: PengecekanSJItem[] = [];
    if (Array.isArray(d.items)) {
      items = d.items;
    } else if (d.items_json) {
      try {
        items = JSON.parse(d.items_json);
      } catch {}
    }

    const no_sj = String(d.no_sj || '').trim();
    const source = String(d.source || '').trim();
    const destination = String(d.destination || '').trim();
    const tanggal_sj = String(d.tanggal_sj || '').trim();

    // Pastikan setiap item memiliki atribut lengkap (sama kayak manual shipment)
    const normalizedItems: PengecekanSJItem[] = items.map((item: any) => ({
      id: item.id || `${no_sj}-${item.sku}`,
      no_sj,
      source,
      destination,
      tanggal_sj,
      sku: item.sku,
      nama_produk: item.nama_produk || item.sku,
      category: item.category || '',
      qty_sj: item.qty_sj ?? 0,
      qty_scan: item.qty_scan ?? item.qty_terima ?? 0,
      selisih: item.selisih ?? ((item.qty_scan ?? item.qty_terima ?? 0) - (item.qty_sj ?? 0)),
      status_item: item.status_item || item.status || 'COCOK',
      status_sj: d.status || 'pending',
      is_unexpected: item.is_unexpected || item.qty_sj === 0,
      submitted_by: d.submitted_by || '',
      created_at: d.created_at || new Date().toISOString(),
      catatan: item.catatan || d.catatan || '',
    }));

    const id = d.id || `${no_sj}___${source}___${destination}`;
    return {
      id,
      no_sj,
      source,
      destination,
      tanggal_sj,
      status: (d.status || 'pending') as 'pending' | 'selesai' | 'cocok' | 'selisih',
      status_komparasi: (d.status_komparasi || (normalizedItems.some(i => i.selisih !== 0) ? 'SELISIH' : 'COCOK')) as 'COCOK' | 'SELISIH',
      total_qty_sj: d.total_qty_sj ?? normalizedItems.reduce((acc, i) => acc + (i.qty_sj || 0), 0),
      total_qty_terima: d.total_qty_terima ?? normalizedItems.reduce((acc, i) => acc + (i.qty_scan || 0), 0),
      total_sku: normalizedItems.length,
      submitted_by: d.submitted_by || 'Unknown',
      created_at: d.created_at || new Date().toISOString(),
      updated_at: d.updated_at,
      catatan: d.catatan || '',
      items: normalizedItems,
      items_json: JSON.stringify(normalizedItems),
    };
  });
}

/**
 * Mengambil seluruh riwayat pengecekan surat jalan dari GAS/Local cache
 */
export async function fetchTarikanMDRecords(): Promise<PengecekanSJRecord[]> {
  let cached: PengecekanSJRecord[] = [];
  try {
    const raw = localStorage.getItem(CACHE_KEY_RECORDS) || localStorage.getItem(CACHE_KEY_LEGACY);
    if (raw) {
      cached = normalizeRecords(JSON.parse(raw));
    }
  } catch {}

  const gasUrl = getGasUrl();
  if (!gasUrl) return cached;

  try {
    const url = `${gasUrl}?action=getPengecekanSJ`;
    const res = await fetch(url, { method: 'GET' });
    if (res.ok) {
      const text = await res.text();
      const data = JSON.parse(text);
      if (data && data.success && Array.isArray(data.data)) {
        const normalized = normalizeRecords(data.data);
        try {
          localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(normalized));
        } catch {}
        return normalized;
      }
    }
  } catch (error) {
    // Fallback coba action lama getTarikanMD jika script GAS masih versi sebelumnya
    try {
      const fallbackUrl = `${gasUrl}?action=getTarikanMD`;
      const res = await fetch(fallbackUrl, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.data)) {
          const normalized = normalizeRecords(data.data);
          try {
            localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(normalized));
          } catch {}
          return normalized;
        }
      }
    } catch (err) {
      console.warn('Gagal fetch dari GAS, menggunakan cache lokal:', err);
    }
  }

  return cached;
}

/**
 * Mengambil antrean data offline yang belum sempat terkirim ke GAS
 */
export function getPendingOfflinePengecekanSJ(): PengecekanSJRecord[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY_OFFLINE_QUEUE);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Menyimpan antrean data offline ke local storage
 */
export function savePendingOfflinePengecekanSJ(queue: PengecekanSJRecord[]): void {
  try {
    localStorage.setItem(CACHE_KEY_OFFLINE_QUEUE, JSON.stringify(queue));
  } catch (e) {
    console.warn('Gagal menyimpan offline queue:', e);
  }
}

export interface SubmitPengecekanResult {
  success: boolean;
  offline?: boolean;
  message?: string;
}

/**
 * Submit Pengecekan Surat Jalan ke sheet.
 * Menuliskan KESELURUHAN DATA item secara individual (sama kayak manual shipment).
 * Dilengkapi kemampuan Offline-First: jika koneksi internet terputus, pekerjaan
 * TIDAK AKAN HILANG dan disimpan ke antrean offline untuk disinkronkan otomatis saat online.
 */
export async function submitTarikanMD(record: PengecekanSJRecord): Promise<SubmitPengecekanResult> {
  const isCurrentlyOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // 1. Simpan ke local cache segera (optimistic update)
  try {
    const current = await fetchTarikanMDRecords();
    const updatedRecord: PengecekanSJRecord = {
      ...record,
      sync_status: isCurrentlyOnline ? 'synced' : 'pending_sync',
    };
    const updated = [updatedRecord, ...current.filter(r => r.id !== record.id && r.no_sj !== record.no_sj)];
    localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(updated));
  } catch {}

  const gasUrl = getGasUrl();

  // Jika kondisi offline atau tidak ada URL GAS
  if (!isCurrentlyOnline || !gasUrl) {
    const currentQueue = getPendingOfflinePengecekanSJ();
    const updatedQueue = [record, ...currentQueue.filter(r => r.id !== record.id && r.no_sj !== record.no_sj)];
    savePendingOfflinePengecekanSJ(updatedQueue);
    return {
      success: true,
      offline: true,
      message: 'Tersimpan offline di perangkat. Otomatis dikirim ke Google Sheets saat internet kembali terhubung.',
    };
  }

  try {
    // Format payload agar GAS bisa menuliskan item individual sebagai baris spreadsheet
    const payload = {
      action: 'submitPengecekanSJ',
      data: {
        ...record,
        items: record.items,
        rows: record.items,
        items_json: JSON.stringify(record.items),
      },
      legacyAction: 'submitTarikanMD',
    };

    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    // Berhasil kirim online, pastikan dikeluarkan dari offline queue jika ada
    const currentQueue = getPendingOfflinePengecekanSJ();
    if (currentQueue.some(r => r.id === record.id || r.no_sj === record.no_sj)) {
      savePendingOfflinePengecekanSJ(currentQueue.filter(r => r.id !== record.id && r.no_sj !== record.no_sj));
    }

    return { success: true, offline: false };
  } catch (error) {
    console.warn('Gagal koneksi ke Google Sheet saat submit, mengamankan ke antrean offline:', error);
    // Masukkan ke offline queue
    const currentQueue = getPendingOfflinePengecekanSJ();
    const updatedQueue = [record, ...currentQueue.filter(r => r.id !== record.id && r.no_sj !== record.no_sj)];
    savePendingOfflinePengecekanSJ(updatedQueue);

    return {
      success: true,
      offline: true,
      message: 'Koneksi terganggu. Data telah diamankan di perangkat & akan otomatis dikirim saat online.',
    };
  }
}

/**
 * Mengirimkan data-data offline yang tertunda ke Google Apps Script
 */
export async function syncPendingOfflinePengecekanSJ(): Promise<{ successCount: number; remainingCount: number }> {
  const queue = getPendingOfflinePengecekanSJ();
  if (queue.length === 0) return { successCount: 0, remainingCount: 0 };
  const gasUrl = getGasUrl();
  if (!gasUrl || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { successCount: 0, remainingCount: queue.length };
  }

  let successCount = 0;
  const remaining: PengecekanSJRecord[] = [];

  for (const record of queue) {
    try {
      const payload = {
        action: 'submitPengecekanSJ',
        data: {
          ...record,
          items: record.items,
          rows: record.items,
          items_json: JSON.stringify(record.items),
        },
        legacyAction: 'submitTarikanMD',
      };

      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      successCount++;
    } catch {
      remaining.push(record);
    }
  }

  savePendingOfflinePengecekanSJ(remaining);

  // Perbarui status di cache records
  if (successCount > 0) {
    try {
      const current = await fetchTarikanMDRecords();
      const updated = current.map(rec => {
        const isStillPending = remaining.some(rem => rem.id === rec.id || rem.no_sj === rec.no_sj);
        if (!isStillPending && rec.sync_status === 'pending_sync') {
          return { ...rec, sync_status: 'synced' } as PengecekanSJRecord;
        }
        return rec;
      });
      localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(updated));
    } catch {}
  }

  return { successCount, remainingCount: remaining.length };
}

// Inisialisasi auto-sync otomatis saat browser mendeteksi sinyal internet pulih
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPendingOfflinePengecekanSJ().catch(() => {});
  });
}

/**
 * Menghapus record riwayat pengecekan
 */
export async function deleteTarikanMD(id: string, no_sj?: string): Promise<boolean> {
  // Hapus dari cache lokal
  try {
    const current = await fetchTarikanMDRecords();
    const updated = current.filter(r => r.id !== id && (!no_sj || r.no_sj !== no_sj));
    localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(updated));
  } catch {}

  const gasUrl = getGasUrl();
  if (!gasUrl) return true;

  try {
    const payload = {
      action: 'deletePengecekanSJ',
      data: { id, no_sj },
      legacyAction: 'deleteTarikanMD',
    };
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (error) {
    console.error('Error deleting Pengecekan Surat Jalan:', error);
    return false;
  }
}

/**
 * Mengupdate data riwayat pengecekan (Edit oleh Admin)
 */
export async function editPengecekanSJ(record: PengecekanSJRecord): Promise<boolean> {
  try {
    const current = await fetchTarikanMDRecords();
    const updated = current.map(r => (r.id === record.id ? record : r));
    localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(updated));
  } catch {}

  const gasUrl = getGasUrl();
  if (!gasUrl) return true;

  try {
    const payload = {
      action: 'editPengecekanSJ',
      data: {
        ...record,
        items: record.items,
        rows: record.items,
        items_json: JSON.stringify(record.items),
      },
    };
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (error) {
    console.error('Error editing Pengecekan Surat Jalan:', error);
    return false;
  }
}

// ============================================================
// DRAFTS ANTRIAN PENGECEKAN PERSISTENCE
// ============================================================

export function loadSJDrafts(): PengecekanSJDraft[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY_DRAFTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveSJDrafts(drafts: PengecekanSJDraft[]): void {
  try {
    localStorage.setItem(CACHE_KEY_DRAFTS, JSON.stringify(drafts));
  } catch (e) {
    console.warn('Gagal menyimpan drafts antrean:', e);
  }
}

export function deleteSJDraft(draftId: string): PengecekanSJDraft[] {
  const current = loadSJDrafts();
  const updated = current.filter(d => d.id !== draftId);
  saveSJDrafts(updated);
  return updated;
}

// ============================================================
// EXPORT DATA PENGECEKAN TO CSV (EXCEL COMPATIBLE)
// ============================================================

export function exportPengecekanToCsv(records: PengecekanSJRecord[], customFilename?: string): void {
  if (!records || records.length === 0) return;

  const headers = [
    'No Surat Jalan',
    'Tanggal SJ',
    'Source (Asal)',
    'Destination (Tujuan)',
    'SKU',
    'Nama Produk',
    'Kategori',
    'Qty SJ',
    'Qty Terima/Scan',
    'Selisih',
    'Status Item',
    'Status SJ',
    'Lebih Di Luar SJ',
    'Pemeriksa',
    'Waktu Submit',
    'Catatan',
  ];

  const rows: string[][] = [];

  for (const rec of records) {
    for (const item of rec.items) {
      rows.push([
        rec.no_sj || '',
        rec.tanggal_sj || '',
        rec.source || '',
        rec.destination || '',
        item.sku || '',
        `"${(item.nama_produk || '').replace(/"/g, '""')}"`,
        item.category || '',
        String(item.qty_sj ?? 0),
        String(item.qty_scan ?? 0),
        String(item.selisih ?? 0),
        item.status_item || 'COCOK',
        rec.status || 'pending',
        item.is_unexpected ? 'YA' : 'TIDAK',
        rec.submitted_by || '',
        rec.created_at ? new Date(rec.created_at).toLocaleString('id-ID') : '',
        `"${(item.catatan || rec.catatan || '').replace(/"/g, '""')}"`,
      ]);
    }
  }

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute('download', customFilename || `Hasil_Pengecekan_Surat_Jalan_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
