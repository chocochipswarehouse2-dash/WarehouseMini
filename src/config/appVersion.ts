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
  "version": "v2.6.38",
  "versionCode": 298,
  "buildDate": "2 November 2026",
  "buildHash": "wms-261102-v298-0020",
  "releaseTitle": "WMS v2.6.38 — Mode Presentasi 3D & Panduan Interaksi Rak",
  "releaseNotes": [
    "Menambahkan mode presentasi fullscreen 3D dengan tur 360° dan panduan lengkap edit, geser, serta ubah ukuran rak"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.6.36",
    "versionCode": 296,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v296-2222",
    "releaseTitle": "WMS v2.6.36 — Perbaikan Visual 3D & Kapasitas Rak",
    "releaseNotes": [
      "Memperbaiki inisialisasi gedung 4 lantai pada visual 3D",
      "Memperbaiki urutan parameter computeAllRackSlots agar kapasitas live WMS tersinkron sempurna"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.35",
    "versionCode": 295,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v295-1554",
    "releaseTitle": "WMS v2.6.35 — Tab 3D Visual Kapasitas Gudang di Inventory",
    "releaseNotes": [
      "Menambahkan tab baru 3D Visual Kapasitas pada halaman Inventory (5 tab terpadu)",
      "Integrasi penuh Perancang Gudang 3D (4 Lantai, 92 aset awal) dengan stok & kapasitas rak Gudang WMS secara real-time",
      "Fitur Mode Heatmap 3D Live (Hijau/Kuning/Merah), Auto-Map kode rak WMS (A/B/C/D, Koli R/V/Z, Studio), dan Simpan Layout ke Cloud"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.34",
    "versionCode": 294,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v294-2218",
    "releaseTitle": "WMS v2.6.34 — Perbaikan Pesanan Saya (MessageSquare) & Live Chat Order Card",
    "releaseNotes": [
      "Perbaiki error MessageSquare is not defined pada tab Pesanan Saya",
      "Rapikan order context card dan autocomplete mention pada Live Chat"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.33",
    "versionCode": 293,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v293-1448",
    "releaseTitle": "WMS v2.6.33 — Tabel Riwayat Peminjaman & Tanggal Kembali + Integrasi 3 Tab Cetak Label & Barcode",
    "releaseNotes": [
      "Riwayat Peminjaman (SPS) kini dilengkapi tampilan Tabel proporsional (selain Kartu & Panel Rapi), filter KPI interaktif, ekspor CSV, serta pencatatan Rencana & Tanggal Kembali Aktual beserta durasi pinjam dan catatan pengembalian.",
      "Halaman Cetak kini disatukan menjadi 1 menu 'Cetak Label & Barcode' dengan 3 tab rapi: QR Prefix, Label Paket, dan Cetak Barcode.",
      "Tampilan tab QR Prefix dirapikan total menjadi layout 2 kolom (Generator & Antrean di kiri, Pratinjau Stiker & Kustomisasi di kanan) tanpa duplikasi header bertumpuk."
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.32",
    "versionCode": 292,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v292-1417",
    "releaseTitle": "WMS v2.6.32 — Konsolidasi 4 Tab Inventory (Termasuk Scanner Barcode) & 4 Tab Loading Dock (Termasuk Tugas Picking)",
    "releaseNotes": [
      "Integrasi Scanner Barcode dan Log Produk ke dalam 4 Tab halaman Inventory (menghilangkan duplikasi menu Scanner",
      "LOG)",
      "Integrasi Tugas Picking sebagai tab ke-4 di halaman Loading Dock (Penerimaan, Pengiriman, Transfer Order, Tugas Picking)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.31",
    "versionCode": 291,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v291-1347",
    "releaseTitle": "WMS v2.6.31 — Penambahan Kolom Stok pada Tabel Log Produk di Detail Inventory",
    "releaseNotes": [
      "Penambahan kolom Stok (saldo stok rak saat transaksi) pada tabel dan kartu Log Produk di modal Detail Produk Inventory agar identik dengan tabel Log Produk utama"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.30",
    "versionCode": 290,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v290-1336",
    "releaseTitle": "WMS v2.6.30 — Redesain Scanner | Log Produk & Tampilan Tabel Log Produk di Detail Inventory",
    "releaseNotes": [
      "Perubahan nama Histori Mutasi & Mutasi menjadi Log Produk di seluruh aplikasi",
      "Penambahan tampilan Tabel (Table View) pada Log Produk di modal Detail Produk Inventory seperti pada halaman Scanner",
      "Log Produk",
      "Redesain tombol tab atas Scanner",
      "Log Produk menjadi lebih proporsional disertai 3 opsi tata letak (Panel Rapi, Tabel, Ringkas)"
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
