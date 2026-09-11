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
  if (!Array.isArray(rawData) || rawData.length === 0) return [];

  // Grouping map berdasarkan Surat Jalan: no_sj + source + destination
  const grouped = new Map<string, {
    rec: PengecekanSJRecord;
    itemsMap: Map<string, PengecekanSJItem>;
  }>();

  for (const d of rawData) {
    if (!d || typeof d !== 'object') continue;

    // Normalisasi variabel Surat Jalan (No SJ + Source + Destination)
    let no_sj = String(d.no_sj || d.number_delivery || d['No SJ'] || d['Delivery No'] || '').trim();
    let source = String(d.source || d.asal || d['Source'] || '').trim();
    let destination = String(d.destination || d.tujuan || d['Destination'] || '').trim();
    const tanggal_sj = String(d.tanggal_sj || d.date || d.tanggal || d['Tanggal SJ'] || '').trim();
    const submitted_by = String(d.submitted_by || d.petugas || d.operator || d.pemeriksa || '').trim();
    const status_sj = (d.status || d.status_sj || 'pending') as 'pending' | 'selesai' | 'cocok' | 'selisih';
    const catatan = String(d.catatan || d.notes || '').trim();
    const created_at = String(d.created_at || d.waktu_submit || new Date().toISOString()).trim();

    // Deteksi cerdas jika data dari sheet lama misaligned (misal: source kosong tapi no_sj berisi nama gudang)
    if (!source && no_sj && (no_sj.toLowerCase().includes('warehouse') || no_sj.toLowerCase().includes('gudang'))) {
      source = no_sj;
    }
    if (!destination && submitted_by && submitted_by !== 'Unknown' && !submitted_by.includes('@')) {
      destination = submitted_by;
    }
    if (!no_sj) {
      no_sj = source && destination ? `SJ-${source.slice(0, 3).toUpperCase()}-${destination.slice(0, 3).toUpperCase()}` : 'SJ-PENGECEKAN';
    }

    const key = `${no_sj.toUpperCase()}___${source.toUpperCase()}___${destination.toUpperCase()}`;

    if (!grouped.has(key)) {
      const rec: PengecekanSJRecord = {
        id: key,
        no_sj,
        source: source || 'Gudang Asal',
        destination: destination || 'Outlet Tujuan',
        tanggal_sj: tanggal_sj || new Date().toISOString().slice(0, 10),
        status: status_sj,
        status_komparasi: 'COCOK',
        total_qty_sj: 0,
        total_qty_terima: 0,
        total_sku: 0,
        submitted_by: submitted_by || 'Petugas',
        created_at,
        catatan,
        items: [],
      };
      grouped.set(key, { rec, itemsMap: new Map<string, PengecekanSJItem>() });
    }

    const group = grouped.get(key)!;

    // Periksa apakah d memiliki array `items` atau string `items_json`
    let rawItems: any[] = [];
    if (Array.isArray(d.items) && d.items.length > 0) {
      rawItems = d.items;
    } else if (d.items_json) {
      try {
        const parsed = JSON.parse(d.items_json);
        if (Array.isArray(parsed)) rawItems = parsed;
      } catch {}
    }

    if (rawItems.length > 0) {
      // Record sudah membawa item-item
      for (const item of rawItems) {
        const sku = String(item.sku || item.code || '').trim();
        if (!sku) continue;
        const itemKey = `${sku.toUpperCase()}___${item.category || ''}`;
        const qty_sj = parseInt(item.qty_sj ?? '0', 10) || 0;
        const qty_scan = parseInt(item.qty_scan ?? item.qty_terima ?? '0', 10) || 0;
        const selisih = parseInt(item.selisih ?? String(qty_scan - qty_sj), 10) || (qty_scan - qty_sj);

        if (!group.itemsMap.has(itemKey)) {
          group.itemsMap.set(itemKey, {
            id: item.id || `${key}-${sku}`,
            no_sj,
            source: group.rec.source,
            destination: group.rec.destination,
            tanggal_sj: group.rec.tanggal_sj,
            sku,
            nama_produk: String(item.nama_produk || sku).trim(),
            category: item.category || '',
            qty_sj,
            qty_scan,
            selisih,
            status_item: item.status_item || (selisih === 0 ? 'COCOK' : selisih < 0 ? 'KURANG' : 'LEBIH'),
            status_sj: group.rec.status,
            is_unexpected: Boolean(item.is_unexpected || qty_sj === 0),
            submitted_by: group.rec.submitted_by,
            created_at: group.rec.created_at,
            catatan: item.catatan || '',
          });
        }
      }
    } else {
      // d sendiri adalah baris item (flat row / database row per item)
      // Ekstrak SKU, Category, dan Nama Produk
      const stat_comp = String(d.status_komparasi || '').trim();
      let category = String(d.category || d.kategori || '').trim();
      if (!category && stat_comp.includes('/')) {
        category = stat_comp; // misal 'CLOTHING/BOTTOM/SKORT'
      }

      let sku = String(d.sku || d.code || d.barcode || '').trim();
      if (!sku) {
        // Jika SKU belum diisi dari kolom, gunakan id jika id bukan tanggal
        if (d.id && !String(d.id).includes('GMT')) {
          sku = String(d.id).trim();
        } else if (category) {
          sku = category;
        } else {
          sku = `ITEM-${group.itemsMap.size + 1}`;
        }
      }

      const nama_produk = String(d.nama_produk || d.product || d.variant || (category ? `${category} (${sku})` : sku)).trim();
      const qty_sj = parseInt(d.qty_sj ?? d.total_qty_sj ?? d.qty ?? '0', 10) || 0;
      const qty_scan = parseInt(d.qty_scan ?? d.total_qty_terima ?? d.qty_terima ?? '0', 10) || 0;
      const selisih = parseInt(d.selisih ?? String(qty_scan - qty_sj), 10) || (qty_scan - qty_sj);
      const is_unexpected = Boolean(d.is_unexpected || String(d.is_unexpected).toLowerCase() === 'ya' || qty_sj === 0);
      const status_item = (d.status_item || (selisih === 0 ? 'COCOK' : selisih < 0 ? 'KURANG' : 'LEBIH')) as 'COCOK' | 'KURANG' | 'LEBIH';

      const itemKey = `${sku.toUpperCase()}___${category.toUpperCase()}___${group.itemsMap.size}`;
      group.itemsMap.set(itemKey, {
        id: d.id || `${key}-${sku}-${group.itemsMap.size + 1}`,
        no_sj,
        source: group.rec.source,
        destination: group.rec.destination,
        tanggal_sj: group.rec.tanggal_sj,
        sku,
        nama_produk,
        category,
        qty_sj,
        qty_scan,
        selisih,
        status_item,
        status_sj: group.rec.status,
        is_unexpected,
        submitted_by: group.rec.submitted_by,
        created_at: group.rec.created_at,
        catatan: d.catatan || '',
      });
    }
  }

  // Hitung total dan finalisasi setiap Surat Jalan record
  const result: PengecekanSJRecord[] = [];
  for (const { rec, itemsMap } of grouped.values()) {
    rec.items = Array.from(itemsMap.values());
    rec.total_sku = rec.items.length;
    rec.total_qty_sj = rec.items.reduce((acc, it) => acc + (it.qty_sj || 0), 0);
    rec.total_qty_terima = rec.items.reduce((acc, it) => acc + (it.qty_scan || 0), 0);
    rec.status_komparasi = rec.items.some(it => it.selisih !== 0) ? 'SELISIH' : 'COCOK';
    rec.items_json = JSON.stringify(rec.items);
    result.push(rec);
  }

  return result;
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
