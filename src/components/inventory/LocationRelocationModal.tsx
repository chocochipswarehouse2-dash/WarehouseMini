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
} from 'lucide-react';
import type { ProductItem, StockRealtimeItem, UserSession } from '../../types';
import { getAreaFromLokasi, normalizeLokasi, fetchDistinctDatabaseLocations } from '../../services/supabase';
import {
  computeAllRackSlots,
  loadLocalRackCapacityConfig,
  type ComputedRackSlot,
  type EnrichedCatalogEntry,
} from '../../services/rackCapacityService';
import {
  cleanProductName,
  inferCategoryFromProductName,
  lookupCategoryByName,
  resolveProductDisplaySize,
  resolveProductName,
} from '../../utils/sortUtils';
import {
  fetchLocationRelocationPreview,
  fetchMultiLocationRelocationPreview,
  executeLocationRelocation,
  isInvalidLocationToken,
  type RelocationPreviewResult,
  type ExecuteLocationRelocationResult,
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
  onSuccess?: (result: ExecuteLocationRelocationResult) => void;
}

type RelocationMode = 'FULL' | 'PARTIAL';

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
  // Build catalog map if needed
  const catalogMap = useMemo(() => {
    const map = new Map<string, EnrichedCatalogEntry>();
    for (let i = 0; i < productCatalog.length; i++) {
      const item = productCatalog[i];
      if (!item) continue;
      const sku = String(item.k || (item as Record<string, unknown>).sku || '')
        .trim()
        .toUpperCase();
      if (!sku) continue;
      const rawName = String(
        item.n || item.p || (item as Record<string, unknown>).nama_produk || sku
      ).trim();
      const nama_produk =
        resolveProductName(sku, rawName, item as any) || cleanProductName(rawName) || rawName || sku;
      const rawMasterSize = String(item.s || (item as Record<string, unknown>).size || '');
      const size = resolveProductDisplaySize(sku, rawMasterSize, rawMasterSize) || '-';
      const rawCat = String(
        (item as Record<string, unknown>).kategori ||
          item.category ||
          item.c ||
          (item as Record<string, unknown>).jenis ||
          ''
      ).trim();
      const kategori =
        rawCat && rawCat !== '-' && rawCat.toUpperCase() !== 'PHYSICAL STOCK'
          ? rawCat
          : lookupCategoryByName(nama_produk) || inferCategoryFromProductName(nama_produk) || 'CLOTHING';
      map.set(sku, { sku, nama_produk, size, kategori });
    }
    return map;
  }, [productCatalog]);

  // Compute slots fallback when not supplied by RackCapacityDashboard
  const effectiveSlots = useMemo(() => {
    if (rackSlots && rackSlots.length > 0) return rackSlots;
    const config = loadLocalRackCapacityConfig();
    return computeAllRackSlots(config, stockRows, [], catalogMap);
  }, [rackSlots, stockRows, catalogMap]);

  const slotByLokasi = useMemo(() => {
    const map = new Map<string, ComputedRackSlot>();
    for (const s of effectiveSlots) {
      map.set(s.lokasi.toUpperCase(), s);
    }
    return map;
  }, [effectiveSlots]);

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
  const [fromInput, setFromInput] = useState('');
  const [multiFromLocations, setMultiFromLocations] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [mode, setMode] = useState<RelocationMode>('FULL');
  const [notes, setNotes] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Dropdown visibility states
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const fromBoxRef = useRef<HTMLDivElement>(null);
  const toBoxRef = useRef<HTMLDivElement>(null);

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

    if (multiList.length > 1) {
      setMultiFromLocations(multiList);
      setFromInput(multiList.join(', '));
    } else {
      setMultiFromLocations([]);
      const initFrom = (multiList[0] || initialFromLocation || '').trim().toUpperCase();
      setFromInput(initFrom);
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
  }, [effectiveSlots, stockRows, fromInput]);

  // Target dropdown options (prioritize empty / available slots, exclude source location)
  const targetSuggestions = useMemo(() => {
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
  }, [effectiveSlots, dbLocations, cleanFrom, toInput]);

  // Calculate active items to relocate
  const relocationPlan = useMemo(() => {
    if (!preview) {
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
  }, [preview, effectiveMode, partialQtys]);

  const filteredPreviewItems = useMemo(() => {
    const q = itemSearch.trim().toUpperCase();
    if (!q) return relocationPlan.itemsToMove;
    return relocationPlan.itemsToMove.filter(
      (it) =>
        it.sku.toUpperCase().includes(q) ||
        it.nama_produk.toUpperCase().includes(q) ||
        it.size.toUpperCase().includes(q)
    );
  }, [relocationPlan.itemsToMove, itemSearch]);

  // Target rack capacity simulation
  const targetSlotInfo = useMemo(() => {
    if (!cleanTo || toArea === 'Anomali') return null;
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
  }, [cleanTo, toArea, slotByLokasi, relocationPlan.movedTotalPcs]);

  // Validation
  const validationError = useMemo(() => {
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
  }, [isMultiSourceMode, multiFromLocations, cleanFrom, cleanTo, toArea, preview, relocationPlan.movedTotalPcs]);

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
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    setIsExecuting(true);
    try {
      const operatorName = session?.name || session?.username || 'Admin';
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
          {executionResult ? (
            /* ================================================================
               SUCCESS RESULT VIEW
               ================================================================ */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                      Relokasi Stok Berhasil Dicatat ke Ledger!
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
                    sourceDisplayLabel && cleanTo
                      ? `Contoh: Pindah ${effectiveMode === 'FULL' ? 'full' : 'sebagian'} isi rak ${sourceDisplayLabel} ke ${cleanTo}`
                      : 'Contoh: Penataan ulang area / konsolidasi koli'
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Inline Confirmation Bar */}
              {isConfirming && !validationError && (
                <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
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
          {executionResult ? (
            <>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Stok database dan tampilan rak otomatis diperbarui.
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setExecutionResult(null);
                    setMultiFromLocations([]);
                    setFromInput('');
                    setToInput('');
                    setPreview(null);
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
                  disabled={Boolean(validationError) || isExecuting || isLoadingPreview}
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
                      <span>Ya, Eksekusi Relokasi ({relocationPlan.movedTotalPcs} pcs)</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>
                        {effectiveMode === 'FULL' ? 'Pindah Full' : 'Pindah Terpilih'} (
                        {relocationPlan.movedTotalPcs} pcs)
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
