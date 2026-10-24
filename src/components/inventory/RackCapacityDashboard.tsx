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
} from 'lucide-react';
import type { StockRealtimeItem, UserSession, LogProdukItem } from '../../types';
import { supabaseFetch } from '../../services/supabase';
import {
  type RackCapacityConfig,
  type RackZoneRule,
  type RackZoneColor,
  type ComputedRackSlot,
  type SimulationMove,
  type RackStatusLevel,
  loadLocalRackCapacityConfig,
  fetchRackCapacityConfig,
  persistRackCapacityConfig,
  computeAllRackSlots,
  getRecommendedNearbyRacks,
  getDefaultRackCapacityConfig,
} from '../../services/rackCapacityService';

interface RackCapacityDashboardProps {
  stockRows: StockRealtimeItem[];
  session?: UserSession | null;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onOpenPrintModal?: (lokasi: string) => void;
  onRefreshStock?: () => void;
  isRefreshingStock?: boolean;
}

type ViewMode = 'GRID' | 'TABLE';
type StatusFilter = 'ALL' | 'OVERLOAD' | 'WARNING_FULL' | 'SAFE' | 'EMPTY';
type SetupTab = 'ZONES' | 'SINGLE_OVERRIDE' | 'ADD_ZONE';

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

  // Pre-Execution Relocation Simulation State
  const [simulationMoves, setSimulationMoves] = useState<SimulationMove[]>([]);
  const [isSimPanelOpen, setIsSimPanelOpen] = useState(false);
  const [simFromLoc, setSimFromLoc] = useState('');
  const [simToLoc, setSimToLoc] = useState('');
  const [simSku, setSimSku] = useState('');
  const [simQty, setSimQty] = useState<number>(1);
  const [copiedSimText, setCopiedSimText] = useState(false);

  // Load remote config on mount
  useEffect(() => {
    let mounted = true;
    fetchRackCapacityConfig().then((remote) => {
      if (mounted) setConfig(remote);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Compute all rack slots in real-time
  const allSlots = useMemo(
    () => computeAllRackSlots(config, stockRows, simulationMoves),
    [config, stockRows, simulationMoves]
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

      const effectiveStatus = simulationMoves.length > 0 ? s.simulatedStatus : s.status;
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
      zs.currentQty += simulationMoves.length > 0 ? s.simulatedQty : s.currentQty;
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

  // Distinct Categories for Filter
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
  }, [allSlots, selectedZoneId, selectedCategory, statusFilter, searchQuery, simulationMoves.length]);

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

  // Simulation Handlers
  const handleAddSimulationMove = () => {
    const from = simFromLoc.trim().toUpperCase();
    const to = simToLoc.trim().toUpperCase();
    const qty = Math.max(1, Math.round(simQty));
    if (!from || !to || from === to) {
      onNotify?.('Pilih rak asal dan rak tujuan yang berbeda.', 'warning');
      return;
    }

    const srcSlot = slotByLokasi.get(from);
    const matchedItem = srcSlot?.items.find((i) => i.sku === simSku) || srcSlot?.items[0];
    const move: SimulationMove = {
      id: `sim_${Date.now()}`,
      fromLokasi: from,
      toLokasi: to,
      sku: simSku || matchedItem?.sku || 'BARANG-CAMPURAN',
      nama_produk: matchedItem?.nama_produk || 'Relokasi Kapasitas Rak',
      qty,
      createdAt: new Date().toISOString(),
    };

    setSimulationMoves((prev) => [...prev, move]);
    onNotify?.(`Simulasi pindah ${qty} pcs dari ${from} ke ${to} ditambahkan.`, 'info');
  };

  const handleCopySimulationTask = async () => {
    if (simulationMoves.length === 0) return;
    const lines = [
      `*INSTRUKSI RELOKASI KAPASITAS RAK GUDANG*`,
      `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      `----------------------------------------`,
      ...simulationMoves.map(
        (m, idx) =>
          `${idx + 1}. Pindahkan *${m.qty} pcs* (${m.sku})\n   Dari Rak: *${m.fromLokasi}* -> Ke Rak: *${m.toLokasi}*`
      ),
      `----------------------------------------`,
      `_Catatan Picker: Lakukan scan #OUT pada rak asal lalu scan #IN pada rak tujuan._`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSimText(true);
      setTimeout(() => setCopiedSimText(false), 2000);
      onNotify?.('Instruksi tugas pindah rak berhasil disalin ke clipboard!', 'success');
    } catch {
      onNotify?.('Gagal menyalin teks ke clipboard.', 'error');
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
              Klik kartu zona di bawah untuk memfilter rak (Contoh: A = Dress, B = Bottom, C = Top, D = Sale)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selectedZoneId !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedZoneId('ALL')}
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
                Simulasi Pindah Rak
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
          3. PRE-EXECUTION RELOCATION SIMULATOR PANEL (Collapsible)
          ============================================================================ */}
      {(isSimPanelOpen || simulationMoves.length > 0) && (
        <div className="bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-purple-950 dark:text-purple-200 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Simulator Pindah Barang Antar Rak (Sebelum Dieksekusi Picker)</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Uji coba pemindahan stok dari rak overload ke rak kosong untuk melihat perubahan persentase secara langsung tanpa merusak data stok asli.
              </p>
            </div>
            {simulationMoves.length > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopySimulationTask}
                  className="px-3 py-1.5 text-xs font-extrabold bg-purple-600 hover:bg-purple-500 text-white rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {copiedSimText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSimText ? 'Tersalin!' : 'Salin Instruksi Picker (WA)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSimulationMoves([])}
                  className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 text-rose-600 border border-rose-200 dark:border-rose-900 rounded-xl hover:bg-rose-50 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Simulasi</span>
                </button>
              </div>
            )}
          </div>

          {/* Add Move Form */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end bg-white dark:bg-[#131d31] p-3 rounded-xl border border-purple-200/70 dark:border-slate-800">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Dari Rak Asal
              </label>
              <input
                type="text"
                value={simFromLoc}
                onChange={(e) => setSimFromLoc(e.target.value.toUpperCase())}
                placeholder="Contoh: A001"
                className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Ke Rak Tujuan
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
                SKU (Opsional)
              </label>
              <input
                type="text"
                value={simSku}
                onChange={(e) => setSimSku(e.target.value.toUpperCase())}
                placeholder="Pilih / Ketik SKU"
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
              <span>Tambah Simulasi</span>
            </button>
          </div>

          {/* Active Simulation Moves List */}
          {simulationMoves.length > 0 && (
            <div className="space-y-1.5">
              {simulationMoves.map((m) => {
                const fromSlot = slotByLokasi.get(m.fromLokasi);
                const toSlot = slotByLokasi.get(m.toLokasi);
                return (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-[#131d31] rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <strong className="text-slate-900 dark:text-white">{m.fromLokasi}</strong>
                      {fromSlot && (
                        <span className="text-slate-400">
                          ({fromSlot.fillPercent}% → {fromSlot.simulatedPercent}%)
                        </span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-purple-500" />
                      <strong className="text-purple-600 dark:text-purple-400">{m.toLokasi}</strong>
                      {toSlot && (
                        <span className="text-slate-400">
                          ({toSlot.fillPercent}% → {toSlot.simulatedPercent}%)
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {m.qty} pcs
                      </span>
                      <span className="text-slate-400">({m.sku})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSimulationMoves((prev) => prev.filter((x) => x.id !== m.id))
                      }
                      className="text-rose-500 hover:text-rose-600 p-1 cursor-pointer"
                      title="Hapus baris simulasi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
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
            const hasSim = simulationMoves.length > 0 && slot.simulatedQty !== slot.currentQty;
            const activePct = hasSim ? slot.simulatedPercent : slot.fillPercent;
            const activeQty = hasSim ? slot.simulatedQty : slot.currentQty;
            const activeStatus = hasSim ? slot.simulatedStatus : slot.status;
            const vis = getStatusVisual(activeStatus);
            const clampedHeightPct = Math.min(100, Math.max(0, activePct));

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

                {/* Top row: Rack Code & Overload Warning Icon */}
                <div className="relative z-10 flex items-start justify-between gap-1 w-full">
                  <div>
                    <div className="text-sm font-black font-mono text-slate-900 dark:text-white tracking-tight">
                      {slot.lokasi}
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
          6. RACK DETAIL & SMART RECOMMENDATION DRAWER
          ============================================================================ */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl bg-white dark:bg-[#131d31] h-full overflow-y-auto shadow-2xl border-l border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between">
            <div className="space-y-5">
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                      Rak {selectedSlot.lokasi}
                    </span>
                    <span
                      className={`text-xs font-extrabold ${
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
                    <span className="font-mono tabular-nums">
                      {selectedSlot.skuCount} SKU aktif
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRackLokasi(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Capacity Visual Meter */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-slate-500">
                    KETERISIAN FISIK SAAT INI
                  </span>
                  <span className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {selectedSlot.currentQty} / {selectedSlot.maxCapacity} pcs (
                    {selectedSlot.fillPercent}%)
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
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
                    <span>Sisa ruang tersedia: {selectedSlot.availableSpace} pcs</span>
                  )}
                  {onOpenPrintModal && (
                    <button
                      type="button"
                      onClick={() => {
                        const loc = selectedSlot.lokasi;
                        setSelectedRackLokasi(null);
                        onOpenPrintModal(loc);
                      }}
                      className="text-blue-600 dark:text-blue-400 font-sans font-bold hover:underline cursor-pointer"
                    >
                      Cetak / Ekspor Isi Rak Ini
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Edit Capacity for this Specific Rack */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  Pengaturan Kapasitas Spesifik Rak {selectedSlot.lokasi}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Kapasitas Max (Pcs)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={editCapValue}
                      onChange={(e) => setEditCapValue(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
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
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-end">
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
                      className="w-full px-3 py-1.5 text-xs font-extrabold bg-slate-900 dark:bg-amber-500 text-white dark:text-black rounded-lg hover:opacity-90 cursor-pointer flex items-center justify-center gap-1.5 h-[32px] whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Simpan Rak Ini</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Smart Recommendation: Nearest Empty / Low-Occupancy Racks in Same Category */}
              {recommendedRacks.length > 0 && (
                <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-extrabold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>
                        Rekomendasi Rak Kosong / Longgar Terdekat (Kategori: {selectedSlot.category})
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {recommendedRacks.map((rec) => (
                      <div
                        key={rec.lokasi}
                        className="p-2.5 rounded-xl bg-white dark:bg-[#131d31] border border-emerald-200/80 dark:border-slate-800 flex flex-col justify-between gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-xs text-slate-900 dark:text-white">
                            {rec.lokasi}
                          </span>
                          <span className="font-mono tabular-nums text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            {rec.fillPercent}% ({rec.currentQty}/{rec.maxCapacity})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Sisa ruang: <strong className="font-mono">{rec.availableSpace} pcs</strong>
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
                              onNotify?.(
                                `Form simulasi disiapkan: ${selectedSlot.lokasi} → ${rec.lokasi}`,
                                'info'
                              );
                            }}
                            className="mt-1 px-2 py-1 text-[10px] font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer text-center whitespace-nowrap"
                          >
                            Simulasi Pindah ke {rec.lokasi}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SKU Items in This Rack */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    Daftar Produk Fisik di Rak {selectedSlot.lokasi} ({selectedSlot.items.length} SKU)
                  </h4>
                </div>
                {selectedSlot.items.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Rak ini sedang kosong (0 pcs).
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                    {selectedSlot.items.map((item) => (
                      <div
                        key={item.sku}
                        className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-slate-900 dark:text-white truncate">
                            {item.sku}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.nama_produk} · Size {item.size}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono tabular-nums font-black text-slate-900 dark:text-white">
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
                              }}
                              className="px-2 py-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 rounded-lg hover:underline cursor-pointer whitespace-nowrap"
                            >
                              Simulasi Pindah
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Scan History in This Rack */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  <History className="w-3.5 h-3.5 text-amber-500" />
                  <span>Riwayat Scan Operator Terakhir di Rak {selectedSlot.lokasi}</span>
                </div>
                {loadingRackLogs ? (
                  <div className="p-4 text-xs text-slate-400">Memuat riwayat scan...</div>
                ) : rackLogs.length === 0 ? (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Belum ada riwayat mutasi tercatat untuk lokasi {selectedSlot.lokasi}.
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                    {rackLogs.map((log, i) => (
                      <div
                        key={log.id || i}
                        className="p-2.5 flex items-center justify-between gap-2 text-xs"
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
                          <div className="text-[10px] text-slate-400 truncate">
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
        </div>
      )}

      {/* ============================================================================
          7. SETUP MODAL (Bulk Zone Setup, Specific Rack Override, Add New Zone/Area)
          ============================================================================ */}
      {isSetupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Setup Kapasitas Rak, Kategori Zona &amp; Lokasi Gudang
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Atur kapasitas maksimal secara massal per zona (A=Dress, B=Bottom, C=Top, D=Sale), tambah area baru, atau ubah spesifik per rak.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSetupModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/60 dark:bg-[#0E1420]">
              {(
                [
                  { id: 'ZONES', label: '1. Setup Massal Per Zona (A - D & Area)' },
                  { id: 'SINGLE_OVERRIDE', label: '2. Edit Spesifik Per Nomor Rak' },
                  { id: 'ADD_ZONE', label: '3. Tambah Area / Rentang Lokasi Baru' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSetupTab(t.id)}
                  className={`px-3.5 py-2 text-xs font-extrabold rounded-t-xl border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                    setupTab === t.id
                      ? 'border-amber-500 text-slate-900 dark:text-white bg-white dark:bg-[#131d31]'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {setupTab === 'ZONES' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Ubah kategori produk, rentang nomor rak, dan kapasitas maksimal default untuk setiap zona.
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
