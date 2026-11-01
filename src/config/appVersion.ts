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
  "version": "v2.6.25",
  "versionCode": 285,
  "buildDate": "1 November 2026",
  "buildHash": "wms-261101-v285-1831",
  "releaseTitle": "WMS v2.6.25 — Fluid Full-Width Layout & Anti-Dead Zones pada Zoom Out",
  "releaseNotes": [
    "Fluid Workspace Architecture: Eliminasi pembatas sempit max-w-7xl dan max-w-1600px di seluruh modul utama",
    "Dynamic Grid Scaling: Rak visual otomatis menambah kolom hingga 12-14 kolom saat zoom out atau widescreen",
    "Matriks Roster & Spreadsheet Lega: Kalender 31 hari dan tabel inventory kini memanfaatkan 100% lebar layar"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.24",
    "versionCode": 284,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v284-1052",
    "releaseTitle": "WMS v2.6.24 — Perbaikan Tampilan & Simpan Penuh Roster Shift Bulanan (1-31)",
    "releaseNotes": [
      "Perbaikan batas 1.000 baris Supabase PostgREST pada fetchRosterShiftList dengan auto-paginasi agar jadwal tanggal 06-31 selalu tampil utuh",
      "Optimasi batchSaveRosterShifts menggunakan bulk upsert atomik anti-bentrok ID untuk penyimpanan jadwal sebulan penuh dalam hitungan milidetik"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.23",
    "versionCode": 283,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v283-1037",
    "releaseTitle": "WMS v2.6.23 — Pola Reguler Shift Bulanan (Shift 1, Shift 2, Shift 3a/3b, Minggu Off) & Sticky Save Bar",
    "releaseNotes": [
      "Aturan baku Pola Reguler Bulanan: Libur Hari Minggu (OFF), Shift 1 (08:00-17:00), Shift 2 (09:00-18:00), serta Shift 3 otomatis memetakan Senin-Jumat ke 3a (12:00-21:00) dan Sabtu ke 3b (11:00-20:00)",
      "Tombol Simpan Data Shift tersedia di 4 posisi: Floating Bar Melayang di bawah layar, Header Utama, Generator Massal (Isi & Langsung Simpan), serta Footer Tabel",
      "Pengaturan, Generator, Template, dan Edit Shift dikunci ketat khusus Admin / Superadmin (Operator hanya Mode Tinjau / Read-Only)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.22",
    "versionCode": 282,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v282-0936",
    "releaseTitle": "WMS v2.6.22 — Matriks Spreadsheet Roster 1 Bulan Penuh (Multi-Karyawan & Kuas Shift Cepat)",
    "releaseNotes": [
      "Tampilan baru Matriks Sebulan (Tanggal 1-31 x Seluruh Karyawan) di menu Roster Shift tanpa perlu edit satu-satu atau import CSV",
      "Generator Massal 1 Bulan dengan fitur Bagi Hari Libur Bergilir Otomatis (Senin-Minggu merata antar staf), Rotasi Mingguan, dan Bagi 2 Tim",
      "Fitur Set Cepat 1 Bulan per baris karyawan (S1/S2/3A + Hari Off individu) serta Mode Kuas Klik & Geser (Drag Paint) di sel tanggal dengan 1-Klik Simpan Semua"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.21",
    "versionCode": 281,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v281-0903",
    "releaseTitle": "WMS v2.6.21 — Notifikasi OS HP Gaya WhatsApp (Pesanan & Live Chat) & Stock Opname Eksklusif di Pengaturan Sistem",
    "releaseNotes": [
      "Perbaikan Notifikasi OS HP (Android/iOS/Desktop) layaknya WhatsApp untuk Pesanan Baru Store, Tiket Retur, SPS, dan Live Chat (mendukung Balas Cepat & Tandai Dibaca langsung dari bar notifikasi HP)",
      "Registrasi otomatis Service Worker (/pwa-extras.js) di seluruh domain seluler dan pratinjau agar pop-up bar notifikasi sistem Android Chrome berjalan 100%",
      "Pemindahan modul Stock Opname dari menu Scanner",
      "LOG ke dalam Pengaturan Sistem khusus Superadmin serta perbaikan ikon ClipboardList"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.20",
    "versionCode": 280,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v280-1544",
    "releaseTitle": "WMS v2.6.20 — Mode Ringkas Baku & Kolom Saldo Stok Saat Mutasi (Log Produk)",
    "releaseNotes": [
      "Log Produk Mode Ringkas Baku: Transaksi dengan Invoice, SKU, dan Lokasi sama kini otomatis menjadi tampilan standar WMS (tanpa saklar on/off manual)",
      "Kolom Saldo Stok Real-Time: Menampilkan sisa stok fisik di rak pada detik mutasi terjadi (Running Balance) untuk verifikasi audit lapangan yang presisi",
      "Desain Responsif Desktop & Seluler: Tampilan tabel spreadsheet dengan proporsi fixed dan kartu mobile dengan dual tiles (Qty Mutasi & Stok Saat Itu)",
      "Harmonisasi Fitur Live Chat AI Studio: Posisi tombol floating seluler dan penyesuaian kontainer ruang obrolan terintegrasi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.19",
    "versionCode": 279,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v279-1459",
    "releaseTitle": "WMS v2.6.19 — Auto-Healing Endpoint GAS & Sinkronisasi Google Calendar",
    "releaseNotes": [
      "Auto-Healing Endpoint GAS: Menghubungkan Google Calendar WMS ke deployment aktif dan auto-sanitasi URL kadaluarsa",
      "Resolusi Sinkronisasi 2-Arah: Penarikan event Google Calendar sukses tanpa kendala Unauthorized",
      "Harmonisasi Multi-Branch AI Studio: Konsolidasi versi dan catatan rilis tanpa merge conflict"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.18",
    "versionCode": 278,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v278-0652",
    "releaseTitle": "WMS v2.6.18 — Live Chat Real-Time & Sinkronisasi 2-Arah Google Calendar",
    "releaseNotes": [
      "Live Chat & Ruang Diskusi: Komunikasi real-time antar tim WMS terintegrasi di floating drawer dan halaman penuh",
      "Integrasi Google Calendar: Sinkronisasi 2-arah agenda WMS dan Google Calendar via GAS backend akun utama",
      "Google Calendar & Keep Style: Tampilan kalender modern (Month & Week view), status sync real-time, dan quick note bar",
      "Perbaikan metode getTotalUnreadCount, getOnlineUsers, dan getVisibleRooms pada LiveChatManager"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.17",
    "versionCode": 277,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v277-0557",
    "releaseTitle": "WMS v2.6.17 — Live Chat & Ruang Diskusi Real-Time + Balas Cepat Notifikasi",
    "releaseNotes": [
      "Fitur Live Chat & Ruang Diskusi Grup Real-Time (Floating Drawer & Halaman Penuh)",
      "Penyimpanan Permanen 3-Tier Hemat Kuota (IndexedDB + wms_system_docs + Google Drive CDN 0 Byte Egress)",
      "Aturan Akuntabilitas Edit & Hapus Pesan (Maksimal 5 Menit & Belum Dibaca User Lain)",
      "Notifikasi Background & Balas Cepat Langsung dari Bar Notifikasi (Tanpa Buka Aplikasi), Tersinkron dengan Pesanan Baru & Retur"
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
