import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Truck,
  Package,
  Layers,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Trash2,
  Edit,
  Camera,
  Upload,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Maximize2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowUpDown,
  Eye,
  Info,
  Building2,
  Calendar,
  Share2,
  Printer,
  LayoutGrid,
  List,
  Image as ImageIcon,
  Cloud,
  ZoomIn,
  Copy,
  QrCode,
  EyeOff,
  CheckSquare,
  Palette,
  Minus,
  Tag,
  CopyCheck,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  UserSession,
  ProductItem,
  PenerimaanProduksiItem,
  PenerimaanProdukBlock,
  PenerimaanVariantItem,
  SimpanPenerimaanPayload,
  KatalogItem,
} from '../types';
import { PenerimaanProductCardItem } from './penerimaan/PenerimaanProductCardItem';
import { QcPengerjaanTab } from './penerimaan/QcPengerjaanTab';
import { ProduksiSpreadsheetView } from './penerimaan/ProduksiSpreadsheetView';
import { HitungUlangModal } from './penerimaan/HitungUlangModal';
import { KatalogBarcodeModal } from './katalog/KatalogBarcodeModal';
import { globalRealtimeStore } from '../services/store';
import {
  fetchPenerimaanProduksiFromSupabase,
  simpanBatchPenerimaanProduksiToSupabase,
  updateBatchPenerimaanProduksiInSupabase,
  hapusBatchPenerimaanProduksiFromSupabase,
  hapusPenerimaanProduksiSingleRowFromSupabase,
  getSupabaseClient,
  syncOfflinePenerimaanProduksi,
  cleanMismatchedPenerimaanNotesInSupabase,
} from '../services/supabase';
import { compressImage } from '../utils/imageCompressor';
import { uploadMultipleImagesToGdrive } from '../services/gdriveUpload';
import { normalizeWhatsAppNumber } from '../services/whatsapp';
import {
  pushPenerimaanProduksiToGoogleSheet,
  PRODUKSI_SPREADSHEET_ID,
} from '../services/gasProduksiSync';

interface PenerimaanProduksiViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type TabMode = 'riwayat' | 'input' | 'qc_pengerjaan';

export interface SuratJalanGroup {
  no_surat_jalan: string;
  tanggal_penerimaan: string;
  kategori: string;
  operator: string;
  keterangan?: string;
  items: PenerimaanProduksiItem[];
  totalPcs: number;
  uniqueKodeCount: number;
  qrCodeUrl?: string;
}

export const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'ALL SIZE', 'FREE SIZE', 'Default'];

export const getNextSize = (currentSize: string): string => {
  const idx = STANDARD_SIZES.findIndex((s) => s.toUpperCase() === (currentSize || '').toUpperCase());
  if (idx !== -1 && idx < STANDARD_SIZES.length - 1) {
    return STANDARD_SIZES[idx + 1];
  }
  return 'L';
};

export const POPULAR_COLORS = [
  'BLACK',
  'WHITE',
  'NAVY',
  'BEIGE',
  'SAGE',
  'CREAM',
  'MOCCA',
  'BROWN',
  'MAROON',
  'GREY',
  'DUSTY PINK',
  'TERRACOTTA',
  'DENIM',
  'OLIVE',
];

export interface FormVariantSize {
  id: string;
  size: string;
  qty: number | string;
}

export interface FormVariantWarna {
  id: string;
  warna: string;
  sizes: FormVariantSize[];
}

export interface FormProductBlock {
  id: string | number;
  kode_produksi: string;
  catatan?: string;
  foto_url?: string;
  warnas: FormVariantWarna[];
}

export function createNewProductBlock(): FormProductBlock {
  return {
    id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    kode_produksi: '',
    catatan: '',
    foto_url: '',
    warnas: [
      {
        id: `warna_${Date.now()}_0`,
        warna: '',
        sizes: [
          { id: `sz_${Date.now()}_0`, size: 'S', qty: 1 },
          { id: `sz_${Date.now()}_1`, size: 'M', qty: 1 },
          { id: `sz_${Date.now()}_2`, size: 'L', qty: 1 },
        ],
      },
    ],
  };
}

export function convertBlocksToHierarchical(rawBlocks: any[]): FormProductBlock[] {
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    return [createNewProductBlock()];
  }

  return rawBlocks.map((b, bIdx) => {
    // Jika sudah dalam format warnas
    if (Array.isArray(b.warnas) && b.warnas.length > 0) {
      return {
        id: b.id || `prod_${Date.now()}_${bIdx}`,
        kode_produksi: b.kode_produksi || '',
        catatan: b.catatan || '',
        foto_url: b.foto_url || '',
        warnas: b.warnas.map((w: any, wIdx: number) => ({
          id: w.id || `warna_${Date.now()}_${wIdx}`,
          warna: w.warna || '',
          sizes:
            Array.isArray(w.sizes) && w.sizes.length > 0
              ? w.sizes.map((s: any, sIdx: number) => ({
                  id: s.id || `sz_${Date.now()}_${sIdx}`,
                  size: s.size || 'S',
                  qty: s.qty ?? 1,
                }))
              : [{ id: `sz_${Date.now()}_0`, size: 'S', qty: 1 }],
        })),
      };
    }

    // Jika dari format legacy flat variants: [{ warna, size, qty }]
    const warnaMap = new Map<string, FormVariantSize[]>();
    const warnasOrder: string[] = [];

    if (Array.isArray(b.variants)) {
      b.variants.forEach((v: any, vIdx: number) => {
        const wName = (v.warna || '').trim().toUpperCase();
        if (!warnaMap.has(wName)) {
          warnaMap.set(wName, []);
          warnasOrder.push(wName);
        }
        warnaMap.get(wName)!.push({
          id: `sz_${Date.now()}_${vIdx}`,
          size: v.size || 'S',
          qty: v.qty ?? 1,
        });
      });
    }

    if (warnasOrder.length === 0) {
      warnasOrder.push('');
      warnaMap.set('', [
        { id: `sz_${Date.now()}_0`, size: 'S', qty: 1 },
        { id: `sz_${Date.now()}_1`, size: 'M', qty: 1 },
        { id: `sz_${Date.now()}_2`, size: 'L', qty: 1 },
      ]);
    }

    return {
      id: b.id || `prod_${Date.now()}_${bIdx}`,
      kode_produksi: b.kode_produksi || '',
      catatan: b.catatan || '',
      foto_url: b.foto_url || '',
      warnas: warnasOrder.map((wName, wIdx) => ({
        id: `warna_${Date.now()}_${wIdx}`,
        warna: wName,
        sizes: warnaMap.get(wName) || [{ id: `sz_${Date.now()}_0`, size: 'S', qty: 1 }],
      })),
    };
  });
}

export interface ProductModelGroup {
  key: string;
  kode_produksi: string;
  warna: string;
  foto_url?: string;
  items: PenerimaanProduksiItem[];
  totalQty: number;
}

export function groupItemsByProductModel(items: PenerimaanProduksiItem[]): ProductModelGroup[] {
  const map = new Map<string, ProductModelGroup>();

  (items || []).forEach((it) => {
    const kode = (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase();
    const warna = (it.warna || 'DEFAULT').trim().toUpperCase();
    const key = `${kode}___${warna}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        kode_produksi: it.kode_produksi || 'Tanpa Kode',
        warna: it.warna || '-',
        foto_url: it.foto_url || '',
        items: [],
        totalQty: 0,
      });
    }

    const group = map.get(key)!;
    if (!group.foto_url && it.foto_url) {
      group.foto_url = it.foto_url;
    }
    group.items.push(it);
    group.totalQty += Number(it.qty) || 0;
  });

  return Array.from(map.values());
}

// 1 Surat Jalan berisi beberapa Kartu Produk (1 Produk = 1 Kode Produk yang sama)
export interface ProductCardGroup {
  kode_produksi: string;
  foto_url?: string;
  warnas: string[];
  keterangan?: string;
  items: PenerimaanProduksiItem[];
  totalQty: number;
}

export function groupItemsByProductCode(items: PenerimaanProduksiItem[]): ProductCardGroup[] {
  const map = new Map<string, ProductCardGroup>();

  (items || []).forEach((it) => {
    const kode = (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase();

    if (!map.has(kode)) {
      map.set(kode, {
        kode_produksi: it.kode_produksi || 'Tanpa Kode',
        foto_url: it.foto_url || '',
        warnas: [],
        keterangan: it.keterangan || '',
        items: [],
        totalQty: 0,
      });
    }

    const group = map.get(kode)!;
    if (!group.foto_url && it.foto_url) {
      group.foto_url = it.foto_url;
    }
    const w = (it.warna || '').trim();
    if (w && !group.warnas.includes(w)) {
      group.warnas.push(w);
    }
    if (!group.keterangan && it.keterangan) {
      group.keterangan = it.keterangan;
    }
    group.items.push(it);
    group.totalQty += Number(it.qty) || 0;
  });

  return Array.from(map.values());
}

export const PenerimaanProduksiView: React.FC<PenerimaanProduksiViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabMode>('riwayat');
  const [selectedQcTargetCode, setSelectedQcTargetCode] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Hitung Ulang Modal State
  const [isHitungUlangModalOpen, setIsHitungUlangModalOpen] = useState<boolean>(false);
  const [hitungUlangTargetKode, setHitungUlangTargetKode] = useState<string>('');
  const [hitungUlangTargetTanggal, setHitungUlangTargetTanggal] = useState<string>('all');

  const handleOpenHitungUlang = (kode?: string, tanggal?: string) => {
    setHitungUlangTargetKode(kode || '');
    setHitungUlangTargetTanggal(tanggal || 'all');
    setIsHitungUlangModalOpen(true);
  };

  // View Mode: 'matrix' (Spreadsheet Excel Matrix), 'card' (1 Kartu = 1 No. Surat Jalan), atau 'table' (1 Baris = 1 Varian)
  const [viewMode, setViewMode] = useState<'matrix' | 'card' | 'table'>(() => {
    try {
      return (localStorage.getItem('wms_penerimaan_view_mode') as 'matrix' | 'card' | 'table') || 'matrix';
    } catch {
      return 'matrix';
    }
  });
  const [cardPage, setCardPage] = useState<number>(1);
  const cardsPerPage = 8;
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Print PDF Surat Jalan State (1 no surat jalan full)
  const [printSJData, setPrintSJData] = useState<SuratJalanGroup | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Initial load from local cache to save network roundtrips & egress
  const [dataList, setDataList] = useState<PenerimaanProduksiItem[]>(() => {
    try {
      const cached = localStorage.getItem('wms_local_penerimaan_produksi');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterKategori, setFilterKategori] = useState<string>('Semua');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 50;

  // Draft Recovery for in-progress goods receipt form (protects against reload, tab close, or app crash)
  const initialFormDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem('wms_penerimaan_produksi_form_draft');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.formNoSuratJalan || (Array.isArray(parsed.productBlocks) && parsed.productBlocks.some((b: any) => b.kode_produksi)))) {
          return parsed;
        }
      }
    } catch {}
    return null;
  }, []);

  // Form State: Header Surat Jalan
  const [formKategori, setFormKategori] = useState<'Lokal CMT' | 'Kargo'>(() => initialFormDraft?.formKategori || 'Lokal CMT');
  const [formTanggal, setFormTanggal] = useState<string>(() => {
    return initialFormDraft?.formTanggal || new Date().toISOString().split('T')[0];
  });
  const [formNoSuratJalan, setFormNoSuratJalan] = useState<string>(() => initialFormDraft?.formNoSuratJalan || '');
  const [formKeteranganGlobal, setFormKeteranganGlobal] = useState<string>(() => initialFormDraft?.formKeteranganGlobal || '');

  // Form State: Product Blocks (Hierarki: Kode Produksi -> Varian Warna -> Varian Size & Qty)
  const [productBlocks, setProductBlocks] = useState<FormProductBlock[]>(() => {
    if (initialFormDraft?.productBlocks && Array.isArray(initialFormDraft.productBlocks) && initialFormDraft.productBlocks.length > 0) {
      return convertBlocksToHierarchical(initialFormDraft.productBlocks);
    }
    return [createNewProductBlock()];
  });

  // Auto-Save in-progress draft to localStorage
  useEffect(() => {
    const hasData = Boolean(
      formNoSuratJalan.trim() ||
      formKeteranganGlobal.trim() ||
      productBlocks.some(b => b.kode_produksi.trim() || (b.warnas && b.warnas.some(w => w.warna.trim())))
    );
    if (hasData) {
      const timer = setTimeout(() => {
        try {
          localStorage.setItem('wms_penerimaan_produksi_form_draft', JSON.stringify({
            formKategori,
            formTanggal,
            formNoSuratJalan,
            formKeteranganGlobal,
            productBlocks,
            savedAt: Date.now(),
          }));
        } catch {}
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [formKategori, formTanggal, formNoSuratJalan, formKeteranganGlobal, productBlocks]);

  // BeforeUnload guard to warn if operator attempts to reload or close tab with unsaved items
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasData = Boolean(
        formNoSuratJalan.trim() ||
        productBlocks.some(b => b.kode_produksi.trim() || (b.warnas && b.warnas.some(w => w.warna.trim())))
      );
      if (hasData) {
        e.preventDefault();
        e.returnValue = 'Data formulir penerimaan barang sedang diisi. Data tersimpan di draft lokal, yakin ingin menutup atau me-reload?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [formNoSuratJalan, productBlocks]);

  // Modals
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  // Edit Batch Modal
  const [editingBatch, setEditingBatch] = useState<{
    no_surat_jalan: string;
    orig_no_surat_jalan: string;
    kategori: string;
    tanggal: string;
    keterangan: string;
    items: PenerimaanProduksiItem[];
  } | null>(null);
  const [isUpdatingBatch, setIsUpdatingBatch] = useState<boolean>(false);
  const [isDraggingPrimaryFoto, setIsDraggingPrimaryFoto] = useState<boolean>(false);
  const [draggingProdKey, setDraggingProdKey] = useState<string | null>(null);

  // Delete Confirm Modal
  const [deletingTarget, setDeletingTarget] = useState<{
    type: 'single' | 'batch' | 'product';
    id?: string | number;
    no_surat_jalan: string;
    kode_produksi?: string;
    items?: PenerimaanProduksiItem[];
    totalRows?: number;
    totalQty?: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Barcode Print Modal Target
  const [barcodeModalTarget, setBarcodeModalTarget] = useState<KatalogItem | null>(null);

  // Toggle Tabel Varian per Kartu Produk (Key: `${no_surat_jalan}___${kode_produksi}`)
  const [cardTableVisible, setCardTableVisible] = useState<Record<string, boolean>>({});

  // Share Modal
  const [shareModal, setShareModal] = useState<{
    isOpen: boolean;
    noSuratJalan: string;
    targetType: 'wa' | 'email';
    targetValue: string;
  }>({ isOpen: false, noSuratJalan: '', targetType: 'wa', targetValue: '' });

  // Webcam Modal
  const [webcamOpen, setWebcamOpen] = useState<boolean>(false);
  const [activeWebcamBlockIndex, setActiveWebcamBlockIndex] = useState<number | null>(null);
  const [editModalWebcamIndex, setEditModalWebcamIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      // Auto-cleanup any mismatched global notes (e.g. BIS Florence accidentally copied to other codes)
      await cleanMismatchedPenerimaanNotesInSupabase();

      const res = await fetchPenerimaanProduksiFromSupabase({
        kategori: filterKategori !== 'Semua' ? filterKategori : undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
      });
      setDataList(res);
    } catch (err: any) {
      console.error('Gagal memuat penerimaan produksi:', err);
      onShowToast('Gagal memuat riwayat penerimaan barang', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const handleSyncOffline = async () => {
    setIsSyncing(true);
    try {
      const result = await syncOfflinePenerimaanProduksi();
      if (result.synced > 0) {
        onShowToast(`Berhasil menyinkronkan ${result.synced} data offline ke Supabase.`, 'success');
      }
      if (result.failed > 0) {
        onShowToast(`Gagal menyinkronkan ${result.failed} data: ${result.errors[0] || 'Unknown Error'}`, 'error');
      }
      if (result.synced === 0 && result.failed === 0) {
        onShowToast(`Tidak ada data offline yang perlu disinkronkan.`, 'info');
      }
      await loadData();
    } catch (err: any) {
      onShowToast(`Terjadi kesalahan saat sync: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterKategori, filterStartDate, filterEndDate]);

  // Window event & Realtime listener
  useEffect(() => {
    const handleUpdateEvent = () => {
      loadData();
    };

    window.addEventListener('wms_penerimaan_produksi_updated', handleUpdateEvent);

    // Supabase Realtime Channel
    let debounceTimer: any = null;
    const triggerDebouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadData();
      }, 400);
    };

    const unsub = globalRealtimeStore.subscribe('penerimaan_produksi', triggerDebouncedSync);

    return () => {
      window.removeEventListener('wms_penerimaan_produksi_updated', handleUpdateEvent);
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, []);

  // Filtered List
  const filteredData = useMemo(() => {
    return dataList.filter((item) => {
      // Filter Kategori
      if (filterKategori !== 'Semua' && item.kategori !== filterKategori) {
        return false;
      }
      // Filter Date
      if (filterStartDate && item.tanggal_penerimaan < filterStartDate) {
        return false;
      }
      if (filterEndDate && item.tanggal_penerimaan > filterEndDate) {
        return false;
      }
      // Filter Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchKode = (item.kode_produksi || '').toLowerCase().includes(q);
        const matchSJ = (item.no_surat_jalan || '').toLowerCase().includes(q);
        const matchWarna = (item.warna || '').toLowerCase().includes(q);
        const matchKet = (item.keterangan || '').toLowerCase().includes(q);
        const matchOp = (item.operator || '').toLowerCase().includes(q);
        if (!matchKode && !matchSJ && !matchWarna && !matchKet && !matchOp) {
          return false;
        }
      }
      return true;
    });
  }, [dataList, filterKategori, filterStartDate, filterEndDate, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalPcs = 0;
    let lokalCmtPcs = 0;
    let kargoPcs = 0;

    for (const d of filteredData) {
      const q = Number(d.qty) || 0;
      totalPcs += q;
      if (d.kategori === 'Lokal CMT') {
        lokalCmtPcs += q;
      } else if (d.kategori === 'Kargo') {
        kargoPcs += q;
      }
    }

    return {
      totalRows: filteredData.length,
      totalPcs,
      lokalCmtPcs,
      kargoPcs,
    };
  }, [filteredData]);

  // Pagination Table
  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  // Surat Jalan Grouping (1 No. Surat Jalan = 1 Kartu)
  const suratJalanGroups = useMemo<SuratJalanGroup[]>(() => {
    const map = new Map<string, SuratJalanGroup>();
    for (const item of filteredData) {
      const sjKey = (item.no_surat_jalan || 'TANPA-SJ').trim();
      if (!map.has(sjKey)) {
        map.set(sjKey, {
          no_surat_jalan: item.no_surat_jalan || 'TANPA-SJ',
          tanggal_penerimaan: item.tanggal_penerimaan,
          kategori: item.kategori,
          operator: item.operator,
          keterangan: item.keterangan,
          items: [],
          totalPcs: 0,
          uniqueKodeCount: 0,
        });
      }
      const group = map.get(sjKey)!;
      group.items.push(item);
      group.totalPcs += Number(item.qty) || 0;
      if (!group.keterangan && item.keterangan) {
        group.keterangan = item.keterangan;
      }
    }

    for (const group of map.values()) {
      const uniqueKodes = new Set(group.items.map((i) => i.kode_produksi));
      group.uniqueKodeCount = uniqueKodes.size;
    }

    return Array.from(map.values());
  }, [filteredData]);

  // Pagination Cards
  const totalCardPages = Math.max(1, Math.ceil(suratJalanGroups.length / cardsPerPage));
  const paginatedCards = useMemo(() => {
    const start = (cardPage - 1) * cardsPerPage;
    return suratJalanGroups.slice(start, start + cardsPerPage);
  }, [suratJalanGroups, cardPage, cardsPerPage]);

  // Cetak Dokumen PDF Surat Jalan (Full 1 Surat Jalan)
  const handlePrintSJ = async (groupOrNoSJ: SuratJalanGroup | string) => {
    let targetGroup: SuratJalanGroup;
    if (typeof groupOrNoSJ === 'string') {
      const cleanSJ = groupOrNoSJ.trim().toUpperCase();
      const matching = dataList.filter(
        (d) => (d.no_surat_jalan || '').trim().toUpperCase() === cleanSJ
      );
      if (matching.length === 0) {
        onShowToast('Data Surat Jalan tidak ditemukan untuk dicetak.', 'warning');
        return;
      }
      const first = matching[0];
      const uniqueKodes = new Set(matching.map((i) => i.kode_produksi));
      const totalPcs = matching.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);
      targetGroup = {
        no_surat_jalan: first.no_surat_jalan,
        tanggal_penerimaan: first.tanggal_penerimaan,
        kategori: first.kategori,
        operator: first.operator,
        keterangan: matching.find((m) => m.keterangan)?.keterangan || first.keterangan,
        items: matching,
        totalPcs,
        uniqueKodeCount: uniqueKodes.size,
      };
    } else {
      targetGroup = { ...groupOrNoSJ };
    }

    try {
      setIsGeneratingPdf(true);
      const qr = await QRCode.toDataURL(targetGroup.no_surat_jalan || 'UNKNOWN', {
        margin: 1,
        width: 140,
        errorCorrectionLevel: 'M',
      });
      setPrintSJData({ ...targetGroup, qrCodeUrl: qr });
    } catch (err) {
      console.error('Gagal generate QR Code SJ:', err);
      setPrintSJData(targetGroup);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // WebCam Stream Helpers
  const startWebcam = async (blockIndex: number | null, isEditModal = false) => {
    if (isEditModal) {
      setEditModalWebcamIndex(blockIndex);
      setActiveWebcamBlockIndex(null);
    } else {
      setActiveWebcamBlockIndex(blockIndex);
      setEditModalWebcamIndex(null);
    }
    setWebcamOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Tidak dapat mengakses kamera:', err);
      onShowToast('Tidak dapat mengakses kamera perangkat. Silakan pilih file biasa.', 'error');
      setWebcamOpen(false);
    }
  };

  const stopWebcam = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setWebcamOpen(false);
    setActiveWebcamBlockIndex(null);
    setEditModalWebcamIndex(null);
  };

  const captureWebcamPhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    stopWebcam();

    if (activeWebcamBlockIndex !== null) {
      updateProductBlockPhoto(activeWebcamBlockIndex, dataUrl);
      onShowToast('Foto berhasil diambil dari kamera!', 'success');
    } else if (editModalWebcamIndex !== null && editingBatch) {
      const updated = [...editingBatch.items];
      if (updated[editModalWebcamIndex]) {
        updated[editModalWebcamIndex].foto_url = dataUrl;
        setEditingBatch({ ...editingBatch, items: updated });
        onShowToast('Foto item berhasil diupdate!', 'success');
      }
    }
  };

  // Image File Upload Helper with Canvas WebP Compression
  const handleImageUpload = async (file: File, blockIndex: number) => {
    try {
      const res = await compressImage(file, 1024, 0.75);
      updateProductBlockPhoto(blockIndex, res.dataUrl);
      onShowToast(`Foto produk terkompresi (${Math.round(res.compressedSize / 1024)} KB)`, 'success');
    } catch (err: any) {
      console.error('Gagal kompres foto:', err);
      onShowToast('Gagal memproses gambar foto', 'error');
    }
  };

  const updateProductBlockPhoto = (index: number, dataUrl: string) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], foto_url: dataUrl };
      }
      return next;
    });
  };

  // ========================================================
  // Form Product Blocks Management (Hierarkis)
  // Level 1: Kode Produksi
  // Level 2: Varian Warna (1 Kode -> banyak Warna)
  // Level 3: Varian Size & Qty (1 Warna -> banyak Size)
  // ========================================================

  const addProductBlock = () => {
    setProductBlocks((prev) => [...prev, createNewProductBlock()]);
  };

  const removeProductBlock = (index: number) => {
    if (productBlocks.length <= 1) {
      onShowToast('Minimal harus ada 1 kode produksi.', 'warning');
      return;
    }
    setProductBlocks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateProductBlockField = (index: number, field: 'kode_produksi' | 'catatan', val: string) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = {
          ...next[index],
          [field]: field === 'kode_produksi' ? val.toUpperCase() : val,
        };
      }
      return next;
    });
  };

  // Level 2: Warna Handlers
  const addWarnaToBlock = (blockIndex: number, copyFromWarnaIndex?: number) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target) return prev;

      let newSizes: FormVariantSize[] = [
        { id: `sz_${Date.now()}_0`, size: 'S', qty: 1 },
        { id: `sz_${Date.now()}_1`, size: 'M', qty: 1 },
        { id: `sz_${Date.now()}_2`, size: 'L', qty: 1 },
      ];

      // Jika menduplikat dari warna sebelumnya
      if (typeof copyFromWarnaIndex === 'number' && target.warnas[copyFromWarnaIndex]) {
        const sourceWarna = target.warnas[copyFromWarnaIndex];
        newSizes = sourceWarna.sizes.map((s, idx) => ({
          id: `sz_${Date.now()}_${idx}`,
          size: s.size,
          qty: s.qty,
        }));
      }

      target.warnas.push({
        id: `warna_${Date.now()}_${target.warnas.length}`,
        warna: '',
        sizes: newSizes,
      });

      return next;
    });
  };

  const removeWarnaFromBlock = (blockIndex: number, warnaIndex: number) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || target.warnas.length <= 1) {
        onShowToast('Minimal harus ada 1 varian warna untuk setiap kode produk.', 'warning');
        return prev;
      }
      target.warnas = target.warnas.filter((_, idx) => idx !== warnaIndex);
      return next;
    });
  };

  const updateWarnaName = (blockIndex: number, warnaIndex: number, val: string) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || !target.warnas[warnaIndex]) return prev;
      target.warnas[warnaIndex] = {
        ...target.warnas[warnaIndex],
        warna: val.toUpperCase(),
      };
      return next;
    });
  };

  // Level 3: Size & Qty Handlers
  const getNextSuggestedSize = (currentSizes: FormVariantSize[]): string => {
    const existing = new Set(currentSizes.map((s) => s.size.toUpperCase()));
    for (const sz of STANDARD_SIZES) {
      if (!existing.has(sz.toUpperCase())) {
        return sz;
      }
    }
    return 'XL';
  };

  const addSizeToWarna = (blockIndex: number, warnaIndex: number, specificSize?: string) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || !target.warnas[warnaIndex]) return prev;

      const w = target.warnas[warnaIndex];
      const sizeToAdd = specificSize || getNextSuggestedSize(w.sizes);

      // Cek apakah size sudah ada
      const existingIdx = w.sizes.findIndex((s) => s.size.toUpperCase() === sizeToAdd.toUpperCase());
      if (existingIdx !== -1) {
        onShowToast(`Ukuran ${sizeToAdd} sudah ada pada warna ini.`, 'info');
        return prev;
      }

      w.sizes.push({
        id: `sz_${Date.now()}_${w.sizes.length}`,
        size: sizeToAdd,
        qty: 1,
      });

      return next;
    });
  };

  const addSizesPresetToWarna = (blockIndex: number, warnaIndex: number, preset: string[]) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || !target.warnas[warnaIndex]) return prev;

      const w = target.warnas[warnaIndex];
      const existing = new Set(w.sizes.map((s) => s.size.toUpperCase()));
      for (const sz of preset) {
        if (!existing.has(sz.toUpperCase())) {
          w.sizes.push({
            id: `sz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            size: sz,
            qty: 1,
          });
        }
      }
      return next;
    });
  };

  const removeSizeFromWarna = (blockIndex: number, warnaIndex: number, sizeIndex: number) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || !target.warnas[warnaIndex]) return prev;

      const w = target.warnas[warnaIndex];
      if (w.sizes.length <= 1) {
        onShowToast('Minimal harus ada 1 ukuran pada setiap warna.', 'warning');
        return prev;
      }

      w.sizes = w.sizes.filter((_, idx) => idx !== sizeIndex);
      return next;
    });
  };

  const updateSizeField = (
    blockIndex: number,
    warnaIndex: number,
    sizeIndex: number,
    field: 'size' | 'qty',
    val: string | number
  ) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || !target.warnas[warnaIndex] || !target.warnas[warnaIndex].sizes[sizeIndex]) return prev;

      const s = { ...target.warnas[warnaIndex].sizes[sizeIndex] };
      if (field === 'qty') {
        s.qty = val === '' ? ('' as any) : Math.max(0, parseInt(String(val), 10) || 0);
      } else {
        s.size = String(val).trim();
      }
      target.warnas[warnaIndex].sizes[sizeIndex] = s;
      return next;
    });
  };

  const adjustSizeQty = (
    blockIndex: number,
    warnaIndex: number,
    sizeIndex: number,
    delta: number
  ) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || !target.warnas[warnaIndex] || !target.warnas[warnaIndex].sizes[sizeIndex]) return prev;

      const s = { ...target.warnas[warnaIndex].sizes[sizeIndex] };
      const currentQty = Number(s.qty) || 0;
      s.qty = Math.max(1, currentQty + delta);
      target.warnas[warnaIndex].sizes[sizeIndex] = s;
      return next;
    });
  };

  // Form Summary live calculation (Hierarkis)
  const formSummary = useMemo(() => {
    let totalKode = 0;
    let totalWarna = 0;
    let totalVariants = 0;
    let totalPcs = 0;

    for (const b of productBlocks) {
      if (b.kode_produksi.trim()) totalKode++;
      for (const w of b.warnas) {
        if (w.warna.trim()) totalWarna++;
        for (const s of w.sizes) {
          totalVariants++;
          totalPcs += Number(s.qty) || 0;
        }
      }
    }

    return { totalKode, totalWarna, totalVariants, totalPcs };
  }, [productBlocks]);

  // Reset Form
  const handleResetForm = () => {
    setFormTanggal(new Date().toISOString().split('T')[0]);
    setFormNoSuratJalan('');
    setFormKeteranganGlobal('');
    setProductBlocks([createNewProductBlock()]);
    try {
      localStorage.removeItem('wms_penerimaan_produksi_form_draft');
    } catch {}
  };

  // Submit Form (Batch Save)
  const handleSubmitPenerimaan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formNoSuratJalan.trim()) {
      onShowToast('No. Surat Jalan / Resi wajib diisi!', 'error');
      return;
    }

    // Validate product blocks and flatten to PenerimaanProdukBlock
    const cleanedBlocks: PenerimaanProdukBlock[] = [];
    for (let i = 0; i < productBlocks.length; i++) {
      const b = productBlocks[i];
      const kode = b.kode_produksi.trim();
      if (!kode) {
        onShowToast(`Kode Produksi pada Produk #${i + 1} belum diisi!`, 'error');
        return;
      }

      const flattenedVariants: PenerimaanVariantItem[] = [];
      for (let wIdx = 0; wIdx < b.warnas.length; wIdx++) {
        const w = b.warnas[wIdx];
        const warnaName = w.warna.trim();
        if (!warnaName) {
          onShowToast(`Warna pada ${kode} (Warna #${wIdx + 1}) belum diisi!`, 'warning');
          return;
        }
        if (!w.sizes || w.sizes.length === 0) {
          onShowToast(`Warna "${warnaName}" pada ${kode} belum memiliki varian size!`, 'warning');
          return;
        }
        for (let sIdx = 0; sIdx < w.sizes.length; sIdx++) {
          const s = w.sizes[sIdx];
          const sizeName = (s.size || 'Default').trim();
          const qtyNum = Number(s.qty) || 0;
          if (qtyNum < 1) {
            onShowToast(`Qty pada ${kode} (${warnaName} / ${sizeName}) minimal 1 pcs!`, 'warning');
            return;
          }
          flattenedVariants.push({
            warna: warnaName.toUpperCase(),
            size: sizeName,
            qty: qtyNum,
          });
        }
      }

      cleanedBlocks.push({
        id: b.id,
        kode_produksi: kode.toUpperCase(),
        catatan: b.catatan,
        foto_url: b.foto_url,
        variants: flattenedVariants,
      });
    }

    setIsSaving(true);
    try {
      // 1. Upload photos to GDrive / Storage if dataUrls are large
      for (const block of cleanedBlocks) {
        if (block.foto_url && block.foto_url.startsWith('data:')) {
          try {
            const uploadedUrls = await uploadMultipleImagesToGdrive(
              [block.foto_url],
              `PENERIMAAN_${formNoSuratJalan.replace(/[^a-zA-Z0-9]/g, '_')}_${block.kode_produksi}`
            );
            if (uploadedUrls && uploadedUrls.length > 0) {
              block.foto_url = uploadedUrls[0];
            }
          } catch (ePhoto) {
            console.warn('Gagal upload foto ke Cloud Storage, fallback simpan data:', ePhoto);
          }
        }
      }

      // 2. Prepare payload
      const payload: SimpanPenerimaanPayload = {
        tanggal: formTanggal,
        kategori: formKategori,
        no_surat_jalan: formNoSuratJalan.trim().toUpperCase(),
        keterangan: formKeteranganGlobal.trim(),
        produk_list: cleanedBlocks,
      };

      const operatorName = session?.name || session?.username || 'Operator Gudang';
      const savedItems = await simpanBatchPenerimaanProduksiToSupabase(payload, operatorName);

      onShowToast(
        `Sukses menyimpan kedatangan ${cleanedBlocks.length} kode produksi (${formSummary.totalPcs} pcs)!`,
        'success'
      );

      // Otomatis push riwayat produksi bergambar ke Google Sheet (1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk)
      if (savedItems && savedItems.length > 0) {
        pushPenerimaanProduksiToGoogleSheet(savedItems)
          .then((res) => {
            if (res.success) {
              onShowToast(`📊 Terkirim ke Google Spreadsheet (${res.count} baris bergambar)`, 'info');
            }
          })
          .catch((err) => console.warn('Sync to Google Sheet warning:', err));
      }

      handleResetForm();
      setActiveTab('riwayat');
      loadData();
    } catch (err: any) {
      console.error('Gagal simpan penerimaan:', err);
      onShowToast(`Gagal menyimpan: ${err.message || 'Terjadi kesalahan sistem'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Share Modal
  const handleOpenShare = (noSuratJalan: string) => {
    setShareModal({
      isOpen: true,
      noSuratJalan: noSuratJalan,
      targetType: 'wa',
      targetValue: ''
    });
  };

  // Handle Share Submit
  const handleShareSubmit = () => {
    const { noSuratJalan, targetType, targetValue } = shareModal;
    if (!targetValue.trim()) {
      onShowToast(`Silakan masukkan ${targetType === 'wa' ? 'nomor WA' : 'alamat Email'}.`, 'error');
      return;
    }
    
    const items = dataList.filter((d) => (d.no_surat_jalan || '').trim().toUpperCase() === (noSuratJalan || '').trim().toUpperCase());
    if (items.length === 0) {
      onShowToast('Data tidak ditemukan.', 'error');
      return;
    }
    
    if (targetType === 'wa') {
      const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      
      // Group items by kode_produksi
      const groupedItems: Record<string, typeof items> = {};
      items.forEach(item => {
        const kode = (item.kode_produksi || 'Tanpa Kode').trim();
        if (!groupedItems[kode]) {
          groupedItems[kode] = [];
        }
        groupedItems[kode].push(item);
      });

      let waText = `*DATA PENERIMAAN BARANG*\nNo. Surat Jalan: *${noSuratJalan}*\nTotal Qty: ${totalQty} pcs\n\n*Daftar Barang:*\n`;
      
      Object.keys(groupedItems).forEach(kode => {
        const group = groupedItems[kode];
        const groupTotalQty = group.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
        waText += `\n📦 *${kode}* (Total: ${groupTotalQty} pcs)\n`;
        group.forEach(item => {
          waText += `   - ${item.warna} | Size ${item.size}: *${item.qty} pcs*\n`;
        });
      });
      
      const cleanPhone = normalizeWhatsAppNumber(targetValue) || targetValue;
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;
      window.open(url, '_blank');
      setShareModal(prev => ({ ...prev, isOpen: false }));
      onShowToast('Membuka WhatsApp...', 'success');
    } else {
      // CSV Export
      const headers = ['Tanggal', 'Kategori', 'No Surat Jalan', 'Kode Produksi', 'Warna', 'Size', 'Qty', 'Catatan', 'Operator'];
      const rows = items.map(it => [
        it.tanggal_penerimaan,
        it.kategori,
        it.no_surat_jalan,
        it.kode_produksi,
        it.warna,
        it.size,
        it.qty,
        it.keterangan || '-',
        it.operator || '-'
      ]);
      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Penerimaan_${noSuratJalan}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Open mailto
      const mailtoUrl = `mailto:${targetValue}?subject=Data Penerimaan Produksi - ${noSuratJalan}&body=${encodeURIComponent('Silakan temukan lampiran file CSV data penerimaan produksi yang telah didownload otomatis ke perangkat Anda.')}`;
      window.open(mailtoUrl, '_self');
      
      setShareModal(prev => ({ ...prev, isOpen: false }));
      onShowToast('CSV di-download, silakan lampirkan pada email Anda.', 'success');
    }
  };

  // Open Edit Batch Modal
  const handleOpenEditBatch = (noSuratJalan: string) => {
    const cleanSJ = (noSuratJalan || '').trim().toUpperCase();
    const rows = dataList.filter((d) => (d.no_surat_jalan || '').trim().toUpperCase() === cleanSJ);

    if (rows.length === 0) {
      onShowToast('Data surat jalan tidak ditemukan!', 'error');
      return;
    }

    const first = rows[0];
    setEditingBatch({
      orig_no_surat_jalan: cleanSJ,
      no_surat_jalan: cleanSJ,
      kategori: first.kategori || 'Lokal CMT',
      tanggal: first.tanggal_penerimaan || new Date().toISOString().split('T')[0],
      keterangan: first.keterangan || '',
      items: rows.map((r, idx) => ({ ...r, tempId: r.id || `temp_${Date.now()}_${idx}` })),
    });
  };

  // Save Batch Edit
  const handleSaveBatchEdit = async () => {
    if (!editingBatch) return;
    if (!editingBatch.no_surat_jalan.trim()) {
      onShowToast('Nomor Surat Jalan tidak boleh kosong!', 'error');
      return;
    }
    if (editingBatch.items.length === 0) {
      onShowToast('Minimal harus ada 1 baris barang!', 'warning');
      return;
    }

    setIsUpdatingBatch(true);
    try {
      // Offload any new base64 photos to Google Drive to save 99% Supabase Egress
      const processedItems = [...editingBatch.items];
      for (const it of processedItems) {
        if (it.foto_url && it.foto_url.startsWith('data:')) {
          try {
            const uploadedUrls = await uploadMultipleImagesToGdrive(
              [it.foto_url],
              `PENERIMAAN_EDIT_${editingBatch.no_surat_jalan.replace(/[^a-zA-Z0-9]/g, '_')}_${it.kode_produksi}`
            );
            if (uploadedUrls && uploadedUrls.length > 0) {
              it.foto_url = uploadedUrls[0];
            }
          } catch (ePhoto) {
            console.warn('Gagal upload foto edit ke GDrive, fallback:', ePhoto);
          }
        }
      }

      const payload: SimpanPenerimaanPayload = {
        tanggal: editingBatch.tanggal,
        kategori: editingBatch.kategori,
        no_surat_jalan: editingBatch.no_surat_jalan.trim().toUpperCase(),
        keterangan: editingBatch.keterangan,
        items: processedItems.map((it) => ({
          tanggal_penerimaan: editingBatch.tanggal,
          kategori: editingBatch.kategori,
          no_surat_jalan: editingBatch.no_surat_jalan.trim().toUpperCase(),
          kode_produksi: (it.kode_produksi || '').trim().toUpperCase(),
          warna: (it.warna || '').trim().toUpperCase(),
          size: (it.size || 'Default').trim(),
          qty: Math.max(1, Number(it.qty) || 1),
          foto_url: it.foto_url || '',
          keterangan: (it.keterangan || '').trim(),
          operator: it.operator || session?.name || 'Operator',
        })),
      };

      await updateBatchPenerimaanProduksiInSupabase(
        editingBatch.orig_no_surat_jalan,
        payload,
        session?.name || session?.username
      );

      onShowToast(`Penerimaan ${editingBatch.no_surat_jalan} berhasil diperbarui!`, 'success');
      setEditingBatch(null);
    } catch (err: any) {
      console.error('Gagal update batch penerimaan:', err);
      onShowToast(`Gagal menyimpan perubahan: ${err.message || 'Error'}`, 'error');
    } finally {
      setIsUpdatingBatch(false);
    }
  };

  // Delete Action Confirm Trigger
  const handleConfirmDeleteSingle = (item: PenerimaanProduksiItem) => {
    setDeletingTarget({
      type: 'single',
      id: item.id,
      no_surat_jalan: item.no_surat_jalan,
      kode_produksi: `${item.kode_produksi} (${item.warna} / ${item.size})`,
      totalQty: Number(item.qty) || 1,
    });
  };

  const handleConfirmDeleteBatch = (noSuratJalan: string) => {
    const cleanSJ = (noSuratJalan || '').trim().toUpperCase();
    const rows = dataList.filter((d) => (d.no_surat_jalan || '').trim().toUpperCase() === cleanSJ);
    const totalQty = rows.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);

    setDeletingTarget({
      type: 'batch',
      no_surat_jalan: cleanSJ,
      totalRows: rows.length,
      totalQty,
    });
  };

  // Konfirmasi hapus seluruh varian dari satu kartu produk
  const handleConfirmDeleteProduct = (group: SuratJalanGroup, prod: ProductCardGroup) => {
    setDeletingTarget({
      type: 'product',
      no_surat_jalan: group.no_surat_jalan,
      kode_produksi: prod.kode_produksi,
      items: prod.items,
      totalRows: prod.items.length,
      totalQty: prod.totalQty,
    });
  };

  // Cetak Barcode Thermal untuk 1 kartu produk (seperti di Katalog)
  const handlePrintProductBarcode = (group: SuratJalanGroup, prod: ProductCardGroup) => {
    const cleanCode = prod.kode_produksi.trim().toUpperCase();
    const matched = (productCatalog || []).find((p) => {
      const pSku = typeof p.k === 'string' ? p.k : typeof p.sku === 'string' ? (p.sku as string) : '';
      const pCode = typeof p.kode_produksi === 'string' ? (p.kode_produksi as string) : '';
      return (
        (pCode && pCode.trim().toUpperCase() === cleanCode) ||
        (pSku && pSku.trim().toUpperCase() === cleanCode)
      );
    });

    const pName: string =
      matched && typeof matched.nama_produk === 'string'
        ? matched.nama_produk
        : matched && typeof matched.n === 'string'
        ? matched.n
        : prod.kode_produksi;

    const pPrice: string =
      matched && (typeof matched.harga_jual === 'number' || typeof matched.harga_jual === 'string')
        ? String(matched.harga_jual)
        : matched && (typeof matched.price === 'number' || typeof matched.price === 'string')
        ? String(matched.price)
        : '';

    const barcodeItem: KatalogItem = {
      id: `PROD-${prod.kode_produksi}`,
      nomor: prod.kode_produksi,
      deskripsi: pName,
      price: pPrice,
      catalog_name: group.no_surat_jalan,
      image_url: prod.foto_url || '',
      variants: prod.items.map((it) => ({
        warna: it.warna || '-',
        size: it.size || 'Default',
        sku: `${prod.kode_produksi}-${(it.warna || 'DEF').slice(0, 3).toUpperCase()}-${it.size || 'S'}`,
        qty: it.qty || 1,
      })),
    };

    setBarcodeModalTarget(barcodeItem);
  };

  // Execute Delete
  const handleExecuteDelete = async () => {
    if (!deletingTarget) return;

    setIsDeleting(true);
    const prevList = [...dataList];
    if (deletingTarget.type === 'single' && deletingTarget.id) {
      setDataList((prev) => prev.filter((it) => it.id !== deletingTarget.id));
    } else if (deletingTarget.type === 'product' && deletingTarget.kode_produksi) {
      const cleanSJ = (deletingTarget.no_surat_jalan || '').trim().toUpperCase();
      const cleanKode = (deletingTarget.kode_produksi || '').trim().toUpperCase();
      setDataList((prev) =>
        prev.filter(
          (it) =>
            !(
              (it.no_surat_jalan || '').trim().toUpperCase() === cleanSJ &&
              (it.kode_produksi || '').trim().toUpperCase() === cleanKode
            )
        )
      );
    } else if (deletingTarget.type === 'batch') {
      setDataList((prev) => prev.filter((it) => it.no_surat_jalan !== deletingTarget.no_surat_jalan));
    }

    try {
      if (deletingTarget.type === 'single' && deletingTarget.id) {
        await hapusPenerimaanProduksiSingleRowFromSupabase(deletingTarget.id);
        onShowToast('1 baris item penerimaan berhasil dihapus.', 'success');
      } else if (deletingTarget.type === 'product' && deletingTarget.items) {
        for (const it of deletingTarget.items) {
          if (it.id) {
            await hapusPenerimaanProduksiSingleRowFromSupabase(it.id);
          }
        }
        onShowToast(
          `Seluruh varian produk ${deletingTarget.kode_produksi} (${deletingTarget.totalQty} pcs) berhasil dihapus!`,
          'success'
        );
      } else if (deletingTarget.type === 'batch') {
        await hapusBatchPenerimaanProduksiFromSupabase(deletingTarget.no_surat_jalan);
        onShowToast(
          `Seluruh data Surat Jalan ${deletingTarget.no_surat_jalan} (${deletingTarget.totalQty} pcs) berhasil dihapus!`,
          'success'
        );
        if (editingBatch && editingBatch.orig_no_surat_jalan === deletingTarget.no_surat_jalan) {
          setEditingBatch(null);
        }
      }
      setDeletingTarget(null);
    } catch (err: any) {
      console.error('Gagal hapus data:', err);
      setDataList(prevList);
      onShowToast('Gagal menghapus data penerimaan barang.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      onShowToast('Tidak ada data untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'Tanggal Penerimaan',
      'Kategori',
      'No Surat Jalan',
      'Kode Produksi',
      'Warna',
      'Size',
      'Qty (Pcs)',
      'Keterangan',
      'Operator',
      'Foto URL',
      'Waktu Dibuat',
    ];

    const rows = filteredData.map((d) => [
      `"${d.tanggal_penerimaan || ''}"`,
      `"${d.kategori || ''}"`,
      `"${d.no_surat_jalan || ''}"`,
      `"${d.kode_produksi || ''}"`,
      `"${d.warna || ''}"`,
      `"${d.size || ''}"`,
      Number(d.qty) || 0,
      `"${(d.keterangan || '').replace(/"/g, '""')}"`,
      `"${d.operator || ''}"`,
      `"${d.foto_url || ''}"`,
      `"${d.created_at || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Penerimaan_Produksi_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast(`Berhasil mengekspor ${filteredData.length} baris data ke CSV!`, 'success');
  };

  // Push to Google Spreadsheet (1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk) with =IMAGE(...)
  const [isPushingToSheet, setIsPushingToSheet] = useState(false);

  const handlePushToGoogleSheet = async () => {
    if (filteredData.length === 0) {
      onShowToast('Tidak ada data riwayat produksi untuk dikirim ke Google Sheet.', 'warning');
      return;
    }

    setIsPushingToSheet(true);
    onShowToast(`Mengirim ${filteredData.length} baris riwayat produksi bergambar ke Google Sheet...`, 'info');
    try {
      const res = await pushPenerimaanProduksiToGoogleSheet(filteredData);
      if (res.success) {
        onShowToast(res.message || `Sukses mengirim data ke Google Sheet!`, 'success');
        if (res.sheetUrl) {
          window.open(res.sheetUrl, '_blank');
        }
      } else {
        onShowToast(`Info kirim Google Sheet: ${res.message}`, 'warning');
        if (res.sheetUrl) {
          window.open(res.sheetUrl, '_blank');
        }
      }
    } catch (err: any) {
      onShowToast('Terjadi kesalahan saat push ke Google Sheet: ' + (err?.message || err), 'error');
    } finally {
      setIsPushingToSheet(false);
    }
  };

  return (
    <div className="space-y-3.5 sm:space-y-3 pb-16">
      {/* 1. Header Page & Tabs Combined */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2 sm:p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Top-Level Tab Switcher */}
          <div className="flex-1 grid grid-cols-3 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl sm:flex sm:bg-transparent sm:dark:bg-transparent sm:p-0 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedQcTargetCode(undefined);
                setActiveTab('riwayat');
              }}
              className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 py-2 sm:px-3 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer ${
                activeTab === 'riwayat'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 sm:bg-emerald-600 sm:text-white sm:shadow-emerald-600/25 sm:ring-2 sm:ring-emerald-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 sm:bg-slate-100 sm:dark:bg-slate-800 sm:hover:bg-slate-200 sm:dark:hover:bg-slate-700 sm:text-slate-700 sm:dark:text-slate-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Riwayat</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeTab === 'riwayat'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 sm:bg-white/20 sm:text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {filteredData.length}
              </span>
            </button>

            <button
              id="btn-tab-form-penerimaan"
              type="button"
              onClick={() => {
                setSelectedQcTargetCode(undefined);
                setActiveTab('input');
              }}
              className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 py-2 sm:px-3 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer ${
                activeTab === 'input'
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 sm:bg-teal-600 sm:text-white sm:shadow-teal-600/25 sm:ring-2 sm:ring-teal-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 sm:bg-slate-100 sm:dark:bg-slate-800 sm:hover:bg-slate-200 sm:dark:hover:bg-slate-700 sm:text-slate-700 sm:dark:text-slate-300'
              }`}
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Form Penerimaan</span>
            </button>

            <button
              id="btn-tab-qc-pengerjaan"
              type="button"
              onClick={() => {
                setSelectedQcTargetCode(undefined);
                setActiveTab('qc_pengerjaan');
              }}
              className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 py-2 sm:px-3 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer ${
                activeTab === 'qc_pengerjaan'
                  ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 sm:bg-indigo-600 sm:text-white sm:shadow-indigo-600/25 sm:ring-2 sm:ring-indigo-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 sm:bg-slate-100 sm:dark:bg-slate-800 sm:hover:bg-slate-200 sm:dark:hover:bg-slate-700 sm:text-slate-700 sm:dark:text-slate-300'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Pengerjaan QC</span>
            </button>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          TAB 1: INPUT KEDATANGAN BARANG (BATCH INPUT)
          ======================================================== */}
      {activeTab === 'input' && (
        <form onSubmit={handleSubmitPenerimaan} className="space-y-2 sm:space-y-3">
          {/* Card 1: Informasi Header Surat Jalan */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-3.5 sm:mb-5 pb-2.5 sm:pb-3 border-b border-slate-100 dark:border-slate-800">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 dark:text-teal-400" />
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                1. Informasi Dokumen Kedatangan
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-2">
              {/* Kategori Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kategori Kedatangan <span className="text-primary-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormKategori('Lokal CMT')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs font-black transition cursor-pointer ${
                      formKategori === 'Lokal CMT'
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <span>🏭</span>
                    <span>Lokal CMT</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormKategori('Kargo')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs font-black transition cursor-pointer ${
                      formKategori === 'Kargo'
                        ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <span>🚚</span>
                    <span>Kargo</span>
                  </button>
                </div>
              </div>

              {/* Tanggal Penerimaan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tanggal Penerimaan <span className="text-primary-500">*</span>
                </label>
                <input
                  type="date"
                  value={formTanggal}
                  onChange={(e) => setFormTanggal(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* No. Surat Jalan / Resi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No. Surat Jalan / Resi <span className="text-primary-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={formKategori === 'Lokal CMT' ? 'SJ-2026/04/001' : 'RESI-JNT-100234'}
                  value={formNoSuratJalan}
                  onChange={(e) => setFormNoSuratJalan(e.target.value.toUpperCase())}
                  required
                  className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white uppercase placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Keterangan Global */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Penerimaan Global
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pengiriman batch 1, vendor CMT Jaya"
                  value={formKeteranganGlobal}
                  onChange={(e) => setFormKeteranganGlobal(e.target.value)}
                  className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Tabel Input Produk & Varian (Excel Spreadsheet Style - Ringkas & Cepat di HP) */}
          <div className="space-y-3">
            {/* Header Ringkas Section */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-600 text-white shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Tabel Varian Produksi (Model Excel)</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {productBlocks.length} Kode
                    </span>
                  </h2>
                </div>
              </div>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                1 Kode ➔ Banyak Warna ➔ Banyak Size
              </span>
            </div>

            {/* Loop Setiap Kode Produk (Tampilan Sheet / Tabel Excel Ringkas) */}
            {productBlocks.map((block, blockIdx) => {
              const blockTotalPcs = block.warnas.reduce(
                (sum, w) => sum + w.sizes.reduce((sSum, s) => sSum + (Number(s.qty) || 0), 0),
                0
              );

              return (
                <div
                  key={block.id}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs transition-all"
                >
                  {/* BARIS 1: Header Kode Produk (Kompak satu baris, hemat tempat) */}
                  <div className="bg-slate-100 dark:bg-slate-800/90 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                      <span className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center text-xs font-black shrink-0">
                        {blockIdx + 1}
                      </span>
                      <div className="flex items-center gap-1.5 flex-1 max-w-xs">
                        <input
                          type="text"
                          placeholder="KODE PRODUKSI *"
                          value={block.kode_produksi}
                          onChange={(e) => updateProductBlockField(blockIdx, 'kode_produksi', e.target.value)}
                          required
                          className="w-full px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs sm:text-sm font-mono font-black text-slate-900 dark:text-white uppercase placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="hidden sm:block flex-1 min-w-[140px]">
                        <input
                          type="text"
                          placeholder="Catatan produk (opsional)"
                          value={block.catatan || ''}
                          onChange={(e) => updateProductBlockField(blockIdx, 'catatan', e.target.value)}
                          className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Quick Foto & Action Baris Header */}
                    <div className="flex items-center gap-2">
                      {/* Foto Button / Thumbnail Mini */}
                      {block.foto_url ? (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700">
                          <img
                            src={block.foto_url}
                            alt="Foto"
                            className="w-6 h-6 rounded object-cover cursor-pointer hover:opacity-80"
                            onClick={() =>
                              setLightboxImage({
                                url: block.foto_url!,
                                title: block.kode_produksi || `Produk #${blockIdx + 1}`,
                                subtitle: `Surat Jalan: ${formNoSuratJalan || '-'}`,
                              })
                            }
                            title="Klik untuk perbesar"
                          />
                          <button
                            type="button"
                            onClick={() => updateProductBlockPhoto(blockIdx, '')}
                            className="text-rose-500 hover:text-rose-700 text-xs font-bold px-0.5"
                            title="Hapus foto"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startWebcam(blockIdx, false)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 border border-slate-300 dark:border-slate-600 cursor-pointer shadow-2xs"
                            title="Buka Kamera HP"
                          >
                            <Camera className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">Kamera</span>
                          </button>
                          <label
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 border border-slate-300 dark:border-slate-600 cursor-pointer shadow-2xs"
                            title="Pilih Foto dari Galeri"
                          >
                            <Upload className="w-3.5 h-3.5 text-slate-500" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleImageUpload(e.target.files[0], blockIdx);
                                }
                              }}
                            />
                          </label>
                        </div>
                      )}

                      {/* Total Pcs Produk */}
                      <span className="px-2 py-1 rounded-md text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400">
                        {blockTotalPcs} pcs
                      </span>

                      {/* Hapus Produk (Jika > 1) */}
                      {productBlocks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProductBlock(blockIdx)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                          title="Hapus Kode Produk Ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Catatan di HP (jika layar kecil) */}
                  <div className="sm:hidden px-3 py-1.5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700">
                    <input
                      type="text"
                      placeholder="Catatan khusus produk (opsional)"
                      value={block.catatan || ''}
                      onChange={(e) => updateProductBlockField(blockIdx, 'catatan', e.target.value)}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  {/* BARIS 2: Tabel Spreadsheet Varian Warna & Size */}
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {block.warnas.map((w, wIdx) => {
                      const warnaTotalPcs = w.sizes.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);

                      return (
                        <div
                          key={w.id}
                          className="p-2 sm:p-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          {/* Sub-Baris: Warna & Subtotal */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5">
                            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                              <span className="w-5 h-5 rounded bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                                {wIdx + 1}
                              </span>
                              <input
                                type="text"
                                placeholder="NAMA WARNA (cth: BLACK, NAVY)"
                                value={w.warna}
                                onChange={(e) => updateWarnaName(blockIdx, wIdx, e.target.value)}
                                list={`colors-list-${blockIdx}-${wIdx}`}
                                required
                                className="w-full max-w-[200px] sm:max-w-xs px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-black text-slate-900 dark:text-white uppercase placeholder:font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <datalist id={`colors-list-${blockIdx}-${wIdx}`}>
                                {POPULAR_COLORS.map((c) => (
                                  <option key={c} value={c} />
                                ))}
                              </datalist>

                              {/* Presets Cepat Ukuran (1 Tap mengisi S, M, L) */}
                              <div className="hidden md:flex items-center gap-1 text-[10.5px]">
                                <span className="text-slate-400">Set:</span>
                                <button
                                  type="button"
                                  onClick={() => addSizesPresetToWarna(blockIdx, wIdx, ['S', 'M', 'L'])}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                                >
                                  +S,M,L
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addSizesPresetToWarna(blockIdx, wIdx, ['S', 'M', 'L', 'XL'])}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                                >
                                  +S,M,L,XL
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addSizesPresetToWarna(blockIdx, wIdx, ['ALL SIZE'])}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                                >
                                  +ALL SIZE
                                </button>
                              </div>
                            </div>

                            {/* Subtotal & Aksi Warna */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                {warnaTotalPcs} pcs
                              </span>

                              <button
                                type="button"
                                onClick={() => addWarnaToBlock(blockIdx, wIdx)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                                title="Duplikat warna ini beserta semua ukurannya"
                              >
                                <Copy className="w-3 h-3" />
                                <span className="hidden sm:inline">Duplikat</span>
                              </button>

                              {block.warnas.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeWarnaFromBlock(blockIdx, wIdx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                                  title="Hapus Warna Ini"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Deretan Sel Ukuran & Kuantitas (Excel Cells Ringkas) */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {w.sizes.map((s, sIdx) => (
                              <div
                                key={s.id}
                                className="inline-flex items-center border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 overflow-hidden shadow-2xs"
                              >
                                <select
                                  value={s.size}
                                  onChange={(e) =>
                                    updateSizeField(blockIdx, wIdx, sIdx, 'size', e.target.value)
                                  }
                                  className="bg-slate-100 dark:bg-slate-700 font-black text-xs px-1.5 py-1 text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-600 focus:outline-none cursor-pointer"
                                >
                                  {STANDARD_SIZES.map((sz) => (
                                    <option key={sz} value={sz}>
                                      {sz}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  value={s.qty}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) =>
                                    updateSizeField(blockIdx, wIdx, sIdx, 'qty', e.target.value)
                                  }
                                  onBlur={() => {
                                    if (s.qty === '' || Number(s.qty) < 1) {
                                      updateSizeField(blockIdx, wIdx, sIdx, 'qty', 1);
                                    }
                                  }}
                                  className="w-12 sm:w-14 px-1 py-1 text-center font-black text-xs text-slate-900 dark:text-white bg-transparent focus:outline-none"
                                />
                                {w.sizes.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeSizeFromWarna(blockIdx, wIdx, sIdx)}
                                    className="px-1 text-slate-400 hover:text-rose-500 font-bold text-xs"
                                    title="Hapus size"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}

                            {/* Tombol Tambah Size Tepat di Samping/Bawah Size */}
                            <button
                              type="button"
                              onClick={() => addSizeToWarna(blockIdx, wIdx)}
                              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-dashed border-emerald-300 dark:border-emerald-700 transition cursor-pointer"
                              title="Tambah Ukuran ke Warna Ini"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Size</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* FOOTER TABEL WARNA: Tombol Tambah Warna TEPAT DI BAWAH DAFTAR WARNA! */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 sm:px-3 sm:py-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addWarnaToBlock(blockIdx)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-indigo-300 dark:border-indigo-700 shadow-2xs transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Tambah Warna</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => addWarnaToBlock(blockIdx, block.warnas.length - 1)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 transition cursor-pointer"
                        title="Salin ukuran dari warna sebelumnya ke warna baru"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Salin Warna Terakhir</span>
                      </button>
                    </div>

                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Subtotal: <strong className="text-emerald-600">{blockTotalPcs} pcs</strong> ({block.warnas.length} Warna)
                    </span>
                  </div>
                </div>
              );
            })}

            {/* TOMBOL TAMBAH PRODUK (KODE BARU) TEPAT DI BAWAH DAFTAR PRODUK! */}
            <div className="pt-1 flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={addProductBlock}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Produk (Kode Baru)</span>
              </button>

              <span className="text-xs text-slate-500 font-semibold">
                Selesai isi produk? Tap tombol di atas untuk menambah kode produk berikutnya.
              </span>
            </div>
          </div>

          {/* Action Bar & Summary Footer */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 sm:p-3 shadow-md sticky bottom-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Ringkasan Input:</span>
              <span className="px-3 py-1 rounded-xl text-xs font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {formSummary.totalKode} Kode • {formSummary.totalWarna} Warna • {formSummary.totalVariants} Ukuran • {formSummary.totalPcs} Pcs
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60" title="Draft tersimpan otomatis offline di perangkat. Aman jika reload atau tertutup.">
                <CheckCircle2 className="w-3 h-3 text-blue-500" />
                Draft Offline Tersimpan
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleResetForm}
                disabled={isSaving}
                className="flex-1 sm:flex-initial px-2 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Reset Form
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan Seluruh Data...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan Semua Penerimaan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================
          TAB 2: RIWAYAT PENERIMAAN BARANG (VIEW & TABLE)
          ======================================================== */}
      {activeTab === 'riwayat' && (
        <div className="space-y-3 sm:space-y-3">
          {/* Filter Toolbar - Clean & space-efficient */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3 items-center">
              {/* Search Bar */}
              <div className="lg:col-span-3 relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari Kode, SJ, Warna, Catatan..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-8.5 pr-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Filter Kategori */}
              <div className="lg:col-span-3">
                <select
                  value={filterKategori}
                  onChange={(e) => {
                    setFilterKategori(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="Semua">Semua Kategori (CMT &amp; Kargo)</option>
                  <option value="Lokal CMT">🏭 Hanya Lokal CMT</option>
                  <option value="Kargo">🚚 Hanya Kargo</option>
                </select>
              </div>

              {/* Date Start & Date End */}
              <div className="col-span-1 sm:col-span-2 lg:col-span-4 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => {
                    setFilterStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  title="Dari Tanggal"
                />
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => {
                    setFilterEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  title="Sampai Tanggal"
                />
              </div>

              {/* Action Buttons: Reset & Sync */}
              <div className="col-span-1 sm:col-span-2 lg:col-span-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterKategori('Semua');
                    setFilterStartDate('');
                    setFilterEndDate('');
                    setCurrentPage(1);
                  }}
                  className="w-full py-1.5 sm:py-2 px-2.5 rounded-lg sm:rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition text-center cursor-pointer"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={handleSyncOffline}
                  disabled={isSyncing}
                  className="w-full py-1.5 sm:py-2 px-2.5 rounded-lg sm:rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 transition flex justify-center items-center gap-1 disabled:opacity-50 cursor-pointer"
                  title="Sinkronisasi Data Offline"
                >
                  {isSyncing ? (
                    <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span className="truncate">Sync</span>
                </button>
              </div>
            </div>
          </div>

          {/* View Mode Switcher: Spreadsheet Excel vs Kartu Produk vs Tabel Detail */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3 sm:px-4 sm:py-3 shadow-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Mode Tampilan:
              </span>
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('matrix');
                    try { localStorage.setItem('wms_penerimaan_view_mode', 'matrix'); } catch {}
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === 'matrix'
                      ? 'bg-rose-500 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Format Spreadsheet Excel Produksi (Identik Google Sheets)"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>📊 Spreadsheet Excel (Master)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('card');
                    try { localStorage.setItem('wms_penerimaan_view_mode', 'card'); } catch {}
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === 'card'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Kartu Produk ({suratJalanGroups.length} SJ)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('table');
                    try { localStorage.setItem('wms_penerimaan_view_mode', 'table'); } catch {}
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Tabel Detail ({filteredData.length} Baris)</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">Format:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {viewMode === 'matrix'
                  ? 'Master Spreadsheet: Grouping Kode, UP, Foto, Warna, Size, Matrix Tanggal & Kesimpulan'
                  : viewMode === 'card'
                  ? '1 Surat Jalan berisi Kartu-Kartu Produk (1 Produk = 1 Kartu)'
                  : '1 Baris = 1 Varian Produk (Tabel Detail)'}
              </span>
            </div>
          </div>

          {/* Conditional View: Matrix Spreadsheet vs Card vs Table */}
          {viewMode === 'matrix' ? (
            <ProduksiSpreadsheetView
              dataList={dataList}
              productCatalog={productCatalog}
              onOpenLightbox={(img) => setLightboxImage(img)}
              onShowToast={onShowToast}
              onOpenHitungUlang={handleOpenHitungUlang}
            />
          ) : viewMode === 'card' ? (
            /* Card View Layout: 1 Surat Jalan Container = Kumpulan Kartu Produk (1 Produk = 1 Kode Produk) */
            <div className="space-y-4">
              {/* Quick Toolbar for SJ Cards */}
              {suratJalanGroups.length > 0 && !isLoading && (
                <div className="flex items-center justify-between px-1 text-xs text-slate-500 flex-wrap gap-2">
                  <span>
                    Menampilkan <strong className="text-slate-700 dark:text-slate-200">{paginatedCards.length}</strong> dari{' '}
                    <strong className="text-slate-700 dark:text-slate-200">{suratJalanGroups.length}</strong> Surat Jalan
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleOpenHitungUlang()}
                      className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-bold transition flex items-center gap-1 border border-rose-200 dark:border-rose-800 cursor-pointer"
                      title="Buka Lembar Verifikasi & Hitung Ulang Fisik"
                    >
                      <Layers className="w-3.5 h-3.5 text-rose-500" />
                      <span>Lembar Hitung Ulang</span>
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        paginatedCards.forEach((g) => { next[g.no_surat_jalan] = true; });
                        setExpandedCards(next);
                      }}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Buka Semua SJ
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        paginatedCards.forEach((g) => { next[g.no_surat_jalan] = false; });
                        setExpandedCards(next);
                      }}
                      className="text-xs font-bold text-slate-500 hover:underline cursor-pointer"
                    >
                      Tutup Semua SJ
                    </button>
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 shadow-xs">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                  <span className="font-semibold text-xs">Memuat data penerimaan produksi...</span>
                </div>
              ) : paginatedCards.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 shadow-xs">
                  <Package className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <span className="font-semibold text-xs">
                    {searchQuery || filterKategori !== 'Semua'
                      ? 'Tidak ada Surat Jalan yang cocok dengan filter.'
                      : 'Belum ada data kedatangan barang tersimpan.'}
                  </span>
                </div>
              ) : (
                <div className="space-y-5">
                  {paginatedCards.map((group) => {
                    const productCards = groupItemsByProductCode(group.items);
                    const isExpanded = expandedCards[group.no_surat_jalan] !== false;

                    return (
                      <div
                        key={group.no_surat_jalan}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 hover:border-emerald-300 dark:hover:border-emerald-700/60 transition"
                      >
                        {/* Surat Jalan Master Header Banner */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3.5 border-b border-slate-200/80 dark:border-slate-800">
                          <div className="flex items-start sm:items-center gap-3 flex-wrap">
                            {/* Kategori Badge */}
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black shadow-xs ${
                                group.kategori === 'Lokal CMT'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-amber-600 text-white'
                              }`}
                            >
                              <span>{group.kategori === 'Lokal CMT' ? '🏭' : '🚚'}</span>
                              <span>{group.kategori}</span>
                            </span>

                            {/* No Surat Jalan */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-slate-400">No. Surat Jalan:</span>
                              <h3 className="text-base sm:text-lg font-mono font-black text-slate-900 dark:text-white tracking-tight">
                                {group.no_surat_jalan}
                              </h3>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(group.no_surat_jalan);
                                  onShowToast(`Disalin: ${group.no_surat_jalan}`, 'info');
                                }}
                                className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                                title="Salin No. Surat Jalan"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Date & Operator */}
                            <div className="flex items-center gap-2.5 text-xs text-slate-500 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                {group.tanggal_penerimaan}
                              </span>
                              {group.operator && (
                                <span className="inline-flex items-center gap-1 text-slate-500">
                                  • Op: <span className="font-semibold text-slate-700 dark:text-slate-300">{group.operator}</span>
                                </span>
                              )}
                            </div>

                            {/* Catatan SJ if any */}
                            {group.keterangan && (
                              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg italic">
                                "{group.keterangan}"
                              </span>
                            )}
                          </div>

                          {/* Right side: Summary Stats & Actions */}
                          <div className="flex items-center gap-2 self-end lg:self-auto flex-wrap">
                            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 text-xs font-black">
                              {productCards.length} Produk • {group.totalPcs.toLocaleString()} Pcs
                            </span>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenHitungUlang(group.items[0]?.kode_produksi, group.tanggal_penerimaan)}
                                className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition cursor-pointer"
                                title="Buka Lembar Verifikasi & Hitung Ulang Fisik SJ ini"
                              >
                                <Layers className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePrintSJ(group)}
                                disabled={isGeneratingPdf}
                                className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition cursor-pointer"
                                title="Cetak PDF Surat Jalan"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenShare(group.no_surat_jalan)}
                                className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition cursor-pointer"
                                title="Bagikan Surat Jalan"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditBatch(group.no_surat_jalan)}
                                className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition cursor-pointer"
                                title="Edit Surat Jalan"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmDeleteBatch(group.no_surat_jalan)}
                                className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition cursor-pointer"
                                title="Hapus Surat Jalan"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCards((prev) => ({
                                    ...prev,
                                    [group.no_surat_jalan]: !isExpanded,
                                  }))
                                }
                                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                                title={isExpanded ? 'Sembunyikan Kartu Produk' : 'Tampilkan Kartu Produk'}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* KARTU-KARTU PRODUK (1 Surat Jalan = beberapa kartu produk, standar tinggi & scrollable) */}
                        {isExpanded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
                            {productCards.map((prod) => {
                              const cardKey = `${group.no_surat_jalan}___${prod.kode_produksi}`;
                              const isTableVisible =
                                cardTableVisible[cardKey] !== undefined ? cardTableVisible[cardKey] : true;

                              return (
                                <PenerimaanProductCardItem
                                  key={prod.kode_produksi}
                                  prod={prod}
                                  group={group}
                                  productCatalog={productCatalog}
                                  isTableVisible={isTableVisible}
                                  onToggleTable={() =>
                                    setCardTableVisible((prev) => ({
                                      ...prev,
                                      [cardKey]: !isTableVisible,
                                    }))
                                  }
                                  onPrintBarcode={() => handlePrintProductBarcode(group, prod)}
                                  onOpenLightbox={() => {
                                    if (prod.foto_url) {
                                      setLightboxImage({
                                        url: prod.foto_url,
                                        title: `Kode: ${prod.kode_produksi}`,
                                        subtitle: `${prod.warnas.join(', ')} • ${prod.totalQty} pcs • SJ: ${group.no_surat_jalan}`,
                                      });
                                    } else {
                                      onShowToast(`Belum ada foto untuk produk ${prod.kode_produksi}`, 'info');
                                    }
                                  }}
                                  onEditProduct={() => handleOpenEditBatch(group.no_surat_jalan)}
                                  onDeleteProduct={() => handleConfirmDeleteProduct(group, prod)}
                                  onDeleteVariant={(it) => handleConfirmDeleteSingle(it)}
                                  onOpenQcJob={(kode) => {
                                    setSelectedQcTargetCode(kode);
                                    setActiveTab('qc_pengerjaan');
                                  }}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination Cards */}
              <div className="px-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs">
                <span className="text-slate-500 font-medium">
                  Menampilkan {suratJalanGroups.length === 0 ? 0 : (cardPage - 1) * cardsPerPage + 1} -{' '}
                  {Math.min(cardPage * cardsPerPage, suratJalanGroups.length)} dari {suratJalanGroups.length} Surat Jalan
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={cardPage <= 1}
                    onClick={() => setCardPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-slate-700 dark:text-slate-300 px-2">
                    Halaman {cardPage} / {totalCardPages}
                  </span>
                  <button
                    type="button"
                    disabled={cardPage >= totalCardPages}
                    onClick={() => setCardPage((p) => Math.min(totalCardPages, p + 1))}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Unified Table */
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 text-xs text-slate-500 flex-wrap gap-2">
                <span>
                  Menampilkan <strong className="text-slate-700 dark:text-slate-200">{filteredData.length}</strong> baris varian produk
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenHitungUlang()}
                  className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-rose-200 dark:border-rose-800 cursor-pointer"
                  title="Buka Lembar Verifikasi & Hitung Ulang Fisik"
                >
                  <Layers className="w-3.5 h-3.5 text-rose-500" />
                  <span>Lembar Hitung Ulang Fisik</span>
                </button>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3.5">Tanggal</th>
                    <th className="py-3 px-3">Kategori</th>
                    <th className="py-3 px-3">No. Surat Jalan</th>
                    <th className="py-3 px-2 text-center">Foto</th>
                    <th className="py-3 px-3.5">Kode Produksi</th>
                    <th className="py-3 px-3">Warna</th>
                    <th className="py-3 px-2.5 text-center">Size</th>
                    <th className="py-3 px-3 text-right">Qty</th>
                    <th className="py-3 px-3.5">Catatan</th>
                    <th className="py-3 px-3">Operator</th>
                    <th className="py-3 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                        <span className="font-semibold text-xs">Memuat data penerimaan barang...</span>
                      </td>
                    </tr>
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <Package className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <span className="font-semibold text-xs">
                          {searchQuery || filterKategori !== 'Semua'
                            ? 'Tidak ada data penerimaan yang cocok dengan filter.'
                            : 'Belum ada data kedatangan barang tersimpan.'}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition group"
                      >
                        {/* Tanggal */}
                        <td className="py-2.5 px-3.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {row.tanggal_penerimaan}
                        </td>

                        {/* Kategori Badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                              row.kategori === 'Lokal CMT'
                                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            <span>{row.kategori === 'Lokal CMT' ? '🏭' : '🚚'}</span>
                            <span>{row.kategori}</span>
                          </span>
                        </td>

                        {/* No Surat Jalan */}
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                            {row.no_surat_jalan}
                          </span>
                        </td>

                        {/* Foto Thumbnail */}
                        <td className="py-2.5 px-2 text-center">
                          {row.foto_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxImage({
                                  url: row.foto_url!,
                                  title: row.kode_produksi,
                                  subtitle: `${row.warna} - Size ${row.size} (${row.qty} pcs) • SJ: ${row.no_surat_jalan}`,
                                })
                              }
                              className="relative inline-block w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-emerald-500 transition"
                              title="Klik untuk melihat foto besar"
                            >
                              <img
                                src={row.foto_url}
                                alt="Foto"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">-</span>
                          )}
                        </td>

                        {/* Kode Produksi */}
                        <td className="py-2.5 px-3.5 font-black text-slate-900 dark:text-white whitespace-nowrap">
                          {row.kode_produksi}
                        </td>

                        {/* Warna */}
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 uppercase whitespace-nowrap">
                          {row.warna || '-'}
                        </td>

                        {/* Size */}
                        <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {row.size || 'Default'}
                          </span>
                        </td>

                        {/* Qty */}
                        <td className="py-2.5 px-3 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {(Number(row.qty) || 0).toLocaleString()} pcs
                        </td>

                        {/* Catatan */}
                        <td className="py-2.5 px-3.5 text-slate-500 max-w-[200px] truncate" title={row.keterangan || ''}>
                          {row.keterangan || '-'}
                        </td>

                        {/* Operator */}
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {row.operator || '-'}
                        </td>

                        {/* Aksi */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenHitungUlang(row.kode_produksi, row.tanggal_penerimaan)}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                              title="Buka Lembar Hitung Ulang untuk Kode ini"
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintSJ(row.no_surat_jalan)}
                              disabled={isGeneratingPdf}
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition cursor-pointer"
                              title="Cetak PDF Surat Jalan Ini"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenShare(row.no_surat_jalan)}
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition"
                              title="Bagikan Surat Jalan Ini"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditBatch(row.no_surat_jalan)}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition"
                              title="Edit Surat Jalan Ini"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteSingle(row)}
                              className="p-1.5 text-primary-500 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-950/40 rounded-lg transition"
                              title="Hapus Baris Ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-2 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-500">
                Menampilkan {filteredData.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} -{' '}
                {Math.min(currentPage * rowsPerPage, filteredData.length)} dari {filteredData.length} data
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-slate-700 dark:text-slate-300 px-2">
                  Halaman {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
          )}
        </div>
      )}

      {/* ========================================================
          MODAL: SHARE WA/EMAIL
          ======================================================== */}
      {shareModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-2 sm:p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Kirim Data Penerimaan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShareModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-2 sm:p-3 space-y-2">
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 font-medium">No. Surat Jalan</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white">{shareModal.noSuratJalan}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Metode Pengiriman</label>
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setShareModal(prev => ({ ...prev, targetType: 'wa' }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${shareModal.targetType === 'wa' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareModal(prev => ({ ...prev, targetType: 'email' }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${shareModal.targetType === 'email' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Email (CSV)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {shareModal.targetType === 'wa' ? 'Nomor WhatsApp' : 'Alamat Email'}
                </label>
                <input
                  type={shareModal.targetType === 'wa' ? 'tel' : 'email'}
                  placeholder={shareModal.targetType === 'wa' ? 'Contoh: 08123456789' : 'email@contoh.com'}
                  value={shareModal.targetValue}
                  onChange={(e) => setShareModal(prev => ({ ...prev, targetValue: e.target.value }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-2 sm:p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShareModal(prev => ({ ...prev, isOpen: false }))}
                className="px-2 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleShareSubmit}
                className="px-2 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition"
              >
                Kirim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 3: MASTER QC PENGERJAAN & REKAP KODE PRODUKSI
          ======================================================== */}
      {activeTab === 'qc_pengerjaan' && (
        <QcPengerjaanTab
          session={session}
          penerimaanItems={dataList}
          productCatalog={productCatalog}
          targetJobCode={selectedQcTargetCode}
          onShowToast={onShowToast}
        />
      )}

      {/* ========================================================
          MODAL 1: EDIT SURAT JALAN (KATALOG SPLIT-SCREEN STYLE)
          ======================================================== */}
      {editingBatch && (
        <div
          tabIndex={0}
          onPaste={async (e) => {
            if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
              const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
              if (file) {
                e.preventDefault();
                try {
                  const res = await compressImage(file, 1024, 0.75);
                  const updated = [...editingBatch.items];
                  if (updated.length > 0) {
                    updated[0].foto_url = res.dataUrl;
                    setEditingBatch({ ...editingBatch, items: updated });
                    onShowToast(`Foto surat jalan berhasil ditempel (${Math.round(res.compressedSize / 1024)} KB)!`, 'success');
                  }
                } catch (err: any) {
                  console.error('Gagal paste foto surat jalan:', err);
                  onShowToast('Gagal memproses gambar dari clipboard', 'error');
                }
              }
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs outline-none"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Edit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Edit Penerimaan Surat Jalan
                  </h3>
                  <p className="text-xs text-slate-500 font-mono font-medium">
                    No. SJ: <span className="font-bold text-slate-700 dark:text-slate-300">{editingBatch.orig_no_surat_jalan}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="p-2 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - Scrollable Split Layout */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
              {/* Top Split Layout: Left Media Preview & Upload, Right Metadata Form */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left Column: Primary Media Preview */}
                <div className="lg:col-span-5 flex flex-col gap-3">
                  <span className="block text-xs font-black text-slate-700 dark:text-slate-300">
                    Foto Utama Surat Jalan / Sampel Produk
                  </span>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingPrimaryFoto(true);
                    }}
                    onDragLeave={() => setIsDraggingPrimaryFoto(false)}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setIsDraggingPrimaryFoto(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        try {
                          const res = await compressImage(e.dataTransfer.files[0], 1024, 0.75);
                          const updated = [...editingBatch.items];
                          if (updated.length > 0) {
                            updated[0].foto_url = res.dataUrl;
                            setEditingBatch({ ...editingBatch, items: updated });
                            onShowToast(`Foto surat jalan berhasil diupload (${Math.round(res.compressedSize / 1024)} KB)!`, 'success');
                          }
                        } catch (err: any) {
                          console.error('Gagal drop foto surat jalan:', err);
                          onShowToast('Gagal memproses file gambar', 'error');
                        }
                      }
                    }}
                    onPaste={async (e) => {
                      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
                        const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
                        if (file) {
                          e.preventDefault();
                          e.stopPropagation();
                          try {
                            const res = await compressImage(file, 1024, 0.75);
                            const updated = [...editingBatch.items];
                            if (updated.length > 0) {
                              updated[0].foto_url = res.dataUrl;
                              setEditingBatch({ ...editingBatch, items: updated });
                              onShowToast(`Foto surat jalan berhasil ditempel (${Math.round(res.compressedSize / 1024)} KB)!`, 'success');
                            }
                          } catch (err: any) {
                            console.error('Gagal paste foto:', err);
                            onShowToast('Gagal memproses gambar dari clipboard', 'error');
                          }
                        }
                      }
                    }}
                    tabIndex={0}
                    className={`relative aspect-square w-full rounded-2xl bg-slate-100 dark:bg-slate-800/80 border-2 border-dashed overflow-hidden flex flex-col items-center justify-center group/hero transition-all focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                      isDraggingPrimaryFoto
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 ring-4 ring-blue-500/20 scale-[1.01]'
                        : 'border-slate-300 dark:border-slate-700 hover:border-blue-400'
                    }`}
                  >
                    {editingBatch.items.find((i) => i.foto_url)?.foto_url ? (
                      <>
                        <img
                          src={editingBatch.items.find((i) => i.foto_url)?.foto_url}
                          alt="Foto Utama"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/hero:opacity-100 transition flex flex-col items-center justify-center gap-2 p-3">
                          <div className="flex items-center gap-2">
                            <label className="px-3 py-1.5 rounded-xl bg-white text-slate-900 text-xs font-bold shadow-md hover:bg-slate-100 cursor-pointer flex items-center gap-1.5 transition">
                              <Camera className="w-4 h-4" />
                              <span>Ganti Foto</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    const res = await compressImage(e.target.files[0], 1024, 0.75);
                                    const updated = [...editingBatch.items];
                                    if (updated.length > 0) {
                                      updated[0].foto_url = res.dataUrl;
                                      setEditingBatch({ ...editingBatch, items: updated });
                                      onShowToast(`Foto diperbarui (${Math.round(res.compressedSize / 1024)} KB)`, 'success');
                                    }
                                  }
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...editingBatch.items];
                                if (updated.length > 0) {
                                  updated[0].foto_url = '';
                                  setEditingBatch({ ...editingBatch, items: updated });
                                  onShowToast('Foto utama dihapus', 'info');
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold shadow-md hover:bg-red-700 cursor-pointer flex items-center gap-1.5 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Hapus</span>
                            </button>
                          </div>
                          <span className="text-[10px] text-white/90 bg-black/50 px-2.5 py-1 rounded-full backdrop-blur-xs">
                            Bisa Drag &amp; Drop atau Paste (Ctrl+V) foto baru
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-4">
                        <div className={`w-12 h-12 rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-2 transition-all ${
                          isDraggingPrimaryFoto
                            ? 'bg-blue-500 text-white scale-110'
                            : 'bg-white dark:bg-slate-700 text-slate-400'
                        }`}>
                          <ImageIcon className="w-6 h-6" />
                        </div>
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                          {isDraggingPrimaryFoto ? 'Lepaskan foto di sini!' : 'Belum ada foto utama'}
                        </p>
                        <p className="text-[11px] text-slate-400 mb-3">
                          Upload foto nota/surat jalan atau sampel produk
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm hover:bg-blue-700 cursor-pointer transition">
                            <Upload className="w-4 h-4" />
                            <span>Pilih Foto</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                if (e.target.files && e.target.files[0]) {
                                  const res = await compressImage(e.target.files[0], 1024, 0.75);
                                  const updated = [...editingBatch.items];
                                  if (updated.length > 0) {
                                    updated[0].foto_url = res.dataUrl;
                                    setEditingBatch({ ...editingBatch, items: updated });
                                    onShowToast(`Foto utama terupload (${Math.round(res.compressedSize / 1024)} KB)`, 'success');
                                  }
                                }
                              }}
                            />
                          </label>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2.5 flex items-center justify-center gap-1">
                          <span>💡 Drag &amp; Drop atau Paste (Ctrl+V) langsung di sini</span>
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-300">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Cloud className="w-3.5 h-3.5" /> GDrive Sync Ready
                    </span>
                    <span className="font-bold">Otomatis Terkompresi</span>
                  </div>
                </div>

                {/* Right Column: Metadata Forms */}
                <div className="lg:col-span-7 space-y-4">
                  <span className="block text-xs font-black text-slate-700 dark:text-slate-300">
                    Informasi Surat Jalan &amp; Dokumen
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Kategori Penerimaan
                      </label>
                      <select
                        value={editingBatch.kategori}
                        onChange={(e) => setEditingBatch({ ...editingBatch, kategori: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Lokal CMT">🏭 Lokal CMT</option>
                        <option value="Kargo">🚚 Kargo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Tanggal Penerimaan
                      </label>
                      <input
                        type="date"
                        value={editingBatch.tanggal}
                        onChange={(e) => setEditingBatch({ ...editingBatch, tanggal: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        No. Surat Jalan (Nomor Dokumen)
                      </label>
                      <input
                        type="text"
                        value={editingBatch.no_surat_jalan}
                        onChange={(e) =>
                          setEditingBatch({ ...editingBatch, no_surat_jalan: e.target.value.toUpperCase() })
                        }
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Catatan Global Surat Jalan
                      </label>
                      <textarea
                        rows={2}
                        value={editingBatch.keterangan}
                        onChange={(e) => setEditingBatch({ ...editingBatch, keterangan: e.target.value })}
                        placeholder="Contoh: Barang datang via expedisi Indah Cargo..."
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Variant & Item Matrix Grouped by Product Model */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      Daftar Produk Dalam Surat Jalan ({groupItemsByProductModel(editingBatch.items).length} Model Produk)
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                      Total: {editingBatch.items.reduce((a, b) => a + (Number(b.qty) || 0), 0).toLocaleString()} pcs
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...editingBatch.items];
                      updated.push({
                        id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        tanggal_penerimaan: editingBatch.tanggal,
                        kategori: editingBatch.kategori,
                        no_surat_jalan: editingBatch.no_surat_jalan,
                        kode_produksi: `PROD-${groupItemsByProductModel(editingBatch.items).length + 1}`,
                        warna: 'BLACK',
                        size: 'S',
                        qty: 1,
                        foto_url: '',
                        keterangan: '',
                        operator: session?.name || 'Operator',
                      });
                      setEditingBatch({ ...editingBatch, items: updated });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Produk Model Baru</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {groupItemsByProductModel(editingBatch.items).map((prod, pIdx) => (
                    <div
                      key={prod.key}
                      className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3"
                    >
                      {/* Product Model Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-black">
                            {pIdx + 1}
                          </span>
                          <span className="text-xs font-black uppercase text-slate-900 dark:text-white">
                            Produk Model: {prod.kode_produksi} ({prod.warna})
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                            {prod.totalQty} pcs
                          </span>
                          {editingBatch.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = editingBatch.items.filter(
                                  (it) =>
                                    !(
                                      (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase() === prod.kode_produksi &&
                                      (it.warna || 'DEFAULT').trim().toUpperCase() === prod.warna
                                    )
                                );
                                setEditingBatch({ ...editingBatch, items: updated });
                              }}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-950/50 rounded-lg transition cursor-pointer"
                              title="Hapus Model Produk Ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Main Form Fields for Product Model */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                        {/* Photo Upload Thumbnail */}
                        <div className="md:col-span-3 flex flex-col items-center">
                          {prod.foto_url ? (
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDraggingProdKey(prod.key);
                              }}
                              onDragLeave={() => setDraggingProdKey(null)}
                              onDrop={async (e) => {
                                e.preventDefault();
                                setDraggingProdKey(null);
                                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                  try {
                                    const res = await compressImage(e.dataTransfer.files[0], 1024, 0.75);
                                    const updated = editingBatch.items.map((it) => {
                                      if (
                                        (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase() === prod.kode_produksi &&
                                        (it.warna || 'DEFAULT').trim().toUpperCase() === prod.warna
                                      ) {
                                        return { ...it, foto_url: res.dataUrl };
                                      }
                                      return it;
                                    });
                                    setEditingBatch({ ...editingBatch, items: updated });
                                    onShowToast(`Foto produk diganti (${Math.round(res.compressedSize / 1024)} KB)`, 'success');
                                  } catch (err: any) {
                                    console.error('Gagal drop foto produk:', err);
                                    onShowToast('Gagal memproses gambar', 'error');
                                  }
                                }
                              }}
                              className="relative w-full h-28 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group/prodimg"
                            >
                              <img src={prod.foto_url} alt={prod.kode_produksi} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = editingBatch.items.map((it) => {
                                    if (
                                      (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase() === prod.kode_produksi &&
                                      (it.warna || 'DEFAULT').trim().toUpperCase() === prod.warna
                                    ) {
                                      return { ...it, foto_url: '' };
                                    }
                                    return it;
                                  });
                                  setEditingBatch({ ...editingBatch, items: updated });
                                }}
                                className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/prodimg:opacity-100 transition text-xs font-bold cursor-pointer"
                              >
                                Hapus Foto
                              </button>
                            </div>
                          ) : (
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDraggingProdKey(prod.key);
                              }}
                              onDragLeave={() => setDraggingProdKey(null)}
                              onDrop={async (e) => {
                                e.preventDefault();
                                setDraggingProdKey(null);
                                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                  try {
                                    const res = await compressImage(e.dataTransfer.files[0], 1024, 0.75);
                                    const updated = editingBatch.items.map((it) => {
                                      if (
                                        (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase() === prod.kode_produksi &&
                                        (it.warna || 'DEFAULT').trim().toUpperCase() === prod.warna
                                      ) {
                                        return { ...it, foto_url: res.dataUrl };
                                      }
                                      return it;
                                    });
                                    setEditingBatch({ ...editingBatch, items: updated });
                                    onShowToast(`Foto produk diupload (${Math.round(res.compressedSize / 1024)} KB)`, 'success');
                                  } catch (err: any) {
                                    console.error('Gagal drop foto produk:', err);
                                    onShowToast('Gagal memproses gambar', 'error');
                                  }
                                }
                              }}
                              onPaste={async (e) => {
                                if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
                                  const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
                                  if (file) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                      const res = await compressImage(file, 1024, 0.75);
                                      const updated = editingBatch.items.map((it) => {
                                        if (
                                          (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase() === prod.kode_produksi &&
                                          (it.warna || 'DEFAULT').trim().toUpperCase() === prod.warna
                                        ) {
                                          return { ...it, foto_url: res.dataUrl };
                                        }
                                        return it;
                                      });
                                      setEditingBatch({ ...editingBatch, items: updated });
                                      onShowToast(`Foto produk ditempel (${Math.round(res.compressedSize / 1024)} KB)`, 'success');
                                    } catch (err: any) {
                                      console.error('Gagal paste foto produk:', err);
                                      onShowToast('Gagal memproses gambar dari clipboard', 'error');
                                    }
                                  }
                                }
                              }}
                              tabIndex={0}
                              className={`w-full h-28 rounded-xl bg-white dark:bg-slate-900 border-2 border-dashed flex flex-col items-center justify-center p-2 text-center transition-all focus:ring-2 focus:ring-emerald-500 focus:outline-none ${
                                draggingProdKey === prod.key
                                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20 scale-[1.02]'
                                  : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500'
                              }`}
                            >
                              <label className="cursor-pointer flex flex-col items-center justify-center w-full h-full">
                                <Camera className={`w-5 h-5 mb-1 ${draggingProdKey === prod.key ? 'text-emerald-500 scale-110' : 'text-slate-400'}`} />
                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                  {draggingProdKey === prod.key ? 'Lepaskan Foto' : 'Upload Foto'}
                                </span>
                                <span className="text-[9px] text-slate-400 mt-0.5">Drag/Paste Foto</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      const res = await compressImage(e.target.files[0], 1024, 0.75);
                                      const updated = editingBatch.items.map((it) => {
                                        if (
                                          (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase() === prod.kode_produksi &&
                                          (it.warna || 'DEFAULT').trim().toUpperCase() === prod.warna
                                        ) {
                                          return { ...it, foto_url: res.dataUrl };
                                        }
                                        return it;
                                      });
                                      setEditingBatch({ ...editingBatch, items: updated });
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        {/* Kode Produksi, Warna, and Variants */}
                        <div className="md:col-span-9 space-y-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                                Kode Produksi
                              </label>
                              <input
                                type="text"
                                value={prod.kode_produksi}
                                onChange={(e) => {
                                  const newKode = e.target.value.toUpperCase();
                                  const updated = editingBatch.items.map((it) => {
                                    if (
                                      (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase() === prod.kode_produksi &&
                                      (it.warna || 'DEFAULT').trim().toUpperCase() === prod.warna
                                    ) {
                                      return { ...it, kode_produksi: newKode };
                                    }
                                    return it;
                                  });
                                  setEditingBatch({ ...editingBatch, items: updated });
                                }}
                                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                                Warna
                              </label>
                              <input
                                type="text"
                                value={prod.warna}
                                onChange={(e) => {
                                  const newWarna = e.target.value.toUpperCase();
                                  const updated = editingBatch.items.map((it) => {
                                    if (
                                      (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase() === prod.kode_produksi &&
                                      (it.warna || 'DEFAULT').trim().toUpperCase() === prod.warna
                                    ) {
                                      return { ...it, warna: newWarna };
                                    }
                                    return it;
                                  });
                                  setEditingBatch({ ...editingBatch, items: updated });
                                }}
                                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          {/* Size & Quantity Variants Grid */}
                          <div className="space-y-1.5">
                            <span className="block text-[10px] font-bold uppercase text-slate-500">
                              Varian Size &amp; Kuantitas:
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {prod.items.map((vItem, vIdx) => (
                                <div
                                  key={vItem.id || `v_${vIdx}`}
                                  className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-1"
                                >
                                  <select
                                    value={vItem.size}
                                    onChange={(e) => {
                                      const newSize = e.target.value;
                                      const updated = editingBatch.items.map((it) =>
                                        it === vItem ? { ...it, size: newSize } : it
                                      );
                                      setEditingBatch({ ...editingBatch, items: updated });
                                    }}
                                    className="bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none"
                                  >
                                    {STANDARD_SIZES.map((sz) => (
                                      <option key={sz} value={sz}>
                                        {sz}
                                      </option>
                                    ))}
                                  </select>

                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={1}
                                      value={vItem.qty ?? ''}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const newQty = val === '' ? ('' as any) : Math.max(0, parseInt(val, 10) || 0);
                                        const updated = editingBatch.items.map((it) =>
                                          it === vItem ? { ...it, qty: newQty } : it
                                        );
                                        setEditingBatch({ ...editingBatch, items: updated });
                                      }}
                                      className="w-14 px-1.5 py-1 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-black text-slate-900 dark:text-white"
                                    />
                                    {prod.items.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = editingBatch.items.filter((it) => it !== vItem);
                                          setEditingBatch({ ...editingBatch, items: updated });
                                        }}
                                        className="p-1 text-slate-400 hover:text-rose-500 rounded transition cursor-pointer"
                                        title="Hapus size ini"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Button Tambah Varian Size */}
                            <button
                              type="button"
                              onClick={() => {
                                const existingSizes = prod.items.map((it) => it.size);
                                const nextSize = getNextSize(existingSizes[existingSizes.length - 1] || 'S');
                                const newItem: PenerimaanProduksiItem = {
                                  id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                                  tanggal_penerimaan: editingBatch.tanggal,
                                  kategori: editingBatch.kategori,
                                  no_surat_jalan: editingBatch.no_surat_jalan,
                                  kode_produksi: prod.kode_produksi,
                                  warna: prod.warna,
                                  size: nextSize,
                                  qty: 1,
                                  foto_url: prod.foto_url || '',
                                  keterangan: editingBatch.keterangan || '',
                                  operator: session?.name || 'Operator',
                                };
                                setEditingBatch({ ...editingBatch, items: [...editingBatch.items, newItem] });
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline pt-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Tambah Varian Size</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => handleConfirmDeleteBatch(editingBatch.orig_no_surat_jalan)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Seluruh Surat Jalan</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  disabled={isUpdatingBatch}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveBatchEdit}
                  disabled={isUpdatingBatch}
                  className="inline-flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-50 cursor-pointer"
                >
                  {isUpdatingBatch ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: CONFIRM DELETE MODAL
          ======================================================== */}
      {deletingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Konfirmasi Hapus Data
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {deletingTarget.type === 'single'
                    ? `Apakah Anda yakin ingin menghapus 1 baris item: ${deletingTarget.kode_produksi}?`
                    : deletingTarget.type === 'product'
                    ? `Apakah Anda yakin ingin menghapus SELURUH varian produk ${deletingTarget.kode_produksi} (${deletingTarget.totalQty} pcs) dari Surat Jalan ${deletingTarget.no_surat_jalan}?`
                    : `Apakah Anda yakin ingin menghapus SELURUH data Surat Jalan ${deletingTarget.no_surat_jalan} (${deletingTarget.totalRows} baris, ${deletingTarget.totalQty} pcs)?`}
                </p>
                <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                  No Surat Jalan: {deletingTarget.no_surat_jalan}
                  {deletingTarget.kode_produksi && (
                    <div className="mt-0.5 font-bold">Produk: {deletingTarget.kode_produksi}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/30 transition disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: LIGHTBOX FOTO PREVIEW
          ======================================================== */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between text-white">
              <div>
                <h4 className="text-sm font-black">{lightboxImage.title}</h4>
                {lightboxImage.subtitle && (
                  <p className="text-xs text-slate-400">{lightboxImage.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxImage.url}
                  download="Foto_Penerimaan.jpg"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  title="Unduh Foto"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  title="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-2 flex items-center justify-center bg-black/40 max-h-[75vh]">
              <img
                src={lightboxImage.url}
                alt="Enlarged"
                className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: WEBCAM CAPTURE MODAL
          ======================================================== */}
      {webcamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-4 text-white shadow-2xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <span className="text-sm font-black flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Kamera Live Snapshot</span>
              </span>
              <button
                type="button"
                onClick={stopWebcam}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full h-64 sm:h-72 bg-black rounded-xl overflow-hidden relative mb-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={stopWebcam}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={captureWebcamPhoto}
                className="flex-1 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
              >
                <Camera className="w-4 h-4" />
                <span>Ambil Foto</span>
              </button>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* ========================================================
          MODAL 5: CETAK / PRATINJAU DOKUMEN SURAT JALAN FULL
          ======================================================== */}
      {printSJData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible">
          <div className="bg-white text-slate-900 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:rounded-none print:w-full print:border-none">
            {/* Modal Header Controls (Hidden during print) */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-3 print:hidden shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Printer className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-black truncate">Cetak Dokumen Surat Jalan</h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    No. SJ: {printSJData.no_surat_jalan} • {printSJData.totalPcs.toLocaleString()} pcs
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-2 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintSJData(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content Area */}
            <div
              id="surat-jalan-print-area"
              className="p-6 sm:p-10 overflow-y-auto text-slate-900 bg-white font-sans text-xs print:p-0 print:overflow-visible"
            >
              {/* Kop Surat / Header */}
              <div className="border-b-2 border-slate-900 pb-4 mb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 block">
                      WAREHOUSE MANAGEMENT SYSTEM
                    </span>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      BUKTI PENERIMAAN PRODUKSI
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">
                      Dokumen Verifikasi Kedatangan Barang Masuk Gudang
                    </p>
                  </div>

                  {printSJData.qrCodeUrl && (
                    <div className="text-center shrink-0">
                      <img
                        src={printSJData.qrCodeUrl}
                        alt="QR Code SJ"
                        className="w-20 h-20 sm:w-24 sm:h-24 mx-auto border border-slate-200 p-1 rounded-lg"
                      />
                      <span className="block text-[9px] font-mono font-bold text-slate-500 mt-1">
                        SCAN VERIFIKASI
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata Box */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 mb-3 text-xs">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    No. Surat Jalan
                  </span>
                  <span className="font-mono font-black text-sm text-slate-900 break-all">
                    {printSJData.no_surat_jalan}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Tanggal Terima
                  </span>
                  <span className="font-bold text-slate-900">
                    {printSJData.tanggal_penerimaan}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Kategori Asal
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-indigo-700">
                    {printSJData.kategori}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Operator Penerima
                  </span>
                  <span className="font-bold text-slate-900">
                    {printSJData.operator || '-'}
                  </span>
                </div>
              </div>

              {printSJData.keterangan && (
                <div className="mb-2 p-3 bg-amber-50/60 border border-amber-200 rounded-lg text-xs text-amber-900">
                  <span className="font-bold uppercase text-[10px] block text-amber-700">Catatan Penerimaan:</span>
                  <span>{printSJData.keterangan}</span>
                </div>
              )}

              {/* Table of Items */}
              <div className="border border-slate-300 rounded-lg overflow-hidden mb-3">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-[11px] font-black text-slate-700 uppercase">
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-3">Kode Produksi</th>
                      <th className="py-2.5 px-3">Warna</th>
                      <th className="py-2.5 px-3 text-center">Size</th>
                      <th className="py-2.5 px-3 text-right">Qty (Pcs)</th>
                      <th className="py-2.5 px-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printSJData.items.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">
                          {item.kode_produksi}
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {item.warna || '-'}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-indigo-700">
                          {item.size || 'Default'}
                        </td>
                        <td className="py-2 px-3 text-right font-black font-mono text-slate-900">
                          {(Number(item.qty) || 0).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-slate-600 text-[11px]">
                          {item.keterangan || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-black border-t-2 border-slate-400 text-slate-900">
                      <td colSpan={4} className="py-2.5 px-3 text-right uppercase">
                        Total Keseluruhan ({printSJData.uniqueKodeCount} Model • {printSJData.items.length} Baris):
                      </td>
                      <td className="py-2.5 px-3 text-right text-sm font-mono font-black text-emerald-700">
                        {printSJData.totalPcs.toLocaleString()} pcs
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signature Blocks */}
              <div className="grid grid-cols-3 gap-3 pt-6 border-t border-slate-200 text-center text-xs">
                <div>
                  <span className="block text-slate-500 text-[10px] uppercase font-bold mb-14">
                    Diserahkan Oleh (Pengirim / CMT)
                  </span>
                  <div className="border-t border-slate-400 w-36 mx-auto pt-1 font-bold text-slate-700">
                    ( ............................... )
                  </div>
                </div>

                <div>
                  <span className="block text-slate-500 text-[10px] uppercase font-bold mb-14">
                    Diterima Oleh (Gudang / QC)
                  </span>
                  <div className="border-t border-slate-400 w-36 mx-auto pt-1 font-bold text-slate-900">
                    ( {printSJData.operator || '...............................'} )
                  </div>
                </div>

                <div>
                  <span className="block text-slate-500 text-[10px] uppercase font-bold mb-14">
                    Diketahui Oleh (Supervisor)
                  </span>
                  <div className="border-t border-slate-400 w-36 mx-auto pt-1 font-bold text-slate-700">
                    ( ............................... )
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <div className="mt-8 pt-3 border-t border-dashed border-slate-300 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Dicetak otomatis dari WMS Warehouse Mini</span>
                <span>Waktu Cetak: {new Date().toLocaleString('id-ID')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CETAK BARCODE / LABEL THERMAL PRODUK (Sama seperti di Katalog) */}
      <KatalogBarcodeModal
        isOpen={Boolean(barcodeModalTarget)}
        onClose={() => setBarcodeModalTarget(null)}
        item={barcodeModalTarget}
        onNotify={(msg, type) => onShowToast(msg, type)}
      />

      {/* MODAL LEMBAR VERIFIKASI & HITUNG ULANG FISIK */}
      <HitungUlangModal
        isOpen={isHitungUlangModalOpen}
        onClose={() => setIsHitungUlangModalOpen(false)}
        dataList={dataList}
        initialKodeProduksi={hitungUlangTargetKode}
        initialTanggal={hitungUlangTargetTanggal}
        onShowToast={onShowToast}
        onApplyReCountToData={(updatedItems) => {
          // Update in local state & database
          setDataList((prev) => {
            const next = prev.map((item) => {
              const matched = updatedItems.find(
                (u) =>
                  u.kode_produksi === item.kode_produksi &&
                  u.warna === item.warna &&
                  u.size === item.size &&
                  u.tanggal_penerimaan === item.tanggal_penerimaan
              );
              return matched ? { ...item, ...matched } : item;
            });
            try {
              localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(next));
            } catch {}
            return next;
          });
        }}
      />
    </div>
  );
};
