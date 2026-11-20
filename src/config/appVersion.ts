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
  "version": "v2.22.10",
  "versionCode": 430,
  "buildDate": "20 November 2026",
  "buildHash": "wms-261120-v430-2023",
  "releaseTitle": "WMS v2.22.10 — Tambah Filter Kategori Tugas Picking",
  "releaseNotes": [
    "Tambahkan filter kategori Semua, Pengiriman Store, Order, SPS, Manual shipment/alter, Retur, dan Keranjang Order di PickingTasksView"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.22.9",
    "versionCode": 429,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v429-1909",
    "releaseTitle": "WMS v2.22.9 — Perbaiki Pendaftaran Web Push (Notifikasi saat PWA Ditutup)",
    "releaseNotes": [
      "Deteksi & perbaiki langganan push dengan kunci VAPID lama/rusak lalu daftar ulang otomatis",
      "Segarkan pendaftaran push setiap aplikasi dibuka kembali dari background",
      "Tampilkan alasan jika notifikasi saat aplikasi ditutup gagal diaktifkan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.22.8",
    "versionCode": 428,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v428-1736",
    "releaseTitle": "WMS v2.22.8 — Dukung Copy-Paste Gambar Screenshot di Fitur AI",
    "releaseNotes": [
      "Tambahkan handler onPaste pada input chat WmsAiModal agar gambar hasil screenshot (Ctrl+V / Paste) langsung terlampir ke AI"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.22.7",
    "versionCode": 427,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v427-1717",
    "releaseTitle": "WMS v2.22.7 — Perbaiki Sinkronisasi Katalog PWA HP & Validasi Scan Kamera",
    "releaseNotes": [
      "Deteksi otomatis katalog IndexedDB tidak lengkap via count=exact di syncSmartLowEgressCache agar jumlah anomali & master SKU di PWA HP sama persis dengan Laptop",
      "Tambahkan fallback verifikasi SKU live ke Supabase dan sanitasi karakter tak terlihat pada scan kamera HP"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.22.6",
    "versionCode": 426,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v426-1652",
    "releaseTitle": "WMS v2.22.6 — Mode Ringkas Tugas Picking saat Scanner/Kamera",
    "releaseNotes": [
      "Sembunyikan input qty manual saat mode input Scanner Fisik atau Kamera di Tugas Picking, tampilkan list ringkas Nama, Size, SKU, Lokasi, dan Qty"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.22.5",
    "versionCode": 425,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v425-1559",
    "releaseTitle": "WMS v2.22.5 — Dukung Range & Multi Rak pada Edit Spesifik Rak",
    "releaseNotes": [
      "Tambahkan parser range (A001-A010) dan multi rak (A001, B005) dengan live preview target pada tab Edit Spesifik Rak di Setup Kapasitas"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.22.4",
    "versionCode": 424,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v424-1552",
    "releaseTitle": "WMS v2.22.4 — Rapikan Tabel 1-Baris di Workspace Tugas Putaway",
    "releaseNotes": [
      "Tampilkan Nama Produk, Size, SKU & Asal, Qty, serta tombol aksi dalam 1 baris tabel rapi pada tampilan desktop di PutawayWorkspaceModal"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.22.3",
    "versionCode": 423,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v423-1516",
    "releaseTitle": "WMS v2.22.3 — Perbaiki Filter Zona Aksesoris/Belt & Loop Notifikasi Update",
    "releaseNotes": [
      "Perbaiki filter zona di RackCapacityDashboard agar klik kartu Area Aksesoris/Belt/Transit/Blok F/Perbaikan menampilkan rak dengan benar",
      "Tambahkan cooldown guard 30s di appUpdateService agar banner Mempersiapkan pembaruan tidak berulang saat CDN/SW sinkronisasi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.22.2",
    "versionCode": 422,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v422-1430",
    "releaseTitle": "WMS v2.22.2 — Buka Form Panggil Putaway dari Dashboard Utama",
    "releaseNotes": [
      "Klik shortcut Tugas Putaway di Dashboard Utama langsung membuka PutawayCreateModal beserta panel Manajemen Tugas Putaway"
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
