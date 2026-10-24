import { getSystemDocs, saveSystemDoc, getAreaFromLokasi } from './supabase';
import type { StockRealtimeItem } from '../types';

export const RACK_CAPACITY_DOC_ID = 'rack_capacity_config_v1';
const LOCAL_STORAGE_KEY = 'wms_rack_capacity_config_v1';

export type RackZoneColor = 'rose' | 'blue' | 'emerald' | 'amber' | 'purple' | 'cyan' | 'slate';

export interface RackZoneRule {
  id: string;
  area: string;         // e.g. 'Warehouse', 'Koli', 'Blok F', 'Aksesoris', 'Transit', 'Perbaikan'
  zoneName: string;     // e.g. 'Rak A', 'Rak B', 'Rak C', 'Rak D'
  prefix: string;       // e.g. 'A', 'B', 'C', 'D', 'R', 'BELT'
  startNum: number;     // e.g. 1
  endNum: number;       // e.g. 100
  padLength: number;    // e.g. 3 -> A001..A100 (0 means exact/static list or no padding)
  staticLocations?: string[]; // Optional explicit list like ['TIKTOK', 'SHOPEE', 'STUDIO']
  category: string;     // e.g. 'Dress', 'Bottom', 'Top', 'Sale'
  defaultMaxCapacity: number; // e.g. 25, 40, 35, 50
  color: RackZoneColor;
}

export interface RackLocationOverride {
  lokasi: string;
  maxCapacity: number;
  category?: string;
  area?: string;
  notes?: string;
  isCustomLocation?: boolean;
}

export interface RackCapacityConfig {
  version: number;
  updatedAt: string;
  updatedBy?: string;
  zones: RackZoneRule[];
  overrides: Record<string, RackLocationOverride>;
}

export interface RackSkuItem {
  sku: string;
  nama_produk: string;
  size: string;
  qty: number;
  updated_at?: string;
}

export type RackStatusLevel = 'EMPTY' | 'SAFE' | 'WARNING' | 'FULL' | 'OVERLOAD';

export interface ComputedRackSlot {
  lokasi: string;
  area: string;
  zoneId: string;
  zoneName: string;
  category: string;
  color: RackZoneColor;
  currentQty: number;
  simulatedQty: number;
  maxCapacity: number;
  fillPercent: number;          // Real fill % (can exceed 100%)
  simulatedPercent: number;     // Simulated fill %
  availableSpace: number;       // max(0, maxCapacity - currentQty)
  overCapacityQty: number;      // max(0, currentQty - maxCapacity)
  skuCount: number;
  items: RackSkuItem[];
  status: RackStatusLevel;
  simulatedStatus: RackStatusLevel;
  isOverridden: boolean;
  notes?: string;
}

export interface SimulationMove {
  id: string;
  fromLokasi: string;
  toLokasi: string;
  sku: string;
  nama_produk: string;
  qty: number;
  createdAt: string;
}

export const DEFAULT_RACK_ZONES: RackZoneRule[] = [
  {
    id: 'zone_wh_a',
    area: 'Warehouse',
    zoneName: 'Lokasi A (A001 - A100)',
    prefix: 'A',
    startNum: 1,
    endNum: 100,
    padLength: 3,
    category: 'Dress',
    defaultMaxCapacity: 25,
    color: 'rose',
  },
  {
    id: 'zone_wh_b',
    area: 'Warehouse',
    zoneName: 'Lokasi B (B001 - B100)',
    prefix: 'B',
    startNum: 1,
    endNum: 100,
    padLength: 3,
    category: 'Bottom',
    defaultMaxCapacity: 40,
    color: 'blue',
  },
  {
    id: 'zone_wh_c',
    area: 'Warehouse',
    zoneName: 'Lokasi C (C001 - C100)',
    prefix: 'C',
    startNum: 1,
    endNum: 100,
    padLength: 3,
    category: 'Top',
    defaultMaxCapacity: 35,
    color: 'emerald',
  },
  {
    id: 'zone_wh_d',
    area: 'Warehouse',
    zoneName: 'Lokasi D (D001 - D100)',
    prefix: 'D',
    startNum: 1,
    endNum: 100,
    padLength: 3,
    category: 'Sale',
    defaultMaxCapacity: 50,
    color: 'amber',
  },
  {
    id: 'zone_blok_f',
    area: 'Blok F',
    zoneName: 'Area Blok F (Live & Studio)',
    prefix: 'BLOKF',
    startNum: 0,
    endNum: 0,
    padLength: 0,
    staticLocations: ['TIKTOK', 'SHOPEE', 'STUDIO'],
    category: 'Live & Display',
    defaultMaxCapacity: 80,
    color: 'purple',
  },
  {
    id: 'zone_transit',
    area: 'Transit',
    zoneName: 'Area Transit',
    prefix: 'TRANSIT',
    startNum: 0,
    endNum: 0,
    padLength: 0,
    staticLocations: ['X', 'TRANSIT'],
    category: 'Transit',
    defaultMaxCapacity: 100,
    color: 'cyan',
  },
];

export function getDefaultRackCapacityConfig(): RackCapacityConfig {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    zones: DEFAULT_RACK_ZONES,
    overrides: {},
  };
}

export function loadLocalRackCapacityConfig(): RackCapacityConfig {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RackCapacityConfig;
      if (parsed && Array.isArray(parsed.zones) && parsed.zones.length > 0) {
        return {
          ...getDefaultRackCapacityConfig(),
          ...parsed,
          overrides: parsed.overrides || {},
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return getDefaultRackCapacityConfig();
}

export function saveLocalRackCapacityConfig(config: RackCapacityConfig): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

export async function fetchRackCapacityConfig(): Promise<RackCapacityConfig> {
  const local = loadLocalRackCapacityConfig();
  try {
    const docs = await getSystemDocs();
    const target = docs.find((d) => d.section_id === RACK_CAPACITY_DOC_ID);
    if (target && target.content) {
      const remote = JSON.parse(target.content) as RackCapacityConfig;
      if (remote && Array.isArray(remote.zones) && remote.zones.length > 0) {
        const merged: RackCapacityConfig = {
          version: remote.version || 1,
          updatedAt: remote.updatedAt || target.updated_at || new Date().toISOString(),
          updatedBy: remote.updatedBy || target.updated_by,
          zones: remote.zones,
          overrides: remote.overrides || {},
        };
        saveLocalRackCapacityConfig(merged);
        return merged;
      }
    }
  } catch {
    // fallback to local config if offline
  }
  return local;
}

export async function persistRackCapacityConfig(
  config: RackCapacityConfig,
  updatedBy = 'Admin'
): Promise<RackCapacityConfig> {
  const next: RackCapacityConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  saveLocalRackCapacityConfig(next);
  await saveSystemDoc({
    section_id: RACK_CAPACITY_DOC_ID,
    content: JSON.stringify(next),
    updated_by: updatedBy,
  });
  return next;
}

export function getRackStatusLevel(currentQty: number, maxCapacity: number): RackStatusLevel {
  if (currentQty <= 0) return 'EMPTY';
  if (maxCapacity <= 0) return 'OVERLOAD';
  const pct = (currentQty / maxCapacity) * 100;
  if (currentQty > maxCapacity) return 'OVERLOAD';
  if (pct >= 100) return 'FULL';
  if (pct >= 75) return 'WARNING';
  return 'SAFE';
}

export function expandZoneLocations(zone: RackZoneRule): string[] {
  if (zone.staticLocations && zone.staticLocations.length > 0) {
    return zone.staticLocations.map((l) => l.trim().toUpperCase()).filter(Boolean);
  }
  const out: string[] = [];
  const start = Math.max(1, Math.min(zone.startNum || 1, 2000));
  const end = Math.max(start, Math.min(zone.endNum || start, 2000));
  const prefix = (zone.prefix || '').trim().toUpperCase();
  if (!prefix) return out;
  for (let n = start; n <= end; n++) {
    const numStr = zone.padLength > 0 ? String(n).padStart(zone.padLength, '0') : String(n);
    out.push(`${prefix}${numStr}`);
  }
  return out;
}

function inferZoneForUnmappedLocation(lokasi: string): {
  area: string;
  zoneId: string;
  zoneName: string;
  category: string;
  defaultMaxCapacity: number;
  color: RackZoneColor;
} {
  const loc = lokasi.trim().toUpperCase();
  const area = getAreaFromLokasi(loc);

  if (area === 'Koli') {
    return {
      area: 'Koli',
      zoneId: 'zone_auto_koli',
      zoneName: 'Area Kolian (R / V / Z)',
      category: 'Kolian',
      defaultMaxCapacity: 100,
      color: 'amber',
    };
  }
  if (area === 'Aksesoris') {
    return {
      area: 'Aksesoris',
      zoneId: 'zone_auto_aksesoris',
      zoneName: 'Area Aksesoris (Belt / Box / Gift)',
      category: 'Aksesoris',
      defaultMaxCapacity: 60,
      color: 'purple',
    };
  }
  if (area === 'Perbaikan') {
    return {
      area: 'Perbaikan',
      zoneId: 'zone_auto_perbaikan',
      zoneName: 'Area Perbaikan (CC / PMK / DF)',
      category: 'Perbaikan',
      defaultMaxCapacity: 50,
      color: 'slate',
    };
  }
  if (area === 'Blok F') {
    return {
      area: 'Blok F',
      zoneId: 'zone_blok_f',
      zoneName: 'Area Blok F (Live & Studio)',
      category: 'Live & Display',
      defaultMaxCapacity: 80,
      color: 'purple',
    };
  }
  if (area === 'Transit') {
    return {
      area: 'Transit',
      zoneId: 'zone_transit',
      zoneName: 'Area Transit',
      category: 'Transit',
      defaultMaxCapacity: 100,
      color: 'cyan',
    };
  }

  return {
    area: area || 'Warehouse',
    zoneId: 'zone_auto_other',
    zoneName: `Lokasi Lainnya (${area || 'Gudang'})`,
    category: 'Umum',
    defaultMaxCapacity: 35,
    color: 'slate',
  };
}

/**
 * Computes all rack slots by combining:
 * 1. Configured Zones (e.g. A001..A100, B001..B100, C001..C100, D001..D100)
 * 2. Custom Overrides / Custom Added Locations
 * 3. Active Physical Stock Locations from stok_real_fisik (so no real stock is ever hidden)
 * 4. Optional Pre-Execution Simulation Moves
 */
export function computeAllRackSlots(
  config: RackCapacityConfig,
  stockRows: StockRealtimeItem[],
  simulationMoves: SimulationMove[] = []
): ComputedRackSlot[] {
  // 1. Group real physical stock by uppercased lokasi
  const stockByLoc = new Map<string, Map<string, RackSkuItem>>();
  for (let i = 0; i < stockRows.length; i++) {
    const row = stockRows[i];
    const qty = Number(row.sisa_stok) || 0;
    if (qty <= 0) continue; // Only positive physical stock occupies rack capacity
    const loc = String(row.lokasi || '').trim().toUpperCase();
    if (!loc || loc === '-' || loc === 'TANPA LOKASI') continue;

    const sku = String(row.sku || '').trim().toUpperCase();
    if (!sku) continue;

    let skuMap = stockByLoc.get(loc);
    if (!skuMap) {
      skuMap = new Map<string, RackSkuItem>();
      stockByLoc.set(loc, skuMap);
    }

    const existing = skuMap.get(sku);
    if (existing) {
      existing.qty += qty;
      if (row.updated_at && (!existing.updated_at || row.updated_at > existing.updated_at)) {
        existing.updated_at = row.updated_at;
      }
    } else {
      skuMap.set(sku, {
        sku,
        nama_produk: row.nama_produk || sku,
        size: row.size || 'ALL',
        qty,
        updated_at: row.updated_at,
      });
    }
  }

  // 2. Calculate simulation net deltas per location
  const simDeltaByLoc = new Map<string, number>();
  for (const move of simulationMoves) {
    const from = move.fromLokasi.trim().toUpperCase();
    const to = move.toLokasi.trim().toUpperCase();
    const q = Math.max(0, Number(move.qty) || 0);
    if (!from || !to || from === to || q <= 0) continue;
    simDeltaByLoc.set(from, (simDeltaByLoc.get(from) || 0) - q);
    simDeltaByLoc.set(to, (simDeltaByLoc.get(to) || 0) + q);
  }

  // 3. Build master map of locations from zones
  const slotMetaMap = new Map<
    string,
    {
      lokasi: string;
      area: string;
      zoneId: string;
      zoneName: string;
      category: string;
      color: RackZoneColor;
      maxCapacity: number;
      isOverridden: boolean;
      notes?: string;
    }
  >();

  for (const zone of config.zones) {
    const locs = expandZoneLocations(zone);
    for (const loc of locs) {
      slotMetaMap.set(loc, {
        lokasi: loc,
        area: zone.area,
        zoneId: zone.id,
        zoneName: zone.zoneName,
        category: zone.category,
        color: zone.color,
        maxCapacity: zone.defaultMaxCapacity,
        isOverridden: false,
      });
    }
  }

  // 4. Apply individual rack overrides & custom locations
  for (const [rawLoc, ov] of Object.entries(config.overrides || {})) {
    const loc = rawLoc.trim().toUpperCase();
    if (!loc) continue;
    const existing = slotMetaMap.get(loc);
    if (existing) {
      slotMetaMap.set(loc, {
        ...existing,
        maxCapacity: ov.maxCapacity > 0 ? ov.maxCapacity : existing.maxCapacity,
        category: ov.category?.trim() ? ov.category.trim() : existing.category,
        area: ov.area?.trim() ? ov.area.trim() : existing.area,
        isOverridden: true,
        notes: ov.notes,
      });
    } else {
      const inferred = inferZoneForUnmappedLocation(loc);
      slotMetaMap.set(loc, {
        lokasi: loc,
        area: ov.area?.trim() || inferred.area,
        zoneId: inferred.zoneId,
        zoneName: inferred.zoneName,
        category: ov.category?.trim() || inferred.category,
        color: inferred.color,
        maxCapacity: ov.maxCapacity > 0 ? ov.maxCapacity : inferred.defaultMaxCapacity,
        isOverridden: true,
        notes: ov.notes,
      });
    }
  }

  // 5. Ensure all locations currently holding physical stock are also included
  stockByLoc.forEach((_skuMap, loc) => {
    if (!slotMetaMap.has(loc)) {
      const inferred = inferZoneForUnmappedLocation(loc);
      slotMetaMap.set(loc, {
        lokasi: loc,
        area: inferred.area,
        zoneId: inferred.zoneId,
        zoneName: inferred.zoneName,
        category: inferred.category,
        color: inferred.color,
        maxCapacity: inferred.defaultMaxCapacity,
        isOverridden: false,
      });
    }
  });

  // 6. Compose final ComputedRackSlot list
  const result: ComputedRackSlot[] = [];
  slotMetaMap.forEach((meta, loc) => {
    const skuMap = stockByLoc.get(loc);
    const items = skuMap
      ? Array.from(skuMap.values()).sort((a, b) => b.qty - a.qty || a.sku.localeCompare(b.sku))
      : [];
    let currentQty = 0;
    for (let i = 0; i < items.length; i++) currentQty += items[i].qty;

    const simDelta = simDeltaByLoc.get(loc) || 0;
    const simulatedQty = Math.max(0, currentQty + simDelta);
    const maxCap = Math.max(1, meta.maxCapacity || 25);

    const fillPercent = Math.round((currentQty / maxCap) * 100);
    const simulatedPercent = Math.round((simulatedQty / maxCap) * 100);

    result.push({
      lokasi: loc,
      area: meta.area,
      zoneId: meta.zoneId,
      zoneName: meta.zoneName,
      category: meta.category,
      color: meta.color,
      currentQty,
      simulatedQty,
      maxCapacity: maxCap,
      fillPercent,
      simulatedPercent,
      availableSpace: Math.max(0, maxCap - currentQty),
      overCapacityQty: Math.max(0, currentQty - maxCap),
      skuCount: items.length,
      items,
      status: getRackStatusLevel(currentQty, maxCap),
      simulatedStatus: getRackStatusLevel(simulatedQty, maxCap),
      isOverridden: meta.isOverridden,
      notes: meta.notes,
    });
  });

  return result.sort((a, b) => a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true }));
}

function extractNumericSuffix(lokasi: string): { prefix: string; num: number | null } {
  const m = lokasi.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return { prefix: lokasi, num: null };
  return { prefix: m[1], num: parseInt(m[2], 10) };
}

/**
 * Recommends nearest empty or low-occupancy racks in the SAME category/zone
 */
export function getRecommendedNearbyRacks(
  sourceSlot: ComputedRackSlot,
  allSlots: ComputedRackSlot[],
  limit = 6
): ComputedRackSlot[] {
  const srcParsed = extractNumericSuffix(sourceSlot.lokasi);

  const candidates = allSlots.filter(
    (s) =>
      s.lokasi !== sourceSlot.lokasi &&
      s.category.toLowerCase() === sourceSlot.category.toLowerCase() &&
      s.availableSpace > 0 &&
      s.fillPercent < 85
  );

  candidates.sort((a, b) => {
    const aParsed = extractNumericSuffix(a.lokasi);
    const bParsed = extractNumericSuffix(b.lokasi);

    // Prefer same prefix (e.g. A -> A)
    const aSamePrefix = aParsed.prefix === srcParsed.prefix ? 0 : 1;
    const bSamePrefix = bParsed.prefix === srcParsed.prefix ? 0 : 1;
    if (aSamePrefix !== bSamePrefix) return aSamePrefix - bSamePrefix;

    // Prefer empty racks first or very close rack numbers
    if (srcParsed.num !== null && aParsed.num !== null && bParsed.num !== null) {
      const distA = Math.abs(aParsed.num - srcParsed.num);
      const distB = Math.abs(bParsed.num - srcParsed.num);
      // Weight proximity + emptiness
      const scoreA = distA + (a.currentQty > 0 ? 5 : 0);
      const scoreB = distB + (b.currentQty > 0 ? 5 : 0);
      if (scoreA !== scoreB) return scoreA - scoreB;
    }

    return a.fillPercent - b.fillPercent;
  });

  return candidates.slice(0, limit);
}
