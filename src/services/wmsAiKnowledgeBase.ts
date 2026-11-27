/**
 * =============================================================================
 * WMS AI KNOWLEDGE BASE — End-to-End System Workflows, SOP Graph & Intent Router
 * =============================================================================
 * Sumber pengetahuan permanen dan terstruktur bagi Asisten AI WMS Chocochips agar:
 * 1. Memahami keseluruhan alur kerja (end-to-end workflow) semua 25+ modul WMS.
 * 2. Memahami hubungan antar tabel Supabase, Google Drive (GAS), dan DealPOS.
 * 3. Mampu menganalisa maksud pertanyaan pengguna, menentukan tool yang paling tepat
 *    (termasuk investigasi lintas modul secara paralel), dan menjawab berbasis data live.
 * 4. Menentukan tingkat penalaran / model routing otomatis (Auto Intelligence).
 */

import { ActivePage, UserSession } from '../types';
import { getActivePayrollPeriod, getPreviousPayrollPeriod, getShiftCalendarPeriodForMonth } from '../utils/hrPayrollUtils';
import type { AiAttachment } from '../utils/aiAttachmentParser';

export interface WmsWorkflowPlaybook {
  id: string;
  title: string;
  area: string;
  tables: string[];
  recommendedTools: string[];
  keywords: string[];
  steps: string[];
  invariants: string[];
}

export interface WmsSopRule {
  topic: string;
  keywords: string[];
  summary: string;
}

export const WMS_WORKFLOW_PLAYBOOKS: WmsWorkflowPlaybook[] = [
  {
    id: 'inbound_produksi_audit_qc',
    title: 'Alur Inbound Produksi (CMT & Kargo) → Audit Hitung Ulang → QC → Putaway → Rak',
    area: 'Produksi & Inbound',
    tables: ['penerimaan_produksi', 'trello_up_items', 'qc_reports', 'recount_logs', 'putaway_tasks', 'stok_real_fisik', 'log_produk'],
    recommendedTools: ['query_production_receipts', 'lookup_production_code', 'generate_production_recap', 'check_qc_repair_and_loans', 'query_so_and_putaway'],
    keywords: ['produksi', 'cmt', 'kargo', 'hitung ulang', 'recount', 'susulan', 'batch', 'qc', 'trello', 'up', 'putaway', 'kedatangan', 'barang masuk'],
    steps: [
      '1. Input Penerimaan Produksi (Lokal CMT atau Kargo) di menu Produksi -> Tab Input Penerimaan (auto-lookup nama produk, kode UP vendor, & foto dari Trello UP).',
      '2. Audit Hitung Ulang: membandingkan qty surat jalan vendor vs hitungan fisik gudang. Bila ada kedatangan susulan pada kode yang sudah diaudit, gunakan "Cek & Perbaiki Batch Susulan" (Multi-Batch Audit Scanner) untuk auto-gabung atau Re-Sync formula sheet agar tidak muncul false-alarm selisih.',
      '3. Quality Control (QC): pemeriksaan fisik (qty_diperiksa, qty_oke, qty_reject). Item reject/cacat diarahkan ke Perbaikan (CC/PMK/DF/SORTIR).',
      '4. Putaway & Scan #IN: barang layak jual ditempatkan ke rak gudang aman (berdasarkan kapasitas maksimal rak di rack_capacities) melalui scan #IN agar tercatat di log_produk & stok_real_fisik.'
    ],
    invariants: [
      'Data bisnis produksi tersimpan di Supabase (penerimaan_produksi), foto dokumentasi di Google Drive via GAS.',
      'Tidak ada auto-adjust stok di luar scan fisik operator (log_produk bersifat append-only).'
    ]
  },
  {
    id: 'order_manual_shipment_alteration',
    title: 'Alur Pesanan Store (Manual Shipment, Split Fulfil, Alteration/Permak, Shopee, Website, IG Live)',
    area: 'Order & Store',
    tables: ['manual_shipment', 'ig_live_orders', 'picking_list', 'live_chat_messages'],
    recommendedTools: ['search_manual_shipment', 'query_all_order_channels', 'check_picking_and_channel_orders', 'trace_wms_entity'],
    keywords: ['pesanan', 'manual shipment', 'split fulfil', 'alteration', 'permak', 'kirim ke gudang', 'reminder store', 'terima barang', 'shopee', 'website', 'ig live', 'resi', 'ms', 'ar-'],
    steps: [
      '1. Store/Admin membuat order Manual Shipment (prefix MS...) atau Alteration/Permak (prefix AR-...). Nama produk & size wajib lookup dari Master Produk.',
      '2. Item ber-fulfillment Gudang/Marketplace otomatis tersinkron ke Antrean Tugas Picking (kategori MANUAL_ALTER).',
      '3. Untuk item ber-fulfillment Store (split fulfil atau alter fisik di Store): Store wajib klik "Kirim ke Gudang" (tombol ini KHUSUS akun Store).',
      '4. Dari sisi Admin/Gudang: jika barang dari Store belum dikirim/diterima WH, Admin melihat tombol "Reminder Store" (mengirim kartu interaktif ke Live Chat Store terkait dengan tombol 1-klik "Konfirmasi Sudah Kirim" untuk Store) dan tombol "Terima / Terima Barang" saat fisik tiba di WH.',
      '5. Setelah seluruh item terkumpul, Gudang cetak Label Thermal A6, update No Resi (satuan/massal) & No SJ DealPOS (massal), lalu status menjadi dikirim/selesai.'
    ],
    invariants: [
      'Pemisahan peran ketat: Store PIC TIDAK BOLEH disuruh klik tombol khusus Admin, dan Admin tidak melihat tombol "Kirim ke Gudang".',
      'Order Retur (prefix RTR-) terisolasi penuh di tabel public.retur_barang dan difilter keluar dari manual_shipment.'
    ]
  },
  {
    id: 'picking_pengecekan_sj_outbound',
    title: 'Alur Picking Gudang → Pengecekan Surat Jalan (SJ) → Share Kekurangan → Loading Dock → Pengiriman Store',
    area: 'Outbound & Distribusi',
    tables: ['picking_list', 'pengecekan_sj', 'loading_dock_batches', 'distribusi_sj', 'pengiriman_store_reports', 'pengiriman_store_trips', 'handover_paket', 'log_produk'],
    recommendedTools: ['check_picking_and_channel_orders', 'query_pengecekan_sj', 'query_loading_dock_and_packing', 'query_distribusi_and_pengiriman', 'trace_wms_entity'],
    keywords: ['picking', 'picker', 'surat jalan', 'sj', 'pengecekan', 'selisih', 'kurang', 'share ke tugas picking', 'loading dock', 'packing', 'distribusi', 'trip', 'armada', 'handover', 'kurir', 'invoice_picking', 'prioritas'],
    steps: [
      '1. Pembuatan Tugas Picking (dari Distribusi SJ, Keranjang Inventory, atau Manual Shipment) menghasilkan invoice_picking unik (WA...).',
      '2. Prioritas Area Picking: Priority 1 = Warehouse (A/B/C/D001-100), Aksesoris (BELT/CARD/GIFT/BOX), Transit (X/TRANSIT) -> Priority 2 = Kolian (R0/V0/Z0) -> Priority 3 = Blok F (TIKTOK/SHOPEE/STUDIO/IGLIVE). Area Perbaikan (CC/PMK/DF/SORTIR) & Anomali = DO NOT PICK.',
      '3. Picker mengambil barang (mendukung multi-rak pick_splits & aktivasi rak wajib di mode manual). Saat selesai, sistem mencatat #OUT ke log_produk sebesar delta qty yang baru diambil.',
      '4. Pengecekan Surat Jalan (pengecekan_sj — hanya eligible Priority 1 & 2): memverifikasi qty_scan vs qty_sj (status COCOK atau SELISIH). Jika ada Selisih Kurang, Admin dapat klik "Share ke Tugas Picking" -> hanya sisa kurang yang muncul di Picking dan baseline anti-double #OUT mencegah pemotongan stok ganda.',
      '5. Barang masuk Loading Dock / Packing -> Pengiriman Store (Laporan Pengiriman & Trip Armada) atau Handover Paket Ekspedisi.'
    ],
    invariants: [
      'Korelasi WA scan (#OUT [invoice_picking]) WAJIB menggunakan invoice_picking unik, dilarang menebak dari no_sj atau timestamp.',
      'Sistem dilarang auto-close anomali under-pick/over-pick; operator wajib menyelesaikan lewat scan fisik.',
      'Reset 0 Pcs pada tugas picking dilindungi konfirmasi ketik RESET + cadangan Undo otomatis 24 jam.'
    ]
  },
  {
    id: 'pusat_resolusi_retur',
    title: 'Alur Pusat Resolusi — Retur Barang (RTR-...)',
    area: 'Pusat Resolusi',
    tables: ['retur_barang', 'wms_system_docs'],
    recommendedTools: ['check_retur_and_jne_rekap', 'prepare_retur_barang_draft', 'trace_wms_entity'],
    keywords: ['retur', 'rtr', 'resolusi', 'tukar size', 'tukar model', 'komplain', 'pengganti', 'gudang retur'],
    steps: [
      '1. Tahap 1 (diterima / Pesanan Baru): Tiket dibuat dengan prefix RTR- (mencatat produk_pesanan asal yang diretur & produk_pengganti yang akan dikirim), notifikasi email terkirim via GAS.',
      '2. Tahap 2 (diproses): Tim cetak Label Thermal A6 (100x150mm) atau Picking List A4, atau menginput SJ DealPOS Gudang Retur.',
      '3. Tahap 3 (dikirim / Selesai): Tim input No Resi pengiriman barang pengganti ke customer.'
    ],
    invariants: [
      'Disimpan terisolasi di public.retur_barang dengan prefix RTR- (tidak tercampur di manual_shipment).',
      'Label A6 dan Picking List A4 WAJIB mencetak produk_pengganti, bukan produk_pesanan asal.'
    ]
  },
  {
    id: 'stock_opname_and_audit',
    title: 'Alur Stock Opname (SO), Audit Mutasi (log_produk) & Kapasitas Rak',
    area: 'Inventory & Audit',
    tables: ['stock_opname_queue', 'stok_real_fisik', 'log_produk', 'master_produk', 'rack_capacities'],
    recommendedTools: ['lookup_product_stock', 'audit_stock_and_mutations', 'query_so_and_putaway', 'trace_wms_entity'],
    keywords: ['stock opname', 'so', 'opname', 'selisih', 'adj_in', 'adj_out', 'adjustment', 'mutasi', 'log_produk', 'dealpos', 'stok minus', 'kapasitas rak', 'overload', 'rak kosong', 'anomali'],
    steps: [
      '1. Operator melakukan scan fisik lokasi rak dengan mode #SO (via Web Scanner, WA #SO, atau impor CSV/Excel) membentuk antrean per invoice SO.',
      '2. 0-Scan Rule: Setiap SKU yang tercatat di stok_real_fisik pada lokasi tersebut tetapi tidak ikut discan otomatis dianggap Scan Fisik = 0.',
      '3. Formula Wajib: Selisih = Scan Fisik - Stok Sistem Database. Jika Selisih > 0 => ADJ_IN; Selisih < 0 => ADJ_OUT; Selisih = 0 => Skip.',
      '4. Mutasi penyesuaian (ADJ_IN / ADJ_OUT) ke log_produk HANYA dibuat saat user berwenang klik "Approve Stock Opname".',
      '5. Resolusi Anomali Area: jika kode rak valid di denah tapi label area salah -> koreksi label area saja (DILARANG membuat ADJ_OUT/ADJ_IN).'
    ],
    invariants: [
      'log_produk adalah Single Source of Truth (append-only) untuk seluruh pergerakan fisik.',
      'Nama produk & size wajib lookup dari Master Produk (lookupProductBySku) agar tidak ada anomali nama/size.'
    ]
  },
  {
    id: 'hr_roster_kpi_payroll',
    title: 'Alur HR & Admin — Roster Shift (1–Akhir Bulan), Presensi, KPI Absensi & Kalkulasi Gaji Bulanan (26–25)',
    area: 'HR & Admin',
    tables: ['karyawan', 'roster_shift', 'presensi', 'lembur', 'cuti', 'izin_pulang_awal'],
    recommendedTools: ['query_hr_operations', 'analyze_hr_kpi_and_payroll'],
    keywords: ['hr', 'gaji', 'payroll', 'slip gaji', 'kpi', 'absensi', 'presensi', 'roster', 'shift', 'shift 3b', 'terlambat', 'telat', 'bolos', 'alpha', 'lembur', 'cuti', 'izin', 'kasbon', '26', '25', 'periode', 'karyawan'],
    steps: [
      '1. Jadwal Shift (RosterShiftView): TETAP menggunakan kalender murni tanggal 1 s/d akhir bulan (28/29/30/31). Standar jam pulang: Shift 1 = 17:00, Shift 2 = 18:00, Shift 3a = 21:00, Shift 3b = 20:00 (Sabtu 11:00–20:00).',
      '2. Siklus Administrasi, KPI & Kalkulasi Gaji Bulanan (hrPayrollUtils.ts): WAJIB menggunakan tanggal 26 bulan sebelumnya s/d tanggal 25 bulan berjalan (contoh: 26 Oktober – 25 November = Periode Bulan November; 26 Desember – 25 Januari = Periode Bulan Januari). Data roster lintas 2 bulan kalender disambungkan otomatis.',
      '3. Perhitungan KPI Absensi (kpiCalculator.ts): Tanggal masa depan & hari ini yang masih berlangsung (belum absen pulang) tidak dihukum Bolos. Status roster SKT/CTI/IJN tidak dicap Bolos (tetap memengaruhi % kehadiran dibanding hadir 100%), sedangkan BOLOS/ALPHA di roster langsung kena penalti Alpha.',
      '4. Kalkulasi Gaji Bulanan (calculateMonthlyPayroll di HrRekapView tab Kalkulasi Gaji): Pendapatan Kotor = Gaji Pokok + Tunjangan + Uang Lembur ACC (durasi × rate_lembur jika nominal kosong). Potongan = Potongan Bolos (proporsional upah harian / nominal tetap / tanpa potongan) + Potongan Terlambat + Potongan Kasbon opsional. Gaji Bersih (Take-Home Pay) = max(0, Pendapatan Kotor - Total Potongan).'
    ],
    invariants: [
      'Akses data HR (Roster, Presensi, Approval, KPI, Gaji) dibatasi ketat khusus akun HR & Superadmin.',
      'Periode gaji = 26 bulan sebelumnya s/d 25 bulan berjalan; Jadwal Shift = tetap 1 s/d akhir bulan kalender.'
    ]
  },
  {
    id: 'perbaikan_peminjaman_jne',
    title: 'Alur Perbaikan (Cuci/Permak/Defect/Sortir), Peminjaman SPS & Rekap Tagihan JNE',
    area: 'Quality, Studio & Finance',
    tables: ['perbaikan_tickets', 'peminjaman_sps', 'GSheet JNEMember'],
    recommendedTools: ['check_qc_repair_and_loans', 'check_retur_and_jne_rekap', 'trace_wms_entity'],
    keywords: ['perbaikan', 'cuci', 'permak', 'defect', 'sortir', 'peminjaman', 'sps', 'studio', 'jne', 'tagihan', 'ongkir', 'cnote'],
    steps: [
      '1. Perbaikan: item rusak/noda/defect masuk tiket perbaikan di lokasi CC, PMK, DF, atau SORTIR (otomatis dikecualikan dari picking otomatis) hingga selesai diperbaiki dan kembali layak jual.',
      '2. Peminjaman SPS: pencatatan barang dipinjam untuk foto studio/live/internal beserta estimasi kembali. Cetak Surat Jalan PDF SPS khusus serah terima (tanpa kolom lokasi rak), sedangkan notifikasi WA Picking List Gudang tetap menampilkan lokasi rak live.',
      '3. Rekap Tagihan JNE: sinkron 2 arah Google Sheets JNEMember kolom A..K (melindungi leading zero Cnote No & kode layanan asli CTC23/REG23/YES23), mendukung impor Excel/CSV/PDF/Screenshot Vision.'
    ],
    invariants: [
      'Lokasi Perbaikan (CC/PMK/DF/SORTIR) tidak pernah ikut picking otomatis.'
    ]
  },
  {
    id: 'agenda_system_pwa_rbac',
    title: 'Alur Agenda, Task Delegasi, Project, Live Chat & Pengaturan Sistem / PWA Zero-Reload',
    area: 'Kolaborasi & Sistem',
    tables: ['agenda_events', 'projects', 'sticky_notes', 'delegated_tasks', 'live_chat_*', 'store_faqs', 'store_help_tickets', 'wms_users'],
    recommendedTools: ['query_agenda_and_projects', 'prepare_agenda_or_project_draft', 'query_store_help_tickets', 'query_wms_knowledge_and_sop'],
    keywords: ['agenda', 'distribusi', 'task', 'delegasi', 'project', 'roadmap', 'notes', 'live chat', 'update', 'pwa', 'versi', 'catatan rilis', 'owner', 'warehouse', 'role', 'hak akses'],
    steps: [
      '1. Agenda & Project: mengelola Agenda Event, Agenda Distribusi barang, Delegasi Tugas karyawan/CS/Admin, Roadmap Project ber-deadline, dan Sticky Notes checklist.',
      '2. Live Chat & Store Help: komunikasi internal gudang-store-CS termasuk kartu pengingat interaktif "Konfirmasi Sudah Kirim" untuk Store, serta tiket kendala Store Help.',
      '3. Pembaruan Aplikasi Zero-Reload PWA: bundel baru diunduh di background tanpa memaksa reload saat operator sedang scan/bekerja; aktif aman saat pindah menu. Catatan Rilis Terbaru & Riwayat Pembaruan hanya ditampilkan khusus akun owner @warehouse.'
    ],
    invariants: [
      'Desktop (>= 1024px) mendukung Multi-Tab Keep-Alive & Companion Drawer; Mobile (< 1024px) eksklusif render 1 halaman aktif agar ringan dan kamera scanner stabil.'
    ]
  }
];

export const WMS_ENHANCED_SOP_RULES: WmsSopRule[] = [
  {
    topic: 'Stock Opname (SO) & Rumus Selisih',
    keywords: ['stock opname', 'so', 'opname', 'selisih', 'adj', 'adj_in', 'adj_out', 'approve'],
    summary:
      'Rumus wajib: Selisih = Scan Fisik - Stok Sistem Database. SKU pada lokasi terkait yang tidak ikut discan dianggap Scan Fisik = 0 (0-Scan Rule -> ADJ_OUT). Selisih > 0 menjadi ADJ_IN, Selisih < 0 menjadi ADJ_OUT, Selisih = 0 dilewati. Penyesuaian HANYA dibuat saat user berwenang klik Approve Stock Opname.'
  },
  {
    topic: 'Prioritas Area Picking & Pengecekan SJ',
    keywords: ['picking', 'prioritas', 'area', 'rak', 'warehouse', 'kolian', 'blok f', 'perbaikan', 'anomali', 'pengecekan sj'],
    summary:
      'Priority 1: Warehouse (A/B/C/D001-100), Aksesoris (BELT/CARD/GIFT/BOX), Transit (X/TRANSIT). Priority 2: Kolian (R0/V0/Z0). Priority 3: Blok F (TIKTOK/SHOPEE/STUDIO/IGLIVE). Area Perbaikan (CC/PMK/DF/SORTIR) & Anomali = DO NOT PICK. Khusus Pengecekan SJ hanya Priority 1 & 2.'
  },
  {
    topic: 'Sinkronisasi Picking, WA #OUT & Share Kekurangan Pengecekan SJ',
    keywords: ['invoice_picking', 'wa', 'out', 'under-pick', 'over-pick', 'share', 'kekurangan', 'double', 'reset', 'undo'],
    summary:
      'Korelasi scan WA (#OUT [invoice_picking]) wajib memakai invoice_picking unik (bukan no_sj/timestamp). Share Kekurangan dari Pengecekan SJ ke Tugas Picking hanya menampilkan sisa kurang dan memakai baseline anti-double #OUT agar qty yang sudah diambil tidak terpotong ganda. Reset 0 Pcs wajib ketik RESET & dilindungi backup Undo otomatis 24 jam.'
  },
  {
    topic: 'Periode Administrasi & Kalkulasi Gaji Bulanan (26–25) vs Jadwal Shift (1–Akhir Bulan)',
    keywords: ['gaji', 'payroll', 'periode', '26', '25', 'november', 'shift', 'roster', 'jadwal', 'slip', 'kasbon', 'lembur'],
    summary:
      'Siklus periode administrasi, KPI, dan kalkulasi gaji bulanan karyawan berjalan dari tanggal 26 bulan sebelumnya s/d tanggal 25 bulan berjalan (contoh: 26 Oktober – 25 November = periode bulan November). Sementara Jadwal Shift (RosterShiftView) TETAP berdasarkan tanggal 1 s/d akhir bulan kalender, dan otomatis disambungkan lintas 2 bulan saat kalkulasi gaji.'
  },
  {
    topic: 'Perhitungan KPI Absensi & Jam Pulang Shift 3b',
    keywords: ['kpi', 'absensi', 'presensi', 'shift 3b', 'shift 3a', 'shift 2', 'shift 1', 'pulang awal', 'sakit', 'skt', 'cuti', 'cti', 'izin', 'bolos', 'alpha', 'hari ini'],
    summary:
      'Jam pulang standar dibaca dari jadwal Roster hari tersebut (fallback: Shift 1 = 17:00, Shift 2 = 18:00, Shift 3a = 21:00, Shift 3b Sabtu = 20:00). Tanggal masa depan & hari ini yang masih berlangsung (belum absen pulang) tidak dicap Bolos. Status roster SKT/CTI/IJN tidak dihitung Bolos (tetap memengaruhi % kehadiran), sedangkan BOLOS/ALPHA langsung kena penalti Alpha.'
  },
  {
    topic: 'Pemisahan Peran Store vs Admin (Manual Shipment & Live Chat Reminder)',
    keywords: ['kirim ke gudang', 'reminder store', 'terima barang', 'store', 'admin', 'manual shipment', 'split fulfil', 'alteration', 'live chat'],
    summary:
      'Tombol "Kirim ke Gudang" KHUSUS untuk akun Store. Admin pada pesanan fulfillment Store yang belum diterima di WH melihat tombol "Reminder Store" (mengirim kartu interaktif Live Chat dengan tombol "Konfirmasi Sudah Kirim" untuk Store) dan tombol "Terima / Terima Barang".'
  },
  {
    topic: 'Pusat Resolusi — Retur Barang (RTR-...)',
    keywords: ['retur', 'rtr', 'resolusi', 'label a6', 'pengganti', 'dealpos', 'resi'],
    summary:
      'Disimpan terisolasi di public.retur_barang dengan prefix RTR- (difilter keluar dari manual_shipment). 3 tahap deterministik: diterima (email via GAS) -> diproses (cetak Label A6 / Picking List / input SJ DealPOS Gudang Retur) -> dikirim (input No Resi). Label A6 & Picking List WAJIB mencetak produk_pengganti.'
  },
  {
    topic: 'Master Produk Lookup & Single Source of Truth (log_produk)',
    keywords: ['master produk', 'sku', 'nama produk', 'size', 'anomali', 'log_produk', 'foto', 'google drive', 'supabase'],
    summary:
      'Nama produk dan size resmi wajib selalu menggunakan lookup Master Produk (lookupProductBySku) tanpa anomali. log_produk adalah Single Source of Truth append-only untuk seluruh mutasi stok. Data bisnis disimpan di Supabase, sedangkan foto dokumentasi di Google Drive via GAS.'
  },
  {
    topic: 'Update Aplikasi Zero-Reload & Catatan Rilis Eksklusif Owner',
    keywords: ['update', 'pwa', 'reload', 'catatan rilis', 'changelog', 'versi', 'warehouse', 'owner'],
    summary:
      'Pembaruan PWA diunduh di background tanpa memaksa reload saat user sedang bekerja dan aktif aman saat berpindah menu. Catatan Rilis Terbaru & Riwayat Pembaruan Sebelumnya hanya ditampilkan pada tampilan akun owner @warehouse.'
  }
];

export const WMS_ACTIVE_PAGE_CONTEXT_MAP: Partial<Record<ActivePage, { label: string; focus: string; primaryTools: string[] }>> = {
  dashboard: { label: 'Dashboard Utama', focus: 'Ringkasan KPI stok, kapasitas rak, dan mutasi terkini', primaryTools: ['get_executive_daily_summary', 'audit_stock_and_mutations'] },
  inventory: { label: 'Inventory & Denah 3D', focus: 'Stok fisik per rak, DealPOS, Keranjang Picking (filter Area Sumber), & Denah 3D', primaryTools: ['lookup_product_stock', 'audit_stock_and_mutations', 'view_inventory_cart'] },
  scanner: { label: 'Scanner Barcode (IN/OUT/SO)', focus: 'Scan transaksi fisik #IN, #OUT, #SO & staging offline', primaryTools: ['audit_stock_and_mutations', 'query_wms_knowledge_and_sop'] },
  stock_opname: { label: 'Stock Opname & Putaway', focus: 'Antrean SO (rumus Scan - Sistem, 0-Scan Rule) & Tugas Putaway', primaryTools: ['query_so_and_putaway', 'audit_stock_and_mutations'] },
  operasi_stok: { label: 'Operasi Stok & Kapasitas Rak', focus: 'Kapasitas rak, rak kosong/overload, dan pembersihan lokasi', primaryTools: ['audit_stock_and_mutations'] },
  mutasi_log: { label: 'Log Mutasi Produk (log_produk)', focus: 'Ledger append-only seluruh mutasi IN, OUT, SO, ADJ_IN, ADJ_OUT', primaryTools: ['audit_stock_and_mutations', 'trace_wms_entity'] },
  produksi: { label: 'Penerimaan Produksi (CMT & Kargo)', focus: 'Penerimaan CMT/Kargo, Multi-Batch Audit Hitung Ulang Susulan, & QC', primaryTools: ['query_production_receipts', 'generate_production_recap', 'lookup_production_code', 'check_qc_repair_and_loans'] },
  penerimaan: { label: 'Penerimaan Produksi', focus: 'Penerimaan CMT/Kargo & Audit Hitung Ulang', primaryTools: ['query_production_receipts', 'lookup_production_code'] },
  trello_up: { label: 'Trello UP (Katalog Produksi)', focus: 'Kode produksi, UP vendor, nama produk resmi, & foto referensi', primaryTools: ['lookup_production_code'] },
  penerimaan_barang: { label: 'Penerimaan Barang (Paket & Mutasi Store)', focus: 'Paket ekspedisi masuk & tarikan/mutasi dari Store', primaryTools: ['query_distribusi_and_pengiriman'] },
  loading_dock: { label: 'Loading Dock & Packing', focus: 'Batch loading dock & serah terima packing', primaryTools: ['query_loading_dock_and_packing'] },
  packing: { label: 'Packing & Loading Dock', focus: 'Status packing & batch outbound', primaryTools: ['query_loading_dock_and_packing', 'check_picking_and_channel_orders'] },
  picking_tasks: { label: 'Antrean Tugas Picking', focus: 'Picking queue per invoice_picking, multi-rak pick_splits, lanjutkan sisa picking, & proteksi reset', primaryTools: ['check_picking_and_channel_orders', 'query_pengecekan_sj', 'trace_wms_entity'] },
  pengiriman: { label: 'Pengiriman & Distribusi Store', focus: 'Pengecekan SJ (COCOK/SELISIH & Share Kekurangan ke Picking), Pengiriman Store, Trip Armada, & Handover Paket', primaryTools: ['query_pengecekan_sj', 'query_distribusi_and_pengiriman', 'trace_wms_entity'] },
  pesanan_saya: { label: 'Pesanan & Manual Shipment', focus: 'Manual Shipment, Split Fulfil, Alteration/Permak, Shopee, Website, IG Live', primaryTools: ['query_all_order_channels', 'search_manual_shipment', 'trace_wms_entity'] },
  pusat_resolusi: { label: 'Pusat Resolusi — Retur Barang', focus: 'Tiket retur RTR-... (diterima -> diproses -> dikirim) & produk pengganti', primaryTools: ['check_retur_and_jne_rekap', 'trace_wms_entity'] },
  perbaikan: { label: 'Perbaikan (Cuci/Permak/Defect/Sortir)', focus: 'Antrean tiket perbaikan di CC/PMK/DF/SORTIR', primaryTools: ['check_qc_repair_and_loans'] },
  peminjaman: { label: 'Peminjaman Barang (SPS/Studio)', focus: 'Monitoring peminjaman SPS & jadwal pengembalian', primaryTools: ['check_qc_repair_and_loans'] },
  rekap_tagihan_jne: { label: 'Rekap Tagihan JNE', focus: 'Rekonsiliasi ongkir & Cnote JNE dengan Google Sheets JNEMember', primaryTools: ['check_retur_and_jne_rekap'] },
  agenda: { label: 'Agenda, Task & Project', focus: 'Agenda Event, Agenda Distribusi, Delegasi Task, Project Deadline, & Sticky Notes', primaryTools: ['query_agenda_and_projects', 'prepare_agenda_or_project_draft'] },
  karyawan: { label: 'HR — Direktori Karyawan', focus: 'Data karyawan aktif, divisi, jabatan, & KPI periode 26–25', primaryTools: ['query_hr_operations', 'analyze_hr_kpi_and_payroll'] },
  roster_shift: { label: 'HR — Roster Jadwal Shift (1–Akhir Bulan)', focus: 'Penjadwalan shift bulanan (kalender 1 s/d akhir bulan)', primaryTools: ['query_hr_operations'] },
  presensi: { label: 'HR — Presensi Karyawan', focus: 'Absensi masuk/pulang & KPI periode 26–25', primaryTools: ['query_hr_operations', 'analyze_hr_kpi_and_payroll'] },
  hr_rekap: { label: 'HR — Rekap Absensi, KPI & Kalkulasi Gaji (26–25)', focus: 'Rekap kehadiran, KPI Absensi (Shift 3b aware), & Kalkulasi Gaji Bulanan periode 26–25', primaryTools: ['analyze_hr_kpi_and_payroll', 'query_hr_operations'] },
  hr_approval: { label: 'HR — Approval Lembur, Cuti & Izin', focus: 'Persetujuan pengajuan lembur, cuti, dan izin pulang awal', primaryTools: ['query_hr_operations'] }
};

export type PromptComplexityLevel = 'simple' | 'analytical' | 'deep_analysis';

/**
 * Mengklasifikasikan kompleksitas pertanyaan pengguna secara deterministik (0ms, 0 token)
 * agar mode Auto (Cerdas) dapat langsung mengarahkan pertanyaan analitis / lintas modul /
 * investigasi akar masalah / kalkulasi HR & gaji ke model Gemini 4 Hydrogen yang lebih kuat.
 */
export function classifyPromptComplexity(
  prompt: string,
  attachments?: AiAttachment[]
): { level: PromptComplexityLevel; reason: string } {
  const text = String(prompt || '').trim().toLowerCase();
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (hasAttachments) {
    return { level: 'deep_analysis', reason: 'multimodal_attachment' };
  }

  // Pola pertanyaan sangat sederhana (sapaan / 1-2 kata pendek tanpa kata analitis)
  const simpleGreetingRe = /^(halo|hai|hi|hello|pagi|siang|sore|malam|terima kasih|makasih|thanks|ok|oke|sip|tes|test)[!.?\s]*$/i;
  if (simpleGreetingRe.test(text)) {
    return { level: 'simple', reason: 'greeting' };
  }

  // Pola investigasi mendalam, lintas modul, akar masalah, kalkulasi keuangan/KPI, atau alur sistem
  const deepKeywords = [
    'kenapa', 'mengapa', 'penyebab', 'akar masalah', 'root cause', 'analisa', 'analisis',
    'bandingkan', 'komparasi', 'perbandingan', 'audit', 'selisih', 'anomali', 'minus',
    'lacak', 'trace', 'riwayat lengkap', 'kronologi', 'sampai mana', 'sudah sampai',
    'hitung gaji', 'kalkulasi gaji', 'slip gaji', 'take home pay', 'payroll', 'potongan',
    'kpi', 'ranking', 'tertinggi', 'terendah', 'terbanyak', 'paling sering',
    'rekap', 'ringkasan eksekutif', 'laporan', 'excel', 'pdf', 'csv',
    'alur', 'workflow', 'sop', 'cara kerja', 'bagaimana sistem', 'rekomendasi', 'evaluasi',
    'pengecekan sj', 'kurang ambil', 'under-pick', 'over-pick', 'batch susulan'
  ];

  const matchedDeep = deepKeywords.filter((kw) => text.includes(kw));
  if (matchedDeep.length >= 2 || text.length >= 160) {
    return { level: 'deep_analysis', reason: `deep_signals:${matchedDeep.slice(0, 3).join(',') || 'long_query'}` };
  }
  if (matchedDeep.length === 1) {
    return { level: 'analytical', reason: `analytical_signal:${matchedDeep[0]}` };
  }

  // Perintah aksi / navigasi aplikasi (misal "buka menu scanner", "arahkan ke pengiriman")
  const actionCommandRe = /\b(buka|bukakan|bukain|pindah\s+ke|arahkan\s+ke|tampilkan\s+menu|masuk\s+ke|open|go\s+to)\b/i;
  if (actionCommandRe.test(text)) {
    return { level: 'analytical', reason: 'app_action_command' };
  }

  // Deteksi pertanyaan multi-entitas atau multi-kondisi (misal "dan", "serta", daftar item > 2 baris)
  const lineCount = text.split('\n').filter((l) => l.trim().length > 0).length;
  if (lineCount >= 3 || (text.includes(' dan ') && text.length > 65)) {
    return { level: 'analytical', reason: 'multi_entity_query' };
  }

  return { level: 'simple', reason: 'direct_lookup' };
}

function formatLocalYmdInternal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Menyusun System Instruction komprehensif yang grounded penuh pada seluruh arsitektur,
 * workflow operasional, aturan bisnis, konteks layar aktif, dan siklus periode WMS.
 */
export function buildWmsAiSystemInstruction({
  session,
  aiRole,
  activePage,
  now = new Date()
}: {
  session?: UserSession | null;
  aiRole: 'superadmin' | 'hr' | 'warehouse_ops' | 'store';
  activePage?: ActivePage | null;
  now?: Date;
}): string {
  const todayStr = formatLocalYmdInternal(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = formatLocalYmdInternal(yesterday);

  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - 2);
  const twoDaysAgoStr = formatLocalYmdInternal(twoDaysAgo);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const sevenDaysAgoStr = formatLocalYmdInternal(sevenDaysAgo);

  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const activePayrollPeriod = getActivePayrollPeriod(now);
  const prevPayrollPeriod = getPreviousPayrollPeriod(now);
  const currentShiftCalendar = getShiftCalendarPeriodForMonth(now.getFullYear(), now.getMonth() + 1);

  const userName = session?.name || session?.username || 'Pengguna';
  const pageCtx = activePage ? WMS_ACTIVE_PAGE_CONTEXT_MAP[activePage] : undefined;

  const activeScreenBlock = pageCtx
    ? `\n- Halaman WMS yang Sedang Dibuka User: ${pageCtx.label} (page_id: "${activePage}") — Fokus: ${pageCtx.focus}. (Jika user menyebut "halaman ini", "data di sini", atau "menu ini", rujuk ke modul ini dan prioritaskan tool: ${pageCtx.primaryTools.join(', ')}.)`
    : '';

  return `Anda adalah Asisten AI Analis & Operasional resmi untuk sistem **WMS Inventory Chocochips Warehouse**.
Anda memahami secara menyeluruh arsitektur database, aturan bisnis, dan seluruh alur kerja (workflow) end-to-end sistem WMS, serta bertugas menganalisis pertanyaan pengguna secara tepat, mencari fakta langsung dari data live melalui tools, dan memberikan jawaban yang akurat, tuntas, serta mudah ditindaklanjuti dalam Bahasa Indonesia.

=============================================================================
1. PROTOKOL ANALISA PERTANYAAN & PENALARAN TERSTRUKTUR (WAJIB IKUTI)
=============================================================================
Sebelum menjawab pertanyaan apa pun:
- **LANGKAH 1 — Bedah Maksud & Entitas**: Identifikasi apa yang sebenarnya ditanyakan (fakta stok, investigasi selisih/akar masalah, pelacakan SJ/order/resi/kode produksi, analisa KPI/gaji HR, panduan SOP/alur kerja, atau pembuatan draft/ekspor). Identifikasi entitas kunci (nama produk, nomor SJ, \`invoice_picking\`, \`MS...\`/\`AR-...\`/\`RTR-...\`, no resi, kode produksi, nama karyawan, lokasi rak) dan rentang waktunya.
- **LANGKAH 2 — Pilih Tool Paling Tepat & Jalankan Paralel**:
  * **EKSEKUSI PERINTAH NAVIGASI / BUKA MENU (WAJIB!)**: Anda **MEMILIKI AKSES LANGSUNG** untuk membuka menu, halaman, dan popup aplikasi WMS (seperti \`scanner\`, \`inventory\`, \`inventory_cart\`, \`picking_tasks\`, \`pengiriman\`, \`popup_produksi_input\`, \`popup_hitung_ulang\`, \`stock_opname\`, \`pesanan_saya\`, \`pusat_resolusi\`, \`hr_rekap\`, \`roster_shift\`, \`presensi\`, \`agenda\`, \`live_chat\`, \`pengaturan_sistem\`, dll.) menggunakan tool **"open_wms_module_shortcut"** dengan \`auto_execute: true\`. **DILARANG KERAS** menolak atau menjawab "Maaf saya belum memiliki akses untuk membuka menu secara langsung"!
  * JANGAN pernah menebak angka, status, atau nama produk dari memori — WAJIB panggil tool data live terlebih dahulu!
  * Jika pertanyaan menyangkut investigasi lintas modul (mis. "lacak SJ X sampai mana?", "kenapa produk Y selisih?", "cek status kode produksi 6612 dari masuk sampai stok rak", "cek resi Z"), panggil **"trace_wms_entity"** (atau kombinasikan beberapa tool sekaligus secara PARALEL dalam 1 giliran!).
  * Jika pertanyaan menyangkut Pengecekan Surat Jalan / selisih kurang pengiriman -> panggil **"query_pengecekan_sj"**.
  * Jika pertanyaan menyangkut KPI Absensi, evaluasi kehadiran, potongan, atau Kalkulasi Gaji Bulanan (khusus HR/Superadmin) -> panggil **"analyze_hr_kpi_and_payroll"** (otomatis memakai siklus 26–25!).
  * Jika pertanyaan menyangkut cara kerja fitur, alur sistem, SOP, atau FAQ -> panggil **"query_wms_knowledge_and_sop"** agar terverifikasi dengan SOP & FAQ resmi sesuai peran user.
  * Jika hasil tool pertama kosong atau belum menjelaskan akar masalah, LAKUKAN LANGKAH LANJUTAN (panggil tool komplementer seperti \`audit_stock_and_mutations\`, \`query_pengecekan_sj\`, atau \`trace_wms_entity\`) sebelum menyimpulkan.
- **LANGKAH 3 — Sintesis Jawaban Berbasis Fakta & Solusi**:
  * Mulai dengan **kesimpulan langsung / jawaban inti** yang jelas (angka, status, atau akar penyebab).
  * Sertakan **rincian data terverifikasi** (tabel Markdown rapi jika >= 3 baris; tampilkan seluruh lokasi rak dan qty-nya TANPA menyingkat dengan "dll.").
  * Jika menemukan anomali/selisih/kendala, jelaskan **penyebab paling mungkin berdasarkan alur WMS** dan berikan **langkah tindak lanjut konkret** di menu WMS terkait (sertakan \`open_wms_module_shortcut\` dengan \`auto_execute: false\` bila hanya menyarankan pintasan opsional, atau \`auto_execute: true\` jika pengguna meminta membuka menunya).

=============================================================================
2. PETA WORKFLOW END-TO-END & ATURAN INTI SISTEM WMS CHOCOCHIPS
=============================================================================
A. SINGLE SOURCE OF TRUTH & INTEGRITAS DATA:
   - **Master Produk (\`lookupProductBySku\`)**: Satu-satunya sumber kebenaran untuk Nama Produk dan Size resmi (29.000+ SKU). DILARANG mengarang nama/size di luar Master Produk, dan DILARANG KERAS menyuruh user memasukkan Kode SKU barcode — selalu layani pencarian berbasis Nama Produk pakaian (contoh: "Ruth Top Cherry", "Sailor Top").
   - **\`log_produk\` (Append-Only Ledger)**: Satu-satunya sumber kebenaran mutasi stok fisik (\`IN\`, \`OUT\`, \`SO\`, \`ADJ_IN\`, \`ADJ_OUT\`). Tidak ada auto-generate \`#IN\`/\`#OUT\` tersembunyi di luar scan fisik operator (kecuali saat klik Approve Stock Opname).
   - **Penyimpanan**: Data operasional di Supabase PostgreSQL; foto dokumentasi di Google Drive via Google Apps Script (GAS).

B. ALUR INBOUND PRODUKSI → AUDIT HITUNG ULANG → QC → PUTAWAY → RAK:
   - Barang masuk dari **Lokal CMT** atau **Kargo** dicatat di \`penerimaan_produksi\` (terhubung ke katalog \`trello_up_items\` untuk kode UP & foto).
   - Bila ada kedatangan susulan pada kode yang sudah diaudit, modul **Cek & Perbaiki Batch Susulan** menggabungkan hasil audit dan menyinkronkan ulang Google Sheet agar tidak muncul false-alarm selisih.
   - Hasil QC dicatat di \`qc_reports\`; barang defect/noda masuk antrean **Perbaikan** (\`perbaikan_tickets\` di rak \`CC\`/\`PMK\`/\`DF\`/\`SORTIR\`). Barang layak jual masuk **Putaway** (\`putaway_tasks\`) ke rak aman sesuai kapasitas (\`rack_capacities\`).

C. ALUR PICKING, PRIORITAS AREA & PENGECEKAN SURAT JALAN (SJ):
   - **Prioritas Picking (\`getAreaFromLokasi\`)**:
     * Priority 1: **Warehouse** (\`A/B/C/D001-100\`), **Aksesoris** (\`BELT/CARD/GIFT/BOX\`), **Transit** (\`X\`/\`TRANSIT\`).
     * Priority 2: **Kolian** (\`R0/V0/Z0\`).
     * Priority 3: **Blok F** (\`TIKTOK\`, \`SHOPEE\`, \`STUDIO\`, \`IGLIVE\`).
     * **DO NOT PICK**: **Perbaikan** (\`CC\`, \`PMK\`, \`DF\`, \`SORTIR\`) & **Anomali** selalu dikecualikan dari picking otomatis. Khusus Pengecekan SJ hanya Priority 1 & 2.
   - **Korelasi Picking WA**: WAJIB menggunakan \`invoice_picking\` unik (contoh: \`WA...\`), bukan \`no_sj\`. Sistem tidak auto-close under-pick/over-pick.
   - **Pengecekan SJ (\`pengecekan_sj\`) & Share Kekurangan**: Membandingkan \`qty_scan\` vs \`qty_sj\` (\`COCOK\` vs \`SELISIH\`). Item **Selisih Kurang** bisa di-**Share ke Tugas Picking** -> hanya menampilkan sisa kekurangan & diproteksi baseline anti-double \`#OUT\` agar stok tidak terpotong dua kali.
   - **Outbound**: Setelah Pengecekan SJ -> **Loading Dock / Packing** -> **Pengiriman Store** (\`pengiriman_store_reports\` & \`pengiriman_store_trips\`) atau **Handover Paket** ke ekspedisi -> rekonsiliasi ongkir di **Rekap Tagihan JNE** (\`JNEMember\`).

D. ALUR PESANAN STORE (MANUAL SHIPMENT, SPLIT FULFIL, ALTERATION) & PUSAT RESOLUSI RETUR:
   - **Manual Shipment (\`MS...\`) & Alteration/Permak (\`AR-...\`)**: Disimpan di \`manual_shipment\`. Item fulfillment Gudang/Marketplace otomatis masuk Tugas Picking \`MANUAL_ALTER\`.
   - **Pemisahan Peran Ketat Store vs Admin**: Tombol **"Kirim ke Gudang"** KHUSUS akun Store. Admin pada item Store yang belum tiba di WH melihat tombol **"Reminder Store"** (kirim kartu pengingat interaktif ke Live Chat Store yang memuat tombol 1-klik **"Konfirmasi Sudah Kirim"**) & tombol **"Terima / Terima Barang"**. JANGAN pernah menyuruh Store klik tombol khusus Admin!
   - **Pusat Resolusi — Retur Barang (\`RTR-...\`)**: Terisolasi di tabel \`public.retur_barang\` (difilter keluar dari \`manual_shipment\`). 3 tahap deterministik: \`diterima\` -> \`diproses\` (cetak Label A6 / Picking List / input SJ DealPOS Gudang Retur) -> \`dikirim\` (input \`no_resi\`). Label A6 & Picking List WAJIB mencetak \`produk_pengganti\`, bukan produk asal.

E. ALUR STOCK OPNAME (SO):
   - Dihitung ketat per invoice SO. **0-Scan Rule**: SKU di \`stok_real_fisik\` lokasi tersebut yang tidak discan dianggap \`Scan Fisik = 0\`.
   - **Formula Wajib**: \`Selisih = Scan Fisik - Stok Sistem Database\` (\`> 0\` -> \`ADJ_IN\`, \`< 0\` -> \`ADJ_OUT\`, \`= 0\` -> Skip). Mutasi HANYA tercipta saat user klik **Approve Stock Opname**.
   - **Anomali Area**: Jika lokasi valid di denah namun label area salah -> koreksi label \`area\` saja (DILARANG \`ADJ_OUT\`/\`ADJ_IN\`).

F. ALUR HR, ROSTER SHIFT, KPI ABSENSI & KALKULASI GAJI BULANAN (PENTING!):
   - **Siklus Administrasi, KPI & Kalkulasi Gaji Bulanan**: WAJIB **tanggal 26 bulan sebelumnya s/d tanggal 25 bulan berjalan** (contoh: 26 Oktober – 25 November = periode bulan November; 26 Desember – 25 Januari = periode bulan Januari).
   - **Jadwal Shift (\`RosterShiftView\`)**: TETAP **tanggal 1 s/d akhir bulan kalender** (28/29/30/31). Saat rekap/hitung gaji 26–25, sistem otomatis menggabungkan irisan roster akhir bulan lalu (26–akhir bulan) + awal bulan berjalan (1–25).
   - **Aturan KPI Absensi (\`kpiCalculator.ts\`)**: Jam pulang standar mengikuti jadwal Roster aktual (Shift 1 = \`17:00\`, Shift 2 = \`18:00\`, Shift 3a = \`21:00\`, **Shift 3b Sabtu = \`20:00\`**). Tanggal masa depan & hari ini yang masih berlangsung (belum absen pulang) TIDAK dicap Bolos. Status roster \`SKT\`/\`CTI\`/\`IJN\` tidak dihitung Bolos (tetap memengaruhi \`% Kehadiran\`), sedangkan \`BOLOS\`/\`ALPHA\` langsung kena penalti Alpha.

=============================================================================
3. PANDUAN KHUSUS TOOLS, DRAFT, EKSPOR & SELF-REPORTING
=============================================================================
- **Batch Stok**: Jika user meminta cek banyak produk sekaligus, panggil SATU KALI \`lookup_product_stock\` memakai parameter \`queries: [...]\`.
- **Human-in-the-Loop Draft**: AI TIDAK boleh langsung mengubah stok fisik atau menyimpan permanen pesanan/retur/agenda. Gunakan \`prepare_production_receipt_form\`, \`prepare_manual_shipment_draft\`, \`prepare_retur_barang_draft\`, \`prepare_agenda_or_project_draft\` agar user tinggal review & klik Submit.
- **Lampiran & Ekspor**: Untuk file/foto/PDF/Excel daftar barang, panggil \`validate_items_against_master\`. Saat user meminta laporan Excel/CSV/PDF, WAJIB panggil \`generate_exportable_report\`.
- **Self-Reporting Capability Gap**: Hanya jika user meminta kapabilitas/aksi/integrasi yang benar-benar TIDAK bisa dikerjakan oleh seluruh tool yang tersedia, WAJIB panggil \`report_ai_capability_gap\` dan infokan nomor GAP-ID dengan ramah.

KONTEKS PENGGUNA & LAYAR AKTIF:
- Nama / Username: ${userName} (${session?.username || '-'})
- Role AI: ${aiRole}${session?.store_name ? ` (Store: ${session.store_name})` : ''}${activeScreenBlock}

KONTEKS WAKTU & PERIODE REAL-TIME (WAJIB DIGUNAKAN UNTUK FILTER TANGGAL):
- Hari Ini: ${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()} (YYYY-MM-DD: "${todayStr}")
- Kemarin: ${dayNames[yesterday.getDay()]}, ${yesterday.getDate()} ${monthNames[yesterday.getMonth()]} ${yesterday.getFullYear()} (YYYY-MM-DD: "${yesterdayStr}")
- 2 Hari Lalu: "${twoDaysAgoStr}"
- 7 Hari Terakhir: start_date="${sevenDaysAgoStr}" s/d end_date="${todayStr}"
- Bulan Kalender Berjalan (Untuk Jadwal Shift / Produksi Bulanan): ${currentShiftCalendar.label} (${currentShiftCalendar.startDate} s/d ${currentShiftCalendar.endDate})
- Periode Administrasi & Gaji HR Aktif (Siklus 26–25): ${activePayrollPeriod.label} (monthKey: "${activePayrollPeriod.monthKey}", rentang: "${activePayrollPeriod.startDate}" s/d "${activePayrollPeriod.endDate}")
- Periode Gaji HR Sebelumnya (Siklus 26–25): ${prevPayrollPeriod.label} (monthKey: "${prevPayrollPeriod.monthKey}", rentang: "${prevPayrollPeriod.startDate}" s/d "${prevPayrollPeriod.endDate}")`;
}
