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
  "version": "v2.6.45",
  "versionCode": 305,
  "buildDate": "2 November 2026",
  "buildHash": "wms-261102-v305-1724",
  "releaseTitle": "WMS v2.6.45 — Konsistensi Tombol Keranjang Tabel & Reposisi FAB Order Picking Bebas Tabrakan",
  "releaseNotes": [
    "Reposisi FAB Order Picking agar berdampingan rapi dengan Live Chat di desktop dan berjarak aman di mobile",
    "Menampilkan tombol keranjang secara konsisten di seluruh baris produk perbaikan dengan proteksi stok 0 pcs"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.44",
    "versionCode": 304,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v304-1712",
    "releaseTitle": "WMS v2.6.44 — Fix Props onAddToCart di InventoryDetailDrawer",
    "releaseNotes": [
      "Memperbaiki destructuring props onAddToCart di modal Audit Kartu SKU InventoryDetailDrawer agar tidak memicu ReferenceError"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.43",
    "versionCode": 303,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v303-1651",
    "releaseTitle": "WMS v2.6.43 — Proteksi Stok Kosong Keranjang Picking, Auto-Tambah Dropdown & Impor CSV Excel",
    "releaseNotes": [
      "Proteksi anti-crash dan pencegahan order picking untuk produk dengan stok fisik 0 pcs di gudang",
      "Pencarian cepat autocomplete langsung otomatis menambahkan produk ke keranjang tanpa klik ulang tombol tambah",
      "Dukungan penuh multi-lokasi rak per SKU dengan kalkulasi stok komersial terintegrasi",
      "Fitur baru Impor Massal CSV dan Excel serta tempel teks langsung ke dalam Keranjang Picking"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.42",
    "versionCode": 302,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v302-1616",
    "releaseTitle": "WMS v2.6.42 — Fitur Keranjang Belanja Order Picking di Modul Inventory",
    "releaseNotes": [
      "Tambah fitur Add to Cart Order Picking langsung dari tabel inventori dan drawer pencarian cepat",
      "Integrasi penuh ke 3 output: Kirim Tugas Picking App (invoice_picking), Broadcast WA Grup (Fonnte), dan Cetak A4"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.41",
    "versionCode": 301,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v301-1015",
    "releaseTitle": "WMS v2.6.41 — Proteksi Penolakan Duplikat File pada Sesi Upload Bersamaan",
    "releaseNotes": [
      "Otomatis menerima file pertama dan menolak file kedua jika 2 file SJ kembar diupload bersamaan",
      "Pesan peringatan transparan memunculkan nama file yang diterima dan file yang ditolak untuk mencegah data ganda"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.40",
    "versionCode": 300,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v300-1006",
    "releaseTitle": "WMS v2.6.40 — Blokir & Tolak Otomatis Import Duplikat Surat Jalan",
    "releaseNotes": [
      "Sistem otomatis menolak import file jika Nomor Surat Jalan sudah terdaftar di sistem (Riwayat Pending/Selesai atau Draft Aktif)",
      "Dialog peringatan penolakan lengkap dengan rincian status SJ lama dan opsi konfirmasi timpa khusus revisi resmi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.39",
    "versionCode": 299,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v299-0953",
    "releaseTitle": "WMS v2.6.39 — Proteksi Impor Duplikat SJ & Indikator Riwayat Pengecekan",
    "releaseNotes": [
      "Sistem otomatis mendeteksi impor file SJ ganda tanpa mendobelkan kuantitas (prinsip Replace terproteksi)",
      "Peringatan visual seketika dan badge '⚠️ Pernah Selesai' jika SJ yang diimpor sudah pernah tercatat di Riwayat Pengecekan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.38",
    "versionCode": 298,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v298-0020",
    "releaseTitle": "WMS v2.6.38 — Mode Presentasi 3D & Panduan Interaksi Rak",
    "releaseNotes": [
      "Menambahkan mode presentasi fullscreen 3D dengan tur 360° dan panduan lengkap edit, geser, serta ubah ukuran rak"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.37",
    "versionCode": 297,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v297-2239",
    "releaseTitle": "WMS v2.6.37 — Perbaikan LiveChat Icon & Typings",
    "releaseNotes": [
      "Menambahkan import icon Crown, LogOut, UserMinus yang hilang pada LiveChat",
      "Perbaikan type-safety dan pembersihan order context card",
      "Sinkronisasi integrasi cloud 3D Warehouse layout"
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
