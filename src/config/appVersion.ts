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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.6.16",
    "versionCode": 276,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v276-1146",
    "releaseTitle": "WMS v2.6.16 — Pembaruan Latar Belakang Zero-Reload (Update Tanpa Memutus Layar Kerja Aktif)",
    "releaseNotes": [
      "Pembaruan Latar Belakang Zero-Reload: Tombol 'Perbarui' pada widget dan modal kini 100% menyiapkan update di background tanpa me-reload layar aktif",
      "Transisi Alami Aman: Pembaruan baru diaplikasikan otomatis saat berpindah menu atau secara eksplisit jika user memilih muat ulang",
      "Proteksi Pekerjaan Aktif: Mencegah gangguan visual atau kehilangan fokus saat sedang bekerja di tab tertentu"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.15",
    "versionCode": 275,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v275-1119",
    "releaseTitle": "WMS v2.6.15 — Integrasi Fitur Kirim Tugas Picking Massal (WA Grup, App & Cetak A4) & Sinkronisasi Ekosistem AI Studio",
    "releaseNotes": [
      "Kirim Tugas Picking Massal: Menambahkan fitur seleksi multi-SJ dan broadcast WhatsApp massal ke Grup Gudang serta pengiriman tugas picking massal ke aplikasi dari Distribusi Store Tab",
      "Pembaruan Picking Tasks: Dukungan aksi massal kirim WA Picking untuk batch Surat Jalan",
      "Sinkronisasi Antigravity & AI Studio: Menggabungkan commit terbaru dari Google AI Studio dengan rilis live Antigravity v2.6.14 ke v2.6.15"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.14",
    "versionCode": 274,
    "buildDate": "31 Oktober 2026",
    "buildHash": "wms-261031-v274-1052",
    "releaseTitle": "WMS v2.6.14 — Sinkronisasi Otomatis Realtime Data Katalog & Inventori Multi-Perangkat",
    "releaseNotes": [
      "Sinkronisasi Realtime Katalog: Menambahkan broadcast event 'catalog_updated' via Supabase Realtime WebSocket saat update database produk selesai",
      "Auto-Reload Inventori: Hook useInventoryStock dan InventoryView kini otomatis merefresh stok fisik seketika saat menerima event pembaruan katalog tanpa perlu klik tombol refresh manual",
      "Low-Egress Background Sync: Perangkat user lain otomatis mendeteksi pembaruan katalog dan menyinkronkan data tampilan secara live"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.13",
    "versionCode": 273,
    "buildDate": "31 Oktober 2026",
    "buildHash": "wms-261031-v273-0843",
    "releaseTitle": "WMS v2.6.13 — Optimasi Penghematan Kuota Supabase Log Ingestion",
    "releaseNotes": [
      "Menambahkan tab visibility guard agar polling berhenti total saat tab di-minimize",
      "Mengubah interval polling delta dari 10 detik ke 60 detik (menghemat 83 persen request)",
      "Menghapus kolom items yang besar dari select query notifikasi",
      "Menaikkan interval Service Worker background dari 25 detik ke 3 menit (menghemat 86 persen background traffic)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.12",
    "versionCode": 272,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v272-2109",
    "releaseTitle": "WMS v2.6.12 — Backward Compatibility Thread Reply Email Retur Lama",
    "releaseNotes": [
      "Menambahkan auto-deteksi tiket retur legacy agar update berikutnya otomatis me-reply utas email yang sudah ada di inbox tim",
      "Memastikan 100 persen tiket lama dan baru tersusun rapi dalam 1 thread percakapan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.11",
    "versionCode": 271,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v271-2043",
    "releaseTitle": "WMS v2.6.11 — Standarisasi Utas Percakapan (Thread Reply) Email Retur Barang",
    "releaseNotes": [
      "Standarisasi subjek email retur barang agar seluruh riwayat update & selesai otomatis menjadi balasan (reply) di thread email yang sama",
      "Menambahkan opsi auto-email balasan saat edit data retur dan banner visual update di badan email"
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
