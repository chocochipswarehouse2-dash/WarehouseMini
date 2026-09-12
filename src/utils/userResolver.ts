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
  chocostyling: 'Chocostyling',
  chocolive: 'chocoLIVE',
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
      inMemoryUserMap = { ...inMemoryUserMap, ...parsed };
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
      if (cleanU && (!inMemoryUserMap[cleanU] || inMemoryUserMap[cleanU] !== fullName)) {
        inMemoryUserMap[cleanU] = fullName;
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
