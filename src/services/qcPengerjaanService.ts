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

  // Agregat varian dari item penerimaan aktual
  const sizeMap = new Map<string, number>();
  let primaryFoto = '';
  let kategori = 'Lokal CMT';
  let tanggalPenerimaan = '';
  let warna = '';
  let keteranganPenerimaan = '';

  (items || []).forEach((it) => {
    const s = (it.size || 'ALL SIZE').trim().toUpperCase();
    sizeMap.set(s, (sizeMap.get(s) || 0) + (Number(it.qty) || 0));
    if (!primaryFoto && it.foto_url) primaryFoto = it.foto_url;
    if (it.kategori) kategori = it.kategori;
    if (it.tanggal_penerimaan) tanggalPenerimaan = it.tanggal_penerimaan;
    if (!warna && it.warna) warna = it.warna;
    if (!keteranganPenerimaan && it.keterangan) keteranganPenerimaan = it.keterangan;
  });

  if (existing) {
    // Sinkronkan jika ada size baru di surat jalan yang belum terdaftar di job
    const existingSizesMap = new Map(existing.sizes.map((s) => [s.size.toUpperCase(), s]));
    const mergedSizes: QcSizeTally[] = [];

    sizeMap.forEach((qtyAwal, sName) => {
      const found = existingSizesMap.get(sName);
      if (found) {
        mergedSizes.push({
          ...found,
          qty_awal: qtyAwal, // update qty awal jika surat jalan diedit
        });
      } else {
        mergedSizes.push({
          size: sName,
          qty_awal: qtyAwal,
          qty_oke: 0,
          qty_noda: 0,
          qty_permak: 0,
          qty_defect: 0,
        });
      }
    });

    const totals = calculateJobTotals(mergedSizes);
    return {
      ...existing,
      foto_url: primaryFoto || existing.foto_url,
      warna: warna || existing.warna,
      kategori: kategori || existing.kategori,
      tanggal_penerimaan: tanggalPenerimaan || existing.tanggal_penerimaan,
      sizes: mergedSizes,
      ...totals,
    };
  }

  // Buat Baru
  const initialSizes: QcSizeTally[] = Array.from(sizeMap.entries()).map(([size, qty_awal]) => ({
    size,
    qty_awal,
    qty_oke: 0,
    qty_noda: 0,
    qty_permak: 0,
    qty_defect: 0,
  }));

  const initialTotals = calculateJobTotals(initialSizes);

  const initialPicList: string[] = [];
  if (currentUserName && currentUserName.trim()) {
    initialPicList.push(currentUserName.trim());
  }

  const newJob: QcPengerjaanJob = {
    id: jobId,
    kode_produksi: kodeProduksi,
    warna: warna || '-',
    no_surat_jalan: noSuratJalan,
    kategori,
    tanggal_penerimaan: tanggalPenerimaan || new Date().toISOString().slice(0, 10),
    foto_url: primaryFoto,
    keterangan_penerimaan: keteranganPenerimaan,
    pic_list: initialPicList,
    status: 'DRAFT',
    sizes: initialSizes,
    ...initialTotals,
    foto_evidence: [],
    catatan_umum: '',
  };

  return newJob;
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

  let msg = `*Hasil QC Produksi - ${job.kode_produksi}*\n`;
  if (job.warna && job.warna !== '-') msg += `Model/Warna: ${job.warna}\n`;
  msg += `No. Surat Jalan: ${job.no_surat_jalan}\n`;
  if (job.kategori) msg += `Kategori: ${job.kategori}\n`;
  msg += `PIC QC: ${job.pic_list.join(', ') || 'Warehouse'}\n\n`;

  msg += `*Rangkuman:*\n`;
  msg += `• Qty Setoran: *${totals.total_qty_awal} pcs*\n`;
  msg += `• Lolos (Grade A): *${totals.total_qty_oke} pcs*\n`;
  if (totals.total_qty_noda > 0) msg += `• Noda (Cuci): *${totals.total_qty_noda} pcs*\n`;
  if (totals.total_qty_permak > 0) msg += `• Permak (Jahit): *${totals.total_qty_permak} pcs*\n`;
  if (totals.total_qty_defect > 0) msg += `• Defect / BS: *${totals.total_qty_defect} pcs*\n`;

  if (totals.total_selisih !== 0) {
    const selisihLabel = totals.total_selisih > 0 ? `Lebih +${totals.total_selisih}` : `Kurang ${totals.total_selisih}`;
    msg += `• Selisih: *${selisihLabel} pcs*\n`;
  }
  msg += `• Kelolosan: *${totals.pass_rate}%*\n\n`;

  msg += `*Rincian per Size:*\n`;
  job.sizes.forEach((s) => {
    const rejects: string[] = [];
    if (s.qty_noda > 0) rejects.push(`Noda: ${s.qty_noda}`);
    if (s.qty_permak > 0) rejects.push(`Permak: ${s.qty_permak}`);
    if (s.qty_defect > 0) rejects.push(`Defect: ${s.qty_defect}`);

    const rejectText = rejects.length > 0 ? ` (Reject: ${rejects.join(', ')})` : '';
    msg += `• Size ${s.size}: Awal ${s.qty_awal} | Bagus: ${s.qty_oke}${rejectText}\n`;
  });

  if (job.catatan_umum && job.catatan_umum.trim()) {
    msg += `\n*Catatan QC:*\n${job.catatan_umum.trim()}\n`;
  }

  if (job.foto_evidence && job.foto_evidence.length > 0) {
    msg += `\n_${job.foto_evidence.length} foto bukti terlampir di sistem._\n`;
  }

  return msg.trim();
}
