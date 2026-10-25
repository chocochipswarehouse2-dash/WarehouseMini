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
  version: 'v2.5.1',
  versionCode: 251,
  buildDate: '25 Oktober 2026',
  buildHash: 'wms-261025-v251',
  releaseTitle: 'WMS v2.5.1 — Side-by-Side Inventory & Notifikasi Store',
  releaseNotes: [
    'Penyajian Inventori Berdampingan (Side-by-Side): Tampilan data DealPOS (Marketplace & Perbaikan) berdampingan langsung dengan lokasi fisik rak tanpa distraksi selisih.',
    'Kartu Inventori Mobile Touch-Optimized: Tata letak kartu per SKU yang ringkas dan responsif untuk audit fisik di lorong gudang via smartphone.',
    'Notifikasi Otomatis WA Store (Fonnte): Pengiriman otomatis format permintaan kirim barang ke WhatsApp Store ketika pesanan manual shipment disubmit.',
    'Sinkronisasi Kanal DealPOS Real-time: Integrasi data dealpos_channels dari Supabase dan mekanisme auto-heal cache lokal yang memastikan data kanal selalu akurat.'
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
