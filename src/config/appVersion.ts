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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.6.49",
    "versionCode": 309,
    "buildDate": "3 November 2026",
    "buildHash": "wms-261103-v309-0701",
    "releaseTitle": "WMS v2.6.49 — Pengaturan Khusus Owner, Filter User & Notifikasi Picking Background",
    "releaseNotes": [
      "Batasi akses Pengaturan Sistem, Update Database & Migrasi Supabase khusus akun @warehouse/pemilik",
      "Hapus akun dummy default dari kode & hapus filter localStorage",
      "Urutkan daftar pengguna berdasarkan hierarki role dan urutan NIK (Vina Kharisma WH0006 langsung terlihat rapi)",
      "Tambahkan search filter & tab role filter di Manajemen Pengguna",
      "Tambahkan delta polling background untuk antrean picking_list agar operator tetap dapat notifikasi saat WebSocket suspend",
      "Perjelas tombol Notifikasi Perangkat untuk semua pengguna"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.46",
    "versionCode": 306,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v306-1827",
    "releaseTitle": "WMS v2.6.46 — Optimasi Loading Riwayat Pengecekan Surat Jalan & SWR Fast Cache",
    "releaseNotes": [
      "Optimasi query pengecekan_sj Supabase dari 45 detik menjadi di bawah 1 detik",
      "Menerapkan Stale-While-Revalidate agar riwayat surat jalan langsung tampil instan tanpa spinner macet"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
