import { getAreaFromLokasi } from '../services/supabase';

export interface LocationPurgeSelection {
  mode: 'block' | 'range' | 'single' | 'custom' | 'anomaly';
  blockKey?: string;
  fromRange?: string;
  toRange?: string;
  singleLocation?: string;
  customInput?: string;
}

export const KNOWN_BLOCKS: { key: string; label: string; prefix: string; area: string; description: string }[] = [
  { key: 'A', label: 'Blok A (Warehouse)', prefix: 'A', area: 'Warehouse', description: 'Rak A001 - A100' },
  { key: 'B', label: 'Blok B (Warehouse)', prefix: 'B', area: 'Warehouse', description: 'Rak B001 - B100' },
  { key: 'C', label: 'Blok C (Warehouse)', prefix: 'C', area: 'Warehouse', description: 'Rak C001 - C100' },
  { key: 'D', label: 'Blok D (Warehouse)', prefix: 'D', area: 'Warehouse', description: 'Rak D001 - D100' },
  { key: 'R', label: 'Kolian R (Kolian)', prefix: 'R', area: 'Kolian', description: 'Rak R001 - R100' },
  { key: 'V', label: 'Kolian V (Kolian)', prefix: 'V', area: 'Kolian', description: 'Rak V001 - V100' },
  { key: 'Z', label: 'Kolian Z (Kolian)', prefix: 'Z', area: 'Kolian', description: 'Rak Z001 - Z100' },
  { key: 'X', label: 'Transit X (Transit)', prefix: 'X', area: 'Transit', description: 'Rak X001 - X100, X, TRANSIT' },
  { key: 'AKSESORIS', label: 'Aksesoris (BELT, CARD, GIFT, BOX)', prefix: 'AKSESORIS', area: 'Aksesoris', description: 'Rak aksesoris' },
  { key: 'BLOK_F', label: 'Blok F (TIKTOK, SHOPEE, STUDIO)', prefix: 'BLOK_F', area: 'Blok F', description: 'Area live streaming' },
  { key: 'PERBAIKAN', label: 'Perbaikan (CC, PMK, DF)', prefix: 'PERBAIKAN', area: 'Perbaikan', description: 'Cuci, Permak, Defect' },
];

/**
 * Parses numeric range between two racks with matching prefix (e.g. A001 to A005 -> A001, A002, A003, A004, A005)
 */
export function parseLocationRange(fromLoc: string, toLoc: string): string[] {
  const f = fromLoc.trim().toUpperCase();
  const t = toLoc.trim().toUpperCase();
  if (!f && !t) return [];
  if (!f) return [t];
  if (!t) return [f];
  if (f === t) return [f];

  // Regex to extract prefix and number
  const regex = /^([A-Z\-_]+?)(\d+)$/i;
  const matchF = f.match(regex);
  const matchT = t.match(regex);

  if (!matchF || !matchT) {
    // Cannot parse as numeric sequence, return unique endpoints
    return Array.from(new Set([f, t]));
  }

  const prefixF = matchF[1];
  const prefixT = matchT[1];

  // If prefixes do not match (e.g. A001 to B005), return both
  if (prefixF !== prefixT) {
    return Array.from(new Set([f, t]));
  }

  const startNum = parseInt(matchF[2], 10);
  const endNum = parseInt(matchT[2], 10);
  const padLen = Math.max(matchF[2].length, matchT[2].length);

  const min = Math.min(startNum, endNum);
  const max = Math.max(startNum, endNum);

  // Guard against runaway ranges (e.g. A1 to A99999)
  if (max - min > 500) {
    return [f, t];
  }

  const result: string[] = [];
  for (let i = min; i <= max; i++) {
    const numStr = String(i).padStart(padLen, '0');
    result.push(`${prefixF}${numStr}`);
  }

  return result;
}

/**
 * Expands a block key into all known or registered locations in that block
 */
export function parseBlockLocations(
  blockKey: string,
  existingLocations: string[] = []
): string[] {
  const key = blockKey.trim().toUpperCase();
  const upperExisting = existingLocations.map((l) => (l || '').trim().toUpperCase()).filter(Boolean);
  const locSet = new Set<string>();

  if (['A', 'B', 'C', 'D', 'R', 'V', 'Z'].includes(key)) {
    // Generate standard racks 001 through 100
    for (let i = 1; i <= 100; i++) {
      locSet.add(`${key}${String(i).padStart(3, '0')}`);
    }
    // Also include any existing locations starting with that letter (e.g. A01, A-05, A105)
    upperExisting.forEach((loc) => {
      if (loc.startsWith(key) && /^[A-Z]-?\d+$/.test(loc)) {
        locSet.add(loc);
      }
    });
  } else if (key === 'X') {
    locSet.add('X');
    locSet.add('TRANSIT');
    for (let i = 1; i <= 100; i++) {
      locSet.add(`X${String(i).padStart(3, '0')}`);
    }
    upperExisting.forEach((loc) => {
      if (loc.startsWith('X') || loc.includes('TRANSIT')) {
        locSet.add(loc);
      }
    });
  } else if (key === 'AKSESORIS') {
    ['BELT', 'CARD', 'GIFT', 'BOX'].forEach((p) => {
      locSet.add(p);
      for (let i = 1; i <= 20; i++) {
        locSet.add(`${p}${String(i).padStart(3, '0')}`);
      }
    });
    upperExisting.forEach((loc) => {
      if (['BELT', 'CARD', 'GIFT', 'BOX'].some((p) => loc.startsWith(p))) {
        locSet.add(loc);
      }
    });
  } else if (key === 'BLOK_F') {
    ['TIKTOK', 'SHOPEE', 'STUDIO'].forEach((b) => locSet.add(b));
    upperExisting.forEach((loc) => {
      if (loc.includes('TIKTOK') || loc.includes('SHOPEE') || loc.includes('STUDIO') || loc.includes('BLOK F')) {
        locSet.add(loc);
      }
    });
  } else if (key === 'PERBAIKAN') {
    ['CC', 'PMK', 'DF'].forEach((p) => {
      locSet.add(p);
      for (let i = 1; i <= 50; i++) {
        locSet.add(`${p}${String(i).padStart(3, '0')}`);
      }
    });
    upperExisting.forEach((loc) => {
      if (getAreaFromLokasi(loc) === 'Perbaikan') {
        locSet.add(loc);
      }
    });
  }

  return Array.from(locSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Splits comma, semicolon, newline, or whitespace delimited locations
 */
export function parseCustomLocations(rawInput: string): string[] {
  if (!rawInput) return [];
  const parts = rawInput
    .split(/[\n,;\t]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return Array.from(new Set(parts)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Detects anomaly or non-standard locations from existing locations in database
 */
export function detectAnomalyLocations(existingLocations: string[]): string[] {
  const anomalies: string[] = [];
  const seen = new Set<string>();

  for (const raw of existingLocations) {
    const loc = (raw || '').trim().toUpperCase();
    if (!loc || seen.has(loc)) continue;
    seen.add(loc);

    // Filter out recognized standard areas
    const area = getAreaFromLokasi(loc);
    if (area === 'Anomali') {
      anomalies.push(loc);
      continue;
    }

    // Corrupted strings or non-rack markers
    if (
      loc === '-' ||
      loc === '--' ||
      loc === 'NULL' ||
      loc === 'UNDEFINED' ||
      loc === 'UNKNOWN' ||
      loc.startsWith('#') ||
      loc.includes('━') ||
      loc.length > 30
    ) {
      anomalies.push(loc);
    }
  }

  return anomalies.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Main resolver converting user selection state into an array of concrete uppercase location strings
 */
export function resolveLocationsFromSelection(
  selection: LocationPurgeSelection,
  existingLocations: string[] = []
): string[] {
  switch (selection.mode) {
    case 'block':
      return selection.blockKey ? parseBlockLocations(selection.blockKey, existingLocations) : [];
    case 'range':
      return parseLocationRange(selection.fromRange || '', selection.toRange || '');
    case 'single': {
      const s = (selection.singleLocation || '').trim().toUpperCase();
      return s ? [s] : [];
    }
    case 'custom':
      return parseCustomLocations(selection.customInput || '');
    case 'anomaly':
      return detectAnomalyLocations(existingLocations);
    default:
      return [];
  }
}
