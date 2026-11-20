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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.22.1",
    "versionCode": 421,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v421-1408",
    "releaseTitle": "WMS v2.22.1 — Tambah Form Panggil Tugas Putaway",
    "releaseNotes": [
      "Tambah modal PutawayCreateModal untuk memilih/mencari rak Transit (X) & Kolian (R/V/Z) atau SKU secara langsung",
      "Integrasikan tombol + Buat Tugas Putaway di panel Manajemen Tugas Putaway"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.22.0",
    "versionCode": 420,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v420-1301",
    "releaseTitle": "WMS v2.22.0 — Rekomendasi Stock Take Ulang & Reset Scan Data (Anomali, Minus & Lokasi Terkait)",
    "releaseNotes": [
      "Menambahkan mesin analisis & modal Rekomendasi Stock Take Ulang untuk mendeteksi lokasi stok minus, lokasi anomali, SKU rusak/mismatch, serta selisih DealPOS vs Fisik",
      "Secara otomatis melacak lokasi lain yang berkaitan (ripple-effect): rak lain yang menyimpan SKU bermasalah dan rak standar yang mirip dengan lokasi salah ketik/typo",
      "Terintegrasi 1-klik dengan Reset Scan Data (Kosongkan Rak Superadmin), Cetak Lembar Audit Stock Take A4, Salin Daftar WA, serta akses dari Inventori, Dashboard Kapasitas, dan Audit Anomali"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.21.2",
    "versionCode": 412,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v412-1244",
    "releaseTitle": "WMS v2.21.2 — Penegasan Garis Tabel Inventori",
    "releaseNotes": [
      "Mempertegas garis pembatas horizontal dan vertikal pada tabel Daftar Inventori (Desktop) agar lebih jelas dan mudah dibaca di Mode Terang maupun Gelap"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.21.1",
    "versionCode": 411,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v411-1216",
    "releaseTitle": "WMS v2.21.1 — Optimasi Notifikasi Live Chat Store Ops (Warehouse/Admin WH)",
    "releaseNotes": [
      "Notifikasi pop-up dan suara pada Live Chat Store Ops [MS & Alter] kini secara cerdas disesuaikan: pesan yang dikirim dari pihak Warehouse/Admin WH ke Store tidak lagi memunculkan notifikasi pop-up/chime pada perangkat Warehouse/Admin WH sendiri",
      "Warehouse/Admin WH hanya akan menerima notifikasi suara/pop-up jika ada pesan masuk atau form pesanan baru yang dikirim oleh Store",
      "Pembaruan kompatibilitas Service Worker pwa-extras.js dan liveChatService.ts untuk notifikasi pesan Store Ops"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.21.0",
    "versionCode": 410,
    "buildDate": "20 November 2026",
    "buildHash": "wms-261120-v410-0141",
    "releaseTitle": "WMS v2.21.0 — Shortcut Alat Bantu Kerja Dashboard & Tampilan Seluler Native Kapasitas Rak",
    "releaseNotes": [
      "Menambahkan bagian Shortcut Alat Bantu Kerja (26 pintasan operasional 1 klik) di halaman Dashboard lengkap dengan filter kategori, pencarian, badge live, dan kontrol izin",
      "Merombak tampilan seluler Dashboard Kapasitas menjadi gaya aplikasi seluler native (Circular Ring KPI, swipe area rail, Daftar vs Peta 3 kolom, Filter & Detail Rak Bottom Sheet, serta Bottom Action Dock di zona ibu jari)",
      "Menambahkan deep-link langsung ke modal/panel Relokasi Rak, Tugas Putaway, Rekomendasi Pindah, Kosongkan Rak, Impor Excel, Ekspor Isi Lokasi, dan Stock Opname"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.20.7",
    "versionCode": 407,
    "buildDate": "19 November 2026",
    "buildHash": "wms-261119-v407-2222",
    "releaseTitle": "WMS v2.20.7 — Rapikan Pengiriman Store (Input, Dispatched, Kirim & Histori)",
    "releaseNotes": [
      "Sederhanakan Form Input Pengiriman Store (gabung Deskripsi & Keterangan menjadi 1 kolom efisien)",
      "Pindahkan Dokumentasi Pengiriman Keseluruhan dari Form Input ke Tab Proses Kirim (tersimpan ke Supabase)",
      "Rapikan tampilan 4 tahap (Input, Dispatched, Kirim, Histori Kirim) responsif Desktop & HP Seluler",
      "Perbaiki bug banner filter toko kosong pada tab Dispatched & tambah ringkasan antrean per toko"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
