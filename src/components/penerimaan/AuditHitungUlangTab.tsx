import React, { useState, useMemo, useEffect, useRef } from 'react';
import { NumberInput } from '../common/NumberInput';
import {
  Search,
  Filter,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Calendar,
  User,
  Clock,
  ArrowLeft,
  Printer,
  RefreshCw,
  FileText,
  Check,
  X,
  Sparkles,
  Image as ImageIcon,
  Save,
  Loader2,
  History,
  Scale,
  CheckSquare,
  Square,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Trash2,
  Edit3,
  MessageSquare,
  ListPlus,
  CloudUpload,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CalendarDays,
  MoreHorizontal,
} from 'lucide-react';
import {
  UserSession,
  PenerimaanProduksiItem,
  ProductItem,
  PenerimaanRecountLogItem,
  PenerimaanRecountLogDetailItem,
} from '../../types';
import {
  updatePenerimaanProduksiItemsInSupabase,
  savePenerimaanRecountLog,
  fetchPenerimaanRecountLogs,
  fetchPenerimaanRecountQueueFromSupabase,
  savePenerimaanRecountQueueToSupabase,
  getRecountAuditMap,
  saveRecountAuditRecord,
  fetchRecountAuditMapFromCloud,
  supabaseFetch,
  getCachedProduksiQtyNotaMapSync,
} from '../../services/supabase';
import { saveWmsSettings } from '../../services/settings';
import {
  pushMasterRecountDeltaToGoogleSheet,
  pushPenerimaanProduksiToGoogleSheet,
  syncQtyNotaAndAutoQueueRecount,
  MasterRecountDeltaItem,
  formatDatesSummary,
} from '../../services/gasProduksiSync';
import { getSizeWeight } from '../../utils/sortUtils';
import { ProduksiActionSheet } from './ProduksiActionSheet';
import { MultiBatchAuditScannerModal } from './MultiBatchAuditScannerModal';
import {
  loadRecountWorkspaceDraft,
  saveRecountWorkspaceDraft,
  clearRecountCodeDraft,
  enqueueRecountOutboxBatch,
} from '../../services/scannerOutboxService';

export interface AuditHitungUlangTabProps {
  session: UserSession | null;
  penerimaanItems: PenerimaanProduksiItem[];
  productCatalog?: ProductItem[];
  initialTargetCode?: string;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshData: () => Promise<void>;
  onOpenLightbox?: (data: { url: string; title: string; subtitle?: string }) => void;
}

export type RecountQueueSortOrder =
  | 'date_asc'    // Terlama ➔ Terbaru (FIFO Kedatangan)
  | 'date_desc'   // Terbaru ➔ Terlama (LIFO Kedatangan)
  | 'priority'    // Prioritas Sistem (Ada Selisih ➔ Antrian Belum ➔ Klop)
  | 'code_asc'    // Kode Produksi (A ➔ Z)
  | 'code_desc'   // Kode Produksi (Z ➔ A)
  | 'diff_desc';  // Selisih Terbanyak

export interface CodeAuditGroup {
  kode_produksi: string;
  nama_produk: string;
  kategori: string;
  vendor_up?: string;
  photo_url?: string;
  total_asli: number;
  total_fisik: number | null;
  total_selisih: number | null;
  status_audit: 'BELUM' | 'SUSULAN' | 'MATCH' | 'KURANG' | 'LEBIH';
  has_diff: boolean;
  is_counted: boolean;
  has_pending_batch?: boolean;
  pending_batch_qty?: number;
  pending_batch_dates?: string[];
  audited_dates?: string[];
  last_auditor?: string;
  last_audit_date?: string;
  last_round?: number;
  last_notes?: string;
  catatan_petunjuk?: string; // Catatan petunjuk per kode (misal: "petunjuk kurang 23")
  qty_nota?: number | null;
  target_pembanding?: number;
  distinct_colors: string[];
  distinct_sizes: string[];
  distinct_dates: string[];
  earliest_date: string;
  latest_date: string;
  distinct_sjs?: string[];
  items: PenerimaanProduksiItem[];
}

export interface QueueItemMetadata {
  catatan_petunjuk?: string;
  added_at?: string;
  added_by?: string;
}

const LOCAL_STORAGE_RECOUNT_QUEUE = 'wms_recount_selected_queue';

// Helper to load map of queued items
const loadStoredQueueMap = (): Record<string, QueueItemMetadata> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_RECOUNT_QUEUE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const map: Record<string, QueueItemMetadata> = {};
      parsed.forEach((it: any) => {
        if (typeof it === 'string') {
          map[it.toUpperCase()] = { catatan_petunjuk: '' };
        } else if (it && it.kode_produksi) {
          map[it.kode_produksi.toUpperCase()] = {
            catatan_petunjuk: it.catatan_petunjuk || '',
            added_at: it.added_at,
            added_by: it.added_by,
          };
        }
      });
      return map;
    } else if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
};

export const AuditHitungUlangTab: React.FC<AuditHitungUlangTabProps> = ({
  session,
  penerimaanItems,
  productCatalog = [],
  initialTargetCode,
  onShowToast,
  onRefreshData,
  onOpenLightbox,
}) => {
  const initialDraftState = useMemo(() => loadRecountWorkspaceDraft(), []);

  // Current active mode: 'queue' (Antrian & Daftar Pekerjaan) | 'workspace' (Lembar Kerja Input Fisik)
  const [activeMode, setActiveMode] = useState<'queue' | 'workspace'>(() => {
    if (initialTargetCode) return 'workspace';
    return initialDraftState.activeMode || 'queue';
  });
  const [selectedCode, setSelectedCode] = useState<string>(() => {
    if (initialTargetCode) return initialTargetCode.trim().toUpperCase();
    return initialDraftState.selectedCode || '';
  });

  // Queue Map: { [kode_produksi]: { catatan_petunjuk?: string, added_at?: string } }
  const [queueMap, setQueueMap] = useState<Record<string, QueueItemMetadata>>(() => loadStoredQueueMap());
  const [recountAuditMap, setRecountAuditMap] = useState<Record<string, any>>(() => getRecountAuditMap());
  const [isSyncingCloudQueue, setIsSyncingCloudQueue] = useState<boolean>(false);

  // Load and sync queue from Supabase on mount
  useEffect(() => {
    let isMounted = true;
    const syncQueueFromCloud = async () => {
      try {
        setIsSyncingCloudQueue(true);
        // Tarik data hitung ulang terbaru dari Cloud agar semua user/perangkat tersinkron
        const cloudAuditMap = await fetchRecountAuditMapFromCloud();
        const localAuditMap = getRecountAuditMap();
        
        // 1. Ekstrak seluruh hasil audit yang ada di penerimaanItems (cache lokal PC yang sudah dihitung)
        const extractedFromItems: Record<string, any> = {};
        penerimaanItems.forEach((it) => {
          const norm = (it.kode_produksi || '').trim().toUpperCase();
          if (norm && (it.recount_qty !== undefined && it.recount_qty !== null)) {
            if (!extractedFromItems[norm]) {
              extractedFromItems[norm] = {
                kode_produksi: norm,
                tanggal_audit: it.recount_updated_at ? String(it.recount_updated_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
                total_asli: 0,
                total_fisik: 0,
                total_selisih: 0,
                status: it.recount_status || 'MATCH',
                round: it.recount_round || 1,
                auditor: it.recount_auditor || 'Auditor',
                catatan: it.recount_notes || '',
                updated_at: it.recount_updated_at || new Date().toISOString(),
                variants: [],
              };
            }
            const rec = extractedFromItems[norm];
            const qtyAsli = Number(it.qty) || 0;
            const qtyFisik = Number(it.recount_qty);
            const selisih = qtyFisik - qtyAsli;
            rec.total_asli += qtyAsli;
            rec.total_fisik += qtyFisik;
            rec.total_selisih += selisih;
            rec.variants.push({
              warna: it.warna || '-',
              size: it.size || 'ALL SIZE',
              qty_asli: qtyAsli,
              qty_fisik: qtyFisik,
              selisih,
              status: selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH',
              note: it.recount_notes || '',
            });
          }
        });
        Object.values(extractedFromItems).forEach((rec: any) => {
          if (rec.total_selisih === 0) rec.status = 'MATCH';
          else if (rec.total_selisih < 0) rec.status = 'KURANG';
          else rec.status = 'LEBIH';
        });

        // 2. Gabungkan cloud + local + extracted
        const mergedAuditMap = {
          ...cloudAuditMap,
          ...localAuditMap,
          ...extractedFromItems,
        };

        // 3. Jika ada item lokal/ekstrak yang belum ada di cloudAuditMap, segera upload ke Cloud!
        const missingInCloud = Object.keys(mergedAuditMap).filter((k) => !cloudAuditMap[k]);
        if (missingInCloud.length > 0) {
          console.log('[RECOUNT SYNC] Mengunggah hasil hitung lokal ke database Cloud:', missingInCloud);
          await saveWmsSettings({ recount_audit_map: mergedAuditMap });
          try {
            await supabaseFetch('wms_system_docs', 'POST', [{
              section_id: 'recount_audit_results',
              content: JSON.stringify(mergedAuditMap),
              updated_by: 'Auto-Sync Local Audits',
              updated_at: new Date().toISOString(),
            }], 'on_conflict=section_id', true);
          } catch (e) {
            console.warn('Gagal upload audit results ke wms_system_docs:', e);
          }
        }

        const cloudQueue = await fetchPenerimaanRecountQueueFromSupabase();
        if (isMounted) {
          const localQueue = loadStoredQueueMap();
          // Merge: start with local items (what user already set on this computer)
          const merged: Record<string, QueueItemMetadata> = { ...localQueue, ...(cloudQueue || {}) };

          // Automatically include any items from penerimaanItems that have recount notes / audit history
          penerimaanItems.forEach((it) => {
            const norm = (it.kode_produksi || '').trim().toUpperCase();
            if (norm && (it.recount_notes || it.recount_round || (it.recount_qty !== undefined && it.recount_qty !== null))) {
              if (!merged[norm]) {
                merged[norm] = {
                  catatan_petunjuk: it.recount_notes || (it as any).catatan || '',
                  added_at: it.recount_updated_at || it.created_at,
                  added_by: it.recount_auditor,
                };
              } else if (!merged[norm].catatan_petunjuk && it.recount_notes) {
                merged[norm].catatan_petunjuk = it.recount_notes;
              }
            }
          });

          // If local or penerimaan items have codes not yet in cloudQueue, auto-publish to cloud!
          const cloudKeyCount = Object.keys(cloudQueue || {}).length;
          const mergedKeyCount = Object.keys(merged).length;
          if (mergedKeyCount > 0 && mergedKeyCount > cloudKeyCount) {
            console.log('[RECOUNT SYNC] Mengunggah antrian & catatan lokal ke database Cloud...');
            await savePenerimaanRecountQueueToSupabase(merged);
          }

          setQueueMap(merged);
          if (mergedAuditMap && typeof mergedAuditMap === 'object') {
            setRecountAuditMap(mergedAuditMap);
          }
        }
      } catch (err) {
        console.warn('Gagal fetch antrian hitung ulang dari cloud:', err);
      } finally {
        if (isMounted) setIsSyncingCloudQueue(false);
      }
    };

    syncQueueFromCloud();

    // Listen to real-time broadcast / window events from other tabs/users
    const handleQueueSyncEvent = (e: any) => {
      if (e.detail?.queueMap && isMounted) {
        setQueueMap(e.detail.queueMap);
      }
    };

    window.addEventListener('wms_recount_queue_updated', handleQueueSyncEvent);

    const handleAuditUpdateEvent = (e: any) => {
      if (isMounted) {
        if (e?.detail?.auditMap) {
          setRecountAuditMap(e.detail.auditMap);
        } else {
          setRecountAuditMap(getRecountAuditMap());
        }
        onRefreshData();
      }
    };
    window.addEventListener('wms_recount_audit_updated', handleAuditUpdateEvent);

    return () => {
      isMounted = false;
      window.removeEventListener('wms_recount_queue_updated', handleQueueSyncEvent);
      window.removeEventListener('wms_recount_audit_updated', handleAuditUpdateEvent);
    };
  }, [penerimaanItems]);

  // Sinkron otomatis Qty Nota Buyer (Google Sheet -> Supabase) & auto-antrian selisih nota
  const qtyNotaSyncedRef = useRef(false);
  useEffect(() => {
    if (qtyNotaSyncedRef.current || penerimaanItems.length === 0) return;
    qtyNotaSyncedRef.current = true;
    syncQtyNotaAndAutoQueueRecount({ penerimaanItems })
      .then(() => window.dispatchEvent(new Event('wms_recount_queue_updated')))
      .catch((e) => console.warn('Sync Qty Nota gagal:', e));
  }, [penerimaanItems]);

  const saveQueueMap = async (updated: Record<string, QueueItemMetadata>) => {
    setQueueMap(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_RECOUNT_QUEUE, JSON.stringify(updated));
    } catch {}

    // Async push to Supabase cloud
    try {
      setIsSyncingCloudQueue(true);
      await savePenerimaanRecountQueueToSupabase(updated);
    } catch (err) {
      console.warn('Gagal simpan queue ke Supabase:', err);
    } finally {
      setIsSyncingCloudQueue(false);
    }
  };

  const handleAddMultipleToQueue = async (items: { kode_produksi: string; catatan_petunjuk?: string }[]) => {
    const updated = { ...queueMap };
    const nowIso = new Date().toISOString();
    const userName = session?.name || session?.username || session?.email || 'User';

    items.forEach((item) => {
      const norm = item.kode_produksi.trim().toUpperCase();
      if (!norm) return;
      updated[norm] = {
        catatan_petunjuk: item.catatan_petunjuk !== undefined ? item.catatan_petunjuk : (updated[norm]?.catatan_petunjuk || ''),
        added_at: updated[norm]?.added_at || nowIso,
        added_by: updated[norm]?.added_by || userName,
      };
    });

    await saveQueueMap(updated);

    // Sync notes to penerimaan_produksi rows in Supabase
    try {
      const patchList: PenerimaanProduksiItem[] = [];
      items.forEach((item) => {
        if (item.catatan_petunjuk) {
          const norm = item.kode_produksi.trim().toUpperCase();
          const matched = penerimaanItems.filter((it) => (it.kode_produksi || '').toUpperCase() === norm);
          matched.forEach((it) => {
            patchList.push({ ...it, recount_notes: item.catatan_petunjuk });
          });
        }
      });
      if (patchList.length > 0) {
        await updatePenerimaanProduksiItemsInSupabase(patchList);
      }
    } catch (e) {}
  };

  const handleRemoveFromQueue = async (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const norm = code.trim().toUpperCase();
    const updated = { ...queueMap };
    delete updated[norm];
    await saveQueueMap(updated);
    onShowToast(`Kode ${norm} dikeluarkan dari antrian hitung ulang.`, 'info');
  };

  const handleUpdateCodeNote = async (code: string, note: string) => {
    const norm = code.trim().toUpperCase();
    const updated = {
      ...queueMap,
      [norm]: {
        ...queueMap[norm],
        catatan_petunjuk: note,
      },
    };
    await saveQueueMap(updated);

    // Also update recount_notes on rows in Supabase
    try {
      const itemsForThisCode = penerimaanItems.filter((it) => (it.kode_produksi || '').toUpperCase() === norm);
      if (itemsForThisCode.length > 0) {
        const patchList = itemsForThisCode.map((it) => ({
          ...it,
          recount_notes: note,
        }));
        await updatePenerimaanProduksiItemsInSupabase(patchList);
      }
    } catch (e) {
      console.warn('Gagal update catatan ke Supabase rows:', e);
    }

    onShowToast(`Catatan untuk kode ${norm} diperbarui & disinkronkan ke semua user.`, 'success');
  };

  // Force Push Entire Local Queue to Supabase
  const handleForceSyncQueueToCloud = async () => {
    try {
      setIsSyncingCloudQueue(true);
      await savePenerimaanRecountQueueToSupabase(queueMap);
      onShowToast(`Berhasil! ${Object.keys(queueMap).length} kode antrian & catatan telah disinkronkan ke Cloud dan dapat dilihat semua user.`, 'success');
    } catch (err) {
      console.error('Gagal sinkron manual antrian:', err);
      onShowToast('Gagal sinkron ke Cloud.', 'error');
    } finally {
      setIsSyncingCloudQueue(false);
    }
  };

  // Queue Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'uncounted' | 'diff' | 'match'>('all');
  const [filterKategori, setFilterKategori] = useState<string>('Semua');

  // Queue Sort Order State (Terlama ➔ Terbaru, Terbaru ➔ Terlama, Prioritas)
  const [sortOrder, setSortOrder] = useState<RecountQueueSortOrder>(() => {
    try {
      const saved = localStorage.getItem('wms_recount_queue_sort_order') as RecountQueueSortOrder | null;
      if (saved && ['date_asc', 'date_desc', 'priority', 'code_asc', 'code_desc', 'diff_desc'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'date_asc'; // Default: Terlama ➔ Terbaru (FIFO Kedatangan)
  });

  const handleSortChange = (newSort: RecountQueueSortOrder) => {
    setSortOrder(newSort);
    try {
      localStorage.setItem('wms_recount_queue_sort_order', newSort);
    } catch {}
  };

  // Quick Code Picker Modal State (Multiple Choice + Notes)
  const [isPickerModalOpen, setIsPickerModalOpen] = useState<boolean>(false);
  const [isAuditMenuOpen, setIsAuditMenuOpen] = useState<boolean>(false);
  const [actionSheetQueueItem, setActionSheetQueueItem] = useState<any | null>(null);
  const [pickerSearch, setPickerSearch] = useState<string>('');
  const [pickerSortOrder, setPickerSortOrder] = useState<RecountQueueSortOrder>('date_desc');
  const [selectedPickerCodes, setSelectedPickerCodes] = useState<Set<string>>(new Set());
  const [pickerCodeNotes, setPickerCodeNotes] = useState<Record<string, string>>({});

  // History Log Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [historyLogs, setHistoryLogs] = useState<PenerimaanRecountLogItem[]>([]);
  const [historyTargetCode, setHistoryTargetCode] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Workspace Form State for Active Code
  const [auditDate, setAuditDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [auditorName, setAuditorName] = useState<string>(() => {
    return session?.name || session?.username || session?.email || 'Auditor Fisik';
  });
  const [generalNotes, setGeneralNotes] = useState<string>('');
  // Map key: `${warna}_${size}` -> { recountQty: number | null, note: string }
  const [variantInputs, setVariantInputs] = useState<Record<string, { recountQty: number | null; note: string }>>({});
  const [isSavingAudit, setIsSavingAudit] = useState<boolean>(false);
  const [isSyncingSheet, setIsSyncingSheet] = useState<boolean>(false);
  const [isBatchSyncing, setIsBatchSyncing] = useState<boolean>(false);
  const [batchSyncProgress, setBatchSyncProgress] = useState<{ current: number; total: number; activeCode: string } | null>(null);
  const [isMultiBatchScannerOpen, setIsMultiBatchScannerOpen] = useState<boolean>(false);

  // Print ref for direct isolated printing
  const printContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-open workspace if initialTargetCode is given
  useEffect(() => {
    if (initialTargetCode) {
      const norm = initialTargetCode.trim().toUpperCase();
      handleAddMultipleToQueue([{ kode_produksi: norm }]);
      setSelectedCode(norm);
      setActiveMode('workspace');
    }
  }, [initialTargetCode]);

  const normalizeProductCode = (code: string | undefined | null): string => {
    if (!code) return '';
    return String(code)
      .replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '')
      .trim()
      .toUpperCase();
  };

  // Aggregate ALL arrival items by `kode_produksi` (for picker search)
  const allCodeGroups = useMemo<CodeAuditGroup[]>(() => {
    const map = new Map<string, {
      items: PenerimaanProduksiItem[];
      nama_produk: string;
      kategori: string;
      vendor_up?: string;
      photo_url?: string;
      distinct_colors: Set<string>;
      distinct_sizes: Set<string>;
      distinct_dates: Set<string>;
      distinct_sjs: Set<string>;
    }>();

    penerimaanItems.forEach((it) => {
      const code = normalizeProductCode(it.kode_produksi);
      if (!code) return;

      if (!map.has(code)) {
        map.set(code, {
          items: [],
          nama_produk: it.nama_produk || '',
          kategori: it.kategori || 'Lokal CMT',
          vendor_up: (it as any).up_vendor || (it as any).vendor || '',
          photo_url: it.foto_url || '',
          distinct_colors: new Set(),
          distinct_sizes: new Set(),
          distinct_dates: new Set(),
          distinct_sjs: new Set(),
        });
      }

      const grp = map.get(code)!;
      grp.items.push(it);
      if (!grp.nama_produk && it.nama_produk) grp.nama_produk = it.nama_produk;
      if (!grp.photo_url && it.foto_url) grp.photo_url = it.foto_url;
      if (it.warna) grp.distinct_colors.add(it.warna.trim());
      if (it.size) grp.distinct_sizes.add(it.size.trim());
      if (it.tanggal_penerimaan) grp.distinct_dates.add(it.tanggal_penerimaan);
      if (it.no_surat_jalan) grp.distinct_sjs.add(it.no_surat_jalan.trim().toUpperCase());
    });

    const results: CodeAuditGroup[] = [];

    map.forEach((grp, code) => {
      let totalAsli = 0;
      let totalFisik: number | null = null;
      let totalSelisih: number | null = null;
      let isCounted = false;
      let hasDiff = false;
      let lastAuditor: string | undefined = undefined;
      let lastAuditDate: string | undefined = undefined;
      let lastRound: number | undefined = undefined;
      let lastNotes: string | undefined = undefined;

      const varMap = new Map<string, { asli: number; fisik: number | null; selisih: number | null }>();
      const auditedDateSet = new Set<string>();
      const unauditedDateSet = new Set<string>();
      let unauditedQty = 0;

      const auditRec = recountAuditMap[code];
      if (Array.isArray(auditRec?.audited_dates)) {
        auditRec.audited_dates.forEach((d: string) => {
          if (d) auditedDateSet.add(String(d).slice(0, 10));
        });
      }

      grp.items.forEach((it) => {
        const vKey = `${it.warna || ''}_${it.size || ''}`;
        const qtyAsli = Number(it.qty) || 0;
        const itemDate = it.tanggal_penerimaan ? String(it.tanggal_penerimaan).slice(0, 10) : '';
        totalAsli += qtyAsli;

        if (!varMap.has(vKey)) {
          varMap.set(vKey, { asli: 0, fisik: null, selisih: null });
        }
        varMap.get(vKey)!.asli += qtyAsli;

        if (it.recount_qty !== undefined && it.recount_qty !== null) {
          isCounted = true;
          varMap.get(vKey)!.fisik = Number(it.recount_qty);
          if (itemDate) auditedDateSet.add(itemDate);
          if (it.recount_auditor) lastAuditor = it.recount_auditor;
          if (it.recount_updated_at) lastAuditDate = it.recount_updated_at;
          if (it.recount_round && (!lastRound || it.recount_round > lastRound)) lastRound = it.recount_round;
          if (it.recount_notes) lastNotes = it.recount_notes;
        } else if (qtyAsli > 0) {
          unauditedQty += qtyAsli;
          if (itemDate) unauditedDateSet.add(itemDate);
        }
      });

      // Jika ada data hitung ulang dari Cloud Database / Local Cache, prioritaskan hasil audit tersebut!
      if (auditRec) {
        isCounted = true;
        totalFisik = typeof auditRec.total_fisik === 'number' ? auditRec.total_fisik : Number(auditRec.total_fisik) || 0;
        totalSelisih = typeof auditRec.total_selisih === 'number' ? auditRec.total_selisih : (totalFisik - totalAsli);
        if (totalSelisih !== 0) hasDiff = true;
        if (auditRec.auditor) lastAuditor = auditRec.auditor;
        if (auditRec.tanggal_audit || auditRec.updated_at) lastAuditDate = auditRec.tanggal_audit || auditRec.updated_at;
        if (auditRec.round) lastRound = auditRec.round;
        if (auditRec.catatan) lastNotes = auditRec.catatan;

        if (Array.isArray(auditRec.variants)) {
          auditRec.variants.forEach((v: any) => {
            const vKey = `${v.warna || ''}_${v.size || ''}`;
            if (varMap.has(vKey)) {
              varMap.get(vKey)!.fisik = Number(v.qty_fisik) || 0;
              varMap.get(vKey)!.selisih = Number(v.selisih) || 0;
            } else {
              varMap.set(vKey, {
                asli: Number(v.qty_asli) || 0,
                fisik: Number(v.qty_fisik) || 0,
                selisih: Number(v.selisih) || 0,
              });
            }
          });
        }
      } else if (isCounted) {
        let sumFisik = 0;
        varMap.forEach((val) => {
          const effectiveFisik = val.fisik !== null ? val.fisik : val.asli;
          sumFisik += effectiveFisik;
        });
        totalFisik = sumFisik;
        totalSelisih = totalFisik - totalAsli;
        if (totalSelisih !== 0) hasDiff = true;
      }

      const auditRecAsli =
        auditRec && auditRec.total_asli !== undefined && auditRec.total_asli !== null
          ? Number(auditRec.total_asli)
          : null;
      const hasPendingBatch =
        isCounted &&
        (unauditedQty > 0 || (auditRecAsli !== null && auditRecAsli > 0 && auditRecAsli < totalAsli));
      const pendingBatchQty = hasPendingBatch
        ? unauditedQty > 0
          ? unauditedQty
          : auditRecAsli !== null
          ? Math.max(0, totalAsli - auditRecAsli)
          : 0
        : 0;
      const pendingBatchDates = Array.from(unauditedDateSet)
        .filter((d) => !auditedDateSet.has(d) || unauditedQty > 0)
        .sort();

      let statusAudit: 'BELUM' | 'SUSULAN' | 'MATCH' | 'KURANG' | 'LEBIH' = 'BELUM';
      if (hasPendingBatch) {
        statusAudit = 'SUSULAN';
        hasDiff = false;
      } else if (isCounted) {
        if (auditRec?.status) {
          const st = String(auditRec.status).toUpperCase();
          if (st === 'MATCH' || st === 'KLOP' || st === 'SESUAI') statusAudit = 'MATCH';
          else if (st === 'KURANG') statusAudit = 'KURANG';
          else if (st === 'LEBIH') statusAudit = 'LEBIH';
          else statusAudit = (totalSelisih === 0 ? 'MATCH' : (totalSelisih || 0) < 0 ? 'KURANG' : 'LEBIH');
        } else if (totalSelisih === 0) {
          statusAudit = 'MATCH';
        } else if ((totalSelisih || 0) < 0) {
          statusAudit = 'KURANG';
        } else {
          statusAudit = 'LEBIH';
        }
      }

      const qMeta = queueMap[code] as any;
      const cachedNotaMap = getCachedProduksiQtyNotaMapSync();
      const rawNota = qMeta?.qty_nota ?? cachedNotaMap[code]?.qty_nota ?? null;
      const hasNota = rawNota !== null && rawNota !== undefined && !isNaN(Number(rawNota));
      const targetNota = hasNota ? Number(rawNota) : null;
      const targetQty = hasNota ? targetNota! : totalAsli;

      // Jika ada target Qty Nota, selisih dan status dihitung terhadap Qty Nota!
      // Anti False-Alarm: jika ada batch susulan belum diaudit, jangan bandingkan totalFisik parsial dengan Qty Nota.
      let effectiveSelisih = hasPendingBatch ? null : totalSelisih;
      if (isCounted && !hasPendingBatch && totalFisik !== null && hasNota) {
        effectiveSelisih = totalFisik - targetNota!;
        if (effectiveSelisih === 0) statusAudit = 'MATCH';
        else if (effectiveSelisih < 0) statusAudit = 'KURANG';
        else statusAudit = 'LEBIH';
      }

      const sortedDates = Array.from(grp.distinct_dates).filter(Boolean).sort();
      const earliestDate = sortedDates[0] || (grp.items[0]?.tanggal_penerimaan ? String(grp.items[0].tanggal_penerimaan).slice(0, 10) : (grp.items[0]?.created_at ? String(grp.items[0].created_at).slice(0, 10) : ''));
      const latestDate = sortedDates[sortedDates.length - 1] || earliestDate;

      results.push({
        kode_produksi: code,
        nama_produk: grp.nama_produk,
        kategori: grp.kategori,
        vendor_up: grp.vendor_up,
        photo_url: grp.photo_url,
        total_asli: totalAsli,
        total_fisik: totalFisik,
        total_selisih: effectiveSelisih,
        status_audit: statusAudit,
        qty_nota: targetNota,
        target_pembanding: targetQty,
        has_diff: hasDiff,
        is_counted: isCounted,
        has_pending_batch: hasPendingBatch,
        pending_batch_qty: pendingBatchQty,
        pending_batch_dates: pendingBatchDates,
        audited_dates: Array.from(auditedDateSet).sort(),
        last_auditor: lastAuditor,
        last_audit_date: lastAuditDate,
        last_round: lastRound,
        last_notes: lastNotes,
        catatan_petunjuk: qMeta?.catatan_petunjuk || '',
        distinct_colors: Array.from(grp.distinct_colors),
        distinct_sizes: Array.from(grp.distinct_sizes).sort((a, b) => {
          const wa = getSizeWeight(a);
          const wb = getSizeWeight(b);
          if (wa !== wb) return wa - wb;
          return a.localeCompare(b);
        }),
        distinct_dates: sortedDates,
        earliest_date: earliestDate,
        latest_date: latestDate,
        items: grp.items,
      });
    });

    return results.sort((a, b) => {
      if (a.has_diff && !b.has_diff) return -1;
      if (!a.has_diff && b.has_diff) return 1;
      if (!a.is_counted && b.is_counted) return -1;
      if (a.is_counted && !b.is_counted) return 1;
      return a.kode_produksi.localeCompare(b.kode_produksi);
    });
  }, [penerimaanItems, queueMap, recountAuditMap]);

  // SELECTIVE QUEUE: Only include codes that are in `queueMap` OR already have recount data
  const codeGroups = useMemo<CodeAuditGroup[]>(() => {
    return allCodeGroups.filter((g) => {
      const isExplicitlyQueued = queueMap.hasOwnProperty(g.kode_produksi);
      const isAlreadyCounted = g.is_counted;
      return isExplicitlyQueued || isAlreadyCounted;
    });
  }, [allCodeGroups, queueMap]);

  // Summary Metrics KPI (Based on Selective Queue)
  const metrics = useMemo(() => {
    let uncounted = 0;
    let diff = 0;
    let match = 0;

    codeGroups.forEach((g) => {
      if (!g.is_counted) uncounted++;
      else if (g.has_diff) diff++;
      else match++;
    });

    return {
      total: codeGroups.length,
      uncounted,
      diff,
      match,
    };
  }, [codeGroups]);

  // Filtered queue
  const filteredQueue = useMemo(() => {
    let list = codeGroups;

    if (filterKategori !== 'Semua') {
      list = list.filter((g) => g.kategori === filterKategori);
    }

    if (filterStatus === 'uncounted') {
      list = list.filter((g) => !g.is_counted || g.has_pending_batch);
    } else if (filterStatus === 'diff') {
      list = list.filter((g) => g.has_diff);
    } else if (filterStatus === 'match') {
      list = list.filter((g) => g.is_counted && !g.has_diff && !g.has_pending_batch);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (g) =>
          g.kode_produksi.toLowerCase().includes(q) ||
          g.nama_produk.toLowerCase().includes(q) ||
          (g.vendor_up && g.vendor_up.toLowerCase().includes(q)) ||
          (g.last_auditor && g.last_auditor.toLowerCase().includes(q)) ||
          (g.catatan_petunjuk && g.catatan_petunjuk.toLowerCase().includes(q)) ||
          g.distinct_colors.some((c) => c.toLowerCase().includes(q))
      );
    }

    // Apply sort order
    const sorted = [...list].sort((a, b) => {
      switch (sortOrder) {
        case 'date_asc': {
          // Terlama ➔ Terbaru (Barang kedatangan lama dihitung dulu / FIFO)
          const dateA = a.earliest_date || '9999-99-99';
          const dateB = b.earliest_date || '9999-99-99';
          const cmp = dateA.localeCompare(dateB);
          if (cmp !== 0) return cmp;
          return a.kode_produksi.localeCompare(b.kode_produksi);
        }
        case 'date_desc': {
          // Terbaru ➔ Terlama (Barang kedatangan terbaru di atas / LIFO)
          const dateA = a.latest_date || '';
          const dateB = b.latest_date || '';
          const cmp = dateB.localeCompare(dateA);
          if (cmp !== 0) return cmp;
          return a.kode_produksi.localeCompare(b.kode_produksi);
        }
        case 'code_asc':
          return a.kode_produksi.localeCompare(b.kode_produksi);
        case 'code_desc':
          return b.kode_produksi.localeCompare(a.kode_produksi);
        case 'diff_desc': {
          const diffA = Math.abs(a.total_selisih ?? 0);
          const diffB = Math.abs(b.total_selisih ?? 0);
          if (diffA !== diffB) return diffB - diffA;
          return a.kode_produksi.localeCompare(b.kode_produksi);
        }
        case 'priority':
        default: {
          if (a.has_diff && !b.has_diff) return -1;
          if (!a.has_diff && b.has_diff) return 1;
          if (!a.is_counted && b.is_counted) return -1;
          if (a.is_counted && !b.is_counted) return 1;
          const dateA = a.latest_date || '';
          const dateB = b.latest_date || '';
          const cmp = dateB.localeCompare(dateA);
          if (cmp !== 0) return cmp;
          return a.kode_produksi.localeCompare(b.kode_produksi);
        }
      }
    });

    return sorted;
  }, [codeGroups, filterStatus, filterKategori, searchQuery, sortOrder]);

  // Selected code group for workspace
  const activeGroup = useMemo(() => {
    if (!selectedCode) return null;
    return allCodeGroups.find((g) => g.kode_produksi === selectedCode) || null;
  }, [allCodeGroups, selectedCode]);

  // Group active code items into distinct variants (Warna + Size)
  const activeVariants = useMemo(() => {
    if (!activeGroup) return [];

    const auditRec = recountAuditMap[activeGroup.kode_produksi];
    const auditVarAsliMap = new Map<string, number>();
    if (Array.isArray(auditRec?.variants)) {
      auditRec.variants.forEach((av: any) => {
        const avKey = `${av.warna || '-'}_${av.size || '-'}`;
        if (av.qty_asli !== undefined && av.qty_asli !== null) {
          auditVarAsliMap.set(avKey, Number(av.qty_asli) || 0);
        }
      });
    }

    const map = new Map<string, {
      warna: string;
      size: string;
      qty_asli: number;
      existing_fisik: number | null;
      unaudited_qty: number;
      existing_round?: number;
      existing_note?: string;
    }>();

    activeGroup.items.forEach((it) => {
      const w = it.warna || '-';
      const s = it.size || '-';
      const key = `${w}_${s}`;
      const q = Number(it.qty) || 0;
      const hasRecount = it.recount_qty !== undefined && it.recount_qty !== null;

      if (!map.has(key)) {
        map.set(key, {
          warna: w,
          size: s,
          qty_asli: 0,
          existing_fisik: hasRecount ? Number(it.recount_qty) : null,
          unaudited_qty: 0,
          existing_round: it.recount_round,
          existing_note: it.recount_notes,
        });
      }

      const entry = map.get(key)!;
      entry.qty_asli += q;
      if (hasRecount) {
        entry.existing_fisik = Number(it.recount_qty);
      } else if (q > 0) {
        entry.unaudited_qty += q;
      }
    });

    // Fallback untuk data lama: jika semua baris sudah punya recount_qty namun auditRec mencatat qty_asli lebih kecil
    if (activeGroup.has_pending_batch) {
      map.forEach((entry, key) => {
        if (entry.unaudited_qty === 0 && auditVarAsliMap.has(key)) {
          const prevAsli = auditVarAsliMap.get(key)!;
          if (entry.qty_asli > prevAsli) {
            entry.unaudited_qty = entry.qty_asli - prevAsli;
          }
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      const c = a.warna.localeCompare(b.warna);
      if (c !== 0) return c;
      const weightA = getSizeWeight(a.size);
      const weightB = getSizeWeight(b.size);
      if (weightA !== weightB) return weightA - weightB;
      return a.size.localeCompare(b.size);
    });
  }, [activeGroup, recountAuditMap]);

  const lastLoadedCodeRef = useRef<string | null>(null);
  const isWorkspaceDirtyRef = useRef<boolean>(false);

  // Initialize variantInputs when switching selectedCode, restoring any unsaved draft first
  useEffect(() => {
    if (!selectedCode || !activeGroup) {
      lastLoadedCodeRef.current = null;
      isWorkspaceDirtyRef.current = false;
      return;
    }

    if (lastLoadedCodeRef.current !== selectedCode) {
      lastLoadedCodeRef.current = selectedCode;
      isWorkspaceDirtyRef.current = false;

      const savedDraft = loadRecountWorkspaceDraft().draftsByCode?.[selectedCode];
      const initialMap: Record<string, { recountQty: number | null; note: string }> = {};

      activeVariants.forEach((v) => {
        const key = `${v.warna}_${v.size}`;
        const draftVar = savedDraft?.variantInputs?.[key];
        initialMap[key] = {
          recountQty:
            draftVar && draftVar.recountQty !== undefined
              ? draftVar.recountQty
              : v.existing_fisik !== null
              ? v.existing_fisik
              : null,
          note:
            draftVar && typeof draftVar.note === 'string' && draftVar.note
              ? draftVar.note
              : v.existing_note || '',
        };
      });

      setVariantInputs(initialMap);
      setGeneralNotes(savedDraft?.generalNotes ?? activeGroup.last_notes ?? '');
      if (savedDraft?.auditorName) {
        setAuditorName(savedDraft.auditorName);
      } else if (activeGroup.last_auditor) {
        setAuditorName(activeGroup.last_auditor);
      }
      if (savedDraft?.auditDate) {
        setAuditDate(savedDraft.auditDate);
      }
    } else {
      // Same code workspace: merge any new variants without overwriting user-typed input values
      setVariantInputs((prev) => {
        let hasNew = false;
        const next = { ...prev };
        activeVariants.forEach((v) => {
          const key = `${v.warna}_${v.size}`;
          if (next[key] === undefined) {
            next[key] = {
              recountQty: v.existing_fisik !== null ? v.existing_fisik : null,
              note: v.existing_note || '',
            };
            hasNew = true;
          }
        });
        return hasNew ? next : prev;
      });
    }
  }, [selectedCode, activeGroup, activeVariants]);

  // Persist activeMode, selectedCode, and in-progress variantInputs only when user actually edited workspace
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeMode !== 'workspace' || !selectedCode) {
        saveRecountWorkspaceDraft({ activeMode: 'queue', selectedCode: '' });
        return;
      }
      if (!isWorkspaceDirtyRef.current) {
        saveRecountWorkspaceDraft({ activeMode, selectedCode });
        return;
      }
      saveRecountWorkspaceDraft({
        activeMode,
        selectedCode,
        draftsByCode: {
          [selectedCode]: {
            variantInputs,
            generalNotes,
            auditorName,
            auditDate,
            updatedAt: Date.now(),
          },
        },
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [activeMode, selectedCode, variantInputs, generalNotes, auditorName, auditDate]);

  // Live calculations for current workspace
  const workspaceSummary = useMemo(() => {
    let totalAsli = 0;
    let totalFisik = 0;
    let filledCount = 0;

    activeVariants.forEach((v) => {
      totalAsli += v.qty_asli;
      const key = `${v.warna}_${v.size}`;
      const inp = variantInputs[key];
      if (inp && inp.recountQty !== null && !isNaN(inp.recountQty)) {
        totalFisik += inp.recountQty;
        filledCount++;
      } else {
        totalFisik += v.qty_asli;
      }
    });

    const code = activeGroup ? activeGroup.kode_produksi : '';
    const cachedNotaMap = getCachedProduksiQtyNotaMapSync();
    const rawNota = (queueMap[code] as any)?.qty_nota ?? cachedNotaMap[code]?.qty_nota ?? null;
    const hasNota = rawNota !== null && rawNota !== undefined && !isNaN(Number(rawNota));
    const targetNota = hasNota ? Number(rawNota) : null;
    const targetQty = hasNota ? targetNota! : totalAsli;

    // Matching angka: Jika Qty Nota terisi, bandingkan Qty Hitung Ulang dengan Qty Nota.
    // Jika tidak ada Qty Nota, bandingkan Qty Hitung Ulang dengan Total SJ Diterima.
    const totalSelisih = totalFisik - targetQty;
    const status: 'MATCH' | 'KURANG' | 'LEBIH' = totalSelisih === 0 ? 'MATCH' : totalSelisih < 0 ? 'KURANG' : 'LEBIH';

    return {
      totalAsli,
      totalFisik,
      totalSelisih,
      status,
      filledCount,
      totalVariants: activeVariants.length,
      hasNota,
      targetNota,
      targetQty,
    };
  }, [activeVariants, variantInputs, activeGroup, queueMap]);

  // Quick Action: Fill all variants with original arrival qty
  const handleQuickFillSameAsOriginal = () => {
    const updated: Record<string, { recountQty: number | null; note: string }> = {};
    activeVariants.forEach((v) => {
      const key = `${v.warna}_${v.size}`;
      updated[key] = {
        recountQty: v.qty_asli,
        note: variantInputs[key]?.note || '',
      };
    });
    isWorkspaceDirtyRef.current = true;
    setVariantInputs(updated);
    onShowToast('Seluruh kuantitas fisik telah diisi sesuai dengan hitungan awal.', 'info');
  };

  // Quick Action: Merge unaudited follow-up batch qty into previously audited recount values
  const handleMergePendingBatchQty = () => {
    if (!activeGroup) return;
    const updated: Record<string, { recountQty: number | null; note: string }> = {};
    let totalAdded = 0;
    activeVariants.forEach((v) => {
      const key = `${v.warna}_${v.size}`;
      const baseAudited = v.existing_fisik !== null ? v.existing_fisik : 0;
      const mergedVal =
        v.unaudited_qty > 0
          ? baseAudited + v.unaudited_qty
          : v.existing_fisik !== null
          ? v.existing_fisik
          : v.qty_asli;
      if (v.unaudited_qty > 0) totalAdded += v.unaudited_qty;
      updated[key] = {
        recountQty: mergedVal,
        note: variantInputs[key]?.note || v.existing_note || '',
      };
    });
    isWorkspaceDirtyRef.current = true;
    setVariantInputs(updated);
    onShowToast(
      `Batch susulan (+${totalAdded || activeGroup.pending_batch_qty || 0} pcs) digabungkan ke angka audit sebelumnya. Sesuaikan varian yang berbeda lalu Simpan.`,
      'success'
    );
  };

  // Quick Action: Reset all inputs
  const handleResetInputs = () => {
    const updated: Record<string, { recountQty: number | null; note: string }> = {};
    activeVariants.forEach((v) => {
      const key = `${v.warna}_${v.size}`;
      updated[key] = {
        recountQty: null,
        note: '',
      };
    });
    isWorkspaceDirtyRef.current = true;
    setVariantInputs(updated);
    onShowToast('Kolom input fisik telah dikosongkan.', 'info');
  };

  // Open Workspace for a specific code
  const handleOpenWorkspace = (code: string) => {
    const norm = code.trim().toUpperCase();
    handleAddMultipleToQueue([{ kode_produksi: norm }]);
    setSelectedCode(norm);
    setActiveMode('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save Audit & Auto-Push Targeted Delta to Master Sheet
  const handleSaveAndAutoPush = async () => {
    if (!activeGroup) return;

    if (workspaceSummary.filledCount === 0) {
      if (!window.confirm('Belum ada angka fisik yang diisi. Apakah Anda ingin menandai seluruh varian klop sesuai surat jalan asli?')) {
        return;
      }
      handleQuickFillSameAsOriginal();
    }

    try {
      setIsSavingAudit(true);

      const nextRound = (activeGroup.last_round || 0) + 1;
      const nowIso = new Date().toISOString();

      // 1. Map updated fields to each PenerimaanProduksiItem in this code
      const updatedItems: PenerimaanProduksiItem[] = activeGroup.items.map((it) => {
        const key = `${it.warna || '-'}_${it.size || '-'}`;
        const inputVal = variantInputs[key];
        const fisikVal = inputVal && inputVal.recountQty !== null ? inputVal.recountQty : Number(it.qty) || 0;
        const selisih = fisikVal - (Number(it.qty) || 0);
        const status = selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH';

        return {
          ...it,
          // PENTING: it.qty asli tetap murni dan tidak pernah ditimpa
          qty: it.qty,
          recount_qty: fisikVal,
          recount_selisih: selisih,
          recount_status: status,
          recount_round: nextRound,
          recount_notes: inputVal?.note || generalNotes || it.recount_notes,
          recount_auditor: auditorName || 'Auditor Fisik',
          recount_updated_at: nowIso,
        };
      });

      // 2. Simpan ke database Supabase (dan deteksi apakah offline / gagal sebagian)
      const patchRes = await updatePenerimaanProduksiItemsInSupabase(updatedItems);
      const isOfflineNow = typeof navigator !== 'undefined' && !navigator.onLine;

      const detailRecords = activeVariants.map((v) => {
        const key = `${v.warna}_${v.size}`;
        const sv = variantInputs[key];
        const fisik = sv && sv.recountQty !== null ? sv.recountQty : v.qty_asli;
        return {
          kode_produksi: activeGroup.kode_produksi,
          nama_produk: activeGroup.nama_produk,
          warna: v.warna,
          size: v.size,
          tanggal_penerimaan: activeGroup.items[0]?.tanggal_penerimaan || auditDate,
          qty_sebelumnya: v.qty_asli,
          qty_fisik: fisik,
          selisih: fisik - v.qty_asli,
          catatan: sv?.note || generalNotes || '',
        };
      });

      const logPayload = {
        id: `recount_${normalizeProductCode(activeGroup.kode_produksi)}_r${nextRound}_${Date.now()}`,
        round: nextRound,
        tanggal_audit: auditDate,
        auditor: auditorName || 'Auditor Fisik',
        kode_produksi: activeGroup.kode_produksi,
        total_sebelumnya: workspaceSummary.totalAsli,
        total_fisik: workspaceSummary.totalFisik,
        total_selisih: workspaceSummary.totalSelisih,
        general_notes: generalNotes,
        details: detailRecords,
      };

      const prevRec = recountAuditMap[activeGroup.kode_produksi];
      const prevHistory = Array.isArray(prevRec?.history) ? [...prevRec.history] : [];
      if (prevRec && prevRec.total_fisik !== undefined && Number(prevRec.round || 1) !== nextRound) {
        prevHistory.push({
          round: prevRec.round || 1,
          tanggal_audit: prevRec.tanggal_audit,
          total_asli: prevRec.total_asli,
          total_fisik: prevRec.total_fisik,
          total_selisih: prevRec.total_selisih,
          status: prevRec.status,
          auditor: prevRec.auditor,
          catatan: prevRec.catatan,
          updated_at: prevRec.updated_at,
          variants: prevRec.variants,
        });
      }

      const arrivalDates = Array.from(activeGroup.distinct_dates || []);
      const arrivalDatesInfo = formatDatesSummary(arrivalDates);

      const newRecord = {
        kode_produksi: activeGroup.kode_produksi,
        tanggal_audit: auditDate,
        total_asli: workspaceSummary.totalAsli,
        total_fisik: workspaceSummary.totalFisik,
        total_selisih: workspaceSummary.totalSelisih,
        status: workspaceSummary.status,
        round: nextRound,
        auditor: auditorName || 'Auditor Fisik',
        catatan: generalNotes,
        updated_at: nowIso,
        audited_dates: arrivalDates,
        history: prevHistory,
        variants: activeVariants.map((v) => {
          const key = `${v.warna}_${v.size}`;
          const sv = variantInputs[key];
          const fisik = sv && sv.recountQty !== null ? sv.recountQty : v.qty_asli;
          const selisih = fisik - v.qty_asli;
          return {
            warna: v.warna,
            size: v.size,
            qty_asli: v.qty_asli,
            qty_fisik: fisik,
            selisih,
            status: selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH',
            note: sv?.note || '',
          };
        }),
      };

      const deltaItems: MasterRecountDeltaItem[] = activeVariants.map((v) => {
        const key = `${v.warna}_${v.size}`;
        const sv = variantInputs[key];
        const fisik = sv && sv.recountQty !== null ? sv.recountQty : v.qty_asli;
        const selisih = fisik - v.qty_asli;
        const status = selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH';

        return {
          kode_produksi: activeGroup.kode_produksi,
          warna: v.warna,
          size: v.size,
          qty_asli: v.qty_asli,
          qty_fisik: fisik,
          selisih,
          status,
          round: nextRound,
          auditor: auditorName || 'Auditor',
          catatan: sv?.note || generalNotes || '',
          tanggal_kedatangan_info: arrivalDatesInfo,
          updated_at: nowIso,
        };
      });

      const sheetDeltaPayload = {
        activeTab: (activeGroup.kategori === 'Kargo' ? 'Kargo' : 'CMT') as 'Kargo' | 'CMT',
        kode_produksi: activeGroup.kode_produksi,
        tanggal_hitung: auditDate,
        items: deltaItems,
      };

      // 3. Catat ke riwayat log audit (History Logs)
      let logSyncedOk = false;
      try {
        if (activeGroup.is_counted && !isOfflineNow) {
          const prevSynth = synthesizeHistoryLogForCode(activeGroup.kode_produksi);
          if (prevSynth && Number(prevSynth.round || 1) < nextRound) {
            await savePenerimaanRecountLog(prevSynth);
          }
        }
        await savePenerimaanRecountLog(logPayload);
        logSyncedOk = !isOfflineNow;
      } catch (logErr) {
        console.warn('Gagal catat log audit:', logErr);
      }

      // 4. Simpan ke Cloud Settings agar persisten & langsung terbaca di seluruh user / HP
      let auditRecordSyncedOk = false;
      try {
        await saveRecountAuditRecord(newRecord);
        setRecountAuditMap((prev) => ({
          ...prev,
          [activeGroup.kode_produksi]: newRecord,
        }));
        auditRecordSyncedOk = !isOfflineNow;

        if (workspaceSummary.hasNota && !isOfflineNow) {
          syncQtyNotaAndAutoQueueRecount({
            penerimaanItems,
            skipSheetFetch: true,
            updatedBy: auditorName || 'Auditor Fisik',
            overrideNotaEntry: {
              kode_produksi: activeGroup.kode_produksi,
              qty_nota: workspaceSummary.targetNota,
              kategori: activeGroup.kategori,
            },
          }).catch((errSync) => console.warn('Sync nota post recount:', errSync));
        }
      } catch (errRec) {
        console.warn('Gagal simpan recount record ke Cloud settings:', errRec);
      }

      // Jika sedang offline atau ada baris PATCH yang gagal karena sinyal putus di tengah jalan,
      // masukkan ke Antrean Outbox Hitung Ulang (Idempotent PATCH) agar terkirim otomatis saat sinyal pulih!
      if (isOfflineNow || !patchRes.success || patchRes.failedCount > 0) {
        enqueueRecountOutboxBatch({
          kode_produksi: activeGroup.kode_produksi,
          tanggal_audit: auditDate,
          auditor: auditorName || 'Auditor Fisik',
          round: nextRound,
          updatedItems,
          auditRecord: newRecord,
          logRecord: logPayload,
          sheetDelta: sheetDeltaPayload,
          itemsSynced: patchRes.success && patchRes.failedCount === 0 && !isOfflineNow,
          auditRecordSynced: auditRecordSyncedOk,
          logSynced: logSyncedOk,
          sheetSynced: false,
        });

        isWorkspaceDirtyRef.current = false;
        clearRecountCodeDraft(activeGroup.kode_produksi);
        handleAddMultipleToQueue([{ kode_produksi: activeGroup.kode_produksi }]);
        await onRefreshData();
        setFilterStatus('all');
        setSelectedCode('');
        setActiveMode('queue');
        onShowToast(
          `📦 Hasil hitung ulang Kode ${activeGroup.kode_produksi} tersimpan aman di Antrean Offline! Otomatis dikirim ke Supabase & Google Sheet saat jaringan kembali stabil.`,
          'warning'
        );
        return;
      }

      // 5. AUTO-PUSH TARGETED DELTA KE MASTER SHEET DI GOOGLE SPREADSHEET (ANTI-TIMEOUT)
      setIsSyncingSheet(true);
      try {
        const deltaRes = await pushMasterRecountDeltaToGoogleSheet(sheetDeltaPayload);

        if (deltaRes.success) {
          onShowToast(
            `Hasil audit Kode ${activeGroup.kode_produksi} berhasil disimpan & Master Sheet Google telah terupdate otomatis!`,
            'success'
          );
        } else {
          onShowToast(
            `Data berhasil disimpan ke database. Sinkronisasi Sheet: ${deltaRes.message || 'Tertunda'}`,
            'info'
          );
        }
      } catch (sheetErr: any) {
        console.warn('Auto-push delta Google Sheet tertunda:', sheetErr);
        onShowToast('Data tersimpan di database. Auto-push Google Sheet akan dicoba kembali saat online.', 'info');
      } finally {
        setIsSyncingSheet(false);
      }

      // Bersihkan draft kode ini karena sudah tersimpan penuh
      isWorkspaceDirtyRef.current = false;
      clearRecountCodeDraft(activeGroup.kode_produksi);

      // Pastikan kode tersimpan dalam antrian terpilih
      handleAddMultipleToQueue([{ kode_produksi: activeGroup.kode_produksi }]);

      // 6. Muat ulang data induk dan kembali ke daftar antrian
      await onRefreshData();
      setFilterStatus('all');
      setSelectedCode('');
      setActiveMode('queue');
    } catch (err: any) {
      console.error('Error saving audit:', err);
      onShowToast(`Gagal menyimpan hasil audit: ${err.message || 'Terjadi kesalahan sistem'}`, 'error');
    } finally {
      setIsSavingAudit(false);
    }
  };

  // Helper to synthesize a complete recount history log from live recountAuditMap / allCodeGroups / penerimaanItems
  const synthesizeHistoryLogForCode = (rawCode: string): PenerimaanRecountLogItem | null => {
    const normCode = normalizeProductCode(rawCode);
    if (!normCode) return null;

    const group = allCodeGroups.find((g) => normalizeProductCode(g.kode_produksi) === normCode);
    const auditRec =
      recountAuditMap[normCode] ||
      recountAuditMap[rawCode] ||
      Object.values(recountAuditMap).find(
        (v: any) => normalizeProductCode(v?.kode_produksi || '') === normCode
      );

    const codeItems =
      group?.items && group.items.length > 0
        ? group.items
        : penerimaanItems.filter((it) => normalizeProductCode(it.kode_produksi) === normCode);

    const hasCountedItems = codeItems.some(
      (it) =>
        (it.recount_qty !== undefined && it.recount_qty !== null) ||
        Boolean(it.recount_auditor) ||
        Boolean(it.recount_round)
    );

    if (!auditRec && !group?.is_counted && !hasCountedItems) {
      return null;
    }

    let details: PenerimaanRecountLogDetailItem[] = [];
    if (auditRec && Array.isArray(auditRec.variants) && auditRec.variants.length > 0) {
      details = auditRec.variants.map((v: any) => {
        const qAsli = Number(v.qty_asli) || 0;
        const qFisik =
          v.qty_fisik !== undefined && v.qty_fisik !== null ? Number(v.qty_fisik) : qAsli;
        return {
          kode_produksi: normCode,
          warna: v.warna || '-',
          size: v.size || '-',
          qty_sebelumnya: qAsli,
          qty_fisik: qFisik,
          selisih:
            v.selisih !== undefined && v.selisih !== null ? Number(v.selisih) : qFisik - qAsli,
          catatan: v.note || v.catatan || '',
        };
      });
    } else if (codeItems.length > 0) {
      const vMap = new Map<string, PenerimaanRecountLogDetailItem>();
      codeItems.forEach((it) => {
        const key = `${it.warna || '-'}_${it.size || '-'}`;
        const prevQ = Number(it.qty) || 0;
        const countQ =
          it.recount_qty !== undefined && it.recount_qty !== null ? Number(it.recount_qty) : prevQ;
        if (!vMap.has(key)) {
          vMap.set(key, {
            kode_produksi: normCode,
            nama_produk: it.nama_produk,
            warna: it.warna || '-',
            size: it.size || '-',
            tanggal_penerimaan: it.tanggal_penerimaan,
            no_surat_jalan: it.no_surat_jalan,
            qty_sebelumnya: 0,
            qty_fisik: 0,
            selisih: 0,
            catatan: it.recount_notes || '',
          });
        }
        const rec = vMap.get(key)!;
        rec.qty_sebelumnya += prevQ;
        rec.qty_fisik += countQ;
        rec.selisih = rec.qty_fisik - rec.qty_sebelumnya;
        if (!rec.catatan && it.recount_notes) rec.catatan = it.recount_notes;
      });
      details = Array.from(vMap.values());
    }

    const totalAsli =
      auditRec?.total_asli !== undefined
        ? Number(auditRec.total_asli)
        : group?.total_asli !== undefined
        ? Number(group.total_asli)
        : details.reduce((acc, d) => acc + (Number(d.qty_sebelumnya) || 0), 0);

    const totalFisik =
      auditRec?.total_fisik !== undefined
        ? Number(auditRec.total_fisik)
        : group?.total_fisik !== undefined && group.total_fisik !== null
        ? Number(group.total_fisik)
        : details.reduce((acc, d) => acc + (Number(d.qty_fisik) || 0), 0);

    const totalSelisih = totalFisik - totalAsli;
    const roundNum = Number(auditRec?.round || group?.last_round || 1);
    const auditorStr =
      auditRec?.auditor ||
      group?.last_auditor ||
      codeItems.find((it) => it.recount_auditor)?.recount_auditor ||
      'Auditor Gudang';

    const rawDate =
      auditRec?.tanggal_audit ||
      auditRec?.updated_at ||
      group?.last_audit_date ||
      codeItems.find((it) => it.recount_updated_at)?.recount_updated_at ||
      new Date().toISOString();

    const notesStr =
      auditRec?.catatan ||
      group?.last_notes ||
      codeItems.find((it) => it.recount_notes)?.recount_notes ||
      '';

    return {
      id: `recount_sync_${normCode}_r${roundNum}`,
      round: roundNum,
      tanggal_audit: String(rawDate).slice(0, 10),
      auditor: auditorStr,
      kode_produksi: normCode,
      total_sebelumnya: totalAsli,
      total_fisik: totalFisik,
      total_selisih: totalSelisih,
      general_notes: notesStr,
      details,
      created_at: String(rawDate).includes('T')
        ? String(rawDate)
        : `${String(rawDate).slice(0, 10)}T07:00:00.000Z`,
    };
  };

  // Helper to synthesize all rounds (including archived rounds in auditRec.history)
  const synthesizeAllHistoryLogsForCode = (rawCode: string): PenerimaanRecountLogItem[] => {
    const normCode = normalizeProductCode(rawCode);
    const latest = synthesizeHistoryLogForCode(rawCode);
    if (!latest) return [];

    const auditRec =
      recountAuditMap[normCode] ||
      recountAuditMap[rawCode] ||
      Object.values(recountAuditMap).find(
        (v: any) => normalizeProductCode(v?.kode_produksi || '') === normCode
      );

    const results: PenerimaanRecountLogItem[] = [latest];
    if (auditRec && Array.isArray(auditRec.history) && auditRec.history.length > 0) {
      auditRec.history.forEach((h: any, hIdx: number) => {
        const rNum = Number(h.round || hIdx + 1);
        const hDetails: PenerimaanRecountLogDetailItem[] = Array.isArray(h.variants)
          ? h.variants.map((v: any) => {
              const qAsli = Number(v.qty_asli) || 0;
              const qFisik = v.qty_fisik !== undefined && v.qty_fisik !== null ? Number(v.qty_fisik) : qAsli;
              return {
                kode_produksi: normCode,
                warna: v.warna || '-',
                size: v.size || '-',
                qty_sebelumnya: qAsli,
                qty_fisik: qFisik,
                selisih: v.selisih !== undefined && v.selisih !== null ? Number(v.selisih) : qFisik - qAsli,
                catatan: v.note || v.catatan || '',
              };
            })
          : [];
        const rawDate = h.tanggal_audit || h.updated_at || latest.tanggal_audit;
        results.push({
          id: `recount_sync_${normCode}_r${rNum}`,
          round: rNum,
          tanggal_audit: String(rawDate).slice(0, 10),
          auditor: h.auditor || latest.auditor,
          kode_produksi: normCode,
          total_sebelumnya: Number(h.total_asli ?? latest.total_sebelumnya),
          total_fisik: Number(h.total_fisik ?? 0),
          total_selisih: Number(h.total_selisih ?? (Number(h.total_fisik ?? 0) - Number(h.total_asli ?? latest.total_sebelumnya))),
          general_notes: h.catatan || '',
          details: hDetails,
          created_at: String(rawDate).includes('T')
            ? String(rawDate)
            : `${String(rawDate).slice(0, 10)}T07:00:00.000Z`,
        });
      });
    }

    return results.sort((a, b) => Number(b.round || 1) - Number(a.round || 1));
  };

  // Open History Logs Modal for a code
  const handleOpenHistoryModal = async (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setHistoryTargetCode(code);
    setIsHistoryModalOpen(true);

    const synthLogs = synthesizeAllHistoryLogsForCode(code);
    setHistoryLogs(synthLogs);

    setIsLoadingHistory(true);
    try {
      const logs = await fetchPenerimaanRecountLogs(code);
      if (logs && logs.length > 0) {
        const combined = [...logs];
        synthLogs.forEach((sLog) => {
          const exists = combined.some(
            (l) =>
              l.id === sLog.id ||
              (sLog.round && l.round && Number(l.round) === Number(sLog.round)) ||
              (Number(l.total_fisik) === Number(sLog.total_fisik) &&
                String(l.tanggal_audit).slice(0, 10) === String(sLog.tanggal_audit).slice(0, 10) &&
                (l.auditor || '').toLowerCase() === (sLog.auditor || '').toLowerCase())
          );
          if (!exists) {
            combined.push(sLog);
          }
        });
        combined.sort((a, b) => {
          if (a.round && b.round && a.round !== b.round) return b.round - a.round;
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });
        setHistoryLogs(combined);
      } else if (synthLogs.length > 0) {
        setHistoryLogs(synthLogs);
        // Backfill ke cloud history agar sesi ini tersimpan permanen lintas perangkat
        synthLogs.forEach((sLog) => {
          savePenerimaanRecountLog(sLog).catch(() => {});
        });
      } else {
        setHistoryLogs([]);
      }
    } catch (err) {
      console.warn('Error loading recount logs:', err);
      if (synthLogs.length > 0) setHistoryLogs(synthLogs);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Re-push audit delta for a code to Google Sheets directly
  // Helper to map a CodeAuditGroup to MasterRecountDeltaItem array
  const buildDeltaItemsForGroup = (group: CodeAuditGroup): MasterRecountDeltaItem[] => {
    const auditRec = recountAuditMap[group.kode_produksi];
    const nowIso = new Date().toISOString();
    const allDates = Array.from(new Set(group.items.map((it) => it.tanggal_penerimaan).filter(Boolean)));
    const arrivalDatesInfo = formatDatesSummary(allDates as string[]);

    if (auditRec && Array.isArray(auditRec.variants) && auditRec.variants.length > 0) {
      return auditRec.variants.map((v: any) => ({
        kode_produksi: group.kode_produksi,
        warna: v.warna || '-',
        size: v.size || '-',
        qty_asli: Number(v.qty_asli) || 0,
        qty_fisik: Number(v.qty_fisik !== undefined ? v.qty_fisik : v.qty_asli) || 0,
        selisih: Number(v.selisih) || 0,
        status: v.status || (v.selisih === 0 ? 'MATCH' : v.selisih < 0 ? 'KURANG' : 'LEBIH'),
        round: auditRec.round || 1,
        auditor: auditRec.auditor || 'Auditor Fisik',
        catatan: v.note || auditRec.catatan || '',
        tanggal_kedatangan_info: arrivalDatesInfo,
        updated_at: nowIso,
      }));
    }

    const varMap = new Map<string, { warna: string; size: string; qtyAsli: number; qtyFisik: number; note?: string }>();
    group.items.forEach((it) => {
      const key = `${it.warna || '-'}_${it.size || '-'}`;
      if (!varMap.has(key)) {
        varMap.set(key, { warna: it.warna || '-', size: it.size || '-', qtyAsli: 0, qtyFisik: 0, note: it.recount_notes });
      }
      const rec = varMap.get(key)!;
      const qAsli = Number(it.qty) || 0;
      const qFisik = it.recount_qty !== undefined && it.recount_qty !== null ? Number(it.recount_qty) : qAsli;
      rec.qtyAsli += qAsli;
      rec.qtyFisik += qFisik;
    });

    return Array.from(varMap.values()).map((v) => {
      const selisih = v.qtyFisik - v.qtyAsli;
      return {
        kode_produksi: group.kode_produksi,
        warna: v.warna,
        size: v.size,
        qty_asli: v.qtyAsli,
        qty_fisik: v.qtyFisik,
        selisih,
        status: selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH',
        round: group.last_round || 1,
        auditor: group.last_auditor || 'Auditor Fisik',
        catatan: v.note || group.last_notes || '',
        tanggal_kedatangan_info: arrivalDatesInfo,
        updated_at: nowIso,
      };
    });
  };

  const handleDirectRePushToSheet = async (group: CodeAuditGroup, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!group) return;

    try {
      setIsSyncingSheet(true);
      const deltaItems = buildDeltaItemsForGroup(group);

      const deltaRes = await pushMasterRecountDeltaToGoogleSheet({
        activeTab: group.kategori === 'Kargo' ? 'Kargo' : 'CMT',
        kode_produksi: group.kode_produksi,
        tanggal_hitung: group.last_audit_date ? group.last_audit_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        items: deltaItems,
      });

      if (deltaRes.success) {
        onShowToast(
          `✅ Berhasil Re-Push ke Google Sheet: Data hitung ulang Kode ${group.kode_produksi} telah disinkronkan ke Master Sheet!`,
          'success'
        );
      } else {
        onShowToast(`Gagal kirim ke Google Sheet: ${deltaRes.message || 'Error'}`, 'error');
      }
    } catch (err: any) {
      console.error('Error direct repush to sheet:', err);
      onShowToast(`Gagal re-push ke Google Sheet: ${err.message || err}`, 'error');
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Batch Re-Push all counted codes to Google Sheet
  const handleBatchRePushToSheet = async () => {
    const targetGroups = filteredQueue.filter((g) => g.is_counted);
    if (targetGroups.length === 0) {
      onShowToast('Tidak ada kode produksi yang sudah dihitung untuk di-repush ke Google Sheet.', 'warning');
      return;
    }

    const confirmMsg = `Kirim ulang (Re-Push) hasil hitung ulang untuk ${targetGroups.length} Kode Produksi ke Master Sheet Google?\n\nProses akan berjalan bertahap otomatis (anti-timeout).`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsBatchSyncing(true);
      setBatchSyncProgress({ current: 0, total: targetGroups.length, activeCode: targetGroups[0].kode_produksi });

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < targetGroups.length; i++) {
        const group = targetGroups[i];
        setBatchSyncProgress({ current: i + 1, total: targetGroups.length, activeCode: group.kode_produksi });

        try {
          const deltaItems = buildDeltaItemsForGroup(group);
          const deltaRes = await pushMasterRecountDeltaToGoogleSheet({
            activeTab: group.kategori === 'Kargo' ? 'Kargo' : 'CMT',
            kode_produksi: group.kode_produksi,
            tanggal_hitung: group.last_audit_date ? group.last_audit_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
            items: deltaItems,
          });

          if (deltaRes.success) {
            successCount++;
          } else {
            console.warn(`Gagal sync batch sheet untuk ${group.kode_produksi}:`, deltaRes.message);
            failCount++;
          }
        } catch (itemErr) {
          console.error(`Error push delta ${group.kode_produksi}:`, itemErr);
          failCount++;
        }
      }

      if (failCount === 0) {
        onShowToast(`✅ Berhasil Re-Push Semua! ${successCount} kode produksi telah disinkronkan ke Master Sheet Google.`, 'success');
      } else {
        onShowToast(`Re-Push Selesai: ${successCount} sukses, ${failCount} gagal dikirim ke Google Sheet.`, 'warning');
      }
    } catch (err: any) {
      console.error('Error batch re-push:', err);
      onShowToast(`Gagal eksekusi Re-Push masal: ${err?.message || err}`, 'error');
    } finally {
      setIsBatchSyncing(false);
      setBatchSyncProgress(null);
    }
  };

  // Prompt to edit card instruction note
  const handlePromptEditCardNote = (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentNote = queueMap[code]?.catatan_petunjuk || '';
    const newNote = window.prompt(`Masukkan petunjuk / catatan untuk Kode ${code} (misal: petunjuk kurang 23 pcs):`, currentNote);
    if (newNote !== null) {
      handleUpdateCodeNote(code, newNote.trim());
    }
  };

  // Direct Browser Print for Form Lembar Fisik
  const handlePrintPhysicalForm = () => {
    if (!printContainerRef.current) return;
    const content = printContainerRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>LEMBAR KERJA VERIFIKASI FISIK - ${selectedCode}</title>
          <style>
            @page { size: portrait; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-family: monospace; }
            .sign-box { margin-top: 30px; display: flex; justify-content: space-between; text-align: center; font-size: 10px; }
            .sign-line { margin-top: 45px; border-top: 1px solid #475569; width: 130px; }
            .note-box { background-color: #fffbeb; border: 1px solid #fef3c7; padding: 6px; border-radius: 4px; margin-top: 6px; font-size: 10px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${content}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Filtered list in Picker Modal with sorting
  const pickerFilteredCodes = useMemo(() => {
    const list = allCodeGroups.filter(
      (g) =>
        !pickerSearch.trim() ||
        g.kode_produksi.toLowerCase().includes(pickerSearch.toLowerCase()) ||
        g.nama_produk.toLowerCase().includes(pickerSearch.toLowerCase()) ||
        (g.vendor_up && g.vendor_up.toLowerCase().includes(pickerSearch.toLowerCase()))
    );

    return list.sort((a, b) => {
      if (pickerSortOrder === 'date_asc') {
        const dateA = a.earliest_date || '9999-99-99';
        const dateB = b.earliest_date || '9999-99-99';
        const cmp = dateA.localeCompare(dateB);
        if (cmp !== 0) return cmp;
        return a.kode_produksi.localeCompare(b.kode_produksi);
      }
      if (pickerSortOrder === 'date_desc') {
        const dateA = a.latest_date || '';
        const dateB = b.latest_date || '';
        const cmp = dateB.localeCompare(dateA);
        if (cmp !== 0) return cmp;
        return a.kode_produksi.localeCompare(b.kode_produksi);
      }
      if (pickerSortOrder === 'code_desc') {
        return b.kode_produksi.localeCompare(a.kode_produksi);
      }
      return a.kode_produksi.localeCompare(b.kode_produksi);
    });
  }, [allCodeGroups, pickerSearch, pickerSortOrder]);

  // Daftar seluruh kode yang memiliki batch kedatangan susulan belum diaudit
  const pendingBatchGroups = useMemo(
    () => allCodeGroups.filter((g) => g.has_pending_batch),
    [allCodeGroups]
  );

  // Masukkan massal kode terdampak batch susulan ke Antrean Audit dengan petunjuk otomatis
  const handleBulkAddPendingToQueue = (groups: CodeAuditGroup[]) => {
    if (!groups || groups.length === 0) return;
    const payload = groups.map((g) => {
      const existingNote = queueMap[g.kode_produksi]?.catatan_petunjuk || '';
      const datesLabel =
        g.pending_batch_dates && g.pending_batch_dates.length > 0
          ? ` (${formatDatesSummary(g.pending_batch_dates)})`
          : '';
      const autoNote = `Batch susulan +${g.pending_batch_qty || 0} pcs${datesLabel} belum diaudit`;
      return {
        kode_produksi: g.kode_produksi,
        catatan_petunjuk: existingNote || autoNote,
      };
    });
    handleAddMultipleToQueue(payload);
    setFilterStatus('uncounted');
    setIsMultiBatchScannerOpen(false);
    onShowToast(`${payload.length} kode batch susulan berhasil dimasukkan ke Antrean Audit!`, 'success');
  };

  // Auto-Gabung & Simpan Massal untuk kode yang batch susulannya sudah dipastikan klop
  const handleBulkAutoMergePendingGroups = async (
    groups: CodeAuditGroup[],
    onProgress: (current: number, total: number, activeCode: string) => void
  ): Promise<{ successCount: number; failedCodes: string[] }> => {
    let successCount = 0;
    const failedCodes: string[] = [];
    const nowIso = new Date().toISOString();
    const effectiveAuditor = auditorName || session?.username || 'Auditor Fisik';

    for (let idx = 0; idx < groups.length; idx++) {
      const group = groups[idx];
      onProgress(idx + 1, groups.length, group.kode_produksi);
      try {
        const nextRound = (group.last_round || 0) + 1;
        const prevRec = recountAuditMap[group.kode_produksi];
        const auditVarAsliMap = new Map<string, number>();
        if (Array.isArray(prevRec?.variants)) {
          prevRec.variants.forEach((av: any) => {
            const avKey = `${av.warna || '-'}_${av.size || '-'}`;
            if (av.qty_asli !== undefined && av.qty_asli !== null) {
              auditVarAsliMap.set(avKey, Number(av.qty_asli) || 0);
            }
          });
        }

        // Susun rincian varian + hitung target gabungan (audit lama + qty batch baru)
        const varMap = new Map<
          string,
          { warna: string; size: string; qtyAsli: number; auditedFisik: number | null; unauditedQty: number; note: string }
        >();
        group.items.forEach((it) => {
          const w = it.warna || '-';
          const s = it.size || '-';
          const key = `${w}_${s}`;
          const q = Number(it.qty) || 0;
          const hasRec = it.recount_qty !== undefined && it.recount_qty !== null;
          if (!varMap.has(key)) {
            varMap.set(key, {
              warna: w,
              size: s,
              qtyAsli: 0,
              auditedFisik: hasRec ? Number(it.recount_qty) : null,
              unauditedQty: 0,
              note: it.recount_notes || '',
            });
          }
          const entry = varMap.get(key)!;
          entry.qtyAsli += q;
          if (hasRec) entry.auditedFisik = Number(it.recount_qty);
          else if (q > 0) entry.unauditedQty += q;
        });

        varMap.forEach((entry, key) => {
          if (entry.unauditedQty === 0 && auditVarAsliMap.has(key)) {
            const prevAsli = auditVarAsliMap.get(key)!;
            if (entry.qtyAsli > prevAsli) entry.unauditedQty = entry.qtyAsli - prevAsli;
          }
        });

        const mergedByKey = new Map<string, number>();
        let totalAsli = 0;
        let totalFisik = 0;
        const variantsPayload: Array<{
          warna: string;
          size: string;
          qty_asli: number;
          qty_fisik: number;
          selisih: number;
          status: string;
          note: string;
        }> = [];
        const detailRecords: PenerimaanRecountLogDetailItem[] = [];

        const arrivalDates = Array.from(group.distinct_dates || []);
        const arrivalDatesInfo = formatDatesSummary(arrivalDates);
        const pendingDatesLabel =
          group.pending_batch_dates && group.pending_batch_dates.length > 0
            ? formatDatesSummary(group.pending_batch_dates)
            : '';
        const mergeNote = `Auto-gabung batch susulan +${group.pending_batch_qty || 0} pcs${pendingDatesLabel ? ` (${pendingDatesLabel})` : ''}`;

        varMap.forEach((v, key) => {
          const mergedFisik =
            v.unauditedQty > 0
              ? (v.auditedFisik !== null ? v.auditedFisik : 0) + v.unauditedQty
              : v.auditedFisik !== null
              ? v.auditedFisik
              : v.qtyAsli;
          mergedByKey.set(key, mergedFisik);
          totalAsli += v.qtyAsli;
          totalFisik += mergedFisik;
          const sel = mergedFisik - v.qtyAsli;
          const st = sel === 0 ? 'MATCH' : sel < 0 ? 'KURANG' : 'LEBIH';
          variantsPayload.push({
            warna: v.warna,
            size: v.size,
            qty_asli: v.qtyAsli,
            qty_fisik: mergedFisik,
            selisih: sel,
            status: st,
            note: v.note || mergeNote,
          });
          detailRecords.push({
            kode_produksi: group.kode_produksi,
            nama_produk: group.nama_produk,
            warna: v.warna,
            size: v.size,
            tanggal_penerimaan: group.items[0]?.tanggal_penerimaan || auditDate,
            qty_sebelumnya: v.qtyAsli,
            qty_fisik: mergedFisik,
            selisih: sel,
            catatan: v.note || mergeNote,
          });
        });

        // 1. Update seluruh baris penerimaan_produksi pada kode ini
        const updatedItems: PenerimaanProduksiItem[] = group.items.map((it) => {
          const key = `${it.warna || '-'}_${it.size || '-'}`;
          const fisikVal = mergedByKey.get(key) ?? (Number(it.qty) || 0);
          const sel = fisikVal - (Number(it.qty) || 0);
          return {
            ...it,
            qty: it.qty,
            recount_qty: fisikVal,
            recount_selisih: sel,
            recount_status: sel === 0 ? 'MATCH' : sel < 0 ? 'KURANG' : 'LEBIH',
            recount_round: nextRound,
            recount_notes: it.recount_notes || mergeNote,
            recount_auditor: effectiveAuditor,
            recount_updated_at: nowIso,
          };
        });

        await updatePenerimaanProduksiItemsInSupabase(updatedItems);

        // 2. Simpan Recount Audit Record (beserta audited_dates lengkap) & Log Riwayat
        const totalSelisih = totalFisik - totalAsli;
        const finalStatus = totalSelisih === 0 ? 'MATCH' : totalSelisih < 0 ? 'KURANG' : 'LEBIH';
        const prevHistory = Array.isArray(prevRec?.history) ? [...prevRec.history] : [];
        if (prevRec && prevRec.total_fisik !== undefined && Number(prevRec.round || 1) !== nextRound) {
          prevHistory.push({
            round: prevRec.round || 1,
            tanggal_audit: prevRec.tanggal_audit,
            total_asli: prevRec.total_asli,
            total_fisik: prevRec.total_fisik,
            total_selisih: prevRec.total_selisih,
            status: prevRec.status,
            auditor: prevRec.auditor,
            catatan: prevRec.catatan,
            updated_at: prevRec.updated_at,
            variants: prevRec.variants,
          });
        }

        const newRecord = {
          kode_produksi: group.kode_produksi,
          tanggal_audit: auditDate,
          total_asli: totalAsli,
          total_fisik: totalFisik,
          total_selisih: totalSelisih,
          status: finalStatus,
          round: nextRound,
          auditor: effectiveAuditor,
          catatan: mergeNote,
          updated_at: nowIso,
          audited_dates: arrivalDates,
          history: prevHistory,
          variants: variantsPayload,
        };

        await saveRecountAuditRecord(newRecord);
        setRecountAuditMap((prev) => ({ ...prev, [group.kode_produksi]: newRecord }));

        await savePenerimaanRecountLog({
          id: `recount_${normalizeProductCode(group.kode_produksi)}_r${nextRound}_${Date.now()}`,
          round: nextRound,
          tanggal_audit: auditDate,
          auditor: effectiveAuditor,
          kode_produksi: group.kode_produksi,
          total_sebelumnya: totalAsli,
          total_fisik: totalFisik,
          total_selisih: totalSelisih,
          general_notes: mergeNote,
          details: detailRecords,
        }).catch(() => {});

        // 3. Push delta ke Master Google Sheet
        const deltaItems: MasterRecountDeltaItem[] = variantsPayload.map((v) => ({
          kode_produksi: group.kode_produksi,
          warna: v.warna,
          size: v.size,
          qty_asli: v.qty_asli,
          qty_fisik: v.qty_fisik,
          selisih: v.selisih,
          status: v.status,
          round: nextRound,
          auditor: effectiveAuditor,
          catatan: v.note,
          tanggal_kedatangan_info: arrivalDatesInfo,
          updated_at: nowIso,
        }));

        await pushMasterRecountDeltaToGoogleSheet({
          activeTab: group.kategori === 'Kargo' ? 'Kargo' : 'CMT',
          kode_produksi: group.kode_produksi,
          tanggal_hitung: auditDate,
          items: deltaItems,
        }).catch(() => {});

        successCount++;
      } catch (err) {
        console.error(`Gagal auto-gabung ${group.kode_produksi}:`, err);
        failedCodes.push(group.kode_produksi);
      }
    }

    await (onRefreshData as any)(true);
    if (failedCodes.length === 0) {
      onShowToast(
        `${successCount} kode berhasil digabungkan (batch susulan) & tersinkron ke Google Sheet!`,
        'success'
      );
    } else {
      onShowToast(
        `Selesai: ${successCount} berhasil, ${failedCodes.length} gagal (${failedCodes.join(', ')}).`,
        'warning'
      );
    }
    return { successCount, failedCodes };
  };

  // Re-Sync Master Google Sheet agar formula baru (Parsial / BELUM LENGKAP) langsung membersihkan false-alarm
  const handleBulkResyncMasterSheetForPending = async (
    categories: Array<'Kargo' | 'CMT'>,
    onProgress: (msg: string) => void
  ) => {
    try {
      for (const cat of categories) {
        onProgress(`Menyinkronkan Master Sheet ${cat} ke Google Spreadsheet...`);
        const catItems = penerimaanItems.filter((it) => {
          const isKargo = String(it.kategori || '').toLowerCase().includes('kargo');
          return cat === 'Kargo' ? isKargo : !isKargo;
        });
        if (catItems.length === 0) continue;
        await pushPenerimaanProduksiToGoogleSheet({
          items: catItems,
          activeTab: cat,
        });
      }
      onShowToast(
        `Master Google Sheet (${categories.join(' & ')}) berhasil di-sync! False-alarm selisih parsial telah dibersihkan.`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal Re-Sync Master Sheet:', err);
      onShowToast(err?.message || 'Gagal Re-Sync Master Sheet.', 'error');
    }
  };

  // Modal multiple selection handlers
  const handleTogglePickerCode = (code: string) => {
    const next = new Set(selectedPickerCodes);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
      // Pre-fill note from existing if any
      if (!pickerCodeNotes[code] && queueMap[code]?.catatan_petunjuk) {
        setPickerCodeNotes((prev) => ({
          ...prev,
          [code]: queueMap[code]?.catatan_petunjuk || '',
        }));
      }
    }
    setSelectedPickerCodes(next);
  };

  const handleSelectAllFilteredInPicker = () => {
    const next = new Set(selectedPickerCodes);
    pickerFilteredCodes.forEach((g) => next.add(g.kode_produksi));
    setSelectedPickerCodes(next);
  };

  const handleDeselectAllInPicker = () => {
    setSelectedPickerCodes(new Set());
  };

  const handleConfirmAddSelectedToQueue = () => {
    if (selectedPickerCodes.size === 0) {
      onShowToast('Pilih setidaknya 1 kode untuk dimasukkan ke antrian.', 'warning');
      return;
    }

    const payload = Array.from(selectedPickerCodes).map((code) => ({
      kode_produksi: code,
      catatan_petunjuk: pickerCodeNotes[code]?.trim() || '',
    }));

    handleAddMultipleToQueue(payload);
    // Otomatis arahkan filter ke 'all' dan cari kode yang baru ditambahkan agar langsung terlihat
    setFilterStatus('all');
    if (payload.length === 1) {
      setSearchQuery(payload[0].kode_produksi);
    } else {
      setSearchQuery('');
    }
    onShowToast(`${payload.length} kode berhasil dimasukkan ke antrian hitung ulang!`, 'success');
    setIsPickerModalOpen(false);
    setSelectedPickerCodes(new Set());
    setPickerCodeNotes({});
  };

  return (
    <div className="space-y-4">
      {/* ========================================================
          1. STATS METRICS & KPI CARDS (TERPILIH DI ANTRIAN)
          ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {/* Total Kode Terpilih */}
        <button
          type="button"
          onClick={() => {
            setFilterStatus('all');
            setActiveMode('queue');
          }}
          className={`p-2.5 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            filterStatus === 'all' && activeMode === 'queue'
              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold opacity-75">Total Antrian</span>
            <Layers className="w-3.5 h-3.5 opacity-60 shrink-0" />
          </div>
          <div className="text-lg sm:text-2xl font-extrabold mt-0.5 tabular-nums">{metrics.total}</div>
        </button>

        {/* Belum Dihitung */}
        <button
          type="button"
          onClick={() => {
            setFilterStatus('uncounted');
            setActiveMode('queue');
          }}
          className={`p-2.5 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            filterStatus === 'uncounted' && activeMode === 'queue'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold opacity-75">Belum Dihitung</span>
            <Clock className={`w-3.5 h-3.5 shrink-0 ${filterStatus === 'uncounted' && activeMode === 'queue' ? 'text-white' : 'text-amber-500'}`} />
          </div>
          <div className={`text-lg sm:text-2xl font-extrabold mt-0.5 tabular-nums ${
            filterStatus === 'uncounted' && activeMode === 'queue' ? 'text-white' : 'text-amber-600 dark:text-amber-400'
          }`}>
            {metrics.uncounted}
          </div>
        </button>

        {/* Ada Selisih */}
        <button
          type="button"
          onClick={() => {
            setFilterStatus('diff');
            setActiveMode('queue');
          }}
          className={`p-2.5 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            filterStatus === 'diff' && activeMode === 'queue'
              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold opacity-75">Ada Selisih</span>
            <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${filterStatus === 'diff' && activeMode === 'queue' ? 'text-white' : 'text-rose-500'}`} />
          </div>
          <div className={`text-lg sm:text-2xl font-extrabold mt-0.5 tabular-nums ${
            filterStatus === 'diff' && activeMode === 'queue' ? 'text-white' : 'text-rose-600 dark:text-rose-400'
          }`}>
            {metrics.diff}
          </div>
        </button>

        {/* Selesai / Klop */}
        <button
          type="button"
          onClick={() => {
            setFilterStatus('match');
            setActiveMode('queue');
          }}
          className={`p-2.5 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            filterStatus === 'match' && activeMode === 'queue'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-semibold opacity-75">Klop (Match)</span>
            <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${filterStatus === 'match' && activeMode === 'queue' ? 'text-white' : 'text-emerald-500'}`} />
          </div>
          <div className={`text-lg sm:text-2xl font-extrabold mt-0.5 tabular-nums ${
            filterStatus === 'match' && activeMode === 'queue' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            {metrics.match}
          </div>
        </button>
      </div>

      {/* ========================================================
          2. VIEW ROUTER: QUEUE BOARD vs WORKSPACE LEMBAR KERJA
          ======================================================== */}
      {activeMode === 'queue' ? (
        /* ========================================================
            MODE 1: ANTRIAN AUDIT & DAFTAR PEKERJAAN
            ======================================================== */
        <div className="space-y-3">
          {/* Live Alert Bar: Batch Kedatangan Susulan Terdeteksi */}
          {pendingBatchGroups.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-800 rounded-2xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 text-xs text-amber-950 dark:text-amber-100">
                  <strong className="font-bold">
                    {pendingBatchGroups.length} kode memiliki batch kedatangan susulan belum diaudit
                  </strong>{' '}
                  <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                    (+{pendingBatchGroups.reduce((s, g) => s + (g.pending_batch_qty || 0), 0)} pcs)
                  </span>
                  <span className="hidden md:inline text-amber-800/90 dark:text-amber-200/80">
                    {' '}— mis. {pendingBatchGroups.slice(0, 3).map((g) => g.kode_produksi).join(', ')}
                    {pendingBatchGroups.length > 3 ? `, +${pendingBatchGroups.length - 3} lainnya` : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMultiBatchScannerOpen(true)}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition cursor-pointer shadow-xs"
              >
                Cek &amp; Perbaiki ({pendingBatchGroups.length})
              </button>
            </div>
          )}

          {/* Compact Toolbar Antrian */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xs space-y-2.5">
            {/* Row 1: Search + 1 Primary CTA + Secondary/Overflow */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari kode, nama produk, petugas, petunjuk..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-h-[42px] pl-9 pr-9 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Single Primary CTA */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPickerCodes(new Set());
                    setPickerCodeNotes({});
                    setIsPickerModalOpen(true);
                  }}
                  className="flex-1 sm:flex-initial min-h-[42px] px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <ListPlus className="w-4 h-4" />
                  <span>Panggil Kode</span>
                </button>

                {/* Desktop Secondary Neutral Buttons */}
                <button
                  type="button"
                  onClick={() => setIsMultiBatchScannerOpen(true)}
                  className="hidden lg:inline-flex min-h-[42px] px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold items-center gap-1.5 transition cursor-pointer"
                  title="Pindai & perbaiki seluruh kode dengan batch kedatangan susulan"
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${pendingBatchGroups.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                  <span>Cek Susulan{pendingBatchGroups.length > 0 ? ` (${pendingBatchGroups.length})` : ''}</span>
                </button>

                <button
                  type="button"
                  onClick={handleBatchRePushToSheet}
                  disabled={isBatchSyncing || isSyncingSheet || (metrics.total - metrics.uncounted === 0)}
                  className="hidden lg:inline-flex min-h-[42px] px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-45 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold items-center gap-1.5 transition cursor-pointer"
                  title="Kirim ulang semua hasil hitung ulang ke Google Sheet"
                >
                  <CloudUpload className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${isBatchSyncing ? 'animate-bounce' : ''}`} />
                  <span>
                    {isBatchSyncing
                      ? `Re-Push (${batchSyncProgress?.current || 0}/${batchSyncProgress?.total || 0})`
                      : `Re-Push (${metrics.total - metrics.uncounted})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setIsSyncingCloudQueue(true);
                      const cloudAuditMap = await fetchRecountAuditMapFromCloud();
                      if (cloudAuditMap && typeof cloudAuditMap === 'object') {
                        setRecountAuditMap(cloudAuditMap);
                      }
                      const q = await fetchPenerimaanRecountQueueFromSupabase();
                      if (q && typeof q === 'object') setQueueMap(q);
                      await (onRefreshData as any)(true);
                      onShowToast('Sinkronisasi Cloud berhasil.', 'success');
                    } catch (err) {
                      console.error('Gagal sinkron:', err);
                      onShowToast('Gagal sinkronisasi data Cloud', 'error');
                    } finally {
                      setIsSyncingCloudQueue(false);
                    }
                  }}
                  disabled={isSyncingCloudQueue}
                  className="hidden lg:inline-flex min-h-[42px] px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold items-center gap-1.5 transition cursor-pointer"
                  title="Tarik hasil hitung ulang & antrian terbaru dari Cloud"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloudQueue ? 'animate-spin' : ''}`} />
                  <span>{isSyncingCloudQueue ? 'Sync...' : 'Sync Cloud'}</span>
                </button>

                {/* Mobile Overflow Menu for Re-Push & Sync */}
                <button
                  type="button"
                  onClick={() => setIsAuditMenuOpen(true)}
                  aria-label="Menu utilitas audit"
                  className="lg:hidden min-h-[42px] min-w-[42px] px-2.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center transition cursor-pointer shrink-0"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Batch Re-Push Live Progress Banner */}
            {isBatchSyncing && batchSyncProgress && (
              <div className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl p-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CloudUpload className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-bounce shrink-0" />
                  <div className="min-w-0 text-xs">
                    <div className="font-bold text-indigo-950 dark:text-indigo-100 truncate">
                      Mengirim ke Sheet ({batchSyncProgress.current}/{batchSyncProgress.total})
                    </div>
                    <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-mono truncate">
                      #{batchSyncProgress.activeCode}
                    </div>
                  </div>
                </div>
                <div className="w-24 sm:w-36 bg-indigo-200 dark:bg-indigo-900 h-2 rounded-full overflow-hidden shrink-0">
                  <div
                    className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.round((batchSyncProgress.current / batchSyncProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Row 2: Horizontal-Swipe Status Filter + Compact Kategori & Sort Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-nowrap">
                {[
                  { id: 'all', label: `Semua (${metrics.total})` },
                  { id: 'uncounted', label: `Belum (${metrics.uncounted})` },
                  { id: 'diff', label: `Selisih (${metrics.diff})` },
                  { id: 'match', label: `Klop (${metrics.match})` },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setFilterStatus(st.id as any)}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 whitespace-nowrap ${
                      filterStatus === st.id
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:flex items-center gap-1.5 shrink-0">
                <select
                  value={filterKategori}
                  onChange={(e) => setFilterKategori(e.target.value)}
                  aria-label="Filter kategori"
                  className="min-h-[36px] px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="Semua">Semua Kategori</option>
                  <option value="Lokal CMT">Lokal CMT</option>
                  <option value="Kargo">Kargo</option>
                </select>

                <select
                  value={sortOrder}
                  onChange={(e) => handleSortChange(e.target.value as RecountQueueSortOrder)}
                  aria-label="Urutkan antrian"
                  className="min-h-[36px] px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="date_asc">Terlama ke Terbaru</option>
                  <option value="date_desc">Terbaru ke Terlama</option>
                  <option value="priority">Prioritas Selisih</option>
                  <option value="diff_desc">Selisih Terbanyak</option>
                  <option value="code_asc">Kode (A - Z)</option>
                  <option value="code_desc">Kode (Z - A)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Antrian List / Cards */}
          {filteredQueue.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-slate-400 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Scale className="w-6 h-6" />
              </div>
              <div className="max-w-sm mx-auto space-y-1">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {codeGroups.length === 0
                    ? 'Belum ada kode di antrian audit'
                    : 'Tidak ada kode yang sesuai filter'}
                </p>
                <p className="text-xs text-slate-500">
                  {codeGroups.length === 0
                    ? 'Tambahkan satu atau beberapa kode produksi ke antrian hitung ulang.'
                    : 'Ubah kata kunci pencarian atau status filter.'}
                </p>
              </div>

              {codeGroups.length === 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPickerCodes(new Set());
                      setPickerCodeNotes({});
                      setIsPickerModalOpen(true);
                    }}
                    className="min-h-[42px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <ListPlus className="w-4 h-4" />
                    <span>Panggil Kode ke Antrian</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredQueue.map((item) => {
                return (
                  <div
                    key={item.kode_produksi}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl overflow-hidden transition shadow-xs flex flex-col justify-between ${
                      item.has_diff
                        ? 'border-rose-200 dark:border-rose-900/60'
                        : item.is_counted
                        ? 'border-emerald-200 dark:border-emerald-900/50'
                        : 'border-slate-200/90 dark:border-slate-800'
                    }`}
                  >
                    <div className="p-3.5 space-y-2.5">
                      {/* Top Bar: Thumbnail + Code + Clean Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {item.photo_url ? (
                            <img
                              src={item.photo_url}
                              alt={item.kode_produksi}
                              className="w-11 h-11 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-zoom-in shrink-0"
                              referrerPolicy="no-referrer"
                              onClick={() =>
                                onOpenLightbox &&
                                onOpenLightbox({
                                  url: item.photo_url!,
                                  title: `Kode Produksi: ${item.kode_produksi}`,
                                  subtitle: item.nama_produk,
                                })
                              }
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                                #{item.kode_produksi}
                              </span>
                              {(item.latest_date || item.earliest_date) && (
                                <span
                                  className="text-[11px] font-mono text-slate-500 dark:text-slate-400"
                                  title={`Tanggal Kedatangan: ${formatDatesSummary(item.distinct_dates)}`}
                                >
                                  · {formatDatesSummary(item.distinct_dates)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                              {item.nama_produk || 'Produk Tanpa Nama'}
                            </p>
                            <span className="block text-[11px] text-slate-500 truncate">
                              {item.kategori}{item.vendor_up ? ` · UP ${item.vendor_up}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge (Clean, No Emojis) */}
                        <div className="shrink-0">
                          {item.has_pending_batch ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700 tabular-nums">
                              Susulan +{item.pending_batch_qty || 0}
                            </span>
                          ) : !item.is_counted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                              Belum
                            </span>
                          ) : item.total_selisih === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                              Klop
                            </span>
                          ) : (item.total_selisih || 0) < 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 tabular-nums">
                              Kurang {item.total_selisih}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 tabular-nums">
                              Lebih +{item.total_selisih}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hairline 3-Column Comparison Strip */}
                      <div className="grid grid-cols-3 divide-x divide-slate-200/80 dark:divide-slate-800 bg-slate-50/80 dark:bg-slate-800/50 py-2 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                        <div className="px-1">
                          <span className="text-[10px] text-slate-400 font-medium block">Awal</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">{item.total_asli}</span>
                        </div>
                        <div className="px-1">
                          <span className="text-[10px] text-slate-400 font-medium block">Fisik</span>
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                            {item.total_fisik !== null ? item.total_fisik : '—'}
                          </span>
                        </div>
                        <div className="px-1">
                          <span className="text-[10px] text-slate-400 font-medium block">Selisih</span>
                          <span
                            className={`text-xs font-bold tabular-nums ${
                              item.total_selisih === null
                                ? 'text-slate-400'
                                : item.total_selisih === 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : item.total_selisih < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {item.total_selisih !== null
                              ? item.total_selisih > 0
                                ? `+${item.total_selisih}`
                                : item.total_selisih
                              : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Petunjuk Khusus */}
                      {item.catatan_petunjuk ? (
                        <button
                          type="button"
                          onClick={(e) => handlePromptEditCardNote(item.kode_produksi, e)}
                          className="w-full text-left px-2.5 py-2 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-xl text-[11px] flex items-start justify-between gap-2 cursor-pointer hover:border-amber-300 transition"
                        >
                          <span className="text-amber-900 dark:text-amber-200 font-medium leading-snug break-words">
                            <strong className="font-bold">Petunjuk:</strong> {item.catatan_petunjuk}
                          </span>
                          <Edit3 className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handlePromptEditCardNote(item.kode_produksi, e)}
                          className="text-[11px] font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Tambah petunjuk</span>
                        </button>
                      )}

                      {/* Auditor Metadata */}
                      {item.last_auditor && (
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate">
                            {item.last_auditor}
                            {item.last_round ? ` · Putaran ${item.last_round}` : ''}
                          </span>
                          {item.last_audit_date && (
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {new Date(item.last_audit_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Clean 2-Control Native Footer (1 Primary CTA + Action Sheet) */}
                    <div className="px-3 py-2.5 bg-slate-50/70 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenWorkspace(item.kode_produksi)}
                        className="flex-1 min-h-[40px] py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>{item.is_counted ? 'Re-Audit Fisik' : 'Hitung Sekarang'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActionSheetQueueItem(item)}
                        aria-label="Menu aksi antrian"
                        className="min-h-[40px] min-w-[40px] px-2.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center transition cursor-pointer shrink-0"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================
            MODE 2: LEMBAR KERJA VERIFIKASI FISIK (WORKSPACE FOKUS)
            ======================================================== */
        activeGroup && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3 sm:p-5 shadow-xs space-y-4 animate-in fade-in duration-150">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  isWorkspaceDirtyRef.current = false;
                  setSelectedCode('');
                  setActiveMode('queue');
                }}
                className="min-h-[38px] px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Antrian</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrintPhysicalForm}
                  className="min-h-[38px] px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
                  title="Cetak Lembar Kerja Fisik"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cetak Form</span>
                </button>

                <button
                  type="button"
                  disabled={isSyncingSheet}
                  onClick={(e) => handleDirectRePushToSheet(activeGroup, e)}
                  className="min-h-[38px] px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-indigo-200 dark:border-indigo-800"
                  title="Kirim ulang data hitung fisik kode ini ke Google Sheet"
                >
                  <CloudUpload className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-bounce' : ''}`} />
                  <span>{isSyncingSheet ? 'Mengirim...' : 'Re-Push'}</span>
                </button>
              </div>
            </div>

            {/* Header Kode & Metadata Produk */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/40 p-3 sm:p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                {activeGroup.photo_url ? (
                  <img
                    src={activeGroup.photo_url}
                    alt={activeGroup.kode_produksi}
                    className="w-14 h-14 rounded-xl object-cover bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-zoom-in shrink-0"
                    referrerPolicy="no-referrer"
                    onClick={() =>
                      onOpenLightbox &&
                      onOpenLightbox({
                        url: activeGroup.photo_url!,
                        title: `Kode: ${activeGroup.kode_produksi}`,
                        subtitle: activeGroup.nama_produk,
                      })
                    }
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm sm:text-base font-bold text-indigo-700 dark:text-indigo-300">
                      #{activeGroup.kode_produksi}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md">
                      {activeGroup.kategori}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 line-clamp-1">
                    {activeGroup.nama_produk || 'Produk Tanpa Nama'}
                  </h3>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Awal: <strong className="text-slate-800 dark:text-slate-200">{activeGroup.total_asli} pcs</strong>
                    {activeGroup.vendor_up ? ` · UP ${activeGroup.vendor_up}` : ''}
                  </p>
                </div>
              </div>

              {/* Form Metadata Auditor & Tanggal */}
              <div className="grid grid-cols-2 gap-2 w-full lg:w-auto">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Tanggal Audit</label>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => {
                      isWorkspaceDirtyRef.current = true;
                      setAuditDate(e.target.value);
                    }}
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">Auditor</label>
                  <input
                    type="text"
                    value={auditorName}
                    onChange={(e) => {
                      isWorkspaceDirtyRef.current = true;
                      setAuditorName(e.target.value);
                    }}
                    placeholder="Nama Auditor..."
                    className="w-full min-h-[40px] px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Instruction Note Banner in Workspace */}
            {activeGroup.catatan_petunjuk ? (
              <div className="px-3 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400 block">
                    Petunjuk Khusus
                  </span>
                  <span className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                    {activeGroup.catatan_petunjuk}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => handlePromptEditCardNote(activeGroup.kode_produksi, e)}
                  className="text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline shrink-0 cursor-pointer"
                >
                  Ubah
                </button>
              </div>
            ) : null}

            {/* Pending Follow-Up Batch Alert Banner (Multi-Batch Guard) */}
            {activeGroup.has_pending_batch ? (
              <div className="px-3.5 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-800 dark:text-amber-300 block">
                    Kedatangan Batch Susulan Terdeteksi (+{activeGroup.pending_batch_qty || 0} pcs)
                  </span>
                  <p className="text-xs text-amber-950 dark:text-amber-100">
                    Audit sebelumnya (Rev {activeGroup.last_round || 1}) hanya mencakup{' '}
                    <strong className="font-mono">{activeGroup.total_fisik ?? 0} pcs</strong>
                    {activeGroup.audited_dates && activeGroup.audited_dates.length > 0
                      ? ` (${formatDatesSummary(activeGroup.audited_dates)})`
                      : ''}
                    . Batch baru{' '}
                    <strong className="font-mono">+{activeGroup.pending_batch_qty || 0} pcs</strong>
                    {activeGroup.pending_batch_dates && activeGroup.pending_batch_dates.length > 0
                      ? ` (${formatDatesSummary(activeGroup.pending_batch_dates)})`
                      : ''}{' '}
                    belum masuk hitungan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleMergePendingBatchQty}
                  className="min-h-[38px] px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 transition cursor-pointer shadow-sm"
                >
                  + Gabungkan Batch Baru (+{activeGroup.pending_batch_qty || 0})
                </button>
              </div>
            ) : null}

            {/* Quick Helper Actions */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Verifikasi Fisik ({activeVariants.length} Varian)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleQuickFillSameAsOriginal}
                  className="min-h-[36px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                >
                  Set Sesuai Awal
                </button>
                <button
                  type="button"
                  onClick={handleResetInputs}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            {/* MOBILE NATIVE RECOUNT CARDS (Zero Horizontal Scroll!) */}
            <div className="md:hidden space-y-2.5">
              {activeVariants.map((v, idx) => {
                const key = `${v.warna}_${v.size}`;
                const inp = variantInputs[key] || { recountQty: null, note: '' };
                const isCustomEntered = inp.recountQty !== null;
                const selisih = isCustomEntered ? inp.recountQty - v.qty_asli : 0;

                return (
                  <div
                    key={key}
                    className={`rounded-2xl border p-3 space-y-2.5 ${
                      isCustomEntered
                        ? selisih === 0
                          ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/10'
                          : selisih < 0
                          ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10'
                          : 'border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/10'
                        : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">{idx + 1}.</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{v.warna}</span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono font-bold shrink-0">
                          {v.size}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 tabular-nums shrink-0 flex items-center gap-1.5">
                        {v.unaudited_qty > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold font-mono">
                            +{v.unaudited_qty} baru
                          </span>
                        )}
                        <span>
                          Awal: <strong className="text-slate-800 dark:text-slate-200">{v.qty_asli}</strong>
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <NumberInput
                          min={0}
                          allowEmpty
                          selectOnFocus
                          placeholder={`Fisik (awal ${v.qty_asli})`}
                          value={inp.recountQty !== null ? inp.recountQty : ''}
                          onStringValueChange={(raw) => {
                            const val = raw === '' ? null : parseInt(raw, 10);
                            isWorkspaceDirtyRef.current = true;
                            setVariantInputs((prev) => ({
                              ...prev,
                              [key]: {
                                recountQty: val !== null && !Number.isNaN(val) ? val : null,
                                note: prev[key]?.note || '',
                              },
                            }));
                          }}
                          className="w-full min-h-[44px] px-3 py-2 text-center font-mono font-bold text-base rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="min-w-[82px] text-center">
                        {isCustomEntered ? (
                          <div
                            className={`px-2.5 py-2 rounded-xl text-xs font-bold font-mono tabular-nums ${
                              selisih === 0
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : selisih < 0
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            }`}
                          >
                            {selisih === 0 ? 'Klop' : selisih > 0 ? `+${selisih}` : selisih}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Belum</span>
                        )}
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Catatan varian (opsional)..."
                      value={inp.note || ''}
                      onChange={(e) => {
                        const noteVal = e.target.value;
                        isWorkspaceDirtyRef.current = true;
                        setVariantInputs((prev) => ({
                          ...prev,
                          [key]: {
                            recountQty: prev[key]?.recountQty ?? null,
                            note: noteVal,
                          },
                        }));
                      }}
                      className="w-full min-h-[38px] text-xs px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 outline-none text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                );
              })}
            </div>

            {/* DESKTOP TABLE LEMBAR KERJA FISIK */}
            <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2.5 px-3 text-center w-12">No</th>
                    <th className="py-2.5 px-3">Warna</th>
                    <th className="py-2.5 px-3 text-center w-16">Size</th>
                    <th className="py-2.5 px-3 text-center w-24">Awal</th>
                    <th className="py-2.5 px-3 text-center w-36 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200">
                      Hitung Ulang
                    </th>
                    <th className="py-2.5 px-3 text-center w-24">Selisih</th>
                    <th className="py-2.5 px-3 text-center w-24">Status</th>
                    <th className="py-2.5 px-3">Catatan Varian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 font-medium">
                  {activeVariants.map((v, idx) => {
                    const key = `${v.warna}_${v.size}`;
                    const inp = variantInputs[key] || { recountQty: null, note: '' };
                    const isCustomEntered = inp.recountQty !== null;
                    const selisih = isCustomEntered ? (inp.recountQty - v.qty_asli) : 0;

                    return (
                      <tr key={key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-100">{v.warna}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold">{v.size}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                          <div>{v.qty_asli}</div>
                          {v.unaudited_qty > 0 && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[9px] font-bold">
                              +{v.unaudited_qty} baru
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center bg-indigo-50/20 dark:bg-indigo-950/15">
                          <NumberInput
                            min={0}
                            allowEmpty
                            selectOnFocus
                            placeholder={String(v.qty_asli)}
                            value={inp.recountQty !== null ? inp.recountQty : ''}
                            onStringValueChange={(raw) => {
                              const val = raw === '' ? null : parseInt(raw, 10);
                              isWorkspaceDirtyRef.current = true;
                              setVariantInputs((prev) => ({
                                ...prev,
                                [key]: {
                                  recountQty: val !== null && !Number.isNaN(val) ? val : null,
                                  note: prev[key]?.note || '',
                                },
                              }));
                            }}
                            className={`w-24 text-center font-mono font-bold text-xs py-1.5 px-2 rounded-lg border outline-none transition ${
                              isCustomEntered
                                ? selisih === 0
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-300'
                                  : selisih < 0
                                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-300'
                                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-300'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}
                          />
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold tabular-nums">
                          {isCustomEntered ? (
                            selisih === 0 ? (
                              <span className="text-emerald-600">0</span>
                            ) : selisih < 0 ? (
                              <span className="text-rose-600">{selisih}</span>
                            ) : (
                              <span className="text-blue-600">+{selisih}</span>
                            )
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isCustomEntered ? (
                            selisih === 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                Klop
                              </span>
                            ) : selisih < 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                Kurang
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                Lebih
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 text-[10px]">Belum</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            placeholder="Catatan varian..."
                            value={inp.note || ''}
                            onChange={(e) => {
                              const noteVal = e.target.value;
                              isWorkspaceDirtyRef.current = true;
                              setVariantInputs((prev) => ({
                                ...prev,
                                [key]: {
                                  recountQty: prev[key]?.recountQty ?? null,
                                  note: noteVal,
                                },
                              }));
                            }}
                            className="w-full text-xs py-1.5 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-700 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Metrics Comparison Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 dark:bg-slate-950 text-white p-3.5 sm:p-4 rounded-2xl border border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">SJ Diterima</span>
                <span className="text-base sm:text-xl font-bold font-mono tabular-nums">{workspaceSummary.totalAsli} pcs</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-amber-300 block">
                  {workspaceSummary.hasNota ? 'Qty Nota' : 'Nota Buyer'}
                </span>
                <span className="text-base sm:text-xl font-bold font-mono text-amber-300 tabular-nums">
                  {workspaceSummary.hasNota ? `${workspaceSummary.targetNota} pcs` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Fisik Hitung</span>
                <span className="text-base sm:text-xl font-bold font-mono text-blue-400 tabular-nums">{workspaceSummary.totalFisik} pcs</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Selisih vs {workspaceSummary.hasNota ? 'Nota' : 'SJ'}
                </span>
                <span
                  className={`text-base sm:text-xl font-extrabold font-mono tabular-nums ${
                    workspaceSummary.totalSelisih === 0
                      ? 'text-emerald-400'
                      : workspaceSummary.totalSelisih < 0
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {workspaceSummary.totalSelisih > 0
                    ? `+${workspaceSummary.totalSelisih}`
                    : workspaceSummary.totalSelisih}{' '}
                  pcs
                </span>
              </div>
            </div>

            {/* General Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Catatan Umum Audit (Opsional)
              </label>
              <textarea
                rows={2}
                value={generalNotes}
                onChange={(e) => {
                  isWorkspaceDirtyRef.current = true;
                  setGeneralNotes(e.target.value);
                }}
                placeholder="Riwayat reject, selisih kirim, atau catatan supervisor..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Save & Push Master Sheet Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 gap-2">
              <button
                type="button"
                onClick={() => setActiveMode('queue')}
                className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={isSavingAudit || isSyncingSheet}
                onClick={handleSaveAndAutoPush}
                className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                {isSavingAudit || isSyncingSheet ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isSyncingSheet ? 'Push Sheet...' : 'Menyimpan...'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Simpan &amp; Push Sheet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )
      )}

      {/* ========================================================
          3. MODAL: MULTIPLE CHOICE KODE + NOTES PER KODE
          ======================================================== */}
      {isPickerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/55 backdrop-blur-[2px] animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-2xl bg-rose-50 dark:bg-rose-950 text-rose-600">
                  <ListPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Pilih Kode Produksi ke Antrian (Multiple Choice)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Pilih satu atau beberapa kode kedatangan &amp; berikan petunjuk/catatan per kode
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPickerModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Batch Selection Bar */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5 bg-slate-50/50 dark:bg-slate-850/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Ketik kode produksi (misal: 26550) / nama produk / vendor UP..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  autoFocus
                />
              </div>

              {/* Batch Action Helpers */}
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500">
                    Terpilih:{' '}
                    <strong className="text-rose-600 font-black text-sm">
                      {selectedPickerCodes.size}
                    </strong>{' '}
                    kode
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Picker Sort Dropdown */}
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg text-xs font-bold shadow-2xs">
                    <ArrowUpDown className="w-3 h-3 text-rose-500" />
                    <select
                      value={pickerSortOrder}
                      onChange={(e) => setPickerSortOrder(e.target.value as RecountQueueSortOrder)}
                      className="bg-transparent text-slate-700 dark:text-slate-200 text-xs font-bold focus:outline-none cursor-pointer"
                    >
                      <option value="date_desc">📅 Kedatangan: Terbaru ➔ Terlama</option>
                      <option value="date_asc">📅 Kedatangan: Terlama ➔ Terbaru</option>
                      <option value="code_asc">🔤 Kode Produksi (A ➔ Z)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectAllFilteredInPicker}
                    className="text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-rose-600 underline cursor-pointer"
                  >
                    Pilih Semua ({pickerFilteredCodes.length})
                  </button>
                  {selectedPickerCodes.size > 0 && (
                    <button
                      type="button"
                      onClick={handleDeselectAllInPicker}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                    >
                      Batal Pilih
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* List of Available Codes with Checkboxes & Note Inputs */}
            <div className="p-3 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
              {pickerFilteredCodes.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-xs">Tidak ada kode yang cocok dengan pencarian "{pickerSearch}".</p>
                </div>
              ) : (
                pickerFilteredCodes.slice(0, 50).map((g) => {
                  const isChecked = selectedPickerCodes.has(g.kode_produksi);
                  const isAlreadyInQueue = queueMap.hasOwnProperty(g.kode_produksi);
                  const currentNote = pickerCodeNotes[g.kode_produksi] ?? (queueMap[g.kode_produksi]?.catatan_petunjuk || '');

                  return (
                    <div
                      key={g.kode_produksi}
                      className={`pt-2 pb-2 rounded-2xl transition border ${
                        isChecked
                          ? 'bg-rose-50/40 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 p-3'
                          : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2'
                      }`}
                    >
                      {/* Top Row: Checkbox, Code info, Thumbnail, Status */}
                      <div
                        onClick={() => handleTogglePickerCode(g.kode_produksi)}
                        className="flex items-start justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Checkbox */}
                          <div className="pt-0.5 text-rose-600">
                            {isChecked ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                            )}
                          </div>

                          {/* Thumbnail */}
                          {g.photo_url ? (
                            <img
                              src={g.photo_url}
                              alt={g.kode_produksi}
                              className="w-10 h-10 rounded-lg object-contain bg-slate-100 dark:bg-slate-800 border border-slate-200"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-sm font-black text-rose-600 dark:text-rose-400">
                                {g.kode_produksi}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                {g.kategori}
                              </span>
                              {(g.latest_date || g.earliest_date) && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  title={`Tanggal Kedatangan: ${formatDatesSummary(g.distinct_dates)}`}
                                >
                                  <CalendarDays className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                  <span>{formatDatesSummary(g.distinct_dates)}</span>
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 line-clamp-1">
                              {g.nama_produk || 'Produk Tanpa Nama'}
                            </p>
                            <span className="text-[10px] text-slate-400">
                              Total Hitung Awal: <strong>{g.total_asli} pcs</strong>
                              {g.vendor_up ? ` • UP: ${g.vendor_up}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Status Right Badge */}
                        <div className="text-right shrink-0">
                          {isAlreadyInQueue ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800 block">
                              Di Antrian {g.is_counted ? (g.total_selisih === 0 ? '(Klop)' : `(${g.total_selisih > 0 ? '+' : ''}${g.total_selisih})`) : ''}
                            </span>
                          ) : g.is_counted ? (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 block">
                              {g.total_selisih === 0 ? '✅ Match' : `⚠️ Selisih: ${g.total_selisih}`}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded block">
                              Tersedia
                            </span>
                          )}
                        </div>
                      </div>

                      {/* INLINE NOTE FIELD (WHEN SELECTED / EXPANDED) */}
                      {isChecked && (
                        <div className="mt-2.5 pt-2 border-t border-rose-100 dark:border-rose-900/40 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-rose-500 shrink-0" />
                          <input
                            type="text"
                            placeholder="Kasih petunjuk/catatan kode ini (misal: petunjuk kurang 23, cek jahitan)..."
                            value={currentNote}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPickerCodeNotes((prev) => ({
                                ...prev,
                                [g.kode_produksi]: val,
                              }));
                            }}
                            className="w-full text-xs font-semibold px-3 py-1.5 bg-white dark:bg-slate-850 border border-rose-200 dark:border-rose-800 rounded-xl text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-2xs"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Bottom Footer Actions */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsPickerModalOpen(false)}
                className="px-4 py-2 bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={selectedPickerCodes.size === 0}
                  onClick={handleConfirmAddSelectedToQueue}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    Masukkan ({selectedPickerCodes.size}) Kode ke Antrian
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          4. MODAL: RIWAYAT AUDIT LOG PUTARAN
          ======================================================== */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Riwayat Audit Fisik: {historyTargetCode}
                  </h3>
                  <p className="text-[11px] text-slate-500">Log putaran &amp; rincian hasil hitung ulang fisik gudang per varian</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {isLoadingHistory ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-rose-500" />
                  <p className="text-xs">Memuat catatan log audit...</p>
                </div>
              ) : historyLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-xs">Belum ada riwayat audit fisik yang tercatat untuk kode ini.</p>
                </div>
              ) : (
                <>
                  {historyLogs.length > 1 && (
                    <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-between flex-wrap gap-2">
                      <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                        🔄 Riwayat Multi-Putaran: Kode ini telah dihitung ulang sebanyak{' '}
                        <span className="font-black underline">{historyLogs.length}x Putaran</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                        Urutan: Putaran Terbaru (Atas) → Putaran Awal (Bawah)
                      </span>
                    </div>
                  )}
                  {historyLogs.map((log, idx) => {
                  // Resolve complete details list with robust multi-layer fallback
                  let detailsList = Array.isArray(log.details) && log.details.length > 0 ? log.details : [];

                  if (detailsList.length === 0 && recountAuditMap[historyTargetCode]?.variants) {
                    detailsList = recountAuditMap[historyTargetCode].variants.map((v: any) => ({
                      warna: v.warna || '-',
                      size: v.size || '-',
                      qty_sebelumnya: Number(v.qty_asli) || 0,
                      qty_fisik: Number(v.qty_fisik !== undefined ? v.qty_fisik : v.qty_asli) || 0,
                      selisih: Number(v.selisih) || 0,
                      catatan: v.note || v.catatan || '',
                    }));
                  }

                  if (detailsList.length === 0) {
                    const codeItems = penerimaanItems.filter(
                      (it) => (it.kode_produksi || '').trim().toUpperCase() === historyTargetCode.trim().toUpperCase()
                    );
                    if (codeItems.length > 0) {
                      const gMap = new Map<string, PenerimaanRecountLogDetailItem>();
                      codeItems.forEach((it) => {
                        const key = `${it.warna || '-'}_${it.size || '-'}`;
                        const prevQ = Number(it.qty) || 0;
                        const countQ = it.recount_qty !== undefined && it.recount_qty !== null ? Number(it.recount_qty) : prevQ;
                        if (!gMap.has(key)) {
                          gMap.set(key, {
                            warna: it.warna || '-',
                            size: it.size || '-',
                            qty_sebelumnya: 0,
                            qty_fisik: 0,
                            selisih: 0,
                            catatan: it.recount_notes,
                            kode_produksi: (log as any).kode_produksi || '',
                            tanggal_penerimaan: (log as any).tanggal_penerimaan || '',
                          });
                        }
                        const rec = gMap.get(key)!;
                        rec.qty_sebelumnya += prevQ;
                        rec.qty_fisik += countQ;
                        rec.selisih = rec.qty_fisik - rec.qty_sebelumnya;
                      });
                      detailsList = Array.from(gMap.values());
                    }
                  }

                  // Sort details by Color then Size order
                  const sortedDetails = [...detailsList].sort((a, b) => {
                    const colCmp = (a.warna || '').localeCompare(b.warna || '');
                    if (colCmp !== 0) return colCmp;
                    return getSizeWeight(a.size) - getSizeWeight(b.size);
                  });

                  const targetGroup = allCodeGroups.find(
                    (g) => normalizeProductCode(g.kode_produksi) === normalizeProductCode(historyTargetCode)
                  );
                  const auditRecForCode =
                    recountAuditMap[normalizeProductCode(historyTargetCode)] ||
                    recountAuditMap[historyTargetCode];
                  const roundNumber =
                    log.round ||
                    (historyLogs.length === 1
                      ? auditRecForCode?.round || targetGroup?.last_round || 1
                      : historyLogs.length - idx);
                  const prevRoundLog = idx < historyLogs.length - 1 ? historyLogs[idx + 1] : null;
                  const prevRoundNumber = prevRoundLog
                    ? prevRoundLog.round || historyLogs.length - (idx + 1)
                    : null;
                  const deltaVsPrevRound = prevRoundLog
                    ? Number(log.total_fisik) - Number(prevRoundLog.total_fisik)
                    : null;

                  // Map varian putaran sebelumnya untuk mendeteksi varian mana yang berubah di putaran ini
                  const prevVariantFisikMap = new Map<string, number>();
                  if (prevRoundLog && Array.isArray(prevRoundLog.details)) {
                    prevRoundLog.details.forEach((pd) => {
                      prevVariantFisikMap.set(
                        `${(pd.warna || '-').trim().toUpperCase()}_${(pd.size || '-').trim().toUpperCase()}`,
                        Number(pd.qty_fisik) || 0
                      );
                    });
                  }

                  const qtyNota =
                    targetGroup?.qty_nota !== undefined && targetGroup?.qty_nota !== null
                      ? Number(targetGroup.qty_nota)
                      : null;
                  const selisihVsAwal = Number(log.total_fisik) - Number(log.total_sebelumnya);
                  const selisihVsNota =
                    qtyNota !== null ? Number(log.total_fisik) - qtyNota : null;

                  return (
                    <div
                      key={log.id || idx}
                      className={`p-4 rounded-2xl border space-y-3 ${
                        idx === 0
                          ? 'bg-slate-50 dark:bg-slate-850 border-indigo-200 dark:border-indigo-800/70'
                          : 'bg-slate-50/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 font-mono text-[11px] font-black text-slate-800 dark:text-slate-200">
                            Sesi #{historyLogs.length - idx}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 font-mono text-[10px] font-black text-rose-700 dark:text-rose-300">
                            Putaran {roundNumber}
                          </span>
                          {idx === 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 font-sans text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                              TERBARU (AKTIF)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 font-sans text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              ARSIP PUTARAN {roundNumber}
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Tgl Audit: <strong>{log.tanggal_audit}</strong> &bull; Petugas: <strong className="text-rose-600">{log.auditor}</strong>
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {log.created_at ? new Date(log.created_at).toLocaleString('id-ID') : ''}
                        </span>
                      </div>

                      {/* Top Metrics Cards */}
                      <div
                        className={`grid ${
                          qtyNota !== null ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
                        } gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl text-center font-mono text-xs border border-slate-200 dark:border-slate-800`}
                      >
                        <div>
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">Hitung Awal (SJ)</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">{log.total_sebelumnya} pcs</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">Hitung Ulang Fisik</span>
                          <span className="font-black text-blue-600 dark:text-blue-400 text-sm">{log.total_fisik} pcs</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">Selisih vs Awal</span>
                          <span
                            className={`font-black text-sm ${
                              selisihVsAwal === 0
                                ? 'text-emerald-600'
                                : selisihVsAwal < 0
                                ? 'text-rose-600'
                                : 'text-blue-600'
                            }`}
                          >
                            {selisihVsAwal > 0 ? `+${selisihVsAwal}` : selisihVsAwal} pcs
                          </span>
                        </div>
                        {qtyNota !== null && selisihVsNota !== null && (
                          <div className="border-t sm:border-t-0 sm:border-l border-slate-100 dark:border-slate-800 pt-1.5 sm:pt-0 sm:pl-2">
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 block uppercase font-bold">
                              vs Nota ({qtyNota} pcs)
                            </span>
                            <span
                              className={`font-black text-sm ${
                                selisihVsNota === 0
                                  ? 'text-emerald-600'
                                  : selisihVsNota < 0
                                  ? 'text-rose-600'
                                  : 'text-blue-600'
                              }`}
                            >
                              {selisihVsNota > 0 ? `+${selisihVsNota}` : selisihVsNota} pcs
                            </span>
                          </div>
                        )}
                      </div>

                      {prevRoundLog && deltaVsPrevRound !== null && (
                        <div className="px-3 py-1.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/40 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            🔍 Perbandingan dengan <strong>Putaran {prevRoundNumber}</strong> ({prevRoundLog.auditor}:{' '}
                            <strong className="font-mono">{prevRoundLog.total_fisik} pcs</strong> → Putaran {roundNumber}:{' '}
                            <strong className="font-mono">{log.total_fisik} pcs</strong>)
                          </span>
                          <span
                            className={`font-mono font-black px-2 py-0.5 rounded ${
                              deltaVsPrevRound === 0
                                ? 'bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : deltaVsPrevRound > 0
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                            }`}
                          >
                            {deltaVsPrevRound === 0
                              ? 'Tetap (0 pcs)'
                              : `Δ ${deltaVsPrevRound > 0 ? `+${deltaVsPrevRound}` : deltaVsPrevRound} pcs dari Putaran ${prevRoundNumber}`}
                          </span>
                        </div>
                      )}

                      {targetGroup?.catatan_petunjuk && idx === 0 ? (
                        <p className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/70 dark:border-amber-800/40 font-medium">
                          📌 <strong>Petunjuk:</strong> {targetGroup.catatan_petunjuk}
                        </p>
                      ) : null}

                      {log.general_notes ? (
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 italic bg-slate-100/80 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                          Catatan Auditor: &quot;{log.general_notes}&quot;
                        </p>
                      ) : null}

                      {/* Complete Variant Breakdown Table */}
                      {sortedDetails.length > 0 ? (
                        <div className="border border-slate-200 dark:border-slate-750 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
                          <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                            <span>📋 Rincian Hitungan Fisik per Varian (Warna &amp; Size):</span>
                            <span>{sortedDetails.length} Varian</span>
                          </div>
                          <div className="overflow-x-auto max-h-64 overflow-y-auto">
                            <table className="w-full text-xs text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/60 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">
                                  <th className="py-2 px-2.5 text-center w-8">No</th>
                                  <th className="py-2 px-2.5">Warna</th>
                                  <th className="py-2 px-2.5 text-center w-14">Size</th>
                                  <th className="py-2 px-2.5 text-center w-20 text-slate-700 dark:text-slate-300">Dokumen</th>
                                  <th className="py-2 px-2.5 text-center w-24 font-black text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/20">Fisik</th>
                                  <th className="py-2 px-2.5 text-center w-16">Selisih</th>
                                  <th className="py-2 px-2.5 text-center w-20">Status</th>
                                  <th className="py-2 px-2.5 min-w-[100px]">Catatan</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                                {sortedDetails.map((d, dIdx) => {
                                  const isMatch = d.selisih === 0;
                                  const vKey = `${(d.warna || '-').trim().toUpperCase()}_${(d.size || '-').trim().toUpperCase()}`;
                                  const prevVarFisik = prevVariantFisikMap.has(vKey)
                                    ? prevVariantFisikMap.get(vKey)!
                                    : null;
                                  const varDeltaPrev =
                                    prevVarFisik !== null ? Number(d.qty_fisik) - prevVarFisik : null;

                                  return (
                                    <tr key={dIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                      <td className="py-1.5 px-2.5 text-center text-slate-400 font-sans text-[10px]">{dIdx + 1}</td>
                                      <td className="py-1.5 px-2.5 font-sans font-bold text-slate-800 dark:text-slate-200">{d.warna}</td>
                                      <td className="py-1.5 px-2.5 text-center font-bold">{d.size}</td>
                                      <td className="py-1.5 px-2.5 text-center text-slate-600 dark:text-slate-400">{d.qty_sebelumnya}</td>
                                      <td className="py-1.5 px-2.5 text-center font-black text-blue-600 dark:text-blue-400 bg-blue-50/20 dark:bg-blue-950/10">
                                        <span>{d.qty_fisik}</span>
                                        {varDeltaPrev !== null && varDeltaPrev !== 0 && (
                                          <span
                                            className={`ml-1 px-1 py-0.2 rounded text-[9px] font-bold ${
                                              varDeltaPrev > 0
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'
                                            }`}
                                            title={`Berubah dari Putaran ${prevRoundNumber} (${prevVarFisik} pcs → ${d.qty_fisik} pcs)`}
                                          >
                                            {varDeltaPrev > 0 ? `+${varDeltaPrev}` : varDeltaPrev}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1.5 px-2.5 text-center font-black">
                                        <span className={isMatch ? 'text-emerald-600' : d.selisih < 0 ? 'text-rose-600' : 'text-blue-600'}>
                                          {d.selisih > 0 ? `+${d.selisih}` : d.selisih}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-2.5 text-center">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-black ${
                                          isMatch 
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                                            : d.selisih < 0 
                                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' 
                                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                        }`}>
                                          {isMatch ? 'Klop' : d.selisih < 0 ? 'Kurang' : 'Lebih'}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-2.5 font-sans text-slate-500 text-[10px]">
                                        {d.catatan || '-'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          5. HIDDEN PRINT CONTAINER (DIRECT ISOLATED PRINT)
          ======================================================== */}
      <div ref={printContainerRef} style={{ display: 'none' }}>
        {activeGroup && (
          <div>
            <div className="header-box">
              <h2 style={{ fontSize: '15px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                LEMBAR KERJA VERIFIKASI FISIK KEDATANGAN
              </h2>
              <p style={{ fontSize: '10px', color: '#475569', margin: '3px 0 0 0' }}>
                WMS CHOCOCHIPS WAREHOUSE &bull; AUDIT KEDATANGAN BARANG GUDANG
              </p>
              <div style={{ marginTop: '8px', fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>Kode Produksi:</strong>{' '}
                  <span className="badge" style={{ backgroundColor: '#ffe4e6', color: '#be123c', fontSize: '13px' }}>
                    {activeGroup.kode_produksi}
                  </span>
                  <div style={{ marginTop: '2px' }}>
                    <strong>Produk:</strong> {activeGroup.nama_produk || '-'} ({activeGroup.kategori})
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Tanggal Cetak:</strong> {new Date().toLocaleDateString('id-ID')}</div>
                  <div><strong>Petugas:</strong> {auditorName || '................'}</div>
                </div>
              </div>

              {activeGroup.catatan_petunjuk && (
                <div className="note-box">
                  <strong>📌 Petunjuk Khusus:</strong> {activeGroup.catatan_petunjuk}
                </div>
              )}
            </div>

            <table>
              <thead>
                <tr>
                  <th style={{ width: '30px' }}>No</th>
                  <th>Warna</th>
                  <th style={{ width: '60px' }}>Size</th>
                  <th style={{ width: '90px' }}>Hitungan Awal</th>
                  <th style={{ width: '100px' }}>Qty Hitung Ulang</th>
                  <th style={{ width: '80px' }}>Selisih</th>
                  <th>Keterangan / Kondisi Barang</th>
                </tr>
              </thead>
              <tbody>
                {activeVariants.map((v, i) => (
                  <tr key={i}>
                    <td className="text-center">{i + 1}</td>
                    <td className="font-bold">{v.warna}</td>
                    <td className="text-center font-bold">{v.size}</td>
                    <td className="text-center font-bold">{v.qty_asli}</td>
                    <td className="text-center" style={{ backgroundColor: '#f8fafc' }}></td>
                    <td className="text-center"></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                  <td colSpan={3} className="text-right">TOTAL PCS:</td>
                  <td className="text-center">{activeGroup.total_asli}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            <div className="sign-box">
              <div>
                Petugas Penghitung Fisik
                <div className="sign-line"></div>
                ( {auditorName || '.......................'} )
              </div>
              <div>
                Supervisor / Kepala Gudang
                <div className="sign-line"></div>
                ( ....................... )
              </div>
            </div>
          </div>
        )}
      </div>

      {/* NATIVE ACTION SHEET: UTILITAS AUDIT */}
      <ProduksiActionSheet
        isOpen={isAuditMenuOpen}
        onClose={() => setIsAuditMenuOpen(false)}
        title="Utilitas Audit Hitung Ulang"
        subtitle="Sinkronisasi data audit ke Google Sheet & Cloud"
        groups={[
          {
            title: 'Sinkronisasi',
            items: [
              {
                id: 'repush-all',
                label: isBatchSyncing
                  ? `Re-Push (${batchSyncProgress?.current || 0}/${batchSyncProgress?.total || 0})`
                  : `Re-Push Semua ke Sheet (${metrics.total - metrics.uncounted})`,
                description: 'Kirim ulang semua hasil hitung fisik antrian ke Master Sheet',
                icon: <CloudUpload className="w-4 h-4" />,
                tone: 'primary',
                disabled: isBatchSyncing || isSyncingSheet || (metrics.total - metrics.uncounted === 0),
                onClick: handleBatchRePushToSheet,
              },
              {
                id: 'sync-cloud',
                label: isSyncingCloudQueue ? 'Menyinkronkan...' : 'Sinkronkan Cloud',
                description: 'Tarik hasil audit & antrian terbaru dari Supabase',
                icon: <RefreshCw className={`w-4 h-4 ${isSyncingCloudQueue ? 'animate-spin' : ''}`} />,
                disabled: isSyncingCloudQueue,
                onClick: async () => {
                  try {
                    setIsSyncingCloudQueue(true);
                    const cloudAuditMap = await fetchRecountAuditMapFromCloud();
                    if (cloudAuditMap && typeof cloudAuditMap === 'object') {
                      setRecountAuditMap(cloudAuditMap);
                    }
                    const q = await fetchPenerimaanRecountQueueFromSupabase();
                    if (q && typeof q === 'object') setQueueMap(q);
                    await (onRefreshData as any)(true);
                    onShowToast('Sinkronisasi Cloud berhasil.', 'success');
                  } catch (err) {
                    console.error('Gagal sinkron:', err);
                    onShowToast('Gagal sinkronisasi data Cloud', 'error');
                  } finally {
                    setIsSyncingCloudQueue(false);
                  }
                },
              },
            ],
          },
        ]}
      />

      {/* NATIVE ACTION SHEET: AKSI KARTU ANTRIAN AUDIT */}
      <ProduksiActionSheet
        isOpen={Boolean(actionSheetQueueItem)}
        onClose={() => setActionSheetQueueItem(null)}
        title={actionSheetQueueItem ? `Kode #${actionSheetQueueItem.kode_produksi}` : ''}
        subtitle={
          actionSheetQueueItem
            ? `${actionSheetQueueItem.nama_produk || 'Produk'} · Awal ${actionSheetQueueItem.total_asli} pcs`
            : undefined
        }
        groups={
          actionSheetQueueItem
            ? [
                {
                  title: 'Aksi Audit',
                  items: [
                    {
                      id: 'open-workspace',
                      label: actionSheetQueueItem.is_counted ? 'Re-Audit Fisik' : 'Hitung Sekarang',
                      description: 'Buka lembar verifikasi fisik per varian',
                      icon: <Scale className="w-4 h-4" />,
                      tone: 'primary',
                      onClick: () => handleOpenWorkspace(actionSheetQueueItem.kode_produksi),
                    },
                    {
                      id: 'repush',
                      label: 'Re-Push ke Google Sheet',
                      description: 'Kirim ulang hasil audit kode ini ke Master Sheet',
                      icon: <CloudUpload className="w-4 h-4" />,
                      onClick: () => handleDirectRePushToSheet(actionSheetQueueItem),
                    },
                    {
                      id: 'history',
                      label: 'Log Riwayat Putaran',
                      description: 'Lihat riwayat putaran audit & detail per varian',
                      icon: <History className="w-4 h-4" />,
                      onClick: () => handleOpenHistoryModal(actionSheetQueueItem.kode_produksi),
                    },
                    {
                      id: 'note',
                      label: actionSheetQueueItem.catatan_petunjuk ? 'Ubah Petunjuk Khusus' : 'Tambah Petunjuk Khusus',
                      description: 'Catat instruksi khusus untuk petugas penghitung',
                      icon: <Edit3 className="w-4 h-4" />,
                      onClick: () => handlePromptEditCardNote(actionSheetQueueItem.kode_produksi),
                    },
                  ],
                },
                {
                  title: 'Antrian',
                  items: [
                    {
                      id: 'remove',
                      label: 'Keluarkan dari Antrian',
                      description: 'Hapus kode ini dari daftar antrian audit aktif',
                      icon: <Trash2 className="w-4 h-4" />,
                      tone: 'danger',
                      onClick: () => handleRemoveFromQueue(actionSheetQueueItem.kode_produksi),
                    },
                  ],
                },
              ]
            : []
        }
      />

      {/* Modal Scanner & Perbaikan Massal Batch Susulan */}
      <MultiBatchAuditScannerModal
        isOpen={isMultiBatchScannerOpen}
        onClose={() => setIsMultiBatchScannerOpen(false)}
        pendingGroups={pendingBatchGroups}
        recountAuditMap={recountAuditMap}
        queueMap={queueMap}
        onOpenCodeWorkspace={(code) => handleOpenWorkspace(code)}
        onBulkAddToQueue={handleBulkAddPendingToQueue}
        onBulkAutoMergeAndSave={handleBulkAutoMergePendingGroups}
        onBulkResyncMasterSheet={handleBulkResyncMasterSheetForPending}
      />
    </div>
  );
};
