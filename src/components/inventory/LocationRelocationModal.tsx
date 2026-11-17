import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  X,
  ArrowRight,
  ArrowDown,
  ArrowRightLeft,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Package,
  MapPin,
  Loader2,
  Copy,
  Check,
  Printer,
  RotateCcw,
  ShieldAlert,
  Boxes,
  Plus,
  Trash2,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ProductItem, StockRealtimeItem, UserSession } from '../../types';
import { getAreaFromLokasi, normalizeLokasi, fetchDistinctDatabaseLocations } from '../../services/supabase';
import {
  buildEnrichedCatalogMap,
  computeAllRackSlots,
  loadLocalRackCapacityConfig,
  type ComputedRackSlot,
  type EnrichedCatalogEntry,
} from '../../services/rackCapacityService';
import {
  fetchLocationRelocationPreview,
  fetchMultiLocationRelocationPreview,
  executeLocationRelocation,
  executeBatchLocationRelocation,
  isInvalidLocationToken,
  type RelocationPreviewResult,
  type ExecuteLocationRelocationResult,
  type ExecuteBatchLocationRelocationResult,
  type BatchRelocationRoutePayload,
} from '../../services/locationRelocationService';

export interface LocationRelocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  session?: UserSession | null;
  stockRows?: StockRealtimeItem[];
  productCatalog?: ProductItem[];
  rackSlots?: ComputedRackSlot[];
  initialFromLocation?: string;
  initialFromLocations?: string[];
  initialToLocation?: string;
  onNotify?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onSuccess?: (result: ExecuteLocationRelocationResult | ExecuteBatchLocationRelocationResult) => void;
}

type RelocationMode = 'FULL' | 'PARTIAL';
type RelocationScope = 'SINGLE_TARGET' | 'MULTI_ROUTE';

interface BatchRouteRowState {
  id: string;
  fromInput: string;
  toInput: string;
}

interface BatchPreviewCacheEntry {
  loading: boolean;
  data?: RelocationPreviewResult;
  error?: string;
}

function makeBatchRowId(): string {
  return `route_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getAreaBadgeClass(area: string): string {
  switch (area) {
    case 'Warehouse':
      return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'Kolian':
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    case 'Transit':
      return 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
    case 'Blok F':
      return 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    case 'Aksesoris':
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    case 'Perbaikan':
      return 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800';
    case 'Sortir':
      return 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800';
    case 'Anomali':
    default:
      return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  }
}

export const LocationRelocationModal: React.FC<LocationRelocationModalProps> = ({
  isOpen,
  onClose,
  session,
  stockRows = [],
  productCatalog = [],
  rackSlots,
  initialFromLocation = '',
  initialFromLocations,
  initialToLocation = '',
  onNotify = () => {},
  onSuccess,
}) => {
  // Build catalog map ONLY when modal is open, backed by shared WeakMap cache
  const catalogMap = useMemo(() => {
    if (!isOpen) return new Map<string, EnrichedCatalogEntry>();
    return buildEnrichedCatalogMap(productCatalog);
  }, [isOpen, productCatalog]);

  // Compute slots fallback when not supplied by RackCapacityDashboard (guarded when closed)
  const effectiveSlots = useMemo(() => {
    if (!isOpen) return [];
    if (rackSlots && rackSlots.length > 0) return rackSlots;
    const config = loadLocalRackCapacityConfig();
    return computeAllRackSlots(config, stockRows, [], catalogMap);
  }, [isOpen, rackSlots, stockRows, catalogMap]);

  const slotByLokasi = useMemo(() => {
    const map = new Map<string, ComputedRackSlot>();
    if (!isOpen) return map;
    for (const s of effectiveSlots) {
      map.set(s.lokasi.toUpperCase(), s);
    }
    return map;
  }, [isOpen, effectiveSlots]);

  // Fetch extra known DB locations for autocomplete
  const [dbLocations, setDbLocations] = useState<string[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    fetchDistinctDatabaseLocations()
      .then((locs) => {
        if (mounted && Array.isArray(locs)) setDbLocations(locs);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Form states
  const [relocationScope, setRelocationScope] = useState<RelocationScope>('SINGLE_TARGET');
  const [fromInput, setFromInput] = useState('');
  const [multiFromLocations, setMultiFromLocations] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [mode, setMode] = useState<RelocationMode>('FULL');
  const [notes, setNotes] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Multi-route states
  const [batchRoutes, setBatchRoutes] = useState<BatchRouteRowState[]>([]);
  const [batchPreviewCache, setBatchPreviewCache] = useState<Record<string, BatchPreviewCacheEntry>>({});
  const batchPreviewCacheRef = useRef(batchPreviewCache);
  batchPreviewCacheRef.current = batchPreviewCache;
  const batchFetchingRef = useRef<Set<string>>(new Set());
  const [activeBatchDropdown, setActiveBatchDropdown] = useState<{ rowId: string; field: 'from' | 'to' } | null>(null);
  const [expandedBatchRowId, setExpandedBatchRowId] = useState<string | null>(null);
  const [showQuickPaste, setShowQuickPaste] = useState(false);
  const [quickPasteText, setQuickPasteText] = useState('');

  // Dropdown visibility states
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const fromBoxRef = useRef<HTMLDivElement>(null);
  const toBoxRef = useRef<HTMLDivElement>(null);
  const batchListRef = useRef<HTMLDivElement>(null);

  // Preview states
  const [preview, setPreview] = useState<RelocationPreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Partial selection state: sku -> moveQty
  const [partialQtys, setPartialQtys] = useState<Record<string, number>>({});

  // Execution & confirmation states
  const [isConfirming, setIsConfirming] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecuteLocationRelocationResult | null>(null);
  const [batchExecutionResult, setBatchExecutionResult] = useState<ExecuteBatchLocationRelocationResult | null>(null);
  const [copiedWa, setCopiedWa] = useState(false);

  // Initialize inputs on open
  useEffect(() => {
    if (!isOpen) return;
    const multiList = Array.isArray(initialFromLocations)
      ? Array.from(
          new Set(
            initialFromLocations
              .map((l) => {
                const r = (l || '').trim().toUpperCase();
                return (normalizeLokasi(r) || r).toUpperCase();
              })
              .filter((l) => l && !isInvalidLocationToken(l))
          )
        )
      : [];

    setRelocationScope('SINGLE_TARGET');
    if (multiList.length > 1) {
      setMultiFromLocations(multiList);
      setFromInput(multiList.join(', '));
      setBatchRoutes(multiList.map((loc) => ({ id: makeBatchRowId(), fromInput: loc, toInput: '' })));
    } else {
      setMultiFromLocations([]);
      const initFrom = (multiList[0] || initialFromLocation || '').trim().toUpperCase();
      setFromInput(initFrom);
      setBatchRoutes([
        { id: makeBatchRowId(), fromInput: initFrom, toInput: (initialToLocation || '').trim().toUpperCase() },
        { id: makeBatchRowId(), fromInput: '', toInput: '' },
        { id: makeBatchRowId(), fromInput: '', toInput: '' },
      ]);
    }
    const initTo = (initialToLocation || '').trim().toUpperCase();
    setToInput(initTo);
    setMode('FULL');
    setNotes('');
    setItemSearch('');
    setPreview(null);
    setPreviewError(null);
    setPartialQtys({});
    setIsConfirming(false);
    setIsExecuting(false);
    setExecutionResult(null);
    setBatchExecutionResult(null);
    setBatchPreviewCache({});
    batchFetchingRef.current.clear();
    setActiveBatchDropdown(null);
    setExpandedBatchRowId(null);
    setShowQuickPaste(false);
    setQuickPasteText('');
    setCopiedWa(false);
    setShowFromDropdown(false);
    setShowToDropdown(false);
  }, [isOpen, initialFromLocation, initialFromLocations, initialToLocation]);

  // Outside click closes location dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fromBoxRef.current && !fromBoxRef.current.contains(e.target as Node)) {
        setShowFromDropdown(false);
      }
      if (toBoxRef.current && !toBoxRef.current.contains(e.target as Node)) {
        setShowToDropdown(false);
      }
      if (batchListRef.current && !batchListRef.current.contains(e.target as Node)) {
        setActiveBatchDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cleanFrom = useMemo(() => {
    const raw = fromInput.trim().toUpperCase();
    return normalizeLokasi(raw) || raw;
  }, [fromInput]);

  const cleanTo = useMemo(() => {
    const raw = toInput.trim().toUpperCase();
    return normalizeLokasi(raw) || raw;
  }, [toInput]);

  const fromArea = useMemo(() => (cleanFrom ? getAreaFromLokasi(cleanFrom) : ''), [cleanFrom]);
  const toArea = useMemo(() => (cleanTo ? getAreaFromLokasi(cleanTo) : ''), [cleanTo]);

  const isMultiSourceMode = multiFromLocations.length > 1;
  const multiSourceKey = multiFromLocations.join(',');
  const effectiveMode: RelocationMode = isMultiSourceMode ? 'FULL' : mode;
  const sourceDisplayLabel = useMemo(() => {
    if (!isMultiSourceMode) return cleanFrom;
    if (multiFromLocations.length <= 3) return multiFromLocations.join(', ');
    return `${multiFromLocations.slice(0, 3).join(', ')} (+${multiFromLocations.length - 3})`;
  }, [isMultiSourceMode, multiFromLocations, cleanFrom]);

  // Load live authoritative source stock preview
  const loadSourcePreview = useCallback(
    async (locValue: string, multiLocs: string[] = []) => {
      if (multiLocs.length > 1) {
        setIsLoadingPreview(true);
        setPreviewError(null);
        setIsConfirming(false);
        try {
          const multiSet = new Set(multiLocs.map((m) => m.toUpperCase()));
          const extraVariants: string[] = [];
          for (const r of stockRows) {
            const rLoc = String(r.lokasi || '').trim();
            const rNorm = (normalizeLokasi(rLoc.toUpperCase()) || rLoc.toUpperCase());
            if (rLoc && (multiSet.has(rLoc.toUpperCase()) || multiSet.has(rNorm))) {
              extraVariants.push(rLoc);
            }
          }
          const res = await fetchMultiLocationRelocationPreview(multiLocs, catalogMap, extraVariants);
          setPreview(res);
          const nextPartial: Record<string, number> = {};
          for (const it of res.items) nextPartial[it.sku] = it.totalQty;
          setPartialQtys(nextPartial);
        } catch (err: any) {
          setPreviewError(err?.message || 'Gagal memuat isi lokasi asal dari database.');
          setPreview(null);
        } finally {
          setIsLoadingPreview(false);
        }
        return;
      }

      const trimmed = (locValue || '').trim().toUpperCase();
      if (!trimmed || isInvalidLocationToken(trimmed)) {
        setPreview(null);
        setPreviewError(null);
        return;
      }
      setIsLoadingPreview(true);
      setPreviewError(null);
      setIsConfirming(false);
      try {
        // Gather any matching raw location strings from stockRows or dbLocations
        const normTarget = (normalizeLokasi(trimmed) || trimmed).toUpperCase();
        const extraVariants: string[] = [];
        for (const r of stockRows) {
          const rLoc = String(r.lokasi || '').trim();
          const rNorm = (normalizeLokasi(rLoc.toUpperCase()) || rLoc.toUpperCase());
          if (rLoc && (rLoc.toUpperCase() === trimmed || rNorm === normTarget)) {
            extraVariants.push(rLoc);
          }
        }
        for (const d of dbLocations) {
          const dLoc = String(d || '').trim();
          const dNorm = (normalizeLokasi(dLoc.toUpperCase()) || dLoc.toUpperCase());
          if (dLoc && (dLoc.toUpperCase() === trimmed || dNorm === normTarget)) {
            extraVariants.push(dLoc);
          }
        }

        const res = await fetchLocationRelocationPreview(trimmed, catalogMap, extraVariants);
        setPreview(res);

        const nextPartial: Record<string, number> = {};
        for (const it of res.items) {
          nextPartial[it.sku] = it.totalQty;
        }
        setPartialQtys(nextPartial);
      } catch (err: any) {
        setPreviewError(err?.message || 'Gagal memuat isi lokasi asal dari database.');
        setPreview(null);
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [catalogMap, stockRows, dbLocations]
  );

  // Auto-load preview when fromInput or multiFromLocations changes (debounced)
  useEffect(() => {
    if (!isOpen || executionResult) return;
    if (multiFromLocations.length > 1) {
      const timer = setTimeout(() => {
        loadSourcePreview('', multiFromLocations);
      }, 200);
      return () => clearTimeout(timer);
    }
    if (!cleanFrom || isInvalidLocationToken(cleanFrom)) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      loadSourcePreview(fromInput, []);
    }, 380);
    return () => clearTimeout(timer);
  }, [isOpen, fromInput, cleanFrom, multiSourceKey, executionResult, loadSourcePreview]);

  // Source dropdown options (prioritize locations with currentQty > 0)
  const sourceSuggestions = useMemo(() => {
    if (!isOpen) return [];
    const map = new Map<string, { lokasi: string; area: string; qty: number; skuCount: number }>();

    for (const s of effectiveSlots) {
      if (s.currentQty > 0) {
        map.set(s.lokasi.toUpperCase(), {
          lokasi: s.lokasi.toUpperCase(),
          area: s.area,
          qty: s.currentQty,
          skuCount: s.skuCount,
        });
      }
    }

    for (const r of stockRows) {
      const rawLoc = String(r.lokasi || '').trim().toUpperCase();
      if (!rawLoc || isInvalidLocationToken(rawLoc)) continue;
      const qty = Number(r.sisa_stok) || 0;
      if (qty <= 0) continue;
      const norm = (normalizeLokasi(rawLoc) || rawLoc).toUpperCase();
      if (!map.has(norm)) {
        map.set(norm, {
          lokasi: norm,
          area: getAreaFromLokasi(norm),
          qty,
          skuCount: 1,
        });
      }
    }

    const q = fromInput.trim().toUpperCase();
    const list = Array.from(map.values()).filter((it) => {
      if (!q) return true;
      return it.lokasi.includes(q) || it.area.toUpperCase().includes(q);
    });

    list.sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty;
      return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
    });

    return list.slice(0, 40);
  }, [isOpen, effectiveSlots, stockRows, fromInput]);

  // Target dropdown options (prioritize empty / available slots, exclude source location)
  const targetSuggestions = useMemo(() => {
    if (!isOpen) return [];
    const map = new Map<
      string,
      { lokasi: string; area: string; currentQty: number; maxCapacity: number; availableSpace: number }
    >();

    const multiSet = new Set(multiFromLocations);
    for (const s of effectiveSlots) {
      const loc = s.lokasi.toUpperCase();
      if (isMultiSourceMode ? multiSet.has(loc) : loc === cleanFrom) continue;
      if (s.area === 'Anomali') continue;
      map.set(loc, {
        lokasi: loc,
        area: s.area,
        currentQty: s.currentQty,
        maxCapacity: s.maxCapacity,
        availableSpace: s.availableSpace,
      });
    }

    for (const d of dbLocations) {
      const norm = (normalizeLokasi(d.trim().toUpperCase()) || d.trim().toUpperCase());
      if (!norm || norm === cleanFrom || isInvalidLocationToken(norm)) continue;
      const area = getAreaFromLokasi(norm);
      if (area === 'Anomali') continue;
      if (!map.has(norm)) {
        map.set(norm, {
          lokasi: norm,
          area,
          currentQty: 0,
          maxCapacity: 40,
          availableSpace: 40,
        });
      }
    }

    const q = toInput.trim().toUpperCase();
    const list = Array.from(map.values()).filter((it) => {
      if (!q) return true;
      return it.lokasi.includes(q) || it.area.toUpperCase().includes(q);
    });

    // Prioritize exact prefix match first, then empty/most space available
    list.sort((a, b) => {
      if (q) {
        const aStarts = a.lokasi.startsWith(q) ? 0 : 1;
        const bStarts = b.lokasi.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
      }
      const aEmpty = a.currentQty === 0 ? 0 : 1;
      const bEmpty = b.currentQty === 0 ? 0 : 1;
      if (aEmpty !== bEmpty) return aEmpty - bEmpty;
      return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
    });

    return list.slice(0, 40);
  }, [isOpen, effectiveSlots, dbLocations, cleanFrom, toInput, isMultiSourceMode, multiFromLocations]);

  // Calculate active items to relocate
  const relocationPlan = useMemo(() => {
    if (!isOpen || !preview) {
      return {
        itemsToMove: [] as Array<{ sku: string; nama_produk: string; size: string; moveQty: number; maxQty: number; buckets: any[] }>,
        movedSkuCount: 0,
        movedTotalPcs: 0,
        remainingAtSourcePcs: 0,
      };
    }

    const itemsToMove = preview.items.map((it) => {
      const moveQty =
        effectiveMode === 'FULL'
          ? it.totalQty
          : Math.max(0, Math.min(it.totalQty, Math.floor(Number(partialQtys[it.sku]) || 0)));
      return {
        sku: it.sku,
        nama_produk: it.nama_produk,
        size: it.size,
        moveQty,
        maxQty: it.totalQty,
        buckets: it.buckets,
      };
    });

    const active = itemsToMove.filter((it) => it.moveQty > 0);
    const movedTotalPcs = active.reduce((sum, it) => sum + it.moveQty, 0);
    const remainingAtSourcePcs = preview.totalPcs - movedTotalPcs;

    return {
      itemsToMove,
      movedSkuCount: active.length,
      movedTotalPcs,
      remainingAtSourcePcs,
    };
  }, [isOpen, preview, effectiveMode, partialQtys]);

  const filteredPreviewItems = useMemo(() => {
    if (!isOpen) return [];
    const q = itemSearch.trim().toUpperCase();
    if (!q) return relocationPlan.itemsToMove;
    return relocationPlan.itemsToMove.filter(
      (it) =>
        it.sku.toUpperCase().includes(q) ||
        it.nama_produk.toUpperCase().includes(q) ||
        it.size.toUpperCase().includes(q)
    );
  }, [isOpen, relocationPlan.itemsToMove, itemSearch]);

  // Target rack capacity simulation
  const targetSlotInfo = useMemo(() => {
    if (!isOpen || !cleanTo || toArea === 'Anomali') return null;
    const slot = slotByLokasi.get(cleanTo);
    const currentQty = slot?.currentQty ?? 0;
    const maxCapacity = slot?.maxCapacity ?? (toArea === 'Kolian' || toArea === 'Transit' ? 40 : 75);
    const afterQty = currentQty + relocationPlan.movedTotalPcs;
    const beforePct = maxCapacity > 0 ? Math.round((currentQty / maxCapacity) * 100) : 0;
    const afterPct = maxCapacity > 0 ? Math.round((afterQty / maxCapacity) * 100) : 0;
    return {
      currentQty,
      maxCapacity,
      afterQty,
      beforePct,
      afterPct,
      isOverloadAfter: afterQty > maxCapacity,
    };
  }, [isOpen, cleanTo, toArea, slotByLokasi, relocationPlan.movedTotalPcs]);

  // =========================================================================
  // MULTI-ROUTE RELOCATION LOGIC (R116 -> R086, R186 -> R054, X110 -> R023)
  // =========================================================================

  // Reusable suggestions lists (all source racks with stock > 0, all valid destination racks)
  const allSourceOptions = useMemo(() => {
    if (!isOpen) return [];
    const map = new Map<string, { lokasi: string; area: string; qty: number; skuCount: number }>();
    for (const s of effectiveSlots) {
      if (s.currentQty > 0) {
        map.set(s.lokasi.toUpperCase(), {
          lokasi: s.lokasi.toUpperCase(),
          area: s.area,
          qty: s.currentQty,
          skuCount: s.skuCount,
        });
      }
    }
    for (const r of stockRows) {
      const rawLoc = String(r.lokasi || '').trim().toUpperCase();
      if (!rawLoc || isInvalidLocationToken(rawLoc)) continue;
      const qty = Number(r.sisa_stok) || 0;
      if (qty <= 0) continue;
      const norm = (normalizeLokasi(rawLoc) || rawLoc).toUpperCase();
      if (!map.has(norm)) {
        map.set(norm, {
          lokasi: norm,
          area: getAreaFromLokasi(norm),
          qty,
          skuCount: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty;
      return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
    });
  }, [isOpen, effectiveSlots, stockRows]);

  const allTargetOptions = useMemo(() => {
    if (!isOpen) return [];
    const map = new Map<
      string,
      { lokasi: string; area: string; currentQty: number; maxCapacity: number; availableSpace: number }
    >();
    for (const s of effectiveSlots) {
      const loc = s.lokasi.toUpperCase();
      if (s.area === 'Anomali') continue;
      map.set(loc, {
        lokasi: loc,
        area: s.area,
        currentQty: s.currentQty,
        maxCapacity: s.maxCapacity,
        availableSpace: s.availableSpace,
      });
    }
    for (const d of dbLocations) {
      const norm = (normalizeLokasi(d.trim().toUpperCase()) || d.trim().toUpperCase());
      if (!norm || isInvalidLocationToken(norm)) continue;
      const area = getAreaFromLokasi(norm);
      if (area === 'Anomali') continue;
      if (!map.has(norm)) {
        map.set(norm, {
          lokasi: norm,
          area,
          currentQty: 0,
          maxCapacity: 40,
          availableSpace: 40,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const aEmpty = a.currentQty === 0 ? 0 : 1;
      const bEmpty = b.currentQty === 0 ? 0 : 1;
      if (aEmpty !== bEmpty) return aEmpty - bEmpty;
      return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
    });
  }, [isOpen, effectiveSlots, dbLocations]);

  const getBatchSourceSuggestions = useCallback(
    (query: string) => {
      const q = (query || '').trim().toUpperCase();
      return allSourceOptions
        .filter((it) => !q || it.lokasi.includes(q) || it.area.toUpperCase().includes(q))
        .slice(0, 25);
    },
    [allSourceOptions]
  );

  const getBatchTargetSuggestions = useCallback(
    (query: string, excludeSource: string) => {
      const q = (query || '').trim().toUpperCase();
      return allTargetOptions
        .filter((it) => {
          if (it.lokasi === excludeSource) return false;
          if (!q) return true;
          return it.lokasi.includes(q) || it.area.toUpperCase().includes(q);
        })
        .sort((a, b) => {
          if (q) {
            const aStarts = a.lokasi.startsWith(q) ? 0 : 1;
            const bStarts = b.lokasi.startsWith(q) ? 0 : 1;
            if (aStarts !== bStarts) return aStarts - bStarts;
          }
          const aEmpty = a.currentQty === 0 ? 0 : 1;
          const bEmpty = b.currentQty === 0 ? 0 : 1;
          if (aEmpty !== bEmpty) return aEmpty - bEmpty;
          return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
        })
        .slice(0, 25);
    },
    [allTargetOptions]
  );

  // Normalized route metadata
  const normalizedBatchRoutes = useMemo(() => {
    return batchRoutes.map((row, idx) => {
      const rawFrom = row.fromInput.trim().toUpperCase();
      const cleanFromLoc = normalizeLokasi(rawFrom) || rawFrom;
      const rawTo = row.toInput.trim().toUpperCase();
      const cleanToLoc = normalizeLokasi(rawTo) || rawTo;
      const fromAreaLoc = cleanFromLoc ? getAreaFromLokasi(cleanFromLoc) : '';
      const toAreaLoc = cleanToLoc ? getAreaFromLokasi(cleanToLoc) : '';
      const cacheEntry = cleanFromLoc ? batchPreviewCache[cleanFromLoc] : undefined;
      return {
        ...row,
        index: idx,
        cleanFrom: cleanFromLoc,
        cleanTo: cleanToLoc,
        fromArea: fromAreaLoc,
        toArea: toAreaLoc,
        isBlank: !rawFrom && !rawTo,
        previewEntry: cacheEntry,
      };
    });
  }, [batchRoutes, batchPreviewCache]);

  // Auto-fetch live preview for unique valid source locations in Multi-Route mode
  const batchSourceKeysString = useMemo(() => {
    const keys = new Set<string>();
    for (const r of normalizedBatchRoutes) {
      if (r.cleanFrom && !isInvalidLocationToken(r.cleanFrom)) {
        keys.add(r.cleanFrom);
      }
    }
    return Array.from(keys).sort().join('|');
  }, [normalizedBatchRoutes]);

  useEffect(() => {
    if (!isOpen || relocationScope !== 'MULTI_ROUTE' || batchExecutionResult) return;
    if (!batchSourceKeysString) return;

    const timer = setTimeout(() => {
      const sources = batchSourceKeysString.split('|').filter(Boolean);
      for (const src of sources) {
        if (batchPreviewCacheRef.current[src] || batchFetchingRef.current.has(src)) continue;
        batchFetchingRef.current.add(src);
        setBatchPreviewCache((prev) => ({
          ...prev,
          [src]: { loading: true },
        }));

        const extraVariants: string[] = [];
        for (const r of stockRows) {
          const rLoc = String(r.lokasi || '').trim();
          const rNorm = normalizeLokasi(rLoc.toUpperCase()) || rLoc.toUpperCase();
          if (rLoc && (rLoc.toUpperCase() === src || rNorm === src)) {
            extraVariants.push(rLoc);
          }
        }
        for (const d of dbLocations) {
          const dLoc = String(d || '').trim();
          const dNorm = normalizeLokasi(dLoc.toUpperCase()) || dLoc.toUpperCase();
          if (dLoc && (dLoc.toUpperCase() === src || dNorm === src)) {
            extraVariants.push(dLoc);
          }
        }

        fetchLocationRelocationPreview(src, catalogMap, extraVariants)
          .then((res) => {
            setBatchPreviewCache((prev) => ({
              ...prev,
              [src]: { loading: false, data: res },
            }));
          })
          .catch((err: any) => {
            setBatchPreviewCache((prev) => ({
              ...prev,
              [src]: {
                loading: false,
                error: err?.message || `Gagal memuat stok ${src}`,
              },
            }));
          })
          .finally(() => {
            batchFetchingRef.current.delete(src);
          });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [isOpen, relocationScope, batchExecutionResult, batchSourceKeysString, stockRows, dbLocations, catalogMap]);

  // Aggregate target incoming pcs across active batch routes + compute batch validation
  const batchPlanSummary = useMemo(() => {
    const nonBlankRoutes = normalizedBatchRoutes.filter((r) => !r.isBlank);
    const seenSources = new Map<string, number>();
    const targetIncomingPcs = new Map<string, number>();
    let isAnyLoading = false;
    let firstError: string | null = null;
    let totalSkus = 0;
    let totalPcs = 0;
    let pendingSoTotal = 0;

    if (nonBlankRoutes.length === 0) {
      firstError = 'Tambahkan minimal 1 pasangan rute relokasi (Rak Asal → Rak Tujuan).';
    }

    const perRowStatus = normalizedBatchRoutes.map((r) => {
      if (r.isBlank) {
        return { ...r, rowError: null as string | null, isReady: false };
      }

      let rowError: string | null = null;
      if (!r.cleanFrom || isInvalidLocationToken(r.cleanFrom)) {
        rowError = 'Rak asal belum valid.';
      } else {
        const prevIdx = seenSources.get(r.cleanFrom);
        if (prevIdx !== undefined) {
          rowError = `Rak asal ${r.cleanFrom} duplikat dengan Baris #${prevIdx + 1}.`;
        } else {
          seenSources.set(r.cleanFrom, r.index);
        }
      }

      if (!rowError && (!r.cleanTo || isInvalidLocationToken(r.cleanTo))) {
        rowError = 'Rak tujuan wajib diisi.';
      } else if (!rowError && r.cleanFrom === r.cleanTo) {
        rowError = 'Rak asal dan tujuan tidak boleh sama.';
      } else if (!rowError && r.toArea === 'Anomali') {
        rowError = `Rak tujuan "${r.cleanTo}" tidak dikenali denah.`;
      }

      const pEntry = r.previewEntry;
      if (pEntry?.loading) {
        isAnyLoading = true;
      } else if (!rowError) {
        if (pEntry?.error) {
          rowError = pEntry.error;
        } else if (!pEntry?.data) {
          isAnyLoading = true;
        } else if (pEntry.data.items.length === 0 || pEntry.data.totalPcs <= 0) {
          rowError = `Lokasi ${r.cleanFrom} kosong (0 pcs).`;
        }
      }

      const isReady = !rowError && !pEntry?.loading && Boolean(pEntry?.data && pEntry.data.totalPcs > 0);
      if (isReady && pEntry?.data) {
        totalSkus += pEntry.data.totalSkus;
        totalPcs += pEntry.data.totalPcs;
        pendingSoTotal += pEntry.data.pendingSoCount || 0;
        targetIncomingPcs.set(r.cleanTo, (targetIncomingPcs.get(r.cleanTo) || 0) + pEntry.data.totalPcs);
      }

      if (rowError && !firstError) {
        firstError = `Baris #${r.index + 1}: ${rowError}`;
      }

      return { ...r, rowError, isReady };
    });

    const readyRoutes = perRowStatus.filter((r) => r.isReady);
    if (!firstError && !isAnyLoading && readyRoutes.length === 0) {
      firstError = 'Tambahkan minimal 1 rute relokasi yang valid.';
    }

    return {
      rows: perRowStatus,
      nonBlankCount: nonBlankRoutes.length,
      readyRoutes,
      targetIncomingPcs,
      isAnyLoading,
      validationError: firstError,
      totalSkus,
      totalPcs,
      pendingSoTotal,
    };
  }, [normalizedBatchRoutes]);

  const handleApplyQuickPaste = () => {
    const lines = quickPasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      onNotify('Tempel daftar rute terlebih dahulu (contoh: R116 --> R086).', 'warning');
      return;
    }

    const parsed: BatchRouteRowState[] = [];
    for (const line of lines) {
      // Support R116 --> R086, R116 -> R086, R116 => R086, R116 > R086, R116 → R086, R116, R086, R116\tR086, R116 R086
      const cleaned = line
        .replace(/^(\d+[\.\)]\s*|[-*•]\s*)/, '')
        .trim();
      const arrowParts = cleaned.split(/\s*(?:-->|->|=>|—>|→|>|,|;|\t|\s-\s)\s*/);
      let fromPart = '';
      let toPart = '';
      if (arrowParts.length >= 2) {
        fromPart = arrowParts[0].trim().toUpperCase();
        toPart = arrowParts[1].trim().toUpperCase();
      } else {
        const spaceParts = cleaned.split(/\s+/);
        if (spaceParts.length >= 2) {
          fromPart = spaceParts[0].trim().toUpperCase();
          toPart = spaceParts[1].trim().toUpperCase();
        }
      }
      if (fromPart || toPart) {
        parsed.push({
          id: makeBatchRowId(),
          fromInput: normalizeLokasi(fromPart) || fromPart,
          toInput: normalizeLokasi(toPart) || toPart,
        });
      }
    }

    if (parsed.length === 0) {
      onNotify('Format tidak terbaca. Gunakan format per baris seperti: R116 --> R086', 'warning');
      return;
    }

    setBatchRoutes((prev) => {
      const existingNonEmpty = prev.filter((r) => r.fromInput.trim() || r.toInput.trim());
      return existingNonEmpty.length > 0 ? [...existingNonEmpty, ...parsed] : parsed;
    });
    setQuickPasteText('');
    setShowQuickPaste(false);
    setIsConfirming(false);
    onNotify(`${parsed.length} baris rute berhasil ditambahkan.`, 'success');
  };

  // Validation
  const validationError = useMemo(() => {
    if (!isOpen) return null;
    if (relocationScope === 'MULTI_ROUTE') {
      return batchPlanSummary.validationError;
    }
    if (!isMultiSourceMode && (!cleanFrom || isInvalidLocationToken(cleanFrom))) {
      return 'Pilih atau ketik lokasi rak asal.';
    }
    if (isMultiSourceMode && multiFromLocations.length === 0) {
      return 'Pilih minimal 1 lokasi rak asal.';
    }
    if (!preview || preview.items.length === 0) return 'Tidak ada stok fisik positif di lokasi asal.';
    if (relocationPlan.movedTotalPcs <= 0) return 'Pilih minimal 1 barang dengan qty pindah > 0.';
    if (!cleanTo || isInvalidLocationToken(cleanTo)) return 'Masukkan kode rak lokasi tujuan.';
    if (isMultiSourceMode ? multiFromLocations.includes(cleanTo) : cleanFrom === cleanTo) {
      return 'Lokasi asal dan tujuan tidak boleh sama.';
    }
    if (toArea === 'Anomali') {
      return `Kode rak tujuan "${cleanTo}" tidak dikenali denah (Anomali). Periksa format (misal: V004, A001, R012).`;
    }
    return null;
  }, [isOpen, relocationScope, batchPlanSummary.validationError, isMultiSourceMode, multiFromLocations, cleanFrom, cleanTo, toArea, preview, relocationPlan.movedTotalPcs]);

  const handleSwapLocations = () => {
    const prevFrom = fromInput;
    const prevTo = toInput;
    setFromInput(prevTo);
    setToInput(prevFrom);
    setIsConfirming(false);
  };

  const handleTogglePartialAll = (selectAll: boolean) => {
    if (!preview) return;
    const next: Record<string, number> = {};
    for (const it of preview.items) {
      next[it.sku] = selectAll ? it.totalQty : 0;
    }
    setPartialQtys(next);
    setIsConfirming(false);
  };

  const handleExecute = async () => {
    if (validationError || isExecuting) return;
    if (relocationScope === 'MULTI_ROUTE' && batchPlanSummary.isAnyLoading) return;
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    setIsExecuting(true);
    try {
      const operatorName = session?.name || session?.username || 'Admin';

      if (relocationScope === 'MULTI_ROUTE') {
        const routePayloads: BatchRelocationRoutePayload[] = batchPlanSummary.readyRoutes.map((r) => ({
          id: r.id,
          sourceLokasi: r.cleanFrom,
          targetLokasi: r.cleanTo,
          items: (r.previewEntry?.data?.items || []).map((it) => ({
            sku: it.sku,
            nama_produk: it.nama_produk,
            size: it.size,
            moveQty: it.totalQty,
            buckets: it.buckets,
          })),
        }));

        const res = await executeBatchLocationRelocation({
          routes: routePayloads,
          operatorName,
          notes,
        });

        if (res.success) {
          setBatchExecutionResult(res);
          setIsConfirming(false);
          onNotify(
            `Relokasi ${res.totalRoutes} rute berhasil! Total ${res.totalSkus} SKU (${res.totalPcs} pcs) dipindahkan.`,
            'success'
          );
          onSuccess?.(res);
        } else {
          onNotify(res.error || 'Gagal mengeksekusi relokasi multi-rute.', 'error');
        }
        return;
      }

      const activeItems = relocationPlan.itemsToMove
        .filter((it) => it.moveQty > 0)
        .map((it) => ({
          sku: it.sku,
          nama_produk: it.nama_produk,
          size: it.size,
          moveQty: it.moveQty,
          buckets: it.buckets,
        }));

      const res = await executeLocationRelocation({
        sourceLokasi: cleanFrom,
        sourceLokasis: isMultiSourceMode ? multiFromLocations : undefined,
        targetLokasi: cleanTo,
        items: activeItems,
        operatorName,
        notes,
        mode: isMultiSourceMode ? 'FULL' : mode,
      });

      if (res.success) {
        setExecutionResult(res);
        setIsConfirming(false);
        onNotify(
          `Relokasi berhasil! ${res.totalSkus} SKU (${res.totalPcs} pcs) dipindahkan dari ${res.sourceLokasi} ke ${res.targetLokasi}.`,
          'success'
        );
        onSuccess?.(res);
      } else {
        onNotify(res.error || 'Gagal mengeksekusi relokasi lokasi.', 'error');
      }
    } catch (err: any) {
      onNotify(err?.message || 'Terjadi kesalahan sistem saat relokasi lokasi.', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyWaSummary = async () => {
    if (!executionResult) return;
    const dateStr = new Date(executionResult.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const lines: string[] = [
      `*RELOKASI LOKASI RAK GUDANG*`,
      `No. Dokumen: *${executionResult.invoice}*`,
      `Tanggal: ${dateStr}`,
      `Dari Rak: *${executionResult.sourceLokasi}* (${
        executionResult.sourceLokasi.includes(',')
          ? 'Multi-Rak'
          : fromArea || getAreaFromLokasi(executionResult.sourceLokasi)
      })`,
      `Ke Rak: *${executionResult.targetLokasi}* (${executionResult.targetArea})`,
      `Total: *${executionResult.totalSkus} SKU / ${executionResult.totalPcs} pcs*`,
      notes.trim() ? `Catatan: ${notes.trim()}` : '',
      `────────────────────`,
      ...executionResult.movedItems.map(
        (it, idx) =>
          `${idx + 1}. *${it.sku}* — ${it.nama_produk}${it.size && it.size !== '-' ? ` (${it.size})` : ''} : *${it.qty} pcs*`
      ),
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedWa(true);
      onNotify('Ringkasan relokasi berhasil disalin ke clipboard!', 'success');
      setTimeout(() => setCopiedWa(false), 2500);
    } catch {
      onNotify('Gagal menyalin teks ke clipboard.', 'error');
    }
  };

  const handlePrintRelocationA4 = () => {
    if (!executionResult) return;
    const dateStr = new Date(executionResult.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const operatorName = session?.name || session?.username || 'Admin Gudang';

    const escapeHtml = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const rowsHtml = executionResult.movedItems
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align:center;font-family:monospace;">${idx + 1}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(it.sku)}</td>
        <td>${escapeHtml(it.nama_produk)}</td>
        <td style="text-align:center;font-family:monospace;font-weight:700;">${escapeHtml(it.size || '-')}</td>
        <td style="text-align:center;font-family:monospace;font-weight:700;">${escapeHtml(executionResult.sourceLokasi)}</td>
        <td style="text-align:center;font-family:monospace;font-weight:700;">${escapeHtml(executionResult.targetLokasi)}</td>
        <td style="text-align:right;font-family:monospace;font-weight:900;">${it.qty} pcs</td>
        <td style="text-align:center;font-family:monospace;">[ &nbsp; ] Sesuai</td>
      </tr>`
      )
      .join('');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bukti Relokasi Rak ${escapeHtml(executionResult.invoice)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
    .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; }
    .subtitle { font-size: 11px; color: #475569; margin-top: 2px; }
    .meta { text-align: right; font-size: 10px; line-height: 1.5; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .card { border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px; }
    .card-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .card-val { font-size: 13px; font-weight: 900; font-family: monospace; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; }
    th { background: #0f172a; color: #ffffff; text-transform: uppercase; font-size: 9px; font-weight: 800; }
    .note { border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; border-radius: 6px; font-size: 10px; margin-bottom: 18px; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; margin-top: 24px; font-size: 10px; }
    .sig-line { margin-top: 46px; border-top: 1px solid #334155; padding-top: 4px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">BERITA ACARA RELOKASI LOKASI RAK</div>
      <div class="subtitle">Pemindahan Stok Fisik Antar Lokasi Gudang (Log Mutasi Otomatis #OUT / #IN)</div>
    </div>
    <div class="meta">
      <div><strong>No. Dokumen:</strong> <span style="font-family:monospace;">${escapeHtml(executionResult.invoice)}</span></div>
      <div><strong>Waktu Eksekusi:</strong> ${escapeHtml(dateStr)}</div>
      <div><strong>Operator:</strong> ${escapeHtml(operatorName)}</div>
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="card-label">Lokasi Asal (#OUT)</div>
      <div class="card-val">${escapeHtml(executionResult.sourceLokasi)}</div>
    </div>
    <div class="card">
      <div class="card-label">Lokasi Tujuan (#IN)</div>
      <div class="card-val">${escapeHtml(executionResult.targetLokasi)} (${escapeHtml(executionResult.targetArea)})</div>
    </div>
    <div class="card">
      <div class="card-label">Jumlah SKU Dipindah</div>
      <div class="card-val">${executionResult.totalSkus} SKU</div>
    </div>
    <div class="card">
      <div class="card-label">Total Kuantitas</div>
      <div class="card-val">${executionResult.totalPcs} Pcs</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:28px;">No</th>
        <th style="width:110px;">SKU</th>
        <th>Nama Produk</th>
        <th style="width:45px;">Size</th>
        <th style="width:65px;">Asal</th>
        <th style="width:65px;">Tujuan</th>
        <th style="width:65px;">Qty</th>
        <th style="width:85px;">Cek Fisik</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="note">
    <strong>Catatan Relokasi:</strong> ${escapeHtml(notes.trim() || `Relokasi ${mode === 'FULL' ? 'Full' : 'Sebagian'} dari ${executionResult.sourceLokasi} ke ${executionResult.targetLokasi}.`)}
  </div>

  <div class="signatures">
    <div>
      <div>Admin / Pembuat Dokumen</div>
      <div class="sig-line">${escapeHtml(operatorName)}</div>
    </div>
    <div>
      <div>Pelaksana Pemindahan (Gudang)</div>
      <div class="sig-line">( ........................................ )</div>
    </div>
    <div>
      <div>Diverifikasi Oleh (Supervisor / QC)</div>
      <div class="sig-line">( ........................................ )</div>
    </div>
  </div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      }, 250);
    }
  };

  const handleCopyBatchWaSummary = async () => {
    if (!batchExecutionResult) return;
    const dateStr = new Date(batchExecutionResult.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const lines: string[] = [
      `*RELOKASI MULTI-RUTE RAK GUDANG*`,
      `No. Dokumen: *${batchExecutionResult.invoice}*`,
      `Tanggal: ${dateStr}`,
      `Total Rute: *${batchExecutionResult.totalRoutes} rute* (${batchExecutionResult.totalSkus} SKU / ${batchExecutionResult.totalPcs} pcs)`,
      notes.trim() ? `Catatan: ${notes.trim()}` : '',
      `────────────────────`,
    ].filter(Boolean);

    batchExecutionResult.routes.forEach((r, rIdx) => {
      lines.push(`*${rIdx + 1}. ${r.sourceLokasi} → ${r.targetLokasi}* (${r.totalSkus} SKU / ${r.totalPcs} pcs)`);
      r.movedItems.forEach((it) => {
        lines.push(
          `   • *${it.sku}* — ${it.nama_produk}${it.size && it.size !== '-' ? ` (${it.size})` : ''} : *${it.qty} pcs*`
        );
      });
    });

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedWa(true);
      onNotify('Ringkasan relokasi multi-rute berhasil disalin!', 'success');
      setTimeout(() => setCopiedWa(false), 2500);
    } catch {
      onNotify('Gagal menyalin teks ke clipboard.', 'error');
    }
  };

  const handlePrintBatchRelocationA4 = () => {
    if (!batchExecutionResult) return;
    const dateStr = new Date(batchExecutionResult.createdAt).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const operatorName = session?.name || session?.username || 'Admin Gudang';

    const escapeHtml = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    let rowNo = 0;
    const rowsHtml = batchExecutionResult.routes
      .flatMap((r) =>
        r.movedItems.map((it) => {
          rowNo++;
          return `
      <tr>
        <td style="text-align:center;font-family:monospace;">${rowNo}</td>
        <td style="text-align:center;font-family:monospace;font-weight:800;">${escapeHtml(r.sourceLokasi)} → ${escapeHtml(r.targetLokasi)}</td>
        <td style="font-family:monospace;font-weight:700;">${escapeHtml(it.sku)}</td>
        <td>${escapeHtml(it.nama_produk)}</td>
        <td style="text-align:center;font-family:monospace;font-weight:700;">${escapeHtml(it.size || '-')}</td>
        <td style="text-align:right;font-family:monospace;font-weight:900;">${it.qty} pcs</td>
        <td style="text-align:center;font-family:monospace;">[ &nbsp; ] Sesuai</td>
      </tr>`;
        })
      )
      .join('');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bukti Relokasi Multi-Rute ${escapeHtml(batchExecutionResult.invoice)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
    .title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.4px; }
    .subtitle { font-size: 11px; color: #475569; margin-top: 2px; }
    .meta { text-align: right; font-size: 10px; line-height: 1.5; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .card { border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px; }
    .card-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .card-val { font-size: 13px; font-weight: 900; font-family: monospace; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 10px; }
    th { background: #0f172a; color: #ffffff; text-transform: uppercase; font-size: 9px; font-weight: 800; }
    .note { border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; border-radius: 6px; font-size: 10px; margin-bottom: 18px; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; margin-top: 24px; font-size: 10px; }
    .sig-line { margin-top: 46px; border-top: 1px solid #334155; padding-top: 4px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">BERITA ACARA RELOKASI MULTI-RUTE RAK</div>
      <div class="subtitle">Pemindahan Stok Fisik Antar Lokasi Gudang</div>
    </div>
    <div class="meta">
      <div><strong>No. Dokumen:</strong> <span style="font-family:monospace;">${escapeHtml(batchExecutionResult.invoice)}</span></div>
      <div><strong>Waktu Eksekusi:</strong> ${escapeHtml(dateStr)}</div>
      <div><strong>Operator:</strong> ${escapeHtml(operatorName)}</div>
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="card-label">Jumlah Rute</div>
      <div class="card-val">${batchExecutionResult.totalRoutes} Rute</div>
    </div>
    <div class="card">
      <div class="card-label">Jumlah Baris SKU</div>
      <div class="card-val">${batchExecutionResult.totalSkus} SKU</div>
    </div>
    <div class="card">
      <div class="card-label">Total Kuantitas</div>
      <div class="card-val">${batchExecutionResult.totalPcs} Pcs</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:28px;">No</th>
        <th style="width:115px;">Rute (Asal → Tujuan)</th>
        <th style="width:110px;">SKU</th>
        <th>Nama Produk</th>
        <th style="width:45px;">Size</th>
        <th style="width:65px;">Qty</th>
        <th style="width:85px;">Cek Fisik</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="note">
    <strong>Catatan Relokasi:</strong> ${escapeHtml(notes.trim() || `Relokasi Multi-Rute (${batchExecutionResult.routes.map((r) => `${r.sourceLokasi} -> ${r.targetLokasi}`).join(', ')})`)}
  </div>

  <div class="signatures">
    <div>
      <div>Admin / Pembuat Dokumen</div>
      <div class="sig-line">${escapeHtml(operatorName)}</div>
    </div>
    <div>
      <div>Pelaksana Pemindahan (Gudang)</div>
      <div class="sig-line">( ........................................ )</div>
    </div>
    <div>
      <div>Diverifikasi Oleh (Supervisor / QC)</div>
      <div class="sig-line">( ........................................ )</div>
    </div>
  </div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 2000);
      }, 250);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isExecuting) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-[#131d31] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-[#0f172a]/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <ArrowRightLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight truncate">
                Relokasi / Pindah Lokasi Rak
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Pindahkan stok penuh atau sebagian antar rak lewat log mutasi (#OUT Asal + #IN Tujuan).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {batchExecutionResult ? (
            /* ================================================================
               MULTI-ROUTE SUCCESS RESULT VIEW
               ================================================================ */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                      Relokasi {batchExecutionResult.totalRoutes} Rute Berhasil Dicatat!
                    </div>
                    <div className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        Invoice: <strong className="font-mono">{batchExecutionResult.invoice}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <strong className="font-mono tabular-nums">
                        {batchExecutionResult.totalRoutes} Rute · {batchExecutionResult.totalSkus} SKU ({batchExecutionResult.totalPcs} pcs)
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyBatchWaSummary}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedWa ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{copiedWa ? 'Tersalin' : 'Salin WA'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintBatchRelocationA4}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                    <span>Cetak Bukti A4</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {batchExecutionResult.routes.map((route, idx) => (
                  <div
                    key={`${route.sourceLokasi}_${route.targetLokasi}_${idx}`}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    <div className="px-3.5 py-2 bg-slate-50 dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 font-mono font-black text-slate-900 dark:text-white">
                        <span className="text-[10px] font-sans text-slate-500">#{idx + 1}</span>
                        <span>{route.sourceLokasi}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">{route.targetLokasi}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        {route.totalSkus} SKU · {route.totalPcs} pcs
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {route.movedItems.map((it) => (
                        <div
                          key={`${route.sourceLokasi}_${it.sku}`}
                          className="px-3.5 py-1.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-bold text-slate-900 dark:text-white">{it.nama_produk}</span>{' '}
                            <span className="font-mono text-[11px] text-slate-500">
                              ({it.sku}{it.size && it.size !== '-' ? ` · ${it.size}` : ''})
                            </span>
                          </div>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                            {it.qty} pcs
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : executionResult ? (
            /* ================================================================
               SINGLE-TARGET SUCCESS RESULT VIEW
               ================================================================ */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                      Relokasi Stok Berhasil Dicatat!
                    </div>
                    <div className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        Invoice: <strong className="font-mono">{executionResult.invoice}</strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Rute:{' '}
                        <strong className="font-mono">
                          {executionResult.sourceLokasi} → {executionResult.targetLokasi}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <strong className="font-mono tabular-nums">
                        {executionResult.totalSkus} SKU ({executionResult.totalPcs} pcs)
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyWaSummary}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedWa ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{copiedWa ? 'Tersalin' : 'Salin WA'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintRelocationA4}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                    <span>Cetak Bukti A4</span>
                  </button>
                </div>
              </div>

              {/* Moved Items Summary Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <span>Rincian Barang yang Dipindahkan</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {executionResult.movedItems.length} SKU · {executionResult.totalPcs} pcs
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {executionResult.movedItems.map((it) => (
                    <div
                      key={it.sku}
                      className="px-3.5 py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {it.nama_produk}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
                          <span>{it.sku}</span>
                          {it.size && it.size !== '-' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Size {it.size}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                        {it.qty} pcs
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ================================================================
               RELOCATION BUILDER VIEW
               ================================================================ */
            <>
              {/* Scope Mode Switcher: 1 Tujuan vs Multi-Rute */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setRelocationScope('SINGLE_TARGET');
                      setIsConfirming(false);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      relocationScope === 'SINGLE_TARGET'
                        ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    1 Tujuan (Standar)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRelocationScope('MULTI_ROUTE');
                      setIsConfirming(false);
                      // Sync current single/multi selection into batchRoutes if batchRoutes are still blank
                      const allBlank = batchRoutes.every((r) => !r.fromInput.trim() && !r.toInput.trim());
                      if (allBlank) {
                        if (multiFromLocations.length > 0) {
                          setBatchRoutes(
                            multiFromLocations.map((loc) => ({
                              id: makeBatchRowId(),
                              fromInput: loc,
                              toInput: '',
                            }))
                          );
                        } else if (cleanFrom) {
                          setBatchRoutes([
                            { id: makeBatchRowId(), fromInput: cleanFrom, toInput: cleanTo },
                            { id: makeBatchRowId(), fromInput: '', toInput: '' },
                            { id: makeBatchRowId(), fromInput: '', toInput: '' },
                          ]);
                        }
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      relocationScope === 'MULTI_ROUTE'
                        ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>Multi-Rute (Sekaligus)</span>
                  </button>
                </div>

                {relocationScope === 'MULTI_ROUTE' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickPaste((v) => !v)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                        showQuickPaste
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      <span>Tempel Daftar Rute</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBatchRoutes((prev) => [...prev, { id: makeBatchRowId(), fromInput: '', toInput: '' }]);
                        setIsConfirming(false);
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Baris</span>
                    </button>
                  </div>
                )}
              </div>

              {relocationScope === 'MULTI_ROUTE' ? (
                /* ==============================================================
                   MULTI-ROUTE BUILDER (R116 -> R086, R186 -> R054, X110 -> R023)
                   ============================================================== */
                <div ref={batchListRef} className="space-y-3">
                  {/* Optional Quick Paste Panel */}
                  {showQuickPaste && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b1324] border border-indigo-200 dark:border-indigo-800/70 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Tempel Daftar Pasangan Rak (1 rute per baris)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowQuickPaste(false)}
                          className="text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={quickPasteText}
                        onChange={(e) => setQuickPasteText(e.target.value)}
                        placeholder={'R116 --> R086\nR186 --> R054\nX110 --> R023'}
                        className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                          Pemisah didukung: --&gt;, -&gt;, koma, tab, atau spasi.
                        </span>
                        <button
                          type="button"
                          onClick={handleApplyQuickPaste}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Terapkan ke Baris
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Multi-Route Rows */}
                  <div className="space-y-2">
                    {batchPlanSummary.rows.map((row) => {
                      const pData = row.previewEntry?.data;
                      const pLoading = Boolean(row.previewEntry?.loading);
                      const fromSuggestionsList =
                        activeBatchDropdown?.rowId === row.id && activeBatchDropdown.field === 'from'
                          ? getBatchSourceSuggestions(row.fromInput)
                          : [];
                      const toSuggestionsList =
                        activeBatchDropdown?.rowId === row.id && activeBatchDropdown.field === 'to'
                          ? getBatchTargetSuggestions(row.toInput, row.cleanFrom)
                          : [];

                      const targetSlot = row.cleanTo && row.toArea !== 'Anomali' ? slotByLokasi.get(row.cleanTo) : undefined;
                      const targetBaseQty = targetSlot?.currentQty ?? 0;
                      const targetMaxCap = targetSlot?.maxCapacity ?? (row.toArea === 'Kolian' || row.toArea === 'Transit' ? 40 : 75);
                      const incomingToThisTarget = row.cleanTo ? batchPlanSummary.targetIncomingPcs.get(row.cleanTo) || 0 : 0;
                      const targetAfterQty = targetBaseQty + incomingToThisTarget;
                      const isExpanded = expandedBatchRowId === row.id;

                      return (
                        <div
                          key={row.id}
                          className={`p-3 rounded-xl border transition-colors ${
                            row.rowError
                              ? 'bg-rose-50/40 dark:bg-rose-950/15 border-rose-200 dark:border-rose-900/60'
                              : row.isReady
                              ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200/80 dark:border-emerald-900/50'
                              : 'bg-slate-50 dark:bg-[#0b1324] border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center gap-2">
                            <div className="flex items-center justify-between md:justify-start gap-2 shrink-0">
                              <span className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center">
                                {row.index + 1}
                              </span>
                              <button
                                type="button"
                                disabled={batchRoutes.length <= 1 || isExecuting}
                                onClick={() => {
                                  setBatchRoutes((prev) => prev.filter((x) => x.id !== row.id));
                                  setIsConfirming(false);
                                }}
                                className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                                title="Hapus baris"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Source Rack Input */}
                            <div className="relative flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={row.fromInput}
                                  onFocus={() => setActiveBatchDropdown({ rowId: row.id, field: 'from' })}
                                  onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    setBatchRoutes((prev) =>
                                      prev.map((x) => (x.id === row.id ? { ...x, fromInput: val } : x))
                                    );
                                    setActiveBatchDropdown({ rowId: row.id, field: 'from' });
                                    setIsConfirming(false);
                                  }}
                                  placeholder="Rak Asal (mis. R116)"
                                  className="w-full px-3 py-1.5 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                                />
                                {row.cleanFrom && !isInvalidLocationToken(row.cleanFrom) && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border shrink-0 ${getAreaBadgeClass(row.fromArea)}`}>
                                    {row.fromArea}
                                  </span>
                                )}
                              </div>

                              {fromSuggestionsList.length > 0 && (
                                <div className="absolute left-0 right-0 top-9 z-40 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                                  {fromSuggestionsList.map((s) => (
                                    <button
                                      key={s.lokasi}
                                      type="button"
                                      onClick={() => {
                                        setBatchRoutes((prev) =>
                                          prev.map((x) => (x.id === row.id ? { ...x, fromInput: s.lokasi } : x))
                                        );
                                        setActiveBatchDropdown(null);
                                        setIsConfirming(false);
                                      }}
                                      className="w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-2 text-xs cursor-pointer"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-black text-slate-900 dark:text-white">{s.lokasi}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getAreaBadgeClass(s.area)}`}>{s.area}</span>
                                      </div>
                                      <span className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">{s.qty} pcs</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-center text-slate-400 shrink-0">
                              <ArrowRight className="w-4 h-4 hidden md:block" />
                              <ArrowDown className="w-3.5 h-3.5 md:hidden" />
                            </div>

                            {/* Target Rack Input */}
                            <div className="relative flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={row.toInput}
                                  onFocus={() => setActiveBatchDropdown({ rowId: row.id, field: 'to' })}
                                  onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    setBatchRoutes((prev) =>
                                      prev.map((x) => (x.id === row.id ? { ...x, toInput: val } : x))
                                    );
                                    setActiveBatchDropdown({ rowId: row.id, field: 'to' });
                                    setIsConfirming(false);
                                  }}
                                  placeholder="Rak Tujuan (mis. R086)"
                                  className="w-full px-3 py-1.5 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                                />
                                {row.cleanTo && !isInvalidLocationToken(row.cleanTo) && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border shrink-0 ${getAreaBadgeClass(row.toArea)}`}>
                                    {row.toArea}
                                  </span>
                                )}
                              </div>

                              {toSuggestionsList.length > 0 && (
                                <div className="absolute left-0 right-0 top-9 z-40 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                                  {toSuggestionsList.map((s) => (
                                    <button
                                      key={s.lokasi}
                                      type="button"
                                      onClick={() => {
                                        setBatchRoutes((prev) =>
                                          prev.map((x) => (x.id === row.id ? { ...x, toInput: s.lokasi } : x))
                                        );
                                        setActiveBatchDropdown(null);
                                        setIsConfirming(false);
                                      }}
                                      className="w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-2 text-xs cursor-pointer"
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-black text-slate-900 dark:text-white">{s.lokasi}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getAreaBadgeClass(s.area)}`}>{s.area}</span>
                                      </div>
                                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                        {s.currentQty === 0 ? `Kosong (Max ${s.maxCapacity})` : `${s.currentQty}/${s.maxCapacity} pcs`}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Delete Row Button (Desktop) */}
                            <button
                              type="button"
                              disabled={batchRoutes.length <= 1 || isExecuting}
                              onClick={() => {
                                setBatchRoutes((prev) => prev.filter((x) => x.id !== row.id));
                                setIsConfirming(false);
                              }}
                              className="hidden md:flex p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 cursor-pointer shrink-0"
                              title="Hapus baris rute"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Per-Row Status & Capacity Bar */}
                          {!row.isBlank && (
                            <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/70 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                {pLoading ? (
                                  <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Memeriksa stok {row.cleanFrom}...
                                  </span>
                                ) : row.rowError ? (
                                  <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                    {row.rowError}
                                  </span>
                                ) : pData ? (
                                  <>
                                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                                      {pData.totalSkus} SKU ({pData.totalPcs} pcs)
                                    </span>
                                    {row.cleanTo && row.toArea !== 'Anomali' && (
                                      <span
                                        className={`font-mono ${
                                          targetAfterQty > targetMaxCap
                                            ? 'text-amber-600 dark:text-amber-400 font-bold'
                                            : 'text-slate-500 dark:text-slate-400'
                                        }`}
                                      >
                                        · Tujuan {row.cleanTo}: {targetBaseQty} → {targetAfterQty}/{targetMaxCap} pcs
                                      </span>
                                    )}
                                    {pData.pendingSoCount > 0 && (
                                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                        · {pData.pendingSoCount} SO Pending
                                      </span>
                                    )}
                                    {pData.negativeAnomalyItems.length > 0 && (
                                      <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                        · {pData.negativeAnomalyItems.length} SKU minus dilewati
                                      </span>
                                    )}
                                  </>
                                ) : null}
                              </div>

                              {pData && pData.items.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedBatchRowId(isExpanded ? null : row.id)}
                                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                                >
                                  <span>{isExpanded ? 'Tutup SKU' : 'Lihat SKU'}</span>
                                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          )}

                          {/* Expandable SKU Preview for This Row */}
                          {isExpanded && pData && pData.items.length > 0 && (
                            <div className="mt-2 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                              {pData.items.map((it) => (
                                <div key={it.sku} className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                                  <div className="min-w-0 truncate">
                                    <span className="font-bold text-slate-900 dark:text-white">{it.nama_produk}</span>{' '}
                                    <span className="font-mono text-slate-500">
                                      ({it.sku}{it.size && it.size !== '-' ? ` · ${it.size}` : ''})
                                    </span>
                                  </div>
                                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                                    {it.totalQty} pcs
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ==============================================================
                   SINGLE-TARGET BUILDER (EXISTING)
                   ============================================================== */
                <>
              {/* 1. Source & Destination Location Pickers */}
              <div className="grid grid-cols-1 md:grid-cols-11 gap-2.5 items-stretch">
                {/* SOURCE LOCATION */}
                <div
                  ref={fromBoxRef}
                  className="md:col-span-5 relative p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      <span>
                        {isMultiSourceMode
                          ? `1. Multi-Rak Asal (${multiFromLocations.length} rak)`
                          : '1. Lokasi Asal (#OUT)'}
                      </span>
                    </label>
                    {isMultiSourceMode ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMultiFromLocations([]);
                          setFromInput('');
                          setPreview(null);
                        }}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Ubah ke 1 Rak
                      </button>
                    ) : (
                      cleanFrom &&
                      !isInvalidLocationToken(cleanFrom) && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getAreaBadgeClass(
                            fromArea
                          )}`}
                        >
                          {fromArea}
                        </span>
                      )
                    )}
                  </div>

                  {isMultiSourceMode ? (
                    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 max-h-24 overflow-y-auto">
                      {multiFromLocations.map((loc) => (
                        <span
                          key={loc}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-mono font-bold"
                        >
                          <span>{loc}</span>
                          {!isExecuting && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = multiFromLocations.filter((x) => x !== loc);
                                if (next.length <= 1) {
                                  setMultiFromLocations([]);
                                  setFromInput(next[0] || '');
                                } else {
                                  setMultiFromLocations(next);
                                  setFromInput(next.join(', '));
                                }
                              }}
                              className="text-indigo-500 hover:text-rose-600 cursor-pointer"
                              title={`Keluarkan ${loc}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="relative flex items-center gap-1.5">
                      <input
                        type="text"
                        value={fromInput}
                        onFocus={() => setShowFromDropdown(true)}
                        onChange={(e) => {
                          setFromInput(e.target.value.toUpperCase());
                          setShowFromDropdown(true);
                          setIsConfirming(false);
                        }}
                        placeholder="Ketik rak asal, misal: X105"
                        className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                      />
                      {fromInput && (
                        <button
                          type="button"
                          onClick={() => loadSourcePreview(fromInput, [])}
                          disabled={isLoadingPreview}
                          className="p-2 rounded-xl bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 cursor-pointer shrink-0"
                          title="Muat ulang stok rak asal"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>
                  )}

                  {!isMultiSourceMode && showFromDropdown && sourceSuggestions.length > 0 && (
                    <div className="absolute left-3 right-3 top-[78px] z-30 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {sourceSuggestions.map((s) => (
                        <button
                          key={s.lokasi}
                          type="button"
                          onClick={() => {
                            setFromInput(s.lokasi);
                            setShowFromDropdown(false);
                            setIsConfirming(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-2 text-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-black text-slate-900 dark:text-white">
                              {s.lokasi}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getAreaBadgeClass(
                                s.area
                              )}`}
                            >
                              {s.area}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                            {s.qty} pcs
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 min-h-[16px]">
                    {isLoadingPreview ? (
                      <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Memeriksa stok langsung di database...
                      </span>
                    ) : preview ? (
                      <span className="font-mono tabular-nums">
                        Ditemukan <strong className="text-slate-800 dark:text-slate-200">{preview.totalSkus} SKU</strong> ({preview.totalPcs} pcs)
                      </span>
                    ) : (
                      <span>Pilih atau ketik kode rak yang berisi barang.</span>
                    )}
                  </div>
                </div>

                {/* CENTER SWAP / ARROW */}
                <div className="md:col-span-1 flex items-center justify-center">
                  <button
                    type="button"
                    disabled={isMultiSourceMode}
                    onClick={handleSwapLocations}
                    className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                    title={isMultiSourceMode ? 'Mode multi-rak asal' : 'Tukar lokasi asal dan tujuan'}
                  >
                    <ArrowRight className="w-4 h-4 hidden md:block" />
                    <ArrowDown className="w-4 h-4 md:hidden" />
                  </button>
                </div>

                {/* TARGET LOCATION */}
                <div
                  ref={toBoxRef}
                  className="md:col-span-5 relative p-3.5 rounded-xl bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                      <span>2. Lokasi Tujuan (#IN)</span>
                    </label>
                    {cleanTo && !isInvalidLocationToken(cleanTo) && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getAreaBadgeClass(
                          toArea
                        )}`}
                      >
                        {toArea}
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={toInput}
                    onFocus={() => setShowToDropdown(true)}
                    onChange={(e) => {
                      setToInput(e.target.value.toUpperCase());
                      setShowToDropdown(true);
                      setIsConfirming(false);
                    }}
                    placeholder="Ketik rak tujuan, misal: V004"
                    className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                  />

                  {showToDropdown && targetSuggestions.length > 0 && (
                    <div className="absolute left-3 right-3 top-[78px] z-30 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {targetSuggestions.map((s) => (
                        <button
                          key={s.lokasi}
                          type="button"
                          onClick={() => {
                            setToInput(s.lokasi);
                            setShowToDropdown(false);
                            setIsConfirming(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-2 text-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-black text-slate-900 dark:text-white">
                              {s.lokasi}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getAreaBadgeClass(
                                s.area
                              )}`}
                            >
                              {s.area}
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                            {s.currentQty === 0
                              ? `Kosong (Max ${s.maxCapacity})`
                              : `${s.currentQty}/${s.maxCapacity} pcs`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Target capacity bar simulation */}
                  <div className="text-[11px] min-h-[16px]">
                    {cleanTo && toArea === 'Anomali' ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        Kode rak tidak dikenali denah (Anomali).
                      </span>
                    ) : targetSlotInfo ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                          <span className="text-slate-500 dark:text-slate-400">
                            Kapasitas tujuan: {targetSlotInfo.currentQty} →{' '}
                            <strong
                              className={
                                targetSlotInfo.isOverloadAfter
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }
                            >
                              {targetSlotInfo.afterQty} / {targetSlotInfo.maxCapacity} pcs
                            </strong>
                          </span>
                          <span
                            className={`font-bold ${
                              targetSlotInfo.isOverloadAfter
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {targetSlotInfo.afterPct}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full origin-left transition-transform duration-200 ${
                              targetSlotInfo.isOverloadAfter
                                ? 'bg-rose-500'
                                : targetSlotInfo.afterPct >= 85
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{
                              transform: `scaleX(${Math.min(1, targetSlotInfo.afterPct / 100)})`,
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">
                        Masukkan kode rak tujuan (contoh: V004, R012, A005).
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Warnings (Overload / Pending SO / Negative Anomalies) */}
              {targetSlotInfo?.isOverloadAfter && relocationPlan.movedTotalPcs > 0 && (
                <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Peringatan Kapasitas Tujuan:</span> Total isi{' '}
                    <span className="font-mono font-bold">{cleanTo}</span> akan menjadi{' '}
                    <span className="font-mono font-bold">{targetSlotInfo.afterQty} pcs</span> (melebihi batas default{' '}
                    <span className="font-mono">{targetSlotInfo.maxCapacity} pcs</span>). Tetap bisa diproses jika secara fisik rak muat.
                  </div>
                </div>
              )}

              {preview && preview.pendingSoCount > 0 && (
                <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    Terdapat <strong className="font-mono">{preview.pendingSoCount}</strong> antrian Stock Opname (SO) berstatus PENDING di lokasi{' '}
                    <strong className="font-mono">{sourceDisplayLabel}</strong>. Pastikan tim sudah mengetahui pemindahan ini sebelum approve SO lama.
                  </div>
                </div>
              )}

              {preview && preview.negativeAnomalyItems.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200">
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold">
                      {preview.negativeAnomalyItems.length} SKU di {sourceDisplayLabel} memiliki stok minus (anomali) dan tidak ikut dipindahkan:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {preview.negativeAnomalyItems.slice(0, 6).map((neg, i) => (
                        <span
                          key={`${neg.sku}_${i}`}
                          className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900 border border-rose-200 dark:border-rose-800 font-mono text-[11px]"
                        >
                          {neg.sku} ({neg.sisa_stok} pcs)
                        </span>
                      ))}
                      {preview.negativeAnomalyItems.length > 6 && (
                        <span className="text-[11px] opacity-80">
                          +{preview.negativeAnomalyItems.length - 6} lainnya
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Mode Toggle & Source Items Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#131d31]">
                <div className="p-3 bg-slate-50 dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  {/* Mode Switcher */}
                  <div className="inline-flex p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 self-start">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('FULL');
                        setIsConfirming(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                        effectiveMode === 'FULL'
                          ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Pindah Full (100%)
                    </button>
                    {!isMultiSourceMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('PARTIAL');
                          setIsConfirming(false);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                          effectiveMode === 'PARTIAL'
                            ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Pilih Sebagian
                      </button>
                    )}
                  </div>

                  {/* Filter items + partial quick helpers */}
                  <div className="flex flex-wrap items-center gap-2">
                    {effectiveMode === 'PARTIAL' && preview && preview.items.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTogglePartialAll(true)}
                          className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                        >
                          Pilih Semua
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePartialAll(false)}
                          className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                        >
                          Reset 0
                        </button>
                      </div>
                    )}

                    <div className="relative flex-1 sm:w-52">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="Cari SKU / produk..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Items List Body */}
                {isLoadingPreview ? (
                  <div className="p-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    <span>Mengambil stok fisik terkini dari {sourceDisplayLabel}...</span>
                  </div>
                ) : previewError ? (
                  <div className="p-6 text-center text-xs text-rose-600 dark:text-rose-400">
                    {previewError}
                  </div>
                ) : !isMultiSourceMode && (!cleanFrom || isInvalidLocationToken(cleanFrom)) ? (
                  <div className="p-10 text-center space-y-1.5">
                    <Boxes className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Pilih Lokasi Asal Terlebih Dahulu
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Daftar SKU dan kuantitas fisik di rak asal akan muncul otomatis di sini.
                    </p>
                  </div>
                ) : !preview || preview.items.length === 0 ? (
                  <div className="p-10 text-center space-y-1.5">
                    <Package className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Lokasi {sourceDisplayLabel} Kosong (0 pcs)
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Tidak ditemukan stok fisik positif (&gt; 0 pcs) di lokasi {sourceDisplayLabel}.
                    </p>
                  </div>
                ) : filteredPreviewItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Tidak ada SKU yang cocok dengan pencarian &ldquo;{itemSearch}&rdquo;.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50/90 dark:bg-[#0b1324] sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase font-extrabold text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="py-2 px-3">Produk &amp; SKU</th>
                          <th className="py-2 px-2.5 text-center w-16">Size</th>
                          <th className="py-2 px-2.5 text-right w-20">Stok Asal</th>
                          <th className="py-2 px-2.5 text-right w-28">Qty Pindah</th>
                          <th className="py-2 px-3 text-right w-20">Sisa Asal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredPreviewItems.map((it) => {
                          const remain = it.maxQty - it.moveQty;
                          return (
                            <tr
                              key={it.sku}
                              className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/30 ${
                                it.moveQty === 0 ? 'opacity-50' : ''
                              }`}
                            >
                              <td className="py-2 px-3">
                                <div className="font-bold text-slate-900 dark:text-white leading-snug">
                                  {it.nama_produk}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  {it.sku}
                                </div>
                              </td>
                              <td className="py-2 px-2.5 text-center">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                  {it.size}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                                {it.maxQty}
                              </td>
                              <td className="py-2 px-2.5 text-right">
                                {effectiveMode === 'FULL' ? (
                                  <span className="font-mono tabular-nums font-black text-indigo-600 dark:text-indigo-400">
                                    {it.moveQty} pcs
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="checkbox"
                                      checked={it.moveQty > 0}
                                      onChange={(e) => {
                                        setPartialQtys((prev) => ({
                                          ...prev,
                                          [it.sku]: e.target.checked ? it.maxQty : 0,
                                        }));
                                        setIsConfirming(false);
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      max={it.maxQty}
                                      value={it.moveQty}
                                      onChange={(e) => {
                                        const val = Math.max(
                                          0,
                                          Math.min(it.maxQty, Math.floor(Number(e.target.value) || 0))
                                        );
                                        setPartialQtys((prev) => ({
                                          ...prev,
                                          [it.sku]: val,
                                        }));
                                        setIsConfirming(false);
                                      }}
                                      className="w-14 px-1.5 py-1 text-right font-mono tabular-nums font-bold text-xs bg-white dark:bg-[#0b1324] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                    />
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono tabular-nums font-bold">
                                <span
                                  className={
                                    remain === 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-slate-600 dark:text-slate-300'
                                  }
                                >
                                  {remain}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
                </>
              )}

              {/* 3. Notes */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                  Catatan Relokasi (Opsional — tercatat di Log Mutasi):
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    relocationScope === 'MULTI_ROUTE'
                      ? 'Contoh: Penataan ulang rak kolian ke lokasi baru'
                      : sourceDisplayLabel && cleanTo
                      ? `Contoh: Pindah ${effectiveMode === 'FULL' ? 'full' : 'sebagian'} isi rak ${sourceDisplayLabel} ke ${cleanTo}`
                      : 'Contoh: Penataan ulang area / konsolidasi koli'
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Inline Confirmation Bar */}
              {isConfirming && !validationError && (
                <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  {relocationScope === 'MULTI_ROUTE' ? (
                    <div className="text-indigo-950 dark:text-indigo-100">
                      <span className="font-black">Konfirmasi Eksekusi Multi-Rute:</span> Pindahkan{' '}
                      <strong className="font-mono">
                        {batchPlanSummary.readyRoutes.length} rute ({batchPlanSummary.totalSkus} SKU · {batchPlanSummary.totalPcs} pcs)
                      </strong>{' '}
                      sekaligus ({batchPlanSummary.readyRoutes.map((r) => `${r.cleanFrom} → ${r.cleanTo}`).join(', ')})?
                    </div>
                  ) : (
                    <div className="text-indigo-950 dark:text-indigo-100">
                      <span className="font-black">Konfirmasi Eksekusi:</span> Pindahkan{' '}
                      <strong className="font-mono">
                        {relocationPlan.movedSkuCount} SKU ({relocationPlan.movedTotalPcs} pcs)
                      </strong>{' '}
                      dari <strong className="font-mono">{sourceDisplayLabel}</strong> ke{' '}
                      <strong className="font-mono">{cleanTo}</strong>?
                      {relocationPlan.remainingAtSourcePcs === 0 && (
                        <span className="ml-1 text-emerald-700 dark:text-emerald-300 font-bold">
                          ({isMultiSourceMode ? `${multiFromLocations.length} rak asal` : `Rak ${cleanFrom}`} akan menjadi 0 pcs)
                        </span>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsConfirming(false)}
                    disabled={isExecuting}
                    className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:underline self-start sm:self-auto cursor-pointer shrink-0"
                  >
                    Ubah Pilihan
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0f172a]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {executionResult || batchExecutionResult ? (
            <>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Stok database dan tampilan rak telah diperbarui.
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setExecutionResult(null);
                    setBatchExecutionResult(null);
                    setMultiFromLocations([]);
                    setFromInput('');
                    setToInput('');
                    setPreview(null);
                    setBatchRoutes([
                      { id: makeBatchRowId(), fromInput: '', toInput: '' },
                      { id: makeBatchRowId(), fromInput: '', toInput: '' },
                      { id: makeBatchRowId(), fromInput: '', toInput: '' },
                    ]);
                    setBatchPreviewCache({});
                    batchFetchingRef.current.clear();
                    setNotes('');
                  }}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Relokasi Lain</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                >
                  Selesai &amp; Tutup
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {validationError ? (
                  <span className="font-sans text-amber-600 dark:text-amber-400 font-semibold">
                    {validationError}
                  </span>
                ) : relocationScope === 'MULTI_ROUTE' ? (
                  batchPlanSummary.isAnyLoading ? (
                    <span className="font-sans text-indigo-600 dark:text-indigo-400">
                      Memeriksa stok rak asal...
                    </span>
                  ) : (
                    <span>
                      {batchPlanSummary.readyRoutes.length} rute siap · {batchPlanSummary.totalSkus} SKU ({batchPlanSummary.totalPcs} pcs)
                    </span>
                  )
                ) : (
                  <span>
                    {sourceDisplayLabel} (Sisa {relocationPlan.remainingAtSourcePcs} pcs) → {cleanTo} (+
                    {relocationPlan.movedTotalPcs} pcs)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isExecuting}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={
                    Boolean(validationError) ||
                    isExecuting ||
                    (relocationScope === 'MULTI_ROUTE' ? batchPlanSummary.isAnyLoading : isLoadingPreview)
                  }
                  className={`flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isConfirming
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                  }`}
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : isConfirming ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {relocationScope === 'MULTI_ROUTE'
                          ? `Ya, Eksekusi ${batchPlanSummary.readyRoutes.length} Rute (${batchPlanSummary.totalPcs} pcs)`
                          : `Ya, Eksekusi Relokasi (${relocationPlan.movedTotalPcs} pcs)`}
                      </span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>
                        {relocationScope === 'MULTI_ROUTE'
                          ? `Eksekusi ${batchPlanSummary.readyRoutes.length} Rute (${batchPlanSummary.totalPcs} pcs)`
                          : `${effectiveMode === 'FULL' ? 'Pindah Full' : 'Pindah Terpilih'} (${relocationPlan.movedTotalPcs} pcs)`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
