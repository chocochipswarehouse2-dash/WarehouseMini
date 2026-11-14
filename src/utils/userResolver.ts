/**
 * Centralized User & Employee Real-Name Resolver
 * Ensures all UI displays and logs use the person's real name (e.g. "Yesinta Agistisari")
 * instead of login usernames or NIKs (e.g. "wh0004").
 */

// Initial baseline dictionary from database wms_users and karyawan
const BASELINE_USER_NAMES: Record<string, string> = {
  wh0001: 'Warehouse Admin',
  wh0002: 'Sasi Novita',
  wh0003: 'Irma',
  wh0004: 'Yesinta Agistisari',
  wh0005: 'Nur Halimah',
  wh0006: 'Vina Kharisma',
  wh0007: 'Novi Fatihatul',
  wh0008: 'Navi Ilyah',
  wh0009: 'Ria Nur Fiana',
  wh0010: 'Nanang',
  admin: 'Warehouse Admin',
  admin2: 'Warehouse Admin',
  chocoadm: 'Warehouse Admin',
  chococpj: 'Central Park Jakarta',
  chocogaia: 'Gaia Pontianak',
  chocobts: 'By The Sea PIK',
  chococws: 'Ciputra World Surabaya',
  chocodpm: 'Deli Park Medan',
  chocogst: 'Gading Serpong Tangerang',
  chocolmp: 'Lippo Mall Puri',
  chocolvl: 'La Vela Tangerang',
  chocolws: 'Living World Tangerang',
  chocomkg: 'Mall Kelapa Gading',
  choconsj: 'Neo Soho Jakarta',
  chocophb: 'Paskal Hyper Square Bandung',
  chocopim: 'Pondok Indah Mall',
  chocopms: 'Pakuwon Mall Surabaya',
  chocospm: 'Sun Plaza Medan',
  chocotp: 'Tunjungan Plaza Surabaya',
  chocostyling: 'Chocostyling',
  chocolive: 'chocoLIVE',
  chococs1: 'CS 1 (Customer Service)',
  chococs2: 'CS 2 (Customer Service)',
  cs1: 'CS 1 (Customer Service)',
  cs2: 'CS 2 (Customer Service)',
  yesinta: 'Yesinta Agistisari',
  userqc1: 'Warehouse Admin',
  userqc2: 'Irma',
  userqc3: 'Yesinta Agistisari',
  userqc4: 'Nur Halimah',
  userqc5: 'Vina Kharisma',
  userqc6: 'Novi Fatihatul',
  userqc7: 'Navi Ilyah',
  userqc8: 'Ria Nur Fiana',
  userqc9: 'Nanang',
};

// In-memory cache loaded with baseline + persisted custom mappings
let inMemoryUserMap: Record<string, string> = { ...BASELINE_USER_NAMES };

// Initialize from localStorage if available
try {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('wms_user_name_map');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          const cleanK = k.trim().toLowerCase();
          const cleanV = String(v || '').trim();
          if (!cleanK || !cleanV) continue;
          // Do not let raw login username overwrite a friendly baseline display name
          if (BASELINE_USER_NAMES[cleanK] && cleanV.toLowerCase() === cleanK) {
            continue;
          }
          inMemoryUserMap[cleanK] = cleanV;
        }
      }
    }
  }
} catch {
  // Ignore storage errors
}

/**
 * Register dynamic users and employees from database queries
 */
export function registerUserNames(
  users: Array<{ username?: string | null; name?: string | null; nama?: string | null; nik?: string | null }>
): void {
  if (!Array.isArray(users) || users.length === 0) return;

  let hasUpdates = false;

  users.forEach((u) => {
    const fullName = (u.nama || u.name || '').trim();
    if (!fullName) return;

    if (u.username) {
      const cleanU = u.username.trim().toLowerCase();
      // Preserve friendly baseline display name if DB name is just the raw username
      const effectiveName =
        BASELINE_USER_NAMES[cleanU] && fullName.toLowerCase() === cleanU
          ? BASELINE_USER_NAMES[cleanU]
          : fullName;
      if (cleanU && (!inMemoryUserMap[cleanU] || inMemoryUserMap[cleanU] !== effectiveName)) {
        inMemoryUserMap[cleanU] = effectiveName;
        hasUpdates = true;
      }
    }

    if (u.nik) {
      const cleanNik = u.nik.trim().toLowerCase();
      if (cleanNik && (!inMemoryUserMap[cleanNik] || inMemoryUserMap[cleanNik] !== fullName)) {
        inMemoryUserMap[cleanNik] = fullName;
        hasUpdates = true;
      }
    }
  });

  if (hasUpdates && typeof window !== 'undefined') {
    try {
      localStorage.setItem('wms_user_name_map', JSON.stringify(inMemoryUserMap));
    } catch {
      // Ignore storage errors
    }
  }
}

/**
 * Resolve any username, nik, or identifier to the person's real full name.
 * If not recognized, returns a clean capitalized display name or fallback.
 */
export function getUserPersonName(identifier?: string | null, fallback?: string): string {
  if (!identifier || typeof identifier !== 'string') {
    return fallback || 'Petugas';
  }

  const raw = identifier.trim();
  if (!raw) return fallback || 'Petugas';

  const clean = raw.toLowerCase();

  // Check direct match in dictionary
  if (inMemoryUserMap[clean]) {
    return inMemoryUserMap[clean];
  }

  // Check NIK format (e.g. WH0004 or wh0004)
  const nikMatch = clean.match(/^(wh\d{4})/i);
  if (nikMatch && inMemoryUserMap[nikMatch[1].toLowerCase()]) {
    return inMemoryUserMap[nikMatch[1].toLowerCase()];
  }

  // If identifier contains 'yesinta'
  if (clean.includes('yesinta')) {
    return 'Yesinta Agistisari';
  }

  // If already looks like a real full name (has spaces or capital letters)
  if (raw.includes(' ') || (raw !== raw.toLowerCase() && raw !== raw.toUpperCase())) {
    return raw;
  }

  return fallback || raw;
}

/**
 * Format operator strings (such as "wh0004 | Staging", "admin | Staging", "wh0004")
 * into human-readable real person's name (e.g. "Yesinta Agistisari | Staging").
 */
export function formatOperatorWithPersonName(rawOperator?: string | null): string {
  if (!rawOperator || typeof rawOperator !== 'string') {
    return '-';
  }

  const trimmed = rawOperator.trim();
  if (!trimmed || trimmed === '-') return '-';

  // Handle pipe separated strings: "wh0004 | Staging"
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|');
    const userPart = parts[0].trim();
    const rest = parts.slice(1).join('|').trim();

    const personName = getUserPersonName(userPart);
    return `${personName} | ${rest}`;
  }

  // Handle space separated "wh0004 staging"
  const spaceMatch = trimmed.match(/^([a-z0-9_]+)\s+(staging.*)$/i);
  if (spaceMatch) {
    const personName = getUserPersonName(spaceMatch[1]);
    return `${personName} | ${spaceMatch[2]}`;
  }

  // Direct lookup
  return getUserPersonName(trimmed);
}

const NON_EMPLOYEE_SYSTEM_USERNAMES = new Set([
  'warehouse',
  'admin',
  'admin2',
  'superadmin',
  'chocoadm',
  'system',
  'chocolive',
  'chocostyling',
  'cs1',
  'cs2',
  'chococs1',
  'chococs2',
]);

function isStoreLikeSessionOrUser(
  sessionOrUser?: { nik?: string | null; username?: string | null; role?: string | null; store_code?: string | null; store_name?: string | null } | string | null
): boolean {
  if (!sessionOrUser) return false;
  if (typeof sessionOrUser === 'string') {
    const clean = sessionOrUser.trim().toLowerCase();
    return clean.startsWith('choco') && clean !== 'chocoadm';
  }
  const u = (sessionOrUser.username || '').trim().toLowerCase();
  const role = (sessionOrUser.role || '').trim().toLowerCase();
  if (u.startsWith('choco') && u !== 'chocoadm') return true;
  if (role === 'store' || role === 'outlet' || role === 'toko') return true;
  if ((sessionOrUser.store_code || '').trim() || (sessionOrUser.store_name || '').trim()) return true;
  return false;
}

/**
 * Strict personal employee NIK resolver for Profile & KPI gating.
 * NEVER falls back to 'WH0001' for Store accounts, system/shared accounts, or non-employees.
 */
export function resolveStrictEmployeeNik(
  sessionOrUser?: { nik?: string | null; username?: string | null; role?: string | null; store_code?: string | null; store_name?: string | null } | string | null
): string {
  if (!sessionOrUser) return '';
  if (isStoreLikeSessionOrUser(sessionOrUser)) return '';

  const rawUsername = typeof sessionOrUser === 'string' ? sessionOrUser : (sessionOrUser.username || '');
  const u = rawUsername.trim().toLowerCase();
  if (NON_EMPLOYEE_SYSTEM_USERNAMES.has(u)) return '';

  if (typeof sessionOrUser === 'object' && sessionOrUser.nik && sessionOrUser.nik.trim()) {
    const cleanNik = sessionOrUser.nik.trim().toUpperCase();
    if (cleanNik !== 'WH0001' || u === 'wh0001') {
      return cleanNik;
    }
    return '';
  }

  if (/^wh\d+$/i.test(u)) {
    const num = u.replace(/\D/g, '');
    if (num) {
      return `WH${num.padStart(4, '0')}`;
    }
    return u.toUpperCase();
  }
  if (u === 'yesinta') return 'WH0004';
  if (u === 'sasi') return 'WH0002';
  if (u === 'irma') return 'WH0003';
  if (u === 'nanang') return 'WH0010';
  return '';
}

/**
 * Resolves a UserSession, username, or identifier to a standardized NIK when applicable.
 * Never returns 'WH0001' for Store or unrecognized non-employee accounts.
 */
export function getUserNik(
  sessionOrUser?: { nik?: string | null; username?: string | null; role?: string | null; store_code?: string | null; store_name?: string | null } | string | null
): string {
  if (!sessionOrUser) return '';
  if (isStoreLikeSessionOrUser(sessionOrUser)) return '';

  if (typeof sessionOrUser === 'object') {
    const u = (sessionOrUser.username || '').trim().toLowerCase();
    if (sessionOrUser.nik && sessionOrUser.nik.trim()) {
      const cleanNik = sessionOrUser.nik.trim().toUpperCase();
      if (cleanNik !== 'WH0001' || ['wh0001', 'warehouse', 'admin', 'admin2', 'chocoadm'].includes(u)) {
        return cleanNik;
      }
    }
    if (/^wh\d+$/i.test(u)) {
      const num = u.replace(/\D/g, '');
      if (num) {
        return `WH${num.padStart(4, '0')}`;
      }
      return u.toUpperCase();
    }
    if (u === 'yesinta') return 'WH0004';
    if (u === 'sasi') return 'WH0002';
    if (u === 'irma') return 'WH0003';
    if (u === 'nanang') return 'WH0010';
    if (['warehouse', 'admin', 'admin2', 'chocoadm'].includes(u)) return 'WH0001';
    return '';
  }

  const clean = String(sessionOrUser).trim().toLowerCase();
  if (/^wh\d+$/i.test(clean)) {
    const num = clean.replace(/\D/g, '');
    if (num) {
      return `WH${num.padStart(4, '0')}`;
    }
    return clean.toUpperCase();
  }
  if (clean === 'yesinta') return 'WH0004';
  if (clean === 'sasi') return 'WH0002';
  if (clean === 'irma') return 'WH0003';
  if (clean === 'nanang') return 'WH0010';
  if (['warehouse', 'admin', 'admin2', 'chocoadm'].includes(clean)) return 'WH0001';
  return '';
}
