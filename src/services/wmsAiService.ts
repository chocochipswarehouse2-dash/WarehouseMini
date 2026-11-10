/**
 * =============================================================================
 * WMS AI SERVICE — Google Gemini Flash Powered Assistant
 * =============================================================================
 * Layanan asisten cerdas WMS Inventory berbasis Google Gemini Flash dengan
 * arsitektur Function Calling (Tools) grounded ke data lokal & database Supabase.
 * 
 * Hemat kuota token, anti-halusinasi, dan responsif untuk:
 * 1. Cek stok fisik, DealPOS, dan posisi rak barang.
 * 2. Cek kode produksi, foto UP, dan nama produk dari Trello UP / Penerimaan.
 * 3. Generate laporan rekapitulasi penerimaan barang bulanan (CMT & Kargo).
 * 4. Cek status resi dan pengiriman pesanan toko / resolusi.
 */

import { supabaseFetch, fetchStockForSkus, fetchPenerimaanProduksiFromSupabase } from './supabase';
import { getGlobalProductCatalogMap, lookupProductBySku, ProductLookupResult } from '../utils/productLookup';
import { normalizeLookupCode } from '../utils/trelloProduksiMatcher';
import { getLocalCachedTrelloItems } from './trelloSyncService';
import { ProductItem, PenerimaanProduksiItem } from '../types';

export const SYSTEM_DOC_AI_CONFIG_ID = 'wms_ai_config';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCallsExecuted?: string[];
  reportTable?: {
    title: string;
    headers: string[];
    rows: (string | number)[][];
    summary?: string;
  };
}

export interface WmsAiConfig {
  apiKey?: string;
  allowedUsers: string[];
  enabled: boolean;
  model: string;
}

/**
 * Mengambil API Key aktif (dari localStorage jika di-override Superadmin, atau default)
 */
export function getActiveGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const customKey = localStorage.getItem('wms_gemini_api_key');
    if (customKey && customKey.trim()) return customKey.trim();
  }
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (envKey && String(envKey).trim()) return String(envKey).trim();
  return '';
}

/**
 * Menyimpan custom API Key
 */
export function setActiveGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key && key.trim()) {
      localStorage.setItem('wms_gemini_api_key', key.trim());
    } else {
      localStorage.removeItem('wms_gemini_api_key');
    }
  }
}

/**
 * Mengambil konfigurasi AI & daftar whitelist pengguna dari Supabase (dengan cache localStorage)
 */
export async function fetchAiConfig(): Promise<WmsAiConfig> {
  const defaultConfig: WmsAiConfig = {
    apiKey: '',
    allowedUsers: ['admin', 'warehouse', 'chocoadm'],
    enabled: true,
    model: 'gemini-3.5-flash'
  };

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('wms_ai_allowed_users');
      if (cached) {
        defaultConfig.allowedUsers = JSON.parse(cached);
      }
    } catch {}
  }

  try {
    const docs = await supabaseFetch<any[]>(
      'wms_system_docs',
      'GET',
      null,
      `section_id=eq.${SYSTEM_DOC_AI_CONFIG_ID}&limit=1`
    );

    if (docs && docs[0] && docs[0].content) {
      const parsed = JSON.parse(docs[0].content);
      const config: WmsAiConfig = {
        ...defaultConfig,
        ...parsed,
        allowedUsers: Array.isArray(parsed.allowedUsers) ? parsed.allowedUsers : defaultConfig.allowedUsers
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('wms_ai_allowed_users', JSON.stringify(config.allowedUsers));
        if (config.apiKey) {
          localStorage.setItem('wms_gemini_api_key', config.apiKey);
        }
      }
      return config;
    }
  } catch (err) {
    console.warn('[WMS AI] Gagal mengambil konfigurasi AI dari Supabase, menggunakan cache lokal:', err);
  }

  return defaultConfig;
}

/**
 * Menyimpan konfigurasi AI & whitelist pengguna ke Supabase & localStorage
 */
export async function saveAiConfig(config: Partial<WmsAiConfig>): Promise<boolean> {
  try {
    const current = await fetchAiConfig();
    const updated: WmsAiConfig = {
      ...current,
      ...config,
      allowedUsers: config.allowedUsers || current.allowedUsers
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('wms_ai_allowed_users', JSON.stringify(updated.allowedUsers));
      if (updated.apiKey) {
        localStorage.setItem('wms_gemini_api_key', updated.apiKey);
      } else {
        localStorage.removeItem('wms_gemini_api_key');
      }
    }

    await supabaseFetch(
      'wms_system_docs',
      'POST',
      [
        {
          section_id: SYSTEM_DOC_AI_CONFIG_ID,
          title: 'Konfigurasi & Whitelist Pengguna Asisten AI WMS',
          content: JSON.stringify(updated),
          updated_at: new Date().toISOString()
        }
      ],
      '',
      true
    );

    return true;
  } catch (err) {
    console.error('[WMS AI] Gagal menyimpan konfigurasi AI ke Supabase:', err);
    return false;
  }
}

// =============================================================================
// TOOL DEFINITIONS (Function Declarations for Gemini)
// =============================================================================

const AI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'lookup_product_stock',
        description: 'Mencari stok fisik terkini di rak gudang, kuota DealPOS, dan lokasi rak untuk produk tertentu berdasarkan nama produk, kata kunci, atau kode SKU.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Nama produk atau kata kunci atau SKU, contoh: "sailor top", "taylor pants", "DF26KBF03DDC"'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'lookup_production_code',
        description: 'Mencari informasi kode produksi atau kode kedatangan barang di gudang (nama produk, foto UP Trello, warna, no surat jalan, tanggal kedatangan).',
        parameters: {
          type: 'OBJECT',
          properties: {
            code: {
              type: 'STRING',
              description: 'Kode produksi atau kode produk, contoh: "6612", "7312", "F25JBF3100"'
            }
          },
          required: ['code']
        }
      },
      {
        name: 'generate_production_recap',
        description: 'Membuat rekapitulasi data penerimaan barang produksi (CMT & Kargo) berdasarkan bulan dan tahun, atau rentang tanggal tertentu.',
        parameters: {
          type: 'OBJECT',
          properties: {
            month: {
              type: 'NUMBER',
              description: 'Nomor bulan (1-12), contoh: 10 untuk Oktober'
            },
            year: {
              type: 'NUMBER',
              description: 'Tahun 4 digit, contoh: 2026 atau 2025'
            },
            category: {
              type: 'STRING',
              description: 'Opsional: "Lokal CMT" atau "Kargo" jika ingin filter kategori spesifik'
            }
          },
          required: ['month', 'year']
        }
      },
      {
        name: 'search_manual_shipment',
        description: 'Mencari data pengiriman pesanan manual store / resolusi berdasarkan no resi, nama toko / customer, atau no surat jalan.',
        parameters: {
          type: 'OBJECT',
          properties: {
            keyword: {
              type: 'STRING',
              description: 'Kata kunci pencarian, contoh no resi "JP1234567890", nama toko "PIM", atau no surat jalan'
            }
          },
          required: ['keyword']
        }
      },
      {
        name: 'add_to_inventory_cart',
        description: 'Memasukkan satu atau beberapa produk ke dalam Keranjang Order / Picking Cart di modul Inventory setelah jumlah (qty), warna, dan size telah dikonfirmasi atau disetujui pengguna.',
        parameters: {
          type: 'OBJECT',
          properties: {
            items: {
              type: 'ARRAY',
              description: 'Daftar produk yang akan dimasukkan ke keranjang order',
              items: {
                type: 'OBJECT',
                properties: {
                  sku: { type: 'STRING', description: 'Kode SKU produk persis dari hasil lookup' },
                  qty: { type: 'NUMBER', description: 'Jumlah pcs yang dimasukkan (harus lebih dari 0)' },
                  nama_produk: { type: 'STRING', description: 'Nama produk lengkap' },
                  size: { type: 'STRING', description: 'Ukuran produk (S/M/L/All Size, dll)' }
                },
                required: ['sku', 'qty']
              }
            }
          },
          required: ['items']
        }
      },
      {
        name: 'view_inventory_cart',
        description: 'Melihat rincian produk, size, dan kuantitas yang saat ini sudah ada di dalam Keranjang Order Inventory.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      }
    ]
  }
];

// =============================================================================
// LOCAL TOOL EXECUTORS
// =============================================================================

/**
 * 1. Eksekusi tool: lookup_product_stock
 */
async function executeLookupProductStock(args: { query: string }): Promise<any> {
  const query = String(args.query || '').trim().toLowerCase();
  if (!query) {
    return { error: 'Query pencarian kosong' };
  }

  // Cari di in-memory master catalog
  const catalogMap = getGlobalProductCatalogMap();
  let matchedItems: ProductItem[] = [];

  if (catalogMap && catalogMap.size > 0) {
    const set = new Set<string>();
    catalogMap.forEach((item) => {
      const name = String(item.d || (item as any).deskripsi || (item as any).nama_produk || '').toLowerCase();
      const sku = String(item.k || (item as any).sku || '').toLowerCase();
      const code = String(item.nomor || (item as any).kode_produk || '').toLowerCase();

      if (name.includes(query) || sku.includes(query) || code.includes(query)) {
        const itemKey = `${item.d}_${item.k}`;
        if (!set.has(itemKey)) {
          set.add(itemKey);
          matchedItems.push(item);
        }
      }
    });
  } else {
    // Fallback: baca dari localStorage jika catalogMap belum terisi
    try {
      const raw = localStorage.getItem('wms_master_produk') || localStorage.getItem('productCatalog');
      if (raw) {
        const parsed: ProductItem[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          matchedItems = parsed.filter((it) => {
            const name = String(it.d || (it as any).deskripsi || (it as any).nama_produk || '').toLowerCase();
            const sku = String(it.k || (it as any).sku || '').toLowerCase();
            return name.includes(query) || sku.includes(query);
          }).slice(0, 30);
        }
      }
    } catch {}
  }

  // Batasi maksimal 25 varian agar tidak membebani konteks
  matchedItems = matchedItems.slice(0, 25);

  if (matchedItems.length === 0) {
    return {
      message: `Tidak ditemukan produk di katalog dengan kata kunci "${query}".`,
      products: []
    };
  }

  const skus = matchedItems.map((m) => String(m.k || (m as any).sku || '').trim().toUpperCase()).filter(Boolean);
  
  // Ambil lokasi rak live dari Supabase PostgREST stok_real_fisik
  let stockRacks: any[] = [];
  try {
    stockRacks = await fetchStockForSkus(skus);
  } catch (e) {
    console.warn('[WMS AI] Gagal fetch rak stok live:', e);
  }

  // Kelompokkan per SKU
  const rackMap = new Map<string, { locations: string[]; totalFisik: number }>();
  stockRacks.forEach((sr) => {
    const s = String(sr.sku || '').toUpperCase();
    if (!rackMap.has(s)) {
      rackMap.set(s, { locations: [], totalFisik: 0 });
    }
    const entry = rackMap.get(s)!;
    const qty = Number(sr.sisa_stok) || 0;
    if (qty > 0 && sr.lokasi) {
      entry.locations.push(`${sr.lokasi} (${qty} pcs)`);
      entry.totalFisik += qty;
    }
  });

  const results = matchedItems.map((item) => {
    const sku = String(item.k || (item as any).sku || '').trim().toUpperCase();
    const rackInfo = rackMap.get(sku) || { locations: [], totalFisik: 0 };
    return {
      nama_produk: item.d || (item as any).deskripsi || (item as any).nama_produk || 'Produk Tanpa Nama',
      sku: sku,
      size: (item as any).size || (item as any).s || '-',
      warna: (item as any).warna || (item as any).w || '-',
      kategori: (item as any).category || (item as any).c || '-',
      stok_dealpos: Number(item.qty ?? (item as any).stok ?? 0),
      stok_fisik_rak: rackInfo.totalFisik,
      lokasi_rak: rackInfo.locations.length > 0 ? rackInfo.locations.join(', ') : 'Belum ada stok fisik di rak'
    };
  });

  return {
    query: query,
    total_ditemukan: results.length,
    products: results
  };
}

/**
 * 2. Eksekusi tool: lookup_production_code
 */
async function executeLookupProductionCode(args: { code: string }): Promise<any> {
  const code = normalizeLookupCode(args.code);
  if (!code) {
    return { error: 'Kode produksi kosong' };
  }

  // 1. Cek di Trello UP Catalog
  const trelloItems = getLocalCachedTrelloItems();
  const matchedTrello = trelloItems.filter((t) => {
    const exact = normalizeLookupCode(t.item_code);
    return exact === code || exact.includes(code) || code.includes(exact);
  }).slice(0, 5);

  // 2. Cek di Riwayat Penerimaan Produksi (Supabase / Local)
  let matchedPenerimaan: PenerimaanProduksiItem[] = [];
  try {
    matchedPenerimaan = await fetchPenerimaanProduksiFromSupabase({ keyword: code });
  } catch {}

  return {
    query_code: code,
    trello_catalog_matches: matchedTrello.map((t) => ({
      item_code: t.item_code,
      product_name: t.product_name,
      up_code: t.up_code || 'Tanpa UP',
      photo_url: t.photo_url || null,
      notes: t.notes || ''
    })),
    penerimaan_produksi_records: matchedPenerimaan.slice(0, 5).map((p) => ({
      tanggal_penerimaan: p.tanggal_penerimaan,
      no_surat_jalan: p.no_surat_jalan,
      kategori: p.kategori,
      kode_produksi: p.kode_produksi,
      nama_produk: p.nama_produk,
      warna: p.warna,
      qty_total: p.total_pcs || p.total_qty || 0
    }))
  };
}

/**
 * 3. Eksekusi tool: generate_production_recap
 */
async function executeGenerateProductionRecap(args: { month: number; year: number; category?: string }): Promise<any> {
  const month = Number(args.month) || new Date().getMonth() + 1;
  const year = Number(args.year) || new Date().getFullYear();
  
  // Format tanggal YYYY-MM-01 s/d YYYY-MM-LastDay
  const startMonthStr = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${startMonthStr}-01`;
  const endDate = `${year}-${startMonthStr}-${String(lastDay).padStart(2, '0')}`;

  const monthNames = [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const periodeLabel = `${monthNames[month] || month} ${year}`;

  let items: PenerimaanProduksiItem[] = [];
  try {
    items = await fetchPenerimaanProduksiFromSupabase({ startDate, endDate });
  } catch (e) {
    console.warn('[WMS AI] Gagal mengambil data penerimaan untuk rekap:', e);
  }

  if (args.category) {
    const catLower = args.category.toLowerCase();
    items = items.filter((it) => (it.kategori || '').toLowerCase().includes(catLower));
  }

  // Agregasi Statistik
  let totalPcs = 0;
  const uniqueBatches = new Set<string>();
  const uniqueCodes = new Set<string>();
  const categorySummary: Record<string, { pcs: number; batches: number }> = {};
  const productSummary: Record<string, number> = {};

  items.forEach((it) => {
    const qty = Number(it.total_pcs ?? it.total_qty ?? 0);
    totalPcs += qty;
    if (it.no_surat_jalan) uniqueBatches.add(it.no_surat_jalan);
    if (it.kode_produksi) uniqueCodes.add(it.kode_produksi);

    const cat = it.kategori || 'Lainnya';
    if (!categorySummary[cat]) categorySummary[cat] = { pcs: 0, batches: 0 };
    categorySummary[cat].pcs += qty;

    const prodName = it.nama_produk || it.kode_produksi || 'Tanpa Nama';
    productSummary[prodName] = (productSummary[prodName] || 0) + qty;
  });

  // Top 5 Produk Terbanyak
  const topProducts = Object.entries(productSummary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nama, pcs]) => ({ nama_produk: nama, total_pcs: pcs }));

  return {
    periode: periodeLabel,
    rentang_tanggal: `${startDate} s/d ${endDate}`,
    total_surat_jalan: uniqueBatches.size,
    total_kode_produksi: uniqueCodes.size,
    total_pcs_diterima: totalPcs,
    breakdown_kategori: categorySummary,
    top_5_produk_terbanyak: topProducts,
    sample_records_count: items.length
  };
}

/**
 * 4. Eksekusi tool: search_manual_shipment
 */
async function executeSearchManualShipment(args: { keyword: string }): Promise<any> {
  const kw = String(args.keyword || '').trim().toLowerCase();
  if (!kw) return { error: 'Kata kunci kosong' };

  try {
    const rows = await supabaseFetch<any[]>(
      'manual_shipment',
      'GET',
      null,
      `or=(no_resi.ilike.*${encodeURIComponent(kw)}*,nama_toko.ilike.*${encodeURIComponent(kw)}*,no_surat_jalan.ilike.*${encodeURIComponent(kw)}*,nama_customer.ilike.*${encodeURIComponent(kw)}*)&limit=10`
    );

    if (Array.isArray(rows) && rows.length > 0) {
      return {
        total: rows.length,
        shipments: rows.map((r) => ({
          no_surat_jalan: r.no_surat_jalan,
          no_resi: r.no_resi || 'Belum ada resi',
          nama_toko: r.nama_toko || r.store_name || '-',
          nama_customer: r.nama_customer || '-',
          status: r.status || 'diproses',
          ekspedisi: r.ekspedisi || '-',
          tanggal: r.tanggal_kirim || r.created_at,
          total_item: r.total_qty || (r.items ? r.items.length : 0)
        }))
      };
    }
  } catch (e) {
    console.warn('[WMS AI] Gagal mencari manual_shipment:', e);
  }

  return {
    message: `Tidak ditemukan data pengiriman dengan kata kunci "${kw}".`,
    shipments: []
  };
}

/**
 * 5. Eksekusi tool: add_to_inventory_cart
 */
async function executeAddToInventoryCart(args: {
  items: Array<{ sku: string; qty: number; nama_produk?: string; size?: string }>;
}): Promise<any> {
  if (!args.items || !Array.isArray(args.items) || args.items.length === 0) {
    return { error: 'Daftar produk untuk keranjang kosong.' };
  }

  // Ambil data stok live dari Supabase PostgREST stok_real_fisik
  const skus = args.items.map((it) => String(it.sku || '').trim().toUpperCase()).filter(Boolean);
  let liveRacks: any[] = [];
  try {
    liveRacks = await fetchStockForSkus(skus);
  } catch (err) {
    console.warn('[WMS AI] Gagal fetch stok live untuk keranjang:', err);
  }

  const rackMap = new Map<string, { locations: Array<{ lokasi: string; qty: number; area?: string }>; totalFisik: number }>();
  liveRacks.forEach((r) => {
    const s = String(r.sku || '').toUpperCase();
    if (!rackMap.has(s)) {
      rackMap.set(s, { locations: [], totalFisik: 0 });
    }
    const entry = rackMap.get(s)!;
    const q = Number(r.sisa_stok) || 0;
    if (q > 0 && r.lokasi) {
      entry.locations.push({ lokasi: r.lokasi, qty: q, area: r.area });
      entry.totalFisik += q;
    }
  });

  // Baca keranjang saat ini dari localStorage
  let currentCart: any[] = [];
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('wms_inventory_picking_cart') : null;
    if (raw) currentCart = JSON.parse(raw);
  } catch {}

  const updatedCartMap = new Map<string, any>();
  currentCart.forEach((c) => {
    if (c && c.sku) updatedCartMap.set(String(c.sku).toUpperCase(), { ...c });
  });

  const addedReport: any[] = [];

  for (const it of args.items) {
    const cleanSku = String(it.sku || '').trim().toUpperCase();
    if (!cleanSku) continue;

    const lookup = lookupProductBySku(cleanSku);
    const rackInfo = rackMap.get(cleanSku) || { locations: [], totalFisik: 0 };
    const avail = rackInfo.totalFisik;
    const requestedQty = Math.max(1, Number(it.qty) || 1);

    const existing = updatedCartMap.get(cleanSku);
    const newQty = existing ? existing.qty + requestedQty : requestedQty;

    const cartItem = {
      sku: cleanSku,
      nama_produk: it.nama_produk || lookup.nama_produk || existing?.nama_produk || cleanSku,
      size: it.size || lookup.size || existing?.size || '-',
      qty: newQty,
      available_stock: avail,
      locations: rackInfo.locations
    };

    updatedCartMap.set(cleanSku, cartItem);
    addedReport.push({
      sku: cleanSku,
      nama_produk: cartItem.nama_produk,
      size: cartItem.size,
      qty_ditambahkan: requestedQty,
      total_qty_di_keranjang: newQty,
      stok_tersedia_di_rak: avail,
      lokasi_rak: rackInfo.locations.map((l) => `${l.lokasi} (${l.qty} pcs)`).join(', ') || 'Belum ada stok fisik di rak'
    });
  }

  const finalCart = Array.from(updatedCartMap.values());
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('wms_inventory_picking_cart', JSON.stringify(finalCart));
      window.dispatchEvent(
        new CustomEvent('wms_inventory_cart_updated', {
          detail: { totalCount: finalCart.length, items: finalCart }
        })
      );
    }
  } catch {}

  return {
    status: 'success',
    pesan: `Berhasil menambahkan ${addedReport.length} item ke Keranjang Order Inventory.`,
    rincian_item: addedReport,
    total_item_di_keranjang: finalCart.length
  };
}

/**
 * 6. Eksekusi tool: view_inventory_cart
 */
async function executeViewInventoryCart(): Promise<any> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('wms_inventory_picking_cart') : null;
    const items = raw ? JSON.parse(raw) : [];
    return {
      total_item_di_keranjang: items.length,
      items: items.map((it: any) => ({
        sku: it.sku,
        nama_produk: it.nama_produk,
        size: it.size,
        qty: it.qty,
        available_stock: it.available_stock
      }))
    };
  } catch {
    return { total_item_di_keranjang: 0, items: [] };
  }
}

// =============================================================================
// MAIN CHAT COMPLETION CONTROLLER
// =============================================================================

const SYSTEM_INSTRUCTION = `Anda adalah Asisten AI Cerdas resmi untuk sistem WMS Inventory (Chocochips Warehouse).
Tugas utama Anda adalah membantu staf gudang, operasional, dan manajemen dengan cepat, akurat, dan ramah dalam Bahasa Indonesia.

PANDUAN & ATURAN UTAMA:
1. AKURASI DATA GUDANG: Selalu gunakan Function Calling (tools) yang disediakan untuk mengecek data nyata di database WMS. JANGAN pernah mereka-reka (halusinasi) nomor rak, kode SKU, atau stok barang.
2. TANYA STOK: Saat ditanya stok produk, panggil tool "lookup_product_stock". Laporkan stok fisik di rak gudang, kuota DealPOS, serta rincian lokasi rak (misal Rak B014, Transit, dsb.).
3. TANYA KODE PRODUKSI: Saat ditanya kode produk atau nama barang dari kode tertentu (misal 6612), panggil tool "lookup_production_code" untuk memeriksa Trello UP dan Riwayat Penerimaan.
4. REKAP / LAPORAN: Saat diminta membuat rekap (misal rekap kedatangan Oktober), panggil tool "generate_production_recap". Sajikan jawaban dalam format tabel Markdown yang rapi, profesional, dan mudah dibaca serta sertakan kesimpulan singkat.
5. FITUR KERANJANG ORDER INVENTORY (INTERAKTIF & TANYA JAWAB NEGOSIASI):
   Ketika pengguna meminta untuk memasukkan barang ke keranjang order (misal "Tolong masukkan sailor top dan taylor pants ke keranjang"):
   a. JANGAN LANGSUNG EKSEKUSI JIKA BELUM JELAS: Panggil terlebih dahulu tool "lookup_product_stock" untuk memeriksa seluruh varian (warna & size) dan jumlah stok fisik real-time di rak.
   b. TANYA QTY JIKA PENGGUNA BELUM MENYEBUTKAN JUMLAH: Jika pengguna tidak menyebutkan qty (misal hanya minta nama produk), tanyakan dengan ramah mau dimasukkan berapa pcs untuk tiap varian yang ada stoknya.
   c. TAWARKAN ALTERNATIF JIKA WARNA KOSONG: Jika pengguna meminta warna yang stok fisiknya 0 pcs (misal minta warna Maroon tapi di rak kosong), jelaskan bahwa warna Maroon sedang kosong, lalu secara aktif TAWARKAN warna lain yang masih tersedia stok fisiknya di rak (misal: "Warna Maroon kosong kak, tapi ready warna Forest (12 pcs di B020) dan Black (5 pcs di B015). Mau yang warna Forest atau Black?").
   d. TAWARKAN ALTERNATIF JIKA SIZE KOSONG: Jika pengguna minta size S tetapi size S kosong (0 pcs), tawarkan alternatif size lain yang masih ada stok di rak (misal size M atau L).
   e. EKSEKUSI SETELAH DISETUJUI / DIKONFIRMASI: Jika pengguna sudah memberikan konfirmasi qty, warna, dan size (atau dari awal sudah jelas dan ada stoknya), PANGGIL TOOL "add_to_inventory_cart". Sajikan tabel konfirmasi SKU, Nama, Size, Qty, dan Posisi Rak, lalu infokan bahwa pesanan telah berhasil masuk ke Keranjang Order Inventory dan bisa langsung dibuka di menu Inventory!
6. TONE OF VOICE: Ramah, komunikatif, profesional, ringkas, dan proaktif membantu pekerjaan tim gudang.`;

/**
 * Mengirim pesan ke Google Gemini dengan multi-turn Tool Execution loop
 */
export async function sendChatMessageToGemini(
  conversationHistory: AiChatMessage[],
  userPrompt: string,
  onToolCallStart?: (toolName: string) => void
): Promise<{ text: string; executedTools: string[] }> {
  const apiKey = getActiveGeminiApiKey();
  if (!apiKey) {
    throw new Error('API Key Google Gemini belum dikonfigurasi. Hubungi Superadmin.');
  }

  // Pilih model (prioritas gemini-3.5-flash, fallback gemini-3.5-flash-lite)
  const modelsToTry = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
  let currentModelIndex = 0;

  // Bangun riwayat contents
  const contents: any[] = [];

  // Sisipkan beberapa percakapan sebelumnya jika ada
  const recentHistory = conversationHistory.slice(-6);
  recentHistory.forEach((msg) => {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.text }] });
    } else if (msg.role === 'model') {
      contents.push({ role: 'model', parts: [{ text: msg.text }] });
    }
  });

  // Tambahkan prompt baru dari user
  contents.push({
    role: 'user',
    parts: [{ text: userPrompt }]
  });

  const executedTools: string[] = [];

  // Helper kirim request ke Gemini API
  const postToGemini = async (modelName: string, bodyPayload: any): Promise<any> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.error?.message || `HTTP ${response.status}`;
      throw new Error(errMsg);
    }
    return data;
  };

  // Loop tool calling (maksimal 4 iterasi untuk menghindari loop tak berujung)
  let loopCount = 0;
  const MAX_LOOPS = 4;

  while (loopCount < MAX_LOOPS) {
    loopCount++;
    const currentModel = modelsToTry[currentModelIndex] || 'gemini-3.5-flash';

    let geminiResponse: any = null;
    try {
      geminiResponse = await postToGemini(currentModel, {
        contents: contents,
        tools: AI_TOOLS,
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        }
      });
    } catch (apiError: any) {
      console.warn(`[WMS AI] Gagal pada model ${currentModel}:`, apiError);
      // Jika model ini 503 atau limit, coba fallback model berikutnya
      if (currentModelIndex < modelsToTry.length - 1) {
        currentModelIndex++;
        continue;
      }
      throw apiError;
    }

    const candidate = geminiResponse.candidates?.[0];
    if (!candidate || !candidate.content) {
      throw new Error('Tidak ada respon yang diterima dari Gemini API.');
    }

    const modelContent = candidate.content;
    const parts = modelContent.parts || [];

    // Cari apakah model meminta satu atau beberapa Function Call
    const functionCallParts = parts.filter((p: any) => p.functionCall);

    if (functionCallParts.length === 0) {
      // Tidak ada function call, kita mendapatkan jawaban teks akhir!
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n');
      return {
        text: textParts || 'Selesai memproses.',
        executedTools
      };
    }

    // Eksekusi SEMUA Tool Calls yang diminta model dalam turn ini
    const functionResponseParts: any[] = [];

    for (const fcPart of functionCallParts) {
      const fnName = fcPart.functionCall.name;
      const fnArgs = fcPart.functionCall.args || {};
      executedTools.push(fnName);
      onToolCallStart?.(fnName);

      let toolResult: any = null;
      try {
        if (fnName === 'lookup_product_stock') {
          toolResult = await executeLookupProductStock(fnArgs);
        } else if (fnName === 'lookup_production_code') {
          toolResult = await executeLookupProductionCode(fnArgs);
        } else if (fnName === 'generate_production_recap') {
          toolResult = await executeGenerateProductionRecap(fnArgs);
        } else if (fnName === 'search_manual_shipment') {
          toolResult = await executeSearchManualShipment(fnArgs);
        } else if (fnName === 'add_to_inventory_cart') {
          toolResult = await executeAddToInventoryCart(fnArgs);
        } else if (fnName === 'view_inventory_cart') {
          toolResult = await executeViewInventoryCart();
        } else {
          toolResult = { error: `Fungsi ${fnName} tidak dikenali.` };
        }
      } catch (toolExecErr: any) {
        toolResult = { error: toolExecErr?.message || 'Gagal mengeksekusi data WMS' };
      }

      functionResponseParts.push({
        functionResponse: {
          name: fnName,
          response: toolResult
        }
      });
    }

    // Sisipkan modelContent lengkap (termasuk thoughtSignature) ke riwayat
    contents.push(modelContent);

    // Sisipkan SEMUA functionResponse dari user
    contents.push({
      role: 'user',
      parts: functionResponseParts
    });
  }

  // Jika mencapai batas maksimal loop, minta model memberikan kesimpulan akhir
  try {
    const finalModel = modelsToTry[currentModelIndex] || 'gemini-3.5-flash';
    contents.push({
      role: 'user',
      parts: [{ text: 'Berdasarkan data yang sudah diperiksa di atas, silakan berikan jawaban dan rincian lengkapnya sekarang.' }]
    });
    const finalRes = await postToGemini(finalModel, {
      contents,
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
    });
    const candidate = finalRes.candidates?.[0];
    const textParts = candidate?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join('\n');
    if (textParts) {
      return { text: textParts, executedTools };
    }
  } catch {}

  return {
    text: 'Selesai menganalisis data gudang.',
    executedTools
  };
}
