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
  "version": "v2.6.66",
  "versionCode": 326,
  "buildDate": "6 November 2026",
  "buildHash": "wms-261106-v326-0608",
  "releaseTitle": "WMS v2.6.66 — Penyempurnaan Responsif Mobile Multi-Modul & Sticky App Bar",
  "releaseNotes": [
    "Header Sticky Mobile App Bar dengan hamburger, brand dan status aktif",
    "Navigasi tab horizontal swipeable di modul Produksi",
    "Wadah fluid elastis tanpa limit margin di modul Picking"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.65",
    "versionCode": 325,
    "buildDate": "6 November 2026",
    "buildHash": "wms-261106-v325-0551",
    "releaseTitle": "WMS v2.6.65 — Audit Seluler & Integrasi Agenda Project pada Dashboard",
    "releaseNotes": [
      "Audit menyeluruh antarmuka seluler (HP) dengan grid 2x2 rapi, zero text overflow, dan header ramping",
      "Menggantikan indikator SO dengan integrasi Proyek Berjalan dan Jadwal Kerja Hari Ini/Terdekat",
      "Navigasi instan dari dashboard langsung ke tab Kalendar Kerja & Proyek Milestone"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.64",
    "versionCode": 324,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v324-2252",
    "releaseTitle": "WMS v2.6.64 — Renovasi Dashboard Utama Bento Grid & Zero-Egress Protection",
    "releaseNotes": [
      "Transformasi Dashboard Utama dari dummy data menjadi Bento Box Grid operasional real-time",
      "Implementasi arsitektur Ultra-Lean Zero-Egress dengan HTTP Head-Only count headers dan cache 15 menit melindungi kuota Supabase Free Tier",
      "Pusat antrean kerja gudang dan 5 mutasi live ledger terkini dengan pintasan modul langsung"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.63",
    "versionCode": 323,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v323-2135",
    "releaseTitle": "WMS v2.6.63 — Integrasi UI/UX Pro Max & Visual Hygiene",
    "releaseNotes": [
      "Integrasi skill UI/UX Pro Max dengan 80 visual styles dan design intelligence",
      "Pembersihan button hierarchy anti-pelangi pada Produksi Spreadsheet View",
      "Eliminasi container dead-zones pada Packing, Penerimaan, Pengiriman, dan Migration View"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.62",
    "versionCode": 322,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v322-1415",
    "releaseTitle": "WMS v2.6.62 — Fix Riwayat Log Audit Hitung Ulang & Sinkronisasi Cloud",
    "releaseNotes": [
      "Perbaikan modal Riwayat Audit Fisik yang kosong pada kode produksi yang sudah dihitung ulang (mis. 251061, 1027, 2430) akibat log sebelumnya hanya tersimpan di LocalStorage perangkat pembuat",
      "Sinkronisasi otomatis riwayat log hitung ulang ke Cloud Supabase (wms_system_docs: recount_history_logs_v1) agar tampil di semua perangkat",
      "Auto-Synthesize & Backfill riwayat log lengkap per varian (Warna, Size, Hitung Awal, Fisik, Selisih vs Awal, Selisih vs Nota Buyer, Putaran, & Petugas) dari hasil audit cloud & tabel penerimaan_produksi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
