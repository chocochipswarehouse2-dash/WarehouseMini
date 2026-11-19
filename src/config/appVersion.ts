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
  "version": "v2.20.0",
  "versionCode": 400,
  "buildDate": "19 November 2026",
  "buildHash": "wms-261119-v400-1413",
  "releaseTitle": "WMS v2.20.0 — Modul Tugas Putaway (Transit X & Kolian R/V/Z)",
  "releaseNotes": [
    "Menambahkan fitur Tugas Putaway interaktif di Dashboard Kapasitas untuk sumber Transit (X) dan Kolian (R/V/Z)",
    "Algoritma rute putaway live mengikuti plafon aman dinamis Setup Kapasitas, prioritas konsolidasi SKU/size/kategori, auto-split Transit ke Kolian, dan reservasi slot anti-tabrakan",
    "Dukungan keroyokan multi-operator realtime, scan hybrid (#LOK <-> SKU), override & split rak aktual, cetak A4/Thermal, kirim WA, serta proteksi offline outbox & floating dock",
    "Memperbaiki sinkronisasi nilai Plafon Aman (safeOccupancyCapPercent) saat memuat ulang konfigurasi Kapasitas Rak"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.19.8",
    "versionCode": 398,
    "buildDate": "18 November 2026",
    "buildHash": "wms-261118-v398-2005",
    "releaseTitle": "WMS v2.19.8 — Perbaikan Status Sedang Dikerjakan dari Baris SELESAI di Picking",
    "releaseNotes": [
      "Memastikan active_pickers di Tugas Picking hanya membaca baris item yang belum SELESAI",
      "Mencegah status Sedang Dikerjakan muncul kembali setelah Batal Ambil pada SJ dengan baris historis SELESAI"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.19.7",
    "versionCode": 397,
    "buildDate": "18 November 2026",
    "buildHash": "wms-261118-v397-1950",
    "releaseTitle": "WMS v2.19.7 — Perbaikan Batal Ambil & Input Lokasi Manual Picking",
    "releaseNotes": [
      "Menambahkan input lokasi rak manual langsung pada kartu SKU di Tugas Picking",
      "Menambahkan notifikasi rekomendasi Stock Opname jika stok rak minus saat picking jujur",
      "Memperbaiki sinkronisasi Batal Ambil dan hapus SJ agar status Sedang Dikerjakan tidak muncul kembali"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.19.6",
    "versionCode": 396,
    "buildDate": "18 November 2026",
    "buildHash": "wms-261118-v396-1943",
    "releaseTitle": "WMS v2.19.6 — Input Lokasi Manual & Notif Rekomendasi SO di Tugas Picking",
    "releaseNotes": [
      "Menambahkan input lokasi rak manual langsung pada kartu SKU di Tugas Picking",
      "Menghapus fallback lokasi palsu A-01/A001 agar pencatatan OUT jujur sesuai rak aktual",
      "Menambahkan notifikasi pemberitahuan rekomendasi Stock Opname jika stok rak menjadi minus"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
