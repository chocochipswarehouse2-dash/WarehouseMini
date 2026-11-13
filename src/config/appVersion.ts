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
  "version": "v2.11.10",
  "versionCode": 320,
  "buildDate": "13 November 2026",
  "buildHash": "wms-261113-v320-0638",
  "releaseTitle": "WMS v2.11.10 — Perbaikan VLOOKUP Size Master Produk (F25GBG278BNL/BNS & Akhiran Warna + S/M/L)",
  "releaseNotes": [
    "Menghapus override heuristik isCorruptedColorCodeSize terhadap data resmi master_produk sehingga SKU seperti F25GBG278BNL (L) dan F25GBG278BNS (S) tampil akurat sesuai database",
    "Memperbaiki batas 1.000 baris PostgREST pada Delta Sync master_produk dan menaikkan versi IndexedDB ke v7 agar cache lokal tersinkronisasi 100%"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.11.9",
    "versionCode": 319,
    "buildDate": "13 November 2026",
    "buildHash": "wms-261113-v319-0143",
    "releaseTitle": "WMS v2.11.9 — Minimize Background Update Database & Notifikasi Eksklusif Warehouse",
    "releaseNotes": [
      "Fitur Update Database Master (CSV) kini dapat di-minimize ke latar belakang saat proses upload berjalan tanpa menghalangi aktivitas menu lain",
      "Indikator mengambang (Floating Progress Widget) di pojok kanan bawah menampilkan progres persentase, jumlah SKU, dan tombol Buka Detail",
      "Notifikasi selesai Update Database (Toast, Notification Hub & Push Notification) dikunci eksklusif hanya untuk akun utama Warehouse"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.8",
    "versionCode": 318,
    "buildDate": "13 November 2026",
    "buildHash": "wms-261113-v318-0759",
    "releaseTitle": "WMS v2.11.8 — Fix Import Master CSV Verbatim & Hemat Egress",
    "releaseNotes": [
      "UpdateDatabaseModal kini menyimpan size CSV DealPOS apa adanya (menutup sumber data karangan A->ALL, B->XS, G->XXL)",
      "Pertahankan nilai Default apa adanya di Retur, Manual Shipment, Distribusi, dan AI",
      "Optimasi egress: naikkan ambang logGap ke 2000, batasi select picking_list ke 800 baris, dan longgarkan interval polling"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.7",
    "versionCode": 317,
    "buildDate": "13 November 2026",
    "buildHash": "wms-261113-v317-0735",
    "releaseTitle": "WMS v2.11.7 — Size & Nama Produk Murni dari Master + Delta Sync Master",
    "releaseNotes": [
      "Size dan nama produk di semua modul kini VLOOKUP persis nilai master_produk (Default tetap Default, ALL tetap ALL)",
      "Hapus semua tebakan size dari SKU (regex)",
      "Merge katalog: master selalu menimpa cache lama",
      "Delta sync master_produk berbasis updated_at (hemat egress)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.6",
    "versionCode": 316,
    "buildDate": "12 November 2026",
    "buildHash": "wms-261112-v316-1940",
    "releaseTitle": "WMS v2.11.6 — Penegakan Mutlak VLOOKUP Master Produk di Manual Shipment & Resolusi Retur",
    "releaseNotes": [
      "Eliminasi fallback size lokal ke Master Produk VLOOKUP murni",
      "Pembersihan data items di 17 order manual_shipment dan 7 tiket retur"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.5",
    "versionCode": 315,
    "buildDate": "12 November 2026",
    "buildHash": "wms-261112-v315-1331",
    "releaseTitle": "WMS v2.11.5 — Sanitasi Menyeluruh Size Kode Warna (YL/OL/CM) di Seluruh Sistem & Master DB",
    "releaseNotes": [
      "Pembersihan 7.020 data master_produk dari pseudo-size kode warna",
      "Runtime guard isCorruptedColorCodeSize di Inventory, Katalog, dan Lookup"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.4",
    "versionCode": 314,
    "buildDate": "12 November 2026",
    "buildHash": "wms-261112-v314-1247",
    "releaseTitle": "WMS v2.11.4 — Sinkronisasi Otomatis Nama Produk Pesanan Store & Koreksi Tiket Alteration Taylor Pants",
    "releaseNotes": [
      "Penyelarasan otomatis nama & size produk pada Pesanan Store (Split, Tabel, Kartu) dengan Master Produk via lookupProductBySku",
      "Koreksi data tiket AR-BY -261108-P8Z5 di database Supabase menjadi Taylor Pants Denim Blue"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.3",
    "versionCode": 313,
    "buildDate": "12 November 2026",
    "buildHash": "wms-261112-v313-1152",
    "releaseTitle": "WMS v2.11.3 — WMS vNEXT — Audit Lookup Produk: Master Produk Final, Larang Tebakan Size/Nama dari SKU",
    "releaseNotes": [
      "Fix size salah akibat tebakan akhiran SKU (YL/OL/EM = kode warna, bukan size)",
      "Fix nama varian salah akibat tebakan prefix SKU saudara",
      "Form Alter & Repair kini menyelaraskan nama/size ke Master Produk saat pilih dan simpan",
      "Rule + Skill baru wms-product-lookup-integrity"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.2",
    "versionCode": 312,
    "buildDate": "11 November 2026",
    "buildHash": "wms-261111-v312-2251",
    "releaseTitle": "WMS v2.11.2 — Auto-Sync Notification Hub dari OS Notification Tray, Service Worker & Supabase",
    "releaseNotes": [
      "Sinkronisasi Otomatis OS Notification Tray: Menarik seluruh notifikasi yang sedang tampil di panel notifikasi HP/Desktop (reg.getNotifications()) langsung ke dalam Notification Hub",
      "Live Backfill Supabase Sesuai Role: Saat aplikasi dimuat atau Notification Hub dibuka, sistem otomatis menarik riwayat notifikasi terbaru (Lembur/Ijin/Cuti, Pesanan Store, Tugas Picking, SPS, Retur CS, Hitung Ulang, & Live Chat) yang sesuai dengan hak akses akun",
      "Jembatan Service Worker Background (WMS_SW_NOTIFICATION_FIRED): Notifikasi yang masuk saat layar HP mati / aplikasi di background kini langsung tersimpan ke Notification Hub dan popup OS otomatis tertutup setelah 10 detik"
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
