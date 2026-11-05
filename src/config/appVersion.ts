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
  "version": "v2.6.61",
  "versionCode": 321,
  "buildDate": "5 November 2026",
  "buildHash": "wms-261105-v321-1108",
  "releaseTitle": "WMS v2.6.61 — Checklist & Drag-Drop pada Catatan serta Tinggi Baris Fleksibel Kalender",
  "releaseNotes": [
    "Tambah fitur Checkbox / Checklist interaktif pada Sticky Notes (bisa dicentang langsung di kartu maupun di modal)",
    "Dukungan Drag & Drop (geser posisi kartu) untuk mengurutkan Catatan sesuai keinginan",
    "Baris minggu pada Kalender Bulanan kini otomatis memanjang fleksibel menampilkan seluruh agenda tanpa disembunyikan di balik +1 lagi"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.60",
    "versionCode": 320,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v320-1726",
    "releaseTitle": "WMS v2.6.60 — Live Chat Ala WhatsApp: Kamera, Enter HP, iPhone & Badge",
    "releaseNotes": [
      "Tombol Kamera langsung (Android/iPhone) selain Galeri untuk lampiran foto chat.",
      "Perbaikan iPhone: tidak zoom saat mengetik, composer aman dari bar Safari, instruksi aktivasi notifikasi via Layar Utama.",
      "Enter di HP membuat baris baru (kirim lewat tombol), textarea auto-grow, tombol Balas/Edit/Hapus lebih mudah diketuk.",
      "Badge angka pesan belum dibaca pada ikon aplikasi (PWA)."
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.59",
    "versionCode": 319,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v319-1633",
    "releaseTitle": "WMS v2.6.59 — Audit & Perbaikan Total Live Chat (Chat CS1/CS2, Anti-Hilang Room & SW Sync)",
    "releaseNotes": [
      "Perbaikan pencarian rekan chat (CS1/CS2/chococs2) langsung dari tab Semua Chat maupun tab Rekan meskipun user sedang offline.",
      "Perbaikan race condition pembukaan chat 1-on-1 baru (0ms aktivasi instan & proteksi grace window 20 detik dari background sync).",
      "Perbaikan bug Service Worker (pwa-extras.js) yang sebelumnya mengosongkan riwayat pesan saat klik Tandai Dibaca / Balas Cepat dari notifikasi.",
      "Penambahan template hak akses default role Customer Service dan normalisasi profil CS 1 & CS 2."
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
