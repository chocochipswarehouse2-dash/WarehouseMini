import React, { useState, useEffect, useRef, useDeferredValue, useMemo, useCallback } from 'react';
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
  AlertTriangle, Eye, EyeOff,
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
  MessageSquare,
  Copy,
  Minimize2,
  Maximize2,
  WifiOff,
  CloudUpload,
  ShieldCheck,
  Users,
  UserPlus,
  Ban,
  LogOut,
} from 'lucide-react';
import { CameraScanner } from './CameraScanner';
import { FulfillmentRefillModal } from './FulfillmentRefillModal';
import { PhysicalScanInput } from './PhysicalScanInput';
import { ErrorBoundary } from './ErrorBoundary';
import { showGlobalLoading, hideGlobalLoading } from '../utils/globalLoading';
import { safeLocalStorageSet, safeLocalStorageRemove, clearHeavyCaches } from '../utils/safeStorage';
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
  getPickingPriority,
  getAreaFromLokasi,
  resolvePrimarySingleLocation,
  getSupabaseClient,
  extractPickingItemFromRow,
  parsePickerNamesList,
  mergePickerNamesWithLastActor,
  fetchActiveSjRealtimeRowsSupabase,
  claimOrJoinPickingSJSupabase,
  leavePickingSJSupabase,
  cancelOrResetPickingSJSupabase,
  invalidatePickingListCache,
  isSameOperatorIdentity,
} from '../services/supabase';
import {
  getPickingOutboxBatches,
  enqueuePickingOutboxBatch,
  syncAllPickingOutboxBatches,
  enqueuePickingItemSyncMutation,
  flushPendingPickingItemSyncQueue,
  getPendingPickingItemSyncCount,
  hasPendingPickingItemSyncForSku,
  clearPendingPickingItemSyncForSj,
  getPickingSjDraftsMap,
  savePickingSjDraft,
  removePickingSjDraft,
  notifyPickingSessionUpdated,
} from '../services/scannerOutboxService';
import { globalRealtimeStore } from '../services/store';
import { addNotificationToHub } from '../services/notificationHubService';
import {
  playSuccessBeep,
  playErrorBeep,
  playCategoryBeep,
  playSaveSuccessChime,
  vibrateDevice,
} from '../services/audio';
import { sortAlphabeticalAndSize, fuzzySearchMultiple, fuzzySearch, partialSearchMatch, extractSizeFromSku, formatProductNameWithSize , cleanProductName } from '../utils/sortUtils';
import { lookupProductBySku } from '../utils/productLookup';
import { formatOperatorWithPersonName, getUserPersonName } from '../utils/userResolver';
import { generateRefillPickingGroupMessage, sendFonnteMessage, getFonnteConfig, getWhatsAppWebUrl } from '../services/whatsapp';


interface PickingTasksViewProps {
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  currentUser: string;
  productCatalog?: ProductItem[];
}

function readStoredPickingSession(): {
  activeSJ: PickingSuratJalanGroup | null;
  activeItems: PickingListItem[];
  unexpectedItems: PickingListItem[];
  activeLocation: string;
  rekapCatatan: string;
  isMinimized: boolean;
} {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem('wms_active_picking_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.activeSJ) {
          return {
            activeSJ: parsed.activeSJ,
            activeItems: Array.isArray(parsed.activeItems) ? parsed.activeItems : [],
            unexpectedItems: Array.isArray(parsed.unexpectedItems) ? parsed.unexpectedItems : [],
            activeLocation: resolvePrimarySingleLocation(parsed.activeLocation || '') || '',
            rekapCatatan: parsed.rekapCatatan || '',
            isMinimized: Boolean(parsed.isMinimized),
          };
        }
      }
    }
  } catch {}
  return {
    activeSJ: null,
    activeItems: [],
    unexpectedItems: [],
    activeLocation: '',
    rekapCatatan: '',
    isMinimized: false,
  };
}

const PickingTasksViewInner: React.FC<PickingTasksViewProps> = React.memo(({
  onNotify,
  currentUser,
  productCatalog = [],
}) => {
  // State: All raw items from Supabase (instant cached initialization)
  const [rawItems, setRawItems] = useState<PickingListItem[]>(() => {
    try {
      const cached = localStorage.getItem('wms_raw_picking_list_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SELESAI'>('ACTIVE');

  // Realtime Stock cache per SKU across all warehouse locations
  const [realtimeSkuStocks, setRealtimeSkuStocks] = useState<Record<string, StockRealtimeItem[]>>({});

  // Active SJ workspace state hydrated synchronously so mount never flickers or clears minimized dock
  const initialStoredSession = useMemo(() => readStoredPickingSession(), []);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [activeSJ, setActiveSJ] = useState<PickingSuratJalanGroup | null>(initialStoredSession.activeSJ);
  const [activeItems, setActiveItems] = useState<PickingListItem[]>(initialStoredSession.activeItems);
  const [unexpectedItems, setUnexpectedItems] = useState<PickingListItem[]>(initialStoredSession.unexpectedItems);
  const [isMinimized, setIsMinimized] = useState<boolean>(initialStoredSession.isMinimized);

  // Offline Protection & Outbox Sync states
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pickingOutboxCount, setPickingOutboxCount] = useState<number>(() =>
    getPickingOutboxBatches().length
  );
  const [isSyncingPickingOutbox, setIsSyncingPickingOutbox] = useState<boolean>(false);
  const [draftsRevision, setDraftsRevision] = useState<number>(0);

  // 2-Phase Scanning State (Fase 1: Tembak Lokasi -> Fase 2: Tembak SKU)
  const [activeLocation, setActiveLocation] = useState<string>(initialStoredSession.activeLocation);
  const [manualLocIndex, setManualLocIndex] = useState<number | null>(null);
  const [manualLocInput, setManualLocInput] = useState<string>('');
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

  // Memoized Catalog Maps for O(1) product name, size & rack resolution across ~29,000 SKUs
  const { catalogMap, catalogCompactMap } = useMemo(() => {
    const exact = new Map<string, ProductItem>();
    const compact = new Map<string, ProductItem>();
    if (Array.isArray(productCatalog)) {
      for (let i = 0; i < productCatalog.length; i++) {
        const p = productCatalog[i];
        if (!p) continue;
        if (p.k) {
          const kUpper = p.k.trim().toUpperCase();
          if (kUpper) {
            exact.set(kUpper, p);
            const kComp = kUpper.replace(/\s+/g, '');
            if (kComp && !compact.has(kComp)) compact.set(kComp, p);
          }
        }
        const altSku = (p as any).sku;
        if (altSku) {
          const sUpper = String(altSku).trim().toUpperCase();
          if (sUpper) {
            if (!exact.has(sUpper)) exact.set(sUpper, p);
            const sComp = sUpper.replace(/\s+/g, '');
            if (sComp && !compact.has(sComp)) compact.set(sComp, p);
          }
        }
      }
    }
    return { catalogMap: exact, catalogCompactMap: compact };
  }, [productCatalog]);

  const fastFindCatalogProduct = useCallback(
    (rawSku?: string): ProductItem | undefined => {
      const cleanSku = String(rawSku || '').trim().toUpperCase();
      if (!cleanSku) return undefined;
      return catalogMap.get(cleanSku) || catalogCompactMap.get(cleanSku.replace(/\s+/g, ''));
    },
    [catalogMap, catalogCompactMap]
  );

  const resolveProductName = useCallback(
    (sku: string, rawName?: string) => {
      const cleanSku = (sku || '').trim().toUpperCase();
      const cleanRaw = (rawName || '').trim();
      const isSku =
        !cleanRaw ||
        cleanRaw.toUpperCase() === cleanSku ||
        cleanRaw.toUpperCase().replace(/\s+/g, '') === cleanSku.replace(/\s+/g, '');
      if (!isSku && cleanRaw) return cleanRaw;

      const cat = fastFindCatalogProduct(cleanSku);
      const catName = (cat?.p || cat?.nama_produk || cat?.n || (cat as any)?.nama || (cat as any)?.name || '').trim();
      if (catName) return catName;

      return cleanRaw || cleanSku;
    },
    [fastFindCatalogProduct]
  );

  // Scanner & Input Modes: 'fisik' | 'manual' | 'kamera'
  const [inputMode, setInputMode] = useState<'fisik' | 'manual' | 'kamera'>('fisik');
  const [scanInput, setScanInput] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Manual Search & Autocomplete States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQty, setSearchQty] = useState<number | ''>(1);
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
  const [deletedSjItems, setDeletedSjItems] = useState<PickingListItem[]>([]);
  const [newSjSkuInput, setNewSjSkuInput] = useState('');
  const [newSjSkuNama, setNewSjSkuNama] = useState('');
  const [newSjSkuSize, setNewSjSkuSize] = useState('');
  const [newSjSkuLoc, setNewSjSkuLoc] = useState('');
  const [newSjSkuQty, setNewSjSkuQty] = useState<number | ''>(1);
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

  // Modal Alert Tabrakan Over-Pick Multi-Picker (muncul di layar petugas yang mengambil terakhir melebihi qty_req)
  const [overPickAlertModal, setOverPickAlertModal] = useState<{
    isOpen: boolean;
    sku: string;
    nama_produk: string;
    size?: string;
    lokasi?: string;
    qtyReq: number;
    newQty: number;
    excessQty: number;
    previousPicker: string;
    itemIndex: number;
  } | null>(null);

  // Modal Batal Ambil / Batal Bantu / Simpan Progres Picking
  const [cancelPickingModal, setCancelPickingModal] = useState<{
    isOpen: boolean;
    group: PickingSuratJalanGroup;
    isCoPickingWithOthers: boolean;
    pickedQty: number;
    kosongCount: number;
    unexpectedQty: number;
    totalReq: number;
    otherPickers: string[];
    source: 'VIEW1' | 'VIEW2';
    intent: 'EXIT_FORM' | 'CANCEL_PICK' | 'RESET_ONLY';
  } | null>(null);
  const [isCancellingPicking, setIsCancellingPicking] = useState(false);

  // Realtime Multi-Picker Collaboration Refs
  const collabChannelRef = useRef<any>(null);
  const pendingLocalSyncSkusRef = useRef<Map<string, number>>(new Map());
  const recentlyMutatedSjRef = useRef<Map<string, number>>(new Map());
  const [pendingItemSyncCount, setPendingItemSyncCount] = useState<number>(() =>
    getPendingPickingItemSyncCount()
  );
  const syncPendingPickingItemsRef = useRef<((showToastOnSync?: boolean) => Promise<void>) | null>(
    null
  );
  const markSjLocallyMutated = useCallback((noSj: string, ttlMs = 4500) => {
    const key = String(noSj || '').toUpperCase().trim();
    if (!key) return;
    recentlyMutatedSjRef.current.set(key, Date.now() + ttlMs);
  }, []);
  const activeSJRef = useRef<PickingSuratJalanGroup | null>(activeSJ);
  activeSJRef.current = activeSJ;
  const isSubmittingRekapRef = useRef<boolean>(false);

  // Modal Rekap Penyelesaian
  const [isRekapModalOpen, setIsRekapModalOpen] = useState(false);
  const [rekapCatatan, setRekapCatatan] = useState(initialStoredSession.rekapCatatan);
  const [syncOutLog, setSyncOutLog] = useState(true);
  const [isSubmittingRekap, setIsSubmittingRekap] = useState(false);
  isSubmittingRekapRef.current = isSubmittingRekap;

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

  // Broadcast helper for instant peer-to-peer multi-picker updates
  const broadcastPickingCollabEvent = useCallback(
    (
      eventType: 'item_updated' | 'picker_joined' | 'picker_left' | 'sj_completed' | 'sj_cancelled',
      payload: Record<string, any>
    ) => {
      try {
        if (collabChannelRef.current) {
          collabChannelRef.current.send({
            type: 'broadcast',
            event: eventType,
            payload: {
              ...payload,
              actor: currentUser,
              ts: Date.now(),
            },
          });
        }
      } catch {}
    },
    [currentUser]
  );

  // Merge remote rows into activeSJ & rawItems without clobbering in-flight local scans
  const applyRemoteSjRowsToState = useCallback(
    (noSj: string, remoteRows: PickingListItem[], forceApply = false) => {
      if (!remoteRows || remoteRows.length === 0) return;
      const cleanNoSj = noSj.toUpperCase().trim();
      const nowMs = Date.now();
      const suppressUntil = recentlyMutatedSjRef.current.get(cleanNoSj) || 0;
      if (!forceApply && nowMs < suppressUntil) {
        return;
      }

      // Check if SJ was completed by a co-picker
      const isRemotelyCompleted =
        remoteRows.length > 0 && remoteRows.every((r) => (r.status || '').toUpperCase().trim() === 'SELESAI');

      if (
        isRemotelyCompleted &&
        activeSJRef.current &&
        activeSJRef.current.no_sj.toUpperCase().trim() === cleanNoSj &&
        !isSubmittingRekapRef.current
      ) {
        const finalPickers = Array.from(
          new Set(remoteRows.flatMap((r) => parsePickerNamesList(r.picker_name)))
        );
        const completedByLabel =
          finalPickers.length > 0
            ? finalPickers.map((p) => formatOperatorWithPersonName(p)).join(', ')
            : 'Rekan Tim Picker';
        try {
          const compStr = localStorage.getItem('wms_completed_sjs_set');
          const compSet = new Set<string>(compStr ? JSON.parse(compStr) : []);
          compSet.add(cleanNoSj);
          localStorage.setItem('wms_completed_sjs_set', JSON.stringify(Array.from(compSet)));
        } catch {}
        removePickingSjDraft(cleanNoSj);
        playSaveSuccessChime();
        onNotify(
          `✅ Surat Jalan ${cleanNoSj} telah diselesaikan oleh rekan tim (${completedByLabel})!`,
          'success'
        );
        setIsRekapModalOpen(false);
        setOverPickAlertModal(null);
        setIsMinimized(false);
        setActiveSJ(null);
        setActiveItems([]);
        setUnexpectedItems([]);
        setActiveLocation('');
        setRekapCatatan('');
        setDraftsRevision((r) => r + 1);
      }

      // Update activeItems if currently viewing this SJ
      if (
        !isRemotelyCompleted &&
        activeSJRef.current &&
        activeSJRef.current.no_sj.toUpperCase().trim() === cleanNoSj
      ) {
        const remoteBySku = new Map<string, PickingListItem>();
        const allPickersSet = new Set<string>();
        remoteRows.forEach((r) => {
          remoteBySku.set(r.sku.toUpperCase().trim(), r);
          parsePickerNamesList(r.picker_name).forEach((p) => allPickersSet.add(p));
        });

        setActiveItems((prev) => {
          let changed = false;
          const next = prev.map((localIt) => {
            const skuKey = localIt.sku.toUpperCase().trim();
            const pendingTs = pendingLocalSyncSkusRef.current.get(skuKey) || 0;
            // Skip overwriting SKU with unsynced local offline mutations OR modified within last 2.2s
            if (hasPendingPickingItemSyncForSku(cleanNoSj, skuKey) || nowMs - pendingTs < 2200) {
              return localIt;
            }

            const rem = remoteBySku.get(skuKey);
            if (!rem) return localIt;

            const remStatus =
              rem.status === 'KOSONG'
                ? ('KOSONG' as const)
                : rem.qty_picked >= localIt.qty_req
                ? ('SELESAI' as const)
                : rem.qty_picked > 0
                ? ('SEDANG PICKING' as const)
                : ('SEDANG PICKING' as const);
            const remIsKosong = rem.status === 'KOSONG';

            if (
              rem.qty_picked !== localIt.qty_picked ||
              remStatus !== localIt.status ||
              Boolean(remIsKosong) !== Boolean(localIt.is_kosong) ||
              (rem.picker_name ?? '') !== (localIt.picker_name ?? '')
            ) {
              changed = true;
              return {
                ...localIt,
                id: rem.id || localIt.id,
                qty_picked: rem.qty_picked,
                status: remStatus,
                is_kosong: remIsKosong,
                picker_name: rem.picker_name !== undefined ? rem.picker_name : localIt.picker_name,
                last_picked_by: rem.last_picked_by || localIt.last_picked_by,
              };
            }
            return localIt;
          });
          return changed ? next : prev;
        });

        const nextActivePickers: string[] = [];
        allPickersSet.forEach((p) => {
          if (!nextActivePickers.some((ex) => isSameOperatorIdentity(ex, p))) {
            nextActivePickers.push(p);
          }
        });
        setActiveSJ((prevSj) => {
          if (!prevSj || prevSj.no_sj.toUpperCase().trim() !== cleanNoSj) return prevSj;
          const joinedStr = nextActivePickers.join(', ');
          if ((prevSj.picker_name || '') === joinedStr) return prevSj;
          return {
            ...prevSj,
            picker_name: joinedStr,
            active_pickers: nextActivePickers,
          };
        });
      }

      // Always keep rawItems synced so View 1 queue cards stay up to date
      setRawItems((prevRaw) => {
        const remoteMap = new Map<string, PickingListItem>();
        remoteRows.forEach((r) => remoteMap.set(`${cleanNoSj}__${r.sku.toUpperCase().trim()}`, r));
        let anyDiff = false;
        const nextRaw = prevRaw.map((item) => {
          const itemSj = (item.no_sj || '').toUpperCase().trim();
          if (itemSj !== cleanNoSj) return item;
          const skuKey = (item.sku || '').toUpperCase().trim();
          if (hasPendingPickingItemSyncForSku(cleanNoSj, skuKey)) return item;
          const rem = remoteMap.get(`${cleanNoSj}__${skuKey}`);
          if (!rem) return item;
          if (
            rem.qty_picked !== item.qty_picked ||
            rem.status !== item.status ||
            rem.picker_name !== item.picker_name
          ) {
            anyDiff = true;
            return {
              ...item,
              qty_picked: rem.qty_picked,
              status: rem.status,
              is_kosong: rem.is_kosong,
              picker_name: rem.picker_name,
              last_picked_by: rem.last_picked_by,
            };
          }
          return item;
        });
        return anyDiff ? nextRaw : prevRaw;
      });
    },
    [onNotify]
  );

  // Flush queued per-item offline mutations BEFORE polling/refreshing remote SJ state
  const syncPendingPickingItemsAndApply = useCallback(
    async (showToastOnSync = false) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const res = await flushPendingPickingItemSyncQueue();
      setPendingItemSyncCount(res.remainingCount);
      if (res.syncedItems.length === 0) return;

      const syncedBySjSku = new Map(res.syncedItems.map((s) => [s.key, s]));
      const activeNoSj = activeSJRef.current?.no_sj?.toUpperCase().trim() || '';

      res.syncedItems.forEach((s) => {
        pendingLocalSyncSkusRef.current.set(s.sku, Date.now());
        broadcastPickingCollabEvent('item_updated', {
          no_sj: s.no_sj,
          sku: s.sku,
          qty_picked: s.newQty,
          status: s.item?.status,
        });
      });

      if (activeNoSj) {
        setActiveItems((prev) => {
          let changed = false;
          const next = prev.map((it) => {
            const skuKey = (it.sku || '').toUpperCase().trim();
            const synced = syncedBySjSku.get(`${activeNoSj}__${skuKey}`);
            if (!synced || !synced.item || hasPendingPickingItemSyncForSku(activeNoSj, skuKey)) {
              return it;
            }
            const reqQty = Math.max(1, Number(it.qty_req) || 1);
            const authKosong = Boolean(synced.item.is_kosong || synced.item.status === 'KOSONG');
            const authStatus: PickingListItem['status'] = authKosong
              ? 'KOSONG'
              : synced.newQty >= reqQty
              ? 'SELESAI'
              : synced.newQty > 0
              ? 'SEDANG PICKING'
              : 'PENDING';
            changed = true;
            return {
              ...it,
              id: synced.item.id || it.id,
              qty_picked: synced.newQty,
              lokasi_picked: it.lokasi_picked || synced.item.lokasi_picked,
              status: authStatus,
              is_kosong: authKosong,
              picker_name: synced.item.picker_name || it.picker_name,
              last_picked_by: synced.item.last_picked_by || currentUser,
            };
          });
          return changed ? next : prev;
        });
      }

      setRawItems((prev) => {
        let changed = false;
        const nextRaw = prev.map((it) => {
          const sjKey = (it.no_sj || '').toUpperCase().trim();
          const skuKey = (it.sku || '').toUpperCase().trim();
          const synced = syncedBySjSku.get(`${sjKey}__${skuKey}`);
          if (!synced || !synced.item || hasPendingPickingItemSyncForSku(sjKey, skuKey)) {
            return it;
          }
          const authKosong = Boolean(synced.item.is_kosong || synced.item.status === 'KOSONG');
          changed = true;
          return {
            ...it,
            qty_picked: synced.newQty,
            status: authKosong ? ('KOSONG' as const) : synced.newQty > 0 ? ('SEDANG PICKING' as const) : ('PENDING' as const),
            is_kosong: authKosong,
            picker_name: synced.item.picker_name || it.picker_name,
            last_picked_by: synced.item.last_picked_by || currentUser,
          };
        });
        return changed ? nextRaw : prev;
      });

      if (activeNoSj) {
        res.syncedItems.forEach((synced) => {
          if (synced.no_sj !== activeNoSj || !synced.item) return;
          const reqQty = Math.max(1, Number(synced.item.qty_req) || 1);
          if (synced.isOverPick && synced.newQty > reqQty) {
            playErrorBeep();
            vibrateDevice([250, 100, 250, 100, 250]);
            const lookup = lookupProductBySku(
              synced.item.sku,
              catalogMap,
              synced.item.nama_produk,
              synced.item.size
            );
            setOverPickAlertModal((prevModal) => {
              if (prevModal) return prevModal;
              const matchIdx = activeItems.findIndex(
                (x) => (x.sku || '').toUpperCase().trim() === synced.sku
              );
              return {
                isOpen: true,
                sku: synced.sku,
                nama_produk: lookup.nama_produk || synced.item?.nama_produk || synced.sku,
                size: synced.item?.size || lookup.size || '-',
                lokasi: synced.item?.lokasi_picked || synced.item?.lokasi || '-',
                qtyReq: reqQty,
                newQty: synced.newQty,
                excessQty: synced.newQty - reqQty,
                previousPicker: synced.previousPicker || currentUser || 'Petugas Lain',
                itemIndex: matchIdx >= 0 ? matchIdx : 0,
              };
            });
          }
        });
      }

      setDraftsRevision((r) => r + 1);
      if (showToastOnSync) {
        onNotify(
          `✅ Koneksi kembali! ${res.syncedItems.length} item picking offline berhasil disinkronkan ke server.`,
          'success'
        );
      }
    },
    [broadcastPickingCollabEvent, catalogMap, currentUser, onNotify, activeItems]
  );

  syncPendingPickingItemsRef.current = syncPendingPickingItemsAndApply;

  // Flush any pending offline item scans before initial Supabase load so stale remote never overwrites them
  useEffect(() => {
    (syncPendingPickingItemsRef.current
      ? syncPendingPickingItemsRef.current(false).catch(() => {})
      : Promise.resolve()
    ).finally(() => {
      loadPickingList();
    });
  }, []);

  // Supabase Realtime Channel (Broadcast + Postgres Changes) & Coalesced Polling for Multi-Picker Sync
  useEffect(() => {
    let channel: any = null;
    const sb = getSupabaseClient();
    const pendingRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const inFlightSjSet = new Set<string>();

    const scheduleRealtimeSjRefresh = (rawNoSj: string, delayMs = 260) => {
      const targetSj = String(rawNoSj || '').toUpperCase().trim();
      if (!targetSj) return;
      const existingTimer = pendingRefreshTimers.get(targetSj);
      if (existingTimer) clearTimeout(existingTimer);
      pendingRefreshTimers.set(
        targetSj,
        setTimeout(() => {
          pendingRefreshTimers.delete(targetSj);
          if (inFlightSjSet.has(targetSj)) return;
          inFlightSjSet.add(targetSj);
          fetchActiveSjRealtimeRowsSupabase(targetSj)
            .then((rows) => applyRemoteSjRowsToState(targetSj, rows))
            .catch(() => {})
            .finally(() => {
              inFlightSjSet.delete(targetSj);
            });
        }, delayMs)
      );
    };

    if (sb) {
      channel = sb
        .channel('wms_picking_live_collab')
        .on('broadcast', { event: 'item_updated' }, (msg: any) => {
          const p = msg?.payload;
          if (!p || !p.no_sj || p.actor === currentUser) return;
          scheduleRealtimeSjRefresh(p.no_sj, 150);
        })
        .on('broadcast', { event: 'picker_joined' }, (msg: any) => {
          const p = msg?.payload;
          if (!p || !p.no_sj) return;
          const targetSj = String(p.no_sj).toUpperCase().trim();
          if (
            p.actor &&
            p.actor !== currentUser &&
            activeSJRef.current &&
            activeSJRef.current.no_sj.toUpperCase().trim() === targetSj
          ) {
            onNotify(
              `🤝 ${formatOperatorWithPersonName(p.actor)} ikut membantu mengerjakan SJ ${targetSj}!`,
              'info'
            );
          }
          scheduleRealtimeSjRefresh(targetSj, 150);
        })
        .on('broadcast', { event: 'picker_left' }, (msg: any) => {
          const p = msg?.payload;
          if (!p || !p.no_sj) return;
          const targetSj = String(p.no_sj).toUpperCase().trim();
          if (
            p.actor &&
            p.actor !== currentUser &&
            activeSJRef.current &&
            activeSJRef.current.no_sj.toUpperCase().trim() === targetSj
          ) {
            onNotify(
              `👋 ${formatOperatorWithPersonName(p.actor)} batal bantu / keluar dari SJ ${targetSj}.`,
              'info'
            );
          }
          scheduleRealtimeSjRefresh(targetSj, 150);
        })
        .on('broadcast', { event: 'sj_cancelled' }, (msg: any) => {
          const p = msg?.payload;
          if (!p || !p.no_sj) return;
          const targetSj = String(p.no_sj).toUpperCase().trim();
          if (
            p.actor &&
            p.actor !== currentUser &&
            activeSJRef.current &&
            activeSJRef.current.no_sj.toUpperCase().trim() === targetSj
          ) {
            removePickingSjDraft(targetSj);
            setIsMinimized(false);
            setIsRekapModalOpen(false);
            setOverPickAlertModal(null);
            setActiveSJ(null);
            setActiveItems([]);
            setUnexpectedItems([]);
            setActiveLocation('');
            setRekapCatatan('');
            setDraftsRevision((r) => r + 1);
            onNotify(
              `↺ Surat Jalan ${targetSj} dibatalkan & dikembalikan ke PENDING oleh ${formatOperatorWithPersonName(p.actor)}.`,
              'warning'
            );
          }
          scheduleRealtimeSjRefresh(targetSj, 150);
        })
        .on('broadcast', { event: 'sj_completed' }, (msg: any) => {
          const p = msg?.payload;
          if (!p || !p.no_sj || p.actor === currentUser) return;
          scheduleRealtimeSjRefresh(p.no_sj, 150);
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'picking_list' },
          (payload: any) => {
            const changedSj = String(payload?.new?.no_sj || payload?.old?.no_sj || '')
              .toUpperCase()
              .trim();
            if (!changedSj) return;
            const currentOpenSj = activeSJRef.current?.no_sj?.toUpperCase().trim();
            // Coalesce burst row updates (e.g. 40 rows updated at once) into 1 single fetch per SJ
            scheduleRealtimeSjRefresh(changedSj, currentOpenSj === changedSj ? 220 : 500);
          }
        )
        .subscribe();
      collabChannelRef.current = channel;
    }

    // Throttled polling fallback (skips hidden tabs & flushes offline item queue BEFORE pulling remote)
    let tickCount = 0;
    const pollInterval = setInterval(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      tickCount += 1;
      if (getPendingPickingItemSyncCount() > 0 && syncPendingPickingItemsRef.current) {
        await syncPendingPickingItemsRef.current(true).catch(() => {});
      }
      const currentActive = activeSJRef.current;
      if (currentActive && currentActive.no_sj) {
        scheduleRealtimeSjRefresh(currentActive.no_sj, 50);
      } else if (tickCount % 3 === 0) {
        fetchPickingListFromSupabase(true)
          .then((data) => {
            if (Array.isArray(data) && data.length > 0) {
              const now = Date.now();
              setRawItems((prev) => {
                const pendingBySjSku = new Map<string, PickingListItem>();
                prev.forEach((it) => {
                  const kSj = (it.no_sj || '').toUpperCase().trim();
                  const kSku = (it.sku || '').toUpperCase().trim();
                  if (kSj && kSku && hasPendingPickingItemSyncForSku(kSj, kSku)) {
                    pendingBySjSku.set(`${kSj}__${kSku}`, it);
                  }
                });

                const guardedSjs = new Set<string>();
                recentlyMutatedSjRef.current.forEach((until, sjKey) => {
                  if (now < until) guardedSjs.add(sjKey);
                  else recentlyMutatedSjRef.current.delete(sjKey);
                });

                let nextData = data;
                if (guardedSjs.size > 0) {
                  const prevBySj = new Map<string, PickingListItem[]>();
                  prev.forEach((it) => {
                    const k = (it.no_sj || '').toUpperCase().trim();
                    if (guardedSjs.has(k)) {
                      const arr = prevBySj.get(k) || [];
                      arr.push(it);
                      prevBySj.set(k, arr);
                    }
                  });
                  nextData = data.filter((it) => !guardedSjs.has((it.no_sj || '').toUpperCase().trim()));
                  prevBySj.forEach((arr) => nextData.push(...arr));
                }

                if (pendingBySjSku.size === 0) return nextData;
                return nextData.map((it) => {
                  const key = `${(it.no_sj || '').toUpperCase().trim()}__${(it.sku || '').toUpperCase().trim()}`;
                  return pendingBySjSku.get(key) || it;
                });
              });
            }
          })
          .catch(() => {});
      }
    }, 3500);

    return () => {
      clearInterval(pollInterval);
      pendingRefreshTimers.forEach((t) => clearTimeout(t));
      pendingRefreshTimers.clear();
      if (sb && channel) {
        sb.removeChannel(channel).catch(() => {});
      }
      collabChannelRef.current = null;
    };
  }, [currentUser, applyRemoteSjRowsToState, onNotify]);

  // Online/Offline, Outbox, & Global Dock Maximize/Minimize Listeners
  useEffect(() => {
    const syncOutboxAndRefresh = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (getPickingOutboxBatches().length === 0) return;
      setIsSyncingPickingOutbox(true);
      try {
        const res = await syncAllPickingOutboxBatches();
        setPickingOutboxCount(res.remainingBatches);
        setDraftsRevision((r) => r + 1);
        if (res.syncedBatches > 0) {
          onNotify(
            `✅ Koneksi kembali! ${res.syncedBatches} Tugas Picking offline berhasil disinkronkan ke Database.`,
            'success'
          );
          loadPickingList();
        }
      } finally {
        setIsSyncingPickingOutbox(false);
      }
    };

    const handleOnline = async () => {
      setIsOnline(true);
      if (syncPendingPickingItemsRef.current) {
        await syncPendingPickingItemsRef.current(true).catch(() => {});
      }
      await syncOutboxAndRefresh();
      const openSj = activeSJRef.current?.no_sj;
      if (openSj) {
        fetchActiveSjRealtimeRowsSupabase(openSj)
          .then((rows) => applyRemoteSjRowsToState(openSj, rows))
          .catch(() => {});
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleMaximizePicking = () => {
      setIsMinimized(false);
    };
    const handleMinimizePicking = () => {
      setIsMinimized(true);
      setInputMode((prev) => (prev === 'kamera' ? 'fisik' : prev));
    };
    const handleClosePickingSession = () => {
      setActiveSJ(null);
      setActiveItems([]);
      setUnexpectedItems([]);
      setActiveLocation('');
      setRekapCatatan('');
      setIsMinimized(false);
      setDraftsRevision((r) => r + 1);
    };
    const handleOutboxChange = () => {
      setPickingOutboxCount(getPickingOutboxBatches().length);
      setDraftsRevision((r) => r + 1);
    };
    const handleItemSyncQueueChange = () => {
      setPendingItemSyncCount(getPendingPickingItemSyncCount());
    };
    const handleListUpdated = () => {
      setDraftsRevision((r) => r + 1);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('wms_maximize_picking_session', handleMaximizePicking);
    window.addEventListener('wms_minimize_picking_session', handleMinimizePicking);
    window.addEventListener('wms_close_picking_session', handleClosePickingSession);
    window.addEventListener('wms_picking_outbox_updated', handleOutboxChange);
    window.addEventListener('wms_picking_item_sync_queue_updated', handleItemSyncQueueChange);
    window.addEventListener('wms_picking_list_updated', handleListUpdated);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('wms_maximize_picking_session', handleMaximizePicking);
      window.removeEventListener('wms_minimize_picking_session', handleMinimizePicking);
      window.removeEventListener('wms_close_picking_session', handleClosePickingSession);
      window.removeEventListener('wms_picking_outbox_updated', handleOutboxChange);
      window.removeEventListener('wms_picking_item_sync_queue_updated', handleItemSyncQueueChange);
      window.removeEventListener('wms_picking_list_updated', handleListUpdated);
    };
  }, []);

  // Persist active picking session & per-SJ draft with light debounce (flush immediately on minimize/exit/unload)
  const flushActivePickingSessionNow = useCallback(() => {
    try {
      if (activeSJ) {
        const cleanActiveLoc = resolvePrimarySingleLocation(activeLocation || '') || '';
        const sessionData = {
          activeSJ,
          activeItems,
          unexpectedItems,
          activeLocation: cleanActiveLoc,
          rekapCatatan,
          isMinimized,
          timestamp: new Date().toISOString(),
        };
        const saved = safeLocalStorageSet('wms_active_picking_session', JSON.stringify(sessionData));
        if (!saved) {
          const lightweightSession = {
            activeSJ,
            activeItems: activeItems.map((it) => ({
              id: it.id,
              sku: it.sku,
              qty_picked: it.qty_picked,
              qty_req: it.qty_req,
              lokasi: it.lokasi,
              lokasi_picked: it.lokasi_picked,
              status: it.status,
              is_kosong: it.is_kosong,
              picker_name: it.picker_name,
              last_picked_by: it.last_picked_by,
            })),
            unexpectedItems,
            activeLocation: cleanActiveLoc,
            rekapCatatan,
            isMinimized,
            timestamp: new Date().toISOString(),
          };
          safeLocalStorageSet('wms_active_picking_session', JSON.stringify(lightweightSession));
        }

        savePickingSjDraft({
          no_sj: activeSJ.no_sj,
          tujuan: activeSJ.tujuan,
          tanggal: activeSJ.tanggal,
          activeItems,
          unexpectedItems,
          activeLocation: cleanActiveLoc,
          rekapCatatan,
          updatedAt: Date.now(),
        });
        notifyPickingSessionUpdated();
      } else {
        safeLocalStorageRemove('wms_active_picking_session');
        notifyPickingSessionUpdated();
      }
    } catch (err) {
      console.warn('[PickingTasksView] Gagal menyimpan sesi picking aktif:', err);
    }
  }, [activeSJ, activeItems, unexpectedItems, activeLocation, rekapCatatan, isMinimized]);

  const flushSessionRef = useRef(flushActivePickingSessionNow);
  flushSessionRef.current = flushActivePickingSessionNow;

  useEffect(() => {
    const timer = setTimeout(() => {
      flushActivePickingSessionNow();
    }, 220);
    return () => {
      clearTimeout(timer);
    };
  }, [flushActivePickingSessionNow]);

  useEffect(() => {
    return () => {
      flushSessionRef.current();
    };
  }, []);

  // Proteksi reload / tab close / force-close saat proses picking aktif sedang berlangsung
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeSJ) {
        flushSessionRef.current();
        const hasPicked = activeItems.some((it) => (it.qty_picked || 0) > 0) || unexpectedItems.length > 0;
        if (hasPicked) {
          e.preventDefault();
          e.returnValue = 'Proses picking sedang berlangsung. Sesi picking Anda tersimpan di penyimpanan lokal, yakin ingin me-reload?';
          return e.returnValue;
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeSJ, activeItems, unexpectedItems]);

  // Autofocus scanner input whenever in picking workspace
  useEffect(() => {
    if (activeSJ && !isRekapModalOpen && !overPickAlertModal && inputMode === 'fisik') {
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 100);
    }
  }, [activeSJ, isRekapModalOpen, overPickAlertModal, inputMode]);

  const loadPickingList = async () => {
    setLoading(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine && getPendingPickingItemSyncCount() > 0 && syncPendingPickingItemsRef.current) {
        await syncPendingPickingItemsRef.current(false).catch(() => {});
      }
      const data = await fetchPickingListFromSupabase(true);
      setRawItems((prev) => {
        const supabaseData = data || [];
        const pendingByKey = new Map<string, PickingListItem>();
        prev.forEach((it) => {
          const sjKey = (it.no_sj || '').toUpperCase().trim();
          const skuKey = (it.sku || '').toUpperCase().trim();
          if (sjKey && skuKey && hasPendingPickingItemSyncForSku(sjKey, skuKey)) {
            pendingByKey.set(`${sjKey}__${skuKey}`, it);
          }
        });
        const protectedData =
          pendingByKey.size > 0
            ? supabaseData.map((rem) => {
                const k = `${(rem.no_sj || '').toUpperCase().trim()}__${(rem.sku || '').toUpperCase().trim()}`;
                return pendingByKey.get(k) || rem;
              })
            : supabaseData;
        try {
          const offlineCacheData = protectedData
            .filter((it) => it.status !== 'SELESAI')
            .slice(0, 100);
          safeLocalStorageSet('wms_raw_picking_list_cache', JSON.stringify(offlineCacheData));
        } catch {}
        return protectedData;
      });
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

  // Helper: Extract all locations for a given item / SKU (strictly warehouse area locations that actually have stock > 0)
  const getProductLocations = (sku: string, itemLokasi?: string): ProductLocationInfo[] => {
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (!cleanSku) return [];
    const map = new Map<string, ProductLocationInfo>();

    // 1. Authoritative check: live Supabase stok_real_fisik data
    const isRealtimeChecked = cleanSku in realtimeSkuStocks;
    if (isRealtimeChecked) {
      const realtimeList = realtimeSkuStocks[cleanSku] || [];
      // ONLY recommend single valid warehouse locations that currently have physical stock (sisa_stok > 0)!
      realtimeList.forEach((stk) => {
        const loc = String(stk.lokasi || '').trim().toUpperCase();
        const qty = Number(stk.sisa_stok) || 0;
        // Skip compound multi-location anomaly rows from stok_real_fisik
        if (loc && !/[,/;\n|]/.test(loc) && loc !== '-' && loc !== '--' && isWarehouseLocation(loc, stk.area) && qty > 0) {
          const existing = map.get(loc);
          if (existing) {
            existing.qty = (existing.qty || 0) + qty;
          } else {
            map.set(loc, {
              lokasi: loc,
              qty: qty,
              isPrimary: false,
              source: 'REALTIME_STOCK',
              area: stk.area || 'Warehouse',
            });
          }
        }
      });

      // If checked against realtime DB and all warehouse locations have 0 stock:
      // Return empty list so we DO NOT recommend empty racks to the picker!
      const sorted = Array.from(map.values()).sort((a, b) => {
        const pA = getPickingPriority(a.lokasi, a.area);
        const pB = getPickingPriority(b.lokasi, b.area);
        if (pA !== pB) return pA - pB;
        return (b.qty || 0) - (a.qty || 0);
      });
      if (sorted.length > 0) {
        sorted[0].isPrimary = true;
      }
      return sorted;
    }

    // 2. Fallback only while realtime data is still loading
    const strItemLokasi = String(itemLokasi || '').trim();
    if (strItemLokasi && strItemLokasi !== '-' && strItemLokasi !== '--') {
      const parts = strItemLokasi
        .split(/[,/;\n|]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter((loc) => loc && !/[,/;\n|]/.test(loc) && loc !== '-' && loc !== '--' && isWarehouseLocation(loc));
      parts.forEach((loc, idx) => {
        map.set(loc, {
          lokasi: loc,
          isPrimary: idx === 0,
          source: 'SJ',
        });
      });
    }

    const catMatch = fastFindCatalogProduct(cleanSku);
    if (catMatch && Array.isArray(catMatch.locList)) {
      catMatch.locList.forEach((itemLoc) => {
        if (typeof itemLoc === 'object' && itemLoc && itemLoc.lokasi) {
          const loc = String(itemLoc.lokasi || '').trim().toUpperCase();
          const qty = Number(itemLoc.qty) || 0;
          if (loc && !/[,/;\n|]/.test(loc) && loc !== '-' && loc !== '--' && isWarehouseLocation(loc) && qty > 0) {
            if (!map.has(loc)) {
              map.set(loc, {
                lokasi: loc,
                qty: qty,
                isPrimary: map.size === 0,
                source: 'CATALOG',
              });
            }
          }
        }
      });
    }

    const allLocs = Array.from(map.values()).filter((l) => l && l.lokasi && !/[,/;\n|]/.test(l.lokasi) && l.lokasi !== '-' && isWarehouseLocation(l.lokasi, l.area));
    allLocs.sort((a, b) => {
      const pA = getPickingPriority(a.lokasi, a.area);
      const pB = getPickingPriority(b.lokasi, b.area);
      if (pA !== pB) return pA - pB;
      return (b.qty || 0) - (a.qty || 0);
    });
    return allLocs;
  };

  // Resolve guaranteed SINGLE valid rack for an item (prevents multi-location comma strings like "C093, R070, R071")
  const resolveSingleItemLocation = useCallback(
    (item: PickingListItem): string => {
      const cleanPicked = resolvePrimarySingleLocation(item.lokasi_picked || '');
      if (cleanPicked && isWarehouseLocation(cleanPicked)) {
        return cleanPicked;
      }
      const locs = getProductLocations(item.sku, item.lokasi);
      if (locs.length > 0 && locs[0]?.lokasi) {
        return locs[0].lokasi;
      }
      const fromItemLoc = resolvePrimarySingleLocation(item.lokasi || '');
      if (fromItemLoc) return fromItemLoc;
      return cleanPicked || '-';
    },
    [realtimeSkuStocks, productCatalog]
  );

  // Minimize Active SJ Workspace -> collapses back to Daftar SJ & shows floating draggable dock
  const handleMinimizeActiveSJ = () => {
    if (!activeSJ) return;
    setInputMode((prev) => (prev === 'kamera' ? 'fisik' : prev));
    setIsMinimized(true);
    playCategoryBeep();
    onNotify(
      `📌 Tugas Picking ${activeSJ.no_sj} diminimize! Progres (${activeStats.regularPicked}/${activeStats.totalReq} pcs) tersimpan aman.`,
      'info'
    );
  };

  // Manual trigger to sync offline Picking items & outbox batches
  const handleSyncPickingOutboxNow = async () => {
    if (!isOnline) {
      onNotify('Perangkat masih offline. Sinkronisasi akan berjalan otomatis saat internet aktif.', 'warning');
      return;
    }
    if (isSyncingPickingOutbox) return;
    setIsSyncingPickingOutbox(true);
    try {
      await syncPendingPickingItemsAndApply(true);
      const res = await syncAllPickingOutboxBatches();
      setPickingOutboxCount(res.remainingBatches);
      setDraftsRevision((r) => r + 1);
      if (res.syncedBatches > 0) {
        playSaveSuccessChime();
        onNotify(`✅ ${res.syncedBatches} Surat Jalan selesai offline berhasil disinkronkan ke Database!`, 'success');
        loadPickingList();
      } else if (res.errors.length > 0) {
        onNotify(`Sebagian gagal sinkron: ${res.errors[0]}`, 'warning');
      }
    } finally {
      setIsSyncingPickingOutbox(false);
    }
  };

  // Helper: Retrieve all recorded warehouse locations that currently have 0 stock (for informative warnings)
  const getRecordedEmptyLocations = (sku: string): string[] => {
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (!cleanSku || !(cleanSku in realtimeSkuStocks)) return [];
    const list = realtimeSkuStocks[cleanSku] || [];
    const emptyLocs: string[] = [];
    list.forEach((stk) => {
      const loc = String(stk.lokasi || '').trim().toUpperCase();
      const qty = Number(stk.sisa_stok) || 0;
      if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc, stk.area) && qty <= 0) {
        if (!emptyLocs.includes(loc)) emptyLocs.push(loc);
      }
    });
    return emptyLocs;
  };

  // Scope realtime warehouse stock fetches ONLY to the active open SJ so View 1 Queue never lags fetching hundreds of SKUs
  const activeSjSkusKey = React.useMemo(() => {
    if (!activeSJ || isMinimized) return '';
    const skuSet = new Set<string>();
    (activeItems || []).forEach((it) => {
      const s = (it.sku || '').trim().toUpperCase();
      if (s) skuSet.add(s);
    });
    return Array.from(skuSet).sort().join(',');
  }, [activeSJ?.no_sj, isMinimized, activeItems]);

  // Fetch realtime inventory by SKUs across warehouse locations strictly for the currently opened SJ
  useEffect(() => {
    if (!activeSjSkusKey) return;
    const uniqueSkus = activeSjSkusKey.split(',').filter(Boolean);
    if (!uniqueSkus.length) return;

    fetchStockForSkus(uniqueSkus)
      .then((stocks) => {
        setRealtimeSkuStocks((prev) => {
          const map: Record<string, StockRealtimeItem[]> = { ...prev };
          uniqueSkus.forEach((s) => {
            map[s] = [];
          });
          stocks.forEach((stk) => {
            const key = stk.sku.toUpperCase().trim();
            if (!map[key]) map[key] = [];
            map[key].push(stk);
          });
          return map;
        });
      })
      .catch((err) => console.warn('Gagal memuat stok lokasi realtime:', err));
  }, [activeSjSkusKey, activeSJ?.no_sj]);

  // Memoized Set of SJ numbers pending in offline outbox (eliminates localStorage JSON.parse per queue card)
  const outboxSjSet = React.useMemo(() => {
    const set = new Set<string>();
    getPickingOutboxBatches().forEach((b) => {
      if (b?.no_sj) set.add(b.no_sj.toUpperCase().trim());
    });
    return set;
  }, [draftsRevision, pickingOutboxCount]);

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
          picker_name: (item.status || '').toUpperCase().trim() === 'SELESAI' ? '' : (item.picker_name || ''),
          catatan: item.catatan || '',
          total_items: 0,
          total_qty_req: 0,
          total_qty_picked: 0,
          items: [],
          unexpected_items: [],
        });
      }

      const group = map.get(sjKey)!;
      const catMatch = fastFindCatalogProduct(item.sku);
      const catSize = catMatch?.s || (catMatch as any)?.size || (catMatch as any)?.variant;
      const effectiveSize = (item.size && item.size !== '-') 
        ? item.size 
        : (catSize && catSize !== '-' ? catSize : extractSizeFromSku(item.sku));
      const effectiveName = (item.nama_produk && item.nama_produk !== item.sku)
        ? item.nama_produk
        : (catMatch?.p || (catMatch as any)?.nama_produk || catMatch?.n || item.nama_produk);

      const isStoreItem = /store|toko|outlet/i.test(item.tujuan || '');
      let effectiveLokasi = (item.lokasi || '').trim();
      if (!effectiveLokasi || effectiveLokasi === '-' || effectiveLokasi === '--' || effectiveLokasi === 'KOSONG') {
        if (isStoreItem) {
          effectiveLokasi = item.tujuan || 'STORE';
        } else {
          const locItem = Array.isArray(catMatch?.locList) ? catMatch?.locList[0] : null;
          const locStr = typeof locItem === 'string' ? locItem : locItem?.lokasi;
          effectiveLokasi = catMatch?.lokasi || locStr || '';
        }
      }

      const enhancedItem: PickingListItem = {
        ...item,
        size: effectiveSize,
        nama_produk: effectiveName,
        lokasi: effectiveLokasi,
      };

      if (item.is_unexpected || item.qty_req === 0) {
        group.unexpected_items.push(enhancedItem);
        group.total_qty_picked += Number(item.qty_picked) || 0;
      } else {
        group.items.push(enhancedItem);
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

    // Retrieve persistent completed SJs set
    let storedCompletedSJs = new Set<string>();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cStr = localStorage.getItem('wms_completed_sjs_set');
        if (cStr) {
          const arr = JSON.parse(cStr);
          if (Array.isArray(arr)) {
            arr.forEach((s) => storedCompletedSJs.add(String(s).toUpperCase().trim()));
          }
        }
      }
    } catch {}

    // Overlay offline outbox completions & local per-SJ drafts so SJ cards reflect live offline/minimized progress
    const localDraftsMap = getPickingSjDraftsMap();
    const outboxBatches = getPickingOutboxBatches();
    const outboxByNoSj = new Map<string, typeof outboxBatches[number]>();
    outboxBatches.forEach((b) => {
      if (b?.no_sj) outboxByNoSj.set(b.no_sj.toUpperCase().trim(), b);
    });

    // Evaluate group status based on items
    const result = Array.from(map.values()).map((g) => {
      const sjUpper = (g.no_sj || '').toUpperCase().trim();
      const outboxEntry = outboxByNoSj.get(sjUpper);
      const draftEntry = !outboxEntry ? localDraftsMap[sjUpper] : undefined;

      if (outboxEntry) {
        g.items = g.items.map((it) => {
          const m = outboxEntry.items.find(
            (x) => (x.id && x.id === it.id) || (x.sku || '').toUpperCase() === (it.sku || '').toUpperCase()
          );
          return m ? { ...it, qty_picked: m.qty_picked, lokasi_picked: m.lokasi_picked, status: 'SELESAI' as const } : { ...it, status: 'SELESAI' as const };
        });
        g.unexpected_items = outboxEntry.unexpectedItems || g.unexpected_items;
        g.total_qty_picked =
          g.items.reduce((s, it) => s + (Number(it.qty_picked) || 0), 0) +
          g.unexpected_items.reduce((s, it) => s + (Number(it.qty_picked) || 0), 0);
        g.picker_name = outboxEntry.pickerName || g.picker_name;
        g.catatan = outboxEntry.catatan || g.catatan;
        g.status = 'SELESAI';
      } else if (draftEntry && g.status !== 'SELESAI' && !storedCompletedSJs.has(sjUpper)) {
        g.items = g.items.map((it) => {
          const m = draftEntry.activeItems.find(
            (x) => (x.id && x.id === it.id) || (x.sku || '').toUpperCase() === (it.sku || '').toUpperCase()
          );
          if (!m) return it;
          // Preserve remote qty if another co-picker already picked more on Supabase
          const remoteQty = Number(it.qty_picked) || 0;
          const draftQty = Number(m.qty_picked) || 0;
          const mergedQty = Math.max(remoteQty, draftQty);
          const mergedKosong = Boolean(it.is_kosong || it.status === 'KOSONG' || m.is_kosong || m.status === 'KOSONG');
          return {
            ...it,
            qty_picked: mergedQty,
            lokasi_picked: m.lokasi_picked || it.lokasi_picked,
            is_kosong: mergedKosong,
            status: mergedKosong
              ? ('KOSONG' as const)
              : it.status === 'SEDANG PICKING'
              ? ('SEDANG PICKING' as const)
              : ('PENDING' as const),
          };
        });
        g.unexpected_items = draftEntry.unexpectedItems || g.unexpected_items;
        g.total_qty_picked =
          g.items.reduce((s, it) => s + (Number(it.qty_picked) || 0), 0) +
          g.unexpected_items.reduce((s, it) => s + (Number(it.qty_picked) || 0), 0);
        if (draftEntry.rekapCatatan) g.catatan = draftEntry.rekapCatatan;
      }

      // Collect all unique ACTIVE pickers currently working on non-SELESAI items in this SJ
      const pickersList: string[] = [];
      const addPickerUnique = (rawName?: string) => {
        parsePickerNamesList(rawName).forEach((p) => {
          if (!pickersList.some((ex) => isSameOperatorIdentity(ex, p))) {
            pickersList.push(p);
          }
        });
      };
      g.items.forEach((it) => {
        if ((it.status || '').toUpperCase().trim() !== 'SELESAI') {
          addPickerUnique(it.picker_name);
        }
      });
      g.unexpected_items.forEach((it) => {
        if ((it.status || '').toUpperCase().trim() !== 'SELESAI') {
          addPickerUnique(it.picker_name);
        }
      });
      g.active_pickers = pickersList;
      if (pickersList.length > 0) {
        g.picker_name = pickersList.join(', ');
      } else if (g.items.length > 0 && g.items.every((it) => (it.status || '').toUpperCase().trim() === 'SELESAI')) {
        const donePickers: string[] = [];
        g.items.forEach((it) => {
          parsePickerNamesList(it.picker_name).forEach((p) => {
            if (!donePickers.some((ex) => isSameOperatorIdentity(ex, p))) donePickers.push(p);
          });
        });
        g.picker_name = donePickers.join(', ');
      } else {
        g.picker_name = '';
      }

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

      const isCompletedLocally = Boolean(outboxEntry) || storedCompletedSJs.has(sjUpper);
      const isAllDone =
        isCompletedLocally ||
        (g.items.length > 0 && g.items.every((it) => (it.status || '').toUpperCase().trim() === 'SELESAI'));
      // "SEDANG PICKING" applies ONLY when at least one active picker is currently working on the form!
      const isActivelyWorkedOn = g.active_pickers.length > 0;

      if (isAllDone) {
        g.status = 'SELESAI';
      } else if (isActivelyWorkedOn) {
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
  }, [rawItems, draftsRevision, fastFindCatalogProduct]);

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
        showGlobalLoading('Memproses...');
        const success = await deletePickingSuratJalanBatchSupabase(selectedSJs);
        if (success) {
          onNotify(`${selectedSJs.length} Surat Jalan berhasil dihapus`, 'success');
          const upperSJs = new Set(selectedSJs.map((s) => s.toUpperCase().trim()));
          setRawItems((prev) => {
            const updated = prev.filter((item) => !upperSJs.has((item.no_sj || '').toUpperCase().trim()));
            try {
              const activeOnly = updated.filter((it) => it.status !== 'SELESAI').slice(0, 100);
              safeLocalStorageSet('wms_raw_picking_list_cache', JSON.stringify(activeOnly));
            } catch {}
            return updated;
          });
          setSelectedSJs([]);
        } else {
          onNotify('Gagal menghapus beberapa Surat Jalan', 'error');
        }
        setIsBulkActionRunning(false);
        hideGlobalLoading();
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
        showGlobalLoading('Memproses...');
        const success = await completePickingSuratJalanBatchSupabase(selectedSJs, currentUser);
        if (success) {
          onNotify(`${selectedSJs.length} Surat Jalan berhasil diselesaikan`, 'success');
          const upperSJs = new Set(selectedSJs.map((s) => s.toUpperCase().trim()));
          setRawItems((prev) => {
            const updated = prev.map((item) => {
              if (upperSJs.has((item.no_sj || '').toUpperCase().trim())) {
                return {
                  ...item,
                  status: 'SELESAI' as const,
                  picker_name: currentUser || 'Admin',
                };
              }
              return item;
            });
            try {
              const activeOnly = updated.filter((it) => it.status !== 'SELESAI').slice(0, 100);
              safeLocalStorageSet('wms_raw_picking_list_cache', JSON.stringify(activeOnly));
            } catch {}
            return updated;
          });
          setSelectedSJs([]);
        } else {
          onNotify('Gagal menyelesaikan beberapa Surat Jalan', 'error');
        }
        setIsBulkActionRunning(false);
        hideGlobalLoading();
      }
    });
  };

  const handleSendPickingWa = async (group: PickingSuratJalanGroup, mode: 'send' | 'copy' = 'send') => {
    const groupSkus = Array.from(
      new Set(group.items.map((it) => (it.sku || '').trim().toUpperCase()).filter(Boolean))
    );
    let liveMap: Record<string, StockRealtimeItem[]> = { ...realtimeSkuStocks };
    if (groupSkus.length > 0) {
      try {
        const freshStocks = await fetchStockForSkus(groupSkus);
        groupSkus.forEach((s) => {
          liveMap[s] = [];
        });
        freshStocks.forEach((stk) => {
          const key = (stk.sku || '').toUpperCase().trim();
          if (!liveMap[key]) liveMap[key] = [];
          liveMap[key].push(stk);
        });
        setRealtimeSkuStocks((prev) => ({ ...prev, ...liveMap }));
      } catch (err) {
        console.warn('Gagal memuat stok live sebelum kirim WA:', err);
      }
    }

    const firstInvoice = group.items.find((it) => it.invoice_picking)?.invoice_picking;
    const text = generateRefillPickingGroupMessage({
      no_sj: group.no_sj,
      destination: group.tujuan || 'Toko / Store',
      source: 'Warehouse',
      tanggal_sj: group.tanggal || new Date().toISOString().slice(0, 10),
      operatorName: currentUser || 'Petugas WMS',
      invoice_picking: firstInvoice,
      status: group.status || 'PENDING PICKING',
      items: group.items.map((it) => {
        const cleanSku = (it.sku || '').toUpperCase().trim();
        const stkList = liveMap[cleanSku];
        let locText = it.lokasi || '-';
        let isKosong = false;
        if (Array.isArray(stkList)) {
          const locMap = new Map<string, { lokasi: string; qty: number; area?: string }>();
          stkList.forEach((stk) => {
            const loc = String(stk.lokasi || '').trim().toUpperCase();
            const qty = Number(stk.sisa_stok) || 0;
            if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc, stk.area) && qty > 0) {
              const existing = locMap.get(loc);
              if (existing) {
                existing.qty += qty;
              } else {
                locMap.set(loc, { lokasi: loc, qty, area: stk.area });
              }
            }
          });
          const sortedLocs = Array.from(locMap.values()).sort((a, b) => {
            const pA = getPickingPriority(a.lokasi, a.area);
            const pB = getPickingPriority(b.lokasi, b.area);
            if (pA !== pB) return pA - pB;
            return b.qty - a.qty;
          });
          if (sortedLocs.length > 0) {
            locText = sortedLocs.map((l) => `${l.lokasi} (${l.qty} pcs)`).join(', ');
          } else {
            const emptyLocs = Array.from(
              new Set(
                stkList
                  .filter((stk) => stk.lokasi && isWarehouseLocation(stk.lokasi, stk.area) && (Number(stk.sisa_stok) || 0) <= 0)
                  .map((stk) => String(stk.lokasi).trim().toUpperCase())
              )
            );
            locText = emptyLocs.length > 0 ? `KOSONG (Rak: ${emptyLocs.join(', ')})` : 'KOSONG (0 pcs)';
            isKosong = true;
          }
        } else {
          const locs = getProductLocations(cleanSku, it.lokasi);
          if (locs.length > 0) {
            locText = locs.map((l) => `${l.lokasi} (${l.qty || 0} pcs)`).join(', ');
          }
        }
        return {
          sku: it.sku,
          nama_produk: resolveProductName(it.sku, it.nama_produk),
          size: it.size || '-',
          qty: it.qty_req,
          lokasi: locText,
          isKosong,
        };
      }),
    });

    try {
      await navigator.clipboard.writeText(text);
    } catch {}

    if (mode === 'copy') {
      onNotify(`Teks Picking List WA untuk SJ "${group.no_sj}" berhasil disalin ke clipboard!`, 'success');
      return;
    }

    const fonnteCfg = getFonnteConfig();
    if (!fonnteCfg.token) {
      onNotify(`Pesan Picking List "${group.no_sj}" disalin ke clipboard! Membuka WhatsApp...`, 'info');
      window.open(getWhatsAppWebUrl(fonnteCfg.groupTarget || '', text), '_blank');
      return;
    }

    if (!fonnteCfg.groupTarget) {
      onNotify(`Target grup gudang belum diatur di Pengaturan. Teks "${group.no_sj}" telah disalin ke clipboard.`, 'warning');
      window.open(getWhatsAppWebUrl('', text), '_blank');
      return;
    }

    try {
      const res = await sendFonnteMessage(fonnteCfg.groupTarget, text, fonnteCfg.token);
      if (res.success) {
        onNotify(`✅ Picking List WA (${group.no_sj}) berhasil dikirim ke Grup Gudang via Fonnte!`, 'success');
      } else {
        onNotify(`Gagal kirim via Fonnte: ${res.message}. (Pesan telah disalin ke clipboard)`, 'warning');
      }
    } catch (err: any) {
      onNotify(`Gagal kirim WA: ${err?.message || 'Error'}. (Pesan telah disalin ke clipboard)`, 'error');
    }
  };

  const handleSendPickingWaBulk = async () => {
    if (selectedSJs.length === 0) return;
    const selectedGroups = filteredSJs.filter((g) => selectedSJs.includes(g.no_sj));
    if (selectedGroups.length === 0) return;

    setIsBulkActionRunning(true);
    showGlobalLoading(`Mengirim WA Picking (${selectedGroups.length} SJ)...`);
    try {
      for (const group of selectedGroups) {
        await handleSendPickingWa(group, 'send');
      }
      onNotify(`✅ Selesai mengirim ${selectedGroups.length} Picking List ke Grup WA Gudang!`, 'success');
    } finally {
      setIsBulkActionRunning(false);
      hideGlobalLoading();
    }
  };

  const handlePrintSPS = async (group: PickingSuratJalanGroup) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onNotify('Popup terblokir, izinkan popup browser untuk cetak PDF', 'warning');
      return;
    }

    const groupSkus = Array.from(
      new Set(group.items.map((it) => (it.sku || '').trim().toUpperCase()).filter(Boolean))
    );
    const liveMap: Record<string, StockRealtimeItem[]> = { ...realtimeSkuStocks };
    if (groupSkus.length > 0) {
      try {
        const freshStocks = await fetchStockForSkus(groupSkus);
        groupSkus.forEach((s) => {
          liveMap[s] = [];
        });
        freshStocks.forEach((stk) => {
          const key = (stk.sku || '').toUpperCase().trim();
          if (!liveMap[key]) liveMap[key] = [];
          liveMap[key].push(stk);
        });
        setRealtimeSkuStocks((prev) => ({ ...prev, ...liveMap }));
      } catch (err) {
        console.warn('Gagal memuat stok live sebelum cetak SPS:', err);
      }
    }

    const itemsRows = group.items
      .map(
        (it, idx) => {
          const cleanSku = (it.sku || '').toUpperCase().trim();
          let locText = it.lokasi || '-';
          if (cleanSku in liveMap) {
            const stkList = liveMap[cleanSku] || [];
            const locMap = new Map<string, { lokasi: string; qty: number; area?: string }>();
            const emptyRacks: string[] = [];
            stkList.forEach((stk) => {
              const loc = String(stk.lokasi || '').trim().toUpperCase();
              const qty = Number(stk.sisa_stok) || 0;
              if (!loc || loc === '-' || loc === '--' || !isWarehouseLocation(loc, stk.area)) return;
              if (qty > 0) {
                const existing = locMap.get(loc);
                if (existing) existing.qty += qty;
                else locMap.set(loc, { lokasi: loc, qty, area: stk.area });
              } else if (!emptyRacks.includes(loc)) {
                emptyRacks.push(loc);
              }
            });
            const sortedLocs = Array.from(locMap.values()).sort((a, b) => {
              const pA = getPickingPriority(a.lokasi, a.area);
              const pB = getPickingPriority(b.lokasi, b.area);
              if (pA !== pB) return pA - pB;
              return b.qty - a.qty;
            });
            if (sortedLocs.length > 0) {
              locText = sortedLocs.map((l) => `${l.lokasi} (${l.qty} pcs)`).join(', ');
            } else {
              locText = emptyRacks.length > 0 ? `KOSONG (Rak: ${emptyRacks.join(', ')})` : 'KOSONG (0 pcs)';
            }
          } else {
            const locs = getProductLocations(cleanSku, it.lokasi);
            if (locs.length > 0) {
              locText = locs.map((l) => (l.qty && l.qty > 0 ? `${l.lokasi} (${l.qty} pcs)` : l.lokasi)).join(', ');
            }
          }
          return `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${resolveProductName(it.sku, it.nama_produk)}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${it.size || '-'}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty_req}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1;">${locText}</td>
      </tr>
    `;
        }
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
            <div class="logo-title" style="display: flex; align-items: center; gap: 8px;">
              <img src="/logo.svg" alt="Logo" referrerPolicy="no-referrer" style="height: 28px; object-fit: contain;" onerror="this.style.display='none'" />
              <span>WMS</span>
            </div>
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
      .map((it, idx) => {
        const lookup = lookupProductBySku(it.sku, productCatalog, it.nama_produk, it.size);
        const nama = lookup.nama_produk;
        const size = (it.size && it.size !== '-') ? it.size : (lookup.size !== '-' ? lookup.size : '-');
        return `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${nama}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${size}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty_picked}</td>
      </tr>
    `;
      })
      .join('');

    const pickedUnexpectedItems = (group.unexpected_items || []).filter((it) => it.qty_picked > 0);
    const unexpectedRows = pickedUnexpectedItems
      .map((it, idx) => {
        const lookup = lookupProductBySku(it.sku, productCatalog, it.nama_produk, it.size);
        const nama = lookup.nama_produk;
        const size = (it.size && it.size !== '-') ? it.size : (lookup.size !== '-' ? lookup.size : '-');
        return `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${pickedItems.length + idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${nama}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${size || '-'}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty_picked}</td>
      </tr>
    `;
      })
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
            <img src="/logo.svg" style="height:28px;" />
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
          invalidatePickingListCache();
          onNotify(`Surat Jalan ${no_sj} berhasil dihapus`, 'success');
          const cleanNoSj = no_sj.toUpperCase().trim();
          setRawItems((prev) => {
            const updated = prev.filter((item) => (item.no_sj || '').toUpperCase().trim() !== cleanNoSj);
            try {
              const activeOnly = updated.filter((it) => it.status !== 'SELESAI').slice(0, 100);
              safeLocalStorageSet('wms_raw_picking_list_cache', JSON.stringify(activeOnly));
            } catch {}
            return updated;
          });
        } else {
          onNotify('Gagal menghapus Surat Jalan', 'error');
        }
      }
    });
  };

  const handleSelectSJ = (sj: PickingSuratJalanGroup) => {
    if (!sj) return;
    if (sj.status === 'SELESAI') {
      setViewCompletedSJ(sj);
      return;
    }

    const cleanNoSj = sj.no_sj.toUpperCase().trim();
    const savedDraft = getPickingSjDraftsMap()[cleanNoSj];
    const existingPickers = parsePickerNamesList(sj.picker_name);
    const otherPickers = existingPickers.filter(
      (p) => !isSameOperatorIdentity(p, currentUser)
    );
    const mergedPickers = existingPickers.some((p) => isSameOperatorIdentity(p, currentUser))
      ? existingPickers
      : [...existingPickers, currentUser].filter(Boolean);
    const mergedPickerStr = mergedPickers.join(', ');

    // Set active workspace (restore saved Supabase & local draft progress so zero scan progress is ever lost)
    const safeItems = Array.isArray(sj.items) ? sj.items : [];
    const itemsClone = safeItems
      .filter((it) => it && it.sku)
      .map((it) => {
        const cleanSku = String(it.sku || '').trim().toUpperCase();
        const catMatch = fastFindCatalogProduct(cleanSku);
        const catSize = catMatch?.s || (catMatch as any)?.size || (catMatch as any)?.variant;
        const effectiveSize = (it.size && it.size !== '-') 
          ? it.size 
          : (catSize && catSize !== '-' ? catSize : extractSizeFromSku(cleanSku));
        const effectiveName = (it.nama_produk && it.nama_produk !== cleanSku)
          ? it.nama_produk
          : (catMatch?.p || (catMatch as any)?.nama_produk || catMatch?.n || it.nama_produk || cleanSku);

        const isStoreSJ = /store|toko|outlet/i.test(sj.tujuan || '');
        let itemLokasi = (it.lokasi || '').trim();
        if (!itemLokasi || itemLokasi === '-' || itemLokasi === '--' || itemLokasi === 'KOSONG' || itemLokasi === 'A-01') {
          if (isStoreSJ) {
            itemLokasi = sj.tujuan || 'STORE';
          } else {
            const locItem = Array.isArray(catMatch?.locList) ? catMatch?.locList[0] : null;
            const locStr = typeof locItem === 'string' ? locItem : locItem?.lokasi;
            itemLokasi = catMatch?.lokasi || locStr || '-';
          }
        }

        const draftItem = savedDraft?.activeItems?.find(
          (d) => (d.id && d.id === it.id) || (d.sku || '').trim().toUpperCase() === cleanSku
        );
        const hasPendingOfflineItem = hasPendingPickingItemSyncForSku(cleanNoSj, cleanSku);
        const remoteQty = Math.max(0, Number(it.qty_picked) || 0);
        const draftQty = draftItem ? Math.max(0, Number(draftItem.qty_picked) || 0) : 0;
        const qtyPicked = hasPendingOfflineItem && draftItem ? draftQty : Math.max(remoteQty, draftQty);
        const rawLokasiPicked = draftItem?.lokasi_picked || it.lokasi_picked || '';
        const cleanLokasiPicked = resolvePrimarySingleLocation(rawLokasiPicked) || '';
        const isKosong = hasPendingOfflineItem && draftItem
          ? Boolean(draftItem.is_kosong || draftItem.status === 'KOSONG')
          : Boolean(it.is_kosong || it.status === 'KOSONG' || draftItem?.is_kosong || draftItem?.status === 'KOSONG');

        return {
          ...it,
          sku: cleanSku,
          size: effectiveSize,
          nama_produk: effectiveName,
          lokasi: itemLokasi,
          lokasi_picked: cleanLokasiPicked || undefined,
          qty_req: Math.max(1, Number(it.qty_req) || 1),
          qty_picked: qtyPicked,
          is_kosong: isKosong,
          status: isKosong
            ? ('KOSONG' as const)
            : qtyPicked >= Math.max(1, Number(it.qty_req) || 1)
            ? ('SELESAI' as const)
            : ('SEDANG PICKING' as const),
          picker_name: it.picker_name ? mergePickerNamesWithLastActor(it.picker_name, it.last_picked_by || currentUser) : mergedPickerStr,
          last_picked_by: it.last_picked_by || draftItem?.last_picked_by,
        };
      });

    const safeUnexpected = savedDraft && Array.isArray(savedDraft.unexpectedItems) && savedDraft.unexpectedItems.length > 0
      ? [...savedDraft.unexpectedItems]
      : Array.isArray(sj.unexpected_items)
      ? [...sj.unexpected_items]
      : [];

    const restoredActiveLoc = resolvePrimarySingleLocation(savedDraft?.activeLocation || '') || '';

    setActiveSJ({
      ...sj,
      status: 'SEDANG PICKING',
      picker_name: mergedPickerStr,
      active_pickers: mergedPickers,
      items: itemsClone,
      unexpected_items: safeUnexpected,
    });
    setActiveItems(itemsClone);
    setUnexpectedItems(safeUnexpected);
    setRekapCatatan(savedDraft?.rekapCatatan || sj.catatan || '');
    setActiveLocation(restoredActiveLoc);
    setIsMinimized(false);
    setRecentScans([]);
    playCategoryBeep();

    // Update rawItems immediately so queue reflects currentUser working on this SJ
    setRawItems((prev) =>
      prev.map((item) => {
        if ((item.no_sj || '').toUpperCase().trim() !== cleanNoSj || item.status === 'SELESAI') return item;
        return {
          ...item,
          status: item.status === 'KOSONG' ? 'KOSONG' : 'SEDANG PICKING',
          picker_name: mergedPickerStr,
        };
      })
    );

    // Sync pending offline item progress FIRST, then collaborative claim/join to Supabase & broadcast to co-pickers
    if (typeof navigator === 'undefined' || navigator.onLine) {
      syncPendingPickingItemsAndApply(false)
        .catch(() => {})
        .finally(() => {
          claimOrJoinPickingSJSupabase(cleanNoSj, currentUser || 'Operator')
            .then((res) => {
              broadcastPickingCollabEvent('picker_joined', {
                no_sj: cleanNoSj,
                active_pickers: res.activePickers,
              });
              if (res.items.length > 0) {
                applyRemoteSjRowsToState(cleanNoSj, res.items, true);
              }
            })
            .catch(() => {});
        });
    }

    const totalInitialPicked = itemsClone.reduce((s, it) => s + (Number(it.qty_picked) || 0), 0);
    const totalReqCount = itemsClone.reduce((s, it) => s + (Number(it.qty_req) || 0), 0);
    if (otherPickers.length > 0) {
      const otherNames = otherPickers.map((p) => formatOperatorWithPersonName(p)).join(', ');
      onNotify(
        `🤝 Ikut membantu pengerjaan SJ ${sj.no_sj} bersama ${otherNames}. Item yang sudah diambil otomatis di-hide secara realtime!`,
        'success'
      );
    } else if (totalInitialPicked > 0) {
      onNotify(
        `📦 Melanjutkan SJ ${sj.no_sj} (${totalInitialPicked}/${totalReqCount} Pcs sudah terpicking). Silakan lanjutkan sisa item!`,
        'success'
      );
    } else {
      onNotify(`Membuka Surat Jalan ${sj.no_sj}. Status aktif: Sedang Dikerjakan oleh ${formatOperatorWithPersonName(currentUser)}.`, 'info');
    }
  };

  // Buka konfirmasi Keluar / Simpan Progres / Batalkan Pengambilan Picking (View 1 Kartu maupun View 2 Workspace)
  const handleOpenCancelPickingModal = useCallback(
    (
      sjGroup: PickingSuratJalanGroup,
      source: 'VIEW1' | 'VIEW2',
      intent: 'EXIT_FORM' | 'CANCEL_PICK' | 'RESET_ONLY' = 'CANCEL_PICK'
    ) => {
      if (!sjGroup) return;
      const cleanNoSj = sjGroup.no_sj.toUpperCase().trim();
      const isEditingActive = activeSJ?.no_sj?.toUpperCase().trim() === cleanNoSj;
      const itemsToInspect = isEditingActive ? activeItems : sjGroup.items || [];
      const unexpectedToInspect = isEditingActive ? unexpectedItems : sjGroup.unexpected_items || [];

      const pickedQty = itemsToInspect.reduce((acc, it) => acc + (Number(it.qty_picked) || 0), 0);
      const unexpectedQty = unexpectedToInspect.reduce((acc, it) => acc + (Number(it.qty_picked) || 0), 0);
      const totalReq = itemsToInspect.reduce((acc, it) => acc + (Number(it.qty_req) || 0), 0);
      const kosongCount = itemsToInspect.filter((it) => it.is_kosong || it.status === 'KOSONG').length;

      const pickersList: string[] = [];
      const addPickerUnique = (rawName?: string) => {
        parsePickerNamesList(rawName).forEach((p) => {
          if (!pickersList.some((ex) => isSameOperatorIdentity(ex, p))) {
            pickersList.push(p);
          }
        });
      };
      addPickerUnique(sjGroup.picker_name);
      (sjGroup.active_pickers || []).forEach((p) => addPickerUnique(p));
      itemsToInspect.forEach((it) => addPickerUnique(it.picker_name));

      const otherPickers = pickersList.filter(
        (p) => !isSameOperatorIdentity(p, currentUser)
      );

      setCancelPickingModal({
        isOpen: true,
        group: sjGroup,
        isCoPickingWithOthers: otherPickers.length > 0,
        pickedQty,
        kosongCount,
        unexpectedQty,
        totalReq,
        otherPickers,
        source,
        intent,
      });
    },
    [activeSJ, activeItems, unexpectedItems, currentUser]
  );

  // Eksekusi Keluar Simpan Progres ATAU Batalkan Picking (Reset Total ke PENDING 0 Pcs)
  const handleExecuteCancelPicking = async (mode: 'LEAVE_KEEP_PROGRESS' | 'RESET_TO_PENDING') => {
    if (!cancelPickingModal || isCancellingPicking) return;
    const { group, otherPickers, pickedQty } = cancelPickingModal;
    const cleanNoSj = group.no_sj.toUpperCase().trim();
    const isOnlineNow = typeof navigator === 'undefined' || navigator.onLine;
    setIsCancellingPicking(true);
    markSjLocallyMutated(cleanNoSj, 6000);

    // Snapshot latest items from View 2 before clearing state so they can be flushed accurately to Supabase
    const isCurrentlyOpenSj = activeSJ && activeSJ.no_sj.toUpperCase().trim() === cleanNoSj;
    const itemsSnapshot = isCurrentlyOpenSj ? [...activeItems] : [...(group.items || [])];
    const snapshotByKey = new Map<string, PickingListItem>();
    itemsSnapshot.forEach((it) => {
      if (it.id) snapshotByKey.set(String(it.id), it);
      if (it.sku) snapshotByKey.set(it.sku.trim().toUpperCase(), it);
    });

    try {
      // Close active workspace & active session pointer immediately
      if (isCurrentlyOpenSj) {
        setInputMode((prev) => (prev === 'kamera' ? 'fisik' : prev));
        setIsMinimized(false);
        setIsRekapModalOpen(false);
        setOverPickAlertModal(null);
        setActiveSJ(null);
        setActiveItems([]);
        setUnexpectedItems([]);
        setActiveLocation('');
        setRekapCatatan('');
      }
      try {
        const storedActiveRaw = localStorage.getItem('wms_active_picking_session');
        if (storedActiveRaw) {
          const parsedActive = JSON.parse(storedActiveRaw);
          if ((parsedActive?.activeSJ?.no_sj || '').toUpperCase().trim() === cleanNoSj) {
            safeLocalStorageRemove('wms_active_picking_session');
            notifyPickingSessionUpdated();
          }
        }
      } catch {}

      if (mode === 'RESET_TO_PENDING' || !isOnlineNow) {
        if (mode === 'RESET_TO_PENDING') {
          removePickingSjDraft(cleanNoSj);
          clearPendingPickingItemSyncForSj(cleanNoSj);
          setPendingItemSyncCount(getPendingPickingItemSyncCount());
        }
      }
      setDraftsRevision((r) => r + 1);

      // Optimistically update queue state so View 1 immediately loses "Sedang Dikerjakan" & shows accurate state
      setRawItems((prev) => {
        const nextRaw = prev.map((item) => {
          if ((item.no_sj || '').toUpperCase().trim() !== cleanNoSj || item.status === 'SELESAI') {
            return item;
          }
          if (mode === 'RESET_TO_PENDING') {
            return {
              ...item,
              status: 'PENDING' as const,
              qty_picked: 0,
              picker_name: '',
              last_picked_by: undefined,
              is_kosong: false,
            };
          }
          const snap = (item.id ? snapshotByKey.get(String(item.id)) : undefined) || snapshotByKey.get((item.sku || '').trim().toUpperCase());
          const remainingPickers = parsePickerNamesList(item.picker_name).filter(
            (p) => !isSameOperatorIdentity(p, currentUser)
          );
          const nextKosong = Boolean(snap?.is_kosong || snap?.status === 'KOSONG' || item.is_kosong || item.status === 'KOSONG');
          const nextQty = snap ? Math.max(0, Number(snap.qty_picked) || 0) : Math.max(0, Number(item.qty_picked) || 0);
          return {
            ...item,
            qty_picked: nextQty,
            lokasi_picked: snap?.lokasi_picked || item.lokasi_picked,
            is_kosong: nextKosong,
            picker_name: remainingPickers.join(', '),
            status: nextKosong
              ? ('KOSONG' as const)
              : remainingPickers.length > 0
              ? ('SEDANG PICKING' as const)
              : ('PENDING' as const),
          };
        });
        try {
          const activeOnly = nextRaw.filter((it) => it.status !== 'SELESAI').slice(0, 100);
          safeLocalStorageSet('wms_raw_picking_list_cache', JSON.stringify(activeOnly));
        } catch {}
        return nextRaw;
      });

      setCancelPickingModal(null);

      let syncedOnline = true;
      if (isOnlineNow) {
        if (mode === 'RESET_TO_PENDING') {
          syncedOnline = await cancelOrResetPickingSJSupabase(cleanNoSj);
          if (syncedOnline) {
            markSjLocallyMutated(cleanNoSj, 6000);
            broadcastPickingCollabEvent('sj_cancelled', { no_sj: cleanNoSj });
          }
        } else {
          syncedOnline = await leavePickingSJSupabase(cleanNoSj, currentUser || 'Operator', itemsSnapshot);
          if (syncedOnline) {
            // Cleanly flush to Supabase succeeded — remove local draft & pending item sync queue for this SJ
            removePickingSjDraft(cleanNoSj);
            clearPendingPickingItemSyncForSj(cleanNoSj);
            setPendingItemSyncCount(getPendingPickingItemSyncCount());
            setDraftsRevision((r) => r + 1);
            markSjLocallyMutated(cleanNoSj, 6000);
            broadcastPickingCollabEvent('picker_left', { no_sj: cleanNoSj });
            // Verify & hydrate exact DB rows
            fetchActiveSjRealtimeRowsSupabase(cleanNoSj)
              .then((rows) => {
                if (rows && rows.length > 0) applyRemoteSjRowsToState(cleanNoSj, rows, true);
              })
              .catch(() => {});
          }
        }
      }

      playCategoryBeep();
      if (!syncedOnline) {
        onNotify(
          `⚠️ Koneksi server terkendala saat memperbarui SJ ${cleanNoSj}. Progres tetap diamankan secara lokal.`,
          'warning'
        );
      } else if (mode === 'RESET_TO_PENDING') {
        onNotify(
          `↺ Picking SJ ${cleanNoSj} dibatalkan & di-reset kembali ke 0 Pcs (PENDING).`,
          'info'
        );
      } else if (otherPickers.length > 0) {
        onNotify(
          `👋 Anda keluar / batal bantu pada SJ ${cleanNoSj}. Rekan tim (${otherPickers.map((p) => formatOperatorWithPersonName(p)).join(', ')}) tetap melanjutkan pengerjaan.`,
          'info'
        );
      } else {
        onNotify(
          `✓ Progres terakhir SJ ${cleanNoSj} (${pickedQty} Pcs) tersimpan & status "Sedang Dikerjakan" dilepas. Siapa pun dapat melanjutkan sisanya.`,
          'success'
        );
      }
    } finally {
      setIsCancellingPicking(false);
    }
  };

  // Helper: Sync single item change in real time to Supabase (persisted to durable offline queue first)
  const syncItemRealtimeAndCheckOverPick = useCallback(
    async (params: {
      itemIndex: number;
      targetItem: PickingListItem;
      delta?: number;
      absoluteQty?: number;
      markKosong?: boolean;
      usedLocation: string;
    }) => {
      if (!activeSJRef.current) return;
      const cleanNoSj = activeSJRef.current.no_sj.toUpperCase().trim();
      const cleanSku = params.targetItem.sku.toUpperCase().trim();
      pendingLocalSyncSkusRef.current.set(cleanSku, Date.now());
      markSjLocallyMutated(cleanNoSj, 4500);

      // Persist mutation in durable per-item offline queue BEFORE attempting network sync
      enqueuePickingItemSyncMutation({
        id: params.targetItem.id,
        no_sj: cleanNoSj,
        sku: cleanSku,
        delta: params.delta,
        absoluteQty: params.absoluteQty,
        markKosong: params.markKosong,
        lokasi_picked: params.usedLocation,
        username: currentUser || 'Operator',
        currentItem: params.targetItem,
      });
      setPendingItemSyncCount(getPendingPickingItemSyncCount());

      // Broadcast optimistic update immediately for 0ms peer responsiveness
      broadcastPickingCollabEvent('item_updated', {
        no_sj: cleanNoSj,
        sku: cleanSku,
      });

      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      await syncPendingPickingItemsAndApply(false);
    },
    [broadcastPickingCollabEvent, currentUser, markSjLocallyMutated, syncPendingPickingItemsAndApply]
  );

  // Action: Petugas Klik Langsung Pill Lokasi pada Kartu SKU (Selalu 1 rak bersih + update item.lokasi_picked)
  const handleSelectItemLocation = (itemIndex: number, rawLoc: string) => {
    const locClean = resolvePrimarySingleLocation(rawLoc) || String(rawLoc || '').split(/[,/;\n|]+/)[0]?.trim().toUpperCase();
    if (!locClean || /[,/;\n|]/.test(locClean)) return;

    setActiveLocation(locClean);
    const targetItem = activeItems[itemIndex];
    if (targetItem) {
      const nextItems = [...activeItems];
      nextItems[itemIndex] = {
        ...targetItem,
        lokasi_picked: locClean,
      };
      setActiveItems(nextItems);
    }

    playCategoryBeep();
    vibrateDevice(50);

    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRecentScans((prev) => [
      {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        time: nowTime,
        type: 'LOCATION',
        text: `#LOK ${locClean}`,
        detail: `📍 Rak aktif dipilih: ${locClean}${targetItem ? ` (${targetItem.sku})` : ''}`,
        location: locClean,
      },
      ...prev.slice(0, 7),
    ]);

    onNotify(
      `📍 Rak aktif dipilih: ${locClean}${targetItem ? ` untuk SKU ${targetItem.sku}` : ''}!`,
      'info'
    );
  };

  // Unique list of target locations in the active SJ (including primary & alternative racks)
  const uniqueLocations = React.useMemo(() => {
    if (!activeSJ) return [];
    const locMap = new Map<string, { count: number; pending: number; isAlternative?: boolean }>();
    (activeItems || []).forEach((it) => {
      if (!it || !it.sku) return;
      const allLocs = getProductLocations(it.sku, it.lokasi);
      const pendingQty = Math.max(0, (Number(it.qty_req) || 0) - (Number(it.qty_picked) || 0));
      allLocs.forEach((l) => {
        if (!l || !l.lokasi) return;
        const loc = String(l.lokasi).trim().toUpperCase();
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
      const rawLocPart = barcode.replace(/^(#?LOK[\s\-_:]*)/i, '').trim().toUpperCase();
      const locClean = resolvePrimarySingleLocation(rawLocPart) || rawLocPart.split(/[,/;\n|]+/)[0]?.trim().toUpperCase() || '';
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
    const effectiveLocation = resolvePrimarySingleLocation(activeLocation || '') || '';

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
      const singleFallback = resolveSingleItemLocation(targetItem);
      const usedLocation = effectiveLocation || singleFallback || 'A001';
      const prevPickedBy = targetItem.last_picked_by || parsePickerNamesList(targetItem.picker_name).slice(-1)[0] || currentUser;
      const newPicked = Number(targetItem.qty_picked || 0) + 1;

      // Auto-set lokasi (SELALU single rak bersih, bukan CSV multi-lokasi!) jika sebelumnya belum scan lokasi
      if (!effectiveLocation && singleFallback) {
        setActiveLocation(singleFallback);
      }

      const updatedItem: PickingListItem = {
        ...targetItem,
        qty_picked: newPicked,
        lokasi_picked: usedLocation,
        is_kosong: false,
        status: (newPicked >= targetItem.qty_req ? 'SELESAI' : 'SEDANG PICKING') as any,
        picker_name: mergePickerNamesWithLastActor(targetItem.picker_name, currentUser),
        last_picked_by: currentUser,
      };

      const nextItems = [...activeItems];
      nextItems[matchIdx] = updatedItem;
      setActiveItems(nextItems);

      if (newPicked > targetItem.qty_req) {
        // Peringatan kelebihan barang (Over-pick) pada petugas terakhir
        playErrorBeep();
        vibrateDevice([250, 100, 250, 100, 250]);
        const lookup = lookupProductBySku(targetItem.sku, catalogMap, targetItem.nama_produk, targetItem.size);
        setOverPickAlertModal({
          isOpen: true,
          sku: targetItem.sku,
          nama_produk: lookup.nama_produk || targetItem.nama_produk || targetItem.sku,
          size: targetItem.size || lookup.size || '-',
          lokasi: usedLocation,
          qtyReq: targetItem.qty_req,
          newQty: newPicked,
          excessQty: newPicked - targetItem.qty_req,
          previousPicker: prevPickedBy || currentUser,
          itemIndex: matchIdx,
        });
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
          `⚠️ PERINGATAN OVER-PICK: SKU ${targetItem.sku} sudah terambil ${newPicked}/${targetItem.qty_req} (Lebih +${newPicked - targetItem.qty_req} Pcs)!`,
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

      // Atomic realtime sync to Supabase (also catches simultaneous collision with User A)
      syncItemRealtimeAndCheckOverPick({
        itemIndex: matchIdx,
        targetItem,
        delta: 1,
        markKosong: false,
        usedLocation,
      });
    } else {
      // 2. Barcode TIDAK TERDAFTAR di Surat Jalan -> SALAH AMBIL
      playErrorBeep();
      vibrateDevice([200, 100, 200, 100]);

      const catProd =
        fastFindCatalogProduct(barcode) ||
        productCatalog.find((p) => p.k.toUpperCase().includes(barcode));

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
        picker_name: currentUser,
        last_picked_by: currentUser,
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

  // Adjust manual counter (always sets clean single-rack lokasi_picked + atomic realtime sync & over-pick check)
  const handleAdjustQty = (index: number, delta: number) => {
    const target = activeItems[index];
    if (!target) return;
    const prevPickedBy = target.last_picked_by || parsePickerNamesList(target.picker_name).slice(-1)[0] || currentUser;
    const newQty = Math.max(0, target.qty_picked + delta);

    const itemLocs = getProductLocations(target.sku, target.lokasi);
    const cleanActive = resolvePrimarySingleLocation(activeLocation || '');
    const activeBelongsToItem = Boolean(
      cleanActive && itemLocs.some((l) => l.lokasi.toUpperCase() === cleanActive.toUpperCase())
    );
    const existingSingle = resolvePrimarySingleLocation(target.lokasi_picked || '');
    const resolvedLoc =
      existingSingle || (activeBelongsToItem ? cleanActive : resolveSingleItemLocation(target));

    const updated: PickingListItem = {
      ...target,
      qty_picked: newQty,
      lokasi_picked: newQty > 0 ? resolvedLoc : target.lokasi_picked,
      is_kosong: false,
      status: (newQty >= target.qty_req ? 'SELESAI' : newQty > 0 ? 'SEDANG PICKING' : 'PENDING') as any,
      picker_name: mergePickerNamesWithLastActor(target.picker_name, currentUser),
      last_picked_by: newQty > 0 ? currentUser : target.last_picked_by,
    };
    const nextList = [...activeItems];
    nextList[index] = updated;
    setActiveItems(nextList);

    if (delta > 0 && newQty > target.qty_req) {
      playErrorBeep();
      vibrateDevice([250, 100, 250, 100, 250]);
      const lookup = lookupProductBySku(target.sku, catalogMap, target.nama_produk, target.size);
      setOverPickAlertModal({
        isOpen: true,
        sku: target.sku,
        nama_produk: lookup.nama_produk || target.nama_produk || target.sku,
        size: target.size || lookup.size || '-',
        lokasi: resolvedLoc,
        qtyReq: target.qty_req,
        newQty,
        excessQty: newQty - target.qty_req,
        previousPicker: prevPickedBy || currentUser,
        itemIndex: index,
      });
    } else if (delta > 0 && newQty === target.qty_req) {
      playSuccessBeep();
      vibrateDevice(70);
    }

    syncItemRealtimeAndCheckOverPick({
      itemIndex: index,
      targetItem: target,
      delta,
      markKosong: false,
      usedLocation: resolvedLoc,
    });
  };

  // Resolve Over-Pick Alert with 1 tap (Return excess items to shelf -> set exact qty_req)
  const handleResolveOverPickToMax = () => {
    if (!overPickAlertModal) return;
    const { sku, qtyReq } = overPickAlertModal;
    const idx = activeItems.findIndex((it) => it.sku.toUpperCase().trim() === sku.toUpperCase().trim());
    if (idx !== -1) {
      const target = activeItems[idx];
      const resolvedLoc = resolveSingleItemLocation(target);
      const nextList = [...activeItems];
      nextList[idx] = {
        ...target,
        qty_picked: qtyReq,
        lokasi_picked: resolvedLoc,
        is_kosong: false,
        status: 'SELESAI',
        picker_name: mergePickerNamesWithLastActor(target.picker_name, currentUser),
        last_picked_by: currentUser,
      };
      setActiveItems(nextList);
      syncItemRealtimeAndCheckOverPick({
        itemIndex: idx,
        targetItem: target,
        absoluteQty: qtyReq,
        markKosong: false,
        usedLocation: resolvedLoc,
      });
      playSuccessBeep();
      onNotify(`✅ Kelebihan dikoreksi! SKU ${sku} diset pas ${qtyReq}/${qtyReq} Pcs.`, 'success');
    }
    setOverPickAlertModal(null);
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

  // Quick Action: Set picked to Max (Lengkap) with guaranteed single-rack resolution & realtime sync
  const handleSetItemMax = (index: number) => {
    const target = activeItems[index];
    if (!target) return;

    const itemLocs = getProductLocations(target.sku, target.lokasi);
    const cleanActive = resolvePrimarySingleLocation(activeLocation || '');
    const activeBelongsToItem = Boolean(
      cleanActive && itemLocs.some((l) => l.lokasi.toUpperCase() === cleanActive.toUpperCase())
    );
    const existingSingle = resolvePrimarySingleLocation(target.lokasi_picked || '');
    const resolvedLoc =
      existingSingle || (activeBelongsToItem ? cleanActive : resolveSingleItemLocation(target));

    const nextList = [...activeItems];
    nextList[index] = {
      ...target,
      qty_picked: target.qty_req,
      lokasi_picked: resolvedLoc,
      is_kosong: false,
      status: 'SELESAI',
      picker_name: mergePickerNamesWithLastActor(target.picker_name, currentUser),
      last_picked_by: currentUser,
    };
    setActiveItems(nextList);
    playSuccessBeep();
    vibrateDevice(60);
    onNotify(`✓ SKU ${target.sku} diset lengkap (${target.qty_req}/${target.qty_req} Pcs) · Rak ${resolvedLoc}`, 'success');

    syncItemRealtimeAndCheckOverPick({
      itemIndex: index,
      targetItem: target,
      absoluteQty: target.qty_req,
      markKosong: false,
      usedLocation: resolvedLoc,
    });
  };

  // Quick Action: Toggle Tandai Kosong di Rak (Stok Fisik Tidak Tersedia di Rak)
  const handleToggleItemKosong = (index: number) => {
    const target = activeItems[index];
    if (!target) return;

    const currentlyKosong = Boolean(target.is_kosong || target.status === 'KOSONG');
    const nextKosong = !currentlyKosong;
    const resolvedLoc = resolveSingleItemLocation(target);

    const nextList = [...activeItems];
    nextList[index] = {
      ...target,
      is_kosong: nextKosong,
      status: nextKosong
        ? 'KOSONG'
        : target.qty_picked >= target.qty_req
        ? 'SELESAI'
        : 'SEDANG PICKING',
      picker_name: mergePickerNamesWithLastActor(target.picker_name, currentUser),
      last_picked_by: currentUser,
    };
    setActiveItems(nextList);

    if (nextKosong) {
      const noteTag = `[Stok Kosong di Rak: ${target.sku} (${resolvedLoc})]`;
      setRekapCatatan((prev) => (prev.includes(target.sku) ? prev : `${prev ? prev + ' | ' : ''}${noteTag}`));
      playCategoryBeep();
      vibrateDevice([80, 50, 80]);
      onNotify(
        `🚫 SKU ${target.sku} ditandai KOSONG DI RAK (${target.qty_picked}/${target.qty_req} Pcs). Otomatis di-hide pada layar tim picker!`,
        'warning'
      );
    } else {
      playCategoryBeep();
      onNotify(`↺ Status Kosong pada SKU ${target.sku} dibatalkan. Produk aktif kembali.`, 'info');
    }

    syncItemRealtimeAndCheckOverPick({
      itemIndex: index,
      targetItem: target,
      absoluteQty: target.qty_picked,
      markKosong: nextKosong,
      usedLocation: resolvedLoc,
    });
  };

  // Quick Action: Reset picked to 0
  const handleResetItemQty = (index: number) => {
    const target = activeItems[index];
    if (!target) return;
    const resolvedLoc = resolveSingleItemLocation(target);
    const nextList = [...activeItems];
    nextList[index] = {
      ...target,
      qty_picked: 0,
      is_kosong: false,
      status: 'SEDANG PICKING',
    };
    setActiveItems(nextList);
    onNotify(`↺ Qty SKU ${target.sku} di-reset ke 0`, 'info');

    syncItemRealtimeAndCheckOverPick({
      itemIndex: index,
      targetItem: target,
      absoluteQty: 0,
      markKosong: false,
      usedLocation: resolvedLoc,
    });
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
    const defaultSingleLoc =
      resolvePrimarySingleLocation(it.lokasi_picked || '') ||
      resolvePrimarySingleLocation(activeLocation || '') ||
      resolveSingleItemLocation(it);
    setEditingItemData({
      type,
      index,
      sku: it.sku,
      nama_produk: it.nama_produk,
      size: it.size || '-',
      qty_req: it.qty_req || 0,
      qty_picked: it.qty_picked || 0,
      lokasi: it.lokasi && it.lokasi !== 'A-01' ? it.lokasi : '-',
      lokasi_picked: defaultSingleLoc && defaultSingleLoc !== 'A-01' ? defaultSingleLoc : '',
      targetSJItemSku: '',
    });
    setIsEditItemModalOpen(true);
  };

  // Save changes from item edit dialog
  const handleSaveEditItem = () => {
    if (!editingItemData) return;
    const { type, index, qty_picked, lokasi_picked, targetSJItemSku } = editingItemData;
    const cleanSingleLoc = resolvePrimarySingleLocation(lokasi_picked || '') || lokasi_picked.trim().toUpperCase();

    if (type === 'UNEXPECTED') {
      if (targetSJItemSku) {
        // Picker resolves the wrong scan by mapping it to an actual SJ item!
        const matchIdx = activeItems.findIndex((x) => x.sku === targetSJItemSku);
        if (matchIdx !== -1) {
          const nextActive = [...activeItems];
          const target = nextActive[matchIdx];
          const newPicked = Number(target.qty_picked || 0) + Number(qty_picked);
          const resolvedLoc = cleanSingleLoc || resolveSingleItemLocation(target);
          nextActive[matchIdx] = {
            ...target,
            qty_picked: newPicked,
            lokasi_picked: resolvedLoc,
            is_kosong: false,
            status: newPicked >= target.qty_req ? 'SELESAI' : 'SEDANG PICKING',
            picker_name: mergePickerNamesWithLastActor(target.picker_name, currentUser),
            last_picked_by: currentUser,
          };
          setActiveItems(nextActive);

          syncItemRealtimeAndCheckOverPick({
            itemIndex: matchIdx,
            targetItem: target,
            absoluteQty: newPicked,
            markKosong: false,
            usedLocation: resolvedLoc,
          });

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
            lokasi_picked: cleanSingleLoc,
          };
        }
        setUnexpectedItems(nextUnexp);
        onNotify(`Data salah ambil ${editingItemData.sku} diperbarui.`, 'info');
      }
    } else {
      // REGULAR ITEM
      const nextActive = [...activeItems];
      const target = nextActive[index];
      const validPicked = Math.max(0, Number(qty_picked) || 0);
      nextActive[index] = {
        ...target,
        qty_picked: validPicked,
        lokasi_picked: cleanSingleLoc,
        is_kosong: false,
        status: validPicked >= target.qty_req ? 'SELESAI' : 'SEDANG PICKING',
        picker_name: mergePickerNamesWithLastActor(target.picker_name, currentUser),
        last_picked_by: currentUser,
      };
      setActiveItems(nextActive);
      syncItemRealtimeAndCheckOverPick({
        itemIndex: index,
        targetItem: target,
        absoluteQty: validPicked,
        markKosong: false,
        usedLocation: cleanSingleLoc,
      });
      onNotify(`SKU ${editingItemData.sku} diperbarui: ${validPicked}/${editingItemData.qty_req} pcs (Rak: ${cleanSingleLoc})`, 'success');
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
    setDeletedSjItems([]);
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
    const cleanSku = newSjSkuInput.trim().toUpperCase();
    const catProd = fastFindCatalogProduct(cleanSku);
    const targetNoSj = editingSJGroup?.no_sj || activeSJ?.no_sj || '';
    const catSize = catProd?.s || (catProd as any)?.size || (catProd as any)?.variant;
    const cleanSize = (newSjSkuSize.trim() && newSjSkuSize.trim() !== '-')
      ? newSjSkuSize.trim()
      : (catSize && catSize !== '-' ? catSize : extractSizeFromSku(cleanSku));
    const cleanNama = newSjSkuNama.trim() || catProd?.p || (catProd as any)?.nama_produk || catProd?.n || `Produk ${cleanSku}`;
    const formattedNama = cleanNama;

    const newRow: PickingListItem = {
      id: `pick_new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      no_sj: targetNoSj,
      tanggal: editingSJGroup?.tanggal || activeSJ?.tanggal || new Date().toISOString().slice(0, 10),
      tujuan: editSjTujuan || editingSJGroup?.tujuan || 'Marketplace',
      sku: cleanSku,
      nama_produk: formattedNama,
      size: cleanSize || '-',
      lokasi: newSjSkuLoc.trim() || catProd?.lokasi || '-',
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
      setDeletedSjItems([...deletedSjItems, target]);
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
    showGlobalLoading('Menyimpan perubahan Surat Jalan...');

    try {
      const targetNoSj = editingSJGroup.no_sj.trim().toUpperCase();

      // Clean & sanitize all editSjRows
      const sanitizedRows: PickingListItem[] = editSjRows
        .filter((r) => r && r.sku && r.sku.trim())
        .map((r, idx) => {
          const cleanSku = String(r.sku || '').trim().toUpperCase();
          const catMatch = fastFindCatalogProduct(cleanSku);
          const catSize = catMatch?.s || (catMatch as any)?.size || (catMatch as any)?.variant;
          const effectiveSize = (r.size && r.size !== '-') 
            ? r.size 
            : (catSize && catSize !== '-' ? catSize : extractSizeFromSku(cleanSku));
          const effectiveName = (r.nama_produk && r.nama_produk !== cleanSku)
            ? r.nama_produk
            : (catMatch?.p || (catMatch as any)?.nama_produk || catMatch?.n || r.nama_produk || cleanSku);
          return {
            ...r,
            id: r.id || `pick_new_${Date.now()}_${idx}`,
            no_sj: targetNoSj,
            tujuan: editSjTujuan.trim(),
            sku: cleanSku,
            nama_produk: effectiveName,
            size: effectiveSize || '-',
            lokasi: (r.lokasi && r.lokasi !== 'A-01' ? r.lokasi : '') || catMatch?.lokasi || '-',
            qty_req: Math.max(1, Number(r.qty_req) || 1),
            qty_picked: Math.max(0, Number(r.qty_picked) || 0),
            status: r.status || 'PENDING',
          };
        });

      if (sanitizedRows.length === 0) {
        onNotify('Surat Jalan harus memiliki minimal 1 item SKU yang valid', 'error');
        return;
      }

      // 1. Sync changes to Supabase
      const newItemsToAdd = sanitizedRows.filter((r) => !r.id || String(r.id).startsWith('pick_new_'));
      const existingItems = sanitizedRows.filter((r) => r.id && !String(r.id).startsWith('pick_new_'));
      await updatePickingSuratJalanDetailsSupabase(
        targetNoSj,
        editSjTujuan,
        existingItems,
        newItemsToAdd,
        deletedSjItems
      );

      // 2. Update rawItems locally immediately so UI and filters update without waiting for fetch
      setRawItems((prev) => {
        const otherItems = prev.filter((it) => (it.no_sj || '').trim().toUpperCase() !== targetNoSj);
        const updated = [...otherItems, ...sanitizedRows];
        try {
          const activeOnly = updated.filter((it) => it.status !== 'SELESAI').slice(0, 100);
          safeLocalStorageSet('wms_raw_picking_list_cache', JSON.stringify(activeOnly));
        } catch {}
        return updated;
      });

      // 3. Update active SJ locally if it's the one currently open in workspace
      if (activeSJ && (activeSJ.no_sj || '').trim().toUpperCase() === targetNoSj) {
        setActiveItems(sanitizedRows);
        const updatedGroup: PickingSuratJalanGroup = {
          ...activeSJ,
          tujuan: editSjTujuan.trim(),
          catatan: editSjCatatan.trim(),
          items: sanitizedRows,
          unexpected_items: Array.isArray(activeSJ.unexpected_items) ? activeSJ.unexpected_items : [],
          total_items: sanitizedRows.length,
          total_qty_req: sanitizedRows.reduce((a, b) => a + Number(b.qty_req || 0), 0),
          total_qty_picked: sanitizedRows.reduce((a, b) => a + Number(b.qty_picked || 0), 0),
        };
        setActiveSJ(updatedGroup);
      }

      playSuccessBeep();
      onNotify('Form Surat Jalan dan daftar SKU berhasil diperbarui!', 'success');
      setIsEditSJModalOpen(false);
      
    } catch (err: any) {
      onNotify(`Gagal memperbarui Surat Jalan: ${err.message}`, 'error');
    } finally {
      setIsSavingSjEdit(false);
      hideGlobalLoading();
    }
  };

  // Manual Autocomplete Search Selection
  const handleSelectSearchProduct = (prod: ProductItem) => {
    setSearchSelectedProduct(prod);
    setSearchQuery(prod.k);
    setSearchLocation(activeLocation || (prod.lokasi && prod.lokasi !== 'A-01' ? prod.lokasi : '') || '');
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
    showGlobalLoading('Memproses Batch...');

    const lines = batchInputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setIsProcessingBatch(false);
      hideGlobalLoading();
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
      hideGlobalLoading();
    setBatchInputText('');
    playSuccessBeep();
    onNotify(
      `Berhasil memproses batch: ${processedCount} SKU (${locationCount} perubahan rak)!`,
      'success'
    );
  };

  // Calculate stats for current active SJ
  const activeStats = React.useMemo(() => {
    if (!activeSJ) return { totalReq: 0, totalPicked: 0, percentage: 0, statusType: 'SEMUA_PAS' as RekapStatusType, kosongCount: 0 };
    const totalReq = activeItems.reduce((acc, it) => acc + (Number(it.qty_req) || 0), 0);
    const regularPicked = activeItems.reduce((acc, it) => acc + (Number(it.qty_picked) || 0), 0);
    const unexpectedPicked = unexpectedItems.reduce((acc, it) => acc + (Number(it.qty_picked) || 0), 0);
    const totalPicked = regularPicked + unexpectedPicked;
    const percentage = totalReq > 0 ? Math.min(100, Math.round((regularPicked / totalReq) * 100)) : 100;
    const kosongCount = activeItems.filter((it) => it.is_kosong || it.status === 'KOSONG').length;

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

    return { totalReq, totalPicked, regularPicked, unexpectedPicked, percentage, statusType, hasKurang, hasLebih, hasSalah, kosongCount };
  }, [activeSJ, activeItems, unexpectedItems]);

  // Open Rekap Modal (flush local offline items first, then sync latest remote state so freshest combined status is shown)
  const handleOpenRekapModal = () => {
    if (!activeSJ) return;
    const sjNo = activeSJ.no_sj;
    if (typeof navigator === 'undefined' || navigator.onLine) {
      syncPendingPickingItemsAndApply(false)
        .catch(() => {})
        .finally(() => {
          fetchActiveSjRealtimeRowsSupabase(sjNo)
            .then((rows) => {
              if (rows.length > 0) applyRemoteSjRowsToState(sjNo, rows);
            })
            .catch(() => {});
        });
    }
    setIsRekapModalOpen(true);
  };

  // Confirm Completion of SJ (with full Offline Outbox Protection & Multi-Picker Broadcast)
  const handleConfirmCompleteSJ = async () => {
    if (!activeSJ) return;
    setIsSubmittingRekap(true);
    showGlobalLoading('Menyimpan Rekap...');

    const completedNoSj = activeSJ.no_sj;
    const cleanNoSj = completedNoSj.toUpperCase().trim();

    // Combine all pickers who collaborated on this SJ
    const allPickersSet = new Set<string>();
    parsePickerNamesList(activeSJ.picker_name).forEach((p) => allPickersSet.add(p));
    activeItems.forEach((it) => {
      parsePickerNamesList(it.picker_name).forEach((p) => allPickersSet.add(p));
    });
    if (currentUser) allPickersSet.add(currentUser);
    const combinedPickerNames = Array.from(allPickersSet).join(', ') || currentUser || 'Operator';

    const sanitizedItems = activeItems.map((it) => ({
      ...it,
      picker_name: combinedPickerNames,
      lokasi_picked: resolveSingleItemLocation(it),
    }));
    const sanitizedUnexpected = unexpectedItems.map((unexp) => ({
      ...unexp,
      picker_name: combinedPickerNames,
      lokasi_picked: resolvePrimarySingleLocation(unexp.lokasi_picked || unexp.lokasi || '') || '-',
    }));

    // Deteksi stok rak yang berpotensi minus setelah pencatatan OUT jujur (untuk notif rekomendasi Stock Opname)
    const negativeStockAlerts: Array<{
      sku: string;
      lokasi: string;
      currentQty: number;
      pickedQty: number;
      projectedQty: number;
    }> = [];
    if (syncOutLog) {
      [...sanitizedItems, ...sanitizedUnexpected]
        .filter((x) => (Number(x.qty_picked) || 0) > 0)
        .forEach((it) => {
          const skuKey = (it.sku || '').toUpperCase().trim();
          const actualLoc = resolvePrimarySingleLocation(it.lokasi_picked || it.lokasi || '') || '';
          if (!skuKey || !actualLoc || actualLoc === '-' || !(skuKey in realtimeSkuStocks)) return;
          const rackList = realtimeSkuStocks[skuKey] || [];
          const rackMatch = rackList.find(
            (s) => (s.lokasi || '').trim().toUpperCase() === actualLoc.toUpperCase()
          );
          const currentQty = Number(rackMatch?.qty || 0);
          const pickedQty = Number(it.qty_picked) || 0;
          if (currentQty - pickedQty < 0) {
            negativeStockAlerts.push({
              sku: skuKey,
              lokasi: actualLoc,
              currentQty,
              pickedQty,
              projectedQty: currentQty - pickedQty,
            });
          }
        });
    }

    const finalizeLocalSuccess = (queuedOffline: boolean) => {
      playSaveSuccessChime();
      vibrateDevice([100, 50, 100]);

      if (negativeStockAlerts.length > 0) {
        const previewList = negativeStockAlerts
          .slice(0, 3)
          .map((a) => `${a.sku} @ ${a.lokasi} (Sisa: ${a.projectedQty})`)
          .join(', ');
        const moreSuffix = negativeStockAlerts.length > 3 ? ` (+${negativeStockAlerts.length - 3} lainnya)` : '';
        const soBody = `Stok sistem rak minus setelah picking SJ ${completedNoSj}: ${previewList}${moreSuffix}. Rekomendasi: lakukan Stock Opname pada rak tersebut.`;
        addNotificationToHub({
          title: `Rekomendasi Stock Opname (${negativeStockAlerts.length} Rak Minus)`,
          body: soBody,
          category: 'so',
          target: {
            page: 'opname',
            tag: `so-recommend-${cleanNoSj}`,
          },
        });
        setTimeout(() => {
          onNotify(`⚠️ ${soBody}`, 'warning');
        }, 500);
      }

      if (!queuedOffline) {
        broadcastPickingCollabEvent('sj_completed', {
          no_sj: cleanNoSj,
          picker_name: combinedPickerNames,
        });
      }

      if (queuedOffline) {
        onNotify(
          `📦 Mode Offline: Hasil picking ${completedNoSj} tersimpan aman di Antrean Offline & akan otomatis disinkronkan saat internet kembali!`,
          'warning'
        );
      } else if (activeStats.statusType === 'SEMUA_PAS') {
        try {
          confetti({
            particleCount: 70,
            spread: 70,
            origin: { y: 0.7 },
            colors: ['#10b981', 'var(--theme-500)', '#ffffff'],
          });
        } catch {}
        onNotify(`🎉 Surat Jalan ${completedNoSj} berhasil diselesaikan 100% LENGKAP!`, 'success');
      } else {
        onNotify(`Surat Jalan ${completedNoSj} selesai dengan catatan rekap!`, 'warning');
      }

      // Close workspace, modal & clear draft + per-item pending sync queue for completed SJ
      removePickingSjDraft(cleanNoSj);
      clearPendingPickingItemSyncForSj(cleanNoSj);
      setPendingItemSyncCount(getPendingPickingItemSyncCount());
      setIsRekapModalOpen(false);
      setOverPickAlertModal(null);
      setIsMinimized(false);
      setActiveSJ(null);
      setActiveItems([]);
      setUnexpectedItems([]);
      setActiveLocation('');
      setRekapCatatan('');
      setDraftsRevision((r) => r + 1);

      // Optimistically update rawItems so SJ moves from Belum Selesai to Selesai immediately
      setRawItems((prev) => {
        const updated = prev.map((item) => {
          if ((item.no_sj || '').toUpperCase().trim() === cleanNoSj) {
            const matchedActive = sanitizedItems.find(
              (it) => it.sku.toUpperCase().trim() === (item.sku || '').toUpperCase().trim()
            );
            return {
              ...item,
              status: 'SELESAI' as const,
              qty_picked: matchedActive ? matchedActive.qty_picked : item.qty_picked,
              lokasi_picked: matchedActive ? matchedActive.lokasi_picked : item.lokasi_picked,
              picker_name: combinedPickerNames,
              catatan: rekapCatatan || item.catatan,
            };
          }
          return item;
        });
        try {
          const activeOnly = updated.filter((it) => it.status !== 'SELESAI').slice(0, 100);
          safeLocalStorageSet('wms_raw_picking_list_cache', JSON.stringify(activeOnly));
        } catch {}
        return updated;
      });
    };

    try {
      const deviceOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (deviceOffline) {
        await completePickingSuratJalanSupabase(
          cleanNoSj,
          sanitizedItems,
          sanitizedUnexpected,
          combinedPickerNames,
          rekapCatatan,
          syncOutLog
        );
        enqueuePickingOutboxBatch({
          no_sj: cleanNoSj,
          tujuan: activeSJ.tujuan,
          items: sanitizedItems,
          unexpectedItems: sanitizedUnexpected,
          pickerName: combinedPickerNames,
          catatan: rekapCatatan,
          syncOutToLog: syncOutLog,
        });
        setPickingOutboxCount(getPickingOutboxBatches().length);
        finalizeLocalSuccess(true);
        return;
      }

      const success = await completePickingSuratJalanSupabase(
        cleanNoSj,
        sanitizedItems,
        sanitizedUnexpected,
        combinedPickerNames,
        rekapCatatan,
        syncOutLog
      );

      if (success) {
        finalizeLocalSuccess(false);
      } else {
        // Network / remote failure -> queue safely into offline outbox so data is NEVER lost
        enqueuePickingOutboxBatch({
          no_sj: cleanNoSj,
          tujuan: activeSJ.tujuan,
          items: sanitizedItems,
          unexpectedItems: sanitizedUnexpected,
          pickerName: combinedPickerNames,
          catatan: rekapCatatan,
          syncOutToLog: syncOutLog,
        });
        setPickingOutboxCount(getPickingOutboxBatches().length);
        finalizeLocalSuccess(true);
      }
    } catch {
      enqueuePickingOutboxBatch({
        no_sj: cleanNoSj,
        tujuan: activeSJ.tujuan,
        items: sanitizedItems,
        unexpectedItems: sanitizedUnexpected,
        pickerName: combinedPickerNames,
        catatan: rekapCatatan,
        syncOutToLog: syncOutLog,
      });
      setPickingOutboxCount(getPickingOutboxBatches().length);
      finalizeLocalSuccess(true);
    } finally {
      setIsSubmittingRekap(false);
      hideGlobalLoading();
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
      const found = fastFindCatalogProduct(String(value));
      if (found) {
        next[index].nama_produk = found.p;
        next[index].size = found.s || '-';
        next[index].lokasi = (found.lokasi && found.lokasi !== 'A-01' ? found.lokasi : '') || '';
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
    showGlobalLoading('Membuat SJ...');
    try {
      const res = await createPickingSuratJalanSupabase(newSjNumber, newSjTujuan, validRows);
      if (res.success) {
        const invoiceMsg = res.invoice_picking ? ` (Kode Antrian: ${res.invoice_picking})` : '';
        onNotify(`Surat Jalan ${newSjNumber} berhasil dibuat di Database!${invoiceMsg}`, 'success');
        setIsCreateModalOpen(false);
        setNewSjNumber('');
        setNewSjTujuan('');
        setNewSjRows([{ sku: '', nama_produk: '', size: '', lokasi: '', qty_req: 1 }]);
        
      } else {
        onNotify('Gagal menyimpan Surat Jalan baru ke Database', 'error');
      }
    } catch (err: any) {
      onNotify(`Error: ${err.message}`, 'error');
    } finally {
      setIsCreatingSj(false);
      hideGlobalLoading();
    }
  };

  // =========================================================================
  // RENDER WORKSPACE: VIEW 1 (Daftar SJ) vs VIEW 2 (Active SJ Workspace)
  // =========================================================================
  return (
    <>
      {activeSJ && !isMinimized ? (
        <div className="w-full max-w-full space-y-2.5 pb-8">
          {/* Top Header Bar */}
          <div className="bg-white dark:bg-[#131d31] p-2 sm:p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            {(!isOnline || pendingItemSyncCount > 0) && (
              <div
                className={`mb-2 px-3 py-1.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold ${
                  !isOnline
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {!isOnline ? (
                    <WifiOff className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                  )}
                  {!isOnline
                    ? `Mode Offline Aktif — Semua scan & perubahan progres picking tersimpan aman di antrean perangkat${
                        pendingItemSyncCount > 0 ? ` (${pendingItemSyncCount} SKU menunggu online)` : ''
                      }.`
                    : `${pendingItemSyncCount} SKU hasil picking offline siap dikirim ke server.`}
                </span>
                {isOnline && pendingItemSyncCount > 0 && (
                  <button
                    type="button"
                    onClick={() => syncPendingPickingItemsAndApply(true)}
                    className="px-2.5 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-extrabold cursor-pointer transition"
                  >
                    Sinkronkan Sekarang
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      flushActivePickingSessionNow();
                      handleOpenCancelPickingModal(activeSJ, 'VIEW2', 'EXIT_FORM');
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1 px-2 -ml-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95"
                  >
                    <ArrowLeft className="w-4 h-4 text-primary-500" /> Kembali ke Daftar SJ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      flushActivePickingSessionNow();
                      handleMinimizeActiveSJ();
                    }}
                    className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/70 py-1 px-2.5 rounded-lg transition-all active:scale-95 cursor-pointer"
                    title="Minimize sesi picking agar bisa buka menu lain tanpa kehilangan progres scan"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Minimize Picking</span>
                  </button>
                  {(() => {
                    const pickersList: string[] = [];
                    const addUnique = (raw?: string) => {
                      parsePickerNamesList(raw).forEach((p) => {
                        if (!pickersList.some((ex) => isSameOperatorIdentity(ex, p))) pickersList.push(p);
                      });
                    };
                    addUnique(activeSJ.picker_name);
                    activeItems.forEach((it) => addUnique(it.picker_name));
                    const otherPickers = pickersList.filter(
                      (p) => !isSameOperatorIdentity(p, currentUser)
                    );
                    const isCoPicking = otherPickers.length > 0;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          flushActivePickingSessionNow();
                          handleOpenCancelPickingModal(activeSJ, 'VIEW2', 'CANCEL_PICK');
                        }}
                        className="flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 bg-white hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 py-1 px-2.5 rounded-lg transition-all active:scale-95 cursor-pointer"
                        title={
                          isCoPicking
                            ? 'Batal ikut bantu pengerjaan SJ ini (rekan tim tetap lanjut)'
                            : 'Batalkan pengambilan SJ ini atau simpan status terakhir & keluar'
                        }
                      >
                        <LogOut className="w-3.5 h-3.5 text-rose-500" />
                        <span>{isCoPicking ? 'Batal Bantu' : 'Batal Ambil'}</span>
                      </button>
                    );
                  })()}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                      isOnline
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {isOnline ? 'Realtime Sync Aktif' : 'Offline · Tersimpan Lokal'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black font-mono text-slate-800 dark:text-white uppercase tracking-tight">
                    {activeSJ.no_sj}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-primary-500/10 text-primary-500 border border-primary-500/20">
                    {activeSJ.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenEditSJModal(activeSJ)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-[11px] rounded-lg flex items-center gap-1 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 ml-1"
                    title="Ubah info SJ, tambah SKU baru atau ubah target SKU"
                  >
                    <FileEdit className="w-3.5 h-3.5 text-primary-500" />
                    <span>Kelola Form SJ</span>
                  </button>
                </div>
                <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    Tujuan: <b className="text-slate-700 dark:text-slate-200">{activeSJ.tujuan}</b>
                  </span>
                  {(() => {
                    const pickersArr: string[] = [];
                    const addUnique = (raw?: string) => {
                      parsePickerNamesList(raw).forEach((p) => {
                        if (!pickersArr.some((ex) => isSameOperatorIdentity(ex, p))) pickersArr.push(p);
                      });
                    };
                    addUnique(activeSJ.picker_name);
                    activeItems.forEach((it) => addUnique(it.picker_name));
                    if (currentUser && !pickersArr.some((ex) => isSameOperatorIdentity(ex, currentUser))) {
                      pickersArr.push(currentUser);
                    }
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-extrabold text-[11px]">
                        <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>
                          {pickersArr.length > 1
                            ? `Tim Picker Aktif (${pickersArr.length}): ${pickersArr.map((p) => formatOperatorWithPersonName(p)).join(', ')}`
                            : `Dikerjakan oleh: ${formatOperatorWithPersonName(pickersArr[0] || currentUser)}`}
                        </span>
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Rekap Status Badge (ENLARGED FOR MOBILE VISIBILITY) */}
              <div className="text-right bg-slate-50 dark:bg-slate-800/70 px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                <div className="text-[10px] font-extrabold uppercase text-slate-400 mb-0.5">Total Terambil</div>
                <div className="text-3xl sm:text-4xl font-black font-mono tabular-nums text-slate-800 dark:text-white flex items-baseline justify-end gap-1 leading-none">
                  <span className={activeStats.percentage === 100 ? 'text-emerald-500' : 'text-primary-500'}>
                    {activeStats.regularPicked}
                  </span>
                  <span className="text-base sm:text-lg text-slate-400 font-extrabold">/ {activeStats.totalReq} Pcs</span>
                </div>
              </div>
            </div>

            {/* Progress Bar Visual */}
            <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex flex-wrap justify-between items-center text-xs font-bold mb-1.5 gap-1">
                <span className="text-slate-600 dark:text-slate-400">
                  {activeStats.percentage}% Selesai ({activeItems.filter((i) => i.qty_picked >= i.qty_req).length} dari {activeItems.length} SKU
                  {activeStats.kosongCount > 0 ? ` • ${activeStats.kosongCount} Kosong` : ''})
                </span>
                <div className="flex items-center gap-2">
                  {activeStats.kosongCount > 0 && (
                    <span className="text-rose-500 font-extrabold text-[11px] flex items-center gap-1">
                      <Ban className="w-3.5 h-3.5" /> {activeStats.kosongCount} SKU Ditandai Kosong
                    </span>
                  )}
                  {activeStats.hasLebih && (
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold text-[11px] flex items-center gap-1 animate-pulse">
                      <AlertOctagon className="w-3.5 h-3.5" /> Ada Kelebihan Ambil (Over-Pick)!
                    </span>
                  )}
                  {activeStats.hasKurang && !activeStats.hasLebih && (
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
              </div>
              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    activeStats.percentage === 100 ? 'bg-emerald-500' : 'bg-primary-500'
                  }`}
                  style={{ width: `${activeStats.percentage}%` }}
                />
              </div>
            </div>
          </div>

        {/* STICKY BARCODE SCANNER BAR (FREEZE / STICKY AT TOP UNDER NAVBAR) */}
        <div className="sticky top-0.5 z-20 bg-[#f4f6f8]/95 dark:bg-[#0f172a]/95 backdrop-blur-md pt-1 pb-2">
          <div className="bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md">
            {/* METODE PEMINDAIAN SELECTOR */}
            <div
              id="pickingScanMethodContainer"
              className="bg-white dark:bg-[#0F0F12] rounded-t-[inherit] px-2 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800/80 transition-colors"
            >
              <div className="max-w-lg mx-auto">
                <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Metode Pemindaian · <span className="font-mono text-slate-600 dark:text-slate-300">{activeSJ.no_sj} ({activeStats.regularPicked}/{activeStats.totalReq})</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleMinimizeActiveSJ}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[10px] font-extrabold transition-colors cursor-pointer"
                    title="Minimize sesi picking ke dock mengambang"
                  >
                    <Minimize2 className="w-3 h-3 text-indigo-500" />
                    <span>Minimize</span>
                  </button>
                </div>
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
                          className="text-slate-400 hover:text-primary-500 text-[10px] ml-0.5 cursor-pointer font-sans"
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
              <div className="bg-transparent px-2 py-3.5 border-b border-slate-200 dark:border-slate-800/80">
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
                            // 2. Early-exit search in global catalog (stops at 12 matches instead of scanning 29,000 items)
                            const catMatches: ProductItem[] = [];
                            if (searchQuery.trim().length >= 2) {
                              for (let idx = 0; idx < productCatalog.length; idx++) {
                                const p = productCatalog[idx];
                                if (partialSearchMatch(searchQuery, p.k, p.p, p.s, p.lokasi, p.category)) {
                                  catMatches.push(p);
                                  if (catMatches.length >= 12) break;
                                }
                              }
                            }

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
                                    {sjMatches.map((m, mIdx) => (
                                      <button
                                        key={`${m.sku}_${m.lokasi || ''}_${mIdx}`}
                                        type="button"
                                        onClick={() => {
                                          setSearchQuery(m.sku);
                                          const safeLoc = m.lokasi && m.lokasi !== 'A-01' ? m.lokasi : '';
                                          setSearchLocation(activeLocation || safeLoc);
                                          setIsSearchDropdownOpen(false);
                                        }}
                                        className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs flex justify-between items-center transition-colors cursor-pointer"
                                      >
                                        <div>
                                          <div className="font-mono font-bold text-slate-800 dark:text-white">{m.sku}</div>
                                          <div className="text-[11px] text-slate-500">{m.nama_produk}</div>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-[10px] font-bold text-slate-400 block">
                                            Rak: {m.lokasi && m.lokasi !== 'A-01' ? m.lokasi : '-'}
                                          </span>
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
                                    {catMatches.map((m, mIdx) => (
                                      <button
                                        key={`${m.k}_${m.s || ''}_${mIdx}`}
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
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSearchQty(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
                          }}
                          onBlur={() => {
                            if (searchQty === '' || Number(searchQty) < 1) {
                              setSearchQty(1);
                            }
                          }}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 rounded-xl text-xs font-black text-center text-slate-800 dark:text-white outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-2 py-2 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1 cursor-pointer"
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

          </div>
        </div>

        {/* Warning Section for Unexpected / Wrong Items (Salah Ambil) */}
        {unexpectedItems && unexpectedItems.length > 0 && (
          <div className="bg-primary-50 dark:bg-primary-950/40 border-2 border-primary-400 dark:border-primary-700 p-4 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-primary-600 dark:text-primary-400 animate-pulse" />
                <div>
                  <h3 className="text-xs font-black text-primary-800 dark:text-primary-300 uppercase">
                    Barang Salah Ambil / Tidak Ada di SJ ({unexpectedItems.length} Item)
                  </h3>
                  <p className="text-[11px] text-primary-600 dark:text-primary-400 font-medium">
                    Item berikut ter-scan tetapi TIDAK terdaftar di Surat Jalan ini. Anda dapat mengoreksi ke SKU SJ yang benar atau menghapusnya.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {(unexpectedItems || []).map((unexp, idx) => (
                <div
                  key={idx}
                  className="bg-white dark:bg-[#131d31] p-3 rounded-xl border border-primary-200 dark:border-primary-900 flex flex-wrap justify-between items-center gap-2"
                >
                  <div className="min-w-[180px]">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-extrabold text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/50 px-2 py-0.5 rounded">
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
                    <span className="text-sm font-black font-mono text-primary-600 dark:text-primary-400">
                      +{unexp.qty_picked} Pcs
                    </span>

                    {/* Counter Buttons */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                      <button
                        onClick={() => handleAdjustUnexpectedQty(idx, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-[#131d31] text-slate-600 dark:text-slate-300 hover:text-primary-600 cursor-pointer"
                        title="Kurangi 1"
                      >
                        <MinusCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAdjustUnexpectedQty(idx, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-[#131d31] text-slate-600 dark:text-slate-300 hover:text-primary-600 cursor-pointer"
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
                      className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/50 rounded-lg transition-colors cursor-pointer"
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
          <div className="flex flex-wrap justify-between items-center gap-2 px-1">
            <h2 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Daftar Barang Surat Jalan ({activeItems.length} SKU)
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const hiddenDoneOrKosongCount = activeItems.filter(
                  (i) => (Number(i.qty_picked) || 0) === (Number(i.qty_req) || 1) || i.is_kosong || i.status === 'KOSONG'
                ).length;
                return (
                  <button
                    type="button"
                    onClick={() => setHideCompleted(!hideCompleted)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-extrabold rounded-xl border transition-all cursor-pointer shadow-xs ${
                      hideCompleted
                        ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {hideCompleted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>
                      {hideCompleted
                        ? `Tampilkan Selesai/Kosong (${hiddenDoneOrKosongCount})`
                        : 'Sembunyikan Selesai/Kosong'}
                    </span>
                  </button>
                );
              })()}
              <span className="text-[11px] font-bold text-slate-500">
                {activeLocation ? `📍 Filter Rak: ${activeLocation}` : 'Semua Rak'}
              </span>
            </div>
          </div>

          {(activeItems || []).map((item, index) => {
            if (!item) return null;
            const reqQty = Math.max(1, Number(item.qty_req) || 1);
            const pickedQty = Math.max(0, Number(item.qty_picked) || 0);
            const isKosong = Boolean(item.is_kosong || item.status === 'KOSONG');
            const isOver = pickedQty > reqQty;
            const isCompleted = pickedQty >= reqQty && !isOver;
            // Auto-hide items that are exact-picked (isCompleted) or marked empty (isKosong) when hideCompleted is on.
            // Over-picked items (isOver) stay visible so operators can immediately spot and fix the excess!
            if (hideCompleted && (isCompleted || isKosong)) return null;
            const itemSku = String(item.sku || '').trim().toUpperCase();

            const productLocs = getProductLocations(itemSku, item.lokasi);
            const isRealtimeLoaded = itemSku in realtimeSkuStocks;
            const emptyRecordedRacks = getRecordedEmptyLocations(itemSku);

            const isCurrentShelf = activeLocation && (
              productLocs.some(l => l && l.lokasi && l.lokasi.toUpperCase() === activeLocation.toUpperCase())
            );

            let cardBorder = 'border-slate-200 dark:border-slate-800';
            let statusBadge = (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shrink-0">
                Belum
              </span>
            );

            if (isKosong) {
              cardBorder = 'border-rose-300 dark:border-rose-800/70 bg-rose-50/30 dark:bg-rose-950/20';
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 inline-flex items-center gap-1 shrink-0">
                  <Ban className="w-3 h-3 shrink-0" /> Kosong di Rak
                </span>
              );
            } else if (isOver) {
              cardBorder = 'border-rose-400 dark:border-rose-700 bg-rose-50/30 dark:bg-rose-950/25 ring-2 ring-rose-500/30';
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white border border-rose-600 inline-flex items-center gap-1 animate-pulse shrink-0">
                  <AlertOctagon className="w-3 h-3 shrink-0" /> LEBIH +{pickedQty - reqQty} PCS
                </span>
              );
            } else if (isCompleted) {
              cardBorder = 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/20 dark:bg-emerald-950/10';
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3 h-3 shrink-0" /> Pas Selesai
                </span>
              );
            } else if (pickedQty > 0) {
              cardBorder = 'border-amber-200 dark:border-amber-800/50 bg-amber-50/10 dark:bg-amber-950/10';
              statusBadge = (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-700 shrink-0">
                  Kurang {reqQty - pickedQty}
                </span>
              );
            }

            const lookup = lookupProductBySku(item.sku, catalogMap, item.nama_produk, item.size);
            const displayName = lookup.nama_produk;
            const displaySize = (item.size && item.size !== '-') 
              ? item.size 
              : (lookup.size !== '-' ? lookup.size : 'ALL');
            const itemPickers = parsePickerNamesList(item.picker_name);
            const lastPickedBy = item.last_picked_by || (itemPickers.length > 0 ? itemPickers[itemPickers.length - 1] : '');

            return (
              <div
                key={item.id || index}
                className={`overflow-hidden rounded-2xl bg-white dark:bg-[#131d31] border ${
                  isCurrentShelf ? 'border-indigo-500 ring-2 ring-indigo-500/35' : cardBorder
                } shadow-2xs transition-all`}
              >
                {/* BAND 1 — HEADER STRIP: WHERE (RAK) ↔ HOW MANY (AMBIL N PCS) */}
                <div className="px-3 sm:px-4 py-2.5 bg-slate-50/90 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2.5">
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                    {productLocs.length > 0 ? (
                      productLocs.map((locInfo, locIdx) => {
                        const loc = locInfo.lokasi;
                        const isThisCurrentShelf = activeLocation && loc.toUpperCase() === activeLocation.toUpperCase();
                        const hasQty = locInfo.qty !== undefined && locInfo.qty !== null;
                        return (
                          <button
                            key={locIdx}
                            type="button"
                            onClick={() => handleSelectItemLocation(index, loc)}
                            className={`h-9 px-3 rounded-xl font-mono font-black text-sm sm:text-base inline-flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 max-w-full ${
                              isThisCurrentShelf
                                ? 'bg-indigo-600 text-white border border-indigo-600 shadow-2xs'
                                : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            }`}
                            title={`Klik untuk pilih rak ${loc} (Sisa stok sistem di rak: ${locInfo.qty ?? 0} pcs • Target ambil: ${reqQty} pcs)`}
                          >
                            <MapPin className="w-4 h-4 text-inherit shrink-0" />
                            <span className="truncate">{loc}</span>
                            {hasQty && (
                              <span className="text-[11px] font-sans font-medium opacity-70">
                                (stok {locInfo.qty})
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : /store|toko|sps|outlet/i.test(activeSJ?.tujuan || '') ? (
                      /* FULFILL STORE: DISPLAY STORE LOCATION BADGE */
                      <div className="h-9 px-3 rounded-xl font-mono font-black text-sm sm:text-base inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <Building className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>
                          {item.lokasi && item.lokasi !== '-' && item.lokasi !== 'KOSONG' && item.lokasi !== 'A-01'
                            ? item.lokasi
                            : activeSJ?.tujuan || 'STORE'}
                        </span>
                      </div>
                    ) : isRealtimeLoaded ? (
                      /* KETIKA STOK GUDANG 0 PCS — WAJIB TAMPIL STOK KOSONG (TIDAK BOLEH FALLBACK RAK PALSU) */
                      <div
                        className="h-9 px-3 rounded-xl font-mono font-black text-xs sm:text-sm inline-flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                        title={
                          emptyRecordedRacks.length > 0
                            ? `Stok gudang 0 pcs. Rak tercatat sebelumnya: ${Array.from(new Set(emptyRecordedRacks)).join(', ')}`
                            : 'Stok gudang kosong (0 pcs)'
                        }
                      >
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span>STOK KOSONG (0)</span>
                      </div>
                    ) : (
                      /* SEBELUM REALTIME STOCK SELESAI DIMUAT */
                      (() => {
                        const validTokens =
                          item.lokasi && item.lokasi !== '-' && item.lokasi !== 'KOSONG'
                            ? Array.from(
                                new Set(
                                  String(item.lokasi)
                                    .split(/[,/;\n|]+/)
                                    .map((s) =>
                                      s
                                        .replace(/\([^)]*pcs[^)]*\)/gi, '')
                                        .trim()
                                        .toUpperCase()
                                    )
                                    .filter(
                                      (s) =>
                                        s &&
                                        s !== '-' &&
                                        s !== '--' &&
                                        s !== 'KOSONG' &&
                                        s !== 'WAREHOUSE' &&
                                        s !== 'A-01'
                                    )
                                )
                              )
                            : [];
                        if (validTokens.length > 0) {
                          return validTokens.map((tok, tokIdx) => {
                            const isThisCurrentShelf = activeLocation && tok === activeLocation.toUpperCase();
                            return (
                              <button
                                key={tokIdx}
                                type="button"
                                onClick={() => handleSelectItemLocation(index, tok)}
                                className={`h-9 px-3 rounded-xl font-mono font-black text-sm sm:text-base inline-flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                                  isThisCurrentShelf
                                    ? 'bg-indigo-600 text-white border border-indigo-600 shadow-2xs'
                                    : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                }`}
                                title={`Klik untuk pilih rak ${tok}`}
                              >
                                <MapPin className="w-4 h-4 text-inherit shrink-0" />
                                <span>{tok}</span>
                              </button>
                            );
                          });
                        }
                        return (
                          <div className="h-9 px-3 rounded-xl font-mono font-bold text-xs inline-flex items-center gap-1.5 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Cek Stok Rak...</span>
                          </div>
                        );
                      })()
                    )}

                    {/* Pill Lokasi Manual yang dipilih Picker (jika tidak ada di daftar rak otomatis) */}
                    {(() => {
                      const pickedManual = resolvePrimarySingleLocation(item.lokasi_picked || '');
                      const alreadyListed =
                        pickedManual && productLocs.some((l) => l.lokasi.toUpperCase() === pickedManual.toUpperCase());
                      if (!pickedManual || pickedManual === '-' || pickedManual === 'A-01' || alreadyListed) return null;
                      const isThisManualActive = activeLocation && pickedManual.toUpperCase() === activeLocation.toUpperCase();
                      return (
                        <button
                          type="button"
                          onClick={() => handleSelectItemLocation(index, pickedManual)}
                          className={`h-9 px-3 rounded-xl font-mono font-black text-sm sm:text-base inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                            isThisManualActive
                              ? 'bg-indigo-600 text-white border border-indigo-600 shadow-2xs'
                              : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                          }`}
                          title={`Lokasi manual dipilih: ${pickedManual}`}
                        >
                          <MapPin className="w-4 h-4 shrink-0" />
                          <span>{pickedManual}</span>
                          <span className="text-[10px] font-sans font-semibold opacity-80">(Manual)</span>
                        </button>
                      );
                    })()}

                    {/* Input Lokasi Rak Manual */}
                    {manualLocIndex === index ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const clean = manualLocInput.trim().toUpperCase();
                          if (!clean) return;
                          handleSelectItemLocation(index, clean);
                          setManualLocIndex(null);
                          setManualLocInput('');
                        }}
                        className="h-9 flex items-center gap-1 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-xl px-1.5"
                      >
                        <input
                          type="text"
                          value={manualLocInput}
                          onChange={(e) => setManualLocInput(e.target.value.toUpperCase())}
                          placeholder="Rak (A012)"
                          autoFocus
                          className="w-24 sm:w-28 px-1.5 py-0.5 text-xs font-mono font-bold uppercase bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition"
                        >
                          Pakai
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setManualLocIndex(null);
                            setManualLocInput('');
                          }}
                          className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          title="Batal"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setManualLocIndex(index);
                          setManualLocInput(resolvePrimarySingleLocation(item.lokasi_picked || '') || '');
                        }}
                        className="h-9 px-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-2xs"
                        title="Input lokasi rak manual jika barang diambil dari rak lain atau data lokasi kosong"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span>{productLocs.length === 0 ? '+ Lokasi' : '+ Rak'}</span>
                      </button>
                    )}

                    {isCurrentShelf && (
                      <span className="h-9 px-2.5 rounded-xl text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 inline-flex items-center uppercase tracking-wider">
                        🎯 Rak Aktif
                      </span>
                    )}
                  </div>

                  {/* HERO TARGET QTY BOX (SATU-SATUNYA ANGKA BESAR PCS PERINTAH AMBIL) */}
                  <div
                    className={`px-3 py-1.5 rounded-xl text-center min-w-[76px] sm:min-w-[88px] shadow-2xs shrink-0 ${
                      isKosong
                        ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 line-through'
                        : isOver
                        ? 'bg-rose-600 text-white ring-2 ring-rose-300'
                        : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                    title={`Target yang harus diambil dari rak: ${reqQty} pcs`}
                  >
                    <span className="block text-[9.5px] font-extrabold uppercase tracking-wider opacity-85 leading-none">
                      AMBIL
                    </span>
                    <span className="block font-mono text-lg sm:text-xl font-black leading-tight tabular-nums mt-0.5">
                      {reqQty} <span className="text-[11px] font-bold">PCS</span>
                    </span>
                  </div>
                </div>

                {/* BAND 2 — PRODUCT IDENTITY BODY: BIG PRODUCT NAME + BIG SIZE BOX */}
                <div className="px-3 sm:px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <h4
                        className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-snug tracking-tight break-words"
                        title={displayName}
                      >
                        {displayName}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400">
                          {item.sku}
                        </span>
                        {statusBadge}
                        {isKosong && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
                            <Ban className="w-3 h-3 shrink-0" />
                            <span>Kosong {lastPickedBy ? `(${formatOperatorWithPersonName(lastPickedBy)})` : ''}</span>
                          </span>
                        )}
                        {!isKosong && pickedQty > 0 && lastPickedBy && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                            <Users className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span>
                              Diambil: {itemPickers.length > 1 ? itemPickers.map((p) => formatOperatorWithPersonName(p)).join(', ') : formatOperatorWithPersonName(lastPickedBy)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {displaySize && displaySize !== '-' && (
                      <div className="min-w-[54px] sm:min-w-[60px] px-2.5 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/75 border-2 border-amber-400 dark:border-amber-600 text-center shrink-0">
                        <span className="block text-[9px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 leading-none">
                          SIZE
                        </span>
                        <span className="block font-mono text-base sm:text-lg font-black text-amber-950 dark:text-amber-100 uppercase leading-tight mt-0.5">
                          {displaySize}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* CONDITIONAL WARNINGS */}
                  {isOver && (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                        <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          Terambil Berlebih! Target <b>{reqQty} pcs</b>, Terambil <b>{pickedQty} pcs</b> (Lebih +{pickedQty - reqQty} pcs).
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSetItemMax(index)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer active:scale-95"
                      >
                        Kembalikan Kelebihan (Set {reqQty}/{reqQty})
                      </button>
                    </div>
                  )}

                  {item.lokasi &&
                    item.lokasi !== '-' &&
                    item.lokasi !== 'A-01' &&
                    item.lokasi !== 'KOSONG' &&
                    item.lokasi_picked &&
                    item.lokasi_picked !== item.lokasi &&
                    item.lokasi_picked !== 'KOSONG' && (
                      <div className="text-xs text-amber-800 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
                        ⚠️ Diambil dari rak: <b>{item.lokasi_picked}</b> (Target SJ: {item.lokasi})
                      </div>
                    )}
                </div>

                {/* BAND 3 — THUMB-FRIENDLY ACTION FOOTER (HP & DESKTOP) */}
                <div className="px-3 sm:px-4 py-2.5 bg-slate-50/60 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  {/* Primary Control Row: Counter + Ambil Pas (fits cleanly on 1 row on 360px phones) */}
                  <div className="flex items-center gap-2 flex-1 sm:flex-none">
                    <div className="h-11 flex items-center gap-1 bg-white dark:bg-[#0f172a] p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs shrink-0">
                      <button
                        type="button"
                        onClick={() => handleAdjustQty(index, -1)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-indigo-600 active:scale-95 transition-all cursor-pointer"
                        title="Kurangi 1"
                      >
                        <MinusCircle className="w-5 h-5" />
                      </button>
                      <div className="px-1.5 min-w-[56px] text-center flex items-baseline justify-center">
                        <span
                          className={`text-xl font-black font-mono tabular-nums leading-none ${
                            isKosong
                              ? 'text-rose-500 line-through'
                              : isOver
                              ? 'text-rose-600 dark:text-rose-400'
                              : isCompleted
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {item.qty_picked}
                        </span>
                        <span className="text-xs font-bold font-mono text-slate-400 ml-0.5">
                          /{reqQty}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAdjustQty(index, 1)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-indigo-600 active:scale-95 transition-all cursor-pointer"
                        title="Tambah 1"
                      >
                        <PlusCircle className="w-5 h-5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSetItemMax(index)}
                      className={`flex-1 sm:flex-none h-11 px-4 text-xs sm:text-sm font-extrabold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                        isCompleted
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                      }`}
                      title="Set langsung selesai (Pas sesuai Qty Target)"
                    >
                      {isCompleted ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Selesai ({reqQty})</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 shrink-0" />
                          <span>Ambil Pas ({reqQty})</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Secondary Utility Row: Full readable labels on Mobile HP, compact on Desktop */}
                  <div className="grid grid-cols-3 sm:flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemKosong(index)}
                      className={`h-9 sm:h-11 px-2.5 text-xs font-bold rounded-xl border transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                        isKosong
                          ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                      }`}
                      title={
                        isKosong
                          ? 'Batalkan status Kosong di Rak'
                          : 'Tandai produk ini Kosong / Tidak Tersedia di Rak Stok'
                      }
                    >
                      <Ban className="w-3.5 h-3.5 shrink-0" />
                      <span>{isKosong ? 'Batal Kosong' : 'Kosong'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleResetItemQty(index)}
                      className="h-9 sm:h-11 px-2.5 sm:w-10 sm:px-0 text-xs font-bold flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700/60 rounded-xl transition-all active:scale-95 cursor-pointer"
                      title="Reset ke 0"
                    >
                      <RotateCcw className="w-4 h-4 shrink-0" />
                      <span className="sm:hidden">Reset</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditItem('REGULAR', index)}
                      className="h-9 sm:h-11 px-2.5 sm:w-10 sm:px-0 text-xs font-bold flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-all active:scale-95 cursor-pointer"
                      title="Edit Qty / Rak Tertentu"
                    >
                      <Edit3 className="w-4 h-4 shrink-0" />
                      <span className="sm:hidden">Edit</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty state when all items are hidden by hideCompleted */}
          {hideCompleted &&
            activeItems.length > 0 &&
            activeItems.every((it) => {
              const req = Math.max(1, Number(it.qty_req) || 1);
              const picked = Math.max(0, Number(it.qty_picked) || 0);
              const isK = Boolean(it.is_kosong || it.status === 'KOSONG');
              return (picked >= req && picked <= req) || isK;
            }) && (
              <div className="p-6 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border-2 border-dashed border-emerald-300 dark:border-emerald-800 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <div className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                  Semua SKU Sudah Selesai Di-Pick / Ditandai!
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Seluruh {activeItems.length} SKU pada Surat Jalan ini sudah selesai terambil atau ditandai kosong. Silakan klik <b>Selesaikan Picking (Cek Rekap)</b> di bawah atau tampilkan daftar item jika ingin memeriksa ulang.
                </p>
                <button
                  type="button"
                  onClick={() => setHideCompleted(false)}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Tampilkan Semua Item ({activeItems.length} SKU)</span>
                </button>
              </div>
            )}
        </div>

        {/* NON-STICKY BOTTOM ACTION BAR (At the end of picking list as requested) */}
        <div className="mt-3 bg-white dark:bg-[#131d31] p-3 sm:p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs">
              <span className="text-slate-400 font-bold block text-[10px] uppercase">Ringkasan SJ (Realtime)</span>
              <span className="font-black font-mono text-slate-800 dark:text-white text-xl sm:text-2xl">
                {activeStats.regularPicked} / {activeStats.totalReq} Pcs
              </span>
              {activeStats.kosongCount > 0 && (
                <span className="text-rose-500 font-extrabold text-xs ml-2">
                  ({activeStats.kosongCount} SKU Kosong)
                </span>
              )}
              {unexpectedItems.length > 0 && (
                <span className="text-primary-500 font-extrabold text-[11px] ml-1">
                  (+{activeStats.unexpectedPicked} Salah Ambil)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleMinimizeActiveSJ}
              className="px-3 py-3 rounded-xl font-extrabold text-xs bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              title="Minimize sesi picking agar bisa cek SJ atau halaman lain"
            >
              <Minimize2 className="w-4 h-4 text-indigo-500" />
              <span>Minimize</span>
            </button>

            <button
              onClick={handleOpenRekapModal}
              className={`px-4 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95 flex items-center gap-2 cursor-pointer ${
                activeStats.statusType === 'SEMUA_PAS'
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                  : 'bg-primary-500 hover:bg-primary-600 text-white shadow-primary-500/20'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Selesaikan Picking (Cek Rekap)</span>
            </button>
          </div>
        </div>

        {/* MODAL PERINGATAN TABRAKAN OVER-PICK (SAAT A & B AMBIL ITEM YANG SAMA MELEBIHI TARGET) */}
        {overPickAlertModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-[#131d31] w-full max-w-md rounded-3xl border-2 border-rose-500 shadow-2xl overflow-hidden flex flex-col">
              <div className="p-4 bg-rose-600 text-white flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <AlertOctagon className="w-7 h-7 text-white animate-bounce" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-rose-100">
                    Peringatan Petugas Terakhir · Over-Pick!
                  </div>
                  <h3 className="text-base sm:text-lg font-black uppercase leading-tight">
                    Produk Terambil Lebih!
                  </h3>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-1.5">
                  <div className="text-xs font-mono font-black text-rose-700 dark:text-rose-300">
                    SKU: {overPickAlertModal.sku}
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    {overPickAlertModal.nama_produk}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 pt-1">
                    {overPickAlertModal.previousPicker &&
                    overPickAlertModal.previousPicker.toLowerCase() !== (currentUser || '').toLowerCase() ? (
                      <>
                        Produk ini sudah diambil lebih dulu oleh{' '}
                        <b className="text-rose-600 dark:text-rose-400">
                          {formatOperatorWithPersonName(overPickAlertModal.previousPicker)}
                        </b>{' '}
                        (Target {overPickAlertModal.qtyReq} pcs). Karena Anda baru saja mengambil lagi, total terambil menjadi berlebih (+{overPickAlertModal.excessQty} pcs).
                      </>
                    ) : (
                      <>
                        Jumlah produk yang Anda ambil melebihi jumlah permintaan pada Surat Jalan ini.
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] font-bold uppercase text-slate-400">Permintaan SJ</div>
                    <div className="text-xl font-black font-mono text-slate-800 dark:text-white">
                      {overPickAlertModal.qtyReq} Pcs
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800">
                    <div className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-300">Total Terambil</div>
                    <div className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">
                      {overPickAlertModal.newQty} Pcs
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800">
                    <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">Kelebihan</div>
                    <div className="text-xl font-black font-mono text-amber-700 dark:text-amber-300">
                      +{overPickAlertModal.newQty - overPickAlertModal.qtyReq} Pcs
                    </div>
                  </div>
                </div>

                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Silakan kembalikan kelebihan <b>{overPickAlertModal.newQty - overPickAlertModal.qtyReq} pcs</b> ke rak dan tekan tombol di bawah agar jumlah kembali pas (<b>{overPickAlertModal.qtyReq}/{overPickAlertModal.qtyReq} pcs</b>).
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#0f172a] border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleResolveOverPickToMax}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Kembalikan Kelebihan (Set Pas {overPickAlertModal.qtyReq}/{overPickAlertModal.qtyReq})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOverPickAlertModal(null)}
                  className="py-3 px-3.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL REKAP & PENYELESAIAN HASIL PICKING */}
        {isRekapModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white dark:bg-[#131d31] w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-2 sm:p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
                <div>
                  <span className="text-[10px] font-extrabold text-primary-500 uppercase tracking-wider">
                    Konfirmasi Penyelesaian (Status Picked Terakhir)
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
              <div className="p-2 sm:p-3 overflow-y-auto space-y-2">
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
                        PERHATIAN: TERDAPAT BARANG YANG KURANG / KOSONG DI RAK
                      </div>
                      <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                        Ada {activeItems.filter((i) => i.qty_picked < i.qty_req).length} SKU yang belum lengkap terambil dari rak
                        {activeStats.kosongCount > 0 ? ` (${activeStats.kosongCount} SKU ditandai Kosong di Rak)` : ''}. Anda tetap dapat menyimpan dan menyelesaikan SJ ini sesuai kondisi fisik terakhir.
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
                  <div className="p-3.5 bg-primary-50 dark:bg-primary-950/40 border border-primary-300 dark:border-primary-800 rounded-2xl flex items-center gap-3">
                    <AlertOctagon className="w-6 h-6 text-primary-500 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-black text-primary-800 dark:text-primary-300 uppercase">
                        PERHATIAN: TERDAPAT BARANG SALAH AMBIL
                      </div>
                      <div className="text-[11px] text-primary-700 dark:text-primary-400 font-medium">
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
                      const isItemKosong = Boolean(it.is_kosong || it.status === 'KOSONG');
                      return (
                        <div key={idx} className="p-3 flex justify-between items-center text-xs">
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                              <span>{resolveProductName(it.sku, it.nama_produk)}</span>
                              {isItemKosong && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 text-[10px] font-black">
                                  🚫 KOSONG DI RAK
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {it.sku} {it.size ? `• Size: ${it.size}` : ''} • 📍 {it.lokasi}
                              {it.picker_name ? ` • 👷 ${formatOperatorWithPersonName(it.picker_name)}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-black text-sm">
                              {it.qty_picked} / {it.qty_req} Pcs
                            </div>
                            <div>
                              {isItemKosong ? (
                                <span className="text-[10px] font-extrabold text-rose-600 dark:text-rose-400">
                                  Stok Kosong (0)
                                </span>
                              ) : selisih === 0 ? (
                                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400">
                                  Pas (0)
                                </span>
                              ) : selisih < 0 ? (
                                <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                                  Kurang {Math.abs(selisih)}
                                </span>
                              ) : (
                                <span className="text-[10px] font-extrabold text-primary-600 dark:text-primary-400">
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
                      <div key={'unexp-' + idx} className="p-3 bg-primary-50/50 dark:bg-primary-950/20 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-primary-700 dark:text-primary-300 flex items-center gap-1">
                            <span className="text-[9px] bg-primary-200 dark:bg-primary-900 px-1.5 py-0.5 rounded font-extrabold">SALAH</span>
                            {it.nama_produk}
                          </div>
                          <div className="text-[11px] font-mono text-primary-400">{it.sku}</div>
                        </div>
                        <div className="text-right font-mono font-bold text-primary-600 dark:text-primary-400">
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
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white outline-none focus:border-primary-500"
                  />
                </div>

                {/* Checkbox Sync Out */}
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncOutLog}
                    onChange={(e) => setSyncOutLog(e.target.checked)}
                    className="w-4 h-4 rounded text-primary-500 focus:ring-primary-500"
                  />
                  <span>Otomatis catat mutasi keluar (OUT) di database log_produk</span>
                </label>
              </div>

              {/* Modal Footer */}
              <div className="p-2 sm:p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRekapModalOpen(false)}
                  className="px-2 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
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
    ) : (
      /* =========================================================================
         VIEW 1: DAFTAR SURAT JALAN / INVOICE (List Per SJ)
         ========================================================================= */
      <div className="w-full max-w-full space-y-2.5 animate-in fade-in duration-200">
      {/* Minimized Active Picking Banner (quick resume right inside Tugas Picking list) */}
      {activeSJ && isMinimized && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <ScanBarcode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                  Sesi Picking Diminimize
                </span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 text-[11px] font-mono font-black text-slate-900 dark:text-white">
                  {activeSJ.no_sj}
                </span>
                {activeLocation && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-mono font-bold">
                    Rak: {activeLocation}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                Progres: <strong className="font-mono">{activeStats.regularPicked}/{activeStats.totalReq} Pcs ({activeStats.percentage}%)</strong> · Tujuan: {activeSJ.tujuan}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Lanjutkan Picking</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenCancelPickingModal(activeSJ, 'VIEW2', 'CANCEL_PICK')}
              className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/70 text-xs font-bold cursor-pointer flex items-center gap-1"
              title="Batalkan pengambilan / keluar bantu dari SJ ini"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>
                {parsePickerNamesList(activeSJ.picker_name).some(
                  (p) => !isSameOperatorIdentity(p, currentUser)
                )
                  ? 'Batal Bantu'
                  : 'Batal Ambil'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                flushActivePickingSessionNow();
                handleOpenCancelPickingModal(activeSJ, 'VIEW2', 'EXIT_FORM');
              }}
              className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
              title="Akhiri sesi aktif & pilih simpan progres terakhir atau reset"
            >
              Keluar Sesi
            </button>
          </div>
        </div>
      )}

      {/* Offline Protection & Pending Outbox Banner */}
      {(!isOnline || pickingOutboxCount > 0 || pendingItemSyncCount > 0) && (
        <div
          className={`rounded-2xl p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs ${
            !isOnline
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold">
            {!isOnline ? (
              <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            ) : (
              <CloudUpload className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
            )}
            <span>
              {!isOnline
                ? `Mode Offline Aktif — Anda tetap dapat melakukan scan & menyelesaikan picking. ${
                    pickingOutboxCount > 0 || pendingItemSyncCount > 0
                      ? `(${[
                          pendingItemSyncCount > 0 ? `${pendingItemSyncCount} SKU in-progress` : '',
                          pickingOutboxCount > 0 ? `${pickingOutboxCount} SJ selesai` : '',
                        ]
                          .filter(Boolean)
                          .join(', ')} siap disinkronkan saat online)`
                      : 'Progres tersimpan lokal.'
                  }`
                : `Ada ${[
                    pendingItemSyncCount > 0 ? `${pendingItemSyncCount} SKU progres offline` : '',
                    pickingOutboxCount > 0 ? `${pickingOutboxCount} Tugas Picking selesai` : '',
                  ]
                    .filter(Boolean)
                    .join(' & ')} yang siap disinkronkan ke Database.`}
            </span>
          </div>
          {(pickingOutboxCount > 0 || pendingItemSyncCount > 0) && isOnline && (
            <button
              type="button"
              onClick={handleSyncPickingOutboxNow}
              disabled={isSyncingPickingOutbox}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPickingOutbox ? 'animate-spin' : ''}`} />
              <span>
                {isSyncingPickingOutbox
                  ? 'Menyinkronkan...'
                  : `Sinkronkan (${pickingOutboxCount > 0 ? `${pickingOutboxCount} SJ` : `${pendingItemSyncCount} SKU`})`}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white dark:bg-[#131d31] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Segmented Tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`flex-1 sm:flex-none px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer select-none text-center touch-manipulation ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white dark:bg-[#131d31] text-primary-500 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Belum Selesai ({sjGroups.filter((g) => g.status !== 'SELESAI').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`flex-1 sm:flex-none px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer select-none text-center touch-manipulation ${
                statusFilter === 'ALL'
                  ? 'bg-white dark:bg-[#131d31] text-primary-500 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Semua ({sjGroups.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('SELESAI')}
              className={`flex-1 sm:flex-none px-3.5 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer select-none text-center touch-manipulation ${
                statusFilter === 'SELESAI'
                  ? 'bg-white dark:bg-[#131d31] text-primary-500 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Selesai ({sjGroups.filter((g) => g.status === 'SELESAI').length})
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedSJs.length === filteredSJs.length && filteredSJs.length > 0}
                onChange={handleSelectAllSJs}
                className="w-4 h-4 rounded text-primary-500 focus:ring-primary-500 cursor-pointer"
                title="Pilih Semua"
                id="select-all-sjs-chk"
              />
              <label htmlFor="select-all-sjs-chk" className="text-xs font-semibold text-slate-500 cursor-pointer select-none">
                Pilih Semua
              </label>
            </div>

            {/* Multiple Actions */}
            {selectedSJs.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap sm:ml-auto">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {selectedSJs.length} Terpilih
                </span>
                <button
                  type="button"
                  onClick={handleSendPickingWaBulk}
                  disabled={isBulkActionRunning}
                  className="flex-1 sm:flex-none justify-center px-3 py-1.5 bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#1DA851] dark:text-[#25D366] font-extrabold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1 cursor-pointer border border-[#25D366]/30"
                  title="Kirim Picking List WA ke Grup Gudang untuk semua SJ yang dipilih"
                >
                  <Send className="w-3.5 h-3.5" /> WA Picking ({selectedSJs.length})
                </button>
                <button
                  type="button"
                  onClick={handleMarkCompleteSelected}
                  disabled={isBulkActionRunning}
                  className="flex-1 sm:flex-none justify-center px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 font-extrabold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Selesaikan
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isBulkActionRunning}
                  className="flex-1 sm:flex-none justify-center px-3 py-1.5 bg-primary-100 hover:bg-primary-200 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400 font-extrabold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari Nomor SJ / Tujuan / SKU / Nama Produk..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-800 dark:text-white focus:border-primary-500 outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadPickingList}
              disabled={loading}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer"
              title="Muat Ulang / Sinkronisasi Database"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary-500' : ''}`} />
              <span className="hidden sm:inline">Segarkan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Surat Jalan Cards List */}
      <div className="space-y-3">
        {loading && sjGroups.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200 dark:border-slate-800">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-500">Memuat Surat Jalan dari Database...</p>
          </div>
        ) : filteredSJs.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200 dark:border-slate-800 border-dashed p-6">
            <CheckCircle2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Tidak ada Surat Jalan dalam kategori ini
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-2">
              Belum ada tugas picking atau semua Surat Jalan sudah diselesaikan.
            </p>
            {sjGroups.length === 0 && (
              <button
                onClick={handleSeedSampleSJ}
                className="px-2 py-2.5 bg-primary-500/10 hover:bg-primary-500/20 text-primary-500 font-extrabold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" /> Buat Contoh Surat Jalan Picking
              </button>
            )}
          </div>
        ) : (
          filteredSJs.slice(0, 100).map((group) => {
            const isDone = group.status === 'SELESAI';
            const sjUpper = (group.no_sj || '').toUpperCase().trim();
            const isCurrentlyMinimizedSj = Boolean(
              activeSJ && isMinimized && activeSJ.no_sj.toUpperCase().trim() === sjUpper
            );
            const hasSavedProgress = Boolean(
              !isDone &&
                (group.total_qty_picked > 0 ||
                  group.items.some((it) => it.is_kosong || it.status === 'KOSONG'))
            );
            const isPendingOfflineOutbox = outboxSjSet.has(sjUpper);
            const percent =
              group.total_qty_req > 0
                ? Math.min(100, Math.round((group.total_qty_picked / group.total_qty_req) * 100))
                : 100;

            const activePickers =
              group.active_pickers && group.active_pickers.length > 0
                ? group.active_pickers
                : parsePickerNamesList(group.picker_name);
            const isCurrentUserInPickers = activePickers.some(
              (p) => isSameOperatorIdentity(p, currentUser)
            );
            const otherPickersWorking = activePickers.filter(
              (p) => !isSameOperatorIdentity(p, currentUser)
            );
            const isBeingWorkedOn = !isDone && activePickers.length > 0;

            return (
              <div
                key={group.no_sj}
                className={`p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-[#131d31] border transition-all shadow-sm ${
                  isCurrentlyMinimizedSj
                    ? 'border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-400/30'
                    : isBeingWorkedOn
                    ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50/15 dark:bg-indigo-950/15'
                    : hasSavedProgress
                    ? 'border-amber-300/80 dark:border-amber-800/80 bg-amber-50/10 dark:bg-amber-950/10'
                    : isDone
                    ? 'border-emerald-200 dark:border-emerald-950 bg-emerald-50/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-primary-500'
                }`}
              >
                <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={selectedSJs.includes(group.no_sj)}
                        onChange={() => handleSelectSJCheckbox(group.no_sj)}
                        className="w-4 h-4 rounded text-primary-500 focus:ring-primary-500 cursor-pointer"
                      />
                      <span className="text-sm sm:text-base font-black font-mono text-slate-800 dark:text-white uppercase tracking-tight">
                        {group.no_sj}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          isDone
                            ? group.total_qty_picked === group.total_qty_req && group.total_qty_req > 0
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/50'
                              : group.total_qty_picked === 0
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border border-rose-300 dark:border-rose-700/50'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-300 dark:border-amber-700/50'
                            : isBeingWorkedOn
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200'
                            : hasSavedProgress
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60'
                            : 'bg-primary-500/10 text-primary-500 border border-primary-500/20'
                        }`}
                      >
                        {isDone
                          ? group.total_qty_picked === group.total_qty_req && group.total_qty_req > 0
                            ? 'SELESAI (LENGKAP)'
                            : group.total_qty_picked === 0
                            ? 'SELESAI (0 PCS)'
                            : 'SELESAI (SEBAGIAN)'
                          : isBeingWorkedOn
                          ? 'SEDANG PICKING'
                          : hasSavedProgress
                          ? 'PENDING (PROGRES TERSIMPAN)'
                          : 'PENDING'}
                      </span>
                      {isBeingWorkedOn && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 shadow-xs">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                          <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>
                            {activePickers.length > 1
                              ? `Dikerjakan Bersama (${activePickers.length}): ${activePickers.map((p) => formatOperatorWithPersonName(p)).join(', ')}`
                              : `Sedang Dikerjakan: ${formatOperatorWithPersonName(activePickers[0])}`}
                          </span>
                        </span>
                      )}
                      {isCurrentlyMinimizedSj && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                          📌 Diminimize
                        </span>
                      )}
                      {!isCurrentlyMinimizedSj && hasSavedProgress && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          💾 Progres Tersimpan ({group.total_qty_picked}/{group.total_qty_req} pcs)
                        </span>
                      )}
                      {isPendingOfflineOutbox && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                          ☁️ Menunggu Sync Offline
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-medium text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
                        <Truck className="w-3.5 h-3.5 text-slate-400" /> {group.tujuan}
                      </span>
                      <span>•</span>
                      <span>📅 {group.tanggal}</span>
                      {activePickers.length > 0 && (
                        <>
                          <span>•</span>
                          <span>Picker: <b>{activePickers.map((p) => formatOperatorWithPersonName(p)).join(', ')}</b></span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isDone && (
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSendPickingWa(group, 'send'); }}
                          className="px-2 py-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-lg transition-all flex items-center gap-1 text-[10px] font-extrabold uppercase cursor-pointer"
                          title="Kirim Picking List ke Grup WA Gudang (Format SPS)"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">WA Picking</span>
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSendPickingWa(group, 'copy'); }}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer"
                          title="Salin Teks Picking List WhatsApp"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenEditSJModal(group); }}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                          title="Edit SJ"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSingleSJ(group.no_sj); }}
                          className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
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
                    {!isDone && (isCurrentUserInPickers || isCurrentlyMinimizedSj) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleOpenCancelPickingModal(group, 'VIEW1', 'CANCEL_PICK');
                        }}
                        className="px-2.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/70 transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                        title={
                          otherPickersWorking.length > 0
                            ? 'Batal ikut bantu SJ ini (rekan tim tetap lanjut)'
                            : 'Keluar atau batalkan pengambilan SJ ini'
                        }
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{otherPickersWorking.length > 0 ? 'Batal Bantu' : 'Batal Ambil'}</span>
                      </button>
                    )}
                    {!isDone && !isCurrentUserInPickers && !isCurrentlyMinimizedSj && activePickers.length === 0 && hasSavedProgress && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleOpenCancelPickingModal(group, 'VIEW1', 'RESET_ONLY');
                        }}
                        className="px-2.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/70 transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                        title="Reset progres picking tersimpan kembali ke 0 Pcs (PENDING)"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset 0 Pcs</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleSelectSJ(group)}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer ${
                        isDone
                          ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          : otherPickersWorking.length > 0 && !isCurrentUserInPickers
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                          : 'bg-primary-500 hover:bg-primary-600 text-white shadow-primary-500/20'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <FileText className="w-3.5 h-3.5" /> Detail Rekap
                        </>
                      ) : otherPickersWorking.length > 0 && !isCurrentUserInPickers ? (
                        <>
                          <UserPlus className="w-4 h-4" /> 🤝 Ikut Bantu Picking
                        </>
                      ) : isCurrentlyMinimizedSj || isCurrentUserInPickers || hasSavedProgress ? (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" /> Lanjutkan Picking
                        </>
                      ) : (
                        <>
                          <ScanBarcode className="w-4 h-4" /> Mulai Picking
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Progress bar and Items summary (ENLARGED QTY NUMBERS FOR MOBILE) */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex justify-between items-center text-xs sm:text-sm font-bold">
                    <span className="text-slate-600 dark:text-slate-300">
                      <b className="font-mono font-black text-slate-800 dark:text-white">{group.total_items} SKU</b> Produk •{' '}
                      <span className="font-mono font-black text-sm sm:text-base text-indigo-600 dark:text-indigo-400">
                        {group.total_qty_picked} / {group.total_qty_req} Pcs
                      </span>
                    </span>
                    <span className={`font-mono font-black text-sm sm:text-base ${isDone ? 'text-emerald-600' : 'text-primary-500'}`}>
                      {percent}%
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isDone ? 'bg-emerald-500' : 'bg-primary-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Preview First 3 items */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {group.items.slice(0, 3).map((it, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-bold bg-slate-50 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800"
                      >
                        {it.nama_produk} <b className="font-mono text-indigo-600 dark:text-indigo-400">({it.qty_picked}/{it.qty_req})</b>
                      </span>
                    ))}
                    {group.items.length > 3 && (
                      <span className="text-[11px] font-bold text-slate-400 px-1 py-0.5">
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
    </div>
    )}

      {/* MODAL LIHAT DETAIL REKAP SJ YANG SUDAH SELESAI */}
      {viewCompletedSJ && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-2 sm:p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
              <div>
                <span className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-wider">
                  Hasil Rekap Surat Jalan (Selesai)
                </span>
                <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase">
                  {viewCompletedSJ.no_sj}
                </h2>
                <p className="text-xs text-slate-500 font-medium">Tujuan: {viewCompletedSJ.tujuan} • Picker: {formatOperatorWithPersonName(viewCompletedSJ.picker_name)}</p>
              </div>
              <button
                onClick={() => setViewCompletedSJ(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-2 sm:p-3 overflow-y-auto space-y-2">
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 text-[10px] font-extrabold uppercase text-slate-500 flex justify-between">
                  <span>Item Surat Jalan</span>
                  <span>Target vs Terambil</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {viewCompletedSJ.items.map((it, idx) => {
                    const selisih = it.qty_picked - it.qty_req;
                    const isItemKosong = Boolean(it.is_kosong || it.status === 'KOSONG');
                    return (
                      <div key={idx} className="p-3 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                            <span>{resolveProductName(it.sku, it.nama_produk)}</span>
                            {isItemKosong && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 text-[10px] font-black">
                                🚫 KOSONG DI RAK
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {it.sku} • 📍 {it.lokasi}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-black text-sm">
                            {it.qty_picked} / {it.qty_req} Pcs
                          </div>
                          <div>
                            {isItemKosong ? (
                              <span className="text-[10px] font-extrabold text-rose-600">Stok Kosong (0)</span>
                            ) : selisih === 0 ? (
                              <span className="text-[10px] font-extrabold text-emerald-600">Pas (0)</span>
                            ) : selisih < 0 ? (
                              <span className="text-[10px] font-extrabold text-amber-600">Kurang {Math.abs(selisih)}</span>
                            ) : (
                              <span className="text-[10px] font-extrabold text-primary-600">Lebih +{selisih}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {viewCompletedSJ.unexpected_items.map((it, idx) => (
                    <div key={'unexp-' + idx} className="p-3 bg-primary-50/50 dark:bg-primary-950/20 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-primary-700 dark:text-primary-300">[SALAH AMBIL] {it.nama_produk}</div>
                        <div className="text-[11px] font-mono text-primary-400">{it.sku}</div>
                      </div>
                      <div className="text-right font-mono font-bold text-primary-600">
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
            <div className="p-2 sm:p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
              <div>
                <span className="text-[10px] font-extrabold text-primary-500 uppercase tracking-wider">
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

            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Tujuan Pengiriman
                  </label>
                  <input
                    type="text"
                    value={editSjTujuan}
                    onChange={(e) => setEditSjTujuan(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-primary-500"
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
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Add New SKU Quick Row */}
              <div className="p-3 bg-orange-50/50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-900/50 space-y-2">
                <div className="text-xs font-bold text-primary-500 flex items-center gap-1">
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
                        const match = fastFindCatalogProduct(val);
                        if (match) {
                          setNewSjSkuNama(match.p);
                          setNewSjSkuSize(match.s || '-');
                          setNewSjSkuLoc(match.lokasi && match.lokasi !== 'A-01' ? match.lokasi : '');
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
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewSjSkuQty(val === '' ? '' : Math.max(0, Number(val) || 0));
                      }}
                      onBlur={() => {
                        if (newSjSkuQty === '' || Number(newSjSkuQty) < 1) {
                          setNewSjSkuQty(1);
                        }
                      }}
                      className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddRowToEditSJ}
                      className="w-full py-2 bg-primary-500 hover:bg-primary-600 text-white font-bold text-xs rounded-lg flex items-center justify-center"
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
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = [...editSjRows];
                            updated[idx].qty_req = val === '' ? ('' as any) : Math.max(0, Number(val) || 0);
                            setEditSjRows(updated);
                          }}
                          onBlur={() => {
                            if ((row.qty_req as any) === '' || Number(row.qty_req) < 1) {
                              const updated = [...editSjRows];
                              updated[idx].qty_req = 1;
                              setEditSjRows(updated);
                            }
                          }}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveRowFromEditSJ(idx)}
                          className="text-slate-400 hover:text-primary-500 p-1.5 hover:bg-primary-50 dark:hover:bg-primary-950/40 rounded-lg transition-colors"
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
                className="px-2 py-2 bg-slate-200 dark:bg-slate-800 font-bold text-xs rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEditSJModal}
                disabled={isSavingSjEdit}
                className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-extrabold text-xs uppercase rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
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
            <div className="p-2 sm:p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
              <div>
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
                    editingItemData.type === 'UNEXPECTED'
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                      : 'bg-primary-500/10 text-primary-500'
                  }`}
                >
                  {editingItemData.type === 'UNEXPECTED' ? 'Koreksi Barang Salah Ambil' : 'Edit Item Picking'}
                </span>
                <h2 className="text-base font-black text-slate-800 dark:text-white mt-1">
                  {editingItemData.nama_produk}
                </h2>
                <div className="text-xs font-mono font-bold text-primary-500">{editingItemData.sku}</div>
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

            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2">
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
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingItemData({
                          ...editingItemData,
                          qty_picked: val === '' ? ('' as any) : Math.max(0, parseInt(val, 10) || 0),
                        });
                      }}
                      onBlur={() => {
                        if ((editingItemData.qty_picked as any) === '') {
                          setEditingItemData({
                            ...editingItemData,
                            qty_picked: 0,
                          });
                        }
                      }}
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
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white outline-none focus:border-primary-500"
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
                                ? 'bg-primary-500 text-white shadow-sm ring-2 ring-primary-500/30'
                                : 'bg-white dark:bg-[#131d31] border border-amber-300 dark:border-amber-700/70 text-slate-800 dark:text-slate-200 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            }`}
                          >
                            <span>📍 {locInfo.lokasi}</span>
                            {locInfo.qty !== undefined && (
                              <span className="text-[10px] opacity-80 font-sans font-semibold">
                                (stok {locInfo.qty})
                              </span>
                            )}
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
                    className="text-xs font-bold text-primary-600 hover:underline flex items-center gap-1"
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
                  className="px-2 py-2 bg-slate-200 dark:bg-slate-800 font-bold text-xs rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditItem}
                  className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-extrabold text-xs uppercase rounded-xl flex items-center gap-1.5 shadow-md active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" /> Simpan Koreksi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KELUAR / SIMPAN PROGRES / BATALKAN PICKING */}
      {cancelPickingModal && cancelPickingModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex items-start justify-between gap-2 shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  {cancelPickingModal.isCoPickingWithOthers
                    ? 'Keluar / Batal Ikut Bantu Tim Picking'
                    : cancelPickingModal.intent === 'RESET_ONLY'
                    ? 'Reset Progres Picking ke 0 Pcs'
                    : cancelPickingModal.intent === 'EXIT_FORM'
                    ? 'Tinggalkan Form Picking Aktif'
                    : 'Batalkan Pengambilan Tugas'}
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5 font-mono">
                  {cancelPickingModal.group.no_sj}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tujuan: <b className="text-slate-700 dark:text-slate-300">{cancelPickingModal.group.tujuan}</b>
                </p>
              </div>
              <button
                type="button"
                disabled={isCancellingPicking}
                onClick={() => setCancelPickingModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
              {cancelPickingModal.isCoPickingWithOthers ? (
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>Rekan Tim Tetap Melanjutkan</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Saat ini Anda berkolaborasi dengan{' '}
                    <b>{cancelPickingModal.otherPickers.map((p) => formatOperatorWithPersonName(p)).join(', ')}</b>.
                    Dengan memilih <b>Simpan &amp; Keluar</b>, nama Anda dilepas sementara progres scan ({cancelPickingModal.pickedQty} pcs) tetap aman di layar rekan Anda.
                  </p>
                </div>
              ) : cancelPickingModal.pickedQty === 0 &&
                cancelPickingModal.kosongCount === 0 &&
                cancelPickingModal.unexpectedQty === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 space-y-1">
                  <div className="font-extrabold">Belum Ada Barang Terpicking (0 Pcs)</div>
                  <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Nama Anda akan dilepas dan status SJ dikembalikan ke antrean awal (<b>PENDING · 0 Pcs</b>) sehingga status <i>Sedang Dikerjakan</i> hilang dan bisa diambil kapan saja.
                  </p>
                </div>
              ) : cancelPickingModal.intent === 'RESET_ONLY' ? (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>
                      Reset Total Progres ({cancelPickingModal.pickedQty}/{cancelPickingModal.totalReq} Pcs)?
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Semua barang yang sudah terpicking pada SJ ini akan di-reset kembali ke <b>0 Pcs</b> dan status menjadi <b>PENDING</b>.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1.5">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      Progres Terpicking Saat Ini: {cancelPickingModal.pickedQty} / {cancelPickingModal.totalReq} Pcs
                      {cancelPickingModal.kosongCount > 0 ? ` (${cancelPickingModal.kosongCount} Kosong)` : ''}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Pilih <b>Simpan Status Terakhir &amp; Keluar</b> untuk menyimpan {cancelPickingModal.pickedQty} pcs agar Anda atau petugas lain bisa melanjutkan sisanya (tanpa status <i>Sedang Dikerjakan</i>), atau pilih <b>Batalkan Picking</b> untuk mereset kembali ke <b>0 Pcs</b>.
                  </p>
                </div>
              )}

              <div className="space-y-2 pt-1">
                {cancelPickingModal.isCoPickingWithOthers ? (
                  <button
                    type="button"
                    disabled={isCancellingPicking}
                    onClick={() => handleExecuteCancelPicking('LEAVE_KEEP_PROGRESS')}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isCancellingPicking ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                    <span>Simpan Hasil Scan &amp; Keluar (Batal Bantu)</span>
                  </button>
                ) : cancelPickingModal.intent === 'RESET_ONLY' ? (
                  <button
                    type="button"
                    disabled={isCancellingPicking}
                    onClick={() => handleExecuteCancelPicking('RESET_TO_PENDING')}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isCancellingPicking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    <span>Ya, Reset Total ke 0 Pcs (PENDING)</span>
                  </button>
                ) : cancelPickingModal.pickedQty === 0 &&
                  cancelPickingModal.kosongCount === 0 &&
                  cancelPickingModal.unexpectedQty === 0 ? (
                  <button
                    type="button"
                    disabled={isCancellingPicking}
                    onClick={() => handleExecuteCancelPicking('RESET_TO_PENDING')}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isCancellingPicking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    <span>Ya, Batalkan Picking &amp; Kembalikan ke PENDING</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isCancellingPicking}
                      onClick={() => handleExecuteCancelPicking('LEAVE_KEEP_PROGRESS')}
                      className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {isCancellingPicking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>Simpan Status Terakhir &amp; Keluar ({cancelPickingModal.pickedQty} Pcs)</span>
                    </button>
                    <button
                      type="button"
                      disabled={isCancellingPicking}
                      onClick={() => handleExecuteCancelPicking('RESET_TO_PENDING')}
                      className="w-full py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Batalkan Picking (Reset ke 0 Pcs / PENDING)</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex justify-end shrink-0">
              <button
                type="button"
                disabled={isCancellingPicking}
                onClick={() => setCancelPickingModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                {cancelPickingModal.source === 'VIEW2' ? 'Tetap di Form Picking' : 'Kembali'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FULFILLMENT REFILL (MULTI-CSV & MANUAL) */}
      {/* Custom Confirm Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="px-5 py-2.5 text-sm font-bold bg-primary-500 hover:bg-primary-600 text-white rounded-xl shadow-md shadow-primary-500/25 transition-all active:scale-95 cursor-pointer"
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
              const updated = [...newItems, ...prevFiltered];
              try {
                const activeOnly = updated.filter((it) => it.status !== 'SELESAI').slice(0, 100);
                safeLocalStorageSet('wms_raw_picking_list_cache', JSON.stringify(activeOnly));
                safeLocalStorageSet('wms_picking_cache', JSON.stringify(activeOnly));
              } catch {}
              return updated;
            });
          }
          setTimeout(() => {
            
          }, 500);
        }}
        onNotify={onNotify}
      />
    </>
  );
});

export const PickingTasksView: React.FC<PickingTasksViewProps> = (props) => {
  return (
    <ErrorBoundary
      fallbackTitle="Terjadi Kendala pada Tampilan Tugas Picking"
      onReset={() => {
        try {
          clearHeavyCaches();
          safeLocalStorageRemove('wms_active_picking_session');
          safeLocalStorageRemove('wms_raw_picking_list_cache');
          safeLocalStorageRemove('wms_picking_cache');
        } catch {}
        window.location.reload();
      }}
    >
      <PickingTasksViewInner {...props} />
    </ErrorBoundary>
  );
};
