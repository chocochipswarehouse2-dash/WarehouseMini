import React, { useState, useEffect, useRef, useDeferredValue } from 'react';
import confetti from 'canvas-confetti';
import {
  Package,
  Search,
  Loader2,
  CheckCircle2,
  ChevronRight,
  ScanBarcode,
  ScanLine,
  Keyboard,
  Barcode,
  CornerDownLeft,
  Zap,
  ArrowLeft,
  AlertTriangle,
  FileText,
  Printer,
  Truck,
  Plus,
  RefreshCw,
  Camera,
  X,
  PlusCircle,
  MinusCircle,
  HelpCircle,
  AlertOctagon,
  Sparkles,
  ClipboardCheck,
  Send,
  SlidersHorizontal,
  Trash2,
  Edit,
  RotateCcw,
  Check,
  ListPlus,
  FileEdit,
  Settings,
  Layers,
  ArrowRightLeft,
  AlignLeft,
  Edit3,
  Save,
  MapPin,
  Building,
  Compass,
  Info,
  Navigation,
} from 'lucide-react';
import { CameraScanner } from './CameraScanner';
import { FulfillmentRefillModal } from './FulfillmentRefillModal';
import { PhysicalScanInput } from './PhysicalScanInput';
import {
  PickingListItem,
  PickingSuratJalanGroup,
  ProductItem,
  RekapStatusType,
  ProductLocationInfo,
  StockRealtimeItem,
} from '../types';
import {
  fetchPickingListFromSupabase,
  completePickingSuratJalanSupabase,
  createPickingSuratJalanSupabase,
  savePickingBatchToSupabase,
  updatePickingSuratJalanDetailsSupabase, deletePickingSuratJalanBatchSupabase, completePickingSuratJalanBatchSupabase,
  fetchStockForSkus,
  isWarehouseLocation,
  getAreaFromLokasi,
  getSupabaseClient,
} from '../services/supabase';
import { globalRealtimeStore } from '../services/store';
import {
  playSuccessBeep,
  playErrorBeep,
  playCategoryBeep,
  playSaveSuccessChime,
  vibrateDevice,
} from '../services/audio';
import { sortAlphabeticalAndSize, fuzzySearchMultiple, fuzzySearch, partialSearchMatch } from '../utils/sortUtils';


interface PickingTasksViewProps {
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  currentUser: string;
  productCatalog?: ProductItem[];
}

export const PickingTasksView: React.FC<PickingTasksViewProps> = React.memo(({
  onNotify,
  currentUser,
  productCatalog = [],
}) => {
  // State: All raw items from Supabase
  const [rawItems, setRawItems] = useState<PickingListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SELESAI'>('ACTIVE');

  // Realtime Stock cache per SKU across all warehouse locations
  const [realtimeSkuStocks, setRealtimeSkuStocks] = useState<Record<string, StockRealtimeItem[]>>({});

  // Active SJ workspace state (when picker gets 1 SJ)
  const [activeSJ, setActiveSJ] = useState<PickingSuratJalanGroup | null>(null);
  const [activeItems, setActiveItems] = useState<PickingListItem[]>([]);
  const [unexpectedItems, setUnexpectedItems] = useState<PickingListItem[]>([]);

  // 2-Phase Scanning State (Fase 1: Tembak Lokasi -> Fase 2: Tembak SKU)
  const [activeLocation, setActiveLocation] = useState<string>('');
  const [recentScans, setRecentScans] = useState<
    Array<{
      id: string;
      time: string;
      type: 'LOCATION' | 'SKU_MATCH' | 'SKU_OVER' | 'SKU_MISMATCH';
      text: string;
      detail: string;
      location: string;
    }>
  >([]);

  // Scanner & Input Modes: 'fisik' | 'manual' | 'kamera'
  const [inputMode, setInputMode] = useState<'fisik' | 'manual' | 'kamera'>('fisik');
  const [scanInput, setScanInput] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Manual Search & Autocomplete States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQty, setSearchQty] = useState(1);
  const [searchLocation, setSearchLocation] = useState('');
  const [searchSelectedProduct, setSearchSelectedProduct] = useState<ProductItem | null>(null);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

  // Batch Multi-Line Text Input States (Like Scanner Format)
  const [batchInputText, setBatchInputText] = useState('');
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Modal Edit / Ubah Form Surat Jalan (Tambah, Edit Qty Target, Hapus SKU, Ubah Tujuan)
  const [isEditSJModalOpen, setIsEditSJModalOpen] = useState(false);
  const [editSjTujuan, setEditSjTujuan] = useState('');
  const [editSjCatatan, setEditSjCatatan] = useState('');
  const [editSjRows, setEditSjRows] = useState<PickingListItem[]>([]);
  const [deletedSjItemIds, setDeletedSjItemIds] = useState<string[]>([]);
  const [newSjSkuInput, setNewSjSkuInput] = useState('');
  const [newSjSkuNama, setNewSjSkuNama] = useState('');
  const [newSjSkuSize, setNewSjSkuSize] = useState('');
  const [newSjSkuLoc, setNewSjSkuLoc] = useState('');
  const [newSjSkuQty, setNewSjSkuQty] = useState(1);
  const [isSavingSjEdit, setIsSavingSjEdit] = useState(false);

  const [selectedSJs, setSelectedSJs] = useState<string[]>([]);
  const [editingSJGroup, setEditingSJGroup] = useState<PickingSuratJalanGroup | null>(null);
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Modal Edit / Koreksi Item Tertentu (Ubah Qty Terambil, Rak Asal, atau Koreksi Salah Ambil)
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [editingItemData, setEditingItemData] = useState<{
    type: 'REGULAR' | 'UNEXPECTED';
    index: number;
    sku: string;
    nama_produk: string;
    size: string;
    qty_req: number;
    qty_picked: number;
    lokasi: string;
    lokasi_picked: string;
    targetSJItemSku?: string;
  } | null>(null);

  // Modal Rekap Penyelesaian
  const [isRekapModalOpen, setIsRekapModalOpen] = useState(false);
  const [rekapCatatan, setRekapCatatan] = useState('');
  const [syncOutLog, setSyncOutLog] = useState(true);
  const [isSubmittingRekap, setIsSubmittingRekap] = useState(false);

  // Modal Detail Rekap untuk SJ yang sudah selesai
  const [viewCompletedSJ, setViewCompletedSJ] = useState<PickingSuratJalanGroup | null>(null);

  // Modal Buat SJ Baru
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSjNumber, setNewSjNumber] = useState('');
  const [newSjTujuan, setNewSjTujuan] = useState('');
  const [newSjRows, setNewSjRows] = useState<
    Array<{ sku: string; nama_produk: string; size: string; lokasi: string; qty_req: number }>
  >([{ sku: '', nama_produk: '', size: '', lokasi: '', qty_req: 1 }]);
  const [isCreatingSj, setIsCreatingSj] = useState(false);

  // Load from Supabase on mount
  useEffect(() => {
    // Check local storage for active offline session
    try {
      const savedSession = localStorage.getItem('wms_active_picking_session');
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.activeSJ) {
          setActiveSJ(parsed.activeSJ);
          setActiveItems(parsed.activeItems || []);
          setUnexpectedItems(parsed.unexpectedItems || []);
          setActiveLocation(parsed.activeLocation || '');
          setRekapCatatan(parsed.rekapCatatan || '');
          onNotify('Sesi Picking offline yang belum selesai berhasil dipulihkan', 'info');
        }
      }
    } catch (e) {
      console.warn('Gagal memulihkan sesi picking lokal:', e);
    }
    loadPickingList();

    // Supabase Realtime via global store
    let debounceTimer: any = null;

    const triggerDebouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadPickingList();
      }, 400);
    };

    const unsub = globalRealtimeStore.subscribe('picking_list', triggerDebouncedSync);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, []);

  // Save active picking session to localStorage to persist across refreshes / offline
  useEffect(() => {
    if (activeSJ) {
      const sessionData = {
        activeSJ,
        activeItems,
        unexpectedItems,
        activeLocation,
        rekapCatatan,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('wms_active_picking_session', JSON.stringify(sessionData));
    } else {
      localStorage.removeItem('wms_active_picking_session');
    }
  }, [activeSJ, activeItems, unexpectedItems, activeLocation, rekapCatatan]);

  // Autofocus scanner input whenever in picking workspace
  useEffect(() => {
    if (activeSJ && !isRekapModalOpen && inputMode === 'fisik') {
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 100);
    }
  }, [activeSJ, isRekapModalOpen, inputMode]);

  const loadPickingList = async () => {
    setLoading(true);
    try {
      const data = await fetchPickingListFromSupabase();
      setRawItems(data || []);
      localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify(data || []));
    } catch (e) {
      console.warn('Gagal memuat picking list, menggunakan cache offline:', e);
      try {
        const cached = JSON.parse(localStorage.getItem('wms_raw_picking_list_cache') || '[]');
        if (cached && cached.length > 0) {
          setRawItems(cached);
          onNotify('Mode Offline: Menampilkan daftar Picking terakhir', 'warning');
        } else {
          onNotify('Gagal memuat picking list dari Database (Offline)', 'error');
        }
      } catch (err) {
        onNotify('Gagal memuat picking list dari Database (Offline)', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper: Extract all locations for a given item / SKU (strictly warehouse area locations)
  const getProductLocations = (sku: string, itemLokasi?: string): ProductLocationInfo[] => {
    const map = new Map<string, ProductLocationInfo>();
    const cleanSku = (sku || '').trim().toUpperCase();

    // 1. Primary from item.lokasi in Surat Jalan (if warehouse location)
    if (itemLokasi && itemLokasi.trim()) {
      const parts = itemLokasi
        .split(/[,/;\n|]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((loc) => loc && isWarehouseLocation(loc));
      parts.forEach((loc, idx) => {
        map.set(loc, {
          lokasi: loc,
          isPrimary: idx === 0,
          source: 'SJ',
        });
      });
    }

    // 2. From productCatalog (only valid warehouse locations)
    const catMatch = productCatalog.find((p) => p.k && p.k.trim().toUpperCase() === cleanSku);
    if (catMatch) {
      if (catMatch.lokasi) {
        const parts = catMatch.lokasi
          .split(/[,/;\n|]+/)
          .map((s) => s.trim().toUpperCase())
          .filter((loc) => loc && isWarehouseLocation(loc));
        parts.forEach((loc, idx) => {
          if (!map.has(loc)) {
            map.set(loc, {
              lokasi: loc,
              isPrimary: map.size === 0 && idx === 0,
              source: 'CATALOG',
            });
          }
        });
      }

      if (Array.isArray(catMatch.locList)) {
        catMatch.locList.forEach((itemLoc, idx) => {
          if (typeof itemLoc === 'string') {
            const loc = itemLoc.trim().toUpperCase();
            if (loc && isWarehouseLocation(loc) && !map.has(loc)) {
              map.set(loc, {
                lokasi: loc,
                isPrimary: map.size === 0 && idx === 0,
                source: 'CATALOG',
              });
            }
          } else if (itemLoc && typeof itemLoc === 'object' && itemLoc.lokasi) {
            const loc = itemLoc.lokasi.trim().toUpperCase();
            if (loc && isWarehouseLocation(loc)) {
              const existing = map.get(loc);
              map.set(loc, {
                lokasi: loc,
                qty: itemLoc.qty !== undefined ? itemLoc.qty : existing?.qty,
                isPrimary: existing?.isPrimary ?? (map.size === 0 && idx === 0),
                source: 'CATALOG',
              });
            }
          }
        });
      }
    }

    // 3. From Realtime Supabase Stock (strictly only warehouse area and locations with available stock)
    const realtimeList = realtimeSkuStocks[cleanSku] || [];
    realtimeList.forEach((stk) => {
      const loc = (stk.lokasi || '').trim().toUpperCase();
      if (loc && isWarehouseLocation(loc, stk.area)) {
        const existing = map.get(loc);
        if (existing) {
          if (stk.sisa_stok !== undefined) existing.qty = stk.sisa_stok;
        } else {
          map.set(loc, {
            lokasi: loc,
            qty: stk.sisa_stok,
            isPrimary: map.size === 0,
            source: 'REALTIME_STOCK',
            area: stk.area
          });
        }
      }
    });

    if (map.size === 0) {
      map.set('A-01', { lokasi: 'A-01', isPrimary: true, source: 'SJ' });
    }

    const allLocs = Array.from(map.values()).filter((l) => isWarehouseLocation(l.lokasi));

    // Sort to prioritize primary location, then descending stock qty
    allLocs.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return (b.qty || 0) - (a.qty || 0);
    });

    return allLocs.length > 0 ? allLocs : [{ lokasi: 'A-01', isPrimary: true, source: 'SJ' }];
  };

  // Fetch realtime inventory by SKUs across warehouse locations whenever active SJ items change
  useEffect(() => {
    if (activeItems.length > 0) {
      const skus = activeItems.map((it) => it.sku).filter(Boolean);
      fetchStockForSkus(skus)
        .then((stocks) => {
          const map: Record<string, StockRealtimeItem[]> = {};
          stocks.forEach((stk) => {
            const key = stk.sku.toUpperCase().trim();
            if (!map[key]) map[key] = [];
            map[key].push(stk);
          });
          setRealtimeSkuStocks(map);
        })
        .catch((err) => console.warn('Gagal memuat stok lokasi realtime:', err));
    }
  }, [activeItems.length, activeSJ?.no_sj]);

  // Group items by no_sj
  const sjGroups: PickingSuratJalanGroup[] = React.useMemo(() => {
    const map = new Map<string, PickingSuratJalanGroup>();

    rawItems.forEach((item) => {
      const sjKey = (item.no_sj || 'NO_SJ').toUpperCase().trim();
      if (!map.has(sjKey)) {
        map.set(sjKey, {
          no_sj: sjKey,
          tanggal: item.tanggal || item.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          tujuan: item.tujuan || 'Marketplace / Store',
          status: item.status || 'PENDING',
          picker_name: item.picker_name || '',
          catatan: item.catatan || '',
          total_items: 0,
          total_qty_req: 0,
          total_qty_picked: 0,
          items: [],
          unexpected_items: [],
        });
      }

      const group = map.get(sjKey)!;
      if (item.is_unexpected || item.qty_req === 0) {
        group.unexpected_items.push(item);
        group.total_qty_picked += Number(item.qty_picked) || 0;
      } else {
        group.items.push(item);
        group.total_items += 1;
        group.total_qty_req += Number(item.qty_req) || 0;
        group.total_qty_picked += Number(item.qty_picked) || 0;
      }

      // Update group overall status
      if (item.status === 'SELESAI') {
        // if all finished
      } else if (item.status === 'SEDANG PICKING') {
        if (group.status !== 'SELESAI') group.status = 'SEDANG PICKING';
      }
    });

    // Evaluate group status based on items
    const result = Array.from(map.values()).map((g) => {
      // Sort items by lokasi (Rack location) to optimize picker route
      g.items.sort((a, b) => {
        const locA = (a.lokasi || '').toUpperCase().trim();
        const locB = (b.lokasi || '').toUpperCase().trim();
        if (locA < locB) return -1;
        if (locA > locB) return 1;
        
        // If same rack, sort by product name/SKU
        const nameA = (a.nama_produk || a.sku || '').toUpperCase().trim();
        const nameB = (b.nama_produk || b.sku || '').toUpperCase().trim();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        
        return 0;
      });

      const isAllDone = g.items.length > 0 && g.items.every((it) => it.status === 'SELESAI');
      const isAnyStarted = g.items.some((it) => it.qty_picked > 0 || it.status === 'SEDANG PICKING');

      if (isAllDone) {
        g.status = 'SELESAI';
      } else if (isAnyStarted) {
        g.status = 'SEDANG PICKING';
      } else {
        g.status = 'PENDING';
      }

      // Evaluate Rekap Status
      let hasKurang = false;
      let hasLebih = false;
      let hasSalah = g.unexpected_items.length > 0;

      g.items.forEach((it) => {
        if (it.qty_picked < it.qty_req) hasKurang = true;
        if (it.qty_picked > it.qty_req) hasLebih = true;
      });

      if (!hasKurang && !hasLebih && !hasSalah && g.total_qty_picked === g.total_qty_req && g.total_qty_req > 0) {
        g.rekap_status = 'SEMUA_PAS';
      } else if (hasSalah && (hasKurang || hasLebih)) {
        g.rekap_status = 'CAMPURAN';
      } else if (hasSalah) {
        g.rekap_status = 'SALAH_AMBIL';
      } else if (hasKurang) {
        g.rekap_status = 'ADA_KURANG';
      } else if (hasLebih) {
        g.rekap_status = 'ADA_LEBIH';
      } else {
        g.rekap_status = 'SEMUA_PAS';
      }

      return g;
    });

    return result;
  }, [rawItems]);

  // Filtered SJ list for display
  const filteredSJs = React.useMemo(() => {
    return sjGroups.filter((g) => {
    let matchSearch = true;
    if (deferredSearch.trim()) {
      matchSearch =
        partialSearchMatch(deferredSearch, g.no_sj, g.tujuan, g.status, g.picker_name, g.catatan) ||
        g.items.some((it) =>
          partialSearchMatch(deferredSearch, it.sku, it.nama_produk, it.size, it.lokasi, it.catatan)
        );
    }

    if (!matchSearch) return false;

    if (statusFilter === 'ACTIVE') {
      return g.status !== 'SELESAI';
    }
    if (statusFilter === 'SELESAI') {
      return g.status === 'SELESAI';
    }
    return true;
    });
  }, [sjGroups, deferredSearch, statusFilter]);

  // Action: Petugas GET 1 SJ (Mulai Picking)

  const handleSelectSJCheckbox = (no_sj: string) => {
    setSelectedSJs((prev) =>
      prev.includes(no_sj) ? prev.filter((id) => id !== no_sj) : [...prev, no_sj]
    );
  };

  const handleSelectAllSJs = () => {
    if (selectedSJs.length === filteredSJs.length) {
      setSelectedSJs([]);
    } else {
      setSelectedSJs(filteredSJs.map((g) => g.no_sj));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedSJs.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Surat Jalan',
      message: `Yakin ingin menghapus ${selectedSJs.length} Surat Jalan yang dipilih?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsBulkActionRunning(true);
        const success = await deletePickingSuratJalanBatchSupabase(selectedSJs);
        if (success) {
          onNotify(`${selectedSJs.length} Surat Jalan berhasil dihapus`, 'success');
          setSelectedSJs([]);
          loadPickingList();
        } else {
          onNotify('Gagal menghapus beberapa Surat Jalan', 'error');
        }
        setIsBulkActionRunning(false);
      }
    });
  };

  const handleMarkCompleteSelected = async () => {
    if (selectedSJs.length === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Selesaikan Surat Jalan',
      message: `Yakin ingin menandai ${selectedSJs.length} Surat Jalan sebagai SELESAI?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsBulkActionRunning(true);
        const success = await completePickingSuratJalanBatchSupabase(selectedSJs, currentUser);
        if (success) {
          onNotify(`${selectedSJs.length} Surat Jalan berhasil diselesaikan`, 'success');
          setSelectedSJs([]);
          loadPickingList();
        } else {
          onNotify('Gagal menyelesaikan beberapa Surat Jalan', 'error');
        }
        setIsBulkActionRunning(false);
      }
    });
  };

  const handlePrintSPS = (group: PickingSuratJalanGroup) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onNotify('Popup terblokir, izinkan popup browser untuk cetak PDF', 'warning');
      return;
    }

    const itemsRows = group.items
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.nama_produk}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${it.size || '-'}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty_req}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1;">${it.lokasi}</td>
      </tr>
    `
      )
      .join('');

    const qrText = encodeURIComponent(`#OUT "Peminjaman Invoice ${group.no_sj}"`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrText}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Surat Peminjaman Sementara - ${group.no_sj}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 16px; }
          .logo-title { font-size: 20px; font-weight: 800; color: #0f172a; }
          .logo-sub { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
          .info-table td { padding: 4px 0; vertical-align: top; }
          .label { width: 160px; color: #64748b; font-weight: 600; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
          .items-table th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 6px; text-align: left; text-transform: uppercase; font-size: 11px; }
          .footer-sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; margin-top: 40px; font-size: 12px; }
          .sign-box { height: 65px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-title">CHOCOCHIPS WMS</div>
            <div class="logo-sub">Surat Peminjaman Sementara (SPS)</div>
          </div>
          <div style="text-align:right;">
            <img src="${qrUrl}" width="80" height="80" alt="QR Code" style="display:block; margin-left:auto;" />
          </div>
        </div>

        <table class="info-table">
          <tr><td class="label">No Peminjaman</td><td><b>${group.no_sj}</b></td></tr>
          <tr><td class="label">Tujuan / PIC</td><td><b>${group.tujuan}</b></td></tr>
          <tr><td class="label">Tanggal Cetak</td><td>${new Date().toLocaleString('id-ID')}</td></tr>
          <tr><td class="label">Status Dokumen</td><td><b style="color:#059669;">${group.status}</b></td></tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:35px; text-align:center;">No</th>
              <th>Nama Produk</th>
              <th style="width:55px; text-align:center;">Size</th>
              <th style="width:110px;">SKU</th>
              <th style="width:45px; text-align:center;">Qty</th>
              <th style="width:110px;">Lokasi</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="footer-sign">
          <div>
            <div>Disiapkan Oleh,</div>
            <div class="sign-box"></div>
            <div>( _________________ )</div>
            <div style="color:#64748b; font-size:10px; margin-top:4px;">Picker</div>
          </div>
          <div>
            <div>Diperiksa Oleh,</div>
            <div class="sign-box"></div>
            <div>( _________________ )</div>
            <div style="color:#64748b; font-size:10px; margin-top:4px;">Checker</div>
          </div>
          <div>
            <div>Diterima Oleh,</div>
            <div class="sign-box"></div>
            <div>( _________________ )</div>
            <div style="color:#64748b; font-size:10px; margin-top:4px;">Peminjam / Ekspedisi</div>
          </div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintHasilPicking = (group: PickingSuratJalanGroup) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onNotify('Popup terblokir, izinkan popup browser untuk cetak PDF', 'warning');
      return;
    }

    const pickedItems = group.items.filter((it) => it.qty_picked > 0);
    const itemsRows = pickedItems
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.nama_produk}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${it.size || '-'}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty_picked}</td>
      </tr>
    `
      )
      .join('');

    const pickedUnexpectedItems = (group.unexpected_items || []).filter((it) => it.qty_picked > 0);
    const unexpectedRows = pickedUnexpectedItems
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${pickedItems.length + idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.nama_produk}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${it.size || '-'}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty_picked}</td>
      </tr>
    `
      )
      .join('');

    const qrText = encodeURIComponent(`#SJ "${group.no_sj}"`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrText}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Hasil Picking - ${group.no_sj}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 16px; }
          .logo-title { font-size: 20px; font-weight: 800; color: #0f172a; }
          .logo-sub { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
          .info-table td { padding: 4px 0; vertical-align: top; }
          .label { width: 160px; color: #64748b; font-weight: 600; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
          .items-table th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 6px; text-align: left; text-transform: uppercase; font-size: 11px; }
          .footer-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: center; margin-top: 40px; font-size: 12px; }
          .sign-box { height: 65px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-title">Chocochips</div>
          </div>
          <div style="text-align:right;">
            <img src="${qrUrl}" width="80" height="80" alt="QR Code" style="display:block; margin-left:auto;" />
          </div>
        </div>

        <table class="info-table">
          <tr><td class="label">No Surat Jalan</td><td><b>${group.no_sj}</b></td></tr>
          <tr><td class="label">Tujuan / PIC</td><td><b>${group.tujuan}</b></td></tr>
          <tr><td class="label">Picker</td><td><b>${group.picker_name || '-'}</b></td></tr>
          <tr><td class="label">Tanggal Cetak</td><td>${new Date().toLocaleString('id-ID')}</td></tr>
          <tr><td class="label">Catatan Rekap</td><td>${group.catatan || '-'}</td></tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:35px; text-align:center;">No</th>
              <th>Nama Produk</th>
              <th style="width:55px; text-align:center;">Size</th>
              <th style="width:110px;">SKU</th>
              <th style="width:55px; text-align:center;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
            ${unexpectedRows}
          </tbody>
        </table>

        <div class="footer-sign">
          <div>
            <div>Disiapkan / Dipicking Oleh,</div>
            <div class="sign-box"></div>
            <div>( <b>${group.picker_name || '_________________'}</b> )</div>
            <div style="color:#64748b; font-size:10px; margin-top:4px;">Picker</div>
          </div>
          <div>
            <div>Diperiksa Oleh,</div>
            <div class="sign-box"></div>
            <div>( _________________ )</div>
            <div style="color:#64748b; font-size:10px; margin-top:4px;">Checker</div>
          </div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDeleteSingleSJ = async (no_sj: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Surat Jalan',
      message: `Yakin ingin menghapus Surat Jalan ${no_sj}?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const success = await deletePickingSuratJalanBatchSupabase([no_sj]);
        if (success) {
          onNotify(`Surat Jalan ${no_sj} berhasil dihapus`, 'success');
          loadPickingList();
        } else {
          onNotify('Gagal menghapus Surat Jalan', 'error');
        }
      }
    });
  };

  const handleSelectSJ = (sj: PickingSuratJalanGroup) => {
    if (sj.status === 'SELESAI') {
      setViewCompletedSJ(sj);
      return;
    }

    // Set active workspace
    const itemsClone = sj.items.map((it) => ({
      ...it,
      status: 'SEDANG PICKING' as const,
      picker_name: it.picker_name || currentUser,
    }));

    setActiveSJ(sj);
    setActiveItems(itemsClone);
    setUnexpectedItems([...sj.unexpected_items]);
    setRekapCatatan(sj.catatan || '');
    setActiveLocation('');
    setRecentScans([]);
    playCategoryBeep();
    onNotify(`Membuka Surat Jalan ${sj.no_sj}. Siap memindai barang!`, 'info');
  };

  // Action: Petugas Klik Tombol Pilih/Alihkan ke Lokasi Alternatif
  const handleSelectAlternativeLocation = (item: PickingListItem, targetLoc: string) => {
    const locClean = targetLoc.trim().toUpperCase();
    setActiveLocation(locClean);
    playCategoryBeep();
    vibrateDevice(50);
    onNotify(
      `📍 Rak aktif dialihkan ke ${locClean} untuk SKU ${item.sku}. Silakan scan atau ambil dari rak ini!`,
      'info'
    );
  };

  // Unique list of target locations in the active SJ (including primary & alternative racks)
  const uniqueLocations = React.useMemo(() => {
    if (!activeSJ) return [];
    const locMap = new Map<string, { count: number; pending: number; isAlternative?: boolean }>();
    activeItems.forEach((it) => {
      const allLocs = getProductLocations(it.sku, it.lokasi);
      const pendingQty = Math.max(0, it.qty_req - it.qty_picked);
      allLocs.forEach((l) => {
        const loc = l.lokasi.trim().toUpperCase();
        if (!loc) return;
        if (!locMap.has(loc)) {
          locMap.set(loc, { count: 0, pending: 0, isAlternative: !l.isPrimary });
        }
        const val = locMap.get(loc)!;
        val.count += 1;
        if (l.isPrimary) {
          val.pending += pendingQty;
          val.isAlternative = false;
        }
      });
    });
    return Array.from(locMap.entries()).map(([loc, data]) => ({
      lokasi: loc,
      count: data.count,
      pending: data.pending,
      isAlternative: data.isAlternative,
    }));
  }, [activeSJ, activeItems, realtimeSkuStocks]);

  // 2-PHASE BARCODE SCAN HANDLER
  // Fase 1: Tembak Lokasi (#LOK A001 / LOK A001) -> Mengatur lokasi pengambilan aktif
  // Fase 2: Tembak SKU (SKU 1, SKU 2...) -> Mengambil produk dari lokasi aktif tersebut
  // Scan berlanjutan: Sistem otomatis mendeteksi pola tanpa interupsi
  const handleBarcodeScanned = (rawBarcode: string) => {
    if (!rawBarcode.trim() || !activeSJ) return;
    const barcode = rawBarcode.trim().toUpperCase();
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // -------------------------------------------------------------
    // FASE 1: DETEKSI TEMBAK LOKASI (#LOK A001 / LOK A001 / #LOK-A001)
    // -------------------------------------------------------------
    const isLocationBarcode = /^(#?LOK[\s\-_:]*)/i.test(barcode);

    if (isLocationBarcode) {
      const locClean = barcode.replace(/^(#?LOK[\s\-_:]*)/i, '').trim().toUpperCase();
      if (!locClean) {
        onNotify('Format barcode lokasi tidak valid. Contoh: #LOK A001', 'warning');
        return;
      }

      setActiveLocation(locClean);
      playCategoryBeep();
      vibrateDevice(60);

      // Hitung item SJ di lokasi rak ini (baik rak utama maupun alternatif)
      const itemsInShelf = activeItems.filter((it) => {
        const locs = getProductLocations(it.sku, it.lokasi);
        return locs.some((l) => l.lokasi.toUpperCase() === locClean);
      });
      const remainingInShelf = itemsInShelf.reduce((acc, it) => acc + Math.max(0, it.qty_req - it.qty_picked), 0);

      setRecentScans((prev) => [
        {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
          time: nowTime,
          type: 'LOCATION',
          text: barcode,
          detail: `📍 Lokasi aktif: ${locClean} (${itemsInShelf.length} SKU target/alternatif, ${remainingInShelf} pcs sisa)`,
          location: locClean,
        },
        ...prev.slice(0, 7),
      ]);

      if (itemsInShelf.length > 0) {
        onNotify(
          `📍 [Fase 1 OK] Rak Aktif: ${locClean}! Terdapat ${itemsInShelf.length} SKU (${remainingInShelf} pcs) di rak ini. Silakan tembak SKU produk!`,
          'success'
        );
      } else {
        onNotify(
          `📍 [Fase 1 OK] Rak Aktif: ${locClean}. Silakan tembak SKU produk dari rak ini.`,
          'info'
        );
      }
      return;
    }

    // -------------------------------------------------------------
    // FASE 2: DETEKSI TEMBAK SKU PRODUK (SKU 1, SKU 2...)
    // -------------------------------------------------------------
    const effectiveLocation = activeLocation || '';

    // 1. Cari kecocokan SKU di Surat Jalan
    // Prioritaskan item di lokasi aktif jika ada (baik rak utama atau rak alternatif)
    let matchIdx = activeItems.findIndex((it) => {
      const isSkuMatch = it.sku.toUpperCase() === barcode || it.sku.toUpperCase().includes(barcode);
      if (!isSkuMatch) return false;
      if (!effectiveLocation) return false;
      const allLocs = getProductLocations(it.sku, it.lokasi);
      return allLocs.some((l) => l.lokasi.toUpperCase() === effectiveLocation.toUpperCase());
    });

    if (matchIdx === -1) {
      matchIdx = activeItems.findIndex(
        (it) => it.sku.toUpperCase() === barcode || it.sku.toUpperCase().includes(barcode)
      );
    }

    if (matchIdx !== -1) {
      // Item TERDAFTAR di Surat Jalan
      const targetItem = activeItems[matchIdx];
      const usedLocation = effectiveLocation || targetItem.lokasi || 'A-01';
      const newPicked = Number(targetItem.qty_picked || 0) + 1;

      // Auto-set lokasi jika sebelumnya belum scan lokasi
      if (!activeLocation && targetItem.lokasi) {
        setActiveLocation(targetItem.lokasi);
      }

      const updatedItem: PickingListItem = {
        ...targetItem,
        qty_picked: newPicked,
        lokasi_picked: usedLocation,
        status: (newPicked >= targetItem.qty_req ? 'SELESAI' : 'SEDANG PICKING') as any,
      };

      const nextItems = [...activeItems];
      nextItems[matchIdx] = updatedItem;
      setActiveItems(nextItems);

      if (newPicked > targetItem.qty_req) {
        // Peringatan kelebihan barang (Over-pick)
        playErrorBeep();
        vibrateDevice([150, 100, 150]);
        setRecentScans((prev) => [
          {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
            time: nowTime,
            type: 'SKU_OVER',
            text: barcode,
            detail: `⚠️ LEBIH! ${targetItem.nama_produk} (${newPicked}/${targetItem.qty_req} Pcs)`,
            location: usedLocation,
          },
          ...prev.slice(0, 7),
        ]);
        onNotify(
          `⚠️ PERINGATAN LEBIH: SKU ${targetItem.sku} sudah terambil ${newPicked}/${targetItem.qty_req} (Lebih ${newPicked - targetItem.qty_req} Pcs) dari Rak ${usedLocation}!`,
          'warning'
        );
      } else if (newPicked === targetItem.qty_req) {
        // Pas lengkap untuk SKU ini
        playSuccessBeep();
        vibrateDevice(80);
        setRecentScans((prev) => [
          {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
            time: nowTime,
            type: 'SKU_MATCH',
            text: barcode,
            detail: `✅ PAS LENGKAP! ${targetItem.nama_produk} (${newPicked}/${targetItem.qty_req} Pcs)`,
            location: usedLocation,
          },
          ...prev.slice(0, 7),
        ]);
        onNotify(`✅ PAS LENGKAP! SKU ${targetItem.sku} (${targetItem.nama_produk}) selesai (${newPicked}/${targetItem.qty_req}) dari Rak ${usedLocation}.`, 'success');
      } else {
        // Incremented
        playSuccessBeep();
        vibrateDevice(50);
        setRecentScans((prev) => [
          {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
            time: nowTime,
            type: 'SKU_MATCH',
            text: barcode,
            detail: `📦 +1 ${targetItem.nama_produk} (${newPicked}/${targetItem.qty_req} Pcs)`,
            location: usedLocation,
          },
          ...prev.slice(0, 7),
        ]);
        onNotify(`+1 SKU ${targetItem.sku} (${newPicked}/${targetItem.qty_req} Pcs) dari Rak ${usedLocation}`, 'info');
      }
    } else {
      // 2. Barcode TIDAK TERDAFTAR di Surat Jalan -> SALAH AMBIL
      playErrorBeep();
      vibrateDevice([200, 100, 200, 100]);

      const catProd = productCatalog.find(
        (p) => p.k.toUpperCase() === barcode || p.k.toUpperCase().includes(barcode)
      );

      const pickedLoc = effectiveLocation || catProd?.lokasi || '-';

      const unexpItem: PickingListItem = {
        no_sj: activeSJ.no_sj,
        tanggal: activeSJ.tanggal,
        tujuan: activeSJ.tujuan,
        sku: barcode,
        nama_produk: catProd ? catProd.p : `[TIDAK DI SJ] SKU ${barcode}`,
        size: catProd?.s || '-',
        qty_req: 0,
        qty_picked: 1,
        lokasi: pickedLoc,
        lokasi_picked: pickedLoc,
        status: 'SEDANG PICKING',
        is_unexpected: true,
      };

      const existingUnexpIdx = unexpectedItems.findIndex((it) => it.sku === barcode);
      if (existingUnexpIdx !== -1) {
        const nextUnexp = [...unexpectedItems];
        nextUnexp[existingUnexpIdx].qty_picked += 1;
        nextUnexp[existingUnexpIdx].lokasi_picked = pickedLoc;
        setUnexpectedItems(nextUnexp);
      } else {
        setUnexpectedItems([...unexpectedItems, unexpItem]);
      }

      setRecentScans((prev) => [
        {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
          time: nowTime,
          type: 'SKU_MISMATCH',
          text: barcode,
          detail: `❌ SALAH AMBIL! SKU tidak terdaftar di SJ ${activeSJ.no_sj}`,
          location: pickedLoc,
        },
        ...prev.slice(0, 7),
      ]);

      onNotify(
        `❌ SALAH AMBIL! SKU ${barcode} TIDAK TERDAFTAR di Surat Jalan ${activeSJ.no_sj}! Dicatat salah ambil dari Rak ${pickedLoc}.`,
        'error'
      );
    }
  };

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    handleBarcodeScanned(scanInput);
    setScanInput('');
  };

  // Adjust manual counter
  const handleAdjustQty = (index: number, delta: number) => {
    const target = activeItems[index];
    if (!target) return;
    const newQty = Math.max(0, target.qty_picked + delta);
    const updated = {
      ...target,
      qty_picked: newQty,
      status: (newQty >= target.qty_req ? 'SELESAI' : 'SEDANG PICKING') as any,
    };
    const nextList = [...activeItems];
    nextList[index] = updated;
    setActiveItems(nextList);
  };

  const handleAdjustUnexpectedQty = (index: number, delta: number) => {
    const next = [...unexpectedItems];
    const newQty = Math.max(0, next[index].qty_picked + delta);
    if (newQty === 0) {
      next.splice(index, 1);
    } else {
      next[index].qty_picked = newQty;
    }
    setUnexpectedItems(next);
  };

  // Quick Action: Set picked to Max (Lengkap)
  const handleSetItemMax = (index: number) => {
    const target = activeItems[index];
    if (!target) return;
    const nextList = [...activeItems];
    nextList[index] = {
      ...target,
      qty_picked: target.qty_req,
      lokasi_picked: activeLocation || target.lokasi || 'A-01',
      status: 'SELESAI',
    };
    setActiveItems(nextList);
    playSuccessBeep();
    vibrateDevice(60);
    onNotify(`✓ SKU ${target.sku} diset lengkap (${target.qty_req}/${target.qty_req} Pcs)`, 'success');
  };

  // Quick Action: Reset picked to 0
  const handleResetItemQty = (index: number) => {
    const target = activeItems[index];
    if (!target) return;
    const nextList = [...activeItems];
    nextList[index] = {
      ...target,
      qty_picked: 0,
      status: 'PENDING',
    };
    setActiveItems(nextList);
    onNotify(`↺ Qty SKU ${target.sku} di-reset ke 0`, 'info');
  };

  // Quick Action: Delete unexpected / salah ambil item
  const handleDeleteUnexpected = (index: number) => {
    const target = unexpectedItems[index];
    const next = [...unexpectedItems];
    next.splice(index, 1);
    setUnexpectedItems(next);
    onNotify(`Item salah ambil ${target?.sku || ''} telah dihapus / dikembalikan ke rak.`, 'info');
  };

  // Open item edit dialog (for either regular or wrong pick item)
  const handleOpenEditItem = (type: 'REGULAR' | 'UNEXPECTED', index: number) => {
    const it = type === 'REGULAR' ? activeItems[index] : unexpectedItems[index];
    if (!it) return;
    setEditingItemData({
      type,
      index,
      sku: it.sku,
      nama_produk: it.nama_produk,
      size: it.size || '-',
      qty_req: it.qty_req || 0,
      qty_picked: it.qty_picked || 0,
      lokasi: it.lokasi || 'A-01',
      lokasi_picked: it.lokasi_picked || it.lokasi || activeLocation || 'A-01',
      targetSJItemSku: '',
    });
    setIsEditItemModalOpen(true);
  };

  // Save changes from item edit dialog
  const handleSaveEditItem = () => {
    if (!editingItemData) return;
    const { type, index, qty_picked, lokasi_picked, targetSJItemSku } = editingItemData;

    if (type === 'UNEXPECTED') {
      if (targetSJItemSku) {
        // Picker resolves the wrong scan by mapping it to an actual SJ item!
        const matchIdx = activeItems.findIndex((x) => x.sku === targetSJItemSku);
        if (matchIdx !== -1) {
          const nextActive = [...activeItems];
          const newPicked = Number(nextActive[matchIdx].qty_picked || 0) + Number(qty_picked);
          nextActive[matchIdx] = {
            ...nextActive[matchIdx],
            qty_picked: newPicked,
            lokasi_picked: lokasi_picked || nextActive[matchIdx].lokasi,
            status: newPicked >= nextActive[matchIdx].qty_req ? 'SELESAI' : 'SEDANG PICKING',
          };
          setActiveItems(nextActive);

          // Remove from unexpected
          const nextUnexp = [...unexpectedItems];
          nextUnexp.splice(index, 1);
          setUnexpectedItems(nextUnexp);

          playSuccessBeep();
          onNotify(
            `✅ Berhasil mengalihkan ${qty_picked} pcs dari ${editingItemData.sku} ke SKU ${targetSJItemSku} pada Surat Jalan!`,
            'success'
          );
        }
      } else {
        // Just update picked qty / location
        const nextUnexp = [...unexpectedItems];
        if (qty_picked <= 0) {
          nextUnexp.splice(index, 1);
        } else {
          nextUnexp[index] = {
            ...nextUnexp[index],
            qty_picked: Number(qty_picked),
            lokasi_picked: lokasi_picked.trim(),
          };
        }
        setUnexpectedItems(nextUnexp);
        onNotify(`Data salah ambil ${editingItemData.sku} diperbarui.`, 'info');
      }
    } else {
      // REGULAR ITEM
      const nextActive = [...activeItems];
      const validPicked = Math.max(0, Number(qty_picked) || 0);
      nextActive[index] = {
        ...nextActive[index],
        qty_picked: validPicked,
        lokasi_picked: lokasi_picked.trim(),
        status: validPicked >= nextActive[index].qty_req ? 'SELESAI' : 'SEDANG PICKING',
      };
      setActiveItems(nextActive);
      onNotify(`SKU ${editingItemData.sku} diperbarui: ${validPicked}/${editingItemData.qty_req} pcs (Rak: ${lokasi_picked})`, 'success');
    }

    setIsEditItemModalOpen(false);
    setEditingItemData(null);
  };

  // Open modal to manage / edit Surat Jalan Form
  const handleOpenEditSJModal = (sjToEdit?: PickingSuratJalanGroup) => {
    const sj = sjToEdit || activeSJ;
    if (!sj) return;
    setEditingSJGroup(sj);
    setEditSjTujuan(sj.tujuan || '');
    setEditSjCatatan(sj.catatan || '');
    setEditSjRows(JSON.parse(JSON.stringify(sj.items)));
    setDeletedSjItemIds([]);
    setNewSjSkuInput('');
    setNewSjSkuNama('');
    setNewSjSkuSize('');
    setNewSjSkuLoc('');
    setNewSjSkuQty(1);
    setIsEditSJModalOpen(true);
  };

  // Add new SKU row to Surat Jalan inside edit modal
  const handleAddRowToEditSJ = () => {
    if (!newSjSkuInput.trim()) {
      onNotify('Silakan ketik atau pilih SKU produk terlebih dahulu', 'warning');
      return;
    }
    const catProd = productCatalog.find(
      (p) => p.k.toUpperCase() === newSjSkuInput.trim().toUpperCase()
    );
    const newRow: PickingListItem = {
      no_sj: activeSJ?.no_sj || '',
      tanggal: activeSJ?.tanggal || new Date().toISOString().slice(0, 10),
      tujuan: editSjTujuan || 'Marketplace',
      sku: newSjSkuInput.trim().toUpperCase(),
      nama_produk: newSjSkuNama.trim() || catProd?.p || `Produk ${newSjSkuInput}`,
      size: newSjSkuSize.trim() || catProd?.s || '-',
      lokasi: newSjSkuLoc.trim() || catProd?.lokasi || 'A-01',
      qty_req: Math.max(1, Number(newSjSkuQty) || 1),
      qty_picked: 0,
      status: 'PENDING',
    };
    setEditSjRows([...editSjRows, newRow]);
    setNewSjSkuInput('');
    setNewSjSkuNama('');
    setNewSjSkuSize('');
    setNewSjSkuLoc('');
    setNewSjSkuQty(1);
    onNotify(`SKU ${newRow.sku} ditambahkan ke daftar draft SJ!`, 'info');
  };

  // Remove row from Surat Jalan inside edit modal
  const handleRemoveRowFromEditSJ = (index: number) => {
    const target = editSjRows[index];
    if (target?.id) {
      setDeletedSjItemIds([...deletedSjItemIds, target.id]);
    }
    const nextRows = [...editSjRows];
    nextRows.splice(index, 1);
    setEditSjRows(nextRows);
  };

  // Save changes to Surat Jalan Form
  const handleSaveEditSJModal = async () => {
    if (!editingSJGroup) return;
    if (editSjRows.length === 0) {
      onNotify('Surat Jalan harus memiliki minimal 1 item SKU', 'error');
      return;
    }
    setIsSavingSjEdit(true);

    try {
      // 1. Sync changes to Supabase FIRST
      const newItemsToAdd = editSjRows.filter((r) => !r.id);
      const existingItems = editSjRows.filter((r) => !!r.id);
      await updatePickingSuratJalanDetailsSupabase(
        editingSJGroup.no_sj,
        editSjTujuan,
        existingItems,
        newItemsToAdd,
        deletedSjItemIds
      );

      // 2. Update active SJ locally if it's the one currently open in workspace
      if (activeSJ?.no_sj === editingSJGroup.no_sj) {
        setActiveItems(editSjRows);
        const updatedGroup: PickingSuratJalanGroup = {
          ...activeSJ,
          tujuan: editSjTujuan.trim(),
          catatan: editSjCatatan.trim(),
          items: editSjRows,
          total_items: editSjRows.length,
          total_qty_req: editSjRows.reduce((a, b) => a + Number(b.qty_req || 0), 0),
        };
        setActiveSJ(updatedGroup);
      }

      playSuccessBeep();
      onNotify('Form Surat Jalan dan daftar SKU berhasil diperbarui!', 'success');
      setIsEditSJModalOpen(false);
      loadPickingList();
    } catch (err: any) {
      onNotify(`Gagal memperbarui Surat Jalan: ${err.message}`, 'error');
    } finally {
      setIsSavingSjEdit(false);
    }
  };

  // Manual Autocomplete Search Selection
  const handleSelectSearchProduct = (prod: ProductItem) => {
    setSearchSelectedProduct(prod);
    setSearchQuery(prod.k);
    setSearchLocation(activeLocation || prod.lokasi || 'A-01');
    setIsSearchDropdownOpen(false);
  };

  // Manual Autocomplete Search Submission
  const handleManualSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !activeSJ) return;
    const targetSku = searchQuery.trim().toUpperCase();
    const qty = Math.max(1, searchQty || 1);

    if (searchLocation.trim()) {
      setActiveLocation(searchLocation.trim().toUpperCase());
    }

    for (let i = 0; i < qty; i++) {
      handleBarcodeScanned(targetSku);
    }

    setSearchQuery('');
    setSearchSelectedProduct(null);
    setSearchQty(1);
    setIsSearchDropdownOpen(false);
    onNotify(`Berhasil input manual ${qty}x ${targetSku}`, 'success');
  };

  // Process Batch Multi-Line Text Input (Format Scanner)
  const handleProcessBatchInput = () => {
    if (!batchInputText.trim() || !activeSJ) return;
    setIsProcessingBatch(true);

    const lines = batchInputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setIsProcessingBatch(false);
      return;
    }

    let processedCount = 0;
    let locationCount = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      // Detect Location change: #LOK A001 or LOK A001
      if (/^(#?LOK[\s\-_:]*)/i.test(line)) {
        handleBarcodeScanned(line);
        locationCount += 1;
      } else {
        // Detect multiplier format: SKU * 5, SKU x5, SKU, 5 or SKU 5
        const matchMultiplier = line.match(/^([^\s\*,x]+)[\s\*,x]+(\d+)$/i);
        if (matchMultiplier) {
          const skuCode = matchMultiplier[1].trim();
          const count = parseInt(matchMultiplier[2], 10);
          const repeat = Math.min(Math.max(1, isNaN(count) ? 1 : count), 500);
          for (let i = 0; i < repeat; i++) {
            handleBarcodeScanned(skuCode);
          }
          processedCount += repeat;
        } else {
          handleBarcodeScanned(line);
          processedCount += 1;
        }
      }
    }

    setIsProcessingBatch(false);
    setBatchInputText('');
    playSuccessBeep();
    onNotify(
      `Berhasil memproses batch: ${processedCount} SKU (${locationCount} perubahan rak)!`,
      'success'
    );
  };

  // Calculate stats for current active SJ
  const activeStats = React.useMemo(() => {
    if (!activeSJ) return { totalReq: 0, totalPicked: 0, percentage: 0, statusType: 'SEMUA_PAS' as RekapStatusType };
    const totalReq = activeItems.reduce((acc, it) => acc + (Number(it.qty_req) || 0), 0);
    const regularPicked = activeItems.reduce((acc, it) => acc + (Number(it.qty_picked) || 0), 0);
    const unexpectedPicked = unexpectedItems.reduce((acc, it) => acc + (Number(it.qty_picked) || 0), 0);
    const totalPicked = regularPicked + unexpectedPicked;
    const percentage = totalReq > 0 ? Math.min(100, Math.round((regularPicked / totalReq) * 100)) : 100;

    let hasKurang = false;
    let hasLebih = false;
    let hasSalah = unexpectedItems.length > 0;

    activeItems.forEach((it) => {
      if (it.qty_picked < it.qty_req) hasKurang = true;
      if (it.qty_picked > it.qty_req) hasLebih = true;
    });

    let statusType: RekapStatusType = 'SEMUA_PAS';
    if (hasSalah && (hasKurang || hasLebih)) statusType = 'CAMPURAN';
    else if (hasSalah) statusType = 'SALAH_AMBIL';
    else if (hasKurang) statusType = 'ADA_KURANG';
    else if (hasLebih) statusType = 'ADA_LEBIH';
    else statusType = 'SEMUA_PAS';

    return { totalReq, totalPicked, regularPicked, unexpectedPicked, percentage, statusType, hasKurang, hasLebih, hasSalah };
  }, [activeSJ, activeItems, unexpectedItems]);

  // Open Rekap Modal
  const handleOpenRekapModal = () => {
    if (!activeSJ) return;
    setIsRekapModalOpen(true);
  };

  // Confirm Completion of SJ
  const handleConfirmCompleteSJ = async () => {
    if (!activeSJ) return;
    setIsSubmittingRekap(true);

    try {
      const success = await completePickingSuratJalanSupabase(
        activeSJ.no_sj,
        activeItems,
        unexpectedItems,
        currentUser || 'Operator',
        rekapCatatan,
        syncOutLog
      );

      if (success) {
        playSaveSuccessChime();
        vibrateDevice([100, 50, 100]);

        if (activeStats.statusType === 'SEMUA_PAS') {
          try {
            confetti({
              particleCount: 70,
              spread: 70,
              origin: { y: 0.7 },
              colors: ['#10b981', '#ff7a00', '#ffffff'],
            });
          } catch {}
          onNotify(`🎉 Surat Jalan ${activeSJ.no_sj} berhasil diselesaikan 100% LENGKAP!`, 'success');
        } else {
          onNotify(`Surat Jalan ${activeSJ.no_sj} selesai dengan catatan rekap!`, 'warning');
        }

        // Close workspace & modal
        setIsRekapModalOpen(false);
        setActiveSJ(null);
        setActiveItems([]);
        setUnexpectedItems([]);
        loadPickingList();
      } else {
        onNotify('Gagal menyimpan hasil rekap ke Database. Cek koneksi.', 'error');
      }
    } catch (e: any) {
      onNotify(`Error: ${e.message || 'Gagal menyimpan'}`, 'error');
    } finally {
      setIsSubmittingRekap(false);
    }
  };

  // Seed sample SJ if table is empty
  const handleSeedSampleSJ = async () => {
    setLoading(true);
    try {
      const sampleSJs = [
        {
          no_sj: 'SJ-MKG-' + Math.floor(1000 + Math.random() * 9000),
          tujuan: 'Store Mall Kelapa Gading (MKG)',
          items: [
            { sku: 'DRS-AZR-DRK-S', nama_produk: 'Azura Set Dark Red', size: 'S', lokasi: 'A-01-02', qty_req: 3 },
            { sku: 'DRS-AZR-DRK-M', nama_produk: 'Azura Set Dark Red', size: 'M', lokasi: 'A-01-03', qty_req: 2 },
            { sku: 'TOP-TRS-NVY-ALL', nama_produk: 'Taurus Top Navy', size: 'ALL', lokasi: 'B-02-01', qty_req: 4 },
          ],
        },
        {
          no_sj: 'SJ-SHP-' + Math.floor(1000 + Math.random() * 9000),
          tujuan: 'Shopee Live Fulfillment',
          items: [
            { sku: 'DRS-YNN-MRN-M', nama_produk: 'Yenni Dress Maroon', size: 'M', lokasi: 'A-03-01', qty_req: 2 },
            { sku: 'PNT-CRG-BLK-L', nama_produk: 'Cargo Pants Black', size: 'L', lokasi: 'C-01-04', qty_req: 3 },
          ],
        },
        {
          no_sj: 'SJ-PIM-' + Math.floor(1000 + Math.random() * 9000),
          tujuan: 'Store Pondok Indah Mall (PIM)',
          items: [
            { sku: 'SKT-PLT-BEG-S', nama_produk: 'Pleated Skirt Beige', size: 'S', lokasi: 'C-02-02', qty_req: 2 },
            { sku: 'OUT-BLZ-KHK-M', nama_produk: 'Classic Blazer Khaki', size: 'M', lokasi: 'D-01-01', qty_req: 1 },
          ],
        },
      ];

      for (const sj of sampleSJs) {
        await createPickingSuratJalanSupabase(sj.no_sj, sj.tujuan, sj.items);
      }

      onNotify('Berhasil membuat 3 contoh Surat Jalan Picking di Database!', 'success');
      loadPickingList();
    } catch (e) {
      onNotify('Gagal membuat contoh Surat Jalan', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Add Row in Create SJ Modal
  const handleAddNewSjRow = () => {
    setNewSjRows([...newSjRows, { sku: '', nama_produk: '', size: '', lokasi: '', qty_req: 1 }]);
  };

  const handleRemoveNewSjRow = (index: number) => {
    if (newSjRows.length === 1) return;
    setNewSjRows(newSjRows.filter((_, i) => i !== index));
  };

  const handleNewSjRowChange = (index: number, field: string, value: any) => {
    const next = [...newSjRows];
    next[index] = { ...next[index], [field]: value };

    // Auto-fill from catalog if sku changed
    if (field === 'sku' && productCatalog.length > 0) {
      const found = productCatalog.find((p) => p.k.toUpperCase() === String(value).toUpperCase().trim());
      if (found) {
        next[index].nama_produk = found.p;
        next[index].size = found.s || '-';
        next[index].lokasi = found.lokasi || 'A-01';
      }
    }
    setNewSjRows(next);
  };

  const handleSaveNewSJ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSjNumber.trim() || !newSjTujuan.trim()) {
      onNotify('Mohon isi Nomor SJ dan Tujuan pengiriman', 'error');
      return;
    }

    const validRows = newSjRows.filter((r) => r.sku.trim() !== '');
    if (validRows.length === 0) {
      onNotify('Mohon masukkan minimal 1 item produk SKU', 'error');
      return;
    }

    setIsCreatingSj(true);
    try {
      const ok = await createPickingSuratJalanSupabase(newSjNumber, newSjTujuan, validRows);
      if (ok) {
        onNotify(`Surat Jalan ${newSjNumber} berhasil dibuat di Database!`, 'success');
        setIsCreateModalOpen(false);
        setNewSjNumber('');
        setNewSjTujuan('');
        setNewSjRows([{ sku: '', nama_produk: '', size: '', lokasi: '', qty_req: 1 }]);
        loadPickingList();
      } else {
        onNotify('Gagal menyimpan Surat Jalan baru ke Database', 'error');
      }
    } catch (err: any) {
      onNotify(`Error: ${err.message}`, 'error');
    } finally {
      setIsCreatingSj(false);
    }
  };

  // =========================================================================
  // VIEW 2: ACTIVE PICKING WORKSPACE (Petugas Sedang Mengambil 1 SJ)
  // =========================================================================
  if (activeSJ) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 pb-8">
        {/* Top Header Bar */}
        <div className="bg-white dark:bg-[#131d31] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <button
                onClick={() => {
                  if (activeStats.regularPicked > 0) {
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Kembali ke Daftar?',
                      message: 'Progress picking belum diselesaikan. Kembali ke daftar Surat Jalan?',
                      onConfirm: () => {
                        setActiveSJ(null);
                        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                      }
                    });
                  } else {
                    setActiveSJ(null);
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 mb-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-[#ff7a00]" /> Kembali ke Daftar Surat Jalan
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">
                  {activeSJ.no_sj}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/20">
                  {activeSJ.status}
                </span>
                <button
                  type="button"
                  onClick={handleOpenEditSJModal}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-[11px] rounded-lg flex items-center gap-1 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 ml-1"
                  title="Ubah info SJ, tambah SKU baru atau ubah target SKU"
                >
                  <FileEdit className="w-3.5 h-3.5 text-[#ff7a00]" />
                  <span>Kelola Form SJ</span>
                </button>
              </div>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-2 mt-1">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                <span>Tujuan: <b>{activeSJ.tujuan}</b></span>
                <span>•</span>
                <span>Picker: <b>{currentUser}</b></span>
              </p>
            </div>

            {/* Rekap Status Badge */}
            <div className="text-right">
              <div className="text-[10px] font-extrabold uppercase text-slate-400 mb-1">Status Progres</div>
              <div className="text-2xl font-black text-slate-800 dark:text-white flex items-baseline justify-end gap-1">
                <span className={activeStats.percentage === 100 ? 'text-emerald-500' : 'text-[#ff7a00]'}>
                  {activeStats.regularPicked}
                </span>
                <span className="text-sm text-slate-400 font-bold">/ {activeStats.totalReq} Pcs</span>
              </div>
            </div>
          </div>

          {/* Progress Bar Visual */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex justify-between items-center text-xs font-bold mb-1.5">
              <span className="text-slate-600 dark:text-slate-400">
                {activeStats.percentage}% Selesai ({activeItems.filter((i) => i.qty_picked >= i.qty_req).length} dari {activeItems.length} SKU)
              </span>
              {activeStats.hasKurang && (
                <span className="text-amber-500 font-bold text-[11px] flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Masih Ada Kurang
                </span>
              )}
              {activeStats.percentage === 100 && !activeStats.hasLebih && !activeStats.hasSalah && (
                <span className="text-emerald-500 font-bold text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Siap Diselesaikan (100% Pas)
                </span>
              )}
            </div>
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  activeStats.percentage === 100 ? 'bg-emerald-500' : 'bg-[#ff7a00]'
                }`}
                style={{ width: `${activeStats.percentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* STICKY BARCODE SCANNER BAR (FREEZE / STICKY AT TOP UNDER NAVBAR) */}
        <div className="sticky top-[52px] sm:top-[58px] z-20 bg-[#f4f6f8]/95 dark:bg-[#0f172a]/95 backdrop-blur-md pt-1 pb-2">
          <div className="bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden">
            {/* METODE PEMINDAIAN SELECTOR */}
            <div
              id="pickingScanMethodContainer"
              className="bg-white dark:bg-[#0F0F12] px-4 py-2.5 border-b border-slate-200 dark:border-slate-800/80 transition-colors"
            >
              <div className="max-w-lg mx-auto">
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 text-center">
                  Metode Pemindaian
                </label>
                <div className="flex bg-slate-100 dark:bg-[#09090B] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button
                    id="btnPickingModeFisik"
                    type="button"
                    onClick={() => setInputMode('fisik')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      inputMode === 'fisik'
                        ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700/80 font-bold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    <span>Fisik Gun</span>
                  </button>

                  <button
                    id="btnPickingModeManual"
                    type="button"
                    onClick={() => setInputMode('manual')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      inputMode === 'manual'
                        ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700/80 font-bold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>Manual</span>
                  </button>

                  <button
                    id="btnPickingModeKamera"
                    type="button"
                    onClick={() => setInputMode('kamera')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      inputMode === 'kamera'
                        ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700/80 font-bold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Kamera HP</span>
                  </button>
                </div>
              </div>
            </div>

            {/* MODE 1: FISIK GUN (IDENTICAL TO PAGE SCANNER'S PHYSICALSCANINPUT) */}
            {inputMode === 'fisik' && (
              <PhysicalScanInput 
                onScan={handleBarcodeScanned}
                products={productCatalog}
                placeholder={
                  activeLocation
                    ? `[Rak: ${activeLocation}] Tembak Barcode / Tulis SKU atau #LOK...`
                    : 'Tembak Barcode / Tulis SKU atau #LOK...'
                }
                footerContent={
                  <>
                    {activeLocation ? (
                      <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold">
                        <span>📍 Rak: {activeLocation}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveLocation('');
                            onNotify('Lokasi rak dikosongkan. Silakan tembak #LOK baru.', 'info');
                          }}
                          className="text-slate-400 hover:text-rose-500 text-[10px] ml-0.5 cursor-pointer font-sans"
                          title="Ganti Rak"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                        Tembak #LOK untuk set rak
                      </span>
                    )}
                  </>
                }
              />
            )}

            {/* MODE 2: MANUAL SEARCH & AUTOCOMPLETE INPUT */}
            {inputMode === 'manual' && (
              <div className="bg-white dark:bg-[#09090B] px-4 py-3.5 border-b border-slate-200 dark:border-slate-800/80">
                <form onSubmit={handleManualSearchSubmit} className="max-w-lg mx-auto space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-6 relative">
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">
                        Cari SKU / Nama Produk
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsSearchDropdownOpen(true);
                          }}
                          onFocus={() => setIsSearchDropdownOpen(true)}
                          placeholder="Ketik SKU atau nama produk..."
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none"
                        />
                      </div>

                      {/* Autocomplete Dropdown */}
                      {isSearchDropdownOpen && searchQuery.trim().length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl max-h-48 overflow-y-auto">
                          {(() => {
                            // 1. Search in current active SJ items
                            const sjMatches = activeItems.filter((it) =>
                              partialSearchMatch(searchQuery, it.sku, it.nama_produk, it.size, it.lokasi)
                            );
                            // 2. Search in global catalog
                            const catMatches = productCatalog
                              .filter((p) =>
                                partialSearchMatch(searchQuery, p.k, p.p, p.s, p.lokasi, p.category)
                              )
                              .slice(0, 12);

                            if (sjMatches.length === 0 && catMatches.length === 0) {
                              return (
                                <div className="p-3 text-xs text-slate-400 text-center font-bold">
                                  Tidak ditemukan produk dengan kata kunci &quot;{searchQuery}&quot;
                                </div>
                              );
                            }

                            return (
                              <div className="p-1 space-y-1">
                                {sjMatches.length > 0 && (
                                  <div>
                                    <div className="px-2 py-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-500/10 rounded">
                                      Dari Surat Jalan Ini ({sjMatches.length})
                                    </div>
                                    {sjMatches.map((m) => (
                                      <button
                                        key={m.sku}
                                        type="button"
                                        onClick={() => {
                                          setSearchQuery(m.sku);
                                          setSearchLocation(activeLocation || m.lokasi || 'A-01');
                                          setIsSearchDropdownOpen(false);
                                        }}
                                        className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs flex justify-between items-center transition-colors cursor-pointer"
                                      >
                                        <div>
                                          <div className="font-mono font-bold text-slate-800 dark:text-white">{m.sku}</div>
                                          <div className="text-[11px] text-slate-500">{m.nama_produk}</div>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-[10px] font-bold text-slate-400 block">Rak: {m.lokasi}</span>
                                          <span className="text-xs font-black text-emerald-600">{m.qty_picked}/{m.qty_req}</span>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {catMatches.length > 0 && (
                                  <div>
                                    <div className="px-2 py-1 text-[10px] font-black uppercase text-blue-500 bg-blue-500/10 rounded mt-1">
                                      Katalog Global Master Produk ({catMatches.length})
                                    </div>
                                    {catMatches.map((m) => (
                                      <button
                                        key={m.k}
                                        type="button"
                                        onClick={() => handleSelectSearchProduct(m)}
                                        className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs flex justify-between items-center transition-colors cursor-pointer"
                                      >
                                        <div>
                                          <div className="font-mono font-bold text-slate-800 dark:text-white">{m.k}</div>
                                          <div className="text-[11px] text-slate-500">{m.p}</div>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400">Rak: {m.lokasi || '-'}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-3">
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">
                        Lokasi Rak
                      </label>
                      <input
                        type="text"
                        value={searchLocation}
                        onChange={(e) => setSearchLocation(e.target.value.toUpperCase())}
                        placeholder={activeLocation || 'A001'}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white outline-none"
                      />
                    </div>

                    <div className="sm:col-span-3 flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">
                          Qty Pcs
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={searchQty}
                          onChange={(e) => setSearchQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 rounded-xl text-xs font-black text-center text-slate-800 dark:text-white outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Input
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* MODE 3: KAMERA HP SCANNER (REUSING CAMERASCANNER COMPONENT) */}
            {inputMode === 'kamera' && (
              <CameraScanner
                id="reader-canvas-picking"
                onScan={(decodedText) => handleBarcodeScanned(decodedText)}
                onRequestWakeLock={() => {
                  try {
                    if ('wakeLock' in navigator) {
                      (navigator as any).wakeLock.request('screen').catch(() => {});
                    }
                  } catch {}
                }}
              />
            )}

            {/* Quick Shelf Selection Pills (Compact horizontal bar inside sticky box) */}
            {uniqueLocations.length > 0 && (
              <div className="px-4 py-2 bg-slate-50 dark:bg-[#0F0F12] flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">
                  Rak SJ:
                </span>
                {uniqueLocations.map((uLoc) => {
                  const isCurrent = activeLocation === uLoc.lokasi;
                  return (
                    <button
                      key={uLoc.lokasi}
                      type="button"
                      onClick={() => handleBarcodeScanned(`#LOK ${uLoc.lokasi}`)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer active:scale-95 ${
                        isCurrent
                          ? 'bg-emerald-500 text-black shadow-xs ring-2 ring-emerald-400/50'
                          : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <span>📍 {uLoc.lokasi}</span>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-sans ${
                          isCurrent
                            ? 'bg-black/20 text-black font-bold'
                            : uLoc.pending === 0
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
                        }`}
                      >
                        {uLoc.pending === 0 ? '✓' : `${uLoc.pending}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Warning Section for Unexpected / Wrong Items (Salah Ambil) */}
        {unexpectedItems.length > 0 && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-400 dark:border-rose-700 p-4 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400 animate-pulse" />
                <div>
                  <h3 className="text-xs font-black text-rose-800 dark:text-rose-300 uppercase">
                    Barang Salah Ambil / Tidak Ada di SJ ({unexpectedItems.length} Item)
                  </h3>
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                    Item berikut ter-scan tetapi TIDAK terdaftar di Surat Jalan ini. Anda dapat mengoreksi ke SKU SJ yang benar atau menghapusnya.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {unexpectedItems.map((unexp, idx) => (
                <div
                  key={idx}
                  className="bg-white dark:bg-[#131d31] p-3 rounded-xl border border-rose-200 dark:border-rose-900 flex flex-wrap justify-between items-center gap-2"
                >
                  <div className="min-w-[180px]">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-extrabold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded">
                        SALAH AMBIL
                      </span>
                      <span className="text-[10px] font-mono font-extrabold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        📍 Rak: {unexp.lokasi_picked || unexp.lokasi || '-'}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-800 dark:text-white">{unexp.sku}</span>
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                      {unexp.nama_produk}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-rose-600 dark:text-rose-400 mr-2">
                      +{unexp.qty_picked} Pcs
                    </span>

                    {/* Counter Buttons */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                      <button
                        onClick={() => handleAdjustUnexpectedQty(idx, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-[#131d31] text-slate-600 dark:text-slate-300 hover:text-rose-600 cursor-pointer"
                        title="Kurangi 1"
                      >
                        <MinusCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAdjustUnexpectedQty(idx, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-[#131d31] text-slate-600 dark:text-slate-300 hover:text-rose-600 cursor-pointer"
                        title="Tambah 1"
                      >
                        <PlusCircle className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Koreksi / Ganti ke SKU SJ Button */}
                    <button
                      onClick={() => handleOpenEditItem('UNEXPECTED', idx)}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
                      title="Koreksi ke SKU Surat Jalan yang benar"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Koreksi / Alihkan</span>
                    </button>

                    {/* Direct Delete Button */}
                    <button
                      onClick={() => handleDeleteUnexpected(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                      title="Hapus / Kembalikan ke rak"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List of Products in this SJ */}
        <div className="space-y-2.5">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Daftar Barang Surat Jalan ({activeItems.length} SKU)
            </h2>
            <span className="text-[11px] font-bold text-slate-500">
              {activeLocation ? `📍 Filter Rak: ${activeLocation}` : 'Semua Lokasi Rak'}
            </span>
          </div>

          {activeItems.map((item, index) => {
            const isCompleted = item.qty_picked === item.qty_req;
            const isOver = item.qty_picked > item.qty_req;

            const productLocs = getProductLocations(item.sku, item.lokasi);
            const primaryLoc = productLocs.find((l) => l.isPrimary) || productLocs[0];
            const allWarehouseLocs = productLocs.filter(l => isWarehouseLocation(l.lokasi));
            const displayLokasi = allWarehouseLocs.length > 0 ? allWarehouseLocs.map(l => l.lokasi).join(', ') : (item.lokasi || 'A-01');

            const isCurrentShelf = activeLocation && (
              allWarehouseLocs.some(l => l.lokasi.toUpperCase() === activeLocation.toUpperCase())
            );

            let cardBorder = 'border-slate-200 dark:border-slate-800';
            let statusBadge = (
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Belum
              </span>
            );

            if (isCompleted) {
              cardBorder = 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/20 dark:bg-emerald-950/10';
              statusBadge = (
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Pas Selesai
                </span>
              );
            } else if (isOver) {
              cardBorder = 'border-amber-300 dark:border-amber-800/60 bg-amber-50/20 dark:bg-amber-950/10';
              statusBadge = (
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-300 dark:border-amber-700/50">
                  Lebih +{item.qty_picked - item.qty_req}
                </span>
              );
            } else if (item.qty_picked > 0) {
              cardBorder = 'border-blue-200 dark:border-blue-800/50 bg-blue-50/10 dark:bg-blue-950/10';
              statusBadge = (
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                  Kurang {item.qty_req - item.qty_picked}
                </span>
              );
            }

            const isWarehouse = isWarehouseLocation(primaryLoc?.lokasi || item.lokasi || '');

            return (
              <div
                key={item.id || index}
                className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131d31] border-2 ${cardBorder} shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all ${
                  isCurrentShelf ? 'ring-4 ring-[#ff7a00]/30 border-[#ff7a00]' : ''
                }`}
              >
                <div className="flex-1 space-y-2">
                  {/* TOP ROW: LOKASI WAREHOUSE (BIG) + SIZE (BIG) + SKU + STATUS */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                    {/* BIG LOKASI RAK BADGE */}
                    <button
                      type="button"
                      onClick={() => handleBarcodeScanned(`#LOK ${primaryLoc?.lokasi || item.lokasi}`)}
                      className={`px-3.5 py-1.5 rounded-xl font-mono font-black text-sm sm:text-base flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 max-w-[65%] sm:max-w-none ${
                        isCurrentShelf
                          ? 'bg-[#ff7a00] text-white shadow-md ring-2 ring-[#ff7a00]/50'
                          : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-2 border-emerald-500/30 hover:bg-emerald-100'
                      }`}
                      title="Klik untuk jadikan rak aktif ini"
                    >
                      <MapPin className="w-4 h-4 text-inherit shrink-0" />
                      <span className="truncate">{displayLokasi}</span>
                      {isWarehouse ? (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 uppercase tracking-wider font-sans shrink-0">
                          Warehouse
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 uppercase tracking-wider font-sans shrink-0">
                          Non-WH
                        </span>
                      )}
                    </button>

                    {/* BIG SIZE BADGE */}
                    {item.size && item.size !== '-' && (
                      <span className="px-3 py-1.5 bg-amber-500/15 text-amber-900 dark:text-amber-300 border-2 border-amber-500/40 text-xs sm:text-sm font-black rounded-xl shadow-xs uppercase tracking-wide">
                        Size: {item.size}
                      </span>
                    )}

                    {isCurrentShelf && (
                      <span className="text-[11px] font-black text-[#ff7a00] bg-[#ff7a00]/15 border border-[#ff7a00]/30 px-2.5 py-1 rounded-xl uppercase tracking-wider">
                        🎯 RAK AKTIF
                      </span>
                    )}

                    <span className="text-xs sm:text-sm font-mono font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
                      {item.sku}
                    </span>

                    {statusBadge}
                  </div>

                  {/* BIG NAMA PRODUK */}
                  <h3 className="text-base sm:text-lg md:text-xl font-black text-slate-900 dark:text-white leading-tight">
                    {item.nama_produk}
                  </h3>


                  {item.lokasi_picked && item.lokasi_picked !== item.lokasi && (
                    <div className="text-xs text-amber-700 dark:text-amber-300 font-bold mt-1 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-300 dark:border-amber-800">
                      ⚠️ Diambil dari rak: <b>{item.lokasi_picked}</b> (Target SJ: {item.lokasi})
                    </div>
                  )}
                </div>

                {/* COUNTER & ACTION BUTTONS (LARGE TOUCH TARGETS FOR OPERATORS) */}
                <div className="flex items-center gap-2.5 flex-wrap shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                  {/* Counter Control */}
                  <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#0f172a] p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner">
                    <button
                      type="button"
                      onClick={() => handleAdjustQty(index, -1)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-200 hover:text-rose-600 active:scale-95 shadow-sm transition-all cursor-pointer"
                      title="Kurangi 1"
                    >
                      <MinusCircle className="w-5 h-5" />
                    </button>
                    <div className="px-3 min-w-[70px] text-center">
                      <span
                        className={`text-xl font-black font-mono block ${
                          isCompleted
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : isOver
                            ? 'text-amber-600'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {item.qty_picked}
                      </span>
                      <span className="text-xs font-bold text-slate-400">/ {item.qty_req} pcs</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdjustQty(index, 1)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-200 hover:text-[#ff7a00] active:scale-95 shadow-sm transition-all cursor-pointer"
                      title="Tambah 1"
                    >
                      <PlusCircle className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Quick Set Max Button */}
                  <button
                    type="button"
                    onClick={() => handleSetItemMax(index)}
                    className="h-10 px-3.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                    title="Set langsung selesai (Pas sesuai Qty Target)"
                  >
                    <Check className="w-4 h-4" />
                    <span>Maks</span>
                  </button>

                  {/* Quick Reset Button */}
                  <button
                    type="button"
                    onClick={() => handleResetItemQty(index)}
                    className="h-10 w-10 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                    title="Reset ke 0"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {/* Detail Edit Modal Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenEditItem('REGULAR', index)}
                    className="h-10 w-10 flex items-center justify-center text-[#ff7a00] hover:bg-[#ff7a00]/15 bg-[#ff7a00]/10 border border-[#ff7a00]/30 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                    title="Edit Qty / Rak Tertentu"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* NON-STICKY BOTTOM ACTION BAR (At the end of picking list as requested) */}
        <div className="mt-6 bg-white dark:bg-[#131d31] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="text-xs">
              <span className="text-slate-400 font-bold block text-[10px] uppercase">Ringkasan SJ</span>
              <span className="font-black text-slate-800 dark:text-white text-base">
                {activeStats.regularPicked} / {activeStats.totalReq} Pcs
              </span>
              {unexpectedItems.length > 0 && (
                <span className="text-rose-500 font-extrabold text-[11px] ml-1">
                  (+{activeStats.unexpectedPicked} Salah Ambil)
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleOpenRekapModal}
            className={`px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 flex items-center gap-2 cursor-pointer ${
              activeStats.statusType === 'SEMUA_PAS'
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                : 'bg-[#ff7a00] hover:bg-[#e06c00] text-white shadow-[#ff7a00]/20'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Selesaikan Picking (Cek Rekap)</span>
          </button>
        </div>

        {/* MODAL REKAP & PENYELESAIAN HASIL PICKING */}
        {isRekapModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-[#131d31] w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
                <div>
                  <span className="text-[10px] font-extrabold text-[#ff7a00] uppercase tracking-wider">
                    Konfirmasi Penyelesaian
                  </span>
                  <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase">
                    Rekapitulasi Picking: {activeSJ.no_sj}
                  </h2>
                </div>
                <button
                  onClick={() => setIsRekapModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                {/* Status Evaluation Banner */}
                {activeStats.statusType === 'SEMUA_PAS' && (
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase">
                        SEMUA ITEM DIPICK LENGKAP & SESUAI (100%)
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                        Total {activeStats.totalReq} Pcs berhasil diambil tepat tanpa kekurangan atau kelebihan barang.
                      </div>
                    </div>
                  </div>
                )}

                {activeStats.statusType === 'ADA_KURANG' && (
                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase">
                        PERHATIAN: TERDAPAT BARANG YANG KURANG
                      </div>
                      <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                        Ada {activeItems.filter((i) => i.qty_picked < i.qty_req).length} SKU yang belum lengkap terambil dari rak.
                      </div>
                    </div>
                  </div>
                )}

                {activeStats.statusType === 'ADA_LEBIH' && (
                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-black text-amber-800 dark:text-amber-300 uppercase">
                        PERHATIAN: TERDAPAT BARANG BERLEBIH (OVERPICK)
                      </div>
                      <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                        Jumlah item terambil melebihi kuantiti yang diminta pada Surat Jalan.
                      </div>
                    </div>
                  </div>
                )}

                {(activeStats.statusType === 'SALAH_AMBIL' || activeStats.statusType === 'CAMPURAN') && (
                  <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-2xl flex items-center gap-3">
                    <AlertOctagon className="w-6 h-6 text-rose-500 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-black text-rose-800 dark:text-rose-300 uppercase">
                        PERHATIAN: TERDAPAT BARANG SALAH AMBIL
                      </div>
                      <div className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">
                        Terdapat {unexpectedItems.length} SKU tidak terdaftar yang ikut terambil.
                      </div>
                    </div>
                  </div>
                )}

                {/* Rekap Items Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 text-[10px] font-extrabold uppercase text-slate-500 flex justify-between">
                    <span>Item Surat Jalan</span>
                    <span>Target vs Terambil</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                    {activeItems.map((it, idx) => {
                      const selisih = it.qty_picked - it.qty_req;
                      return (
                        <div key={idx} className="p-3 flex justify-between items-center text-xs">
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">{it.nama_produk}</div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {it.sku} {it.size ? `• Size: ${it.size}` : ''} • 📍 {it.lokasi}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold">
                              {it.qty_picked} / {it.qty_req} Pcs
                            </div>
                            <div>
                              {selisih === 0 && (
                                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                                  Pas (0)
                                </span>
                              )}
                              {selisih < 0 && (
                                <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                                  Kurang {Math.abs(selisih)}
                                </span>
                              )}
                              {selisih > 0 && (
                                <span className="text-[10px] font-extrabold text-rose-600 dark:text-rose-400">
                                  Lebih +{selisih}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Unexpected Items */}
                    {unexpectedItems.map((it, idx) => (
                      <div key={'unexp-' + idx} className="p-3 bg-rose-50/50 dark:bg-rose-950/20 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                            <span className="text-[9px] bg-rose-200 dark:bg-rose-900 px-1.5 py-0.5 rounded font-extrabold">SALAH</span>
                            {it.nama_produk}
                          </div>
                          <div className="text-[11px] font-mono text-rose-400">{it.sku}</div>
                        </div>
                        <div className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          +{it.qty_picked} Pcs
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Catatan / Keterangan Petugas */}
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Catatan / Alasan Selisih (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={rekapCatatan}
                    onChange={(e) => setRekapCatatan(e.target.value)}
                    placeholder="Contoh: Stok di rak A-02 habis 1 pcs, selebihnya lengkap..."
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white outline-none focus:border-[#ff7a00]"
                  />
                </div>

                {/* Checkbox Sync Out */}
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncOutLog}
                    onChange={(e) => setSyncOutLog(e.target.checked)}
                    className="w-4 h-4 rounded text-[#ff7a00] focus:ring-[#ff7a00]"
                  />
                  <span>Otomatis catat mutasi keluar (OUT) di database log_produk</span>
                </label>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRekapModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
                >
                  Lanjut Picking
                </button>
                <button
                  type="button"
                  disabled={isSubmittingRekap}
                  onClick={handleConfirmCompleteSJ}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSubmittingRekap ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Konfirmasi & Selesaikan SJ
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: DAFTAR SURAT JALAN / INVOICE (List Per SJ)
  // =========================================================================
  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-200">
      {/* Header & Stats */}
      <div className="flex flex-wrap justify-between items-center gap-3 bg-white dark:bg-[#131d31] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-white uppercase flex items-center gap-2">
            <Package className="w-5 h-5 text-[#ff7a00]" /> Tugas Picking (Per Surat Jalan)
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Pilih 1 Surat Jalan untuk memulai pengambilan barang secara terpandu.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadPickingList}
            disabled={loading}
            className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-[#ff7a00] text-slate-600 dark:text-slate-300 transition-colors"
            title="Muat Ulang / Sinkronisasi Database"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#ff7a00]' : ''}`} />
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-2.5 bg-[#ff7a00] hover:bg-[#e06c00] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Buat SJ Baru
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white dark:bg-[#131d31] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 mr-2">
            <input
              type="checkbox"
              checked={selectedSJs.length === filteredSJs.length && filteredSJs.length > 0}
              onChange={handleSelectAllSJs}
              className="w-4 h-4 rounded text-[#ff7a00] focus:ring-[#ff7a00] cursor-pointer"
              title="Pilih Semua"
            />
          </div>
          {/* Status Segmented Tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1">
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white dark:bg-[#131d31] text-[#ff7a00] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Belum Selesai ({sjGroups.filter((g) => g.status !== 'SELESAI').length})
            </button>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-[#131d31] text-[#ff7a00] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Semua ({sjGroups.length})
            </button>
            <button
              onClick={() => setStatusFilter('SELESAI')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
                statusFilter === 'SELESAI'
                  ? 'bg-white dark:bg-[#131d31] text-[#ff7a00] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Selesai ({sjGroups.filter((g) => g.status === 'SELESAI').length})
            </button>
          </div>
          {/* Multiple Actions */}
          {selectedSJs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {selectedSJs.length} Terpilih
              </span>
              <button
                onClick={handleMarkCompleteSelected}
                disabled={isBulkActionRunning}
                className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 font-extrabold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Selesaikan
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={isBulkActionRunning}
                className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 font-extrabold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Hapus
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari Nomor SJ / Tujuan / SKU / Nama Produk..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:border-[#ff7a00] outline-none"
          />
        </div>
      </div>

      {/* Surat Jalan Cards List */}
      <div className="space-y-3">
        {loading && sjGroups.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200 dark:border-slate-800">
            <Loader2 className="w-8 h-8 text-[#ff7a00] animate-spin mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-500">Memuat Surat Jalan dari Database...</p>
          </div>
        ) : filteredSJs.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed p-6">
            <CheckCircle2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Tidak ada Surat Jalan dalam kategori ini
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Belum ada tugas picking atau semua Surat Jalan sudah diselesaikan.
            </p>
            {sjGroups.length === 0 && (
              <button
                onClick={handleSeedSampleSJ}
                className="px-4 py-2.5 bg-[#ff7a00]/10 hover:bg-[#ff7a00]/20 text-[#ff7a00] font-extrabold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" /> Buat Contoh Surat Jalan Picking
              </button>
            )}
          </div>
        ) : (
          filteredSJs.slice(0, 100).map((group) => {
            const isDone = group.status === 'SELESAI';
            const percent =
              group.total_qty_req > 0
                ? Math.min(100, Math.round((group.total_qty_picked / group.total_qty_req) * 100))
                : 100;

            return (
              <div
                key={group.no_sj}
                className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131d31] border transition-all shadow-sm ${
                  isDone
                    ? 'border-emerald-200 dark:border-emerald-950 bg-emerald-50/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-[#ff7a00]'
                }`}
              >
                <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSJs.includes(group.no_sj)}
                        onChange={() => handleSelectSJCheckbox(group.no_sj)}
                        className="w-4 h-4 rounded text-[#ff7a00] focus:ring-[#ff7a00] cursor-pointer"
                      />
                      <span className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">
                        {group.no_sj}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          isDone
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50'
                            : group.status === 'SEDANG PICKING'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200'
                            : 'bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/20'
                        }`}
                      >
                        {group.status}
                      </span>
                    </div>

                    <div className="text-xs font-medium text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
                        <Truck className="w-3.5 h-3.5 text-slate-400" /> {group.tujuan}
                      </span>
                      <span>•</span>
                      <span>📅 {group.tanggal}</span>
                      {group.picker_name && (
                        <>
                          <span>•</span>
                          <span>Picker: <b>{group.picker_name}</b></span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center gap-2">
                    {!isDone && (
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenEditSJModal(group); }}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                          title="Edit SJ"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSingleSJ(group.no_sj); }}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                          title="Hapus SJ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {group.no_sj.startsWith('SPS') && !isDone && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePrintSPS(group); }}
                        className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-xl text-[10px] font-extrabold uppercase transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                        title="Cetak SJ Peminjaman"
                      >
                        <Printer className="w-4 h-4" /> Cetak SJ
                      </button>
                    )}
                    {isDone && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePrintHasilPicking(group); }}
                        className="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-xl text-[10px] font-extrabold uppercase transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                        title="Cetak Hasil Picking"
                      >
                        <Printer className="w-4 h-4" /> Cetak Hasil
                      </button>
                    )}
                    <button
                      onClick={() => handleSelectSJ(group)}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
                        isDone
                          ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          : 'bg-[#ff7a00] hover:bg-[#e06c00] text-white shadow-[#ff7a00]/20'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <FileText className="w-3.5 h-3.5" /> Detail Rekap
                        </>
                      ) : (
                        <>
                          <ScanBarcode className="w-4 h-4" /> Mulai Picking
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress bar and Items summary */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-500 dark:text-slate-400">
                      {group.total_items} SKU Produk • {group.total_qty_picked} / {group.total_qty_req} Pcs
                    </span>
                    <span className={isDone ? 'text-emerald-600' : 'text-[#ff7a00]'}>{percent}%</span>
                  </div>

                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isDone ? 'bg-emerald-500' : 'bg-[#ff7a00]'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Preview First 2 items */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {group.items.slice(0, 3).map((it, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-medium bg-slate-50 dark:bg-[#0f172a] text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800"
                      >
                        {it.nama_produk} ({it.qty_req}x)
                      </span>
                    ))}
                    {group.items.length > 3 && (
                      <span className="text-[10px] font-bold text-slate-400 px-1 py-0.5">
                        +{group.items.length - 3} item lainnya
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL LIHAT DETAIL REKAP SJ YANG SUDAH SELESAI */}
      {viewCompletedSJ && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
              <div>
                <span className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-wider">
                  Hasil Rekap Surat Jalan (Selesai)
                </span>
                <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase">
                  {viewCompletedSJ.no_sj}
                </h2>
                <p className="text-xs text-slate-500 font-medium">Tujuan: {viewCompletedSJ.tujuan} • Picker: {viewCompletedSJ.picker_name || '-'}</p>
              </div>
              <button
                onClick={() => setViewCompletedSJ(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 text-[10px] font-extrabold uppercase text-slate-500 flex justify-between">
                  <span>Item Surat Jalan</span>
                  <span>Target vs Terambil</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {viewCompletedSJ.items.map((it, idx) => {
                    const selisih = it.qty_picked - it.qty_req;
                    return (
                      <div key={idx} className="p-3 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">{it.nama_produk}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {it.sku} • 📍 {it.lokasi}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold">
                            {it.qty_picked} / {it.qty_req} Pcs
                          </div>
                          <div>
                            {selisih === 0 && (
                              <span className="text-[10px] font-extrabold text-emerald-600">Pas (0)</span>
                            )}
                            {selisih < 0 && (
                              <span className="text-[10px] font-extrabold text-amber-600">Kurang {Math.abs(selisih)}</span>
                            )}
                            {selisih > 0 && (
                              <span className="text-[10px] font-extrabold text-rose-600">Lebih +{selisih}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {viewCompletedSJ.unexpected_items.map((it, idx) => (
                    <div key={'unexp-' + idx} className="p-3 bg-rose-50/50 dark:bg-rose-950/20 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-rose-700 dark:text-rose-300">[SALAH AMBIL] {it.nama_produk}</div>
                        <div className="text-[11px] font-mono text-rose-400">{it.sku}</div>
                      </div>
                      <div className="text-right font-mono font-bold text-rose-600">
                        +{it.qty_picked} Pcs
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {viewCompletedSJ.catatan && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Catatan Petugas</div>
                  <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {viewCompletedSJ.catatan}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] text-right">
              <button
                onClick={() => setViewCompletedSJ(null)}
                className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-white font-bold text-xs rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT / KELOLA FORM SURAT JALAN */}
      {isEditSJModalOpen && editingSJGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
              <div>
                <span className="text-[10px] font-extrabold text-[#ff7a00] uppercase tracking-wider">
                  Kelola Form Surat Jalan
                </span>
                <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase">
                  Edit Data & SKU Surat Jalan: {editingSJGroup.no_sj}
                </h2>
              </div>
              <button
                onClick={() => setIsEditSJModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Tujuan Pengiriman
                  </label>
                  <input
                    type="text"
                    value={editSjTujuan}
                    onChange={(e) => setEditSjTujuan(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-[#ff7a00]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Catatan Form Surat Jalan
                  </label>
                  <input
                    type="text"
                    value={editSjCatatan}
                    onChange={(e) => setEditSjCatatan(e.target.value)}
                    placeholder="Contoh: Tambahan order customer / revisi SKU"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white outline-none focus:border-[#ff7a00]"
                  />
                </div>
              </div>

              {/* Add New SKU Quick Row */}
              <div className="p-3 bg-orange-50/50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-900/50 space-y-2">
                <div className="text-xs font-bold text-[#ff7a00] flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Tambah SKU Baru ke Form SJ:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      placeholder="Ketik/Pilih SKU"
                      value={newSjSkuInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewSjSkuInput(val);
                        const match = productCatalog.find((p) => p.k.toUpperCase() === val.trim().toUpperCase());
                        if (match) {
                          setNewSjSkuNama(match.p);
                          setNewSjSkuSize(match.s || '-');
                          setNewSjSkuLoc(match.lokasi || 'A-01');
                        }
                      }}
                      className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <input
                      type="text"
                      placeholder="Nama Produk"
                      value={newSjSkuNama}
                      onChange={(e) => setNewSjSkuNama(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder="Rak"
                      value={newSjSkuLoc}
                      onChange={(e) => setNewSjSkuLoc(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={newSjSkuQty}
                      onChange={(e) => setNewSjSkuQty(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddRowToEditSJ}
                      className="w-full py-2 bg-[#ff7a00] hover:bg-[#e06c00] text-white font-bold text-xs rounded-lg flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Items List inside SJ */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Daftar SKU / Produk Surat Jalan ({editSjRows.length} Item)
                </label>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {editSjRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-4 sm:col-span-3">
                        <label className="text-[9px] font-bold text-slate-400 block mb-0.5 sm:hidden">SKU</label>
                        <input
                          type="text"
                          required
                          placeholder="SKU"
                          value={row.sku}
                          onChange={(e) => {
                            const updated = [...editSjRows];
                            updated[idx].sku = e.target.value;
                            setEditSjRows(updated);
                          }}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-4">
                        <label className="text-[9px] font-bold text-slate-400 block mb-0.5 sm:hidden">Nama Produk</label>
                        <input
                          type="text"
                          required
                          placeholder="Nama Produk"
                          value={row.nama_produk}
                          onChange={(e) => {
                            const updated = [...editSjRows];
                            updated[idx].nama_produk = e.target.value;
                            setEditSjRows(updated);
                          }}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 block mb-0.5 sm:hidden">Rak</label>
                        <input
                          type="text"
                          placeholder="Rak"
                          value={row.lokasi}
                          onChange={(e) => {
                            const updated = [...editSjRows];
                            updated[idx].lokasi = e.target.value;
                            setEditSjRows(updated);
                          }}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-10 sm:col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 block mb-0.5 sm:hidden">Target Qty</label>
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={row.qty_req}
                          onChange={(e) => {
                            const updated = [...editSjRows];
                            updated[idx].qty_req = Math.max(1, Number(e.target.value) || 1);
                            setEditSjRows(updated);
                          }}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveRowFromEditSJ(idx)}
                          className="text-slate-400 hover:text-rose-500 p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                          title="Hapus SKU ini dari SJ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditSJModalOpen(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 font-bold text-xs rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEditSJModal}
                disabled={isSavingSjEdit}
                className="px-5 py-2 bg-[#ff7a00] hover:bg-[#e06c00] text-white font-extrabold text-xs uppercase rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
              >
                {isSavingSjEdit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Simpan Perubahan Form SJ
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT / KOREKSI ITEM PICKING (Ubah Qty, Rak, atau Alihkan Salah Ambil ke SKU SJ) */}
      {isEditItemModalOpen && editingItemData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
              <div>
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
                    editingItemData.type === 'UNEXPECTED'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                      : 'bg-[#ff7a00]/10 text-[#ff7a00]'
                  }`}
                >
                  {editingItemData.type === 'UNEXPECTED' ? 'Koreksi Barang Salah Ambil' : 'Edit Item Picking'}
                </span>
                <h2 className="text-base font-black text-slate-800 dark:text-white mt-1">
                  {editingItemData.nama_produk}
                </h2>
                <div className="text-xs font-mono font-bold text-[#ff7a00]">{editingItemData.sku}</div>
              </div>
              <button
                onClick={() => {
                  setIsEditItemModalOpen(false);
                  setEditingItemData(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* If this is an unexpected/wrong item: offer conversion to SJ item */}
              {editingItemData.type === 'UNEXPECTED' && (
                <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-200 dark:border-blue-800/60 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-blue-800 dark:text-blue-300">
                    <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                    <span>Alihkan ke SKU Surat Jalan Ini:</span>
                  </div>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400">
                    Jika barang fisik ini sebenarnya ditujukan untuk salah satu item dalam Surat Jalan, pilih SKU di bawah untuk langsung mengonversinya:
                  </p>

                  <select
                    value={editingItemData.targetSJItemSku || ''}
                    onChange={(e) =>
                      setEditingItemData({
                        ...editingItemData,
                        targetSJItemSku: e.target.value,
                      })
                    }
                    className="w-full p-2.5 bg-white dark:bg-[#131d31] border border-blue-300 dark:border-blue-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none"
                  >
                    <option value="">-- Tetap sebagai Salah Ambil (atau pilih SKU tujuan) --</option>
                    {activeItems.map((it, idx) => (
                      <option key={idx} value={it.sku}>
                        {it.sku} - {it.nama_produk} (Target: {it.qty_req}, Sudah Pick: {it.qty_picked})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Adjust Qty Picked */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Jumlah yang Dipick (Pcs)
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingItemData({
                          ...editingItemData,
                          qty_picked: Math.max(0, Number(editingItemData.qty_picked || 0) - 1),
                        })
                      }
                      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={editingItemData.qty_picked}
                      onChange={(e) =>
                        setEditingItemData({
                          ...editingItemData,
                          qty_picked: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="flex-1 py-2 text-center bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-800 dark:text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditingItemData({
                          ...editingItemData,
                          qty_picked: Number(editingItemData.qty_picked || 0) + 1,
                        })
                      }
                      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Lokasi Rak Pengambilan
                  </label>
                  <input
                    type="text"
                    value={editingItemData.lokasi_picked || ''}
                    onChange={(e) =>
                      setEditingItemData({
                        ...editingItemData,
                        lokasi_picked: e.target.value,
                      })
                    }
                    placeholder="Contoh: A-01"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white outline-none focus:border-[#ff7a00]"
                  />
                </div>
              </div>

              {/* Pilihan Cepat Semua Lokasi Terdeteksi untuk SKU Ini */}
              {(() => {
                const itemLocs = editingItemData
                  ? getProductLocations(editingItemData.sku, editingItemData.lokasi)
                  : [];
                if (itemLocs.length <= 1) return null;

                return (
                  <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 space-y-2">
                    <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Pilihan Cepat Lokasi Rak ({itemLocs.length} Lokasi Terdeteksi):</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {itemLocs.map((locInfo, lIdx) => {
                        const isSelected =
                          (editingItemData.lokasi_picked || '').toUpperCase() === locInfo.lokasi.toUpperCase();
                        return (
                          <button
                            key={lIdx}
                            type="button"
                            onClick={() =>
                              setEditingItemData({
                                ...editingItemData,
                                lokasi_picked: locInfo.lokasi,
                              })
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                              isSelected
                                ? 'bg-[#ff7a00] text-white shadow-sm ring-2 ring-[#ff7a00]/30'
                                : 'bg-white dark:bg-[#131d31] border border-amber-300 dark:border-amber-700/70 text-slate-800 dark:text-slate-200 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            }`}
                          >
                            <span>📍 {locInfo.lokasi}</span>
                            {locInfo.isPrimary && (
                              <span className="text-[9px] px-1 bg-black/10 rounded font-sans uppercase font-extrabold">
                                Utama
                              </span>
                            )}
                            {!locInfo.isPrimary && (
                              <span className="text-[9px] px-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded font-sans uppercase font-extrabold">
                                Lain
                              </span>
                            )}
                            {locInfo.qty !== undefined && (
                              <span className="text-[10px] opacity-80 font-sans">({locInfo.qty} pcs)</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex justify-between items-center">
              <div>
                {editingItemData.type === 'UNEXPECTED' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteUnexpected(editingItemData.index);
                      setIsEditItemModalOpen(false);
                      setEditingItemData(null);
                    }}
                    className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus Barang Ini
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditItemModalOpen(false);
                    setEditingItemData(null);
                  }}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 font-bold text-xs rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditItem}
                  className="px-5 py-2 bg-[#ff7a00] hover:bg-[#e06c00] text-white font-extrabold text-xs uppercase rounded-xl flex items-center gap-1.5 shadow-md active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" /> Simpan Koreksi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FULFILLMENT REFILL (MULTI-CSV & MANUAL) */}
      {/* Custom Confirm Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-sm shadow-rose-500/20 transition-all active:scale-95"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      <FulfillmentRefillModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        currentUser={currentUser}
        productCatalog={productCatalog}
        existingSJs={sjGroups.map((g) => g.no_sj)}
        onSuccess={(msg, newItems) => {
          onNotify(msg, 'success');
          if (newItems && newItems.length > 0) {
            setRawItems((prev) => {
              const prevFiltered = prev.filter(
                (p) => !newItems.some((n) => n.no_sj.toUpperCase() === p.no_sj?.toUpperCase() && n.sku.toUpperCase() === p.sku?.toUpperCase())
              );
              return [...newItems, ...prevFiltered];
            });
          }
          loadPickingList();
        }}
        onNotify={onNotify}
      />
    </div>
  );
});
