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

// Generate unique Report ID: DSP-YYMMDD-XXXX
export function generateReportId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `DSP-${yy}${mm}${dd}-${rand}`;
}

// Generate unique Trip ID: TRIP-YYMMDD-XXXX
export function generateTripId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TRIP-${yy}${mm}${dd}-${rand}`;
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

    if (data && Array.isArray(data) && data.length > 0) {
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

      const rep: PengirimanStoreReport = {
        id: reportId,
        store_tujuan: storeName,
        tanggal_laporan: timestampLaporan,
        items: itemsForStore,
        total_item_count: itemsForStore.length,
        total_koli: totalKoli,
        foto_urls: payload.foto_urls || [],
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

    // Background sync to Supabase
    try {
      for (const reportId of payload.report_ids) {
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
      }
    } catch (e) {
      console.warn('Supabase update status dispatched -> sent sync offline:', e);
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

// ==============================================================================
// 3. GENERASI KOLI MARKING LABELS UNTUK CETAK BARCODE / QR
// ==============================================================================

export function generateKoliLabelsForReport(report: PengirimanStoreReport): KoliMarkingLabel[] {
  const labels: KoliMarkingLabel[] = [];
  let globalKoliCounter = 1;
  const totalKoliReport = report.total_koli || 1;

  report.items.forEach((item, itemIdx) => {
    const koliCount = item.hitung_koli || 1;

    for (let i = 1; i <= koliCount; i++) {
      // Kode marking koli: e.g. KLI-DSP2609-001-K1/3
      const cleanId = report.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
      const markingCode = `KLI-${cleanId}-K${globalKoliCounter}/${totalKoliReport}`;

      const qtyDisplay =
        item.satuan === 'Pcs'
          ? `${item.qty} Pcs (Koli ${globalKoliCounter}/${totalKoliReport})`
          : `Koli ${i} dari ${koliCount} (${globalKoliCounter}/${totalKoliReport})`;

      const noSJ = item.no_surat_jalan?.trim() || 'Tidak ada no surat jalan';
      const qrDataString = `TOKO: ${report.store_tujuan}
NO SJ: ${noSJ}
BARANG: ${item.deskripsi}
QTY: ${qtyDisplay}
KOLI: ${globalKoliCounter}/${totalKoliReport}
TGL: ${report.tanggal_laporan}
KODE: ${markingCode}`;

      const barcodeDataString = markingCode;

      labels.push({
        id: `${report.id}-item${itemIdx}-koli${i}`,
        marking_code: markingCode,
        store_tujuan: report.store_tujuan,
        no_surat_jalan: noSJ,
        deskripsi: item.deskripsi,
        koli_index: globalKoliCounter,
        total_koli_item: koliCount,
        total_koli_report: totalKoliReport,
        qty_display: qtyDisplay,
        tanggal: report.tanggal_laporan,
        pic_nama: report.pic_nama,
        qr_data_string: qrDataString,
        barcode_data_string: barcodeDataString,
      });

      globalKoliCounter++;
    }
  });

  return labels;
}
