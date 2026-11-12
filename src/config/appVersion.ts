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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.11.1",
    "versionCode": 311,
    "buildDate": "11 November 2026",
    "buildHash": "wms-261111-v311-1435",
    "releaseTitle": "WMS v2.11.1 — Isolasi Ketat Notifikasi Tepat Sasaran Per Role & Hak Akses",
    "releaseNotes": [
      "Akun Store: Hanya menerima notifikasi Pesanan / Manual Shipment / Alterasi milik store sendiri & Live Chat",
      "Akun Karyawan / Picker: Hanya menerima notifikasi Tugas Picking, pengajuan & status Ijin/Cuti/Lembur milik dirinya sendiri (tidak menerima pengajuan karyawan lain), & Live Chat",
      "Akun Khusus Sesuai Role Akses (SPS / CS / Produksi): Hanya menerima notifikasi sesuai modul aksesnya (SPS hanya Peminjaman SPS, CS hanya Retur Pusat Resolusi & Chat, Produksi hanya Hitung Ulang Kargo/CMT)",
      "Admin & Warehouse: Admin dikecualikan dari seluruh notifikasi HR (Ijin/Cuti/Lembur); pengajuan HR karyawan baru hanya masuk ke akun Warehouse",
      "Perbaikan bug fallback permission Operator & pembersihan otomatis riwayat Notification Hub yang tidak relevan dengan role akun aktif"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.0",
    "versionCode": 310,
    "buildDate": "11 November 2026",
    "buildHash": "wms-261111-v310-1234",
    "releaseTitle": "WMS v2.11.0 — Ekspor Laporan AI (PDF & Excel) & Notification Hub (Popup Auto-Hide 10 Detik)",
    "releaseNotes": [
      "Fitur Ekspor Laporan AI ke Excel (.xlsx) & PDF (.pdf): AI kini memiliki skill generate_exportable_report untuk membuat laporan data stok, DealPOS, maupun penerimaan CMT/Kargo dalam bentuk file Excel (.xlsx) atau PDF (.pdf), ditambah tombol download 1-klik otomatis di setiap tabel AI",
      "Notification Hub Terpusat (🔔): Seluruh notifikasi relevan sesuai role akun tersimpan otomatis di Notification Hub pada bar atas (Mobile & Desktop) dengan filter Belum Dibaca vs Semua, fitur Mark All Read, dan klik langsung menuju halaman/pesanan/ruang chat tujuan",
      "Popup Notifikasi Auto-Hide 10 Detik: Semua popup notifikasi melayang (Toast, Banner Pesanan Baru, Banner Picking, dan OS Push Notification) kini otomatis menutup sendiri setelah 10 detik agar tidak menghalangi layar kerja"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.10.2",
    "versionCode": 302,
    "buildDate": "11 November 2026",
    "buildHash": "wms-261111-v302-1033",
    "releaseTitle": "WMS v2.10.2 — Audit & Perbaikan Akurasi Data DealPOS & Stok Fisik per Ukuran di AI",
    "releaseNotes": [
      "Pemisahan Ketat Nama Produk vs Size (S/M/L/XL/ALL): Mencegah AI menjumlahkan DealPOS lintas ukuran atau mencampur produk lain yang memiliki kata warna/size serupa (seperti Zilva Top White M & Posy Dress Blue S)",
      "Sinkronisasi Live dealpos_channels & Rumus Resmi InventoryModel: Pengambilan data DealPOS di AI kini mengambil langsung dealpos_channels terbaru dari tabel master_produk Supabase dan menggunakan rumus resmi Inventory (MAP + LIVE + STUDIO)",
      "Format Lokasi Rak Lengkap Tanpa Singkatan dll.: AI wajib menampilkan seluruh kode rak beserta jumlah pcs secara utuh tanpa menyingkat dengan kata dll."
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.10.1",
    "versionCode": 301,
    "buildDate": "11 November 2026",
    "buildHash": "wms-261111-v301-0529",
    "releaseTitle": "WMS v2.10.1 — Konfirmasi Kode Produksi Mirip (6612 vs 6612-1) & Lampiran Foto Produk Trello di Chat AI",
    "releaseNotes": [
      "Konfirmasi Kode Produksi Mirip di AI: Jika pengguna menyebutkan kode seperti 6612 namun di Trello UP hanya ada kode varian/mirip seperti 6612-1, AI tidak langsung auto-match diam-diam melainkan bertanya terlebih dahulu kepada pengguna",
      "Lampiran Kartu Foto Produk Trello UP di Chat AI: Saat AI bertanya konfirmasi kode mirip (maupun saat cek kode produksi), AI otomatis melampirkan Kartu Foto Produk Trello di gelembung chat lengkap dengan fitur klik perbesar (Zoom Lightbox) dan tombol 1-klik 'Ya, Pakai Kode 6612-1'"
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
