import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Search,
  Plus,
  Trash2,
  Download,
  Eye,
  X,
  Camera,
  UploadCloud,
  Layers,
  Calendar,
  User,
  Tag,
  ExternalLink,
  ArrowRight,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  HelpCircle,
  Sparkles,
  ShieldCheck,
  Scissors,
  Share2,
  FileText,
} from 'lucide-react';
import {
  QcReport,
  QcStatus,
  ProductItem,
  UserSession,
  PerbaikanTicket,
} from '../types';
import { compressImage, formatBytes } from '../utils/imageCompressor';
import { playSuccessBeep, playErrorBeep, vibrateDevice } from '../services/audio';
import {
  fetchQcReportsFromSupabase,
  saveQcReportToSupabase,
  deleteQcReportFromSupabase,
  savePerbaikanTicketToSupabase,
} from '../services/supabase';

interface LaporanQcViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onNavigateToPerbaikan?: (ticketNo?: string) => void;
  onRejectCreated?: (newTicket: PerbaikanTicket) => void;
}

interface PhotoItem {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  savedPercent: number;
}

const INITIAL_DEMO_QC_REPORTS: QcReport[] = [
  {
    id: 1,
    report_no: 'QC-20260906-101',
    tanggal: '2026-09-06 14:20',
    sku: 'TSH-OVR-BLK-M',
    nama_produk: 'Oversized Tee Black - Size M',
    size: 'M',
    sumber_batch: 'Penerimaan CMT',
    status: 'OKE',
    qty_diperiksa: 50,
    qty_oke: 50,
    qty_reject: 0,
    lokasi_barang: 'Meja QC 01',
    foto_urls: [],
    catatan: 'Jahitan obras rapi, ukuran & warna sesuai spesifikasi PO',
    pic_qc: 'UserQC1',
    created_at: '2026-09-06T14:20:00.000Z',
  },
  {
    id: 2,
    report_no: 'QC-20260906-102',
    tanggal: '2026-09-06 15:45',
    sku: 'DRS-FLR-WHT-S',
    nama_produk: 'Floral Summer Dress White - Size S',
    size: 'S',
    sumber_batch: 'Penerimaan CMT',
    status: 'REJECT',
    qty_diperiksa: 30,
    qty_oke: 28,
    qty_reject: 2,
    kategori_rusak: 'Noda / Kotor',
    detail_kerusakan: 'Noda oli tipis di keliman bawah rok depan (2 pcs)',
    lokasi_barang: 'Meja QC 02',
    target_penanganan: 'CUCI',
    foto_urls: [
      'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60',
    ],
    catatan: 'Diteruskan ke pencucian noda tim reparasi',
    pic_qc: 'UserQC2',
    perbaikan_ticket_no: 'RJC-20260906-003',
    created_at: '2026-09-06T15:45:00.000Z',
  },
];

const SUMBER_BATCH_OPTIONS = [
  'Penerimaan CMT',
  'Produksi Baru',
  'Gudang Fisik',
  'Retur Marketplace',
  'Live/Studio',
  'Toko',
  'Lainnya',
];

const KATEGORI_RUSAK_OPTIONS = [
  'Noda / Kotor',
  'Jahitan Rusak',
  'Kain Sobek / Bolong',
  'Kancing / Resleting',
  'Cacat Kain / Warna',
  'Aksesoris Kurang',
  'Ukuran Tidak Sesuai',
  'Lainnya',
];

export const LaporanQcView: React.FC<LaporanQcViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
  onNavigateToPerbaikan,
  onRejectCreated,
}) => {
  const [reports, setReports] = useState<QcReport[]>(() => {
    try {
      const cached = localStorage.getItem('wms_local_qc_reports');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_DEMO_QC_REPORTS;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form State
  const [showForm, setShowForm] = useState<boolean>(true);
  const [formStatus, setFormStatus] = useState<QcStatus>('OKE');
  const [formSku, setFormSku] = useState<string>('');
  const [formNamaProduk, setFormNamaProduk] = useState<string>('');
  const [formSize, setFormSize] = useState<string>('');
  const [formSumberBatch, setFormSumberBatch] = useState<string>('Penerimaan CMT');
  const [formLokasiBarang, setFormLokasiBarang] = useState<string>('Meja QC 01');
  const [formModeBatch, setFormModeBatch] = useState<boolean>(false); // false = per unit, true = batch
  const [formQtyDiperiksa, setFormQtyDiperiksa] = useState<number>(1);
  const [formQtyOke, setFormQtyOke] = useState<number>(1);
  const [formQtyReject, setFormQtyReject] = useState<number>(0);
  const [formKategoriRusak, setFormKategoriRusak] = useState<string>('Noda / Kotor');
  const [formDetailKerusakan, setFormDetailKerusakan] = useState<string>('');
  const [formTargetPenanganan, setFormTargetPenanganan] = useState<'REJECT' | 'CUCI' | 'PERMAK' | 'DEFECT'>('REJECT');
  const [formPhotos, setFormPhotos] = useState<PhotoItem[]>([]);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState<boolean>(false);
  const [formGdriveLink, setFormGdriveLink] = useState<string>('');
  const [formCatatan, setFormCatatan] = useState<string>('');
  const [formPicQc, setFormPicQc] = useState<string>(
    session?.name || session?.username || 'PIC QC'
  );

  // Autocomplete Suggestions
  const [skuSuggestions, setSkuSuggestions] = useState<ProductItem[]>([]);
  const [showSkuSuggestions, setShowSkuSuggestions] = useState<boolean>(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OKE' | 'REJECT'>('ALL');
  const [filterSumber, setFilterSumber] = useState<string>('ALL');

  // Lightbox Modal
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);

  // Load from Supabase on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchQcReportsFromSupabase();
        if (mounted && data && data.length > 0) {
          setReports(data);
        }
      } catch (err) {
        console.warn('Gagal load laporan QC:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync PIC when session changes
  useEffect(() => {
    if (session?.name || session?.username) {
      setFormPicQc(session.name || session.username);
    }
  }, [session]);

  // Adjust quantities when status changes in single-item mode
  useEffect(() => {
    if (!formModeBatch) {
      if (formStatus === 'OKE') {
        setFormQtyDiperiksa(1);
        setFormQtyOke(1);
        setFormQtyReject(0);
      } else {
        setFormQtyDiperiksa(1);
        setFormQtyOke(0);
        setFormQtyReject(1);
      }
    }
  }, [formStatus, formModeBatch]);

  // Handle SKU input and search in catalog
  const handleSkuChange = (val: string) => {
    setFormSku(val);
    if (!val.trim() || productCatalog.length === 0) {
      setSkuSuggestions([]);
      setShowSkuSuggestions(false);
      return;
    }
    const q = val.toLowerCase();
    const matches = productCatalog
      .filter((p) => {
        const sSku = String(p.k || p.sku || '').toLowerCase();
        const sName = String(p.n || p.p || p.name || '').toLowerCase();
        return sSku.includes(q) || sName.includes(q);
      })
      .slice(0, 6);
    setSkuSuggestions(matches);
    setShowSkuSuggestions(matches.length > 0);
  };

  const handleSelectSuggestion = (p: ProductItem) => {
    const sSku = String(p.k || p.sku || '');
    const sName = String(p.n || p.p || p.name || '');
    const sSize = String(p.s || p.size || '');
    const sLoc = String(p.lokasi || p.location || '');

    setFormSku(sSku);
    setFormNamaProduk(sName);
    if (sSize && sSize !== 'Default') setFormSize(sSize);
    if (sLoc) setFormLokasiBarang(sLoc);
    setShowSkuSuggestions(false);
  };

  // Photo Upload with Client-Side Canvas WebP Compression
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (formPhotos.length + files.length > 6) {
      onShowToast('Maksimal 6 foto dokumentasi per laporan QC', 'warning');
      return;
    }

    setIsCompressingPhoto(true);
    try {
      const newPhotos: PhotoItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Compress image using existing WebP canvas engine (max 1024px, 0.65 quality -> ~35KB)
        const res = await compressImage(file, 1024, 0.65);
        newPhotos.push({
          dataUrl: res.dataUrl,
          originalSize: res.originalSize,
          compressedSize: res.compressedSize,
          savedPercent: res.savedPercentage,
        });
      }

      setFormPhotos((prev) => [...prev, ...newPhotos]);
      const avgSaved = newPhotos[0]?.savedPercent || 98;
      onShowToast(
        `Berhasil mengompresi ${newPhotos.length} foto! Rata-rata hemat kapasitas storage ~${avgSaved}%`,
        'success'
      );
    } catch (err) {
      console.warn('Gagal memproses foto:', err);
      onShowToast('Gagal memproses dan mengompres foto', 'error');
    } finally {
      setIsCompressingPhoto(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setFormPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formSku.trim()) {
      onShowToast('SKU produk wajib diisi!', 'warning');
      return;
    }

    if (!formNamaProduk.trim()) {
      onShowToast('Nama produk wajib diisi!', 'warning');
      return;
    }

    const qtyChecked = Number(formQtyDiperiksa) || 1;
    const qtyOke = Number(formQtyOke) || 0;
    const qtyReject = Number(formQtyReject) || 0;

    if (formStatus === 'REJECT' && qtyReject <= 0) {
      onShowToast('Qty reject harus lebih dari 0 untuk status REJECT!', 'warning');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Generate Report Number
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.floor(100 + Math.random() * 900);
      const reportNo = `QC-${dateStr}-${rand}`;

      let perbaikanTicketNo: string | undefined = undefined;

      // 2. OTOMATISASI: Jika status REJECT, buat tiket baru di Perbaikan & Defect
      if (formStatus === 'REJECT' || qtyReject > 0) {
        const ticketRand = Math.floor(100 + Math.random() * 900);
        perbaikanTicketNo = `RJC-${dateStr}-${ticketRand}`;

        // Map target penanganan ke lokasi rak perbaikan
        let targetLokasi = 'PERBAIKAN-01';
        if (formTargetPenanganan === 'CUCI') targetLokasi = 'CC-01';
        else if (formTargetPenanganan === 'PERMAK') targetLokasi = 'PMK-01';
        else if (formTargetPenanganan === 'DEFECT') targetLokasi = 'DF-01';

        // Map sumber barang
        let mappedSumber: PerbaikanTicket['sumber_barang'] = 'Gudang Fisik';
        if (formSumberBatch.includes('CMT') || formSumberBatch.includes('Produksi')) {
          mappedSumber = 'Penerimaan CMT';
        } else if (formSumberBatch.includes('Retur')) {
          mappedSumber = 'Retur Marketplace';
        } else if (formSumberBatch.includes('Studio') || formSumberBatch.includes('Live')) {
          mappedSumber = 'Live/Studio';
        } else if (formSumberBatch.includes('Toko')) {
          mappedSumber = 'Toko';
        }

        const newTicket: PerbaikanTicket = {
          ticket_no: perbaikanTicketNo,
          tanggal: now.toISOString(),
          sku: formSku.trim(),
          nama_produk: formNamaProduk.trim(),
          size: formSize.trim() || '-',
          qty: qtyReject > 0 ? qtyReject : 1,
          lokasi_asal: formLokasiBarang.trim() || 'Area QC',
          lokasi_sekarang: targetLokasi,
          is_already_in_repair: false,
          sumber_barang: mappedSumber,
          kategori_rusak: (formKategoriRusak as any) || 'Noda / Kotor',
          detail_kerusakan: `[QC #${reportNo}] ${formDetailKerusakan.trim() || 'Ditemukan cacat saat inspeksi QC'}`,
          foto_urls: formPhotos.map((p) => p.dataUrl),
          tahap: formTargetPenanganan,
          status_pengerjaan: 'PENDING',
          qc_pic: formPicQc.trim(),
          qc_tanggal: now.toISOString(),
          qc_catatan: `Inspeksi QC: REJECT (${qtyReject} pcs). ${formCatatan.trim()}`,
          operator_input: formPicQc.trim(),
          qc_report_no: reportNo,
          created_at: now.toISOString(),
        };

        // Simpan ke Supabase tabel perbaikan_tickets
        try {
          await savePerbaikanTicketToSupabase(newTicket);
          if (onRejectCreated) {
            onRejectCreated(newTicket);
          }
        } catch (errTicket) {
          console.warn('Gagal simpan tiket perbaikan:', errTicket);
        }
      }

      // 3. Simpan Laporan QC
      const newReport: QcReport = {
        report_no: reportNo,
        tanggal: now.toISOString(),
        sku: formSku.trim(),
        nama_produk: formNamaProduk.trim(),
        size: formSize.trim() || '-',
        sumber_batch: formSumberBatch,
        status: formStatus,
        qty_diperiksa: qtyChecked,
        qty_oke: qtyOke,
        qty_reject: qtyReject,
        kategori_rusak: formStatus === 'REJECT' ? formKategoriRusak : undefined,
        detail_kerusakan: formStatus === 'REJECT' ? formDetailKerusakan.trim() : undefined,
        lokasi_barang: formLokasiBarang.trim(),
        target_penanganan: formStatus === 'REJECT' ? formTargetPenanganan : undefined,
        foto_urls: formPhotos.map((p) => p.dataUrl),
        gdrive_link: formGdriveLink.trim() || undefined,
        catatan: formCatatan.trim() || undefined,
        pic_qc: formPicQc.trim() || 'PIC QC',
        perbaikan_ticket_no: perbaikanTicketNo,
        created_at: now.toISOString(),
      };

      const saved = await saveQcReportToSupabase(newReport);
      setReports((prev) => [saved, ...prev]);

      playSuccessBeep();
      vibrateDevice([40, 60, 40]);

      if (formStatus === 'REJECT' && perbaikanTicketNo) {
        onShowToast(
          `Laporan QC #${reportNo} (REJECT) tersimpan! Tiket perbaikan #${perbaikanTicketNo} otomatis diteruskan ke tab Perbaikan & Defect.`,
          'success'
        );
      } else {
        onShowToast(`Laporan QC #${reportNo} (OKE / Lolos) berhasil disimpan!`, 'success');
      }

      // Reset form
      setFormSku('');
      setFormNamaProduk('');
      setFormSize('');
      setFormDetailKerusakan('');
      setFormCatatan('');
      setFormGdriveLink('');
      setFormPhotos([]);
      if (!formModeBatch) {
        setFormQtyDiperiksa(1);
        setFormQtyOke(1);
        setFormQtyReject(0);
      }
    } catch (err: any) {
      playErrorBeep();
      console.warn('Gagal menyimpan laporan QC:', err);
      onShowToast(`Gagal menyimpan laporan QC: ${err?.message || 'Kesalahan sistem'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Report Handler
  const handleDeleteReport = async (report: QcReport) => {
    if (!window.confirm(`Hapus laporan QC #${report.report_no}?`)) return;

    try {
      await deleteQcReportFromSupabase(report.id || report.report_no);
      setReports((prev) => prev.filter((r) => r.report_no !== report.report_no));
      onShowToast(`Laporan QC #${report.report_no} berhasil dihapus`, 'info');
    } catch (err) {
      onShowToast('Gagal menghapus laporan QC', 'error');
    }
  };

  // Filtered Reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSku = r.sku?.toLowerCase().includes(q);
        const matchNama = r.nama_produk?.toLowerCase().includes(q);
        const matchNo = r.report_no?.toLowerCase().includes(q);
        const matchPic = r.pic_qc?.toLowerCase().includes(q);
        const matchTicket = r.perbaikan_ticket_no?.toLowerCase().includes(q);
        if (!matchSku && !matchNama && !matchNo && !matchPic && !matchTicket) return false;
      }
      // Status
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      // Sumber
      if (filterSumber !== 'ALL' && r.sumber_batch !== filterSumber) return false;

      return true;
    });
  }, [reports, searchQuery, filterStatus, filterSumber]);

  // Metrics
  const metrics = useMemo(() => {
    let totalChecked = 0;
    let totalOke = 0;
    let totalReject = 0;
    let todayReportsCount = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const r of reports) {
      totalChecked += Number(r.qty_diperiksa) || 0;
      totalOke += Number(r.qty_oke) || 0;
      totalReject += Number(r.qty_reject) || 0;
      if (r.tanggal && r.tanggal.startsWith(todayStr)) {
        todayReportsCount++;
      }
    }

    const rejectRate = totalChecked > 0 ? ((totalReject / totalChecked) * 100).toFixed(1) : '0.0';
    return {
      totalReports: reports.length,
      totalChecked,
      totalOke,
      totalReject,
      rejectRate,
      todayReportsCount,
    };
  }, [reports]);

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredReports.length === 0) {
      onShowToast('Tidak ada data laporan QC untuk diekspor', 'warning');
      return;
    }

    const headers = [
      'No Laporan',
      'Tanggal',
      'SKU',
      'Nama Produk',
      'Size',
      'Sumber / Batch',
      'Status',
      'Qty Diperiksa',
      'Qty OKE',
      'Qty Reject',
      'Kategori Rusak',
      'Detail Kerusakan',
      'Target Penanganan',
      'Link GDrive',
      'PIC QC',
      'No Tiket Perbaikan',
      'Catatan',
    ];

    const rows = filteredReports.map((r) => [
      `"${r.report_no}"`,
      `"${r.tanggal || ''}"`,
      `"${r.sku}"`,
      `"${(r.nama_produk || '').replace(/"/g, '""')}"`,
      `"${r.size || '-'}"`,
      `"${r.sumber_batch || ''}"`,
      `"${r.status}"`,
      r.qty_diperiksa || 0,
      r.qty_oke || 0,
      r.qty_reject || 0,
      `"${r.kategori_rusak || '-'}"`,
      `"${(r.detail_kerusakan || '-').replace(/"/g, '""')}"`,
      `"${r.target_penanganan || '-'}"`,
      `"${r.gdrive_link || '-'}"`,
      `"${r.pic_qc || '-'}"`,
      `"${r.perbaikan_ticket_no || '-'}"`,
      `"${(r.catatan || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_QC_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Laporan QC berhasil diekspor ke CSV!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* 1. Stat Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Laporan</span>
            <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600">
              <ClipboardCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800 dark:text-white">{metrics.totalReports}</span>
            <span className="text-xs text-slate-400">laporan</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{metrics.todayReportsCount} hari ini</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Diperiksa</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{metrics.totalChecked}</span>
            <span className="text-xs text-slate-400">pcs</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Total fisik diinspeksi</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lolos / OKE</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.totalOke}</span>
            <span className="text-xs text-slate-400">pcs</span>
          </div>
          <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {metrics.totalChecked > 0 ? `${((metrics.totalOke / metrics.totalChecked) * 100).toFixed(1)}% lolos` : '0%'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reject / Defect</span>
            <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-600">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">{metrics.totalReject}</span>
            <span className="text-xs text-slate-400">pcs</span>
          </div>
          <div className="mt-1 text-xs text-rose-500 font-medium">Otomatis ke Perbaikan</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reject Rate</span>
            <span className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics.rejectRate}%</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Tingkat cacat kualitas</div>
        </div>
      </div>

      {/* 2. Collapsible Form Input Laporan QC */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-all">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-sm">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Form Input Laporan Inspeksi QC
              </h3>
              <p className="text-xs text-slate-500">
                Input hasil inspeksi barang: tandai OKE untuk lolos, atau REJECT untuk otomatis buat tiket perbaikan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
          >
            {showForm ? 'Sembunyikan Form' : '+ Buka Form Input'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
            {/* Status Selector: OKE vs REJECT */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Status Hasil Pemeriksaan QC <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3 max-w-xl">
                <button
                  type="button"
                  onClick={() => setFormStatus('OKE')}
                  className={`flex items-center justify-center gap-3 p-3.5 rounded-xl border-2 transition-all font-semibold ${
                    formStatus === 'OKE'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <CheckCircle2 className={`w-5 h-5 ${formStatus === 'OKE' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div className="text-left">
                    <div className="text-sm font-bold leading-tight">PRODUK OKE (Lolos)</div>
                    <div className="text-xs opacity-75 font-normal">Kualitas bagus, layak stok</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormStatus('REJECT')}
                  className={`flex items-center justify-center gap-3 p-3.5 rounded-xl border-2 transition-all font-semibold ${
                    formStatus === 'REJECT'
                      ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 ring-2 ring-rose-500/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 ${formStatus === 'REJECT' ? 'text-rose-600' : 'text-slate-400'}`} />
                  <div className="text-left">
                    <div className="text-sm font-bold leading-tight">PRODUK REJECT (Defect)</div>
                    <div className="text-xs opacity-75 font-normal">Auto-kirim ke Perbaikan</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Basic Info: SKU, Nama Produk, Size, Sumber, Lokasi */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* SKU dengan Auto-Complete */}
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  SKU Produk <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formSku}
                    onChange={(e) => handleSkuChange(e.target.value)}
                    placeholder="Ketik / Scan SKU..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  {formSku && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormSku('');
                        setShowSkuSuggestions(false);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown Suggestions */}
                {showSkuSuggestions && skuSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {skuSuggestions.map((item, idx) => {
                      const sSku = String(item.k || item.sku || '');
                      const sName = String(item.n || item.p || item.name || '');
                      const sSize = String(item.s || item.size || '');
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectSuggestion(item)}
                          className="w-full text-left px-3.5 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                        >
                          <div className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{sSku}</div>
                          <div className="text-xs text-slate-700 dark:text-slate-300 truncate">{sName}</div>
                          {sSize && sSize !== 'Default' && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              Size: {sSize}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Nama Produk */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formNamaProduk}
                  onChange={(e) => setFormNamaProduk(e.target.value)}
                  placeholder="e.g. Oversized Shirt Sage"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Size */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Ukuran / Size
                </label>
                <input
                  type="text"
                  value={formSize}
                  onChange={(e) => setFormSize(e.target.value)}
                  placeholder="e.g. S, M, L, XL, All Size"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Sumber Batch & Lokasi & PIC */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sumber / Asal Batch
                </label>
                <select
                  value={formSumberBatch}
                  onChange={(e) => setFormSumberBatch(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {SUMBER_BATCH_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Lokasi / Meja Pemeriksaan
                </label>
                <input
                  type="text"
                  value={formLokasiBarang}
                  onChange={(e) => setFormLokasiBarang(e.target.value)}
                  placeholder="e.g. Meja QC 01, Rak Inbound"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  PIC Pemeriksa QC
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formPicQc}
                    onChange={(e) => setFormPicQc(e.target.value)}
                    placeholder="Nama PIC QC..."
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            {/* Toggle Mode: Unit Tunggal vs Batch Quantity */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Mode Kuantitas Pemeriksaan</span>
                  <p className="text-[11px] text-slate-500">
                    {formModeBatch
                      ? 'Pemeriksaan batch lot (Contoh: periksa 50 pcs, lolos 48 pcs, reject 2 pcs)'
                      : 'Pemeriksaan satuan per potong pakaian (1 pcs per input)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !formModeBatch;
                    setFormModeBatch(next);
                    if (!next) {
                      if (formStatus === 'OKE') {
                        setFormQtyDiperiksa(1);
                        setFormQtyOke(1);
                        setFormQtyReject(0);
                      } else {
                        setFormQtyDiperiksa(1);
                        setFormQtyOke(0);
                        setFormQtyReject(1);
                      }
                    }
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    formModeBatch
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {formModeBatch ? 'Mode Batch Aktif' : 'Ganti ke Mode Batch'}
                </button>
              </div>

              {formModeBatch ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Qty Diperiksa (Pcs)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formQtyDiperiksa}
                      onChange={(e) => {
                        const v = Math.max(1, parseInt(e.target.value) || 1);
                        setFormQtyDiperiksa(v);
                        if (formStatus === 'OKE') {
                          setFormQtyOke(v);
                          setFormQtyReject(0);
                        } else {
                          const r = Math.min(v, formQtyReject || 1);
                          setFormQtyReject(r);
                          setFormQtyOke(Math.max(0, v - r));
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                      Qty Lolos OKE (Pcs)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={formQtyDiperiksa}
                      value={formQtyOke}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(formQtyDiperiksa, parseInt(e.target.value) || 0));
                        setFormQtyOke(v);
                        setFormQtyReject(Math.max(0, formQtyDiperiksa - v));
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-rose-600 dark:text-rose-400 mb-1">
                      Qty Cacat / REJECT (Pcs)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={formQtyDiperiksa}
                      value={formQtyReject}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(formQtyDiperiksa, parseInt(e.target.value) || 0));
                        setFormQtyReject(v);
                        setFormQtyOke(Math.max(0, formQtyDiperiksa - v));
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 text-sm font-semibold"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                  <span>Kuantitas:</span>
                  <span className="font-bold text-slate-800 dark:text-white">1 Pcs</span>
                  <span className="text-slate-400">•</span>
                  <span>Hasil:</span>
                  <span className={`font-bold ${formStatus === 'OKE' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {formStatus === 'OKE' ? '1 Pcs Lolos' : '1 Pcs Reject'}
                  </span>
                </div>
              )}
            </div>

            {/* Bagian Khusus Jika REJECT: Kategori Kerusakan, Target Penanganan, Foto Bukti */}
            {(formStatus === 'REJECT' || formQtyReject > 0) && (
              <div className="p-5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 space-y-5">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Detail Kerusakan & Tindak Lanjut Perbaikan</span>
                  <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                    Otomatis Buat Tiket Perbaikan
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Kategori Kerusakan */}
                  <div>
                    <label className="block text-xs font-semibold text-rose-800 dark:text-rose-200 mb-1">
                      Kategori Kerusakan / Defect <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formKategoriRusak}
                      onChange={(e) => setFormKategoriRusak(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                    >
                      {KATEGORI_RUSAK_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Target Penanganan Awal */}
                  <div>
                    <label className="block text-xs font-semibold text-rose-800 dark:text-rose-200 mb-1">
                      Target Penanganan Perbaikan
                    </label>
                    <select
                      value={formTargetPenanganan}
                      onChange={(e) => setFormTargetPenanganan(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                    >
                      <option value="REJECT">Antrean Sortir QC (Rak REJECT-01)</option>
                      <option value="CUCI">Pencucian Noda (Rak CC-01)</option>
                      <option value="PERMAK">Jahit / Permak Pakaian (Rak PMK-01)</option>
                      <option value="DEFECT">Defect Permanen (Rak DF-01 / Vonis Defect)</option>
                    </select>
                  </div>
                </div>

                {/* Detail Kerusakan */}
                <div>
                  <label className="block text-xs font-semibold text-rose-800 dark:text-rose-200 mb-1">
                    Detail Kerusakan / Titik Cacat <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required={formStatus === 'REJECT'}
                    value={formDetailKerusakan}
                    onChange={(e) => setFormDetailKerusakan(e.target.value)}
                    placeholder="Contoh: Jahitan ketiak kiri lepas ~4cm, terdapat noda minyak samar di dada kanan..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>

                {/* Upload Foto Dokumentasi Reject (WebP Compression) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                        Dokumentasi Foto Cacat / Bukti Reject (Bisa Lebih dari 1 Foto)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Foto otomatis dikompresi WebP ultra-ringan (~35 KB/foto, hemat &gt;98% storage)
                      </p>
                    </div>
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors shadow-sm">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isCompressingPhoto ? 'Mengompres...' : '+ Ambil / Upload Foto'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={isCompressingPhoto}
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Thumbnail List */}
                  {formPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 pt-2">
                      {formPhotos.map((p, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 shadow-sm aspect-square">
                          <img
                            src={p.dataUrl}
                            alt={`Foto ${idx + 1}`}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setLightboxImages(formPhotos.map((x) => x.dataUrl))}
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-[9px] text-white flex justify-between items-center">
                            <span>{formatBytes(p.compressedSize)}</span>
                            <span className="text-emerald-400 font-bold">-{p.savedPercent}%</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(idx)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-rose-600 text-white opacity-90 hover:opacity-100 shadow transition-opacity"
                            title="Hapus foto"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-rose-300 dark:border-rose-800/60 text-center text-xs text-rose-500 dark:text-rose-400 bg-white/50 dark:bg-slate-900/30">
                      Belum ada foto reject yang dilampirkan. Klik tombol &ldquo;+ Ambil / Upload Foto&rdquo; di atas.
                    </div>
                  )}
                </div>

                {/* Google Drive Link (Opsional untuk integrasi penyimpanan eksternal) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Link Folder / File Google Drive (Opsional)
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={formGdriveLink}
                      onChange={(e) => setFormGdriveLink(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <ExternalLink className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    PIC dapat menyematkan link folder Google Drive untuk arsip video inspeksi atau dokumentasi resolusi penuh.
                  </p>
                </div>
              </div>
            )}

            {/* Catatan Umum */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Catatan Tambahan QC (Opsional)
              </label>
              <input
                type="text"
                value={formCatatan}
                onChange={(e) => setFormCatatan(e.target.value)}
                placeholder="Catatan lain perihal jahitan, aksesoris, atau arahan khusus..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setFormSku('');
                  setFormNamaProduk('');
                  setFormDetailKerusakan('');
                  setFormPhotos([]);
                  setFormGdriveLink('');
                  setFormCatatan('');
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors"
              >
                Reset Input
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isCompressingPhoto}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-semibold text-sm shadow-md transition-all ${
                  formStatus === 'OKE'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                } disabled:opacity-50`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Supabase...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan Laporan QC {formStatus === 'REJECT' ? '& Teruskan ke Perbaikan' : ''}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 3. Filter & Rekap Tabel Laporan QC */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Riwayat & Rekap Laporan Quality Control
              </h3>
              <p className="text-xs text-slate-500">
                Menampilkan {filteredReports.length} dari total {reports.length} rekaman inspeksi QC
              </p>
            </div>
          </div>

          {/* Action Buttons: Export CSV & Refresh */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor CSV</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                setIsLoading(true);
                try {
                  const data = await fetchQcReportsFromSupabase();
                  if (data) setReports(data);
                  onShowToast('Data laporan QC berhasil disinkronisasi', 'info');
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-4 bg-slate-50/70 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari SKU, Nama Produk, No Laporan, PIC..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Status */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                filterStatus === 'ALL'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semua ({reports.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('OKE')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                filterStatus === 'OKE'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              OKE Lolos ({reports.filter((r) => r.status === 'OKE').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('REJECT')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                filterStatus === 'REJECT'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
              }`}
            >
              REJECT Defect ({reports.filter((r) => r.status === 'REJECT').length})
            </button>
          </div>

          {/* Filter Sumber */}
          <select
            value={filterSumber}
            onChange={(e) => setFilterSumber(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="ALL">Semua Sumber Batch</option>
            {SUMBER_BATCH_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Reports Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/75 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold">
                <th className="py-3 px-4">No. Laporan & Tanggal</th>
                <th className="py-3 px-4">Produk / SKU</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4">Kategori & Detail Kerusakan</th>
                <th className="py-3 px-4 text-center">Foto Bukti</th>
                <th className="py-3 px-4">PIC QC</th>
                <th className="py-3 px-4">Terusan Perbaikan</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ClipboardCheck className="w-8 h-8 opacity-40 text-slate-400" />
                      <span>Tidak ada data laporan QC yang cocok dengan filter.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReports.map((r) => {
                  const isReject = r.status === 'REJECT';
                  return (
                    <tr
                      key={r.report_no}
                      className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* No Laporan & Tanggal */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          {r.report_no}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {r.tanggal ? new Date(r.tanggal).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }) : '-'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Sumber: <span className="font-medium text-slate-700 dark:text-slate-300">{r.sumber_batch}</span>
                        </div>
                      </td>

                      {/* Produk / SKU */}
                      <td className="py-3.5 px-4 max-w-[220px]">
                        <div className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {r.sku}
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-100 truncate" title={r.nama_produk}>
                          {r.nama_produk}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                          {r.size && r.size !== '-' && <span>Size: <strong className="text-slate-600 dark:text-slate-300">{r.size}</strong></span>}
                          {r.lokasi_barang && <span>• Rak/Meja: <strong className="text-slate-600 dark:text-slate-300">{r.lokasi_barang}</strong></span>}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {isReject ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            <AlertTriangle className="w-3 h-3" />
                            REJECT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            OKE Lolos
                          </span>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {r.qty_diperiksa} pcs
                        </div>
                        <div className="text-[10px] mt-0.5">
                          <span className="text-emerald-600 font-medium">OK: {r.qty_oke}</span>
                          {r.qty_reject > 0 && (
                            <span className="text-rose-600 font-bold ml-1.5">RJC: {r.qty_reject}</span>
                          )}
                        </div>
                      </td>

                      {/* Kategori & Detail Kerusakan */}
                      <td className="py-3.5 px-4 max-w-[240px]">
                        {isReject ? (
                          <div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                              {r.kategori_rusak || 'Defect'}
                            </span>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2" title={r.detail_kerusakan}>
                              {r.detail_kerusakan || '-'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium italic">
                            {r.catatan || 'Kualitas lolos Grade A tanpa cacat'}
                          </div>
                        )}
                      </td>

                      {/* Foto Bukti */}
                      <td className="py-3.5 px-4 text-center">
                        {r.foto_urls && r.foto_urls.length > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setLightboxImages(r.foto_urls)}
                              className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 w-9 h-9 flex-shrink-0"
                              title="Klik untuk memperbesar foto"
                            >
                              <img
                                src={r.foto_urls[0]}
                                alt="Foto"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              {r.foto_urls.length > 1 && (
                                <span className="absolute inset-0 bg-black/50 text-white font-bold text-[10px] flex items-center justify-center">
                                  +{r.foto_urls.length - 1}
                                </span>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">-</span>
                        )}
                        {r.gdrive_link && (
                          <div className="mt-1">
                            <a
                              href={r.gdrive_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                              title="Buka Google Drive"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>GDrive</span>
                            </a>
                          </div>
                        )}
                      </td>

                      {/* PIC QC */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {r.pic_qc || '-'}
                        </div>
                      </td>

                      {/* Terusan Perbaikan */}
                      <td className="py-3.5 px-4">
                        {r.perbaikan_ticket_no ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onNavigateToPerbaikan) {
                                onNavigateToPerbaikan(r.perbaikan_ticket_no);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-mono text-[11px] font-bold border border-rose-200 dark:border-rose-900 transition-colors"
                            title="Klik untuk buka antrean di Tab Perbaikan & Defect"
                          >
                            <Scissors className="w-3 h-3 text-rose-600" />
                            <span>#{r.perbaikan_ticket_no}</span>
                            <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">-</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteReport(r)}
                          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Hapus laporan QC"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Lightbox Modal Preview Foto */}
      {lightboxImages && lightboxImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxImages(null)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] bg-slate-900 rounded-2xl p-4 overflow-hidden border border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-white">
              <span className="text-sm font-semibold">
                Dokumentasi Foto Bukti QC ({lightboxImages.length} Foto)
              </span>
              <button
                type="button"
                onClick={() => setLightboxImages(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4 overflow-y-auto max-h-[75vh]">
              {lightboxImages.map((src, i) => (
                <div key={i} className="rounded-xl overflow-hidden bg-black/50 flex items-center justify-center">
                  <img src={src} alt={`Foto ${i + 1}`} className="max-w-full max-h-[70vh] object-contain" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
