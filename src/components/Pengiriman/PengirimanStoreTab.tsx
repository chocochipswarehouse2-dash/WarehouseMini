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
  Check,
  Edit3,
  X,
  Undo2,
  Sparkles,
  Truck,
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
  parseTripPhotoUrls,
  getTodayDateString,
  getCurrentTimeString,
} from '../../services/pengirimanStore';
import { fetchOutlets, DEFAULT_OUTLETS, getFullStoreName } from '../../services/gasManualShipment';
import { uploadMultipleImagesToGdrive } from '../../services/gdriveUpload';
import { compressImage } from '../../utils/imageCompressor';
import { LoadingDockImageLightbox } from '../common/LoadingDockImageLightbox';
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
  tripPhotos: string[];
  itemPhotos: string[];
  allPhotos: string[];
  createdAt: string;
}

function isValidNoSj(noSj?: string): boolean {
  const val = String(noSj || '').trim();
  return Boolean(val && val !== '-' && val.toLowerCase() !== 'tidak ada no surat jalan');
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
      storeTujuan: 'Gaia Pontianak',
      noSuratJalan: '',
      deskripsi: '',
      qty: 1,
      satuan: 'Koli',
      fotoBarang: '',
    },
  ]);

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
  const [editTripPhotos, setEditTripPhotos] = useState<string[]>([]);
  const [isCompressingEditTripPhotos, setIsCompressingEditTripPhotos] = useState<boolean>(false);
  const editTripPhotoInputRef = useRef<HTMLInputElement | null>(null);
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
  const [editItemCompressingIdx, setEditItemCompressingIdx] = useState<number | null>(null);
  const [isSavingEditDispatched, setIsSavingEditDispatched] = useState<boolean>(false);

  // Multi-Store Fast Batch Generator State (Form Input)
  const [isMultiStoreModalOpen, setIsMultiStoreModalOpen] = useState<boolean>(false);
  const [multiStoreSelected, setMultiStoreSelected] = useState<string[]>([]);
  const [multiStoreDeskripsi, setMultiStoreDeskripsi] = useState<string>('');
  const [multiStoreNoSJ, setMultiStoreNoSJ] = useState<string>('');
  const [multiStoreQty, setMultiStoreQty] = useState<number>(1);
  const [multiStoreSatuan, setMultiStoreSatuan] = useState<SatuanPengirimanStore>('Koli');

  // --------------------------------------------------------------------------
  // 3. TAB KIRIM (SETUP PENGIRIMAN) STATE
  // --------------------------------------------------------------------------
  const [selectedStoreKirim, setSelectedStoreKirim] = useState<string>('');
  const [selectedReportIdsForKirim, setSelectedReportIdsForKirim] = useState<string[]>([]);
  const [tanggalKirim, setTanggalKirim] = useState<string>(getTodayDateString());
  const [dikirimOleh, setDikirimOleh] = useState<string>(session?.name || '');
  const [catatanKirim, setCatatanKirim] = useState<string>('');
  const [kirimOverallPhotos, setKirimOverallPhotos] = useState<string[]>([]);
  const [isCompressingKirimPhotos, setIsCompressingKirimPhotos] = useState<boolean>(false);
  const kirimPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const pendingManualKirimSelectionRef = useRef<string[] | null>(null);
  const [isProcessingKirim, setIsProcessingKirim] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // 4. TAB HISTORI PENGIRIMAN STATE
  // --------------------------------------------------------------------------
  const [searchHistori, setSearchHistori] = useState<string>('');
  const [filterStoreHistori, setFilterStoreHistori] = useState<string[]>([]);
  const [filterStatusHistori, setFilterStatusHistori] = useState<'all' | 'active' | 'cancelled'>('all');
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

  useEffect(() => {
    const handleReset = () => {
      loadReportsList();
    };
    window.addEventListener('wms_loading_dock_data_reset', handleReset);
    return () => window.removeEventListener('wms_loading_dock_data_reset', handleReset);
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
    if (!selectedStoreKirim) {
      setSelectedReportIdsForKirim([]);
      pendingManualKirimSelectionRef.current = null;
      return;
    }

    const idsForThisStore = dispatchedReports
      .filter((r) => isSameStore(r.store_tujuan, selectedStoreKirim))
      .map((r) => r.id);
    const validIdSet = new Set(idsForThisStore);

    if (pendingManualKirimSelectionRef.current) {
      const manualValid = pendingManualKirimSelectionRef.current.filter((id) => validIdSet.has(id));
      pendingManualKirimSelectionRef.current = null;
      setSelectedReportIdsForKirim(manualValid.length > 0 ? manualValid : idsForThisStore);
    } else {
      setSelectedReportIdsForKirim(idsForThisStore);
    }
  }, [selectedStoreKirim, dispatchedReports]);

  // --------------------------------------------------------------------------
  // FORM LAPORAN HANDLERS
  // --------------------------------------------------------------------------
  const handleAddRow = () => {
    const lastRow = itemRows[itemRows.length - 1];
    const defaultStore = lastRow?.storeTujuan || stores[0]?.nama || 'Gaia Pontianak';
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
        fotoBarang: '',
      },
    ]);
  };

  const handleGenerateMultiStoreRows = () => {
    if (multiStoreSelected.length === 0) {
      onShowToast('Pilih minimal 1 store tujuan terlebih dahulu', 'warning');
      return;
    }
    if (!multiStoreDeskripsi.trim()) {
      onShowToast('Nama / keterangan barang wajib diisi', 'warning');
      return;
    }

    const newRows: ItemInputRow[] = multiStoreSelected.map((st, idx) => ({
      tempId: `multi-${Date.now()}-${idx}-${Math.random()}`,
      storeTujuan: st,
      noSuratJalan: multiStoreNoSJ.trim(),
      deskripsi: multiStoreDeskripsi.trim(),
      qty: Math.max(1, multiStoreQty),
      satuan: multiStoreSatuan,
      fotoBarang: '',
    }));

    // Jika baris pertama masih kosong default, replace atau gabungkan
    setItemRows((prev) => {
      const isFirstEmpty =
        prev.length === 1 && !prev[0].deskripsi && !prev[0].noSuratJalan && !prev[0].fotoBarang;
      return isFirstEmpty ? newRows : [...prev, ...newRows];
    });

    onShowToast(`Berhasil menambahkan ${newRows.length} baris untuk toko terpilih`, 'success');
    setIsMultiStoreModalOpen(false);
    setMultiStoreSelected([]);
    setMultiStoreDeskripsi('');
    setMultiStoreNoSJ('');
    setMultiStoreQty(1);
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

  // Handler Foto Per Barang (Form Input)
  const handleItemPhotoUpload = async (index: number, file: File) => {
    if (!file) return;
    handleUpdateRow(index, 'isCompressingPhoto', true);
    try {
      const result = await compressImage(file, 1200, 0.75);
      handleUpdateRow(index, 'fotoBarang', result.dataUrl);
      onShowToast(`Foto barang #${index + 1} berhasil ditambahkan`, 'success');
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

  // Handler Foto Dokumentasi Pengiriman Keseluruhan (Tab Kirim)
  const handleKirimOverallPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (kirimOverallPhotos.length + files.length > 8) {
      onShowToast('Maksimal 8 foto dokumentasi pengiriman keseluruhan', 'warning');
      return;
    }

    setIsCompressingKirimPhotos(true);
    try {
      const newCompressedPhotos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const result = await compressImage(files[i], 1200, 0.75);
        newCompressedPhotos.push(result.dataUrl);
      }
      setKirimOverallPhotos((prev) => [...prev, ...newCompressedPhotos]);
      onShowToast(`${newCompressedPhotos.length} foto dokumentasi pengiriman ditambahkan`, 'success');
    } catch (err: any) {
      console.error('Compress kirim overall photos failed:', err);
      onShowToast('Gagal memproses foto dokumentasi: ' + (err.message || ''), 'error');
    } finally {
      setIsCompressingKirimPhotos(false);
      if (kirimPhotoInputRef.current) {
        kirimPhotoInputRef.current.value = '';
      }
    }
  };

  const handleRemoveKirimOverallPhoto = (photoIdx: number) => {
    setKirimOverallPhotos((prev) => prev.filter((_, idx) => idx !== photoIdx));
  };

  // Handler Foto Dokumentasi Pengiriman Keseluruhan (Modal Edit Trip Histori)
  const handleEditTripPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (editTripPhotos.length + files.length > 8) {
      onShowToast('Maksimal 8 foto dokumentasi pengiriman keseluruhan', 'warning');
      return;
    }

    setIsCompressingEditTripPhotos(true);
    try {
      const compressed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const res = await compressImage(files[i], 1200, 0.75);
        compressed.push(res.dataUrl);
      }
      setEditTripPhotos((prev) => [...prev, ...compressed]);
      onShowToast(`${compressed.length} foto dokumentasi ditambahkan`, 'success');
    } catch (err: any) {
      console.error('Compress edit trip photos failed:', err);
      onShowToast('Gagal memproses foto: ' + (err.message || ''), 'error');
    } finally {
      setIsCompressingEditTripPhotos(false);
      if (editTripPhotoInputRef.current) {
        editTripPhotoInputRef.current.value = '';
      }
    }
  };

  const handleRemoveEditTripPhoto = (photoIdx: number) => {
    setEditTripPhotos((prev) => prev.filter((_, idx) => idx !== photoIdx));
  };

  const formCalculatedKoli = useMemo(() => {
    return itemRows.reduce((acc, row) => {
      const q = Math.max(1, Number(row.qty) || 1);
      return acc + (row.satuan === 'Pcs' ? 1 : q);
    }, 0);
  }, [itemRows]);

  const uniqueInputStoreCount = useMemo(() => {
    return new Set(
      itemRows
        .map((r) => (r.isCustomStore ? r.customStoreInput?.trim() : r.storeTujuan)?.trim())
        .filter(Boolean)
    ).size;
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
        onShowToast(`Baris #${i + 1}: Nama / keterangan barang tidak boleh kosong`, 'warning');
        return;
      }
    }

    setIsSubmittingReport(true);
    try {
      // Upload foto per barang ke Google Drive jika ada
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

      const payloadItems = itemRows.map((r, idx) => ({
        store_tujuan: r.isCustomStore ? r.customStoreInput?.trim() || 'Store' : r.storeTujuan,
        no_surat_jalan: r.noSuratJalan.trim() || 'Tidak ada no surat jalan',
        deskripsi: r.deskripsi.trim(),
        qty: r.qty,
        satuan: r.satuan,
        keterangan: '',
        foto_barang: uploadedRowPhotos[idx] || r.fotoBarang || '',
      }));

      const res = await savePengirimanStoreBatch({
        items: payloadItems,
        pic_nama: session?.name || 'Petugas Gudang',
        pic_username: session?.username || 'operator',
        foto_urls: [],
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
            storeTujuan: stores[0]?.nama || 'Gaia Pontianak',
            noSuratJalan: '',
            deskripsi: '',
            qty: 1,
            satuan: 'Koli',
            fotoBarang: '',
          },
        ]);

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
  const totalAllDispatchedKoli = useMemo(() => {
    return dispatchedReports.reduce((acc, r) => acc + (r.total_koli || 1), 0);
  }, [dispatchedReports]);

  const filteredDispatched = useMemo(() => {
    const q = searchDispatched.trim().toLowerCase();
    return dispatchedReports.filter((r) => {
      const matchSearch =
        q === '' ||
        r.store_tujuan.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.items.some(
          (it) =>
            it.deskripsi.toLowerCase().includes(q) ||
            (it.no_surat_jalan && it.no_surat_jalan.toLowerCase().includes(q)) ||
            (it.keterangan && it.keterangan.toLowerCase().includes(q))
        );

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
    const targetIds = [report.id];
    pendingManualKirimSelectionRef.current =
      report.store_tujuan !== selectedStoreKirim ? targetIds : null;
    setSelectedStoreKirim(report.store_tujuan);
    setSelectedReportIdsForKirim(targetIds);
    setActiveSubTab('kirim');
  };

  const handleSendSelectedBulkFromDispatched = (reportsToShip: PengirimanStoreReport[]) => {
    if (reportsToShip.length === 0) {
      onShowToast('Pilih minimal 1 laporan untuk dikirim', 'warning');
      return;
    }
    const storeNames = Array.from(new Set(reportsToShip.map((r) => r.store_tujuan)));
    const targetStore = storeNames[0];
    const targetIds =
      storeNames.length > 1
        ? reportsToShip.filter((r) => r.store_tujuan === targetStore).map((r) => r.id)
        : reportsToShip.map((r) => r.id);

    if (storeNames.length > 1) {
      onShowToast(
        `Membuka proses kirim untuk store: ${targetStore} (${targetIds.length} laporan terpilih)`,
        'info'
      );
    }

    pendingManualKirimSelectionRef.current =
      targetStore !== selectedStoreKirim ? targetIds : null;
    setSelectedStoreKirim(targetStore);
    setSelectedReportIdsForKirim(targetIds);
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

  const handleEditItemPhotoUpload = async (idx: number, file: File) => {
    if (!file) return;
    setEditItemCompressingIdx(idx);
    try {
      const result = await compressImage(file, 1200, 0.75);
      handleUpdateEditItem(idx, 'foto_barang', result.dataUrl);
      onShowToast(`Foto barang #${idx + 1} diperbarui`, 'success');
    } catch (err: any) {
      console.error('Compress edit item photo failed:', err);
      onShowToast('Gagal memproses foto barang: ' + (err.message || ''), 'error');
    } finally {
      setEditItemCompressingIdx(null);
    }
  };

  const handleRemoveEditItemPhoto = (idx: number) => {
    handleUpdateEditItem(idx, 'foto_barang', '');
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
        onShowToast(`Baris #${i + 1}: Nama / keterangan barang tidak boleh kosong`, 'warning');
        return;
      }
    }

    setIsSavingEditDispatched(true);
    try {
      let itemsWithUploadedPhotos = [...editItems];
      const newPhotoRows = editItems
        .map((it, idx) => ({ idx, foto: it.foto_barang }))
        .filter((r): r is { idx: number; foto: string } => Boolean(r.foto && r.foto.startsWith('data:image/')));

      if (newPhotoRows.length > 0) {
        onShowToast(`Mengunggah ${newPhotoRows.length} foto barang ke Google Drive...`, 'info');
        const uploadedUrls = await uploadMultipleImagesToGdrive(
          newPhotoRows.map((r) => r.foto),
          'WMS_Barang_Store'
        );
        uploadedUrls.forEach((url, i) => {
          if (url) {
            const targetIdx = newPhotoRows[i].idx;
            itemsWithUploadedPhotos[targetIdx] = {
              ...itemsWithUploadedPhotos[targetIdx],
              foto_barang: url,
            };
          }
        });
      }

      const previousItemPhotos = new Set(
        (editingDispatchedReport.items || []).map((it) => it.foto_barang).filter(Boolean) as string[]
      );
      const preservedExtraPhotos = (editingDispatchedReport.foto_urls || []).filter(
        (u) => u && !previousItemPhotos.has(u)
      );
      const nextItemPhotos = itemsWithUploadedPhotos
        .map((it) => it.foto_barang)
        .filter((u): u is string => Boolean(u));
      const nextReportPhotos = Array.from(new Set([...preservedExtraPhotos, ...nextItemPhotos]));

      const res = await editPengirimanStoreReportFull(
        editingDispatchedReport.id,
        {
          store_tujuan: editStoreTujuan.trim(),
          items: itemsWithUploadedPhotos,
          foto_urls: nextReportPhotos,
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
      // Upload foto dokumentasi pengiriman keseluruhan ke Google Drive jika ada
      let finalTripPhotoUrls: string[] = [];
      const dataUrls = kirimOverallPhotos.filter((p) => p.startsWith('data:image/'));
      const existingUrls = kirimOverallPhotos.filter((p) => !p.startsWith('data:image/'));

      if (dataUrls.length > 0) {
        onShowToast(`Mengunggah ${dataUrls.length} foto dokumentasi pengiriman ke Google Drive...`, 'info');
        const uploadedRes = await uploadMultipleImagesToGdrive(dataUrls, 'WMS_Kirim_Store');
        finalTripPhotoUrls = Array.from(
          new Set([...existingUrls, ...uploadedRes.filter((u) => Boolean(u))])
        );
      } else {
        finalTripPhotoUrls = Array.from(new Set(existingUrls));
      }

      const currentWaktu = getCurrentTimeString();
      const res = await processKirimStoreReports({
        report_ids: selectedReportIdsForKirim,
        tanggal_kirim: tanggalKirim,
        waktu_kirim: currentWaktu,
        dikirim_oleh: finalDikirimOleh,
        catatan: catatanKirim.trim(),
        foto_urls: finalTripPhotoUrls,
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
          waktu_kirim: currentWaktu,
          dikirim_oleh: finalDikirimOleh,
          catatan_kirim: catatanKirim.trim(),
          trip_id: res.trip?.id,
        }));

        // Update state lokal langsung agar status produk & histori trip berubah instan!
        setReports((prev) =>
          prev.map((r) => {
            if (shippedReportIds.includes(r.id)) {
              return {
                ...r,
                status: 'sent' as const,
                tanggal_kirim: tanggalKirim,
                waktu_kirim: currentWaktu,
                dikirim_oleh: finalDikirimOleh,
                catatan_kirim: catatanKirim.trim(),
                trip_id: res.trip?.id,
                updated_at: new Date().toISOString(),
              };
            }
            return r;
          })
        );

        if (res.trip) {
          setTrips((prev) => [res.trip!, ...prev.filter((t) => t.id !== res.trip!.id)]);
        }

        // Reset kirim form
        setSelectedReportIdsForKirim([]);
        setCatatanKirim('');
        setKirimOverallPhotos([]);

        // 1. Berpindah tab ke Histori Kirim & scroll ke atas
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
    setEditTripPhotos(batch.tripPhotos || []);
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
      let finalTripPhotos: string[] = [];
      const dataUrls = editTripPhotos.filter((p) => p.startsWith('data:image/'));
      const existingUrls = editTripPhotos.filter((p) => !p.startsWith('data:image/'));
      if (dataUrls.length > 0) {
        onShowToast(`Mengunggah ${dataUrls.length} foto dokumentasi pengiriman...`, 'info');
        const uploaded = await uploadMultipleImagesToGdrive(dataUrls, 'WMS_Kirim_Store');
        finalTripPhotos = Array.from(
          new Set([...existingUrls, ...uploaded.filter((u) => Boolean(u))])
        );
      } else {
        finalTripPhotos = Array.from(new Set(existingUrls));
      }

      const res = await editSuratJalanPengirimanTrip(
        editingTripBatch.tripId,
        {
          tanggal_kirim: editTripTanggalKirim,
          dikirim_oleh: editTripDikirimOleh.trim(),
          armada: editTripArmada.trim(),
          no_polisi: editTripNoPolisi.trim(),
          catatan: editTripCatatan.trim(),
          foto_urls: finalTripPhotos,
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

      const tripPhotoSet = new Set<string>(
        parseTripPhotoUrls(t.foto_urls?.length ? t.foto_urls : t.foto_bukti_surat_jalan)
      );
      const itemPhotoSet = new Set<string>();
      memberReports.forEach((r) => {
        (r.items || []).forEach((it) => {
          if (it.foto_barang) itemPhotoSet.add(it.foto_barang);
        });
        (r.foto_urls || []).forEach((u) => {
          if (u && !tripPhotoSet.has(u)) itemPhotoSet.add(u);
        });
      });

      const tripPhotos = Array.from(tripPhotoSet);
      const itemPhotos = Array.from(itemPhotoSet);
      const allPhotos = Array.from(new Set([...tripPhotos, ...itemPhotos]));

      batchesMap.set(t.id, {
        tripId: t.id,
        storeTujuan: storeNames,
        tanggalKirim: t.tanggal_kirim || '',
        waktuKirim: t.waktu_kirim || '',
        dikirimOleh: t.dikirim_oleh || '-',
        armada: t.armada || '',
        noPolisi: t.no_polisi || '',
        catatanKirim: t.catatan || '',
        status: t.status === 'cancelled' ? 'cancelled' : 'active',
        reports: memberReports,
        totalKoli,
        totalItemCount: totalItems,
        tripPhotos,
        itemPhotos,
        allPhotos,
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
          (r.items || []).forEach((it) => {
            if (it.foto_barang && !cur.itemPhotos.includes(it.foto_barang)) {
              cur.itemPhotos.push(it.foto_barang);
            }
            if (it.foto_barang && !cur.allPhotos.includes(it.foto_barang)) {
              cur.allPhotos.push(it.foto_barang);
            }
          });
          (r.foto_urls || []).forEach((u) => {
            if (u && !cur.tripPhotos.includes(u) && !cur.itemPhotos.includes(u)) {
              cur.itemPhotos.push(u);
            }
            if (u && !cur.allPhotos.includes(u)) {
              cur.allPhotos.push(u);
            }
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
            (r.items || []).forEach((it) => {
              if (it.foto_barang && !cur.itemPhotos.includes(it.foto_barang)) {
                cur.itemPhotos.push(it.foto_barang);
              }
              if (it.foto_barang && !cur.allPhotos.includes(it.foto_barang)) {
                cur.allPhotos.push(it.foto_barang);
              }
            });
            (r.foto_urls || []).forEach((u) => {
              if (u && !cur.tripPhotos.includes(u) && !cur.itemPhotos.includes(u)) {
                cur.itemPhotos.push(u);
              }
              if (u && !cur.allPhotos.includes(u)) {
                cur.allPhotos.push(u);
              }
            });
          }
        } else {
          const itemPhotoSet = new Set<string>();
          (r.items || []).forEach((it) => {
            if (it.foto_barang) itemPhotoSet.add(it.foto_barang);
          });
          (r.foto_urls || []).forEach((u) => {
            if (u) itemPhotoSet.add(u);
          });
          const itemPhotos = Array.from(itemPhotoSet);

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
            tripPhotos: [],
            itemPhotos,
            allPhotos: itemPhotos,
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
    const q = searchHistori.trim().toLowerCase();
    return historiBatches.filter((b) => {
      const matchSearch =
        q === '' ||
        b.tripId.toLowerCase().includes(q) ||
        b.storeTujuan.toLowerCase().includes(q) ||
        b.dikirimOleh.toLowerCase().includes(q) ||
        b.catatanKirim.toLowerCase().includes(q) ||
        b.reports.some(
          (r) =>
            r.id.toLowerCase().includes(q) ||
            r.items.some(
              (it) =>
                (it.deskripsi && it.deskripsi.toLowerCase().includes(q)) ||
                (it.keterangan && it.keterangan.toLowerCase().includes(q)) ||
                (it.no_surat_jalan && it.no_surat_jalan.toLowerCase().includes(q))
            )
        );

      const matchStore =
        !filterStoreHistori ||
        filterStoreHistori.length === 0 ||
        (Array.isArray(filterStoreHistori)
          ? filterStoreHistori.some((fs) => isSameStore(b.storeTujuan, fs))
          : isSameStore(b.storeTujuan, filterStoreHistori));

      const matchStatus =
        filterStatusHistori === 'all' ||
        (filterStatusHistori === 'active' && b.status !== 'cancelled') ||
        (filterStatusHistori === 'cancelled' && b.status === 'cancelled');

      return matchSearch && matchStore && matchStatus;
    });
  }, [historiBatches, searchHistori, filterStoreHistori, filterStatusHistori]);

  const totalKoliHistori = useMemo(() => {
    return filteredHistoriBatches.reduce((acc, b) => acc + (b.totalKoli || 0), 0);
  }, [filteredHistoriBatches]);

  return (
    <div className="space-y-4">
      {/* ==================================================================== */}
      {/* NAVIGATION TABS: 1. Input | 2. Dispatched | 3. Kirim | 4. Histori    */}
      {/* ==================================================================== */}
      <div className="flex items-center justify-between gap-2 bg-white dark:bg-[#131d31] p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
          {/* 1. Input Barang */}
          <button
            type="button"
            onClick={() => setActiveSubTab('laporan')}
            className={`shrink-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'laporan'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>1. Input Barang</span>
          </button>

          {/* 2. Antrean Dispatched */}
          <button
            type="button"
            onClick={() => setActiveSubTab('dispatched')}
            className={`shrink-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'dispatched'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <Box className="w-3.5 h-3.5 shrink-0" />
            <span>2. Dispatched</span>
            {dispatchedReports.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                  activeSubTab === 'dispatched'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                }`}
              >
                {dispatchedReports.length}
              </span>
            )}
          </button>

          {/* 3. Proses Kirim */}
          <button
            type="button"
            onClick={() => setActiveSubTab('kirim')}
            className={`shrink-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'kirim'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <Send className="w-3.5 h-3.5 shrink-0" />
            <span>3. Proses Kirim</span>
            {dispatchedStoresList.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                  activeSubTab === 'kirim'
                    ? 'bg-white/20 text-white'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                }`}
              >
                {dispatchedStoresList.length} Toko
              </span>
            )}
          </button>

          {/* 4. Histori Kirim */}
          <button
            type="button"
            onClick={() => setActiveSubTab('histori')}
            className={`shrink-0 whitespace-nowrap py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'histori'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>4. Histori Kirim</span>
            {historiBatches.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                  activeSubTab === 'histori'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                }`}
              >
                {historiBatches.length}
              </span>
            )}
          </button>
        </div>

        {/* Refresh button (Neutral Outline) */}
        <button
          type="button"
          onClick={loadReportsList}
          disabled={loadingReports}
          className="px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
          title="Segarkan Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Segarkan</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. SUB-TAB: FORM INPUT BARANG                                        */}
      {/* ==================================================================== */}
      {activeSubTab === 'laporan' && (
        <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 space-y-4">
          {/* Header */}
          <div className="border-b border-slate-200/80 dark:border-slate-800 pb-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Input Barang ke Antrean Dispatched</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Catat barang per toko. Foto cukup per barang — dokumentasi muatan keseluruhan dilakukan saat proses Kirim.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/70 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
              <Box className="w-3.5 h-3.5 shrink-0" />
              <span>
                {itemRows.length} Baris · {uniqueInputStoreCount} Toko · {formCalculatedKoli} Koli
              </span>
            </div>
          </div>

          {/* Section Toolbar */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>Daftar Barang ({itemRows.length})</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMultiStoreModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                  title="Tambah 1 jenis barang ke beberapa toko sekaligus"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Multi Toko</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddRow}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Baris</span>
                </button>
              </div>
            </div>

            {/* Item Rows */}
            <div className="space-y-2.5">
              {itemRows.map((row, index) => {
                const rowQty = Math.max(1, Number(row.qty) || 1);
                const rowKoli = row.satuan === 'Pcs' ? 1 : rowQty;

                return (
                  <div
                    key={row.tempId}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    {/* Compact Row Header */}
                    <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200/70 dark:border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Barang #{index + 1}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {rowKoli} Koli
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(index)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Duplikasi Baris"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(index)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-30"
                          title="Hapus Baris"
                          disabled={itemRows.length <= 1}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Unified 1-Row Desktop / Stacked Mobile Form Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
                      {/* Store Tujuan */}
                      <div className="sm:col-span-2 lg:col-span-3 space-y-1 min-w-0">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <Store className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>Store Tujuan</span>
                          <span className="text-rose-500">*</span>
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
                          placeholder="Pilih Store..."
                          searchPlaceholder="Ketik nama / kode toko..."
                          allowCustom={true}
                          size="sm"
                        />
                      </div>

                      {/* No. Surat Jalan */}
                      <div className="lg:col-span-2 space-y-1 min-w-0">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>No. Surat Jalan</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Opsional, mis: TO.OMP..."
                          value={row.noSuratJalan}
                          onChange={(e) => handleUpdateRow(index, 'noSuratJalan', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                        />
                      </div>

                      {/* Nama / Keterangan Barang (Merged Field) */}
                      <div className="sm:col-span-2 lg:col-span-3 space-y-1 min-w-0">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <span>Nama / Keterangan Barang</span>
                          <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Mis: BIS, Koli Refill, Brosur..."
                          value={row.deskripsi}
                          onChange={(e) => handleUpdateRow(index, 'deskripsi', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                        />
                      </div>

                      {/* Qty & Satuan Joined */}
                      <div className="lg:col-span-2 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                          Qty &amp; Satuan <span className="text-rose-500">*</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            value={row.qty}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Math.max(1, Number(e.target.value));
                              handleUpdateRow(index, 'qty', val);
                            }}
                            className="flex-1 min-w-0 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                          />
                          <select
                            value={row.satuan}
                            onChange={(e) => handleUpdateRow(index, 'satuan', e.target.value as SatuanPengirimanStore)}
                            className="w-20 shrink-0 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                          >
                            <option value="Koli">Koli</option>
                            <option value="Pcs">Pcs</option>
                          </select>
                        </div>
                      </div>

                      {/* Foto Per Barang (Compact Inline Control) */}
                      <div className="lg:col-span-2 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                          Foto Barang
                        </label>
                        {row.fotoBarang ? (
                          <div className="h-[34px] flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewPhotoUrl(row.fotoBarang || null);
                                setPreviewPhotoTitle(`Foto Barang: ${row.deskripsi || 'Barang #' + (index + 1)}`);
                              }}
                              className="w-6 h-6 rounded overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 cursor-pointer"
                              title="Lihat Foto"
                            >
                              <img
                                src={row.fotoBarang}
                                alt="Foto Barang"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewPhotoUrl(row.fotoBarang || null);
                                setPreviewPhotoTitle(`Foto Barang: ${row.deskripsi || 'Barang #' + (index + 1)}`);
                              }}
                              className="flex-1 text-left text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline truncate cursor-pointer"
                            >
                              Lihat
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItemPhoto(index)}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                              title="Hapus Foto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="w-full h-[34px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer transition-colors">
                            {row.isCompressingPhoto ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span className="truncate">Proses...</span>
                              </>
                            ) : (
                              <>
                                <Camera className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">Upload / Kamera</span>
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
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddRow}
              className="w-full py-2.5 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Baris Barang</span>
            </button>
          </div>

          {/* Footer Bar (Anti-Pelangi: 1 neutral outline + 1 solid primary) */}
          <div className="pt-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
              Foto barang otomatis dikompresi &amp; tersimpan ke Google Drive. Barang masuk antrean{' '}
              <strong className="text-amber-600 dark:text-amber-400">Dispatched</strong> dan masih bisa ditambah sebelum dikirim.
            </p>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={() => handleSubmitReport(false)}
                disabled={isSubmittingReport}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Simpan ke Dispatched</span>
              </button>

              <button
                type="button"
                onClick={() => handleSubmitReport(true)}
                disabled={isSubmittingReport}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingReport ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <QrCode className="w-3.5 h-3.5" />
                )}
                <span>Submit &amp; Cetak Label Koli</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. SUB-TAB: ANTREAN DISPATCHED (SIAP KIRIM)                          */}
      {/* ==================================================================== */}
      {activeSubTab === 'dispatched' && (
        <div className="space-y-3">
          {/* Quick Store Queue Strip */}
          {dispatchedStoresList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setFilterStoreDispatched([])}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                  filterStoreDispatched.length === 0
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Semua Toko ({dispatchedReports.length} · {totalAllDispatchedKoli} Koli)
              </button>
              {dispatchedStoresList.map((ds) => {
                const isOnlySelected =
                  filterStoreDispatched.length === 1 && isSameStore(filterStoreDispatched[0], ds.storeName);
                return (
                  <button
                    key={ds.storeName}
                    type="button"
                    onClick={() => setFilterStoreDispatched(isOnlySelected ? [] : [ds.storeName])}
                    className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                      isOnlySelected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {ds.storeName} · {ds.koli} Koli ({ds.count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Filter & Batch Toolbar */}
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <div className="relative flex-1 min-w-[190px] max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari toko, barang, No. SJ, ID..."
                  value={searchDispatched}
                  onChange={(e) => setSearchDispatched(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="w-full sm:w-auto min-w-[200px]">
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
                  placeholder="Filter Store"
                  searchPlaceholder="Cari toko..."
                  size="sm"
                  icon={<Store className="w-3.5 h-3.5" />}
                />
              </div>

              <div className="w-full sm:w-auto min-w-[170px]">
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
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer"
              >
                {selectedDispatchedIds.length === filteredDispatched.length && filteredDispatched.length > 0 ? (
                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Pilih Semua ({filteredDispatched.length})</span>
              </button>

              {selectedDispatchedIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(selectedDispatchedObjects)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    Cetak Label ({selectedDispatchedIds.length} · {totalKoliSelectedDispatched} Koli)
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(filteredDispatched)}
                  disabled={filteredDispatched.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Cetak barcode koli untuk seluruh hasil filter"
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Cetak Semua Label ({totalKoliFilteredDispatched} Koli)</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Store Filter Banner (Fixed: check length > 0) */}
          {filterStoreDispatched.length > 0 && filteredDispatched.length > 0 && (
            <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 rounded-2xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Store className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase truncate">
                    {filterStoreDispatched.join(', ')}
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    {filteredDispatched.length} laporan · {totalKoliFilteredDispatched} Koli siap dikirim
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(filteredDispatched)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Cetak Label</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendSelectedBulkFromDispatched(filteredDispatched)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Proses Kirim ({totalKoliFilteredDispatched} Koli)</span>
                </button>
              </div>
            </div>
          )}

          {filteredDispatched.length === 0 ? (
            <div className="bg-white dark:bg-[#131d31] p-8 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2.5">
              <Box className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Tidak ada antrean Dispatched
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gunakan tab <strong>1. Input Barang</strong> untuk menambahkan barang yang siap dikirim ke store.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredDispatched.map((rep) => {
                const isChecked = selectedDispatchedIds.includes(rep.id);
                const itemPhotoSet = new Set(
                  (rep.items || []).map((it) => it.foto_barang).filter(Boolean) as string[]
                );
                const extraPhotos = (rep.foto_urls || []).filter(
                  (u) => Boolean(u) && !itemPhotoSet.has(u)
                );

                return (
                  <div
                    key={rep.id}
                    className={`bg-white dark:bg-[#131d31] rounded-2xl border transition-all p-3.5 flex flex-col justify-between gap-3 ${
                      isChecked
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 shadow-2xs'
                    }`}
                  >
                    <div className="space-y-2.5">
                      {/* Card Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectDispatched(rep.id)}
                            className="mt-0.5 text-slate-400 hover:text-indigo-600 cursor-pointer shrink-0"
                            aria-label="Pilih laporan"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>

                          <div className="min-w-0">
                            <h4
                              className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase truncate"
                              title={rep.store_tujuan}
                            >
                              {rep.store_tujuan}
                            </h4>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              <span className="font-mono">{rep.id}</span>
                              {rep.tanggal_laporan && <span>· {rep.tanggal_laporan}</span>}
                              {rep.pic_nama && <span>· {rep.pic_nama}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {rep.total_koli} Koli
                          </span>
                          {rep.is_label_printed ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700"
                              title={`Label dicetak: ${rep.label_printed_at || 'Sudah'}`}
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                              Label Siap
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                              <Printer className="w-2.5 h-2.5 shrink-0" />
                              Belum Cetak
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Rincian Barang */}
                      <div className="bg-slate-50/90 dark:bg-slate-800/50 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-700/70">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                          Daftar Barang ({rep.items.length} item)
                        </div>
                        <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60 text-xs">
                          {rep.items.map((it, itIdx) => (
                            <div key={it.id || itIdx} className="py-1.5 first:pt-0.5 last:pb-0.5 flex justify-between items-start gap-2">
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="font-semibold text-slate-800 dark:text-slate-100 leading-snug break-words">
                                  {it.deskripsi}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {isValidNoSj(it.no_surat_jalan) && (
                                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400">
                                      {it.no_surat_jalan}
                                    </span>
                                  )}
                                  {it.foto_barang && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewPhotoUrl(it.foto_barang || null);
                                        setPreviewPhotoTitle(`Foto Barang: ${it.deskripsi}`);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold hover:bg-indigo-100 cursor-pointer"
                                      title="Lihat Foto Barang"
                                    >
                                      <Camera className="w-2.5 h-2.5" />
                                      <span>Foto</span>
                                    </button>
                                  )}
                                </div>
                                {it.keterangan && (
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 italic leading-snug">
                                    {it.keterangan}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 text-right font-bold text-slate-800 dark:text-slate-100">
                                <span>{it.qty} {it.satuan}</span>
                                {it.satuan === 'Pcs' && (
                                  <span className="block text-[10px] font-medium text-slate-400">
                                    ({it.hitung_koli} Koli)
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Foto Tambahan Laporan (hanya tampil jika ada foto non-item legacy) */}
                      {extraPhotos.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                            Lampiran ({extraPhotos.length}):
                          </span>
                          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                            {extraPhotos.map((photoUrl, pIdx) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewPhotoUrl(photoUrl);
                                  setPreviewPhotoTitle(`Lampiran ${rep.store_tujuan} #${pIdx + 1}`);
                                }}
                                className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 bg-slate-100"
                                title="Klik untuk memperbesar"
                              >
                                <img
                                  src={photoUrl}
                                  alt="Lampiran"
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Footer Actions (Anti-Pelangi) */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditDispatched(rep)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1 cursor-pointer"
                          title="Edit rincian barang atau toko tujuan"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteReport(rep)}
                          className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
                          title="Batalkan laporan dari antrean"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePrintLabelsForReport(rep)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>{rep.is_label_printed ? 'Cetak Ulang' : 'Label'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSendSelectedFromDispatched(rep)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <span>Kirim</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating Sticky Action Bar saat ada Laporan Dispatched Terpilih */}
          {selectedDispatchedIds.length > 0 && (
            <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-2xl bg-slate-900/95 dark:bg-slate-950/95 text-white backdrop-blur-md px-3.5 py-2.5 rounded-2xl border border-slate-700 shadow-2xl flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">
                    {selectedDispatchedIds.length} Laporan · {totalKoliSelectedDispatched} Koli
                  </div>
                  <div className="text-[11px] text-slate-400 truncate max-w-[180px] sm:max-w-[280px]">
                    {selectedDispatchedStoreNames.join(', ')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintBulkLabels(selectedDispatchedObjects)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Label</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendSelectedBulkFromDispatched(selectedDispatchedObjects)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Proses Kirim</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDispatchedIds([])}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
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
      {/* 3. SUB-TAB: PROSES KIRIM (SETUP PENGIRIMAN & DOKUMENTASI MUATAN)      */}
      {/* ==================================================================== */}
      {activeSubTab === 'kirim' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* KOLOM KIRI: LANGKAH 1 - PILIH TOKO & BARANG DIKIRIM */}
          <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 space-y-4">
            {/* Header & Toko Selector */}
            <div className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <Send className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>1. Pilih Toko &amp; Barang yang Dikirim</span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pilih toko tujuan lalu centang antrean barang yang diberangkatkan dalam Surat Jalan Pengiriman ini.
                </p>
              </div>

              {/* Quick Store Pills (1 tap pilih toko yang punya antrean) */}
              {dispatchedStoresList.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {dispatchedStoresList.map((ds) => {
                    const isActive = isSameStore(selectedStoreKirim, ds.storeName);
                    return (
                      <button
                        key={ds.storeName}
                        type="button"
                        onClick={() => setSelectedStoreKirim(ds.storeName)}
                        className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {ds.storeName} ({ds.koli} Koli)
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Searchable Store Dropdown */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Store Tujuan</span>
                  <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  options={[
                    ...dispatchedStoresList.map((ds) => ({
                      value: ds.storeName,
                      label: ds.storeName,
                      badge: `${ds.koli} Koli`,
                      badgeColor: 'emerald' as const,
                      secondaryLabel: `${ds.count} Laporan Ready`,
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
                  placeholder="-- Pilih Toko Cabang Tujuan --"
                  searchPlaceholder="Ketik nama atau kode toko..."
                  allowCustom={true}
                  size="sm"
                />
              </div>
            </div>

            {/* Daftar Dispatched Toko Terpilih */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate">
                    Antrean: {selectedStoreKirim || '-'}
                  </h4>
                  {selectedStoreKirim && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                      {selectedReportIdsForKirim.length}/{dispatchedForSelectedStore.length} dipilih · {totalKoliSelectedForKirim} Koli
                    </span>
                  )}
                </div>

                {dispatchedForSelectedStore.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleAllKirimForStore}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    {selectedReportIdsForKirim.length === dispatchedForSelectedStore.length ? (
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400" />
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
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 text-xs">
                  Pilih Store Tujuan di atas untuk memuat barang yang siap dikirim.
                </div>
              ) : dispatchedForSelectedStore.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2 text-xs">
                  <Box className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-slate-500 dark:text-slate-400">
                    Tidak ada antrean Dispatched untuk store <strong>{selectedStoreKirim}</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('laporan')}
                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                  >
                    + Tambah Barang ke Antrean
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {dispatchedForSelectedStore.map((r) => {
                    const isSelected = selectedReportIdsForKirim.includes(r.id);
                    const itemPhotoSet = new Set(
                      (r.items || []).map((it) => it.foto_barang).filter(Boolean) as string[]
                    );
                    const extraPhotos = (r.foto_urls || []).filter(
                      (u) => Boolean(u) && !itemPhotoSet.has(u)
                    );

                    return (
                      <div
                        key={r.id}
                        onClick={() => handleToggleSelectKirimItem(r.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                          isSelected
                            ? 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500/20'
                            : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-2">
                          {/* Top Row */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="mt-0.5 shrink-0">
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100 truncate">
                                  {r.id}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {r.tanggal_laporan}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {r.is_label_printed ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  Label
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                                  Belum Cetak
                                </span>
                              )}
                              <span className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs px-2 py-0.5 rounded-md">
                                {r.total_koli} Koli
                              </span>
                            </div>
                          </div>

                          {/* Item List (Max 2 nesting levels — no inner cards) */}
                          <div className="bg-white dark:bg-slate-900/70 rounded-lg border border-slate-200/80 dark:border-slate-800 px-2.5 py-1.5 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                            {r.items.map((it, i) => (
                              <div key={it.id || i} className="py-1.5 flex items-start justify-between gap-2.5">
                                <div className="flex-1 min-w-0 space-y-0.5">
                                  <div className="font-semibold text-slate-900 dark:text-white leading-snug break-words">
                                    {it.deskripsi}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    {isValidNoSj(it.no_surat_jalan) && (
                                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                        {it.no_surat_jalan}
                                      </span>
                                    )}
                                    <span className="font-bold text-slate-700 dark:text-slate-200">
                                      {it.qty} {it.satuan}
                                    </span>
                                    {it.satuan === 'Pcs' && <span>({it.hitung_koli} Koli)</span>}
                                  </div>
                                  {it.keterangan && (
                                    <div className="text-[11px] italic text-slate-500 dark:text-slate-400">
                                      {it.keterangan}
                                    </div>
                                  )}
                                </div>

                                {it.foto_barang && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewPhotoUrl(it.foto_barang!);
                                      setPreviewPhotoTitle(`Foto Barang: ${it.deskripsi}`);
                                    }}
                                    className="shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:ring-2 hover:ring-indigo-500 bg-slate-100"
                                    title="Klik untuk memperbesar foto barang"
                                  >
                                    <img
                                      src={it.foto_barang}
                                      alt={it.deskripsi}
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Foto Tambahan Laporan (hanya jika ada foto non-item legacy) */}
                          {extraPhotos.length > 0 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                              <span className="text-[10px] font-bold text-slate-500 shrink-0">
                                Lampiran ({extraPhotos.length}):
                              </span>
                              {extraPhotos.map((photoUrl, pIdx) => (
                                <button
                                  key={pIdx}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewPhotoUrl(photoUrl);
                                    setPreviewPhotoTitle(`Lampiran ${r.store_tujuan} #${pIdx + 1}`);
                                  }}
                                  className="w-8 h-8 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer"
                                  title="Lihat Foto"
                                >
                                  <img
                                    src={photoUrl}
                                    alt={`Lampiran ${pIdx + 1}`}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70 dark:border-slate-800 text-[11px]">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditDispatched(r);
                            }}
                            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Barang</span>
                          </button>
                          <span className="text-slate-400">PIC: {r.pic_nama}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* KOLOM KANAN STICKY: LANGKAH 2 - DETAIL PENGIRIMAN & DOKUMENTASI KESELURUHAN */}
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-3 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>2. Detail &amp; Dokumentasi Kirim</span>
              </h3>
              <div className="mt-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
                  {selectedStoreKirim || 'Belum pilih toko'}
                </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                  {selectedReportIdsForKirim.length} Lap · {totalKoliSelectedForKirim} Koli
                </span>
              </div>
            </div>

            {/* Form Detail Kirim */}
            <div className="space-y-3 text-xs">
              {/* Driver / Kurir */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Dikirim Oleh (Driver / Kurir)</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pak Joko / Kurir Internal"
                  value={dikirimOleh}
                  onChange={(e) => setDikirimOleh(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
                <div className="flex gap-1.5 pt-0.5 flex-wrap">
                  {['Driver Toko Internal', 'Kurir Operasional', 'Staff Logistik'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setDikirimOleh(sug)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tanggal Kirim */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Tanggal Kirim</span>
                </label>
                <input
                  type="date"
                  value={tanggalKirim}
                  onChange={(e) => setTanggalKirim(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>

              {/* Catatan Kirim */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Catatan Kirim (Opsional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan serah terima untuk toko atau driver..."
                  value={catatanKirim}
                  onChange={(e) => setCatatanKirim(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            {/* DOKUMENTASI PENGIRIMAN KESELURUHAN (PINDAH KE PROSES KIRIM) */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Foto Muatan Keseluruhan ({kirimOverallPhotos.length}/8)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Foto tumpukan koli final, kondisi muatan, atau bukti serah terima driver sebelum berangkat.
                  </p>
                </div>

                <input
                  ref={kirimPhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  disabled={isCompressingKirimPhotos}
                  onChange={handleKirimOverallPhotoUpload}
                />
                <button
                  type="button"
                  onClick={() => kirimPhotoInputRef.current?.click()}
                  disabled={isCompressingKirimPhotos || kirimOverallPhotos.length >= 8}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isCompressingKirimPhotos ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  )}
                  <span>Foto</span>
                </button>
              </div>

              {kirimOverallPhotos.length === 0 ? (
                <div
                  onClick={() => kirimPhotoInputRef.current?.click()}
                  className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 text-center space-y-1 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <UploadCloud className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Upload / Ambil Foto Keseluruhan (Opsional)
                  </p>
                  <p className="text-[10px] text-slate-400">Maksimal 8 foto, otomatis dikompresi ke Google Drive</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {kirimOverallPhotos.map((photo, pIdx) => (
                    <div
                      key={pIdx}
                      className="group relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 aspect-square"
                    >
                      <img
                        src={photo}
                        alt={`Foto Muatan ${pIdx + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        referrerPolicy="no-referrer"
                        onClick={() => {
                          setPreviewPhotoUrl(photo);
                          setPreviewPhotoTitle(`Foto Muatan Keseluruhan #${pIdx + 1}`);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveKirimOverallPhoto(pIdx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] shadow-xs cursor-pointer hover:bg-rose-700"
                        title="Hapus Foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                        #{pIdx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Footer (Anti-Pelangi: 1 neutral outline + 1 solid primary) */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => handlePrintBulkLabels(selectedDispatchedObjectsForKirim)}
                disabled={selectedReportIdsForKirim.length === 0}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Cetak Label Koli ({totalKoliSelectedForKirim} Koli)</span>
              </button>

              <button
                type="button"
                onClick={handleSubmitKirim}
                disabled={isProcessingKirim || selectedReportIdsForKirim.length === 0}
                className="w-full px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessingKirim ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Konfirmasi Kirim &amp; Cetak SJ</span>
              </button>

              <p className="text-[10px] text-center text-slate-400">
                Setelah konfirmasi, Surat Jalan A4 Rangkap 2 otomatis siap dicetak dan masuk ke Histori Kirim.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. SUB-TAB: HISTORI KIRIM                                            */}
      {/* ==================================================================== */}
      {activeSubTab === 'histori' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <div className="relative flex-1 min-w-[190px] max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari No. SJ, Store, Driver, Barang..."
                  value={searchHistori}
                  onChange={(e) => setSearchHistori(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="w-full sm:w-auto min-w-[200px]">
                <SearchableSelect
                  multiple={true}
                  options={stores.map((s) => {
                    const countInHistori = historiBatches.filter((b) => isSameStore(b.storeTujuan, s.nama)).length;
                    return {
                      value: s.nama,
                      label: s.nama,
                      badge: countInHistori > 0 ? `${countInHistori} SJ` : undefined,
                      badgeColor: 'indigo' as const,
                    };
                  })}
                  value={filterStoreHistori}
                  onChange={(val) => setFilterStoreHistori(val)}
                  placeholder="Filter Store"
                  searchPlaceholder="Cari toko..."
                  size="sm"
                  icon={<Store className="w-3.5 h-3.5" />}
                />
              </div>

              {/* Status Filter */}
              <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-0.5 text-[11px] font-bold">
                {(
                  [
                    { id: 'all', label: 'Semua' },
                    { id: 'active', label: 'Terkirim' },
                    { id: 'cancelled', label: 'Dibatalkan' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setFilterStatusHistori(st.id)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      filterStatusHistori === st.id
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs font-bold text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 shrink-0">
              {filteredHistoriBatches.length} SJ · {totalKoliHistori} Koli
            </div>
          </div>

          {filteredHistoriBatches.length === 0 ? (
            <div className="bg-white dark:bg-[#131d31] p-8 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2.5">
              <Clock className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Belum ada histori pengiriman
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pengiriman yang diproses di tab <strong>3. Proses Kirim</strong> otomatis tercatat di sini per Nomor SJ.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE (lg:table-fixed proportional columns) */}
              <div className="hidden md:block bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <table className="w-full lg:table-fixed text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-3.5 py-2.5 lg:w-[17%]">No. SJ &amp; Tanggal</th>
                        <th className="px-3.5 py-2.5 lg:w-[18%]">Store Tujuan</th>
                        <th className="px-3.5 py-2.5 lg:w-[19%]">Muatan &amp; Ringkasan</th>
                        <th className="px-3.5 py-2.5 lg:w-[15%]">Driver &amp; Catatan</th>
                        <th className="px-3.5 py-2.5 lg:w-[10%]">Dokumentasi</th>
                        <th className="px-3.5 py-2.5 lg:w-[9%]">Status</th>
                        <th className="px-3.5 py-2.5 lg:w-[12%] text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredHistoriBatches.map((batch) => {
                        const isCancelled = batch.status === 'cancelled';
                        const itemSummary = batch.reports
                          .flatMap((r) => r.items)
                          .map((it) => it.deskripsi)
                          .filter(Boolean)
                          .join(', ');

                        return (
                          <tr
                            key={batch.tripId}
                            onClick={() => setSelectedBatchDetail(batch)}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                          >
                            {/* 1. No. SJ & Tanggal */}
                            <td className="px-3.5 py-3 align-top">
                              <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline truncate" title={batch.tripId}>
                                {batch.tripId}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                {[batch.tanggalKirim, batch.waktuKirim].filter(Boolean).join(' · ')}
                              </div>
                            </td>

                            {/* 2. Store Tujuan */}
                            <td className="px-3.5 py-3 align-top">
                              <div
                                className="font-extrabold text-slate-900 dark:text-white uppercase truncate"
                                title={batch.storeTujuan}
                              >
                                {batch.storeTujuan}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {batch.reports.length} lap · {batch.totalItemCount} barang
                              </div>
                            </td>

                            {/* 3. Muatan & Ringkasan */}
                            <td className="px-3.5 py-3 align-top">
                              <span className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                                {batch.totalKoli} Koli
                              </span>
                              {itemSummary && (
                                <div
                                  className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 truncate"
                                  title={itemSummary}
                                >
                                  {itemSummary}
                                </div>
                              )}
                            </td>

                            {/* 4. Driver & Catatan */}
                            <td className="px-3.5 py-3 align-top">
                              <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={batch.dikirimOleh}>
                                {batch.dikirimOleh}
                              </div>
                              {batch.catatanKirim && (
                                <div
                                  className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5"
                                  title={batch.catatanKirim}
                                >
                                  {batch.catatanKirim}
                                </div>
                              )}
                            </td>

                            {/* 5. Dokumentasi */}
                            <td className="px-3.5 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                              {batch.allPhotos.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPhotoUrl(batch.allPhotos[0]);
                                    setPreviewPhotoTitle(`Dokumentasi ${batch.tripId} — ${batch.storeTujuan}`);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 cursor-pointer"
                                  title={`${batch.tripPhotos.length} foto kirim · ${batch.itemPhotos.length} foto barang`}
                                >
                                  <img
                                    src={batch.allPhotos[0]}
                                    alt="Foto"
                                    className="w-5 h-5 rounded object-cover shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                    {batch.allPhotos.length} Foto
                                  </span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>

                            {/* 6. Status */}
                            <td className="px-3.5 py-3 align-top">
                              {isCancelled ? (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold text-[10px] px-2 py-0.5 rounded-full">
                                  Dibatalkan
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 font-bold text-[10px] px-2 py-0.5 rounded-full">
                                  Terkirim
                                </span>
                              )}
                            </td>

                            {/* 7. Aksi (Neutral Outline/Ghost) */}
                            <td className="px-3.5 py-3 align-top text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedBatchDetail(batch)}
                                  className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                                  title="Lihat Rincian & Foto"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>

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
                                  className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 cursor-pointer"
                                  title="Cetak Ulang Surat Jalan"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>

                                {!isCancelled && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditTrip(batch)}
                                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                                      title="Edit Pengiriman & Foto"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenCancelTrip(batch)}
                                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                      title="Batalkan Kirim (Kembali ke Dispatched)"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </>
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

              {/* MOBILE CARD LIST (HP / SELULER < md, zero horizontal scroll) */}
              <div className="md:hidden space-y-2.5">
                {filteredHistoriBatches.map((batch) => {
                  const isCancelled = batch.status === 'cancelled';
                  const itemSummary = batch.reports
                    .flatMap((r) => r.items)
                    .map((it) => it.deskripsi)
                    .filter(Boolean)
                    .join(', ');

                  return (
                    <div
                      key={batch.tripId}
                      onClick={() => setSelectedBatchDetail(batch)}
                      className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5 shadow-2xs cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 truncate">
                          {batch.tripId}
                        </span>
                        {isCancelled ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
                            Dibatalkan
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 shrink-0">
                            Terkirim
                          </span>
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase truncate">
                            {batch.storeTujuan}
                          </h4>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {[batch.tanggalKirim, batch.waktuKirim, batch.dikirimOleh].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                          {batch.totalKoli} Koli
                        </span>
                      </div>

                      {(itemSummary || batch.allPhotos.length > 0) && (
                        <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 border border-slate-200/70 dark:border-slate-700/60">
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0">
                            {itemSummary || `${batch.totalItemCount} barang`}
                          </p>
                          {batch.allPhotos.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewPhotoUrl(batch.allPhotos[0]);
                                setPreviewPhotoTitle(`Dokumentasi ${batch.tripId}`);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200 shrink-0"
                            >
                              <Camera className="w-3 h-3 text-indigo-500" />
                              <span>{batch.allPhotos.length} Foto</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div
                        className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedBatchDetail(batch)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Detail</span>
                        </button>

                        <div className="flex items-center gap-1.5">
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
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" />
                            <span>SJ</span>
                          </button>

                          {!isCancelled && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditTrip(batch)}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCancelTrip(batch)}
                                className="px-2 py-1 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 flex items-center gap-1"
                              >
                                <XCircle className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
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
      {/* MODAL: PREVIEW DOKUMENTASI FOTO (ZOOM & FULL VIEW SEPERTI KATALOG)   */}
      {/* ==================================================================== */}
      <LoadingDockImageLightbox
        isOpen={Boolean(previewPhotoUrl)}
        onClose={() => setPreviewPhotoUrl(null)}
        photo={previewPhotoUrl ? {
          url: previewPhotoUrl,
          title: previewPhotoTitle || 'Foto Pengiriman Barang',
          badge: 'Pengiriman Store',
        } : null}
      />

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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 shrink-0">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                    Edit Antrean Dispatched
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    {editingDispatchedReport.id} · {editingDispatchedReport.store_tujuan}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingDispatchedReport(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Store Tujuan */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-indigo-500" />
                  <span>Store Tujuan</span>
                  <span className="text-rose-500">*</span>
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
                  size="sm"
                />
              </div>

              {/* Rincian Items */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 dark:text-slate-200 uppercase text-xs flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-500" />
                    Daftar Barang ({editItems.length})
                  </span>

                  <button
                    type="button"
                    onClick={handleAddEditItemRow}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Barang</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {editItems.map((item, idx) => {
                    const rowKoli =
                      item.satuan === 'Pcs' ? 1 : Math.max(1, Math.round(Number(item.qty) || 1));
                    const isLegacyNotePresent = Boolean(item.keterangan && item.keterangan.trim());

                    return (
                      <div
                        key={item.id || idx}
                        className="p-3 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">
                              Barang #{idx + 1}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
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

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                          <div className="sm:col-span-3 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              No. Surat Jalan
                            </label>
                            <input
                              type="text"
                              value={isValidNoSj(item.no_surat_jalan) ? item.no_surat_jalan : ''}
                              onChange={(e) =>
                                handleUpdateEditItem(idx, 'no_surat_jalan', e.target.value)
                              }
                              placeholder="Opsional..."
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono outline-none"
                            />
                          </div>

                          <div className="sm:col-span-4 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              Nama / Keterangan Barang <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={item.deskripsi || ''}
                              onChange={(e) =>
                                handleUpdateEditItem(idx, 'deskripsi', e.target.value)
                              }
                              placeholder="Nama / keterangan barang..."
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold outline-none"
                            />
                          </div>

                          <div className="sm:col-span-3 grid grid-cols-2 gap-1.5">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Qty</label>
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
                              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Satuan</label>
                              <select
                                value={item.satuan}
                                onChange={(e) =>
                                  handleUpdateEditItem(idx, 'satuan', e.target.value as any)
                                }
                                className="w-full px-1.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold outline-none"
                              >
                                <option value="Koli">Koli</option>
                                <option value="Pcs">Pcs</option>
                              </select>
                            </div>
                          </div>

                          {/* Foto Per Barang */}
                          <div className="sm:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              Foto Barang
                            </label>
                            {item.foto_barang ? (
                              <div className="h-[34px] flex items-center gap-1 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPhotoUrl(item.foto_barang || null);
                                    setPreviewPhotoTitle(`Foto Barang: ${item.deskripsi || 'Barang #' + (idx + 1)}`);
                                  }}
                                  className="w-6 h-6 rounded overflow-hidden shrink-0 cursor-pointer"
                                  title="Lihat Foto"
                                >
                                  <img
                                    src={item.foto_barang}
                                    alt="Foto"
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEditItemPhoto(idx)}
                                  className="ml-auto p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                  title="Hapus Foto"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <label className="w-full h-[34px] inline-flex items-center justify-center gap-1 px-2 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold hover:bg-indigo-50 cursor-pointer">
                                {editItemCompressingIdx === idx ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Camera className="w-3.5 h-3.5 shrink-0" />
                                    <span>Foto</span>
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  disabled={editItemCompressingIdx === idx}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleEditItemPhotoUpload(idx, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        {isLegacyNotePresent && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500">
                              Keterangan Tambahan (Data Lama)
                            </label>
                            <input
                              type="text"
                              value={item.keterangan || ''}
                              onChange={(e) =>
                                handleUpdateEditItem(idx, 'keterangan', e.target.value)
                              }
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-700 dark:text-slate-300 font-bold">
                  Total Dihitung Ulang:
                </span>
                <span className="font-extrabold text-indigo-700 dark:text-indigo-300">
                  {editItems.length} Barang ·{' '}
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
            <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingDispatchedReport(null)}
                disabled={isSavingEditDispatched}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleSaveEditDispatched}
                disabled={isSavingEditDispatched}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
      {/* ==================================================================== */}
      {selectedBatchDetail && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                    Surat Jalan: <span className="font-mono text-indigo-600 dark:text-indigo-400">{selectedBatchDetail.tripId}</span>
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">
                    {selectedBatchDetail.storeTujuan}
                  </span>
                  <span>·</span>
                  <span>
                    {[selectedBatchDetail.tanggalKirim, selectedBatchDetail.waktuKirim].filter(Boolean).join(' ')}
                  </span>
                  <span>·</span>
                  <span>Driver: <strong>{selectedBatchDetail.dikirimOleh}</strong></span>
                  {selectedBatchDetail.armada && (
                    <>
                      <span>·</span>
                      <span>{selectedBatchDetail.armada} {selectedBatchDetail.noPolisi}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
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
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                  title="Cetak Surat Jalan Pengiriman (A4 Rangkap 2)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak SJ</span>
                </button>

                {selectedBatchDetail.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditTrip(selectedBatchDetail)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
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
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {selectedBatchDetail.catatanKirim && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-2 text-slate-600 dark:text-slate-300">
                  <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">Catatan Kirim: </span>
                    {selectedBatchDetail.catatanKirim}
                  </div>
                </div>
              )}

              {/* Status Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-extrabold text-slate-800 dark:text-slate-100">
                    Total Muatan: {selectedBatchDetail.totalKoli} Koli
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">
                    {selectedBatchDetail.totalItemCount} Barang ({selectedBatchDetail.reports.length} Laporan)
                  </span>
                </div>
                {selectedBatchDetail.status === 'cancelled' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    Dibatalkan
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Terkirim
                  </span>
                )}
              </div>

              {/* Tabel Rincian Data Barang */}
              <div className="space-y-2.5">
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Box className="w-4 h-4 text-indigo-600" />
                  <span>Rincian Barang yang Dikirim</span>
                </h4>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-3.5 py-2.5 w-14">Foto</th>
                          <th className="px-3.5 py-2.5">No. SJ</th>
                          <th className="px-3.5 py-2.5">Nama / Keterangan Barang</th>
                          <th className="px-3.5 py-2.5">Qty / Koli</th>
                          {selectedBatchDetail.status !== 'cancelled' && (
                            <th className="px-3.5 py-2.5 text-right">Aksi</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedBatchDetail.reports.flatMap((rep) =>
                          rep.items.map((it, idx) => {
                            const hasSj = isValidNoSj(it.no_surat_jalan);
                            const displaySj = hasSj ? it.no_surat_jalan : '-';

                            return (
                              <tr
                                key={`${rep.id}-${idx}`}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                              >
                                {/* Foto Barang */}
                                <td className="px-3.5 py-2 align-top">
                                  {it.foto_barang ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPreviewPhotoUrl(it.foto_barang!);
                                        setPreviewPhotoTitle(`Foto Barang: ${it.deskripsi}`);
                                      }}
                                      className="relative group shrink-0 cursor-pointer w-10 h-10 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700"
                                      title="Perbesar foto barang"
                                    >
                                      <img
                                        src={it.foto_barang}
                                        alt={it.deskripsi}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    </button>
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300">
                                      <ImageIcon className="w-4 h-4" />
                                    </div>
                                  )}
                                </td>

                                {/* No. Surat Jalan */}
                                <td className="px-3.5 py-2 align-top whitespace-nowrap">
                                  <div className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                                    {displaySj}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                    {rep.id}
                                  </div>
                                </td>

                                {/* Nama / Keterangan Barang */}
                                <td className="px-3.5 py-2 align-top">
                                  <div className="font-bold text-slate-900 dark:text-white leading-snug">
                                    {it.deskripsi}
                                  </div>
                                  {it.keterangan && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-0.5">
                                      {it.keterangan}
                                    </div>
                                  )}
                                </td>

                                {/* Qty / Koli */}
                                <td className="px-3.5 py-2 align-top whitespace-nowrap">
                                  <div className="font-bold text-slate-800 dark:text-slate-200">
                                    {it.qty} {it.satuan}
                                  </div>
                                  {it.satuan === 'Pcs' && (
                                    <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                                      {it.hitung_koli} Koli
                                    </div>
                                  )}
                                </td>

                                {/* Aksi */}
                                {selectedBatchDetail.status !== 'cancelled' && (
                                  <td className="px-3.5 py-2 align-top text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoveReportFromBatch(selectedBatchDetail.tripId, rep)
                                      }
                                      className="px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 inline-flex items-center gap-1 cursor-pointer"
                                      title="Keluarkan dari pengiriman ini & kembalikan ke Dispatched"
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

              {/* 1. Foto Dokumentasi Pengiriman Keseluruhan (Saat Kirim) */}
              {selectedBatchDetail.tripPhotos.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-600" />
                    <span>
                      Dokumentasi Pengiriman Keseluruhan — Saat Kirim ({selectedBatchDetail.tripPhotos.length} Foto)
                    </span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                    {selectedBatchDetail.tripPhotos.map((photo, pIdx) => (
                      <div
                        key={pIdx}
                        onClick={() => {
                          setPreviewPhotoUrl(photo);
                          setPreviewPhotoTitle(
                            `Dokumentasi Kirim ${selectedBatchDetail.tripId} #${pIdx + 1}`
                          );
                        }}
                        className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer shadow-2xs"
                        title="Klik untuk memperbesar"
                      >
                        <img
                          src={photo}
                          alt={`Dokumentasi Kirim #${pIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                          <Eye className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Foto Dokumentasi Per Barang */}
              {selectedBatchDetail.itemPhotos.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    <span>Dokumentasi Foto Per Barang ({selectedBatchDetail.itemPhotos.length} Foto)</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                    {selectedBatchDetail.itemPhotos.map((photo, pIdx) => (
                      <div
                        key={pIdx}
                        onClick={() => {
                          setPreviewPhotoUrl(photo);
                          setPreviewPhotoTitle(
                            `Dokumentasi Barang ${selectedBatchDetail.tripId} #${pIdx + 1}`
                          );
                        }}
                        className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer shadow-2xs"
                        title="Klik untuk memperbesar"
                      >
                        <img
                          src={photo}
                          alt={`Foto Barang #${pIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
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
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                1 Batch Kirim = 1 Nomor Surat Jalan Pengiriman
              </div>
              <button
                type="button"
                onClick={() => setSelectedBatchDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDIT PENGIRIMAN BATCH (TANGGAL, DRIVER, BARANG, FOTO)         */}
      {/* ==================================================================== */}
      {editingTripBatch && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 truncate">
                  <Edit className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    Edit Pengiriman: <span className="font-mono text-indigo-600 dark:text-indigo-400">{editingTripBatch.tripId}</span>
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Tujuan: <strong>{editingTripBatch.storeTujuan}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTripBatch(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
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

                {/* Armada & No Polisi hanya muncul jika data lama sudah memilikinya */}
                {(editingTripBatch.armada || editingTripBatch.noPolisi) && (
                  <>
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
                  </>
                )}
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

              {/* Dokumentasi Pengiriman Keseluruhan */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-emerald-600" />
                    <span>Foto Pengiriman Keseluruhan ({editTripPhotos.length}/8)</span>
                  </label>
                  <input
                    ref={editTripPhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="hidden"
                    disabled={isCompressingEditTripPhotos}
                    onChange={handleEditTripPhotoUpload}
                  />
                  <button
                    type="button"
                    onClick={() => editTripPhotoInputRef.current?.click()}
                    disabled={isCompressingEditTripPhotos || editTripPhotos.length >= 8}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {isCompressingEditTripPhotos ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    )}
                    <span>Tambah Foto</span>
                  </button>
                </div>

                {editTripPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {editTripPhotos.map((photo, pIdx) => (
                      <div
                        key={pIdx}
                        className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100"
                      >
                        <img
                          src={photo}
                          alt={`Foto Trip #${pIdx + 1}`}
                          className="w-full h-full object-cover cursor-pointer"
                          referrerPolicy="no-referrer"
                          onClick={() => {
                            setPreviewPhotoUrl(photo);
                            setPreviewPhotoTitle(`Foto Kirim ${editingTripBatch.tripId} #${pIdx + 1}`);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveEditTripPhoto(pIdx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-xs cursor-pointer hover:bg-rose-700"
                          title="Hapus Foto"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    onClick={() => editTripPhotoInputRef.current?.click()}
                    className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 text-center text-[11px] text-slate-500 cursor-pointer hover:bg-slate-100"
                  >
                    Klik untuk menambah foto bukti kirim / muatan keseluruhan
                  </div>
                )}
              </div>

              {/* Checklist Barang dalam Pengiriman */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-indigo-500" />
                    <span>Barang dalam Pengiriman ini:</span>
                  </label>
                  <span className="text-[11px] text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/50">
                    Tidak dicentang otomatis balik ke Dispatched
                  </span>
                </div>

                <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 max-h-52 overflow-y-auto">
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
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                          isChecked
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-400'
                            : 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 text-slate-400'
                        }`}
                      >
                        <div className="mt-0.5">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
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
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingTripBatch(null)}
                disabled={isSavingTripEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEditTrip}
                disabled={isSavingTripEdit}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
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
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                    Input Cepat Multi-Toko
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Buat baris pengiriman untuk beberapa store sekaligus
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMultiStoreModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Multi-Store Dropdown */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-indigo-500" />
                  <span>Pilih Toko Tujuan (Bisa Pilih Banyak)</span>
                  <span className="text-rose-500">*</span>
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
                  size="sm"
                />
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {multiStoreSelected.length > 0
                    ? `${multiStoreSelected.length} toko terpilih. Akan dibuat ${multiStoreSelected.length} baris barang.`
                    : 'Gunakan tombol "Pilih Semua" atau centang beberapa toko sekaligus.'}
                </div>
              </div>

              {/* Nama / Keterangan Barang */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 dark:text-slate-200">
                  Nama / Keterangan Barang <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={multiStoreDeskripsi}
                  onChange={(e) => setMultiStoreDeskripsi(e.target.value)}
                  placeholder="Mis: Paket Brosur Marketing / Display Banner..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:border-indigo-500"
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
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500 font-medium">
                Total: <strong>{multiStoreSelected.length} baris</strong> akan dibuat
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMultiStoreModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleGenerateMultiStoreRows}
                  disabled={multiStoreSelected.length === 0 || !multiStoreDeskripsi.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
