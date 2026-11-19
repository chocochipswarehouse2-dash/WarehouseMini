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
  "version": "v2.20.6",
  "versionCode": 406,
  "buildDate": "19 November 2026",
  "buildHash": "wms-261119-v406-2102",
  "releaseTitle": "WMS v2.20.6 — Fix Progres Picking Offline Hilang Saat Kembali Online",
  "releaseNotes": [
    "Tambah antrean sinkronisasi per-item offline (wms_picking_item_sync_queue_v1) agar scan/qty saat offline tidak hilang",
    "Cegah data server usang menimpa progres SKU lokal yang belum tersinkron saat koneksi kembali online",
    "Sinkronkan otomatis progres item offline ke Supabase lebih dulu sebelum refresh realtime & dukung multi-picker keroyokan",
    "Serialisasi update per-SKU agar tap cepat +1/+1 atau sinyal putus-nyambung tidak bentrok"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.20.5",
    "versionCode": 405,
    "buildDate": "19 November 2026",
    "buildHash": "wms-261119-v405-1856",
    "releaseTitle": "WMS v2.20.5 — Hapus Fallback Palsu A-01 & Redesign Mobile-First Kartu Picking",
    "releaseNotes": [
      "Hapus semua fallback lokasi palsu A-01/A001 di Picking, Refill & Supabase serta bersihkan 5 baris aktif",
      "Tampilkan badge STOK KOSONG (0) saat stok gudang 0 pcs agar tidak menyesatkan picker",
      "Desain ulang kartu item Tugas Picking 3-zona Mobile-First (Header Rak & AMBIL PCS, Body Nama Produk Besar + Kotak SIZE, Footer tombol besar 1-tangan)",
      "Tambahkan label jelas Kosong/Reset/Edit di tampilan HP Seluler agar mudah dipahami"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.20.4",
    "versionCode": 404,
    "buildDate": "19 November 2026",
    "buildHash": "wms-261119-v404-1833",
    "releaseTitle": "WMS v2.20.4 — Rapikan Kartu Tugas Picking & Anti-Rancu Qty Stok Rak",
    "releaseNotes": [
      "Ubah label stok rak di Tugas Picking menjadi (stok N) agar tidak rancu dengan qty ambil",
      "Rapikan tata letak kartu item picking (Produk, SKU, Rak sejajar; Target Ambil menyatu dengan Counter)",
      "Terapkan hierarki tombol Anti-Pelangi (1 tombol solid Maks + aksi sekunder outline seragam) & responsif HP/Desktop",
      "Hapus duplikasi teks qty stok pada pilihan cepat rak di modal Edit Item Picking"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.20.3",
    "versionCode": 403,
    "buildDate": "19 November 2026",
    "buildHash": "wms-261119-v403-1741",
    "releaseTitle": "WMS v2.20.3 — Fix Cache Foto Trello & Anti-429 Throttling",
    "releaseNotes": [
      "Fix cache lokal menimpa gdrive_image_url terbaru dari Supabase saat sinkronisasi Trello",
      "Tambah IntersectionObserver + antrean maks 10 foto serentak untuk mencegah rate-limit 429 Google Drive",
      "Tambah auto-retry bertahap (GDrive -> Thumbnail -> Proxy Trello) sebelum menampilkan No Photo",
      "Sinkronkan pembaruan foto cloud otomatis ke tampilan Trello tanpa perlu reload manual"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.20.2",
    "versionCode": 402,
    "buildDate": "19 November 2026",
    "buildHash": "wms-261119-v402-1552",
    "releaseTitle": "WMS v2.20.2 — Fix Foto Trello Anti-CORS & Auto-Backup Google Drive",
    "releaseNotes": [
      "Tambah proxy serverless Vercel /api/trello-image untuk foto Trello bebas CORS",
      "Upgrade auto-backup foto Trello via server GAS (trelloImageUrl) & fallback proxy",
      "Sinkronisasi 18 foto tertunda (termasuk UP 340) ke Google Drive & paginasi penuh Supabase",
      "Reset otomatis backup GDrive saat cover kartu Trello diganti & tombol backup cepat"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.20.1",
    "versionCode": 401,
    "buildDate": "19 November 2026",
    "buildHash": "wms-261119-v401-1450",
    "releaseTitle": "WMS v2.20.1 — Fix Putaway Realtime, Master Kargo Push/Urutan, Excel Hitung Ulang & Bubble Draft",
    "releaseNotes": [
      "Fix crash Putaway Realtime channel subscription (subscribePutawayRealtime singleton hub)",
      "Fix Push Sheet Master Kargo Hitung Ulang tanggal 18 & auto-heal cloud recount_audit_results",
      "Urutan tabel Master Kargo/CMT & slot tanggal Terbaru -> Terlama + muat seluruh histori (>1000 baris)",
      "Export Excel Master Produksi lengkap dengan kolom Hitung Ulang & tab Rekap Hitung Ulang",
      "Fix floating bubble minimize Hitung Ulang agar tidak muncul terus-menerus setelah ditutup/disimpan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
