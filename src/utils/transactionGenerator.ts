import { ManualShipmentOrder } from '../types';

// Karakter bebas ambigu (tanpa 0, O, 1, I) agar mudah dibaca dan tidak salah ketik
const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Peta singkatan kode store resmi
 */
export const STORE_ACRONYM_MAP: Record<string, string> = {
  'lippo mall puri': 'LMP',
  'lmp': 'LMP',
  'central park jakarta': 'CPJ',
  'central park': 'CPJ',
  'cpj': 'CPJ',
  'mall kelapa gading': 'MKG',
  'mkg': 'MKG',
  'mkg 3': 'MKG',
  'by the sea pik': 'BTS',
  'by the sea': 'BTS',
  'bts': 'BTS',
  'ciputra world surabaya': 'CWS',
  'ciputra world': 'CWS',
  'cws': 'CWS',
  'living world tangerang': 'LWS',
  'living world': 'LWS',
  'lws': 'LWS',
  'deli park medan': 'DPM',
  'deli park': 'DPM',
  'dpm': 'DPM',
  'paskal hyper square bandung': 'PHB',
  'paskal hyper square': 'PHB',
  '23 paskal': 'PHB',
  'phb': 'PHB',
  'pakuwon mall surabaya': 'PMS',
  'pakuwon mall': 'PMS',
  'pms': 'PMS',
  'neo soho jakarta': 'NSJ',
  'neo soho': 'NSJ',
  'nsj': 'NSJ',
  'puri indah mall': 'PIM',
  'pondok indah mall': 'PIM',
  'pim': 'PIM',
  'pim 2': 'PIM',
  'sun plaza medan': 'SPM',
  'sun plaza': 'SPM',
  'spm': 'SPM',
  'gaia pontianak': 'GAIA',
  'gaia bumi raya city': 'GAIA',
  'gaia': 'GAIA',
  'gading serpong tangerang': 'GST',
  'gading serpong': 'GST',
  'summarecon mall serpong': 'GST',
  'sms': 'GST',
  'gst': 'GST',
  'supermal karawaci': 'SMK',
  'senayan city': 'SNC',
  'grand indonesia': 'GI',
  'plaza indonesia': 'PI',
  'paris van java': 'PVJ',
  'tunjungan plaza': 'TP',
  'galaxy mall': 'GM',
  'aeon bsd': 'ABSD',
  'aeon jgc': 'AJGC',
  'aeon mall': 'AEON',
  'trans studio mall': 'TSM',
  'tsm bandung': 'TSMB',
  'tsm makassar': 'TSMM',
  'bintaro jaya xchange': 'BJX',
  'margo city': 'MGC',
  'botani square': 'BSQ',
  'pakuwon city mall': 'PCM',
};

/**
 * Menghasilkan kode store singkat (akronim) dari nama store yang diinput
 * Misal:
 * - "Lippo Mall Puri" -> "LMP"
 * - "central park jakarta" -> "CPJ"
 * - "Grand Indonesia" -> "GI"
 */
export function getStoreCode(storeName?: string): string {
  if (!storeName || !storeName.trim()) return '';
  const clean = storeName.trim().toLowerCase();
  
  if (STORE_ACRONYM_MAP[clean]) {
    return STORE_ACRONYM_MAP[clean];
  }

  // Jika tidak ada di kamus persis, buat akronim otomatis
  const words = clean
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0);

  if (words.length === 0) return '';

  const filteredWords = words.length > 1
    ? words.filter(w => !['store', 'toko', 'outlet', 'cabang'].includes(w))
    : words;

  const targetWords = filteredWords.length > 0 ? filteredWords : words;

  if (targetWords.length > 1) {
    return targetWords.map(w => w[0].toUpperCase()).join('').slice(0, 4);
  }

  const single = targetWords[0].toUpperCase();
  return single.length <= 4 ? single : single.slice(0, 4);
}

/**
 * Menghasilkan string acak berbasis kriptografi dengan panjang tertentu
 */
export function getRandomCryptoString(length: number): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const values = new Uint8Array(length);
    window.crypto.getRandomValues(values);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += CHARSET[values[i] % CHARSET.length];
    }
    return result;
  }
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return result;
}

/**
 * Mengambil daftar nomor transaksi yang baru di-generate pada sesi browser ini
 * untuk mencegah duplikasi instan antar tab / form
 */
function getRecentGeneratedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem('wms_recent_trx_cust');
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveRecentGenerated(code: string) {
  try {
    const recent = getRecentGeneratedSet();
    recent.add(code.toUpperCase());
    const list = Array.from(recent).slice(-50);
    sessionStorage.setItem('wms_recent_trx_cust', JSON.stringify(list));
  } catch {
    // Ignore storage quota limits
  }
}

/**
 * Generate No. Transaksi Customer otomatis yang ringkas dan memuat unsur store:
 * Misal:
 * - Store "Lippo Mall Puri" -> "MSLMP-koderandom" (contoh: MSLMP-7K4X2)
 * - Store "central park jakarta" -> "MSCPJ-koderandom" (contoh: MSCPJ-9N2A8)
 * - Belum pilih store -> "MS-koderandom"
 *
 * Murni dibuat oleh sistem, tidak panjang, dan kebal bentrokan multi-user.
 */
export function generateCustomerTransactionNumber(
  existingOrders: ManualShipmentOrder[] = [],
  storeName?: string
): string {
  const storeCode = getStoreCode(storeName);
  const prefix = storeCode ? `MS${storeCode}` : 'MS';

  const recent = getRecentGeneratedSet();
  const existingSet = new Set<string>();

  for (const o of existingOrders) {
    if (o.no_transaksi_customer) {
      existingSet.add(o.no_transaksi_customer.trim().toUpperCase());
    }
  }

  let candidate = '';
  let attempts = 0;
  const maxAttempts = 30;

  // 5 karakter random = 33.554.432 kombinasi per kode store
  while (attempts < maxAttempts) {
    attempts++;
    const randomPart = getRandomCryptoString(5);
    candidate = `${prefix}-${randomPart}`;

    if (!existingSet.has(candidate.toUpperCase()) && !recent.has(candidate.toUpperCase())) {
      break;
    }
  }

  if (existingSet.has(candidate.toUpperCase()) || recent.has(candidate.toUpperCase())) {
    candidate = `${prefix}-${getRandomCryptoString(6)}`;
  }

  saveRecentGenerated(candidate);
  return candidate;
}

/**
 * Generate No Pesanan internal yang ringkas (tidak terlalu panjang)
 * Format: MS[STORE]-YYMMDD-XXXX (contoh: MSLMP-260911-8K3N)
 */
export function generateShortOrderId(
  storeName?: string,
  existingOrders: ManualShipmentOrder[] = []
): string {
  const storeCode = getStoreCode(storeName);
  const prefix = storeCode ? `MS${storeCode}` : 'MS';

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;

  const existingSet = new Set(existingOrders.map(o => o.no_pesanan?.trim().toUpperCase()));

  let candidate = '';
  let attempts = 0;
  while (attempts < 20) {
    attempts++;
    const rand = getRandomCryptoString(4);
    candidate = `${prefix}-${dateStr}-${rand}`;
    if (!existingSet.has(candidate.toUpperCase())) {
      return candidate;
    }
  }

  return `${prefix}-${dateStr}-${getRandomCryptoString(5)}`;
}

/**
 * Cek apakah nomor transaksi customer sudah pernah dipakai sebelumnya
 */
export function isTransactionNumberUnique(
  code: string,
  existingOrders: ManualShipmentOrder[] = []
): boolean {
  if (!code || !code.trim()) return false;
  const target = code.trim().toUpperCase();
  return !existingOrders.some(
    (o) => o.no_transaksi_customer && o.no_transaksi_customer.trim().toUpperCase() === target
  );
}

/**
 * Alias resmi: Order ID Manual Shipment
 */
export const generateManualShipmentOrderId = generateCustomerTransactionNumber;
