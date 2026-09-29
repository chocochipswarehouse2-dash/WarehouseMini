import {
  QcPengerjaanJob,
  QcSizeTally,
  QcPhotoEvidence,
  PenerimaanProduksiItem,
  QcReport,
  PerbaikanTicket,
  UserSession,
} from '../types';
import {
  saveQcReportsBatchToSupabase,
  savePerbaikanTicketToSupabase,
  supabaseFetch,
} from './supabase';

const LOCAL_STORAGE_KEY = 'wms_local_qc_pengerjaan_jobs';

/**
 * Generate unique ID untuk Master QC Job Card
 */
export function generateQcJobId(noSuratJalan: string, kodeProduksi: string): string {
  const cleanSJ = (noSuratJalan || 'SJ').replace(/[^a-zA-Z0-9]/g, '');
  const cleanKode = (kodeProduksi || 'KODE').replace(/[^a-zA-Z0-9]/g, '');
  return `QCJOB-${cleanSJ}-${cleanKode}`;
}

/**
 * Memuat semua saved QC Pengerjaan jobs dari localStorage & Supabase
 */
export function getSavedQcJobsFromLocal(): Record<string, QcPengerjaanJob> {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('Gagal membaca saved QC jobs:', e);
  }
  return {};
}

/**
 * Simpan seluruh map QC Pengerjaan jobs ke localStorage
 */
export function saveQcJobsToLocal(jobsMap: Record<string, QcPengerjaanJob>): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(jobsMap));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wms_qc_pengerjaan_updated', { detail: jobsMap }));
    }
  } catch (e) {
    console.warn('Gagal menyimpan QC jobs:', e);
  }
}

/**
 * Simpan atau perbarui 1 Master QC Job Card
 */
export function saveSingleQcJob(job: QcPengerjaanJob): QcPengerjaanJob {
  const all = getSavedQcJobsFromLocal();
  const updatedJob: QcPengerjaanJob = {
    ...job,
    updated_at: new Date().toISOString(),
  };
  all[job.id] = updatedJob;
  saveQcJobsToLocal(all);
  return updatedJob;
}

/**
 * Kalkulasi agregat total dari array QcSizeTally
 */
export function calculateJobTotals(sizes: QcSizeTally[]): {
  total_qty_awal: number;
  total_qty_oke: number;
  total_qty_noda: number;
  total_qty_permak: number;
  total_qty_defect: number;
  total_diperiksa: number;
  total_selisih: number;
  pass_rate: number;
} {
  let total_qty_awal = 0;
  let total_qty_oke = 0;
  let total_qty_noda = 0;
  let total_qty_permak = 0;
  let total_qty_defect = 0;

  (sizes || []).forEach((s) => {
    total_qty_awal += Number(s.qty_awal) || 0;
    total_qty_oke += Number(s.qty_oke) || 0;
    total_qty_noda += Number(s.qty_noda) || 0;
    total_qty_permak += Number(s.qty_permak) || 0;
    total_qty_defect += Number(s.qty_defect) || 0;
  });

  const total_diperiksa = total_qty_oke + total_qty_noda + total_qty_permak + total_qty_defect;
  const total_selisih = total_diperiksa - total_qty_awal;
  const pass_rate = total_diperiksa > 0 ? Math.round((total_qty_oke / total_diperiksa) * 1000) / 10 : 0;

  return {
    total_qty_awal,
    total_qty_oke,
    total_qty_noda,
    total_qty_permak,
    total_qty_defect,
    total_diperiksa,
    total_selisih,
    pass_rate,
  };
}

/**
 * Ambil atau buat instance Job Card berdasarkan PenerimaanProduksiItem[] untuk 1 kode produksi di 1 Surat Jalan
 * Mengelompokkan berdasarkan Varian (Warna + Size + SKU) secara presisi
 */
export function buildOrGetQcJob(
  items: PenerimaanProduksiItem[],
  noSuratJalan: string,
  kodeProduksi: string,
  currentUserName?: string
): QcPengerjaanJob {
  const jobId = generateQcJobId(noSuratJalan, kodeProduksi);
  const savedJobs = getSavedQcJobsFromLocal();
  const existing = savedJobs[jobId];

  // Agregat varian dari item penerimaan aktual per Warna + Size
  interface VariantAgg {
    warna: string;
    size: string;
    sku: string;
    nama_produk: string;
    qty_awal: number;
  }
  const variantMap = new Map<string, VariantAgg>();
  let primaryFoto = '';
  let kategori = 'Lokal CMT';
  let tanggalPenerimaan = '';
  let generalWarna = '';
  let keteranganPenerimaan = '';

  (items || []).forEach((it) => {
    const sName = (it.size || 'ALL SIZE').trim().toUpperCase();
    const wName = (it.warna || '-').trim().toUpperCase();
    const cleanKode = (it.kode_produksi || kodeProduksi).trim().toUpperCase();
    const cleanSku = (it.sku || `${cleanKode}-${wName !== '-' ? wName : 'ALL'}-${sName}`).trim();
    const namaProd = (it.nama_produk || `${cleanKode} (${wName !== '-' ? wName : ''})`).trim();
    const key = `${wName}___${sName}`;

    if (!variantMap.has(key)) {
      variantMap.set(key, {
        warna: wName,
        size: sName,
        sku: cleanSku,
        nama_produk: namaProd,
        qty_awal: 0,
      });
    }
    const current = variantMap.get(key)!;
    current.qty_awal += Number(it.qty) || 0;

    if (!primaryFoto && it.foto_url) primaryFoto = it.foto_url;
    if (it.kategori) kategori = it.kategori;
    if (it.tanggal_penerimaan) tanggalPenerimaan = it.tanggal_penerimaan;
    if (!generalWarna && it.warna && it.warna !== '-') generalWarna = it.warna;
    if (!keteranganPenerimaan && it.keterangan) keteranganPenerimaan = it.keterangan;
  });

  const incomingSizes: QcSizeTally[] = Array.from(variantMap.values()).map((v) => ({
    size: v.size,
    warna: v.warna,
    sku: v.sku,
    nama_produk: v.nama_produk,
    qty_awal: v.qty_awal,
    qty_oke: 0,
    qty_noda: 0,
    qty_permak: 0,
    qty_defect: 0,
  }));

  if (existing) {
    // Sinkronkan data existing dengan varian terbaru (matching per Warna + Size atau SKU)
    const existingMap = new Map(
      existing.sizes.map((s) => [`${(s.warna || '-').toUpperCase()}___${(s.size || 'ALL SIZE').toUpperCase()}`, s])
    );
    const mergedSizes: QcSizeTally[] = incomingSizes.map((inc) => {
      const key = `${(inc.warna || '-').toUpperCase()}___${(inc.size || 'ALL SIZE').toUpperCase()}`;
      const found = existingMap.get(key);
      if (found) {
        return {
          ...found,
          warna: inc.warna,
          sku: inc.sku || found.sku,
          nama_produk: inc.nama_produk || found.nama_produk,
          qty_awal: inc.qty_awal,
        };
      }
      return inc;
    });

    const totals = calculateJobTotals(mergedSizes);
    return {
      ...existing,
      source_type: 'PRODUKSI',
      foto_url: primaryFoto || existing.foto_url,
      warna: generalWarna || existing.warna || '-',
      kategori: kategori || existing.kategori,
      tanggal_penerimaan: tanggalPenerimaan || existing.tanggal_penerimaan,
      keterangan_penerimaan: keteranganPenerimaan || existing.keterangan_penerimaan,
      sizes: mergedSizes,
      ...totals,
    };
  }

  // Buat Baru
  const initialTotals = calculateJobTotals(incomingSizes);

  const initialPicList: string[] = [];
  if (currentUserName && currentUserName.trim()) {
    initialPicList.push(currentUserName.trim());
  }

  const newJob: QcPengerjaanJob = {
    id: jobId,
    source_type: 'PRODUKSI',
    kode_produksi: kodeProduksi,
    nama_produk: `${kodeProduksi} (${items.length} Varian)`,
    warna: generalWarna || '-',
    no_surat_jalan: noSuratJalan,
    kategori,
    tanggal_penerimaan: tanggalPenerimaan || new Date().toISOString().slice(0, 10),
    foto_url: primaryFoto,
    keterangan_penerimaan: keteranganPenerimaan,
    pic_list: initialPicList,
    status: 'DRAFT',
    sizes: incomingSizes,
    ...initialTotals,
    foto_evidence: [],
    catatan_umum: '',
  };

  return newJob;
}

/**
 * Generate unique ID untuk Master QC Mutasi Job Card (per No SJ + Store Asal)
 */
export function generateQcMutasiJobId(noSuratJalan: string, storeAsal?: string): string {
  const cleanSJ = (noSuratJalan || 'SJ').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const cleanStore = (storeAsal || 'STORE').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `QCMUT-${cleanSJ}-${cleanStore}`;
}

/**
 * Ekstraksi kode produksi, warna, dan size dari PengecekanSJItem secara akurat
 */
export function extractProductInfoFromSJItem(item: { sku?: string; nama_produk?: string; warna?: string; size?: string }): {
  kode_produksi: string;
  warna: string;
  size: string;
} {
  const sku = (item.sku || '').trim();
  const nama = (item.nama_produk || '').trim();
  let warna = (item.warna || '').trim();
  let size = (item.size || '').trim();

  const standardSizes = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', 'ALL SIZE', 'ALLSIZE', 'FS', 'FREE SIZE', 'FREE-SIZE'];

  // Jika size terisi deskripsi atau nama produk panjang (misal 'LANUNA TOP BLUE'), bersihkan!
  if (size && (size.length > 8 || size.toUpperCase().includes('TOP') || size.toUpperCase().includes('DRESS') || size.toUpperCase().includes('PANTS') || size.toUpperCase().includes('SKIRT'))) {
    size = '';
  }

  // Coba ekstrak dari SKU jika size belum ada
  if (!size && sku) {
    const parts = sku.split('-');
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1].toUpperCase().trim();
      if (standardSizes.includes(lastPart) || lastPart.length <= 4) {
        size = lastPart;
        warna = warna || parts[parts.length - 2].toUpperCase().trim();
      }
    } else if (parts.length === 2) {
      const lastPart = parts[1].toUpperCase().trim();
      if (standardSizes.includes(lastPart)) {
        size = lastPart;
      }
    }
  }

  if (!size) size = 'ALL SIZE';
  if (!warna) warna = '-';

  return {
    kode_produksi: sku || nama || 'ITEM',
    warna,
    size,
  };
}

/**
 * Ambil atau buat instance Job Card untuk QC Mutasi berdasarkan PengecekanSJRecord (Per Surat Jalan + Store)
 */
export function buildOrGetQcMutasiJobFromRecord(
  rec: {
    id: string;
    no_sj: string;
    source: string;
    destination?: string;
    tanggal_sj?: string;
    catatan?: string;
    submitted_by?: string;
    items?: Array<{
      sku: string;
      nama_produk: string;
      qty_sj: number;
      qty_scan: number;
      size?: string;
      warna?: string;
      foto_url?: string;
    }>;
  },
  currentUserName?: string
): QcPengerjaanJob {
  const storeAsal = rec.source || 'Store';
  const jobId = generateQcMutasiJobId(rec.no_sj, storeAsal);
  const savedJobs = getSavedQcJobsFromLocal();
  const existing = savedJobs[jobId];

  const items = rec.items || [];
  let primaryFoto = '';

  // Buat array rincian item berdasarkan SKU + Size
  const incomingSizes: QcSizeTally[] = items.map((it) => {
    const info = extractProductInfoFromSJItem(it);
    const sName = (it.size || info.size || 'ALL SIZE').trim().toUpperCase();
    const sku = (it.sku || '').trim();
    const namaProduk = (it.nama_produk || info.kode_produksi || sku).trim();
    const warna = (it.warna || info.warna || '-').trim();
    const qtyDiterima = Number(it.qty_scan) > 0 ? Number(it.qty_scan) : (Number(it.qty_sj) || 0);

    if (!primaryFoto && it.foto_url) primaryFoto = it.foto_url;

    return {
      size: sName,
      sku,
      nama_produk: namaProduk,
      warna,
      qty_awal: qtyDiterima,
      qty_oke: 0,
      qty_noda: 0,
      qty_permak: 0,
      qty_defect: 0,
    };
  });

  const sourceName = rec.source || 'Store';
  const destName = rec.destination || 'Gudang Utama';
  const kategori = `Mutasi (${sourceName} ➔ ${destName})`;
  const tanggalPenerimaan = rec.tanggal_sj || new Date().toISOString().slice(0, 10);
  const keteranganPenerimaan = `Mutasi Masuk dari ${sourceName} ke ${destName}. ${rec.catatan ? `Catatan: ${rec.catatan}` : ''}`.trim();

  if (existing) {
    // Sinkronisasi data existing dengan items terbaru dari Surat Jalan
    const existingMap = new Map(existing.sizes.map((s) => [s.sku ? `${s.sku}___${s.size}` : s.size, s]));
    const mergedSizes: QcSizeTally[] = incomingSizes.map((inc) => {
      const key = inc.sku ? `${inc.sku}___${inc.size}` : inc.size;
      const found = existingMap.get(key);
      if (found) {
        return {
          ...found,
          sku: inc.sku || found.sku,
          nama_produk: inc.nama_produk || found.nama_produk,
          warna: inc.warna || found.warna,
          qty_awal: inc.qty_awal,
        };
      }
      return inc;
    });

    const totals = calculateJobTotals(mergedSizes);
    return {
      ...existing,
      source_type: 'MUTASI',
      source_ref_id: rec.id || existing.source_ref_id,
      store_asal: sourceName,
      store_tujuan: destName,
      nama_produk: `Mutasi: ${sourceName} (${items.length} SKU)`,
      foto_url: primaryFoto || existing.foto_url,
      kategori: kategori || existing.kategori,
      tanggal_penerimaan: tanggalPenerimaan || existing.tanggal_penerimaan,
      keterangan_penerimaan: keteranganPenerimaan || existing.keterangan_penerimaan,
      sizes: mergedSizes,
      ...totals,
    };
  }

  // Buat Baru QC Mutasi Job (1 Surat Jalan + Store = 1 Job Card)
  const initialTotals = calculateJobTotals(incomingSizes);
  const initialPicList: string[] = [];
  if (currentUserName && currentUserName.trim()) {
    initialPicList.push(currentUserName.trim());
  } else if (rec.submitted_by && rec.submitted_by.trim()) {
    initialPicList.push(rec.submitted_by.trim());
  }

  const newJob: QcPengerjaanJob = {
    id: jobId,
    source_type: 'MUTASI',
    source_ref_id: rec.id,
    kode_produksi: `${rec.no_sj} • ${sourceName}`,
    nama_produk: `Mutasi Masuk dari ${sourceName}`,
    warna: `${items.length} SKU Barang`,
    no_surat_jalan: rec.no_sj,
    store_asal: sourceName,
    store_tujuan: destName,
    kategori,
    tanggal_penerimaan: tanggalPenerimaan,
    foto_url: primaryFoto,
    keterangan_penerimaan: keteranganPenerimaan,
    pic_list: initialPicList,
    status: 'DRAFT',
    sizes: incomingSizes,
    ...initialTotals,
    foto_evidence: [],
    catatan_umum: '',
  };

  return newJob;
}

/**
 * Backward compatibility helper
 */
export function buildOrGetQcMutasiJob(
  noSuratJalan: string,
  kodeProduksi: string,
  items: Array<{
    sku: string;
    nama_produk: string;
    qty_sj: number;
    qty_scan: number;
    size?: string;
    warna?: string;
    foto_url?: string;
  }>,
  recInfo: {
    id?: string;
    source?: string;
    destination?: string;
    tanggal_sj?: string;
    catatan?: string;
    submitted_by?: string;
  },
  currentUserName?: string
): QcPengerjaanJob {
  return buildOrGetQcMutasiJobFromRecord(
    {
      id: recInfo.id || '',
      no_sj: noSuratJalan,
      source: recInfo.source || kodeProduksi,
      destination: recInfo.destination,
      tanggal_sj: recInfo.tanggal_sj,
      catatan: recInfo.catatan,
      submitted_by: recInfo.submitted_by,
      items,
    },
    currentUserName
  );
}

/**
 * Eksekusi "Selesaikan QC" -> Buat QcReport dan Tiket Perbaikan di Supabase & Local
 */
export async function finalizeAndSubmitQcJob(
  job: QcPengerjaanJob,
  session: UserSession | null
): Promise<{ success: boolean; reportsCount: number; ticketsCount: number; message: string }> {
  try {
    const activeOperator = session?.name || session?.username || job.pic_list.join(', ') || 'QC Produksi';
    const allPicsString = job.pic_list.length > 0 ? job.pic_list.join(', ') : activeOperator;
    const nowIso = new Date().toISOString();
    const todayDate = nowIso.slice(0, 10);

    const generatedReports: QcReport[] = [];
    const generatedTickets: PerbaikanTicket[] = [];

    // Foto evidence URLs
    const evidenceUrls = (job.foto_evidence || []).map((f) => f.url);
    if (job.foto_url && !evidenceUrls.includes(job.foto_url)) {
      // jika ada foto master
    }

    // 1. Buat Laporan QC per Size
    for (const sizeItem of job.sizes) {
      const qtyDiperiksa =
        (sizeItem.qty_oke || 0) +
        (sizeItem.qty_noda || 0) +
        (sizeItem.qty_permak || 0) +
        (sizeItem.qty_defect || 0);

      if (qtyDiperiksa === 0) continue;

      const totalReject = (sizeItem.qty_noda || 0) + (sizeItem.qty_permak || 0) + (sizeItem.qty_defect || 0);
      const isReject = totalReject > 0;

      // Kategori rusak dominan
      const detailParts: string[] = [];
      if (sizeItem.qty_noda > 0) detailParts.push(`Noda/Cuci: ${sizeItem.qty_noda} pcs`);
      if (sizeItem.qty_permak > 0) detailParts.push(`Permak/Jahit: ${sizeItem.qty_permak} pcs`);
      if (sizeItem.qty_defect > 0) detailParts.push(`Defect/BS: ${sizeItem.qty_defect} pcs`);

      let targetPenanganan: 'REJECT' | 'CUCI' | 'PERMAK' | 'DEFECT' = 'REJECT';
      if (sizeItem.qty_defect > 0) targetPenanganan = 'DEFECT';
      else if (sizeItem.qty_permak > 0) targetPenanganan = 'PERMAK';
      else if (sizeItem.qty_noda > 0) targetPenanganan = 'CUCI';

      const reportNo = `QC-${todayDate.replace(/-/g, '')}-${job.kode_produksi}-${sizeItem.size}-${Date.now().toString().slice(-4)}`;

      const qcRep: QcReport = {
        report_no: reportNo,
        tanggal: todayDate,
        tipe_identifikasi: 'kode_produksi',
        sku: job.kode_produksi,
        kode_produksi: job.kode_produksi,
        warna: job.warna || '-',
        nama_produk: `${job.kode_produksi} ${job.warna ? `(${job.warna})` : ''} - Size ${sizeItem.size}`,
        size: sizeItem.size,
        sumber_batch: `Penerimaan CMT (SJ: ${job.no_surat_jalan})`,
        status: isReject ? 'REJECT' : 'OKE',
        qty_diperiksa: qtyDiperiksa,
        qty_oke: sizeItem.qty_oke || 0,
        qty_reject: totalReject,
        kategori_rusak: isReject ? (sizeItem.qty_noda > 0 ? 'Noda / Kotor' : sizeItem.qty_permak > 0 ? 'Jahitan Rusak' : 'Cacat Kain / Warna') : undefined,
        detail_kerusakan: detailParts.length > 0 ? detailParts.join('; ') : 'Hasil pengerjaan QC Produksi',
        target_penanganan: isReject ? targetPenanganan : undefined,
        foto_urls: evidenceUrls,
        catatan: `[PIC: ${allPicsString}] ${job.catatan_umum || ''} ${sizeItem.catatan ? `| Size Note: ${sizeItem.catatan}` : ''}`.trim(),
        pic_qc: allPicsString,
      };

      generatedReports.push(qcRep);

      // 2. Jika ada Reject Noda / Permak / Defect, buat Tiket Perbaikan
      if (sizeItem.qty_noda > 0) {
        const ticketNo = `RJC-${todayDate.replace(/-/g, '')}-NODA-${Date.now().toString().slice(-4)}`;
        generatedTickets.push({
          ticket_no: ticketNo,
          tanggal: todayDate,
          sku: job.kode_produksi,
          nama_produk: `${job.kode_produksi} ${job.warna || ''} (Size ${sizeItem.size})`,
          size: sizeItem.size,
          qty: sizeItem.qty_noda,
          lokasi_asal: `CMT-${job.no_surat_jalan}`,
          lokasi_sekarang: 'CUCI-01',
          sumber_barang: 'Penerimaan CMT',
          kategori_rusak: 'Noda / Kotor',
          detail_kerusakan: `Noda kain dari pengerjaan QC Kode ${job.kode_produksi} (SJ: ${job.no_surat_jalan})`,
          foto_urls: evidenceUrls,
          tahap: 'CUCI',
          status_pengerjaan: 'PENDING',
          operator_input: activeOperator,
          qc_pic: allPicsString,
          qc_report_no: reportNo,
        });
      }

      if (sizeItem.qty_permak > 0) {
        const ticketNo = `RJC-${todayDate.replace(/-/g, '')}-PRM-${Date.now().toString().slice(-4)}`;
        generatedTickets.push({
          ticket_no: ticketNo,
          tanggal: todayDate,
          sku: job.kode_produksi,
          nama_produk: `${job.kode_produksi} ${job.warna || ''} (Size ${sizeItem.size})`,
          size: sizeItem.size,
          qty: sizeItem.qty_permak,
          lokasi_asal: `CMT-${job.no_surat_jalan}`,
          lokasi_sekarang: 'PERMAK-01',
          sumber_barang: 'Penerimaan CMT',
          kategori_rusak: 'Jahitan Rusak',
          detail_kerusakan: `Permak jahitan dari pengerjaan QC Kode ${job.kode_produksi} (SJ: ${job.no_surat_jalan})`,
          foto_urls: evidenceUrls,
          tahap: 'PERMAK',
          status_pengerjaan: 'PENDING',
          operator_input: activeOperator,
          qc_pic: allPicsString,
          qc_report_no: reportNo,
        });
      }

      if (sizeItem.qty_defect > 0) {
        const ticketNo = `RJC-${todayDate.replace(/-/g, '')}-DF-${Date.now().toString().slice(-4)}`;
        generatedTickets.push({
          ticket_no: ticketNo,
          tanggal: todayDate,
          sku: job.kode_produksi,
          nama_produk: `${job.kode_produksi} ${job.warna || ''} (Size ${sizeItem.size})`,
          size: sizeItem.size,
          qty: sizeItem.qty_defect,
          lokasi_asal: `CMT-${job.no_surat_jalan}`,
          lokasi_sekarang: 'DEFECT-01',
          sumber_barang: 'Penerimaan CMT',
          kategori_rusak: 'Cacat Kain / Warna',
          detail_kerusakan: `Defect permanen (BS) dari pengerjaan QC Kode ${job.kode_produksi} (SJ: ${job.no_surat_jalan})`,
          foto_urls: evidenceUrls,
          tahap: 'DEFECT',
          status_pengerjaan: 'PENDING',
          operator_input: activeOperator,
          qc_pic: allPicsString,
          qc_report_no: reportNo,
        });
      }
    }

    // 3. Simpan ke Supabase & Local Cache
    if (generatedReports.length > 0) {
      await saveQcReportsBatchToSupabase(generatedReports);
    }
    if (generatedTickets.length > 0) {
      for (const ticket of generatedTickets) {
        await savePerbaikanTicketToSupabase(ticket);
      }
    }

    // 4. Update status Job Card menjadi 'COMPLETED'
    const completedJob: QcPengerjaanJob = {
      ...job,
      status: 'COMPLETED',
      completed_at: nowIso,
      qc_report_ids: generatedReports.map((r) => r.report_no),
      perbaikan_ticket_ids: generatedTickets.map((t) => t.ticket_no),
    };
    saveSingleQcJob(completedJob);

    return {
      success: true,
      reportsCount: generatedReports.length,
      ticketsCount: generatedTickets.length,
      message: `Pengerjaan QC untuk ${job.kode_produksi} berhasil disimpan! (${generatedReports.length} laporan QC & ${generatedTickets.length} tiket perbaikan dibuat)`,
    };
  } catch (err: any) {
    console.error('Gagal menyelesaikan QC Job:', err);
    return {
      success: false,
      reportsCount: 0,
      ticketsCount: 0,
      message: `Gagal menyimpan hasil QC: ${err.message || err}`,
    };
  }
}

/**
 * Generate Text Ringkasan WhatsApp untuk Berita Acara ke CMT / Konveksi
 * Format natural & rapi (standar komunikasi tim operasional gudang).
 */
export function generateQcWhatsAppSummary(job: QcPengerjaanJob): string {
  const totals = calculateJobTotals(job.sizes);
  const isMutasi = job.source_type === 'MUTASI';

  let msg = isMutasi
    ? `*Hasil QC Mutasi - SJ ${job.no_surat_jalan}*\n`
    : `*Hasil QC Produksi - ${job.kode_produksi}*\n`;

  if (isMutasi) {
    if (job.store_asal) msg += `Asal Store: *${job.store_asal}*\n`;
    if (job.store_tujuan) msg += `Tujuan: *${job.store_tujuan}*\n`;
    msg += `Total SKU/Item: *${job.sizes.length} SKU*\n`;
  } else {
    if (job.warna && job.warna !== '-') msg += `Model/Warna: ${job.warna}\n`;
    if (job.kategori) msg += `Kategori: ${job.kategori}\n`;
  }
  msg += `No. Surat Jalan: ${job.no_surat_jalan}\n`;
  msg += `PIC QC: ${job.pic_list.join(', ') || 'Warehouse'}\n\n`;

  msg += `*Rangkuman:*\n`;
  msg += `• Total Qty Fisik: *${totals.total_qty_awal} pcs*\n`;
  msg += `• Lolos (Grade A): *${totals.total_qty_oke} pcs*\n`;
  if (totals.total_qty_noda > 0) msg += `• Noda (Cuci): *${totals.total_qty_noda} pcs*\n`;
  if (totals.total_qty_permak > 0) msg += `• Permak (Jahit): *${totals.total_qty_permak} pcs*\n`;
  if (totals.total_qty_defect > 0) msg += `• Defect / BS: *${totals.total_qty_defect} pcs*\n`;

  if (totals.total_selisih !== 0) {
    const selisihLabel = totals.total_selisih > 0 ? `Lebih +${totals.total_selisih}` : `Kurang ${totals.total_selisih}`;
    msg += `• Selisih: *${selisihLabel} pcs*\n`;
  }
  msg += `• Kelolosan: *${totals.pass_rate}%*\n\n`;

  msg += `*Rincian Barang / SKU:*\n`;
  job.sizes.forEach((s) => {
    const rejects: string[] = [];
    if (s.qty_noda > 0) rejects.push(`Noda: ${s.qty_noda}`);
    if (s.qty_permak > 0) rejects.push(`Permak: ${s.qty_permak}`);
    if (s.qty_defect > 0) rejects.push(`Defect: ${s.qty_defect}`);

    const rejectText = rejects.length > 0 ? ` (Reject: ${rejects.join(', ')})` : '';
    const label = s.sku ? `${s.sku} (${s.size})` : `Size ${s.size}`;
    msg += `• ${label}: Diterima ${s.qty_awal} | Bagus: ${s.qty_oke}${rejectText}\n`;
  });

  if (job.catatan_umum && job.catatan_umum.trim()) {
    msg += `\n*Catatan QC:*\n${job.catatan_umum.trim()}\n`;
  }

  if (job.foto_evidence && job.foto_evidence.length > 0) {
    msg += `\n_${job.foto_evidence.length} foto bukti terlampir di sistem._\n`;
  }

  return msg.trim();
}
