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
  "version": "v2.6.58",
  "versionCode": 318,
  "buildDate": "5 November 2026",
  "buildHash": "wms-261105-v318-1314",
  "releaseTitle": "WMS v2.6.58 — Pulihkan Konfigurasi Kapasitas Rak & Perbaikan Tombol Setup",
  "releaseNotes": [
    "Perbaikan tombol Setup Kapasitas & Lokasi yang tidak merespons saat diklik (import normalizeAndMigrateRackConfig)",
    "Pemulihan konfigurasi kapasitas rak custom (Lokasi A-D: 75/75/80/75 pcs, Transit X & Koli R/V/Z: 40 pcs, Shopee: 400, TikTok: 250, IGLive: 250, Studio: 500, Perbaikan CC/PMK/DF: 50 pcs)",
    "Perbaikan label jumlah lokasi pada tombol filter Semua Warehouse (Rak + Koli)"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.57",
    "versionCode": 317,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v317-1138",
    "releaseTitle": "WMS v2.6.57 — Perbaikan Setup Kapasitas & Sinkronisasi IGLive Blok F",
    "releaseNotes": [
      "Memulihkan konfigurasi lengkap rack_capacity_config_v1 di Supabase wms_system_docs termasuk zona IGLive Blok F",
      "Memastikan modal Setup Kapasitas Rak dan pemisahan utilitas Gudang, Koli, dan Blok F berjalan normal tanpa kendala memuat halaman"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.56",
    "versionCode": 316,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v316-1028",
    "releaseTitle": "WMS v2.6.56 — Fix import useCallback pada RackCapacityDashboard",
    "releaseNotes": [
      "Memperbaiki impor useCallback dari React pada komponen RackCapacityDashboard di modul Inventory"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.55",
    "versionCode": 315,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v315-1020",
    "releaseTitle": "WMS v2.6.55 — Integrasi Kapasitas Warehouse (Rak + Koli), Blok F & SPS IGLive",
    "releaseNotes": [
      "Kapasitas Warehouse mencakup Rak ABCD dan Koli R,V,Z,X,CC,PMK,DF secara total",
      "Status kapasitas masing-masing kategori penyimpanan (Rak, Koli, dan Blok F)",
      "Setup IGLive pada kapasitas rak dan integrasi zona Blok F",
      "Penambahan tab, filter & tabel IGLive pada modul SPS (Peminjaman)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.54",
    "versionCode": 314,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v314-0910",
    "releaseTitle": "WMS v2.6.54 — Penambahan Variabel Lokasi Baru IGLIVE pada Area Blok F",
    "releaseNotes": [
      "Tambah variabel lokasi resmi IGLIVE pada Area Blok F dengan prioritas picking Priority 3",
      "Mendukung variasi penulisan IGlive, IG LIVE, IG-LIVE secara otomatis",
      "Integrasi ke Quick Tag Toolbar, cetak label barcode rak, dan kapasitas rak WMS",
      "Sinkronisasi modul webhook dan logic Fonnte GAS"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.53",
    "versionCode": 313,
    "buildDate": "3 November 2026",
    "buildHash": "wms-261103-v313-1605",
    "releaseTitle": "WMS v2.6.53 — Hide/Unhide Panel Samping & Kartu Kalender Agenda",
    "releaseNotes": [
      "Tambah toggle sembunyikan/buka panel samping kalender (Mini Kalender & Kategori) gaya Google Calendar",
      "Grid kalender otomatis melebar penuh 100% saat panel samping disembunyikan",
      "Tambah tombol collapse/expand independen pada kartu Mini Kalender dan Filter Kategori",
      "Menyimpan preferensi tampilan panel samping di localStorage"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.52",
    "versionCode": 312,
    "buildDate": "3 November 2026",
    "buildHash": "wms-261103-v312-1420",
    "releaseTitle": "WMS v2.6.52 — Hide/Unhide Panel Editor pada Fullscreen 3D Warehouse",
    "releaseNotes": [
      "Tambah fitur toggle sembunyikan/buka panel editor 3D gudang saat layar penuh maupun normal",
      "Tombol toggle interaktif di chips lantai, toolbar fullscreen, dan kontrol kamera",
      "Shortcut keyboard H untuk sembunyikan/buka panel desain secara instan",
      "Canvas Three.js otomatis melebar penuh 100% tanpa distorsi saat panel disembunyikan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.51",
    "versionCode": 311,
    "buildDate": "3 November 2026",
    "buildHash": "wms-261103-v311-0842",
    "releaseTitle": "WMS v2.6.51 — Full 2-Way Sync Google Calendar & PWA Auto-Update Delivery Hardening",
    "releaseNotes": [
      "Otomasi sinkronisasi 2-arah Google Calendar & WMS (polling 45 detik saat tab aktif & auto-sync saat tab fokus kembali)",
      "Perbaikan end date all-day event Google Calendar agar tidak bergeser 1 hari",
      "Pembersihan otomatis metadata tag [WMS-ID] dari deskripsi agenda",
      "Sinkronisasi perubahan judul, tanggal, jam, lokasi, deskripsi dari Google Calendar ke WMS & pembersihan agenda yang dihapus",
      "Perkuatan OTA PWA Auto-Update: bypass cache Vercel CDN untuk version.json, auto-detect update instan pada startup & broadcast SKIP_WAITING ke semua worker",
      "Pembaruan badge Sidebar & Floating Update Widget agar langsung aktif mendeteksi rilis baru di seluruh perangkat"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.50",
    "versionCode": 310,
    "buildDate": "3 November 2026",
    "buildHash": "wms-261103-v310-0739",
    "releaseTitle": "WMS v2.6.50 — Full 2-Way Sync & Auto-Reconcile Google Calendar",
    "releaseNotes": [
      "Otomasi sinkronisasi 2-arah Google Calendar & WMS: Polling 45 detik saat tab aktif & auto-sync saat tab browser difokuskan kembali",
      "Perbaikan end date all-day event Google Calendar agar tidak bergeser 1 hari",
      "Pembersihan otomatis metadata tag dari deskripsi agenda",
      "Sinkronisasi perubahan judul, tanggal, jam, lokasi, deskripsi dari Google Calendar ke WMS",
      "Deteksi dan pembersihan event yang dihapus di Google Calendar",
      "Notifikasi visual toast status sinkronisasi Google Calendar saat simpan dan hapus agenda"
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
