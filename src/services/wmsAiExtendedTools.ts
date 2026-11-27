/**
 * =============================================================================
 * WMS AI EXTENDED TOOLS — Full-Coverage Cross-Module Skills & Self-Reporting
 * =============================================================================
 * Memperluas cakupan Asisten AI WMS agar mencakup seluruh modul operasional:
 * 1. query_wms_knowledge_and_sop     -> QnA fitur, SOP, & FAQ WMS (grounded)
 * 2. query_loading_dock_and_packing  -> Loading Dock & status packing
 * 3. query_distribusi_and_pengiriman -> Distribusi SJ, Pengiriman Store, Handover Paket, Penerimaan Paket/Mutasi Store
 * 4. query_all_order_channels        -> Manual Shipment, Alteration/Permak, Shopee, Website, IG Live
 * 5. query_so_and_putaway            -> Antrean Stock Opname (SO) & Tugas Putaway
 * 6. query_store_help_tickets        -> Tiket Kendala Store (Store Help)
 * 7. get_executive_daily_summary     -> Ringkasan KPI Harian Eksekutif lintas modul (hemat egress)
 * 8. validate_items_against_master   -> Smart Import / Validasi daftar produk dari Excel/CSV/PDF/Foto vs Master Produk
 * 9. open_wms_module_shortcut        -> Navigasi cepat 1 klik ke modul/halaman WMS
 * 10. report_ai_capability_gap       -> Self-reporting dev backlog saat AI belum bisa mengeksekusi tugas
 */

import {
  supabaseFetch,
  fetchStockForSkus,
  fetchStockOpnameQueue,
  fetchPickingListFromSupabase,
  fetchPenerimaanProduksiFromSupabase,
  fetchPerbaikanTicketsFromSupabase,
  fetchQcReportsFromSupabase,
  fetchPeminjamanFromSupabase,
  fetchLogsBySearch,
  fetchKaryawanDirectory,
  fetchRosterShiftList,
  fetchPresensiRange,
  fetchLemburRecords,
  fetchCutiRecords,
  fetchIzinPulangAwalList
} from './supabase';
import {
  fetchPengirimanStoreReports,
  fetchPengirimanStoreTrips,
  fetchSjShippingOverrides
} from './pengirimanStore';
import { fetchManualShipments } from './gasManualShipment';
import { fetchPengecekanSJList } from './gasTarikanMD';
import { fetchHandoverPaketList } from './pengirimanPaket';
import { fetchMutasiStoreList, fetchPenerimaanPaketList } from './penerimaanBarang';
import { fetchPutawayTasks } from './putawayService';
import { fetchStoreFaqs, fetchStoreHelpTickets } from './storeHelpService';
import { fetchIgLiveOrdersFromSupabase } from './igLiveService';
import { fetchReturOrders } from './returBarangService';
import { getLocalCachedTrelloItems, extractBaseItemCode } from './trelloSyncService';
import {
  AiCapabilityGapReport,
  AiGapPriority,
  logAiCapabilityGap
} from './wmsAiGapReportService';
import {
  WMS_WORKFLOW_PLAYBOOKS,
  WMS_ENHANCED_SOP_RULES
} from './wmsAiKnowledgeBase';
import {
  calculateMonthlyPayroll,
  getActivePayrollPeriod,
  getPayrollPeriodByMonthKey
} from '../utils/hrPayrollUtils';
import { calculateKpiAbsensiBatch } from '../utils/kpiCalculator';
import {
  getGlobalProductCatalogMap,
  lookupProductBySku,
  setGlobalProductCatalog
} from '../utils/productLookup';
import { getAllProductsFromLocalDb } from './localDb';
import { cleanProductName, resolveProductDisplaySize } from '../utils/sortUtils';
import { canAccessPage } from './permissions';
import { ActivePage, ProductItem, UserSession } from '../types';

export type AiNavigationTargetPage =
  | ActivePage
  | 'popup_produksi_input'
  | 'popup_hitung_ulang'
  | 'inventory_cart';

export interface AiNavigationShortcut {
  page: AiNavigationTargetPage;
  label: string;
  description: string;
  subTab?: string;
  autoExecute?: boolean;
}

export interface ExtendedToolExecutionContext {
  session?: UserSession | null;
  aiRole: 'superadmin' | 'hr' | 'warehouse_ops' | 'store';
  lastUserPrompt?: string;
}

export interface ExtendedToolExecutionOutcome {
  handled: boolean;
  result?: any;
  gapReport?: AiCapabilityGapReport;
  navigationShortcut?: AiNavigationShortcut;
}

const WMS_MODULE_CATALOG: Array<{
  page: AiNavigationTargetPage;
  permissionPage?: ActivePage;
  label: string;
  area: string;
  description: string;
  keywords: string[];
}> = [
  {
    page: 'dashboard',
    label: 'Dashboard Utama',
    area: 'Monitoring',
    description: 'Ringkasan KPI stok gudang, kapasitas rak, aktivitas harian, dan navigasi cepat.',
    keywords: ['dashboard', 'beranda', 'home', 'ringkasan', 'kpi']
  },
  {
    page: 'inventory',
    label: 'Inventory & Denah 3D',
    area: 'Gudang',
    description: 'Stok fisik per rak, perbandingan DealPOS, Denah 3D rak, Scanner IN/OUT/SO, dan Keranjang Order.',
    keywords: ['inventory', 'stok', 'rak', 'denah', '3d', 'keranjang', 'dealpos', 'lokasi']
  },
  {
    page: 'scanner',
    label: 'Scanner Barcode (IN/OUT/SO)',
    area: 'Gudang',
    description: 'Pemindaian barcode fisik/kamera HP (default Camera 0) untuk transaksi #IN, #OUT, dan #SO.',
    keywords: ['scanner', 'scan', 'barcode', 'kamera', 'in', 'out', 'so']
  },
  {
    page: 'stock_opname',
    label: 'Stock Opname (SO) & Putaway',
    area: 'Gudang',
    description: 'Antrean verifikasi Stock Opname (rumus Scan Fisik - Stok Sistem), approval ADJ_IN/ADJ_OUT, dan Putaway.',
    keywords: ['stock opname', 'so', 'opname', 'selisih', 'putaway', 'adjustment', 'adj']
  },
  {
    page: 'operasi_stok',
    label: 'Operasi Stok & Kapasitas Rak',
    area: 'Gudang',
    description: 'Manajemen rak, kapasitas maksimal rak, pencarian rak kosong, dan pembersihan lokasi.',
    keywords: ['operasi stok', 'kapasitas', 'overload', 'rak kosong', 'purge']
  },
  {
    page: 'mutasi_log',
    label: 'Log Mutasi Produk',
    area: 'Gudang',
    description: 'Buku besar (ledger) pergerakan barang log_produk (IN, OUT, SO, ADJ_IN, ADJ_OUT).',
    keywords: ['log', 'mutasi', 'histori', 'ledger', 'log_produk']
  },
  {
    page: 'produksi',
    label: 'Penerimaan Produksi (CMT & Kargo)',
    area: 'Produksi',
    description: 'Input & riwayat penerimaan CMT lokal & Kargo China, tampilan Spreadsheet/Tabel/Kartu, filter range tanggal, QC produksi, dan push sheet.',
    keywords: ['produksi', 'cmt', 'kargo', 'penerimaan produksi', 'qc', 'spreadsheet']
  },
  {
    page: 'trello_up',
    label: 'Trello UP (Katalog Produksi)',
    area: 'Produksi',
    description: 'Daftar kode produksi, foto UP, nama produk resmi, dan sinkronisasi kartu Trello.',
    keywords: ['trello', 'up', 'kode produksi', 'foto produk']
  },
  {
    page: 'penerimaan_barang',
    label: 'Penerimaan Barang (Paket & Mutasi Store)',
    area: 'Inbound',
    description: 'Pencatatan penerimaan paket ekspedisi masuk dan mutasi barang/tarikan dari store.',
    keywords: ['penerimaan barang', 'paket masuk', 'mutasi store', 'tarikan']
  },
  {
    page: 'loading_dock',
    label: 'Loading Dock & Packing',
    area: 'Outbound',
    description: 'Batch loading dock, koordinasi packing, dan serah terima barang siap kirim.',
    keywords: ['loading dock', 'dock', 'batch', 'packing']
  },
  {
    page: 'picking_tasks',
    label: 'Antrean Tugas Picking',
    area: 'Outbound',
    description: 'Antrean picking dengan invoice_picking unik, prioritas area (Warehouse -> Kolian -> Blok F), dan deteksi under/over-pick.',
    keywords: ['picking', 'picker', 'invoice_picking', 'antrean picking', 'ambil barang']
  },
  {
    page: 'pengiriman',
    label: 'Pengiriman & Distribusi Store',
    area: 'Outbound',
    description: 'Pengecekan Surat Jalan, laporan pengiriman store, trip armada, dan handover paket ekspedisi.',
    keywords: ['pengiriman', 'distribusi', 'surat jalan', 'sj', 'trip', 'handover', 'kurir']
  },
  {
    page: 'pesanan_saya',
    label: 'Pesanan & Manual Shipment',
    area: 'Order & Store',
    description: 'Order Manual Shipment, Split Fulfil, Form Alteration/Permak, Shopee, Website, dan IG Live.',
    keywords: ['pesanan', 'manual shipment', 'order', 'alteration', 'permak', 'shopee', 'ig live', 'resi', 'split']
  },
  {
    page: 'pusat_resolusi',
    label: 'Pusat Resolusi (Retur Barang)',
    area: 'Resolusi',
    description: 'Tiket retur barang (RTR-...) 3 tahap (Baru -> Diproses -> Selesai), cetak Label A6 & Picking List produk pengganti.',
    keywords: ['resolusi', 'retur', 'rtr', 'tukar barang', 'komplain']
  },
  {
    page: 'perbaikan',
    label: 'Perbaikan (Cuci, Permak, Defect, Sortir)',
    area: 'Quality',
    description: 'Antrean barang perbaikan di lokasi CC, PMK, DF, dan SORTIR (dikecualikan dari picking otomatis).',
    keywords: ['perbaikan', 'cuci', 'permak', 'defect', 'sortir', 'cc', 'pmk', 'df']
  },
  {
    page: 'peminjaman',
    label: 'Peminjaman Barang (SPS/Studio)',
    area: 'Operasional',
    description: 'Pencatatan dan pemantauan barang dipinjam untuk foto studio, live, atau keperluan internal.',
    keywords: ['peminjaman', 'pinjam', 'sps', 'studio']
  },
  {
    page: 'katalog_produk',
    label: 'Katalog Produk & Master SKU',
    area: 'Master Data',
    description: 'Katalog batch rilis produk, lookup Master Produk, varian warna/size resmi.',
    keywords: ['katalog', 'master produk', 'sku', 'harga', 'varian']
  },
  {
    page: 'rekap_tagihan_jne',
    label: 'Rekap Tagihan JNE',
    area: 'Finance & Ekspedisi',
    description: 'Rekapitulasi tagihan ongkir JNE, pencocokan resi, dan audit selisih ongkir.',
    keywords: ['jne', 'tagihan', 'ongkir', 'ekspedisi']
  },
  {
    page: 'agenda',
    label: 'Agenda, Project & Catatan Tim',
    area: 'Kolaborasi',
    description: 'Kalender agenda tim, project tracker dengan deadline, delegasi tugas, dan sticky notes.',
    keywords: ['agenda', 'kalender', 'project', 'catatan', 'notes', 'deadline']
  },
  {
    page: 'live_chat',
    label: 'Live Chat Internal & CS',
    area: 'Kolaborasi',
    description: 'Komunikasi real-time antar tim gudang, store, dan Customer Service.',
    keywords: ['chat', 'live chat', 'pesan', 'cs']
  },
  {
    page: 'cetak_label',
    label: 'Cetak Label & Barcode',
    area: 'Utilitas Cetak',
    description: 'Cetak Label Paket Thermal A6, Barcode SKU, Struk Thermal 58/80mm, dan CSV DealPOS.',
    keywords: ['cetak', 'label', 'barcode', 'thermal', 'a6', 'struk', 'csv']
  },
  {
    page: 'karyawan',
    label: 'HR — Karyawan & Direktori',
    area: 'HR & Admin',
    description: 'Direktori karyawan aktif, gaji pokok/tunjangan/kasbon, dan ringkasan KPI periode 26–25.',
    keywords: ['hr', 'karyawan', 'staff', 'pegawai', 'divisi']
  },
  {
    page: 'roster_shift',
    label: 'HR — Roster Jadwal Shift (1–Akhir Bulan)',
    area: 'HR & Admin',
    description: 'Penjadwalan shift karyawan berdasarkan bulan kalender tanggal 1 s/d akhir bulan (Shift 1/2/3a/3b, Libur, SKT/CTI/IJN).',
    keywords: ['roster', 'shift', 'jadwal shift', 'shift 3b', 'libur']
  },
  {
    page: 'presensi',
    label: 'HR — Presensi Karyawan',
    area: 'HR & Admin',
    description: 'Absensi harian masuk/pulang dan pemantauan KPI periode 26–25.',
    keywords: ['presensi', 'absen', 'absensi', 'jam masuk', 'jam pulang']
  },
  {
    page: 'hr_rekap',
    label: 'HR — Rekap Absensi, KPI & Kalkulasi Gaji (26–25)',
    area: 'HR & Admin',
    description: 'Rekap kehadiran, KPI Absensi, dan Kalkulasi Gaji Bulanan (siklus 26 bulan lalu s/d 25 bulan berjalan) beserta Slip Gaji & Ekspor Excel.',
    keywords: ['rekap hr', 'gaji', 'payroll', 'slip gaji', 'kpi', 'kalkulasi gaji', 'potongan', '26', '25']
  },
  {
    page: 'hr_approval',
    label: 'HR — Approval Lembur, Cuti & Izin',
    area: 'HR & Admin',
    description: 'Persetujuan pengajuan lembur, cuti, dan izin pulang awal.',
    keywords: ['approval', 'lembur', 'cuti', 'izin', 'pulang awal']
  },
  {
    page: 'popup_produksi_input',
    permissionPage: 'produksi',
    label: 'Popup Form Input Penerimaan Produksi',
    area: 'Produksi',
    description: 'Membuka langsung popup Form Input Penerimaan Produksi CMT & Kargo.',
    keywords: ['input produksi', 'form produksi', 'input penerimaan', 'form penerimaan', 'input kargo', 'input cmt', 'popup produksi']
  },
  {
    page: 'popup_hitung_ulang',
    permissionPage: 'produksi',
    label: 'Popup Audit Hitung Ulang Produksi',
    area: 'Produksi',
    description: 'Membuka langsung popup Audit Hitung Ulang kode produksi.',
    keywords: ['hitung ulang', 'audit hitung ulang', 'recount', 'popup hitung ulang']
  },
  {
    page: 'inventory_cart',
    permissionPage: 'inventory',
    label: 'Keranjang Order Inventory',
    area: 'Gudang',
    description: 'Membuka Inventory dan langsung menampilkan Keranjang Order Picking.',
    keywords: ['keranjang', 'keranjang order', 'cart', 'keranjang picking', 'keranjang inventory']
  },
  {
    page: 'cetak_barcode',
    permissionPage: 'cetak_label',
    label: 'Cetak Barcode SKU',
    area: 'Utilitas Cetak',
    description: 'Membuka tab Cetak Barcode SKU produk.',
    keywords: ['cetak barcode', 'print barcode', 'barcode sku']
  },
  {
    page: 'pengaturan_sistem',
    label: 'Pengaturan Sistem & Akun',
    area: 'Sistem',
    description: 'Manajemen akun, hak akses, konfigurasi aplikasi, dan pembaruan sistem.',
    keywords: ['pengaturan', 'pengaturan sistem', 'setting', 'settings', 'konfigurasi', 'hak akses', 'user']
  }
];

export const EXTENDED_AI_TOOL_DECLARATIONS = [
  {
    name: 'query_wms_knowledge_and_sop',
    description:
      'Menjawab pertanyaan QnA seputar cara pakai fitur WMS, SOP operasional (Stock Opname, Prioritas Picking, Retur Barang, Manual Shipment, Alteration/Permak, DealPOS, Scanner, Produksi), serta mencari panduan dari database FAQ resmi WMS.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: {
          type: 'STRING',
          description: 'Kata kunci pertanyaan atau topik fitur/SOP (contoh: "stock opname", "split fulfil", "alteration", "prioritas rak", "retur barang", "cara cetak label")'
        }
      },
      required: ['topic']
    }
  },
  {
    name: 'query_loading_dock_and_packing',
    description:
      'Mengecek status antrean Loading Dock, batch packing aktif, atau status persiapan barang keluar di area packing/dock.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          description: 'Filter status opsional (contoh: "open", "packing", "ready", "completed", atau kosongkan untuk semua)'
        },
        keyword: {
          type: 'STRING',
          description: 'Kata kunci pencarian opsional (kode batch, nama store, no SJ, atau PIC)'
        }
      }
    }
  },
  {
    name: 'query_distribusi_and_pengiriman',
    description:
      'Mengecek data Distribusi Surat Jalan (SJ), Laporan Pengiriman ke Store, Trip Armada pengiriman, Handover Paket ke kurir/ekspedisi, serta Penerimaan Paket Masuk & Mutasi Store.',
    parameters: {
      type: 'OBJECT',
      properties: {
        mode: {
          type: 'STRING',
          description:
            'Jenis data: "pengiriman_store" (laporan pengiriman store), "trip_armada" (trip pengiriman), "distribusi_sj" (distribusi surat jalan), "handover_paket" (serah terima kurir), "penerimaan_paket" (paket masuk), "mutasi_store" (tarikan/mutasi dari store), atau "all" (ringkasan semua).'
        },
        keyword: {
          type: 'STRING',
          description: 'Kata kunci opsional (nama store, nomor SJ, ekspedisi, resi, atau driver)'
        },
        start_date: {
          type: 'STRING',
          description: 'Filter tanggal mulai YYYY-MM-DD (opsional)'
        },
        end_date: {
          type: 'STRING',
          description: 'Filter tanggal akhir YYYY-MM-DD (opsional)'
        }
      }
    }
  },
  {
    name: 'query_all_order_channels',
    description:
      'Mengecek ringkasan & daftar pesanan lintas kanal: Manual Shipment, Alteration/Permak, Shopee, Website, dan IG Live.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channel: {
          type: 'STRING',
          description:
            'Filter kanal: "all", "manual_shipment", "alteration", "shopee", "website", atau "ig_live". Default "all".'
        },
        status: {
          type: 'STRING',
          description: 'Filter status pesanan opsional (misal: "pending", "diproses", "dikirim", "selesai", "batal")'
        },
        keyword: {
          type: 'STRING',
          description: 'Kata kunci pencarian (nama customer, order ID, store, produk, atau nomor resi)'
        }
      }
    }
  },
  {
    name: 'query_so_and_putaway',
    description:
      'Mengecek antrean Stock Opname (SO) yang pending/sudah diapprove serta daftar tugas Putaway penataan barang ke rak.',
    parameters: {
      type: 'OBJECT',
      properties: {
        mode: {
          type: 'STRING',
          description: 'Pilih "so" (antrean Stock Opname), "putaway" (tugas Putaway), atau "both" (keduanya). Default "both".'
        },
        status: {
          type: 'STRING',
          description: 'Filter status opsional (misal: "pending", "approved", "in_progress", "completed")'
        },
        location_keyword: {
          type: 'STRING',
          description: 'Filter lokasi rak/area opsional (misal: "A012", "TRANSIT", "R0")'
        }
      }
    }
  },
  {
    name: 'query_store_help_tickets',
    description:
      'Mengecek daftar tiket kendala / permintaan bantuan dari tim Store (Store Help Tickets) beserta status penyelesaiannya.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          description: 'Filter status tiket opsional (misal: "open", "in_progress", "resolved")'
        },
        store_keyword: {
          type: 'STRING',
          description: 'Filter nama store atau order ID (opsional)'
        }
      }
    }
  },
  {
    name: 'get_executive_daily_summary',
    description:
      'Menyusun ringkasan operasional harian lintas modul WMS (Penerimaan Produksi hari ini, Antrean Picking, Pengiriman Store, Tiket Retur aktif, Putaway aktif, Perbaikan aktif, dan Pengajuan HR pending jika punya akses HR). Cocok untuk pertanyaan seperti "bagaimana kondisi gudang hari ini?", "ringkasan harian", atau "laporan eksekutif".',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: {
          type: 'STRING',
          description: 'Tanggal target YYYY-MM-DD (opsional, default hari ini)'
        }
      }
    }
  },
  {
    name: 'validate_items_against_master',
    description:
      'Memvalidasi daftar produk/SKU/size hasil impor atau bacaan lampiran (Excel/CSV/PDF/Foto) terhadap database Master Produk resmi & stok rak live. Mendeteksi anomali nama/size, SKU tidak ditemukan, serta menampilkan stok fisik & DealPOS tiap item agar siap diekspor ke Excel/CSV/PDF.',
    parameters: {
      type: 'OBJECT',
      properties: {
        items: {
          type: 'ARRAY',
          description: 'Daftar item yang diekstrak dari lampiran/pesan user untuk divalidasi',
          items: {
            type: 'OBJECT',
            properties: {
              sku: { type: 'STRING', description: 'Kode SKU jika ada di file' },
              query: { type: 'STRING', description: 'Nama produk / warna / varian jika tidak ada SKU' },
              size: { type: 'STRING', description: 'Ukuran (S/M/L/XL/All Size) jika disebutkan' },
              qty: { type: 'NUMBER', description: 'Jumlah qty pada dokumen (opsional)' }
            }
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'query_pengecekan_sj',
    description:
      'Membaca riwayat Pengecekan Surat Jalan (pengecekan_sj — Pengiriman ke Store maupun Penerimaan/Tarikan) untuk memeriksa status komparasi (COCOK vs SELISIH), rincian item selisih kurang/lebih per SKU, serta SJ yang perlu di-Share ke Tugas Picking. Hemat egress via SWR & IndexedDB watermark.',
    parameters: {
      type: 'OBJECT',
      properties: {
        keyword: {
          type: 'STRING',
          description: 'Kata kunci opsional: nomor SJ, nama store asal/tujuan, nama produk/SKU, atau nama petugas'
        },
        status_komparasi: {
          type: 'STRING',
          description: 'Filter status komparasi: "SELISIH", "COCOK", atau "all" (default "all")'
        },
        tipe_import: {
          type: 'STRING',
          description: 'Filter jenis pengecekan: "Pengiriman", "Penerimaan", atau "all"'
        },
        only_shortage: {
          type: 'BOOLEAN',
          description: 'Jika true, fokus tampilkan SJ dan item dengan selisih kurang (qty_terima < qty_sj)'
        },
        start_date: {
          type: 'STRING',
          description: 'Filter tanggal mulai YYYY-MM-DD (opsional)'
        },
        end_date: {
          type: 'STRING',
          description: 'Filter tanggal akhir YYYY-MM-DD (opsional)'
        }
      }
    }
  },
  {
    name: 'trace_wms_entity',
    description:
      'Investigator & Pelacak 360° Lintas Modul WMS. Gunakan tool ini saat pengguna ingin melacak alur/status/akar masalah secara menyeluruh dari SATU entitas: Nomor Surat Jalan (SJ), invoice_picking (WA...), Order ID (MS.../AR-.../RTR-...), No Resi, Kode Produksi (mis. 6612), Lokasi Rak (mis. A012), atau Nama Produk/SKU. Otomatis menyatukan fakta lintas tabel (Stok, Log Mutasi, Picking, Pengecekan SJ, Pengiriman, Manual Shipment, Retur, Produksi, QC, Perbaikan, Peminjaman) dalam 1 panggilan.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Identifier atau kata kunci entitas yang ingin dilacak (contoh: "SJ-1234", "MS2026...", "RTR-...", "JP123456", "6612", "A012", atau "Ruth Top Cherry M")'
        },
        entity_hint: {
          type: 'STRING',
          description: 'Opsional petunjuk jenis entitas: "auto", "sj", "order", "resi", "product", "production_code", atau "location" (default "auto")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'analyze_hr_kpi_and_payroll',
    description:
      'Khusus akun HR & Superadmin: Menjalankan mesin resmi Kalkulasi Gaji Bulanan (hrPayrollUtils — siklus wajib tanggal 26 bulan sebelumnya s/d 25 bulan berjalan, sementara Jadwal Shift tetap 1–akhir bulan) dan Analisis KPI Absensi (kpiCalculator — akurat untuk Shift 1/2/3a/3b, cutoff hari berjalan, SKT/CTI/IJN vs BOLOS/ALPHA). Gunakan untuk pertanyaan hitung gaji, slip gaji, total payroll, potongan bolos/telat/kasbon, ranking KPI, atau analisa penyebab skor KPI karyawan.',
    parameters: {
      type: 'OBJECT',
      properties: {
        payroll_month: {
          type: 'STRING',
          description: 'Target bulan periode gaji format YYYY-MM, contoh: "2026-11" untuk periode November (26 Okt – 25 Nov 2026). Kosongkan untuk otomatis memakai periode gaji 26–25 yang sedang aktif.'
        },
        mode: {
          type: 'STRING',
          description: 'Fokus analisis: "both" (KPI + Gaji lengkap), "payroll" (kalkulasi & slip gaji), "kpi" (ranking & diagnosa KPI absensi), atau "anomalies" (karyawan paling sering telat/bolos/skor KPI rendah). Default "both".'
        },
        employee_keyword: {
          type: 'STRING',
          description: 'Opsional: filter nama karyawan, NIK, atau divisi tertentu untuk bedah detail slip gaji & diagnosa KPI-nya'
        },
        potongan_bolos_mode: {
          type: 'STRING',
          description: 'Mode potongan bolos: "proporsional" (default), "nominal", atau "tanpa_potongan"'
        },
        potongan_bolos_nominal: {
          type: 'NUMBER',
          description: 'Nominal potongan per hari bolos jika potongan_bolos_mode = "nominal"'
        },
        potongan_terlambat_per_kejadian: {
          type: 'NUMBER',
          description: 'Nominal potongan per kejadian terlambat (default 0)'
        },
        sertakan_potongan_kasbon: {
          type: 'BOOLEAN',
          description: 'Jika true, saldo_kasbon otomatis dipotong pada kalkulasi gaji'
        }
      }
    }
  },
  {
    name: 'open_wms_module_shortcut',
    description:
      'MENGEKSEKUSI LANGSUNG perintah membuka/menavigasi ke menu, halaman, atau popup modul WMS di layar pengguna (otomatis pindah halaman / membuka popup Scanner, Form Input Produksi, Hitung Ulang, Keranjang Order, Inventory, Picking, Pengiriman/Pengecekan SJ, Manual Shipment, Retur, Stock Opname, HR Rekap/Kalkulasi Gaji, Pengaturan, dll.) sekaligus menampilkan tombol pintasan di chat. WAJIB dipanggil setiap kali pengguna meminta membuka atau pindah ke menu/halaman/popup tertentu!',
    parameters: {
      type: 'OBJECT',
      properties: {
        page_id: {
          type: 'STRING',
          description:
            'ID halaman/popup WMS: dashboard, inventory, inventory_cart, scanner, stock_opname, operasi_stok, mutasi_log, produksi, popup_produksi_input, popup_hitung_ulang, trello_up, penerimaan_barang, loading_dock, picking_tasks, pengiriman, pesanan_saya, pusat_resolusi, perbaikan, peminjaman, katalog_produk, rekap_tagihan_jne, agenda, live_chat, cetak_label, cetak_barcode, karyawan, roster_shift, presensi, hr_rekap, hr_approval, pengaturan_sistem'
        },
        sub_tab: {
          type: 'STRING',
          description: 'Opsional: kode produksi untuk popup_hitung_ulang atau nama sub-tab spesifik'
        },
        auto_execute: {
          type: 'BOOLEAN',
          description: 'Default true (langsung eksekusi buka menu/popup di layar sekarang juga). Set false hanya jika sekadar menyarankan tombol pintasan tanpa langsung pindah layar.'
        },
        reason: {
          type: 'STRING',
          description: 'Keterangan singkat tujuan membuka halaman tersebut'
        }
      },
      required: ['page_id']
    }
  },
  {
    name: 'report_ai_capability_gap',
    description:
      'WAJIB dipanggil ketika pengguna meminta sebuah tugas, otomasi, integrasi, analisis khusus, atau aksi pada WMS yang TIDAK DAPAT dikerjakan oleh tool AI yang tersedia saat ini. Tool ini menyimpan dokumen laporan spesifikasi pengembangan ke backlog Supabase agar otomatis dibaca dan dikembangkan oleh agen coding saat pull update.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Judul ringkas kapabilitas/fitur AI yang dibutuhkan (maks 100 karakter)'
        },
        user_prompt: {
          type: 'STRING',
          description: 'Ringkasan permintaan asli dari pengguna'
        },
        module_area: {
          type: 'STRING',
          description: 'Area/modul WMS terkait (contoh: "Produksi", "Inventory", "Pengiriman", "HR", "Pusat Resolusi", "Export/Import")'
        },
        reason_cannot_execute: {
          type: 'STRING',
          description: 'Penjelasan jelas mengapa AI saat ini belum bisa mengeksekusi permintaan tersebut'
        },
        proposed_tool_or_feature: {
          type: 'STRING',
          description: 'Rekomendasi nama tool baru, endpoint, atau integrasi yang perlu dibangun oleh agen coding'
        },
        expected_behavior: {
          type: 'STRING',
          description: 'Output atau perilaku yang diharapkan pengguna setelah fitur ini dikembangkan'
        },
        priority: {
          type: 'STRING',
          description: 'Tingkat prioritas: "high", "medium", atau "low"'
        }
      },
      required: [
        'title',
        'user_prompt',
        'module_area',
        'reason_cannot_execute',
        'proposed_tool_or_feature',
        'expected_behavior'
      ]
    }
  }
];

function getLocalYmd(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function resolveCatalogList(): Promise<ProductItem[]> {
  const map = getGlobalProductCatalogMap();
  if (map && map.size > 0) return Array.from(map.values());
  try {
    const idb = await getAllProductsFromLocalDb();
    if (Array.isArray(idb) && idb.length > 0) {
      setGlobalProductCatalog(idb);
      return idb;
    }
  } catch {
    // ignore
  }
  return [];
}

function matchesDateRange(rawDate: any, startDate?: string, endDate?: string): boolean {
  if (!startDate && !endDate) return true;
  const s = String(rawDate || '').slice(0, 10);
  if (!s) return false;
  if (startDate && s < startDate) return false;
  if (endDate && s > endDate) return false;
  return true;
}

async function execQueryWmsKnowledgeAndSop(args: any, ctx: ExtendedToolExecutionContext) {
  const topic = String(args?.topic || '').toLowerCase().trim();
  const tokens = topic
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const scoreText = (haystack: string): number => {
    if (!topic) return 1;
    const h = haystack.toLowerCase();
    let score = 0;
    if (h.includes(topic)) score += 10;
    for (const tk of tokens) {
      if (h.includes(tk)) score += 3;
    }
    return score;
  };

  const matchedModules = WMS_MODULE_CATALOG.map((m) => ({
    m,
    score: scoreText(`${m.label} ${m.area} ${m.description} ${m.keywords.join(' ')}`)
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.m);

  const matchedPlaybooks = WMS_WORKFLOW_PLAYBOOKS.map((pb) => ({
    pb,
    score: scoreText(`${pb.title} ${pb.area} ${pb.keywords.join(' ')} ${pb.steps.join(' ')} ${pb.invariants.join(' ')}`)
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.pb);

  const matchedSop = WMS_ENHANCED_SOP_RULES.map((s) => ({
    s,
    score: scoreText(`${s.topic} ${s.keywords.join(' ')} ${s.summary}`)
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => ({ topic: x.s.topic, summary: x.s.summary }));

  let matchedFaqs: Array<{ category: string; question: string; answer: string }> = [];
  try {
    const allFaqs = await fetchStoreFaqs();
    const isStore = ctx.aiRole === 'store';
    matchedFaqs = (allFaqs || [])
      .filter((faq) => !(isStore && faq.target_audience === 'admin'))
      .map((faq) => ({
        faq,
        score: scoreText(`${faq.category} ${faq.question} ${faq.answer} ${faq.answer_store || ''} ${faq.answer_admin || ''}`)
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ faq }) => ({
        category: faq.category,
        question: faq.question,
        answer: isStore ? faq.answer_store || faq.answer : faq.answer_admin || faq.answer
      }));
  } catch {
    // ignore FAQ fetch failure
  }

  return {
    topik: topic || 'semua',
    role_pengguna: ctx.aiRole,
    alur_kerja_end_to_end: matchedPlaybooks.map((pb) => ({
      judul: pb.title,
      area: pb.area,
      tabel_terkait: pb.tables,
      langkah_alur: pb.steps,
      invarian_wajib: pb.invariants
    })),
    modul_terkait: matchedModules.map((m) => ({
      page_id: m.page,
      nama_modul: m.label,
      area: m.area,
      fungsi: m.description
    })),
    aturan_sop_wms:
      matchedSop.length > 0
        ? matchedSop
        : WMS_ENHANCED_SOP_RULES.slice(0, 5).map((s) => ({ topic: s.topic, summary: s.summary })),
    faq_resmi_wms: matchedFaqs,
    catatan_peran:
      ctx.aiRole === 'store'
        ? 'Berikan panduan strictly dari sudut pandang Store PIC (jangan suruh Store klik tombol khusus Admin).'
        : 'Berikan panduan sesuai SOP resmi & workflow end-to-end WMS Chocochips.'
  };
}

async function execQueryLoadingDockAndPacking(args: any) {
  const statusFilter = String(args?.status || '').toLowerCase().trim();
  const keyword = String(args?.keyword || '').toLowerCase().trim();

  const [batchesRes, pickingRes] = await Promise.allSettled([
    supabaseFetch<any[]>(
      'loading_dock_batches',
      'GET',
      null,
      'select=*&order=created_at.desc&limit=40'
    ),
    fetchPickingListFromSupabase()
  ]);

  const rawBatches = batchesRes.status === 'fulfilled' && Array.isArray(batchesRes.value) ? batchesRes.value : [];
  const filteredBatches = rawBatches
    .filter((b: any) => {
      if (statusFilter && !String(b.status || '').toLowerCase().includes(statusFilter)) return false;
      if (keyword) {
        const hay = JSON.stringify(b).toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    })
    .slice(0, 20)
    .map((b: any) => ({
      id: b.id,
      kode_batch: b.batch_code || b.kode_batch || b.no_batch || b.id,
      status: b.status || '-',
      tujuan: b.destination || b.store_tujuan || b.tujuan || '-',
      pic: b.pic_name || b.pic || b.created_by || '-',
      total_koli: b.total_koli ?? b.koli ?? '-',
      created_at: b.created_at || '-'
    }));

  const pickingItems = pickingRes.status === 'fulfilled' && Array.isArray(pickingRes.value) ? pickingRes.value : [];
  const isCompletedPicking = (statusVal: any) =>
    ['selesai', 'done', 'completed', 'ready', 'packed'].includes(String(statusVal || '').toLowerCase().trim());
  const isCancelledPicking = (statusVal: any) =>
    ['batal', 'cancelled', 'canceled'].includes(String(statusVal || '').toLowerCase().trim());

  const packingReadyCount = pickingItems.filter((p: any) => isCompletedPicking(p.status)).length;
  const pickingOpenCount = pickingItems.filter(
    (p: any) => !isCompletedPicking(p.status) && !isCancelledPicking(p.status)
  ).length;

  return {
    total_batch_ditemukan: filteredBatches.length,
    ringkasan_picking_ke_packing: {
      picking_aktif: pickingOpenCount,
      siap_atau_selesai_packing: packingReadyCount
    },
    daftar_batch_loading_dock: filteredBatches
  };
}

async function execQueryDistribusiAndPengiriman(args: any) {
  const mode = String(args?.mode || 'all').toLowerCase().trim();
  const keyword = String(args?.keyword || '').toLowerCase().trim();
  const startDate = args?.start_date ? String(args.start_date).slice(0, 10) : undefined;
  const endDate = args?.end_date ? String(args.end_date).slice(0, 10) : undefined;

  const out: Record<string, any> = { mode, filter: { keyword: keyword || null, startDate: startDate || null, endDate: endDate || null } };

  const matchKw = (obj: any) => !keyword || JSON.stringify(obj).toLowerCase().includes(keyword);

  const tasks: Promise<void>[] = [];

  if (mode === 'all' || mode === 'pengiriman_store') {
    tasks.push(
      fetchPengirimanStoreReports()
        .then((list) => {
          const filtered = (list || []).filter(
            (r) => matchKw(r) && matchesDateRange(r.tanggal_laporan, startDate, endDate)
          );
          out.pengiriman_store = {
            total: filtered.length,
            total_koli: filtered.reduce((acc, r) => acc + Number(r.total_koli || 0), 0),
            items: filtered.slice(0, 15).map((r) => ({
              id: r.id,
              store_tujuan: r.store_tujuan,
              tanggal: r.tanggal_laporan,
              total_item: r.total_item_count,
              total_koli: r.total_koli,
              pic: r.pic_nama,
              status: r.status
            }))
          };
        })
        .catch(() => {
          out.pengiriman_store = { total: 0, items: [] };
        })
    );
  }

  if (mode === 'all' || mode === 'trip_armada') {
    tasks.push(
      fetchPengirimanStoreTrips()
        .then((list) => {
          const filtered = (list || []).filter(
            (t) => matchKw(t) && matchesDateRange(t.tanggal_kirim, startDate, endDate)
          );
          out.trip_armada = {
            total: filtered.length,
            items: filtered.slice(0, 15).map((t) => ({
              id: t.id,
              tanggal_kirim: t.tanggal_kirim,
              waktu_kirim: t.waktu_kirim,
              driver_pengirim: t.dikirim_oleh,
              store_tujuan: t.store_tujuan_list,
              total_koli: t.total_koli,
              armada: t.armada || '-',
              no_polisi: t.no_polisi || '-'
            }))
          };
        })
        .catch(() => {
          out.trip_armada = { total: 0, items: [] };
        })
    );
  }

  if (mode === 'all' || mode === 'distribusi_sj') {
    tasks.push(
      Promise.allSettled([
        supabaseFetch<any[]>('distribusi_sj', 'GET', null, 'select=*&order=created_at.desc&limit=60'),
        fetchSjShippingOverrides()
      ]).then(([sjRes, ovRes]) => {
        const list = sjRes.status === 'fulfilled' && Array.isArray(sjRes.value) ? sjRes.value : [];
        const overrides = ovRes.status === 'fulfilled' && ovRes.value ? ovRes.value : {};
        const filtered = list.filter(
          (row: any) => matchKw(row) && matchesDateRange(row.tanggal || row.created_at, startDate, endDate)
        );
        out.distribusi_sj = {
          total: filtered.length,
          total_shipping_overrides: Object.keys(overrides).length,
          items: filtered.slice(0, 15).map((r: any) => ({
            no_sj: r.no_sj || r.nomor_sj || r.id,
            store: r.store || r.tujuan || r.store_tujuan || '-',
            tanggal: r.tanggal || String(r.created_at || '').slice(0, 10),
            status: r.status || '-',
            total_qty: r.total_qty ?? r.qty ?? '-'
          }))
        };
      })
    );
  }

  if (mode === 'all' || mode === 'handover_paket') {
    tasks.push(
      fetchHandoverPaketList()
        .then((list) => {
          const filtered = (list || []).filter(
            (h) => matchKw(h) && matchesDateRange(h.tgl_kirim, startDate, endDate)
          );
          out.handover_paket = {
            total: filtered.length,
            total_paket: filtered.reduce((acc, h) => acc + Number(h.total_paket || 0), 0),
            items: filtered.slice(0, 15).map((h) => ({
              no_manifest: h.no_manifest,
              tgl_kirim: h.tgl_kirim,
              ekspedisi: h.ekspedisi,
              driver_kurir: h.driver_kurir,
              total_paket: h.total_paket,
              pic: h.pic_nama,
              status: h.status
            }))
          };
        })
        .catch(() => {
          out.handover_paket = { total: 0, items: [] };
        })
    );
  }

  if (mode === 'all' || mode === 'penerimaan_paket') {
    tasks.push(
      fetchPenerimaanPaketList()
        .then((list) => {
          const filtered = (list || []).filter(
            (p) => matchKw(p) && matchesDateRange(p.tanggal_diterima, startDate, endDate)
          );
          out.penerimaan_paket = {
            total: filtered.length,
            items: filtered.slice(0, 15).map((p) => ({
              tanggal_diterima: p.tanggal_diterima,
              ekspedisi: p.ekspedisi,
              no_resi: p.no_resi || '-',
              pengirim: p.pengirim || '-',
              penerima_up: p.penerima_up || '-',
              qty_paket: p.qty_paket,
              pic: p.pic_nama
            }))
          };
        })
        .catch(() => {
          out.penerimaan_paket = { total: 0, items: [] };
        })
    );
  }

  if (mode === 'all' || mode === 'mutasi_store') {
    tasks.push(
      fetchMutasiStoreList()
        .then((list) => {
          const filtered = (list || []).filter(
            (m) => matchKw(m) && matchesDateRange(m.tanggal_diterima, startDate, endDate)
          );
          out.mutasi_store = {
            total: filtered.length,
            items: filtered.slice(0, 15).map((m) => ({
              tanggal_diterima: m.tanggal_diterima,
              asal_store: m.asal_store_nama,
              no_surat_jalan: m.no_surat_jalan || '-',
              kategori: m.kategori_produk || '-',
              up_tujuan: m.up_tujuan || '-',
              qty: `${m.qty} ${m.satuan_qty || ''}`.trim(),
              deskripsi: m.deskripsi
            }))
          };
        })
        .catch(() => {
          out.mutasi_store = { total: 0, items: [] };
        })
    );
  }

  await Promise.allSettled(tasks);
  return out;
}

async function execQueryAllOrderChannels(args: any, ctx: ExtendedToolExecutionContext) {
  const channel = String(args?.channel || 'all').toLowerCase().trim();
  const statusFilter = String(args?.status || '').toLowerCase().trim();
  const keyword = String(args?.keyword || '').toLowerCase().trim();
  const userStore = ctx.aiRole === 'store' ? String(ctx.session?.store_name || '').toLowerCase().trim() : '';

  const [msRes, igRes] = await Promise.allSettled([
    channel === 'ig_live' ? Promise.resolve([]) : fetchManualShipments(false),
    channel === 'all' || channel === 'ig_live'
      ? fetchIgLiveOrdersFromSupabase()
      : Promise.resolve([])
  ]);

  const rawMs = msRes.status === 'fulfilled' && Array.isArray(msRes.value) ? msRes.value : [];

  const filteredMs = rawMs.filter((r) => {
    const pengirim = String(r.nama_pengirim || '').toLowerCase();
    const isAlt = r.order_type === 'alteration_repair' || String(r.no_pesanan || '').toUpperCase().startsWith('AR-');
    if (userStore && !pengirim.includes(userStore)) return false;
    if (channel === 'alteration' && !isAlt) return false;
    if (channel === 'shopee' && !`${pengirim} ${r.notes_paket || ''} ${r.no_pesanan || ''}`.toLowerCase().includes('shopee')) return false;
    if (channel === 'website' && !`${pengirim} ${r.notes_paket || ''} ${r.no_pesanan || ''}`.toLowerCase().includes('web')) return false;
    if (channel === 'manual_shipment' && isAlt) return false;
    if (channel === 'ig_live') return false;
    if (statusFilter && !String(r.status || '').toLowerCase().includes(statusFilter)) return false;
    if (keyword) {
      const itemsText = (r.items || []).map((it) => `${it.sku} ${it.nama_produk} ${it.size} ${it.fulfillment || ''}`).join(' ');
      const hay = `${r.no_pesanan || ''} ${r.nama_pengirim || ''} ${r.nama_tujuan || ''} ${r.no_resi || ''} ${r.jasa_kirim || ''} ${r.no_transaksi_customer || ''} ${(r.no_transaksi_pengirim || []).join(' ')} ${itemsText}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });

  const rawIg = igRes.status === 'fulfilled' && Array.isArray(igRes.value) ? igRes.value : [];
  const filteredIg = rawIg.filter((o: any) => {
    if (statusFilter && !String(o.status || '').toLowerCase().includes(statusFilter)) return false;
    if (keyword && !JSON.stringify(o).toLowerCase().includes(keyword)) return false;
    return true;
  });

  const statusBreakdown: Record<string, number> = {};
  let pendingStoreSendToWh = 0;
  let waitingWhReceiveFromStore = 0;

  filteredMs.forEach((r) => {
    const st = String(r.status || 'diterima');
    statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
    const storeItems = (r.items || []).filter((it) => {
      const ff = String(it.fulfillment || '').toLowerCase();
      return ff && !ff.includes('gudang') && !ff.includes('marketplace') && !ff.includes('warehouse');
    });
    if (storeItems.length > 0 && st !== 'batal' && st !== 'dikirim' && st !== 'selesai') {
      const hasUnreceived = storeItems.some((it) => it.item_status !== 'sold_out' && it.item_status !== 'cancelled' && !it.received_at_warehouse);
      if (hasUnreceived) {
        const hasSentNote = Boolean(
          (r.history_logs || []).some((h) => String(h.action || '').toLowerCase().includes('kirim_ke_gudang') || String(h.note || '').toLowerCase().includes('dikirim ke gudang'))
        );
        if (hasSentNote) waitingWhReceiveFromStore++;
        else pendingStoreSendToWh++;
      }
    }
  });

  return {
    channel_filter: channel,
    manual_shipment_dan_kanal: {
      total: filteredMs.length,
      breakdown_status: statusBreakdown,
      store_belum_kirim_ke_gudang: pendingStoreSendToWh,
      store_sudah_kirim_menunggu_terima_wh: waitingWhReceiveFromStore,
      sampel_terbaru: filteredMs.slice(0, 20).map((r) => ({
        no_pesanan: r.no_pesanan || r.id,
        jenis: r.order_type === 'alteration_repair' ? 'Alteration / Permak' : 'Manual Shipment',
        store_pengirim: r.nama_pengirim || '-',
        customer: r.nama_tujuan || '-',
        jasa_kirim: r.jasa_kirim || '-',
        status: r.status || '-',
        no_resi: r.no_resi || 'Belum ada resi',
        total_pcs: (r.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0),
        created_at: String(r.created_at || '').slice(0, 16)
      }))
    },
    ig_live_orders: {
      total: filteredIg.length,
      sampel_terbaru: filteredIg.slice(0, 12).map((o: any) => ({
        no_pesanan: o.no_pesanan || o.id,
        customer: o.nama_pembeli || o.customer_name || o.username_ig || '-',
        status: o.status || '-',
        no_resi: o.no_resi || 'Belum ada resi',
        tanggal: o.tanggal || String(o.created_at || '').slice(0, 10)
      }))
    }
  };
}

async function execQuerySoAndPutaway(args: any) {
  const mode = String(args?.mode || 'both').toLowerCase().trim();
  const statusFilter = String(args?.status || '').toLowerCase().trim();
  const locKw = String(args?.location_keyword || '').toLowerCase().trim();

  const out: Record<string, any> = { mode };

  const tasks: Promise<void>[] = [];

  if (mode === 'both' || mode === 'so') {
    tasks.push(
      fetchStockOpnameQueue()
        .then((list: any[]) => {
          const filtered = (list || []).filter((so: any) => {
            if (statusFilter && !String(so.status || '').toLowerCase().includes(statusFilter)) return false;
            if (locKw && !JSON.stringify(so).toLowerCase().includes(locKw)) return false;
            return true;
          });
          out.stock_opname = {
            total: filtered.length,
            pending: filtered.filter((s: any) => String(s.status || '').toLowerCase() === 'pending').length,
            items: filtered.slice(0, 15).map((s: any) => ({
              invoice: s.invoice || s.no_invoice || s.id,
              lokasi: s.lokasi || s.locations || '-',
              status: s.status || 'pending',
              pic: s.pic || s.operator || s.created_by || '-',
              total_item: s.total_items ?? (Array.isArray(s.items) ? s.items.length : '-'),
              tanggal: s.created_at || s.tanggal || '-'
            }))
          };
        })
        .catch(() => {
          out.stock_opname = { total: 0, items: [] };
        })
    );
  }

  if (mode === 'both' || mode === 'putaway') {
    tasks.push(
      fetchPutawayTasks()
        .then((tasksList) => {
          const filtered = (tasksList || []).filter((pt) => {
            if (statusFilter && !String(pt.status || '').toLowerCase().includes(statusFilter)) return false;
            if (locKw && !JSON.stringify(pt).toLowerCase().includes(locKw)) return false;
            return true;
          });
          out.putaway = {
            total: filtered.length,
            aktif: filtered.filter((p) => !['completed', 'done', 'cancelled'].includes(String(p.status || '').toLowerCase())).length,
            items: filtered.slice(0, 15).map((p) => ({
              invoice_putaway: p.invoice_putaway,
              source_area: p.source_area,
              source_locations: p.source_locations,
              status: p.status,
              created_by: p.created_by,
              active_operators: p.active_operators,
              total_sku: Array.isArray(p.items) ? p.items.length : 0,
              created_at: p.created_at
            }))
          };
        })
        .catch(() => {
          out.putaway = { total: 0, items: [] };
        })
    );
  }

  await Promise.allSettled(tasks);
  return out;
}

async function execQueryStoreHelpTickets(args: any, ctx: ExtendedToolExecutionContext) {
  const statusFilter = String(args?.status || '').toLowerCase().trim();
  const storeKw = String(args?.store_keyword || '').toLowerCase().trim();
  const ownStore = ctx.aiRole === 'store' ? String(ctx.session?.store_name || '').toLowerCase().trim() : '';

  const tickets = await fetchStoreHelpTickets();
  const filtered = (tickets || []).filter((t) => {
    if (ownStore && !String(t.store_name || '').toLowerCase().includes(ownStore)) return false;
    if (statusFilter && !String(t.status || '').toLowerCase().includes(statusFilter)) return false;
    if (storeKw) {
      const hay = `${t.store_name} ${t.order_id || ''} ${t.question} ${t.category || ''}`.toLowerCase();
      if (!hay.includes(storeKw)) return false;
    }
    return true;
  });

  return {
    total_tiket: filtered.length,
    open_count: filtered.filter((t) => String(t.status || 'open').toLowerCase() !== 'resolved').length,
    tiket: filtered.slice(0, 20).map((t) => ({
      id: t.id,
      store: t.store_name,
      pic: t.pic_name || '-',
      kategori: t.category || '-',
      order_id: t.order_id || '-',
      pertanyaan: t.question,
      status: t.status || 'open',
      catatan_admin: t.admin_notes || '-',
      created_at: t.created_at || '-'
    }))
  };
}

async function execGetExecutiveDailySummary(args: any, ctx: ExtendedToolExecutionContext) {
  const targetDate = args?.date ? String(args.date).slice(0, 10) : getLocalYmd();
  const canHr = ctx.aiRole === 'superadmin' || ctx.aiRole === 'hr';

  const [prodRes, pickRes, shipRes, returRes, putawayRes, repairRes, cekSjRes, msRes, hrRes] = await Promise.allSettled([
    fetchPenerimaanProduksiFromSupabase(),
    fetchPickingListFromSupabase(),
    fetchPengirimanStoreReports(),
    fetchReturOrders(),
    fetchPutawayTasks(),
    fetchPerbaikanTicketsFromSupabase(),
    fetchPengecekanSJList(0, false),
    fetchManualShipments(false),
    canHr
      ? Promise.all([fetchLemburRecords(), fetchCutiRecords(), fetchIzinPulangAwalList()])
      : Promise.resolve(null)
  ]);

  const prodList = prodRes.status === 'fulfilled' && Array.isArray(prodRes.value) ? prodRes.value : [];
  const prodToday = prodList.filter(
    (p: any) => String(p.tanggal_penerimaan || p.tanggal || p.created_at || '').slice(0, 10) === targetDate
  );
  const prodTodayQty = prodToday.reduce((sum: number, p: any) => sum + Number(p.qty ?? p.total_qty ?? p.total_pcs ?? 0), 0);
  const prodTodaySj = new Set(prodToday.map((p: any) => p.no_surat_jalan).filter(Boolean)).size;

  const pickList = pickRes.status === 'fulfilled' && Array.isArray(pickRes.value) ? pickRes.value : [];
  const pickActive = pickList.filter(
    (p: any) => !['selesai', 'batal', 'done', 'completed', 'cancelled'].includes(String(p.status || '').toLowerCase().trim())
  );
  const pickActiveSj = new Set(pickActive.map((p: any) => p.no_sj).filter(Boolean)).size;

  const shipList = shipRes.status === 'fulfilled' && Array.isArray(shipRes.value) ? shipRes.value : [];
  const shipToday = shipList.filter((s) => String(s.tanggal_laporan || '').slice(0, 10) === targetDate);

  const cekSjList = cekSjRes.status === 'fulfilled' && Array.isArray(cekSjRes.value) ? cekSjRes.value : [];
  const cekSjToday = cekSjList.filter(
    (c) => String(c.tanggal_sj || c.created_at || '').slice(0, 10) === targetDate
  );
  const cekSjSelisihRecent = cekSjList.slice(0, 50).filter((c) => c.status_komparasi === 'SELISIH');

  const msList = msRes.status === 'fulfilled' && Array.isArray(msRes.value) ? msRes.value : [];
  const msOpen = msList.filter((m) => !['dikirim', 'selesai', 'diambil', 'batal'].includes(String(m.status || '').toLowerCase()));

  const returList = returRes.status === 'fulfilled' && Array.isArray(returRes.value) ? returRes.value : [];
  const returBaru = returList.filter((r: any) => String(r.status || '').toLowerCase() === 'diterima').length;
  const returDiproses = returList.filter((r: any) => String(r.status || '').toLowerCase() === 'diproses').length;

  const putawayList = putawayRes.status === 'fulfilled' && Array.isArray(putawayRes.value) ? putawayRes.value : [];
  const putawayActive = putawayList.filter((p) => !['completed', 'done', 'selesai', 'cancelled'].includes(String(p.status || '').toLowerCase()));

  const repairList = repairRes.status === 'fulfilled' && Array.isArray(repairRes.value) ? repairRes.value : [];
  const repairActive = repairList.filter((r: any) => {
    const t = String(r.tahap || r.status || '').toUpperCase();
    return !t.startsWith('SELESAI') && !['DONE', 'COMPLETED'].includes(t);
  });

  let hrSummary: any = undefined;
  if (canHr && hrRes.status === 'fulfilled' && Array.isArray(hrRes.value)) {
    const [lembur, cuti, izin] = hrRes.value;
    const isPending = (r: any) => {
      const st = String(r.status || '').toLowerCase().trim();
      return st === 'diajukan' || st === 'pending' || st === 'menunggu';
    };
    const activePayroll = getActivePayrollPeriod();
    hrSummary = {
      periode_gaji_aktif: `${activePayroll.label} (${activePayroll.startDate} s/d ${activePayroll.endDate})`,
      lembur_pending: (lembur || []).filter(isPending).length,
      cuti_pending: (cuti || []).filter(isPending).length,
      izin_pulang_awal_pending: (izin || []).filter(isPending).length
    };
  }

  return {
    tanggal: targetDate,
    produksi_hari_ini: {
      jumlah_baris_varian: prodToday.length,
      jumlah_surat_jalan: prodTodaySj,
      total_pcs_masuk: prodTodayQty
    },
    picking_gudang: {
      baris_picking_aktif: pickActive.length,
      jumlah_sj_picking_aktif: pickActiveSj,
      total_antrean_tercatat: pickList.length
    },
    pengecekan_sj: {
      dicek_hari_ini: cekSjToday.length,
      sj_selisih_dalam_50_terbaru: cekSjSelisihRecent.length
    },
    manual_shipment_dan_alteration: {
      pesanan_aktif_belum_kirim: msOpen.length,
      total_tercatat: msList.length
    },
    pengiriman_store_hari_ini: {
      jumlah_laporan: shipToday.length,
      total_koli: shipToday.reduce((acc, s) => acc + Number(s.total_koli || 0), 0)
    },
    pusat_resolusi_retur: {
      baru_menunggu: returBaru,
      sedang_diproses: returDiproses,
      total_tiket: returList.length
    },
    putaway_aktif: putawayActive.length,
    perbaikan_aktif: repairActive.length,
    ...(hrSummary ? { hr_approval_pending: hrSummary } : {})
  };
}

async function execValidateItemsAgainstMaster(args: any) {
  const rawItems = Array.isArray(args?.items) ? args.items.slice(0, 80) : [];
  if (rawItems.length === 0) {
    return { error: 'Daftar item untuk divalidasi kosong.' };
  }

  const catalog = await resolveCatalogList();
  const normalizedCatalog = catalog.map((p) => {
    const sku = String(p.k || (p as any).sku || '').trim();
    const nama = String(p.n || p.p || (p as any).nama || '').trim();
    const size = String(p.s || (p as any).size || '').trim();
    const dealposQty = Number(p.q ?? (p as any).stock ?? (p as any).stok_dealpos ?? 0);
    return {
      item: p,
      sku,
      nama,
      size,
      dealposQty,
      skuUpper: sku.toUpperCase(),
      searchKey: `${nama} ${size} ${sku}`.toLowerCase()
    };
  });

  const validatedRows: Array<{
    input: string;
    requested_size: string;
    requested_qty: number | null;
    status: 'VALID' | 'ANOMALI_SIZE' | 'TIDAK_DITEMUKAN';
    sku_resmi: string;
    nama_resmi_master: string;
    size_resmi_master: string;
    stok_dealpos: number;
    stok_fisik_total?: number;
    lokasi_rak?: string;
    catatan: string;
  }> = [];

  const matchedSkus: string[] = [];

  for (const raw of rawItems) {
    const skuIn = String(raw?.sku || '').trim().toUpperCase();
    const queryIn = String(raw?.query || '').trim();
    const sizeIn = String(raw?.size || '').trim().toUpperCase();
    const qtyIn = raw?.qty !== undefined && raw?.qty !== null && !Number.isNaN(Number(raw.qty)) ? Number(raw.qty) : null;

    let matchedEntry: (typeof normalizedCatalog)[number] | null = null;
    let note = '';

    if (skuIn) {
      const exact = lookupProductBySku(skuIn);
      if (exact && exact.found && exact.sku) {
        const foundCatalog = normalizedCatalog.find((c) => c.skuUpper === exact.sku.toUpperCase());
        matchedEntry = foundCatalog || {
          item: exact.masterItem || {
            k: exact.sku,
            n: exact.nama_produk,
            s: exact.size,
            q: exact.dealposQty
          },
          sku: exact.sku,
          nama: exact.nama_produk,
          size: exact.size,
          dealposQty: exact.dealposQty,
          skuUpper: exact.sku.toUpperCase(),
          searchKey: `${exact.nama_produk} ${exact.size} ${exact.sku}`.toLowerCase()
        };
      }
    }

    if (!matchedEntry && queryIn) {
      const tokens = queryIn
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2);
      const candidates = normalizedCatalog.filter((c) => tokens.every((t) => c.searchKey.includes(t)));
      if (candidates.length > 0) {
        if (sizeIn) {
          const exactSize = candidates.find(
            (c) => String(resolveProductDisplaySize(c.sku, c.size, c.nama) || '').toUpperCase() === sizeIn
          );
          matchedEntry = exactSize || candidates[0];
        } else {
          matchedEntry = candidates[0];
        }
      }
    }

    if (!matchedEntry) {
      validatedRows.push({
        input: skuIn || queryIn || '-',
        requested_size: sizeIn || '-',
        requested_qty: qtyIn,
        status: 'TIDAK_DITEMUKAN',
        sku_resmi: '-',
        nama_resmi_master: '-',
        size_resmi_master: '-',
        stok_dealpos: 0,
        catatan: 'Tidak cocok dengan Master Produk — perlu cek penulisan nama/SKU.'
      });
      continue;
    }

    const officialName = cleanProductName(matchedEntry.nama || '');
    const officialSize = resolveProductDisplaySize(matchedEntry.sku, matchedEntry.size, matchedEntry.nama) || '-';
    const sizeMismatch = Boolean(sizeIn && officialSize !== '-' && officialSize.toUpperCase() !== sizeIn);

    if (sizeMismatch) {
      note = `Size input (${sizeIn}) berbeda dengan size resmi Master Produk (${officialSize}).`;
    } else {
      note = 'Sesuai Master Produk.';
    }

    matchedSkus.push(matchedEntry.sku);
    validatedRows.push({
      input: skuIn || queryIn,
      requested_size: sizeIn || '-',
      requested_qty: qtyIn,
      status: sizeMismatch ? 'ANOMALI_SIZE' : 'VALID',
      sku_resmi: matchedEntry.sku,
      nama_resmi_master: officialName,
      size_resmi_master: officialSize,
      stok_dealpos: matchedEntry.dealposQty,
      catatan: note
    });
  }

  if (matchedSkus.length > 0) {
    try {
      const uniqueSkus = Array.from(new Set(matchedSkus));
      const stockRows = await fetchStockForSkus(uniqueSkus);
      const stockMap = new Map<string, typeof stockRows>();
      stockRows.forEach((s) => {
        const key = String(s.sku || '').trim().toUpperCase();
        if (!key) return;
        const list = stockMap.get(key) || [];
        list.push(s);
        stockMap.set(key, list);
      });
      validatedRows.forEach((row) => {
        if (row.sku_resmi === '-') return;
        const rowsForSku = stockMap.get(row.sku_resmi.toUpperCase()) || [];
        const totalFisik = rowsForSku.reduce((sum, s) => sum + Number(s.sisa_stok || 0), 0);
        const rakStr = rowsForSku
          .filter((s) => Number(s.sisa_stok || 0) !== 0)
          .map((s) => `${s.lokasi} (${s.sisa_stok})`)
          .join(', ');
        row.stok_fisik_total = totalFisik;
        row.lokasi_rak = rakStr || 'Kosong';
      });
    } catch {
      // ignore stock fetch failure
    }
  }

  const validCount = validatedRows.filter((r) => r.status === 'VALID').length;
  const anomalyCount = validatedRows.filter((r) => r.status === 'ANOMALI_SIZE').length;
  const notFoundCount = validatedRows.filter((r) => r.status === 'TIDAK_DITEMUKAN').length;

  return {
    ringkasan: {
      total_diperiksa: validatedRows.length,
      valid_master: validCount,
      anomali_size: anomalyCount,
      tidak_ditemukan: notFoundCount
    },
    hasil_validasi: validatedRows
  };
}

function resolveWmsModuleCatalogEntry(rawInput: string): {
  entry?: (typeof WMS_MODULE_CATALOG)[number];
  subTab?: string;
} {
  const cleaned = String(rawInput || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return {};

  const exactId = String(rawInput || '').toLowerCase().trim();
  const byExact = WMS_MODULE_CATALOG.find((m) => m.page === exactId);
  if (byExact) return { entry: byExact };

  // Alias khusus yang paling sering diucapkan pengguna
  const aliasRules: Array<{ test: RegExp; page: AiNavigationTargetPage; extractCode?: boolean }> = [
    { test: /\b(hitung\s*ulang|recount)\b/, page: 'popup_hitung_ulang', extractCode: true },
    { test: /\b(input\s*produksi|form\s*produksi|input\s*penerimaan|form\s*penerimaan|input\s*kargo|input\s*cmt)\b/, page: 'popup_produksi_input' },
    { test: /\b(keranjang|cart)\b/, page: 'inventory_cart' },
    { test: /\b(cetak\s*barcode|print\s*barcode)\b/, page: 'cetak_barcode' },
    { test: /\b(scanner|scan\s*barcode|scan\s*in|scan\s*out|scan\s*so|kamera\s*scan|^scan$)\b/, page: 'scanner' },
    { test: /\b(pengecekan\s*sj|cek\s*sj|distribusi|pengiriman|surat\s*jalan|trip\s*armada|handover)\b/, page: 'pengiriman' },
    { test: /\b(picking|antrean\s*picking|tugas\s*picking|picker)\b/, page: 'picking_tasks' },
    { test: /\b(kalkulasi\s*gaji|gaji|payroll|slip\s*gaji|rekap\s*hr|hr\s*rekap|rekap\s*absensi)\b/, page: 'hr_rekap' },
    { test: /\b(roster|jadwal\s*shift|shift)\b/, page: 'roster_shift' },
    { test: /\b(presensi|absensi|absen)\b/, page: 'presensi' },
    { test: /\b(approval|lembur|cuti|izin\s*pulang)\b/, page: 'hr_approval' },
    { test: /\b(karyawan|pegawai|staff\s*hr)\b/, page: 'karyawan' },
    { test: /\b(manual\s*shipment|pesanan\s*saya|pesanan|alteration|ig\s*live|shopee|order)\b/, page: 'pesanan_saya' },
    { test: /\b(retur|resolusi|pusat\s*resolusi|komplain)\b/, page: 'pusat_resolusi' },
    { test: /\b(stock\s*opname|opname|putaway|^so$)\b/, page: 'stock_opname' },
    { test: /\b(operasi\s*stok|kapasitas\s*rak|rak\s*kosong|purge)\b/, page: 'operasi_stok' },
    { test: /\b(mutasi|log\s*produk|log\s*mutasi)\b/, page: 'mutasi_log' },
    { test: /\b(inventory|inventori|denah\s*3d|stok\s*rak|stok)\b/, page: 'inventory' },
    { test: /\b(penerimaan\s*barang|paket\s*masuk|mutasi\s*store)\b/, page: 'penerimaan_barang' },
    { test: /\b(produksi|penerimaan\s*produksi|cmt|kargo)\b/, page: 'produksi' },
    { test: /\b(trello|trello\s*up)\b/, page: 'trello_up' },
    { test: /\b(loading\s*dock|packing)\b/, page: 'loading_dock' },
    { test: /\b(perbaikan|cuci|permak|defect|sortir)\b/, page: 'perbaikan' },
    { test: /\b(peminjaman|pinjam|sps)\b/, page: 'peminjaman' },
    { test: /\b(katalog|master\s*produk)\b/, page: 'katalog_produk' },
    { test: /\b(jne|tagihan\s*jne|rekap\s*jne)\b/, page: 'rekap_tagihan_jne' },
    { test: /\b(agenda|kalender|project|roadmap|catatan|notes|task)\b/, page: 'agenda' },
    { test: /\b(live\s*chat|chat)\b/, page: 'live_chat' },
    { test: /\b(cetak\s*label|label\s*a6|struk)\b/, page: 'cetak_label' },
    { test: /\b(pengaturan|setting|settings|konfigurasi)\b/, page: 'pengaturan_sistem' },
    { test: /\b(dashboard|beranda|home|utama)\b/, page: 'dashboard' }
  ];

  for (const rule of aliasRules) {
    if (rule.test.test(cleaned)) {
      const entry = WMS_MODULE_CATALOG.find((m) => m.page === rule.page);
      if (entry) {
        let subTab: string | undefined;
        if (rule.extractCode) {
          const codeMatch = cleaned.match(/\b(\d{3,6}(?:-\d+)?)\b/);
          if (codeMatch) subTab = codeMatch[1].toUpperCase();
        }
        return { entry, subTab };
      }
    }
  }

  // Fallback token scoring pada katalog
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  let bestEntry: (typeof WMS_MODULE_CATALOG)[number] | undefined;
  let bestScore = 0;
  for (const m of WMS_MODULE_CATALOG) {
    const hay = `${m.page.replace(/_/g, ' ')} ${m.label} ${m.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    if (m.keywords.some((kw) => cleaned === kw.toLowerCase())) score += 20;
    for (const tk of tokens) {
      if (m.keywords.some((kw) => kw.toLowerCase() === tk)) score += 6;
      else if (hay.includes(tk)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestEntry = m;
    }
  }

  return bestScore >= 4 ? { entry: bestEntry } : {};
}

/**
 * Fast-path deterministik untuk perintah navigasi murni (contoh: "Buka menu scanner",
 * "Buka halaman pengiriman", "Pindah ke HR rekap", "Buka keranjang order") agar
 * 100% langsung dieksekusi tanpa risiko ditolak model LLM dan hemat latensi/kuota.
 */
export function tryMatchDirectNavigationCommand(
  prompt: string,
  session?: UserSession | null
): {
  matched: boolean;
  shortcut?: AiNavigationShortcut;
  deniedMessage?: string;
} {
  const raw = String(prompt || '').trim();
  if (!raw || raw.length > 90 || raw.includes('\n')) return { matched: false };

  const lower = raw.toLowerCase();
  // Jangan intercept jika pengguna mengajukan pertanyaan data / analisis / aksi campuran
  // Kecualikan nama modul resmi seperti "hitung ulang", "hr rekap", "rekap hr", "rekap absensi", "rekap tagihan jne"
  const lowerWithoutModuleNames = lower
    .replace(/\b(hitung\s+ulang|hr\s+rekap|rekap\s+hr|rekap\s+absensi|rekap\s+tagihan\s+jne|rekap\s+jne|cek\s+sj|pengecekan\s+sj)\b/gi, ' ');
  const dataOrQuestionRe =
    /\?|(\b(cek|berapa|analisa|analisis|rekap|laporan|selisih|daftar|list|kenapa|mengapa|bagaimana|cara|apa|siapa|kapan|dimana|di\s*mana|buatkan|buat|siapkan|tambah|masukkan|hitung|lacak|cari|export|ekspor|download|bandingkan|audit|dan|serta|lalu|kemudian|sambil|sekalian)\b)/i;
  if (dataOrQuestionRe.test(lowerWithoutModuleNames)) {
    return { matched: false };
  }

  const cmdMatch = lower.match(
    /^(?:(?:tolong|bantu|coba|yuk|langsung|silakan|minta)\s+)*(?:buka|bukakan|bukain|pindah(?:\s+ke)?|arahkan(?:\s+ke)?|masuk(?:\s+ke)?|pergi(?:\s+ke)?|tampilkan|open|go\s+to|navigate(?:\s+to)?)\s+(?:(?:menu|halaman|modul|tab|fitur|popup|pop\s*up|form|layar|page)\s+)*(.+?)(?:\s+(?:dong|ya|sekarang|aja|saja|plis|please))?[.!]*$/i
  );
  if (!cmdMatch || !cmdMatch[1]) return { matched: false };

  const targetPhrase = cmdMatch[1].trim();
  const { entry, subTab } = resolveWmsModuleCatalogEntry(targetPhrase);
  if (!entry) return { matched: false };

  const permPage: ActivePage = entry.permissionPage || (entry.page as ActivePage);
  if (session && !canAccessPage(session, permPage)) {
    return {
      matched: true,
      deniedMessage: `Maaf, akun Anda (**${session.username || session.name || 'Pengguna'}**) tidak memiliki hak akses untuk membuka menu **${entry.label}**. Silakan hubungi Superadmin/Warehouse jika memerlukan akses modul ini.`
    };
  }

  return {
    matched: true,
    shortcut: {
      page: entry.page,
      label: entry.label,
      description: entry.description,
      subTab,
      autoExecute: true
    }
  };
}

function execOpenWmsModuleShortcut(
  args: any,
  ctx?: ExtendedToolExecutionContext
): { result: any; navigationShortcut?: AiNavigationShortcut } {
  const rawPage = String(args?.page_id || '').trim();
  const resolved = resolveWmsModuleCatalogEntry(rawPage);
  const found = resolved.entry;
  if (!found) {
    return {
      result: {
        error: `Halaman "${rawPage}" tidak dikenali.`,
        halaman_tersedia: WMS_MODULE_CATALOG.map((m) => `${m.page} (${m.label})`)
      }
    };
  }

  const permPage: ActivePage = found.permissionPage || (found.page as ActivePage);
  if (ctx?.session && !canAccessPage(ctx.session, permPage)) {
    return {
      result: {
        status: 'access_denied',
        page_id: found.page,
        label: found.label,
        pesan: `Akses ditolak: akun pengguna saat ini tidak memiliki hak akses untuk membuka ${found.label}.`
      }
    };
  }

  const autoExecute = args?.auto_execute !== false;
  const subTab = args?.sub_tab ? String(args.sub_tab).trim() : resolved.subTab;

  const shortcut: AiNavigationShortcut = {
    page: found.page,
    label: found.label,
    description: String(args?.reason || found.description).trim(),
    subTab,
    autoExecute
  };

  return {
    navigationShortcut: shortcut,
    result: {
      status: autoExecute ? 'navigated' : 'shortcut_ready',
      page_id: found.page,
      label: found.label,
      auto_execute: autoExecute,
      pesan: autoExecute
        ? `Perintah berhasil dieksekusi: aplikasi WMS langsung membuka "${found.label}" di layar pengguna dan tombol pintasan tetap tersedia di chat.`
        : `Tombol pintasan "Buka ${found.label}" kini tampil di layar chat pengguna.`
    }
  };
}

async function execReportAiCapabilityGap(
  args: any,
  ctx: ExtendedToolExecutionContext
): Promise<{ result: any; gapReport: AiCapabilityGapReport }> {
  const rawPrio = String(args?.priority || 'medium').toLowerCase();
  const priority: AiGapPriority = rawPrio === 'high' || rawPrio === 'low' ? rawPrio : 'medium';

  const { report, isDuplicate, syncedToCloud } = await logAiCapabilityGap({
    title: String(args?.title || 'Kapabilitas AI Baru'),
    userPrompt: String(args?.user_prompt || ctx.lastUserPrompt || ''),
    moduleArea: String(args?.module_area || 'Umum'),
    reasonCannotExecute: String(args?.reason_cannot_execute || 'Belum tersedia tool/akses untuk tugas ini.'),
    proposedToolOrFeature: String(args?.proposed_tool_or_feature || 'Tambahkan tool WMS AI baru.'),
    expectedBehavior: String(args?.expected_behavior || 'AI dapat memproses tugas secara otomatis.'),
    priority,
    reportedBy: ctx.session?.username || ctx.session?.name || 'pengguna',
    reportedRole: ctx.aiRole
  });

  return {
    gapReport: report,
    result: {
      status: 'gap_logged',
      id: report.id,
      is_duplicate: isDuplicate,
      occurrences: report.occurrences,
      synced_to_supabase: syncedToCloud,
      pesan: isDuplicate
        ? `Laporan kebutuhan fitur ini sudah tercatat sebelumnya (${report.id}) dan jumlah permintaannya telah dinaikkan menjadi ${report.occurrences}x agar menjadi prioritas agen pengembang.`
        : `Laporan pengembangan ${report.id} berhasil dicatat ke backlog Supabase (${syncedToCloud ? 'tersinkron' : 'tersimpan lokal'}) dan siap ditarik oleh agen coding saat pull update.`
    }
  };
}

async function execQueryPengecekanSj(args: any) {
  const kw = String(args?.keyword || '').toLowerCase().trim();
  const statusKomp = String(args?.status_komparasi || 'all').toUpperCase().trim();
  const tipeImport = String(args?.tipe_import || 'all').toLowerCase().trim();
  const onlyShortage = Boolean(args?.only_shortage);
  const startDate = args?.start_date ? String(args.start_date).slice(0, 10) : undefined;
  const endDate = args?.end_date ? String(args.end_date).slice(0, 10) : undefined;

  // Menggunakan SWR + IndexedDB watermark (~150B bila cloud tidak berubah)
  const records = await fetchPengecekanSJList(0, false).catch(() => []);

  const filtered = (records || []).filter((rec) => {
    if (statusKomp !== 'ALL' && String(rec.status_komparasi || '').toUpperCase() !== statusKomp) {
      return false;
    }
    if (tipeImport !== 'all' && tipeImport !== '') {
      const t = String(rec.tipe_import || 'Pengiriman').toLowerCase();
      if (!t.includes(tipeImport)) return false;
    }
    if (!matchesDateRange(rec.tanggal_sj || rec.created_at, startDate, endDate)) {
      return false;
    }
    const items = Array.isArray(rec.items) ? rec.items : [];
    const hasShortage = items.some((it) => (Number(it.qty_terima) || 0) < (Number(it.qty_sj) || 0));
    if (onlyShortage && !hasShortage && (Number(rec.total_qty_terima) || 0) >= (Number(rec.total_qty_sj) || 0)) {
      return false;
    }
    if (kw) {
      const itemsHay = items.map((it) => `${it.sku || ''} ${it.nama_produk || ''} ${it.size || ''}`).join(' ');
      const hay = `${rec.no_sj || ''} ${rec.source || ''} ${rec.destination || ''} ${rec.submitted_by || ''} ${rec.catatan || ''} ${itemsHay}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const selisihCount = filtered.filter((r) => r.status_komparasi === 'SELISIH').length;
  const cocokCount = filtered.filter((r) => r.status_komparasi === 'COCOK').length;

  return {
    ringkasan: {
      total_sj_ditemukan: filtered.length,
      status_cocok: cocokCount,
      status_selisih: selisihCount,
      total_qty_sj: filtered.reduce((s, r) => s + (Number(r.total_qty_sj) || 0), 0),
      total_qty_terima: filtered.reduce((s, r) => s + (Number(r.total_qty_terima) || 0), 0)
    },
    daftar_pengecekan_sj: filtered.slice(0, 20).map((r) => {
      const items = Array.isArray(r.items) ? r.items : [];
      const diffItems = items
        .map((it) => {
          const qtySj = Number(it.qty_sj) || 0;
          const qtyScan = Number(it.qty_terima) || 0;
          const selisih = qtyScan - qtySj;
          const master = it.sku ? lookupProductBySku(it.sku) : null;
          return {
            sku: it.sku || '-',
            nama_produk: master?.nama_produk || it.nama_produk || '-',
            size: resolveProductDisplaySize(it.sku || '', master?.size || it.size || ''),
            qty_sj: qtySj,
            qty_scan: qtyScan,
            selisih
          };
        })
        .filter((it) => (onlyShortage ? it.selisih < 0 : it.selisih !== 0));

      return {
        no_sj: r.no_sj,
        tanggal_sj: r.tanggal_sj || String(r.created_at || '').slice(0, 10),
        tipe: r.tipe_import || 'Pengiriman',
        asal: r.source || '-',
        tujuan: r.destination || '-',
        status_komparasi: r.status_komparasi,
        total_qty_sj: r.total_qty_sj,
        total_qty_scan: r.total_qty_terima,
        selisih_total: (Number(r.total_qty_terima) || 0) - (Number(r.total_qty_sj) || 0),
        petugas: r.submitted_by || '-',
        catatan: r.catatan || '-',
        rincian_item_selisih: diffItems.slice(0, 20)
      };
    })
  };
}

async function execTraceWmsEntity(args: any, ctx: ExtendedToolExecutionContext) {
  const rawQuery = String(args?.query || '').trim();
  if (!rawQuery) return { error: 'Parameter query tidak boleh kosong.' };

  const kw = rawQuery.toLowerCase();
  const upper = rawQuery.toUpperCase();
  const hint = String(args?.entity_hint || 'auto').toLowerCase().trim();

  const isOrderCode = /^(MS|AR-|RTR-)/i.test(upper) || hint === 'order';
  const isPickingCode = /^WA\d/i.test(upper);
  const isSjCode = /(^SJ|\/SJ|DO-|TRF-)/i.test(upper) || hint === 'sj';
  const isLocationCode = /^([A-D]\d{3}|R0|V0|Z0|CC|PMK|DF|SORTIR|TRANSIT|TIKTOK|SHOPEE|STUDIO|IGLIVE|BELT|CARD|GIFT|BOX)/i.test(upper) || hint === 'location';
  const isProductionCode = /^\d{4,6}[A-Z]?$/i.test(upper) || /^F\d{2}/i.test(upper) || hint === 'production_code';
  const isResiCode = hint === 'resi' || (/^(JP|JX|SPX|JNE|CM|TL|ID|0\d{8,}|[A-Z]{2,4}\d{7,})/i.test(upper) && !isOrderCode && !isPickingCode);

  const traceResult: Record<string, any> = {
    query: rawQuery,
    detected_hints: {
      isOrderCode,
      isPickingCode,
      isSjCode,
      isLocationCode,
      isProductionCode,
      isResiCode
    },
    jejak_lintas_modul: {}
  };

  const isStore = ctx.aiRole === 'store';
  const userStore = isStore ? String(ctx.session?.store_name || '').toLowerCase().trim() : '';

  // 1. Cek kecocokan Master Produk & Stok Rak (bila bukan murni kode order/resi)
  let matchedSkus: string[] = [];
  if (!isOrderCode && !isResiCode && !isPickingCode) {
    const catalog = await resolveCatalogList();
    const exactSku = lookupProductBySku(upper);
    if (exactSku && exactSku.found) {
      matchedSkus = [exactSku.sku.toUpperCase()];
    } else if (!isLocationCode) {
      const tokens = kw.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 2);
      if (tokens.length > 0) {
        const matches = catalog
          .filter((p) => {
            const hay = `${p.k || ''} ${p.n || p.p || ''} ${p.s || ''}`.toLowerCase();
            return tokens.every((t) => hay.includes(t));
          })
          .slice(0, 12);
        matchedSkus = matches.map((p) => String(p.k || '').trim().toUpperCase()).filter(Boolean);
      }
    }
  }

  const tasks: Promise<void>[] = [];

  // A. Stok Fisik + DealPOS (jika ketemu SKU produk)
  if (matchedSkus.length > 0) {
    tasks.push(
      fetchStockForSkus(matchedSkus)
        .then((stockRows) => {
          const bySku = new Map<string, { total: number; racks: string[] }>();
          (stockRows || []).forEach((s) => {
            const k = String(s.sku || '').toUpperCase();
            const cur = bySku.get(k) || { total: 0, racks: [] };
            const q = Number(s.sisa_stok) || 0;
            cur.total += q;
            if (q !== 0 && s.lokasi) cur.racks.push(`${s.lokasi} (${q})`);
            bySku.set(k, cur);
          });
          traceResult.jejak_lintas_modul.master_dan_stok = matchedSkus.map((sku) => {
            const m = lookupProductBySku(sku);
            const st = bySku.get(sku) || { total: 0, racks: [] };
            return {
              sku,
              nama_produk: m?.nama_produk || sku,
              size: resolveProductDisplaySize(sku, m?.size || ''),
              stok_fisik: st.total,
              stok_dealpos: m?.dealposQty ?? 0,
              selisih_fisik_minus_dealpos: st.total - (m?.dealposQty ?? 0),
              lokasi_rak: st.racks.join(', ') || 'Kosong'
            };
          });
        })
        .catch(() => {})
    );
  }

  // B. Log Mutasi Produk (non-store)
  if (!isStore && (matchedSkus.length > 0 || isLocationCode || isSjCode || isPickingCode)) {
    tasks.push(
      fetchLogsBySearch(rawQuery, 20, matchedSkus)
        .then((logs) => {
          if (logs && logs.length > 0) {
            traceResult.jejak_lintas_modul.log_mutasi_terbaru = logs.slice(0, 12).map((l) => {
              const m = lookupProductBySku(l.sku);
              return {
                waktu: l.created_at,
                tipe: l.type,
                invoice: l.invoice,
                sku: l.sku,
                nama_produk: m?.nama_produk || l.nama_produk,
                size: resolveProductDisplaySize(l.sku, m?.size || l.size),
                lokasi: l.lokasi,
                area: l.area,
                qty: l.qty,
                operator: l.operator
              };
            });
          }
        })
        .catch(() => {})
    );
  }

  // C. Antrean Picking (picking_list)
  tasks.push(
    fetchPickingListFromSupabase()
      .then((list) => {
        const hits = (list || []).filter((r: any) => {
          const hay = `${r.invoice_picking || ''} ${r.no_sj || ''} ${r.tujuan || ''} ${r.sku || ''} ${r.nama_produk || ''} ${r.lokasi || ''}`.toLowerCase();
          return hay.includes(kw) || (matchedSkus.length > 0 && matchedSkus.includes(String(r.sku || '').toUpperCase()));
        });
        if (hits.length > 0) {
          traceResult.jejak_lintas_modul.tugas_picking = {
            total_baris: hits.length,
            total_req: hits.reduce((s: number, r: any) => s + (Number(r.qty_req) || 0), 0),
            total_picked: hits.reduce((s: number, r: any) => s + (Number(r.qty_picked) || 0), 0),
            sampel: hits.slice(0, 12).map((r: any) => ({
              invoice_picking: r.invoice_picking || '-',
              no_sj: r.no_sj,
              tujuan: r.tujuan,
              sku: r.sku,
              lokasi: r.lokasi,
              qty_req: r.qty_req,
              qty_picked: r.qty_picked,
              status: r.status,
              picker: r.picker_name || '-'
            }))
          };
        }
      })
      .catch(() => {})
  );

  // D. Pengecekan Surat Jalan (pengecekan_sj, non-store)
  if (!isStore) {
    tasks.push(
      fetchPengecekanSJList(0, false)
        .then((list) => {
          const hits = (list || []).filter((r) => {
            const itemsHay = (r.items || []).map((it) => `${it.sku} ${it.nama_produk}`).join(' ');
            return `${r.no_sj} ${r.source} ${r.destination} ${itemsHay}`.toLowerCase().includes(kw);
          });
          if (hits.length > 0) {
            traceResult.jejak_lintas_modul.pengecekan_sj = hits.slice(0, 8).map((r) => ({
              no_sj: r.no_sj,
              tanggal: r.tanggal_sj,
              asal: r.source,
              tujuan: r.destination,
              status_komparasi: r.status_komparasi,
              total_qty_sj: r.total_qty_sj,
              total_qty_scan: r.total_qty_terima,
              selisih: (Number(r.total_qty_terima) || 0) - (Number(r.total_qty_sj) || 0)
            }));
          }
        })
        .catch(() => {})
    );
  }

  // E. Manual Shipment & Alteration
  tasks.push(
    fetchManualShipments(false)
      .then((orders) => {
        const hits = (orders || []).filter((o) => {
          if (userStore && !String(o.nama_pengirim || '').toLowerCase().includes(userStore)) return false;
          const itemsHay = (o.items || []).map((it) => `${it.sku} ${it.nama_produk}`).join(' ');
          const hay = `${o.no_pesanan || ''} ${o.no_resi || ''} ${o.nama_pengirim || ''} ${o.nama_tujuan || ''} ${o.no_transaksi_customer || ''} ${(o.no_transaksi_pengirim || []).join(' ')} ${itemsHay}`.toLowerCase();
          return hay.includes(kw);
        });
        if (hits.length > 0) {
          traceResult.jejak_lintas_modul.manual_shipment_dan_alteration = hits.slice(0, 8).map((o) => ({
            no_pesanan: o.no_pesanan,
            jenis: o.order_type === 'alteration_repair' ? 'Alteration / Permak' : 'Manual Shipment',
            pengirim: o.nama_pengirim,
            customer: o.nama_tujuan,
            status: o.status,
            jasa_kirim: o.jasa_kirim || '-',
            no_resi: o.no_resi || 'Belum ada resi',
            items: (o.items || []).map((it) => `${it.nama_produk} (${it.size || '-'}) x${it.qty} [${it.fulfillment || 'Gudang'}${it.received_at_warehouse ? ' • Diterima WH' : ''}]`)
          }));
        }
      })
      .catch(() => {})
  );

  // F. Retur Barang (Pusat Resolusi)
  tasks.push(
    fetchReturOrders()
      .then((returs) => {
        const hits = (returs || []).filter((r) =>
          `${r.no_retur} ${r.no_pesanan_asal} ${r.nama_customer} ${r.no_resi} ${r.no_resi_customer} ${r.no_sj_gudang_retur || ''}`
            .toLowerCase()
            .includes(kw)
        );
        if (hits.length > 0) {
          traceResult.jejak_lintas_modul.retur_barang = hits.slice(0, 6).map((r) => ({
            no_retur: r.no_retur,
            no_pesanan_asal: r.no_pesanan_asal,
            customer: r.nama_customer,
            status: r.status,
            no_sj_gudang_retur: r.no_sj_gudang_retur || '-',
            no_resi_pengganti: r.no_resi || 'Belum ada resi',
            produk_pengganti: (r.produk_pengganti || []).map((it) => `${it.nama_produk || it.sku} (${it.size}) x${it.qty}`)
          }));
        }
      })
      .catch(() => {})
  );

  // G. Penerimaan Produksi, Trello UP, QC, Perbaikan, Peminjaman (jika relevan)
  if (!isStore && (isProductionCode || matchedSkus.length > 0 || isSjCode || (!isOrderCode && !isResiCode))) {
    tasks.push(
      fetchPenerimaanProduksiFromSupabase({ limit: 500 })
        .then((list) => {
          const hits = (list || []).filter((p) =>
            `${p.kode_produksi || ''} ${p.no_surat_jalan || ''} ${p.nama_produk || ''} ${p.keterangan || ''}`
              .toLowerCase()
              .includes(kw)
          );
          if (hits.length > 0) {
            const totalQty = hits.reduce((s, p) => s + (Number(p.qty) || 0), 0);
            traceResult.jejak_lintas_modul.penerimaan_produksi = {
              total_baris: hits.length,
              total_pcs: totalQty,
              sampel: hits.slice(0, 10).map((p) => ({
                tanggal: p.tanggal_penerimaan,
                kategori: p.kategori,
                no_sj: p.no_surat_jalan,
                kode_produksi: p.kode_produksi,
                nama_produk: p.nama_produk,
                warna: p.warna,
                size: p.size,
                qty: p.qty,
                recount_qty: p.recount_qty ?? null
              }))
            };
          }
        })
        .catch(() => {})
    );

    if (isProductionCode) {
      const trelloCache = getLocalCachedTrelloItems();
      const trelloItems = Array.isArray(trelloCache?.items) ? trelloCache.items : [];
      const baseCode = extractBaseItemCode(upper);
      const tHits = trelloItems.filter((t) => {
        const hay = `${t.item_code || ''} ${t.item_name || ''} ${t.card_name || ''} ${t.up_code || ''}`.toLowerCase();
        return hay.includes(kw) || (baseCode && hay.includes(baseCode.toLowerCase()));
      });
      if (tHits.length > 0) {
        traceResult.jejak_lintas_modul.trello_up = tHits.slice(0, 6).map((t) => ({
          kode_produksi: t.item_code,
          nama_produk: t.item_name || t.card_name,
          up_code: t.up_code
        }));
      }
    }

    tasks.push(
      Promise.allSettled([
        fetchQcReportsFromSupabase({ limit: 100 }),
        fetchPerbaikanTicketsFromSupabase({ limit: 100 }),
        fetchPeminjamanFromSupabase(100)
      ]).then(([qcRes, repRes, loanRes]) => {
        const qcs = (qcRes.status === 'fulfilled' && Array.isArray(qcRes.value) ? qcRes.value : []).filter((q) =>
          `${q.report_no} ${q.sku} ${q.nama_produk} ${q.kode_produksi || ''}`.toLowerCase().includes(kw) ||
          (matchedSkus.length > 0 && matchedSkus.includes(String(q.sku || '').toUpperCase()))
        );
        if (qcs.length > 0) {
          traceResult.jejak_lintas_modul.qc_reports = qcs.slice(0, 6).map((q) => ({
            report_no: q.report_no,
            tanggal: q.tanggal,
            kode_atau_sku: q.kode_produksi || q.sku,
            qty_diperiksa: q.qty_diperiksa,
            qty_oke: q.qty_oke,
            qty_reject: q.qty_reject,
            status: q.status
          }));
        }
        const reps = (repRes.status === 'fulfilled' && Array.isArray(repRes.value) ? repRes.value : []).filter((t) =>
          `${t.ticket_no} ${t.sku} ${t.nama_produk} ${t.lokasi_sekarang}`.toLowerCase().includes(kw) ||
          (matchedSkus.length > 0 && matchedSkus.includes(String(t.sku || '').toUpperCase()))
        );
        if (reps.length > 0) {
          traceResult.jejak_lintas_modul.perbaikan = reps.slice(0, 6).map((t) => ({
            ticket_no: t.ticket_no,
            sku: t.sku,
            nama_produk: t.nama_produk,
            qty: t.qty,
            tahap: t.tahap,
            lokasi: t.lokasi_sekarang
          }));
        }
        const loans = (loanRes.status === 'fulfilled' && Array.isArray(loanRes.value) ? loanRes.value : []).filter((l: any) =>
          JSON.stringify(l).toLowerCase().includes(kw)
        );
        if (loans.length > 0) {
          traceResult.jejak_lintas_modul.peminjaman_sps = loans.slice(0, 5).map((l: any) => ({
            no_sps: l.noPeminjaman || l.no_sps || l.id,
            peminjam: l.namaPeminjam || l.nama_peminjam || '-',
            status: l.status,
            tgl_pinjam: l.tglPinjam || l.tanggal_pinjam || '-'
          }));
        }
      })
    );
  }

  // H. Pengiriman Store & Trip (jika SJ atau umum)
  if (!isStore && (isSjCode || !isProductionCode)) {
    tasks.push(
      fetchPengirimanStoreReports()
        .then((reports) => {
          const hits = (reports || []).filter((r) => JSON.stringify(r).toLowerCase().includes(kw));
          if (hits.length > 0) {
            traceResult.jejak_lintas_modul.pengiriman_store = hits.slice(0, 6).map((r) => ({
              id: r.id,
              store_tujuan: r.store_tujuan,
              tanggal: r.tanggal_laporan,
              total_koli: r.total_koli,
              status: r.status,
              pic: r.pic_nama
            }));
          }
        })
        .catch(() => {})
    );
  }

  await Promise.allSettled(tasks);
  const foundModules = Object.keys(traceResult.jejak_lintas_modul);
  traceResult.ringkasan_pelacakan =
    foundModules.length > 0
      ? `Ditemukan data terkait "${rawQuery}" pada ${foundModules.length} modul: ${foundModules.join(', ')}.`
      : `Tidak ditemukan jejak data untuk "${rawQuery}" pada modul WMS yang diperiksa.`;

  return traceResult;
}

async function execAnalyzeHrKpiAndPayroll(args: any, ctx: ExtendedToolExecutionContext) {
  if (ctx.aiRole !== 'superadmin' && ctx.aiRole !== 'hr') {
    return {
      error: 'Akses ditolak: Analisis KPI Absensi & Kalkulasi Gaji Bulanan hanya dapat diakses oleh akun HR atau Superadmin.'
    };
  }

  const targetPeriod = args?.payroll_month
    ? getPayrollPeriodByMonthKey(String(args.payroll_month))
    : getActivePayrollPeriod();
  const mode = String(args?.mode || 'both').toLowerCase().trim();
  const empKw = String(args?.employee_keyword || '').toLowerCase().trim();

  const bolosModeRaw = String(args?.potongan_bolos_mode || 'proporsional').toLowerCase();
  const potonganBolosMode =
    bolosModeRaw === 'nominal' || bolosModeRaw === 'tanpa_potongan' ? bolosModeRaw : 'proporsional';

  const [karyawanAll, presensiList, rosterList, lemburList, cutiList, izinList] = await Promise.all([
    fetchKaryawanDirectory().catch(() => []),
    fetchPresensiRange(targetPeriod.startDate, targetPeriod.endDate).catch(() => []),
    fetchRosterShiftList(undefined, targetPeriod.startDate, targetPeriod.endDate).catch(() => []),
    fetchLemburRecords().catch(() => []),
    fetchCutiRecords().catch(() => []),
    fetchIzinPulangAwalList().catch(() => [])
  ]);

  const activeKaryawan = (karyawanAll || []).filter((k) => k.status_aktif !== false);
  const targetKaryawan = empKw
    ? activeKaryawan.filter((k) =>
        `${k.nik || ''} ${k.nama || ''} ${k.divisi || ''} ${k.jabatan || ''}`.toLowerCase().includes(empKw)
      )
    : activeKaryawan;

  if (targetKaryawan.length === 0) {
    return {
      periode_gaji: targetPeriod,
      pesan: `Tidak ditemukan karyawan aktif yang cocok dengan filter "${args?.employee_keyword || ''}".`
    };
  }

  const payrollResult = calculateMonthlyPayroll({
    monthKey: targetPeriod.monthKey,
    karyawanList: targetKaryawan,
    presensiList,
    rosterList,
    lemburList,
    cutiList,
    izinPulangAwalList: izinList,
    config: {
      potonganBolosMode,
      potonganBolosNominal: Number(args?.potongan_bolos_nominal) || 0,
      potonganTerlambatPerKejadian: Number(args?.potongan_terlambat_per_kejadian) || 0,
      sertakanPotonganKasbon: Boolean(args?.sertakan_potongan_kasbon)
    }
  });

  const kpiBatch = calculateKpiAbsensiBatch({
    karyawanList: targetKaryawan,
    presensiList,
    rosterList,
    lemburList,
    cutiList,
    izinPulangAwalList: izinList,
    startDate: targetPeriod.startDate,
    endDate: targetPeriod.endDate
  });

  const rowsWithKpiDetail = payrollResult.rows.map((r) => {
    const kpi = kpiBatch[(r.nik || '').trim().toUpperCase()];
    return {
      nik: r.nik,
      nama: r.nama,
      divisi: r.divisi,
      jabatan: r.jabatan,
      jadwal_kerja_hari: r.totalJadwalKerja,
      hadir_hari: r.totalHadir,
      cuti_sakit_izin_hari: kpi?.totalCutiIzin ?? r.totalHariCuti,
      bolos_alpha_hari: kpi?.totalAlpha ?? r.totalHariBolos,
      terlambat_kali: kpi?.totalTerlambat ?? r.totalTerlambat,
      total_menit_telat: kpi?.totalMenitTerlambat ?? r.totalMenitTerlambat,
      pulang_awal_tanpa_izin: kpi?.totalPulangAwalTanpaIzin ?? 0,
      lembur_acc_jam: r.totalJamLembur,
      nilai_kpi: kpi?.nilaiKpiAbsensi ?? r.nilaiKpi,
      grade_kpi: kpi?.grade ?? r.gradeKpi,
      persen_kehadiran: kpi?.persenKehadiran ?? 0,
      gaji_pokok: r.gajiPokok,
      tunjangan: r.tunjangan,
      uang_lembur: r.uangLembur,
      pendapatan_kotor: r.totalPendapatanKotor,
      potongan_bolos: r.potonganBolos,
      potongan_terlambat: r.potonganTerlambat,
      potongan_kasbon: r.potonganKasbon,
      total_potongan: r.totalPotongan,
      gaji_bersih_take_home_pay: r.gajiBersih
    };
  });

  const sortedByKpiDesc = [...rowsWithKpiDetail].sort((a, b) => b.nilai_kpi - a.nilai_kpi);
  const anomalies = rowsWithKpiDetail
    .filter((r) => r.bolos_alpha_hari > 0 || r.terlambat_kali > 0 || r.pulang_awal_tanpa_izin > 0 || r.nilai_kpi < 80)
    .sort((a, b) => a.nilai_kpi - b.nilai_kpi);

  const avgKpi =
    rowsWithKpiDetail.length > 0
      ? Math.round((rowsWithKpiDetail.reduce((s, r) => s + r.nilai_kpi, 0) / rowsWithKpiDetail.length) * 10) / 10
      : 0;

  return {
    aturan_siklus: {
      periode_gaji_dan_kpi: `${payrollResult.period.label} (${payrollResult.period.startDate} s/d ${payrollResult.period.endDate}) — Siklus wajib 26 bulan lalu s/d 25 bulan berjalan`,
      sumber_kalender_roster_shift: `Roster Shift tetap kalender 1 s/d akhir bulan: ${payrollResult.shiftCalendarMonths.previousMonth.label} (${payrollResult.shiftCalendarMonths.previousMonth.startDate}..${payrollResult.shiftCalendarMonths.previousMonth.endDate}) & ${payrollResult.shiftCalendarMonths.currentMonth.label} (${payrollResult.shiftCalendarMonths.currentMonth.startDate}..${payrollResult.shiftCalendarMonths.currentMonth.endDate})`
    },
    konfigurasi_potongan: payrollResult.config,
    ringkasan_keseluruhan: {
      total_karyawan: payrollResult.totals.totalKaryawan,
      rata_rata_kpi: avgKpi,
      total_hadir_hari: payrollResult.totals.totalHadir,
      total_bolos_hari: payrollResult.totals.totalHariBolos,
      total_terlambat_kali: payrollResult.totals.totalTerlambat,
      total_lembur_jam: payrollResult.totals.totalJamLembur,
      total_gaji_pokok_rp: payrollResult.totals.totalGajiPokok,
      total_tunjangan_rp: payrollResult.totals.totalTunjangan,
      total_uang_lembur_rp: payrollResult.totals.totalUangLembur,
      total_pendapatan_kotor_rp: payrollResult.totals.totalPendapatanKotor,
      total_potongan_rp: payrollResult.totals.totalPotongan,
      total_gaji_bersih_rp: payrollResult.totals.totalGajiBersih
    },
    ...(mode === 'kpi' || mode === 'both'
      ? {
          top_5_kpi_tertinggi: sortedByKpiDesc.slice(0, 5),
          bottom_5_kpi_terendah: [...sortedByKpiDesc].reverse().slice(0, 5)
        }
      : {}),
    ...(mode === 'anomalies' || anomalies.length > 0
      ? { anomali_kehadiran_dan_kpi: anomalies.slice(0, 20) }
      : {}),
    rincian_per_karyawan:
      empKw || rowsWithKpiDetail.length <= 35 ? rowsWithKpiDetail : rowsWithKpiDetail.slice(0, 35)
  };
}

export async function executeExtendedAiTool(
  fnName: string,
  fnArgs: any,
  ctx: ExtendedToolExecutionContext
): Promise<ExtendedToolExecutionOutcome> {
  if (fnName === 'query_wms_knowledge_and_sop') {
    return { handled: true, result: await execQueryWmsKnowledgeAndSop(fnArgs, ctx) };
  }
  if (fnName === 'query_loading_dock_and_packing') {
    return { handled: true, result: await execQueryLoadingDockAndPacking(fnArgs) };
  }
  if (fnName === 'query_distribusi_and_pengiriman') {
    return { handled: true, result: await execQueryDistribusiAndPengiriman(fnArgs) };
  }
  if (fnName === 'query_all_order_channels') {
    return { handled: true, result: await execQueryAllOrderChannels(fnArgs, ctx) };
  }
  if (fnName === 'query_so_and_putaway') {
    return { handled: true, result: await execQuerySoAndPutaway(fnArgs) };
  }
  if (fnName === 'query_store_help_tickets') {
    return { handled: true, result: await execQueryStoreHelpTickets(fnArgs, ctx) };
  }
  if (fnName === 'get_executive_daily_summary') {
    return { handled: true, result: await execGetExecutiveDailySummary(fnArgs, ctx) };
  }
  if (fnName === 'validate_items_against_master') {
    return { handled: true, result: await execValidateItemsAgainstMaster(fnArgs) };
  }
  if (fnName === 'query_pengecekan_sj') {
    return { handled: true, result: await execQueryPengecekanSj(fnArgs) };
  }
  if (fnName === 'trace_wms_entity') {
    return { handled: true, result: await execTraceWmsEntity(fnArgs, ctx) };
  }
  if (fnName === 'analyze_hr_kpi_and_payroll') {
    return { handled: true, result: await execAnalyzeHrKpiAndPayroll(fnArgs, ctx) };
  }
  if (fnName === 'open_wms_module_shortcut') {
    const out = execOpenWmsModuleShortcut(fnArgs, ctx);
    return { handled: true, result: out.result, navigationShortcut: out.navigationShortcut };
  }
  if (fnName === 'report_ai_capability_gap') {
    const out = await execReportAiCapabilityGap(fnArgs, ctx);
    return { handled: true, result: out.result, gapReport: out.gapReport };
  }

  return { handled: false };
}
