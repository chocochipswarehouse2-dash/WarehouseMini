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

export interface AbcdToKoliRuleConfig {
  minStockThreshold: number;      // e.g. 25: Hanya evaluasi SKU jika stok di rak ABCD >= 25 pcs
  mandatoryPickingBuffer: number; // e.g. 10: Minimal 10 pcs WAJIB tertinggal di rak ABCD untuk picker
  evacuatePercent: number;        // e.g. 60: Persentase kuantitas yang dipindahkan ke kolian
}

export const DEFAULT_ABCD_TO_KOLI_RULE: AbcdToKoliRuleConfig = {
  minStockThreshold: 25,
  mandatoryPickingBuffer: 10,
  evacuatePercent: 60,
};

export interface RackCapacityConfig {
  version: number;
  updatedAt: string;
  updatedBy?: string;
  zones: RackZoneRule[];
  overrides: Record<string, RackLocationOverride>;
  evacuationRule?: AbcdToKoliRuleConfig;
  refillMaxPerSkuAbcd?: number;
  refillTriggerThreshold?: number;          // Default 3 pcs (Refill ditrigger jika total stok SKU di ABCD <= threshold, tidak perlu tunggu 0)
  safeOccupancyCapPercent?: number;         // Default 75% (Kapasitas maksimum aman rak tujuan agar tidak sesak)
  consolidationDistanceThreshold?: number;  // Default 3 nomor rak (Toleransi jarak penyatuan SKU terpencar)
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

export type RecommendationMoveType = 'REFILL_KOLI' | 'RELOKASI_OVERLOAD' | 'EVAKUASI_KOLI' | 'KONSOLIDASI_SKU' | 'MANUAL';

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
    version: 5,
    updatedAt: new Date().toISOString(),
    zones: DEFAULT_RACK_ZONES,
    overrides: {},
    evacuationRule: { ...DEFAULT_ABCD_TO_KOLI_RULE },
    refillMaxPerSkuAbcd: 12,
    refillTriggerThreshold: 3,
    safeOccupancyCapPercent: 75,
    consolidationDistanceThreshold: 3,
  };
}

/**
 * Ensures any previously saved v1/v2/v3/v4 config automatically upgrades:
 * 1. Area Transit ('zone_transit') from static ['X', 'TRANSIT'] to variable range X (X001 - X100)
 * 2. Missing Koli / Kolian zones (prefix R, V, Z: R001-R100, V001-V100, Z001-Z100)
 * 3. Splits combined 'zone_blok_f' (['TIKTOK', 'SHOPEE', 'STUDIO']) into 3 independent zones
 *    so SHOPEE, TIKTOK, and STUDIO each have their own independent maxCapacity.
 * 4. Adds Area Perbaikan zones ('zone_perbaikan_cc', 'zone_perbaikan_pmk', 'zone_perbaikan_df')
 *    so Cuci (CC), Permak (PMK), and Defect (DF) each have their own setup row & capacity.
 * 5. Migrates evacuationRule & refillMaxPerSkuAbcd for customizable picker buffer configuration.
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

  const rawEvac = raw.evacuationRule;
  const migratedEvac: AbcdToKoliRuleConfig = rawEvac
    ? {
        minStockThreshold: Math.max(
          5,
          Number(rawEvac.minStockThreshold) || DEFAULT_ABCD_TO_KOLI_RULE.minStockThreshold
        ),
        mandatoryPickingBuffer: Math.max(
          1,
          Number(rawEvac.mandatoryPickingBuffer) || DEFAULT_ABCD_TO_KOLI_RULE.mandatoryPickingBuffer
        ),
        evacuatePercent: Math.max(
          10,
          Math.min(95, Number(rawEvac.evacuatePercent) || DEFAULT_ABCD_TO_KOLI_RULE.evacuatePercent)
        ),
      }
    : { ...DEFAULT_ABCD_TO_KOLI_RULE };

  return {
    version: Math.max(5, raw.version || 5),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    updatedBy: raw.updatedBy,
    zones: upgradedZones,
    overrides: raw.overrides || {},
    evacuationRule: migratedEvac,
    refillMaxPerSkuAbcd: Math.max(1, Number(raw.refillMaxPerSkuAbcd) || 12),
    refillTriggerThreshold: Math.max(1, Number(raw.refillTriggerThreshold) || 3),
    safeOccupancyCapPercent: Math.max(50, Math.min(95, Number(raw.safeOccupancyCapPercent) || 75)),
    consolidationDistanceThreshold: Math.max(1, Number(raw.consolidationDistanceThreshold) || 3),
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
          version: remote.version || 5,
          updatedAt: remote.updatedAt || target.updated_at || new Date().toISOString(),
          updatedBy: remote.updatedBy || target.updated_by,
          zones: remote.zones,
          overrides: remote.overrides || {},
          evacuationRule: remote.evacuationRule,
          refillMaxPerSkuAbcd: remote.refillMaxPerSkuAbcd,
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
    version: Math.max(5, config.version || 5),
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

export const RACK_SAFE_TARGET_PERCENT = 75; // Maksimal keterisian 75% untuk rak tujuan agar barang tidak sesak dan picker leluasa

export function getSafeTargetCapacity(maxCapacity: number): number {
  return Math.max(1, Math.floor(maxCapacity * (RACK_SAFE_TARGET_PERCENT / 100)));
}

function extractNumericSuffix(lokasi: string): { prefix: string; num: number | null } {
  const m = lokasi.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return { prefix: lokasi, num: null };
  return { prefix: m[1], num: parseInt(m[2], 10) };
}

/**
 * Recommends nearest empty or low-occupancy racks in the SAME operational area & category/zone.
 * Strictly excludes Blok F (SHOPEE, TIKTOK, STUDIO), Perbaikan (CC, PMK, DF), and Anomali.
 * Strictly respects RACK_SAFE_TARGET_PERCENT (max 75%) so target racks NEVER become choked/full.
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

  const candidates = allSlots.filter((s) => {
    if (s.lokasi === sourceSlot.lokasi) return false;
    if (isExcludedFromWarehouseRelocation(s.area, s.lokasi)) return false;
    if (s.area.toUpperCase() !== sourceSlot.area.toUpperCase()) return false;
    if (s.category.toLowerCase() !== sourceSlot.category.toLowerCase()) return false;
    const safeCap = getSafeTargetCapacity(s.maxCapacity);
    const safeRem = safeCap - s.simulatedQty;
    // Strictly exclude racks that are already full or near capacity (>70%) or have < 5 pcs safe room
    return s.simulatedPercent <= 70 && safeRem >= 5;
  });

  candidates.sort((a, b) => {
    const aParsed = extractNumericSuffix(a.lokasi);
    const bParsed = extractNumericSuffix(b.lokasi);

    // Prefer same prefix (e.g. A -> A)
    const aSamePrefix = aParsed.prefix === srcParsed.prefix ? 0 : 1;
    const bSamePrefix = bParsed.prefix === srcParsed.prefix ? 0 : 1;
    if (aSamePrefix !== bSamePrefix) return aSamePrefix - bSamePrefix;

    // Prefer empty racks (0 pcs) or racks with plenty of space (<= 30% occupancy)
    const aEmpty = a.simulatedQty === 0 ? 0 : a.simulatedPercent <= 30 ? 1 : 2;
    const bEmpty = b.simulatedQty === 0 ? 0 : b.simulatedPercent <= 30 ? 1 : 2;
    if (aEmpty !== bEmpty) return aEmpty - bEmpty;

    // Prefer close rack numbers within reasonable proximity tiers
    if (srcParsed.num !== null && aParsed.num !== null && bParsed.num !== null) {
      const distA = Math.abs(aParsed.num - srcParsed.num);
      const distB = Math.abs(bParsed.num - srcParsed.num);
      const tierA = Math.floor(distA / 10);
      const tierB = Math.floor(distB / 10);
      if (tierA !== tierB) return tierA - tierB;
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
 * Counts how many SKUs qualify for refill from Rak Koli ('Kolian': R, V, Z) -> Rak Utama ABCD ('Warehouse').
 * Rule: Triggers if total physical stock of that SKU in ABCD is <= triggerThreshold (default 3 pcs),
 * without waiting for the rack to become completely 0 pcs!
 */
export function getKoliToAbcdRefillSummary(
  allSlots: ComputedRackSlot[],
  existingMoves: SimulationMove[] = [],
  triggerThreshold = 3
): KoliRefillCandidateSummary {
  // 1. Calculate current total qty per SKU in ABCD Warehouse (including simulated incoming moves)
  const skuAbcdQty = new Map<string, number>();
  for (const s of allSlots) {
    if (s.area.toUpperCase() === 'WAREHOUSE' && /^[ABCD]\d+$/i.test(s.lokasi)) {
      for (const it of s.items) {
        if (it.qty > 0) {
          const skuUp = it.sku.toUpperCase();
          skuAbcdQty.set(skuUp, (skuAbcdQty.get(skuUp) || 0) + it.qty);
        }
      }
    }
  }
  for (const m of existingMoves) {
    if (m.sku && /^[ABCD]\d+$/i.test(m.toLokasi)) {
      const skuUp = m.sku.toUpperCase();
      skuAbcdQty.set(skuUp, (skuAbcdQty.get(skuUp) || 0) + m.qty);
    }
  }

  // 2. Find SKUs in Koli (R, V, Z) where current ABCD quantity <= triggerThreshold
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
      const currentAbcd = skuAbcdQty.get(skuUp) || 0;
      if (it.qty > 0 && currentAbcd <= triggerThreshold) {
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
 * REFILL & PLACEMENT LOGIC:
 * 1. TRIGGER THRESHOLD: SKU in ABCD with total physical quantity <= triggerThreshold (e.g. 2-3 pcs).
 * 2. PRIMARY TARGET (Existing Rack): If SKU already exists in a rack (e.g., A001), refill there IF A001 has safe space.
 * 3. FALLBACK TARGET (Empty/Available Category Rack): If A001 is already full or safe cap reached,
 *    refill into another available/empty rack in the same category zone (A=Dress, B=Bottom, C=Top, D=Sale).
 * 4. SAFE CAP: Target racks are never packed past `safeOccupancyPercent` (default 75%).
 * 5. ANTI-FRAGMENTATION: Prioritizes Koli boxes with the most refillable SKUs.
 */
export function generateConsolidatedKoliRefillMoves(
  allSlots: ComputedRackSlot[],
  catalogMap?: Map<string, EnrichedCatalogEntry>,
  existingMoves: SimulationMove[] = [],
  maxSkusToRecommend = 20,
  triggerThreshold = 3,
  safeOccupancyPercent = 75,
  maxPerSku = 12
): SimulationMove[] {
  // 1. Calculate current total qty and track existing rack locations per SKU in ABCD Warehouse
  const skuAbcdQty = new Map<string, number>();
  const skuExistingRacks = new Map<string, string[]>();

  for (const s of allSlots) {
    if (s.area.toUpperCase() === 'WAREHOUSE' && /^[ABCD]\d+$/i.test(s.lokasi)) {
      for (const it of s.items) {
        if (it.qty > 0) {
          const skuUp = it.sku.toUpperCase();
          skuAbcdQty.set(skuUp, (skuAbcdQty.get(skuUp) || 0) + it.qty);
          const list = skuExistingRacks.get(skuUp) || [];
          if (!list.includes(s.lokasi)) list.push(s.lokasi);
          skuExistingRacks.set(skuUp, list);
        }
      }
    }
  }
  for (const m of existingMoves) {
    if (m.sku && /^[ABCD]\d+$/i.test(m.toLokasi)) {
      const skuUp = m.sku.toUpperCase();
      skuAbcdQty.set(skuUp, (skuAbcdQty.get(skuUp) || 0) + m.qty);
      const list = skuExistingRacks.get(skuUp) || [];
      if (!list.includes(m.toLokasi)) list.push(m.toLokasi);
      skuExistingRacks.set(skuUp, list);
    }
  }

  // 2. Collect refillable items per Koli rack (R, V, Z)
  interface RefillCandidateItem {
    fromLokasi: string;
    sku: string;
    nama_produk: string;
    size: string;
    availableQtyInKoli: number;
    currentAbcdQty: number;
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
      const currentAbcd = skuAbcdQty.get(skuUp) || 0;
      if (it.qty <= 0 || currentAbcd > triggerThreshold) continue;

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
        currentAbcdQty: currentAbcd,
        targetPrefix: inferred.prefix,
        categoryLabel: inferred.categoryLabel,
      });
    }

    if (list.length > 0) {
      candidatesByKoliRack.set(s.lokasi, list);
    }
  }

  if (candidatesByKoliRack.size === 0) return [];

  // Sort source Koli racks by number of refillable SKUs descending
  const sortedKoliEntries = Array.from(candidatesByKoliRack.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], undefined, { numeric: true })
  );

  // Pick up to maxSkusToRecommend unique SKUs
  const pickedSkus = new Set<string>();
  const selectedItems: RefillCandidateItem[] = [];

  for (const [, items] of sortedKoliEntries) {
    for (const item of items) {
      if (pickedSkus.size >= maxSkusToRecommend) break;
      if (pickedSkus.has(item.sku)) continue;
      pickedSkus.add(item.sku);
      selectedItems.push(item);
    }
    if (pickedSkus.size >= maxSkusToRecommend) break;
  }

  // 3. Prepare mutable safe remaining space tracker for ABCD target racks
  interface TargetBinTracker {
    lokasi: string;
    prefix: 'A' | 'B' | 'C' | 'D';
    remainingSpace: number;
    maxCapacity: number;
    currentSimulated: number;
  }

  const abcdTargetBinsMap = new Map<string, TargetBinTracker>();
  const abcdRacksByPrefix: Record<'A' | 'B' | 'C' | 'D', TargetBinTracker[]> = {
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
    const safeCap = getSafeTargetCapacity(s.maxCapacity, safeOccupancyPercent);
    const rem = Math.max(0, safeCap - s.simulatedQty);
    const bin: TargetBinTracker = {
      lokasi: s.lokasi,
      prefix: p,
      remainingSpace: rem,
      maxCapacity: s.maxCapacity,
      currentSimulated: s.simulatedQty,
    };
    abcdTargetBinsMap.set(s.lokasi, bin);

    // Only include in general pool if it has reasonable breathing room
    if (rem >= 5 && (s.simulatedQty / (s.maxCapacity || 80)) * 100 < safeOccupancyPercent) {
      abcdRacksByPrefix[p].push(bin);
    }
  }

  // Sort general pool: empty racks first, then lowest occupancy, sequential
  (['A', 'B', 'C', 'D'] as const).forEach((p) => {
    abcdRacksByPrefix[p].sort((a, b) => {
      const aEmpty = a.currentSimulated === 0 ? 0 : 1;
      const bEmpty = b.currentSimulated === 0 ? 0 : 1;
      if (aEmpty !== bEmpty) return aEmpty - bEmpty;
      return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
    });
  });

  // 4. Generate Refill Moves
  const generatedMoves: SimulationMove[] = [];
  const nowIso = new Date().toISOString();
  let seq = 1;

  for (const item of selectedItems) {
    // Try primary target: existing rack of this SKU in ABCD
    let targetBin: TargetBinTracker | null = null;
    const existingRackLocs = skuExistingRacks.get(item.sku) || [];

    for (const loc of existingRackLocs) {
      const b = abcdTargetBinsMap.get(loc);
      if (b && b.remainingSpace >= 3) {
        targetBin = b;
        break;
      }
    }

    // Fallback: If existing rack is full, or SKU is brand new in ABCD (0 pcs), pick from category pool
    if (!targetBin) {
      const pool = abcdRacksByPrefix[item.targetPrefix];
      for (const b of pool) {
        if (b.remainingSpace >= 3) {
          targetBin = b;
          break;
        }
      }
    }

    if (!targetBin) continue;

    // Desired refill: fill up to maxPerSku (default 12 pcs) or what Koli has, bounded by target safe space
    const desiredRefill = Math.min(
      item.availableQtyInKoli,
      Math.max(1, maxPerSku - item.currentAbcdQty),
      targetBin.remainingSpace
    );
    if (desiredRefill <= 0) continue;

    targetBin.remainingSpace -= desiredRefill;
    targetBin.currentSimulated += desiredRefill;

    // Update SKU total in ABCD so we don't over-refill in subsequent loops
    skuAbcdQty.set(item.sku, (skuAbcdQty.get(item.sku) || 0) + desiredRefill);

    generatedMoves.push({
      id: `refill_${Date.now()}_${seq++}`,
      fromLokasi: item.fromLokasi,
      toLokasi: targetBin.lokasi,
      sku: item.sku,
      nama_produk: item.nama_produk,
      size: item.size,
      category: item.categoryLabel,
      moveType: 'REFILL_KOLI',
      qty: desiredRefill,
      createdAt: nowIso,
    });
  }

  return generatedMoves;
}

export interface ScatteredSkuSummary {
  totalScatteredSkus: number;
  totalMoveablePcs: number;
  affectedRacksCount: number;
}

/**
 * Counts how many SKUs in ABCD Warehouse are scattered across distant racks
 * (distance > distanceThreshold, default 3 racks).
 */
export function getScatteredSkuSummary(
  allSlots: ComputedRackSlot[],
  existingMoves: SimulationMove[] = [],
  distanceThreshold = 3
): ScatteredSkuSummary {
  const existingPairKeys = new Set(
    existingMoves.map((m) => `${m.fromLokasi}__${m.sku}`.toUpperCase())
  );

  // Group SKU occurrences in ABCD
  const skuLocations = new Map<
    string,
    Array<{ lokasi: string; qty: number; prefix: string; num: number | null }>
  >();

  for (const s of allSlots) {
    if (
      isExcludedFromWarehouseRelocation(s.area, s.lokasi) ||
      s.area.toUpperCase() !== 'WAREHOUSE' ||
      !/^[ABCD]\d+$/i.test(s.lokasi)
    ) {
      continue;
    }
    const parsed = extractNumericSuffix(s.lokasi);
    for (const it of s.items) {
      if (it.qty <= 0) continue;
      const skuUp = it.sku.toUpperCase();
      const list = skuLocations.get(skuUp) || [];
      list.push({
        lokasi: s.lokasi,
        qty: it.qty,
        prefix: parsed.prefix,
        num: parsed.num,
      });
      skuLocations.set(skuUp, list);
    }
  }

  const scatteredSkus = new Set<string>();
  const affectedRacks = new Set<string>();
  let moveablePcs = 0;

  for (const [sku, locs] of skuLocations.entries()) {
    if (locs.length < 2) continue;

    // Check if any pairs are distant (> distanceThreshold)
    let isScattered = false;
    for (let i = 0; i < locs.length; i++) {
      for (let j = i + 1; j < locs.length; j++) {
        const a = locs[i];
        const b = locs[j];
        if (a.prefix !== b.prefix) {
          isScattered = true;
          break;
        }
        if (a.num !== null && b.num !== null && Math.abs(a.num - b.num) > distanceThreshold) {
          isScattered = true;
          break;
        }
      }
      if (isScattered) break;
    }

    if (isScattered) {
      scatteredSkus.add(sku);
      // Sort by qty ascending (minority is moveable)
      const sorted = [...locs].sort((a, b) => a.qty - b.qty);
      for (let i = 0; i < sorted.length - 1; i++) {
        const key = `${sorted[i].lokasi}__${sku}`.toUpperCase();
        if (!existingPairKeys.has(key)) {
          moveablePcs += sorted[i].qty;
          affectedRacks.add(sorted[i].lokasi);
        }
      }
      affectedRacks.add(sorted[sorted.length - 1].lokasi);
    }
  }

  return {
    totalScatteredSkus: scatteredSkus.size,
    totalMoveablePcs: moveablePcs,
    affectedRacksCount: affectedRacks.size,
  };
}

/**
 * Generates Consolidation Recommendations for SKUs scattered across distant ABCD Warehouse racks.
 *
 * SKU CONSOLIDATION RULES:
 * 1. DISTANCE THRESHOLD: If SKU is in A001 (7 pcs) and A002 (2 pcs), leave as is (distance <= 3).
 *    If SKU is in A001 (7 pcs) and A016 (2 pcs), distance is 15 (> 3) -> consolidate!
 * 2. DIRECTION: Consolidates the minority quantity (2 pcs) into the majority rack (A001)
 *    provided A001 does not exceed safe target capacity (75%).
 * 3. CAPACITY SAFETY: If majority rack is full, checks if minority rack has room for majority,
 *    or consolidates into a clean/empty nearby rack in the same zone.
 */
export function generateConsolidatedSkuScatteredMoves(
  allSlots: ComputedRackSlot[],
  catalogMap?: Map<string, EnrichedCatalogEntry>,
  existingMoves: SimulationMove[] = [],
  distanceThreshold = 3,
  safeOccupancyPercent = 75,
  maxMovesToGenerate = 25
): SimulationMove[] {
  const existingPairKeys = new Set(
    existingMoves.map((m) => `${m.fromLokasi}__${m.sku}`.toUpperCase())
  );

  // Group ABCD slots by location for fast lookup
  const slotMap = new Map<string, ComputedRackSlot>();
  for (const s of allSlots) {
    if (s.area.toUpperCase() === 'WAREHOUSE' && /^[ABCD]\d+$/i.test(s.lokasi)) {
      slotMap.set(s.lokasi, s);
    }
  }

  // Group SKU occurrences in ABCD
  interface SkuRackOccurrence {
    lokasi: string;
    qty: number;
    prefix: string;
    num: number | null;
    maxCapacity: number;
    currentSimulated: number;
    safeCapacity: number;
    nama_produk: string;
    size: string;
    category: string;
  }

  const skuOccurrences = new Map<string, SkuRackOccurrence[]>();

  for (const s of allSlots) {
    if (
      isExcludedFromWarehouseRelocation(s.area, s.lokasi) ||
      s.area.toUpperCase() !== 'WAREHOUSE' ||
      !/^[ABCD]\d+$/i.test(s.lokasi)
    ) {
      continue;
    }
    const parsed = extractNumericSuffix(s.lokasi);
    const safeCap = getSafeTargetCapacity(s.maxCapacity, safeOccupancyPercent);

    for (const it of s.items) {
      if (it.qty <= 0) continue;
      const skuUp = it.sku.toUpperCase();
      const catInfo = catalogMap?.get(skuUp);
      const nama =
        (catInfo?.nama_produk && catInfo.nama_produk !== skuUp ? catInfo.nama_produk : '') ||
        it.nama_produk ||
        skuUp;
      const size =
        (catInfo?.size && catInfo.size !== '-' ? catInfo.size : '') || it.size || 'ALL';

      const list = skuOccurrences.get(skuUp) || [];
      list.push({
        lokasi: s.lokasi,
        qty: it.qty,
        prefix: parsed.prefix,
        num: parsed.num,
        maxCapacity: s.maxCapacity,
        currentSimulated: s.simulatedQty,
        safeCapacity: safeCap,
        nama_produk: nama,
        size,
        category: s.category,
      });
      skuOccurrences.set(skuUp, list);
    }
  }

  const generated: SimulationMove[] = [];
  const nowIso = new Date().toISOString();
  let seq = 1;

  for (const [sku, locs] of skuOccurrences.entries()) {
    if (locs.length < 2 || generated.length >= maxMovesToGenerate) continue;

    // Check if there is any distant pair (> distanceThreshold)
    let isDistant = false;
    for (let i = 0; i < locs.length; i++) {
      for (let j = i + 1; j < locs.length; j++) {
        if (locs[i].prefix !== locs[j].prefix) {
          isDistant = true;
          break;
        }
        if (
          locs[i].num !== null &&
          locs[j].num !== null &&
          Math.abs(locs[i].num! - locs[j].num!) > distanceThreshold
        ) {
          isDistant = true;
          break;
        }
      }
      if (isDistant) break;
    }

    if (!isDistant) continue;

    // Sort locations by qty descending (highest qty is primary destination)
    const sorted = [...locs].sort((a, b) => b.qty - a.qty);
    const majority = sorted[0];

    // Try consolidating each minority rack into majority
    for (let i = 1; i < sorted.length; i++) {
      if (generated.length >= maxMovesToGenerate) break;
      const minority = sorted[i];
      const pairKey = `${minority.lokasi}__${sku}`.toUpperCase();
      if (existingPairKeys.has(pairKey)) continue;

      const remInMajority = Math.max(0, majority.safeCapacity - majority.currentSimulated);

      if (remInMajority >= minority.qty) {
        // Option 1: Move minority completely into majority!
        generated.push({
          id: `cns_${Date.now()}_${seq++}`,
          fromLokasi: minority.lokasi,
          toLokasi: majority.lokasi,
          sku,
          nama_produk: minority.nama_produk,
          size: minority.size,
          category: majority.category,
          moveType: 'KONSOLIDASI_SKU',
          qty: minority.qty,
          createdAt: nowIso,
        });
        majority.currentSimulated += minority.qty;
        existingPairKeys.add(pairKey);
      } else {
        // Option 2: Check if minority rack has room to take majority
        const remInMinority = Math.max(0, minority.safeCapacity - minority.currentSimulated);
        if (remInMinority >= majority.qty) {
          const revKey = `${majority.lokasi}__${sku}`.toUpperCase();
          if (!existingPairKeys.has(revKey)) {
            generated.push({
              id: `cns_${Date.now()}_${seq++}`,
              fromLokasi: majority.lokasi,
              toLokasi: minority.lokasi,
              sku,
              nama_produk: majority.nama_produk,
              size: majority.size,
              category: minority.category,
              moveType: 'KONSOLIDASI_SKU',
              qty: majority.qty,
              createdAt: nowIso,
            });
            minority.currentSimulated += majority.qty;
            existingPairKeys.add(revKey);
          }
        } else if (remInMajority > 0) {
          // Partial consolidation if at least partial fits
          generated.push({
            id: `cns_${Date.now()}_${seq++}`,
            fromLokasi: minority.lokasi,
            toLokasi: majority.lokasi,
            sku,
            nama_produk: minority.nama_produk,
            size: minority.size,
            category: majority.category,
            moveType: 'KONSOLIDASI_SKU',
            qty: remInMajority,
            createdAt: nowIso,
          });
          majority.currentSimulated += remInMajority;
          existingPairKeys.add(pairKey);
        }
      }
    }
  }

  return generated;
}

/**
 * Generates Consolidated Overload Relocation Recommendations for ABCD Warehouse Racks (>100% capacity).
 * Packs excess quantities into the nearest available ABCD rack of the same category,
 * STRICTLY CAPPED at safe target capacity (default 75%) so destination racks NEVER turn red or 100% full!
 */
export function generateConsolidatedOverloadMoves(
  allSlots: ComputedRackSlot[],
  catalogMap?: Map<string, EnrichedCatalogEntry>,
  existingMoves: SimulationMove[] = [],
  safeOccupancyPercent = 75
): SimulationMove[] {
  const overloadedRacks = allSlots.filter(
    (s) =>
      !isExcludedFromWarehouseRelocation(s.area, s.lokasi) &&
      s.area.toUpperCase() === 'WAREHOUSE' &&
      s.simulatedQty > s.maxCapacity &&
      s.items.length > 0
  );

  if (overloadedRacks.length === 0) return [];

  // Track available target bins in Warehouse — STRICTLY capped at safeTargetCapacity (75%)
  const targetBins = allSlots
    .filter((s) => {
      if (isExcludedFromWarehouseRelocation(s.area, s.lokasi)) return false;
      if (s.area.toUpperCase() !== 'WAREHOUSE') return false;
      const safeCap = getSafeTargetCapacity(s.maxCapacity, safeOccupancyPercent);
      const safeRem = safeCap - s.simulatedQty;
      const pct = (s.simulatedQty / (s.maxCapacity || 80)) * 100;
      return safeRem >= 5 && pct < safeOccupancyPercent;
    })
    .map((s) => {
      const safeCap = getSafeTargetCapacity(s.maxCapacity, safeOccupancyPercent);
      return {
        lokasi: s.lokasi,
        category: s.category,
        prefix: extractNumericSuffix(s.lokasi).prefix,
        num: extractNumericSuffix(s.lokasi).num,
        remainingSpace: Math.max(0, safeCap - s.simulatedQty),
        currentSimulated: s.simulatedQty,
        existingSkus: new Set(s.items.map((it) => it.sku.toUpperCase())),
      };
    });

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

    // Pick items from the overloaded rack
    for (const item of src.items) {
      if (excessToMove <= 0) break;
      const pairKey = `${src.lokasi}__${item.sku}`.toUpperCase();
      if (existingPairKeys.has(pairKey)) continue;

      const skuUp = item.sku.toUpperCase();

      // Find best consolidated target bin in same prefix/category
      // Prioritize:
      // 1. Bin that already holds this SKU (unification)
      // 2. Empty bin (0 pcs)
      // 3. Closest rack number
      // 4. Highest remaining safe space
      const matchingBins = targetBins
        .filter(
          (b) =>
            b.lokasi !== src.lokasi &&
            b.remainingSpace > 0 &&
            (b.prefix === srcParsed.prefix || b.category.toLowerCase() === src.category.toLowerCase())
        )
        .sort((a, b) => {
          const aHasSku = a.existingSkus.has(skuUp) ? 0 : 1;
          const bHasSku = b.existingSkus.has(skuUp) ? 0 : 1;
          if (aHasSku !== bHasSku) return aHasSku - bHasSku;

          const aEmpty = a.currentSimulated === 0 ? 0 : 1;
          const bEmpty = b.currentSimulated === 0 ? 0 : 1;
          if (aEmpty !== bEmpty) return aEmpty - bEmpty;

          if (srcParsed.num !== null && a.num !== null && b.num !== null) {
            const distA = Math.abs(a.num - srcParsed.num);
            const distB = Math.abs(b.num - srcParsed.num);
            if (distA !== distB) return distA - distB;
          }
          return b.remainingSpace - a.remainingSpace;
        });

      if (matchingBins.length === 0) continue;

      const targetBin = matchingBins[0];
      const moveQty = Math.min(item.qty, excessToMove, targetBin.remainingSpace);
      if (moveQty <= 0) continue;

      const catInfo = catalogMap?.get(skuUp);
      const nama =
        (catInfo?.nama_produk && catInfo.nama_produk !== item.sku ? catInfo.nama_produk : '') ||
        item.nama_produk ||
        item.sku;
      const size =
        (catInfo?.size && catInfo.size !== '-' ? catInfo.size : '') || item.size || 'ALL';

      targetBin.remainingSpace -= moveQty;
      targetBin.currentSimulated += moveQty;
      targetBin.existingSkus.add(skuUp);
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

export interface AbcdToKoliCandidateSummary {
  candidateRacksCount: number;
  candidateSkusCount: number;
  totalExcessPcs: number;
}

/**
 * Returns a summary of items in ABCD Warehouse racks that qualify for evacuation/storage into Koli
 * based on user-defined threshold, mandatory picking buffer, and percentage:
 * 1. SKU in ABCD must meet minStockThreshold (e.g. >= 25 pcs) or be in an Overloaded rack.
 * 2. Leaves at least mandatoryPickingBuffer (e.g. >= 10 pcs) in ABCD for picker operations.
 * 3. Moves evacuatePercent (e.g. 60%) of eligible stock to Koli.
 */
export function getAbcdToKoliEvacuationSummary(
  allSlots: ComputedRackSlot[],
  existingMoves: SimulationMove[] = [],
  rule: AbcdToKoliRuleConfig = DEFAULT_ABCD_TO_KOLI_RULE
): AbcdToKoliCandidateSummary {
  const existingPairs = new Set(
    existingMoves.map((m) => `${m.fromLokasi}__${m.sku}`.toUpperCase())
  );

  const candidateRacks = new Set<string>();
  const candidateSkus = new Set<string>();
  let totalExcessPcs = 0;

  for (const s of allSlots) {
    if (
      isExcludedFromWarehouseRelocation(s.area, s.lokasi) ||
      s.area.toUpperCase() !== 'WAREHOUSE' ||
      !/^[ABCD]\d+$/i.test(s.lokasi)
    ) {
      continue;
    }

    const isOverload = s.simulatedQty > s.maxCapacity;

    for (const it of s.items) {
      if (it.qty <= 0) continue;
      const pairKey = `${s.lokasi}__${it.sku}`.toUpperCase();
      if (existingPairs.has(pairKey)) continue;

      // Syarat 1: Hanya evaluasi jika stok >= minStockThreshold atau rak sedang overload
      if (it.qty < rule.minStockThreshold && !isOverload) continue;

      // Syarat 2: Wajib menyisakan buffer picking di rak ABCD
      const targetKeep = Math.max(
        rule.mandatoryPickingBuffer,
        Math.round(it.qty * (1 - rule.evacuatePercent / 100))
      );
      const eligibleToEvacuate = Math.max(0, it.qty - targetKeep);

      if (eligibleToEvacuate > 0) {
        candidateRacks.add(s.lokasi);
        candidateSkus.add(it.sku.toUpperCase());
        totalExcessPcs += eligibleToEvacuate;
      }
    }
  }

  return {
    candidateRacksCount: candidateRacks.size,
    candidateSkusCount: candidateSkus.size,
    totalExcessPcs,
  };
}

/**
 * Generates Consolidated Evacuation / Bulk Storage Recommendations from Rak ABCD -> Rak Koli (R, V, Z).
 *
 * WMS REVERSE REPLENISHMENT & PICKER PROTECTION RULES:
 * 1. MANDATORY PICKING BUFFER: Never strip a picking rack empty! Leaves at least `rule.mandatoryPickingBuffer`
 *    (e.g., 10 pcs) in ABCD so pickers can always fulfill daily customer orders directly from ABCD.
 * 2. MINIMUM THRESHOLD: Only items with quantity >= `rule.minStockThreshold` (e.g., >= 25 pcs) or on overloaded
 *    racks are eligible.
 * 3. PERCENTAGE SPLIT: Moves `rule.evacuatePercent` (e.g., 60%) of eligible stock into Koli reserve.
 * 4. TARGET CONSOLIDATION (Priority 1): If a Koli rack already holds this exact SKU, directs the excess
 *    there so all units of that SKU are unified in the same Koli box.
 * 5. CONSOLIDATED BIN-PACKING (Priority 2): If no Koli holds that SKU, packs items into the Koli rack
 *    with the highest remaining space to avoid scattering across many Koli bins.
 */
export function generateConsolidatedAbcdToKoliMoves(
  allSlots: ComputedRackSlot[],
  catalogMap?: Map<string, EnrichedCatalogEntry>,
  existingMoves: SimulationMove[] = [],
  rule: AbcdToKoliRuleConfig = DEFAULT_ABCD_TO_KOLI_RULE,
  maxMovesToGenerate = 30
): SimulationMove[] {
  // 1. Gather all available Koli slots
  const koliSlots = allSlots
    .filter(
      (s) =>
        !isExcludedFromWarehouseRelocation(s.area, s.lokasi) &&
        (s.area.toUpperCase() === 'KOLIAN' || s.area.toUpperCase() === 'KOLI') &&
        /^[RVZ]\d+$/i.test(s.lokasi)
    )
    .map((s) => ({
      lokasi: s.lokasi,
      maxCapacity: s.maxCapacity,
      currentSimulated: s.simulatedQty,
      remainingSpace: Math.max(0, s.maxCapacity - s.simulatedQty),
      existingSkus: new Set(s.items.map((it) => it.sku.toUpperCase())),
    }));

  if (koliSlots.length === 0) return [];

  // 2. Identify candidate source items in ABCD
  interface AbcdCandidate {
    srcLokasi: string;
    sku: string;
    nama_produk: string;
    size: string;
    category: string;
    moveQty: number;
    initialQty: number;
    remainingInAbcd: number;
    priorityScore: number;
  }

  const existingPairs = new Set(
    existingMoves.map((m) => `${m.fromLokasi}__${m.sku}`.toUpperCase())
  );
  const candidates: AbcdCandidate[] = [];

  for (const s of allSlots) {
    if (
      isExcludedFromWarehouseRelocation(s.area, s.lokasi) ||
      s.area.toUpperCase() !== 'WAREHOUSE' ||
      !/^[ABCD]\d+$/i.test(s.lokasi)
    ) {
      continue;
    }

    const isOverload = s.simulatedQty > s.maxCapacity;

    for (const it of s.items) {
      if (it.qty <= 0) continue;
      const pairKey = `${s.lokasi}__${it.sku}`.toUpperCase();
      if (existingPairs.has(pairKey)) continue;

      // Filter: Syarat minimal stok untuk layak dievakuasi ke Koli
      if (it.qty < rule.minStockThreshold && !isOverload) continue;

      // Hitung buffer wajib tinggal di rak ABCD untuk picker
      const targetKeep = Math.max(
        rule.mandatoryPickingBuffer,
        Math.round(it.qty * (1 - rule.evacuatePercent / 100))
      );
      const moveQty = Math.max(0, it.qty - targetKeep);

      if (moveQty > 0) {
        const catInfo = catalogMap?.get(it.sku.toUpperCase());
        const nama =
          (catInfo?.nama_produk && catInfo.nama_produk !== it.sku ? catInfo.nama_produk : '') ||
          it.nama_produk ||
          it.sku;
        const size =
          (catInfo?.size && catInfo.size !== '-' ? catInfo.size : '') || it.size || 'ALL';

        const priorityScore = isOverload
          ? 100 + (s.simulatedQty - s.maxCapacity)
          : 50 + moveQty;

        candidates.push({
          srcLokasi: s.lokasi,
          sku: it.sku.toUpperCase(),
          nama_produk: nama,
          size,
          category: s.category || catInfo?.kategori || 'Umum',
          moveQty,
          initialQty: it.qty,
          remainingInAbcd: it.qty - moveQty,
          priorityScore,
        });
      }
    }
  }

  if (candidates.length === 0) return [];

  // Sort candidates by priorityScore descending
  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  // 3. Bin-pack candidates into target Koli racks
  const generated: SimulationMove[] = [];
  const nowIso = new Date().toISOString();
  let seq = 1;

  for (const item of candidates) {
    if (generated.length >= maxMovesToGenerate) break;

    // Check Priority 1: Koli rack that already contains this SKU and has room
    let targetKoli = koliSlots.find(
      (k) => k.existingSkus.has(item.sku) && k.remainingSpace >= Math.min(item.moveQty, 5)
    );

    // If none, Priority 2: Koli rack with most remaining space
    if (!targetKoli) {
      const availableKolis = koliSlots
        .filter((k) => k.remainingSpace > 0)
        .sort(
          (a, b) =>
            b.remainingSpace - a.remainingSpace ||
            a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true })
        );
      targetKoli = availableKolis[0];
    }

    if (!targetKoli || targetKoli.remainingSpace <= 0) continue;

    const actualQty = Math.min(item.moveQty, targetKoli.remainingSpace);
    if (actualQty <= 0) continue;

    targetKoli.remainingSpace -= actualQty;
    targetKoli.currentSimulated += actualQty;
    targetKoli.existingSkus.add(item.sku);

    generated.push({
      id: `evac_${Date.now()}_${seq++}`,
      fromLokasi: item.srcLokasi,
      toLokasi: targetKoli.lokasi,
      sku: item.sku,
      nama_produk: item.nama_produk,
      size: item.size,
      category: item.category,
      moveType: 'EVAKUASI_KOLI',
      qty: actualQty,
      createdAt: nowIso,
    });
  }

  return generated;
}


