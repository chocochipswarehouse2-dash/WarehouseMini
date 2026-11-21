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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.22.10",
    "versionCode": 430,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v430-2023",
    "releaseTitle": "WMS v2.22.10 — Tambah Filter Kategori Tugas Picking",
    "releaseNotes": [
      "Tambahkan filter kategori Semua, Pengiriman Store, Order, SPS, Manual shipment/alter, Retur, dan Keranjang Order di PickingTasksView"
    ],
    "minSupportedVersion": "v2.0.0"
  },
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
