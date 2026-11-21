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
  "version": "v2.24.2",
  "versionCode": 442,
  "buildDate": "21 November 2026",
  "buildHash": "wms-261121-v442-0614",
  "releaseTitle": "WMS v2.24.2 — Live Chat Full-Screen Edge-to-Edge",
  "releaseNotes": [
    "Menghapus seluruh margin pinggir, padding ganda, dan bingkai kartu pada Live Chat agar tampil full-screen edge-to-edge seperti aplikasi chat asli di seluler maupun desktop",
    "Ruang percakapan aktif di seluler kini tampil layar penuh (menutupi bilah navigasi bawah & header ganda) dengan safe-area top/bottom",
    "Proporsi panel chat desktop diperluas (sidebar 25% & area chat 75% di layar xl+) serta dukungan edge-to-edge penuh di Panel Pendamping"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.24.1",
    "versionCode": 441,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v441-0546",
    "releaseTitle": "WMS v2.24.1 — Optimasi Tabel, Filter & Sort Stok Produk",
    "releaseNotes": [
      "Menghapus 4 kartu ringkasan KPI pada tab Stok Produk (sudah tersedia di Dashboard Kapasitas) agar tabel langsung tampil penuh di seluler maupun desktop",
      "Menambahkan filter Status Stok (Ada Stok, Fisik > 0, DP > 0 Fisik 0, Stok Minus, Semua Master), filter Size master, dropdown Urutkan, dan tombol Reset filter",
      "Merapikan toolbar seluler bergaya aplikasi (aksi sekunder kolapsibel & swipe horizontal) serta memperluas tinggi area tabel stok produk"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.24.0",
    "versionCode": 440,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v440-1215",
    "releaseTitle": "WMS v2.24.0 — Modul CSV Barcode & CSV Distribusi",
    "releaseNotes": [
      "Tambah modul CSV Barcode (export CSV DealPOS per outlet/lokasi + ZIP + cetak stiker 50x20/104x20mm & ceklis A4)",
      "Tambah modul CSV Distribusi (import multi-file Excel Reguler & Back In Stock, kartu store 2-baris, Gudang Awal balance check, & ZIP per batch)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.5",
    "versionCode": 435,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v435-0112",
    "releaseTitle": "WMS v2.23.5 — Native Mobile App Shell (Bottom Tab Bar & App Launcher Sheet)",
    "releaseNotes": [
      "Ubah navigasi seluler (< 1024px) dari hamburger drawer ala web menjadi Fixed Bottom Tab Bar (4 pintasan peran/kustom + tab Menu) dan Native App Launcher Bottom Sheet dengan grid ikon 4 kolom, kustomisasi tab bawah, & grouped settings",
      "Sederhanakan Mobile Top App Bar menjadi Avatar + Judul Halaman + Bell/AI, serta amankan offset Dock & Kapasitas Rak di atas Bottom Tab Bar (Desktop tetap utuh)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.4",
    "versionCode": 434,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v434-0038",
    "releaseTitle": "WMS v2.23.4 — Modern Native Mobile Drawer (Opsi C)",
    "releaseNotes": [
      "Ubah Mobile Drawer menjadi gaya aplikasi seluler native: Kartu Profil di atas, 4 Control Center Tiles (Notif/Tema/Update/Sistem), Cari Menu Cepat, Pin Favorit lokal, grup lipat Operasional/HR, & gesture swipe kiri",
      "Pertahankan Sidebar Desktop Auto-Hide/Pin tetap konsisten dan tambahkan safe-area bottom footer untuk tombol App & Keluar Akun"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.3",
    "versionCode": 433,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v433-0013",
    "releaseTitle": "WMS v2.23.3 — Rangkuman 1 Baris & Nama Produk + Size Sejajar di Pengecekan SJ",
    "releaseNotes": [
      "Padatkan Rangkuman Pengecekan SJ menjadi 1 baris 3 kolom (Total SJ",
      "Total Scan",
      "Total Selisih) untuk Seluler & Desktop serta filter cepat di header Komparasi",
      "Gabungkan Nama Produk dan Size menjadi 1 baris sejajar pada Kartu Item Mobile, Tabel Desktop, dan Riwayat SJ"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.2",
    "versionCode": 432,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v432-2358",
    "releaseTitle": "WMS v2.23.2 — Renovasi Tampilan Seluler & Ergonomi App-Shell Pengecekan SJ & Riwayat",
    "releaseNotes": [
      "Renovasi menyeluruh Tab Pengecekan SJ & Tab Riwayat agar tampil seperti aplikasi seluler native (Segmented Controls, Draft Carousel, Kartu Item Mobile bebas scroll horizontal, Filter lipat)",
      "Sticky Bottom Selection Dock & 2 Native Bottom Action Sheets untuk aksi massal dan menu kartu SJ dengan tombol netral Anti-Pelangi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.1",
    "versionCode": 431,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v431-1622",
    "releaseTitle": "WMS v2.23.1 — Kontrol Eksplisit Dispatched, Sub-Tab SELESAI & Anti-Duplikat 2 Arah",
    "releaseNotes": [
      "Opsi masuk Dispatched saat Submit/Bulk Submit/Edit ke SELESAI kini eksplisit dengan default OFF (tanpa automasi diam-diam)",
      "Pause-on-Edit: alert & nonaktifkan sementara status Dispatched saat SJ SELESAI diedit, lalu tawarkan masuk kembali saat Simpan",
      "Sub-tab status pengiriman di Riwayat SELESAI (Belum Jadwal Kirim, Dispatched, Terkirim, Batal Kirim) + Select All/Unselect & aksi massal",
      "Arsip SJ lama ke Terkirim tersimpan di Supabase wms_system_docs tanpa membuat data trip palsu di Pengiriman Store",
      "Anti-duplikat No SJ 2 arah: tabrakan No SJ di Pengiriman Store maupun Pengecekan SJ otomatis menggabungkan & melengkapi data tanpa kartu kembar"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.0",
    "versionCode": 430,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v430-1407",
    "releaseTitle": "WMS v2.23.0 — Over-Scan Alert Pengecekan SJ & Auto-Sync Pengiriman Store Dispatched",
    "releaseNotes": [
      "Suara & panel peringatan otomatis di Pengecekan SJ saat qty scan melebihi Qty SJ (berdampingan dengan item Di Luar SJ)",
      "Auto-sync SJ Pengiriman status SELESAI ke Pengiriman Store Dispatched dengan estimasi 1 koli = 40 pcs & penyesuaian cepat koli aktual",
      "Auto-tarik dari antrean Dispatched saat status Riwayat SJ diturunkan ke PENDING atau dihapus (aman untuk data sudah terkirim)",
      "Tambahan guardrail skill & rule GEMINI.md §17 untuk konsistensi pembaruan jangka panjang"
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
