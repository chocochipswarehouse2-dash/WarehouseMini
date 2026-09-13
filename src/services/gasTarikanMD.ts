import { PengecekanSJRecord, PengecekanSJItem, PengecekanSJDraft, TarikanMDRecord } from '../types';
import { supabaseFetch } from './supabase';
import { fetchWithDeltaSync } from './gasSync';

const CACHE_KEY_RECORDS = 'wms_cached_pengecekan_sj_records';
const CACHE_KEY_LEGACY = 'wms_cached_tarikan_md';
const CACHE_KEY_DRAFTS = 'wms_cached_pengecekan_sj_drafts';
const CACHE_KEY_OFFLINE_QUEUE = 'wms_offline_queue_pengecekan_sj';

export async function savePengecekanSJToSupabase(record: PengecekanSJRecord): Promise<boolean> {
  try {
    const cleanNoSj = String(record.no_sj || '').trim();
    if (!cleanNoSj) return false;

    await supabaseFetch('pengecekan_sj', 'DELETE', null, `no_sj=eq.${cleanNoSj}`);

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

    await supabaseFetch('pengecekan_sj', 'POST', [insertPayload]);
    return true;
  } catch (err) {
    console.warn('Error saat savePengecekanSJToSupabase:', err);
    return false;
  }
}

export async function editPengecekanSJ(record: PengecekanSJRecord): Promise<boolean> {
  return savePengecekanSJToSupabase(record);
}

export async function fetchPengecekanSJFromSupabase(): Promise<PengecekanSJRecord[]> {
  try {
    const rawData = await fetchWithDeltaSync<any>('pengecekan_sj');
    return normalizeRecords(rawData);
  } catch (err) {
    console.warn('Gagal fetchPengecekanSJFromSupabase:', err);
    return [];
  }
}

export async function deletePengecekanSJFromSupabase(no_sj: string): Promise<boolean> {
  try {
    const cleanNoSj = String(no_sj || '').trim();
    if (!cleanNoSj) return false;
    await supabaseFetch('pengecekan_sj', 'DELETE', null, `no_sj=eq.${cleanNoSj}`);
    return true;
  } catch (err) {
    console.warn('Gagal deletePengecekanSJFromSupabase:', err);
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

export async function fetchPengecekanSJList(): Promise<PengecekanSJRecord[]> {
  const onlineData = await fetchPengecekanSJFromSupabase();
  try { localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(onlineData)); } catch {}
  return onlineData;
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
    const result = await savePengecekanSJToSupabase(payload);
    if (result) {
      return { success: true, message: 'Data berhasil disubmit ke server' };
    }
    return { success: false, message: 'Gagal mengirim data' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Error submit' };
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
  const drafts = loadSJDrafts().filter(d => d.no_sj !== idOrNoSj && d.id !== idOrNoSj);
  localStorage.setItem(CACHE_KEY_DRAFTS, JSON.stringify(drafts));
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
    const success = await savePengecekanSJToSupabase(record);
    if (success) successCount++;
    else failCount++;
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

export async function submitTarikanMD(record: PengecekanSJRecord): Promise<{ success: boolean; offline?: boolean }> {
  const res = await submitPengecekanSJ(record);
  return { success: res.success, offline: false };
}

export async function fetchTarikanMDRecords(): Promise<PengecekanSJRecord[]> {
  return fetchPengecekanSJList();
}
