import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Printer,
  Layers,
  Image as ImageIcon,
  Check,
  X,
  FileSpreadsheet,
  Download,
  Loader2,
  Plus,
  Trash2,
  Calendar,
  Save,
  Edit3,
  CloudUpload,
  UploadCloud,
  Clipboard,
  Link as LinkIcon,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
  FileText,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  MoreHorizontal,
  Scale,
} from 'lucide-react';
import { PenerimaanProduksiItem, ProductItem, ProduksiQtyNotaRecord } from '../../types';
import { exportProduksiToModernExcel } from '../../utils/excelProduksiExporter';
import {
  pushPenerimaanProduksiToGoogleSheet,
  PRODUKSI_SPREADSHEET_ID,
  syncQtyNotaAndAutoQueueRecount,
  pushQtyNotaDeltaToGoogleSheet,
  sortMatrixBlocksNewestFirst,
  formatRecountLogEntry,
} from '../../services/gasProduksiSync';
import { compressImage } from '../../utils/imageCompressor';
import { getProxiedTrelloImageUrl } from '../Trello/TrelloImage';
import {
  supabaseFetch,
  simpanBatchPenerimaanProduksiToSupabase,
  updatePenerimaanPhotoInSupabase,
  getNextPenerimaanProduksiIds,
  getCachedProduksiQtyNotaMapSync,
  getRecountAuditMap,
  fetchRecountAuditMapFromCloud,
} from '../../services/supabase';
import { PushSuratJalanModal } from './PushSuratJalanModal';
import { PushDateSheetsModal } from './PushDateSheetsModal';
import { ProduksiActionSheet } from './ProduksiActionSheet';
import { lookupProductBySku } from '../../utils/productLookup';

interface ProduksiSpreadsheetViewProps {
  dataList: PenerimaanProduksiItem[];
  productCatalog?: ProductItem[];
  searchQuery?: string;
  filterStartDate?: string;
  filterEndDate?: string;
  onDateRangeChange?: (startDate: string, endDate: string) => void;
  onOpenLightbox: (img: { url: string; title: string; subtitle?: string }) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onOpenHitungUlang?: (kode?: string, tanggal?: string) => void;
  onOpenEditBatch?: (noSuratJalan: string) => void;
  onRefreshData?: () => Promise<void>;
}

export interface MatrixSizeItem {
  id?: string | number;
  size: string;
  qtyByDate: Record<string, number>; // dateString -> qty datang
  qtyReturByDate?: Record<string, number>; // dateString -> qty retur (Khusus CMT)
  totalSizeQty: number;
  totalSizeRetur?: number;
  // Audit & Hitung Ulang Fisik
  recountFisik?: number | null;
  recountQty?: number | null;
  recountSelisih?: number | null;
  recountStatus?: string;
  recountRound?: number;
  recountNotes?: string;
  recountAuditor?: string;
  recountUpdatedAt?: string;
  recountLog?: string;
  recountPendingBatch?: boolean;
  recountPendingQty?: number;
  recountPendingDates?: string[];
  recountAuditedDates?: string[];
}

export interface MatrixColorGroup {
  color: string;
  sizes: MatrixSizeItem[];
  totalColorQty: number;
  totalColorRetur?: number;
}

// Model per Product Block for Independent Spreadsheet Matrix
export interface MatrixProductBlock {
  id: string; // unique block id (kode_produksi)
  rowNumber: number;
  code: string; // Kode input kedatangan
  productName: string; // Optional nama produk
  upVendor: string; // Optional UP
  kategori: string; // 'Lokal CMT' | 'Kargo'
  photoUrl?: string; // Hasil upload GDrive
  catatan?: string; // Catatan / Keterangan khusus produk
  distinctSjs: { no_surat_jalan: string; qty: number; tanggal: string }[];
  dateToSjMap?: Record<string, string[]>;
  colorGroups: MatrixColorGroup[];
  dateSlots: string[]; // 10 slots of arrival dates
  returDateSlots?: string[]; // 5 slots of return dates (for CMT)
  totalDatang: number; // Gross datang
  totalRetur?: number; // Total retur
  totalNet: number; // Datang - Retur
  // Qty Nota Buyer & Selisih Nota (Total Diterima - Qty Nota)
  qtyNota?: number | null;
  selisihNota?: number | null;
  // Recount metrics for the block
  totalRecountFisik?: number | null;
  totalRecountSelisih?: number | null;
  hasRecount?: boolean;
  hasDiff?: boolean;
  hasPendingFollowUpBatch?: boolean;
  pendingFollowUpQty?: number;
  pendingFollowUpDates?: string[];
  auditedDates?: string[];
  // Kesimpulan metrics
  kg: number;
  ongkirPerKg: number;
  totalOngkir: number;
  ongkirPerPcs: number;
  // Trello Candidate Tracking
  matchedItem?: any;
  alternateCandidates?: any[];
}

const STORAGE_KEY_METRICS = 'wms_produksi_matrix_metrics_cache';
const STORAGE_KEY_TAB = 'wms_produksi_spreadsheet_tab';
const FIXED_DATE_COLUMNS_COUNT = 10;
const FIXED_RETUR_COLUMNS_COUNT = 5;
const MONTH_SHORT_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const spreadsheetCatalogNameCache = new WeakMap<ProductItem[], Map<string, string>>();

export const ProduksiSpreadsheetView: React.FC<ProduksiSpreadsheetViewProps> = ({
  dataList,
  productCatalog = [],
  searchQuery,
  filterStartDate,
  filterEndDate,
  onDateRangeChange,
  onOpenLightbox,
  onShowToast,
  onOpenHitungUlang,
  onOpenEditBatch,
  onRefreshData,
}) => {
  // Tab State: 'CMT' | 'Kargo'
  const [activeTab, setActiveTab] = useState<'CMT' | 'Kargo'>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY_TAB) as 'CMT' | 'Kargo') || 'CMT';
    } catch {
      return 'CMT';
    }
  });

  const [search, setSearch] = useState<string>('');

  // Track which block is currently in Edit Mode: { [blockId: string]: boolean }
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  // Backup of block before editing for Cancel/Undo
  const [backupBlock, setBackupBlock] = useState<MatrixProductBlock | null>(null);

  // Custom metrics (KG & Ongkir) per Kode Produksi
  const [customMetrics, setCustomMetrics] = useState<Record<string, { kg: number; ongkir: number }>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_METRICS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Master local state of product blocks
  const [blocks, setBlocks] = useState<MatrixProductBlock[]>([]);

  // Qty Nota Buyer Map (sinkron dengan Google Sheet & Supabase)
  const [qtyNotaMap, setQtyNotaMap] = useState<Record<string, ProduksiQtyNotaRecord>>(() =>
    getCachedProduksiQtyNotaMapSync()
  );
  const [isSyncingQtyNota, setIsSyncingQtyNota] = useState<boolean>(false);

  // Hasil Audit Hitung Ulang (Cloud + Local) agar kolom Fisik Hitung terisi walau belum tertulis ke item penerimaan
  const [recountAuditMapRaw, setRecountAuditMapRaw] = useState<Record<string, any>>(() => getRecountAuditMap());
  useEffect(() => {
    let alive = true;
    fetchRecountAuditMapFromCloud()
      .then((m) => { if (alive && m) setRecountAuditMapRaw(m); })
      .catch(() => { });
    const onAudit = (e: any) => {
      setRecountAuditMapRaw(e?.detail?.auditMap || getRecountAuditMap());
    };
    window.addEventListener('wms_recount_audit_updated', onAudit);
    return () => {
      alive = false;
      window.removeEventListener('wms_recount_audit_updated', onAudit);
    };
  }, []);
  const recountAuditNormMap = useMemo(() => {
    const out: Record<string, any> = {};
    Object.keys(recountAuditMapRaw || {}).forEach((k) => {
      out[String(k).replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '').trim().toUpperCase()] = recountAuditMapRaw[k];
    });
    return out;
  }, [recountAuditMapRaw]);
  // Date Range Filter & Push to Google Sheet state (synced with parent when provided)
  const [localDateFrom, setLocalDateFrom] = useState<string>('');
  const [localDateTo, setLocalDateTo] = useState<string>('');
  const [isDateRangeSheetOpen, setIsDateRangeSheetOpen] = useState<boolean>(false);
  const [isPushDateModalOpen, setIsPushDateModalOpen] = useState<boolean>(false);
  const [isPushingSheet, setIsPushingSheet] = useState<boolean>(false);
  const [isPushSJModalOpen, setIsPushSJModalOpen] = useState<boolean>(false);

  const isControlledDateRange = onDateRangeChange !== undefined;
  const dateFrom = isControlledDateRange ? (filterStartDate || '') : localDateFrom;
  const dateTo = isControlledDateRange ? (filterEndDate || '') : localDateTo;
  const hasActiveDateRange = Boolean(dateFrom || dateTo);

  const updateDateRange = (nextFrom: string, nextTo: string) => {
    if (isControlledDateRange) {
      onDateRangeChange!(nextFrom, nextTo);
    } else {
      setLocalDateFrom(nextFrom);
      setLocalDateTo(nextTo);
    }
  };

  const formatLocalIsoDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const extractIsoDate = (val?: string | null): string => {
    if (!val) return '';
    const clean = String(val).split('||')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      return clean.slice(0, 10);
    }
    return '';
  };

  const applyDatePreset = (preset: 'today' | '7d' | '30d' | 'month' | 'all') => {
    if (preset === 'all') {
      updateDateRange('', '');
      return;
    }
    const now = new Date();
    const todayStr = formatLocalIsoDate(now);
    if (preset === 'today') {
      updateDateRange(todayStr, todayStr);
      return;
    }
    if (preset === '7d') {
      const past = new Date(now);
      past.setDate(now.getDate() - 6);
      updateDateRange(formatLocalIsoDate(past), todayStr);
      return;
    }
    if (preset === '30d') {
      const past = new Date(now);
      past.setDate(now.getDate() - 29);
      updateDateRange(formatLocalIsoDate(past), todayStr);
      return;
    }
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    updateDateRange(formatLocalIsoDate(firstDay), todayStr);
  };

  // Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState<boolean>(false);
  const [actionSheetBlock, setActionSheetBlock] = useState<any | null>(null);
  const [selectedExportDates, setSelectedExportDates] = useState<string[]>([]);
  const [selectedExportSjs, setSelectedExportSjs] = useState<string[]>([]);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [exportProgressMsg, setExportProgressMsg] = useState<string>('');

  // Photo Upload, Drag & Drop, and Paste state
  const [photoModalBlockId, setPhotoModalBlockId] = useState<string | null>(null);
  const [photoUrlInput, setPhotoUrlInput] = useState<string>('');
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Format date helper: "2026-07-13" -> "13 Jul" (O(1) fast string slice for YYYY-MM-DD, supports slot "YYYY-MM-DD||SJ")
  const formatDateHeader = (dateStr: string): string => {
    if (!dateStr) return '';
    const cleanStr = dateStr.includes('||') ? dateStr.split('||')[0] : dateStr;
    if (cleanStr.length >= 10 && cleanStr[4] === '-' && cleanStr[7] === '-') {
      const m = parseInt(cleanStr.slice(5, 7), 10);
      const d = parseInt(cleanStr.slice(8, 10), 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${d} ${MONTH_SHORT_NAMES[m - 1]}`;
      }
    }
    try {
      const d = new Date(cleanStr);
      if (isNaN(d.getTime())) return cleanStr;
      return `${d.getDate()} ${MONTH_SHORT_NAMES[d.getMonth()]}`;
    } catch {
      return cleanStr;
    }
  };

  const standardSizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'ALL SIZE', 'FREE SIZE'];

  const normalizeProductCode = (code: string | undefined | null): string => {
    if (!code) return 'TANPA_KODE';
    return String(code)
      .replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '')
      .trim()
      .toUpperCase();
  };

  // Fast O(1) Catalog Map lookup for product names (cached across mounts via WeakMap)
  const catalogNameMap = useMemo(() => {
    if (!productCatalog || productCatalog.length === 0) return new Map<string, string>();
    const cached = spreadsheetCatalogNameCache.get(productCatalog);
    if (cached) return cached;

    const map = new Map<string, string>();
    for (let i = 0; i < productCatalog.length; i++) {
      const p = productCatalog[i];
      const sku = String(p.k || (p as any).sku || '').trim().toUpperCase();
      const name = String(p.p || p.n || (p as any).nama_produk || '').trim();
      if (!sku || !name) continue;
      if (!map.has(sku)) map.set(sku, name);
    }
    spreadsheetCatalogNameCache.set(productCatalog, map);
    return map;
  }, [productCatalog]);

  // Initialize or re-sync Blocks from dataList when dataList or activeTab changes
  useEffect(() => {
    if (!dataList) return;

    const isCMT = activeTab === 'CMT';
    const targetCategory = isCMT ? 'Lokal CMT' : 'Kargo';

    const tabFilteredItems = dataList.filter((it) => {
      const kat = (it.kategori || '').trim();
      if (isCMT) {
        return kat.toLowerCase().includes('cmt') || kat.toLowerCase().includes('lokal') || !kat || kat === 'Lokal CMT';
      } else {
        return kat.toLowerCase().includes('kargo') || kat === 'Kargo';
      }
    });

    // Group items by Kode Produksi
    const codeMap = new Map<string, PenerimaanProduksiItem[]>();
    tabFilteredItems.forEach((it) => {
      const code = normalizeProductCode(it.kode_produksi);
      if (!codeMap.has(code)) {
        codeMap.set(code, []);
      }
      codeMap.get(code)!.push(it);
    });

    const parsedBlocks: MatrixProductBlock[] = [];
    let rowNumber = 1;

    codeMap.forEach((items, code) => {
      let photoUrl = items.find((i) => i.foto_url && i.foto_url.trim().length > 0)?.foto_url;
      const firstItem = items[0];

      // Clean UP / Vendor & Product Name logic based on Master Catalog & Kategori
      const cleanCode = code.trim().toUpperCase();
      let upVendor = '';
      let productName = '';

      // Fallback ke Master Produk gudang & Kategori
      if (!productName) {
        const lookup = lookupProductBySku(cleanCode, productCatalog, firstItem?.nama_produk);
        if (lookup.found && lookup.nama_produk) {
          productName = lookup.nama_produk;
        } else if (catalogNameMap.has(cleanCode)) {
          productName = catalogNameMap.get(cleanCode)!;
        } else if (firstItem?.nama_produk) {
          productName = firstItem.nama_produk;
        } else if (/^[A-Za-z\s]+$/.test(cleanCode) && cleanCode.length > 3) {
          productName = cleanCode.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }

      if (!upVendor && firstItem) {
        if (firstItem.kategori === 'Lokal CMT') {
          upVendor = 'BIS';
        } else if (firstItem.keterangan && firstItem.keterangan.trim().toUpperCase().startsWith('UP:')) {
          upVendor = firstItem.keterangan.trim().substring(3).trim();
        }
      }

      // Extract unique arrival dates (Exclude retur-only records)
      const distinctDatangDates = Array.from(
        new Set(
          items
            .filter((it) => {
              const isReturOnly =
                (it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) ||
                (it.keterangan && it.keterangan.includes('RETUR_CMT:')) ||
                (Number(it.qty_retur) > 0 && (!it.qty || Number(it.qty) === 0));
              return !isReturOnly && it.tanggal_penerimaan;
            })
            .map((i) => i.tanggal_penerimaan)
            .filter(Boolean) as string[]
        )
      ).sort().reverse();

      // Extract distinct Surat Jalan and map per date (Exclude RETUR sj from arrival columns)
      const sjMap = new Map<string, { no_surat_jalan: string; qty: number; tanggal: string }>();
      const dateToSjMap: Record<string, string[]> = {};

      items.forEach((it) => {
        const sj = (it.no_surat_jalan || '').trim().toUpperCase();
        const isReturOnly = sj.startsWith('RETUR-') || (it.keterangan && it.keterangan.includes('RETUR_CMT:'));
        if (sj && !isReturOnly) {
          if (!sjMap.has(sj)) {
            sjMap.set(sj, {
              no_surat_jalan: sj,
              qty: 0,
              tanggal: it.tanggal_penerimaan || '',
            });
          }
          sjMap.get(sj)!.qty += Number(it.qty) || 0;
          if (it.tanggal_penerimaan) {
            if (!dateToSjMap[it.tanggal_penerimaan]) dateToSjMap[it.tanggal_penerimaan] = [];
            if (!dateToSjMap[it.tanggal_penerimaan].includes(sj)) {
              dateToSjMap[it.tanggal_penerimaan].push(sj);
            }
          }
        }
      });
      const distinctSjs = Array.from(sjMap.values()).sort((a, b) => b.qty - a.qty);

      // BUAT SLOT KOLOM KEDATANGAN:
      // Jika suatu tanggal memiliki lebih dari 1 Surat Jalan, pisahkan kolom per (Tanggal + No. SJ)
      // agar setiap SJ memiliki kolom tersendiri di hari yang sama secara transparan!
      const distinctDatangSlots: string[] = [];
      distinctDatangDates.forEach((d) => {
        const sjsForDate = dateToSjMap[d] || [];
        if (sjsForDate.length > 1) {
          sjsForDate.forEach((sj) => {
            distinctDatangSlots.push(`${d}||${sj}`);
          });
        } else if (sjsForDate.length === 1) {
          distinctDatangSlots.push(`${d}||${sjsForDate[0]}`);
        } else {
          distinctDatangSlots.push(d);
        }
      });

      const dateSlots: string[] = Array.from(
        { length: Math.max(FIXED_DATE_COLUMNS_COUNT, distinctDatangSlots.length) },
        (_, i) => distinctDatangSlots[i] || ''
      );

      // Extract unique return dates (Khusus CMT)
      const distinctReturDates = Array.from(
        new Set(
          items
            .map((i) => {
              if (i.tanggal_retur) return i.tanggal_retur;
              if (i.keterangan && i.keterangan.includes('RETUR_CMT:')) {
                const match = i.keterangan.match(/RETUR_CMT:\d+(?:@([\d-]+))?/);
                if (match && match[1]) return match[1];
              }
              if (i.no_surat_jalan && i.no_surat_jalan.toUpperCase().startsWith('RETUR-') && i.tanggal_penerimaan) {
                return i.tanggal_penerimaan;
              }
              return null;
            })
            .filter(Boolean) as string[]
        )
      ).sort().reverse();

      const returDateSlots: string[] = Array.from(
        { length: FIXED_RETUR_COLUMNS_COUNT },
        (_, i) => distinctReturDates[i] || ''
      );

      // Group by Color
      const auditRecForCode = recountAuditNormMap[code];
      const colorMap = new Map<string, PenerimaanProduksiItem[]>();
      items.forEach((it) => {
        const color = (it.warna || 'DEFAULT').trim().toUpperCase();
        if (!colorMap.has(color)) {
          colorMap.set(color, []);
        }
        colorMap.get(color)!.push(it);
      });

      const colorGroups: MatrixColorGroup[] = [];
      let totalDatang = 0;
      let totalRetur = 0;

      colorMap.forEach((cItems, color) => {
        const sizeMap = new Map<string, PenerimaanProduksiItem[]>();
        cItems.forEach((it) => {
          const sz = (it.size || 'Default').trim().toUpperCase();
          if (!sizeMap.has(sz)) {
            sizeMap.set(sz, []);
          }
          sizeMap.get(sz)!.push(it);
        });

        const presentSizes = Array.from(sizeMap.keys());
        const isFreeOrAllSizeOnly =
          presentSizes.length === 1 &&
          (presentSizes[0] === 'ALL SIZE' || presentSizes[0] === 'FREE SIZE' || presentSizes[0] === 'DEFAULT');

        let sizesToInclude = presentSizes;
        if (!isFreeOrAllSizeOnly) {
          const combinedSet = new Set([...presentSizes, 'S', 'M', 'L', 'XL']);
          sizesToInclude = Array.from(combinedSet);
        }

        const sortedSizes = sizesToInclude.sort((a, b) => {
          const idxA = standardSizeOrder.indexOf(a);
          const idxB = standardSizeOrder.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });

        let totalColorQty = 0;
        let totalColorRetur = 0;

        const sizes: MatrixSizeItem[] = sortedSizes.map((sz) => {
          const sItems = sizeMap.get(sz) || [];
          const qtyByDate: Record<string, number> = {};
          const qtyReturByDate: Record<string, number> = {};
          let totalSizeQty = 0;
          let totalSizeRetur = 0;

          sItems.forEach((it) => {
            const isReturItem =
              (it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) ||
              (it.keterangan && it.keterangan.includes('RETUR_CMT:'));

            const d = it.tanggal_penerimaan?.trim();
            const sj = (it.no_surat_jalan || '').trim().toUpperCase();
            const q = Number(it.qty) || 0;
            // Hanya tambahkan ke Barang Datang jika BUKAN baris retur murni
            if (!isReturItem && d && q > 0) {
              const slotKeyWithSj = sj ? `${d}||${sj}` : d;
              qtyByDate[slotKeyWithSj] = (qtyByDate[slotKeyWithSj] || 0) + q;
              totalSizeQty += q;
            }

            // Deteksi retur baik dari field tanggal_retur/qty_retur maupun format keterangan RETUR_CMT
            let rDate = it.tanggal_retur;
            let rQty = Number(it.qty_retur) || 0;

            if (!rQty && it.keterangan && it.keterangan.includes('RETUR_CMT:')) {
              const match = it.keterangan.match(/RETUR_CMT:(\d+)(?:@([\d-]+))?/);
              if (match) {
                rQty = parseInt(match[1], 10) || 0;
                rDate = match[2] || it.tanggal_penerimaan;
              }
            } else if (!rQty && it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) {
              rQty = Number(it.qty) || 0;
              rDate = it.tanggal_retur || it.tanggal_penerimaan;
            }

            if (rDate && rQty > 0) {
              qtyReturByDate[rDate] = (qtyReturByDate[rDate] || 0) + rQty;
              totalSizeRetur += rQty;
            }
          });

          totalColorQty += totalSizeQty;
          totalColorRetur += totalSizeRetur;

          // Ekstrak hasil hitung ulang fisik terkini untuk size ini
          let rFisik: number | null = null;
          let rSelisih: number | null = null;
          let rRound: number | undefined = undefined;
          let rNotes: string | undefined = undefined;
          let rAuditor: string | undefined = undefined;
          let rUpdatedAt: string | undefined = undefined;

          for (const it of sItems) {
            if (it.recount_qty !== undefined && it.recount_qty !== null) {
              rFisik = Number(it.recount_qty);
              rSelisih = it.recount_selisih !== undefined && it.recount_selisih !== null
                ? Number(it.recount_selisih)
                : (rFisik - totalSizeQty);
              rRound = it.recount_round;
              rNotes = it.recount_notes;
              rAuditor = it.recount_auditor;
              rUpdatedAt = it.recount_updated_at;
              break;
            }
          }

          // Fallback: hasil audit dari Cloud/Local Audit Map (sumber yang sama dengan tab Audit Hitung Ulang)
          if (rFisik === null && auditRecForCode && Array.isArray(auditRecForCode.variants)) {
            const colorKey = String(color || '').trim().toUpperCase();
            const v = auditRecForCode.variants.find(
              (x: any) =>
                String(x.warna || 'DEFAULT').trim().toUpperCase() === colorKey &&
                String(x.size || 'Default').trim().toUpperCase() === sz
            );
            if (v && v.qty_fisik !== undefined && v.qty_fisik !== null) {
              rFisik = Number(v.qty_fisik) || 0;
              rSelisih = rFisik - totalSizeQty;
              rRound = auditRecForCode.round;
              rNotes = auditRecForCode.catatan || v.note || undefined;
              rAuditor = auditRecForCode.auditor;
              rUpdatedAt = auditRecForCode.updated_at || auditRecForCode.tanggal_audit;
            }
          }

          const rStatus =
            rSelisih === null || rSelisih === undefined
              ? undefined
              : rSelisih === 0
                ? 'MATCH'
                : rSelisih < 0
                  ? 'KURANG'
                  : 'LEBIH';
          const rLog =
            rFisik !== null
              ? formatRecountLogEntry({
                  round: rRound,
                  updatedAt: rUpdatedAt,
                  arrivalDates: distinctDatangDates,
                  auditor: rAuditor,
                  notes: rNotes,
                })
              : undefined;

          return {
            id: sItems[0]?.id,
            size: sz,
            qtyByDate,
            qtyReturByDate,
            totalSizeQty,
            totalSizeRetur,
            recountFisik: rFisik,
            recountQty: rFisik,
            recountSelisih: rSelisih,
            recountStatus: rStatus,
            recountRound: rRound,
            recountNotes: rNotes,
            recountAuditor: rAuditor,
            recountUpdatedAt: rUpdatedAt,
            recountLog: rLog,
          };
        });

        totalDatang += totalColorQty;
        totalRetur += totalColorRetur;

        colorGroups.push({
          color,
          sizes,
          totalColorQty,
          totalColorRetur,
        });
      });

      const totalNet = Math.max(0, totalDatang - (isCMT ? totalRetur : 0));

      // Hitung agregat audit hitung ulang untuk kode produk ini
      let blockRecountFisik: number | null = null;
      let blockRecountSelisih: number | null = null;
      let blockHasRecount = false;
      let blockHasDiff = false;

      colorGroups.forEach((cg) => {
        cg.sizes.forEach((sz) => {
          if (sz.recountFisik !== null && sz.recountFisik !== undefined) {
            blockHasRecount = true;
            blockRecountFisik = (blockRecountFisik || 0) + sz.recountFisik;
            if (sz.recountSelisih !== null && sz.recountSelisih !== undefined) {
              blockRecountSelisih = (blockRecountSelisih || 0) + sz.recountSelisih;
              if (sz.recountSelisih !== 0) blockHasDiff = true;
            }
          }
        });
      });

      // Extract catatan / keterangan khusus produk (bersihkan tag internal RETUR_CMT)
      const cleanNotesList: string[] = [];
      items.forEach((i) => {
        let note = (i.keterangan || (i as any).catatan || '').trim();
        if (!note) return;
        note = note.replace(/RETUR_CMT:\d+(@[\d-]+)?/g, '').replace(/\|\s*UP:[^|]*/g, '').replace(/\|\s*\|/g, '|').trim();
        note = note.replace(/^\|+|\|+$/g, '').trim();
        if (note && !cleanNotesList.includes(note)) {
          cleanNotesList.push(note);
        }
      });
      if (cleanNotesList.length === 0 && upVendor) {
        cleanNotesList.push(upVendor);
      }
      const catatan = cleanNotesList.join(' | ') || upVendor || '';

      // Kesimpulan metrics
      const savedM = customMetrics[code] || {
        kg: Math.round(totalNet * 0.28 * 10) / 10,
        ongkir: 0,
      };

      const kg = savedM.kg !== undefined ? savedM.kg : Math.round(totalNet * 0.28 * 10) / 10;
      const ongkirPerKg = savedM.ongkir || 0;
      const totalOngkir = Math.round(kg * ongkirPerKg);
      const ongkirPerPcs = totalNet > 0 ? Math.round(totalOngkir / totalNet) : 0;

      const notaRec = qtyNotaMap[code];
      const itemNotaFallback = items.find((i) => i.qty_nota !== undefined && i.qty_nota !== null)?.qty_nota ?? null;
      const resolvedQtyNota =
        notaRec && notaRec.qty_nota !== null && notaRec.qty_nota !== undefined
          ? Number(notaRec.qty_nota)
          : itemNotaFallback !== null
            ? Number(itemNotaFallback)
            : null;
      // Jika sudah ada hasil hitung ulang fisik, pembanding akhir dengan Qty Nota adalah Qty Hitung Ulang!
      // Jika belum dihitung ulang, pembandingnya adalah Total Diterima awal (totalNet).
      const effectiveFisik =
        blockHasRecount && blockRecountFisik !== null && blockRecountFisik !== undefined
          ? blockRecountFisik
          : totalNet;
      const resolvedSelisihNota =
        resolvedQtyNota !== null && !isNaN(resolvedQtyNota)
          ? effectiveFisik - resolvedQtyNota
          : blockHasRecount && blockRecountFisik !== null && blockRecountFisik !== undefined
            ? blockRecountFisik - totalNet
            : null;

      parsedBlocks.push({
        id: code,
        rowNumber: rowNumber++,
        code,
        productName,
        upVendor,
        kategori: targetCategory,
        photoUrl,
        catatan,
        distinctSjs,
        dateToSjMap,
        colorGroups,
        dateSlots,
        returDateSlots,
        totalDatang,
        totalRetur,
        totalNet,
        qtyNota: resolvedQtyNota,
        selisihNota: resolvedSelisihNota,
        totalRecountFisik: blockRecountFisik,
        totalRecountSelisih: blockRecountSelisih,
        hasRecount: blockHasRecount,
        hasDiff: blockHasDiff,
        kg,
        ongkirPerKg,
        totalOngkir,
        ongkirPerPcs,
      });
    });

    setBlocks(sortMatrixBlocksNewestFirst(parsedBlocks));
  }, [dataList, activeTab, catalogNameMap, qtyNotaMap, recountAuditNormMap]);

  // Sinkronisasi Otomatis Qty Nota dari Google Sheet & Backup ke Supabase saat halaman dibuka
  const handleSyncQtyNotaFromSheet = async (isSilent = false) => {
    try {
      setIsSyncingQtyNota(true);
      const res = await syncQtyNotaAndAutoQueueRecount({
        penerimaanItems: dataList,
        updatedBy: isSilent ? 'Auto-Sync Sheet Buyer' : 'Manual Sync Sheet Buyer',
      });
      if (res.notaMap) {
        setQtyNotaMap(res.notaMap);
      }
      if (!isSilent) {
        onShowToast(res.message, res.newlyQueuedCodes.length > 0 ? 'warning' : 'success');
      } else if (res.newlyQueuedCodes.length > 0) {
        onShowToast(
          `📋 Buyer telah mengisi Qty Nota: ${res.newlyQueuedCodes.length} kode selisih (${res.newlyQueuedCodes
            .slice(0, 4)
            .join(', ')}) otomatis masuk Antrian Audit Hitung Ulang!`,
          'warning'
        );
      }
    } catch (err: any) {
      console.error('[ProduksiSpreadsheetView] handleSyncQtyNotaFromSheet error:', err);
      if (!isSilent) {
        onShowToast(err?.message ? `Gagal menyinkronkan Qty Nota: ${err.message}` : 'Gagal menyinkronkan Qty Nota dari Google Sheet.', 'error');
      }
    } finally {
      setIsSyncingQtyNota(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted && dataList && dataList.length > 0) {
        handleSyncQtyNotaFromSheet(true);
      }
    }, 600);

    const handleNotaEvent = (e: any) => {
      if (mounted && e?.detail?.notaMap) {
        setQtyNotaMap(e.detail.notaMap);
      }
    };
    window.addEventListener('wms_produksi_qty_nota_updated', handleNotaEvent);

    return () => {
      mounted = false;
      clearTimeout(timer);
      window.removeEventListener('wms_produksi_qty_nota_updated', handleNotaEvent);
    };
  }, [dataList.length]);

  // Handler saat user mengisi / mengubah Qty Nota langsung dari tabel Frontend
  const handleUpdateBlockQtyNota = async (
    blockCode: string,
    rawNotaValue: string,
    kategori: string
  ) => {
    const cleanCode = normalizeProductCode(blockCode);
    const trimmed = rawNotaValue.trim();
    const parsedNota = trimmed === '' ? null : parseInt(trimmed.replace(/\D/g, ''), 10);
    const finalNota = parsedNota !== null && !isNaN(parsedNota) ? parsedNota : null;

    // Optimistic update pada blocks state
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.code !== cleanCode) return b;
        return {
          ...b,
          qtyNota: finalNota,
          selisihNota:
            finalNota !== null
              ? (b.hasRecount && b.totalRecountFisik !== null && b.totalRecountFisik !== undefined
                ? b.totalRecountFisik
                : b.totalNet) - finalNota
              : (b.hasRecount && b.totalRecountFisik !== null && b.totalRecountFisik !== undefined
                ? b.totalRecountFisik - b.totalNet
                : null),
        };
      })
    );

    // Backup ke Supabase & daftarkan ke Antrian Hitung Ulang jika selisih !== 0
    const syncRes = await syncQtyNotaAndAutoQueueRecount({
      penerimaanItems: dataList,
      skipSheetFetch: true,
      updatedBy: 'Input Tabel WMS',
      overrideNotaEntry: {
        kode_produksi: cleanCode,
        qty_nota: finalNota,
        kategori,
      },
    });
    if (syncRes.notaMap) {
      setQtyNotaMap(syncRes.notaMap);
    }

    // Push perubahan Qty Nota ke Google Sheet (Master & Sheet Tanggal)
    pushQtyNotaDeltaToGoogleSheet({
      kode_produksi: cleanCode,
      qty_nota: finalNota,
      kategori,
      tanggal: dateFrom && dateFrom === dateTo ? dateFrom : undefined,
    }).catch(() => { });

    const updatedRec = syncRes.notaMap?.[cleanCode];
    if (updatedRec && updatedRec.selisih_nota !== null && updatedRec.selisih_nota !== 0) {
      onShowToast(
        `Qty Nota Kode ${cleanCode} disimpan (${finalNota} pcs). Selisih ${updatedRec.selisih_nota > 0 ? '+' + updatedRec.selisih_nota : updatedRec.selisih_nota
        } pcs otomatis masuk Antrian Audit Hitung Ulang!`,
        'warning'
      );
    } else if (finalNota !== null) {
      onShowToast(`Qty Nota Kode ${cleanCode} disimpan (${finalNota} pcs — Sesuai / Klop).`, 'success');
    }
  };

  // Recalculate block totals
  const recalculateBlock = (block: MatrixProductBlock): MatrixProductBlock => {
    const isCMT = activeTab === 'CMT';
    let blockTotalDatang = 0;
    let blockTotalRetur = 0;

    const updatedColorGroups = block.colorGroups.map((cg) => {
      let colorTotalDatang = 0;
      let colorTotalRetur = 0;

      const updatedSizes = cg.sizes.map((sz) => {
        let sizeTotalDatang = 0;
        let sizeTotalRetur = 0;

        Object.values(sz.qtyByDate || {}).forEach((v) => {
          sizeTotalDatang += Number(v) || 0;
        });

        if (isCMT) {
          Object.values(sz.qtyReturByDate || {}).forEach((v) => {
            sizeTotalRetur += Number(v) || 0;
          });
        }

        colorTotalDatang += sizeTotalDatang;
        colorTotalRetur += sizeTotalRetur;

        return {
          ...sz,
          totalSizeQty: sizeTotalDatang,
          totalSizeRetur: sizeTotalRetur,
        };
      });

      blockTotalDatang += colorTotalDatang;
      blockTotalRetur += colorTotalRetur;

      return {
        ...cg,
        sizes: updatedSizes,
        totalColorQty: colorTotalDatang,
        totalColorRetur: colorTotalRetur,
      };
    });

    const totalNet = Math.max(0, blockTotalDatang - (isCMT ? blockTotalRetur : 0));
    const kg = block.kg !== undefined ? block.kg : Math.round(totalNet * 0.28 * 10) / 10;
    const totalOngkir = Math.round(kg * (block.ongkirPerKg || 0));
    const ongkirPerPcs = totalNet > 0 ? Math.round(totalOngkir / totalNet) : 0;

    return {
      ...block,
      colorGroups: updatedColorGroups,
      totalDatang: blockTotalDatang,
      totalRetur: blockTotalRetur,
      totalNet,
      totalOngkir,
      ongkirPerPcs,
    };
  };

  // Unique Pure Dates (YYYY-MM-DD) & SJs across current tab items for Export Multi-Choice Filter
  const availableDates = useMemo(() => {
    const datesSet = new Set<string>();
    blocks.forEach((b) => {
      b.dateSlots.forEach((d) => {
        const iso = extractIsoDate(d);
        if (iso) datesSet.add(iso);
      });
    });
    return Array.from(datesSet).sort().reverse();
  }, [blocks]);

  const availableSjs = useMemo(() => {
    const sjSet = new Set<string>();
    dataList.forEach((it) => {
      const sj = (it.no_surat_jalan || '').trim().toUpperCase();
      if (sj) sjSet.add(sj);
    });
    return Array.from(sjSet).sort();
  }, [dataList]);

  // Open Export Modal
  const handleOpenExportModal = () => {
    setSelectedExportDates(availableDates);
    setSelectedExportSjs(availableSjs);
    setIsExportModalOpen(true);
  };

  // Quick Filter Hitung Ulang: 'all' | 'diff' (ada selisih) | 'counted' | 'uncounted'
  const [recountFilter, setRecountFilter] = useState<'all' | 'diff' | 'counted' | 'uncounted'>('all');

  // Filter blocks according to date range filter, recount status & search query
  const effectiveQuery = (searchQuery !== undefined ? searchQuery : search).trim().toLowerCase();

  const dateRangeLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return '';
    if (dateFrom && dateTo) {
      const start = dateFrom <= dateTo ? dateFrom : dateTo;
      const end = dateFrom <= dateTo ? dateTo : dateFrom;
      if (start === end) return formatDateHeader(start);
      return `${formatDateHeader(start)} – ${formatDateHeader(end)}`;
    }
    if (dateFrom) return `Dari ${formatDateHeader(dateFrom)}`;
    return `s/d ${formatDateHeader(dateTo)}`;
  }, [dateFrom, dateTo]);

  const filteredBlocks = useMemo(() => {
    let result = blocks;

    // Filter berdasarkan rentang tanggal penerimaan (mendukung tanggal kedatangan maupun tanggal retur)
    if (dateFrom || dateTo) {
      const rangeStart = dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom;
      const rangeEnd = dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo;

      const matchesRange = (rawVal?: string | null): boolean => {
        const iso = extractIsoDate(rawVal);
        if (!iso) return false;
        if (rangeStart && iso < rangeStart) return false;
        if (rangeEnd && iso > rangeEnd) return false;
        return true;
      };

      result = result.filter((b) => {
        if (b.dateSlots.some((slot) => matchesRange(slot))) return true;
        if (b.returDateSlots && b.returDateSlots.some((r) => matchesRange(r))) return true;
        if (b.dateToSjMap && Object.keys(b.dateToSjMap).some((d) => matchesRange(d))) return true;
        if (b.distinctSjs && b.distinctSjs.some((sj) => matchesRange(sj.tanggal))) return true;
        return false;
      });
    }

    // Filter status audit hitung ulang
    if (recountFilter === 'diff') {
      result = result.filter((b) => b.hasDiff);
    } else if (recountFilter === 'counted') {
      result = result.filter((b) => b.hasRecount);
    } else if (recountFilter === 'uncounted') {
      result = result.filter((b) => !b.hasRecount);
    }

    if (!effectiveQuery) return result;
    return result.filter(
      (b) =>
        b.code.toLowerCase().includes(effectiveQuery) ||
        b.colorGroups.some((cg) => cg.color.toLowerCase().includes(effectiveQuery)) ||
        (b.productName && b.productName.toLowerCase().includes(effectiveQuery)) ||
        (b.upVendor && b.upVendor.toLowerCase().includes(effectiveQuery)) ||
        (b.catatan && b.catatan.toLowerCase().includes(effectiveQuery)) ||
        (b.distinctSjs && b.distinctSjs.some((s) => s.no_surat_jalan.toLowerCase().includes(effectiveQuery))) ||
        (b.dateToSjMap && Object.values(b.dateToSjMap).some((sjs) => sjs.some((sj) => sj.toLowerCase().includes(effectiveQuery)))) ||
        (b.dateSlots && b.dateSlots.some((d) => d && d.toLowerCase().includes(effectiveQuery)))
    );
  }, [blocks, dateFrom, dateTo, recountFilter, effectiveQuery]);

  // Pagination State for Matrix Spreadsheet Blocks
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10); // 10 blocks default for snappy render

  const totalPages = Math.max(1, Math.ceil(filteredBlocks.length / (pageSize === -1 ? (filteredBlocks.length || 1) : pageSize)));

  // Auto-reset page when filter, search, or pageSize changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, dateFrom, dateTo, recountFilter, effectiveQuery, pageSize]);

  // Keep editing block visible if user starts editing
  useEffect(() => {
    if (editingBlockId && pageSize !== -1) {
      const idx = filteredBlocks.findIndex((b) => b.id === editingBlockId);
      if (idx !== -1) {
        const targetPage = Math.floor(idx / pageSize) + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
      }
    }
  }, [editingBlockId, filteredBlocks, pageSize]);

  // Sliced blocks for current page
  const paginatedBlocks = useMemo(() => {
    if (pageSize === -1) return filteredBlocks;
    const start = (currentPage - 1) * pageSize;
    return filteredBlocks.slice(start, start + pageSize);
  }, [filteredBlocks, currentPage, pageSize]);

  // Export Modern Excel with selected multi-choice filters
  const handleExportModernExcelWithFilters = async () => {
    if (filteredBlocks.length === 0) {
      onShowToast('Tidak ada data untuk diekspor', 'warning');
      return;
    }

    const selectedDateSet = new Set(selectedExportDates);
    const selectedSjSet = new Set(selectedExportSjs);

    const blocksToExport = filteredBlocks.filter((b) => {
      const matchesDate = b.dateSlots.some((d) => {
        const iso = extractIsoDate(d);
        return Boolean(iso && selectedDateSet.has(iso));
      });
      const matchesSj = dataList.some(
        (it) =>
          (it.kode_produksi || '').trim().toUpperCase() === b.code &&
          selectedSjSet.has((it.no_surat_jalan || '').trim().toUpperCase())
      );
      return matchesDate || matchesSj;
    });

    if (blocksToExport.length === 0) {
      onShowToast('Tidak ada data yang cocok dengan pilihan tanggal / Surat Jalan.', 'warning');
      return;
    }

    try {
      setIsExportingExcel(true);
      await exportProduksiToModernExcel(sortMatrixBlocksNewestFirst(blocksToExport), activeTab, (msg) => {
        setExportProgressMsg(msg);
      });
      onShowToast(`File Excel ${activeTab} Modern (.xlsx) berhasil diunduh!`, 'success');
      setIsExportModalOpen(false);
    } catch (err: any) {
      console.error('Error exporting modern excel:', err);
      onShowToast(err?.message || 'Gagal mengekspor file Excel', 'error');
    } finally {
      setIsExportingExcel(false);
      setExportProgressMsg('');
    }
  };

  // Push Data & Gambar directly to Google Sheet (1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk)
  const handlePushToGoogleSheet = async () => {
    if (filteredBlocks.length === 0) {
      onShowToast('Tidak ada data untuk dikirim ke Google Sheet', 'warning');
      return;
    }

    const itemsToPush: PenerimaanProduksiItem[] = [];
    const nowStr = new Date().toISOString();

    filteredBlocks.forEach((block) => {
      block.colorGroups.forEach((cg) => {
        cg.sizes.forEach((sz) => {
          Object.entries(sz.qtyByDate || {}).forEach(([dateStr, qty]) => {
            if (dateStr && Number(qty) > 0) {
              itemsToPush.push({
                tanggal_penerimaan: dateStr,
                kategori: block.kategori || (activeTab === 'CMT' ? 'Lokal CMT' : 'Kargo'),
                no_surat_jalan: `SJ-${block.code}`,
                kode_produksi: block.code,
                nama_produk: block.productName || '',
                warna: cg.color,
                size: sz.size,
                qty: Number(qty),
                foto_url: block.photoUrl || '',
                keterangan: block.upVendor || '',
                operator: 'WMS Spreadsheet Editor',
                created_at: nowStr,
              });
            }
            if (activeTab === 'CMT') {
              Object.entries(sz.qtyReturByDate || {}).forEach(([rDate, rQty]) => {
                if (rDate && Number(rQty) > 0) {
                  itemsToPush.push({
                    tanggal_penerimaan: rDate,
                    tanggal_retur: rDate,
                    qty_retur: Number(rQty),
                    kategori: 'Lokal CMT',
                    no_surat_jalan: `RETUR-${block.code}`,
                    kode_produksi: block.code,
                    nama_produk: block.productName || '',
                    warna: cg.color,
                    size: sz.size,
                    qty: 0,
                    foto_url: block.photoUrl || '',
                    keterangan: `RETUR_CMT:${rQty}@${rDate}`,
                    operator: 'WMS Spreadsheet Editor',
                    created_at: nowStr,
                  });
                }
              });
            }
          });
        });
      });
    });

    if (itemsToPush.length === 0) {
      onShowToast('Tidak ada kuantitas barang terisi untuk dikirim.', 'warning');
      return;
    }

    try {
      setIsPushingSheet(true);
      const activeBlocks = filteredBlocks.filter((b) => (activeTab === 'CMT' ? (!b.kategori || b.kategori === 'Lokal CMT') : b.kategori === 'Kargo'));
      const res = await pushPenerimaanProduksiToGoogleSheet(itemsToPush, activeBlocks, activeTab);
      if (res.success) {
        onShowToast(res.message, 'success');
      } else {
        onShowToast(res.message || 'Gagal push ke Google Sheet', 'error');
      }
    } catch (err: any) {
      onShowToast('Gagal push ke Google Sheet: ' + (err?.message || err), 'error');
    } finally {
      setIsPushingSheet(false);
    }
  };

  // Switch to an alternate Trello candidate card (instant toggle/swap between couple cards like Logan Top vs Kailea Set)
  const handleSwitchTrelloCandidate = (blockId: string, candidate: any) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const currentAsCandidate = b.matchedItem || {
          id: b.id,
          card_name: b.productName,
          item_name: b.productName,
          up_code: b.upVendor,
          gdrive_image_url: b.photoUrl,
          trello_image_url: b.photoUrl,
        };
        const remainingAlts = (b.alternateCandidates || []).filter((c: any) => c.id !== candidate.id);
        remainingAlts.push(currentAsCandidate);

        const newName = candidate.item_name || candidate.card_name || '';
        const newUp = candidate.up_code || candidate.list_name || b.upVendor;
        const newPhoto = candidate.gdrive_image_url || getProxiedTrelloImageUrl(candidate.trello_image_url) || b.photoUrl;

        return {
          ...b,
          productName: newName,
          upVendor: newUp,
          photoUrl: newPhoto,
          matchedItem: candidate,
          alternateCandidates: remainingAlts,
        };
      })
    );
    onShowToast(`Produk diganti ke "${candidate.item_name || candidate.card_name}"!`, 'success');
  };

  // Start Edit Mode
  const handleStartEditBlock = (block: MatrixProductBlock) => {
    setBackupBlock(JSON.parse(JSON.stringify(block)));
    setEditingBlockId(block.id);
  };

  // Cancel Edit Mode
  const handleCancelEditBlock = (blockId: string) => {
    if (backupBlock && backupBlock.id === blockId) {
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? backupBlock : b)));
    }
    setEditingBlockId(null);
    setBackupBlock(null);
    onShowToast('Perubahan dibatalkan.', 'info');
  };

  // Save Block Changes (Safe & Non-Destructive)
  const handleSaveBlockChanges = async (blockId: string) => {
    const targetBlock = blocks.find((b) => b.id === blockId);
    if (!targetBlock) return;

    // Save metrics
    const updatedMetrics = {
      ...customMetrics,
      [targetBlock.code]: { kg: targetBlock.kg, ongkir: targetBlock.ongkirPerKg },
    };
    setCustomMetrics(updatedMetrics);
    try {
      localStorage.setItem(STORAGE_KEY_METRICS, JSON.stringify(updatedMetrics));
    } catch { }

    const isCMT = activeTab === 'CMT';
    const fallbackCategory = targetBlock.kategori || (isCMT ? 'Lokal CMT' : 'Kargo');

    // Retrieve all original items for this code to preserve Surat Jalan, ID, and audit recount data
    const originalItems = dataList.filter(
      (it) => normalizeProductCode(it.kode_produksi) === normalizeProductCode(targetBlock.code)
    );

    const primarySj =
      targetBlock.distinctSjs && targetBlock.distinctSjs.length > 0
        ? targetBlock.distinctSjs[0].no_surat_jalan
        : originalItems[0]?.no_surat_jalan || `SJ-${targetBlock.code}`;

    const defaultDate =
      targetBlock.dateSlots.find((d) => d && d.trim().length > 0) ||
      originalItems[0]?.tanggal_penerimaan ||
      new Date().toISOString().split('T')[0];

    const nowStr = new Date().toISOString();
    const newItems: PenerimaanProduksiItem[] = [];

    targetBlock.colorGroups.forEach((cg) => {
      cg.sizes.forEach((sz) => {
        // Datang
        const dateEntries = Object.entries(sz.qtyByDate || {});
        if (dateEntries.length === 0 && sz.totalSizeQty > 0) {
          // If total qty exists but dates were lost, attach to defaultDate
          const matchedOrig = originalItems.find(
            (o) => (o.warna || '').trim().toUpperCase() === cg.color && (o.size || '').trim().toUpperCase() === sz.size
          );
          newItems.push({
            id: matchedOrig?.id,
            tanggal_penerimaan: matchedOrig?.tanggal_penerimaan || defaultDate,
            kategori: matchedOrig?.kategori || fallbackCategory,
            no_surat_jalan: matchedOrig?.no_surat_jalan || primarySj,
            kode_produksi: targetBlock.code,
            nama_produk: targetBlock.productName || matchedOrig?.nama_produk || '',
            warna: cg.color,
            size: sz.size,
            qty: sz.totalSizeQty,
            foto_url: targetBlock.photoUrl || matchedOrig?.foto_url || '',
            keterangan: targetBlock.upVendor || targetBlock.catatan || matchedOrig?.keterangan || '',
            operator: 'Spreadsheet Editor',
            created_at: matchedOrig?.created_at || nowStr,
            recount_qty: sz.recountFisik ?? matchedOrig?.recount_qty,
            recount_selisih: sz.recountSelisih ?? matchedOrig?.recount_selisih,
            recount_round: sz.recountRound ?? matchedOrig?.recount_round,
            recount_notes: sz.recountNotes || matchedOrig?.recount_notes,
            recount_auditor: sz.recountAuditor || matchedOrig?.recount_auditor,
            recount_updated_at: sz.recountUpdatedAt || matchedOrig?.recount_updated_at,
          });
        } else {
          dateEntries.forEach(([dateStr, qty]) => {
            const finalDate = dateStr && dateStr.trim().length > 0 ? dateStr.trim() : defaultDate;
            const numQty = Number(qty) || 0;
            if (numQty > 0) {
              const matchedOrig = originalItems.find(
                (o) =>
                  (o.warna || '').trim().toUpperCase() === cg.color &&
                  (o.size || '').trim().toUpperCase() === sz.size &&
                  (o.tanggal_penerimaan || '') === finalDate
              ) || originalItems.find(
                (o) =>
                  (o.warna || '').trim().toUpperCase() === cg.color &&
                  (o.size || '').trim().toUpperCase() === sz.size
              );

              newItems.push({
                id: matchedOrig?.id,
                tanggal_penerimaan: finalDate,
                kategori: matchedOrig?.kategori || fallbackCategory,
                no_surat_jalan: matchedOrig?.no_surat_jalan || primarySj,
                kode_produksi: targetBlock.code,
                nama_produk: targetBlock.productName || matchedOrig?.nama_produk || '',
                warna: cg.color,
                size: sz.size,
                qty: numQty,
                foto_url: targetBlock.photoUrl || matchedOrig?.foto_url || '',
                keterangan: targetBlock.upVendor || targetBlock.catatan || matchedOrig?.keterangan || '',
                operator: 'Spreadsheet Editor',
                created_at: matchedOrig?.created_at || nowStr,
                recount_qty: sz.recountFisik ?? matchedOrig?.recount_qty,
                recount_selisih: sz.recountSelisih ?? matchedOrig?.recount_selisih,
                recount_round: sz.recountRound ?? matchedOrig?.recount_round,
                recount_notes: sz.recountNotes || matchedOrig?.recount_notes,
                recount_auditor: sz.recountAuditor || matchedOrig?.recount_auditor,
                recount_updated_at: sz.recountUpdatedAt || matchedOrig?.recount_updated_at,
              });
            }
          });
        }

        // Retur (CMT): simpan baik sebagai qty_retur maupun di keterangan agar persisten 100% di Supabase & Local
        if (isCMT) {
          Object.entries(sz.qtyReturByDate || {}).forEach(([returDate, rQty]) => {
            const numR = Number(rQty) || 0;
            if (returDate && numR > 0) {
              const vendorNote = targetBlock.upVendor ? ` | UP: ${targetBlock.upVendor}` : '';
              newItems.push({
                tanggal_penerimaan: returDate || defaultDate,
                tanggal_retur: returDate,
                qty_retur: numR,
                kategori: 'Lokal CMT',
                no_surat_jalan: `RETUR-${targetBlock.code}`,
                kode_produksi: targetBlock.code,
                nama_produk: targetBlock.productName || '',
                warna: cg.color,
                size: sz.size,
                qty: 0,
                foto_url: targetBlock.photoUrl || '',
                keterangan: `RETUR_CMT:${numR}@${returDate}${vendorNote}`,
                operator: 'Spreadsheet Editor',
                created_at: nowStr,
              });
            }
          });
        }
      });
    });

    if (newItems.length === 0) {
      onShowToast('Tidak ada kuantitas barang datang atau retur yang diinput. Masukkan kuantitas minimal 1 pcs.', 'warning');
      return;
    }

    // 1. Clean payload strictly to valid table columns (no invalid columns like nama_produk)
    const rowsToInsert = newItems.map((it) => ({
      tanggal_penerimaan: it.tanggal_penerimaan || it.tanggal_retur || defaultDate,
      kategori: it.kategori || fallbackCategory,
      no_surat_jalan: (it.no_surat_jalan || primarySj).trim().toUpperCase(),
      kode_produksi: (it.kode_produksi || targetBlock.code).trim().toUpperCase(),
      warna: (it.warna || '').trim().toUpperCase(),
      size: (it.size || 'Default').trim(),
      qty: Math.max(0, Number(it.qty) || 0),
      foto_url: it.foto_url || targetBlock.photoUrl || '',
      keterangan: (it.keterangan || targetBlock.upVendor || targetBlock.catatan || '').trim(),
      operator: it.operator || 'Spreadsheet Editor',
      created_at: it.created_at || nowStr,
    }));

    // Pre-allocate explicit sequential IDs to prevent sequence desync / primary key collision
    try {
      const nextIds = await getNextPenerimaanProduksiIds(rowsToInsert.length);
      if (nextIds.length === rowsToInsert.length) {
        for (let idx = 0; idx < rowsToInsert.length; idx++) {
          (rowsToInsert[idx] as any).id = nextIds[idx];
        }
      }
    } catch (eId) {
      console.warn('Could not pre-allocate IDs in spreadsheet save:', eId);
    }

    // 2. Persist to Supabase safely
    try {
      // Delete previous rows for this code in Supabase
      await supabaseFetch(
        'penerimaan_produksi',
        'DELETE',
        undefined,
        `kode_produksi=eq.${encodeURIComponent(targetBlock.code)}`
      );

      try {
        await supabaseFetch('penerimaan_produksi', 'POST', rowsToInsert, '', true);
      } catch (postErr: any) {
        const errMsg = String(postErr?.message || postErr || '');
        if (errMsg.includes('penerimaan_produksi_pkey') || errMsg.includes('23505')) {
          const freshIds = await getNextPenerimaanProduksiIds(rowsToInsert.length);
          if (freshIds.length === rowsToInsert.length) {
            for (let idx = 0; idx < rowsToInsert.length; idx++) {
              (rowsToInsert[idx] as any).id = freshIds[idx];
            }
            await supabaseFetch('penerimaan_produksi', 'POST', rowsToInsert, '', true);
          }
        } else {
          throw postErr;
        }
      }
    } catch (errSupabase) {
      console.warn('Gagal sync block save ke Supabase:', errSupabase);
      onShowToast(`Peringatan: Gagal sync ke server (${errSupabase instanceof Error ? errSupabase.message : 'Koneksi lambat'}), data tetap aman di memori lokal.`, 'warning');
    }

    // 3. Update LocalStorage cache (atomic update with assigned IDs)
    try {
      const cached = localStorage.getItem('wms_local_penerimaan_produksi');
      let list: PenerimaanProduksiItem[] = cached ? JSON.parse(cached) : [];
      list = list.filter(
        (it) => normalizeProductCode(it.kode_produksi) !== normalizeProductCode(targetBlock.code)
      );
      const finalItems = rowsToInsert.map((it, idx) => ({
        ...it,
        id: (it as any).id || (Date.now() + idx),
      }));
      list = [...finalItems, ...list].sort((a, b) => {
        const da = a.tanggal_penerimaan || '';
        const db = b.tanggal_penerimaan || '';
        if (db !== da) return db.localeCompare(da);
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
      localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(list));
    } catch { }

    // Patch photo if updated
    if (targetBlock.photoUrl) {
      try {
        await updatePenerimaanPhotoInSupabase(targetBlock.code, targetBlock.photoUrl);
      } catch { }
    }

    if (onRefreshData) {
      try {
        await onRefreshData();
      } catch { }
    }

    // Dispatch global event
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('wms_penerimaan_produksi_updated', {
            detail: { action: 'block_save', code: targetBlock.code },
          })
        );
      } catch { }
    }

    setEditingBlockId(null);
    setBackupBlock(null);
    onShowToast(`Tabel Kode ${targetBlock.code} berhasil disimpan!`, 'success');
  };

  // Switch Tab
  const handleTabChange = (tab: 'CMT' | 'Kargo') => {
    if (editingBlockId) {
      if (!window.confirm('Ada tabel yang sedang diedit. Yakin ingin berpindah tab? Perubahan yang belum disimpan akan hilang.')) {
        return;
      }
      setEditingBlockId(null);
      setBackupBlock(null);
    }
    setActiveTab(tab);
    try {
      localStorage.setItem(STORAGE_KEY_TAB, tab);
    } catch { }
  };

  // Cell Text Typing (Datang)
  const handleTypeQtyDatang = (
    blockId: string,
    colorIndex: number,
    sizeIndex: number,
    dateStr: string,
    rawText: string
  ) => {
    if (!dateStr) return;
    const cleanDigits = rawText.replace(/\D/g, '');
    const numVal = cleanDigits === '' ? 0 : parseInt(cleanDigits, 10);

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const newColors = [...b.colorGroups];
        const targetColor = { ...newColors[colorIndex] };
        const newSizes = [...targetColor.sizes];
        const targetSize = { ...newSizes[sizeIndex] };

        const newQtyByDate = { ...targetSize.qtyByDate };
        if (numVal === 0) {
          delete newQtyByDate[dateStr];
        } else {
          newQtyByDate[dateStr] = numVal;
        }

        targetSize.qtyByDate = newQtyByDate;
        newSizes[sizeIndex] = targetSize;
        targetColor.sizes = newSizes;
        newColors[colorIndex] = targetColor;

        return recalculateBlock({ ...b, colorGroups: newColors });
      })
    );
  };

  // Cell Text Typing (Retur - Khusus CMT)
  const handleTypeQtyRetur = (
    blockId: string,
    colorIndex: number,
    sizeIndex: number,
    slotIndex: number,
    dateStr: string,
    rawText: string
  ) => {
    const cleanDigits = rawText.replace(/\D/g, '');
    const numVal = cleanDigits === '' ? 0 : parseInt(cleanDigits, 10);

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;

        const newSlots = [...(b.returDateSlots || ['', '', '', '', ''])];
        const effectiveDate = dateStr || newSlots[slotIndex] || new Date().toISOString().split('T')[0];
        if (numVal > 0 && !newSlots[slotIndex]) {
          newSlots[slotIndex] = effectiveDate;
        }

        const newColors = [...b.colorGroups];
        const targetColor = { ...newColors[colorIndex] };
        const newSizes = [...targetColor.sizes];
        const targetSize = { ...newSizes[sizeIndex] };

        const newQtyReturByDate = { ...targetSize.qtyReturByDate };
        if (numVal === 0) {
          delete newQtyReturByDate[effectiveDate];
        } else {
          newQtyReturByDate[effectiveDate] = numVal;
        }

        targetSize.qtyReturByDate = newQtyReturByDate;
        newSizes[sizeIndex] = targetSize;
        targetColor.sizes = newSizes;
        newColors[colorIndex] = targetColor;

        return recalculateBlock({ ...b, returDateSlots: newSlots, colorGroups: newColors });
      })
    );
  };

  // Date Header Direct Prompt/Input
  const handleEditDatePrompt = (blockId: string, slotIndex: number, type: 'datang' | 'retur', currentVal: string) => {
    const isDatang = type === 'datang';
    const title = isDatang ? 'Tanggal Barang Datang' : 'Tanggal Barang Retur';
    const input = window.prompt(
      `Masukkan ${title} (Format YYYY-MM-DD, contoh: 2026-07-15):`,
      currentVal || new Date().toISOString().split('T')[0]
    );
    if (input === null) return;

    const cleanDate = input.trim();

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        if (isDatang) {
          const oldDate = b.dateSlots[slotIndex];
          const newSlots = [...b.dateSlots];
          newSlots[slotIndex] = cleanDate;

          const updatedColors = b.colorGroups.map((cg) => ({
            ...cg,
            sizes: cg.sizes.map((sz) => {
              const newQtyByDate = { ...sz.qtyByDate };
              if (oldDate && newQtyByDate[oldDate] !== undefined) {
                if (cleanDate) {
                  newQtyByDate[cleanDate] = newQtyByDate[oldDate];
                }
                delete newQtyByDate[oldDate];
              }
              return { ...sz, qtyByDate: newQtyByDate };
            }),
          }));

          return recalculateBlock({ ...b, dateSlots: newSlots, colorGroups: updatedColors });
        } else {
          const oldDate = b.returDateSlots ? b.returDateSlots[slotIndex] : '';
          const newSlots = [...(b.returDateSlots || [])];
          newSlots[slotIndex] = cleanDate;

          const updatedColors = b.colorGroups.map((cg) => ({
            ...cg,
            sizes: cg.sizes.map((sz) => {
              const newQtyReturByDate = { ...sz.qtyReturByDate };
              if (oldDate && newQtyReturByDate[oldDate] !== undefined) {
                if (cleanDate) {
                  newQtyReturByDate[cleanDate] = newQtyReturByDate[oldDate];
                }
                delete newQtyReturByDate[oldDate];
              }
              return { ...sz, qtyReturByDate: newQtyReturByDate };
            }),
          }));

          return recalculateBlock({ ...b, returDateSlots: newSlots, colorGroups: updatedColors });
        }
      })
    );
  };

  // Add Size Row
  const handleAddSizeRow = (blockId: string, colorIndex: number) => {
    const sizeName = window.prompt('Masukkan nama size baru (contoh: XL, XXL, 3XL):', '');
    if (!sizeName || !sizeName.trim()) return;

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const newColors = [...b.colorGroups];
        const targetColor = { ...newColors[colorIndex] };
        targetColor.sizes = [
          ...targetColor.sizes,
          {
            size: sizeName.trim().toUpperCase(),
            qtyByDate: {},
            qtyReturByDate: {},
            totalSizeQty: 0,
            totalSizeRetur: 0,
          },
        ];
        newColors[colorIndex] = targetColor;
        return recalculateBlock({ ...b, colorGroups: newColors });
      })
    );
  };

  // Add Color
  const handleAddColor = (blockId: string) => {
    const colorName = window.prompt('Masukkan nama warna baru (contoh: WHITE, BLACK, SAGE):', '');
    if (!colorName || !colorName.trim()) return;

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const newCG: MatrixColorGroup = {
          color: colorName.trim().toUpperCase(),
          sizes: [
            { size: 'S', qtyByDate: {}, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
            { size: 'M', qtyByDate: {}, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
            { size: 'L', qtyByDate: {}, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
          ],
          totalColorQty: 0,
          totalColorRetur: 0,
        };
        return recalculateBlock({ ...b, colorGroups: [...b.colorGroups, newCG] });
      })
    );
  };

  // Add New Block Table
  const handleAddNewBlock = () => {
    const newCode = window.prompt('Masukkan Kode Input Kedatangan baru (contoh: 1028):', '');
    if (!newCode || !newCode.trim()) return;
    const cleanCode = newCode.trim().toUpperCase();

    if (blocks.some((b) => b.code === cleanCode)) {
      onShowToast(`Kode ${cleanCode} sudah ada!`, 'warning');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const newBlock: MatrixProductBlock = {
      id: cleanCode,
      rowNumber: blocks.length + 1,
      code: cleanCode,
      productName: '',
      upVendor: activeTab === 'CMT' ? 'BIS' : '',
      kategori: activeTab === 'CMT' ? 'Lokal CMT' : 'Kargo',
      distinctSjs: [],
      dateToSjMap: {},
      colorGroups: [
        {
          color: 'DEFAULT',
          sizes: [
            { size: 'S', qtyByDate: { [todayStr]: 0 }, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
            { size: 'M', qtyByDate: { [todayStr]: 0 }, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
            { size: 'L', qtyByDate: { [todayStr]: 0 }, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
          ],
          totalColorQty: 0,
          totalColorRetur: 0,
        },
      ],
      dateSlots: [todayStr, '', '', '', '', '', '', '', '', ''],
      returDateSlots: ['', '', '', '', ''],
      totalDatang: 0,
      totalRetur: 0,
      totalNet: 0,
      kg: 0,
      ongkirPerKg: 0,
      totalOngkir: 0,
      ongkirPerPcs: 0,
    };

    setBlocks((prev) =>
      [newBlock, ...prev].map((b, idx) => ({
        ...b,
        rowNumber: idx + 1,
      }))
    );
    setEditingBlockId(cleanCode);
    onShowToast(`Tabel Kode ${cleanCode} dibuat. Silakan ketik datanya dan simpan.`, 'info');
  };

  // Delete Block
  const handleDeleteBlock = (blockId: string) => {
    if (!window.confirm(`Yakin ingin menghapus seluruh tabel Kode ${blockId}?`)) return;
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (editingBlockId === blockId) setEditingBlockId(null);
    onShowToast(`Tabel Kode ${blockId} telah dihapus.`, 'info');
  };

  // Process File -> Compress WebP -> Apply to Block
  const handleApplyImageFileToBlock = async (blockId: string, file: File) => {
    try {
      setIsCompressingPhoto(true);
      const res = await compressImage(file, 1024, 0.75);
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, photoUrl: res.dataUrl } : b))
      );
      setPhotoUrlInput(res.dataUrl);

      // Instantly patch photo to Supabase & Local cache without touching any row quantities or duplicates
      await updatePenerimaanPhotoInSupabase(blockId, res.dataUrl);

      onShowToast(`Foto produk berhasil diterapkan (${Math.round(res.compressedSize / 1024)} KB)!`, 'success');
      if (photoModalBlockId === blockId) setPhotoModalBlockId(null);
    } catch (err) {
      console.error('Gagal kompres foto:', err);
      onShowToast('Gagal memproses file gambar.', 'error');
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  // Global Paste (Ctrl+V) listener when editing block or photo modal
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const targetBlockId = photoModalBlockId || editingBlockId;
      if (!targetBlockId) return;

      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
        if (file) {
          e.preventDefault();
          await handleApplyImageFileToBlock(targetBlockId, file);
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [editingBlockId, photoModalBlockId]);

  // Drag & Drop cell handlers
  const handleCellDragOver = (e: React.DragEvent, blockId: string) => {
    if (editingBlockId !== blockId) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverBlockId(blockId);
  };

  const handleCellDragLeave = (e: React.DragEvent, blockId: string) => {
    if (editingBlockId !== blockId) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragOverBlockId === blockId) setDragOverBlockId(null);
  };

  const handleCellDrop = async (e: React.DragEvent, blockId: string) => {
    if (editingBlockId !== blockId) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverBlockId(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
      if (file) {
        await handleApplyImageFileToBlock(blockId, file);
      }
    }
  };

  // Open Photo Management Modal
  const handleEditPhoto = (blockId: string) => {
    const current = blocks.find((b) => b.id === blockId)?.photoUrl || '';
    setPhotoUrlInput(current);
    setPhotoModalBlockId(blockId);
  };

  const isCMT = activeTab === 'CMT';

  return (
    <div className="space-y-4 font-sans">
      {/* COMPACT TOOLBAR: CMT vs KARGO & CONSOLIDATED ACTIONS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-2 sm:p-2.5 shadow-xs print:hidden">
        {/* Left: CMT vs Kargo + Date Filter */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => handleTabChange('CMT')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer whitespace-nowrap ${
                activeTab === 'CMT'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Lokal CMT
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('Kargo')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer whitespace-nowrap ${
                activeTab === 'Kargo'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Kargo
            </button>
          </div>

          {/* Date Range Filter: Inline on Desktop, Native Slide-Up Sheet Trigger on Mobile */}
          {/* Desktop Inline Date Range */}
          <div
            className={`hidden sm:flex items-center gap-1.5 min-h-[40px] px-2.5 py-1 rounded-xl border text-xs transition ${
              hasActiveDateRange
                ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700'
                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
            }`}
            title="Filter Rentang Tanggal Penerimaan"
          >
            <Calendar className={`w-3.5 h-3.5 shrink-0 ${hasActiveDateRange ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
            <input
              type="date"
              aria-label="Dari Tanggal"
              value={dateFrom}
              onChange={(e) => updateDateRange(e.target.value, dateTo)}
              className="bg-transparent font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-xs w-[114px] font-mono"
              title="Dari Tanggal"
            />
            <span className="text-slate-400 text-[11px] font-medium select-none">s/d</span>
            <input
              type="date"
              aria-label="Sampai Tanggal"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => updateDateRange(dateFrom, e.target.value)}
              className="bg-transparent font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer text-xs w-[114px] font-mono"
              title="Sampai Tanggal"
            />
            {hasActiveDateRange && (
              <button
                type="button"
                onClick={() => updateDateRange('', '')}
                className="text-slate-400 hover:text-rose-500 p-0.5 cursor-pointer shrink-0"
                title="Reset Rentang Tanggal"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Mobile Native Date Range Sheet Trigger */}
          <button
            type="button"
            onClick={() => setIsDateRangeSheetOpen(true)}
            className={`flex sm:hidden items-center justify-between gap-1.5 min-h-[40px] px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex-1 min-w-[132px] transition cursor-pointer ${
              hasActiveDateRange
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
            title="Filter Rentang Tanggal Penerimaan"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <Calendar className={`w-3.5 h-3.5 shrink-0 ${hasActiveDateRange ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
              <span className="truncate">{hasActiveDateRange ? dateRangeLabel : 'Rentang Tgl'}</span>
            </span>
            {hasActiveDateRange ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  updateDateRange('', '');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    updateDateRange('', '');
                  }
                }}
                className="p-0.5 text-indigo-500 hover:text-rose-500 shrink-0"
                title="Reset Rentang Tanggal"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </button>
        </div>

        {/* Right: Max 1 Primary CTA + Secondary + Overflow Action Sheet */}
        <div className="flex items-center gap-1.5 justify-end">
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('wms_open_produksi_input_popup', {
                  detail: { kategori: activeTab === 'Kargo' ? 'Kargo' : 'Lokal CMT' },
                })
              );
            }}
            className="flex-1 sm:flex-initial min-h-[40px] px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
            title={`Buka Form Input Penerimaan ${activeTab === 'Kargo' ? 'Kargo' : 'Lokal CMT'}`}
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Input {activeTab}</span>
          </button>

          <button
            type="button"
            disabled={isSyncingQtyNota}
            onClick={() => handleSyncQtyNotaFromSheet(false)}
            className="hidden xl:inline-flex min-h-[40px] px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
            title="Tarik Qty Nota dari Google Sheet"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isSyncingQtyNota ? 'animate-spin' : ''}`} />
            <span>{isSyncingQtyNota ? 'Sync...' : 'Tarik Nota'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPushDateModalOpen(true)}
            className="flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
            title={
              hasActiveDateRange
                ? `Push Sheet (${dateRangeLabel})`
                : 'Push Sheet Per Tanggal'
            }
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>Push Sheet</span>
          </button>

          <button
            type="button"
            onClick={() => setIsToolbarMenuOpen(true)}
            aria-label="Menu utilitas spreadsheet"
            className="min-h-[40px] min-w-[40px] px-2.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer border border-slate-200 dark:border-slate-700 shrink-0"
            title="Menu Spreadsheet lainnya"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="hidden md:inline">Lainnya</span>
          </button>
        </div>
      </div>

      {/* Info strip */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-0.5 flex-wrap gap-2 print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="tabular-nums">
            <strong className="text-slate-900 dark:text-white">{filteredBlocks.length}</strong> Tabel Kode ·{' '}
            <strong className="text-indigo-600 dark:text-indigo-400">{activeTab}</strong>
          </span>
          {!isControlledDateRange && hasActiveDateRange && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800 text-[11px]">
              {dateRangeLabel}
              <button
                type="button"
                onClick={() => updateDateRange('', '')}
                className="hover:opacity-75 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {effectiveQuery && (
            <span className="text-slate-400">
              Pencarian: &ldquo;{effectiveQuery}&rdquo;
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 md:hidden">
          Geser tabel ke samping untuk melihat kolom tanggal
        </div>
      </div>

      {/* EXPORT OPTIONS MODAL (MULTI-CHOICE SELECTION) */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Pilih Filter Export Data Excel ({activeTab})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bisa pilih multi-choice tanggal penerimaan &amp; No Surat Jalan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* MULTI-CHOICE TANGGAL PENERIMAAN */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pilih Tanggal Penerimaan ({selectedExportDates.length}/{availableDates.length})</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedExportDates.length === availableDates.length) {
                      setSelectedExportDates([]);
                    } else {
                      setSelectedExportDates([...availableDates]);
                    }
                  }}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                >
                  {selectedExportDates.length === availableDates.length ? 'Pilih Tak Satupun' : 'Pilih Semua Tanggal'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700">
                {availableDates.length === 0 ? (
                  <span className="text-xs text-slate-400 col-span-3 italic">Tidak ada tanggal terdaftar</span>
                ) : (
                  availableDates.map((dStr) => {
                    const isChecked = selectedExportDates.includes(dStr);
                    return (
                      <label
                        key={dStr}
                        className={`flex items-center gap-2 p-1.5 rounded-lg text-xs font-mono font-semibold cursor-pointer border transition ${isChecked
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedExportDates([...selectedExportDates, dStr]);
                            } else {
                              setSelectedExportDates(selectedExportDates.filter((x) => x !== dStr));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>{formatDateHeader(dStr)}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* MULTI-CHOICE SURAT JALAN */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  <span>Pilih No. Surat Jalan ({selectedExportSjs.length}/{availableSjs.length})</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedExportSjs.length === availableSjs.length) {
                      setSelectedExportSjs([]);
                    } else {
                      setSelectedExportSjs([...availableSjs]);
                    }
                  }}
                  className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline"
                >
                  {selectedExportSjs.length === availableSjs.length ? 'Pilih Tak Satupun' : 'Pilih Semua SJ'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700">
                {availableSjs.length === 0 ? (
                  <span className="text-xs text-slate-400 col-span-2 italic">Tidak ada SJ terdaftar</span>
                ) : (
                  availableSjs.map((sjStr) => {
                    const isChecked = selectedExportSjs.includes(sjStr);
                    return (
                      <label
                        key={sjStr}
                        className={`flex items-center gap-2 p-1.5 rounded-lg text-xs font-mono font-semibold cursor-pointer border transition ${isChecked
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedExportSjs([...selectedExportSjs, sjStr]);
                            } else {
                              setSelectedExportSjs(selectedExportSjs.filter((x) => x !== sjStr));
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="truncate">{sjStr}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                Catatan Export: Hasil Excel berurutan <strong>Terbaru &rarr; Terlama</strong> dan kini lengkap dengan kolom <strong>Qty Nota, Hitung Ulang (Fisik, Selisih, Status Audit, Log)</strong> serta tab khusus <strong>&ldquo;Rekap Hitung Ulang&rdquo;</strong>. Seluruh histori tanggal per kode produk juga dilampirkan.
              </span>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={isExportingExcel}
                onClick={handleExportModernExcelWithFilters}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                {isExportingExcel ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{exportProgressMsg || 'Mengunduh...'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Excel Modern (.xlsx)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMPTY STATE */}
      {filteredBlocks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 sm:p-16 text-center text-slate-400 space-y-3">
          <Layers className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <div>
            <p className="font-bold text-sm text-slate-700 dark:text-slate-200">
              {hasActiveDateRange
                ? `Tidak ada data ${activeTab} pada rentang ${dateRangeLabel}`
                : `Belum ada data barang kedatangan pada Tab ${activeTab}`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {hasActiveDateRange
                ? 'Ubah rentang tanggal atau reset filter untuk melihat seluruh tabel kode.'
                : 'Klik tombol di bawah untuk menambahkan tabel kode kedatangan baru.'}
            </p>
          </div>
          {hasActiveDateRange ? (
            <button
              type="button"
              onClick={() => updateDateRange('', '')}
              className="min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Reset Filter Tanggal</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAddNewBlock}
              className="min-h-[40px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kode {activeTab} Baru</span>
            </button>
          )}
        </div>
      ) : (
        /* SPREADSHEET MASTER TABLES */
        <div className="space-y-4">
          {/* Top Pagination & Info Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-2xl text-xs text-slate-500 border border-slate-200 dark:border-slate-700/80 flex-wrap gap-2.5 print:hidden shadow-2xs">
            <div className="flex items-center gap-2">
              <span>
                Menampilkan{' '}
                <strong className="text-slate-800 dark:text-slate-100 font-bold">
                  {filteredBlocks.length === 0
                    ? 0
                    : pageSize === -1
                      ? `1 - ${filteredBlocks.length}`
                      : `${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredBlocks.length)}`}
                </strong>{' '}
                dari <strong className="text-slate-800 dark:text-slate-100 font-bold">{filteredBlocks.length}</strong> Kode Produksi
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Page Size Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-semibold">Tampilkan:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                >
                  <option value={10}>10 Tabel</option>
                  <option value={20}>20 Tabel</option>
                  <option value={50}>50 Tabel</option>
                  <option value={-1}>Semua Tabel</option>
                </select>
              </div>

              {/* Pagination Controls */}
              {pageSize !== -1 && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    title="Halaman Sebelumnya"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 px-1.5">
                    Hal {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                    title="Halaman Berikutnya"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {paginatedBlocks.map((block) => {
              const isEditingThisBlock = editingBlockId === block.id;

              const totalSubRows = block.colorGroups.reduce(
                (acc, c) => acc + Math.max(1, c.sizes.length),
                0
              );

              let renderedRowsCount = 0;
              const returSlots = isCMT ? block.returDateSlots || ['', '', '', '', ''] : [];

              return (
                <div
                  key={block.id}
                  className={`bg-white dark:bg-slate-900 rounded-xl shadow-xs overflow-hidden transition-all print:border-black ${isEditingThisBlock
                    ? 'border-2 border-rose-500 ring-4 ring-rose-500/10'
                    : 'border border-slate-300 dark:border-slate-700'
                    }`}
                >
                  {/* Block Header Toolbar (Clean Mobile & Desktop Hierarchy) */}
                  <div
                    className={`px-3 sm:px-4 py-2.5 border-b space-y-2 text-xs ${
                      isEditingThisBlock
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                        : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {/* Top Row: Code + Primary KPI + Consolidated Actions */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-mono text-xs font-bold shrink-0">
                          #{block.code}
                        </span>

                        {isEditingThisBlock && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider shrink-0">
                            Edit Aktif
                          </span>
                        )}

                        <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                          {isCMT ? (
                            <>
                              Net <strong className="text-emerald-600 dark:text-emerald-400">{block.totalNet}</strong>
                              <span className="text-slate-400 font-normal"> (Datang {block.totalDatang}{block.totalRetur ? ` · Retur ${block.totalRetur}` : ''})</span>
                            </>
                          ) : (
                            <>
                              Datang <strong className="text-slate-900 dark:text-white">{block.totalDatang} pcs</strong>
                            </>
                          )}
                        </span>

                        {(() => {
                          const hasNota = block.qtyNota !== null && block.qtyNota !== undefined;
                          const hasRecount = block.hasRecount && block.totalRecountFisik !== null && block.totalRecountFisik !== undefined;
                          let selisih: number | null = null;
                          if (hasNota) {
                            const base = hasRecount ? block.totalRecountFisik! : block.totalNet;
                            selisih = base - Number(block.qtyNota);
                          } else if (hasRecount) {
                            selisih = block.totalRecountFisik! - block.totalNet;
                          }
                          if (selisih === null) return null;
                          const isMatch = selisih === 0;
                          const isKurang = selisih < 0;
                          return (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border tabular-nums ${
                                isMatch
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                  : isKurang
                                    ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                              }`}
                            >
                              Selisih {hasNota ? 'Nota' : 'SJ'}: {selisih > 0 ? `+${selisih}` : selisih}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Mode Edit & Save Controls (Consolidated) */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isEditingThisBlock ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAddColor(block.id)}
                              className="min-h-[34px] px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Warna</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSaveBlockChanges(block.id)}
                              className="min-h-[34px] px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Simpan</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCancelEditBlock(block.id)}
                              className="min-h-[34px] px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Batal</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEditBlock(block)}
                              className="min-h-[34px] px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 cursor-pointer"
                              title="Edit angka tabel ini"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                              <span className="hidden sm:inline">Edit Tabel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActionSheetBlock(block)}
                              aria-label="Menu aksi blok kode"
                              className="min-h-[34px] min-w-[34px] px-2 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 transition flex items-center justify-center cursor-pointer"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Second Row: Compact Recount / Nota / SJ Links / Catatan */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-[11px] text-slate-500 dark:text-slate-400">
                      {block.hasRecount && block.totalRecountFisik !== null && block.totalRecountFisik !== undefined && (
                        <span className="shrink-0 font-mono text-emerald-700 dark:text-emerald-300 font-semibold">
                          Fisik: {block.totalRecountFisik}
                        </span>
                      )}
                      {block.qtyNota !== null && block.qtyNota !== undefined && (
                        <span className="shrink-0 font-mono text-amber-700 dark:text-amber-300 font-semibold">
                          Nota: {block.qtyNota}
                        </span>
                      )}

                      {(!block.distinctSjs || block.distinctSjs.length === 0) ? (
                        <span className="shrink-0 italic">SJ-{block.code}</span>
                      ) : (
                        block.distinctSjs.map((sjObj) => (
                          <button
                            key={sjObj.no_surat_jalan}
                            type="button"
                            onClick={() => onOpenEditBatch && onOpenEditBatch(sjObj.no_surat_jalan)}
                            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-200 font-mono font-semibold border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                            title={`Edit SJ ${sjObj.no_surat_jalan} (${sjObj.qty} pcs, ${sjObj.tanggal})`}
                          >
                            <span>{sjObj.no_surat_jalan}</span>
                            <span className="text-[10px] text-slate-400">({sjObj.qty})</span>
                          </button>
                        ))
                      )}

                      {isEditingThisBlock ? (
                        <input
                          type="text"
                          placeholder="Catatan produk..."
                          value={block.catatan || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBlocks((prev) =>
                              prev.map((b) => (b.id === block.id ? { ...b, catatan: val } : b))
                            );
                          }}
                          className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-xs text-slate-800 dark:text-slate-100 outline-none w-48 shrink-0"
                        />
                      ) : block.catatan ? (
                        <span className="shrink-0 italic text-amber-700 dark:text-amber-300">
                          Catatan: {block.catatan}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-center border-collapse text-xs select-text border border-slate-300 dark:border-slate-700 min-w-[900px]">
                      {/* SPREADSHEET HEADER */}
                      <thead>
                        {/* HEADER ROW 1 */}
                        <tr className="bg-[#fce8e6] dark:bg-[#3d1e22] text-slate-900 dark:text-rose-100 font-bold uppercase text-[11px] tracking-wider border-b border-slate-300 dark:border-slate-700 divide-x divide-slate-300 dark:divide-slate-700">
                          <th rowSpan={2} className="py-2.5 px-2.5 w-12 border-r border-slate-300 dark:border-slate-700">
                            NO
                          </th>
                          <th rowSpan={2} className="py-2.5 px-3 min-w-[80px]">
                            CODE
                          </th>
                          <th rowSpan={2} className="py-2.5 px-3 min-w-[120px]">
                            PRODUCT NAME
                          </th>
                          <th rowSpan={2} className="py-2.5 px-2.5 w-16">
                            UP
                          </th>
                          <th rowSpan={2} className="py-2.5 px-3 min-w-[160px]">
                            PHOTO
                          </th>
                          <th rowSpan={2} className="py-2.5 px-3 min-w-[100px]">
                            COLOR
                          </th>
                          <th rowSpan={2} className="py-2.5 px-2.5 w-14">
                            SIZE
                          </th>

                          {/* 10 KOLOM QTY BARANG DATANG SPAN */}
                          <th
                            colSpan={FIXED_DATE_COLUMNS_COUNT}
                            className="py-1.5 px-3 bg-[#fce8e6] dark:bg-[#3d1e22] text-center border-b border-slate-300 dark:border-slate-700"
                          >
                            QTY BARANG DATANG
                          </th>

                          {/* KHUSUS CMT: 5 KOLOM QTY BARANG RETUR SPAN */}
                          {isCMT && (
                            <th
                              colSpan={FIXED_RETUR_COLUMNS_COUNT}
                              className="py-1.5 px-3 bg-[#ffe4e6] dark:bg-[#4c1d24] text-red-900 dark:text-red-200 text-center border-b border-slate-300 dark:border-slate-700 font-black"
                            >
                              QTY BARANG RETUR
                            </th>
                          )}

                          {/* 1. TOTAL DATANG PER ROW (UNMERGED) */}
                          <th rowSpan={2} className="py-2.5 px-2.5 min-w-[70px] bg-[#fdf2f1] dark:bg-[#341b1e] text-slate-800 dark:text-rose-200">
                            TOTAL<br />DATANG
                          </th>

                          {/* 2. TOTAL AWAL (NET BLOK) */}
                          <th rowSpan={2} className="py-2.5 px-3 min-w-[85px] bg-[#fce8e6] dark:bg-[#3d1e22]">
                            TOTAL AWAL<br />{isCMT ? '(NET)' : 'DITERIMA'}
                          </th>

                          {/* 3. QTY NOTA (BLOK) */}
                          <th
                            rowSpan={2}
                            className="py-2.5 px-3 min-w-[95px] bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200"
                            title="Qty Nota diisi oleh Buyer di Google Sheet (atau langsung di tabel ini)"
                          >
                            QTY<br />NOTA
                          </th>

                          {/* 4. TOTAL HITUNG ULANG (BLOK) */}
                          <th
                            rowSpan={2}
                            className="py-2.5 px-3 min-w-[95px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                            title="Total Fisik Hasil Audit Hitung Ulang (Keseluruhan Ukuran Model Ini)"
                          >
                            TOTAL<br />HITUNG ULANG
                          </th>

                          {/* 5. SELISIH NOTA (BLOK) */}
                          <th
                            rowSpan={2}
                            className="py-2.5 px-3 min-w-[95px] bg-sky-100 dark:bg-sky-950/60 text-sky-950 dark:text-sky-200"
                            title="Formula Selisih: Total Hitung - Nota, atau Total Awal - Nota, atau Total Hitung - Awal jika Nota kosong"
                          >
                            SELISIH<br />NOTA
                          </th>

                          {/* 6-8. KOLOM RINCIAN AUDIT PER ROW */}
                          <th rowSpan={2} className="py-2.5 px-2.5 min-w-[75px] bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                            FISIK<br />HITUNG
                          </th>
                          <th rowSpan={2} className="py-2.5 px-2.5 min-w-[75px] bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                            SELISIH<br />FISIK
                          </th>
                          <th rowSpan={2} className="py-2.5 px-3 min-w-[90px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                            STATUS
                          </th>
                        </tr>

                        {/* HEADER ROW 2 */}
                        <tr className="bg-[#fce8e6] dark:bg-[#3d1e22] text-slate-800 dark:text-rose-200 font-bold uppercase text-[10px] border-b-2 border-slate-400 dark:border-slate-600 divide-x divide-slate-300 dark:divide-slate-700">
                          {/* 10 Date Columns Header */}
                          {block.dateSlots.map((dStr, idx) => {
                            const slotDate = dStr ? dStr.split('||')[0] : '';
                            const slotSj = dStr && dStr.includes('||') ? dStr.split('||')[1] : '';
                            const cleanSjSubtitle = slotSj
                              ? slotSj.replace(/^KARGOCHN\s*/i, '').replace(/^SJ-?/i, '').trim()
                              : (slotDate && block.dateToSjMap?.[slotDate]?.length === 1
                                ? block.dateToSjMap[slotDate][0].replace(/^KARGOCHN\s*/i, '').replace(/^SJ-?/i, '')
                                : '');

                            return (
                              <th
                                key={`datang-${idx}`}
                                onClick={() => {
                                  if (isEditingThisBlock) {
                                    handleEditDatePrompt(block.id, idx, 'datang', slotDate);
                                  }
                                }}
                                className={`py-1 px-1 min-w-[50px] max-w-[72px] font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 ${isEditingThisBlock ? 'cursor-pointer hover:bg-rose-300/80 bg-rose-100 dark:bg-rose-900/60' : ''
                                  }`}
                                title={
                                  slotDate
                                    ? `Tanggal ${slotDate}${slotSj ? ` - No. SJ: ${slotSj}` : ''}`
                                    : isEditingThisBlock
                                      ? 'Klik untuk ubah tanggal datang'
                                      : undefined
                                }
                              >
                                {dStr ? (
                                  <div className="flex flex-col items-center justify-center">
                                    <span>{formatDateHeader(slotDate)}</span>
                                    {cleanSjSubtitle && (
                                      <span
                                        className="text-[8px] font-mono text-blue-700 dark:text-blue-300 truncate max-w-[64px] block leading-tight mt-0.5 px-1 py-0.2 bg-blue-100/70 dark:bg-blue-900/60 rounded"
                                        title={`No. SJ: ${slotSj || cleanSjSubtitle}`}
                                      >
                                        {cleanSjSubtitle}
                                      </span>
                                    )}
                                  </div>
                                ) : isEditingThisBlock ? (
                                  <span className="text-rose-600 dark:text-rose-400 font-normal hover:underline">+ Tgl</span>
                                ) : (
                                  ''
                                )}
                              </th>
                            );
                          })}

                          {/* Retur Date Headers (CMT) */}
                          {isCMT &&
                            returSlots.map((rStr, rIdx) => (
                              <th
                                key={`retur-${rIdx}`}
                                onClick={() => {
                                  if (isEditingThisBlock) {
                                    handleEditDatePrompt(block.id, rIdx, 'retur', rStr);
                                  }
                                }}
                                className={`py-1 px-1.5 min-w-[48px] max-w-[55px] font-mono text-[10px] font-bold bg-[#ffe4e6] dark:bg-[#4c1d24] text-red-800 dark:text-red-200 ${isEditingThisBlock ? 'cursor-pointer hover:bg-red-300/80' : ''
                                  }`}
                                title={isEditingThisBlock ? 'Klik untuk ubah tanggal retur' : undefined}
                              >
                                {rStr ? (
                                  formatDateHeader(rStr)
                                ) : isEditingThisBlock ? (
                                  <span className="text-red-600 dark:text-red-400 font-normal hover:underline">+ Ret</span>
                                ) : (
                                  ''
                                )}
                              </th>
                            ))}
                        </tr>
                      </thead>

                      {/* TABLE BODY */}
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                        {block.colorGroups.map((colorGroup, colorIndex) => {
                          const colorSubRows = colorGroup.sizes.length;

                          return colorGroup.sizes.map((sizeItem, sizeIndex) => {
                            const isFirstRowOfBlock = renderedRowsCount === 0;
                            const isFirstRowOfColor = sizeIndex === 0;
                            renderedRowsCount++;

                            return (
                              <tr
                                key={`${block.id}-${colorGroup.color}-${sizeItem.size}`}
                                className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition divide-x divide-slate-200 dark:divide-slate-800"
                              >
                                {/* 1. NO */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    className="py-3 px-2 font-bold text-slate-900 dark:text-white text-center align-top bg-white dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700"
                                  >
                                    {block.rowNumber}
                                  </td>
                                )}

                                {/* 2. CODE */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    className="py-3 px-2.5 font-bold text-slate-900 dark:text-white text-center align-top"
                                  >
                                    {block.code}
                                  </td>
                                )}

                                {/* 3. PRODUCT NAME */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    className="py-3 px-2 text-center align-top bg-white dark:bg-slate-900"
                                  >
                                    {isEditingThisBlock ? (
                                      <input
                                        type="text"
                                        placeholder="Nama produk..."
                                        value={block.productName || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setBlocks((prev) =>
                                            prev.map((b) => (b.id === block.id ? { ...b, productName: val } : b))
                                          );
                                        }}
                                        className="w-full text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-rose-500"
                                      />
                                    ) : (
                                      <div className="flex flex-col items-center gap-1.5">
                                        <span className="font-medium">{block.productName || ''}</span>
                                        {block.alternateCandidates && block.alternateCandidates.length > 0 && (
                                          <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                                            {block.alternateCandidates.map((alt: any) => (
                                              <button
                                                key={alt.id}
                                                type="button"
                                                onClick={() => handleSwitchTrelloCandidate(block.id, alt)}
                                                title={`Tukar dengan "${alt.item_name || alt.card_name}"`}
                                                className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded text-[10px] font-bold flex items-center gap-1 transition shadow-2xs cursor-pointer active:scale-95"
                                              >
                                                <RefreshCw className="w-2.5 h-2.5" />
                                                <span>⇄ Ganti: {(alt.item_name || alt.card_name).replace(/SAMPLE/i, '').trim()}</span>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )}

                                {/* 4. UP */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    className="py-3 px-2 text-center align-top bg-white dark:bg-slate-900"
                                  >
                                    {isEditingThisBlock ? (
                                      <input
                                        type="text"
                                        placeholder="UP..."
                                        value={block.upVendor || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setBlocks((prev) =>
                                            prev.map((b) => (b.id === block.id ? { ...b, upVendor: val } : b))
                                          );
                                        }}
                                        className="w-full text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-rose-500"
                                      />
                                    ) : (
                                      <span>{block.upVendor || ''}</span>
                                    )}
                                  </td>
                                )}

                                {/* 5. PHOTO (TAMPIL UTUH & PROPORSIONAL + DRAG & DROP + COPAS) */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    onDragOver={(e) => handleCellDragOver(e, block.id)}
                                    onDragLeave={(e) => handleCellDragLeave(e, block.id)}
                                    onDrop={(e) => handleCellDrop(e, block.id)}
                                    className={`p-2 text-center align-middle transition-colors ${dragOverBlockId === block.id
                                      ? 'bg-rose-100/70 dark:bg-rose-950/70 ring-2 ring-rose-500 ring-inset'
                                      : 'bg-slate-50/50 dark:bg-slate-850/50'
                                      }`}
                                  >
                                    {dragOverBlockId === block.id ? (
                                      <div className="w-48 h-48 mx-auto rounded-2xl border-2 border-dashed border-rose-500 bg-rose-50/80 dark:bg-rose-950/80 flex flex-col items-center justify-center text-rose-600 animate-pulse p-4">
                                        <UploadCloud className="w-8 h-8 mb-2" />
                                        <span className="text-xs font-black">Lepaskan Foto di Sini!</span>
                                        <span className="text-[10px] text-rose-500/80 mt-1">Otomatis Terkompresi WebP</span>
                                      </div>
                                    ) : block.photoUrl ? (
                                      <div className="relative group w-64 h-64 sm:w-80 sm:h-80 mx-auto rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 shadow-xs bg-slate-100 dark:bg-slate-800 p-0.5">
                                        <img
                                          src={block.photoUrl}
                                          alt={block.code}
                                          loading="lazy"
                                          decoding="async"
                                          className="w-full h-full object-contain rounded-lg group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                                          referrerPolicy="no-referrer"
                                          onClick={() =>
                                            onOpenLightbox({
                                              url: block.photoUrl!,
                                              title: `Kode Produksi: ${block.code}`,
                                              subtitle: `Total Net: ${block.totalNet} pcs`,
                                            })
                                          }
                                        />
                                        {isEditingThisBlock && (
                                          <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-center gap-1.5 opacity-90 group-hover:opacity-100 transition">
                                            <button
                                              type="button"
                                              onClick={() => handleEditPhoto(block.id)}
                                              className="px-2.5 py-1 bg-white/90 hover:bg-white text-slate-900 rounded-lg text-[10px] font-black shadow-xs transition flex items-center gap-1 cursor-pointer"
                                            >
                                              <Edit3 className="w-3 h-3" />
                                              <span>Ganti / Copas</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setBlocks((prev) =>
                                                  prev.map((b) => (b.id === block.id ? { ...b, photoUrl: '' } : b))
                                                );
                                              }}
                                              className="p-1 bg-rose-600/90 hover:bg-rose-700 text-white rounded-lg text-[10px] transition cursor-pointer"
                                              title="Hapus Foto"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div
                                        onClick={() => isEditingThisBlock && handleEditPhoto(block.id)}
                                        className={`w-36 h-36 mx-auto rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 bg-slate-100/50 dark:bg-slate-800/40 p-3 transition ${isEditingThisBlock
                                          ? 'hover:text-rose-600 hover:border-rose-400 hover:bg-rose-50/20 cursor-pointer group shadow-2xs'
                                          : ''
                                          }`}
                                      >
                                        <div className="p-2 rounded-xl bg-slate-200/60 dark:bg-slate-700 group-hover:bg-rose-100 dark:group-hover:bg-rose-950 text-slate-500 group-hover:text-rose-600 mb-1.5 transition">
                                          <UploadCloud className="w-5 h-5" />
                                        </div>
                                        <span className="text-xs font-black text-slate-700 dark:text-slate-300 group-hover:text-rose-600">
                                          {isEditingThisBlock ? '+ Tambah Foto' : 'No Photo'}
                                        </span>
                                        {isEditingThisBlock && (
                                          <span className="text-[9px] text-slate-400 text-center mt-1 leading-tight">
                                            Drag &amp; Drop / Klik / Copas (Ctrl+V)
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )}

                                {/* 6. COLOR */}
                                {isFirstRowOfColor && (
                                  <td
                                    rowSpan={colorSubRows}
                                    className="py-2.5 px-3 font-bold text-slate-900 dark:text-white text-center align-middle bg-white dark:bg-slate-900 text-xs"
                                  >
                                    <div className="flex flex-col items-center justify-center gap-1">
                                      <span>{colorGroup.color}</span>
                                      {isEditingThisBlock && (
                                        <button
                                          type="button"
                                          onClick={() => handleAddSizeRow(block.id, colorIndex)}
                                          className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                                        >
                                          + Size
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}

                                {/* 7. SIZE */}
                                <td className="py-2 px-2 text-center font-bold text-slate-800 dark:text-slate-200 text-xs bg-slate-50/40 dark:bg-slate-800/40">
                                  {sizeItem.size}
                                </td>

                                {/* 8. QTY BARANG DATANG */}
                                {block.dateSlots.map((dStr, slotIdx) => {
                                  const qtyVal = dStr ? sizeItem.qtyByDate[dStr] : undefined;
                                  return (
                                    <td
                                      key={`slot-datang-${slotIdx}`}
                                      className={`p-0 text-center font-mono font-bold text-xs ${qtyVal
                                        ? 'bg-[#fff2cc] dark:bg-[#38311d] text-amber-950 dark:text-amber-100 border border-[#ffe599]/60 dark:border-amber-800/40'
                                        : 'text-slate-300 dark:text-slate-700'
                                        }`}
                                    >
                                      {isEditingThisBlock ? (
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          disabled={!dStr}
                                          value={qtyVal !== undefined && qtyVal !== 0 ? String(qtyVal) : ''}
                                          onChange={(e) =>
                                            handleTypeQtyDatang(block.id, colorIndex, sizeIndex, dStr, e.target.value)
                                          }
                                          placeholder={dStr ? '-' : ''}
                                          className="w-full h-8 text-center bg-transparent border-none outline-none font-bold text-xs focus:bg-amber-200 dark:focus:bg-amber-900/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      ) : (
                                        <div className="py-2 px-1">
                                          {qtyVal || ''}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}

                                {/* 9. QTY BARANG RETUR (Khusus CMT) */}
                                {isCMT &&
                                  returSlots.map((rStr, rIdx) => {
                                    const effectiveSlotDate = rStr || (block.returDateSlots && block.returDateSlots[rIdx]) || '';
                                    const rQtyVal = effectiveSlotDate ? sizeItem.qtyReturByDate?.[effectiveSlotDate] : undefined;
                                    return (
                                      <td
                                        key={`slot-retur-${rIdx}`}
                                        className={`p-0 text-center font-mono font-bold text-xs ${rQtyVal
                                          ? 'bg-[#ffe4e6] dark:bg-[#4c1d24] text-red-900 dark:text-red-100 border border-red-200 dark:border-red-900'
                                          : 'text-slate-300 dark:text-slate-700'
                                          }`}
                                      >
                                        {isEditingThisBlock ? (
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={rQtyVal !== undefined && rQtyVal !== 0 ? String(rQtyVal) : ''}
                                            onChange={(e) => {
                                              const activeReturDate = effectiveSlotDate || new Date().toISOString().split('T')[0];
                                              handleTypeQtyRetur(block.id, colorIndex, sizeIndex, rIdx, activeReturDate, e.target.value);
                                            }}
                                            placeholder="-"
                                            title={!effectiveSlotDate ? "Klik header +Ret untuk set tanggal retur spesifik, atau langsung ketik angka" : undefined}
                                            className="w-full h-8 text-center bg-transparent border-none outline-none font-bold text-xs text-red-600 dark:text-red-400 focus:bg-red-200 dark:focus:bg-red-900/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          />
                                        ) : (
                                          <div className="py-2 px-1 text-red-600 dark:text-red-400">
                                            {rQtyVal || ''}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}

                                {/* 10a. TOTAL DATANG PER ROW (UNMERGED) */}
                                <td className="py-2 px-2 text-center font-mono font-bold text-xs bg-slate-50/80 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-700">
                                  {sizeItem.totalSizeQty}
                                </td>

                                {/* 10b. TOTAL AWAL (NET BLOK) — Merged Per Block */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    className="py-3 px-2 text-center align-middle font-mono font-black text-sm text-slate-900 dark:text-white bg-slate-100/60 dark:bg-slate-800/60 border-r border-slate-300 dark:border-slate-700"
                                  >
                                    <div>{block.totalNet}</div>
                                    {isCMT && block.totalRetur ? (
                                      <div className="text-[10px] font-normal text-slate-500">
                                        ({block.totalDatang} - {block.totalRetur})
                                      </div>
                                    ) : null}
                                  </td>
                                )}

                                {/* 10c. QTY NOTA (BUYER) — Merged Per Block */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    className="py-2 px-2 text-center align-middle font-mono bg-amber-50/40 dark:bg-amber-950/20 border-r border-slate-300 dark:border-slate-700"
                                  >
                                    <div className="flex flex-col items-center justify-center gap-1">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        defaultValue={
                                          block.qtyNota !== null && block.qtyNota !== undefined
                                            ? String(block.qtyNota)
                                            : ''
                                        }
                                        key={`nota-${block.code}-${block.qtyNota ?? 'empty'}`}
                                        placeholder="Isi Nota..."
                                        title="Qty Nota Buyer (otomatis tersinkron dengan Google Sheet & dibackup ke Supabase. Tekan Enter atau klik di luar untuk simpan)"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            (e.target as HTMLInputElement).blur();
                                          }
                                        }}
                                        onBlur={(e) => {
                                          const val = e.target.value.trim();
                                          const currentStr =
                                            block.qtyNota !== null && block.qtyNota !== undefined
                                              ? String(block.qtyNota)
                                              : '';
                                          if (val !== currentStr) {
                                            handleUpdateBlockQtyNota(block.code, val, block.kategori);
                                          }
                                        }}
                                        className="w-20 px-2 py-1 text-center font-mono font-black text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 focus:ring-2 focus:ring-amber-500 outline-none shadow-2xs"
                                      />
                                      {qtyNotaMap[block.code]?.source_sheet && (
                                        <span className="text-[9px] text-slate-400 truncate max-w-[85px]" title={`Sumber: ${qtyNotaMap[block.code]?.source_sheet}`}>
                                          {qtyNotaMap[block.code]?.source_sheet}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                )}

                                {/* 10d. TOTAL HITUNG ULANG (FISIK) — Merged Per Block */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    className="py-2 px-2 text-center align-middle font-mono bg-emerald-50/30 dark:bg-emerald-950/10 border-r border-slate-300 dark:border-slate-700"
                                    title="Total Fisik Hasil Audit Hitung Ulang untuk seluruh ukuran model ini"
                                  >
                                    {block.hasRecount && block.totalRecountFisik !== null && block.totalRecountFisik !== undefined ? (
                                      <div className="flex flex-col items-center">
                                        <span className="font-mono font-black text-sm text-emerald-800 dark:text-emerald-300">
                                          {block.totalRecountFisik}
                                        </span>
                                        <span className="text-[9px] text-slate-400">pcs fisik</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-300 dark:text-slate-700 text-xs">-</span>
                                    )}
                                  </td>
                                )}

                                {/* 10e. SELISIH NOTA — Merged Per Block (Mengikuti 4 Kondisi Pasti) */}
                                {isFirstRowOfBlock && (
                                  <td
                                    rowSpan={totalSubRows}
                                    className="py-2 px-2 text-center align-middle font-mono bg-sky-50/20 dark:bg-sky-950/10 border-r border-slate-300 dark:border-slate-700"
                                  >
                                    {(() => {
                                      const hasNota = block.qtyNota !== null && block.qtyNota !== undefined;
                                      const hasRecount = block.hasRecount && block.totalRecountFisik !== null && block.totalRecountFisik !== undefined;
                                      let selisih: number | null = null;
                                      let label = '';

                                      // Kondisi 1 & 2: Jika Qty Nota terisi
                                      if (hasNota) {
                                        const base = hasRecount ? block.totalRecountFisik! : block.totalNet;
                                        selisih = base - block.qtyNota!;
                                        label = selisih === 0 ? '✅ Klop Nota' : (selisih < 0 ? `Kurang ${Math.abs(selisih)}` : `Lebih +${selisih}`);
                                      }
                                      // Kondisi 3: Jika Qty Nota KOSONG tapi sudah ada Hitung Ulang
                                      else if (hasRecount) {
                                        selisih = block.totalRecountFisik! - block.totalNet;
                                        label = selisih === 0 ? '✅ Klop SJ' : (selisih < 0 ? `Kurang ${Math.abs(selisih)}` : `Lebih +${selisih}`);
                                      }

                                      // Kondisi 4: Jika Qty Nota KOSONG dan belum hitung ulang
                                      if (selisih === null) {
                                        return <span className="text-slate-300 dark:text-slate-700 text-xs">-</span>;
                                      }

                                      const isMatch = selisih === 0;
                                      const isKurang = selisih < 0;
                                      return (
                                        <div className="flex flex-col items-center gap-1">
                                          <span
                                            className={`inline-block px-2 py-0.5 rounded-lg text-xs font-black border ${isMatch
                                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                              : isKurang
                                                ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                                : 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                                              }`}
                                          >
                                            {selisih > 0 ? `+${selisih}` : selisih}
                                          </span>
                                          <span
                                            className={`text-[9px] font-bold ${isMatch
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : isKurang
                                                ? 'text-rose-600 dark:text-rose-400'
                                                : 'text-blue-600 dark:text-blue-400'
                                              }`}
                                          >
                                            {label}
                                          </span>
                                          {!isMatch && onOpenHitungUlang && (
                                            <button
                                              type="button"
                                              onClick={() => onOpenHitungUlang(block.code)}
                                              className="mt-0.5 px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                              title="Kode ini otomatis masuk Antrian Audit Hitung Ulang. Klik untuk buka lembar hitung ulang."
                                            >
                                              📋 Audit Antrian
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                )}

                                {/* 11. FISIK HITUNG (Per Varian Size) */}
                                <td className="py-2 px-2 text-center font-mono font-bold text-xs bg-blue-50/20 dark:bg-blue-950/20">
                                  {sizeItem.recountFisik !== null && sizeItem.recountFisik !== undefined ? (
                                    <div>
                                      <span className="text-blue-700 dark:text-blue-300 font-black">{sizeItem.recountFisik}</span>
                                      {sizeItem.recountRound ? (
                                        <span className="block text-[9px] font-normal text-slate-400">Rev {sizeItem.recountRound}</span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700">-</span>
                                  )}
                                </td>

                                {/* 12. SELISIH (Per Varian Size) */}
                                <td className="py-2 px-1 text-center font-mono font-bold text-xs">
                                  {sizeItem.recountFisik !== null && sizeItem.recountFisik !== undefined ? (
                                    sizeItem.recountSelisih !== null && sizeItem.recountSelisih !== undefined ? (
                                      sizeItem.recountSelisih === 0 ? (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                          0
                                        </span>
                                      ) : sizeItem.recountSelisih < 0 ? (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                          {sizeItem.recountSelisih}
                                        </span>
                                      ) : (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                          +{sizeItem.recountSelisih}
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700">-</span>
                                  )}
                                </td>

                                {/* 13. STATUS (Per Varian Size) */}
                                <td className="py-2 px-2 text-center text-[10px]">
                                  {sizeItem.recountFisik !== null && sizeItem.recountFisik !== undefined ? (
                                    sizeItem.recountSelisih === 0 ? (
                                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800">
                                        ✅ Match
                                      </span>
                                    ) : (sizeItem.recountSelisih || 0) < 0 ? (
                                      <span
                                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800"
                                        title={sizeItem.recountNotes ? `Catatan: ${sizeItem.recountNotes}` : undefined}
                                      >
                                        ⚠️ Kurang
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
                                        📦 Lebih
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-slate-400 text-[10px] italic">Belum</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Pagination Bar */}
          {pageSize !== -1 && totalPages > 1 && (
            <div className="px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs print:hidden">
              <span className="text-slate-500 font-medium">
                Menampilkan {(currentPage - 1) * pageSize + 1} -{' '}
                {Math.min(currentPage * pageSize, filteredBlocks.length)} dari {filteredBlocks.length} Kode Produksi
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-xs"
                  title="Halaman Pertama"
                >
                  Pertama
                </button>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-slate-700 dark:text-slate-300 px-2 text-xs">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="Halaman Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer text-xs"
                  title="Halaman Terakhir"
                >
                  Terakhir
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PUSH DATE SHEETS MODAL (1 SHEET PER TANGGAL) */}
      {isPushDateModalOpen && (
        <PushDateSheetsModal
          isOpen={isPushDateModalOpen}
          onClose={() => setIsPushDateModalOpen(false)}
          dataList={dataList}
          blocks={blocks}
          activeTab={activeTab}
          initialDateFilter={dateFrom || dateTo || null}
          productCatalog={productCatalog}
          onShowToast={onShowToast}
        />
      )}

      {/* PHOTO UPLOAD / DRAG & DROP / PASTE MODAL */}
      {photoModalBlockId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-100 dark:bg-rose-950 text-rose-600 rounded-xl">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Kelola Foto Produk: {photoModalBlockId}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bisa Drag &amp; Drop, Copas (Ctrl+V), Pilih File, atau Input Link
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPhotoModalBlockId(null)}
                className="p-1 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drag and Drop Zone & Paste Listener Box */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
                  if (file) {
                    await handleApplyImageFileToBlock(photoModalBlockId, file);
                  }
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-rose-300 dark:border-rose-800 hover:border-rose-500 bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/60 rounded-2xl p-6 text-center cursor-pointer transition space-y-2 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    await handleApplyImageFileToBlock(photoModalBlockId, e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 flex items-center justify-center group-hover:scale-110 transition">
                {isCompressingPhoto ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <UploadCloud className="w-6 h-6" />
                )}
              </div>
              <div>
                <p className="text-xs font-black text-slate-800 dark:text-slate-100">
                  {isCompressingPhoto ? 'Sedang Mengompres Foto...' : 'Klik untuk Pilih File atau Drag & Drop Gambar ke Sini'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 Tips Cepat: Tekan <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded font-mono font-bold text-rose-600">Ctrl + V</kbd> (Copas dari Clipboard) kapan saja!
                </p>
              </div>
            </div>

            {/* Input Direct Link URL */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-slate-400" />
                <span>Atau Masukkan Link Foto / Google Drive URL:</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="https://drive.google.com/... atau https://..."
                  value={photoUrlInput}
                  onChange={(e) => setPhotoUrlInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setBlocks((prev) =>
                      prev.map((b) => (b.id === photoModalBlockId ? { ...b, photoUrl: photoUrlInput.trim() } : b))
                    );
                    onShowToast('Link foto produk berhasil diterapkan.', 'success');
                    setPhotoModalBlockId(null);
                  }}
                  className="px-3.5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black hover:bg-slate-800 transition cursor-pointer"
                >
                  Terapkan
                </button>
              </div>
            </div>

            {/* Current Preview if exists */}
            {photoUrlInput && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between gap-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <img
                    src={photoUrlInput}
                    alt="Preview"
                    className="w-12 h-12 rounded-lg object-contain bg-white dark:bg-slate-900 border border-slate-200 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="truncate text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200 block truncate">Foto Terpasang</span>
                    <span className="text-[10px] text-slate-400 truncate block">{photoUrlInput.startsWith('data:') ? 'Gambar Terkompresi' : photoUrlInput}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoUrlInput('');
                    setBlocks((prev) =>
                      prev.map((b) => (b.id === photoModalBlockId ? { ...b, photoUrl: '' } : b))
                    );
                    onShowToast('Foto produk dihapus.', 'info');
                    setPhotoModalBlockId(null);
                  }}
                  className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                  title="Hapus Foto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NATIVE ACTION SHEET: UTILITAS SPREADSHEET */}
      <ProduksiActionSheet
        isOpen={isToolbarMenuOpen}
        onClose={() => setIsToolbarMenuOpen(false)}
        title={`Menu Spreadsheet (${activeTab})`}
        subtitle="Tambah kode, sinkronisasi Qty Nota, ekspor Excel, dan cetak"
        groups={[
          {
            title: 'Input & Sinkronisasi',
            items: [
              {
                id: 'add-code',
                label: 'Tambah Tabel Kode Baru',
                description: 'Buat blok tabel kode produk baru langsung di spreadsheet',
                icon: <Plus className="w-4 h-4" />,
                tone: 'primary',
                onClick: handleAddNewBlock,
              },
              {
                id: 'sync-nota',
                label: isSyncingQtyNota ? 'Menarik Qty Nota...' : 'Tarik Qty Nota dari Sheet',
                description: 'Ambil Qty Nota buyer dari Google Sheet & cek selisih otomatis',
                icon: <RefreshCw className={`w-4 h-4 ${isSyncingQtyNota ? 'animate-spin' : ''}`} />,
                tone: 'warning',
                disabled: isSyncingQtyNota,
                onClick: () => handleSyncQtyNotaFromSheet(false),
              },
            ],
          },
          {
            title: 'Ekspor & Cetak',
            items: [
              {
                id: 'export-xlsx',
                label: `Download Excel (${activeTab})`,
                description: 'Unduh file Excel modern (.xlsx) dengan pilihan tanggal/SJ',
                icon: <FileSpreadsheet className="w-4 h-4" />,
                tone: 'success',
                onClick: handleOpenExportModal,
              },
              {
                id: 'open-gsheet',
                label: 'Buka Google Spreadsheet',
                description: 'Buka file master spreadsheet di tab baru',
                icon: <ExternalLink className="w-4 h-4" />,
                onClick: () => {
                  const link = document.createElement('a');
                  link.href = `https://docs.google.com/spreadsheets/d/${PRODUKSI_SPREADSHEET_ID}/edit`;
                  link.target = '_blank';
                  link.rel = 'noreferrer';
                  link.click();
                },
              },
              {
                id: 'print',
                label: 'Cetak Lanskap',
                description: 'Cetak tampilan spreadsheet saat ini',
                icon: <Printer className="w-4 h-4" />,
                onClick: () => window.print(),
              },
            ],
          },
        ]}
      />

      {/* NATIVE ACTION SHEET: AKSI BLOK KODE SPREADSHEET */}
      <ProduksiActionSheet
        isOpen={Boolean(actionSheetBlock)}
        onClose={() => setActionSheetBlock(null)}
        title={actionSheetBlock ? `Kode #${actionSheetBlock.code}` : ''}
        subtitle={
          actionSheetBlock
            ? `Datang ${actionSheetBlock.totalDatang} pcs${isCMT ? ` · Net ${actionSheetBlock.totalNet} pcs` : ''}`
            : undefined
        }
        groups={
          actionSheetBlock
            ? [
                {
                  title: 'Aksi Tabel Kode',
                  items: [
                    {
                      id: 'edit-inline',
                      label: 'Edit Tabel Inline',
                      description: 'Ubah warna, qty datang/retur, atau catatan langsung',
                      icon: <Edit3 className="w-4 h-4" />,
                      tone: 'primary',
                      onClick: () => handleStartEditBlock(actionSheetBlock),
                    },
                    ...(onOpenHitungUlang
                      ? [
                          {
                            id: 'audit',
                            label: 'Audit Hitung Ulang Fisik',
                            description: `Buka lembar hitung ulang untuk kode #${actionSheetBlock.code}`,
                            icon: <Scale className="w-4 h-4" />,
                            onClick: () => onOpenHitungUlang(actionSheetBlock.code),
                          },
                        ]
                      : []),
                    ...(onOpenEditBatch
                      ? (actionSheetBlock.distinctSjs && actionSheetBlock.distinctSjs.length > 0
                          ? actionSheetBlock.distinctSjs.map((sjObj: any) => ({
                              id: `edit-sj-${sjObj.no_surat_jalan}`,
                              label: `Edit SJ ${sjObj.no_surat_jalan}`,
                              description: `${sjObj.qty} pcs · ${sjObj.tanggal}`,
                              icon: <FileText className="w-4 h-4" />,
                              onClick: () => onOpenEditBatch(sjObj.no_surat_jalan),
                            }))
                          : [
                              {
                                id: 'edit-sj-default',
                                label: `Edit SJ-${actionSheetBlock.code}`,
                                description: 'Buka form edit Surat Jalan',
                                icon: <FileText className="w-4 h-4" />,
                                onClick: () => onOpenEditBatch(`SJ-${actionSheetBlock.code}`),
                              },
                            ])
                      : []),
                  ],
                },
                {
                  title: 'Hapus',
                  items: [
                    {
                      id: 'delete-block',
                      label: 'Hapus Tabel Kode',
                      description: `Hapus seluruh baris tabel kode #${actionSheetBlock.code}`,
                      icon: <Trash2 className="w-4 h-4" />,
                      tone: 'danger',
                      onClick: () => handleDeleteBlock(actionSheetBlock.id),
                    },
                  ],
                },
              ]
            : []
        }
      />

      {/* MOBILE NATIVE SLIDE-UP DATE RANGE BOTTOM SHEET */}
      {isDateRangeSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsDateRangeSheetOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Grab Handle */}
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />

            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Filter Rentang Tanggal
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {filteredBlocks.length} Tabel Kode · {activeTab}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDateRangeSheetOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                aria-label="Tutup filter tanggal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-500 block">Pilih Cepat</span>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => applyDatePreset('today')}
                  className="min-h-[38px] px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 text-xs font-semibold transition cursor-pointer"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('7d')}
                  className="min-h-[38px] px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 text-xs font-semibold transition cursor-pointer"
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('30d')}
                  className="min-h-[38px] px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 text-xs font-semibold transition cursor-pointer"
                >
                  30 Hari
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('month')}
                  className="min-h-[38px] px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-300 text-xs font-semibold transition cursor-pointer"
                >
                  Bulan Ini
                </button>
              </div>
            </div>

            {/* Dari & Sampai Inputs */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">
                  Dari Tanggal
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => updateDateRange(e.target.value, dateTo)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => updateDateRange(dateFrom, e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Footer Controls */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  updateDateRange('', '');
                  setIsDateRangeSheetOpen(false);
                }}
                className="min-h-[42px] px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Reset Semua
              </button>
              <button
                type="button"
                onClick={() => setIsDateRangeSheetOpen(false)}
                className="min-h-[42px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Terapkan ({filteredBlocks.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
