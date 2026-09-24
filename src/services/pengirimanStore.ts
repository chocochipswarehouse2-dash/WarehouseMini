import {
  PengirimanStoreReport,
  PengirimanStoreItem,
  PengirimanStoreTrip,
  KoliMarkingLabel,
  PengirimanAuditLog,
} from '../types';
import { supabaseFetch } from './supabase';

const LOCAL_STORAGE_REPORTS = 'wms_pengiriman_store_reports_cache';
const LOCAL_STORAGE_TRIPS = 'wms_pengiriman_store_trips_cache';

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
      if (Array.isArray(parsed)) return parsed;
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
      const remoteTrips: PengirimanStoreTrip[] = data.map((d: any) => ({
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
        status: d.status || 'in_transit',
        created_by_nama: d.pic_nama || d.created_by_nama || 'Petugas Gudang',
        created_by_username: d.pic_username || d.created_by_username || 'operator',
        created_at: d.created_at || new Date().toISOString(),
      }));

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
    // Jika satuan pcs -> 1 koli. Jika satuan koli -> qty koli
    const sanitizedItems: PengirimanStoreItem[] = reportData.items.map((item, idx) => {
      const rawQty = Math.max(1, Number(item.qty) || 1);
      const isPcs = item.satuan === 'Pcs';
      const hitungKoli = isPcs ? 1 : Math.max(1, Math.round(rawQty));

      return {
        id: item.id || `item-${Date.now()}-${idx}`,
        no_surat_jalan: item.no_surat_jalan?.trim() || 'Tidak ada no surat jalan',
        deskripsi: item.deskripsi?.trim() || `Barang #${idx + 1}`,
        qty: rawQty,
        satuan: item.satuan || 'Pcs',
        hitung_koli: hitungKoli,
        keterangan: item.keterangan || '',
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

    // Kelompokkan items per store_tujuan
    const storeGroups: Record<string, PengirimanStoreItem[]> = {};

    payload.items.forEach((item, idx) => {
      const storeName = item.store_tujuan?.trim() || 'Store Belum Ditentukan';
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
        keterangan: item.keterangan || '',
        foto_barang: item.foto_barang || '',
      });
    });

    const newReports: PengirimanStoreReport[] = [];
    const stores = Object.keys(storeGroups);

    for (const storeName of stores) {
      const itemsForStore = storeGroups[storeName];
      const totalKoli = itemsForStore.reduce((acc, curr) => acc + curr.hitung_koli, 0);
      const reportId = generateReportId();

      // Kumpulkan foto spesifik hanya untuk store tujuan ini
      const storePhotos = Array.from(
        new Set([
          ...itemsForStore.flatMap((it) => (it.foto_barang ? [it.foto_barang] : [])),
          ...(payload.foto_urls && stores.length === 1 ? payload.foto_urls : []),
        ])
      );

      const rep: PengirimanStoreReport = {
        id: reportId,
        store_tujuan: storeName,
        tanggal_laporan: timestampLaporan,
        items: itemsForStore,
        total_item_count: itemsForStore.length,
        total_koli: totalKoli,
        foto_urls: storePhotos.length > 0 ? storePhotos : payload.foto_urls || [],
        pic_nama: payload.pic_nama,
        pic_username: payload.pic_username,
        status: 'dispatched',
        created_at: nowIso,
        updated_at: nowIso,
      };

      newReports.push(rep);
    }

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

    const totalKoliAll = newReports.reduce((acc, r) => acc + r.total_koli, 0);
    const storeSummary = stores.join(', ');

    return {
      success: true,
      reports: newReports,
      message: `Berhasil membuat ${newReports.length} laporan (${totalKoliAll} Koli) untuk ${storeSummary}. Masuk ke antrean Dispatched!`,
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
      const hitungKoli = isPcs ? 1 : Math.max(1, Math.round(rawQty));

      return {
        id: item.id || `item-${Date.now()}-${idx}`,
        no_surat_jalan: item.no_surat_jalan?.trim() || 'Tidak ada no surat jalan',
        deskripsi: item.deskripsi?.trim() || `Barang #${idx + 1}`,
        qty: rawQty,
        satuan: item.satuan || 'Pcs',
        hitung_koli: hitungKoli,
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
      await supabaseFetch(
        'pengiriman_store_trips',
        'PATCH',
        {
          tanggal_kirim: updateData.tanggal_kirim,
          dikirim_oleh: updateData.dikirim_oleh,
          armada: updateData.armada,
          no_polisi: updateData.no_polisi,
          catatan_kirim: updateData.catatan,
          updated_at: nowIso,
        },
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
