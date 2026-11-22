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
  fetchLemburRecords,
  fetchCutiRecords,
  fetchIzinPulangAwalList
} from './supabase';
import {
  fetchPengirimanStoreReports,
  fetchPengirimanStoreTrips,
  fetchSjShippingOverrides
} from './pengirimanStore';
import { fetchHandoverPaketList } from './pengirimanPaket';
import { fetchMutasiStoreList, fetchPenerimaanPaketList } from './penerimaanBarang';
import { fetchPutawayTasks } from './putawayService';
import { fetchStoreFaqs, fetchStoreHelpTickets } from './storeHelpService';
import { fetchIgLiveOrdersFromSupabase } from './igLiveService';
import { fetchReturOrders } from './returBarangService';
import {
  AiCapabilityGapReport,
  AiGapPriority,
  logAiCapabilityGap
} from './wmsAiGapReportService';
import {
  getGlobalProductCatalogMap,
  lookupProductBySku,
  setGlobalProductCatalog
} from '../utils/productLookup';
import { getAllProductsFromLocalDb } from './localDb';
import { cleanProductName, resolveProductDisplaySize } from '../utils/sortUtils';
import { ActivePage, ProductItem, UserSession } from '../types';

export interface AiNavigationShortcut {
  page: ActivePage;
  label: string;
  description: string;
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
  page: ActivePage;
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
    label: 'HR — Karyawan, Roster, Presensi & Approval',
    area: 'HR & Admin',
    description: 'Direktori karyawan, roster shift, presensi harian, pengajuan cuti/lembur/izin, dan rekap HR.',
    keywords: ['hr', 'karyawan', 'roster', 'shift', 'presensi', 'absen', 'cuti', 'lembur', 'izin']
  }
];

const WMS_CORE_SOP_RULES = [
  {
    topic: 'Stock Opname (SO)',
    summary:
      'Rumus standar: Selisih = Scan Fisik - Stok Sistem Database. Barang yang ada di sistem namun tidak discan dianggap Scan Fisik = 0 (ADJ_OUT). Selisih > 0 menjadi ADJ_IN, Selisih < 0 menjadi ADJ_OUT. Penyesuaian hanya dibuat saat user berwenang klik Approve SO.'
  },
  {
    topic: 'Prioritas Area Picking',
    summary:
      'Priority 1: Warehouse (A/B/C/D001-100), Aksesoris (BELT/CARD/GIFT/BOX), Transit (X/TRANSIT). Priority 2: Kolian (R0/V0/Z0). Priority 3: Blok F (TIKTOK/SHOPEE/STUDIO/IGLIVE). Area Perbaikan (CC/PMK/DF/SORTIR) & Anomali dilarang untuk picking otomatis.'
  },
  {
    topic: 'Sinkronisasi Picking & WhatsApp',
    summary:
      'Korelasi scan WA (#OUT [invoice_picking]) wajib memakai invoice_picking unik, bukan no_sj. Sistem tidak boleh auto-adjust stok saat picking; under-pick/over-pick harus diperbaiki dengan scan fisik operator.'
  },
  {
    topic: 'Pusat Resolusi — Retur Barang (RTR-...)',
    summary:
      '3 tahap deterministik: Pesanan Baru (diterima) -> Diproses (cetak Label A6/Picking List atau input SJ DealPOS Gudang Retur) -> Selesai (dikirim saat input No Resi pengganti). Label A6 & Picking List selalu mencetak produk pengganti.'
  },
  {
    topic: 'Master Produk & Lookup SKU',
    summary:
      'Nama produk dan size resmi selalu diambil dari Master Produk (lookupProductBySku) untuk mencegah anomali penamaan/size di seluruh modul.'
  },
  {
    topic: 'Update Aplikasi Zero-Reload',
    summary:
      'Pembaruan versi diunduh di background tanpa memaksa reload saat user sedang bekerja; aktif otomatis secara aman saat berpindah menu.'
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
    name: 'open_wms_module_shortcut',
    description:
      'Menampilkan tombol pintasan navigasi 1 klik langsung di layar chat agar pengguna bisa membuka modul/halaman WMS terkait (misal: "buka halaman stock opname", "arahkan ke pusat resolusi", "buka menu pengiriman").',
    parameters: {
      type: 'OBJECT',
      properties: {
        page_id: {
          type: 'STRING',
          description:
            'ID halaman WMS: dashboard, inventory, scanner, stock_opname, operasi_stok, mutasi_log, produksi, trello_up, penerimaan_barang, loading_dock, picking_tasks, pengiriman, pesanan_saya, pusat_resolusi, perbaikan, peminjaman, katalog_produk, rekap_tagihan_jne, agenda, live_chat, cetak_label, karyawan'
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
  const tokens = topic.split(/\s+/).filter((t) => t.length >= 2);

  const matchedModules = WMS_MODULE_CATALOG.filter((m) => {
    if (!topic) return true;
    const hay = `${m.label} ${m.area} ${m.description} ${m.keywords.join(' ')}`.toLowerCase();
    return tokens.some((tk) => hay.includes(tk));
  }).slice(0, 8);

  const matchedSop = WMS_CORE_SOP_RULES.filter((s) => {
    if (!topic) return true;
    const hay = `${s.topic} ${s.summary}`.toLowerCase();
    return tokens.some((tk) => hay.includes(tk));
  });

  let matchedFaqs: Array<{ category: string; question: string; answer: string }> = [];
  try {
    const allFaqs = await fetchStoreFaqs();
    const isStore = ctx.aiRole === 'store';
    matchedFaqs = (allFaqs || [])
      .filter((faq) => {
        if (isStore && faq.target_audience === 'admin') return false;
        if (!topic) return true;
        const hay = `${faq.category} ${faq.question} ${faq.answer} ${faq.answer_store || ''} ${faq.answer_admin || ''}`.toLowerCase();
        return tokens.some((tk) => hay.includes(tk));
      })
      .slice(0, 6)
      .map((faq) => ({
        category: faq.category,
        question: faq.question,
        answer: isStore
          ? faq.answer_store || faq.answer
          : faq.answer_admin || faq.answer
      }));
  } catch {
    // ignore FAQ fetch failure
  }

  return {
    topik: topic || 'semua',
    role_pengguna: ctx.aiRole,
    modul_terkait: matchedModules.map((m) => ({
      page_id: m.page,
      nama_modul: m.label,
      area: m.area,
      fungsi: m.description
    })),
    aturan_sop_wms: matchedSop.length > 0 ? matchedSop : WMS_CORE_SOP_RULES.slice(0, 4),
    faq_resmi_wms: matchedFaqs,
    catatan_peran:
      ctx.aiRole === 'store'
        ? 'Berikan panduan strictly dari sudut pandang Store PIC (jangan suruh Store klik tombol khusus Admin).'
        : 'Berikan panduan sesuai SOP resmi WMS Chocochips.'
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
  const packingReadyCount = pickingItems.filter((p: any) =>
    ['done', 'completed', 'ready', 'packed'].includes(String(p.status || '').toLowerCase())
  ).length;
  const pickingOpenCount = pickingItems.filter(
    (p: any) => !['done', 'completed', 'cancelled'].includes(String(p.status || '').toLowerCase())
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
    supabaseFetch<any[]>(
      'manual_shipment',
      'GET',
      null,
      'select=id,order_id,store_name,customer_name,channel,status,no_resi,is_alteration,total_qty,created_at,updated_at,produk_pesanan&order=created_at.desc&limit=100'
    ),
    channel === 'all' || channel === 'ig_live'
      ? fetchIgLiveOrdersFromSupabase()
      : Promise.resolve([])
  ]);

  const rawMs = (msRes.status === 'fulfilled' && Array.isArray(msRes.value) ? msRes.value : []).filter(
    (r: any) => !String(r.order_id || '').toUpperCase().startsWith('RTR-')
  );

  const filteredMs = rawMs.filter((r: any) => {
    if (userStore && !String(r.store_name || '').toLowerCase().includes(userStore)) return false;
    const ch = String(r.channel || '').toLowerCase();
    const isAlt = Boolean(r.is_alteration) || ch.includes('alter');
    if (channel === 'alteration' && !isAlt) return false;
    if (channel === 'shopee' && !ch.includes('shopee')) return false;
    if (channel === 'website' && !ch.includes('web')) return false;
    if (channel === 'manual_shipment' && (isAlt || ch.includes('shopee') || ch.includes('web'))) return false;
    if (channel === 'ig_live') return false;
    if (statusFilter && !String(r.status || '').toLowerCase().includes(statusFilter)) return false;
    if (keyword && !JSON.stringify(r).toLowerCase().includes(keyword)) return false;
    return true;
  });

  const rawIg = igRes.status === 'fulfilled' && Array.isArray(igRes.value) ? igRes.value : [];
  const filteredIg = rawIg.filter((o: any) => {
    if (statusFilter && !String(o.status || '').toLowerCase().includes(statusFilter)) return false;
    if (keyword && !JSON.stringify(o).toLowerCase().includes(keyword)) return false;
    return true;
  });

  const statusBreakdown: Record<string, number> = {};
  filteredMs.forEach((r: any) => {
    const st = String(r.status || 'unknown');
    statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
  });

  return {
    channel_filter: channel,
    manual_shipment_dan_kanal: {
      total: filteredMs.length,
      breakdown_status: statusBreakdown,
      sampel_terbaru: filteredMs.slice(0, 20).map((r: any) => ({
        order_id: r.order_id || r.id,
        store: r.store_name || '-',
        customer: r.customer_name || '-',
        channel: r.is_alteration ? 'Alteration / Permak' : r.channel || 'Manual Shipment',
        status: r.status || '-',
        no_resi: r.no_resi || '-',
        created_at: String(r.created_at || '').slice(0, 16)
      }))
    },
    ig_live_orders: {
      total: filteredIg.length,
      sampel_terbaru: filteredIg.slice(0, 12).map((o: any) => ({
        id: o.id,
        customer: o.customer_name || o.ig_username || '-',
        status: o.status || '-',
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

  const [prodRes, pickRes, shipRes, returRes, putawayRes, repairRes, hrRes] = await Promise.allSettled([
    fetchPenerimaanProduksiFromSupabase(),
    fetchPickingListFromSupabase(),
    fetchPengirimanStoreReports(),
    fetchReturOrders(),
    fetchPutawayTasks(),
    fetchPerbaikanTicketsFromSupabase(),
    canHr
      ? Promise.all([fetchLemburRecords(), fetchCutiRecords(), fetchIzinPulangAwalList()])
      : Promise.resolve(null)
  ]);

  const prodList = prodRes.status === 'fulfilled' && Array.isArray(prodRes.value) ? prodRes.value : [];
  const prodToday = prodList.filter((p: any) => String(p.tanggal || p.created_at || '').slice(0, 10) === targetDate);
  const prodTodayQty = prodToday.reduce((sum: number, p: any) => sum + Number(p.total_qty || p.qty || 0), 0);

  const pickList = pickRes.status === 'fulfilled' && Array.isArray(pickRes.value) ? pickRes.value : [];
  const pickActive = pickList.filter((p: any) => !['done', 'completed', 'cancelled'].includes(String(p.status || '').toLowerCase()));

  const shipList = shipRes.status === 'fulfilled' && Array.isArray(shipRes.value) ? shipRes.value : [];
  const shipToday = shipList.filter((s) => String(s.tanggal_laporan || '').slice(0, 10) === targetDate);

  const returList = returRes.status === 'fulfilled' && Array.isArray(returRes.value) ? returRes.value : [];
  const returBaru = returList.filter((r: any) => String(r.status || '').toLowerCase() === 'diterima').length;
  const returDiproses = returList.filter((r: any) => String(r.status || '').toLowerCase() === 'diproses').length;

  const putawayList = putawayRes.status === 'fulfilled' && Array.isArray(putawayRes.value) ? putawayRes.value : [];
  const putawayActive = putawayList.filter((p) => !['completed', 'done', 'cancelled'].includes(String(p.status || '').toLowerCase()));

  const repairList = repairRes.status === 'fulfilled' && Array.isArray(repairRes.value) ? repairRes.value : [];
  const repairActive = repairList.filter((r: any) => !['done', 'completed', 'selesai'].includes(String(r.status || '').toLowerCase()));

  let hrSummary: any = undefined;
  if (canHr && hrRes.status === 'fulfilled' && Array.isArray(hrRes.value)) {
    const [lembur, cuti, izin] = hrRes.value;
    const isPending = (r: any) => String(r.status || '').toLowerCase() === 'pending';
    hrSummary = {
      lembur_pending: (lembur || []).filter(isPending).length,
      cuti_pending: (cuti || []).filter(isPending).length,
      izin_pulang_awal_pending: (izin || []).filter(isPending).length
    };
  }

  return {
    tanggal: targetDate,
    produksi_hari_ini: {
      jumlah_batch_masuk: prodToday.length,
      total_pcs_masuk: prodTodayQty
    },
    picking_gudang: {
      tugas_picking_aktif: pickActive.length,
      total_antrean_tercatat: pickList.length
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
  const normalizedCatalog = catalog.map((p) => ({
    item: p,
    skuUpper: String(p.sku || '').toUpperCase().trim(),
    searchKey: `${p.nama || ''} ${p.size || ''} ${p.sku || ''}`.toLowerCase()
  }));

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

    let matchedProduct: ProductItem | null = null;
    let note = '';

    if (skuIn) {
      const exact = lookupProductBySku(skuIn);
      if (exact && exact.sku) {
        matchedProduct =
          normalizedCatalog.find((c) => c.skuUpper === exact.sku.toUpperCase())?.item ||
          ({
            sku: exact.sku,
            nama: exact.nama,
            size: exact.size,
            stock: 0
          } as ProductItem);
      }
    }

    if (!matchedProduct && queryIn) {
      const tokens = queryIn
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2);
      const candidates = normalizedCatalog.filter((c) => tokens.every((t) => c.searchKey.includes(t)));
      if (candidates.length > 0) {
        if (sizeIn) {
          const exactSize = candidates.find(
            (c) => String(resolveProductDisplaySize(c.item.sku, c.item.size, c.item.nama) || '').toUpperCase() === sizeIn
          );
          matchedProduct = (exactSize || candidates[0]).item;
        } else {
          matchedProduct = candidates[0].item;
        }
      }
    }

    if (!matchedProduct) {
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

    const officialName = cleanProductName(matchedProduct.nama || '');
    const officialSize = resolveProductDisplaySize(matchedProduct.sku, matchedProduct.size, matchedProduct.nama) || '-';
    const sizeMismatch = Boolean(sizeIn && officialSize !== '-' && officialSize.toUpperCase() !== sizeIn);

    if (sizeMismatch) {
      note = `Size input (${sizeIn}) berbeda dengan size resmi Master Produk (${officialSize}).`;
    } else {
      note = 'Sesuai Master Produk.';
    }

    matchedSkus.push(matchedProduct.sku);
    validatedRows.push({
      input: skuIn || queryIn,
      requested_size: sizeIn || '-',
      requested_qty: qtyIn,
      status: sizeMismatch ? 'ANOMALI_SIZE' : 'VALID',
      sku_resmi: matchedProduct.sku,
      nama_resmi_master: officialName,
      size_resmi_master: officialSize,
      stok_dealpos: Number((matchedProduct as any).stock ?? (matchedProduct as any).stok_dealpos ?? 0),
      catatan: note
    });
  }

  if (matchedSkus.length > 0) {
    try {
      const uniqueSkus = Array.from(new Set(matchedSkus));
      const stockMap = await fetchStockForSkus(uniqueSkus);
      validatedRows.forEach((row) => {
        if (row.sku_resmi === '-') return;
        const rowsForSku = stockMap.get(row.sku_resmi.toUpperCase()) || stockMap.get(row.sku_resmi) || [];
        const totalFisik = rowsForSku.reduce((sum: number, s: any) => sum + Number(s.qty || 0), 0);
        const rakStr = rowsForSku
          .filter((s: any) => Number(s.qty || 0) !== 0)
          .map((s: any) => `${s.lokasi} (${s.qty})`)
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

function execOpenWmsModuleShortcut(args: any): { result: any; navigationShortcut?: AiNavigationShortcut } {
  const rawPage = String(args?.page_id || '').toLowerCase().trim() as ActivePage;
  const found = WMS_MODULE_CATALOG.find((m) => m.page === rawPage);
  if (!found) {
    return {
      result: {
        error: `Halaman "${rawPage}" tidak dikenali.`,
        halaman_tersedia: WMS_MODULE_CATALOG.map((m) => `${m.page} (${m.label})`)
      }
    };
  }

  const shortcut: AiNavigationShortcut = {
    page: found.page,
    label: found.label,
    description: String(args?.reason || found.description).trim()
  };

  return {
    navigationShortcut: shortcut,
    result: {
      status: 'shortcut_ready',
      page_id: found.page,
      label: found.label,
      pesan: `Tombol pintasan "Buka ${found.label}" kini tampil di layar chat pengguna.`
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
  if (fnName === 'open_wms_module_shortcut') {
    const out = execOpenWmsModuleShortcut(fnArgs);
    return { handled: true, result: out.result, navigationShortcut: out.navigationShortcut };
  }
  if (fnName === 'report_ai_capability_gap') {
    const out = await execReportAiCapabilityGap(fnArgs, ctx);
    return { handled: true, result: out.result, gapReport: out.gapReport };
  }

  return { handled: false };
}
