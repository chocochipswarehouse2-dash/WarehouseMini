import {
  PengecekanSJRecord,
  PengecekanSJItem,
  PengecekanSJDraft,
  TarikanMDRecord,
} from '../types';
import { getStoredManualShipmentGasUrl } from './settings';
import { getSupabaseClient } from './supabase';

const CACHE_KEY_RECORDS = 'wms_cached_pengecekan_sj_records';
const CACHE_KEY_LEGACY = 'wms_cached_tarikan_md';
const CACHE_KEY_DRAFTS = 'wms_cached_pengecekan_sj_drafts';
const CACHE_KEY_OFFLINE_QUEUE = 'wms_offline_queue_pengecekan_sj';

const getGasUrl = (): string => {
  return getStoredManualShipmentGasUrl();
};

export async function savePengecekanSJToSupabase(record: PengecekanSJRecord): Promise<boolean> {
  try {
    const sb = getSupabaseClient();
    const cleanNoSj = String(record.no_sj || '').trim();
    if (!cleanNoSj) return false;

    // Bersihkan record lama dengan nomor SJ ini agar tidak duplikat
    await sb.from('pengecekan_sj').delete().eq('no_sj', cleanNoSj);

    const insertPayload = {
      ...(record.id && record.id.length === 36 ? { id: record.id } : {}),
      no_sj: cleanNoSj,
      tanggal_sj: record.tanggal_sj || new Date().toISOString().slice(0, 10),
      source: record.source || 'Gudang Pusat',
      destination: record.destination || 'Outlet',
      status: record.status || 'pending',
      status_komparasi: record.status_komparasi || 'COCOK',
      total_qty_sj: Number(record.total_qty_sj || 0),
      total_qty_terima: Number(record.total_qty_terima || 0),
      total_sku: Number(record.total_sku || 0),
      submitted_by: record.submitted_by || 'Petugas',
      catatan: record.catatan || '',
      items: record.items,
      items_json: JSON.stringify(record.items),
      sync_status: 'synced',
      created_at: record.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error } = await sb.from('pengecekan_sj').insert([insertPayload]);
    if (error) {
      console.warn('Warning: Gagal simpan Pengecekan SJ ke Supabase:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Error saat savePengecekanSJToSupabase:', err);
    return false;
  }
}

export async function fetchPengecekanSJFromSupabase(): Promise<PengecekanSJRecord[]> {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('pengecekan_sj')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !Array.isArray(data)) {
      return [];
    }

    const records: PengecekanSJRecord[] = [];
    for (const row of data) {
      records.push({
        id: row.id,
        no_sj: row.no_sj,
        source: row.source,
        destination: row.destination,
        tanggal_sj: row.tanggal_sj,
        status: row.status,
        status_komparasi: row.status_komparasi,
        total_qty_sj: row.total_qty_sj,
        total_qty_terima: row.total_qty_terima,
        total_sku: row.total_sku,
        submitted_by: row.submitted_by,
        created_at: row.created_at,
        catatan: row.catatan,
        items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
        items_json: row.items_json
      });
    }

    return normalizeRecords(records);
  } catch (err) {
    console.warn('Gagal fetchPengecekanSJFromSupabase:', err);
    return [];
  }
}

export async function deletePengecekanSJFromSupabase(no_sj: string): Promise<boolean> {
  try {
    const sb = getSupabaseClient();
    const cleanNoSj = String(no_sj || '').trim();
    if (!cleanNoSj) return false;
    await sb.from('pengecekan_sj').delete().eq('no_sj', cleanNoSj);
    return true;
  } catch (err) {
    console.warn('Gagal deletePengecekanSJFromSupabase:', err);
    return false;
  }
}

/**
 * Normalisasi data record yang didapat dari Supabase, GAS, atau local storage
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
    const status_sj = (d.status || d.status_sj || 'pending') as 'pending' | 'selesai';
    const catatan = String(d.catatan || d.notes || '').trim();
    const created_at = String(d.created_at || d.waktu_submit || new Date().toISOString()).trim();

    // Deteksi cerdas jika data dari sheet lama misaligned (misal: source kosong tapi no_sj berisi nama gudang)
    if (!source && no_sj && (no_sj.toLowerCase().includes('warehouse') || no_sj.toLowerCase().includes('gudang'))) {
      source = no_sj;
    }
    if (!destination && submitted_by && submittedByNotUser(submitted_by)) {
      destination = submitted_by;
    }
    // Jika no_sj sama dengan destination dan ID berawalan SJ-, utamakan ID sebagai no_sj
    if (d.id && String(d.id).startsWith('SJ-') && (!no_sj || no_sj === destination)) {
      no_sj = String(d.id).trim();
    }
    if (!no_sj) {
      no_sj = source && destination ? `SJ-${source.slice(0, 3).toUpperCase()}-${destination.slice(0, 3).toUpperCase()}` : 'SJ-PENGECEKAN';
    }

    const key = `${no_sj.toUpperCase()}___${source.toUpperCase()}___${destination.toUpperCase()}`;

    if (!grouped.has(key)) {
      const rec: PengecekanSJRecord = {
        id: String(d.id || key),
        no_sj,
        source: source || 'Gudang Asal',
        destination: destination || 'Outlet Tujuan',
        tanggal_sj: tanggal_sj || new Date().toISOString().slice(0, 10),
        status: status_sj,
        status_komparasi: (d.status_komparasi === 'SELISIH' || String(d.status_komparasi).toLowerCase().includes('selisih')) ? 'SELISIH' : 'COCOK',
        total_qty_sj: Number(d.total_qty_sj || 0),
        total_qty_terima: Number(d.total_qty_terima || 0),
        total_sku: Number(d.total_sku || 0),
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
    } else if (typeof d.items === 'number' && d.items > 0) {
      rawItems = [{
        sku: d.sku || 'ITEM-1',
        nama_produk: d.nama_produk || d.catatan || `Item ${no_sj}`,
        qty_sj: d.total_qty_sj || d.items,
        qty_scan: d.total_qty_terima || d.items,
        status_item: (d.status_komparasi === 'SELISIH' ? 'KURANG' : 'COCOK') as 'COCOK' | 'KURANG' | 'LEBIH',
      }];
    } else if (d.items_json) {
      try {
        const parsed = JSON.parse(d.items_json);
        if (Array.isArray(parsed)) rawItems = parsed;
      } catch {}
    }

    // Jika item tidak ditemukan di `items` array, cek apakah baris `d` itu sendiri adalah item.
    if (rawItems.length === 0 && (d.sku || d.code || d.barcode || d.nama_produk || d.product || d.variant || (d.category && d.category !== ''))) {
      rawItems = [d]; // Anggap baris record itu sendiri sebagai item tunggal
    }

    // Jika masih kosong tapi record memiliki nomor SJ valid, buat fallback item agar data tidak hilang
    if (rawItems.length === 0 && (no_sj || d.total_qty_sj || d.total_qty_terima)) {
      rawItems = [{
        sku: d.sku || 'SJ-ITEM',
        nama_produk: d.nama_produk || d.catatan || `Item ${no_sj}`,
        category: d.category || '',
        qty_sj: Number(d.total_qty_sj || 0),
        qty_scan: Number(d.total_qty_terima || 0),
        selisih: Number(d.total_qty_terima || 0) - Number(d.total_qty_sj || 0),
        status_item: (d.status_komparasi === 'SELISIH' ? 'KURANG' : 'COCOK') as 'COCOK' | 'KURANG' | 'LEBIH',
      }];
    }

    if (rawItems.length > 0) {
      for (const item of rawItems) {
        let itemCategory = String(item.category || item.kategori || '').trim();
        if (!itemCategory && String(item.status_komparasi || '').includes('/')) {
          itemCategory = String(item.status_komparasi);
        }

        let sku = String(item.sku || item.code || item.barcode || '').trim();
        if (!sku) {
          if (item.id && !String(item.id).includes('GMT')) {
            sku = String(item.id).trim();
          } else if (itemCategory) {
            sku = itemCategory;
          } else {
            sku = `ITEM-${group.itemsMap.size + 1}`;
          }
        }

        const itemKey = `${sku.toUpperCase()}___${itemCategory || ''}___${group.itemsMap.size}`;
        const qty_sj = parseInt(item.qty_sj ?? item.total_qty_sj ?? item.qty ?? '0', 10) || 0;
        const qty_scan = parseInt(item.qty_scan ?? item.qty_terima ?? item.total_qty_terima ?? '0', 10) || 0;
        const selisih = parseInt(item.selisih ?? String(qty_scan - qty_sj), 10) || (qty_scan - qty_sj);

        if (!group.itemsMap.has(itemKey)) {
          group.itemsMap.set(itemKey, {
            id: item.id || `${key}-${sku}-${group.itemsMap.size}`,
            no_sj,
            source: group.rec.source,
            destination: group.rec.destination,
            tanggal_sj: group.rec.tanggal_sj,
            sku,
            nama_produk: String(item.nama_produk || item.product || item.variant || (itemCategory ? `${itemCategory} (${sku})` : sku)).trim(),
            category: itemCategory || '',
            qty_sj,
            qty_scan,
            selisih,
            status_item: item.status_item || (selisih === 0 ? 'COCOK' : selisih < 0 ? 'KURANG' : 'LEBIH'),
            status_sj: group.rec.status,
            is_unexpected: Boolean(item.is_unexpected || String(item.is_unexpected).toLowerCase() === 'ya' || qty_sj === 0),
            submitted_by: group.rec.submitted_by,
            created_at: group.rec.created_at,
            catatan: item.catatan || '',
          });
        }
      }
    }
  }

  // Hitung total dan finalisasi setiap Surat Jalan record
  const result: PengecekanSJRecord[] = [];
  for (const { rec, itemsMap } of grouped.values()) {
    rec.items = Array.from(itemsMap.values());
    
    // Jika tidak ada item sama sekali, sintesis minimal 1 item agar tidak dihilangkan
    if (rec.items.length === 0) {
      rec.items = [{
        id: `${rec.no_sj}-ITEM-1`,
        no_sj: rec.no_sj,
        source: rec.source,
        destination: rec.destination,
        tanggal_sj: rec.tanggal_sj,
        sku: 'SJ-ITEM',
        nama_produk: rec.catatan || `Item ${rec.no_sj}`,
        category: '',
        qty_sj: rec.total_qty_sj || 0,
        qty_scan: rec.total_qty_terima || 0,
        selisih: (rec.total_qty_terima || 0) - (rec.total_qty_sj || 0),
        status_item: 'COCOK',
        status_sj: rec.status,
        is_unexpected: false,
        submitted_by: rec.submitted_by,
        created_at: rec.created_at,
        catatan: rec.catatan
      }];
    }
    
    rec.total_sku = rec.items.length;
    rec.total_qty_sj = rec.items.reduce((acc, it) => acc + (it.qty_sj || 0), 0);
    rec.total_qty_terima = rec.items.reduce((acc, it) => acc + (it.qty_scan || 0), 0);
    rec.status_komparasi = rec.items.some(it => it.selisih !== 0) ? 'SELISIH' : 'COCOK';
    rec.items_json = JSON.stringify(rec.items);
    result.push(rec);
  }

  return result;
}

function submittedByNotUser(submitted_by: string): boolean {
  if (!submitted_by || submitted_by === 'Unknown' || submitted_by.includes('@')) return false;
  const lower = submitted_by.toLowerCase();
  return lower.includes('outlet') || lower.includes('store') || lower.includes('paskal') || lower.includes('senayan');
}

/**
 * Mengambil seluruh riwayat pengecekan surat jalan:
 * PRIORITAS TINGGI: Langsung dari Supabase untuk kecepatan & keakuratan maksimal.
 * Sinkronisasi latar belakang dengan Google Apps Script & Local Storage.
 */
export async function fetchTarikanMDRecords(): Promise<PengecekanSJRecord[]> {
  // 1. Muat cache instan dari local storage (0ms)
  let cached: PengecekanSJRecord[] = [];
  try {
    const raw = localStorage.getItem(CACHE_KEY_RECORDS) || localStorage.getItem(CACHE_KEY_LEGACY);
    if (raw) {
      cached = normalizeRecords(JSON.parse(raw));
    }
  } catch {}

  // 2. PRIORITAS UTAMA: Ambil langsung dari Supabase
  let supabaseRecords: PengecekanSJRecord[] = [];
  try {
    supabaseRecords = await fetchPengecekanSJFromSupabase();
  } catch (err) {
    console.warn('Gagal memuat dari Supabase:', err);
  }

  // Jika Supabase memiliki data, update cache lokal & siapkan sebagai basis data utama
  if (supabaseRecords.length > 0) {
    try {
      localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(supabaseRecords));
    } catch {}
    cached = supabaseRecords;
  }

  // 3. Ambil data dari Google Apps Script secara paralel / pelengkap
  const gasUrl = getGasUrl();
  if (gasUrl) {
    try {
      const url = `${gasUrl}?action=getPengecekanSJ`;
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text);
        if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
          const gasNormalized = normalizeRecords(data.data);
          
          // Gabungkan record dari GAS dengan Supabase tanpa menduplikasi No SJ
          const mergedMap = new Map<string, PengecekanSJRecord>();
          // Masukkan data GAS terlebih dahulu
          for (const r of gasNormalized) {
            mergedMap.set(r.no_sj.toUpperCase(), r);
          }
          // Timpa dengan data Supabase jika ada (karena Supabase menyimpan raw_payload item lengkap)
          for (const r of supabaseRecords) {
            mergedMap.set(r.no_sj.toUpperCase(), r);
          }
          // Masukkan juga data dari cache lokal jika belum ada di map
          for (const r of cached) {
            if (!mergedMap.has(r.no_sj.toUpperCase())) {
              mergedMap.set(r.no_sj.toUpperCase(), r);
            }
          }

          const combined = Array.from(mergedMap.values());
          try {
            localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(combined));
          } catch {}
          return combined;
        }
      }
    } catch (gasError) {
      console.warn('GAS fetch gagal/timeout, data dari Supabase/Cache tetap digunakan:', gasError);
    }
  }

  // Jika GAS tidak ada atau gagal, kembalikan hasil Supabase / Cache lokal
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

export async function submitTarikanMD(record: PengecekanSJRecord): Promise<SubmitPengecekanResult> {
  const isCurrentlyOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // 1. Simpan langsung ke Supabase (Database Utama Cloud)
  const isSaved = await savePengecekanSJToSupabase(record).catch(e => {
    console.warn('Supabase save err:', e);
    return false;
  });

  // 2. Simpan ke local cache segera (optimistic update)
  try {
    const current = await fetchTarikanMDRecords();
    const updatedRecord: PengecekanSJRecord = {
      ...record,
      sync_status: isCurrentlyOnline && isSaved ? 'synced' : 'pending_sync',
    };
    const updated = [updatedRecord, ...current.filter(r => r.id !== record.id && r.no_sj !== record.no_sj)];
    localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(updated));
  } catch {}

  // Jika kondisi offline atau tidak tersimpan di Supabase
  if (!isCurrentlyOnline || !isSaved) {
    const currentQueue = getPendingOfflinePengecekanSJ();
    const updatedQueue = [record, ...currentQueue.filter(r => r.id !== record.id && r.no_sj !== record.no_sj)];
    savePendingOfflinePengecekanSJ(updatedQueue);
    return {
      success: true,
      offline: true,
      message: 'Tersimpan aman di antrean lokal. Otomatis dikirim ke Supabase saat internet kembali terhubung.',
    };
  }

  // Berhasil kirim online, pastikan dikeluarkan dari offline queue jika ada
  const currentQueue = getPendingOfflinePengecekanSJ();
  if (currentQueue.some(r => r.id === record.id || r.no_sj === record.no_sj)) {
    savePendingOfflinePengecekanSJ(currentQueue.filter(r => r.id !== record.id && r.no_sj !== record.no_sj));
  }

  return { success: true, offline: false };
}

export async function syncPendingOfflinePengecekanSJ(): Promise<{ successCount: number; remainingCount: number }> {
  const queue = getPendingOfflinePengecekanSJ();
  if (queue.length === 0) return { successCount: 0, remainingCount: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { successCount: 0, remainingCount: queue.length };
  }

  let successCount = 0;
  const remaining: PengecekanSJRecord[] = [];

  for (const record of queue) {
    try {
      const isSaved = await savePengecekanSJToSupabase(record);
      if (isSaved) {
        successCount++;
      } else {
        remaining.push(record);
      }
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

export async function deleteTarikanMD(id: string, no_sj?: string): Promise<boolean> {
  const targetNoSj = no_sj || (id && id.startsWith('SJ-') ? id : '');
  if (targetNoSj) {
    await deletePengecekanSJFromSupabase(targetNoSj).catch(() => {});
  }

  // Hapus dari cache lokal secara sinkron (jangan panggil fetch yang memicu HTTP request)
  try {
    const raw = localStorage.getItem(CACHE_KEY_RECORDS);
    if (raw) {
      const current: PengecekanSJRecord[] = JSON.parse(raw);
      const updated = current.filter(r => r.id !== id && (!no_sj || r.no_sj !== no_sj));
      localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn('Gagal menghapus dari cache lokal:', e);
  }

  return true;
}

export async function editPengecekanSJ(record: PengecekanSJRecord): Promise<boolean> {
  // Update ke Supabase
  await savePengecekanSJToSupabase(record).catch(e => console.warn('Supabase edit err:', e));

  // Update ke cache lokal
  try {
    const current = await fetchTarikanMDRecords();
    const updated = current.map(r => (r.id === record.id ? record : r));
    localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(updated));
  } catch {}

  return true;
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
