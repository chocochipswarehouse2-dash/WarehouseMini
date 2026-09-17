import { PengecekanSJRecord, PengecekanSJItem, PengecekanSJDraft, TarikanMDRecord } from '../types';
import { supabaseFetch } from './supabase';
import { fetchWithDeltaSync } from './gasSync';

const CACHE_KEY_RECORDS = 'wms_cached_pengecekan_sj_records';
const CACHE_KEY_LEGACY = 'wms_cached_tarikan_md';
const CACHE_KEY_DRAFTS = 'wms_cached_pengecekan_sj_drafts';
const CACHE_KEY_OFFLINE_QUEUE = 'wms_offline_queue_pengecekan_sj';

/**
 * Normalizes any date string (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.)
 * into a valid PostgreSQL DATE format: YYYY-MM-DD.
 */
export function normalizeDateToIso(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== 'string') return new Date().toISOString().slice(0, 10);
  const trimmed = dateStr.trim();
  if (!trimmed) return new Date().toISOString().slice(0, 10);

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = trimmed.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Try standard parse
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

export async function savePengecekanSJToSupabase(record: PengecekanSJRecord): Promise<boolean> {
  try {
    const cleanNoSj = String(record.no_sj || '').trim();
    if (!cleanNoSj) {
      throw new Error('Nomor Surat Jalan (no_sj) tidak boleh kosong.');
    }

    const nowIso = new Date().toISOString();
    const encodedNoSj = encodeURIComponent(cleanNoSj);

    // 1. Hapus entri sebelumnya untuk no_sj yang sama agar data selalu segar tanpa duplikat
    try {
      await supabaseFetch('pengecekan_sj', 'DELETE', null, `no_sj=eq.${encodedNoSj}`);
    } catch (delErr) {
      console.warn('Peringatan saat pembersihan no_sj lama:', delErr);
    }

    // 2. Validasi UUID format
    const isUuid = typeof record.id === 'string' && 
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id);

    // 3. Normalisasi status & status komparasi sesuai CHECK constraints database
    const rawStatus = (record.status || 'pending').toLowerCase();
    const validStatus = ['pending', 'selesai', 'deleted'].includes(rawStatus)
      ? (rawStatus === 'deleted' ? 'DELETED' : rawStatus)
      : (rawStatus === 'selisih' ? 'selesai' : 'pending'); // Pengecekan_sj table only accepts pending, selesai, DELETED

    const validKomparasi = record.status_komparasi === 'SELISIH' ? 'SELISIH' : 'COCOK';

    // 4. Bersihkan daftar item
    const safeItems: PengecekanSJItem[] = Array.isArray(record.items) ? record.items.map((it: any) => ({
      id: String(it.id || `${cleanNoSj}-${it.sku || ''}`),
      no_sj: cleanNoSj,
      source: String(it.source || record.source || 'Gudang Pusat'),
      destination: String(it.destination || record.destination || 'Outlet'),
      tanggal_sj: normalizeDateToIso(it.tanggal_sj || record.tanggal_sj),
      sku: String(it.sku || '').trim().toUpperCase(),
      nama_produk: String(it.nama_produk || it.nama_barang || it.sku || ''),
      category: String(it.category || ''),
      qty_sj: Number(it.qty_sj || 0),
      qty_scan: Number(it.qty_scan || it.qty_terima || 0),
      selisih: Number(it.selisih || 0),
      status_item: it.status_item || (Number(it.qty_scan || it.qty_terima || 0) === Number(it.qty_sj || 0) ? 'COCOK' : (Number(it.qty_scan || it.qty_terima || 0) < Number(it.qty_sj || 0) ? 'KURANG' : 'LEBIH')),
      status_sj: (validStatus === 'DELETED' ? 'selesai' : validStatus) as 'pending' | 'cocok' | 'selisih' | 'selesai',
      is_unexpected: Boolean(it.is_unexpected),
      submitted_by: String(it.submitted_by || record.submitted_by || 'Petugas'),
      catatan: String(it.catatan || record.catatan || ''),
      created_at: it.created_at || nowIso,
    })) : [];

    const totalQtySj = Number(record.total_qty_sj) || safeItems.reduce((s, i) => s + (i.qty_sj || 0), 0);
    const totalQtyTerima = Number(record.total_qty_terima) || safeItems.reduce((s, i) => s + (i.qty_scan || 0), 0);
    const totalSku = Number(record.total_sku) || safeItems.length;

    const insertPayload = {
      ...(isUuid ? { id: record.id } : {}),
      no_sj: cleanNoSj,
      tanggal_sj: normalizeDateToIso(record.tanggal_sj),
      source: String(record.source || 'Gudang Pusat').trim(),
      destination: String(record.destination || 'Outlet').trim(),
      status: validStatus,
      status_komparasi: validKomparasi,
      total_qty_sj: totalQtySj,
      total_qty_terima: totalQtyTerima,
      total_sku: totalSku,
      submitted_by: String(record.submitted_by || 'Petugas').trim(),
      catatan: String(record.catatan || '').trim(),
      items: safeItems,
      items_json: JSON.stringify(safeItems),
      sync_status: 'synced',
      created_at: record.created_at || nowIso,
      updated_at: nowIso
    };

    await supabaseFetch('pengecekan_sj', 'POST', [insertPayload]);

    // Update cache lokal langsung agar sinkron seketika
    try {
      const cached = getCachedPengecekanSJList();
      const sanitizedRecord: PengecekanSJRecord = {
        ...record,
        no_sj: cleanNoSj,
        tanggal_sj: normalizeDateToIso(record.tanggal_sj),
        status: validStatus as any,
        status_komparasi: validKomparasi as any,
        total_qty_sj: totalQtySj,
        total_qty_terima: totalQtyTerima,
        total_sku: totalSku,
        items: safeItems,
        items_json: JSON.stringify(safeItems),
        sync_status: 'synced',
        updated_at: nowIso
      };
      const updatedCache = [sanitizedRecord, ...cached.filter(r => r.no_sj !== cleanNoSj)];
      localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(updatedCache));
    } catch {}

    return true;
  } catch (err) {
    console.error('Error saat savePengecekanSJToSupabase:', err);
    throw err;
  }
}

export async function editPengecekanSJ(record: PengecekanSJRecord): Promise<boolean> {
  return savePengecekanSJToSupabase(record);
}

export async function fetchPengecekanSJFromSupabase(): Promise<PengecekanSJRecord[]> {
  try {
    const rawData = await supabaseFetch<any[]>('pengecekan_sj', 'GET', null, 'select=*&order=created_at.desc&limit=1000');
    return normalizeRecords(rawData);
  } catch (err) {
    console.warn('Gagal fetchPengecekanSJFromSupabase via direct REST, mencoba delta sync:', err);
    try {
      const fallback = await fetchWithDeltaSync<any>('pengecekan_sj');
      return normalizeRecords(fallback);
    } catch (e2) {
      console.error('Fallback delta sync juga gagal:', e2);
      return [];
    }
  }
}

export async function deletePengecekanSJFromSupabase(no_sj: string): Promise<boolean> {
  try {
    const cleanNoSj = String(no_sj || '').trim();
    if (!cleanNoSj) return false;
    const encodedNoSj = encodeURIComponent(cleanNoSj);
    await supabaseFetch('pengecekan_sj', 'DELETE', null, `no_sj=eq.${encodedNoSj}`);

    // Hapus juga dari cache lokal
    try {
      const cached = getCachedPengecekanSJList();
      localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(cached.filter(r => r.no_sj !== cleanNoSj)));
    } catch {}

    return true;
  } catch (err) {
    console.error('Gagal deletePengecekanSJFromSupabase:', err);
    return false;
  }
}

function normalizeRecords(rawData: any[]): PengecekanSJRecord[] {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];
  const grouped = new Map<string, { rec: PengecekanSJRecord; itemsMap: Map<string, PengecekanSJItem> }>();
  
  rawData.forEach(row => {
    let items: any[] = [];
    if (Array.isArray(row.items)) {
      items = row.items;
    } else if (typeof row.items_json === 'string') {
      try { items = JSON.parse(row.items_json); } catch {}
    } else if (typeof row.items === 'string') {
      try { items = JSON.parse(row.items); } catch {}
    } else if (row.sku) {
      items = [{
        sku: String(row.sku),
        nama_barang: String(row.nama_barang || row.nama || ''),
        qty_sj: Number(row.qty_sj || 0),
        qty_terima: Number(row.qty_terima || row.qty || 0),
      }];
    }

    const noSj = String(row.no_sj || row.no_pesanan || row.id || '').trim();
    if (!noSj) return;
    const source = String(row.source || 'Gudang Pusat').trim();
    const destination = String(row.destination || 'Outlet').trim();
    const key = `${noSj}|${source}|${destination}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        rec: {
          id: row.id,
          no_sj: noSj,
          tanggal_sj: row.tanggal_sj || row.tanggal || row.created_at || '',
          source: source,
          destination: destination,
          status: row.status || 'pending',
          status_komparasi: row.status_komparasi || 'COCOK',
          total_qty_sj: Number(row.total_qty_sj || 0),
          total_qty_terima: Number(row.total_qty_terima || 0),
          total_sku: Number(row.total_sku || 0),
          submitted_by: row.submitted_by || row.user || 'Petugas',
          catatan: row.catatan || '',
          items: [],
          created_at: row.created_at || new Date().toISOString(),
          updated_at: row.updated_at || new Date().toISOString(),
          sync_status: 'synced',
        },
        itemsMap: new Map<string, PengecekanSJItem>()
      });
    }

    const group = grouped.get(key)!;
    items.forEach(it => {
      const sku = String(it.sku).trim();
      if (!sku) return;
      if (group.itemsMap.has(sku)) {
        const existing = group.itemsMap.get(sku)!;
        existing.qty_sj += Number(it.qty_sj || 0);
        existing.qty_scan += Number(it.qty_scan || it.qty_terima || 0);
        existing.selisih = existing.qty_scan - existing.qty_sj;
        existing.status_item = existing.qty_scan === existing.qty_sj ? 'COCOK' : (existing.qty_scan < existing.qty_sj ? 'KURANG' : 'LEBIH');
      } else {
        group.itemsMap.set(sku, {
          no_sj: row.no_sj,
          source: row.source,
          destination: row.destination,
          tanggal_sj: row.tanggal_sj,
          sku: sku,
          nama_produk: String(it.nama_produk || it.nama_barang || it.nama || ''),
          qty_sj: Number(it.qty_sj || 0),
          qty_scan: Number(it.qty_scan || it.qty_terima || 0),
          selisih: Number(it.qty_scan || it.qty_terima || 0) - Number(it.qty_sj || 0),
          status_item: Number(it.qty_scan || it.qty_terima || 0) === Number(it.qty_sj || 0) ? 'COCOK' : (Number(it.qty_scan || it.qty_terima || 0) < Number(it.qty_sj || 0) ? 'KURANG' : 'LEBIH'),
        });
      }
    });
  });

  return Array.from(grouped.values()).map(g => {
    g.rec.items = Array.from(g.itemsMap.values());
    return g.rec;
  });
}

export function getCachedPengecekanSJList(): PengecekanSJRecord[] {
  try {
    const cached = localStorage.getItem(CACHE_KEY_RECORDS);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}
  return [];
}

export async function fetchPengecekanSJList(): Promise<PengecekanSJRecord[]> {
  const onlineData = await fetchPengecekanSJFromSupabase();
  if (onlineData && onlineData.length > 0) {
    try { localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(onlineData)); } catch {}
    return onlineData;
  }
  return getCachedPengecekanSJList();
}

export async function fetchTarikanMDLegacy(): Promise<any[]> {
  try {
    const data = await fetchWithDeltaSync<any>('tarikan_md');
    if (!data || data.length === 0) return [];
    
    const records = data.map(row => ({
      id: row.id,
      no_sj: String(row.no_sj || row.no_pesanan || row.id || ''),
      tanggal_sj: String(row.tanggal_sj || row.tanggal || row.created_at || ''),
      source: String(row.source || 'Gudang Pusat'),
      destination: String(row.destination || 'Outlet'),
      sku: String(row.sku || ''),
      nama_produk: String(row.nama_produk || row.nama_barang || row.nama || ''),
      qty_sj: Number(row.qty_sj || 0),
      qty_scan: Number(row.qty_scan || row.qty_terima || row.qty || 0),
      status: String(row.status || 'pending'),
      status_komparasi: String(row.status_komparasi || 'COCOK'),
      submitted_by: String(row.submitted_by || row.user || 'Petugas'),
      catatan: String(row.catatan || ''),
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || ''),
      sync_status: 'synced' as const,
    }));
    try { localStorage.setItem(CACHE_KEY_LEGACY, JSON.stringify(records)); } catch {}
    return records;
  } catch (err) {
    return [];
  }
}

export async function submitPengecekanSJ(payload: PengecekanSJRecord): Promise<{ success: boolean; message: string }> {
  try {
    await savePengecekanSJToSupabase(payload);
    return { success: true, message: 'Data berhasil disubmit ke database Supabase' };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.warn('Gagal submitPengecekanSJ:', errorMsg);
    return { success: false, message: errorMsg };
  }
}

export function saveSJDrafts(drafts: PengecekanSJDraft[]): void {
  localStorage.setItem(CACHE_KEY_DRAFTS, JSON.stringify(drafts));
}

export function loadSJDrafts(): PengecekanSJDraft[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY_DRAFTS) || '[]');
  } catch { return []; }
}

export function deleteSJDraft(idOrNoSj: string): void {
  const allDrafts = loadSJDrafts();
  const hasIdMatch = allDrafts.some(d => d.id === idOrNoSj);
  const remaining = hasIdMatch 
    ? allDrafts.filter(d => d.id !== idOrNoSj)
    : allDrafts.filter(d => d.no_sj !== idOrNoSj);
  localStorage.setItem(CACHE_KEY_DRAFTS, JSON.stringify(remaining));
}

export async function clearAllCaches() {
  localStorage.removeItem(CACHE_KEY_RECORDS);
  localStorage.removeItem(CACHE_KEY_LEGACY);
  localStorage.removeItem(CACHE_KEY_DRAFTS);
  localStorage.removeItem(CACHE_KEY_OFFLINE_QUEUE);
}

export async function deleteTarikanMD(id: string, no_sj?: string): Promise<boolean> {
  return deletePengecekanSJFromSupabase(no_sj || id);
}

export async function saveTarikanMDLegacyToSupabase(record: any): Promise<boolean> {
  try {
    const payload = {
      no_sj: record.no_sj,
      tanggal_sj: record.tanggal_sj || new Date().toISOString().slice(0, 10),
      source: record.source,
      destination: record.destination,
      sku: record.sku,
      nama_barang: record.nama_barang,
      qty_sj: record.qty_sj,
      qty_terima: record.qty_terima,
      status: record.status,
      status_komparasi: record.status_komparasi,
      submitted_by: record.submitted_by,
      catatan: record.catatan,
      created_at: record.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await supabaseFetch('tarikan_md', 'POST', [payload]);
    return true;
  } catch { return false; }
}
export function getPendingOfflinePengecekanSJ(): PengecekanSJRecord[] {
  try {
    return JSON.parse(localStorage.getItem('wms_offline_queue_pengecekan_sj') || '[]');
  } catch { return []; }
}

export async function syncPendingOfflinePengecekanSJ(): Promise<{ successCount: number; failCount: number }> {
  const pending = getPendingOfflinePengecekanSJ();
  if (pending.length === 0) return { successCount: 0, failCount: 0 };
  let successCount = 0;
  let failCount = 0;
  for (const record of pending) {
    try {
      const success = await savePengecekanSJToSupabase(record);
      if (success) successCount++;
      else failCount++;
    } catch {
      failCount++;
    }
  }
  if (successCount > 0) {
    localStorage.removeItem('wms_offline_queue_pengecekan_sj');
  }
  return { successCount, failCount };
}

export function exportPengecekanToCsv(records: PengecekanSJRecord[], filename: string): void {
  let csv = 'No SJ,Tanggal SJ,Source,Destination,Status,Status Komparasi,SKU,Nama Barang,Qty SJ,Qty Terima,Selisih,PIC\n';
  records.forEach(r => {
    (r.items || []).forEach(it => {
      const selisih = (it.qty_scan || 0) - (it.qty_sj || 0);
      csv += `${r.no_sj},${r.tanggal_sj},${r.source},${r.destination},${r.status},${r.status_komparasi},${it.sku},"${it.nama_produk}",${it.qty_sj},${it.qty_scan},${selisih},"${r.submitted_by}"\n`;
    });
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export async function submitTarikanMD(record: PengecekanSJRecord): Promise<{ success: boolean; offline?: boolean; message?: string }> {
  try {
    const res = await submitPengecekanSJ(record);
    if (res.success) {
      return { success: true, offline: false, message: res.message };
    }
    // Jika gagal mengirim (misalnya network error), simpan ke antrean offline
    try {
      const offlineQueue = getPendingOfflinePengecekanSJ();
      const updatedQueue = [record, ...offlineQueue.filter(r => r.no_sj !== record.no_sj)];
      localStorage.setItem('wms_offline_queue_pengecekan_sj', JSON.stringify(updatedQueue));
      return { success: true, offline: true, message: 'Disimpan offline di perangkat (koneksi terputus)' };
    } catch {
      return { success: false, offline: false, message: res.message };
    }
  } catch (err: any) {
    return { success: false, offline: false, message: err?.message || 'Gagal submit pengecekan' };
  }
}

export async function fetchTarikanMDRecords(): Promise<PengecekanSJRecord[]> {
  return fetchPengecekanSJList();
}
