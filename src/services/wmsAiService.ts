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
import { getGlobalProductCatalogMap, lookupProductBySku, setGlobalProductCatalog, ProductLookupResult } from '../utils/productLookup';
import { cleanProductName, resolveProductDisplaySize, extractSizeFromSku } from '../utils/sortUtils';
import { getAllProductsFromLocalDb } from './localDb';
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

let inMemoryGeminiApiKey = '';

/**
 * Mengambil API Key aktif (dari in-memory, localStorage, Supabase, atau env)
 */
export function getActiveGeminiApiKey(): string {
  if (inMemoryGeminiApiKey && inMemoryGeminiApiKey.trim()) {
    return inMemoryGeminiApiKey.trim();
  }
  if (typeof window !== 'undefined') {
    const customKey = localStorage.getItem('wms_gemini_api_key');
    if (customKey && customKey.trim()) {
      inMemoryGeminiApiKey = customKey.trim();
      return inMemoryGeminiApiKey;
    }
  }
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (envKey && String(envKey).trim()) {
    inMemoryGeminiApiKey = String(envKey).trim();
    return inMemoryGeminiApiKey;
  }
  return '';
}

/**
 * Menyimpan custom API Key secara lokal & in-memory
 */
export function setActiveGeminiApiKey(key: string): void {
  inMemoryGeminiApiKey = (key || '').trim();
  if (typeof window !== 'undefined') {
    if (inMemoryGeminiApiKey) {
      localStorage.setItem('wms_gemini_api_key', inMemoryGeminiApiKey);
    } else {
      localStorage.removeItem('wms_gemini_api_key');
    }
  }
}

/**
 * Mengambil konfigurasi AI & daftar whitelist pengguna dari Supabase wms_system_docs
 * (Tersinkronisasi otomatis ke semua perangkat: HP, Laptop, PC Toko)
 */
export async function fetchAiConfig(): Promise<WmsAiConfig> {
  const defaultConfig: WmsAiConfig = {
    apiKey: getActiveGeminiApiKey() || '',
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
      `doc_key=eq.${SYSTEM_DOC_AI_CONFIG_ID}&limit=1`
    );

    if (docs && docs[0] && docs[0].content) {
      const parsed = JSON.parse(docs[0].content);
      const config: WmsAiConfig = {
        ...defaultConfig,
        ...parsed,
        allowedUsers: Array.isArray(parsed.allowedUsers) ? parsed.allowedUsers : defaultConfig.allowedUsers
      };

      if (config.apiKey) {
        setActiveGeminiApiKey(config.apiKey);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('wms_ai_allowed_users', JSON.stringify(config.allowedUsers));
      }
      return config;
    }
  } catch (err) {
    console.warn('[WMS AI] Gagal mengambil konfigurasi AI dari Supabase, menggunakan cache lokal:', err);
  }

  return defaultConfig;
}

/**
 * Menyimpan konfigurasi AI, API Key, & whitelist pengguna ke Supabase wms_system_docs
 * (Cukup Superadmin simpan 1 kali, otomatis aktif di seluruh perangkat dan user)
 */
export async function saveAiConfig(config: Partial<WmsAiConfig>): Promise<boolean> {
  try {
    const current = await fetchAiConfig();
    const updated: WmsAiConfig = {
      ...current,
      ...config,
      allowedUsers: config.allowedUsers || current.allowedUsers
    };

    if (updated.apiKey !== undefined) {
      setActiveGeminiApiKey(updated.apiKey);
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('wms_ai_allowed_users', JSON.stringify(updated.allowedUsers));
    }

    await supabaseFetch(
      'wms_system_docs',
      'POST',
      [
        {
          section_id: SYSTEM_DOC_AI_CONFIG_ID,
          doc_key: SYSTEM_DOC_AI_CONFIG_ID,
          title: 'Konfigurasi & Whitelist Pengguna Asisten AI WMS',
          content: JSON.stringify(updated),
          updated_at: new Date().toISOString()
        }
      ],
      'on_conflict=doc_key',
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
        description: 'Mencari stok fisik terkini di rak gudang, kuota DealPOS, dan lokasi rak untuk satu ATAU BANYAK NAMA PRODUK SEKALIGUS (batch) berdasarkan NAMA PRODUK pakaian (contoh: "ruth top cherry", "sailor top", "taylor pants"). SANGAT DISARANKAN menggunakan parameter "queries" jika pengguna meminta cek banyak produk sekaligus dalam 1 pesan agar instan dan hemat token!',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Nama satu produk jika hanya mencari 1 produk, contoh: "ruth top cherry"'
            },
            queries: {
              type: 'ARRAY',
              description: 'Daftar nama banyak produk jika pengguna meminta cek banyak produk sekaligus (misal 5, 10, atau 29 produk), contoh: ["ruth top cherry", "sailor top", "taylor pants"]',
              items: { type: 'STRING' }
            }
          }
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
 * Mengambil seluruh data katalog master produk dari in-memory, IndexedDB native, atau cache localStorage
 */
async function getResolvedMasterProducts(): Promise<ProductItem[]> {
  // 1. Prioritas utama: in-memory global catalog Map (O(1))
  const catalogMap = getGlobalProductCatalogMap();
  if (catalogMap && catalogMap.size > 0) {
    return Array.from(catalogMap.values());
  }

  // 2. Baca dari IndexedDB native WMS (seluruh 28.000+ produk tanpa terpotong)
  try {
    const idbProducts = await getAllProductsFromLocalDb();
    if (Array.isArray(idbProducts) && idbProducts.length > 0) {
      setGlobalProductCatalog(idbProducts);
      return idbProducts;
    }
  } catch (err) {
    console.warn('[WMS AI] Gagal membaca produk dari IndexedDB:', err);
  }

  // 3. Fallback cache localStorage
  try {
    const cacheKeys = ['wms_master_produk', 'productCatalog', 'wms_product_cache', 'wms_catalog_cache'];
    for (const key of cacheKeys) {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setGlobalProductCatalog(parsed);
        return parsed;
      }
    }
  } catch {}

  return [];
}

/**
 * Helper pencocokan token kata utuh (Word-Boundary Token Matching)
 * Mencegah kesalahan 'truth' mencocokkan 'ruth', atau kata yang saling tertukar.
 */
function matchAllTokensStrict(targetText: string, tokens: string[]): boolean {
  if (!tokens || tokens.length === 0) return false;
  const words = targetText.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.every((tok) => words.some((w) => w === tok || (w.startsWith(tok) && tok.length >= 4)));
}

/**
 * Eksekusi lookup 1 produk secara menyeluruh (Master Catalog + Supabase PostgREST)
 */
async function searchSingleProductDetail(rawQuery: string, masterProducts: ProductItem[]): Promise<any> {
  const cleanQuery = rawQuery.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const queryTokens = cleanQuery.split(' ').filter(Boolean);
  if (queryTokens.length === 0) {
    return {
      query: rawQuery,
      total_ditemukan: 0,
      total_stok_fisik: 0,
      lokasi_rak: 'Stok Kosong / Belum Ada di Rak Gudang',
      stok_dealpos: 0,
      products: [],
      pesan: `Nama produk "${rawQuery}" kosong.`
    };
  }

  const scoredMatches: Array<{ item: ProductItem; score: number }> = [];
  const seenKeys = new Set<string>();

  // 1. Cek di Master Catalog Lokal (Memory / IndexedDB)
  if (masterProducts.length > 0) {
    for (let i = 0; i < masterProducts.length; i++) {
      const item = masterProducts[i];
      if (!item) continue;

      const rawP = String(item.p || (item as any).product_name || '').trim();
      const rawN = String(item.n || (item as any).nama || (item as any).nama_produk || (item as any).deskripsi || '').trim();
      const cleanP = cleanProductName(rawP || rawN) || rawP || rawN;
      const sku = String(item.k || (item as any).sku || '').trim().toUpperCase();
      const code = String((item as any).kode_produk || (item as any).kode_produksi || (item as any).nomor || '').trim().toUpperCase();
      const color = String((item as any).warna || (item as any).w || (item as any).color || '').trim();
      const size = String(item.s || (item as any).size || extractSizeFromSku(sku) || '').trim();
      const cat = String(item.category || item.c || (item as any).kategori || '').trim();

      if (!cleanP && !rawN && !sku) continue;

      const pLower = cleanP.toLowerCase();
      const nLower = rawN.toLowerCase();
      const searchableAll = `${pLower} ${nLower} ${color.toLowerCase()} ${size.toLowerCase()} ${code.toLowerCase()} ${sku.toLowerCase()} ${cat.toLowerCase()}`;

      let score = 0;

      // Tier 1: Exact phrase match
      if (cleanQuery === pLower || cleanQuery === nLower || cleanQuery === sku.toLowerCase()) {
        score += 160;
      } else if (pLower.includes(cleanQuery) || nLower.includes(cleanQuery)) {
        score += 120;
      } else if (matchAllTokensStrict(searchableAll, queryTokens)) {
        // Seluruh kata cocok sebagai kata utuh (misal "ruth", "top", "cherry")
        score += 100 + (queryTokens.length * 10);
      } else if (queryTokens.length > 2) {
        // Toleransi jika sebagian besar kata cocok
        const words = searchableAll.split(/[^a-z0-9]+/).filter(Boolean);
        const matched = queryTokens.filter((tok) => words.some((w) => w === tok || (w.startsWith(tok) && tok.length >= 4)));
        if (matched.length >= queryTokens.length - 1) {
          score += 40 + (matched.length * 5);
        }
      }

      if (score > 0) {
        const itemKey = `${sku}_${cleanP}_${size}_${color}`;
        if (!seenKeys.has(itemKey)) {
          seenKeys.add(itemKey);
          scoredMatches.push({ item, score });
        }
      }
    }
  }

  scoredMatches.sort((a, b) => b.score - a.score);
  let matchedItems = scoredMatches.slice(0, 20).map((m) => m.item);
  const hasHighConfidence = scoredMatches.some((m) => m.score >= 100);

  // 2. Fallback Visual Katalog jika belum ada
  if (matchedItems.length === 0) {
    try {
      const rawKatalog = typeof window !== 'undefined'
        ? localStorage.getItem('wms_katalog_manual_data') || localStorage.getItem('wms_katalog_data')
        : null;
      if (rawKatalog) {
        const batches = JSON.parse(rawKatalog);
        if (Array.isArray(batches)) {
          for (const b of batches) {
            const list = b.items || b.products || [];
            if (!Array.isArray(list)) continue;
            for (const it of list) {
              const dName = String(it.deskripsi || it.nama || '').toLowerCase();
              const isMatch = matchAllTokensStrict(dName, queryTokens) || dName.includes(cleanQuery);
              if (isMatch && Array.isArray(it.variants)) {
                for (const v of it.variants) {
                  matchedItems.push({
                    k: v.sku || '',
                    p: it.deskripsi || it.nama || 'Produk Katalog',
                    n: `${it.deskripsi || ''} ${v.warna || ''} ${v.size || ''}`.trim(),
                    s: v.size || '-',
                    warna: v.warna || '-',
                    q: Number(v.stok || 0)
                  } as any);
                }
              }
            }
          }
        }
      }
    } catch {}
  }

  // 3. Fallback Langsung ke Supabase PostgREST (stok_real_fisik)
  // Dilakukan jika belum ada kecocokan 100% atau belum ditemukan di master
  if ((!hasHighConfidence || matchedItems.length === 0) && queryTokens.length > 0) {
    try {
      const searchToken = queryTokens[0];
      const sbRows = await supabaseFetch<any[]>(
        'stok_real_fisik',
        'GET',
        null,
        `or=(nama_produk.ilike.*${encodeURIComponent(searchToken)}*,sku.ilike.*${encodeURIComponent(searchToken)}*)&limit=50`
      );

      if (Array.isArray(sbRows) && sbRows.length > 0) {
        const filteredSb = sbRows.filter((r) => {
          const targetStr = `${r.nama_produk || ''} ${r.sku || ''}`;
          return matchAllTokensStrict(targetStr, queryTokens) || targetStr.toLowerCase().includes(cleanQuery);
        });

        if (filteredSb.length > 0) {
          // Jika ditemukan di stok_real_fisik dengan token 100% cocok, prioritas fisik ini!
          const distinctSbMap = new Map<string, any>();
          filteredSb.forEach((r) => {
            const s = String(r.sku || '').trim().toUpperCase();
            if (s && !distinctSbMap.has(s)) {
              distinctSbMap.set(s, r);
            }
          });

          // Jika sebelumnya hanya ada kecocokan lemah/parsial dari master, reset dengan data fisik nyata
          if (!hasHighConfidence) {
            matchedItems = [];
          }

          distinctSbMap.forEach((r) => {
            matchedItems.push({
              k: r.sku,
              p: cleanProductName(r.nama_produk) || r.nama_produk,
              n: r.nama_produk,
              s: extractSizeFromSku(r.sku) || r.size || '-',
              warna: r.warna || '-',
              q: 0
            } as any);
          });
        }
      }
    } catch (err) {
      console.warn('[WMS AI] Gagal query langsung ke Supabase stok_real_fisik:', err);
    }
  }

  // Batasi maksimal 20 varian teratas
  matchedItems = matchedItems.slice(0, 20);

  if (matchedItems.length === 0) {
    return {
      query: rawQuery,
      total_ditemukan: 0,
      total_stok_fisik: 0,
      lokasi_rak: 'Stok Kosong / Belum Ada di Rak Gudang',
      stok_dealpos: 0,
      products: [],
      pesan: `Produk "${rawQuery}" saat ini belum tercatat memiliki stok di rak gudang.`
    };
  }

  // 4. Ambil lokasi rak live dari Supabase PostgREST stok_real_fisik untuk seluruh SKU yang cocok
  const skus = matchedItems.map((m) => String(m.k || (m as any).sku || '').trim().toUpperCase()).filter(Boolean);
  let stockRacks: any[] = [];
  try {
    stockRacks = await fetchStockForSkus(skus);
  } catch (e) {
    console.warn('[WMS AI] Gagal fetch rak stok live:', e);
  }

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

  let grandTotalFisik = 0;
  let grandTotalDealpos = 0;
  const allLocationsList: string[] = [];

  const results = matchedItems.map((item) => {
    const sku = String(item.k || (item as any).sku || '').trim().toUpperCase();
    const rackInfo = rackMap.get(sku) || { locations: [], totalFisik: 0 };
    const rawP = String(item.p || (item as any).product_name || '').trim();
    const rawN = String(item.n || (item as any).nama || (item as any).nama_produk || (item as any).deskripsi || '').trim();
    const cleanP = cleanProductName(rawP || rawN) || rawP || rawN || 'Produk Tanpa Nama';

    const color = String((item as any).warna || (item as any).w || (item as any).color || '-').trim();
    const size = resolveProductDisplaySize(sku, String(item.s || (item as any).size || ''), String(item.s || ''));
    const dealpos = Number(item.qty ?? (item as any).stok ?? item.q ?? 0);

    grandTotalFisik += rackInfo.totalFisik;
    grandTotalDealpos += dealpos;
    if (rackInfo.locations.length > 0) {
      allLocationsList.push(...rackInfo.locations);
    }

    return {
      nama_produk: cleanP,
      nama_lengkap: rawN || cleanP,
      sku: sku,
      size: size,
      warna: color !== '-' ? color : (rawN.toLowerCase().includes('cherry') ? 'Cherry' : '-'),
      kategori: (item as any).category || (item as any).c || '-',
      stok_dealpos: dealpos,
      stok_fisik_rak: rackInfo.totalFisik,
      lokasi_rak: rackInfo.locations.length > 0 ? rackInfo.locations.join(', ') : 'Belum ada stok fisik di rak'
    };
  });

  return {
    query: rawQuery,
    total_ditemukan: results.length,
    total_stok_fisik: grandTotalFisik,
    lokasi_rak: allLocationsList.length > 0 ? Array.from(new Set(allLocationsList)).join(', ') : 'Belum ada stok fisik di rak',
    stok_dealpos: grandTotalDealpos,
    products: results
  };
}

/**
 * 1. Eksekusi tool: lookup_product_stock
 * Mendukung Single Query ATAU Batch Queries (puluhan produk sekaligus) dalam 1 kali pemanggilan!
 */
async function executeLookupProductStock(args: { query?: string; queries?: string[] }): Promise<any> {
  const masterProducts = await getResolvedMasterProducts();

  // Mode BATCH: Jika model mengirimkan array `queries`
  if (Array.isArray(args.queries) && args.queries.length > 0) {
    const cleanList = args.queries.map((q) => String(q || '').trim()).filter(Boolean);
    const batchResults: any[] = [];

    // Eksekusi per produk secara paralel
    const processed = await Promise.all(
      cleanList.map((q) => searchSingleProductDetail(q, masterProducts))
    );

    processed.forEach((itemRes, idx) => {
      batchResults.push({
        no: idx + 1,
        nama_diminta: itemRes.query,
        status: itemRes.total_ditemukan > 0
          ? (itemRes.total_stok_fisik > 0 ? 'DITEMUKAN' : 'HABIS_DI_RAK')
          : 'TIDAK_DITEMUKAN',
        total_stok_fisik: itemRes.total_stok_fisik || 0,
        lokasi_rak: itemRes.lokasi_rak || '-',
        stok_dealpos: itemRes.stok_dealpos || 0,
        sku_terkait: itemRes.products?.map((p: any) => p.sku).filter(Boolean).join(', ') || '-',
        rincian_varian: itemRes.products?.map((p: any) => `${p.size}/${p.warna}: ${p.stok_fisik_rak} pcs di ${p.lokasi_rak}`).join(' | ') || '-'
      });
    });

    return {
      is_batch: true,
      total_permintaan: batchResults.length,
      pesan_ringkas: `Pemeriksaan batch ${batchResults.length} produk selesai diproses.`,
      batch_results: batchResults
    };
  }

  // Mode SINGLE: Pencarian 1 produk
  const rawQuery = String(args.query || '').trim();
  if (!rawQuery) {
    return { error: 'Query pencarian kosong' };
  }

  return await searchSingleProductDetail(rawQuery, masterProducts);
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
Tugas utama Anda adalah membantu staf gudang, store, operasional, dan manajemen dengan cepat, akurat, dan ramah dalam Bahasa Indonesia.

PANDUAN & ATURAN UTAMA:
1. PENCARIAN BERBASIS NAMA PRODUK (DILARANG KERAS MEREKOMENDASIKAN / MEMINTA KODE SKU!):
   - Pengguna adalah staf gudang, store, dan manajemen yang biasa menyebut NAMA BAJU / PAKAIAN (contoh: "Ruth Top Cherry", "Sailor Top", "Taylor Pants", "Celana Kulot"), BUKAN Kode SKU barcode yang panjang dan rumit.
   - DILARANG KERAS menyuruh, meminta, merekomendasikan, atau mengasumsikan pengguna untuk memberikan/mencari Kode SKU atau Kode Produksi!
   - JANGAN PERNAH menuliskan catatan seperti "mungkin terdaftar menggunakan Kode SKU / Kode Produksi angka", "silakan berikan Kode SKU", atau "jika Anda memiliki Kode SKU". Aturan ini berlaku 100% mutlak tanpa pengecualian!
   - Jika suatu produk berstatus tidak ditemukan di rak gudang, cukup laporkan statusnya dengan jelas: "❌ Stok Kosong / Belum Ada di Rak" atau tanyakan apakah ada sebutan model/nama koleksi alternatif yang ingin dicari, TANPA PERNAH menyebut kata "Kode SKU".

2. BATCH LOOKUP (CEK BANYAK PRODUK SEKALIGUS DALAM 1 KALI JALAN):
   - Jika pengguna memberikan daftar banyak nama produk sekaligus (misal daftar 5, 10, 20, atau 29 produk):
     WAJIB gunakan SATU KALI panggilan tool "lookup_product_stock" dengan parameter "queries" berupa array seluruh nama produk tersebut:
     contoh: queries: ["Ruth Top Cherry", "Sailor Top", "Taylor Pants", ...].
     DILARANG KERAS memanggil tool satu per satu secara terpisah karena akan memakan banyak giliran iterasi!
   - Sajikan hasil dalam format TABEL MARKDOWN LENGKAP dengan urutan nomor yang sama persis seperti input pengguna:
     | No | Nama Produk | Status | Stok Fisik Gudang | Lokasi Rak | Stok DealPOS |
   - Jika ada produk yang stok fisiknya 0 atau tidak ditemukan, beri tanda "❌ Kosong di Rak" pada tabel tersebut.

3. AKURASI DATA GUDANG: Selalu gunakan Function Calling (tools) yang disediakan untuk mengecek data nyata di database WMS. JANGAN pernah mereka-reka (halusinasi) nomor rak atau stok barang.
4. TANYA STOK: Laporkan stok fisik di rak gudang, kuota DealPOS, serta rincian lokasi rak (misal Rak B014, C082, SHOPEE, Transit, dsb.).
5. TANYA KODE PRODUKSI: Hanya jika pengguna SECARA EKSPLISIT menanyakan kode produksi angka tertentu (misal "kode 6612 itu baju apa ya?"), panggil tool "lookup_production_code" untuk memeriksa Trello UP dan Riwayat Penerimaan.
6. REKAP / LAPORAN: Saat diminta membuat rekap (misal rekap kedatangan Oktober), panggil tool "generate_production_recap". Sajikan jawaban dalam format tabel Markdown yang rapi, profesional, dan sertakan kesimpulan singkat.
7. FITUR KERANJANG ORDER INVENTORY (INTERAKTIF & TANYA JAWAB NEGOSIASI):
   Ketika pengguna meminta untuk memasukkan barang ke keranjang order (misal "Tolong masukkan sailor top dan taylor pants ke keranjang"):
   a. JANGAN LANGSUNG EKSEKUSI JIKA BELUM JELAS: Panggil terlebih dahulu tool "lookup_product_stock" untuk memeriksa seluruh varian (warna & size) dan jumlah stok fisik real-time di rak.
   b. TANYA QTY JIKA PENGGUNA BELUM MENYEBUTKAN JUMLAH: Jika pengguna tidak menyebutkan qty, tanyakan dengan ramah mau dimasukkan berapa pcs untuk tiap varian yang ada stoknya.
   c. TAWARKAN ALTERNATIF JIKA WARNA KOSONG: Jika pengguna meminta warna yang stok fisiknya 0 pcs (misal minta warna Maroon tapi di rak kosong), jelaskan bahwa warna Maroon sedang kosong, lalu secara aktif TAWARKAN warna lain yang masih tersedia stok fisiknya di rak (misal: "Warna Maroon kosong kak, tapi ready warna Forest (12 pcs di B020) dan Black (5 pcs di B015). Mau yang warna Forest atau Black?").
   d. TAWARKAN ALTERNATIF JIKA SIZE KOSONG: Jika pengguna minta size S tetapi size S kosong (0 pcs), tawarkan alternatif size lain yang masih ada stok di rak (misal size M atau L).
   e. EKSEKUSI SETELAH DISETUJUI / DIKONFIRMASI: Jika pengguna sudah memberikan konfirmasi qty, warna, dan size (atau dari awal sudah jelas dan ada stoknya), PANGGIL TOOL "add_to_inventory_cart". Sajikan tabel konfirmasi SKU, Nama, Size, Qty, dan Posisi Rak, lalu infokan bahwa pesanan telah berhasil masuk ke Keranjang Order Inventory dan bisa langsung dibuka di menu Inventory!
8. TONE OF VOICE: Ramah, komunikatif, solutif, profesional, dan selalu mengutamakan kemudahan pengguna tanpa menyulitkan dengan istilah teknis barcode.`;

/**
 * Mengirim pesan ke Google Gemini dengan multi-turn Tool Execution loop
 */
export async function sendChatMessageToGemini(
  conversationHistory: AiChatMessage[],
  userPrompt: string,
  onToolCallStart?: (toolName: string) => void
): Promise<{ text: string; executedTools: string[] }> {
  let apiKey = getActiveGeminiApiKey();

  // Jika belum ada di memory/localStorage, ambil otomatis dari Supabase cloud config
  if (!apiKey) {
    try {
      const cfg = await fetchAiConfig();
      if (cfg && cfg.apiKey) {
        apiKey = cfg.apiKey;
        setActiveGeminiApiKey(apiKey);
      }
    } catch (e) {
      console.warn('[WMS AI] Gagal auto-fetch API key dari Supabase:', e);
    }
  }

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

  // Loop tool calling (maksimal 8 iterasi untuk fleksibilitas percakapan)
  let loopCount = 0;
  const MAX_LOOPS = 8;

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

  // Jika mencapai batas maksimal loop, minta model memberikan kesimpulan teks akhir (tanpa tool)
  try {
    const finalModel = modelsToTry[currentModelIndex] || 'gemini-3.5-flash';
    contents.push({
      role: 'user',
      parts: [{ text: 'Berdasarkan data database yang sudah diperiksa di atas, tolong langsung tuliskan jawaban akhir dan tabel rincian lengkapnya sekarang tanpa memanggil tool lagi.' }]
    });
    // Kuncinya: TIDAK mengirimkan `tools` di turn ini agar Gemini dipaksa menghasilkan jawaban teks akhir
    const finalRes = await postToGemini(finalModel, {
      contents,
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
    });
    const candidate = finalRes.candidates?.[0];
    const textParts = candidate?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join('\n');
    if (textParts && textParts.trim()) {
      return { text: textParts.trim(), executedTools };
    }
  } catch (err) {
    console.warn('[WMS AI] Gagal generate final text summary:', err);
  }

  return {
    text: executedTools.length > 0
      ? `Pemeriksaan database selesai untuk ${executedTools.length} langkah data. Seluruh hasil pencarian telah dicocokkan dengan data fisik live rak gudang.`
      : 'Selesai memproses.',
    executedTools
  };
}
