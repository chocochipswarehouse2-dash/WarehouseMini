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

export type RecommendationMoveType = 'REFILL_KOLI' | 'RELOKASI_OVERLOAD' | 'MANUAL';

export interface SimulationMove {
  id: string;
  fromLokasi: string;
  toLokasi: string;
  sku: string;
  nama_produk: string;
  size?: string;
  category?: string;
  moveType?: RecommendationMoveType;
  qty: number;
  createdAt: string;
}

export interface EnrichedCatalogEntry {
  sku: string;
  nama_produk: string;
  size: string;
  kategori: string;
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
    id: 'zone_transit',
    area: 'Transit',
    zoneName: 'Area Transit X (X001 - X100)',
    prefix: 'X',
    startNum: 1,
    endNum: 100,
    padLength: 3,
    category: 'Transit',
    defaultMaxCapacity: 100,
    color: 'cyan',
  },
  {
    id: 'zone_koli_r',
    area: 'Kolian',
    zoneName: 'Lokasi Koli R (R001 - R100)',
    prefix: 'R',
    startNum: 1,
    endNum: 100,
    padLength: 3,
    category: 'Koli R',
    defaultMaxCapacity: 100,
    color: 'amber',
  },
  {
    id: 'zone_koli_v',
    area: 'Kolian',
    zoneName: 'Lokasi Koli V (V001 - V100)',
    prefix: 'V',
    startNum: 1,
    endNum: 100,
    padLength: 3,
    category: 'Koli V',
    defaultMaxCapacity: 100,
    color: 'purple',
  },
  {
    id: 'zone_koli_z',
    area: 'Kolian',
    zoneName: 'Lokasi Koli Z (Z001 - Z100)',
    prefix: 'Z',
    startNum: 1,
    endNum: 100,
    padLength: 3,
    category: 'Koli Z',
    defaultMaxCapacity: 100,
    color: 'emerald',
  },
  {
    id: 'zone_blok_f_shopee',
    area: 'Blok F',
    zoneName: 'Area Blok F — SHOPEE',
    prefix: 'SHOPEE',
    startNum: 0,
    endNum: 0,
    padLength: 0,
    staticLocations: ['SHOPEE'],
    category: 'Live Shopee',
    defaultMaxCapacity: 80,
    color: 'amber',
  },
  {
    id: 'zone_blok_f_tiktok',
    area: 'Blok F',
    zoneName: 'Area Blok F — TIKTOK',
    prefix: 'TIKTOK',
    startNum: 0,
    endNum: 0,
    padLength: 0,
    staticLocations: ['TIKTOK'],
    category: 'Live TikTok',
    defaultMaxCapacity: 80,
    color: 'purple',
  },
  {
    id: 'zone_blok_f_studio',
    area: 'Blok F',
    zoneName: 'Area Blok F — STUDIO',
    prefix: 'STUDIO',
    startNum: 0,
    endNum: 0,
    padLength: 0,
    staticLocations: ['STUDIO'],
    category: 'Display Studio',
    defaultMaxCapacity: 150,
    color: 'cyan',
  },
  {
    id: 'zone_perbaikan_cc',
    area: 'Perbaikan',
    zoneName: 'Area Perbaikan — Cuci (CC001 - CC020)',
    prefix: 'CC',
    startNum: 1,
    endNum: 20,
    padLength: 3,
    category: 'Cuci (CC)',
    defaultMaxCapacity: 50,
    color: 'cyan',
  },
  {
    id: 'zone_perbaikan_pmk',
    area: 'Perbaikan',
    zoneName: 'Area Perbaikan — Permak (PMK001 - PMK020)',
    prefix: 'PMK',
    startNum: 1,
    endNum: 20,
    padLength: 3,
    category: 'Permak (PMK)',
    defaultMaxCapacity: 50,
    color: 'amber',
  },
  {
    id: 'zone_perbaikan_df',
    area: 'Perbaikan',
    zoneName: 'Area Perbaikan — Defect (DF001 - DF050)',
    prefix: 'DF',
    startNum: 1,
    endNum: 50,
    padLength: 3,
    category: 'Defect (DF)',
    defaultMaxCapacity: 50,
    color: 'rose',
  },
];

export function getDefaultRackCapacityConfig(): RackCapacityConfig {
  return {
    version: 4,
    updatedAt: new Date().toISOString(),
    zones: DEFAULT_RACK_ZONES,
    overrides: {},
  };
}

/**
 * Ensures any previously saved v1/v2/v3 config automatically upgrades:
 * 1. Area Transit ('zone_transit') from static ['X', 'TRANSIT'] to variable range X (X001 - X100)
 * 2. Missing Koli / Kolian zones (prefix R, V, Z: R001-R100, V001-V100, Z001-Z100)
 * 3. Splits combined 'zone_blok_f' (['TIKTOK', 'SHOPEE', 'STUDIO']) into 3 independent zones
 *    so SHOPEE, TIKTOK, and STUDIO each have their own independent maxCapacity.
 * 4. Adds Area Perbaikan zones ('zone_perbaikan_cc', 'zone_perbaikan_pmk', 'zone_perbaikan_df')
 *    so Cuci (CC), Permak (PMK), and Defect (DF) each have their own setup row & capacity.
 */
export function normalizeAndMigrateRackConfig(raw: RackCapacityConfig): RackCapacityConfig {
  const incomingZones = Array.isArray(raw?.zones) ? raw.zones : [];
  if (incomingZones.length === 0) {
    return getDefaultRackCapacityConfig();
  }

  const upgradedZones: RackZoneRule[] = [];

  for (const z of incomingZones) {
    // 1. Upgrade zone_transit if saved as staticLocations in v1
    if (
      z.id === 'zone_transit' &&
      ((z.staticLocations && z.staticLocations.length > 0) ||
        z.prefix === 'TRANSIT' ||
        z.startNum === 0)
    ) {
      upgradedZones.push({
        ...z,
        area: 'Transit',
        zoneName:
          z.zoneName === 'Area Transit' ? 'Area Transit X (X001 - X100)' : z.zoneName,
        prefix: 'X',
        startNum: z.startNum > 0 ? z.startNum : 1,
        endNum: z.endNum > 0 ? z.endNum : 100,
        padLength: z.padLength > 0 ? z.padLength : 3,
        staticLocations: undefined,
        category: z.category || 'Transit',
        defaultMaxCapacity: z.defaultMaxCapacity || 100,
        color: z.color || 'cyan',
      });
      continue;
    }

    // 2. Split legacy combined zone_blok_f into 3 separate zones (SHOPEE, TIKTOK, STUDIO)
    if (
      z.id === 'zone_blok_f' ||
      (z.area === 'Blok F' && Array.isArray(z.staticLocations) && z.staticLocations.length > 1)
    ) {
      const legacyCap = z.defaultMaxCapacity || 80;
      const blokFDefaults = DEFAULT_RACK_ZONES.filter((dz) =>
        ['zone_blok_f_shopee', 'zone_blok_f_tiktok', 'zone_blok_f_studio'].includes(dz.id)
      );
      for (const bf of blokFDefaults) {
        if (!upgradedZones.some((uz) => uz.id === bf.id)) {
          upgradedZones.push({
            ...bf,
            defaultMaxCapacity:
              bf.id === 'zone_blok_f_studio' && legacyCap === 80 ? 150 : legacyCap,
          });
        }
      }
      continue;
    }

    if (z.area === 'Koli') {
      upgradedZones.push({ ...z, area: 'Kolian' });
      continue;
    }

    upgradedZones.push(z);
  }

  // Ensure Koli R, V, Z, Transit X, separate Blok F (SHOPEE, TIKTOK, STUDIO), and Perbaikan (CC, PMK, DF) exist
  const requiredZones = DEFAULT_RACK_ZONES.filter((dz) =>
    [
      'zone_transit',
      'zone_koli_r',
      'zone_koli_v',
      'zone_koli_z',
      'zone_blok_f_shopee',
      'zone_blok_f_tiktok',
      'zone_blok_f_studio',
      'zone_perbaikan_cc',
      'zone_perbaikan_pmk',
      'zone_perbaikan_df',
    ].includes(dz.id)
  );

  for (const req of requiredZones) {
    const exists = upgradedZones.some(
      (z) =>
        z.id === req.id ||
        (req.staticLocations?.length === 1 &&
          z.staticLocations?.length === 1 &&
          z.staticLocations[0].toUpperCase() === req.staticLocations[0]) ||
        (!req.staticLocations && z.prefix && z.prefix.toUpperCase() === req.prefix)
    );
    if (!exists) {
      upgradedZones.push({ ...req });
    }
  }

  return {
    version: Math.max(4, raw.version || 4),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    updatedBy: raw.updatedBy,
    zones: upgradedZones,
    overrides: raw.overrides || {},
  };
}

export function loadLocalRackCapacityConfig(): RackCapacityConfig {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RackCapacityConfig;
      if (parsed && Array.isArray(parsed.zones) && parsed.zones.length > 0) {
        return normalizeAndMigrateRackConfig(parsed);
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
        const merged = normalizeAndMigrateRackConfig({
          version: remote.version || 2,
          updatedAt: remote.updatedAt || target.updated_at || new Date().toISOString(),
          updatedBy: remote.updatedBy || target.updated_by,
          zones: remote.zones,
          overrides: remote.overrides || {},
        });
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
    version: Math.max(2, config.version || 2),
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

  if (area === 'Kolian' || area === 'Koli') {
    if (loc.startsWith('R')) {
      return {
        area: 'Kolian',
        zoneId: 'zone_koli_r',
        zoneName: 'Lokasi Koli R (R001 - R100)',
        category: 'Koli R',
        defaultMaxCapacity: 100,
        color: 'amber',
      };
    }
    if (loc.startsWith('V')) {
      return {
        area: 'Kolian',
        zoneId: 'zone_koli_v',
        zoneName: 'Lokasi Koli V (V001 - V100)',
        category: 'Koli V',
        defaultMaxCapacity: 100,
        color: 'purple',
      };
    }
    if (loc.startsWith('Z')) {
      return {
        area: 'Kolian',
        zoneId: 'zone_koli_z',
        zoneName: 'Lokasi Koli Z (Z001 - Z100)',
        category: 'Koli Z',
        defaultMaxCapacity: 100,
        color: 'emerald',
      };
    }
    return {
      area: 'Kolian',
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
    if (loc.startsWith('CC') || loc.includes('CUCI')) {
      return {
        area: 'Perbaikan',
        zoneId: 'zone_perbaikan_cc',
        zoneName: 'Area Perbaikan — Cuci (CC001 - CC020)',
        category: 'Cuci (CC)',
        defaultMaxCapacity: 50,
        color: 'cyan',
      };
    }
    if (loc.startsWith('PMK') || loc.includes('PERMAK')) {
      return {
        area: 'Perbaikan',
        zoneId: 'zone_perbaikan_pmk',
        zoneName: 'Area Perbaikan — Permak (PMK001 - PMK020)',
        category: 'Permak (PMK)',
        defaultMaxCapacity: 50,
        color: 'amber',
      };
    }
    if (loc.startsWith('DF') || loc.includes('DEFECT')) {
      return {
        area: 'Perbaikan',
        zoneId: 'zone_perbaikan_df',
        zoneName: 'Area Perbaikan — Defect (DF001 - DF050)',
        category: 'Defect (DF)',
        defaultMaxCapacity: 50,
        color: 'rose',
      };
    }
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
    if (loc === 'SHOPEE') {
      return {
        area: 'Blok F',
        zoneId: 'zone_blok_f_shopee',
        zoneName: 'Area Blok F — SHOPEE',
        category: 'Live Shopee',
        defaultMaxCapacity: 80,
        color: 'amber',
      };
    }
    if (loc === 'TIKTOK') {
      return {
        area: 'Blok F',
        zoneId: 'zone_blok_f_tiktok',
        zoneName: 'Area Blok F — TIKTOK',
        category: 'Live TikTok',
        defaultMaxCapacity: 80,
        color: 'purple',
      };
    }
    if (loc === 'STUDIO') {
      return {
        area: 'Blok F',
        zoneId: 'zone_blok_f_studio',
        zoneName: 'Area Blok F — STUDIO',
        category: 'Display Studio',
        defaultMaxCapacity: 150,
        color: 'cyan',
      };
    }
    return {
      area: 'Blok F',
      zoneId: 'zone_blok_f_other',
      zoneName: `Area Blok F (${loc})`,
      category: 'Live & Display',
      defaultMaxCapacity: 80,
      color: 'purple',
    };
  }
  if (area === 'Transit') {
    return {
      area: 'Transit',
      zoneId: 'zone_transit',
      zoneName: 'Area Transit X (X001 - X100)',
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
 * Checks whether a location/area is excluded from standard Warehouse ABCD / Koli / X relocation & refill.
 * Blok F (STUDIO, SHOPEE, TIKTOK), Perbaikan (CC, PMK, DF), and Anomali have distinct operational roles.
 */
export function isExcludedFromWarehouseRelocation(area: string, lokasi: string): boolean {
  const a = (area || '').trim().toUpperCase();
  const l = (lokasi || '').trim().toUpperCase();
  if (a === 'BLOK F' || a === 'PERBAIKAN' || a === 'ANOMALI') return true;
  if (l === 'SHOPEE' || l === 'TIKTOK' || l === 'STUDIO') return true;
  if (/^(CC|PMK|DF)\d*/i.test(l)) return true;
  return false;
}

/**
 * Computes all rack slots by combining:
 * 1. Configured Zones (e.g. A001..A100, B001..B100, C001..C100, D001..D100)
 * 2. Custom Overrides / Custom Added Locations
 * 3. Active Physical Stock Locations from stok_real_fisik (so no real stock is ever hidden)
 * 4. Optional Pre-Execution Recommendation / Simulation Moves
 * 5. Optional Master Produk Catalog Lookup (so nama_produk & size are always accurate)
 */
export function computeAllRackSlots(
  config: RackCapacityConfig,
  stockRows: StockRealtimeItem[],
  simulationMoves: SimulationMove[] = [],
  catalogMap?: Map<string, EnrichedCatalogEntry>
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

    const catInfo = catalogMap?.get(sku);
    const resolvedName =
      (catInfo?.nama_produk && catInfo.nama_produk !== sku ? catInfo.nama_produk : '') ||
      (row.nama_produk && row.nama_produk !== sku ? row.nama_produk : '') ||
      catInfo?.nama_produk ||
      row.nama_produk ||
      sku;
    const resolvedSize =
      (catInfo?.size && catInfo.size !== '-' ? catInfo.size : '') ||
      (row.size && row.size !== '-' ? row.size : '') ||
      'ALL';

    const existing = skuMap.get(sku);
    if (existing) {
      existing.qty += qty;
      if (existing.nama_produk === sku && resolvedName !== sku) {
        existing.nama_produk = resolvedName;
      }
      if ((existing.size === 'ALL' || !existing.size) && resolvedSize !== 'ALL') {
        existing.size = resolvedSize;
      }
      if (row.updated_at && (!existing.updated_at || row.updated_at > existing.updated_at)) {
        existing.updated_at = row.updated_at;
      }
    } else {
      skuMap.set(sku, {
        sku,
        nama_produk: resolvedName,
        size: resolvedSize,
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
 * Recommends nearest empty or low-occupancy racks in the SAME operational area & category/zone.
 * Strictly excludes Blok F (SHOPEE, TIKTOK, STUDIO), Perbaikan (CC, PMK, DF), and Anomali.
 */
export function getRecommendedNearbyRacks(
  sourceSlot: ComputedRackSlot,
  allSlots: ComputedRackSlot[],
  limit = 6
): ComputedRackSlot[] {
  if (isExcludedFromWarehouseRelocation(sourceSlot.area, sourceSlot.lokasi)) {
    return [];
  }

  const srcParsed = extractNumericSuffix(sourceSlot.lokasi);

  const candidates = allSlots.filter(
    (s) =>
      s.lokasi !== sourceSlot.lokasi &&
      !isExcludedFromWarehouseRelocation(s.area, s.lokasi) &&
      s.area.toUpperCase() === sourceSlot.area.toUpperCase() &&
      s.category.toLowerCase() === sourceSlot.category.toLowerCase() &&
      s.maxCapacity - s.simulatedQty > 0 &&
      s.simulatedPercent < 85
  );

  candidates.sort((a, b) => {
    const aParsed = extractNumericSuffix(a.lokasi);
    const bParsed = extractNumericSuffix(b.lokasi);

    // Prefer same prefix (e.g. A -> A)
    const aSamePrefix = aParsed.prefix === srcParsed.prefix ? 0 : 1;
    const bSamePrefix = bParsed.prefix === srcParsed.prefix ? 0 : 1;
    if (aSamePrefix !== bSamePrefix) return aSamePrefix - bSamePrefix;

    // Prefer close rack numbers without fragmenting
    if (srcParsed.num !== null && aParsed.num !== null && bParsed.num !== null) {
      const distA = Math.abs(aParsed.num - srcParsed.num);
      const distB = Math.abs(bParsed.num - srcParsed.num);
      const scoreA = distA + (a.simulatedQty > 0 ? 3 : 0);
      const scoreB = distB + (b.simulatedQty > 0 ? 3 : 0);
      if (scoreA !== scoreB) return scoreA - scoreB;
    }

    return a.simulatedPercent - b.simulatedPercent;
  });

  return candidates.slice(0, limit);
}

/**
 * Maps a product's category & name to the appropriate primary ABCD Warehouse zone prefix:
 * - A: Dress / Gamis / Midi / Maxi / Tunik / Jumpsuit
 * - B: Bottom / Skirt / Pants / Celana / Rok / Culottes / Jeans / Trouser
 * - C: Top / Blouse / Shirt / Kemeja / Cardigan / Outer / Jacket / Knit / Vest / Sweater
 * - D: Sale / Clearance / Promo
 */
export function inferTargetAbcdPrefixForProduct(
  namaProduk: string,
  kategori?: string
): { prefix: 'A' | 'B' | 'C' | 'D'; categoryLabel: string } {
  const combined = `${kategori || ''} ${namaProduk || ''}`.toUpperCase();

  if (/\b(SALE|CLEARANCE|PROMO|DISKON)\b/.test(combined)) {
    return { prefix: 'D', categoryLabel: 'Sale' };
  }
  if (
    /\b(BOTTOM|PANTS|CELANA|SKIRT|ROK|CULOTTE|KULOT|JEANS|DENIM|TROUSER|SHORTS|LEGGING)\b/.test(
      combined
    )
  ) {
    return { prefix: 'B', categoryLabel: 'Bottom' };
  }
  if (/\b(DRESS|GAMIS|MIDI|MAXI|MINI DRESS|TUNIK|TUNIC|JUMPSUIT|OVERALL|GAUN|ABAYA)\b/.test(combined)) {
    return { prefix: 'A', categoryLabel: 'Dress' };
  }
  return { prefix: 'C', categoryLabel: 'Top' };
}

export interface KoliRefillCandidateSummary {
  totalRefillableSkus: number;
  totalRefillablePcs: number;
  sourceKoliRacksCount: number;
}

/**
 * Counts how many SKUs are currently empty (0 pcs) in Rak Utama ABCD ('Warehouse')
 * and only available in Rak Koli ('Kolian': R, V, Z).
 */
export function getKoliToAbcdRefillSummary(
  allSlots: ComputedRackSlot[],
  existingMoves: SimulationMove[] = []
): KoliRefillCandidateSummary {
  // 1. Collect all SKUs currently present in ABCD Warehouse (or already queued in existingMoves)
  const skusInAbcd = new Set<string>();
  for (const s of allSlots) {
    if (s.area.toUpperCase() === 'WAREHOUSE' && /^[ABCD]\d+$/i.test(s.lokasi)) {
      for (const it of s.items) {
        if (it.qty > 0) skusInAbcd.add(it.sku.toUpperCase());
      }
    }
  }
  for (const m of existingMoves) {
    if (m.sku) skusInAbcd.add(m.sku.toUpperCase());
  }

  // 2. Find SKUs in Koli (R, V, Z) that are NOT in ABCD
  const refillSkus = new Set<string>();
  const sourceKoliRacks = new Set<string>();
  let totalPcs = 0;

  for (const s of allSlots) {
    const isKoli =
      (s.area.toUpperCase() === 'KOLIAN' || s.area.toUpperCase() === 'KOLI') &&
      /^[RVZ]\d+$/i.test(s.lokasi);
    if (!isKoli || s.currentQty <= 0) continue;

    for (const it of s.items) {
      const skuUp = it.sku.toUpperCase();
      if (it.qty > 0 && !skusInAbcd.has(skuUp)) {
        refillSkus.add(skuUp);
        sourceKoliRacks.add(s.lokasi);
        totalPcs += it.qty;
      }
    }
  }

  return {
    totalRefillableSkus: refillSkus.size,
    totalRefillablePcs: totalPcs,
    sourceKoliRacksCount: sourceKoliRacks.size,
  };
}

/**
 * Generates Consolidated Refill Recommendations from Rak Koli (R, V, Z) -> Rak Utama (ABCD).
 *
 * ANTI-FRAGMENTATION / CONSOLIDATED PUTAWAY RULE:
 * - Never scatter 20 SKUs across 13 different destination racks!
 * - Prioritizes source Koli racks that hold the most refillable SKUs so the picker opens as few Koli boxes as possible.
 * - Uses strict Bin-Packing on destination ABCD racks: fills ONE target rack (e.g., A001) up to its available
 *   capacity with multiple SKUs before moving to the next sequential rack (A002).
 */
export function generateConsolidatedKoliRefillMoves(
  allSlots: ComputedRackSlot[],
  catalogMap?: Map<string, EnrichedCatalogEntry>,
  existingMoves: SimulationMove[] = [],
  maxSkusToRecommend = 20
): SimulationMove[] {
  // 1. Identify SKUs already present in ABCD Warehouse or already in existingMoves
  const skusInAbcd = new Set<string>();
  for (const s of allSlots) {
    if (s.area.toUpperCase() === 'WAREHOUSE' && /^[ABCD]\d+$/i.test(s.lokasi)) {
      for (const it of s.items) {
        if (it.qty > 0) skusInAbcd.add(it.sku.toUpperCase());
      }
    }
  }
  for (const m of existingMoves) {
    if (m.sku) skusInAbcd.add(m.sku.toUpperCase());
  }

  // 2. Collect refillable items per Koli rack (R, V, Z)
  interface RefillCandidateItem {
    fromLokasi: string;
    sku: string;
    nama_produk: string;
    size: string;
    availableQtyInKoli: number;
    targetPrefix: 'A' | 'B' | 'C' | 'D';
    categoryLabel: string;
  }

  const candidatesByKoliRack = new Map<string, RefillCandidateItem[]>();

  for (const s of allSlots) {
    const isKoli =
      (s.area.toUpperCase() === 'KOLIAN' || s.area.toUpperCase() === 'KOLI') &&
      /^[RVZ]\d+$/i.test(s.lokasi);
    if (!isKoli || s.currentQty <= 0) continue;

    const list: RefillCandidateItem[] = [];
    for (const it of s.items) {
      const skuUp = it.sku.toUpperCase();
      if (it.qty <= 0 || skusInAbcd.has(skuUp)) continue;

      const catInfo = catalogMap?.get(skuUp);
      const nama =
        (catInfo?.nama_produk && catInfo.nama_produk !== skuUp ? catInfo.nama_produk : '') ||
        it.nama_produk ||
        skuUp;
      const size =
        (catInfo?.size && catInfo.size !== '-' ? catInfo.size : '') || it.size || 'ALL';
      const inferred = inferTargetAbcdPrefixForProduct(nama, catInfo?.kategori);

      list.push({
        fromLokasi: s.lokasi,
        sku: skuUp,
        nama_produk: nama,
        size,
        availableQtyInKoli: it.qty,
        targetPrefix: inferred.prefix,
        categoryLabel: inferred.categoryLabel,
      });
    }

    if (list.length > 0) {
      candidatesByKoliRack.set(s.lokasi, list);
    }
  }

  if (candidatesByKoliRack.size === 0) return [];

  // Sort source Koli racks by number of refillable SKUs descending (so picker opens fewest Koli boxes)
  const sortedKoliEntries = Array.from(candidatesByKoliRack.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], undefined, { numeric: true })
  );

  // Pick up to maxSkusToRecommend unique SKUs, grouped by targetPrefix ('A' | 'B' | 'C' | 'D')
  const selectedByPrefix: Record<'A' | 'B' | 'C' | 'D', RefillCandidateItem[]> = {
    A: [],
    B: [],
    C: [],
    D: [],
  };
  const pickedSkus = new Set<string>();

  for (const [, items] of sortedKoliEntries) {
    for (const item of items) {
      if (pickedSkus.size >= maxSkusToRecommend) break;
      if (pickedSkus.has(item.sku)) continue;
      pickedSkus.add(item.sku);
      selectedByPrefix[item.targetPrefix].push(item);
    }
    if (pickedSkus.size >= maxSkusToRecommend) break;
  }

  // 3. Prepare mutable remaining space tracker for ABCD target racks
  const abcdRacksByPrefix: Record<
    'A' | 'B' | 'C' | 'D',
    Array<{ lokasi: string; remainingSpace: number; maxCapacity: number; currentSimulated: number }>
  > = {
    A: [],
    B: [],
    C: [],
    D: [],
  };

  for (const s of allSlots) {
    if (s.area.toUpperCase() !== 'WAREHOUSE') continue;
    const m = s.lokasi.match(/^([ABCD])(\d+)$/i);
    if (!m) continue;
    const p = m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
    const rem = Math.max(0, s.maxCapacity - s.simulatedQty);
    if (rem > 0) {
      abcdRacksByPrefix[p].push({
        lokasi: s.lokasi,
        remainingSpace: rem,
        maxCapacity: s.maxCapacity,
        currentSimulated: s.simulatedQty,
      });
    }
  }

  // Sort target racks so EMPTY racks (or racks with maximum contiguous space) in sequential order come first
  (['A', 'B', 'C', 'D'] as const).forEach((p) => {
    abcdRacksByPrefix[p].sort((a, b) => {
      const aEmpty = a.currentSimulated === 0 ? 0 : 1;
      const bEmpty = b.currentSimulated === 0 ? 0 : 1;
      if (aEmpty !== bEmpty) return aEmpty - bEmpty;
      return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
    });
  });

  // 4. Consolidated Bin-Packing: fill one target rack completely before moving to the next rack!
  const generatedMoves: SimulationMove[] = [];
  const nowIso = new Date().toISOString();
  let seq = 1;

  (['A', 'B', 'C', 'D'] as const).forEach((prefix) => {
    const itemsToPack = selectedByPrefix[prefix];
    const targetBins = abcdRacksByPrefix[prefix];
    if (itemsToPack.length === 0 || targetBins.length === 0) return;

    let currentBinIdx = 0;

    for (const item of itemsToPack) {
      // Advance bin if current bin has < 2 pcs space left (avoid micro-splitting 1 SKU across multiple racks)
      while (currentBinIdx < targetBins.length && targetBins[currentBinIdx].remainingSpace <= 0) {
        currentBinIdx++;
      }
      if (currentBinIdx >= targetBins.length) break;

      let activeBin = targetBins[currentBinIdx];
      // Cap single-SKU refill qty to maxCapacity of a rack (e.g. max 15 pcs per SKU refill so 1 SKU doesn't hog 100% of a rack if Koli has 80 pcs)
      const desiredRefillQty = Math.min(item.availableQtyInKoli, Math.min(12, activeBin.maxCapacity));

      // If activeBin cannot fit desiredRefillQty and has very little space (< 3 pcs), move to next fresh bin so we don't split
      if (activeBin.remainingSpace < Math.min(3, desiredRefillQty) && currentBinIdx + 1 < targetBins.length) {
        currentBinIdx++;
        activeBin = targetBins[currentBinIdx];
      }

      const moveQty = Math.min(desiredRefillQty, activeBin.remainingSpace);
      if (moveQty <= 0) continue;

      activeBin.remainingSpace -= moveQty;
      activeBin.currentSimulated += moveQty;

      generatedMoves.push({
        id: `refill_${Date.now()}_${seq++}`,
        fromLokasi: item.fromLokasi,
        toLokasi: activeBin.lokasi,
        sku: item.sku,
        nama_produk: item.nama_produk,
        size: item.size,
        category: item.categoryLabel,
        moveType: 'REFILL_KOLI',
        qty: moveQty,
        createdAt: nowIso,
      });
    }
  });

  return generatedMoves;
}

/**
 * Generates Consolidated Overload Relocation Recommendations for ABCD Warehouse Racks (>100% capacity).
 * Packs excess quantities into the nearest available ABCD rack of the same category without scattering.
 */
export function generateConsolidatedOverloadMoves(
  allSlots: ComputedRackSlot[],
  catalogMap?: Map<string, EnrichedCatalogEntry>,
  existingMoves: SimulationMove[] = []
): SimulationMove[] {
  const overloadedRacks = allSlots.filter(
    (s) =>
      !isExcludedFromWarehouseRelocation(s.area, s.lokasi) &&
      s.area.toUpperCase() === 'WAREHOUSE' &&
      s.simulatedQty > s.maxCapacity &&
      s.items.length > 0
  );

  if (overloadedRacks.length === 0) return [];

  // Track available target bins in Warehouse
  const targetBins = allSlots
    .filter(
      (s) =>
        !isExcludedFromWarehouseRelocation(s.area, s.lokasi) &&
        s.area.toUpperCase() === 'WAREHOUSE' &&
        s.maxCapacity - s.simulatedQty > 0 &&
        s.simulatedPercent < 80
    )
    .map((s) => ({
      lokasi: s.lokasi,
      category: s.category,
      prefix: extractNumericSuffix(s.lokasi).prefix,
      num: extractNumericSuffix(s.lokasi).num,
      remainingSpace: Math.max(0, s.maxCapacity - s.simulatedQty),
      currentSimulated: s.simulatedQty,
    }));

  const existingPairKeys = new Set(
    existingMoves.map((m) => `${m.fromLokasi}__${m.sku}`.toUpperCase())
  );

  const generated: SimulationMove[] = [];
  const nowIso = new Date().toISOString();
  let seq = 1;

  for (const src of overloadedRacks) {
    let excessToMove = src.simulatedQty - src.maxCapacity;
    if (excessToMove <= 0) continue;

    const srcParsed = extractNumericSuffix(src.lokasi);

    // Find best consolidated target bin in same prefix/category
    const matchingBins = targetBins
      .filter(
        (b) =>
          b.lokasi !== src.lokasi &&
          b.remainingSpace > 0 &&
          (b.prefix === srcParsed.prefix || b.category.toLowerCase() === src.category.toLowerCase())
      )
      .sort((a, b) => {
        if (srcParsed.num !== null && a.num !== null && b.num !== null) {
          return Math.abs(a.num - srcParsed.num) - Math.abs(b.num - srcParsed.num);
        }
        return b.remainingSpace - a.remainingSpace;
      });

    if (matchingBins.length === 0) continue;

    let binIdx = 0;
    // Pick items from the overloaded rack (smallest or largest SKU quantities that fit cleanly)
    for (const item of src.items) {
      if (excessToMove <= 0) break;
      const pairKey = `${src.lokasi}__${item.sku}`.toUpperCase();
      if (existingPairKeys.has(pairKey)) continue;

      while (binIdx < matchingBins.length && matchingBins[binIdx].remainingSpace <= 0) {
        binIdx++;
      }
      if (binIdx >= matchingBins.length) break;

      const targetBin = matchingBins[binIdx];
      const moveQty = Math.min(item.qty, excessToMove, targetBin.remainingSpace);
      if (moveQty <= 0) continue;

      const catInfo = catalogMap?.get(item.sku.toUpperCase());
      const nama =
        (catInfo?.nama_produk && catInfo.nama_produk !== item.sku ? catInfo.nama_produk : '') ||
        item.nama_produk ||
        item.sku;
      const size =
        (catInfo?.size && catInfo.size !== '-' ? catInfo.size : '') || item.size || 'ALL';

      targetBin.remainingSpace -= moveQty;
      excessToMove -= moveQty;
      existingPairKeys.add(pairKey);

      generated.push({
        id: `ovl_${Date.now()}_${seq++}`,
        fromLokasi: src.lokasi,
        toLokasi: targetBin.lokasi,
        sku: item.sku,
        nama_produk: nama,
        size,
        category: src.category,
        moveType: 'RELOKASI_OVERLOAD',
        qty: moveQty,
        createdAt: nowIso,
      });
    }
  }

  return generated;
}

