import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Sliders,
  LayoutGrid,
  List,
  Search,
  Plus,
  Trash2,
  Save,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowRightLeft,
  Sparkles,
  Copy,
  Check,
  MapPin,
  Package,
  RefreshCw,
  Edit3,
  ArrowRight,
  History,
  RotateCcw,
  Printer,
  Send,
  Boxes,
  FileText,
  Archive,
} from 'lucide-react';
import type { StockRealtimeItem, UserSession, LogProdukItem, ProductItem } from '../../types';
import { supabaseFetch } from '../../services/supabase';
import { cleanProductName, extractCleanSizeToken, extractSizeFromSku } from '../../utils/sortUtils';
import {
  type RackCapacityConfig,
  type RackZoneRule,
  type RackZoneColor,
  type ComputedRackSlot,
  type SimulationMove,
  type RackStatusLevel,
  type EnrichedCatalogEntry,
  loadLocalRackCapacityConfig,
  fetchRackCapacityConfig,
  persistRackCapacityConfig,
  computeAllRackSlots,
  getRecommendedNearbyRacks,
  getDefaultRackCapacityConfig,
  isExcludedFromWarehouseRelocation,
  getKoliToAbcdRefillSummary,
  generateConsolidatedKoliRefillMoves,
  generateConsolidatedOverloadMoves,
  getScatteredSkuSummary,
  generateConsolidatedSkuScatteredMoves,
  type ScatteredSkuSummary,
  getAbcdToKoliEvacuationSummary,
  generateConsolidatedAbcdToKoliMoves,
  type AbcdToKoliRuleConfig,
  DEFAULT_ABCD_TO_KOLI_RULE,
} from '../../services/rackCapacityService';

interface RackCapacityDashboardProps {
  stockRows: StockRealtimeItem[];
  productCatalog?: ProductItem[];
  session?: UserSession | null;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onOpenPrintModal?: (lokasi: string) => void;
  onRefreshStock?: () => void;
  isRefreshingStock?: boolean;
}

type ViewMode = 'GRID' | 'TABLE';
type StatusFilter = 'ALL' | 'OVERLOAD' | 'WARNING_FULL' | 'SAFE' | 'EMPTY';
type SetupTab = 'ZONES' | 'SINGLE_OVERRIDE' | 'ADD_ZONE' | 'BUFFER_RULES';

const COLOR_STYLES: Record<
  RackZoneColor,
  {
    border: string;
    bgSoft: string;
    bar: string;
    text: string;
  }
> = {
  rose: {
    border: 'border-rose-200 dark:border-rose-900/60',
    bgSoft: 'bg-rose-50/70 dark:bg-rose-950/20',
    bar: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
  },
  blue: {
    border: 'border-blue-200 dark:border-blue-900/60',
    bgSoft: 'bg-blue-50/70 dark:bg-blue-950/20',
    bar: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
  },
  emerald: {
    border: 'border-emerald-200 dark:border-emerald-900/60',
    bgSoft: 'bg-emerald-50/70 dark:bg-emerald-950/20',
    bar: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    border: 'border-amber-200 dark:border-amber-900/60',
    bgSoft: 'bg-amber-50/70 dark:bg-amber-950/20',
    bar: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
  },
  purple: {
    border: 'border-purple-200 dark:border-purple-900/60',
    bgSoft: 'bg-purple-50/70 dark:bg-purple-950/20',
    bar: 'bg-purple-500',
    text: 'text-purple-600 dark:text-purple-400',
  },
  cyan: {
    border: 'border-cyan-200 dark:border-cyan-900/60',
    bgSoft: 'bg-cyan-50/70 dark:bg-cyan-950/20',
    bar: 'bg-cyan-500',
    text: 'text-cyan-600 dark:text-cyan-400',
  },
  slate: {
    border: 'border-slate-200 dark:border-slate-800',
    bgSoft: 'bg-slate-50 dark:bg-slate-900/40',
    bar: 'bg-slate-500',
    text: 'text-slate-600 dark:text-slate-400',
  },
};

function getStatusVisual(status: RackStatusLevel) {
  switch (status) {
    case 'OVERLOAD':
      return {
        label: 'Overload',
        cardBorder: 'border-rose-500 dark:border-rose-500 ring-2 ring-rose-500/30',
        liquidBg: 'bg-rose-500/20 dark:bg-rose-500/25',
        barBg: 'bg-rose-600',
        textColor: 'text-rose-600 dark:text-rose-400',
        pulseClass: 'animate-pulse',
      };
    case 'FULL':
      return {
        label: 'Penuh (100%)',
        cardBorder: 'border-rose-300 dark:border-rose-800',
        liquidBg: 'bg-rose-500/15 dark:bg-rose-500/20',
        barBg: 'bg-rose-500',
        textColor: 'text-rose-600 dark:text-rose-400',
        pulseClass: '',
      };
    case 'WARNING':
      return {
        label: 'Hampir Penuh',
        cardBorder: 'border-amber-300 dark:border-amber-800',
        liquidBg: 'bg-amber-500/15 dark:bg-amber-500/20',
        barBg: 'bg-amber-500',
        textColor: 'text-amber-600 dark:text-amber-400',
        pulseClass: '',
      };
    case 'SAFE':
      return {
        label: 'Tersedia',
        cardBorder: 'border-emerald-300/80 dark:border-emerald-800/80',
        liquidBg: 'bg-emerald-500/12 dark:bg-emerald-500/15',
        barBg: 'bg-emerald-500',
        textColor: 'text-emerald-600 dark:text-emerald-400',
        pulseClass: '',
      };
    case 'EMPTY':
    default:
      return {
        label: 'Kosong',
        cardBorder: 'border-slate-200 dark:border-slate-800',
        liquidBg: 'bg-transparent',
        barBg: 'bg-slate-300 dark:bg-slate-700',
        textColor: 'text-slate-400 dark:text-slate-500',
        pulseClass: '',
      };
  }
}

export const RackCapacityDashboard: React.FC<RackCapacityDashboardProps> = ({
  stockRows,
  productCatalog = [],
  session,
  onNotify,
  onOpenPrintModal,
  onRefreshStock,
  isRefreshingStock,
}) => {
  const [config, setConfig] = useState<RackCapacityConfig>(() => loadLocalRackCapacityConfig());
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Filters & View State
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [selectedArea, setSelectedArea] = useState<string>('ALL');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Rack for Detail Drawer
  const [selectedRackLokasi, setSelectedRackLokasi] = useState<string | null>(null);
  const [rackLogs, setRackLogs] = useState<LogProdukItem[]>([]);
  const [loadingRackLogs, setLoadingRackLogs] = useState(false);

  // Quick Edit in Drawer or Table
  const [editCapValue, setEditCapValue] = useState<number>(25);
  const [editCatValue, setEditCatValue] = useState<string>('');
  const [editNotesValue, setEditNotesValue] = useState<string>('');
  const [inlineEditingLoc, setInlineEditingLoc] = useState<string | null>(null);
  const [inlineEditCap, setInlineEditCap] = useState<number>(25);

  // Setup Modal State
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [setupTab, setSetupTab] = useState<SetupTab>('ZONES');
  const [draftZones, setDraftZones] = useState<RackZoneRule[]>([]);
  const [singleOverrideLoc, setSingleOverrideLoc] = useState('');
  const [singleOverrideCap, setSingleOverrideCap] = useState<number>(25);
  const [singleOverrideCat, setSingleOverrideCat] = useState('');
  const [singleOverrideArea, setSingleOverrideArea] = useState('Warehouse');

  // New Zone Form State
  const [newZoneArea, setNewZoneArea] = useState('Warehouse');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZonePrefix, setNewZonePrefix] = useState('');
  const [newZoneStart, setNewZoneStart] = useState<number>(1);
  const [newZoneEnd, setNewZoneEnd] = useState<number>(50);
  const [newZonePad, setNewZonePad] = useState<number>(3);
  const [newZoneCat, setNewZoneCat] = useState('');
  const [newZoneCap, setNewZoneCap] = useState<number>(30);
  const [newZoneColor, setNewZoneColor] = useState<RackZoneColor>('blue');

  // Rekomendasi Pindah & Refill Rak State
  const [simulationMoves, setSimulationMoves] = useState<SimulationMove[]>([]);
  const [isSimPanelOpen, setIsSimPanelOpen] = useState(false);
  const [simFromLoc, setSimFromLoc] = useState('');
  const [simToLoc, setSimToLoc] = useState('');
  const [simSku, setSimSku] = useState('');
  const [simQty, setSimQty] = useState<number>(1);
  const [copiedSimText, setCopiedSimText] = useState(false);
  const [isSjPrintModalOpen, setIsSjPrintModalOpen] = useState(false);
  const [evacRule, setEvacRule] = useState<AbcdToKoliRuleConfig>(
    () => config.evacuationRule || DEFAULT_ABCD_TO_KOLI_RULE
  );
  const [showEvacConfig, setShowEvacConfig] = useState(false);

  // Build Master Produk lookup map (SKU -> { nama_produk, size, kategori })
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
      const nama_produk = cleanProductName(rawName) || rawName || sku;
      let size = extractCleanSizeToken(
        String(item.s || (item as Record<string, unknown>).size || '')
      );
      if (!size || size === '-') size = extractSizeFromSku(sku);
      if (!size || size === '-' || size.toUpperCase() === 'DEFAULT') size = 'ALL';
      const kategori = String(
        (item as Record<string, unknown>).kategori ||
          item.category ||
          item.c ||
          (item as Record<string, unknown>).jenis ||
          'Apparel'
      ).trim();
      map.set(sku, { sku, nama_produk, size, kategori });
    }
    return map;
  }, [productCatalog]);

  // Load remote config on mount
  useEffect(() => {
    let mounted = true;
    fetchRackCapacityConfig().then((remote) => {
      if (mounted) {
        setConfig(remote);
        if (remote.evacuationRule) {
          setEvacRule(remote.evacuationRule);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Compute all rack slots in real-time (enriched with Master Produk names & sizes)
  const allSlots = useMemo(
    () => computeAllRackSlots(config, stockRows, simulationMoves, catalogMap),
    [config, stockRows, simulationMoves, catalogMap]
  );

  const slotByLokasi = useMemo(() => {
    const map = new Map<string, ComputedRackSlot>();
    for (const s of allSlots) map.set(s.lokasi, s);
    return map;
  }, [allSlots]);

  const selectedSlot = useMemo(
    () => (selectedRackLokasi ? slotByLokasi.get(selectedRackLokasi) || null : null),
    [selectedRackLokasi, slotByLokasi]
  );

  // Sync drawer quick-edit fields when a rack is selected
  useEffect(() => {
    if (!selectedSlot) return;
    setEditCapValue(selectedSlot.maxCapacity);
    setEditCatValue(selectedSlot.category);
    setEditNotesValue(selectedSlot.notes || '');

    // Load recent mutation logs for this rack from log_produk
    let active = true;
    setLoadingRackLogs(true);
    supabaseFetch<LogProdukItem[]>(
      'log_produk',
      'GET',
      null,
      `lokasi=ilike.${encodeURIComponent(selectedSlot.lokasi)}&order=created_at.desc&limit=15`
    )
      .then((rows) => {
        if (active) setRackLogs(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setRackLogs([]);
      })
      .finally(() => {
        if (active) setLoadingRackLogs(false);
      });

    return () => {
      active = false;
    };
  }, [selectedSlot?.lokasi]);

  // Global KPI & Zone Summaries
  const summaryStats = useMemo(() => {
    let totalCapacity = 0;
    let totalFilled = 0;
    let totalSimulated = 0;
    let emptyCount = 0;
    let safeCount = 0;
    let warningFullCount = 0;
    let overloadCount = 0;

    const zoneStatsMap = new Map<
      string,
      {
        zoneId: string;
        zoneName: string;
        area: string;
        category: string;
        color: RackZoneColor;
        rackCount: number;
        activeRackCount: number;
        overloadRackCount: number;
        emptyRackCount: number;
        currentQty: number;
        maxCapacity: number;
        defaultMaxCapacity: number;
      }
    >();

    // Seed configured zones first so they always appear in order
    for (const z of config.zones) {
      zoneStatsMap.set(z.id, {
        zoneId: z.id,
        zoneName: z.zoneName,
        area: z.area,
        category: z.category,
        color: z.color,
        rackCount: 0,
        activeRackCount: 0,
        overloadRackCount: 0,
        emptyRackCount: 0,
        currentQty: 0,
        maxCapacity: 0,
        defaultMaxCapacity: z.defaultMaxCapacity,
      });
    }

    for (const s of allSlots) {
      totalCapacity += s.maxCapacity;
      totalFilled += s.currentQty;
      totalSimulated += s.simulatedQty;

      // Pure physical status — UI displays real warehouse state
      const effectiveStatus = s.status;
      if (effectiveStatus === 'EMPTY') emptyCount++;
      else if (effectiveStatus === 'SAFE') safeCount++;
      else if (effectiveStatus === 'WARNING' || effectiveStatus === 'FULL') warningFullCount++;
      else if (effectiveStatus === 'OVERLOAD') overloadCount++;

      let zs = zoneStatsMap.get(s.zoneId);
      if (!zs) {
        zs = {
          zoneId: s.zoneId,
          zoneName: s.zoneName,
          area: s.area,
          category: s.category,
          color: s.color,
          rackCount: 0,
          activeRackCount: 0,
          overloadRackCount: 0,
          emptyRackCount: 0,
          currentQty: 0,
          maxCapacity: 0,
          defaultMaxCapacity: s.maxCapacity,
        };
        zoneStatsMap.set(s.zoneId, zs);
      }
      zs.rackCount += 1;
      zs.currentQty += s.currentQty;
      zs.maxCapacity += s.maxCapacity;
      if (effectiveStatus === 'EMPTY') zs.emptyRackCount += 1;
      else zs.activeRackCount += 1;
      if (effectiveStatus === 'OVERLOAD') zs.overloadRackCount += 1;
    }

    const overallPercent = totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0;

    return {
      totalRacks: allSlots.length,
      totalCapacity,
      totalFilled,
      totalSimulated,
      overallPercent,
      emptyCount,
      safeCount,
      warningFullCount,
      overloadCount,
      zones: Array.from(zoneStatsMap.values()).filter((z) => z.rackCount > 0),
    };
  }, [allSlots, config.zones, simulationMoves.length]);

  // Distinct Areas & Categories for Filter
  const availableAreas = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSlots) {
      if (s.area) set.add(s.area);
    }
    return Array.from(set);
  }, [allSlots]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSlots) {
      if (s.category) set.add(s.category);
    }
    return Array.from(set);
  }, [allSlots]);

  // Filtered Racks
  const filteredSlots = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return allSlots.filter((s) => {
      if (selectedArea !== 'ALL' && s.area.toUpperCase() !== selectedArea.toUpperCase()) {
        return false;
      }
      if (selectedZoneId !== 'ALL' && s.zoneId !== selectedZoneId) return false;
      if (selectedCategory !== 'ALL' && s.category.toUpperCase() !== selectedCategory.toUpperCase()) {
        return false;
      }

      const activeStatus = simulationMoves.length > 0 ? s.simulatedStatus : s.status;
      if (statusFilter === 'OVERLOAD' && activeStatus !== 'OVERLOAD') return false;
      if (statusFilter === 'WARNING_FULL' && activeStatus !== 'WARNING' && activeStatus !== 'FULL') {
        return false;
      }
      if (statusFilter === 'SAFE' && activeStatus !== 'SAFE') return false;
      if (statusFilter === 'EMPTY' && activeStatus !== 'EMPTY') return false;

      if (q) {
        const matchLoc = s.lokasi.includes(q);
        const matchCat = s.category.toUpperCase().includes(q);
        const matchArea = s.area.toUpperCase().includes(q);
        const matchSku = s.items.some(
          (it) => it.sku.toUpperCase().includes(q) || it.nama_produk.toUpperCase().includes(q)
        );
        if (!matchLoc && !matchCat && !matchArea && !matchSku) return false;
      }

      return true;
    });
  }, [
    allSlots,
    selectedArea,
    selectedZoneId,
    selectedCategory,
    statusFilter,
    searchQuery,
    simulationMoves.length,
  ]);

  // Nearby empty/available recommendations for selected rack
  const recommendedRacks = useMemo(() => {
    if (!selectedSlot) return [];
    return getRecommendedNearbyRacks(selectedSlot, allSlots, 6);
  }, [selectedSlot, allSlots]);

  // Handlers for saving capacity changes
  const handleSaveSingleRackOverride = async (
    lokasi: string,
    maxCapacity: number,
    category?: string,
    area?: string,
    notes?: string
  ) => {
    const cleanLoc = lokasi.trim().toUpperCase();
    if (!cleanLoc || maxCapacity <= 0) {
      onNotify?.('Lokasi dan kapasitas maksimal (> 0) wajib diisi.', 'warning');
      return;
    }
    setIsSavingConfig(true);
    try {
      const nextOverrides = {
        ...config.overrides,
        [cleanLoc]: {
          lokasi: cleanLoc,
          maxCapacity: Math.round(maxCapacity),
          category: category?.trim() || undefined,
          area: area?.trim() || undefined,
          notes: notes?.trim() || undefined,
        },
      };
      const nextConfig: RackCapacityConfig = {
        ...config,
        overrides: nextOverrides,
      };
      const saved = await persistRackCapacityConfig(
        nextConfig,
        session?.name || session?.username || 'Admin'
      );
      setConfig(saved);
      setInlineEditingLoc(null);
      onNotify?.(`Kapasitas rak ${cleanLoc} disimpan (${maxCapacity} pcs).`, 'success');
    } catch {
      onNotify?.('Tersimpan secara lokal, namun gagal sinkron ke server.', 'warning');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleOpenSetupModal = () => {
    setDraftZones(config.zones.map((z) => ({ ...z })));
    setIsSetupModalOpen(true);
  };

  const handleSaveBulkZones = async () => {
    setIsSavingConfig(true);
    try {
      const nextConfig: RackCapacityConfig = {
        ...config,
        zones: draftZones,
      };
      const saved = await persistRackCapacityConfig(
        nextConfig,
        session?.name || session?.username || 'Admin'
      );
      setConfig(saved);
      setIsSetupModalOpen(false);
      onNotify?.('Konfigurasi kapasitas zona & rak berhasil diperbarui!', 'success');
    } catch {
      onNotify?.('Konfigurasi disimpan di perangkat lokal.', 'warning');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveEvacuationRule = async (ruleToSave: AbcdToKoliRuleConfig) => {
    setIsSavingConfig(true);
    try {
      const nextConfig: RackCapacityConfig = {
        ...config,
        evacuationRule: ruleToSave,
        refillTriggerThreshold: config.refillTriggerThreshold ?? 3,
        safeOccupancyCapPercent: config.safeOccupancyCapPercent ?? 75,
        consolidationDistanceThreshold: config.consolidationDistanceThreshold ?? 3,
        refillMaxPerSkuAbcd: config.refillMaxPerSkuAbcd ?? 12,
      };
      const saved = await persistRackCapacityConfig(
        nextConfig,
        session?.name || session?.username || 'Admin'
      );
      setConfig(saved);
      setEvacRule(ruleToSave);
      onNotify?.(
        `Pengaturan buffer, refill & konsolidasi tersimpan ke database! (Refill ≤ ${nextConfig.refillTriggerThreshold} pcs, Plafon Aman ${nextConfig.safeOccupancyCapPercent}%, Toleransi Jarak ${nextConfig.consolidationDistanceThreshold} rak)`,
        'success'
      );
    } catch {
      onNotify?.('Pengaturan disimpan di penyimpanan lokal.', 'warning');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleAddCustomZone = async () => {
    const prefix = newZonePrefix.trim().toUpperCase();
    const category = newZoneCat.trim() || 'Umum';
    const zoneName =
      newZoneName.trim() ||
      `Lokasi ${prefix} (${prefix}${String(newZoneStart).padStart(newZonePad, '0')} - ${prefix}${String(newZoneEnd).padStart(newZonePad, '0')})`;

    if (!prefix) {
      onNotify?.('Prefix kode rak (misal: E, F, R) wajib diisi.', 'warning');
      return;
    }

    const newRule: RackZoneRule = {
      id: `zone_custom_${Date.now()}`,
      area: newZoneArea.trim() || 'Warehouse',
      zoneName,
      prefix,
      startNum: Math.max(1, newZoneStart),
      endNum: Math.max(newZoneStart, newZoneEnd),
      padLength: Math.max(0, Math.min(4, newZonePad)),
      category,
      defaultMaxCapacity: Math.max(1, newZoneCap),
      color: newZoneColor,
    };

    const nextZones = [...config.zones, newRule];
    setDraftZones(nextZones);
    setIsSavingConfig(true);
    try {
      const saved = await persistRackCapacityConfig(
        { ...config, zones: nextZones },
        session?.name || session?.username || 'Admin'
      );
      setConfig(saved);
      setNewZoneName('');
      setNewZonePrefix('');
      setSetupTab('ZONES');
      onNotify?.(`Zona baru "${zoneName}" berhasil ditambahkan!`, 'success');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleResetDefaultConfig = async () => {
    const def = getDefaultRackCapacityConfig();
    setDraftZones(def.zones);
    const saved = await persistRackCapacityConfig(
      def,
      session?.name || session?.username || 'Admin'
    );
    setConfig(saved);
    onNotify?.('Pengaturan kapasitas dikembalikan ke standar default (A001-D100).', 'info');
  };

  // Summary of SKUs in Koli (R, V, Z) qualifying for refill to ABCD (stock in ABCD <= refillTriggerThreshold)
  const koliRefillSummary = useMemo(
    () =>
      getKoliToAbcdRefillSummary(
        allSlots,
        simulationMoves,
        config.refillTriggerThreshold ?? 3
      ),
    [allSlots, simulationMoves, config.refillTriggerThreshold]
  );

  // Summary of SKUs scattered across distant racks in ABCD (> consolidationDistanceThreshold)
  const scatteredSkuSummary = useMemo(
    () =>
      getScatteredSkuSummary(
        allSlots,
        simulationMoves,
        config.consolidationDistanceThreshold ?? 3
      ),
    [allSlots, simulationMoves, config.consolidationDistanceThreshold]
  );

  // Summary of excess items in ABCD qualifying for evacuation/storage into Koli
  const abcdToKoliSummary = useMemo(
    () => getAbcdToKoliEvacuationSummary(allSlots, simulationMoves, evacRule),
    [allSlots, simulationMoves, evacRule]
  );

  // Group recommendation moves by route (fromLokasi -> toLokasi) to prevent picker confusion
  const groupedRecommendationRoutes = useMemo(() => {
    const map = new Map<
      string,
      {
        routeKey: string;
        fromLokasi: string;
        toLokasi: string;
        totalPcs: number;
        items: SimulationMove[];
      }
    >();
    for (const m of simulationMoves) {
      const key = `${m.fromLokasi}__${m.toLokasi}`;
      let group = map.get(key);
      if (!group) {
        group = {
          routeKey: key,
          fromLokasi: m.fromLokasi,
          toLokasi: m.toLokasi,
          totalPcs: 0,
          items: [],
        };
        map.set(key, group);
      }
      group.totalPcs += m.qty;
      group.items.push(m);
    }
    return Array.from(map.values());
  }, [simulationMoves]);

  const recommendationSummary = useMemo(() => {
    const fromSet = new Set<string>();
    const toSet = new Set<string>();
    const skuSet = new Set<string>();
    let totalPcs = 0;
    for (const m of simulationMoves) {
      fromSet.add(m.fromLokasi);
      toSet.add(m.toLokasi);
      skuSet.add(m.sku);
      totalPcs += m.qty;
    }
    return {
      totalMoves: simulationMoves.length,
      uniqueSkus: skuSet.size,
      totalPcs,
      uniqueFromRacks: fromSet.size,
      uniqueToRacks: toSet.size,
    };
  }, [simulationMoves]);

  const sjDocumentNumber = useMemo(() => {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    return `SJ-RKP-${ymd}-${hm}`;
  }, [simulationMoves.length]);

  // Recommendation Handlers
  const handleAddSimulationMove = () => {
    const from = simFromLoc.trim().toUpperCase();
    const to = simToLoc.trim().toUpperCase();
    const qty = Math.max(1, Math.round(simQty));
    if (!from || !to || from === to) {
      onNotify?.('Pilih rak asal dan rak tujuan yang berbeda.', 'warning');
      return;
    }

    const srcSlot = slotByLokasi.get(from);
    const dstSlot = slotByLokasi.get(to);

    // Enforce operational separation: Blok F (SHOPEE, TIKTOK, STUDIO) & Perbaikan cannot be mixed with ABCD/Koli/X
    const srcExcluded = isExcludedFromWarehouseRelocation(srcSlot?.area || '', from);
    const dstExcluded = isExcludedFromWarehouseRelocation(dstSlot?.area || '', to);
    if (srcExcluded !== dstExcluded) {
      onNotify?.(
        `Perhatian: Lokasi ${from} dan ${to} berbeda fungsi operasional (Blok F / Perbaikan tidak boleh disamakan dengan Gudang ABCD / Koli / Transit).`,
        'warning'
      );
      return;
    }

    const rawSku = simSku.trim().toUpperCase();
    const matchedItem =
      (rawSku ? srcSlot?.items.find((i) => i.sku.toUpperCase() === rawSku) : undefined) ||
      srcSlot?.items[0];
    const finalSku = rawSku || matchedItem?.sku || 'BARANG-CAMPURAN';
    const catInfo = catalogMap.get(finalSku);

    const resolvedName =
      (catInfo?.nama_produk && catInfo.nama_produk !== finalSku ? catInfo.nama_produk : '') ||
      (matchedItem?.nama_produk && matchedItem.nama_produk !== finalSku
        ? matchedItem.nama_produk
        : '') ||
      catInfo?.nama_produk ||
      matchedItem?.nama_produk ||
      finalSku;

    const resolvedSize =
      (catInfo?.size && catInfo.size !== '-' ? catInfo.size : '') ||
      (matchedItem?.size && matchedItem.size !== '-' ? matchedItem.size : '') ||
      extractSizeFromSku(finalSku) ||
      'ALL';

    const move: SimulationMove = {
      id: `sim_${Date.now()}`,
      fromLokasi: from,
      toLokasi: to,
      sku: finalSku,
      nama_produk: resolvedName,
      size: resolvedSize,
      category: dstSlot?.category || srcSlot?.category || catInfo?.kategori || 'Umum',
      moveType: 'MANUAL',
      qty,
      createdAt: new Date().toISOString(),
    };

    setSimulationMoves((prev) => [...prev, move]);
    onNotify?.(
      `Rekomendasi pindah ${qty} pcs ${resolvedName} (Size ${resolvedSize}) dari ${from} ke ${to} ditambahkan.`,
      'info'
    );
  };

  const handleGenerateKoliRefill = () => {
    const triggerThreshold = config.refillTriggerThreshold ?? 3;
    const safePercent = config.safeOccupancyCapPercent ?? 75;
    const maxPerSku = config.refillMaxPerSkuAbcd ?? 12;

    const generated = generateConsolidatedKoliRefillMoves(
      allSlots,
      catalogMap,
      simulationMoves,
      20,
      triggerThreshold,
      safePercent,
      maxPerSku
    );
    if (generated.length === 0) {
      onNotify?.(
        `Tidak ditemukan SKU di Rak Koli (R/V/Z) dengan stok di ABCD ≤ ${triggerThreshold} pcs, atau seluruh rekomendasi sudah masuk antrean.`,
        'info'
      );
      return;
    }
    const fromRacks = new Set(generated.map((m) => m.fromLokasi)).size;
    const toRacks = new Set(generated.map((m) => m.toLokasi)).size;
    const totalPcs = generated.reduce((acc, m) => acc + m.qty, 0);
    setSimulationMoves((prev) => [...prev, ...generated]);
    setIsSimPanelOpen(true);
    onNotify?.(
      `Berhasil menyusun ${generated.length} SKU (${totalPcs} pcs) Refill dari ${fromRacks} Rak Koli → dialokasikan ke ${toRacks} Rak ABCD (Plafon Aman ${safePercent}%)!`,
      'success'
    );
  };

  const handleGenerateOverloadRelocation = () => {
    const safePercent = config.safeOccupancyCapPercent ?? 75;
    const generated = generateConsolidatedOverloadMoves(
      allSlots,
      catalogMap,
      simulationMoves,
      safePercent
    );
    if (generated.length === 0) {
      onNotify?.(
        'Tidak ada Rak ABCD yang sedang Overload (>100%) atau seluruh kelebihan sudah masuk rekomendasi.',
        'info'
      );
      return;
    }
    const fromRacks = new Set(generated.map((m) => m.fromLokasi)).size;
    const toRacks = new Set(generated.map((m) => m.toLokasi)).size;
    const totalPcs = generated.reduce((acc, m) => acc + m.qty, 0);
    setSimulationMoves((prev) => [...prev, ...generated]);
    setIsSimPanelOpen(true);
    onNotify?.(
      `Berhasil menyusun rekomendasi rapikan ${fromRacks} Rak Overload (${totalPcs} pcs) → dialokasikan ke ${toRacks} Rak tujuan (Plafon Aman ${safePercent}%)!`,
      'success'
    );
  };

  const handleGenerateSkuConsolidation = () => {
    const distanceThreshold = config.consolidationDistanceThreshold ?? 3;
    const safePercent = config.safeOccupancyCapPercent ?? 75;

    const generated = generateConsolidatedSkuScatteredMoves(
      allSlots,
      catalogMap,
      simulationMoves,
      distanceThreshold,
      safePercent,
      25
    );
    if (generated.length === 0) {
      onNotify?.(
        `Tidak ditemukan SKU di Rak ABCD yang tersebar berjauhan (> ${distanceThreshold} rak), atau seluruhnya sudah masuk daftar rekomendasi.`,
        'info'
      );
      return;
    }
    const fromRacks = new Set(generated.map((m) => m.fromLokasi)).size;
    const toRacks = new Set(generated.map((m) => m.toLokasi)).size;
    const totalPcs = generated.reduce((acc, m) => acc + m.qty, 0);
    setSimulationMoves((prev) => [...prev, ...generated]);
    setIsSimPanelOpen(true);
    onNotify?.(
      `Berhasil menyusun ${generated.length} rekomendasi penyatuan SKU terpencar (${totalPcs} pcs) dari ${fromRacks} rak ke ${toRacks} rak terdekat!`,
      'success'
    );
  };

  const handleGenerateAbcdToKoliEvacuation = () => {
    const generated = generateConsolidatedAbcdToKoliMoves(
      allSlots,
      catalogMap,
      simulationMoves,
      evacRule
    );
    if (generated.length === 0) {
      onNotify?.(
        `Tidak ada SKU di Rak ABCD yang memenuhi syarat (Stok ≥ ${evacRule.minStockThreshold} pcs), atau seluruhnya sudah masuk daftar rekomendasi.`,
        'info'
      );
      return;
    }
    const fromRacks = new Set(generated.map((m) => m.fromLokasi)).size;
    const toRacks = new Set(generated.map((m) => m.toLokasi)).size;
    const totalPcs = generated.reduce((acc, m) => acc + m.qty, 0);
    setSimulationMoves((prev) => [...prev, ...generated]);
    setIsSimPanelOpen(true);
    onNotify?.(
      `Berhasil menyusun rekomendasi evakuasi ${generated.length} SKU (${totalPcs} pcs) ke Koli! Buffer picking disisakan min ${evacRule.mandatoryPickingBuffer} pcs di rak ABCD agar picker tidak kesulitan.`,
      'success'
    );
  };

  const buildWhatsAppTaskText = () => {
    const lines: string[] = [
      `*FORM TUGAS PICKER — REKOMENDASI PINDAH & REFILL RAK*`,
      `No. Dokumen: *${sjDocumentNumber}*`,
      `Tanggal: ${new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`,
      `Ringkasan: *${recommendationSummary.uniqueSkus} SKU (${recommendationSummary.totalPcs} pcs)* | *${recommendationSummary.uniqueFromRacks} Rak Asal ➔ ${recommendationSummary.uniqueToRacks} Rak Tujuan*`,
      `----------------------------------------`,
    ];

    groupedRecommendationRoutes.forEach((route, rIdx) => {
      const isToKoli = /^[RVZ]\d+$/i.test(route.toLokasi);
      const isFromKoli = /^[RVZ]\d+$/i.test(route.fromLokasi);
      const directionLabel = isFromKoli
        ? ' [Refill Koli ➔ ABCD]'
        : isToKoli
        ? ' [Evakuasi ABCD ➔ Koli]'
        : ' [Relokasi Rak ABCD]';

      lines.push(
        `\n*RUTE ${rIdx + 1}: RAK ASAL [${route.fromLokasi}] ➔ KE RAK TUJUAN [${route.toLokasi}]*${directionLabel} (${route.totalPcs} pcs)`
      );
      route.items.forEach((m, iIdx) => {
        const sizeLabel = m.size && m.size !== '-' ? m.size : 'ALL';
        const typeBadge =
          m.moveType === 'EVAKUASI_KOLI'
            ? ' _(Simpan ke Koli)_'
            : m.moveType === 'REFILL_KOLI'
            ? ' _(Refill ke ABCD)_'
            : '';
        lines.push(
          `  ${iIdx + 1}. *${m.nama_produk}* | Size: *${sizeLabel}*${typeBadge}\n     SKU: \`${m.sku}\` — Ambil: *${m.qty} pcs*`
        );
      });
    });

    lines.push(
      `\n----------------------------------------`,
      `_SOP Picker: Scan #OUT pada Rak Asal saat mengambil barang, lalu Scan #IN pada Rak Tujuan saat menaruh barang._`
    );
    return lines.join('\n');
  };

  const handleCopySimulationTask = async () => {
    if (simulationMoves.length === 0) return;
    try {
      await navigator.clipboard.writeText(buildWhatsAppTaskText());
      setCopiedSimText(true);
      setTimeout(() => setCopiedSimText(false), 2000);
      onNotify?.(
        'Teks tugas WhatsApp (lengkap dengan Nama Produk, Size, SKU & Rute Rak) berhasil disalin!',
        'success'
      );
    } catch {
      onNotify?.('Gagal menyalin teks ke clipboard.', 'error');
    }
  };

  const handleTriggerA4Print = () => {
    if (simulationMoves.length === 0) return;
    const dateStr = new Date().toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const operatorName = session?.name || session?.username || 'Admin Gudang';

    let rowsHtml = '';
    let globalNo = 1;
    for (const route of groupedRecommendationRoutes) {
      rowsHtml += `
        <tr style="background:#f1f5f9;font-weight:800;">
          <td colspan="8" style="padding:7px 10px;border:1px solid #334155;font-size:11px;letter-spacing:0.02em;">
            RUTE PEMINDAHAN: DARI RAK ASAL [ ${route.fromLokasi} ] &nbsp;&rarr;&nbsp; MENUJU RAK TUJUAN [ ${route.toLokasi} ]
            &nbsp;&nbsp;(Subtotal: ${route.items.length} SKU / ${route.totalPcs} pcs)
          </td>
        </tr>
      `;
      for (const m of route.items) {
        const sizeStr = m.size && m.size !== '-' ? m.size : 'ALL';
        const typeLabel =
          m.moveType === 'REFILL_KOLI'
            ? 'Refill Koli → ABCD'
            : m.moveType === 'RELOKASI_OVERLOAD'
            ? 'Rapikan Overload'
            : m.moveType === 'EVAKUASI_KOLI'
            ? 'Evakuasi ABCD → Koli'
            : 'Relokasi Rak';
        rowsHtml += `
          <tr>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-family:monospace;">${globalNo++}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-family:monospace;font-weight:800;font-size:12px;">${m.fromLokasi}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-family:monospace;font-weight:800;font-size:12px;">${m.toLokasi}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;font-family:monospace;font-weight:700;">${m.sku}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;font-weight:600;">${m.nama_produk}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-weight:700;">${sizeStr}</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;font-weight:800;font-size:12px;">${m.qty} pcs</td>
            <td style="padding:6px 8px;border:1px solid #cbd5e1;text-align:center;font-size:10px;">
              [ &nbsp; ] #OUT &nbsp;&nbsp; [ &nbsp; ] #IN
              <div style="font-size:9px;color:#64748b;margin-top:2px;">${typeLabel}</div>
            </td>
          </tr>
        `;
      }
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${sjDocumentNumber} - Surat Jalan Tugas Relokasi & Refill Rak</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; padding: 0; font-size: 11px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .title { font-size: 16px; font-weight: 900; margin: 0 0 4px 0; letter-spacing: 0.02em; }
    .subtitle { font-size: 11px; color: #475569; margin: 0; }
    .meta-box { text-align: right; font-size: 11px; line-height: 1.5; }
    .summary-strip { display: flex; gap: 12px; margin-bottom: 12px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 6px; }
    .summary-item { flex: 1; }
    .summary-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .summary-val { font-size: 13px; font-weight: 900; font-family: monospace; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #0f172a; color: #ffffff; font-size: 10px; text-transform: uppercase; padding: 7px 8px; border: 1px solid #0f172a; }
    .sop-note { font-size: 10px; background: #fffbeb; border: 1px solid #fcd34d; padding: 8px 10px; border-radius: 6px; margin-bottom: 20px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 28px; page-break-inside: avoid; }
    .sig-col { width: 30%; text-align: center; }
    .sig-line { margin-top: 52px; border-top: 1px solid #334155; padding-top: 4px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">SURAT JALAN / FORM TUGAS PICKER (REFILL &amp; RELOKASI RAK)</div>
      <div class="subtitle">Warehouse Management System — Konsolidasi Putaway Rak Koli (R/V/Z) &amp; Rak Utama (ABCD)</div>
    </div>
    <div class="meta-box">
      <div><strong>No. Dokumen:</strong> ${sjDocumentNumber}</div>
      <div><strong>Tanggal Cetak:</strong> ${dateStr}</div>
      <div><strong>Dibuat Oleh:</strong> ${operatorName}</div>
    </div>
  </div>

  <div class="summary-strip">
    <div class="summary-item">
      <div class="summary-label">Total Baris Tugas</div>
      <div class="summary-val">${recommendationSummary.totalMoves} Baris (${recommendationSummary.uniqueSkus} SKU)</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Total Kuantitas Fisik</div>
      <div class="summary-val">${recommendationSummary.totalPcs} Pcs</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Konsolidasi Titik Rak</div>
      <div class="summary-val">${recommendationSummary.uniqueFromRacks} Rak Asal &rarr; ${recommendationSummary.uniqueToRacks} Rak Tujuan</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:32px;">No</th>
        <th style="width:68px;">Rak Asal</th>
        <th style="width:68px;">Rak Tujuan</th>
        <th style="width:115px;">Kode SKU</th>
        <th>Nama Produk</th>
        <th style="width:48px;">Size</th>
        <th style="width:64px;">Qty Pindah</th>
        <th style="width:120px;">Ceklis Scan Fisik</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="sop-note">
    <strong>Instruksi Wajib Picker / Operator Gudang:</strong>
    1. Ambil barang sesuai <strong>Rak Asal</strong>, pastikan <strong>SKU, Nama Produk, Size, dan Qty</strong> sesuai fisik, lalu lakukan scan <strong>#OUT</strong> pada Rak Asal.<br/>
    2. Tempatkan barang secara rapi ke <strong>Rak Tujuan</strong> yang telah dikonsolidasi (jangan dipecah ke rak lain tanpa scan), lalu lakukan scan <strong>#IN</strong> pada Rak Tujuan.
  </div>

  <div class="signatures">
    <div class="sig-col">
      <div>Ditugaskan Oleh (Admin / Leader)</div>
      <div class="sig-line">${operatorName}</div>
    </div>
    <div class="sig-col">
      <div>Dikerjakan Oleh (Picker Gudang)</div>
      <div class="sig-line">( ........................................ )</div>
    </div>
    <div class="sig-col">
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

  return (
    <div className="space-y-4 w-full">
      {/* ============================================================================
          1. TOP KPI STRIP (Ringkasan Kapasitas & Status Rak)
          ============================================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        {/* Total Utilisasi Gudang */}
        <div className="p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>UTILISASI GUDANG</span>
            <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
              {summaryStats.overallPercent}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {summaryStats.totalFilled.toLocaleString('id-ID')} /{' '}
              {summaryStats.totalCapacity.toLocaleString('id-ID')} pcs
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-transform duration-200 origin-left"
              style={{
                transform: `scaleX(${Math.min(1, summaryStats.overallPercent / 100)})`,
              }}
            />
          </div>
        </div>

        {/* Rak Overload (>100%) */}
        <button
          type="button"
          onClick={() => setStatusFilter((prev) => (prev === 'OVERLOAD' ? 'ALL' : 'OVERLOAD'))}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'OVERLOAD'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/20'
              : summaryStats.overloadCount > 0
              ? 'bg-white dark:bg-[#131d31] border-rose-300 dark:border-rose-900/70 hover:border-rose-500'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-rose-600 dark:text-rose-400">
            <span>RAK OVERLOAD (&gt;100%)</span>
            <AlertTriangle
              className={`w-4 h-4 ${summaryStats.overloadCount > 0 ? 'animate-bounce' : ''}`}
            />
          </div>
          <div className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">
            {summaryStats.overloadCount.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">rak</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Klik untuk filter rak melebihi kapasitas
          </div>
        </button>

        {/* Rak Hampir Penuh / Penuh (75-100%) */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) => (prev === 'WARNING_FULL' ? 'ALL' : 'WARNING_FULL'))
          }
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'WARNING_FULL'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/20'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
            <span>HAMPIR PENUH (75-100%)</span>
            <Package className="w-4 h-4" />
          </div>
          <div className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            {summaryStats.warningFullCount.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">rak</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Mendekati batas maksimum rak
          </div>
        </button>

        {/* Rak Aman / Tersedia (1-74%) */}
        <button
          type="button"
          onClick={() => setStatusFilter((prev) => (prev === 'SAFE' ? 'ALL' : 'SAFE'))}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'SAFE'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <span>TERSEDIA / LONGGAR</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {summaryStats.safeCount.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">rak</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Terisi 1% – 74% dari kapasitas
          </div>
        </button>

        {/* Rak Kosong (0%) */}
        <button
          type="button"
          onClick={() => setStatusFilter((prev) => (prev === 'EMPTY' ? 'ALL' : 'EMPTY'))}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'EMPTY'
              ? 'bg-slate-100 dark:bg-slate-800 border-slate-900 dark:border-white'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>RAK KOSONG (0%)</span>
            <MapPin className="w-4 h-4" />
          </div>
          <div className="mt-1 text-2xl font-black text-slate-800 dark:text-slate-100 font-mono tabular-nums">
            {summaryStats.emptyCount.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">rak</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Siap ditempati stok baru
          </div>
        </button>
      </div>

      {/* ============================================================================
          2. ZONE & CATEGORY PROGRESS CARDS (Lokasi A=Dress, B=Bottom, C=Top, D=Sale, dll)
          ============================================================================ */}
      <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Kapasitas Per Area &amp; Kategori Zona Rak
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Klik kartu zona di bawah untuk memfilter rak (Warehouse Utama: A–D · Suplai Kolian: R, V, Z · Transit: X · Blok F: Shopee, TikTok, Studio · Perbaikan: CC, PMK, DF)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {(selectedZoneId !== 'ALL' || selectedArea !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedZoneId('ALL');
                  setSelectedArea('ALL');
                }}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 cursor-pointer whitespace-nowrap"
              >
                Tampilkan Semua Zona
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSimPanelOpen((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                isSimPanelOpen || simulationMoves.length > 0
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-slate-50 dark:bg-[#0E1420] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>
                Rekomendasi Pindah Rak
                {simulationMoves.length > 0 ? ` (${simulationMoves.length})` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={handleOpenSetupModal}
              className="px-3.5 py-1.5 text-xs font-extrabold bg-slate-900 dark:bg-amber-500 text-white dark:text-black rounded-xl hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Setup Kapasitas &amp; Lokasi</span>
            </button>
          </div>
        </div>

        {/* Quick Area Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => {
              setSelectedArea('ALL');
              setSelectedZoneId('ALL');
            }}
            className={`px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
              selectedArea === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-amber-500 dark:text-black dark:border-amber-500'
                : 'bg-slate-50 dark:bg-[#0E1420] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
            }`}
          >
            Semua Area ({allSlots.length} lokasi)
          </button>
          {availableAreas.map((areaName) => {
            const countInArea = allSlots.filter(
              (s) => s.area.toUpperCase() === areaName.toUpperCase()
            ).length;
            const active = selectedArea.toUpperCase() === areaName.toUpperCase();
            return (
              <button
                key={areaName}
                type="button"
                onClick={() => {
                  setSelectedArea((prev) =>
                    prev.toUpperCase() === areaName.toUpperCase() ? 'ALL' : areaName
                  );
                  setSelectedZoneId('ALL');
                }}
                className={`px-3 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-amber-500 dark:text-black dark:border-amber-500'
                    : 'bg-slate-50 dark:bg-[#0E1420] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                }`}
              >
                {areaName === 'Kolian'
                  ? 'Kolian / Koli (R, V, Z)'
                  : areaName === 'Transit'
                  ? 'Transit (X)'
                  : areaName === 'Perbaikan'
                  ? 'Perbaikan (CC, PMK, DF)'
                  : areaName}{' '}
                ({countInArea})
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {summaryStats.zones.map((z) => {
            const pct = z.maxCapacity > 0 ? Math.round((z.currentQty / z.maxCapacity) * 100) : 0;
            const style = COLOR_STYLES[z.color] || COLOR_STYLES.slate;
            const isSelected = selectedZoneId === z.zoneId;
            return (
              <button
                key={z.zoneId}
                type="button"
                onClick={() =>
                  setSelectedZoneId((prev) => (prev === z.zoneId ? 'ALL' : z.zoneId))
                }
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'ring-2 ring-slate-900 dark:ring-amber-400 border-slate-900 dark:border-amber-400 bg-slate-50 dark:bg-slate-800/70'
                    : `${style.border} ${style.bgSoft} hover:opacity-95`
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {z.zoneName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      <span>{z.area}</span>
                      <span aria-hidden="true"> · </span>
                      <span className={`font-bold ${style.text}`}>Kategori: {z.category}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-mono tabular-nums">Max {z.defaultMaxCapacity}/rak</span>
                    </div>
                  </div>
                  <span className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                    {pct}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-2.5 h-2 w-full bg-white/80 dark:bg-slate-900/70 rounded-full overflow-hidden border border-slate-200/60 dark:border-slate-800">
                  <div
                    className={`h-full transition-transform duration-200 origin-left ${
                      pct > 100 ? 'bg-rose-600' : style.bar
                    }`}
                    style={{
                      transform: `scaleX(${Math.min(1, pct / 100)})`,
                    }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                  <span>
                    {z.currentQty.toLocaleString('id-ID')} / {z.maxCapacity.toLocaleString('id-ID')} pcs
                  </span>
                  <span>
                    {z.activeRackCount}/{z.rackCount} terisi
                    {z.overloadRackCount > 0 ? (
                      <strong className="text-rose-600 dark:text-rose-400 ml-1">
                        · {z.overloadRackCount} overload
                      </strong>
                    ) : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================================
          3. REKOMENDASI PINDAH & REFILL RAK (Koli -> ABCD & Relokasi Overload)
          ============================================================================ */}
      {(isSimPanelOpen || simulationMoves.length > 0) && (
        <div className="bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 rounded-2xl p-4 space-y-3.5">
          {/* Top Header Row: Title & Full-Width Description */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-purple-200/60 dark:border-purple-800/50">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-black text-purple-950 dark:text-purple-100">
                    Rekomendasi Pindah &amp; Refill Rak
                  </h4>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-200/80 dark:bg-purple-900/70 text-purple-900 dark:text-purple-200">
                    Konsolidasi Tugas Picker — WA &amp; SJ A4
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Suplai stok dari <strong>Rak Koli (R, V, Z) ➔ Rak Utama (ABCD)</strong> saat stok di ABCD kosong, atau rapikan rak overload. Sistem otomatis <strong>memadatkan rak tujuan (anti-acak)</strong> agar picker mudah mengambil barang (Blok F &amp; Perbaikan dipisahkan).
                </p>
              </div>
            </div>

            {/* Secondary / Export Actions (Shown on Right) */}
            {simulationMoves.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopySimulationTask}
                  className="px-3 py-2 text-xs font-extrabold bg-purple-600 hover:bg-purple-500 text-white rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs transition-colors"
                >
                  {copiedSimText ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedSimText ? 'Teks WA Tersalin!' : 'Salin Tugas WA'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSjPrintModalOpen(true)}
                  className="px-3 py-2 text-xs font-extrabold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak SJ Tugas Picker (A4)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimulationMoves([])}
                  className="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-900 text-rose-600 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-50 cursor-pointer flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            )}
          </div>

          {/* Generator Action Cards Row: 1. Auto-Refill Koli -> ABCD, 2. Rapikan Overload, 3. Satukan SKU Terpencar, 4. Evakuasi ABCD -> Koli */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* 1. Refill Koli -> ABCD */}
            <div className="flex flex-col justify-between gap-2 p-3 rounded-xl bg-white dark:bg-[#131d31] border border-emerald-200 dark:border-emerald-900/60">
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="truncate">Suplai Koli ➔ Rak ABCD</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Refill stok menipis (&le; {config.refillTriggerThreshold ?? 3} pcs) dari Koli
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {koliRefillSummary.totalRefillableSkus > 0 ? (
                    <span>
                      {koliRefillSummary.totalRefillableSkus} SKU ({koliRefillSummary.totalRefillablePcs} pcs)
                    </span>
                  ) : (
                    <span>Semua SKU cukup</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleGenerateKoliRefill}
                  disabled={koliRefillSummary.totalRefillableSkus === 0}
                  className="px-3 py-1.5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs shrink-0 transition-colors"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>
                    Refill
                    {koliRefillSummary.totalRefillableSkus > 0
                      ? ` (${koliRefillSummary.totalRefillableSkus})`
                      : ''}
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Rapikan Overload */}
            <div className="flex flex-col justify-between gap-2 p-3 rounded-xl bg-white dark:bg-[#131d31] border border-amber-200 dark:border-amber-900/60">
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">Rapikan Overload (&gt;100%)</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Alokasikan ke rak aman (maks {config.safeOccupancyCapPercent ?? 75}%)
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {summaryStats.overloadCount > 0 ? (
                    <span className="text-rose-600 font-bold">
                      {summaryStats.overloadCount} Rak Overload
                    </span>
                  ) : (
                    <span>Kapasitas aman</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleGenerateOverloadRelocation}
                  disabled={summaryStats.overloadCount === 0}
                  className="px-3 py-1.5 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs shrink-0 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Rapikan ({summaryStats.overloadCount})</span>
                </button>
              </div>
            </div>

            {/* 3. Satukan SKU Terpencar */}
            <div className="flex flex-col justify-between gap-2 p-3 rounded-xl bg-white dark:bg-[#131d31] border border-purple-200 dark:border-purple-900/60">
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="truncate">Satukan SKU Terpencar</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Satukan barang terpisah (&gt; {config.consolidationDistanceThreshold ?? 3} rak)
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {scatteredSkuSummary.totalScatteredSkus > 0 ? (
                    <span>
                      {scatteredSkuSummary.totalScatteredSkus} SKU ({scatteredSkuSummary.totalMoveablePcs} pcs)
                    </span>
                  ) : (
                    <span>Stok terkonsolidasi</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleGenerateSkuConsolidation}
                  disabled={scatteredSkuSummary.totalScatteredSkus === 0}
                  className="px-3 py-1.5 text-xs font-extrabold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs shrink-0 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    Satukan
                    {scatteredSkuSummary.totalScatteredSkus > 0
                      ? ` (${scatteredSkuSummary.totalScatteredSkus})`
                      : ''}
                  </span>
                </button>
              </div>
            </div>

            {/* 4. Evakuasi ABCD -> Koli */}
            <div className="flex flex-col justify-between gap-2 p-3 rounded-xl bg-white dark:bg-[#131d31] border border-blue-200 dark:border-blue-900/60">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="truncate">Evakuasi ke Koli</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Simpan buffer (sisakan {evacRule.mandatoryPickingBuffer} pcs)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEvacConfig((v) => !v)}
                  className={`p-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                    showEvacConfig
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                  }`}
                  title="Atur Syarat: Minimal Stok, Sisa Buffer Picking & % Pindah"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {abcdToKoliSummary.candidateSkusCount > 0 ? (
                    <span>
                      {abcdToKoliSummary.candidateSkusCount} SKU ({abcdToKoliSummary.totalExcessPcs} pcs)
                    </span>
                  ) : (
                    <span>Stok picking aman</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleGenerateAbcdToKoliEvacuation}
                  disabled={abcdToKoliSummary.candidateSkusCount === 0 && summaryStats.overloadCount === 0}
                  className="px-3 py-1.5 text-xs font-extrabold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs shrink-0 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>
                    Simpan
                    {abcdToKoliSummary.candidateSkusCount > 0
                      ? ` (${abcdToKoliSummary.candidateSkusCount})`
                      : ''}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Parameter Configuration Panel for Evakuasi ke Koli */}
          {showEvacConfig && (
            <div className="p-4 rounded-xl bg-white dark:bg-[#131d31] border border-blue-300 dark:border-blue-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    Pengaturan Syarat Evakuasi ABCD ➔ Koli (Perlindungan Buffer Picker)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEvacConfig(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Prinsip WMS: <strong>Stok rak picking (ABCD) tidak boleh dikosongkan total!</strong> Picker selalu membutuhkan stok aktif di rak utama untuk mengambil pesanan harian tanpa harus berjalan ke area Kolian.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {/* 1. Min Stock Threshold */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    1. Minimal Stok di Rak ABCD
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={10}
                      max={150}
                      step={5}
                      value={evacRule.minStockThreshold}
                      onChange={(e) =>
                        setEvacRule((prev) => ({
                          ...prev,
                          minStockThreshold: Math.max(5, Number(e.target.value) || 25),
                        }))
                      }
                      className="w-20 px-2 py-1 text-xs font-bold font-mono bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                    />
                    <span className="text-xs text-slate-500 font-bold">pcs</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Hanya SKU dengan stok &ge; {evacRule.minStockThreshold} pcs yang dievaluasi. SKU dengan stok sedikit diabaikan.
                  </p>
                </div>

                {/* 2. Mandatory Picking Buffer */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    2. Sisa Wajib Tinggal di Rak ABCD
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={3}
                      max={40}
                      step={1}
                      value={evacRule.mandatoryPickingBuffer}
                      onChange={(e) =>
                        setEvacRule((prev) => ({
                          ...prev,
                          mandatoryPickingBuffer: Math.max(1, Number(e.target.value) || 10),
                        }))
                      }
                      className="w-20 px-2 py-1 text-xs font-bold font-mono bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                    />
                    <span className="text-xs text-slate-500 font-bold">pcs</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Stok minimal yang <strong>WAJIB tertinggal</strong> di rak ABCD untuk kebutuhan pesanan picker harian.
                  </p>
                </div>

                {/* 3. Evacuate Percentage */}
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    3. Persentase Dipindah ke Koli
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[40, 50, 60, 70, 80].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() =>
                          setEvacRule((prev) => ({
                            ...prev,
                            evacuatePercent: pct,
                          }))
                        }
                        className={`px-2 py-1 text-xs font-bold rounded cursor-pointer transition-colors ${
                          evacRule.evacuatePercent === pct
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Dari kelebihan stok, pindahkan {evacRule.evacuatePercent}% ke Koli (R, V, Z).
                  </p>
                </div>
              </div>

              {/* Interactive Simulation Example & Save Button */}
              <div className="px-3 py-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-900 dark:text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <span className="leading-relaxed">
                  💡 <strong>Simulasi Riil:</strong> Jika ada SKU berisi <strong>30 pcs</strong> di rak A001 ➔ sistem akan menyisakan <strong>{Math.max(evacRule.mandatoryPickingBuffer, Math.round(30 * (1 - evacRule.evacuatePercent / 100)))} pcs</strong> di rak A001 (untuk picking harian), dan merekomendasikan <strong>{30 - Math.max(evacRule.mandatoryPickingBuffer, Math.round(30 * (1 - evacRule.evacuatePercent / 100)))} pcs ({Math.round(((30 - Math.max(evacRule.mandatoryPickingBuffer, Math.round(30 * (1 - evacRule.evacuatePercent / 100)))) / 30) * 100)}%)</strong> dipindah ke Koli R/V/Z.
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSavingConfig}
                    onClick={() => handleSaveEvacuationRule(evacRule)}
                    className="px-3 py-1.5 text-xs font-extrabold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingConfig ? 'Menyimpan...' : 'Simpan ke Database'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvacRule(DEFAULT_ABCD_TO_KOLI_RULE)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                  >
                    Reset Standar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Manual Add Recommendation Form */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end bg-white dark:bg-[#131d31] p-3 rounded-xl border border-purple-200/70 dark:border-slate-800">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Dari Rak Asal (Koli / ABCD)
              </label>
              <input
                type="text"
                value={simFromLoc}
                onChange={(e) => setSimFromLoc(e.target.value.toUpperCase())}
                placeholder="Contoh: R001 atau A001"
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Ke Rak Tujuan (ABCD / X)
              </label>
              <input
                type="text"
                value={simToLoc}
                onChange={(e) => setSimToLoc(e.target.value.toUpperCase())}
                placeholder="Contoh: A004"
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Kode SKU Produk
              </label>
              <input
                type="text"
                value={simSku}
                onChange={(e) => setSimSku(e.target.value.toUpperCase())}
                placeholder="Ketik SKU (Nama & Size otomatis)"
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Jumlah Pindah (Pcs)
              </label>
              <input
                type="number"
                min={1}
                value={simQty}
                onChange={(e) => setSimQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={handleAddSimulationMove}
              className="px-4 py-1.5 text-xs font-extrabold bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex items-center justify-center gap-1.5 cursor-pointer h-[32px] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Tugas Pindah</span>
            </button>
          </div>

          {/* Consolidated Routes & Items Table */}
          {simulationMoves.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-purple-100/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-xs">
                <div className="flex flex-wrap items-center gap-2 font-bold text-purple-950 dark:text-purple-200">
                  <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>No. SJ Tugas:</span>
                  <span className="font-mono font-black">{sjDocumentNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Total: <strong>{recommendationSummary.uniqueSkus} SKU</strong> (
                    <strong>{recommendationSummary.totalPcs} pcs</strong>)
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-700 dark:text-emerald-300">
                    Konsolidasi Rute: Dari{' '}
                    <strong>{recommendationSummary.uniqueFromRacks} Rak Asal</strong> ➔ Dipadatkan ke{' '}
                    <strong>{recommendationSummary.uniqueToRacks} Rak Tujuan</strong>
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Stok asli baru berubah saat Picker melakukan scan #OUT &amp; #IN
                </span>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {groupedRecommendationRoutes.map((route, rIdx) => {
                  const fromSlot = slotByLokasi.get(route.fromLokasi);
                  const toSlot = slotByLokasi.get(route.toLokasi);
                  return (
                    <div
                      key={route.routeKey}
                      className="bg-white dark:bg-[#131d31] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                    >
                      {/* Route Header */}
                      <div className="px-3.5 py-2 bg-slate-50 dark:bg-[#0E1420] border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <span className="font-sans font-extrabold text-slate-500">
                            RUTE #{rIdx + 1}:
                          </span>
                          <strong className="text-slate-900 dark:text-white text-sm">
                            {route.fromLokasi}
                          </strong>
                          {fromSlot && (
                            <span className="text-slate-400 text-[11px]">
                              ({fromSlot.fillPercent}% ➔ {fromSlot.simulatedPercent}%)
                            </span>
                          )}
                          <ArrowRight className="w-3.5 h-3.5 text-purple-500" />
                          <strong className="text-purple-600 dark:text-purple-400 text-sm">
                            {route.toLokasi}
                          </strong>
                          {toSlot && (
                            <span className="text-slate-400 text-[11px]">
                              ({toSlot.fillPercent}% ➔ {toSlot.simulatedPercent}% · Max{' '}
                              {toSlot.maxCapacity} pcs)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                          {route.items.length} SKU · Subtotal {route.totalPcs} pcs
                        </div>
                      </div>

                      {/* Items in this Route */}
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {route.items.map((m) => (
                          <div
                            key={m.id}
                            className="px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {m.nama_produk}
                                </span>
                                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 font-mono">
                                  Size: {m.size || 'ALL'}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                  ({m.sku})
                                </span>
                                {m.moveType === 'EVAKUASI_KOLI' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                                    Evakuasi ABCD ➔ Koli
                                  </span>
                                )}
                                {m.moveType === 'REFILL_KOLI' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                                    Refill Koli ➔ ABCD
                                  </span>
                                )}
                                {m.moveType === 'RELOKASI_OVERLOAD' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                                    Rapikan Overload
                                  </span>
                                )}
                                {m.moveType === 'KONSOLIDASI_SKU' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                                    Satukan SKU Terpencar
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono tabular-nums font-black text-slate-900 dark:text-white">
                                {m.qty} pcs
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setSimulationMoves((prev) => prev.filter((x) => x.id !== m.id))
                                }
                                className="text-rose-500 hover:text-rose-600 p-1 cursor-pointer"
                                title="Hapus baris rekomendasi ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================================
          4. FILTER & VIEW MODE TOOLBAR (Search, Category Filter, Status Filter, Grid/Table Toggle)
          ============================================================================ */}
      <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Kode Rak (A001, B005) / Kategori (Dress, Bottom) / SKU Produk..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right Controls: Category Select, Refresh, Dual View Mode (Grid / Table) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="ALL">Semua Kategori ({availableCategories.length})</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  Kategori: {cat}
                </option>
              ))}
            </select>

            {/* Status Filter Segmented Buttons */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0E1420] rounded-xl border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'OVERLOAD', label: `Overload (${summaryStats.overloadCount})` },
                  { id: 'WARNING_FULL', label: 'Hampir Penuh' },
                  { id: 'SAFE', label: 'Tersedia' },
                  { id: 'EMPTY', label: `Kosong (${summaryStats.emptyCount})` },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === st.id
                      ? st.id === 'OVERLOAD'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Dual View Mode Toggle: Grid vs Table */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#0E1420] rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('GRID')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'GRID'
                    ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid Visual</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'TABLE'
                    ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Tabel Ringkas</span>
              </button>
            </div>

            {onRefreshStock && (
              <button
                type="button"
                onClick={onRefreshStock}
                disabled={isRefreshingStock}
                className="px-3 py-2 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStock ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sinkron Stok</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================================
          5. MAIN RACK VISUALIZATION (GRID MODE OR TABLE MODE)
          ============================================================================ */}
      {filteredSlots.length === 0 ? (
        <div className="py-16 text-center space-y-2 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl">
          <MapPin className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Tidak Ada Lokasi Rak yang Sesuai Filter
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Coba ubah filter status kapasitas, pilih &ldquo;Semua Zona&rdquo;, atau tambahkan lokasi baru melalui tombol Setup Kapasitas.
          </p>
        </div>
      ) : viewMode === 'GRID' ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5">
          {filteredSlots.map((slot) => {
            // Pure physical reality display: UI = Data Fisik
            const activePct = slot.fillPercent;
            const activeQty = slot.currentQty;
            const activeStatus = slot.status;
            const vis = getStatusVisual(activeStatus);
            const clampedHeightPct = Math.min(100, Math.max(0, activePct));
            const hasPendingTask = simulationMoves.length > 0 && slot.simulatedQty !== slot.currentQty;

            return (
              <button
                key={slot.lokasi}
                type="button"
                onClick={() => setSelectedRackLokasi(slot.lokasi)}
                className={`group relative overflow-hidden rounded-xl border bg-white dark:bg-[#131d31] p-3 text-left transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between min-h-[116px] ${vis.cardBorder}`}
              >
                {/* Animated vertical liquid-fill backdrop using transform scaleY */}
                <div
                  className={`absolute inset-x-0 bottom-0 h-full origin-bottom transition-transform duration-200 pointer-events-none ${vis.liquidBg} ${vis.pulseClass}`}
                  style={{
                    transform: `scaleY(${clampedHeightPct / 100})`,
                  }}
                />

                {/* Top row: Rack Code & Status / Task Badge */}
                <div className="relative z-10 flex items-start justify-between gap-1 w-full">
                  <div>
                    <div className="text-sm font-black font-mono text-slate-900 dark:text-white tracking-tight flex items-center gap-1">
                      <span>{slot.lokasi}</span>
                      {hasPendingTask && (
                        <span
                          className="text-[9px] font-black font-mono px-1 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800"
                          title={`Ada antrean tugas: ${slot.simulatedQty > slot.currentQty ? `+${slot.simulatedQty - slot.currentQty}` : `-${slot.currentQty - slot.simulatedQty}`} pcs`}
                        >
                          {slot.simulatedQty > slot.currentQty
                            ? `+${slot.simulatedQty - slot.currentQty}`
                            : `-${slot.currentQty - slot.simulatedQty}`}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[95px]">
                      {slot.category}
                    </div>
                  </div>
                  {activeStatus === 'OVERLOAD' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 animate-bounce shrink-0" />
                  ) : (
                    <span
                      className={`text-xs font-black font-mono tabular-nums ${vis.textColor}`}
                    >
                      {activePct}%
                    </span>
                  )}
                </div>

                {/* Middle / Bottom: Progress Bar & Exact Pcs Counter */}
                <div className="relative z-10 mt-3 w-full space-y-1.5">
                  {activeStatus === 'OVERLOAD' && (
                    <div className="flex items-center justify-between text-[10px] font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                      <span>OVERLOAD</span>
                      <span>{activePct}%</span>
                    </div>
                  )}

                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full origin-left transition-transform duration-200 ${vis.barBg}`}
                      style={{
                        transform: `scaleX(${clampedHeightPct / 100})`,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {activeQty}/{slot.maxCapacity}
                      <span className="text-[10px] font-normal text-slate-400 ml-0.5">pcs</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {slot.skuCount > 0 ? `${slot.skuCount} SKU` : 'Kosong'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* TABLE MODE */
        <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1420] text-[11px] font-extrabold text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3.5">KODE RAK</th>
                  <th className="py-2.5 px-3.5">AREA &amp; KATEGORI</th>
                  <th className="py-2.5 px-3.5 text-right">TERISI (PCS)</th>
                  <th className="py-2.5 px-3.5 text-right">KAPASITAS MAX</th>
                  <th className="py-2.5 px-3.5 text-right">SISA RUANG</th>
                  <th className="py-2.5 px-3.5 w-48">PERSENTASE TERISI</th>
                  <th className="py-2.5 px-3.5 text-right">JML SKU</th>
                  <th className="py-2.5 px-3.5">STATUS</th>
                  <th className="py-2.5 px-3.5 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                {filteredSlots.map((slot) => {
                  const vis = getStatusVisual(slot.status);
                  const isEditingThis = inlineEditingLoc === slot.lokasi;
                  return (
                    <tr
                      key={slot.lokasi}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        slot.status === 'OVERLOAD' ? 'bg-rose-50/40 dark:bg-rose-950/15' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-mono font-black text-slate-900 dark:text-white">
                        <button
                          type="button"
                          onClick={() => setSelectedRackLokasi(slot.lokasi)}
                          className="hover:underline cursor-pointer flex items-center gap-1.5"
                        >
                          <span>{slot.lokasi}</span>
                          {slot.isOverridden && (
                            <span
                              className="text-[10px] font-normal text-amber-600 dark:text-amber-400"
                              title="Kapasitas spesifik per rak"
                            >
                              *
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-300">
                        <span>{slot.area}</span>
                        <span aria-hidden="true"> · </span>
                        <strong className="text-slate-900 dark:text-white">{slot.category}</strong>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {slot.currentQty.toLocaleString('id-ID')} pcs
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums">
                        {isEditingThis ? (
                          <div className="inline-flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              min={1}
                              value={inlineEditCap}
                              onChange={(e) =>
                                setInlineEditCap(Math.max(1, Number(e.target.value) || 1))
                              }
                              className="w-16 px-2 py-1 text-right text-xs font-mono border border-amber-500 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveSingleRackOverride(
                                  slot.lokasi,
                                  inlineEditCap,
                                  slot.category,
                                  slot.area
                                )
                              }
                              className="p-1 text-emerald-600 hover:text-emerald-500 cursor-pointer"
                              title="Simpan"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineEditingLoc(null)}
                              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                              title="Batal"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">
                            {slot.maxCapacity.toLocaleString('id-ID')} pcs
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums">
                        {slot.overCapacityQty > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">
                            +{slot.overCapacityQty} overload
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {slot.availableSpace} pcs
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full origin-left transition-transform duration-200 ${vis.barBg}`}
                              style={{
                                transform: `scaleX(${Math.min(1, slot.fillPercent / 100)})`,
                              }}
                            />
                          </div>
                          <span
                            className={`w-11 text-right font-mono tabular-nums font-bold ${vis.textColor}`}
                          >
                            {slot.fillPercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {slot.skuCount}
                      </td>
                      <td className="py-2.5 px-3.5">
                        <span className={`font-bold ${vis.textColor}`}>{vis.label}</span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setInlineEditingLoc(slot.lokasi);
                              setInlineEditCap(slot.maxCapacity);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Ubah kapasitas maksimal rak ini"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedRackLokasi(slot.lokasi)}
                            className="px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Detail
                          </button>
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

      {/* Footer note */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 px-2 gap-1">
        <span>
          Menampilkan <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-300">{filteredSlots.length}</strong> dari{' '}
          <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-300">{allSlots.length}</strong> titik lokasi rak gudang. Klik kartu rak untuk melihat isi SKU, rekomendasi rak kosong terdekat, dan ubah kapasitas.
        </span>
        <span>Terhubung langsung ke stok fisik nyata (stok_real_fisik &amp; log_produk)</span>
      </div>

      {/* ============================================================================
          6. RACK DETAIL & SMART RECOMMENDATION CENTERED POPUP MODAL
          ============================================================================ */}
      {selectedSlot && (
        <div
          onClick={() => setSelectedRackLokasi(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl max-h-[90vh] bg-white dark:bg-[#131d31] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#0E1420]">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                    Rak {selectedSlot.lokasi}
                  </span>
                  <span
                    className={`text-sm font-extrabold ${
                      getStatusVisual(selectedSlot.status).textColor
                    }`}
                  >
                    · {getStatusVisual(selectedSlot.status).label} ({selectedSlot.fillPercent}%)
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span>Area: {selectedSlot.area}</span>
                  <span aria-hidden="true"> · </span>
                  <span>Kategori: {selectedSlot.category}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300">
                    {selectedSlot.skuCount} SKU aktif ({selectedSlot.currentQty} pcs)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onOpenPrintModal && (
                  <button
                    type="button"
                    onClick={() => {
                      const loc = selectedSlot.lokasi;
                      setSelectedRackLokasi(null);
                      onOpenPrintModal(loc);
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak / Ekspor Isi Rak Ini</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedRackLokasi(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                  title="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Top Row: Capacity Meter + Quick Capacity Override */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Capacity Visual Meter */}
                <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Keterisian Fisik Saat Ini
                    </span>
                    <span className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                      {selectedSlot.currentQty} / {selectedSlot.maxCapacity} pcs (
                      {selectedSlot.fillPercent}%)
                    </span>
                  </div>
                  <div className="h-3.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full origin-left transition-transform duration-200 ${
                        getStatusVisual(selectedSlot.status).barBg
                      }`}
                      style={{
                        transform: `scaleX(${Math.min(1, selectedSlot.fillPercent / 100)})`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    {selectedSlot.overCapacityQty > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        Melebihi kapasitas sebanyak +{selectedSlot.overCapacityQty} pcs!
                      </span>
                    ) : (
                      <span>
                        Sisa ruang tersedia:{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {selectedSlot.availableSpace} pcs
                        </strong>
                      </span>
                    )}
                    <span>Max: {selectedSlot.maxCapacity} pcs</span>
                  </div>
                </div>

                {/* Quick Edit Capacity for this Specific Rack */}
                <div className="lg:col-span-7 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    Pengaturan Kapasitas Spesifik Rak {selectedSlot.lokasi}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Kapasitas Max (Pcs)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={editCapValue}
                        onChange={(e) => setEditCapValue(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full px-3 py-2 text-xs font-mono font-bold tabular-nums bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Kategori Produk
                      </label>
                      <input
                        type="text"
                        value={editCatValue}
                        onChange={(e) => setEditCatValue(e.target.value)}
                        placeholder="Dress / Bottom / Top / Sale"
                        className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        disabled={isSavingConfig}
                        onClick={() =>
                          handleSaveSingleRackOverride(
                            selectedSlot.lokasi,
                            editCapValue,
                            editCatValue,
                            selectedSlot.area,
                            editNotesValue
                          )
                        }
                        className="w-full px-4 py-2 text-xs font-extrabold bg-slate-900 dark:bg-amber-500 text-white dark:text-black rounded-xl hover:opacity-90 cursor-pointer flex items-center justify-center gap-1.5 h-[36px] whitespace-nowrap"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Simpan Rak Ini</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Smart Recommendation: Nearest Empty / Low-Occupancy Racks in Same Category */}
              {recommendedRacks.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-extrabold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>
                        Rekomendasi Rak Kosong / Longgar Terdekat (Kategori: {selectedSlot.category})
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      Klik tombol di bawah untuk menyiapkan tugas pindah ke rak tujuan
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {recommendedRacks.map((rec) => (
                      <div
                        key={rec.lokasi}
                        className="p-3 rounded-xl bg-white dark:bg-[#131d31] border border-emerald-200/80 dark:border-slate-800 flex flex-col justify-between gap-2 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                            Rak {rec.lokasi}
                          </span>
                          <span className="font-mono tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {rec.fillPercent}% ({rec.currentQty}/{rec.maxCapacity} pcs)
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          Sisa ruang tersedia:{' '}
                          <strong className="font-mono text-slate-800 dark:text-slate-200">
                            {rec.availableSpace} pcs
                          </strong>
                        </div>
                        {selectedSlot.currentQty > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSimFromLoc(selectedSlot.lokasi);
                              setSimToLoc(rec.lokasi);
                              setSimSku(selectedSlot.items[0]?.sku || '');
                              setSimQty(
                                Math.min(
                                  selectedSlot.overCapacityQty > 0
                                    ? selectedSlot.overCapacityQty
                                    : selectedSlot.currentQty,
                                  rec.availableSpace
                                )
                              );
                              setIsSimPanelOpen(true);
                              setSelectedRackLokasi(null);
                              onNotify?.(
                                `Form rekomendasi pindah disiapkan: ${selectedSlot.lokasi} → ${rec.lokasi}`,
                                'info'
                              );
                            }}
                            className="mt-1 px-3 py-1.5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer text-center"
                          >
                            Rekomendasi Pindah ke {rec.lokasi}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Two-Column Layout: Physical Products in Rack (Left) + Recent Scan Logs (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* SKU Items in This Rack */}
                <div className="lg:col-span-7 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                      Daftar Produk Fisik di Rak {selectedSlot.lokasi} ({selectedSlot.items.length}{' '}
                      SKU)
                    </h4>
                    <span className="text-[11px] font-mono text-slate-500">
                      Total: {selectedSlot.currentQty} pcs
                    </span>
                  </div>
                  {selectedSlot.items.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                      Rak ini sedang kosong (0 pcs).
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                      {selectedSlot.items.map((item) => (
                        <div
                          key={item.sku}
                          className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {item.nama_produk}{' '}
                              <span className="inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono font-extrabold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                Size: {item.size}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                              SKU: {item.sku}
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-mono tabular-nums text-sm font-black text-slate-900 dark:text-white">
                              {item.qty} pcs
                            </span>
                            {recommendedRacks[0] && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSimFromLoc(selectedSlot.lokasi);
                                  setSimToLoc(recommendedRacks[0].lokasi);
                                  setSimSku(item.sku);
                                  setSimQty(item.qty);
                                  setIsSimPanelOpen(true);
                                  setSelectedRackLokasi(null);
                                  onNotify?.(
                                    `Item ${item.nama_produk} (${item.size}) disiapkan pada form Rekomendasi Pindah (${selectedSlot.lokasi} → ${recommendedRacks[0].lokasi}).`,
                                    'info'
                                  );
                                }}
                                className="px-2.5 py-1.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200/70 dark:border-purple-800/50 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 cursor-pointer whitespace-nowrap"
                              >
                                Rekomendasi Pindah
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Scan History in This Rack */}
                <div className="lg:col-span-5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    <History className="w-3.5 h-3.5 text-amber-500" />
                    <span>Riwayat Scan Operator Terakhir di Rak {selectedSlot.lokasi}</span>
                  </div>
                  {loadingRackLogs ? (
                    <div className="p-6 text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl">
                      Memuat riwayat scan...
                    </div>
                  ) : rackLogs.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                      Belum ada riwayat mutasi tercatat untuk lokasi {selectedSlot.lokasi}.
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                      {rackLogs.map((log, i) => (
                        <div
                          key={log.id || i}
                          className="p-3 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`font-mono font-black ${
                                  log.type === 'IN' || log.type === 'ADJ_IN'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : log.type === 'OUT' || log.type === 'ADJ_OUT'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-blue-600 dark:text-blue-400'
                                }`}
                              >
                                #{log.type}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                                {log.sku}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {log.operator || 'Operator'} ·{' '}
                              {log.created_at
                                ? new Date(log.created_at).toLocaleString('id-ID')
                                : '-'}
                            </div>
                          </div>
                          <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white shrink-0">
                            {log.qty} pcs
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end bg-slate-50/70 dark:bg-[#0E1420]">
              <button
                type="button"
                onClick={() => setSelectedRackLokasi(null)}
                className="px-5 py-2 text-xs font-extrabold text-slate-700 dark:text-slate-200 bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Tutup Detail Rak
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
          7. SETUP MODAL (Bulk Zone Setup, Specific Rack Override, Add New Zone/Area)
          ============================================================================ */}
      {isSetupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Setup Kapasitas Rak, Kategori Zona &amp; Lokasi Gudang
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Atur kapasitas maksimal secara massal per zona (A=Dress, B=Bottom, C=Top, D=Sale), tambah area baru, atau ubah spesifik per rak.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSetupModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs (Responsive Grid 2x2 on Mobile, 4-Cols on Desktop - Bebas Tenggelam & Anti-Scrollbar) */}
            <div className="p-3 sm:px-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0E1420] shrink-0">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {[
                  {
                    id: 'ZONES' as const,
                    number: '1',
                    title: 'Setup Zona Massal',
                    subtitle: 'Zona A - D & Area',
                  },
                  {
                    id: 'SINGLE_OVERRIDE' as const,
                    number: '2',
                    title: 'Edit Spesifik Rak',
                    subtitle: 'Per Nomor Lokasi',
                  },
                  {
                    id: 'ADD_ZONE' as const,
                    number: '3',
                    title: 'Tambah Area Baru',
                    subtitle: 'Rentang Lokasi Baru',
                  },
                  {
                    id: 'BUFFER_RULES' as const,
                    number: '4',
                    title: 'Buffer & Evakuasi',
                    subtitle: 'Aturan Refill Koli',
                    badge: 'REFILL',
                  },
                ].map((t) => {
                  const isActive = setupTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSetupTab(t.id)}
                      className={`p-2.5 rounded-xl border transition-all text-left flex items-start gap-2.5 cursor-pointer relative overflow-hidden ${
                        isActive
                          ? 'bg-white dark:bg-[#131d31] border-amber-500 shadow-sm ring-1 ring-amber-500/30'
                          : 'bg-slate-100/70 hover:bg-white dark:bg-slate-800/40 dark:hover:bg-slate-800 border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-black transition-colors ${
                          isActive
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {t.number}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-extrabold truncate block ${
                              isActive
                                ? 'text-slate-900 dark:text-white'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {t.title}
                          </span>
                          {'badge' in t && t.badge && (
                            <span className="hidden sm:inline-block text-[8px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              {t.badge}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block mt-0.5">
                          {t.subtitle}
                        </span>
                      </div>

                      {isActive && (
                        <div className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-bl-md" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {setupTab === 'ZONES' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Ubah kategori produk, prefix &amp; rentang nomor, serta kapasitas maksimal default untuk Warehouse (A–D), Transit (X), Kolian/Koli (R, V, Z), Blok F (Shopee, TikTok, Studio), dan Perbaikan (Cuci CC, Permak PMK, Defect DF).
                    </span>
                    <button
                      type="button"
                      onClick={handleResetDefaultConfig}
                      className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      Kembalikan ke Default Standar
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {draftZones.map((z, idx) => (
                      <div
                        key={z.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#0E1420] grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end"
                      >
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">
                            Nama Zona &amp; Area
                          </label>
                          <input
                            type="text"
                            value={z.zoneName}
                            onChange={(e) => {
                              const next = [...draftZones];
                              next[idx] = { ...z, zoneName: e.target.value };
                              setDraftZones(next);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1">
                            Kategori Produk
                          </label>
                          <input
                            type="text"
                            value={z.category}
                            onChange={(e) => {
                              const next = [...draftZones];
                              next[idx] = { ...z, category: e.target.value };
                              setDraftZones(next);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                        </div>
                        {z.staticLocations && z.staticLocations.length > 0 ? (
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">
                              Daftar Lokasi Statis (Pisah Koma)
                            </label>
                            <input
                              type="text"
                              value={z.staticLocations.join(', ')}
                              onChange={(e) => {
                                const next = [...draftZones];
                                next[idx] = {
                                  ...z,
                                  staticLocations: e.target.value
                                    .split(',')
                                    .map((s) => s.trim().toUpperCase())
                                    .filter(Boolean),
                                };
                                setDraftZones(next);
                              }}
                              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                            />
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 mb-1">
                                Prefix &amp; No Awal
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={z.prefix}
                                  onChange={(e) => {
                                    const next = [...draftZones];
                                    next[idx] = { ...z, prefix: e.target.value.toUpperCase() };
                                    setDraftZones(next);
                                  }}
                                  className="w-12 px-2 py-1.5 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  value={z.startNum}
                                  onChange={(e) => {
                                    const next = [...draftZones];
                                    next[idx] = {
                                      ...z,
                                      startNum: Math.max(1, Number(e.target.value) || 1),
                                    };
                                    setDraftZones(next);
                                  }}
                                  className="w-full px-2 py-1.5 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 mb-1">
                                Sampai Nomor
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={z.endNum}
                                onChange={(e) => {
                                  const next = [...draftZones];
                                  next[idx] = {
                                    ...z,
                                    endNum: Math.max(z.startNum, Number(e.target.value) || 100),
                                  };
                                  setDraftZones(next);
                                }}
                                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                              />
                            </div>
                          </>
                        )}
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-400 mb-1">
                              Kapasitas Max (Pcs)
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={z.defaultMaxCapacity}
                              onChange={(e) => {
                                const next = [...draftZones];
                                next[idx] = {
                                  ...z,
                                  defaultMaxCapacity: Math.max(1, Number(e.target.value) || 1),
                                };
                                setDraftZones(next);
                              }}
                              className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-[#131d31] border border-amber-400 rounded-lg text-slate-900 dark:text-white"
                            />
                          </div>
                          {draftZones.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftZones((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer mt-4"
                              title="Hapus zona ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {setupTab === 'SINGLE_OVERRIDE' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Tambah / Ubah Kapasitas Spesifik Per Rak (Contoh: A001 = 25 pcs, B001 = 40 pcs)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Kode Rak / Lokasi
                        </label>
                        <input
                          type="text"
                          value={singleOverrideLoc}
                          onChange={(e) => setSingleOverrideLoc(e.target.value.toUpperCase())}
                          placeholder="Misal: A001"
                          className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Kapasitas Max (Pcs)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={singleOverrideCap}
                          onChange={(e) =>
                            setSingleOverrideCap(Math.max(1, Number(e.target.value) || 1))
                          }
                          className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Kategori (Opsional)
                        </label>
                        <input
                          type="text"
                          value={singleOverrideCat}
                          onChange={(e) => setSingleOverrideCat(e.target.value)}
                          placeholder="Dress / Bottom / Top"
                          className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Area Gudang
                        </label>
                        <input
                          type="text"
                          value={singleOverrideArea}
                          onChange={(e) => setSingleOverrideArea(e.target.value)}
                          placeholder="Warehouse"
                          className="w-full px-3 py-1.5 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleSaveSingleRackOverride(
                            singleOverrideLoc,
                            singleOverrideCap,
                            singleOverrideCat,
                            singleOverrideArea
                          );
                          setSingleOverrideLoc('');
                        }}
                        className="px-4 py-1.5 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-black rounded-lg cursor-pointer h-[32px] whitespace-nowrap"
                      >
                        Simpan Rak
                      </button>
                    </div>
                  </div>

                  {/* List of existing overrides */}
                  <div className="space-y-2">
                    <div className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                      Daftar Rak dengan Kapasitas Khusus ({Object.keys(config.overrides).length})
                    </div>
                    {Object.keys(config.overrides).length === 0 ? (
                      <div className="p-4 text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl">
                        Belum ada rak yang di-override secara individual. Semua rak mengikuti kapasitas zona masing-masing.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.values(config.overrides).map((ov) => (
                          <div
                            key={ov.lokasi}
                            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-mono font-black text-slate-900 dark:text-white">
                                {ov.lokasi}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                Max: {ov.maxCapacity} pcs
                                {ov.category ? ` · ${ov.category}` : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                const nextOv = { ...config.overrides };
                                delete nextOv[ov.lokasi];
                                const saved = await persistRackCapacityConfig(
                                  { ...config, overrides: nextOv },
                                  session?.name || session?.username || 'Admin'
                                );
                                setConfig(saved);
                              }}
                              className="p-1 text-rose-500 hover:text-rose-600 cursor-pointer"
                              title="Hapus override rak ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {setupTab === 'ADD_ZONE' && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Tambah Area &amp; Rentang Lokasi Rak Baru
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Nama Area Gudang
                      </label>
                      <input
                        type="text"
                        value={newZoneArea}
                        onChange={(e) => setNewZoneArea(e.target.value)}
                        placeholder="Contoh: Warehouse / Blok F / Koli"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Nama Label Zona
                      </label>
                      <input
                        type="text"
                        value={newZoneName}
                        onChange={(e) => setNewZoneName(e.target.value)}
                        placeholder="Contoh: Lokasi E (E001 - E050)"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Kategori Produk
                      </label>
                      <input
                        type="text"
                        value={newZoneCat}
                        onChange={(e) => setNewZoneCat(e.target.value)}
                        placeholder="Contoh: Outerwear / Hijab / Gamis"
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        Prefix Kode Rak (Huruf)
                      </label>
                      <input
                        type="text"
                        value={newZonePrefix}
                        onChange={(e) => setNewZonePrefix(e.target.value.toUpperCase())}
                        placeholder="Contoh: E atau R"
                        className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          No Awal
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newZoneStart}
                          onChange={(e) => setNewZoneStart(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full px-2.5 py-2 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          No Akhir
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newZoneEnd}
                          onChange={(e) => setNewZoneEnd(Math.max(1, Number(e.target.value) || 50))}
                          className="w-full px-2.5 py-2 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Digit (001)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={4}
                          value={newZonePad}
                          onChange={(e) => setNewZonePad(Number(e.target.value) || 0)}
                          className="w-full px-2.5 py-2 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Kapasitas Default (Pcs)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newZoneCap}
                          onChange={(e) => setNewZoneCap(Math.max(1, Number(e.target.value) || 25))}
                          className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">
                          Warna Identitas
                        </label>
                        <select
                          value={newZoneColor}
                          onChange={(e) => setNewZoneColor(e.target.value as RackZoneColor)}
                          className="w-full px-2.5 py-2 text-xs bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        >
                          <option value="rose">Merah Muda (Rose)</option>
                          <option value="blue">Biru (Blue)</option>
                          <option value="emerald">Hijau (Emerald)</option>
                          <option value="amber">Kuning (Amber)</option>
                          <option value="purple">Ungu (Purple)</option>
                          <option value="cyan">Biru Muda (Cyan)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddCustomZone}
                      className="px-4 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambahkan Zona Lokasi Baru</span>
                    </button>
                  </div>
                </div>
              )}

              {setupTab === 'BUFFER_RULES' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white">
                        Setup Buffer Picking &amp; Aturan Evakuasi Gudang (Tersimpan di Database)
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Atur ambang batas stok minimum, buffer wajib tinggal untuk picker di rak ABCD, dan persentase yang disimpan ke Koli (R, V, Z).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEvacRule(DEFAULT_ABCD_TO_KOLI_RULE)}
                      className="text-xs font-bold text-rose-600 hover:underline cursor-pointer shrink-0"
                    >
                      Kembalikan ke Default Standar
                    </button>
                  </div>

                  {/* Section A: Evakuasi ABCD -> Koli */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        A. Aturan Evakuasi / Penyimpanan ke Koli (ABCD ➔ Koli)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* 1. Min Stock Threshold */}
                      <div className="p-3 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          1. Minimal Stok di Rak ABCD (Syarat Evaluasi)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={5}
                            max={200}
                            step={5}
                            value={evacRule.minStockThreshold}
                            onChange={(e) =>
                              setEvacRule((prev) => ({
                                ...prev,
                                minStockThreshold: Math.max(5, Number(e.target.value) || 25),
                              }))
                            }
                            className="w-24 px-2.5 py-1.5 text-xs font-bold font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                          <span className="text-xs text-slate-500 font-bold">pcs</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Hanya SKU dengan stok &ge; {evacRule.minStockThreshold} pcs di rak ABCD yang dievaluasi. SKU dengan kuantitas kecil (stok normal harian) dilewati.
                        </p>
                      </div>

                      {/* 2. Mandatory Picking Buffer */}
                      <div className="p-3 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          2. Sisa Wajib Tinggal di Rak ABCD (Buffer Picker)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            step={1}
                            value={evacRule.mandatoryPickingBuffer}
                            onChange={(e) =>
                              setEvacRule((prev) => ({
                                ...prev,
                                mandatoryPickingBuffer: Math.max(1, Number(e.target.value) || 10),
                              }))
                            }
                            className="w-24 px-2.5 py-1.5 text-xs font-bold font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          />
                          <span className="text-xs text-slate-500 font-bold">pcs</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Kuantitas minimal yang <strong>WAJIB tertinggal</strong> di rak ABCD agar picker tidak perlu jalan jauh ke koli saat ada order harian.
                        </p>
                      </div>

                      {/* 3. Evacuate Percentage */}
                      <div className="p-3 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          3. Persentase Dipindahkan ke Koli
                        </label>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          {[40, 50, 60, 70, 80].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() =>
                                setEvacRule((prev) => ({
                                  ...prev,
                                  evacuatePercent: pct,
                                }))
                              }
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                                evacRule.evacuatePercent === pct
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Persentase dari kelebihan kuantitas yang dialihkan ke rak Koli ({evacRule.evacuatePercent}%).
                        </p>
                      </div>
                    </div>

                    {/* Live Simulation Explanation */}
                    <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                      💡 <strong>Prinsip Simulasi:</strong> Jika ada SKU berisi <strong>30 pcs</strong> di rak A001 ➔ sistem akan menyisakan <strong>{Math.max(evacRule.mandatoryPickingBuffer, Math.round(30 * (1 - evacRule.evacuatePercent / 100)))} pcs</strong> di rak A001 untuk picking harian, dan memindahkan <strong>{30 - Math.max(evacRule.mandatoryPickingBuffer, Math.round(30 * (1 - evacRule.evacuatePercent / 100)))} pcs ({Math.round(((30 - Math.max(evacRule.mandatoryPickingBuffer, Math.round(30 * (1 - evacRule.evacuatePercent / 100)))) / 30) * 100)}%)</strong> ke Koli R/V/Z.
                    </div>
                  </div>

                  {/* Section B: Refill Koli -> ABCD */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        B. Aturan Suplai / Refill dari Koli ke Rak ABCD (Koli ➔ ABCD)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Ambang Batas Trigger Refill */}
                      <div className="p-3 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Ambang Batas Trigger Refill (Sisa di Rak ABCD)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={15}
                            value={config.refillTriggerThreshold ?? 3}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              setConfig((prev) => ({ ...prev, refillTriggerThreshold: val }));
                            }}
                            className="w-20 px-2 py-1 text-xs font-bold font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                          />
                          <span className="text-xs text-slate-500 font-bold">pcs</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Refill dari koli disiapkan jika total stok SKU di ABCD &le; batas ini (default 3 pcs). <strong>Tidak perlu menunggu rak 0 pcs</strong> untuk melakukan refill.
                        </p>
                      </div>

                      {/* Batas Maksimal Refill Per SKU */}
                      <div className="p-3 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          Batas Maksimal Refill Per SKU ke Rak ABCD
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={3}
                            max={40}
                            value={config.refillMaxPerSkuAbcd ?? 12}
                            onChange={(e) => {
                              const val = Math.max(3, Number(e.target.value) || 12);
                              setConfig((prev) => ({ ...prev, refillMaxPerSkuAbcd: val }));
                            }}
                            className="w-20 px-2 py-1 text-xs font-bold font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                          />
                          <span className="text-xs text-slate-500 font-bold">pcs/SKU</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Mencegah 1 SKU memonopoli 100% ruang rak jika di Koli ada puluhan pcs. Refill barang A prioritaskan ke rak aslinya jika muat, atau ke rak lain yang tersedia.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Section C: Plafon Kapasitas Aman Rak Tujuan */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        C. Plafon Kapasitas Aman Rak Tujuan (Anti-Sesak / Anti-Overload)
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Persentase Maksimal Rak Tujuan Saat Menerima Pindahan / Refill
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 max-w-xl">
                          Rekomendasi relokasi overload atau refill <strong>tidak akan pernah memadatkan rak tujuan hingga 100% penuh</strong>. Rak tujuan selalu disisakan ruang longgar (default 75%) agar operator dapat memasukkan dan mengambil pakaian dengan mudah.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {[65, 70, 75, 80, 85].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() =>
                              setConfig((prev) => ({ ...prev, safeOccupancyCapPercent: pct }))
                            }
                            className={`px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                              (config.safeOccupancyCapPercent ?? 75) === pct
                                ? 'bg-amber-500 text-black shadow-xs font-black'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Section D: Konsolidasi SKU Terpencar */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        D. Aturan Penyatuan SKU Terpencar (Konsolidasi Antar Rak)
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Batas Toleransi Jarak Rak untuk Penyatuan SKU
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 max-w-xl">
                          Jika barang A ada di rak A001 (7 pcs) dan A002 (2 pcs), jarak &le; {config.consolidationDistanceThreshold ?? 3} rak (<strong>dibiarkan karena berdekatan</strong>). Jika barang A ada di A001 dan A016, jarak 15 rak (&gt; {config.consolidationDistanceThreshold ?? 3}) maka sistem merekomendasikan disatukan ke satu tempat.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono font-bold text-slate-500">Maks Jarak:</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={config.consolidationDistanceThreshold ?? 3}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value) || 3);
                            setConfig((prev) => ({ ...prev, consolidationDistanceThreshold: val }));
                          }}
                          className="w-16 px-2 py-1 text-xs font-bold font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-white"
                        />
                        <span className="text-xs text-slate-500 font-bold">rak</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/60 dark:bg-[#0E1420]">
              <button
                type="button"
                onClick={() => setIsSetupModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Tutup
              </button>
              {setupTab === 'ZONES' && (
                <button
                  type="button"
                  disabled={isSavingConfig}
                  onClick={handleSaveBulkZones}
                  className="px-5 py-2 text-xs font-extrabold bg-slate-900 dark:bg-amber-500 text-white dark:text-black rounded-xl hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingConfig ? 'Menyimpan...' : 'Simpan Semua Perubahan Zona'}</span>
                </button>
              )}
              {setupTab === 'BUFFER_RULES' && (
                <button
                  type="button"
                  disabled={isSavingConfig}
                  onClick={() => handleSaveEvacuationRule(evacRule)}
                  className="px-5 py-2 text-xs font-extrabold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingConfig ? 'Menyimpan...' : 'Simpan Pengaturan Buffer ke Database'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
          8. A4 SURAT JALAN (FORM TUGAS PICKER) PREVIEW & PRINT MODAL
          ============================================================================ */}
      {isSjPrintModalOpen && simulationMoves.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-[#0E1420]">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Printer className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>
                    Pratinjau Surat Jalan / Form Tugas Picker (A4) — {sjDocumentNumber}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Dokumen kerja fisik untuk Picker melakukan pengambilan dari Rak Koli / Rak Asal dan penempatan terkonsolidasi ke Rak Tujuan.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySimulationTask}
                  className="px-3 py-1.5 text-xs font-extrabold bg-purple-600 hover:bg-purple-500 text-white rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedSimText ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{copiedSimText ? 'Tersalin!' : 'Salin Format WA'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleTriggerA4Print}
                  className="px-4 py-1.5 text-xs font-extrabold bg-slate-900 dark:bg-amber-500 text-white dark:text-black rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Sekarang (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSjPrintModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* A4 Sheet Preview Content */}
            <div className="p-6 overflow-y-auto bg-slate-100 dark:bg-[#0A0F18] flex-1">
              <div className="bg-white text-slate-900 rounded-xl shadow-md border border-slate-300 p-6 max-w-3xl mx-auto space-y-4">
                {/* Sheet Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-slate-900 pb-3">
                  <div>
                    <div className="text-base font-black tracking-tight text-slate-900">
                      SURAT JALAN / FORM TUGAS PICKER (REFILL &amp; RELOKASI RAK)
                    </div>
                    <div className="text-xs text-slate-600">
                      Konsolidasi Putaway Rak Koli (R, V, Z) &amp; Rak Utama Picking (ABCD)
                    </div>
                  </div>
                  <div className="text-xs font-mono sm:text-right space-y-0.5 text-slate-700">
                    <div>
                      <strong>No. Dokumen:</strong> {sjDocumentNumber}
                    </div>
                    <div>
                      <strong>Tanggal:</strong>{' '}
                      {new Date().toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                    <div>
                      <strong>Dibuat Oleh:</strong>{' '}
                      {session?.name || session?.username || 'Admin Gudang'}
                    </div>
                  </div>
                </div>

                {/* Summary Strip */}
                <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Total Produk &amp; Baris
                    </div>
                    <div className="text-sm font-black font-mono text-slate-900 mt-0.5">
                      {recommendationSummary.uniqueSkus} SKU ({recommendationSummary.totalMoves}{' '}
                      baris)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Total Kuantitas Pindah
                    </div>
                    <div className="text-sm font-black font-mono text-slate-900 mt-0.5">
                      {recommendationSummary.totalPcs} Pcs
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Konsolidasi Titik Rak
                    </div>
                    <div className="text-sm font-black font-mono text-emerald-700 mt-0.5">
                      {recommendationSummary.uniqueFromRacks} Rak Asal ➔{' '}
                      {recommendationSummary.uniqueToRacks} Rak Tujuan
                    </div>
                  </div>
                </div>

                {/* Grouped Route Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs border border-slate-300">
                    <thead>
                      <tr className="bg-slate-900 text-white text-[10px] uppercase font-extrabold">
                        <th className="py-2 px-2.5 border border-slate-700 text-center w-9">No</th>
                        <th className="py-2 px-2.5 border border-slate-700 text-center w-20">
                          Rak Asal
                        </th>
                        <th className="py-2 px-2.5 border border-slate-700 text-center w-20">
                          Rak Tujuan
                        </th>
                        <th className="py-2 px-2.5 border border-slate-700 w-32">Kode SKU</th>
                        <th className="py-2 px-2.5 border border-slate-700">Nama Produk</th>
                        <th className="py-2 px-2.5 border border-slate-700 text-center w-14">
                          Size
                        </th>
                        <th className="py-2 px-2.5 border border-slate-700 text-right w-20">
                          Qty Pindah
                        </th>
                        <th className="py-2 px-2.5 border border-slate-700 text-center w-32">
                          Ceklis Scan Fisik
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedRecommendationRoutes.map((route, rIdx) => (
                        <React.Fragment key={route.routeKey}>
                          <tr className="bg-slate-100 font-extrabold text-slate-900 text-[11px]">
                            <td colSpan={8} className="py-1.5 px-3 border border-slate-300">
                              RUTE #{rIdx + 1}: DARI RAK ASAL [{route.fromLokasi}] ➔ KE RAK TUJUAN [
                              {route.toLokasi}] ({route.items.length} SKU / {route.totalPcs} pcs)
                            </td>
                          </tr>
                          {route.items.map((m, idx) => (
                            <tr key={m.id} className="border-b border-slate-200">
                              <td className="py-2 px-2.5 border border-slate-200 text-center font-mono">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-2.5 border border-slate-200 text-center font-mono font-black text-slate-900">
                                {m.fromLokasi}
                              </td>
                              <td className="py-2 px-2.5 border border-slate-200 text-center font-mono font-black text-purple-700">
                                {m.toLokasi}
                              </td>
                              <td className="py-2 px-2.5 border border-slate-200 font-mono font-bold text-slate-800">
                                {m.sku}
                              </td>
                              <td className="py-2 px-2.5 border border-slate-200 font-semibold text-slate-900">
                                {m.nama_produk}
                              </td>
                              <td className="py-2 px-2.5 border border-slate-200 text-center font-mono font-bold">
                                {m.size || 'ALL'}
                              </td>
                              <td className="py-2 px-2.5 border border-slate-200 text-right font-mono font-black text-slate-900">
                                {m.qty} pcs
                              </td>
                              <td className="py-2 px-2.5 border border-slate-200 text-center text-[10px] font-mono text-slate-600">
                                [ &nbsp; ] #OUT &nbsp; [ &nbsp; ] #IN
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* SOP Note & Signatures */}
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
                  <strong>SOP Eksekusi Picker Gudang:</strong> Lakukan scan <strong>#OUT</strong>{' '}
                  pada Rak Asal saat mengambil fisik barang, kemudian tempatkan sesuai Rak Tujuan
                  yang telah dikonsolidasi dan lakukan scan <strong>#IN</strong> pada Rak Tujuan.
                </div>

                <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs text-slate-700">
                  <div>
                    <div>Ditugaskan Oleh (Admin)</div>
                    <div className="mt-12 border-t border-slate-400 pt-1 font-bold text-slate-900">
                      {session?.name || session?.username || 'Admin Gudang'}
                    </div>
                  </div>
                  <div>
                    <div>Dikerjakan Oleh (Picker)</div>
                    <div className="mt-12 border-t border-slate-400 pt-1 font-bold text-slate-500">
                      ( .................................... )
                    </div>
                  </div>
                  <div>
                    <div>Diverifikasi Oleh (SPV / QC)</div>
                    <div className="mt-12 border-t border-slate-400 pt-1 font-bold text-slate-500">
                      ( .................................... )
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
