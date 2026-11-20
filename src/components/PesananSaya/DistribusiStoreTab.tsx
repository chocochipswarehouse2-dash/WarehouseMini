import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Upload, RefreshCw, Send, ChevronDown, ChevronUp, CheckCircle2,
  AlertTriangle, Package, FileText, Trash2, ClipboardCheck, X,
  Minus, Plus, RotateCcw, ArrowUpDown, ScanLine, Camera, Download,
  Edit3, ArrowLeftRight, Check, Search, Filter, Layers, ListFilter,
  Wifi, WifiOff, CloudOff, ArrowDownToLine, Truck, Calendar
} from 'lucide-react';
import {
  UserSession,
  ProductItem,
  TarikanMDItem,
  TarikanMDScanResult,
  PengecekanSJItem,
  PengecekanSJDraft,
  PengecekanSJRecord,
  PengirimanStoreReport,
} from '../../types';
import { isSuperadmin, hasPermission } from '../../services/permissions';
import { PhysicalScanInput } from '../PhysicalScanInput';
import { CameraScanner } from '../CameraScanner';
import {
  fetchTarikanMDRecords,
  submitTarikanMD,
  deleteTarikanMD,
  editPengecekanSJ,
  loadSJDrafts,
  loadSJDraftsAsync,
  saveSJDrafts,
  deleteSJDraft,
  exportPengecekanToCsv,
  getPendingOfflinePengecekanSJ,
  syncPendingOfflinePengecekanSJ,
  normalizeDateToIso,
  getCachedPengecekanSJList,
  getCachedPengecekanSJListAsync,
  clearPengecekanSJRecordsCache,
  buildPengecekanRecordFromDraft,
} from '../../services/gasTarikanMD';
import { fetchWithDeltaSync, clearDeltaSyncCache } from '../../services/gasSync';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';
import { SuratJalanSelisihMessageParams, generateSuratJalanSelisihMessage, getWhatsAppWebUrl } from '../../services/whatsapp';
import { formatProductNameWithSize, resolveProductName, resolveProductDisplaySize, cleanProductName, extractCleanSizeToken, isRealSize, isCorruptedColorCodeSize } from '../../utils/sortUtils';
import { lookupProductBySku } from '../../utils/productLookup';
import { isWarehouseLocation } from '../../services/supabase';
import { DistribusiPickingModal } from './DistribusiPickingModal';
import { MultiSelectDropsearch } from '../common/MultiSelectDropsearch';
import { DistribusiSelisihWaModal } from './DistribusiSelisihWaModal';
import {
  buildOrGetQcMutasiJob,
  extractProductInfoFromSJItem,
  saveSingleQcJob,
} from '../../services/qcPengerjaanService';
import {
  syncPengecekanSjToPengirimanDispatched,
  removePengecekanSjFromPengirimanDispatched,
  fetchPengirimanStoreReports,
  getCachedSjShippingOverrides,
  fetchSjShippingOverrides,
  setSjShippingOverridesBatch,
  buildNoSjReportIndex,
  resolvePengecekanSjShippingStatus,
  estimateKoliFromPcs,
  ESTIMATED_PCS_PER_KOLI,
  PengecekanSjShippingStatus,
  PengecekanSjShippingOverride,
} from '../../services/pengirimanStore';

interface TarikanMDViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

// ==========================================
// CSV PARSER HELPER (ROBUST RFC-4180 COMPLIANT)
// ==========================================
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === ',' || char === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

interface ParsedSJGroup {
  no_sj: string;
  source: string;
  destination: string;
  tanggal_sj: string;
  file_name?: string;
  items: TarikanMDItem[];
}

/**
 * Membaca file CSV Surat Jalan.
 * Mendeteksi jika 1 CSV terisi lebih dari 1 No SJ, otomatis memisahkan menjadi draft-draft mandiri!
 */
function parseCsvContent(content: string, fileName: string, productCatalog?: ProductItem[]): ParsedSJGroup[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`File ${fileName} kosong atau format tidak valid`);

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.replace(/"/g, '').trim().toLowerCase());

  const col = {
    date: headers.findIndex(h => h === 'date' || h === 'tanggal' || h === 'tgl' || h === 'delivery date'),
    noSj: headers.findIndex(h =>
      h === 'number delivery' || h === 'number_delivery' ||
      h === 'no sj' || h === 'no_sj' ||
      h === 'nomor delivery' || h === 'delivery number' ||
      h === 'no. sj' || h === 'no_surat_jalan' || h === 'surat jalan' ||
      h === 'delivery note'
    ),
    category: headers.findIndex(h => h === 'category' || h === 'kategori'),
    product: headers.findIndex(h =>
      h === 'product' || h === 'produk' || h === 'nama produk' || h === 'nama_produk' ||
      h === 'product name' || h === 'item name' || h === 'nama barang' || h === 'nama_barang' ||
      h === 'nama item' || h === 'nama_item' || h === 'description' || h === 'deskripsi' ||
      h === 'item' || h === 'name' || h === 'title'
    ),
    variant: headers.findIndex(h =>
      h === 'variant' || h === 'variasi' || h === 'varian' || h === 'size' || h === 'warna' || h === 'ukuran'
    ),
    code: headers.findIndex(h => h === 'code' || h === 'sku' || h === 'item code' || h === 'kode produk' || h === 'barcode' || h === 'kode barang'),
    qty: headers.findIndex(h => h === 'qty' || h === 'quantity' || h === 'jumlah' || h === 'qty sj'),
    source: headers.findIndex(h => h === 'source' || h === 'asal' || h === 'dari' || h === 'pengirim' || h === 'outlet asal'),
    dest: headers.findIndex(h => h === 'destination' || h === 'tujuan' || h === 'ke' || h === 'penerima' || h === 'outlet tujuan'),
    lokasi: headers.findIndex(h => h === 'location' || h === 'lokasi' || h === 'rak' || h === 'rack' || h === 'bin' || h === 'bin location' || h === 'storage' || h === 'posisi'),
  };

  if (col.code < 0) {
    throw new Error(`File ${fileName}: Kolom kode SKU/Code tidak ditemukan.`);
  }

  // Catalog Map untuk pencarian nama produk cepat
  const catalogMap = new Map<string, ProductItem>();
  if (Array.isArray(productCatalog)) {
    productCatalog.forEach(p => {
      if (p.k) catalogMap.set(p.k.toUpperCase().trim(), p);
      if ((p as any).sku) catalogMap.set(String((p as any).sku).toUpperCase().trim(), p);
    });
  }

  // Grouping map: Key = `${no_sj}___${source}___${destination}`
  const groupMap = new Map<string, {
    no_sj: string;
    source: string;
    destination: string;
    tanggal_sj: string;
    skuMap: Map<string, TarikanMDItem>;
  }>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    const get = (idx: number) => idx >= 0 ? (cols[idx] || '').replace(/"/g, '').trim() : '';

    const sku = get(col.code);
    if (!sku) continue;

    let rowNoSj = get(col.noSj);
    if (!rowNoSj) rowNoSj = fileName.replace(/\.[^/.]+$/, '').trim(); // Fallback ke nama file jika kosong
    const rowSource = get(col.source) || 'Gudang Pusat';
    const rowDest = get(col.dest) || 'Tujuan';
    const rowDate = normalizeDateToIso(get(col.date));
    const qty = parseInt(get(col.qty) || '0', 10) || 0;

    // Utamakan nama produk dari kolom produk, baru fallback ke varian
    const rawProd = get(col.product);
    const rawVar = get(col.variant);
    let nama = rawProd || rawVar || '';

    // Jika nama masih kosong atau sama persis dengan SKU, cari dari katalog produk
    const cleanSku = sku.toUpperCase().trim();
    const catProd = catalogMap.get(cleanSku);
    if (!nama || nama.toUpperCase() === cleanSku || nama.toUpperCase().replace(/\s+/g, '') === cleanSku.replace(/\s+/g, '')) {
      if (catProd && (catProd.p || (catProd as any).nama_produk || catProd.n)) {
        nama = String(catProd.p || (catProd as any).nama_produk || catProd.n || '').trim();
      }
    }
    if (!nama) nama = sku;
    nama = resolveProductName(cleanSku, nama, catProd);

    // Detect size from variant column or catalog item (authoritative VLOOKUP)
    const detectedSize = resolveProductDisplaySize(
      cleanSku,
      rawVar,
      catProd?.s ? String(catProd.s) : ((catProd as any)?.size ? String((catProd as any).size) : undefined)
    ) || (rawVar && isRealSize(rawVar) ? extractCleanSizeToken(rawVar) : '');
    const effectiveSize = (detectedSize && detectedSize !== '-') ? detectedSize : '';

    const category = get(col.category);
    const rowLokasi = get(col.lokasi) || (catProd?.lokasi && isWarehouseLocation(catProd.lokasi) ? catProd.lokasi : undefined);

    const groupKey = `${rowNoSj.toUpperCase()}___${rowSource.toUpperCase()}___${rowDest.toUpperCase()}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        no_sj: rowNoSj,
        source: rowSource,
        destination: rowDest,
        tanggal_sj: rowDate,
        skuMap: new Map(),
      });
    }

    const group = groupMap.get(groupKey)!;
    if (group.skuMap.has(sku)) {
      group.skuMap.get(sku)!.qty_sj += qty;
      if (rowLokasi && !group.skuMap.get(sku)!.lokasi) {
        group.skuMap.get(sku)!.lokasi = rowLokasi;
      }
    } else {
      group.skuMap.set(sku, { sku, nama_produk: nama, size: effectiveSize || undefined, category, qty_sj: qty, lokasi: rowLokasi });
    }
  }

  if (groupMap.size === 0) {
    throw new Error(`File ${fileName}: Tidak ada data SKU yang valid.`);
  }

  const results: ParsedSJGroup[] = [];
  for (const group of groupMap.values()) {
    results.push({
      no_sj: group.no_sj,
      source: group.source,
      destination: group.destination,
      tanggal_sj: group.tanggal_sj,
      file_name: fileName,
      items: Array.from(group.skuMap.values()),
    });
  }

  return results;
}

// ==========================================
// SUBCOMPONENTS
// ==========================================
const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    COCOK: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800',
    KURANG: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300 dark:border-rose-800',
    LEBIH: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-300 dark:border-amber-800',
    SELISIH: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300 dark:border-rose-800',
    PENDING: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-300 dark:border-blue-800',
    SELESAI: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 border border-teal-300 dark:border-teal-800',
  };
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
};

// ==========================================
// MAIN COMPONENT: PENGECEKAN SURAT JALAN
// ==========================================
export const DistribusiStoreTab: React.FC<TarikanMDViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  const userIsAdmin = isSuperadmin(session);
  const canAction = userIsAdmin || hasPermission(session, 'tab_ops_loading_transfer_order') || hasPermission(session, 'tab_ops_pesanan_transfer_order');

  // ---- TABS ----
  const [activeTab, setActiveTab] = useState<'pengecekan' | 'riwayat'>('pengecekan');
  const [importType, setImportType] = useState<'Penerimaan' | 'Pengiriman'>('Penerimaan');

  // ---- DRAFT QUEUE (ANTREAN PENGECEKAN) ----
  const [drafts, setDrafts] = useState<PengecekanSJDraft[]>(() => loadSJDrafts());
  const [activeDraftId, setActiveDraftId] = useState<string | null>(() => {
    const savedActive = typeof localStorage !== 'undefined' ? localStorage.getItem('wms_active_sj_draft_id') : null;
    const loaded = loadSJDrafts();
    if (savedActive && loaded.some(d => d.id === savedActive)) {
      return savedActive;
    }
    return loaded.length > 0 ? loaded[0].id : null;
  });

  // Active Draft object
  const activeDraft = useMemo(() => {
    return drafts.find(d => d.id === activeDraftId) || null;
  }, [drafts, activeDraftId]);

  // Sinkronisasi drafts ke localStorage dan IndexedDB
  useEffect(() => {
    saveSJDrafts(drafts);
    if (activeDraftId) {
      try { localStorage.setItem('wms_active_sj_draft_id', activeDraftId); } catch { }
    }
    // Jika activeDraftId tidak lagi ada di daftar, reset ke draft pertama
    if (drafts.length > 0 && (!activeDraftId || !drafts.some(d => d.id === activeDraftId))) {
      setActiveDraftId(drafts[0].id);
    } else if (drafts.length === 0) {
      setActiveDraftId(null);
      try { localStorage.removeItem('wms_active_sj_draft_id'); } catch { }
    }
  }, [drafts, activeDraftId]);

  // Proteksi reload / tab close / force-close saat scanning aktif sedang berlangsung
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeDraft) {
        const hasScan = Object.values(activeDraft.scanQty || {}).some(q => q > 0) ||
          Object.keys(activeDraft.unexpected || {}).length > 0;
        if (hasScan) {
          e.preventDefault();
          e.returnValue = 'Pengecekan sedang berjalan. Data hasil scan telah tersimpan aman di perangkat, yakin ingin menutup atau memuat ulang?';
          return e.returnValue;
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeDraft]);

  // Otomatis sinkronkan pending offline queue saat koneksi online pulih
  useEffect(() => {
    const handleOnline = () => {
      syncPendingOfflinePengecekanSJ().then(res => {
        if (res.successCount > 0) {
          onShowToast(`Koneksi internet kembali aktif: ${res.successCount} data pengecekan berhasil disinkronkan ke Database Supabase!`, 'success');
          setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);
        }
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [onShowToast]);

  // Hydrate drafts from IndexedDB on mount (ensures large draft imports not lost if localStorage was evicted)
  useEffect(() => {
    let isMounted = true;
    loadSJDraftsAsync().then(dbDrafts => {
      if (isMounted && dbDrafts && dbDrafts.length > 0) {
        setDrafts(prev => {
          if (prev.length === 0) {
            return dbDrafts;
          }
          // Merge preserving existing items
          const map = new Map<string, PengecekanSJDraft>();
          dbDrafts.forEach(d => map.set(d.id, d));
          prev.forEach(d => map.set(d.id, d));
          return Array.from(map.values());
        });
      }
    }).catch(() => { });
    return () => { isMounted = false; };
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'pending' | 'selesai'>('pending');
  const [sendToDispatchedOnSubmit, setSendToDispatchedOnSubmit] = useState<boolean>(false);
  const [detailFilter, setDetailFilter] = useState<'ALL' | 'COCOK' | 'SELISIH'>('ALL');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSendToDispatchedOnSubmit(false);
  }, [activeDraftId]);

  useEffect(() => {
    if (submitStatus !== 'selesai') {
      setSendToDispatchedOnSubmit(false);
    }
  }, [submitStatus]);

  // ---- RIWAYAT PENGECEKAN STATE ----
  const [records, setRecords] = useState<PengecekanSJRecord[]>(() => {
    try {
      const cached = getCachedPengecekanSJList();
      if (Array.isArray(cached) && cached.length > 0) {
        return [...cached].sort((a, b) => {
          const timeA = new Date(a.created_at || a.tanggal_sj || 0).getTime();
          const timeB = new Date(b.created_at || b.tanggal_sj || 0).getTime();
          return timeB - timeA;
        });
      }
    } catch { }
    return [];
  });
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SELESAI' | 'COCOK' | 'SELISIH'>('ALL');
  const [riwayatTypeFilter, setRiwayatTypeFilter] = useState<'ALL' | 'PENERIMAAN' | 'PENGIRIMAN'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [destinationFilter, setDestinationFilter] = useState<string[]>([]);
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');
  const [riwayatSortBy, setRiwayatSortBy] = useState<
    'tanggal_desc' | 'tanggal_asc' | 'asal_asc' | 'asal_desc' | 'tujuan_asc' | 'tujuan_desc'
  >('tanggal_desc');
  const [pickingModalDraft, setPickingModalDraft] = useState<PengecekanSJDraft | null>(null);
  const [pickingModalDrafts, setPickingModalDrafts] = useState<PengecekanSJDraft[]>([]);
  const [pickingModalInitialTab, setPickingModalInitialTab] = useState<'print' | 'whatsapp' | 'app'>('app');
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [bulkSubmitModal, setBulkSubmitModal] = useState<{
    drafts: PengecekanSJDraft[];
    targetStatus: 'pending' | 'selesai';
    sendToDispatched: boolean;
  } | null>(null);
  const [bulkSubmittingProgress, setBulkSubmittingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [selisihWaModalParams, setSelisihWaModalParams] = useState<SuratJalanSelisihMessageParams | null>(null);

  // Custom confirmation modal (replaces window.confirm which is blocked in mobile/iframe)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    isDanger?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // Inline Edit Mode untuk Admin
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<PengecekanSJRecord | null>(null);
  const [editWasDispatched, setEditWasDispatched] = useState<boolean>(false);
  const [editRequeueDispatched, setEditRequeueDispatched] = useState<boolean>(false);
  const [showCameraScanner, setShowCameraScanner] = useState<boolean>(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Status Pengiriman Live untuk Sub-Tab SELESAI (Belum Jadwal / Dispatched / Terkirim / Batal Kirim)
  const [shippingSubTab, setShippingSubTab] = useState<'ALL' | PengecekanSjShippingStatus>('ALL');
  const [pengirimanReports, setPengirimanReports] = useState<PengirimanStoreReport[]>([]);
  const [shippingOverrides, setShippingOverrides] = useState<Record<string, PengecekanSjShippingOverride>>(
    () => getCachedSjShippingOverrides()
  );
  const [isBulkShippingAction, setIsBulkShippingAction] = useState<boolean>(false);

  // Offline & Sync Detection
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(() => getPendingOfflinePengecekanSJ().length);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Begitu internet pulih, coba sinkronisasi otomatis
      syncPendingOfflinePengecekanSJ().then((res) => {
        if (res.successCount > 0) {
          onShowToast(`Koneksi internet pulih: ${res.successCount} hasil pengecekan berhasil disinkronkan ke Database!`, 'success');
          loadRecords();
        }
        setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSyncOffline = async () => {
    if (!isOnline) {
      onShowToast('Perangkat masih dalam kondisi offline. Sambungkan ke internet terlebih dahulu.', 'warning');
      return;
    }
    setIsSyncingOffline(true);
    try {
      const res = await syncPendingOfflinePengecekanSJ();
      if (res.successCount > 0) {
        onShowToast(`Berhasil menyinkronkan ${res.successCount} data surat jalan ke Databases!`, 'success');
        loadRecords();
      } else if (res.failCount > 0) {
        onShowToast('Gagal menghubungi Google Databases. Coba sesaat lagi.', 'warning');
      } else {
        onShowToast('Semua data pengecekan sudah tersinkronisasi!', 'info');
      }
      setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);
    } catch {
      onShowToast('Terjadi kesalahan saat sinkronisasi.', 'error');
    } finally {
      setIsSyncingOffline(false);
    }
  };

  // Hydrate full IndexedDB records cache & sync all pages from Supabase on mount
  useEffect(() => {
    let mounted = true;
    getCachedPengecekanSJListAsync()
      .then((idbCached) => {
        if (!mounted || !idbCached || idbCached.length === 0) return;
        const sortedCached = [...idbCached].sort((a, b) => {
          const timeA = new Date(a.created_at || a.tanggal_sj || 0).getTime();
          const timeB = new Date(b.created_at || b.tanggal_sj || 0).getTime();
          return timeB - timeA;
        });
        setRecords((prev) => (sortedCached.length > prev.length ? sortedCached : prev));
      })
      .catch(() => { });
    loadRecords(false);
    return () => {
      mounted = false;
    };
  }, []);

  const loadShippingStates = useCallback(async () => {
    try {
      const [repList, ovMap] = await Promise.all([
        fetchPengirimanStoreReports(),
        fetchSjShippingOverrides(),
      ]);
      setPengirimanReports(repList || []);
      setShippingOverrides(ovMap || {});
    } catch {
      // Abaikan kegagalan sementara; tetap gunakan cache
    }
  }, []);

  useEffect(() => {
    void loadShippingStates();
    const handleSync = () => {
      void loadShippingStates();
    };
    window.addEventListener('wms_pengiriman_store_updated', handleSync);
    window.addEventListener('wms_loading_dock_data_reset', handleSync);
    return () => {
      window.removeEventListener('wms_pengiriman_store_updated', handleSync);
      window.removeEventListener('wms_loading_dock_data_reset', handleSync);
    };
  }, [loadShippingStates]);

  useEffect(() => {
    if (activeTab === 'riwayat') {
      loadRecords(records.length === 0);
      void loadShippingStates();
    }
  }, [activeTab, loadShippingStates]);

  // ---- COMPUTED STATS ACTIVE DRAFT ----
  const comparisonData = useMemo<TarikanMDScanResult[]>(() => {
    if (!activeDraft) return [];
    return activeDraft.items.map(item => {
      const cleanSku = (item.sku || '').trim().toUpperCase();
      const prod = productCatalog?.find(
        p => (p.k && p.k.trim().toUpperCase() === cleanSku) ||
          (p.sku && String(p.sku).trim().toUpperCase() === cleanSku)
      );

      const resolvedSize = resolveProductDisplaySize(
        cleanSku,
        item.size,
        prod?.s ? String(prod.s) : ((prod as any)?.size ? String((prod as any).size) : undefined)
      );

      const effectiveSize = (resolvedSize && resolvedSize !== '-')
        ? resolvedSize
        : '-';

      const baseName = resolveProductName(cleanSku, item.nama_produk, prod);

      const qty_scan = activeDraft.scanQty[item.sku] ?? 0;
      const selisih = qty_scan - item.qty_sj;
      return {
        ...item,
        nama_produk: baseName,
        size: effectiveSize || undefined,
        qty_scan,
        selisih,
        status: selisih === 0 ? 'COCOK' : selisih < 0 ? 'KURANG' : 'LEBIH',
      };
    });
  }, [activeDraft, productCatalog]);

  const overScannedItems = useMemo(
    () => comparisonData.filter((i) => i.qty_scan > i.qty_sj),
    [comparisonData]
  );

  const summary = useMemo(() => {
    if (!activeDraft) {
      return { total_sj: 0, total_scan: 0, cocok: 0, kurang: 0, lebih: 0, unexpectedCount: 0, total_unexpected_qty: 0, has_selisih: false };
    }
    const total_sj = comparisonData.reduce((s, i) => s + i.qty_sj, 0);
    const total_scan = comparisonData.reduce((s, i) => s + i.qty_scan, 0);
    const cocok = comparisonData.filter(i => i.status === 'COCOK').length;
    const kurang = comparisonData.filter(i => i.status === 'KURANG').length;
    const lebih = comparisonData.filter(i => i.status === 'LEBIH').length;
    const unexpectedCount = Object.keys(activeDraft.unexpected || {}).length;
    const total_unexpected_qty = Object.values(activeDraft.unexpected || {}).reduce((s, v) => s + v.qty, 0);
    const has_selisih = kurang > 0 || lebih > 0 || unexpectedCount > 0;
    return { total_sj, total_scan, cocok, kurang, lebih, unexpectedCount, total_unexpected_qty, has_selisih };
  }, [activeDraft, comparisonData]);

  const persistImportedDraftsToSupabase = useCallback(
    async (targetDrafts: PengecekanSJDraft[]): Promise<{ syncedCount: number; offlineCount: number; failCount: number }> => {
      if (!targetDrafts || targetDrafts.length === 0) {
        return { syncedCount: 0, offlineCount: 0, failCount: 0 };
      }
      const submittedBy = session?.name || session?.username || 'Petugas';
      const initialRecords: PengecekanSJRecord[] = targetDrafts.map((draft) =>
        buildPengecekanRecordFromDraft(draft, {
          status: 'pending',
          submittedBy,
          productCatalog,
        })
      );

      // Optimistically reflect imported SJ in Riwayat immediately
      setRecords((prev) => {
        const incomingKeys = new Set(initialRecords.map((r) => r.no_sj.trim().toUpperCase()));
        const remaining = prev.filter((r) => !incomingKeys.has(r.no_sj.trim().toUpperCase()));
        return [...initialRecords, ...remaining];
      });

      setIsSavingImport(true);
      let syncedCount = 0;
      let offlineCount = 0;
      let failCount = 0;

      try {
        for (const rec of initialRecords) {
          try {
            const res = await submitTarikanMD(rec);
            if (res.success && !res.offline) {
              syncedCount++;
            } else if (res.success && res.offline) {
              offlineCount++;
            } else {
              failCount++;
            }
          } catch {
            failCount++;
          }
        }
        setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);
        if (syncedCount > 0) {
          void loadRecords(false);
        }
      } finally {
        setIsSavingImport(false);
      }

      return { syncedCount, offlineCount, failCount };
    },
    [session, productCatalog]
  );

  // ==========================================
  // MULTI-CSV IMPORT & AUTO SPLIT MULTI-SJ
  // ==========================================
  const handleFilesChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    interface DuplicateConflict {
      no_sj: string;
      source?: string;
      destination?: string;
      file_name: string;
      reason: string;
      status: 'pending' | 'selesai' | 'draft' | 'batch_duplicate';
      parsedDraft: PengecekanSJDraft;
    }

    const validNewDrafts: PengecekanSJDraft[] = [];
    const conflicts: DuplicateConflict[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const content = await file.text();
        const groups = parseCsvContent(content, file.name, productCatalog);

        for (const g of groups) {
          const cleanNoSj = g.no_sj.trim().toUpperCase();
          const draftId = `${cleanNoSj}___${(g.source || '').trim().toUpperCase()}___${(g.destination || '').trim().toUpperCase()}`;

          // 1. Cek apakah sudah pernah ada di Riwayat (Pending / Selesai)
          const inRiwayat = records.find(r => r.no_sj.trim().toUpperCase() === cleanNoSj);

          // 2. Cek apakah sudah ada di Antrean Draft Aktif yang tersimpan
          const inDrafts = drafts.find(d => d.id === draftId || d.no_sj.trim().toUpperCase() === cleanNoSj);

          // 3. Cek apakah sudah diproses oleh file sebelumnya pada sesi upload bersamaan ini
          const inCurrentBatch = validNewDrafts.find(d => d.no_sj.trim().toUpperCase() === cleanNoSj);

          const draft: PengecekanSJDraft = {
            id: draftId,
            no_sj: g.no_sj,
            source: g.source,
            destination: g.destination,
            tanggal_sj: g.tanggal_sj,
            tipe_import: importType,
            file_name: file.name,
            items: g.items,
            scanQty: inDrafts ? inDrafts.scanQty : {},
            unexpected: inDrafts ? inDrafts.unexpected : {},
            catatan: inDrafts ? inDrafts.catatan : '',
            status: 'draft',
            created_at: inDrafts ? inDrafts.created_at : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          if (inCurrentBatch) {
            // Skenario upload bersamaan 2 file yang sama: File pertama diterima, file kedua ditolak sebagai duplikat
            conflicts.push({
              no_sj: g.no_sj,
              source: g.source,
              destination: g.destination,
              file_name: file.name,
              reason: `Duplikat pada upload bersamaan: Nomor SJ sudah terbaca dari file "${inCurrentBatch.file_name}" (file "${file.name}" ditolak)`,
              status: 'batch_duplicate',
              parsedDraft: draft,
            });
          } else if (inRiwayat || inDrafts) {
            const reason = inRiwayat
              ? (inRiwayat.status === 'pending'
                ? `Sudah ada di Riwayat Pengecekan (Status: PENDING, ${inRiwayat.total_qty_terima || 0}/${inRiwayat.total_qty_sj || 0} pcs diselesaikan oleh ${inRiwayat.submitted_by || 'Admin'})`
                : `Sudah pernah selesai dicek di Riwayat (Status: SELESAI, ${inRiwayat.total_qty_terima || 0}/${inRiwayat.total_qty_sj || 0} pcs)`)
              : `Sudah ada di Antrean Draft Aktif yang sedang dikerjakan`;

            if (!conflicts.some(c => c.no_sj.trim().toUpperCase() === cleanNoSj && c.file_name === file.name)) {
              conflicts.push({
                no_sj: g.no_sj,
                source: g.source,
                destination: g.destination,
                file_name: file.name,
                reason,
                status: inRiwayat ? inRiwayat.status : 'draft',
                parsedDraft: draft,
              });
            }
          } else {
            // Belum pernah ada sama sekali -> Valid untuk diimpor
            validNewDrafts.push(draft);
          }
        }
      } catch (err) {
        onShowToast(`Gagal membaca "${file.name}": ${err instanceof Error ? err.message : 'Format error'}`, 'error');
      }
    }

    // Reset file input agar user bisa memilih kembali file jika diperlukan
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Skenario A: Ada SJ baru yang valid -> Simpan antrean lokal AND langsung simpan ke Supabase dari import pertama
    if (validNewDrafts.length > 0) {
      setDrafts(prev => {
        const map = new Map<string, PengecekanSJDraft>();
        prev.forEach(d => map.set(d.id, d));
        validNewDrafts.forEach(d => map.set(d.id, d));
        return Array.from(map.values());
      });
      setActiveDraftId(validNewDrafts[0].id);

      const syncRes = await persistImportedDraftsToSupabase(validNewDrafts);
      const savedNote =
        syncRes.syncedCount === validNewDrafts.length
          ? 'dan langsung tersimpan ke Supabase!'
          : syncRes.offlineCount > 0
            ? '(antre sinkronisasi Supabase saat online).'
            : 'dengan sebagian antre sinkronisasi ulang.';

      if (conflicts.length === 0) {
        onShowToast(
          `Berhasil mengimpor ${validNewDrafts.length} Surat Jalan ${savedNote}`,
          syncRes.failCount > 0 ? 'warning' : 'success'
        );
      } else {
        const batchDuplicates = conflicts.filter(c => c.status === 'batch_duplicate');
        if (batchDuplicates.length > 0) {
          onShowToast(
            `File "${batchDuplicates[0].file_name}" ditolak karena duplikat dengan "${validNewDrafts[0].file_name}" (SJ ${batchDuplicates[0].no_sj} berhasil diimpor 1x ${savedNote}).`,
            'warning'
          );
        } else {
          onShowToast(
            `Berhasil mengimpor ${validNewDrafts.length} Surat Jalan baru ${savedNote} ${conflicts.length} Surat Jalan lainnya ditolak karena sudah ada di sistem.`,
            'warning'
          );
        }
      }
    }

    // Skenario B: Ada SJ yang ditolak (karena duplikat batch atau sudah ada sebelumnya)
    if (conflicts.length > 0) {
      const isOnlyBatchDuplicates = conflicts.every(c => c.status === 'batch_duplicate');

      if (isOnlyBatchDuplicates && validNewDrafts.length > 0) {
        // Jika hanya duplikat file pada sesi upload yang sama (salah satu sudah berhasil masuk draft)
        setConfirmModal({
          title: '⚠️ File Duplikat Ditolak (Upload Bersamaan)',
          message: `Sistem mendeteksi 2 file dengan Nomor Surat Jalan yang sama diupload bersamaan:\n\n` +
            conflicts.map(c => `• ${c.no_sj} (File: "${c.file_name}")` + '\n  ' + `Alasan: ${c.reason}`).join('\n\n') +
            `\n\n✅ Status Penanganan:\nFile pertama ("${validNewDrafts[0].file_name}") telah berhasil diimpor ke Antrean Pengecekan & tersimpan ke Supabase.\nFile kedua ditolak otomatis untuk mencegah duplikasi data atau double count.`,
          confirmLabel: 'Mengerti',
          isDanger: false,
          onConfirm: () => setConfirmModal(null)
        });
      } else {
        if (validNewDrafts.length === 0) {
          onShowToast(`❌ Import Ditolak: ${conflicts.length} Surat Jalan sudah pernah diimpor & terdaftar di sistem!`, 'error');
        }

        setConfirmModal({
          title: '❌ Import Surat Jalan Ditolak (Sudah Ada di Sistem)',
          message: `Sistem menolak import file ini karena Nomor Surat Jalan berikut sudah terdaftar di sistem WMS:\n\n` +
            conflicts.map(c => `• ${c.no_sj} (${c.source || '-'} → ${c.destination || '-'})` + '\n  ' + `Alasan: ${c.reason}`).join('\n\n') +
            `\n\n🛡️ Proteksi Integritas Data:\nSistem menolak import otomatis ini guna mencegah duplikasi data, selisih perhitungan, atau tertimpanya progres fisik yang sedang berjalan.\n\nApakah Anda ingin membatalkan (disarankan), atau ini adalah Revisi File resmi yang perlu menimpa data lama?`,
          confirmLabel: 'Tetap Timpa (Revisi Resmi)',
          isDanger: true,
          onConfirm: async () => {
            const draftsToApply = conflicts.map(c => c.parsedDraft);
            setDrafts(prev => {
              const map = new Map<string, PengecekanSJDraft>();
              prev.forEach(d => map.set(d.id, d));
              draftsToApply.forEach(d => map.set(d.id, d));
              return Array.from(map.values());
            });
            setActiveDraftId(draftsToApply[0].id);
            await persistImportedDraftsToSupabase(draftsToApply);
            onShowToast(
              `Surat Jalan ${draftsToApply.map(d => d.no_sj).join(', ')} berhasil ditimpa & diperbarui ke Supabase.`,
              'info'
            );
          }
        });
      }
    }
  }, [drafts, records, onShowToast, importType, productCatalog, persistImportedDraftsToSupabase]);

  // ==========================================
  // SCAN HANDLER & CATALOG LOOKUP
  // ==========================================
  const handleScan = useCallback((rawSku: string) => {
    const sku = rawSku.trim();
    if (!sku) return;
    if (!activeDraft) {
      onShowToast('Pilih atau import Surat Jalan di antrean sebelum scan!', 'warning');
      return;
    }

    const cleanSku = sku.toUpperCase();
    const foundInSj = activeDraft.items.find(
      item => item.sku.toUpperCase() === cleanSku
    );

    if (foundInSj) {
      // Ada di Surat Jalan -> Tambah Qty Scan
      const currentQty = activeDraft.scanQty[foundInSj.sku] ?? 0;
      const nextQty = currentQty + 1;

      setDrafts(prev => prev.map(d => {
        if (d.id === activeDraft.id) {
          const prevVal = d.scanQty[foundInSj.sku] ?? 0;
          return {
            ...d,
            scanQty: { ...d.scanQty, [foundInSj.sku]: prevVal + 1 },
            updated_at: new Date().toISOString(),
          };
        }
        return d;
      }));

      if (nextQty > foundInSj.qty_sj) {
        const masterProduct = productCatalog.find(
          p => (p.k && p.k.toUpperCase() === cleanSku) ||
            (p.sku && String(p.sku).toUpperCase() === cleanSku)
        );
        const displayName = resolveProductName(cleanSku, foundInSj.nama_produk, masterProduct);
        playErrorBeep();
        onShowToast(
          `⚠️ SKU "${foundInSj.sku}" (${displayName}) melebihi Qty SJ (SJ: ${foundInSj.qty_sj}, Scan: ${nextQty}, Lebih +${nextQty - foundInSj.qty_sj})`,
          'warning'
        );
      } else {
        playSuccessBeep();
      }
    } else {
      // TIDAK ADA DI SURAT JALAN -> Cari nama produk di master catalog
      const masterProduct = productCatalog.find(
        p => (p.k && p.k.toUpperCase() === cleanSku) ||
          (p.sku && String(p.sku).toUpperCase() === cleanSku)
      );

      const baseName = resolveProductName(cleanSku, undefined, masterProduct);

      const detectedSize = resolveProductDisplaySize(
        cleanSku,
        undefined,
        masterProduct?.s ? String(masterProduct.s) : ((masterProduct as any)?.size ? String((masterProduct as any).size) : undefined)
      );
      const effectiveSize = (detectedSize && detectedSize !== '-') ? detectedSize : '';

      const resolvedName = (effectiveSize && !baseName.toUpperCase().includes(effectiveSize.toUpperCase()) && baseName !== 'SKU tidak terdaftar')
        ? `${baseName} (Size: ${effectiveSize})`
        : formatProductNameWithSize(baseName, effectiveSize || undefined);

      const resolvedCategory = masterProduct?.category || masterProduct?.c || 'Lainnya';

      setDrafts(prev => prev.map(d => {
        if (d.id === activeDraft.id) {
          const currentVal = d.unexpected[sku] || { qty: 0 };
          return {
            ...d,
            unexpected: {
              ...d.unexpected,
              [sku]: {
                nama: resolvedName,
                size: effectiveSize || undefined,
                qty: currentVal.qty + 1,
                category: resolvedCategory,
              },
            },
            updated_at: new Date().toISOString(),
          };
        }
        return d;
      }));

      playErrorBeep();
      onShowToast(`⚠️ SKU "${sku}" (${resolvedName}) tidak ada di SJ (dicatat sebagai Lebih)`, 'warning');
    }
  }, [activeDraft, productCatalog, onShowToast]);

  const handleManualQty = (sku: string, value: number) => {
    if (!activeDraft) return;
    const nextVal = Math.max(0, value);
    const prevVal = activeDraft.scanQty[sku] ?? 0;
    const foundItem = activeDraft.items.find((i) => i.sku === sku);

    setDrafts(prev => prev.map(d => {
      if (d.id === activeDraft.id) {
        return {
          ...d,
          scanQty: { ...d.scanQty, [sku]: nextVal },
          updated_at: new Date().toISOString(),
        };
      }
      return d;
    }));

    if (foundItem && nextVal > prevVal && nextVal > foundItem.qty_sj) {
      playErrorBeep();
      onShowToast(
        `⚠️ SKU "${foundItem.sku}" melebihi Qty SJ (SJ: ${foundItem.qty_sj}, Scan: ${nextVal}, Lebih +${nextVal - foundItem.qty_sj})`,
        'warning'
      );
    }
  };

  const handleManualUnexpectedQty = (sku: string, value: number) => {
    if (!activeDraft) return;
    setDrafts(prev => prev.map(d => {
      if (d.id === activeDraft.id) {
        if (value <= 0) {
          const unexp = { ...d.unexpected };
          delete unexp[sku];
          return { ...d, unexpected: unexp, updated_at: new Date().toISOString() };
        }
        return {
          ...d,
          unexpected: {
            ...d.unexpected,
            [sku]: { ...d.unexpected[sku], qty: value },
          },
          updated_at: new Date().toISOString(),
        };
      }
      return d;
    }));
  };

  const handleRemoveUnexpected = (sku: string) => {
    if (!activeDraft) return;
    setDrafts(prev => prev.map(d => {
      if (d.id === activeDraft.id) {
        const unexp = { ...d.unexpected };
        delete unexp[sku];
        return { ...d, unexpected: unexp, updated_at: new Date().toISOString() };
      }
      return d;
    }));
  };

  // ==========================================
  // SUBMIT PENGECEKAN KE DATABASE
  // (KESELURUHAN DATA ITEM DITULIS SAMA SEPERTI MANUAL SHIPMENT)
  // ==========================================
  const handleSubmitPengecekan = async () => {
    if (!activeDraft) {
      onShowToast('Pilih Surat Jalan di antrean dahulu!', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const submittedBy = session?.name || session?.username || 'Operator';
      const cleanDate = normalizeDateToIso(activeDraft.tanggal_sj);

      // 1. Kumpulkan baris item surat jalan reguler
      const regularRows: PengecekanSJItem[] = comparisonData.map(item => ({
        id: `${activeDraft.no_sj}-${item.sku}`,
        no_sj: activeDraft.no_sj,
        source: activeDraft.source,
        destination: activeDraft.destination,
        tanggal_sj: cleanDate,
        sku: item.sku,
        nama_produk: item.nama_produk,
        size: item.size,
        category: item.category || '',
        qty_sj: item.qty_sj,
        qty_scan: item.qty_scan,
        selisih: item.selisih,
        status_item: item.status,
        status_sj: submitStatus,
        is_unexpected: false,
        submitted_by: submittedBy,
        created_at: nowIso,
        catatan: activeDraft.catatan || '',
      }));

      // 2. Kumpulkan baris item lebihan yang tidak ada di list surat jalan
      // Dicatat dengan variabel No SJ + Source + Destination yang SAMA persis!
      const unexpectedRows: PengecekanSJItem[] = Object.entries(activeDraft.unexpected || {}).map(([sku, val]) => ({
        id: `${activeDraft.no_sj}-${sku}-unexpected`,
        no_sj: activeDraft.no_sj,
        source: activeDraft.source,
        destination: activeDraft.destination,
        tanggal_sj: cleanDate,
        sku,
        nama_produk: resolveProductName(sku, val.nama),
        size: resolveProductDisplaySize(sku, (val as any).size) || 'Default',
        category: val.category || 'Lebih',
        qty_sj: 0,
        qty_scan: val.qty,
        selisih: val.qty,
        status_item: 'LEBIH' as const,
        status_sj: submitStatus,
        is_unexpected: true,
        submitted_by: submittedBy,
        created_at: nowIso,
        catatan: 'Lebihan barang tidak ada di Surat Jalan',
      }));

      const allRows: PengecekanSJItem[] = [...regularRows, ...unexpectedRows];

      const record: PengecekanSJRecord = {
        id: activeDraft.id,
        no_sj: activeDraft.no_sj,
        source: activeDraft.source,
        destination: activeDraft.destination,
        tanggal_sj: cleanDate,
        tipe_import: activeDraft.tipe_import,
        status: submitStatus,
        status_komparasi: summary.has_selisih ? 'SELISIH' : 'COCOK',
        total_qty_sj: summary.total_sj,
        total_qty_terima: summary.total_scan + summary.total_unexpected_qty,
        total_sku: allRows.length,
        submitted_by: submittedBy,
        created_at: nowIso,
        catatan: activeDraft.catatan || '',
        items: allRows,
        items_json: JSON.stringify(allRows),
      };

      const result = await submitTarikanMD(record);
      if (result.success) {
        if (result.offline) {
          onShowToast('Tersimpan offline di perangkat. Otomatis dikirim ke Database saat internet kembali aktif.', 'info');
        } else {
          onShowToast(`Pengecekan SJ "${activeDraft.no_sj}" berhasil disimpan ke Database Supabase!`, 'success');
        }

        // Jika ini adalah Penerimaan / Mutasi Masuk, inisialisasi / perbarui QC Mutasi Job
        registerQcMutasiJobsForRecord(record, submittedBy);

        // Hanya masukkan ke Pengiriman Store > Dispatched jika user mencentang opsi eksplisit (default OFF)
        if (record.status === 'selesai' && sendToDispatchedOnSubmit) {
          const dispatchRes = await syncPengecekanSjToPengirimanDispatched(record, {
            name: submittedBy,
            username: session?.username || 'operator',
          });
          if (dispatchRes.action === 'created' || dispatchRes.action === 'updated') {
            onShowToast(dispatchRes.message, 'info');
          } else if (dispatchRes.action === 'already_sent') {
            onShowToast(dispatchRes.message, 'warning');
          }
          void loadShippingStates();
        }
        setSendToDispatchedOnSubmit(false);

        // Optimistic UI: langsung tampilkan record baru di riwayat
        setRecords(prev => {
          const filtered = prev.filter(r => r.no_sj !== record.no_sj && r.id !== record.id);
          return [record, ...filtered];
        });

        // Hapus dari antrean draft karena scan fisik sudah selesai
        deleteSJDraft(activeDraft.id);
        setDrafts(prev => prev.filter(d => d.id !== activeDraft.id));
        setSelectedDraftIds(prev => {
          if (!prev.has(activeDraft.id)) return prev;
          const next = new Set(prev);
          next.delete(activeDraft.id);
          return next;
        });
        setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);

        // Tetap di halaman pengecekan agar operator bisa langsung lanjut cek SJ berikutnya
        // Refresh silently dari Supabase agar sinkron dengan ID/kolom dari database
        loadRecords(false);
      } else {
        onShowToast(`Gagal menyimpan hasil pengecekan: ${result.message || 'Periksa koneksi atau database'}`, 'error');
      }
    } catch (e: any) {
      console.error('Submit error:', e);
      onShowToast(`Terjadi kesalahan saat submit data: ${e?.message || 'Error'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const registerQcMutasiJobsForRecord = (record: PengecekanSJRecord, submittedBy: string) => {
    const isPenerimaan =
      record.tipe_import === 'Penerimaan' ||
      (!record.tipe_import &&
        ((record.destination || '').toLowerCase().includes('warehouse') ||
          (record.destination || '').toLowerCase().includes('gudang') ||
          (record.destination || '').toLowerCase().includes('pusat')));

    if (isPenerimaan && Array.isArray(record.items) && record.items.length > 0) {
      try {
        const itemGroupMap = new Map<string, PengecekanSJItem[]>();
        record.items.forEach(it => {
          const info = extractProductInfoFromSJItem(it);
          const groupKode = (it.kode_produksi || info.kode_produksi || 'ITEM').trim().toUpperCase();
          if (!itemGroupMap.has(groupKode)) itemGroupMap.set(groupKode, []);
          itemGroupMap.get(groupKode)!.push(it);
        });

        itemGroupMap.forEach((items, groupKode) => {
          const mutasiJob = buildOrGetQcMutasiJob(
            record.no_sj,
            groupKode,
            items,
            {
              id: record.id,
              source: record.source,
              destination: record.destination,
              tanggal_sj: record.tanggal_sj,
              catatan: record.catatan,
              submitted_by: record.submitted_by,
            },
            submittedBy
          );
          saveSingleQcJob(mutasiJob);
        });
      } catch (qcErr) {
        console.error('Failed to auto-register QC Mutasi Job:', qcErr);
      }
    }
  };

  const handleOpenBulkSubmitModal = () => {
    const targetDrafts = selectedDraftIds.size > 0
      ? drafts.filter(d => selectedDraftIds.has(d.id))
      : drafts;

    if (targetDrafts.length === 0) {
      onShowToast('Pilih minimal 1 Surat Jalan di antrean untuk disubmit.', 'warning');
      return;
    }

    const allMatched = targetDrafts.every(d => {
      const hasUnexpected = Object.keys(d.unexpected || {}).length > 0;
      if (hasUnexpected) return false;
      return (d.items || []).every(it => (d.scanQty?.[it.sku] ?? 0) === Number(it.qty_sj || 0));
    });

    setBulkSubmitModal({
      drafts: targetDrafts,
      targetStatus: allMatched ? 'selesai' : 'pending',
      sendToDispatched: false,
    });
  };

  const handleExecuteBulkSubmit = async (
    targetDrafts: PengecekanSJDraft[],
    targetStatus: 'pending' | 'selesai',
    sendToDispatched: boolean = false
  ) => {
    if (!targetDrafts || targetDrafts.length === 0) return;

    setBulkSubmitModal(null);
    setSubmitting(true);
    setBulkSubmittingProgress({ current: 0, total: targetDrafts.length });

    const submittedBy = session?.name || session?.username || 'Operator';
    const succeededRecords: PengecekanSJRecord[] = [];
    const succeededDraftIds = new Set<string>();
    let offlineCount = 0;
    let failCount = 0;

    try {
      for (let idx = 0; idx < targetDrafts.length; idx++) {
        const draft = targetDrafts[idx];
        setBulkSubmittingProgress({ current: idx + 1, total: targetDrafts.length });
        try {
          const record = buildPengecekanRecordFromDraft(draft, {
            status: targetStatus,
            submittedBy,
            productCatalog,
          });
          const res = await submitTarikanMD(record);
          if (res.success) {
            succeededRecords.push(record);
            succeededDraftIds.add(draft.id);
            if (res.offline) offlineCount++;
            registerQcMutasiJobsForRecord(record, submittedBy);
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      let dispatchedSyncedCount = 0;
      if (succeededRecords.length > 0 && targetStatus === 'selesai' && sendToDispatched) {
        const actorUser = { name: submittedBy, username: session?.username || 'operator' };
        for (const rec of succeededRecords) {
          const syncRes = await syncPengecekanSjToPengirimanDispatched(rec, actorUser);
          if (syncRes.action === 'created' || syncRes.action === 'updated') {
            dispatchedSyncedCount++;
          }
        }
        void loadShippingStates();
      }

      if (succeededRecords.length > 0) {
        const syncedNos = new Set(succeededRecords.map(r => r.no_sj.trim().toUpperCase()));
        setRecords(prev => {
          const remaining = prev.filter(
            r => !succeededDraftIds.has(r.id) && !syncedNos.has(r.no_sj.trim().toUpperCase())
          );
          return [...succeededRecords, ...remaining];
        });

        succeededDraftIds.forEach(id => deleteSJDraft(id));
        setDrafts(prev => prev.filter(d => !succeededDraftIds.has(d.id)));
        setSelectedDraftIds(prev => {
          const next = new Set(prev);
          succeededDraftIds.forEach(id => next.delete(id));
          return next;
        });
        if (activeDraftId && succeededDraftIds.has(activeDraftId)) {
          setActiveDraftId(null);
        }
        setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);
        // Tetap di halaman pengecekan setelah bulk submit
        void loadRecords(false);
      }

      const dispatchSuffix =
        dispatchedSyncedCount > 0
          ? ` (${dispatchedSyncedCount} SJ Pengiriman otomatis masuk antrean Dispatched)`
          : '';

      if (failCount === 0 && offlineCount === 0) {
        onShowToast(
          `${succeededRecords.length} Surat Jalan berhasil disubmit sekaligus (${targetStatus.toUpperCase()}) ke Supabase!${dispatchSuffix}`,
          'success'
        );
      } else if (succeededRecords.length > 0 && offlineCount > 0 && failCount === 0) {
        onShowToast(
          `${succeededRecords.length} Surat Jalan disimpan (${offlineCount} antre offline untuk sinkron saat internet pulih).${dispatchSuffix}`,
          'info'
        );
      } else if (succeededRecords.length > 0) {
        onShowToast(
          `${succeededRecords.length} SJ berhasil disubmit, ${failCount} SJ gagal (tetap aman di antrean).${dispatchSuffix}`,
          'warning'
        );
      } else {
        onShowToast(`Gagal menyimpan ${failCount} Surat Jalan. Periksa koneksi atau database.`, 'error');
      }
    } finally {
      setBulkSubmittingProgress(null);
      setSubmitting(false);
    }
  };

  // ==========================================
  // RIWAYAT PENGECEKAN ACTIONS
  // ==========================================
  const loadRecords = async (options?: boolean | React.MouseEvent) => {
    const showLoadingSpinner = typeof options === 'boolean' ? options : true;
    // 1. Instantly populate from IndexedDB / localStorage cache if available
    if (records.length === 0) {
      const cached = await getCachedPengecekanSJListAsync();
      if (cached.length > 0) {
        const sortedCached = [...cached].sort((a, b) => {
          const timeA = new Date(a.created_at || a.tanggal_sj || 0).getTime();
          const timeB = new Date(b.created_at || b.tanggal_sj || 0).getTime();
          return timeB - timeA;
        });
        setRecords(sortedCached);
      }
    }

    if (showLoadingSpinner) setLoadingRecords(true);
    try {
      const data = await fetchTarikanMDRecords();
      const sorted = [...data].sort((a, b) => {
        const timeA = new Date(a.created_at || a.tanggal_sj || 0).getTime();
        const timeB = new Date(b.created_at || b.tanggal_sj || 0).getTime();
        return timeB - timeA;
      });
      setRecords(sorted);
    } catch {
      onShowToast('Gagal memuat riwayat pengecekan dari server.', 'error');
    } finally {
      setLoadingRecords(false);
    }
  };

  /**
   * Force full reload: reset delta sync & IndexedDB/local cache so ALL data is fetched fresh
   */
  const forceReloadRecords = async () => {
    setLoadingRecords(true);
    try {
      await clearDeltaSyncCache('Tarikan MD');
      await clearPengecekanSJRecordsCache();
      localStorage.removeItem('wms_cached_tarikanmd');
      await loadRecords(true);
      onShowToast('Muat ulang penuh selesai.', 'success');
    } catch {
      onShowToast('Gagal memuat ulang penuh.', 'error');
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleDeleteRecord = async (rec: PengecekanSJRecord) => {
    setConfirmModal({
      title: 'Hapus Riwayat Surat Jalan',
      message: `Yakin ingin menghapus riwayat Surat Jalan "${rec.no_sj}"? Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: 'Hapus Riwayat',
      isDanger: true,
      onConfirm: async () => {
        setDeletingId(rec.id);
        try {
          await deleteTarikanMD(rec.id, rec.no_sj);
          setRecords(prev => prev.filter(r => r.id !== rec.id && r.no_sj !== rec.no_sj));
          if (rec.status === 'selesai') {
            const removeRes = await removePengecekanSjFromPengirimanDispatched(rec.no_sj, {
              name: session?.name || session?.username || 'Operator',
              username: session?.username || 'operator',
            });
            if (removeRes.removedCount > 0) {
              onShowToast(`Riwayat SJ "${rec.no_sj}" dihapus & ditarik dari antrean Dispatched.`, 'success');
              return;
            }
          }
          onShowToast(`Riwayat SJ "${rec.no_sj}" berhasil dihapus!`, 'success');
        } catch {
          onShowToast('Gagal menghapus riwayat.', 'error');
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  /**
   * KEMBALIKAN KE TAB PENGECEKAN (Fitur yang diminta user)
   * Mengembalikan record dari riwayat ke antrean tab pengecekan agar bisa dicek / discan ulang
   */
  const handleKembalikanKePengecekan = (rec: PengecekanSJRecord) => {
    const draftId = rec.id || `${rec.no_sj.toUpperCase()}___${rec.source.toUpperCase()}___${rec.destination.toUpperCase()}`;

    // Ekstrak items reguler dan unexpected
    const items: TarikanMDItem[] = [];
    const scanQty: Record<string, number> = {};
    const unexpected: Record<string, { nama?: string; qty: number; category?: string }> = {};

    for (const item of rec.items) {
      if (item.is_unexpected || item.qty_sj === 0) {
        unexpected[item.sku] = {
          nama: item.nama_produk,
          qty: item.qty_scan,
          category: item.category,
        };
      } else {
        items.push({
          sku: item.sku,
          nama_produk: item.nama_produk,
          category: item.category,
          qty_sj: item.qty_sj,
        });
        scanQty[item.sku] = item.qty_scan;
      }
    }

    const restoredDraft: PengecekanSJDraft = {
      id: draftId,
      no_sj: rec.no_sj,
      source: rec.source,
      destination: rec.destination,
      tanggal_sj: rec.tanggal_sj,
      tipe_import: rec.tipe_import || (rec.destination?.toLowerCase().includes('warehouse') ? 'Penerimaan' : 'Pengiriman') || 'Pengiriman',
      file_name: `SJ-${rec.no_sj}`,
      items,
      scanQty,
      unexpected,
      catatan: rec.catatan || '',
      status: 'draft',
      created_at: rec.created_at,
      updated_at: new Date().toISOString(),
    };

    // Tambahkan atau update di antrean drafts
    setDrafts(prev => {
      const filtered = prev.filter(d => d.id !== draftId);
      return [restoredDraft, ...filtered];
    });

    setActiveDraftId(draftId);
    setActiveTab('pengecekan');
    onShowToast(`Surat Jalan "${rec.no_sj}" berhasil dikembalikan ke tab Pengecekan untuk scan ulang.`, 'success');
  };

  // Helper deteksi apakah record adalah tipe Pengiriman (bukan Penerimaan ke Warehouse/Gudang Pusat)
  const isPengirimanTypeRecord = useCallback((rec: { tipe_import?: string; destination?: string }): boolean => {
    const isPenerimaan =
      rec.tipe_import === 'Penerimaan' ||
      (!rec.tipe_import &&
        ((rec.destination || '').toLowerCase().includes('warehouse') ||
          (rec.destination || '').toLowerCase().includes('gudang') ||
          (rec.destination || '').toLowerCase().includes('pusat')));
    return !isPenerimaan;
  }, []);

  const noSjReportMap = useMemo(
    () => buildNoSjReportIndex(pengirimanReports),
    [pengirimanReports]
  );

  const getRecordShippingStatus = useCallback(
    (rec: PengecekanSJRecord): PengecekanSjShippingStatus =>
      resolvePengecekanSjShippingStatus(rec.no_sj, noSjReportMap, shippingOverrides),
    [noSjReportMap, shippingOverrides]
  );

  // EDIT OLEH ADMIN (dengan proteksi auto-off Dispatched sementara jika SJ sedang di antrean Dispatched)
  const handleStartEdit = (rec: PengecekanSJRecord) => {
    const shipStatus = getRecordShippingStatus(rec);
    const isPengiriman = isPengirimanTypeRecord(rec);

    if (rec.status === 'selesai' && isPengiriman && shipStatus === 'dispatched') {
      setConfirmModal({
        title: 'Nonaktifkan Sementara Status Dispatched?',
        message: `SJ "${rec.no_sj}" saat ini berada di antrean Pengiriman Store > Dispatched.\n\nSelama proses edit berlangsung, status Dispatched akan dinonaktifkan (ditarik sementara) agar tidak terbawa pengiriman sebelum revisi selesai. Saat klik Simpan nanti, Anda akan diberi pilihan untuk memasukkannya kembali ke Dispatched.`,
        confirmLabel: 'Nonaktifkan Dispatched & Edit',
        isDanger: false,
        onConfirm: async () => {
          const actorUser = {
            name: session?.name || session?.username || 'Operator',
            username: session?.username || 'operator',
          };
          const rmRes = await removePengecekanSjFromPengirimanDispatched(rec.no_sj, actorUser);
          if (rmRes.removedCount > 0) {
            onShowToast(
              `Status Dispatched SJ "${rec.no_sj}" dinonaktifkan sementara selama edit.`,
              'warning'
            );
            await loadShippingStates();
          }
          setEditWasDispatched(true);
          setEditRequeueDispatched(false);
          setEditingRecordId(rec.id);
          setEditFormData(JSON.parse(JSON.stringify(rec)));
        },
      });
      return;
    }

    if (rec.status === 'selesai' && isPengiriman && shipStatus === 'terkirim') {
      onShowToast(
        `Info: SJ "${rec.no_sj}" sudah berstatus Terkirim. Edit hanya memperbarui riwayat pengecekan.`,
        'info'
      );
    }

    setEditWasDispatched(false);
    setEditRequeueDispatched(false);
    setEditingRecordId(rec.id);
    setEditFormData(JSON.parse(JSON.stringify(rec)));
  };

  const handleSaveEdit = async () => {
    if (!editFormData) return;
    setSavingEdit(true);
    try {
      // Hitung ulang total dan status komparasi
      const total_sj = editFormData.items.reduce((acc, i) => acc + (i.qty_sj || 0), 0);
      const total_scan = editFormData.items.reduce((acc, i) => acc + (i.qty_scan || 0), 0);
      const has_selisih = editFormData.items.some(i => (i.qty_scan - i.qty_sj) !== 0);

      const updatedRecord: PengecekanSJRecord = {
        ...editFormData,
        total_qty_sj: total_sj,
        total_qty_terima: total_scan,
        status_komparasi: has_selisih ? 'SELISIH' : 'COCOK',
        updated_at: new Date().toISOString(),
        items_json: JSON.stringify(editFormData.items),
      };

      const prevRecord = records.find(r => r.id === updatedRecord.id);

      await editPengecekanSJ(updatedRecord);
      setRecords(prev => prev.map(r => (r.id === updatedRecord.id ? updatedRecord : r)));

      const actorUser = {
        name: session?.name || session?.username || 'Operator',
        username: session?.username || 'operator',
      };
      if (updatedRecord.status === 'selesai' && editRequeueDispatched) {
        const dispatchRes = await syncPengecekanSjToPengirimanDispatched(updatedRecord, actorUser);
        if (dispatchRes.action === 'created' || dispatchRes.action === 'updated') {
          onShowToast(dispatchRes.message, 'info');
        } else if (dispatchRes.action === 'already_sent') {
          onShowToast(dispatchRes.message, 'warning');
        }
        await loadShippingStates();
      } else if (prevRecord?.status === 'selesai' && updatedRecord.status === 'pending') {
        const removeRes = await removePengecekanSjFromPengirimanDispatched(updatedRecord.no_sj, actorUser);
        if (removeRes.removedCount > 0) {
          onShowToast(removeRes.message, 'info');
        } else if (removeRes.skippedSentCount > 0) {
          onShowToast(removeRes.message, 'warning');
        }
        await loadShippingStates();
      }

      onShowToast(`Perubahan riwayat SJ "${updatedRecord.no_sj}" berhasil disimpan!`, 'success');
      setEditingRecordId(null);
      setEditFormData(null);
      setEditWasDispatched(false);
      setEditRequeueDispatched(false);
    } catch {
      onShowToast('Gagal menyimpan perubahan.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [bulkStatusAction, setBulkStatusAction] = useState<'pending' | 'selesai' | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // AKSI EKSPLISIT PENGIRIMAN (MULTI-SELECT & SATUAN) DI TAB SELESAI
  const handleSendRecordsToDispatched = async (targetRecords: PengecekanSJRecord[]) => {
    const eligible = targetRecords.filter(
      (r) => r.status === 'selesai' && isPengirimanTypeRecord(r)
    );
    if (eligible.length === 0) {
      onShowToast('Pilih minimal 1 SJ Pengiriman berstatus SELESAI untuk dikirim ke Dispatched.', 'warning');
      return;
    }

    setIsBulkShippingAction(true);
    try {
      const actorUser = {
        name: session?.name || session?.username || 'Operator',
        username: session?.username || 'operator',
      };
      let createdCount = 0;
      let mergedCount = 0;
      let skippedSent = 0;
      let skippedZero = 0;

      for (const rec of eligible) {
        const res = await syncPengecekanSjToPengirimanDispatched(rec, actorUser);
        if (res.action === 'created') createdCount++;
        else if (res.action === 'updated') mergedCount++;
        else if (res.action === 'already_sent') skippedSent++;
        else if (res.action === 'skipped_zero_qty') skippedZero++;
      }

      await loadShippingStates();
      setSelectedRecords(new Set());

      const parts: string[] = [];
      if (createdCount > 0) parts.push(`${createdCount} SJ masuk antrean Dispatched`);
      if (mergedCount > 0) parts.push(`${mergedCount} SJ digabungkan/diperbarui (0 duplikat)`);
      if (skippedSent > 0) parts.push(`${skippedSent} SJ dilewati (sudah Terkirim)`);
      if (skippedZero > 0) parts.push(`${skippedZero} SJ dilewati (qty fisik 0)`);

      onShowToast(
        parts.length > 0 ? parts.join(' · ') : 'Tidak ada SJ yang diperbarui ke Dispatched.',
        createdCount + mergedCount > 0 ? 'success' : 'warning'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal mengirim SJ ke Dispatched.', 'error');
    } finally {
      setIsBulkShippingAction(false);
    }
  };

  const handleBulkSetShippingOverride = async (
    targetRecords: PengecekanSJRecord[],
    nextStatus: 'terkirim' | 'batal_kirim' | null
  ) => {
    const eligible = targetRecords.filter(
      (r) => r.status === 'selesai' && isPengirimanTypeRecord(r)
    );
    if (eligible.length === 0) {
      onShowToast('Pilih minimal 1 SJ Pengiriman berstatus SELESAI terlebih dahulu.', 'warning');
      return;
    }

    const labelMap = {
      terkirim: 'Terkirim (Arsip Pengecekan SJ)',
      batal_kirim: 'Batal Kirim',
      reset: 'Belum Jadwal Kirim',
    };
    const actionLabel = nextStatus ? labelMap[nextStatus] : labelMap.reset;

    setConfirmModal({
      title: `Pindahkan ${eligible.length} SJ ke ${actionLabel}`,
      message:
        nextStatus === 'terkirim'
          ? `Tandai ${eligible.length} SJ Pengiriman terpilih sebagai TERKIRIM di Pengecekan SJ?\n\nCatatan: Aksi ini hanya memindahkan status arsip di Pengecekan SJ dan TIDAK membuat data trip baru di Pengiriman Store.`
          : nextStatus === 'batal_kirim'
          ? `Tandai ${eligible.length} SJ Pengiriman terpilih sebagai BATAL KIRIM? Jika masih ada di antrean Dispatched, otomatis akan ditarik keluar (data yang sudah Terkirim tidak dihapus).`
          : `Kembalikan ${eligible.length} SJ Pengiriman terpilih ke status BELUM JADWAL KIRIM? Jika masih ada di antrean Dispatched, akan ditarik keluar.`,
      confirmLabel: `Ya, Pindahkan (${eligible.length} SJ)`,
      isDanger: nextStatus === 'batal_kirim',
      onConfirm: async () => {
        setIsBulkShippingAction(true);
        try {
          const actorUser = {
            name: session?.name || session?.username || 'Operator',
            username: session?.username || 'operator',
          };

          const noSjToUpdate: string[] = [];
          let skippedActiveDispatched = 0;
          let skippedAlreadySent = 0;

          for (const rec of eligible) {
            const liveRep = noSjReportMap.get(rec.no_sj.trim().toUpperCase());
            if (nextStatus === 'terkirim') {
              if (liveRep?.status === 'dispatched') {
                // Lindungi antrean Dispatched aktif agar tidak ditandai terkirim tanpa melalui Pengiriman Store
                skippedActiveDispatched++;
                continue;
              }
              noSjToUpdate.push(rec.no_sj);
            } else {
              // batal_kirim atau reset ke belum_jadwal
              if (liveRep?.status === 'sent') {
                skippedAlreadySent++;
                continue;
              }
              if (liveRep?.status === 'dispatched') {
                await removePengecekanSjFromPengirimanDispatched(rec.no_sj, actorUser);
              }
              noSjToUpdate.push(rec.no_sj);
            }
          }

          if (noSjToUpdate.length > 0) {
            const nextMap = await setSjShippingOverridesBatch(noSjToUpdate, nextStatus, actorUser);
            setShippingOverrides(nextMap);
          }

          await loadShippingStates();
          setSelectedRecords(new Set());

          const notes: string[] = [];
          if (noSjToUpdate.length > 0) {
            notes.push(`${noSjToUpdate.length} SJ dipindahkan ke ${actionLabel}`);
          }
          if (skippedActiveDispatched > 0) {
            notes.push(`${skippedActiveDispatched} SJ dilewati karena masih aktif di antrean Dispatched`);
          }
          if (skippedAlreadySent > 0) {
            notes.push(`${skippedAlreadySent} SJ dilewati karena sudah tercatat Terkirim di Pengiriman Store`);
          }

          onShowToast(
            notes.join(' · ') || 'Tidak ada perubahan status pengiriman.',
            noSjToUpdate.length > 0 ? 'success' : 'warning'
          );
        } catch (err: any) {
          onShowToast(err?.message || 'Gagal memperbarui status pengiriman.', 'error');
        } finally {
          setIsBulkShippingAction(false);
        }
      },
    });
  };

  const handleBulkUpdateStatus = async (newStatus: 'pending' | 'selesai') => {
    if (selectedRecords.size === 0) {
      onShowToast('Pilih setidaknya satu Surat Jalan untuk diubah statusnya.', 'warning');
      return;
    }

    const recordsToUpdate = filteredRecords.filter(r => selectedRecords.has(r.id) && r.status !== newStatus);

    if (recordsToUpdate.length === 0) {
      onShowToast(`Semua data yang dipilih sudah berstatus ${newStatus.toUpperCase()}.`, 'warning');
      return;
    }

    setConfirmModal({
      title: 'Ubah Status Massal',
      message:
        newStatus === 'selesai'
          ? `Yakin ingin mengubah status ${recordsToUpdate.length} Surat Jalan menjadi SELESAI? (Tidak otomatis masuk Dispatched — Anda dapat memilih & mengirimnya secara terpisah di tab SELESAI).`
          : `Yakin ingin mengubah status ${recordsToUpdate.length} Surat Jalan menjadi PENDING? (Jika ada di antrean Dispatched, otomatis ditarik keluar).`,
      confirmLabel: `Ubah ke ${newStatus.toUpperCase()}`,
      isDanger: false,
      onConfirm: async () => {
        setIsBulkUpdating(true);
        setBulkStatusAction(newStatus);
        let successCount = 0;

        try {
          const updatedRecordsList: PengecekanSJRecord[] = [];

          // Perform updates sequentially to avoid overwhelming the GAS endpoint
          for (const rec of recordsToUpdate) {
            const updatedRecord: PengecekanSJRecord = {
              ...rec,
              status: newStatus,
              updated_at: new Date().toISOString()
            };

            const success = await editPengecekanSJ(updatedRecord);
            if (success) {
              updatedRecordsList.push(updatedRecord);
              successCount++;
            }
          }

          if (successCount > 0) {
            const actorUser = {
              name: session?.name || session?.username || 'Operator',
              username: session?.username || 'operator',
            };
            let dispatchedRemovedCount = 0;

            if (newStatus === 'pending') {
              for (const updated of updatedRecordsList) {
                const prevRec = recordsToUpdate.find((r) => r.id === updated.id);
                if (prevRec?.status === 'selesai') {
                  const rmRes = await removePengecekanSjFromPengirimanDispatched(updated.no_sj, actorUser);
                  if (rmRes.removedCount > 0) dispatchedRemovedCount++;
                }
              }
              await loadShippingStates();
            }

            setRecords(prev => {
              const newRecords = [...prev];
              updatedRecordsList.forEach(updated => {
                const index = newRecords.findIndex(r => r.id === updated.id);
                if (index !== -1) newRecords[index] = updated;
              });
              return newRecords;
            });

            const extraNote =
              dispatchedRemovedCount > 0
                ? ` · ${dispatchedRemovedCount} SJ ditarik dari Dispatched`
                : '';
            onShowToast(`Berhasil memperbarui ${successCount} data menjadi ${newStatus.toUpperCase()}${extraNote}`, 'success');
          } else {
            onShowToast('Gagal memperbarui status. Silakan coba lagi.', 'error');
          }
        } catch (e) {
          console.error('Bulk update error:', e);
          onShowToast('Terjadi kesalahan saat memperbarui data secara massal.', 'error');
        } finally {
          setIsBulkUpdating(false);
          setBulkStatusAction(null);
          setSelectedRecords(new Set());
        }
      }
    });
  };

  // RIWAYAT COUNTS (PENERIMAAN vs PENGIRIMAN)
  const riwayatCounts = useMemo(() => {
    let penerimaan = 0;
    let pengiriman = 0;
    records.forEach(r => {
      const isPenerimaan =
        r.tipe_import === 'Penerimaan' ||
        (!r.tipe_import &&
          ((r.destination || '').toLowerCase().includes('warehouse') ||
            (r.destination || '').toLowerCase().includes('gudang') ||
            (r.destination || '').toLowerCase().includes('pusat')));
      if (isPenerimaan) penerimaan++;
      else pengiriman++;
    });
    return {
      all: records.length,
      penerimaan,
      pengiriman,
    };
  }, [records]);

  const getRecordIsoDate = useCallback((rec: PengecekanSJRecord): string => {
    if (rec.tanggal_sj && rec.tanggal_sj.trim()) {
      return normalizeDateToIso(rec.tanggal_sj);
    }
    if (rec.created_at) {
      return rec.created_at.slice(0, 10);
    }
    return '';
  }, []);

  const { asalOptions, tujuanOptions } = useMemo(() => {
    const asalMap = new Map<string, number>();
    const tujuanMap = new Map<string, number>();
    records.forEach((r) => {
      const src = (r.source || '').trim();
      const dst = (r.destination || '').trim();
      if (src) asalMap.set(src, (asalMap.get(src) || 0) + 1);
      if (dst) tujuanMap.set(dst, (tujuanMap.get(dst) || 0) + 1);
    });
    return {
      asalOptions: Array.from(asalMap.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, 'id', { sensitivity: 'base' })),
      tujuanOptions: Array.from(tujuanMap.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, 'id', { sensitivity: 'base' })),
    };
  }, [records]);

  const hasActiveRiwayatFilters = Boolean(
    searchFilter ||
    statusFilter !== 'ALL' ||
    shippingSubTab !== 'ALL' ||
    sourceFilter.length > 0 ||
    destinationFilter.length > 0 ||
    dateFromFilter ||
    dateToFilter
  );

  const selesaiShippingCounts = useMemo(() => {
    let all = 0;
    let belum_jadwal = 0;
    let dispatched = 0;
    let terkirim = 0;
    let batal_kirim = 0;

    records.forEach((r) => {
      if (r.status !== 'selesai') return;
      if (!isPengirimanTypeRecord(r)) return;
      all++;
      const st = getRecordShippingStatus(r);
      if (st === 'belum_jadwal') belum_jadwal++;
      else if (st === 'dispatched') dispatched++;
      else if (st === 'terkirim') terkirim++;
      else if (st === 'batal_kirim') batal_kirim++;
    });

    return { all, belum_jadwal, dispatched, terkirim, batal_kirim };
  }, [records, isPengirimanTypeRecord, getRecordShippingStatus]);

  // FILTERED & SORTED RIWAYAT RECORDS
  const filteredRecords = useMemo(() => {
    const filtered = records.filter((r) => {
      const isPenerimaan = !isPengirimanTypeRecord(r);

      const matchType =
        riwayatTypeFilter === 'ALL' ||
        (riwayatTypeFilter === 'PENERIMAAN' && isPenerimaan) ||
        (riwayatTypeFilter === 'PENGIRIMAN' && !isPenerimaan);

      const q = searchFilter.trim().toLowerCase();
      const matchSearch =
        !q ||
        r.no_sj.toLowerCase().includes(q) ||
        (r.source || '').toLowerCase().includes(q) ||
        (r.destination || '').toLowerCase().includes(q) ||
        r.items.some((i) => i.sku.toLowerCase().includes(q) || i.nama_produk.toLowerCase().includes(q));

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PENDING' && r.status === 'pending') ||
        (statusFilter === 'SELESAI' && r.status === 'selesai') ||
        (statusFilter === 'COCOK' && r.status_komparasi === 'COCOK') ||
        (statusFilter === 'SELISIH' && r.status_komparasi === 'SELISIH');

      // Filter Sub-Tab Status Pengiriman khusus saat tab SELESAI aktif (non-Penerimaan)
      let matchShippingSubTab = true;
      if (statusFilter === 'SELESAI' && riwayatTypeFilter !== 'PENERIMAAN' && shippingSubTab !== 'ALL') {
        if (isPenerimaan) {
          matchShippingSubTab = false;
        } else {
          matchShippingSubTab = getRecordShippingStatus(r) === shippingSubTab;
        }
      }

      const matchSource =
        sourceFilter.length === 0 ||
        sourceFilter.some((src) => src.toLowerCase() === (r.source || '').trim().toLowerCase());

      const matchDestination =
        destinationFilter.length === 0 ||
        destinationFilter.some((dst) => dst.toLowerCase() === (r.destination || '').trim().toLowerCase());

      let matchDate = true;
      if (dateFromFilter || dateToFilter) {
        const recDate = getRecordIsoDate(r);
        if (!recDate) {
          matchDate = false;
        } else {
          if (dateFromFilter && recDate < dateFromFilter) matchDate = false;
          if (dateToFilter && recDate > dateToFilter) matchDate = false;
        }
      }

      return matchType && matchSearch && matchStatus && matchShippingSubTab && matchSource && matchDestination && matchDate;
    });

    const compareDateDesc = (a: PengecekanSJRecord, b: PengecekanSJRecord) => {
      const dateA = getRecordIsoDate(a);
      const dateB = getRecordIsoDate(b);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    };

    return [...filtered].sort((a, b) => {
      switch (riwayatSortBy) {
        case 'tanggal_asc':
          return -compareDateDesc(a, b);
        case 'asal_asc': {
          const cmp = (a.source || '').trim().localeCompare((b.source || '').trim(), 'id', { sensitivity: 'base' });
          return cmp !== 0 ? cmp : compareDateDesc(a, b);
        }
        case 'asal_desc': {
          const cmp = (b.source || '').trim().localeCompare((a.source || '').trim(), 'id', { sensitivity: 'base' });
          return cmp !== 0 ? cmp : compareDateDesc(a, b);
        }
        case 'tujuan_asc': {
          const cmp = (a.destination || '').trim().localeCompare((b.destination || '').trim(), 'id', { sensitivity: 'base' });
          return cmp !== 0 ? cmp : compareDateDesc(a, b);
        }
        case 'tujuan_desc': {
          const cmp = (b.destination || '').trim().localeCompare((a.destination || '').trim(), 'id', { sensitivity: 'base' });
          return cmp !== 0 ? cmp : compareDateDesc(a, b);
        }
        case 'tanggal_desc':
        default:
          return compareDateDesc(a, b);
      }
    });
  }, [
    records,
    searchFilter,
    statusFilter,
    shippingSubTab,
    riwayatTypeFilter,
    sourceFilter,
    destinationFilter,
    dateFromFilter,
    dateToFilter,
    riwayatSortBy,
    getRecordIsoDate,
    isPengirimanTypeRecord,
    getRecordShippingStatus,
  ]);

  // ==========================================
  // RENDER VIEW
  // ==========================================
  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0b1324]">
      {/* ---- HEADER UTAMA ---- */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/30 flex items-center justify-center text-primary-500 shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                Pengecekan Surat Jalan
              </h1>
              <p className="text-xs text-slate-400">
                Pengecekan surat jalan, antrean draft, komparasi scan & riwayat penerimaan
              </p>
            </div>
          </div>

          {/* Quick Action Export Semua & Status Indikator */}
          <div className="flex items-center gap-2">
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
              }`}>
              {isOnline ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-500" />
                  <span>Offline</span>
                </>
              )}
            </div>

            {activeTab === 'riwayat' && records.length > 0 && (
              <button
                type="button"
                onClick={() => exportPengecekanToCsv(records, `Semua_Riwayat_Pengecekan_SJ_${new Date().toISOString().slice(0, 10)}.csv`, productCatalog)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export Semua Data</span>
                <span className="sm:hidden">Export</span>
              </button>
            )}
          </div>
        </div>

        {/* OFFLINE INDICATOR BANNER */}
        {!isOnline && (
          <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-700 dark:text-amber-300 text-xs">
            <div className="flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Mode Offline Aktif:</strong> Internet terputus. Anda tetap bisa melakukan scan barcode dan import; progres scan tersimpan otomatis di perangkat Anda tanpa hilang.
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-[10px] font-extrabold shrink-0 text-amber-700 dark:text-amber-300">
              Aman & Tersimpan
            </span>
          </div>
        )}

        {/* PENDING OFFLINE SYNC BANNER */}
        {pendingOfflineCount > 0 && (
          <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3 text-blue-700 dark:text-blue-300 text-xs">
            <div className="flex items-center gap-2.5">
              <CloudOff className="w-4 h-4 shrink-0 text-blue-500" />
              <span>
                <strong>{pendingOfflineCount} Surat Jalan</strong> telah selesai dicek secara offline dan menunggu dikirim ke Databases.
              </span>
            </div>
            <button
              type="button"
              disabled={isSyncingOffline || !isOnline}
              onClick={handleManualSyncOffline}
              className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${!isOnline
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOffline ? 'animate-spin' : ''}`} />
              <span>{isSyncingOffline ? 'Menyinkronkan...' : isOnline ? 'Sinkronkan Sekarang' : 'Menunggu Internet'}</span>
            </button>
          </div>
        )}

        {/* TABS SELECTOR - Style Minimalis LoadingDock & Quality Control */}
        <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 sm:p-2 flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5 px-0.5 w-full sm:w-auto">
            <button
              type="button"
              id="tab-distribusi-pengecekan"
              onClick={() => setActiveTab('pengecekan')}
              className={`py-2 px-3.5 text-xs font-extrabold flex items-center justify-center gap-2 rounded-xl transition-all cursor-pointer select-none whitespace-nowrap shrink-0 relative ${activeTab === 'pengecekan'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              <ScanLine className="w-4 h-4 shrink-0" />
              <span>Pengecekan</span>
              {drafts.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black leading-none ${activeTab === 'pengecekan'
                      ? 'bg-white/25 text-white'
                      : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    }`}
                >
                  {drafts.length}
                </span>
              )}
            </button>

            <button
              type="button"
              id="tab-distribusi-riwayat"
              onClick={() => setActiveTab('riwayat')}
              className={`py-2 px-3.5 text-xs font-extrabold flex items-center justify-center gap-2 rounded-xl transition-all cursor-pointer select-none whitespace-nowrap shrink-0 relative ${activeTab === 'riwayat'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Riwayat</span>
              {records.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black leading-none ${activeTab === 'riwayat'
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                >
                  {records.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ---- TAB CONTENT BODY ---- */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">

        {/* ======================================================== */}
        {/* TAB 1: PENGECEKAN BARANG & ANTREAN DRAFT                 */}
        {/* ======================================================== */}
        {activeTab === 'pengecekan' && (
          <>
            {/* CARD IMPORT CSV */}
            <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-primary-500" />
                    Import File Surat Jalan (Bisa Banyak CSV)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    1 file CSV = 1 draft. Jika 1 file berisi banyak No SJ, sistem otomatis memisahkannya dan langsung menyimpan ke Supabase sejak import pertama.
                  </p>
                </div>
                {isSavingImport && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold shrink-0">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Menyimpan ke Supabase...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="importType"
                    value="Penerimaan"
                    checked={importType === 'Penerimaan'}
                    onChange={() => setImportType('Penerimaan')}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Penerimaan (Putaway)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="importType"
                    value="Pengiriman"
                    checked={importType === 'Pengiriman'}
                    onChange={() => setImportType('Pengiriman')}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500 border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Pengiriman (Picking)</span>
                </label>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                multiple
                onChange={handleFilesChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary-400 hover:bg-primary-50/20 dark:hover:bg-primary-950/10 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Upload className="w-4 h-4 text-primary-500" />
                <span>Pilih satu atau beberapa file CSV Surat Jalan untuk diimport</span>
              </button>
            </div>

            {/* ANTREAN PENGECEKAN (DRAFT PEKERJAAN STAY DI TAB PENGECEKAN) */}
            {drafts.length > 0 && (
              <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary-500" />
                      <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">
                        Antrean Pengecekan ({drafts.length} Surat Jalan)
                      </h3>
                    </div>

                    {drafts.length > 1 && (
                      <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={selectedDraftIds.size > 0 && selectedDraftIds.size === drafts.length}
                          ref={input => {
                            if (input) {
                              input.indeterminate = selectedDraftIds.size > 0 && selectedDraftIds.size < drafts.length;
                            }
                          }}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDraftIds(new Set(drafts.map(d => d.id)));
                            } else {
                              setSelectedDraftIds(new Set());
                            }
                          }}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-primary-500 focus:ring-primary-500 cursor-pointer"
                        />
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {selectedDraftIds.size > 0 ? `${selectedDraftIds.size} Dipilih` : 'Pilih Semua'}
                        </span>
                      </label>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleOpenBulkSubmitModal}
                      className="px-3 py-1.5 text-xs font-extrabold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 active:scale-95 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-indigo-600/20"
                      title="Submit beberapa atau semua Surat Jalan di antrean sekaligus ke Database"
                    >
                      {bulkSubmittingProgress ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>
                            Menyimpan {bulkSubmittingProgress.current}/{bulkSubmittingProgress.total} SJ...
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {selectedDraftIds.size > 0
                              ? `Submit Sekaligus (${selectedDraftIds.size} SJ)`
                              : `Submit Semua (${drafts.length} SJ)`}
                          </span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const targetDrafts = selectedDraftIds.size > 0
                          ? drafts.filter(d => selectedDraftIds.has(d.id) && d.items && d.items.length > 0)
                          : drafts.filter(d => d.items && d.items.length > 0);
                        if (targetDrafts.length === 0) {
                          onShowToast('Tidak ada Surat Jalan dengan item valid untuk dikirim.', 'warning');
                          return;
                        }
                        setPickingModalInitialTab('app');
                        setPickingModalDraft(null);
                        setPickingModalDrafts(targetDrafts);
                      }}
                      className="px-3 py-1.5 text-xs font-extrabold rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700/80 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 active:scale-95 flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Kirim banyak atau semua Surat Jalan sekaligus ke Tugas Picking App, Grup WA Gudang, atau Cetak A4 Massal"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        Kirim Tugas Picking Massal ({selectedDraftIds.size > 0 ? selectedDraftIds.size : drafts.length} SJ)
                      </span>
                    </button>

                    {selectedDraftIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetCount = selectedDraftIds.size;
                          setConfirmModal({
                            title: 'Hapus Draft Terpilih',
                            message: `Hapus ${targetCount} draft Surat Jalan yang dipilih dari antrean pengecekan?`,
                            confirmLabel: `Hapus ${targetCount} Draft`,
                            isDanger: true,
                            onConfirm: () => {
                              selectedDraftIds.forEach(id => deleteSJDraft(id));
                              setDrafts(prev => prev.filter(d => !selectedDraftIds.has(d.id)));
                              if (activeDraftId && selectedDraftIds.has(activeDraftId)) {
                                setActiveDraftId(null);
                              }
                              setSelectedDraftIds(new Set());
                              onShowToast(`${targetCount} draft SJ dihapus dari antrean.`, 'info');
                            }
                          });
                        }}
                        className="px-2.5 py-1.5 text-xs font-bold rounded-xl bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus ({selectedDraftIds.size})</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {drafts.map(draft => {
                    const isSelected = draft.id === activeDraftId;
                    const isCheckedForBulk = selectedDraftIds.has(draft.id);
                    const isAlreadySentToApp = Boolean(draft.catatan?.includes('[Tugas Picking App Terkirim]'));
                    const isPernahSelesai = records.some(r => r.no_sj.trim().toUpperCase() === draft.no_sj.trim().toUpperCase());
                    const totalQtySj = draft.items.reduce((s, i) => s + i.qty_sj, 0);
                    const totalScanned = Object.values(draft.scanQty).reduce((s, v) => s + v, 0) +
                      Object.values(draft.unexpected || {}).reduce((s, v) => s + v.qty, 0);
                    const progressPercent = totalQtySj > 0 ? Math.min(100, Math.round((totalScanned / totalQtySj) * 100)) : 0;

                    return (
                      <div
                        key={draft.id}
                        onClick={() => setActiveDraftId(draft.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${isSelected
                            ? 'border-primary-500 bg-primary-50/30 dark:bg-primary-950/20 ring-2 ring-primary-500/20 shadow-sm'
                            : isCheckedForBulk
                              ? 'border-emerald-500/60 bg-emerald-50/20 dark:bg-emerald-950/15 ring-1 ring-emerald-500/20'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5 gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isCheckedForBulk}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  setSelectedDraftIds(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(draft.id);
                                    else next.delete(draft.id);
                                    return next;
                                  });
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                                title="Pilih SJ ini untuk Kirim Tugas Picking Massal"
                              />
                              <span className="font-mono text-xs font-black text-slate-800 dark:text-white truncate">
                                {draft.no_sj}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isPernahSelesai && (
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="SJ ini sudah pernah selesai dicek dan tercatat di Riwayat">
                                  ⚠️ Pernah Selesai
                                </span>
                              )}
                              {isAlreadySentToApp && (
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  ✓ Picking App
                                </span>
                              )}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSelected ? 'bg-primary-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                }`}>
                                {isSelected ? 'Sedang Dicek' : 'Antrean'}
                              </span>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            <span>{draft.source} → {draft.destination}</span>
                            <span className="mx-1.5">·</span>
                            <span>{draft.tanggal_sj}</span>
                            {draft.tipe_import && (
                              <>
                                <span className="mx-1.5">·</span>
                                <span className={`font-bold ${draft.tipe_import === 'Penerimaan' ? 'text-indigo-500' : 'text-emerald-500'}`}>{draft.tipe_import}</span>
                              </>
                            )}
                          </div>

                          {/* Progress */}
                          <div className="mb-2">
                            <div className="flex justify-between text-[10px] font-bold mb-1">
                              <span className="text-slate-400">Progress Scan</span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {totalScanned} / {totalQtySj} pcs ({progressPercent}%)
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-primary-500'
                                  }`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Card bottom actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-2">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {draft.items.length} SKU
                          </span>

                          <div className="flex items-center gap-1.5">
                            {draft.items && draft.items.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPickingModalInitialTab('print');
                                  setPickingModalDrafts([]);
                                  setPickingModalDraft(draft);
                                }}
                                className="px-2 py-1 text-[11px] font-extrabold rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                title="Format Picking (Cetak SJ, Kirim WA ke Grup, atau Kirim ke Tugas Picking App)"
                              >
                                <Send className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Format Picking</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmModal({
                                  title: 'Hapus Draft Surat Jalan',
                                  message: `Hapus draft SJ "${draft.no_sj}" dari antrean pengecekan? Data scan yang belum disimpan akan terhapus.`,
                                  confirmLabel: 'Hapus Draft',
                                  isDanger: true,
                                  onConfirm: () => {
                                    deleteSJDraft(draft.id);
                                    setDrafts(prev => prev.filter(d => d.id !== draft.id));
                                    setSelectedDraftIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(draft.id);
                                      return next;
                                    });
                                    if (activeDraftId === draft.id) {
                                      setActiveDraftId(null);
                                    }
                                    onShowToast(`Draft SJ "${draft.no_sj}" dihapus.`, 'info');
                                  }
                                });
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center active:scale-95"
                              title="Hapus draft dari antrean"
                              aria-label="Hapus draft dari antrean"
                            >
                              <Trash2 className="w-4 h-4 text-rose-500/80 hover:text-rose-600" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDraftId(draft.id);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${isSelected
                                  ? 'bg-primary-500 text-white shadow-xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                }`}
                            >
                              {isSelected ? 'Aktif' : 'Pilih SJ'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AREA SCAN & KOMPARASI UNTUK DRAFT YANG SEDANG AKTIF */}
            {activeDraft ? (
              <>
                {/* ACTIVE SJ HEADER BANNER */}
                <div className="bg-gradient-to-r from-primary-500/10 to-primary-500/5 dark:from-primary-950/40 dark:to-primary-950/20 border border-primary-500/30 rounded-2xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary-500 text-white">
                          Surat Jalan Aktif
                        </span>
                        <h2 className="text-base font-black text-slate-900 dark:text-white font-mono">
                          {activeDraft.no_sj}
                        </h2>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Asal: <strong>{activeDraft.source}</strong></span>
                        <span>→</span>
                        <span>Tujuan: <strong>{activeDraft.destination}</strong></span>
                        <span>·</span>
                        <span>Tanggal: <strong>{activeDraft.tanggal_sj}</strong></span>
                        {activeDraft.tipe_import && (
                          <>
                            <span>·</span>
                            <span>Tipe: <strong>{activeDraft.tipe_import}</strong></span>
                          </>
                        )}
                      </div>
                      <div className="inline-flex items-center gap-1.5 text-[9.5px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-md shadow-2xs mt-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Tersimpan ke Supabase sejak import awal · Progres scan tersimpan otomatis di perangkat</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeDraft.items && activeDraft.items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPickingModalDraft(activeDraft)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Pilih format picking: Cetak Lembar Kerja, Kirim WA ke Grup, atau Kirim ke Tugas Picking App"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Format Picking Picker</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            title: 'Reset Hasil Scan',
                            message: `Reset seluruh hasil scan untuk SJ "${activeDraft.no_sj}"? Semua item yang telah di-scan akan kembali ke 0.`,
                            confirmLabel: 'Reset Scan',
                            isDanger: true,
                            onConfirm: () => {
                              setDrafts(prev => prev.map(d => d.id === activeDraft.id ? { ...d, scanQty: {}, unexpected: {} } : d));
                              onShowToast('Hasil scan direset.', 'info');
                            }
                          });
                        }}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset Scan
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setConfirmModal({
                            title: 'Hapus Draft Surat Jalan',
                            message: `Hapus draft Surat Jalan "${activeDraft.no_sj}" dari antrean pengecekan? Data scan yang belum disimpan akan terhapus.`,
                            confirmLabel: 'Hapus Draft',
                            isDanger: true,
                            onConfirm: () => {
                              deleteSJDraft(activeDraft.id);
                              setDrafts(prev => prev.filter(d => d.id !== activeDraft.id));
                              setActiveDraftId(null);
                              onShowToast(`Draft SJ "${activeDraft.no_sj}" dihapus.`, 'info');
                            }
                          });
                        }}
                        className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-800/60 flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Hapus draft dari antrean"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus Draft</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* SCAN INPUT */}
                <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <ScanLine className="w-3.5 h-3.5 text-primary-500" />
                      Scan Barcode / Input Manual
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowCameraScanner(prev => !prev)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${showCameraScanner
                          ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                          : 'bg-primary-500 hover:bg-primary-600 text-white shadow-primary-500/20'
                        }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{showCameraScanner ? 'Tutup Kamera HP' : '📷 Buka Kamera HP'}</span>
                    </button>
                  </div>
                  {/* KAMERA SCANNER HP */}
                  {showCameraScanner && (
                    <div className="rounded-2xl border-2 border-primary-500/40 p-3 bg-slate-900/90 text-white overflow-hidden space-y-2 shadow-lg">
                      <div className="flex items-center justify-between text-xs font-bold px-1">
                        <span className="flex items-center gap-2 text-primary-400">
                          <Camera className="w-4 h-4 animate-pulse" />
                          Scanner Kamera HP Aktif — Arahkan ke Barcode / QR Produk
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowCameraScanner(false)}
                          className="text-[11px] px-2 py-0.5 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-white"
                        >
                          Tutup
                        </button>
                      </div>
                      <div className="rounded-xl overflow-hidden bg-black max-h-[300px] flex items-center justify-center">
                        <CameraScanner
                          id="pengecekan-camera-scanner"
                          autoStart={true}
                          onScan={(scannedSku) => {
                            if (scannedSku && scannedSku.trim()) {
                              handleScan(scannedSku.trim());
                            }
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 text-center">
                        Mendukung semua format barcode 1D (Code 128, EAN, UPC) & 2D QR Code.
                      </p>
                    </div>
                  )}

                  <PhysicalScanInput
                    onScan={handleScan}
                    products={[]}
                    placeholder="SCAN BARCODE ATAU KETIK SKU LALU ENTER..."
                  />
                  <p className="text-[10px] text-slate-400">
                    Setiap scan otomatis menambah +1 qty. Jika ada item yang tidak terdaftar di surat jalan, sistem akan mencari informasi nama barang di database produk.
                  </p>
                </div>

                {/* SUMMARY STATS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'qty', label: 'Total Qty SJ', value: summary.total_sj, color: 'text-slate-800 dark:text-white', bg: 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800', clickable: false },
                    { id: 'scan', label: 'Total Discan', value: summary.total_scan + summary.total_unexpected_qty, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900', clickable: false },
                    { id: 'cocok', label: 'SKU Cocok', value: summary.cocok, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900', clickable: true },
                    { id: 'selisih', label: 'SKU Selisih', value: summary.kurang + summary.lebih + summary.unexpectedCount, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900', clickable: true },
                  ].map(({ id, label, value, color, bg, clickable }) => {
                    const isFilterActive = (id === 'cocok' && detailFilter === 'COCOK') || (id === 'selisih' && detailFilter === 'SELISIH');
                    const ringStyle = isFilterActive ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-900' : '';

                    return (
                      <div
                        key={label}
                        onClick={() => {
                          if (!clickable) return;
                          if (id === 'cocok') setDetailFilter(prev => prev === 'COCOK' ? 'ALL' : 'COCOK');
                          if (id === 'selisih') setDetailFilter(prev => prev === 'SELISIH' ? 'ALL' : 'SELISIH');
                        }}
                        className={`${bg} rounded-xl p-3 border ${clickable ? 'cursor-pointer hover:shadow-md transition-all' : ''} ${ringStyle}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                          {isFilterActive && <CheckCircle2 className="w-3.5 h-3.5 text-primary-500" />}
                        </div>
                        <div className={`text-2xl font-black ${color}`}>{value}</div>
                      </div>
                    );
                  })}
                </div>

                {/* KOMPARASI BARANG TABLE */}
                <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-3.5 h-3.5 text-primary-500" />
                      <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                        Komparasi Barang ({comparisonData.length} SKU di Surat Jalan)
                      </span>
                    </div>
                  </div>

                  {/* ANOMALI SCAN: BARANG DI LUAR SJ & BARANG MELEBIHI QTY SJ (DITARUH DI ATAS AGAR LANGSUNG TERLIHAT TANPA PERLU SCROLL) */}
                  {(detailFilter === 'ALL' || detailFilter === 'SELISIH') &&
                    (Object.keys(activeDraft.unexpected || {}).length > 0 || overScannedItems.length > 0) && (
                    <div className="border-b border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>
                            Perhatian: Barang Di Luar SJ &amp; Lebih Qty ({Object.keys(activeDraft.unexpected || {}).length + overScannedItems.length} SKU)
                          </span>
                        </div>
                        <span className="text-[10px] font-black px-2 py-0.5 bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 rounded-lg">
                          Perlu Perhatian
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400">
                        Item yang tidak ada di SJ maupun yang jumlah scan-nya melebihi Qty SJ ({activeDraft.no_sj}) ditandai otomatis di sini. Kurangi ke Qty SJ bila terjadi double-scan.
                      </p>

                      <div className="space-y-1.5">
                        {/* 1. Item Di Luar Surat Jalan */}
                        {Object.entries(activeDraft.unexpected || {}).map(([sku, val]) => (
                          <div key={`unexp-${sku}`} className="flex items-center justify-between bg-white dark:bg-[#131d31] border border-amber-300 dark:border-amber-700/80 rounded-xl px-3 py-2 shadow-2xs gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-xs font-black text-amber-900 dark:text-amber-300">{sku}</span>
                                <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 rounded border border-amber-300 dark:border-amber-800">
                                  Di Luar SJ
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5 font-medium">
                                {val.nama || 'Produk Master'}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleManualUnexpectedQty(sku, val.qty - 1)}
                                  className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-900 flex items-center justify-center transition-colors cursor-pointer"
                                  aria-label="Kurangi qty luar SJ"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <span className="font-bold text-xs text-amber-700 dark:text-amber-300 w-8 text-center">
                                  +{val.qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleManualUnexpectedQty(sku, val.qty + 1)}
                                  className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-900 flex items-center justify-center transition-colors cursor-pointer"
                                  aria-label="Tambah qty luar SJ"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveUnexpected(sku)}
                                className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                                title="Hapus dari daftar lebihan"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* 2. Item Ada di SJ namun Qty Scan > Qty SJ */}
                        {overScannedItems.map((item) => (
                          <div key={`over-${item.sku}`} className="flex items-center justify-between bg-white dark:bg-[#131d31] border border-rose-300 dark:border-rose-800/80 rounded-xl px-3 py-2 shadow-2xs gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-xs font-black text-rose-800 dark:text-rose-300">{item.sku}</span>
                                <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 rounded border border-rose-300 dark:border-rose-800">
                                  Lebih dari SJ (+{item.selisih})
                                </span>
                                {item.size && item.size !== '-' && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded">
                                    {item.size}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5 font-medium">
                                {item.nama_produk}
                                <span className="ml-1.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                  (SJ: {item.qty_sj} · Scan: {item.qty_scan})
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleManualQty(item.sku, item.qty_scan - 1)}
                                  className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-900 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Kurangi qty scan"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <span className="font-bold text-xs text-rose-700 dark:text-rose-300 w-8 text-center">
                                  {item.qty_scan}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleManualQty(item.sku, item.qty_scan + 1)}
                                  className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-900 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Tambah qty scan"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleManualQty(item.sku, item.qty_sj)}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
                                title={`Kembalikan ke Qty SJ (${item.qty_sj})`}
                              >
                                = {item.qty_sj}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                          <th className="text-left px-3.5 py-3 font-extrabold min-w-[200px]">Nama Produk</th>
                          <th className="text-center px-2 py-3 font-extrabold w-16">Size</th>
                          <th className="text-left px-3 py-3 font-extrabold min-w-[140px]">SKU</th>
                          <th className="text-center px-3 py-3 font-extrabold w-20">Qty SJ</th>
                          <th className="text-center px-3 py-3 font-extrabold w-32">Qty Scan</th>
                          <th className="text-center px-3 py-3 font-extrabold w-20">Selisih</th>
                          <th className="text-center px-3 py-3 font-extrabold w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {comparisonData.filter(item => {
                          if (detailFilter === 'ALL') return true;
                          if (detailFilter === 'COCOK') return item.status === 'COCOK';
                          if (detailFilter === 'SELISIH') return item.status === 'KURANG' || item.status === 'LEBIH';
                          return true;
                        }).map(item => (
                          <tr
                            key={item.sku}
                            className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${item.status === 'COCOK' ? 'bg-emerald-50/40 dark:bg-emerald-950/10' :
                                item.status === 'KURANG' ? 'bg-rose-50/40 dark:bg-rose-950/10' :
                                  item.status === 'LEBIH' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                              }`}
                          >
                            {/* 1. Nama Produk */}
                            <td className="px-3.5 py-3 min-w-[200px] align-middle">
                              <div className="font-bold text-slate-900 dark:text-slate-100 text-xs leading-snug break-words">
                                {item.nama_produk}
                              </div>
                            </td>

                            {/* 2. Size */}
                            <td className="px-2 py-3 text-center align-middle w-16">
                              <span className="inline-block px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {(() => {
                                  const lk = lookupProductBySku(item.sku, productCatalog, item.nama_produk, item.size);
                                  return lk.found
                                    ? (lk.size || '-')
                                    : (isRealSize(item.size) && !isCorruptedColorCodeSize(item.sku, item.size) && item.size !== 'Default' ? item.size : '-');
                                })()}
                              </span>
                            </td>

                            {/* 3. SKU */}
                            <td className="px-3 py-3 min-w-[140px] align-middle">
                              <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-800/80 px-2 py-1 rounded-md border border-slate-200/80 dark:border-slate-700/80">
                                {item.sku}
                              </span>
                            </td>

                            {/* 4. Qty SJ */}
                            <td className="px-3 py-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200 text-xs align-middle">
                              {item.qty_sj}
                            </td>

                            {/* 5. Qty Scan */}
                            <td className="px-3 py-3 text-center align-middle">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleManualQty(item.sku, item.qty_scan - 1)}
                                  className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-900 text-slate-600 dark:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  value={item.qty_scan}
                                  onFocus={e => e.target.select()}
                                  onChange={e => {
                                    const val = e.target.value;
                                    handleManualQty(item.sku, val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                                  }}
                                  className="w-12 text-center font-mono font-black bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none border border-slate-300 dark:border-slate-600 rounded-lg text-xs py-1 shadow-2xs"
                                  min={0}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleManualQty(item.sku, item.qty_scan + 1)}
                                  className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-slate-600 dark:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            {/* 6. Selisih */}
                            <td className="px-3 py-3 text-center align-middle">
                              <span className={`font-mono font-black text-xs ${item.selisih === 0 ? 'text-emerald-500' :
                                  item.selisih < 0 ? 'text-rose-500' : 'text-amber-500'
                                }`}>
                                {item.selisih > 0 ? `+${item.selisih}` : item.selisih}
                              </span>
                            </td>

                            {/* 7. Status */}
                            <td className="px-3 py-3 text-center align-middle">
                              <StatusBadge status={item.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CATATAN TAMBAHAN (OPSIONAL) */}
                <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    Catatan Pengecekan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={activeDraft.catatan || ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      setDrafts(prev => prev.map(d => d.id === activeDraft.id ? { ...d, catatan: text } : d));
                    }}
                    placeholder="Contoh: Kondisi fisik barang rapi, dus luar ada sedikit sobek..."
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:border-primary-500"
                  />
                </div>

                {/* SUBMIT ke Database (STATUS PENDING) */}
                <div className={`rounded-2xl border-2 p-4 ${summary.has_selisih
                    ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800'
                    : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                  }`}>
                  <div className="flex items-start gap-2 mb-3">
                    {summary.has_selisih
                      ? <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                      : <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />}
                    <div>
                      <div className={`text-sm font-bold ${summary.has_selisih ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                        {summary.has_selisih
                          ? `Terdapat ${summary.kurang + summary.lebih + summary.unexpectedCount} SKU berselisih.`
                          : 'Semua barang cocok dengan Surat Jalan ✓'}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 mb-2">
                        Keseluruhan data per baris produk akan ditulis ke Database.
                      </p>

                      {summary.has_selisih && (
                        <div className="flex items-center gap-2 flex-wrap mt-2">
                          {summary.kurang > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const kurangItems = comparisonData
                                  .filter(it => it.status === 'KURANG')
                                  .map(it => ({
                                    sku: it.sku,
                                    nama_produk: it.nama_produk,
                                    size: it.size,
                                    qty_sj: it.qty_sj,
                                    qty_scan: it.qty_scan,
                                    selisih: it.selisih,
                                  }));
                                setSelisihWaModalParams({
                                  no_sj: activeDraft.no_sj,
                                  destination: activeDraft.destination,
                                  source: activeDraft.source,
                                  tanggal_sj: activeDraft.tanggal_sj,
                                  items: kurangItems,
                                  productCatalog,
                                  type: 'kurang',
                                });
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#1DA851] text-white text-[11px] font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
                              title="Kirim laporan selisih kurang via Bot Fonnte atau WhatsApp Web"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Share ke WA (Selisih Kurang)
                            </button>
                          )}

                          {(summary.lebih > 0 || summary.unexpectedCount > 0) && (
                            <button
                              type="button"
                              onClick={() => {
                                const regularLebih = comparisonData
                                  .filter(it => it.status === 'LEBIH')
                                  .map(it => ({
                                    sku: it.sku,
                                    nama_produk: it.nama_produk,
                                    size: it.size,
                                    qty_sj: it.qty_sj,
                                    qty_scan: it.qty_scan,
                                    selisih: it.selisih,
                                  }));

                                const unexpectedLebih = Object.entries(activeDraft.unexpected || {}).map(([sku, val]) => ({
                                  sku,
                                  nama_produk: resolveProductName(sku, val.nama),
                                  size: resolveProductDisplaySize(sku, (val as any).size) || 'Default',
                                  qty_sj: 0,
                                  qty_scan: val.qty,
                                  selisih: val.qty,
                                  is_unexpected: true,
                                }));

                                setSelisihWaModalParams({
                                  no_sj: activeDraft.no_sj,
                                  destination: activeDraft.destination,
                                  source: activeDraft.source,
                                  tanggal_sj: activeDraft.tanggal_sj,
                                  items: [...regularLebih, ...unexpectedLebih],
                                  productCatalog,
                                  type: 'lebih',
                                });
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
                              title="Kirim laporan selisih lebih via Bot Fonnte atau WhatsApp Web"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Share ke WA (Selisih Lebih)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-3 mt-2 p-3 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tentukan Status Surat Jalan:</label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="submitStatus"
                          value="pending"
                          checked={submitStatus === 'pending'}
                          onChange={() => setSubmitStatus('pending')}
                          className="w-4 h-4 text-primary-600 border-slate-300 focus:ring-primary-500"
                        />
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">PENDING</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="submitStatus"
                          value="selesai"
                          checked={submitStatus === 'selesai'}
                          onChange={() => setSubmitStatus('selesai')}
                          className="w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded">SELESAI</span>
                      </label>
                    </div>
                  </div>

                  {/* Opsi Eksplisit (Default OFF): Masuk ke Pengiriman Store > Dispatched */}
                  {submitStatus === 'selesai' && isPengirimanTypeRecord(activeDraft) && (
                    <label className="flex items-start gap-2.5 mb-4 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/60 dark:bg-indigo-950/25 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sendToDispatchedOnSubmit}
                        onChange={(e) => setSendToDispatchedOnSubmit(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                          Sekaligus masukkan ke antrean Pengiriman Store &gt; Dispatched
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          Opsional (default nonaktif). Jika dicentang, fisik scan ({summary.total_scan + summary.total_unexpected_qty} pcs · Est. ~{estimateKoliFromPcs(summary.total_scan + summary.total_unexpected_qty, ESTIMATED_PCS_PER_KOLI)} Koli) langsung masuk antrean Dispatched. Jika tidak dicentang, Anda dapat mengirimnya kapan saja dari tab Riwayat &gt; SELESAI.
                        </div>
                      </div>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={handleSubmitPengecekan}
                    disabled={submitting}
                    className="w-full py-3.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all shadow-md shadow-primary-500/20 cursor-pointer"
                  >
                    {submitting ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Menyimpan ke Database...</>
                    ) : (
                      <><Send className="w-4 h-4" /> Submit Pengecekan ke Database</>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* EMPTY STATE APABILA ANTREAN KOSONG */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/10 to-primary-500/5 border border-primary-500/20 flex items-center justify-center mb-4">
                  <FileText className="w-10 h-10 text-primary-400" />
                </div>
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Antrean Pengecekan Kosong
                </h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  Import satu atau beberapa file CSV Surat Jalan untuk memulai antrean pekerjaan. Sistem akan otomatis memisahkan per No SJ.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-primary-500/20 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Import CSV Sekarang
                </button>
              </div>
            )}
          </>
        )}

        {/* ======================================================== */}
        {/* TAB 2: RIWAYAT PENGECEKAN (PENGGANTI REKAP PENERIMAAN)    */}
        {/* ======================================================== */}
        {activeTab === 'riwayat' && (
          <div className="space-y-3">
            {/* SUB-TAB TIPE: SEMUA vs PENERIMAAN vs PENGIRIMAN */}
            <div className="bg-white dark:bg-[#131d31] p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
                <button
                  type="button"
                  id="btn-riwayat-semua"
                  onClick={() => setRiwayatTypeFilter('ALL')}
                  className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer select-none shrink-0 ${riwayatTypeFilter === 'ALL'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Semua Riwayat</span>
                  <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${riwayatTypeFilter === 'ALL' ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                    {riwayatCounts.all}
                  </span>
                </button>

                <button
                  type="button"
                  id="btn-riwayat-penerimaan"
                  onClick={() => setRiwayatTypeFilter('PENERIMAAN')}
                  className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer select-none shrink-0 ${riwayatTypeFilter === 'PENERIMAAN'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                      : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                    }`}
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>Penerimaan / Mutasi Masuk</span>
                  <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${riwayatTypeFilter === 'PENERIMAAN' ? 'bg-white/20 text-white' : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                    }`}>
                    {riwayatCounts.penerimaan}
                  </span>
                </button>

                <button
                  type="button"
                  id="btn-riwayat-pengiriman"
                  onClick={() => setRiwayatTypeFilter('PENGIRIMAN')}
                  className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer select-none shrink-0 ${riwayatTypeFilter === 'PENGIRIMAN'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                      : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                    }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Pengiriman / Transfer Toko</span>
                  <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${riwayatTypeFilter === 'PENGIRIMAN' ? 'bg-white/20 text-white' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    }`}>
                    {riwayatCounts.pengiriman}
                  </span>
                </button>
              </div>
            </div>

            {/* HEADER FILTER & STATS */}
            <div className="bg-white dark:bg-[#131d31] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    placeholder="Cari No SJ, Asal, Tujuan, atau SKU..."
                    className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:border-primary-500"
                  />
                </div>

                {/* Status Filter Buttons */}
                <div className="flex items-center gap-1 flex-wrap">
                  {(['ALL', 'PENDING', 'SELESAI', 'COCOK', 'SELISIH'] as const).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${statusFilter === st
                          ? 'bg-primary-500 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                    >
                      {st === 'ALL' ? 'Semua' : st}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={loadRecords}
                    className="px-2 py-1.5 flex items-center gap-1 text-slate-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-all cursor-pointer ml-1 text-xs font-medium"
                    title="Refresh delta (hanya data baru)"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={forceReloadRecords}
                    className="px-2 py-1.5 flex items-center gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-900/20 rounded-lg transition-all cursor-pointer text-xs font-medium"
                    title="Muat ulang SEMUA data dari awal (reset cache lokal)"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingRecords ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Muat Ulang Penuh</span>
                  </button>
                </div>
              </div>

              {/* FILTER ASAL, TUJUAN, TANGGAL & SORTING */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 items-center">
                {/* Filter Asal (Multi-Select Dropsearch) */}
                <div className="lg:col-span-3">
                  <MultiSelectDropsearch
                    label="Asal"
                    options={asalOptions}
                    selected={sourceFilter}
                    onChange={setSourceFilter}
                    searchPlaceholder="Cari asal..."
                  />
                </div>

                {/* Filter Tujuan (Multi-Select Dropsearch) */}
                <div className="lg:col-span-3">
                  <MultiSelectDropsearch
                    label="Tujuan"
                    options={tujuanOptions}
                    selected={destinationFilter}
                    onChange={setDestinationFilter}
                    searchPlaceholder="Cari tujuan..."
                  />
                </div>

                {/* Filter Tanggal (Dari - Sampai) */}
                <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      aria-label="Dari Tanggal"
                      title="Dari Tanggal SJ"
                      value={dateFromFilter}
                      onChange={(e) => setDateFromFilter(e.target.value)}
                      className="w-full text-xs pl-8 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">s/d</span>
                  <div className="relative flex-1 min-w-0">
                    <input
                      type="date"
                      aria-label="Sampai Tanggal"
                      title="Sampai Tanggal SJ"
                      value={dateToFilter}
                      onChange={(e) => setDateToFilter(e.target.value)}
                      className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                {/* Sort Asal / Tujuan / Tanggal + Reset */}
                <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      aria-label="Urutkan Riwayat"
                      value={riwayatSortBy}
                      onChange={(e) => setRiwayatSortBy(e.target.value as any)}
                      className="w-full text-xs pl-8 pr-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-primary-500 font-semibold"
                    >
                      <option value="tanggal_desc">Urut: Tanggal Terbaru</option>
                      <option value="tanggal_asc">Urut: Tanggal Terlama</option>
                      <option value="asal_asc">Urut: Asal (A → Z)</option>
                      <option value="asal_desc">Urut: Asal (Z → A)</option>
                      <option value="tujuan_asc">Urut: Tujuan (A → Z)</option>
                      <option value="tujuan_desc">Urut: Tujuan (Z → A)</option>
                    </select>
                  </div>
                  {hasActiveRiwayatFilters && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchFilter('');
                        setStatusFilter('ALL');
                        setShippingSubTab('ALL');
                        setSourceFilter([]);
                        setDestinationFilter([]);
                        setDateFromFilter('');
                        setDateToFilter('');
                      }}
                      title="Reset semua filter"
                      className="px-2.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">Reset</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* SUB-TAB STATUS PENGIRIMAN KHUSUS TAB SELESAI (BELUM JADWAL | DISPATCHED | TERKIRIM | BATAL KIRIM) */}
            {statusFilter === 'SELESAI' && riwayatTypeFilter !== 'PENERIMAAN' && (
              <div className="bg-white dark:bg-[#131d31] px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-indigo-500" />
                    Status Pengiriman SJ Selesai
                  </span>
                  <span className="text-[10px] text-slate-400 hidden sm:inline">
                    Pilih SJ untuk kirim ke Dispatched atau pindahkan arsip SJ lama ke Terkirim
                  </span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap pb-0.5">
                  {([
                    { id: 'ALL', label: 'Semua Selesai', count: selesaiShippingCounts.all },
                    { id: 'belum_jadwal', label: 'Belum Jadwal Kirim', count: selesaiShippingCounts.belum_jadwal },
                    { id: 'dispatched', label: 'Dispatched', count: selesaiShippingCounts.dispatched },
                    { id: 'terkirim', label: 'Terkirim', count: selesaiShippingCounts.terkirim },
                    { id: 'batal_kirim', label: 'Batal Kirim', count: selesaiShippingCounts.batal_kirim },
                  ] as const).map((tab) => {
                    const active = shippingSubTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setShippingSubTab(tab.id);
                          setSelectedRecords(new Set());
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] font-bold ${
                            active
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BULK ACTIONS (MULTI-SELECT, SELECT ALL / UNSELECT, KIRIM DISPATCHED & STATUS) */}
            {(userIsAdmin || canAction) && filteredRecords.length > 0 && (
              <div className="flex flex-col gap-2.5 px-3 py-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedRecords.size > 0 && selectedRecords.size === filteredRecords.length}
                        ref={input => {
                          if (input) {
                            input.indeterminate = selectedRecords.size > 0 && selectedRecords.size < filteredRecords.length;
                          }
                        }}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRecords(new Set(filteredRecords.map(r => r.id)));
                          } else {
                            setSelectedRecords(new Set());
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {selectedRecords.size > 0 ? `${selectedRecords.size} / ${filteredRecords.length} Dipilih` : `Pilih Semua (${filteredRecords.length})`}
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedRecords(new Set(filteredRecords.map(r => r.id)))}
                        disabled={selectedRecords.size === filteredRecords.length}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                      >
                        Select All
                      </button>
                      {selectedRecords.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedRecords(new Set())}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                        >
                          Unselect
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const targetRecords = selectedRecords.size > 0
                          ? filteredRecords.filter(r => selectedRecords.has(r.id) && r.items && r.items.length > 0)
                          : filteredRecords.filter(r => r.items && r.items.length > 0);
                        if (targetRecords.length === 0) {
                          onShowToast('Pilih minimal 1 Surat Jalan yang memiliki item untuk Format Picking Massal.', 'warning');
                          return;
                        }
                        const mappedDrafts: PengecekanSJDraft[] = targetRecords.map(rec => ({
                          id: rec.id || `${rec.no_sj}___${rec.source}___${rec.destination}`,
                          no_sj: rec.no_sj,
                          source: rec.source,
                          destination: rec.destination,
                          tanggal_sj: rec.tanggal_sj,
                          tipe_import: rec.tipe_import || (rec.destination?.toLowerCase().includes('warehouse') ? 'Penerimaan' : 'Pengiriman') || 'Pengiriman',
                          file_name: `SJ-${rec.no_sj}`,
                          items: rec.items.map(i => ({
                            sku: i.sku,
                            nama_produk: i.nama_produk,
                            category: i.category,
                            qty_sj: i.qty_sj || i.qty_scan || 1,
                          })),
                          scanQty: {},
                          unexpected: {},
                          status: 'draft',
                          created_at: rec.created_at,
                          updated_at: rec.updated_at || new Date().toISOString(),
                        }));
                        setPickingModalInitialTab('app');
                        setPickingModalDraft(null);
                        setPickingModalDrafts(mappedDrafts);
                      }}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Kirim Tugas Picking Massal untuk SJ terpilih (atau semua SJ yang tampil)"
                    >
                      <Send className="w-3 h-3 text-emerald-600" />
                      Picking ({selectedRecords.size > 0 ? selectedRecords.size : filteredRecords.length})
                    </button>

                    {userIsAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleBulkUpdateStatus('pending')}
                          disabled={isBulkUpdating || selectedRecords.size === 0}
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40"
                        >
                          {isBulkUpdating && bulkStatusAction === 'pending' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Edit3 className="w-3 h-3 text-blue-600" />}
                          Set PENDING
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBulkUpdateStatus('selesai')}
                          disabled={isBulkUpdating || selectedRecords.size === 0}
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40"
                        >
                          {isBulkUpdating && bulkStatusAction === 'selesai' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                          Set SELESAI
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* BARIS AKSI PENGIRIMAN EKSPLISIT (UNTUK TAB SELESAI / SJ PENGIRIMAN TERPILIH) */}
                {(statusFilter === 'SELESAI' || selectedRecords.size > 0) && riwayatTypeFilter !== 'PENERIMAAN' && (() => {
                  const selectedList = filteredRecords.filter((r) => selectedRecords.has(r.id));
                  const selectedSelesaiPengiriman = selectedList.filter(
                    (r) => r.status === 'selesai' && isPengirimanTypeRecord(r)
                  );
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/70">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>
                          Aksi Pengiriman Store ({selectedSelesaiPengiriman.length} SJ Pengiriman Selesai dipilih)
                        </span>
                      </span>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={isBulkShippingAction || selectedSelesaiPengiriman.length === 0}
                          onClick={() => void handleSendRecordsToDispatched(selectedSelesaiPengiriman)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-all"
                          title="Kirim SJ Pengiriman Selesai terpilih ke Pengiriman Store > Dispatched (gabung otomatis jika No SJ sama)"
                        >
                          {isBulkShippingAction ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                          <span>Kirim ke Dispatched ({selectedSelesaiPengiriman.length})</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBulkShippingAction || selectedSelesaiPengiriman.length === 0}
                          onClick={() => void handleBulkSetShippingOverride(selectedSelesaiPengiriman, 'terkirim')}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 transition-all"
                          title="Tandai SJ lama sebagai Terkirim di Pengecekan SJ (tanpa membuat trip di Pengiriman Store)"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Pindah ke Terkirim</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBulkShippingAction || selectedSelesaiPengiriman.length === 0}
                          onClick={() => void handleBulkSetShippingOverride(selectedSelesaiPengiriman, 'batal_kirim')}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 transition-all"
                          title="Tandai SJ sebagai Batal Kirim (menarik keluar dari Dispatched jika ada)"
                        >
                          <X className="w-3 h-3 text-rose-500" />
                          <span>Batal Kirim</span>
                        </button>

                        {shippingSubTab !== 'belum_jadwal' && (
                          <button
                            type="button"
                            disabled={isBulkShippingAction || selectedSelesaiPengiriman.length === 0}
                            onClick={() => void handleBulkSetShippingOverride(selectedSelesaiPengiriman, null)}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-40 transition-all"
                            title="Kembalikan ke Belum Jadwal Kirim"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Belum Jadwal</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* RECORD LIST */}
            {loadingRecords && filteredRecords.length > 0 && (
              <div className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Menyinkronkan seluruh riwayat pengecekan SJ dari server...</span>
              </div>
            )}

            {loadingRecords && filteredRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <RefreshCw className="w-7 h-7 animate-spin text-primary-500" />
                <span className="text-sm font-medium">Memuat seluruh riwayat pengecekan...</span>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                <Package className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                {records.length > 0 ? (
                  <>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      Tidak ada Surat Jalan yang cocok dengan filter saat ini
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Terdapat {records.length} SJ tersimpan. Coba ganti tab tipe atau reset kata kunci pencarian.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRiwayatTypeFilter('ALL');
                        setStatusFilter('ALL');
                        setShippingSubTab('ALL');
                        setSearchFilter('');
                        setSourceFilter([]);
                        setDestinationFilter([]);
                        setDateFromFilter('');
                        setDateToFilter('');
                      }}
                      className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                    >
                      Tampilkan Semua ({records.length} SJ)
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Belum ada data riwayat pengecekan</p>
                    <p className="text-xs text-slate-400 mt-1">Submit pengecekan di tab Pengecekan Barang untuk mencatat ke riwayat.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRecords.map((rec) => {
                  const isExpanded = expandedRow === rec.id;
                  const isEditing = editingRecordId === rec.id;
                  const isPengirimanRec = isPengirimanTypeRecord(rec);
                  const shipStatus = rec.status === 'selesai' && isPengirimanRec ? getRecordShippingStatus(rec) : null;
                  const liveDispatchRep = shipStatus === 'dispatched' ? noSjReportMap.get(rec.no_sj.trim().toUpperCase()) : undefined;

                  return (
                    <div
                      key={rec.id}
                      className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs"
                    >
                      {/* ROW HEADER */}
                      <div
                        className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {(userIsAdmin || canAction) && (
                          <div className="shrink-0 flex items-start pt-1 pr-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedRecords.has(rec.id)}
                              onChange={(e) => {
                                const newSet = new Set(selectedRecords);
                                if (e.target.checked) newSet.add(rec.id);
                                else newSet.delete(rec.id);
                                setSelectedRecords(newSet);
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 cursor-pointer"
                            />
                          </div>
                        )}
                        <div
                          className="shrink-0 cursor-pointer pt-2"
                          onClick={() => {
                            if (!isEditing) setExpandedRow(isExpanded ? null : rec.id);
                          }}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full ${rec.status === 'pending' ? 'bg-blue-500' :
                              rec.status_komparasi === 'COCOK' ? 'bg-emerald-500' : 'bg-rose-500'
                            }`} />
                        </div>

                        <div
                          className="flex-1 min-w-0 cursor-pointer flex flex-col gap-1.5"
                          onClick={() => {
                            if (!isEditing) setExpandedRow(isExpanded ? null : rec.id);
                          }}
                        >
                          {/* ROW 1: NO SJ & BADGES */}
                          <div className="flex items-start justify-between gap-1.5 flex-wrap sm:flex-nowrap">
                            <span className="text-[13px] sm:text-sm font-black text-slate-800 dark:text-white font-mono shrink-0">{rec.no_sj}</span>
                            <div className="flex gap-1 flex-wrap justify-end">
                              {rec.tipe_import && (
                                <span className={`inline-flex items-center justify-center text-[10px] font-extrabold px-2 py-0.5 rounded-full ${rec.tipe_import === 'Penerimaan'
                                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                  }`}>
                                  {rec.tipe_import}
                                </span>
                              )}
                              <StatusBadge status={rec.status_komparasi} />
                              {rec.status === 'pending' && (
                                <span className="inline-flex items-center justify-center text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                  PENDING
                                </span>
                              )}
                              {shipStatus === 'belum_jadwal' && (
                                <span className="inline-flex items-center justify-center text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  Belum Jadwal Kirim
                                </span>
                              )}
                              {shipStatus === 'dispatched' && (
                                <span className="inline-flex items-center justify-center text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  Dispatched{liveDispatchRep ? ` · ${liveDispatchRep.total_koli} Koli` : ''}
                                </span>
                              )}
                              {shipStatus === 'terkirim' && (
                                <span className="inline-flex items-center justify-center text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  Terkirim
                                </span>
                              )}
                              {shipStatus === 'batal_kirim' && (
                                <span className="inline-flex items-center justify-center text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                  Batal Kirim
                                </span>
                              )}
                              {rec.sync_status === 'pending_sync' && (
                                <span className="inline-flex items-center justify-center text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-700 gap-1">
                                  <CloudOff className="w-2.5 h-2.5" />
                                  Offline
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ROW 2: SOURCE->DEST & QTY */}
                          <div className="flex items-start justify-between gap-2 mt-0.5">
                            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 leading-snug line-clamp-2">
                              {rec.source || 'Gudang'} <span className="mx-1 text-slate-400 dark:text-slate-600">→</span> {rec.destination || 'Outlet Tujuan'}
                            </div>
                            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 shrink-0 text-right">
                              {rec.total_qty_terima} / {rec.total_qty_sj} pcs
                            </div>
                          </div>

                          {/* ROW 3: DATE/ADMIN & SKU */}
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 min-w-0">
                              <span className="shrink-0">{rec.tanggal_sj}</span>
                              <span className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
                              <span className="truncate">Admin: {rec.submitted_by}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 shrink-0 text-right">
                              {rec.total_sku || rec.items?.length || 0} SKU <span className="hidden sm:inline">· terima / SJ</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-slate-400 pt-0.5">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>

                      {/* EXPANDED DETAIL & ACTIONS */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-800">
                          {/* TOOLBAR AKSI: KIRIM DISPATCHED, KEMBALIKAN KE PENGECEKAN, EDIT, EXPORT, HAPUS */}
                          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* KIRIM KE DISPATCHED SATUAN (UNTUK SJ PENGIRIMAN SELESAI YANG BELUM DI DISPATCHED / TERKIRIM) */}
                              {(userIsAdmin || canAction) &&
                                rec.status === 'selesai' &&
                                isPengirimanRec &&
                                (shipStatus === 'belum_jadwal' || shipStatus === 'batal_kirim') && (
                                  <button
                                    type="button"
                                    disabled={isBulkShippingAction}
                                    onClick={() => void handleSendRecordsToDispatched([rec])}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                                    title="Masukkan SJ ini ke antrean Pengiriman Store > Dispatched"
                                  >
                                    <Truck className="w-3.5 h-3.5" />
                                    Kirim ke Dispatched
                                  </button>
                                )}

                              {/* KEMBALIKAN KE TAB PENGECEKAN */}
                              <button
                                type="button"
                                onClick={() => handleKembalikanKePengecekan(rec)}
                                className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-amber-200 dark:border-amber-800 cursor-pointer"
                                title="Buka kembali SJ ini di tab pengecekan untuk scan ulang"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5 text-amber-500" />
                                Kembalikan ke Tab Pengecekan
                              </button>

                              {/* FORMAT PICKING LANGSUNG DARI RIWAYAT */}
                              {rec.items && rec.items.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const draftFromRec: PengecekanSJDraft = {
                                      id: rec.id || `${rec.no_sj}___${rec.source}___${rec.destination}`,
                                      no_sj: rec.no_sj,
                                      source: rec.source,
                                      destination: rec.destination,
                                      tanggal_sj: rec.tanggal_sj,
                                      tipe_import: rec.tipe_import || (rec.destination?.toLowerCase().includes('warehouse') ? 'Penerimaan' : 'Pengiriman') || 'Pengiriman',
                                      file_name: `SJ-${rec.no_sj}`,
                                      items: rec.items.map(i => ({
                                        sku: i.sku,
                                        nama_produk: i.nama_produk,
                                        category: i.category,
                                        qty_sj: i.qty_sj || i.qty_scan || 1,
                                      })),
                                      scanQty: {},
                                      unexpected: {},
                                      status: 'draft',
                                      created_at: rec.created_at,
                                      updated_at: rec.updated_at || new Date().toISOString(),
                                    };
                                    setPickingModalDraft(draftFromRec);
                                  }}
                                  className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                                  title="Format Picking (Cetak Lembar Kerja, Kirim WA ke Grup, atau Kirim ke Tugas Picking App)"
                                >
                                  <Send className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  Format Picking
                                </button>
                              )}

                              {/* EXPORT DATA SJ INI */}
                              <button
                                type="button"
                                onClick={() => exportPengecekanToCsv([rec], `Pengecekan_SJ_${rec.no_sj}_${rec.tanggal_sj}.csv`, productCatalog)}
                                className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-slate-500" />
                                Export CSV
                              </button>

                              {/* SHARE SELISIH WA */}
                              {rec.items.some(i => i.status_item === 'KURANG' || i.selisih < 0) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelisihWaModalParams({
                                      no_sj: rec.no_sj,
                                      destination: rec.destination,
                                      source: rec.source,
                                      tanggal_sj: rec.tanggal_sj,
                                      items: rec.items,
                                      productCatalog,
                                      type: 'kurang',
                                    });
                                  }}
                                  className="px-3 py-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#1DA851] dark:text-[#25D366] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-[#25D366]/30 cursor-pointer"
                                  title="Share daftar selisih kurang via Bot Fonnte / WhatsApp"
                                >
                                  <Send className="w-3.5 h-3.5 text-[#25D366]" />
                                  Share WA (Kurang)
                                </button>
                              )}

                              {rec.items.some(i => i.status_item === 'LEBIH' || i.selisih > 0) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelisihWaModalParams({
                                      no_sj: rec.no_sj,
                                      destination: rec.destination,
                                      source: rec.source,
                                      tanggal_sj: rec.tanggal_sj,
                                      items: rec.items,
                                      productCatalog,
                                      type: 'lebih',
                                    });
                                  }}
                                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-amber-500/30 cursor-pointer"
                                  title="Share daftar selisih lebih via Bot Fonnte / WhatsApp"
                                >
                                  <Send className="w-3.5 h-3.5 text-amber-500" />
                                  Share WA (Lebih)
                                </button>
                              )}
                            </div>

                            {/* ADMIN ACTIONS: EDIT & HAPUS */}
                            {userIsAdmin && (
                              <div className="flex items-center gap-2">
                                {!isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(rec)}
                                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-blue-200 dark:border-blue-800 cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={handleSaveEdit}
                                      disabled={savingEdit}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                    >
                                      {savingEdit ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                      Simpan
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRecordId(null);
                                        setEditFormData(null);
                                        setEditWasDispatched(false);
                                        setEditRequeueDispatched(false);
                                      }}
                                      className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteRecord(rec)}
                                  disabled={deletingId === rec.id}
                                  className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-rose-200 dark:border-rose-800 cursor-pointer disabled:opacity-50"
                                >
                                  {deletingId === rec.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>

                          {/* EDIT METADATA FORM (JIKA SEDANG EDIT) */}
                          {isEditing && editFormData && (
                            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-900 space-y-2.5">
                              {editWasDispatched && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                  <span>
                                    Status Dispatched SJ ini sedang dinonaktifkan sementara selama edit. Centang opsi di bawah jika ingin memasukkannya kembali ke Dispatched saat Simpan.
                                  </span>
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Status SJ</label>
                                  <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 h-[26px]">
                                    <label className="flex items-center gap-1 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`status-${editFormData.id}`}
                                        value="pending"
                                        checked={editFormData.status === 'pending'}
                                        onChange={() => {
                                          setEditFormData({ ...editFormData, status: 'pending' });
                                          setEditRequeueDispatched(false);
                                        }}
                                        className="w-3 h-3 text-blue-600 border-slate-300 focus:ring-blue-500"
                                      />
                                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">PENDING</span>
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`status-${editFormData.id}`}
                                        value="selesai"
                                        checked={editFormData.status === 'selesai'}
                                        onChange={() => setEditFormData({ ...editFormData, status: 'selesai' })}
                                        className="w-3 h-3 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                                      />
                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">SELESAI</span>
                                    </label>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Asal (Source)</label>
                                  <input
                                    type="text"
                                    value={editFormData.source}
                                    onChange={e => setEditFormData({ ...editFormData, source: e.target.value })}
                                    className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                                  />
                                </div>

                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Tujuan (Destination)</label>
                                  <input
                                    type="text"
                                    value={editFormData.destination}
                                    onChange={e => setEditFormData({ ...editFormData, destination: e.target.value })}
                                    className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                                  />
                                </div>

                                <div>
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Catatan</label>
                                  <input
                                    type="text"
                                    value={editFormData.catatan || ''}
                                    onChange={e => setEditFormData({ ...editFormData, catatan: e.target.value })}
                                    className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                                  />
                                </div>
                              </div>

                              {editFormData.status === 'selesai' &&
                                isPengirimanTypeRecord(editFormData) &&
                                noSjReportMap.get(editFormData.no_sj.trim().toUpperCase())?.status !== 'sent' && (
                                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={editRequeueDispatched}
                                      onChange={(e) => setEditRequeueDispatched(e.target.checked)}
                                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                                    />
                                    <span className="text-xs font-bold text-indigo-800 dark:text-indigo-200">
                                      {editWasDispatched
                                        ? 'Masukkan kembali ke antrean Pengiriman Store > Dispatched saat Simpan'
                                        : 'Masukkan ke antrean Pengiriman Store > Dispatched saat Simpan (opsional)'}
                                    </span>
                                  </label>
                                )}
                            </div>
                          )}

                          {/* TABEL KOMPARASI LENGKAP */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px]">
                                  <th className="text-left px-3 py-2 font-extrabold min-w-[200px]">Nama Produk</th>
                                  <th className="text-center px-2 py-2 font-extrabold w-16">Size</th>
                                  <th className="text-left px-3 py-2 font-extrabold min-w-[130px]">SKU</th>
                                  <th className="text-center px-3 py-2 font-extrabold w-16">SJ</th>
                                  <th className="text-center px-3 py-2 font-extrabold w-24">Terima</th>
                                  <th className="text-center px-3 py-2 font-extrabold w-16">Selisih</th>
                                  <th className="text-center px-3 py-2 font-extrabold w-20">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {(isEditing && editFormData ? editFormData.items : rec.items).length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                                      Belum ada rincian item SKU pada surat jalan ini.
                                    </td>
                                  </tr>
                                ) : (
                                  (isEditing && editFormData ? editFormData.items : rec.items).map((item, i) => {
                                    const selisih = item.qty_scan - item.qty_sj;
                                    return (
                                      <tr
                                        key={`${item.sku}-${i}`}
                                        className={
                                          item.status_item === 'COCOK' ? 'bg-emerald-50/30 dark:bg-emerald-950/10' :
                                            item.status_item === 'KURANG' ? 'bg-rose-50/30 dark:bg-rose-950/10' :
                                              item.status_item === 'LEBIH' ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                                        }
                                      >
                                        {/* 1. Nama Produk */}
                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100 min-w-[200px] align-middle">
                                          <div className="font-bold text-xs leading-snug break-words">
                                            {resolveProductName(item.sku, item.nama_produk)}
                                          </div>
                                          {item.category && (
                                            <div className="text-[9.5px] text-slate-400 font-normal truncate mt-0.5">{item.category}</div>
                                          )}
                                        </td>
                                        {/* 2. Size */}
                                        <td className="px-2 py-2 text-center align-middle w-16">
                                          <span className="inline-block px-1.5 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                                            {(() => {
                                              const lk = lookupProductBySku(item.sku, productCatalog, item.nama_produk, item.size);
                                              return lk.found ? (lk.size || '-')
                                                : (isRealSize(item.size) && !isCorruptedColorCodeSize(item.sku, item.size) && item.size !== 'Default' ? item.size : '-');
                                            })()}
                                          </span>
                                        </td>
                                        {/* 3. SKU */}
                                        <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300 font-bold min-w-[130px] align-middle">
                                          <span className="bg-slate-100/70 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-200/80 dark:border-slate-700/80 inline-block">
                                            {item.sku}
                                          </span>
                                          {item.is_unexpected && (
                                            <span className="block text-[8.5px] text-amber-600 font-sans font-extrabold mt-0.5">LEBIHAN DI LUAR SJ</span>
                                          )}
                                        </td>
                                        {/* 4. Qty SJ */}
                                        <td className="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300">
                                          {item.qty_sj}
                                        </td>
                                        <td className="px-3 py-2 text-center font-bold">
                                          {isEditing && editFormData ? (
                                            <input
                                              type="number"
                                              value={item.qty_scan}
                                              onFocus={e => e.target.select()}
                                              onChange={e => {
                                                const raw = e.target.value;
                                                const newQty = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                                                const newItems = [...editFormData.items];
                                                newItems[i] = {
                                                  ...newItems[i],
                                                  qty_scan: newQty,
                                                  selisih: newQty - newItems[i].qty_sj,
                                                  status_item: (newQty - newItems[i].qty_sj) === 0 ? 'COCOK' : (newQty - newItems[i].qty_sj) < 0 ? 'KURANG' : 'LEBIH',
                                                };
                                                setEditFormData({ ...editFormData, items: newItems });
                                              }}
                                              className="w-14 text-center font-bold px-1 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs"
                                              min={0}
                                            />
                                          ) : (
                                            item.qty_scan
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <span className={`font-extrabold ${selisih === 0 ? 'text-emerald-500' :
                                              selisih < 0 ? 'text-rose-500' : 'text-amber-500'
                                            }`}>
                                            {selisih > 0 ? `+${selisih}` : selisih}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <StatusBadge status={item.status_item} />
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* MODAL PILIHAN FORMAT DISTRIBUSI PICKING UNTUK TIPE PENGIRIMAN */}
        <DistribusiPickingModal
          isOpen={Boolean(pickingModalDraft || pickingModalDrafts.length > 0)}
          onClose={() => {
            setPickingModalDraft(null);
            setPickingModalDrafts([]);
          }}
          draft={pickingModalDraft}
          drafts={pickingModalDrafts.length > 0 ? pickingModalDrafts : undefined}
          initialTab={pickingModalInitialTab}
          productCatalog={productCatalog || []}
          session={session}
          onNotify={onShowToast}
          onSuccessSentToApp={(draftId, invoicePicking) => {
            setDrafts(prev => {
              const updated = prev.map(d => {
                if (d.id !== draftId) return d;
                const tag = invoicePicking ? `[Tugas Picking App Terkirim: ${invoicePicking}]` : '[Tugas Picking App Terkirim]';
                const cleanExisting = (d.catatan || '').replace(/\[Tugas Picking App Terkirim[^\]]*\]/g, '').trim();
                return { ...d, catatan: `${cleanExisting} ${tag}`.trim() };
              });
              saveSJDrafts(updated);
              return updated;
            });
          }}
        />

        {/* MODAL LAPORAN SELISIH WA (KIRIM BOT FONNTE / WA WEB / COPY) */}
        <DistribusiSelisihWaModal
          isOpen={Boolean(selisihWaModalParams)}
          onClose={() => setSelisihWaModalParams(null)}
          params={selisihWaModalParams}
          productCatalog={productCatalog || []}
          onNotify={onShowToast}
        />

        {/* BULK SUBMIT CONFIRMATION MODAL */}
        {bulkSubmitModal && (
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                      Submit Sekaligus ({bulkSubmitModal.drafts.length} Surat Jalan)
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      Semua SJ terpilih akan disimpan ke Riwayat & Supabase lalu dipindahkan dari antrean.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkSubmitModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {bulkSubmitModal.drafts.map((d) => {
                    const qtySj = (d.items || []).reduce((s, it) => s + Number(it.qty_sj || 0), 0);
                    const qtyScan =
                      Object.values(d.scanQty || {}).reduce((s, v) => s + Number(v || 0), 0) +
                      Object.values(d.unexpected || {}).reduce((s, v) => s + Number(v?.qty || 0), 0);
                    const isExactMatch =
                      Object.keys(d.unexpected || {}).length === 0 &&
                      (d.items || []).every((it) => (d.scanQty?.[it.sku] ?? 0) === Number(it.qty_sj || 0));

                    return (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {d.no_sj}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {d.source} → {d.destination}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            {qtyScan} / {qtySj} pcs
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isExactMatch
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              }`}
                          >
                            {isExactMatch ? 'COCOK' : 'SELISIH'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Status Simpan Massal:
                  </span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="bulkSubmitStatus"
                        value="pending"
                        checked={bulkSubmitModal.targetStatus === 'pending'}
                        onChange={() =>
                          setBulkSubmitModal((prev) =>
                            prev ? { ...prev, targetStatus: 'pending', sendToDispatched: false } : null
                          )
                        }
                        className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                        PENDING
                      </span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="bulkSubmitStatus"
                        value="selesai"
                        checked={bulkSubmitModal.targetStatus === 'selesai'}
                        onChange={() =>
                          setBulkSubmitModal((prev) => (prev ? { ...prev, targetStatus: 'selesai' } : null))
                        }
                        className="w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                      />
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded">
                        SELESAI
                      </span>
                    </label>
                  </div>
                </div>

                {bulkSubmitModal.targetStatus === 'selesai' &&
                  bulkSubmitModal.drafts.some((d) => isPengirimanTypeRecord(d)) && (
                    <label className="flex items-start gap-2.5 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/60 dark:bg-indigo-950/25 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={bulkSubmitModal.sendToDispatched}
                        onChange={(e) =>
                          setBulkSubmitModal((prev) =>
                            prev ? { ...prev, sendToDispatched: e.target.checked } : null
                          )
                        }
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                          Sekaligus masukkan SJ Pengiriman ke antrean Pengiriman Store &gt; Dispatched
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          Default nonaktif. Jika tidak dicentang, seluruh SJ masuk ke Riwayat &gt; SELESAI &gt; Belum Jadwal Kirim.
                        </div>
                      </div>
                    </label>
                  )}
              </div>

              <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setBulkSubmitModal(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleExecuteBulkSubmit(
                      bulkSubmitModal.drafts,
                      bulkSubmitModal.targetStatus,
                      bulkSubmitModal.sendToDispatched
                    )
                  }
                  className="px-4 py-2 text-xs font-extrabold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit {bulkSubmitModal.drafts.length} SJ ke Database</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM CONFIRMATION MODAL (No window.confirm blocks in iframe/mobile) */}
        {confirmModal && (
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${confirmModal.isDanger
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-primary-500/15 text-primary-600 dark:text-primary-400'
                  }`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    {confirmModal.title}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed whitespace-pre-line">
                    {confirmModal.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const action = confirmModal.onConfirm;
                    setConfirmModal(null);
                    await action();
                  }}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer ${confirmModal.isDanger
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-primary-600 hover:bg-primary-500 text-white'
                    }`}
                >
                  {confirmModal.confirmLabel || 'Ya, Lanjutkan'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Export alias PengecekanSuratJalanView untuk kompatibilitas
export const PengecekanSuratJalanView = DistribusiStoreTab;
export default DistribusiStoreTab;
