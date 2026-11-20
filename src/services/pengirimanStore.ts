import {
  PengirimanStoreReport,
  PengirimanStoreItem,
  PengirimanStoreTrip,
  KoliMarkingLabel,
  PengirimanAuditLog,
  PengecekanSJRecord,
} from '../types';
import { supabaseFetch } from './supabase';
import { getFullStoreName } from './gasManualShipment';

const LOCAL_STORAGE_REPORTS = 'wms_pengiriman_store_reports_cache';
const LOCAL_STORAGE_TRIPS = 'wms_pengiriman_store_trips_cache';

export const ESTIMATED_PCS_PER_KOLI = 40;

/**
 * Estimasi jumlah koli dari total qty fisik (pcs): 1 koli = 40 pcs (pembulatan ke atas, minimal 1 koli).
 * Contoh: 1–40 pcs = 1 koli, 41–80 pcs = 2 koli, 81–120 pcs = 3 koli.
 */
export function estimateKoliFromPcs(totalPcs: number, pcsPerKoli = ESTIMATED_PCS_PER_KOLI): number {
  const safePcs = Math.max(1, Math.round(Number(totalPcs) || 0));
  const safeDiv = Math.max(1, Math.round(Number(pcsPerKoli) || ESTIMATED_PCS_PER_KOLI));
  return Math.max(1, Math.ceil(safePcs / safeDiv));
}

function normalizeNoSjKey(noSj?: string): string {
  return String(noSj || '').trim().toUpperCase();
}

function isPenerimaanRecord(record: Pick<PengecekanSJRecord, 'tipe_import' | 'destination'>): boolean {
  if (record.tipe_import === 'Penerimaan') return true;
  if (record.tipe_import === 'Pengiriman') return false;
  const destLower = String(record.destination || '').trim().toLowerCase();
  return (
    destLower.includes('warehouse') ||
    destLower.includes('gudang') ||
    destLower.includes('pusat')
  );
}

export function notifyPengirimanStoreUpdated(detail?: Record<string, any>): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_pengiriman_store_updated', { detail: detail || {} }));
  }
}

// Helper to format date string to YYYY-MM-DD
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format time string to HH:mm
export function getCurrentTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Helper to get submit timestamp
export function getSubmitTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// Generate unique Surat Jalan Barang ID: SJB-YYMMDD-XXXX
export function generateReportId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SJB-${yy}${mm}${dd}-${rand}`;
}

// Generate unique Surat Jalan Pengiriman ID (Batch Manifest): SJP-YYMMDD-XXXX
export function generateTripId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SJP-${yy}${mm}${dd}-${rand}`;
}

// Parse foto_bukti_surat_jalan / foto_urls safely (supports JSON array string, single URL string, or string[])
export function parseTripPhotoUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((u) => String(u || '').trim()).filter(Boolean)));
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return Array.from(new Set(parsed.map((u) => String(u || '').trim()).filter(Boolean)));
        }
      } catch {
        // fallback below if malformed JSON string
      }
    }
    return [trimmed];
  }
  return [];
}

// ==============================================================================
// 1. FETCH & LOCAL STORAGE HELPERS
// ==============================================================================

export function getCachedReports(): PengirimanStoreReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_REPORTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Gagal membaca cache pengiriman store:', e);
  }
  return [];
}

export function saveReportsToCache(reports: PengirimanStoreReport[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_REPORTS, JSON.stringify(reports));
  } catch (e) {
    console.warn('Gagal menyimpan cache pengiriman store:', e);
  }
}

export function getCachedTrips(): PengirimanStoreTrip[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_TRIPS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((t: any) => ({
          ...t,
          foto_urls: parseTripPhotoUrls(t.foto_urls ?? t.foto_bukti_surat_jalan),
          foto_bukti_surat_jalan: t.foto_bukti_surat_jalan || '',
        }));
      }
    }
  } catch (e) {
    console.warn('Gagal membaca cache trips pengiriman store:', e);
  }
  return [];
}

export function saveTripsToCache(trips: PengirimanStoreTrip[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_TRIPS, JSON.stringify(trips));
  } catch (e) {
    console.warn('Gagal menyimpan cache trips pengiriman store:', e);
  }
}

// ==============================================================================
// 2. MAIN CRUD OPERATIONS
// ==============================================================================

export async function fetchPengirimanStoreReports(): Promise<PengirimanStoreReport[]> {
  try {
    const data = await supabaseFetch<any[]>(
      'pengiriman_store_reports',
      'GET',
      null,
      'select=*&order=created_at.desc'
    );

    if (data && Array.isArray(data)) {
      const remoteList: PengirimanStoreReport[] = data.map((d: any) => ({
        id: d.id,
        store_tujuan_id: d.store_tujuan_id,
        store_tujuan: d.store_tujuan,
        tanggal_laporan: d.tanggal_laporan,
        items: typeof d.items === 'string' ? JSON.parse(d.items) : (d.items || []),
        total_item_count: d.total_item_count || 0,
        total_koli: d.total_koli || 0,
        pic_nama: d.pic_nama || 'Petugas Gudang',
        pic_username: d.pic_username || 'operator',
        status: d.status || 'dispatched',
        foto_urls: typeof d.foto_urls === 'string' ? JSON.parse(d.foto_urls) : (d.foto_urls || []),
        gdrive_folder_url: d.gdrive_folder_url,
        trip_id: d.trip_id,
        tanggal_kirim: d.tanggal_kirim,
        waktu_kirim: d.waktu_kirim,
        dikirim_oleh: d.dikirim_oleh,
        armada: d.armada,
        no_polisi: d.no_polisi,
        catatan_kirim: d.catatan_kirim,
        audit_logs: typeof d.audit_logs === 'string' ? JSON.parse(d.audit_logs) : (d.audit_logs || []),
        is_label_printed: Boolean(d.is_label_printed),
        label_printed_at: d.label_printed_at || undefined,
        created_at: d.created_at || new Date().toISOString(),
        updated_at: d.updated_at || new Date().toISOString(),
      }));

      saveReportsToCache(remoteList);
      return remoteList;
    }
  } catch (e) {
    console.warn('Supabase fetch pengiriman_store_reports offline/table not found, fallback to local cache:', e);
  }

  return getCachedReports();
}

export async function fetchPengirimanStoreTrips(): Promise<PengirimanStoreTrip[]> {
  try {
    const data = await supabaseFetch<any[]>(
      'pengiriman_store_trips',
      'GET',
      null,
      'select=*&order=created_at.desc'
    );

    if (data && Array.isArray(data)) {
      const remoteTrips: PengirimanStoreTrip[] = data.map((d: any) => {
        const parsedPhotos = parseTripPhotoUrls(d.foto_bukti_surat_jalan || d.foto_urls);
        return {
          id: d.id,
          tanggal_kirim: d.tanggal_kirim,
          waktu_kirim: d.waktu_kirim || '',
          dikirim_oleh: d.dikirim_oleh || '',
          store_tujuan_list: typeof d.store_tujuan_list === 'string' ? JSON.parse(d.store_tujuan_list) : (d.store_tujuan_list || []),
          report_ids: typeof d.report_ids === 'string' ? JSON.parse(d.report_ids) : (d.report_ids || []),
          total_koli: Number(d.total_koli || 0),
          armada: d.armada || '',
          no_polisi: d.no_polisi || '',
          catatan: d.catatan_kirim || d.catatan || '',
          foto_urls: parsedPhotos,
          foto_bukti_surat_jalan: d.foto_bukti_surat_jalan || '',
          status: d.status === 'cancelled' ? 'cancelled' : 'active',
          created_by_nama: d.pic_nama || d.created_by_nama || 'Petugas Gudang',
          created_by_username: d.pic_username || d.created_by_username || 'operator',
          created_at: d.created_at || new Date().toISOString(),
        };
      });

      saveTripsToCache(remoteTrips);
      return remoteTrips;
    }
  } catch (e) {
    console.warn('Supabase fetch pengiriman_store_trips error, fallback to cache:', e);
  }

  return getCachedTrips();
}

export async function savePengirimanStoreReport(
  reportData: Omit<PengirimanStoreReport, 'id' | 'created_at' | 'updated_at' | 'status'>
): Promise<{ success: boolean; data?: PengirimanStoreReport; message: string }> {
  try {
    const id = generateReportId();
    const nowIso = new Date().toISOString();

    // Pastikan hitung_koli valid:
    // Jika satuan Pcs -> gunakan hitung_koli jika sudah ditentukan (>= 1), default 1.
    // Jika satuan Koli -> qty koli.
    const sanitizedItems: PengirimanStoreItem[] = reportData.items.map((item, idx) => {
      const rawQty = Math.max(1, Number(item.qty) || 1);
      const isPcs = item.satuan === 'Pcs';
      const customKoli = Number(item.hitung_koli);
      const hitungKoli = isPcs
        ? Number.isFinite(customKoli) && customKoli >= 1
          ? Math.round(customKoli)
          : 1
        : Math.max(1, Math.round(rawQty));

      return {
        id: item.id || `item-${Date.now()}-${idx}`,
        store_tujuan: item.store_tujuan,
        no_surat_jalan: item.no_surat_jalan?.trim() || 'Tidak ada no surat jalan',
        deskripsi: item.deskripsi?.trim() || `Barang #${idx + 1}`,
        qty: rawQty,
        satuan: item.satuan || 'Pcs',
        hitung_koli: hitungKoli,
        is_estimated_koli: isPcs ? Boolean(item.is_estimated_koli) : false,
        source_type: item.source_type,
        keterangan: item.keterangan || '',
        foto_barang: item.foto_barang,
      };
    });

    const totalKoli = sanitizedItems.reduce((acc, curr) => acc + curr.hitung_koli, 0);

    const newReport: PengirimanStoreReport = {
      ...reportData,
      id,
      items: sanitizedItems,
      total_item_count: sanitizedItems.length,
      total_koli: totalKoli,
      foto_urls: reportData.foto_urls || [],
      status: 'dispatched',
      created_at: nowIso,
      updated_at: nowIso,
    };

    // Save to local cache immediately
    const cached = getCachedReports();
    const updated = [newReport, ...cached];
    saveReportsToCache(updated);

    // Try saving to Supabase
    try {
      await supabaseFetch(
        'pengiriman_store_reports',
        'POST',
        [{
          id: newReport.id,
          store_tujuan_id: newReport.store_tujuan_id || null,
          store_tujuan: newReport.store_tujuan,
          tanggal_laporan: newReport.tanggal_laporan,
          items: JSON.stringify(newReport.items),
          total_item_count: newReport.total_item_count,
          total_koli: newReport.total_koli,
          pic_nama: newReport.pic_nama,
          pic_username: newReport.pic_username,
          status: 'dispatched',
          foto_urls: JSON.stringify(newReport.foto_urls || []),
          created_at: newReport.created_at,
          updated_at: newReport.updated_at,
        }]
      );
    } catch (e) {
      console.warn('Simpan Supabase tertunda (tersimpan lokal):', e);
    }

    return {
      success: true,
      data: newReport,
      message: `Laporan pengiriman ke ${newReport.store_tujuan} berhasil dibuat (${newReport.total_koli} Koli). Masuk ke antrean Dispatched!`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Gagal menyimpan laporan pengiriman store',
    };
  }
}

/**
 * Simpan batch barang pengiriman (bisa banyak barang & berbagai store dalam 1x submit).
 * Mengelompokkan barang berdasarkan store_tujuan secara otomatis.
 */
export async function savePengirimanStoreBatch(payload: {
  items: Array<{
    store_tujuan: string;
    no_surat_jalan?: string;
    deskripsi: string;
    qty: number | '';
    satuan: 'Pcs' | 'Koli';
    keterangan?: string;
    foto_barang?: string;
    foto_urls?: string[];
  }>;
  foto_urls?: string[];
  pic_nama: string;
  pic_username: string;
}): Promise<{ success: boolean; reports: PengirimanStoreReport[]; message: string }> {
  try {
    if (!payload.items || payload.items.length === 0) {
      return { success: false, reports: [], message: 'Tidak ada barang untuk disimpan' };
    }

    const timestampLaporan = getSubmitTimestamp();
    const nowIso = new Date().toISOString();
    const actorUser = {
      name: payload.pic_nama || 'Petugas Gudang',
      username: payload.pic_username || 'operator',
    };

    // Muat laporan terbaru untuk proteksi gabung otomatis (anti-duplikat No SJ pada Dispatched)
    const existingReports = await fetchPengirimanStoreReports();
    const dispatchedBySj = new Map<string, PengirimanStoreReport>();
    existingReports.forEach((rep) => {
      if (rep.status !== 'dispatched') return;
      (rep.items || []).forEach((it) => {
        const key = normalizeNoSjKey(it.no_surat_jalan);
        if (key && !dispatchedBySj.has(key)) {
          dispatchedBySj.set(key, rep);
        }
      });
    });

    const mergedReportsMap = new Map<string, PengirimanStoreReport>();
    const remainingItems: typeof payload.items = [];

    for (let idx = 0; idx < payload.items.length; idx++) {
      const item = payload.items[idx];
      const sjKey = normalizeNoSjKey(item.no_surat_jalan);
      const existingDispatched = sjKey ? dispatchedBySj.get(sjKey) : undefined;

      if (existingDispatched && sjKey) {
        const currentReport = mergedReportsMap.get(existingDispatched.id) || existingDispatched;
        const rawQty = Math.max(1, Number(item.qty) || 1);
        const isPcs = item.satuan === 'Pcs';
        const manualKoli = isPcs ? 1 : Math.max(1, Math.round(rawQty));
        const normalizedStore =
          getFullStoreName(item.store_tujuan?.trim() || '') ||
          item.store_tujuan?.trim() ||
          currentReport.store_tujuan;
        const incomingPhoto = item.foto_barang || (item.foto_urls && item.foto_urls[0]) || '';

        const updatedItems: PengirimanStoreItem[] = (currentReport.items || []).map((exItem) => {
          if (normalizeNoSjKey(exItem.no_surat_jalan) !== sjKey) return exItem;
          const cleanManualDesc = item.deskripsi?.trim();
          const finalKoli = isPcs
            ? Math.max(1, Math.round(Number(exItem.hitung_koli) || 1))
            : manualKoli;
          return {
            ...exItem,
            store_tujuan: normalizedStore,
            no_surat_jalan: item.no_surat_jalan?.trim() || exItem.no_surat_jalan,
            deskripsi: cleanManualDesc || exItem.deskripsi,
            qty: rawQty,
            satuan: item.satuan || exItem.satuan,
            hitung_koli: finalKoli,
            is_estimated_koli: false,
            foto_barang: incomingPhoto || exItem.foto_barang || '',
            keterangan: item.keterangan !== undefined ? item.keterangan : exItem.keterangan || '',
          };
        });

        const nextPhotos = Array.from(
          new Set([
            ...(currentReport.foto_urls || []),
            ...(item.foto_urls || []),
            ...(incomingPhoto ? [incomingPhoto] : []),
            ...(payload.foto_urls || []),
          ])
        ).filter(Boolean);

        const editRes = await editPengirimanStoreReportFull(
          currentReport.id,
          {
            store_tujuan: normalizedStore,
            items: updatedItems,
            foto_urls: nextPhotos,
          },
          actorUser
        );

        if (editRes.success && editRes.data) {
          mergedReportsMap.set(currentReport.id, editRes.data);
          dispatchedBySj.set(sjKey, editRes.data);
        }
      } else {
        remainingItems.push(item);
      }
    }

    const mergedReports = Array.from(mergedReportsMap.values());

    // Kelompokkan items baru (yang belum ada di Dispatched) per store_tujuan
    const storeGroups: Record<string, (PengirimanStoreItem & { _item_photos?: string[] })[]> = {};

    remainingItems.forEach((item, idx) => {
      const storeName =
        getFullStoreName(item.store_tujuan?.trim() || '') ||
        item.store_tujuan?.trim() ||
        'Store Belum Ditentukan';
      if (!storeGroups[storeName]) {
        storeGroups[storeName] = [];
      }

      const rawQty = Math.max(1, Number(item.qty) || 1);
      const isPcs = item.satuan === 'Pcs';
      const hitungKoli = isPcs ? 1 : Math.max(1, Math.round(rawQty));

      storeGroups[storeName].push({
        id: `item-${Date.now()}-${idx}`,
        store_tujuan: storeName,
        no_surat_jalan: item.no_surat_jalan?.trim() || 'Tidak ada no surat jalan',
        deskripsi: item.deskripsi?.trim() || `Barang #${idx + 1}`,
        qty: rawQty,
        satuan: item.satuan || 'Pcs',
        hitung_koli: hitungKoli,
        is_estimated_koli: false,
        source_type: 'manual',
        keterangan: item.keterangan || '',
        foto_barang: item.foto_barang || '',
        _item_photos: item.foto_urls || (item.foto_barang ? [item.foto_barang] : []),
      });
    });

    const newReports: PengirimanStoreReport[] = [];
    const stores = Object.keys(storeGroups);

    for (const storeName of stores) {
      const itemsForStore = storeGroups[storeName];
      const totalKoli = itemsForStore.reduce((acc, curr) => acc + curr.hitung_koli, 0);
      const reportId = generateReportId();

      // Kumpulkan foto spesifik HANYA milik store tujuan ini
      const storePhotos = Array.from(
        new Set([
          ...itemsForStore.flatMap((it) => it._item_photos || []),
          ...(payload.foto_urls && stores.length === 1 ? payload.foto_urls : []),
        ])
      ).filter(Boolean);

      // Hapus properti internal _item_photos sebelum disimpan
      const sanitizedItems: PengirimanStoreItem[] = itemsForStore.map(({ _item_photos, ...rest }) => rest);

      const rep: PengirimanStoreReport = {
        id: reportId,
        store_tujuan: storeName,
        tanggal_laporan: timestampLaporan,
        items: sanitizedItems,
        total_item_count: sanitizedItems.length,
        total_koli: totalKoli,
        foto_urls: storePhotos,
        pic_nama: payload.pic_nama,
        pic_username: payload.pic_username,
        status: 'dispatched',
        created_at: nowIso,
        updated_at: nowIso,
      };

      newReports.push(rep);
    }

    if (newReports.length > 0) {
      // Simpan ke local storage
      const cached = getCachedReports();
      const updatedAll = [...newReports, ...cached];
      saveReportsToCache(updatedAll);

      // Sync ke Supabase di latar belakang
      try {
        const dbPayloads = newReports.map((r) => ({
          id: r.id,
          store_tujuan_id: r.store_tujuan_id || null,
          store_tujuan: r.store_tujuan,
          tanggal_laporan: r.tanggal_laporan,
          items: JSON.stringify(r.items),
          total_item_count: r.total_item_count,
          total_koli: r.total_koli,
          pic_nama: r.pic_nama,
          pic_username: r.pic_username,
          status: 'dispatched',
          foto_urls: JSON.stringify(r.foto_urls || []),
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));

        await supabaseFetch('pengiriman_store_reports', 'POST', dbPayloads);
      } catch (err) {
        console.warn('Simpan batch ke Supabase tertunda (tersimpan lokal):', err);
      }
    }

    const allAffectedReports = [...mergedReports, ...newReports];
    const totalKoliAll = allAffectedReports.reduce((acc, r) => acc + r.total_koli, 0);

    notifyPengirimanStoreUpdated({
      action: 'batch_saved',
      created: newReports.length,
      merged: mergedReports.length,
    });

    let message = '';
    if (mergedReports.length > 0 && newReports.length > 0) {
      message = `${mergedReports.length} SJ digabungkan & diperbarui ke antrean Dispatched, plus ${newReports.length} laporan baru dibuat (${totalKoliAll} Koli total).`;
    } else if (mergedReports.length > 0) {
      message = `${mergedReports.length} No SJ yang sama berhasil digabungkan & diperbarui di antrean Dispatched (${totalKoliAll} Koli aktual, 0 duplikat).`;
    } else {
      const storeSummary = stores.join(', ');
      message = `Berhasil membuat ${newReports.length} laporan (${totalKoliAll} Koli) untuk ${storeSummary}. Masuk ke antrean Dispatched!`;
    }

    return {
      success: true,
      reports: allAffectedReports,
      message,
    };
  } catch (error: any) {
    return {
      success: false,
      reports: [],
      message: error?.message || 'Gagal menyimpan batch pengiriman',
    };
  }
}

export async function processKirimStoreReports(payload: {
  report_ids: string[];
  tanggal_kirim: string;
  waktu_kirim: string;
  dikirim_oleh: string;
  armada?: string;
  no_polisi?: string;
  catatan?: string;
  foto_urls?: string[];
  pic_nama: string;
  pic_username: string;
}): Promise<{ success: boolean; trip?: PengirimanStoreTrip; count: number; message: string }> {
  try {
    if (!payload.report_ids || payload.report_ids.length === 0) {
      return { success: false, count: 0, message: 'Pilih minimal 1 laporan dispatched untuk dikirim' };
    }

    const cached = getCachedReports();
    const tripId = generateTripId();
    const nowIso = new Date().toISOString();

    const cleanTripPhotos = Array.from(
      new Set((payload.foto_urls || []).map((u) => String(u || '').trim()).filter(Boolean))
    );
    const serializedTripPhotos = cleanTripPhotos.length > 0 ? JSON.stringify(cleanTripPhotos) : '';

    const storeTujuanSet = new Set<string>();
    let totalKoliTrip = 0;

    // Update matching reports to status 'sent'
    const updatedReports = cached.map((r) => {
      if (payload.report_ids.includes(r.id)) {
        storeTujuanSet.add(r.store_tujuan);
        totalKoliTrip += r.total_koli;
        return {
          ...r,
          status: 'sent' as const,
          trip_id: tripId,
          tanggal_kirim: payload.tanggal_kirim,
          waktu_kirim: payload.waktu_kirim,
          dikirim_oleh: payload.dikirim_oleh,
          armada: payload.armada,
          no_polisi: payload.no_polisi,
          catatan_kirim: payload.catatan,
          updated_at: nowIso,
        };
      }
      return r;
    });

    saveReportsToCache(updatedReports);

    // Create Trip Record
    const tripRecord: PengirimanStoreTrip = {
      id: tripId,
      tanggal_kirim: payload.tanggal_kirim,
      waktu_kirim: payload.waktu_kirim,
      dikirim_oleh: payload.dikirim_oleh,
      store_tujuan_list: Array.from(storeTujuanSet),
      report_ids: payload.report_ids,
      total_koli: totalKoliTrip,
      armada: payload.armada,
      no_polisi: payload.no_polisi,
      catatan: payload.catatan,
      foto_urls: cleanTripPhotos,
      foto_bukti_surat_jalan: serializedTripPhotos,
      status: 'active',
      created_by_nama: payload.pic_nama,
      created_by_username: payload.pic_username,
      created_at: nowIso,
    };

    const cachedTrips = getCachedTrips();
    saveTripsToCache([tripRecord, ...cachedTrips]);

    // Sync Trip and matching Reports to Supabase
    // 1. UPDATE STATUS OF REPORTS TO 'sent' FIRST (CRITICAL SO IT'S NOT LOST)
    for (const reportId of payload.report_ids) {
      try {
        await supabaseFetch(
          'pengiriman_store_reports',
          'PATCH',
          {
            status: 'sent',
            trip_id: tripId,
            tanggal_kirim: payload.tanggal_kirim,
            waktu_kirim: payload.waktu_kirim,
            dikirim_oleh: payload.dikirim_oleh,
            armada: payload.armada || null,
            no_polisi: payload.no_polisi || null,
            catatan_kirim: payload.catatan || null,
            updated_at: nowIso,
          },
          `id=eq.${reportId}`
        );
      } catch (repErr) {
        console.warn(`Supabase update status report ${reportId} ke sent sync offline:`, repErr);
      }
    }

    // 2. Insert Trip to Supabase (Independent, failure here won't revert reports)
    try {
      await supabaseFetch('pengiriman_store_trips', 'POST', [
        {
          id: tripRecord.id,
          tanggal_kirim: tripRecord.tanggal_kirim,
          dikirim_oleh: tripRecord.dikirim_oleh,
          armada: tripRecord.armada || '',
          no_polisi: tripRecord.no_polisi || '',
          catatan_kirim: tripRecord.catatan || '',
          foto_bukti_surat_jalan: serializedTripPhotos,
          status: 'in_transit',
          report_ids: JSON.stringify(tripRecord.report_ids),
          pic_nama: tripRecord.created_by_nama,
          pic_username: tripRecord.created_by_username,
          created_at: tripRecord.created_at,
          updated_at: nowIso,
        },
      ]);
    } catch (tripErr) {
      console.warn('Supabase insert pengiriman_store_trips sync offline (non-fatal):', tripErr);
    }

    return {
      success: true,
      trip: tripRecord,
      count: payload.report_ids.length,
      message: `Berhasil mengirim ${payload.report_ids.length} laporan (${totalKoliTrip} Koli) ke ${Array.from(storeTujuanSet).join(', ')} oleh ${payload.dikirim_oleh}!`,
    };
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      message: err.message || 'Gagal memproses pengiriman',
    };
  }
}

export async function deletePengirimanStoreReport(reportId: string): Promise<{ success: boolean; message: string }> {
  try {
    const cached = getCachedReports();
    const updated = cached.filter((r) => r.id !== reportId);
    saveReportsToCache(updated);

    try {
      await supabaseFetch(
        'pengiriman_store_reports',
        'DELETE',
        null,
        `id=eq.${reportId}`
      );
    } catch (e) {
      console.warn('Gagal hapus di Supabase, fallback lokal:', e);
    }

    return { success: true, message: 'Laporan pengiriman berhasil dihapus' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal menghapus laporan pengiriman' };
  }
}

/**
 * Edit data pengiriman store (misal: dikirim_oleh, catatan, tanggal_kirim).
 * Mencatat riwayat edit ke dalam audit_logs.
 */
export async function editPengirimanStoreReport(
  reportId: string,
  updateData: {
    dikirim_oleh?: string;
    catatan_kirim?: string;
    tanggal_kirim?: string;
  },
  user: { name: string; username: string }
): Promise<{ success: boolean; data?: PengirimanStoreReport; message: string }> {
  try {
    const cached = getCachedReports();
    const target = cached.find((r) => r.id === reportId);
    if (!target) {
      return { success: false, message: 'Data pengiriman tidak ditemukan' };
    }

    const nowIso = new Date().toISOString();
    const previous = {
      dikirim_oleh: target.dikirim_oleh,
      catatan_kirim: target.catatan_kirim,
      tanggal_kirim: target.tanggal_kirim,
    };

    const auditEntry: PengirimanAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      user_nama: user.name,
      user_username: user.username,
      action: 'edit',
      keterangan: `Mengubah info pengiriman: Dikirim Oleh="${updateData.dikirim_oleh ?? target.dikirim_oleh}", Catatan="${updateData.catatan_kirim ?? target.catatan_kirim}"`,
      previous_data: previous,
      new_data: updateData,
    };

    const updatedReports = cached.map((r) => {
      if (r.id === reportId) {
        return {
          ...r,
          ...updateData,
          audit_logs: [auditEntry, ...(r.audit_logs || [])],
          updated_at: nowIso,
        };
      }
      return r;
    });

    saveReportsToCache(updatedReports);

    // Sync to Supabase
    try {
      await supabaseFetch(
        'pengiriman_store_reports',
        'PATCH',
        {
          dikirim_oleh: updateData.dikirim_oleh ?? target.dikirim_oleh,
          catatan_kirim: updateData.catatan_kirim ?? target.catatan_kirim,
          tanggal_kirim: updateData.tanggal_kirim ?? target.tanggal_kirim,
          updated_at: nowIso,
        },
        `id=eq.${reportId}`
      );
    } catch (e) {
      console.warn('Sync update edit ke Supabase tertunda:', e);
    }

    const updatedData = updatedReports.find((r) => r.id === reportId);
    return {
      success: true,
      data: updatedData,
      message: 'Data pengiriman berhasil diperbarui',
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal mengubah data pengiriman' };
  }
}

/**
 * Edit lengkap data pengiriman store di antrean Dispatched (Store tujuan, Item rincian, Foto, dll.)
 */
export async function editPengirimanStoreReportFull(
  reportId: string,
  updateData: {
    store_tujuan?: string;
    items?: PengirimanStoreItem[];
    foto_urls?: string[];
    tanggal_laporan?: string;
  },
  user: { name: string; username: string }
): Promise<{ success: boolean; data?: PengirimanStoreReport; message: string }> {
  try {
    const cached = getCachedReports();
    const target = cached.find((r) => r.id === reportId);
    if (!target) {
      return { success: false, message: 'Data laporan pengiriman tidak ditemukan' };
    }

    const nowIso = new Date().toISOString();
    const newItems = updateData.items || target.items;
    const sanitizedItems: PengirimanStoreItem[] = newItems.map((item, idx) => {
      const rawQty = Math.max(1, Number(item.qty) || 1);
      const isPcs = item.satuan === 'Pcs';
      const customKoli = Number(item.hitung_koli);
      const hitungKoli = isPcs
        ? Number.isFinite(customKoli) && customKoli >= 1
          ? Math.round(customKoli)
          : 1
        : Math.max(1, Math.round(rawQty));

      return {
        id: item.id || `item-${Date.now()}-${idx}`,
        store_tujuan: item.store_tujuan,
        no_surat_jalan: item.no_surat_jalan?.trim() || 'Tidak ada no surat jalan',
        deskripsi: item.deskripsi?.trim() || `Barang #${idx + 1}`,
        qty: rawQty,
        satuan: item.satuan || 'Pcs',
        hitung_koli: hitungKoli,
        is_estimated_koli: isPcs ? Boolean(item.is_estimated_koli) : false,
        source_type: item.source_type,
        keterangan: item.keterangan || '',
        foto_barang: item.foto_barang,
      };
    });

    const totalKoli = sanitizedItems.reduce((acc, curr) => acc + curr.hitung_koli, 0);

    const auditEntry: PengirimanAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      user_nama: user.name,
      user_username: user.username,
      action: 'edit',
      keterangan: `Mengedit data laporan dispatched: Store="${updateData.store_tujuan ?? target.store_tujuan}", Total=${sanitizedItems.length} item (${totalKoli} koli)`,
      previous_data: {
        store_tujuan: target.store_tujuan,
        total_koli: target.total_koli,
        items: target.items,
      },
      new_data: {
        store_tujuan: updateData.store_tujuan ?? target.store_tujuan,
        total_koli: totalKoli,
        items: sanitizedItems,
      },
    };

    const updatedReport: PengirimanStoreReport = {
      ...target,
      store_tujuan: updateData.store_tujuan ?? target.store_tujuan,
      items: sanitizedItems,
      total_item_count: sanitizedItems.length,
      total_koli: totalKoli,
      foto_urls: updateData.foto_urls ?? target.foto_urls,
      tanggal_laporan: updateData.tanggal_laporan ?? target.tanggal_laporan,
      audit_logs: [auditEntry, ...(target.audit_logs || [])],
      updated_at: nowIso,
    };

    const updatedReports = cached.map((r) => (r.id === reportId ? updatedReport : r));
    saveReportsToCache(updatedReports);

    // Sync to Supabase
    try {
      await supabaseFetch(
        'pengiriman_store_reports',
        'PATCH',
        {
          store_tujuan: updatedReport.store_tujuan,
          items: JSON.stringify(updatedReport.items),
          total_item_count: updatedReport.total_item_count,
          total_koli: updatedReport.total_koli,
          foto_urls: JSON.stringify(updatedReport.foto_urls || []),
          tanggal_laporan: updatedReport.tanggal_laporan,
          audit_logs: JSON.stringify(updatedReport.audit_logs || []),
          updated_at: nowIso,
        },
        `id=eq.${reportId}`
      );
    } catch (e) {
      console.warn('Sync edit report ke Supabase tertunda (tersimpan lokal):', e);
    }

    return {
      success: true,
      data: updatedReport,
      message: `Laporan ${reportId} berhasil diperbarui!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menyimpan perubahan laporan',
    };
  }
}

/**
 * Tandai label koli laporan sudah dicetak
 */
export async function markReportsLabelAsPrinted(reportIds: string[]): Promise<void> {
  if (!reportIds || reportIds.length === 0) return;
  const nowIso = new Date().toISOString();

  // 1. Update cache lokal
  const cached = getCachedReports();
  const updated = cached.map((r) => {
    if (reportIds.includes(r.id)) {
      return {
        ...r,
        is_label_printed: true,
        label_printed_at: nowIso,
        updated_at: nowIso,
      };
    }
    return r;
  });
  saveReportsToCache(updated);

  // 2. Sync ke Supabase di background
  for (const rid of reportIds) {
    try {
      await supabaseFetch(
        'pengiriman_store_reports',
        'PATCH',
        {
          is_label_printed: true,
          label_printed_at: nowIso,
          updated_at: nowIso,
        },
        `id=eq.${rid}`
      );
    } catch (e) {
      console.warn('Sync is_label_printed ke Supabase tertunda:', e);
    }
  }
}

/**
 * Batalkan pengiriman (Cancel Pengiriman).
 * Mengembalikan status pengiriman kembali ke 'dispatched' agar barang kembali ke antrean ready kirim,
 * serta mencatat riwayat pembatalan beserta alasan ke dalam audit_logs.
 */
export async function cancelPengirimanStoreReport(
  reportId: string,
  reason: string,
  user: { name: string; username: string }
): Promise<{ success: boolean; data?: PengirimanStoreReport; message: string }> {
  try {
    const cached = getCachedReports();
    const target = cached.find((r) => r.id === reportId);
    if (!target) {
      return { success: false, message: 'Data pengiriman tidak ditemukan' };
    }

    const nowIso = new Date().toISOString();
    const auditEntry: PengirimanAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      user_nama: user.name,
      user_username: user.username,
      action: 'cancel',
      keterangan: `Pengiriman dibatalkan. Alasan: ${reason || 'Tidak ada keterangan'}. Barang dikembalikan ke antrean Dispatched.`,
      previous_data: {
        status: target.status,
        dikirim_oleh: target.dikirim_oleh,
        tanggal_kirim: target.tanggal_kirim,
      },
      new_data: {
        status: 'dispatched',
        cancel_reason: reason,
        cancelled_at: nowIso,
        cancelled_by: user.name,
      },
    };

    const updatedReports = cached.map((r) => {
      if (r.id === reportId) {
        return {
          ...r,
          status: 'dispatched' as const, // Kembalikan ke dispatched!
          cancel_reason: reason,
          cancelled_at: nowIso,
          cancelled_by: user.name,
          audit_logs: [auditEntry, ...(r.audit_logs || [])],
          updated_at: nowIso,
        };
      }
      return r;
    });

    saveReportsToCache(updatedReports);

    // Sync to Supabase
    try {
      await supabaseFetch(
        'pengiriman_store_reports',
        'PATCH',
        {
          status: 'dispatched',
          updated_at: nowIso,
        },
        `id=eq.${reportId}`
      );
    } catch (e) {
      console.warn('Sync cancel ke Supabase tertunda:', e);
    }

    const updatedData = updatedReports.find((r) => r.id === reportId);
    return {
      success: true,
      data: updatedData,
      message: `Pengiriman ke ${target.store_tujuan} berhasil dibatalkan. Barang telah dikembalikan ke tab Dispatched.`,
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal membatalkan pengiriman' };
  }
}

/**
 * Batalkan seluruh Surat Jalan Pengiriman (Trip / Batch).
 * Seluruh Surat Jalan Barang di dalamnya otomatis kembali ke status 'dispatched'
 * dan muncul kembali di antrean siap kirim.
 */
export async function cancelSuratJalanPengirimanTrip(
  tripId: string,
  reason: string,
  user: { name: string; username?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const cachedTrips = getCachedTrips();
    const cachedReports = getCachedReports();
    const nowIso = new Date().toISOString();

    const targetTrip = cachedTrips.find((t) => t.id === tripId);
    const affectedReportIds = new Set<string>();

    if (targetTrip?.report_ids && Array.isArray(targetTrip.report_ids)) {
      targetTrip.report_ids.forEach((id) => affectedReportIds.add(id));
    }
    // Also include any reports referencing this trip_id
    cachedReports.forEach((r) => {
      if (r.trip_id === tripId) affectedReportIds.add(r.id);
    });

    const auditEntry: PengirimanAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      user_nama: user.name,
      user_username: user.username || 'operator',
      action: 'cancel',
      keterangan: `Surat Jalan Pengiriman ${tripId} dibatalkan. Alasan: ${reason || 'Tidak ada alasan'}. Seluruh barang otomatis dikembalikan ke status Dispatched.`,
      new_data: { status: 'dispatched' },
    };

    // 1. Revert all member reports back to 'dispatched'
    const updatedReports = cachedReports.map((r) => {
      if (affectedReportIds.has(r.id)) {
        return {
          ...r,
          status: 'dispatched' as const,
          trip_id: undefined,
          tanggal_kirim: undefined,
          waktu_kirim: undefined,
          dikirim_oleh: undefined,
          cancel_reason: reason,
          cancelled_at: nowIso,
          cancelled_by: user.name,
          audit_logs: [auditEntry, ...(r.audit_logs || [])],
          updated_at: nowIso,
        };
      }
      return r;
    });
    saveReportsToCache(updatedReports);

    // 2. Mark Trip as cancelled
    const updatedTrips = cachedTrips.map((t) => {
      if (t.id === tripId) {
        return {
          ...t,
          status: 'cancelled' as const,
          cancel_reason: reason,
          cancelled_at: nowIso,
          cancelled_by: user.name,
          report_ids: [],
          total_koli: 0,
        };
      }
      return t;
    });
    saveTripsToCache(updatedTrips);

    // 3. Sync to Supabase
    for (const repId of affectedReportIds) {
      try {
        await supabaseFetch(
          'pengiriman_store_reports',
          'PATCH',
          {
            status: 'dispatched',
            trip_id: null,
            updated_at: nowIso,
          },
          `id=eq.${repId}`
        );
      } catch (e) {
        console.warn(`Gagal sync cancel report ${repId} ke Supabase:`, e);
      }
    }

    try {
      await supabaseFetch(
        'pengiriman_store_trips',
        'PATCH',
        {
          status: 'cancelled',
          updated_at: nowIso,
        },
        `id=eq.${tripId}`
      );
    } catch (e) {
      console.warn(`Gagal sync cancel trip ${tripId} ke Supabase:`, e);
    }

    return {
      success: true,
      message: `Surat Jalan Pengiriman ${tripId} berhasil dibatalkan. ${affectedReportIds.size} laporan barang telah dikembalikan ke status Dispatched!`,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal membatalkan Surat Jalan Pengiriman' };
  }
}

/**
 * Keluarkan satu laporan barang dari Surat Jalan Pengiriman.
 * Barang yang dikeluarkan otomatis kembali ke status 'dispatched'.
 */
export async function removeReportFromSuratJalanPengiriman(
  tripId: string,
  reportId: string,
  reason: string,
  user: { name: string; username?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const cachedTrips = getCachedTrips();
    const cachedReports = getCachedReports();
    const nowIso = new Date().toISOString();

    const targetReport = cachedReports.find((r) => r.id === reportId);
    if (!targetReport) {
      return { success: false, message: 'Laporan barang tidak ditemukan' };
    }

    const auditEntry: PengirimanAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      user_nama: user.name,
      user_username: user.username || 'operator',
      action: 'cancel',
      keterangan: `Barang dikeluarkan dari Surat Jalan Pengiriman ${tripId}. Alasan: ${reason || 'Dibatalkan kirim'}. Otomatis kembali ke antrean Dispatched.`,
      new_data: { status: 'dispatched' },
    };

    // 1. Revert report to dispatched
    const updatedReports = cachedReports.map((r) => {
      if (r.id === reportId) {
        return {
          ...r,
          status: 'dispatched' as const,
          trip_id: undefined,
          tanggal_kirim: undefined,
          waktu_kirim: undefined,
          dikirim_oleh: undefined,
          cancel_reason: reason,
          cancelled_at: nowIso,
          cancelled_by: user.name,
          audit_logs: [auditEntry, ...(r.audit_logs || [])],
          updated_at: nowIso,
        };
      }
      return r;
    });
    saveReportsToCache(updatedReports);

    // 2. Update Trip
    const updatedTrips = cachedTrips.map((t) => {
      if (t.id === tripId) {
        const nextReportIds = (t.report_ids || []).filter((id) => id !== reportId);
        const nextKoli = Math.max(0, (t.total_koli || 0) - targetReport.total_koli);
        return {
          ...t,
          report_ids: nextReportIds,
          total_koli: nextKoli,
          status: nextReportIds.length === 0 ? ('cancelled' as const) : t.status,
        };
      }
      return t;
    });
    saveTripsToCache(updatedTrips);

    // 3. Sync to Supabase
    try {
      await supabaseFetch(
        'pengiriman_store_reports',
        'PATCH',
        {
          status: 'dispatched',
          trip_id: null,
          updated_at: nowIso,
        },
        `id=eq.${reportId}`
      );
    } catch (e) {
      console.warn(`Gagal sync revert report ${reportId} ke Supabase:`, e);
    }

    try {
      const remainingTrip = updatedTrips.find((t) => t.id === tripId);
      if (remainingTrip) {
        await supabaseFetch(
          'pengiriman_store_trips',
          'PATCH',
          {
            report_ids: JSON.stringify(remainingTrip.report_ids),
            total_koli: remainingTrip.total_koli,
            status: remainingTrip.status,
            updated_at: nowIso,
          },
          `id=eq.${tripId}`
        );
      }
    } catch (e) {
      console.warn(`Gagal sync update trip ${tripId} ke Supabase:`, e);
    }

    return {
      success: true,
      message: `Barang ${reportId} berhasil dikeluarkan dan otomatis kembali ke tab Dispatched!`,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal mengeluarkan barang dari pengiriman' };
  }
}

/**
 * Edit Surat Jalan Pengiriman (Tanggal Kirim, Driver / Kurir, Catatan, Armada, serta mengeluarkan barang tertentu).
 */
export async function editSuratJalanPengirimanTrip(
  tripId: string,
  updateData: {
    tanggal_kirim?: string;
    dikirim_oleh?: string;
    armada?: string;
    no_polisi?: string;
    catatan?: string;
    foto_urls?: string[];
    removeReportIds?: string[];
  },
  user: { name: string; username?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const cachedTrips = getCachedTrips();
    const cachedReports = getCachedReports();
    const nowIso = new Date().toISOString();

    const targetTrip = cachedTrips.find((t) => t.id === tripId);
    if (!targetTrip) {
      return { success: false, message: 'Surat Jalan Pengiriman tidak ditemukan' };
    }

    const hasPhotoUpdate = updateData.foto_urls !== undefined;
    const cleanTripPhotos = hasPhotoUpdate
      ? Array.from(new Set((updateData.foto_urls || []).map((u) => String(u || '').trim()).filter(Boolean)))
      : undefined;
    const serializedTripPhotos = hasPhotoUpdate
      ? (cleanTripPhotos && cleanTripPhotos.length > 0 ? JSON.stringify(cleanTripPhotos) : '')
      : undefined;

    const removeSet = new Set(updateData.removeReportIds || []);

    // 1. If any reports are to be removed, revert them to 'dispatched'
    if (removeSet.size > 0) {
      for (const repId of removeSet) {
        await removeReportFromSuratJalanPengiriman(tripId, repId, 'Dikeluarkan saat edit Surat Jalan Pengiriman', user);
      }
    }

    // Refresh caches after potential removals
    const freshTrips = getCachedTrips();
    const freshReports = getCachedReports();

    // 2. Update remaining member reports
    const memberReports = freshReports.filter(
      (r) => (targetTrip.report_ids?.includes(r.id) || r.trip_id === tripId) && !removeSet.has(r.id)
    );

    const updatedReports = freshReports.map((r) => {
      if (memberReports.some((m) => m.id === r.id)) {
        return {
          ...r,
          tanggal_kirim: updateData.tanggal_kirim ?? r.tanggal_kirim,
          dikirim_oleh: updateData.dikirim_oleh ?? r.dikirim_oleh,
          armada: updateData.armada ?? r.armada,
          no_polisi: updateData.no_polisi ?? r.no_polisi,
          catatan_kirim: updateData.catatan ?? r.catatan_kirim,
          updated_at: nowIso,
        };
      }
      return r;
    });
    saveReportsToCache(updatedReports);

    // 3. Update Trip
    const updatedTrips = freshTrips.map((t) => {
      if (t.id === tripId) {
        return {
          ...t,
          tanggal_kirim: updateData.tanggal_kirim ?? t.tanggal_kirim,
          dikirim_oleh: updateData.dikirim_oleh ?? t.dikirim_oleh,
          armada: updateData.armada ?? t.armada,
          no_polisi: updateData.no_polisi ?? t.no_polisi,
          catatan: updateData.catatan ?? t.catatan,
          ...(hasPhotoUpdate
            ? {
                foto_urls: cleanTripPhotos,
                foto_bukti_surat_jalan: serializedTripPhotos,
              }
            : {}),
          updated_at: nowIso,
        };
      }
      return t;
    });
    saveTripsToCache(updatedTrips);

    // Sync to Supabase
    for (const rep of memberReports) {
      try {
        await supabaseFetch(
          'pengiriman_store_reports',
          'PATCH',
          {
            tanggal_kirim: updateData.tanggal_kirim ?? rep.tanggal_kirim,
            dikirim_oleh: updateData.dikirim_oleh ?? rep.dikirim_oleh,
            armada: updateData.armada ?? rep.armada,
            no_polisi: updateData.no_polisi ?? rep.no_polisi,
            catatan_kirim: updateData.catatan ?? rep.catatan_kirim,
            updated_at: nowIso,
          },
          `id=eq.${rep.id}`
        );
      } catch (e) {
        console.warn(`Sync update report ${rep.id} ke Supabase:`, e);
      }
    }

    try {
      const tripPatchPayload: Record<string, any> = {
        tanggal_kirim: updateData.tanggal_kirim,
        dikirim_oleh: updateData.dikirim_oleh,
        armada: updateData.armada,
        no_polisi: updateData.no_polisi,
        catatan_kirim: updateData.catatan,
        updated_at: nowIso,
      };
      if (hasPhotoUpdate) {
        tripPatchPayload.foto_bukti_surat_jalan = serializedTripPhotos;
      }

      await supabaseFetch(
        'pengiriman_store_trips',
        'PATCH',
        tripPatchPayload,
        `id=eq.${tripId}`
      );
    } catch (e) {
      console.warn(`Sync update trip ${tripId} ke Supabase:`, e);
    }

    return {
      success: true,
      message: `Surat Jalan Pengiriman ${tripId} berhasil diperbarui!`,
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal mengubah Surat Jalan Pengiriman' };
  }
}

/**
 * Hapus / Batalkan barang di antrean Dispatched.
 * Status diubah menjadi 'cancelled' sehingga tidak masuk ke list Kirim dan tidak hilang dari audit trail.
 */
export async function cancelDispatchedReport(
  reportId: string,
  reason: string,
  user: { name: string; username?: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const cached = getCachedReports();
    const target = cached.find((r) => r.id === reportId);
    if (!target) {
      return { success: false, message: 'Laporan barang tidak ditemukan' };
    }

    const nowIso = new Date().toISOString();
    const auditEntry: PengirimanAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: nowIso,
      user_nama: user.name,
      user_username: user.username || 'operator',
      action: 'cancel',
      keterangan: `Laporan di antrean Dispatched dibatalkan (Cancel). Alasan: ${reason || 'Dibatalkan oleh staf'}. Barang tidak dimasukkan ke pengiriman.`,
      previous_data: { status: target.status },
      new_data: { status: 'cancelled' },
    };

    const updated = cached.map((r) => {
      if (r.id === reportId) {
        return {
          ...r,
          status: 'cancelled' as const,
          cancel_reason: reason || 'Dibatalkan dari antrean Dispatched',
          cancelled_at: nowIso,
          cancelled_by: user.name,
          audit_logs: [auditEntry, ...(r.audit_logs || [])],
          updated_at: nowIso,
        };
      }
      return r;
    });

    saveReportsToCache(updated);

    try {
      await supabaseFetch(
        'pengiriman_store_reports',
        'PATCH',
        {
          status: 'cancelled',
          updated_at: nowIso,
        },
        `id=eq.${reportId}`
      );
    } catch (e) {
      console.warn('Sync cancel dispatched report ke Supabase:', e);
    }

    return {
      success: true,
      message: `Laporan ${reportId} berhasil dibatalkan (Status: Cancelled). Barang tidak masuk ke list kirim.`,
    };
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal membatalkan laporan dispatched' };
  }
}

// ==============================================================================
// 3. GENERASI KOLI MARKING LABELS UNTUK CETAK BARCODE / QR
// ==============================================================================

export function generateKoliLabelsForReport(report: PengirimanStoreReport): KoliMarkingLabel[] {
  const labels: KoliMarkingLabel[] = [];

  // 1. Hitung total koli per nomor surat jalan agar penomoran Koli 1/1, 1/2 dll akurat per surat jalan
  const sjKoliTotals: Record<string, number> = {};
  report.items.forEach((item) => {
    const sjKey = (item.no_surat_jalan?.trim() && item.no_surat_jalan.trim() !== 'Tidak ada no surat jalan' && item.no_surat_jalan.trim() !== '-')
      ? item.no_surat_jalan.trim()
      : `_NOSJ_${report.id}`;
    const koliCount = item.hitung_koli || 1;
    sjKoliTotals[sjKey] = (sjKoliTotals[sjKey] || 0) + koliCount;
  });

  const sjKoliCounters: Record<string, number> = {};

  report.items.forEach((item, itemIdx) => {
    const koliCount = item.hitung_koli || 1;
    const rawSJ = item.no_surat_jalan?.trim() || '';
    const hasSJ = rawSJ !== '' && rawSJ !== 'Tidak ada no surat jalan' && rawSJ !== '-';
    const noSJ = hasSJ ? rawSJ : '-';
    const sjKey = hasSJ ? rawSJ : `_NOSJ_${report.id}`;

    const totalKoliForSJ = sjKoliTotals[sjKey] || (report.total_koli || 1);

    for (let i = 1; i <= koliCount; i++) {
      sjKoliCounters[sjKey] = (sjKoliCounters[sjKey] || 0) + 1;
      const koliIndexSJ = sjKoliCounters[sjKey];

      // Kode marking koli: e.g. KLI-09226-K1/1 atau KLI-DSP2609-K1/1
      const cleanSJ = hasSJ ? rawSJ.replace(/[^a-zA-Z0-9]/g, '').slice(-8) : '';
      const cleanReportId = report.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
      const markingCode = `KLI-${cleanSJ || cleanReportId}-K${koliIndexSJ}/${totalKoliForSJ}`;

      // Format qty yang rapi dan tidak redundan
      let qtyDisplay = '';
      if (item.satuan === 'Pcs') {
        qtyDisplay = `${item.qty} Pcs`;
      } else {
        qtyDisplay = koliCount > 1 ? `Koli ${i} dari ${koliCount} (${item.qty} Koli)` : `${item.qty} Koli`;
      }

      const qrDataString = `TOKO: ${report.store_tujuan}
NO SJ: ${noSJ}
BARANG: ${item.deskripsi}
QTY: ${qtyDisplay}
KOLI: ${koliIndexSJ}/${totalKoliForSJ}
TGL: ${report.tanggal_laporan}
KODE: ${markingCode}`;

      const barcodeDataString = markingCode;

      labels.push({
        id: `${report.id}-item${itemIdx}-koli${i}`,
        marking_code: markingCode,
        store_tujuan: report.store_tujuan,
        no_surat_jalan: noSJ,
        deskripsi: item.deskripsi,
        koli_index: koliIndexSJ,
        total_koli_item: koliCount,
        total_koli_report: totalKoliForSJ,
        qty_display: qtyDisplay,
        tanggal: report.tanggal_laporan,
        pic_nama: report.pic_nama,
        qr_data_string: qrDataString,
        barcode_data_string: barcodeDataString,
      });
    }
  });

  return labels;
}

/**
 * Reset / Kosongkan seluruh data transaksi Pengiriman Store (Surat Jalan Barang & Trip Pengiriman).
 * Hanya menghapus riwayat dokumen transaksi loading dock, tidak menghapus stok fisik / log_produk.
 */
export async function resetAllPengirimanStore(): Promise<{ success: boolean; message: string }> {
  try {
    await supabaseFetch('pengiriman_store_reports', 'DELETE', null, 'id=neq.');
  } catch (err) {
    console.warn('Supabase reset pengiriman_store_reports warning:', err);
  }

  try {
    await supabaseFetch('pengiriman_store_trips', 'DELETE', null, 'id=neq.');
  } catch (err) {
    console.warn('Supabase reset pengiriman_store_trips warning:', err);
  }

  try {
    localStorage.removeItem(LOCAL_STORAGE_REPORTS);
    localStorage.removeItem(LOCAL_STORAGE_TRIPS);
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_loading_dock_data_reset', { detail: { type: 'pengiriman_store' } }));
  }

  return {
    success: true,
    message: 'Data pengiriman store (surat jalan barang & trip kirim) berhasil di-reset.',
  };
}

/**
 * Sinkronisasi otomatis & idempoten dari Pengecekan Surat Jalan (status SELESAI, tipe Pengiriman)
 * ke antrean Pengiriman Store > Dispatched dengan estimasi 1 koli = 40 pcs (pembulatan ke atas).
 * Catatan internal selisih pengecekan DILARANG dicantumkan agar store hanya melihat hasil akhirnya saja.
 */
export async function syncPengecekanSjToPengirimanDispatched(
  record: PengecekanSJRecord,
  user: { name: string; username: string }
): Promise<{
  success: boolean;
  action: 'created' | 'updated' | 'already_sent' | 'skipped_penerimaan' | 'skipped_zero_qty' | 'error';
  report?: PengirimanStoreReport;
  estimatedKoli?: number;
  message: string;
}> {
  try {
    const cleanNoSj = String(record.no_sj || '').trim();
    const targetSjKey = normalizeNoSjKey(cleanNoSj);
    if (!targetSjKey) {
      return { success: false, action: 'error', message: 'Nomor Surat Jalan kosong' };
    }

    // Hanya SJ Pengiriman (Gudang -> Store), BUKAN Penerimaan (masuk ke gudang)
    if (isPenerimaanRecord(record)) {
      return {
        success: true,
        action: 'skipped_penerimaan',
        message: 'SJ bertipe Penerimaan dilewati (tidak masuk Pengiriman Store).',
      };
    }

    // Total qty dikirim berdasarkan hasil fisik scan aktual
    const computedFromItems = Array.isArray(record.items)
      ? record.items.reduce((sum, it) => sum + Math.max(0, Number(it.qty_scan) || 0), 0)
      : 0;
    const totalQtyScan =
      typeof record.total_qty_terima === 'number' && record.total_qty_terima > 0
        ? Math.round(record.total_qty_terima)
        : Math.round(computedFromItems);

    if (totalQtyScan <= 0) {
      return {
        success: true,
        action: 'skipped_zero_qty',
        message: `SJ ${cleanNoSj} memiliki qty fisik 0 pcs sehingga tidak dimasukkan ke antrean Dispatched.`,
      };
    }

    const rawDest = String(record.destination || '').trim();
    const normalizedStore = getFullStoreName(rawDest) || rawDest || 'Store Tujuan';
    const estimatedKoli = estimateKoliFromPcs(totalQtyScan, ESTIMATED_PCS_PER_KOLI);

    const activeSkuCount = Array.isArray(record.items)
      ? record.items.filter((it) => (Number(it.qty_scan) || 0) > 0).length
      : Number(record.total_sku) || 0;
    const cleanDeskripsi =
      activeSkuCount > 0
        ? `Barang Pengiriman Store (${activeSkuCount} SKU)`
        : 'Barang Pengiriman Store';

    // Muat data terbaru agar proteksi anti-duplikat akurat lintas perangkat
    const existingReports = await fetchPengirimanStoreReports();
    const matchingReports = existingReports.filter(
      (rep) =>
        rep.status !== 'cancelled' &&
        Array.isArray(rep.items) &&
        rep.items.some((it) => normalizeNoSjKey(it.no_surat_jalan) === targetSjKey)
    );

    // 1. Jika SJ sudah terkirim (status 'sent'), JANGAN buat duplikat baru
    const alreadySent = matchingReports.find((r) => r.status === 'sent');
    if (alreadySent) {
      return {
        success: true,
        action: 'already_sent',
        report: alreadySent,
        estimatedKoli: alreadySent.total_koli,
        message: `SJ ${cleanNoSj} sudah pernah dikirim (${alreadySent.trip_id || alreadySent.id}), tidak dibuat duplikat.`,
      };
    }

    // 2. Jika SJ sudah ada di antrean Dispatched -> GABUNG / LENGKAPI / PERBARUI (tanpa duplikat & tanpa menimpa input manual)
    const existingDispatched = matchingReports.find((r) => r.status === 'dispatched');
    if (existingDispatched) {
      let mergedWithManual = false;
      const updatedItems: PengirimanStoreItem[] = existingDispatched.items.map((it) => {
        if (normalizeNoSjKey(it.no_surat_jalan) !== targetSjKey) return it;
        const isManualEntry =
          it.source_type !== 'pengecekan_sj' ||
          it.satuan === 'Koli' ||
          it.is_estimated_koli === false;

        if (isManualEntry) {
          mergedWithManual = true;
          // Pertahankan koli aktual, satuan, deskripsi manual & foto barang; hanya lengkapi yang kosong
          const manualHasDesc = Boolean(it.deskripsi && it.deskripsi.trim() && !it.deskripsi.startsWith('Barang Pengiriman Store'));
          return {
            ...it,
            store_tujuan: it.store_tujuan?.trim() || normalizedStore,
            no_surat_jalan: cleanNoSj,
            deskripsi: manualHasDesc ? it.deskripsi : cleanDeskripsi,
            qty: it.satuan === 'Pcs' ? totalQtyScan : it.qty,
            hitung_koli: Math.max(1, Math.round(Number(it.hitung_koli) || 1)),
            is_estimated_koli: false,
            keterangan: it.keterangan || '',
          };
        }

        // Masih berupa entri estimasi dari Pengecekan SJ -> perbarui qty & estimasi
        return {
          ...it,
          store_tujuan: normalizedStore,
          no_surat_jalan: cleanNoSj,
          deskripsi: cleanDeskripsi,
          qty: totalQtyScan,
          satuan: 'Pcs',
          hitung_koli: estimatedKoli,
          is_estimated_koli: true,
          source_type: 'pengecekan_sj',
          keterangan: '',
        };
      });

      const editRes = await editPengirimanStoreReportFull(
        existingDispatched.id,
        {
          store_tujuan: existingDispatched.store_tujuan?.trim() || normalizedStore,
          items: updatedItems,
        },
        user
      );

      // Pastikan override arsip (jika sempat ditandai batal_kirim/terkirim) dibersihkan saat kembali masuk Dispatched
      await setSjShippingOverridesBatch([cleanNoSj], null, user);

      notifyPengirimanStoreUpdated({ action: 'updated', no_sj: cleanNoSj, reportId: existingDispatched.id });
      return {
        success: editRes.success,
        action: editRes.success ? 'updated' : 'error',
        report: editRes.data,
        estimatedKoli: editRes.data?.total_koli ?? estimatedKoli,
        message: editRes.success
          ? mergedWithManual
            ? `SJ ${cleanNoSj} digabungkan/dilengkapi dengan antrean Dispatched manual yang sudah ada (${editRes.data?.total_koli ?? existingDispatched.total_koli} Koli aktual dipertahankan).`
            : `Antrean Dispatched SJ ${cleanNoSj} (${normalizedStore}) diperbarui: ${totalQtyScan} pcs (~${editRes.data?.total_koli ?? estimatedKoli} Koli).`
          : editRes.message,
      };
    }

    // Bersihkan override arsip manual jika sebelumnya sempat ditandai batal_kirim/terkirim
    await setSjShippingOverridesBatch([cleanNoSj], null, user);

    // 3. Belum ada di Dispatched -> buat antrean baru
    const newItem: PengirimanStoreItem = {
      id: `item-sj-${Date.now()}-0`,
      store_tujuan: normalizedStore,
      no_surat_jalan: cleanNoSj,
      deskripsi: cleanDeskripsi,
      qty: totalQtyScan,
      satuan: 'Pcs',
      hitung_koli: estimatedKoli,
      is_estimated_koli: true,
      source_type: 'pengecekan_sj',
      keterangan: '',
    };

    const saveRes = await savePengirimanStoreReport({
      store_tujuan: normalizedStore,
      tanggal_laporan: getSubmitTimestamp(),
      items: [newItem],
      total_item_count: 1,
      total_koli: estimatedKoli,
      pic_nama: user.name || 'Petugas Gudang',
      pic_username: user.username || 'operator',
      foto_urls: [],
    });

    notifyPengirimanStoreUpdated({ action: 'created', no_sj: cleanNoSj, reportId: saveRes.data?.id });
    return {
      success: saveRes.success,
      action: saveRes.success ? 'created' : 'error',
      report: saveRes.data,
      estimatedKoli,
      message: saveRes.success
        ? `SJ ${cleanNoSj} (${totalQtyScan} pcs · Est. ~${estimatedKoli} Koli) masuk antrean Pengiriman Store > Dispatched (${normalizedStore}).`
        : saveRes.message,
    };
  } catch (err: any) {
    console.warn('syncPengecekanSjToPengirimanDispatched error:', err);
    return {
      success: false,
      action: 'error',
      message: err?.message || 'Gagal menyinkronkan SJ ke Pengiriman Store Dispatched',
    };
  }
}

/**
 * Hapus otomatis dari antrean Pengiriman Store > Dispatched ketika status SJ diturunkan
 * dari SELESAI -> PENDING (atau saat riwayat SJ dihapus), HANYA jika belum dikirim (status === 'dispatched').
 */
export async function removePengecekanSjFromPengirimanDispatched(
  noSj: string,
  user: { name: string; username: string } = { name: 'System', username: 'system' }
): Promise<{
  success: boolean;
  removedCount: number;
  skippedSentCount: number;
  message: string;
}> {
  try {
    const targetSjKey = normalizeNoSjKey(noSj);
    if (!targetSjKey) {
      return { success: true, removedCount: 0, skippedSentCount: 0, message: '' };
    }

    const existingReports = await fetchPengirimanStoreReports();
    const matchingReports = existingReports.filter(
      (rep) =>
        rep.status !== 'cancelled' &&
        Array.isArray(rep.items) &&
        rep.items.some((it) => normalizeNoSjKey(it.no_surat_jalan) === targetSjKey)
    );

    let removedCount = 0;
    let skippedSentCount = 0;

    for (const rep of matchingReports) {
      if (rep.status === 'sent') {
        skippedSentCount++;
        continue;
      }
      if (rep.status !== 'dispatched') continue;

      const remainingItems = (rep.items || []).filter(
        (it) => normalizeNoSjKey(it.no_surat_jalan) !== targetSjKey
      );

      if (remainingItems.length === 0) {
        const delRes = await deletePengirimanStoreReport(rep.id);
        if (delRes.success) removedCount++;
      } else {
        const updRes = await editPengirimanStoreReportFull(
          rep.id,
          { items: remainingItems },
          user
        );
        if (updRes.success) removedCount++;
      }
    }

    if (removedCount > 0) {
      notifyPengirimanStoreUpdated({ action: 'removed', no_sj: noSj });
    }

    return {
      success: true,
      removedCount,
      skippedSentCount,
      message:
        removedCount > 0
          ? `SJ ${noSj} otomatis ditarik dari antrean Pengiriman Store > Dispatched.`
          : skippedSentCount > 0
          ? `SJ ${noSj} sudah berstatus Terkirim (Sent) sehingga tidak dihapus dari riwayat pengiriman.`
          : '',
    };
  } catch (err: any) {
    console.warn('removePengecekanSjFromPengirimanDispatched error:', err);
    return {
      success: false,
      removedCount: 0,
      skippedSentCount: 0,
      message: err?.message || 'Gagal menghapus SJ dari antrean Dispatched',
    };
  }
}

/**
 * Penyesuaian / konfirmasi cepat jumlah koli aktual pada laporan Dispatched
 * (mengubah status estimasi menjadi koli aktual yang terkonfirmasi).
 */
export async function updateDispatchedReportKoli(
  reportId: string,
  newKoli: number,
  user: { name: string; username: string }
): Promise<{ success: boolean; data?: PengirimanStoreReport; message: string }> {
  const cached = getCachedReports();
  const target = cached.find((r) => r.id === reportId);
  if (!target) {
    return { success: false, message: 'Laporan Dispatched tidak ditemukan' };
  }
  const safeKoli = Math.max(1, Math.round(Number(newKoli) || 1));
  const items = target.items || [];
  if (items.length === 0) {
    return { success: false, message: 'Laporan tidak memiliki item' };
  }

  // Update item pertama (atau seluruh item jika single-item SJ) menjadi koli aktual terkonfirmasi
  const updatedItems: PengirimanStoreItem[] = items.map((it, idx) => {
    if (items.length === 1 || idx === 0) {
      return {
        ...it,
        hitung_koli: safeKoli,
        is_estimated_koli: false,
      };
    }
    return {
      ...it,
      is_estimated_koli: false,
    };
  });

  const res = await editPengirimanStoreReportFull(
    reportId,
    { items: updatedItems },
    user
  );
  if (res.success) {
    notifyPengirimanStoreUpdated({ action: 'koli_confirmed', reportId, total_koli: safeKoli });
  }
  return res;
}

// ============================================================================
// DETEKSI KONFLIK NO SJ (INPUT MANUAL PENGIRIMAN STORE)
// ============================================================================

export interface DuplicateNoSjConflict {
  no_sj: string;
  existingStatus: 'dispatched' | 'sent';
  existingReport: PengirimanStoreReport;
}

/**
 * Periksa apakah No Surat Jalan yang akan diinput manual sudah ada di antrean Dispatched
 * atau di Histori Terkirim (Sent), untuk menawarkan penggabungan otomatis / peringatan.
 */
export function findDuplicateNoSjConflicts(
  items: Array<{ no_surat_jalan?: string }>,
  existingReports: PengirimanStoreReport[]
): DuplicateNoSjConflict[] {
  const conflicts: DuplicateNoSjConflict[] = [];
  const seenKeys = new Set<string>();

  for (const item of items) {
    const key = normalizeNoSjKey(item.no_surat_jalan);
    if (!key || seenKeys.has(key)) continue;

    const matching = existingReports.filter(
      (rep) =>
        rep.status !== 'cancelled' &&
        Array.isArray(rep.items) &&
        rep.items.some((it) => normalizeNoSjKey(it.no_surat_jalan) === key)
    );
    if (matching.length === 0) continue;

    const dispatchedRep = matching.find((r) => r.status === 'dispatched');
    const sentRep = matching.find((r) => r.status === 'sent');
    if (dispatchedRep) {
      seenKeys.add(key);
      conflicts.push({
        no_sj: String(item.no_surat_jalan || '').trim(),
        existingStatus: 'dispatched',
        existingReport: dispatchedRep,
      });
    } else if (sentRep) {
      seenKeys.add(key);
      conflicts.push({
        no_sj: String(item.no_surat_jalan || '').trim(),
        existingStatus: 'sent',
        existingReport: sentRep,
      });
    }
  }

  return conflicts;
}

// ============================================================================
// STATUS PENGIRIMAN SJ SELESAI (BELUM JADWAL / DISPATCHED / TERKIRIM / BATAL KIRIM)
// Disimpan ke Supabase wms_system_docs (section_id = 'pengecekan_sj_shipping_overrides')
// ============================================================================

export type PengecekanSjShippingStatus =
  | 'belum_jadwal'
  | 'dispatched'
  | 'terkirim'
  | 'batal_kirim';

export interface PengecekanSjShippingOverride {
  status: 'terkirim' | 'batal_kirim';
  updated_at: string;
  updated_by: string;
}

const SJ_SHIPPING_OVERRIDES_STORAGE_KEY = 'wms_pengecekan_sj_shipping_overrides_v1';
const SJ_SHIPPING_OVERRIDES_DOC_ID = 'pengecekan_sj_shipping_overrides';

export function getCachedSjShippingOverrides(): Record<string, PengecekanSjShippingOverride> {
  try {
    const raw = localStorage.getItem(SJ_SHIPPING_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCachedSjShippingOverrides(map: Record<string, PengecekanSjShippingOverride>): void {
  try {
    localStorage.setItem(SJ_SHIPPING_OVERRIDES_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export async function fetchSjShippingOverrides(): Promise<
  Record<string, PengecekanSjShippingOverride>
> {
  const localMap = getCachedSjShippingOverrides();
  try {
    const docs = await supabaseFetch<any[]>(
      'wms_system_docs',
      'GET',
      undefined,
      `section_id=eq.${SJ_SHIPPING_OVERRIDES_DOC_ID}`
    );
    if (Array.isArray(docs) && docs[0] && docs[0].content) {
      const cloudParsed = JSON.parse(docs[0].content);
      if (cloudParsed && typeof cloudParsed === 'object') {
        saveCachedSjShippingOverrides(cloudParsed);
        return cloudParsed;
      }
    }
  } catch (err) {
    console.warn('Gagal fetch pengecekan_sj_shipping_overrides dari Supabase:', err);
  }
  return localMap;
}

/**
 * Perbarui status arsip pengiriman (Terkirim / Batal Kirim / reset ke Belum Jadwal Kirim)
 * untuk 1 atau banyak No SJ sekaligus (1 request Supabase via wms_system_docs).
 * Tidak membuat trip palsu di Pengiriman Store.
 */
export async function setSjShippingOverridesBatch(
  noSjList: string[],
  nextStatus: 'terkirim' | 'batal_kirim' | null,
  user: { name: string; username?: string } = { name: 'Admin', username: 'admin' }
): Promise<Record<string, PengecekanSjShippingOverride>> {
  const current = await fetchSjShippingOverrides();
  const nextMap: Record<string, PengecekanSjShippingOverride> = { ...current };
  const nowIso = new Date().toISOString();
  let changed = false;

  for (const rawNoSj of noSjList) {
    const key = normalizeNoSjKey(rawNoSj);
    if (!key) continue;
    if (nextStatus === null) {
      if (nextMap[key]) {
        delete nextMap[key];
        changed = true;
      }
    } else {
      nextMap[key] = {
        status: nextStatus,
        updated_at: nowIso,
        updated_by: user.name || user.username || 'Admin',
      };
      changed = true;
    }
  }

  if (!changed) return nextMap;

  saveCachedSjShippingOverrides(nextMap);
  try {
    await supabaseFetch(
      'wms_system_docs',
      'POST',
      [
        {
          section_id: SJ_SHIPPING_OVERRIDES_DOC_ID,
          content: JSON.stringify(nextMap),
          updated_by: user.name || user.username || 'Admin',
          updated_at: nowIso,
        },
      ],
      'on_conflict=section_id',
      true
    );
  } catch (err) {
    console.warn('Gagal simpan pengecekan_sj_shipping_overrides ke Supabase:', err);
  }

  notifyPengirimanStoreUpdated({ action: 'shipping_override_updated', status: nextStatus });
  return nextMap;
}

/**
 * Bangun indeks O(1) No SJ -> PengirimanStoreReport terbaik (prioritas: sent > dispatched > cancelled).
 */
export function buildNoSjReportIndex(
  reports: PengirimanStoreReport[]
): Map<string, PengirimanStoreReport> {
  const rank = (status?: string) => {
    if (status === 'sent') return 3;
    if (status === 'dispatched') return 2;
    if (status === 'cancelled') return 1;
    return 0;
  };
  const map = new Map<string, PengirimanStoreReport>();
  (reports || []).forEach((rep) => {
    (rep.items || []).forEach((it) => {
      const key = normalizeNoSjKey(it.no_surat_jalan);
      if (!key) return;
      const existing = map.get(key);
      if (!existing || rank(rep.status) > rank(existing.status)) {
        map.set(key, rep);
      }
    });
  });
  return map;
}

/**
 * Tentukan status pengiriman live untuk sebuah No SJ di Tab Selesai Pengecekan SJ.
 */
export function resolvePengecekanSjShippingStatus(
  noSj: string,
  reportMap: Map<string, PengirimanStoreReport>,
  overrides: Record<string, PengecekanSjShippingOverride>
): PengecekanSjShippingStatus {
  const key = normalizeNoSjKey(noSj);
  if (!key) return 'belum_jadwal';

  const rep = reportMap.get(key);
  if (rep?.status === 'sent') return 'terkirim';
  if (rep?.status === 'dispatched') return 'dispatched';

  const ov = overrides[key];
  if (ov?.status === 'terkirim') return 'terkirim';
  if (ov?.status === 'batal_kirim') return 'batal_kirim';

  if (rep?.status === 'cancelled') return 'batal_kirim';

  return 'belum_jadwal';
}


