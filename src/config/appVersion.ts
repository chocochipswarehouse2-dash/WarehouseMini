/**
 * App Version & Release Configuration
 * Single Source of Truth for WMS Application Version
 * Auto-managed by tools/bump_version.cjs
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
  "version": "v2.19.5",
  "versionCode": 395,
  "buildDate": "18 November 2026",
  "buildHash": "wms-261118-v395-1901",
  "releaseTitle": "WMS v2.19.5 — Hapus Auto-Fill Trello di Penerimaan Produksi",
  "releaseNotes": [
    "Menghapus fitur auto-lookup dan auto-fill otomatis dari Trello UP di Form Penerimaan Produksi, Spreadsheet, Push Sheets, dan Asisten AI",
    "Mencegah anomali data nama produk, UP vendor, dan foto akibat pencocokan otomatis"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.19.4",
    "versionCode": 394,
    "buildDate": "18 November 2026",
    "buildHash": "wms-261118-v394-1640",
    "releaseTitle": "WMS v2.19.4 — Minimize Push Update Sheet Produksi (Tanggal, Master & SJ)",
    "releaseNotes": [
      "Modal Push Sheet Penerimaan Produksi (Per Tanggal, Semua Tanggal, Master Produksi, dan Surat Jalan) kini bisa di-minimize ke bubble mengambang",
      "Proses pengiriman sheet ke Google Spreadsheet tetap berjalan di latar belakang lengkap dengan indikator progres live"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.19.3",
    "versionCode": 393,
    "buildDate": "18 November 2026",
    "buildHash": "wms-261118-v393-1603",
    "releaseTitle": "WMS v2.19.3 — Minimize & Perlindungan Offline Form Input Kargo + Auto-Fallback Server AI",
    "releaseNotes": [
      "Form Input Penerimaan Kargo & CMT kini memiliki tombol Minimize ke Dock Bawah, Mode Popup, dan Perlindungan Offline terpisah per kategori",
      "Multi-model auto-fallback pada endpoint /api/ai untuk mencegah error 503 High Demand"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.19.2",
    "versionCode": 392,
    "buildDate": "18 November 2026",
    "buildHash": "wms-261118-v392-1349",
    "releaseTitle": "WMS v2.19.2 — Hotfix Format Picker Pengecekan Surat Jalan",
    "releaseNotes": [
      "Perbaikan error 'isWarehouseLocation is not defined' saat klik Format Picker di Pengecekan Surat Jalan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.19.1",
    "versionCode": 391,
    "buildDate": "18 November 2026",
    "buildHash": "wms-261118-v391-1336",
    "releaseTitle": "WMS v2.19.1 — Setup Kapasitas Lokasi SORTIR (Area Perbaikan)",
    "releaseNotes": [
      "Setup Kapasitas lokasi SORTIR dibuat 1 lokasi statis (sama seperti Shopee/TikTok/Studio)",
      "Pemetaan lokasi SORTIR otomatis mengikuti Area Perbaikan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.19.0",
    "versionCode": 393,
    "buildDate": "17 November 2026",
    "buildHash": "wms-261117-v393-2002",
    "releaseTitle": "WMS v2.19.0 — Area Sortir (ST) & Smart Picking Filter Pengecekan SJ",
    "releaseNotes": [
      "Tambah Area Sortir (ST001-STnnn) ke seluruh modul WMS",
      "Filter Picking Pengecekan SJ hanya tampilkan lokasi Warehouse, Kolian, dan Transit"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.12",
    "versionCode": 392,
    "buildDate": "17 November 2026",
    "buildHash": "wms-261117-v392-0935",
    "releaseTitle": "WMS v2.18.12 — Auto-Provisioning & Pemulihan Grup Chat [MS & Alter] Store",
    "releaseNotes": [
      "Provisioning batch seluruh grup [MS & Alter] Store resmi via 1 atomic CAS + sinkronisasi otomatis pesanan yang terlewat (backfill 48 jam & Realtime receiver healing)",
      "Perbaikan await notifikasi Live Chat saat submit pesanan Store serta merge server sebelum simpan agar riwayat chat tidak pernah tertimpa"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.11",
    "versionCode": 391,
    "buildDate": "17 November 2026",
    "buildHash": "wms-261117-v391-1343",
    "releaseTitle": "WMS v2.18.11 — Multi-PIC Delegasi Tugas Agenda",
    "releaseNotes": [
      "Dukungan pilih lebih dari 1 PIC saat buat/edit Delegasi Tugas di modul Agenda & Tasks",
      "Tampilan badge multi-PIC pada kartu tugas dan pencocokan Tugas Saya untuk semua PIC terpilih"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.10",
    "versionCode": 390,
    "buildDate": "17 November 2026",
    "buildHash": "wms-261117-v390-1314",
    "releaseTitle": "WMS v2.18.10 — Multi-Choice Dropsearch Filter Asal & Tujuan Pengecekan SJ",
    "releaseNotes": [
      "Ubah filter Asal dan Tujuan di Riwayat Pengecekan SJ menjadi Multi-Select Dropsearch dengan pencarian dan jumlah SJ per opsi"
    ],
    "minSupportedVersion": "v2.0.0"
  }
];

export const CURRENT_APP_VERSION = CURRENT_APP_VERSION_INFO.version;

/**
 * Compare two semver-like strings (e.g. 'v2.5.1' vs 'v2.5.2')
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

export function isNewerVersion(
  serverVersion: string,
  clientVersion: string = CURRENT_APP_VERSION,
  serverBuildHash?: string,
  clientBuildHash: string = CURRENT_APP_VERSION_INFO.buildHash
): boolean {
  if (!serverVersion) return false;
  const cmp = compareVersions(serverVersion, clientVersion);
  if (cmp > 0) return true;
  if (cmp === 0 && serverBuildHash && clientBuildHash && serverBuildHash !== clientBuildHash) {
    return true;
  }
  return false;
}
