/**
 * App Version & Release Configuration
 * Single Source of Truth for WMS Application Version
 */

export interface VersionInfo {
  version: string;
  versionCode: number;
  buildDate: string;
  buildHash: string;
  releaseTitle: string;
  releaseNotes: string[];
  minSupportedVersion?: string;
}

export const CURRENT_APP_VERSION_INFO: VersionInfo = {
  version: 'v2.5.0',
  versionCode: 250,
  buildDate: '24 Oktober 2026',
  buildHash: 'wms-261024-v250',
  releaseTitle: 'WMS v2.5.0 — Smart Update Manager & Evakuasi Koli',
  releaseNotes: [
    'Sistem Pembaruan Mandiri ala Android: Periksa pembaruan, unduh dengan progress 0-100%, dan terapkan tanpa reload berulang.',
    'Indikator Versi Real-time: Informasi versi terpasang vs versi server terlihat jelas di Sidebar & Pengaturan.',
    'Rekomendasi Evakuasi Stok ABCD ke Koli (Refill Balik): Optimasi kapasitas rak picking dan pemindahan over-stock.',
    'Pengaturan Buffer Dinamis: Kapasitas rak, ambang batas evakuasi, dan buffer picking tersimpan aman di cloud Supabase.',
    'Optimasi Cache Service Worker: Pencegahan jebakan cache lama dan peningkatan keandalan offline PWA.'
  ],
  minSupportedVersion: 'v2.0.0'
};

export const CURRENT_APP_VERSION = CURRENT_APP_VERSION_INFO.version;

/**
 * Compare two semver-like strings (e.g. 'v2.5.0' vs 'v2.5.1')
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean = (v: string) => v.replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const p1 = clean(v1);
  const p2 = clean(v2);

  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export function isNewerVersion(serverVersion: string, clientVersion: string = CURRENT_APP_VERSION): boolean {
  if (!serverVersion) return false;
  return compareVersions(serverVersion, clientVersion) > 0;
}
