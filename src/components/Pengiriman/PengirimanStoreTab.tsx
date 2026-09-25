import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Store,
  Calendar,
  Layers,
  FileText,
  Plus,
  Trash2,
  Printer,
  Send,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  Box,
  Package,
  Copy,
  QrCode,
  ArrowRight,
  RefreshCw,
  CheckSquare,
  Square,
  Edit,
  XCircle,
  History,
  AlertTriangle,
  Info,
  Camera,
  Image as ImageIcon,
  Eye,
  Loader2,
  UploadCloud,
  Barcode as BarcodeIcon,
  Check,
  Edit3,
  X,
  Undo2,
  Sparkles,
} from 'lucide-react';
import {
  UserSession,
  PengirimanStoreReport,
  PengirimanStoreItem,
  PengirimanStoreTrip,
  KoliMarkingLabel,
  SatuanPengirimanStore,
  PengirimanAuditLog,
} from '../../types';
import {
  fetchPengirimanStoreReports,
  fetchPengirimanStoreTrips,
  savePengirimanStoreBatch,
  processKirimStoreReports,
  deletePengirimanStoreReport,
  cancelDispatchedReport,
  editPengirimanStoreReport,
  editPengirimanStoreReportFull,
  cancelPengirimanStoreReport,
  cancelSuratJalanPengirimanTrip,
  removeReportFromSuratJalanPengiriman,
  editSuratJalanPengirimanTrip,
  generateKoliLabelsForReport,
  markReportsLabelAsPrinted,
  getTodayDateString,
  getCurrentTimeString,
} from '../../services/pengirimanStore';
import { fetchOutlets, DEFAULT_OUTLETS } from '../../services/gasManualShipment';
import { uploadMultipleImagesToGdrive } from '../../services/gdriveUpload';
import { compressImage } from '../../utils/imageCompressor';
import { KoliMarkingPrintModal } from './KoliMarkingPrintModal';
import { SuratJalanPrintModal } from './SuratJalanPrintModal';
import { SearchableSelect } from '../common/SearchableSelect';

interface PengirimanStoreTabProps {
  session?: UserSession | null;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface ItemInputRow {
  tempId: string;
  storeTujuan: string;
  isCustomStore?: boolean;
  customStoreInput?: string;
  noSuratJalan: string;
  deskripsi: string;
  qty: number | '';
  satuan: SatuanPengirimanStore;
  keterangan: string;
  fotoBarang?: string;
  isCompressingPhoto?: boolean;
}

export interface HistoriBatchItem {
  tripId: string;
  storeTujuan: string;
  tanggalKirim: string;
  waktuKirim: string;
  dikirimOleh: string;
  armada: string;
  noPolisi: string;
  catatanKirim: string;
  status: 'active' | 'cancelled';
  reports: PengirimanStoreReport[];
  totalKoli: number;
  totalItemCount: number;
  allPhotos: string[];
  createdAt: string;
}

export const PengirimanStoreTab: React.FC<PengirimanStoreTabProps> = ({
  session = null,
  onShowToast = () => {},
}) => {
  // Sub-tab Navigation: Laporan, Dispatched, Kirim, Histori
  const [activeSubTab, setActiveSubTab] = useState<'laporan' | 'dispatched' | 'kirim' | 'histori'>('laporan');

  // Master Store Data
  const [stores, setStores] = useState<{ id?: string; nama: string; fulfillment?: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState<boolean>(false);

  // Data Reports
  const [reports, setReports] = useState<PengirimanStoreReport[]>([]);
  const [loadingReports, setLoadingReports] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // 1. FORM LAPORAN STATE
  // --------------------------------------------------------------------------
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);
  const [itemRows, setItemRows] = useState<ItemInputRow[]>([
    {
      tempId: 'row-1',
      storeTujuan: 'GAIA',
      noSuratJalan: '',
      deskripsi: '',
      qty: 1,
      satuan: 'Koli',
      keterangan: '',
      fotoBarang: '',
    },
  ]);

  // Overall shipment photos (Opsi B: Foto Pengiriman Keseluruhan / Koli / Packing)
  const [overallPhotos, setOverallPhotos] = useState<string[]>([]);
  const [isCompressingOverall, setIsCompressingOverall] = useState<boolean>(false);
  const overallFileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal Preview Foto
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [previewPhotoTitle, setPreviewPhotoTitle] = useState<string>('Preview Dokumentasi Foto');

  // Trips data
  const [trips, setTrips] = useState<PengirimanStoreTrip[]>([]);
  const [selectedBatchDetail, setSelectedBatchDetail] = useState<HistoriBatchItem | null>(null);
  const [editingTripBatch, setEditingTripBatch] = useState<HistoriBatchItem | null>(null);
  const [cancellingTripBatch, setCancellingTripBatch] = useState<HistoriBatchItem | null>(null);
  const [tripCancelReason, setTripCancelReason] = useState<string>('');
  const [isProcessingTripCancel, setIsProcessingTripCancel] = useState<boolean>(false);
  const [editTripTanggalKirim, setEditTripTanggalKirim] = useState<string>('');
  const [editTripDikirimOleh, setEditTripDikirimOleh] = useState<string>('');
  const [editTripArmada, setEditTripArmada] = useState<string>('');
  const [editTripNoPolisi, setEditTripNoPolisi] = useState<string>('');
  const [editTripCatatan, setEditTripCatatan] = useState<string>('');
  const [editTripSelectedReportIds, setEditTripSelectedReportIds] = useState<string[]>([]);
  const [isSavingTripEdit, setIsSavingTripEdit] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // 2. DISPATCHED TAB STATE
  // --------------------------------------------------------------------------
  const [searchDispatched, setSearchDispatched] = useState<string>('');
  const [filterStoreDispatched, setFilterStoreDispatched] = useState<string[]>([]);
  const [filterLabelStatusDispatched, setFilterLabelStatusDispatched] = useState<'all' | 'printed' | 'unprinted'>('all');
  const [selectedDispatchedIds, setSelectedDispatchedIds] = useState<string[]>([]);

  // Modal Edit Laporan Dispatched State
  const [editingDispatchedReport, setEditingDispatchedReport] = useState<PengirimanStoreReport | null>(null);
  const [editStoreTujuan, setEditStoreTujuan] = useState<string>('');
  const [editItems, setEditItems] = useState<PengirimanStoreItem[]>([]);
  const [isSavingEditDispatched, setIsSavingEditDispatched] = useState<boolean>(false);

  // Multi-Store Fast Batch Generator State (Form Laporan)
  const [isMultiStoreModalOpen, setIsMultiStoreModalOpen] = useState<boolean>(false);
  const [multiStoreSelected, setMultiStoreSelected] = useState<string[]>([]);
  const [multiStoreDeskripsi, setMultiStoreDeskripsi] = useState<string>('');
  const [multiStoreNoSJ, setMultiStoreNoSJ] = useState<string>('');
  const [multiStoreQty, setMultiStoreQty] = useState<number>(1);
  const [multiStoreSatuan, setMultiStoreSatuan] = useState<SatuanPengirimanStore>('Koli');
  const [multiStoreKeterangan, setMultiStoreKeterangan] = useState<string>('');

  // --------------------------------------------------------------------------
  // 3. TAB KIRIM (SETUP PENGIRIMAN) STATE
  // Sesuai instruksi user:
  // - Pilih Store Tujuan -> daftar dispatched toko tersebut otomatis muncul
  // - Bisa pilih semua atau pilih beberapa
  // - Dikirim Oleh (perlu)
  // - Catatan Kirim (perlu)
  // - Jam berangkat (tidak perlu), Armada (tidak perlu), No kendaraan (tidak perlu)
  // --------------------------------------------------------------------------
  const [selectedStoreKirim, setSelectedStoreKirim] = useState<string>('');
  const [selectedReportIdsForKirim, setSelectedReportIdsForKirim] = useState<string[]>([]);
  const [tanggalKirim, setTanggalKirim] = useState<string>(getTodayDateString());
  const [dikirimOleh, setDikirimOleh] = useState<string>(session?.name || '');
  const [catatanKirim, setCatatanKirim] = useState<string>('');
  const [isProcessingKirim, setIsProcessingKirim] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // 4. TAB HISTORI PENGIRIMAN STATE
  // Sesuai instruksi user:
  // - Cetak ulang surat jalan
  // - Edit pengiriman
  // - Delete atau Cancel (kembali ke dispatched)
  // - Histori log audit edit / cancel
  // --------------------------------------------------------------------------
  const [searchHistori, setSearchHistori] = useState<string>('');
  const [filterStoreHistori, setFilterStoreHistori] = useState<string[]>([]);
  const [selectedDetailReport, setSelectedDetailReport] = useState<PengirimanStoreReport | null>(null);

  // Modals for Histori: Edit, Cancel, Audit History
  const [editingReport, setEditingReport] = useState<PengirimanStoreReport | null>(null);
  const [editDikirimOleh, setEditDikirimOleh] = useState<string>('');
  const [editCatatanKirim, setEditCatatanKirim] = useState<string>('');
  const [editTanggalKirim, setEditTanggalKirim] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const [cancellingReport, setCancellingReport] = useState<PengirimanStoreReport | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isProcessingCancel, setIsProcessingCancel] = useState<boolean>(false);

  const [viewingAuditReport, setViewingAuditReport] = useState<PengirimanStoreReport | null>(null);

  // --------------------------------------------------------------------------
  // PRINT MODAL STATES
  // --------------------------------------------------------------------------
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [labelsToPrint, setLabelsToPrint] = useState<KoliMarkingLabel[]>([]);
  const [printModalTitle, setPrintModalTitle] = useState<string>('');

  const [suratJalanModalOpen, setSuratJalanModalOpen] = useState<boolean>(false);
  const [suratJalanReportsToPrint, setSuratJalanReportsToPrint] = useState<PengirimanStoreReport[]>([]);
  const [suratJalanTripToPrint, setSuratJalanTripToPrint] = useState<Partial<PengirimanStoreTrip> | null>(null);

  // --------------------------------------------------------------------------
  // INITIAL DATA LOAD
  // --------------------------------------------------------------------------
  useEffect(() => {
    loadStores();
    loadReportsList();
  }, []);

  const loadStores = async () => {
    setLoadingStores(true);
    try {
      const data = await fetchOutlets();
      if (data && data.length > 0) {
        setStores(data);
        setItemRows((prev) =>
          prev.map((r, idx) => (idx === 0 && !r.storeTujuan ? { ...r, storeTujuan: data[0].nama } : r))
        );
      } else {
        setStores(DEFAULT_OUTLETS);
      }
    } catch (e) {
      console.warn('Gagal memuat outlet, menggunakan default:', e);
      setStores(DEFAULT_OUTLETS);
    } finally {
      setLoadingStores(false);
    }
  };

  const loadReportsList = async () => {
    setLoadingReports(true);
    try {
      const [data, tripsData] = await Promise.all([
        fetchPengirimanStoreReports(),
        fetchPengirimanStoreTrips(),
      ]);
      setReports(data || []);
      setTrips(tripsData || []);
    } catch (e) {
      console.warn('Gagal memuat laporan pengiriman store:', e);
    } finally {
      setLoadingReports(false);
    }
  };

  // Grouping reports
  const dispatchedReports = useMemo(() => {
    return reports.filter((r) => r.status === 'dispatched');
  }, [reports]);

  const sentReports = useMemo(() => {
    return reports.filter((r) => r.status === 'sent');
  }, [reports]);

  /**
   * Helper normalisasi pembanding nama / kode store secara fleksibel dan akurat (case-insensitive & alias-aware)
   * Menyinkronkan kode 'GAIA' dari Master Produk dengan 'Gaia Pontianak', 'Gaia Bumi Raya City', dll.
   */
  const isSameStore = (a?: string, b?: string): boolean => {
    if (!a || !b) return false;
    const sA = a.trim().toLowerCase();
    const sB = b.trim().toLowerCase();
    if (sA === sB) return true;

    const isGaia = (s: string) =>
      s === 'gaia' || s === 'gaia pontianak' || s === 'gaia bumi raya city' || s === 'gaia mall';
    if (isGaia(sA) && isGaia(sB)) return true;

    const isBts = (s: string) => s === 'bts' || s === 'by the sea' || s === 'by the sea pik';
    if (isBts(sA) && isBts(sB)) return true;

    const isCpj = (s: string) => s === 'cpj' || s === 'central park' || s === 'central park jakarta';
    if (isCpj(sA) && isCpj(sB)) return true;

    const isCws = (s: string) => s === 'cws' || s === 'ciputra world' || s === 'ciputra world surabaya';
    if (isCws(sA) && isCws(sB)) return true;

    const isDpm = (s: string) => s === 'dpm' || s === 'deli park' || s === 'deli park medan';
    if (isDpm(sA) && isDpm(sB)) return true;

    const isGst = (s: string) => s === 'gst' || s === 'gading serpong' || s === 'gading serpong tangerang' || s === 'summarecon mall serpong' || s === 'sms';
    if (isGst(sA) && isGst(sB)) return true;

    const isLvl = (s: string) => s === 'lvl' || s === 'la vela' || s === 'la vela tangerang';
    if (isLvl(sA) && isLvl(sB)) return true;

    const isLmp = (s: string) => s === 'lmp' || s === 'lippo mall puri' || s === 'puri';
    if (isLmp(sA) && isLmp(sB)) return true;

    const isLws = (s: string) => s === 'lws' || s === 'living world' || s === 'living world tangerang';
    if (isLws(sA) && isLws(sB)) return true;

    const isMkg = (s: string) => s === 'mkg' || s === 'mall kelapa gading' || s === 'kelapa gading';
    if (isMkg(sA) && isMkg(sB)) return true;

    const isNsj = (s: string) => s === 'nsj' || s === 'neo soho' || s === 'neo soho jakarta';
    if (isNsj(sA) && isNsj(sB)) return true;

    const isPms = (s: string) => s === 'pms' || s === 'pakuwon mall' || s === 'pakuwon mall surabaya';
    if (isPms(sA) && isPms(sB)) return true;

    const isPhb = (s: string) => s === 'phb' || s === 'paskal' || s === 'paskal hyper square' || s === 'paskal hyper square bandung' || s === '23 paskal';
    if (isPhb(sA) && isPhb(sB)) return true;

    const isPim = (s: string) => s === 'pim' || s === 'puri indah mall' || s === 'pondok indah mall';
    if (isPim(sA) && isPim(sB)) return true;

    const isSpm = (s: string) => s === 'spm' || s === 'sun plaza' || s === 'sun plaza medan';
    if (isSpm(sA) && isSpm(sB)) return true;

    const isTp = (s: string) => s === 'tp' || s === 'tunjungan plaza' || s === 'tunjungan plaza surabaya';
    if (isTp(sA) && isTp(sB)) return true;

    const isPvj = (s: string) => s === 'pvj' || s === 'paris van java' || s === 'paris van java bandung';
    if (isPvj(sA) && isPvj(sB)) return true;

    return false;
  };

  // Daftar store yang memiliki barang di antrean Dispatched
  const dispatchedStoresList = useMemo(() => {
    const map = new Map<string, { count: number; koli: number }>();
    dispatchedReports.forEach((r) => {
      const cur = map.get(r.store_tujuan) || { count: 0, koli: 0 };
      map.set(r.store_tujuan, {
        count: cur.count + 1,
        koli: cur.koli + r.total_koli,
      });
    });
    return Array.from(map.entries()).map(([storeName, info]) => ({
      storeName,
      count: info.count,
      koli: info.koli,
    }));
  }, [dispatchedReports]);

  // Saat berpindah ke tab Kirim, jika belum ada store terpilih, set store pertama yang memiliki dispatched
  useEffect(() => {
    if (activeSubTab === 'kirim' && !selectedStoreKirim && dispatchedStoresList.length > 0) {
      const firstStore = dispatchedStoresList[0].storeName;
      setSelectedStoreKirim(firstStore);
    }
  }, [activeSubTab, selectedStoreKirim, dispatchedStoresList]);

  // Saat selectedStoreKirim berubah, otomatis tampilkan dan centang seluruh dispatched toko tersebut
  const dispatchedForSelectedStore = useMemo(() => {
    if (!selectedStoreKirim) return [];
    return dispatchedReports.filter((r) => isSameStore(r.store_tujuan, selectedStoreKirim));
  }, [dispatchedReports, selectedStoreKirim]);

  useEffect(() => {
    if (selectedStoreKirim) {
      const idsForThisStore = dispatchedReports
        .filter((r) => isSameStore(r.store_tujuan, selectedStoreKirim))
        .map((r) => r.id);
      setSelectedReportIdsForKirim(idsForThisStore);
    } else {
      setSelectedReportIdsForKirim([]);
    }
  }, [selectedStoreKirim, dispatchedReports]);

  // --------------------------------------------------------------------------
  // FORM LAPORAN HANDLERS
  // --------------------------------------------------------------------------
  const handleAddRow = () => {
    const lastRow = itemRows[itemRows.length - 1];
    const defaultStore = lastRow?.storeTujuan || stores[0]?.nama || 'GAIA';
    const defaultSJ = lastRow?.noSuratJalan || '';

    setItemRows((prev) => [
      ...prev,
      {
        tempId: `row-${Date.now()}-${Math.random()}`,
        storeTujuan: defaultStore,
        noSuratJalan: defaultSJ,
        deskripsi: '',
        qty: 1,
        satuan: 'Koli',
        keterangan: '',
      },
    ]);
  };

  const handleGenerateMultiStoreRows = () => {
    if (multiStoreSelected.length === 0) {
      onShowToast('Pilih minimal 1 store tujuan terlebih dahulu', 'warning');
      return;
    }
    if (!multiStoreDeskripsi.trim()) {
      onShowToast('Deskripsi barang wajib diisi', 'warning');
      return;
    }

    const newRows: ItemInputRow[] = multiStoreSelected.map((st, idx) => ({
      tempId: `multi-${Date.now()}-${idx}-${Math.random()}`,
      storeTujuan: st,
      noSuratJalan: multiStoreNoSJ.trim(),
      deskripsi: multiStoreDeskripsi.trim(),
      qty: Math.max(1, multiStoreQty),
      satuan: multiStoreSatuan,
      keterangan: multiStoreKeterangan.trim(),
    }));

    // Jika baris pertama masih kosong default, replace atau gabungkan
    setItemRows((prev) => {
      const isFirstEmpty =
        prev.length === 1 && !prev[0].deskripsi && !prev[0].noSuratJalan;
      return isFirstEmpty ? newRows : [...prev, ...newRows];
    });

    onShowToast(`Berhasil menambahkan ${newRows.length} baris untuk toko terpilih`, 'success');
    setIsMultiStoreModalOpen(false);
    setMultiStoreSelected([]);
    setMultiStoreDeskripsi('');
    setMultiStoreNoSJ('');
    setMultiStoreQty(1);
    setMultiStoreKeterangan('');
  };

  const handleDuplicateRow = (index: number) => {
    const target = itemRows[index];
    if (!target) return;
    const duplicated: ItemInputRow = {
      ...target,
      tempId: `row-${Date.now()}-${Math.random()}`,
    };
    const updated = [...itemRows];
    updated.splice(index + 1, 0, duplicated);
    setItemRows(updated);
  };

  const handleRemoveRow = (index: number) => {
    if (itemRows.length <= 1) {
      onShowToast('Minimal harus ada 1 baris barang dalam laporan', 'warning');
      return;
    }
    setItemRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateRow = (index: number, field: keyof ItemInputRow, val: any) => {
    setItemRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Handler Foto Per Baris (Opsi A)
  const handleItemPhotoUpload = async (index: number, file: File) => {
    if (!file) return;
    handleUpdateRow(index, 'isCompressingPhoto', true);
    try {
      const result = await compressImage(file, 1200, 0.75);
      handleUpdateRow(index, 'fotoBarang', result.dataUrl);
      onShowToast(`Foto barang #${index + 1} berhasil diambil`, 'success');
    } catch (err: any) {
      console.error('Compress photo failed:', err);
      onShowToast('Gagal memproses foto barang: ' + (err.message || ''), 'error');
    } finally {
      handleUpdateRow(index, 'isCompressingPhoto', false);
    }
  };

  const handleRemoveItemPhoto = (index: number) => {
    handleUpdateRow(index, 'fotoBarang', '');
  };

  // Handler Foto Keseluruhan / Koli / Packing (Opsi B)
  const handleOverallPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (overallPhotos.length + files.length > 8) {
      onShowToast('Maksimal 8 foto dokumentasi pengiriman', 'warning');
      return;
    }

    setIsCompressingOverall(true);
    try {
      const newCompressedPhotos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result = await compressImage(file, 1200, 0.75);
        newCompressedPhotos.push(result.dataUrl);
      }
      setOverallPhotos((prev) => [...prev, ...newCompressedPhotos]);
      onShowToast(`${newCompressedPhotos.length} foto dokumentasi berhasil ditambahkan`, 'success');
    } catch (err: any) {
      console.error('Compress overall photos failed:', err);
      onShowToast('Gagal memproses foto dokumentasi: ' + (err.message || ''), 'error');
    } finally {
      setIsCompressingOverall(false);
      if (overallFileInputRef.current) {
        overallFileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveOverallPhoto = (photoIdx: number) => {
    setOverallPhotos((prev) => prev.filter((_, idx) => idx !== photoIdx));
  };

  const formCalculatedKoli = useMemo(() => {
    return itemRows.reduce((acc, row) => {
      const q = Math.max(1, Number(row.qty) || 1);
      return acc + (row.satuan === 'Pcs' ? 1 : q);
    }, 0);
  }, [itemRows]);

  const handleSubmitReport = async (autoPrint: boolean = false) => {
    for (let i = 0; i < itemRows.length; i++) {
      const row = itemRows[i];
      const targetStore = row.isCustomStore ? row.customStoreInput?.trim() : row.storeTujuan;
      if (!targetStore) {
        onShowToast(`Baris #${i + 1}: Tentukan Store Tujuan terlebih dahulu`, 'warning');
        return;
      }
      if (!row.deskripsi.trim()) {
        onShowToast(`Baris #${i + 1}: Deskripsi barang tidak boleh kosong`, 'warning');
        return;
      }
    }

    setIsSubmittingReport(true);
    try {
      // 1. Upload foto barang per baris ke Google Drive jika ada
      const uploadedRowPhotos: { [key: number]: string } = {};
      const rowsWithPhotos = itemRows
        .map((r, idx) => ({ idx, foto: r.fotoBarang }))
        .filter((r): r is { idx: number; foto: string } => Boolean(r.foto && r.foto.startsWith('data:image/')));

      if (rowsWithPhotos.length > 0) {
        onShowToast(`Mengunggah ${rowsWithPhotos.length} foto barang ke Google Drive...`, 'info');
        const photoDataUrls = rowsWithPhotos.map((r) => r.foto);
        const uploadResult = await uploadMultipleImagesToGdrive(
          photoDataUrls,
          'WMS_Barang_Store'
        );
        uploadResult.forEach((url, i) => {
          if (url) {
            uploadedRowPhotos[rowsWithPhotos[i].idx] = url;
          }
        });
      }

      // 2. Upload foto keseluruhan / koli / packing ke Google Drive jika ada
      let finalOverallPhotoUrls: string[] = [];
      const overallDataUrls = overallPhotos.filter((p) => p.startsWith('data:image/'));
      const existingOverallUrls = overallPhotos.filter((p) => !p.startsWith('data:image/'));

      if (overallDataUrls.length > 0) {
        onShowToast(`Mengunggah ${overallDataUrls.length} foto koli/packing ke Google Drive...`, 'info');
        const uploadOverallRes = await uploadMultipleImagesToGdrive(
          overallDataUrls,
          'WMS_Packing_Store'
        );
        const validUploaded = uploadOverallRes.filter((u) => Boolean(u));
        finalOverallPhotoUrls = [...existingOverallUrls, ...validUploaded];
      } else {
        finalOverallPhotoUrls = existingOverallUrls;
      }

      const payloadItems = itemRows.map((r, idx) => ({
        store_tujuan: r.isCustomStore ? r.customStoreInput?.trim() || 'Store' : r.storeTujuan,
        no_surat_jalan: r.noSuratJalan.trim() || 'Tidak ada no surat jalan',
        deskripsi: r.deskripsi.trim(),
        qty: r.qty,
        satuan: r.satuan,
        keterangan: r.keterangan.trim(),
        foto_barang: uploadedRowPhotos[idx] || r.fotoBarang || '',
      }));

      const res = await savePengirimanStoreBatch({
        items: payloadItems,
        pic_nama: session?.name || 'Petugas Gudang',
        pic_username: session?.username || 'operator',
        foto_urls: finalOverallPhotoUrls,
      });

      if (res.success && res.reports.length > 0) {
        onShowToast(res.message, 'success');
        await loadReportsList();

        if (autoPrint) {
          const allLabels: KoliMarkingLabel[] = [];
          res.reports.forEach((rep) => {
            const labels = generateKoliLabelsForReport(rep);
            allLabels.push(...labels);
          });
          if (allLabels.length > 0) {
            setLabelsToPrint(allLabels);
            setPrintModalTitle(`Cetak Label Koli (${allLabels.length} Label)`);
            setPrintModalOpen(true);
          }
        }

        setItemRows([
          {
            tempId: `row-${Date.now()}`,
            storeTujuan: stores[0]?.nama || 'GAIA',
            noSuratJalan: '',
            deskripsi: '',
            qty: 1,
            satuan: 'Koli',
            keterangan: '',
            fotoBarang: '',
          },
        ]);
        setOverallPhotos([]);

        setActiveSubTab('dispatched');
      } else {
        onShowToast(res.message || 'Gagal menyimpan laporan', 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Terjadi kesalahan sistem saat submit', 'error');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // --------------------------------------------------------------------------
  // DISPATCHED SELECTION
  // --------------------------------------------------------------------------
  const filteredDispatched = useMemo(() => {
    return dispatchedReports.filter((r) => {
      const matchSearch =
        searchDispatched === '' ||
        r.store_tujuan.toLowerCase().includes(searchDispatched.toLowerCase()) ||
        r.id.toLowerCase().includes(searchDispatched.toLowerCase()) ||
        r.items.some((it) => it.deskripsi.toLowerCase().includes(searchDispatched.toLowerCase()));

      const matchStore =
        !filterStoreDispatched ||
        filterStoreDispatched.length === 0 ||
        (Array.isArray(filterStoreDispatched)
          ? filterStoreDispatched.some((fs) => isSameStore(r.store_tujuan, fs))
          : isSameStore(r.store_tujuan, filterStoreDispatched));

      const matchLabel =
        filterLabelStatusDispatched === 'all' ||
        (filterLabelStatusDispatched === 'printed' && r.is_label_printed) ||
        (filterLabelStatusDispatched === 'unprinted' && !r.is_label_printed);
      return matchSearch && matchStore && matchLabel;
    });
  }, [dispatchedReports, searchDispatched, filterStoreDispatched, filterLabelStatusDispatched]);

  const handleToggleSelectDispatched = (id: string) => {
    setSelectedDispatchedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllDispatched = () => {
    if (selectedDispatchedIds.length === filteredDispatched.length && filteredDispatched.length > 0) {
      setSelectedDispatchedIds([]);
    } else {
      setSelectedDispatchedIds(filteredDispatched.map((r) => r.id));
    }
  };

  const selectedDispatchedObjects = useMemo(() => {
    return dispatchedReports.filter((r) => selectedDispatchedIds.includes(r.id));
  }, [dispatchedReports, selectedDispatchedIds]);

  const totalKoliSelectedDispatched = useMemo(() => {
    return selectedDispatchedObjects.reduce((acc, r) => acc + (r.total_koli || 1), 0);
  }, [selectedDispatchedObjects]);

  const totalKoliFilteredDispatched = useMemo(() => {
    return filteredDispatched.reduce((acc, r) => acc + (r.total_koli || 1), 0);
  }, [filteredDispatched]);

  const selectedDispatchedStoreNames = useMemo(() => {
    return Array.from(new Set(selectedDispatchedObjects.map((r) => r.store_tujuan)));
  }, [selectedDispatchedObjects]);

  const handleSendSelectedFromDispatched = (report: PengirimanStoreReport) => {
    setSelectedStoreKirim(report.store_tujuan);
    setSelectedReportIdsForKirim([report.id]);
    setActiveSubTab('kirim');
  };

  const handleSendSelectedBulkFromDispatched = (reportsToShip: PengirimanStoreReport[]) => {
    if (reportsToShip.length === 0) {
      onShowToast('Pilih minimal 1 laporan untuk dikirim', 'warning');
      return;
    }
    const storeNames = Array.from(new Set(reportsToShip.map((r) => r.store_tujuan)));
    if (storeNames.length > 1) {
      setSelectedStoreKirim(storeNames[0]);
      const idsForFirstStore = reportsToShip
        .filter((r) => r.store_tujuan === storeNames[0])
        .map((r) => r.id);
      setSelectedReportIdsForKirim(idsForFirstStore);
      onShowToast(
        `Membuka setup kirim untuk store: ${storeNames[0]} (${idsForFirstStore.length} laporan terpilih)`,
        'info'
      );
    } else {
      setSelectedStoreKirim(storeNames[0]);
      setSelectedReportIdsForKirim(reportsToShip.map((r) => r.id));
    }
    setActiveSubTab('kirim');
  };

  // --------------------------------------------------------------------------
  // TAB KIRIM: SELECTION & SUBMISSION
  // --------------------------------------------------------------------------
  const handleToggleSelectKirimItem = (reportId: string) => {
    setSelectedReportIdsForKirim((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    );
  };

  const handleToggleAllKirimForStore = () => {
    if (selectedReportIdsForKirim.length === dispatchedForSelectedStore.length) {
      setSelectedReportIdsForKirim([]);
    } else {
      setSelectedReportIdsForKirim(dispatchedForSelectedStore.map((r) => r.id));
    }
  };

  const selectedDispatchedObjectsForKirim = useMemo(() => {
    return dispatchedForSelectedStore.filter((r) => selectedReportIdsForKirim.includes(r.id));
  }, [dispatchedForSelectedStore, selectedReportIdsForKirim]);

  const totalKoliSelectedForKirim = useMemo(() => {
    return selectedDispatchedObjectsForKirim.reduce((acc, r) => acc + r.total_koli, 0);
  }, [selectedDispatchedObjectsForKirim]);

  // --------------------------------------------------------------------------
  // EDIT LAPORAN DISPATCHED (FULL EDIT: STORE, ITEMS, QTY, KOLI)
  // --------------------------------------------------------------------------
  const handleOpenEditDispatched = (rep: PengirimanStoreReport) => {
    setEditingDispatchedReport(rep);
    setEditStoreTujuan(rep.store_tujuan);
    setEditItems(
      rep.items && rep.items.length > 0
        ? JSON.parse(JSON.stringify(rep.items))
        : [
            {
              id: `item-${Date.now()}-0`,
              no_surat_jalan: '',
              deskripsi: '',
              qty: 1,
              satuan: 'Pcs',
              hitung_koli: 1,
              keterangan: '',
            },
          ]
    );
  };

  const handleUpdateEditItem = (idx: number, field: keyof PengirimanStoreItem, value: any) => {
    setEditItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[idx], [field]: value };
      if (field === 'qty' || field === 'satuan') {
        const rawQty = Math.max(1, Number(target.qty) || 1);
        target.hitung_koli = target.satuan === 'Pcs' ? 1 : Math.max(1, Math.round(rawQty));
      }
      copy[idx] = target;
      return copy;
    });
  };

  const handleAddEditItemRow = () => {
    setEditItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length}`,
        no_surat_jalan: '',
        deskripsi: '',
        qty: 1,
        satuan: 'Pcs',
        hitung_koli: 1,
        keterangan: '',
      },
    ]);
  };

  const handleRemoveEditItemRow = (idx: number) => {
    if (editItems.length <= 1) {
      onShowToast('Laporan minimal harus memiliki 1 barang', 'warning');
      return;
    }
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveEditDispatched = async () => {
    if (!editingDispatchedReport) return;
    if (!editStoreTujuan.trim()) {
      onShowToast('Nama store tujuan tidak boleh kosong', 'warning');
      return;
    }
    if (editItems.length === 0) {
      onShowToast('Minimal harus ada 1 barang', 'warning');
      return;
    }
    for (let i = 0; i < editItems.length; i++) {
      if (!editItems[i].deskripsi.trim()) {
        onShowToast(`Baris #${i + 1}: Deskripsi barang tidak boleh kosong`, 'warning');
        return;
      }
    }

    setIsSavingEditDispatched(true);
    try {
      const res = await editPengirimanStoreReportFull(
        editingDispatchedReport.id,
        {
          store_tujuan: editStoreTujuan.trim(),
          items: editItems,
        },
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );

      if (res.success && res.data) {
        onShowToast(res.message, 'success');
        const updatedData = res.data;
        setReports((prev) => prev.map((r) => (r.id === updatedData.id ? updatedData : r)));
        setEditingDispatchedReport(null);
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal menyimpan perubahan', 'error');
    } finally {
      setIsSavingEditDispatched(false);
    }
  };

  // SUBMIT KIRIM -> CETAK SURAT JALAN -> MASUK HISTORI
  const handleSubmitKirim = async () => {
    if (!selectedStoreKirim) {
      onShowToast('Pilih Store Tujuan terlebih dahulu', 'warning');
      return;
    }

    if (selectedReportIdsForKirim.length === 0) {
      onShowToast('Pilih minimal 1 barang / laporan dispatched untuk dikirim', 'warning');
      return;
    }

    const finalDikirimOleh = dikirimOleh.trim() || session?.name || 'Driver / Kurir Toko';
    if (!dikirimOleh.trim()) {
      setDikirimOleh(finalDikirimOleh);
    }

    setIsProcessingKirim(true);
    try {
      const res = await processKirimStoreReports({
        report_ids: selectedReportIdsForKirim,
        tanggal_kirim: tanggalKirim,
        waktu_kirim: getCurrentTimeString(),
        dikirim_oleh: finalDikirimOleh,
        catatan: catatanKirim.trim(),
        pic_nama: session?.name || 'Petugas Gudang',
        pic_username: session?.username || 'operator',
      });

      if (res.success) {
        onShowToast(res.message, 'success');
        const shippedReportIds = [...selectedReportIdsForKirim];
        const shippedReports = selectedDispatchedObjectsForKirim.map((r) => ({
          ...r,
          status: 'sent' as const,
          tanggal_kirim: tanggalKirim,
          waktu_kirim: getCurrentTimeString(),
          dikirim_oleh: finalDikirimOleh,
          catatan_kirim: catatanKirim.trim(),
          trip_id: res.trip?.id,
        }));

        // Update state lokal langsung agar status produk berubah instan & tidak berkedip!
        setReports((prev) =>
          prev.map((r) => {
            if (shippedReportIds.includes(r.id)) {
              return {
                ...r,
                status: 'sent' as const,
                tanggal_kirim: tanggalKirim,
                waktu_kirim: getCurrentTimeString(),
                dikirim_oleh: finalDikirimOleh,
                catatan_kirim: catatanKirim.trim(),
                trip_id: res.trip?.id,
                updated_at: new Date().toISOString(),
              };
            }
            return r;
          })
        );

        // Reset kirim form
        setSelectedReportIdsForKirim([]);
        setCatatanKirim('');

        // 1. Berpindah tab ke Histori Pengiriman & scroll ke atas
        setActiveSubTab('histori');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // 2. Otomatis buka modal Cetak Surat Jalan Pengiriman!
        handleOpenSuratJalanPrint(shippedReports, res.trip);

        // 3. Sync update ke server di latar belakang
        loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal memproses pengiriman', 'error');
    } finally {
      setIsProcessingKirim(false);
    }
  };

  // --------------------------------------------------------------------------
  // HISTORI: EDIT, CANCEL, DELETE, AUDIT LOG
  // --------------------------------------------------------------------------
  const handleOpenEdit = (rep: PengirimanStoreReport) => {
    setEditingReport(rep);
    setEditDikirimOleh(rep.dikirim_oleh || '');
    setEditCatatanKirim(rep.catatan_kirim || '');
    setEditTanggalKirim(rep.tanggal_kirim || rep.tanggal_laporan || getTodayDateString());
  };

  const handleSaveEdit = async () => {
    if (!editingReport) return;
    if (!editDikirimOleh.trim()) {
      onShowToast('Nama petugas pengirim (Dikirim Oleh) tidak boleh kosong', 'warning');
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await editPengirimanStoreReport(
        editingReport.id,
        {
          dikirim_oleh: editDikirimOleh.trim(),
          catatan_kirim: editCatatanKirim.trim(),
          tanggal_kirim: editTanggalKirim,
        },
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );

      if (res.success) {
        onShowToast(res.message, 'success');
        setEditingReport(null);
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal mengubah data pengiriman', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleOpenCancel = (rep: PengirimanStoreReport) => {
    setCancellingReport(rep);
    setCancelReason('');
  };

  const handleConfirmCancel = async () => {
    if (!cancellingReport) return;

    setIsProcessingCancel(true);
    try {
      const res = await cancelPengirimanStoreReport(
        cancellingReport.id,
        cancelReason.trim(),
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );

      if (res.success) {
        onShowToast(res.message, 'success');
        setCancellingReport(null);
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal membatalkan pengiriman', 'error');
    } finally {
      setIsProcessingCancel(false);
    }
  };

  // Modal Hapus Dispatched Report State
  const [deletingReport, setDeletingReport] = useState<PengirimanStoreReport | null>(null);
  const [isDeletingReport, setIsDeletingReport] = useState<boolean>(false);

  const handleDeleteReport = (rep: PengirimanStoreReport) => {
    setDeletingReport(rep);
  };

  const handleConfirmDeleteReport = async () => {
    if (!deletingReport) return;

    setIsDeletingReport(true);
    try {
      const res = await cancelDispatchedReport(
        deletingReport.id,
        'Dibatalkan dari antrean Dispatched',
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );
      if (res.success) {
        onShowToast(res.message, 'info');
        setDeletingReport(null);
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal membatalkan laporan', 'error');
    } finally {
      setIsDeletingReport(false);
    }
  };

  // --------------------------------------------------------------------------
  // BATCH SURAT JALAN PENGIRIMAN (HISTORI) HANDLERS
  // --------------------------------------------------------------------------
  const handleOpenEditTrip = (batch: HistoriBatchItem) => {
    setEditingTripBatch(batch);
    setEditTripTanggalKirim(batch.tanggalKirim || getTodayDateString());
    setEditTripDikirimOleh(batch.dikirimOleh || '');
    setEditTripArmada(batch.armada || '');
    setEditTripNoPolisi(batch.noPolisi || '');
    setEditTripCatatan(batch.catatanKirim || '');
    setEditTripSelectedReportIds(batch.reports.map((r) => r.id));
  };

  const handleSaveEditTrip = async () => {
    if (!editingTripBatch) return;
    if (!editTripDikirimOleh.trim()) {
      onShowToast('Nama driver / kurir harus diisi', 'warning');
      return;
    }
    if (editTripSelectedReportIds.length === 0) {
      onShowToast('Minimal 1 barang harus tetap ada di pengiriman. Jika ingin membatalkan semua, gunakan opsi Batal Kirim.', 'warning');
      return;
    }

    const originalReportIds = editingTripBatch.reports.map((r) => r.id);
    const removedReportIds = originalReportIds.filter(
      (id) => !editTripSelectedReportIds.includes(id)
    );

    setIsSavingTripEdit(true);
    try {
      const res = await editSuratJalanPengirimanTrip(
        editingTripBatch.tripId,
        {
          tanggal_kirim: editTripTanggalKirim,
          dikirim_oleh: editTripDikirimOleh.trim(),
          armada: editTripArmada.trim(),
          no_polisi: editTripNoPolisi.trim(),
          catatan: editTripCatatan.trim(),
          removeReportIds: removedReportIds,
        },
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );

      if (res.success) {
        onShowToast(res.message, 'success');
        setEditingTripBatch(null);
        if (selectedBatchDetail?.tripId === editingTripBatch.tripId) {
          setSelectedBatchDetail(null);
        }
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal mengubah pengiriman', 'error');
    } finally {
      setIsSavingTripEdit(false);
    }
  };

  const handleOpenCancelTrip = (batch: HistoriBatchItem) => {
    setCancellingTripBatch(batch);
    setTripCancelReason('');
  };

  const handleConfirmCancelTrip = async () => {
    if (!cancellingTripBatch) return;

    setIsProcessingTripCancel(true);
    try {
      const res = await cancelSuratJalanPengirimanTrip(
        cancellingTripBatch.tripId,
        tripCancelReason.trim() || 'Dibatalkan oleh operator gudang',
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );

      if (res.success) {
        onShowToast(res.message, 'success');
        setCancellingTripBatch(null);
        if (selectedBatchDetail?.tripId === cancellingTripBatch.tripId) {
          setSelectedBatchDetail(null);
        }
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal membatalkan pengiriman', 'error');
    } finally {
      setIsProcessingTripCancel(false);
    }
  };

  const handleRemoveReportFromBatch = async (tripId: string, rep: PengirimanStoreReport) => {
    const confirmCancel = window.confirm(
      `Keluarkan laporan barang ${rep.id} (${rep.items.length} macam barang, ${rep.total_koli} koli) dari Surat Jalan Pengiriman ${tripId}?\n\nBarang ini otomatis akan kembali ke status Dispatched (antrean siap kirim).`
    );
    if (!confirmCancel) return;

    try {
      const res = await removeReportFromSuratJalanPengiriman(
        tripId,
        rep.id,
        'Dikeluarkan dari pengiriman melalui Rincian Pengiriman',
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );

      if (res.success) {
        onShowToast(res.message, 'success');
        if (selectedBatchDetail && selectedBatchDetail.tripId === tripId) {
          const nextReports = selectedBatchDetail.reports.filter((r) => r.id !== rep.id);
          if (nextReports.length === 0) {
            setSelectedBatchDetail(null);
          } else {
            setSelectedBatchDetail({
              ...selectedBatchDetail,
              reports: nextReports,
              totalKoli: Math.max(0, selectedBatchDetail.totalKoli - rep.total_koli),
              totalItemCount: nextReports.reduce((acc, r) => acc + (r.items?.length || 0), 0),
            });
          }
        }
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal mengeluarkan barang', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // PRINT HELPERS
  // --------------------------------------------------------------------------
  const handleOpenSuratJalanPrint = (
    reportsToPrint: PengirimanStoreReport[],
    tripInfo?: Partial<PengirimanStoreTrip>
  ) => {
    if (reportsToPrint.length === 0) {
      onShowToast('Pilih laporan pengiriman untuk mencetak surat jalan', 'warning');
      return;
    }
    setSuratJalanReportsToPrint(reportsToPrint);
    setSuratJalanTripToPrint(
      tripInfo || {
        tanggal_kirim: tanggalKirim,
        dikirim_oleh: dikirimOleh || 'Kurir Toko / Driver',
        catatan: catatanKirim,
        created_by_nama: session?.name || 'Admin Gudang',
      }
    );
    setSuratJalanModalOpen(true);
  };

  const handlePrintLabelsForReport = (rep: PengirimanStoreReport) => {
    const lbls = generateKoliLabelsForReport(rep);
    if (lbls.length === 0) {
      onShowToast('Tidak ada koli untuk dicetak labelnya', 'warning');
      return;
    }

    // Tandai status sudah cetak label
    markReportsLabelAsPrinted([rep.id]);
    setReports((prev) =>
      prev.map((r) =>
        r.id === rep.id
          ? { ...r, is_label_printed: true, label_printed_at: new Date().toISOString() }
          : r
      )
    );

    setLabelsToPrint(lbls);
    setPrintModalTitle(`Cetak Label Koli: ${rep.store_tujuan} (${lbls.length} Koli)`);
    setPrintModalOpen(true);
  };

  const handlePrintBulkLabels = (reportsToPrint: PengirimanStoreReport[]) => {
    if (reportsToPrint.length === 0) {
      onShowToast('Pilih minimal 1 laporan untuk mencetak barcode label koli massal', 'warning');
      return;
    }
    const allLabels: KoliMarkingLabel[] = [];
    const repIds: string[] = [];
    reportsToPrint.forEach((rep) => {
      repIds.push(rep.id);
      const labels = generateKoliLabelsForReport(rep);
      allLabels.push(...labels);
    });

    if (allLabels.length === 0) {
      onShowToast('Tidak ada koli untuk dicetak labelnya', 'warning');
      return;
    }

    // Tandai seluruh laporan yang dicetak sebagai sudah cetak label
    markReportsLabelAsPrinted(repIds);
    setReports((prev) =>
      prev.map((r) =>
        repIds.includes(r.id)
          ? { ...r, is_label_printed: true, label_printed_at: new Date().toISOString() }
          : r
      )
    );

    setLabelsToPrint(allLabels);
    const storeNames = Array.from(new Set(reportsToPrint.map((r) => r.store_tujuan)));
    const storeLabel = storeNames.length === 1 ? storeNames[0] : `${storeNames.length} Store`;
    setPrintModalTitle(
      `Cetak Barcode Label Koli Massal: ${storeLabel} (${allLabels.length} Label - ${reportsToPrint.length} Laporan)`
    );
    setPrintModalOpen(true);
  };

  // --------------------------------------------------------------------------
  // HISTORI BATCHES (1 BATCH KIRIM = 1 NO SJ DI HISTORI KIRIM)
  // --------------------------------------------------------------------------
  const historiBatches = useMemo<HistoriBatchItem[]>(() => {
    const batchesMap = new Map<string, HistoriBatchItem>();

    // 1. Process from trips table
    trips.forEach((t) => {
      const memberReports = reports.filter(
        (r) => (t.report_ids && t.report_ids.includes(r.id)) || r.trip_id === t.id
      );

      const storeNames =
        t.store_tujuan_list && t.store_tujuan_list.length > 0
          ? t.store_tujuan_list.join(', ')
          : memberReports[0]?.store_tujuan || '-';

      const totalKoli =
        memberReports.length > 0
          ? memberReports.reduce((acc, r) => acc + (r.total_koli || 0), 0)
          : t.total_koli || 0;

      const totalItems = memberReports.reduce((acc, r) => acc + (r.items?.length || 0), 0);

      const photoSet = new Set<string>();
      memberReports.forEach((r) => {
        (r.foto_urls || []).forEach((u) => {
          if (u) photoSet.add(u);
        });
        (r.items || []).forEach((it) => {
          if (it.foto_barang) photoSet.add(it.foto_barang);
        });
      });

      batchesMap.set(t.id, {
        tripId: t.id,
        storeTujuan: storeNames,
        tanggalKirim: t.tanggal_kirim || '',
        waktuKirim: t.waktu_kirim || '',
        dikirimOleh: t.dikirim_oleh || '-',
        armada: t.armada || '',
        noPolisi: t.no_polisi || '',
        catatanKirim: t.catatan || '',
        status: t.status || 'active',
        reports: memberReports,
        totalKoli,
        totalItemCount: totalItems,
        allPhotos: Array.from(photoSet),
        createdAt: t.created_at || '',
      });
    });

    // 2. Process sent reports that don't have a trip in trips
    sentReports.forEach((r) => {
      const existingTripId = r.trip_id;
      if (existingTripId && batchesMap.has(existingTripId)) {
        const cur = batchesMap.get(existingTripId)!;
        if (!cur.reports.some((mr) => mr.id === r.id)) {
          cur.reports.push(r);
          cur.totalKoli += r.total_koli || 0;
          cur.totalItemCount += r.items?.length || 0;
          (r.foto_urls || []).forEach((u) => {
            if (u && !cur.allPhotos.includes(u)) cur.allPhotos.push(u);
          });
          (r.items || []).forEach((it) => {
            if (it.foto_barang && !cur.allPhotos.includes(it.foto_barang)) cur.allPhotos.push(it.foto_barang);
          });
        }
      } else {
        const key = existingTripId || `SJP-${r.tanggal_kirim || 'TGL'}-${r.store_tujuan || 'STORE'}`;
        if (batchesMap.has(key)) {
          const cur = batchesMap.get(key)!;
          if (!cur.reports.some((mr) => mr.id === r.id)) {
            cur.reports.push(r);
            cur.totalKoli += r.total_koli || 0;
            cur.totalItemCount += r.items?.length || 0;
            (r.foto_urls || []).forEach((u) => {
              if (u && !cur.allPhotos.includes(u)) cur.allPhotos.push(u);
            });
            (r.items || []).forEach((it) => {
              if (it.foto_barang && !cur.allPhotos.includes(it.foto_barang)) cur.allPhotos.push(it.foto_barang);
            });
          }
        } else {
          const photoSet = new Set<string>();
          (r.foto_urls || []).forEach((u) => {
            if (u) photoSet.add(u);
          });
          (r.items || []).forEach((it) => {
            if (it.foto_barang) photoSet.add(it.foto_barang);
          });

          batchesMap.set(key, {
            tripId: existingTripId || `SJP-${r.id}`,
            storeTujuan: r.store_tujuan,
            tanggalKirim: r.tanggal_kirim || r.tanggal_laporan || '',
            waktuKirim: r.waktu_kirim || '',
            dikirimOleh: r.dikirim_oleh || '-',
            armada: r.armada || '',
            noPolisi: r.no_polisi || '',
            catatanKirim: r.catatan_kirim || '',
            status: 'active',
            reports: [r],
            totalKoli: r.total_koli || 0,
            totalItemCount: r.items?.length || 0,
            allPhotos: Array.from(photoSet),
            createdAt: r.created_at || '',
          });
        }
      }
    });

    return Array.from(batchesMap.values()).sort((a, b) => {
      return (b.createdAt || b.tanggalKirim).localeCompare(a.createdAt || a.tanggalKirim);
    });
  }, [trips, reports, sentReports]);

  const filteredHistoriBatches = useMemo(() => {
    return historiBatches.filter((b) => {
      const matchSearch =
        searchHistori === '' ||
        b.tripId.toLowerCase().includes(searchHistori.toLowerCase()) ||
        b.storeTujuan.toLowerCase().includes(searchHistori.toLowerCase()) ||
        b.dikirimOleh.toLowerCase().includes(searchHistori.toLowerCase()) ||
        b.catatanKirim.toLowerCase().includes(searchHistori.toLowerCase()) ||
        b.reports.some(
          (r) =>
            r.id.toLowerCase().includes(searchHistori.toLowerCase()) ||
            r.items.some(
              (it) =>
                (it.deskripsi && it.deskripsi.toLowerCase().includes(searchHistori.toLowerCase())) ||
                (it.no_surat_jalan && it.no_surat_jalan.toLowerCase().includes(searchHistori.toLowerCase()))
            )
        );

      const matchStore =
        !filterStoreHistori ||
        filterStoreHistori.length === 0 ||
        (Array.isArray(filterStoreHistori)
          ? filterStoreHistori.some((fs) => isSameStore(b.storeTujuan, fs))
          : isSameStore(b.storeTujuan, filterStoreHistori));

      return matchSearch && matchStore;
    });
  }, [historiBatches, searchHistori, filterStoreHistori]);

  // Legacy compatibility for simple reports list if needed
  const filteredHistori = useMemo(() => {
    return sentReports.filter((r) => {
      const matchSearch =
        searchHistori === '' ||
        r.store_tujuan.toLowerCase().includes(searchHistori.toLowerCase()) ||
        (r.dikirim_oleh && r.dikirim_oleh.toLowerCase().includes(searchHistori.toLowerCase())) ||
        (r.catatan_kirim && r.catatan_kirim.toLowerCase().includes(searchHistori.toLowerCase())) ||
        r.id.toLowerCase().includes(searchHistori.toLowerCase()) ||
        r.items.some((it) => it.deskripsi.toLowerCase().includes(searchHistori.toLowerCase()));

      const matchStore =
        !filterStoreHistori ||
        filterStoreHistori.length === 0 ||
        (Array.isArray(filterStoreHistori)
          ? filterStoreHistori.some((fs) => isSameStore(r.store_tujuan, fs))
          : isSameStore(r.store_tujuan, filterStoreHistori));

      return matchSearch && matchStore;
    });
  }, [sentReports, searchHistori, filterStoreHistori]);

  return (
    <div className="space-y-4">
      {/* ==================================================================== */}
      {/* NAVIGATION TABS: Laporan | Dispatched | Kirim | Histori              */}
      {/* ==================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#131d31] p-2.5 sm:p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {/* 1. Form Laporan */}
          <button
            type="button"
            onClick={() => setActiveSubTab('laporan')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'laporan'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Form Laporan</span>
          </button>

          {/* 2. Dispatched Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('dispatched')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'dispatched'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Box className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Dispatched</span>
            {dispatchedReports.length > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeSubTab === 'dispatched'
                    ? 'bg-white text-amber-700'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                }`}
              >
                {dispatchedReports.length}
              </span>
            )}
          </button>

          {/* 3. Kirim Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('kirim')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'kirim'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Kirim</span>
            {dispatchedReports.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                {dispatchedStoresList.length} Toko
              </span>
            )}
          </button>

          {/* 4. Histori Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('histori')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'histori'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Histori Pengiriman</span>
            {sentReports.length > 0 && (
              <span className="ml-1 text-[11px] opacity-80">({sentReports.length})</span>
            )}
          </button>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={loadReportsList}
          disabled={loadingReports}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Segarkan Data"
        >
          <RefreshCw className={`w-4 h-4 ${loadingReports ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. SUB-TAB: FORM LAPORAN                                             */}
      {/* ==================================================================== */}
      {activeSubTab === 'laporan' && (
        <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-5">
          <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Form Laporan Pengiriman Store
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Input pengiriman barang cabang toko. Tiap baris memuat: Store Tujuan, No SJ, Deskripsi, Qty. Tanggal laporan otomatis timestamp submit.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 px-3 py-1.5 rounded-xl">
                <Box className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <div className="text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Total: </span>
                  <span className="font-black text-indigo-700 dark:text-indigo-300 text-sm">
                    {formCalculatedKoli} Koli
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">({itemRows.length} Barang)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rows List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-500" />
                Daftar Barang Dikirim ({itemRows.length} Baris)
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMultiStoreModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 border border-blue-200 dark:border-blue-800/60 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  title="Tambah 1 jenis barang ke beberapa toko sekaligus"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>⚡ Multi Toko (Multi-Choice)</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Baris</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {itemRows.map((row, index) => {
                const rowQty = Math.max(1, Number(row.qty) || 1);
                const rowKoli = row.satuan === 'Pcs' ? 1 : rowQty;

                return (
                  <div
                    key={row.tempId}
                    className="p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-3 relative group transition-all hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Barang #{index + 1}
                        </span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          {rowKoli} Koli
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(index)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Duplikasi Baris"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(index)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                          title="Hapus Baris"
                          disabled={itemRows.length <= 1}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Store Tujuan (Drop Search) */}
                      <div className="sm:col-span-4 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <Store className="w-3 h-3 text-indigo-500" />
                          Store Tujuan <span className="text-rose-500">*</span>
                        </label>
                        <SearchableSelect
                          options={stores.map((s) => ({
                            value: s.nama,
                            label: s.nama,
                            secondaryLabel: (s as any).kode ? `Kode: ${(s as any).kode}` : undefined,
                          }))}
                          value={row.isCustomStore ? row.customStoreInput : row.storeTujuan}
                          onChange={(val) => {
                            handleUpdateRow(index, 'isCustomStore', false);
                            handleUpdateRow(index, 'storeTujuan', val);
                            handleUpdateRow(index, 'customStoreInput', '');
                          }}
                          placeholder="Cari Store..."
                          searchPlaceholder="Ketik nama / kode toko..."
                          allowCustom={true}
                          size="sm"
                        />
                      </div>

                      {/* No Surat Jalan */}
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-slate-400" />
                          No. Surat Jalan
                        </label>
                        <input
                          type="text"
                          placeholder="SJ-XXXX (Boleh kosong)"
                          value={row.noSuratJalan}
                          onChange={(e) => handleUpdateRow(index, 'noSuratJalan', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono outline-none"
                        />
                      </div>

                      {/* Deskripsi Barang */}
                      <div className="sm:col-span-5 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          Deskripsi Barang <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: Dress Satin Pink S / Brosur Toko..."
                          value={row.deskripsi}
                          onChange={(e) => handleUpdateRow(index, 'deskripsi', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none"
                        />
                      </div>

                      {/* Qty & Satuan */}
                      <div className="sm:col-span-4 flex gap-2">
                        <div className="flex-1 space-y-1">
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            Qty <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={row.qty}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Math.max(1, Number(e.target.value));
                              handleUpdateRow(index, 'qty', val);
                            }}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center outline-none"
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            Satuan
                          </label>
                          <select
                            value={row.satuan}
                            onChange={(e) => handleUpdateRow(index, 'satuan', e.target.value as SatuanPengirimanStore)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold outline-none"
                          >
                            <option value="Koli">Koli</option>
                            <option value="Pcs">Pcs</option>
                          </select>
                        </div>
                      </div>

                      {/* Keterangan */}
                      <div className="sm:col-span-8 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                          Keterangan Tambahan (opsional)
                        </label>
                        <input
                          type="text"
                          placeholder="Catatan barang, nomor batch, instruksi..."
                          value={row.keterangan}
                          onChange={(e) => handleUpdateRow(index, 'keterangan', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none"
                        />
                      </div>

                      {/* Dokumentasi Foto Barang (Opsi A) */}
                      <div className="sm:col-span-12 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Camera className="w-3.5 h-3.5 text-indigo-500" />
                              Foto Barang #{index + 1} (Opsional):
                            </span>

                            {row.fotoBarang ? (
                              <div className="flex items-center gap-2">
                                <div
                                  onClick={() => {
                                    setPreviewPhotoUrl(row.fotoBarang || null);
                                    setPreviewPhotoTitle(`Foto Barang: ${row.deskripsi || 'Baris #' + (index + 1)}`);
                                  }}
                                  className="relative group cursor-pointer w-10 h-10 rounded-lg border border-indigo-200 dark:border-indigo-800 overflow-hidden shrink-0 bg-slate-100"
                                >
                                  <img
                                    src={row.fotoBarang}
                                    alt="Foto Barang"
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                    <Eye className="w-3.5 h-3.5" />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPhotoUrl(row.fotoBarang || null);
                                    setPreviewPhotoTitle(`Foto Barang: ${row.deskripsi || 'Baris #' + (index + 1)}`);
                                  }}
                                  className="text-[11px] text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer"
                                >
                                  Lihat Foto
                                </button>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemPhoto(index)}
                                  className="text-[11px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                                >
                                  Hapus Foto
                                </button>
                              </div>
                            ) : (
                              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold hover:bg-indigo-100/60 cursor-pointer transition-colors">
                                {row.isCompressingPhoto ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Memproses Foto...</span>
                                  </>
                                ) : (
                                  <>
                                    <Camera className="w-3.5 h-3.5" />
                                    <span>Upload / Ambil Foto</span>
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  disabled={row.isCompressingPhoto}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleItemPhotoUpload(index, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Format otomatis dikompresi & disimpan ke Google Drive saat submit
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddRow}
              className="w-full py-2.5 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-600 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Baris Barang Lagi</span>
            </button>

            {/* DOKUMENTASI PENGIRIMAN KESELURUHAN (OPSI B: FOTO KOLI / PACKING / BUKTI KIRIM) */}
            <div className="mt-5 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    Dokumentasi Pengiriman Keseluruhan (Foto Koli / Packing / Bukti Fisik)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Foto tumpukan koli, karung, kardus bersegel, atau kondisi fisik sebelum dikirim (Maks 8 foto).
                  </p>
                </div>

                <div>
                  <input
                    ref={overallFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="hidden"
                    disabled={isCompressingOverall}
                    onChange={handleOverallPhotoUpload}
                  />
                  <button
                    type="button"
                    onClick={() => overallFileInputRef.current?.click()}
                    disabled={isCompressingOverall || overallPhotos.length >= 8}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isCompressingOverall ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Memproses Foto...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        <span>+ Tambah Foto Koli / Packing</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {overallPhotos.length === 0 ? (
                <div
                  onClick={() => overallFileInputRef.current?.click()}
                  className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 text-center space-y-1.5 cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    Klik untuk upload foto packing keseluruhan (opsional)
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Bisa ambil langsung dari kamera HP atau pilih dari galeri
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-1">
                  {overallPhotos.map((photo, pIdx) => (
                    <div
                      key={pIdx}
                      className="group relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 aspect-square shadow-2xs"
                    >
                      <img
                        src={photo}
                        alt={`Foto Packing ${pIdx + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        referrerPolicy="no-referrer"
                        onClick={() => {
                          setPreviewPhotoUrl(photo);
                          setPreviewPhotoTitle(`Dokumentasi Pengiriman #${pIdx + 1}`);
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewPhotoUrl(photo);
                            setPreviewPhotoTitle(`Dokumentasi Pengiriman #${pIdx + 1}`);
                          }}
                          className="p-1 rounded-md bg-white/90 text-slate-800 hover:bg-white cursor-pointer"
                          title="Lihat Foto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveOverallPhoto(pIdx)}
                          className="p-1 rounded-md bg-rose-600/90 text-white hover:bg-rose-700 cursor-pointer"
                          title="Hapus Foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                        #{pIdx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Barang yang disubmit langsung masuk ke antrean <strong className="text-amber-600">Dispatched</strong>.
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleSubmitReport(false)}
                disabled={isSubmittingReport}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 text-slate-500" />
                <span>Simpan ke Dispatched</span>
              </button>

              <button
                type="button"
                onClick={() => handleSubmitReport(true)}
                disabled={isSubmittingReport}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                <span>Submit & Cetak Barcode Koli</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. SUB-TAB: DISPATCHED (READY KIRIM)                                 */}
      {/* ==================================================================== */}
      {activeSubTab === 'dispatched' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Store, ID, Deskripsi..."
                  value={searchDispatched}
                  onChange={(e) => setSearchDispatched(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="w-full sm:w-auto min-w-[220px]">
                <SearchableSelect
                  multiple={true}
                  options={stores.map((s) => {
                    const countInDispatched = dispatchedReports.filter((r) => isSameStore(r.store_tujuan, s.nama)).length;
                    return {
                      value: s.nama,
                      label: s.nama,
                      badge: countInDispatched > 0 ? `${countInDispatched} Lap` : undefined,
                      badgeColor: 'amber' as const,
                    };
                  })}
                  value={filterStoreDispatched}
                  onChange={(val) => setFilterStoreDispatched(val)}
                  placeholder="Filter Store (Multi-Choice)"
                  searchPlaceholder="Cari toko..."
                  size="sm"
                  icon={<Store className="w-3.5 h-3.5" />}
                />
              </div>

              {/* Filter Status Cetak Label */}
              <div className="w-full sm:w-auto min-w-[180px]">
                <SearchableSelect
                  options={[
                    { value: 'all', label: 'Semua Status Label' },
                    {
                      value: 'unprinted',
                      label: 'Belum Cetak Label',
                      badge: dispatchedReports.filter((r) => !r.is_label_printed).length,
                      badgeColor: 'amber',
                    },
                    {
                      value: 'printed',
                      label: 'Sudah Cetak Label',
                      badge: dispatchedReports.filter((r) => r.is_label_printed).length,
                      badgeColor: 'emerald',
                    },
                  ]}
                  value={filterLabelStatusDispatched}
                  onChange={(val) => setFilterLabelStatusDispatched(val as any)}
                  placeholder="Status Label"
                  allowCustom={false}
                  size="sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSelectAllDispatched}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                {selectedDispatchedIds.length === filteredDispatched.length && filteredDispatched.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Pilih Semua ({filteredDispatched.length})</span>
              </button>

              {/* Tombol Cetak Barcode Koli Massal */}
              {selectedDispatchedIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(selectedDispatchedObjects)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25 flex items-center gap-1.5 cursor-pointer transition-all animate-in fade-in"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    Cetak Barcode Terpilih ({selectedDispatchedIds.length} Lap • {totalKoliSelectedDispatched} Koli)
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(filteredDispatched)}
                  disabled={filteredDispatched.length === 0}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/80 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title="Cetak barcode koli untuk seluruh hasil filter"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Massal Semua ({totalKoliFilteredDispatched} Koli)</span>
                </button>
              )}
            </div>
          </div>

          {/* Banner Toko Spesifik (Jika Filter Toko Aktif) */}
          {filterStoreDispatched && filteredDispatched.length > 0 && (
            <div className="bg-linear-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase flex items-center gap-2">
                    <span>{filterStoreDispatched}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-200 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                      Cabang Aktif
                    </span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Terdapat <strong className="text-indigo-600 dark:text-indigo-400">{filteredDispatched.length} laporan</strong> dengan total <strong className="text-indigo-600 dark:text-indigo-400">{totalKoliFilteredDispatched} Koli</strong> siap kirim.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(filteredDispatched)}
                  className="px-3.5 py-2 rounded-xl text-xs font-black text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950 border border-indigo-300 dark:border-indigo-700 flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-indigo-600" />
                  <span>Cetak Barcode Koli {filterStoreDispatched} ({totalKoliFilteredDispatched} Koli)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendSelectedBulkFromDispatched(filteredDispatched)}
                  className="px-4 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 shadow-md shadow-blue-600/25 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim Semua ({totalKoliFilteredDispatched} Koli)</span>
                </button>
              </div>
            </div>
          )}

          {filteredDispatched.length === 0 ? (
            <div className="bg-white dark:bg-[#131d31] p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <Box className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Tidak ada laporan dispatched yang menunggu kirim
              </h4>
              <p className="text-xs text-slate-500">
                Silakan input barang di tab Form Laporan untuk mencatat barang yang ready dikirim.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredDispatched.map((rep) => {
                const isChecked = selectedDispatchedIds.includes(rep.id);

                return (
                  <div
                    key={rep.id}
                    className={`bg-white dark:bg-[#131d31] rounded-2xl border transition-all p-4 space-y-3 ${
                      isChecked
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectDispatched(rep.id)}
                          className="mt-0.5 text-slate-400 hover:text-indigo-600 cursor-pointer"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-5 h-5 text-indigo-600" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400" />
                          )}
                        </button>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                              <Store className="w-4 h-4 text-indigo-500" />
                              {rep.store_tujuan}
                            </h4>
                            <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                              Dispatched
                            </span>
                            {rep.is_label_printed ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                                title={`Label dicetak pada: ${rep.label_printed_at || 'Sebelumnya'}`}
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Sudah Cetak Label
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80">
                                <Printer className="w-3 h-3 text-amber-600 animate-pulse" />
                                Belum Cetak Label
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {rep.tanggal_laporan} • PIC: {rep.pic_nama}
                          </div>
                        </div>
                      </div>

                      <div className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-3 py-1 rounded-xl text-right">
                        <span className="text-[10px] text-slate-400 block">Total Koli</span>
                        <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                          {rep.total_koli} Koli
                        </span>
                      </div>
                    </div>

                    {/* Rincian Barang */}
                    <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800/80">
                      <div className="text-[10px] font-black uppercase text-slate-500 mb-1">
                        Rincian Barang ({rep.items.length} item):
                      </div>
                      <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60 text-xs">
                        {rep.items.map((it, itIdx) => (
                          <div key={it.id || itIdx} className="py-1 flex justify-between items-center gap-2">
                            <div className="truncate flex items-center gap-1">
                              <span className="font-mono text-[10px] text-slate-400 mr-1.5">
                                [{it.no_surat_jalan}]
                              </span>
                              <span className="font-bold">{it.deskripsi}</span>
                              {it.foto_barang && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewPhotoUrl(it.foto_barang || null);
                                    setPreviewPhotoTitle(`Foto Barang: ${it.deskripsi}`);
                                  }}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[10px] font-bold hover:bg-indigo-100 cursor-pointer shrink-0 ml-1"
                                  title="Lihat Foto Dokumentasi Barang"
                                >
                                  <Camera className="w-3 h-3 text-indigo-500" />
                                  <span>Foto</span>
                                </button>
                              )}
                            </div>
                            <div className="shrink-0 font-semibold">
                              {it.qty} {it.satuan} ({it.hitung_koli} Koli)
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Foto Dokumentasi Pengiriman Keseluruhan (Jika Ada) */}
                    {rep.foto_urls && rep.foto_urls.length > 0 && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                          Dokumentasi Koli ({rep.foto_urls.length}):
                        </span>
                        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                          {rep.foto_urls.map((photoUrl, pIdx) => (
                            <div
                              key={pIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewPhotoUrl(photoUrl);
                                setPreviewPhotoTitle(`Dokumentasi Pengiriman ${rep.store_tujuan} #${pIdx + 1}`);
                              }}
                              className="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-slate-100"
                              title="Klik untuk memperbesar"
                            >
                              <img
                                src={photoUrl}
                                alt="Dokumentasi"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditDispatched(rep)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex items-center gap-1 cursor-pointer transition-colors"
                          title="Edit Rincian Barang / Toko Tujuan Laporan Ini"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteReport(rep)}
                          className="px-2.5 py-1.5 rounded-xl text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePrintLabelsForReport(rep)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1 cursor-pointer transition-colors ${
                            rep.is_label_printed
                              ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 border-slate-300 dark:border-slate-700'
                              : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 hover:bg-indigo-100 border-indigo-300 dark:border-indigo-800'
                          }`}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{rep.is_label_printed ? 'Cetak Ulang Label' : 'Cetak Label'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSendSelectedFromDispatched(rep)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <span>Setup Kirim</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating Sticky Action Bar saat ada Laporan Dispatched yang Terpilih */}
          {selectedDispatchedIds.length > 0 && (
            <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-2xl bg-slate-900/95 dark:bg-slate-950/95 text-white backdrop-blur-md px-4 py-3 rounded-2xl border border-slate-700 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black">
                      {selectedDispatchedIds.length} Laporan Dipilih
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                      {totalKoliSelectedDispatched} Koli Total
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-[300px]">
                    {selectedDispatchedStoreNames.join(', ')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(selectedDispatchedObjects)}
                  className="px-3.5 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Barcode Koli Massal</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendSelectedBulkFromDispatched(selectedDispatchedObjects)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 shadow-lg shadow-blue-600/30 cursor-pointer transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Setup Kirim</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDispatchedIds([])}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Batal Pilih"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. SUB-TAB: TAB KIRIM (SETUP PENGIRIMAN SPESIFIK STORE)               */}
      {/* ==================================================================== */}
      {activeSubTab === 'kirim' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-5">
            {/* Header */}
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Atur Pengiriman Barang ke Store
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pilih Store Tujuan. Daftar barang dispatched toko tersebut akan otomatis muncul dan dapat dipilih untuk dikirim.
                </p>
              </div>

              {/* Status summary */}
              {selectedStoreKirim && (
                <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 px-3 py-1.5 rounded-xl text-xs">
                  <span className="text-slate-500">Terpilih untuk dikirim: </span>
                  <strong className="text-blue-700 dark:text-blue-300">
                    {totalKoliSelectedForKirim} Koli ({selectedReportIdsForKirim.length} Laporan)
                  </strong>
                </div>
              )}
            </div>

            {/* FORM SETUP KIRIM */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              {/* 1. Pilih Store Tujuan (Searchable Dropdown) */}
              <div className="sm:col-span-6 space-y-1">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <Store className="w-4 h-4 text-blue-600" />
                  Pilih Store Tujuan <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  options={[
                    ...dispatchedStoresList.map((ds) => ({
                      value: ds.storeName,
                      label: ds.storeName,
                      badge: `${ds.koli} Koli Ready`,
                      badgeColor: 'emerald' as const,
                      secondaryLabel: `${ds.count} Laporan Dispatched`,
                    })),
                    ...stores
                      .filter((s) => !dispatchedStoresList.some((ds) => isSameStore(ds.storeName, s.nama)))
                      .map((s) => ({
                        value: s.nama,
                        label: s.nama,
                        secondaryLabel: (s as any).kode ? `Kode: ${(s as any).kode}` : undefined,
                        badge: '0 Koli',
                        badgeColor: 'slate' as const,
                      })),
                  ]}
                  value={selectedStoreKirim}
                  onChange={(val) => setSelectedStoreKirim(val)}
                  placeholder="-- Cari atau Pilih Toko Cabang Tujuan --"
                  searchPlaceholder="Ketik nama atau kode toko..."
                  allowCustom={true}
                  size="md"
                  buttonClassName="border-2 border-blue-400 dark:border-blue-600 font-black text-slate-900 dark:text-white"
                />
                <div className="text-[11px] text-slate-400">
                  Saat store dipilih, seluruh barang yang ready kirim di toko ini otomatis muncul di bawah.
                </div>
              </div>

              {/* 2. Dikirim Oleh (Driver / Kurir) - PERLU */}
              <div className="sm:col-span-6 space-y-1">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <User className="w-4 h-4 text-blue-600" />
                  Dikirim Oleh (Driver / Kurir) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pak Joko (Driver Internal) / Nama Petugas"
                  value={dikirimOleh}
                  onChange={(e) => setDikirimOleh(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                />
                {/* Quick suggestions */}
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {['Driver Toko Internal', 'Kurir Operasional', 'Staff Logistik'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setDikirimOleh(sug)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Tanggal Kirim */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Tanggal Kirim
                </label>
                <input
                  type="date"
                  value={tanggalKirim}
                  onChange={(e) => setTanggalKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                />
              </div>

              {/* 4. Catatan Kirim - PERLU */}
              <div className="sm:col-span-8 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Catatan Kirim
                </label>
                <input
                  type="text"
                  placeholder="Catatan pengiriman untuk toko atau driver (opsional)..."
                  value={catatanKirim}
                  onChange={(e) => setCatatanKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 outline-none"
                />
              </div>
            </div>

            {/* DAFTAR BARANG DISPATCHED TOKO TERSEBUT (OTOMATIS MUNCUL) */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-amber-500" />
                    Daftar Dispatched Toko:{' '}
                    <span className="text-blue-600 underline">{selectedStoreKirim || '(Pilih Toko di Atas)'}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Centang barang yang akan diberangkatkan sekarang (bisa semua atau pilih beberapa).
                  </p>
                </div>

                {dispatchedForSelectedStore.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleAllKirimForStore}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    {selectedReportIdsForKirim.length === dispatchedForSelectedStore.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>
                      {selectedReportIdsForKirim.length === dispatchedForSelectedStore.length
                        ? 'Batal Pilih Semua'
                        : `Pilih Semua (${dispatchedForSelectedStore.length})`}
                    </span>
                  </button>
                )}
              </div>

              {!selectedStoreKirim ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-300 text-slate-400 text-xs">
                  Pilih Store Tujuan pada dropdown di atas untuk memuat daftar barang dispatched toko tersebut.
                </div>
              ) : dispatchedForSelectedStore.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-300 space-y-2 text-xs">
                  <Box className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-slate-500">
                    Tidak ada barang di antrean Dispatched untuk store <strong>{selectedStoreKirim}</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('laporan')}
                    className="text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    + Buat Laporan Pengiriman Toko Ini
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dispatchedForSelectedStore.map((r) => {
                    const isSelected = selectedReportIdsForKirim.includes(r.id);

                    return (
                      <div
                        key={r.id}
                        onClick={() => handleToggleSelectKirimItem(r.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                          isSelected
                            ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                            : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectKirimItem(r.id);
                              }}
                              className="text-slate-400 hover:text-blue-600 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-400" />
                              )}
                            </button>
                            <div>
                              <div className="text-xs font-black text-slate-800 dark:text-slate-200 font-mono">
                                {r.id}
                              </div>
                              <div className="text-[10px] text-slate-400">Tgl: {r.tanggal_laporan}</div>
                            </div>
                          </div>

                          <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-black text-xs px-2 py-0.5 rounded-md">
                            {r.total_koli} Koli
                          </span>
                        </div>

                        {/* Rincian item: Detil Lengkap dengan No Surat Jalan & Foto */}
                        <div className="space-y-2">
                          <div className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Box className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Rincian Barang ({r.items.length} Item):</span>
                          </div>

                          <div className="space-y-2">
                            {r.items.map((it, i) => {
                              const sjNumber =
                                it.no_surat_jalan && it.no_surat_jalan !== 'Tidak ada no surat jalan'
                                  ? it.no_surat_jalan
                                  : r.id;

                              return (
                                <div
                                  key={it.id || i}
                                  className="bg-white dark:bg-slate-900/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 shadow-2xs"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      {/* No Surat Jalan Badge */}
                                      <div className="inline-flex items-center gap-1 text-[11px] font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/80 mb-1">
                                        <FileText className="w-3 h-3 text-indigo-500 shrink-0" />
                                        <span>No. SJ: {sjNumber}</span>
                                      </div>

                                      {/* Nama / Deskripsi Barang */}
                                      <div className="font-bold text-slate-900 dark:text-white text-xs leading-snug">
                                        {it.deskripsi}
                                      </div>

                                      {/* Qty & Hitung Koli */}
                                      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                                        <span>
                                          Qty: <strong className="text-slate-800 dark:text-slate-200">{it.qty} {it.satuan}</strong>
                                        </span>
                                        <span>•</span>
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                                          Muatan: {it.hitung_koli} Koli
                                        </span>
                                        {it.keterangan && (
                                          <>
                                            <span>•</span>
                                            <span className="italic text-slate-500">"{it.keterangan}"</span>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {/* Foto Barang jika tersedia */}
                                    {it.foto_barang && (
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewPhotoUrl(it.foto_barang!);
                                          setPreviewPhotoTitle(`Foto Barang: ${it.deskripsi} (SJ: ${sjNumber})`);
                                        }}
                                        className="shrink-0 relative group cursor-pointer"
                                        title="Klik untuk memperbesar foto barang"
                                      >
                                        <img
                                          src={it.foto_barang}
                                          alt={it.deskripsi}
                                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-xs group-hover:ring-2 group-hover:ring-blue-500 transition-all"
                                        />
                                        <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                                          <Camera className="w-4 h-4" />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Foto Dokumentasi Koli / Laporan jika tersedia */}
                          {r.foto_urls && r.foto_urls.length > 0 && (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1.5">
                                <Camera className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Foto Dokumentasi Koli ({r.foto_urls.length} Foto):</span>
                              </div>
                              <div className="flex items-center gap-2 overflow-x-auto py-1">
                                {r.foto_urls.map((photoUrl, pIdx) => (
                                  <div
                                    key={pIdx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewPhotoUrl(photoUrl);
                                      setPreviewPhotoTitle(`Dokumentasi Koli ${r.store_tujuan} #${pIdx + 1}`);
                                    }}
                                    className="relative group shrink-0 cursor-pointer"
                                    title="Klik untuk memperbesar foto koli"
                                  >
                                    <img
                                      src={photoUrl}
                                      alt={`Koli ${pIdx + 1}`}
                                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-xs group-hover:ring-2 group-hover:ring-emerald-500 transition-all"
                                    />
                                    <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                                      <Eye className="w-3.5 h-3.5" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Footer Card: Label Status & Edit Button */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditDispatched(r);
                            }}
                            className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 font-bold hover:underline cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Laporan</span>
                          </button>

                          {r.is_label_printed ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              Label Siap
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                              <Printer className="w-2.5 h-2.5 text-amber-600" />
                              Belum Cetak Label
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Alur: <strong>Submit Kirim</strong> → <strong>Cetak Surat Jalan (A4 Rangkap 2)</strong> → Masuk ke <strong>Histori</strong>.
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(selectedDispatchedObjectsForKirim)}
                  disabled={selectedReportIdsForKirim.length === 0}
                  className="flex-1 sm:flex-none px-4 py-3 rounded-xl text-xs font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  title="Cetak barcode koli untuk barang yang dipilih"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Label Koli ({totalKoliSelectedForKirim} Koli)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmitKirim}
                  disabled={isProcessingKirim || selectedReportIdsForKirim.length === 0}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-xl text-sm font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit Kirim & Cetak SJ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. SUB-TAB: HISTORI PENGIRIMAN                                       */}
      {/* Fitur: Cetak Ulang Surat Jalan, Edit, Cancel/Delete, Histori Log     */}
      {/* ==================================================================== */}
      {activeSubTab === 'histori' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Store, Driver, Catatan, ID..."
                  value={searchHistori}
                  onChange={(e) => setSearchHistori(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="w-full sm:w-auto min-w-[220px]">
                <SearchableSelect
                  multiple={true}
                  options={stores.map((s) => {
                    const countInHistori = historiBatches.filter((b) => isSameStore(b.storeTujuan, s.nama)).length;
                    return {
                      value: s.nama,
                      label: s.nama,
                      badge: countInHistori > 0 ? `${countInHistori} SJ` : undefined,
                      badgeColor: 'blue' as const,
                    };
                  })}
                  value={filterStoreHistori}
                  onChange={(val) => setFilterStoreHistori(val)}
                  placeholder="Filter Store (Multi-Choice)"
                  searchPlaceholder="Cari toko..."
                  size="sm"
                  icon={<Store className="w-3.5 h-3.5" />}
                />
              </div>
            </div>

            <div className="text-xs font-bold text-slate-500">
              Total <strong className="text-emerald-600">{filteredHistoriBatches.length}</strong> Surat Jalan Pengiriman (Batch)
            </div>
          </div>

          {filteredHistoriBatches.length === 0 ? (
            <div className="bg-white dark:bg-[#131d31] p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <Clock className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Belum ada histori pengiriman
              </h4>
              <p className="text-xs text-slate-500">
                Laporan yang telah diproses di tab Kirim akan otomatis tercatat per Batch (1 Batch = 1 No SJ Pengiriman) di sini.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-3">No. SJ Pengiriman & Tgl</th>
                      <th className="px-3.5 py-3">Store Tujuan</th>
                      <th className="px-3.5 py-3">Dikirim Oleh / Driver</th>
                      <th className="px-3.5 py-3">Muatan Koli & Barang</th>
                      <th className="px-3.5 py-3">Foto Dokumentasi</th>
                      <th className="px-3.5 py-3">Catatan</th>
                      <th className="px-3.5 py-3">Status</th>
                      <th className="px-3.5 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredHistoriBatches.map((batch) => {
                      const isCancelled = batch.status === 'cancelled';

                      return (
                        <tr
                          key={batch.tripId}
                          onClick={() => setSelectedBatchDetail(batch)}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                        >
                          {/* No. SJ Pengiriman & Tgl */}
                          <td className="px-3.5 py-3">
                            <div className="font-mono font-black text-blue-600 dark:text-blue-400 group-hover:underline flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-blue-500" />
                              <span>{batch.tripId}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                              {batch.tanggalKirim} {batch.waktuKirim && `• ${batch.waktuKirim}`}
                            </div>
                          </td>

                          {/* Store Tujuan */}
                          <td className="px-3.5 py-3">
                            <div className="font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="truncate max-w-[200px]">{batch.storeTujuan}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {batch.reports.length} Laporan SJB • {batch.totalItemCount} Macam Barang
                            </div>
                          </td>

                          {/* Dikirim Oleh / Driver */}
                          <td className="px-3.5 py-3">
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              {batch.dikirimOleh}
                            </div>
                            {(batch.armada || batch.noPolisi) && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {batch.armada} {batch.noPolisi && `(${batch.noPolisi})`}
                              </div>
                            )}
                          </td>

                          {/* Muatan Koli & Barang */}
                          <td className="px-3.5 py-3">
                            <div className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-black px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800/60">
                              <Box className="w-3.5 h-3.5 text-indigo-500" />
                              <span>{batch.totalKoli} Koli</span>
                            </div>
                          </td>

                          {/* Foto Dokumentasi */}
                          <td className="px-3.5 py-3" onClick={(e) => e.stopPropagation()}>
                            {batch.allPhotos.length > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPhotoUrl(batch.allPhotos[0]);
                                    setPreviewPhotoTitle(`Foto Dokumentasi ${batch.tripId} - ${batch.storeTujuan}`);
                                  }}
                                  className="relative group/photo shrink-0 cursor-pointer"
                                  title="Klik untuk melihat foto"
                                >
                                  <img
                                    src={batch.allPhotos[0]}
                                    alt="Foto"
                                    className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 group-hover/photo:ring-2 group-hover/photo:ring-emerald-500"
                                  />
                                </button>
                                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                  {batch.allPhotos.length} Foto
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">Tidak ada foto</span>
                            )}
                          </td>

                          {/* Catatan */}
                          <td className="px-3.5 py-3 text-slate-600 dark:text-slate-400 max-w-[160px] truncate">
                            {batch.catatanKirim || '-'}
                          </td>

                          {/* Status */}
                          <td className="px-3.5 py-3">
                            {isCancelled ? (
                              <span className="bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 font-black text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                Dibatalkan
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-black text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Terkirim
                              </span>
                            )}
                          </td>

                          {/* Aksi: Rincian, Cetak, Edit, Batal Kirim */}
                          <td className="px-3.5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 1. Lihat Rincian Barang */}
                              <button
                                type="button"
                                onClick={() => setSelectedBatchDetail(batch)}
                                className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg flex items-center gap-1 cursor-pointer"
                                title="Lihat Popup Rincian Data Barang yang Dikirim"
                              >
                                <Eye className="w-3 h-3 text-slate-500" />
                                Rincian
                              </button>

                              {/* 2. Cetak Ulang Surat Jalan Pengiriman */}
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenSuratJalanPrint(batch.reports, {
                                    id: batch.tripId,
                                    tanggal_kirim: batch.tanggalKirim,
                                    dikirim_oleh: batch.dikirimOleh,
                                    armada: batch.armada,
                                    no_polisi: batch.noPolisi,
                                    catatan: batch.catatanKirim,
                                  })
                                }
                                className="px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 rounded-lg flex items-center gap-1 cursor-pointer"
                                title="Cetak Surat Jalan Pengiriman (A4 Rangkap 2)"
                              >
                                <Printer className="w-3 h-3" />
                                Cetak SJ
                              </button>

                              {/* 3. Edit Tanggal, Driver, Barang */}
                              {!isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditTrip(batch)}
                                  className="px-2.5 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg flex items-center gap-1 cursor-pointer"
                                  title="Edit Tanggal, Driver/Kurir, dan Barang Pengiriman"
                                >
                                  <Edit className="w-3 h-3" />
                                  Edit
                                </button>
                              )}

                              {/* 4. Batal Kirim (Otomatis Balik ke Dispatched) */}
                              {!isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCancelTrip(batch)}
                                  className="px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center gap-1 cursor-pointer"
                                  title="Batalkan Pengiriman (Semua barang otomatis kembali ke Dispatched)"
                                >
                                  <XCircle className="w-3 h-3" />
                                  Batal Kirim
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDIT PENGIRIMAN                                               */}
      {/* ==================================================================== */}
      {editingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                <Edit className="w-4 h-4 text-blue-600" />
                Edit Pengiriman ke {editingReport.store_tujuan}
              </h4>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Tanggal Kirim <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={editTanggalKirim}
                  onChange={(e) => setEditTanggalKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Dikirim Oleh (Driver / Kurir) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editDikirimOleh}
                  onChange={(e) => setEditDikirimOleh(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Catatan Pengiriman
                </label>
                <textarea
                  rows={2}
                  value={editCatatanKirim}
                  onChange={(e) => setEditCatatanKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Perubahan ini akan otomatis dicatat ke riwayat log audit pengiriman.</span>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer disabled:opacity-50"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CANCEL PENGIRIMAN (KEMBALIKAN KE DISPATCHED)                  */}
      {/* ==================================================================== */}
      {cancellingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-rose-50 dark:bg-rose-950/40">
              <h4 className="text-sm font-black text-rose-700 dark:text-rose-300 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Batalkan Pengiriman (Cancel)
              </h4>
              <button
                type="button"
                onClick={() => setCancellingReport(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Apakah Anda yakin ingin membatalkan pengiriman ke <strong>{cancellingReport.store_tujuan}</strong> ({cancellingReport.total_koli} Koli)?
              </p>
              <p className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
                ✓ Barang akan otomatis dikembalikan ke antrean <strong>Dispatched</strong> sehingga siap diatur kembali pengirimannya.
              </p>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Alasan Pembatalan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Jadwal kirim ditunda / Armada rusak / Salah input..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setCancellingReport(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isProcessingCancel}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                Konfirmasi Pembatalan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: AUDIT LOG (RIWAYAT EDIT & CANCEL)                             */}
      {/* ==================================================================== */}
      {viewingAuditReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                  <History className="w-4 h-4 text-amber-500" />
                  Riwayat Log Pengiriman ke {viewingAuditReport.store_tujuan}
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">{viewingAuditReport.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingAuditReport(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs max-h-[60vh] overflow-y-auto">
              {!viewingAuditReport.audit_logs || viewingAuditReport.audit_logs.length === 0 ? (
                <div className="text-center py-6 text-slate-400">Belum ada riwayat perubahan data.</div>
              ) : (
                <div className="space-y-2.5">
                  {viewingAuditReport.audit_logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5"
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            log.action === 'cancel'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                              : log.action === 'edit'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                          }`}
                        >
                          {log.action.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.timestamp).toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        Oleh: {log.user_nama} ({log.user_username || 'user'})
                      </div>

                      <div className="text-slate-600 dark:text-slate-400 text-[11px]">
                        {log.keterangan}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setViewingAuditReport(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: PREVIEW DOKUMENTASI FOTO (ZOOM / FULL VIEW)                   */}
      {/* ==================================================================== */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div
            className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full overflow-hidden shadow-2xl space-y-3 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-500" />
                <span>{previewPhotoTitle}</span>
              </h3>
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-[70vh]">
              <img
                src={previewPhotoUrl}
                alt="Preview"
                className="max-h-[68vh] w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-[11px] text-slate-400">
                Tersimpan di cloud / Google Drive
              </span>
              <div className="flex items-center gap-2">
                {previewPhotoUrl.startsWith('http') && (
                  <a
                    href={previewPhotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                  >
                    Buka di Tab Baru
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewPhotoUrl(null)}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CETAK BARCODE MARKING KOLI (50x20 & A6)                       */}
      {/* ==================================================================== */}
      <KoliMarkingPrintModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        labels={labelsToPrint}
        title={printModalTitle}
      />

      {/* ==================================================================== */}
      {/* MODAL: CETAK SURAT JALAN PENGIRIMAN (A4 BAGI 2 DENGAN KOTAK CEKLIS)  */}
      {/* ==================================================================== */}
      <SuratJalanPrintModal
        isOpen={suratJalanModalOpen}
        onClose={() => setSuratJalanModalOpen(false)}
        trip={suratJalanTripToPrint}
        reports={suratJalanReportsToPrint}
      />

      {/* ==================================================================== */}
      {/* MODAL: KONFIRMASI HAPUS LAPORAN                                      */}
      {/* ==================================================================== */}
      {deletingReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Batalkan Laporan Dispatched</h3>
                <p className="text-xs text-slate-500">Status akan menjadi Cancelled & tidak masuk list kirim</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Apakah Anda yakin ingin membatalkan laporan pengiriman ke <strong className="text-slate-900 dark:text-white">{deletingReport.store_tujuan}</strong> (<code className="font-mono text-indigo-600 dark:text-indigo-400">{deletingReport.id}</code>)?
            </p>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Status Berubah Menjadi Cancelled
              </div>
              <p className="text-[11px] leading-relaxed">
                Laporan ini berstatus <strong>Cancelled</strong> dan otomatis <strong>TIDAK akan muncul</strong> di antrean Tab Kirim.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingReport(null)}
                disabled={isDeletingReport}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteReport}
                disabled={isDeletingReport}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isDeletingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>Batalkan Laporan</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ==================================================================== */}
      {/* MODAL: EDIT LAPORAN DISPATCHED                                       */}
      {/* ==================================================================== */}
      {editingDispatchedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full my-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Edit Laporan Dispatched
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    ID: {editingDispatchedReport.id} • Toko Asal:{' '}
                    <strong>{editingDispatchedReport.store_tujuan}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingDispatchedReport(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Toko Tujuan (Searchable Dropdown) */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-indigo-500" />
                  Store Tujuan <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  options={stores.map((s) => ({
                    value: s.nama,
                    label: s.nama,
                    secondaryLabel: (s as any).kode ? `Kode: ${(s as any).kode}` : undefined,
                  }))}
                  value={editStoreTujuan}
                  onChange={(val) => setEditStoreTujuan(val)}
                  placeholder="Pilih Store Tujuan..."
                  searchPlaceholder="Ketik nama store..."
                  allowCustom={true}
                  size="md"
                />
              </div>

              {/* Rincian Items */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-black text-slate-800 dark:text-slate-200 uppercase text-xs flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-500" />
                    Daftar Barang ({editItems.length} Item)
                  </span>

                  <button
                    type="button"
                    onClick={handleAddEditItemRow}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Barang</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {editItems.map((item, idx) => {
                    const rowKoli =
                      item.satuan === 'Pcs' ? 1 : Math.max(1, Math.round(Number(item.qty) || 1));

                    return (
                      <div
                        key={item.id || idx}
                        className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-amber-500 text-white font-black text-[11px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                              Barang #{idx + 1}
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                              {rowKoli} Koli
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveEditItemRow(idx)}
                            disabled={editItems.length <= 1}
                            className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                            title="Hapus baris barang ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <div className="sm:col-span-4 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">
                              No Surat Jalan
                            </label>
                            <input
                              type="text"
                              value={item.no_surat_jalan || ''}
                              onChange={(e) =>
                                handleUpdateEditItem(idx, 'no_surat_jalan', e.target.value)
                              }
                              placeholder="No SJ (Opsional)..."
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none"
                            />
                          </div>

                          <div className="sm:col-span-5 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">
                              Deskripsi Barang <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={item.deskripsi || ''}
                              onChange={(e) =>
                                handleUpdateEditItem(idx, 'deskripsi', e.target.value)
                              }
                              placeholder="Nama produk / barang..."
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold outline-none"
                            />
                          </div>

                          <div className="sm:col-span-3 grid grid-cols-2 gap-1.5">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500">Qty</label>
                              <input
                                type="number"
                                min={1}
                                value={item.qty || 1}
                                onChange={(e) =>
                                  handleUpdateEditItem(
                                    idx,
                                    'qty',
                                    Math.max(1, parseInt(e.target.value) || 1)
                                  )
                                }
                                className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center outline-none"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500">Satuan</label>
                              <select
                                value={item.satuan}
                                onChange={(e) =>
                                  handleUpdateEditItem(idx, 'satuan', e.target.value as any)
                                }
                                className="w-full px-1.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold outline-none"
                              >
                                <option value="Pcs">Pcs</option>
                                <option value="Koli">Koli</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">
                            Keterangan Tambahan
                          </label>
                          <input
                            type="text"
                            value={item.keterangan || ''}
                            onChange={(e) =>
                              handleUpdateEditItem(idx, 'keterangan', e.target.value)
                            }
                            placeholder="Catatan khusus, nomor seri, dll..."
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl flex items-center justify-between text-xs">
                <span className="text-amber-800 dark:text-amber-300 font-bold">
                  Total Dihitung Ulang:
                </span>
                <span className="font-black text-amber-900 dark:text-amber-200">
                  {editItems.length} Item •{' '}
                  {editItems.reduce(
                    (acc, curr) =>
                      acc + (curr.satuan === 'Pcs' ? 1 : Math.max(1, Math.round(Number(curr.qty) || 1))),
                    0
                  )}{' '}
                  Koli
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingDispatchedReport(null)}
                disabled={isSavingEditDispatched}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleSaveEditDispatched}
                disabled={isSavingEditDispatched}
                className="px-5 py-2 rounded-xl text-xs font-black text-white bg-amber-600 hover:bg-amber-700 shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingEditDispatched ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: POPUP RINCIAN DATA BARANG YANG DIKIRIM (BESERTA FOTO)        */}
      {/* 1 batch kirim = 1 no SJ di histori kirim                            */}
      {/* Saat diklik muncul popup rincian data barang yg dikirim, beserta    */}
      {/* foto jika ada.                                                      */}
      {/* ==================================================================== */}
      {selectedBatchDetail && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-4">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    Surat Jalan Pengiriman: <span className="font-mono text-blue-600 dark:text-blue-400">{selectedBatchDetail.tripId}</span>
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400 font-medium">
                  <span className="flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200">
                    <Store className="w-3.5 h-3.5 text-indigo-500" />
                    Tujuan: {selectedBatchDetail.storeTujuan}
                  </span>
                  <span>•</span>
                  <span>Tgl: <strong>{selectedBatchDetail.tanggalKirim} {selectedBatchDetail.waktuKirim}</strong></span>
                  <span>•</span>
                  <span>Driver: <strong>{selectedBatchDetail.dikirimOleh}</strong></span>
                  {selectedBatchDetail.armada && (
                    <>
                      <span>•</span>
                      <span>Armada: <strong>{selectedBatchDetail.armada} {selectedBatchDetail.noPolisi}</strong></span>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleOpenSuratJalanPrint(selectedBatchDetail.reports, {
                      id: selectedBatchDetail.tripId,
                      tanggal_kirim: selectedBatchDetail.tanggalKirim,
                      dikirim_oleh: selectedBatchDetail.dikirimOleh,
                      armada: selectedBatchDetail.armada,
                      no_polisi: selectedBatchDetail.noPolisi,
                      catatan: selectedBatchDetail.catatanKirim,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 border border-blue-200 dark:border-blue-800/80 flex items-center gap-1.5 cursor-pointer"
                  title="Cetak Surat Jalan Pengiriman (A4 Rangkap 2)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak SJ</span>
                </button>

                {selectedBatchDetail.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditTrip(selectedBatchDetail)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 border border-amber-200 dark:border-amber-800/80 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedBatchDetail(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Catatan pengiriman jika ada */}
              {selectedBatchDetail.catatanKirim && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-2 text-slate-600 dark:text-slate-400">
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Catatan Pengiriman: </span>
                    {selectedBatchDetail.catatanKirim}
                  </div>
                </div>
              )}

              {/* Status Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-black text-slate-800 dark:text-slate-200">
                    Total Muatan: {selectedBatchDetail.totalKoli} Koli
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 dark:text-slate-400 font-bold">
                    {selectedBatchDetail.totalItemCount} Macam Barang ({selectedBatchDetail.reports.length} Laporan SJB)
                  </span>
                </div>
                {selectedBatchDetail.status === 'cancelled' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-700 border border-rose-300">
                    Pengiriman Dibatalkan
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-700 border border-emerald-300">
                    Sedang Dikirim / Selesai
                  </span>
                )}
              </div>

              {/* Tabel Rincian Data Barang */}
              <div className="space-y-3">
                <h4 className="font-black text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Box className="w-4 h-4 text-blue-600" />
                  <span>Rincian Barang yang Dikirim</span>
                </h4>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-3.5 py-2.5">Foto</th>
                          <th className="px-3.5 py-2.5">No. Surat Jalan</th>
                          <th className="px-3.5 py-2.5">Deskripsi Barang</th>
                          <th className="px-3.5 py-2.5">Jumlah (Qty)</th>
                          <th className="px-3.5 py-2.5">Hitung Koli</th>
                          <th className="px-3.5 py-2.5">Keterangan</th>
                          {selectedBatchDetail.status !== 'cancelled' && (
                            <th className="px-3.5 py-2.5 text-right">Aksi Item</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedBatchDetail.reports.flatMap((rep) =>
                          rep.items.map((it, idx) => {
                            const sjNumber =
                              it.no_surat_jalan && it.no_surat_jalan !== 'Tidak ada no surat jalan'
                                ? it.no_surat_jalan
                                : rep.id;

                            return (
                              <tr
                                key={`${rep.id}-${idx}`}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                              >
                                {/* Foto Barang */}
                                <td className="px-3.5 py-2">
                                  {it.foto_barang ? (
                                    <div
                                      onClick={() => {
                                        setPreviewPhotoUrl(it.foto_barang!);
                                        setPreviewPhotoTitle(`Foto Barang: ${it.deskripsi} (SJ: ${sjNumber})`);
                                      }}
                                      className="relative group shrink-0 cursor-pointer w-10 h-10"
                                      title="Perbesar foto barang"
                                    >
                                      <img
                                        src={it.foto_barang}
                                        alt={it.deskripsi}
                                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-2xs group-hover:ring-2 group-hover:ring-blue-500"
                                      />
                                      <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 text-white">
                                        <Camera className="w-3 h-3" />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300">
                                      <ImageIcon className="w-4 h-4" />
                                    </div>
                                  )}
                                </td>

                                {/* No. Surat Jalan */}
                                <td className="px-3.5 py-2">
                                  <span className="font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60 text-[11px]">
                                    {sjNumber}
                                  </span>
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    Laporan: {rep.id}
                                  </div>
                                </td>

                                {/* Deskripsi Barang */}
                                <td className="px-3.5 py-2">
                                  <div className="font-bold text-slate-900 dark:text-white leading-snug">
                                    {it.deskripsi}
                                  </div>
                                </td>

                                {/* Qty */}
                                <td className="px-3.5 py-2 font-black text-slate-800 dark:text-slate-200">
                                  {it.qty} {it.satuan}
                                </td>

                                {/* Hitung Koli */}
                                <td className="px-3.5 py-2">
                                  <span className="font-black text-indigo-600 dark:text-indigo-400">
                                    {it.hitung_koli} Koli
                                  </span>
                                </td>

                                {/* Keterangan */}
                                <td className="px-3.5 py-2 text-slate-500 italic max-w-[150px] truncate">
                                  {it.keterangan || '-'}
                                </td>

                                {/* Aksi Item: Cancel Kirim Barang ini (Kembali ke Dispatched) */}
                                {selectedBatchDetail.status !== 'cancelled' && (
                                  <td className="px-3.5 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoveReportFromBatch(selectedBatchDetail.tripId, rep)
                                      }
                                      className="px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center gap-1 ml-auto cursor-pointer"
                                      title="Keluarkan dari pengiriman ini & kembalikan ke antrean Dispatched"
                                    >
                                      <Undo2 className="w-3 h-3" />
                                      <span>Balik Dispatched</span>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Dokumentasi Foto Pengiriman Keseluruhan (Galeri) */}
              {selectedBatchDetail.allPhotos.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <h4 className="font-black text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-emerald-600" />
                    <span>Dokumentasi Foto Pengiriman ({selectedBatchDetail.allPhotos.length} Foto)</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                    {selectedBatchDetail.allPhotos.map((photo, pIdx) => (
                      <div
                        key={pIdx}
                        onClick={() => {
                          setPreviewPhotoUrl(photo);
                          setPreviewPhotoTitle(
                            `Dokumentasi Pengiriman ${selectedBatchDetail.tripId} #${pIdx + 1}`
                          );
                        }}
                        className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer shadow-xs"
                        title="Klik untuk memperbesar"
                      >
                        <img
                          src={photo}
                          alt={`Dokumentasi #${pIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                          <Eye className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                1 Batch Kirim = 1 Nomor Surat Jalan Pengiriman
              </div>
              <button
                type="button"
                onClick={() => setSelectedBatchDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDIT PENGIRIMAN BATCH (TANGGAL, DRIVER, BARANG)                */}
      {/* Tersedia opsi edit tanggal, barang, driver/kurir.                    */}
      {/* Barang yg diedit/cancel kirim, otomatis balik ke dispatched.        */}
      {/* ==================================================================== */}
      {editingTripBatch && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-4">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit className="w-5 h-5 text-amber-500" />
                  Edit Pengiriman: <span className="font-mono text-blue-600">{editingTripBatch.tripId}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Tujuan: <strong>{editingTripBatch.storeTujuan}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTripBatch(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Form Fields */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Tanggal Kirim */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 dark:text-slate-200">
                    Tanggal Kirim <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editTripTanggalKirim}
                    onChange={(e) => setEditTripTanggalKirim(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none font-bold"
                  />
                </div>

                {/* Driver / Kurir */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 dark:text-slate-200">
                    Dikirim Oleh (Driver / Kurir) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editTripDikirimOleh}
                    onChange={(e) => setEditTripDikirimOleh(e.target.value)}
                    placeholder="Nama Driver / Kurir"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none font-bold"
                  />
                </div>

                {/* Armada */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 dark:text-slate-200">Armada / Kendaraan</label>
                  <input
                    type="text"
                    value={editTripArmada}
                    onChange={(e) => setEditTripArmada(e.target.value)}
                    placeholder="Contoh: Mobil Box / Motor Kurir"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>

                {/* No Polisi */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 dark:text-slate-200">No. Polisi</label>
                  <input
                    type="text"
                    value={editTripNoPolisi}
                    onChange={(e) => setEditTripNoPolisi(e.target.value)}
                    placeholder="Contoh: B 1234 XYZ"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>
              </div>

              {/* Catatan Kirim */}
              <div className="space-y-1">
                <label className="font-bold text-slate-800 dark:text-slate-200">Catatan Pengiriman</label>
                <textarea
                  value={editTripCatatan}
                  onChange={(e) => setEditTripCatatan(e.target.value)}
                  placeholder="Catatan tambahan pengiriman..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none resize-none"
                />
              </div>

              {/* Checklist Barang dalam Pengiriman */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-indigo-500" />
                    Barang dalam Pengiriman ini:
                  </label>
                  <span className="text-[11px] text-amber-600 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/50">
                    Barang yang tidak dicentang otomatis balik ke Dispatched
                  </span>
                </div>

                <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3 max-h-60 overflow-y-auto">
                  {editingTripBatch.reports.map((rep) => {
                    const isChecked = editTripSelectedReportIds.includes(rep.id);

                    return (
                      <div
                        key={rep.id}
                        onClick={() => {
                          if (isChecked) {
                            setEditTripSelectedReportIds((prev) => prev.filter((id) => id !== rep.id));
                          } else {
                            setEditTripSelectedReportIds((prev) => [...prev, rep.id]);
                          }
                        }}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                          isChecked
                            ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-400'
                            : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 text-slate-400'
                        }`}
                      >
                        <div className="mt-0.5">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {rep.id}
                            </span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">
                              {rep.total_koli} Koli
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                            {rep.items.map((it) => `${it.deskripsi} (${it.qty} ${it.satuan})`).join(', ')}
                          </div>
                          {!isChecked && (
                            <div className="text-[10px] text-rose-600 font-bold mt-1">
                              ✕ Akan dikeluarkan dari SJ ini dan kembali ke antrean Dispatched
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTripBatch(null)}
                disabled={isSavingTripEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEditTrip}
                disabled={isSavingTripEdit}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {isSavingTripEdit ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: BATAL KIRIM SELURUH BATCH TRIP (SEMUA BALIK KE DISPATCHED)    */}
      {/* ==================================================================== */}
      {cancellingTripBatch && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Batalkan Surat Jalan Pengiriman
                </h3>
                <p className="text-xs font-mono text-slate-500">{cancellingTripBatch.tripId}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Batalkan pengiriman batch ini ke store <strong>{cancellingTripBatch.storeTujuan}</strong> ({cancellingTripBatch.totalKoli} Koli)?
            </p>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
              <div className="font-black flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Otomatis Kembali ke Dispatched
              </div>
              <p className="text-[11px] leading-relaxed">
                Seluruh barang ({cancellingTripBatch.reports.length} laporan, {cancellingTripBatch.totalKoli} koli) di dalam pengiriman ini otomatis akan kembali ke status <strong>Dispatched</strong> (siap untuk dikirim kembali kapan saja).
              </p>
            </div>

            <div className="space-y-1 text-xs">
              <label className="font-bold text-slate-800 dark:text-slate-200">
                Alasan Pembatalan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={tripCancelReason}
                onChange={(e) => setTripCancelReason(e.target.value)}
                placeholder="Contoh: Jadwal kirim ditunda / Driver berhalangan..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCancellingTripBatch(null)}
                disabled={isProcessingTripCancel}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmCancelTrip}
                disabled={isProcessingTripCancel}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isProcessingTripCancel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                <span>Konfirmasi Batal Kirim</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: INPUT MULTI-TOKO SEKALIGUS (MULTI-CHOICE BATCH GENERATOR)     */}
      {/* ==================================================================== */}
      {isMultiStoreModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl flex flex-col overflow-hidden my-4">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Input Cepat Multi-Toko Sekaligus
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pilih beberapa toko sekaligus untuk otomatis membuat baris pengiriman
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMultiStoreModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto max-h-[70vh]">
              {/* Multi-Store Dropdown */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-indigo-500" />
                  Pilih Toko Tujuan (Bisa Pilih Banyak) <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  multiple={true}
                  options={stores.map((s) => ({
                    value: s.nama,
                    label: s.nama,
                    secondaryLabel: (s as any).kode ? `Kode: ${(s as any).kode}` : undefined,
                  }))}
                  value={multiStoreSelected}
                  onChange={(val) => setMultiStoreSelected(val)}
                  placeholder="Pilih Toko-Toko Tujuan..."
                  searchPlaceholder="Ketik nama atau kode toko..."
                  size="md"
                />
                <div className="text-[11px] text-slate-400">
                  {multiStoreSelected.length > 0
                    ? `${multiStoreSelected.length} toko terpilih. Akan dibuat ${multiStoreSelected.length} baris barang.`
                    : 'Gunakan tombol "Pilih Semua" atau centang beberapa toko sekaligus.'}
                </div>
              </div>

              {/* Deskripsi Barang */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-800 dark:text-slate-200">
                  Deskripsi / Nama Barang <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={multiStoreDeskripsi}
                  onChange={(e) => setMultiStoreDeskripsi(e.target.value)}
                  placeholder="Contoh: Paket Brosur Marketing Q3 / Display Banner..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* No Surat Jalan */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">No. Surat Jalan</label>
                  <input
                    type="text"
                    value={multiStoreNoSJ}
                    onChange={(e) => setMultiStoreNoSJ(e.target.value)}
                    placeholder="Opsional..."
                    className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono outline-none"
                  />
                </div>

                {/* Qty per Toko */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Qty Tiap Toko</label>
                  <input
                    type="number"
                    min={1}
                    value={multiStoreQty}
                    onChange={(e) => setMultiStoreQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-center outline-none"
                  />
                </div>

                {/* Satuan */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Satuan</label>
                  <select
                    value={multiStoreSatuan}
                    onChange={(e) => setMultiStoreSatuan(e.target.value as any)}
                    className="w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold outline-none"
                  >
                    <option value="Koli">Koli</option>
                    <option value="Pcs">Pcs</option>
                  </select>
                </div>
              </div>

              {/* Keterangan */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Keterangan Tambahan</label>
                <input
                  type="text"
                  value={multiStoreKeterangan}
                  onChange={(e) => setMultiStoreKeterangan(e.target.value)}
                  placeholder="Catatan untuk serah terima / driver (opsional)..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">
                Total: <strong>{multiStoreSelected.length} baris</strong> akan dibuat
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMultiStoreModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleGenerateMultiStoreRows}
                  disabled={multiStoreSelected.length === 0 || !multiStoreDeskripsi.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambahkan {multiStoreSelected.length} Baris</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
