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
import {
  normalizeLookupCode,
  matchTrelloByCode,
  refreshTrelloLookupDictionaryFromCloud,
  extractTrelloMetadataFromItem,
  embedTrelloMetadataIntoKeterangan
} from '../utils/trelloProduksiMatcher';
import { getLocalCachedTrelloItems, extractBaseItemCode } from './trelloSyncService';
import { ProductItem, PenerimaanProduksiItem, TrelloUpItem } from '../types';
import { AiAttachment } from '../utils/aiAttachmentParser';
export type { AiAttachment };

export const SYSTEM_DOC_AI_CONFIG_ID = 'wms_ai_config';

export interface TrelloCandidatePreview {
  requestedCode: string;
  matchedCode: string;
  isExactCodeMatch: boolean;
  needsConfirmation: boolean;
  productName: string;
  upCode: string;
  photoUrl?: string;
  fallbackPhotoUrl?: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isStreaming?: boolean;
  toolCallsExecuted?: string[];
  attachments?: AiAttachment[];
  trelloCandidates?: TrelloCandidatePreview[];
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
        description: 'Mencari informasi satu atau beberapa kode produksi di Trello UP dan Riwayat Penerimaan (nama produk, kode UP vendor, foto, warna, no surat jalan, tanggal kedatangan).',
        parameters: {
          type: 'OBJECT',
          properties: {
            code: {
              type: 'STRING',
              description: 'Satu kode produksi atau kode produk, contoh: "6612", "7312", "F25JBF3100"'
            },
            codes: {
              type: 'ARRAY',
              description: 'Daftar beberapa kode produksi sekaligus (batch), contoh: ["6612", "7312", "8810"]',
              items: { type: 'STRING' }
            }
          }
        }
      },
      {
        name: 'query_production_receipts',
        description: 'Membaca dan mencari rincian data Penerimaan Barang Produksi (baik Lokal CMT maupun Kargo) berdasarkan tanggal spesifik (misal kemarin, hari ini, tanggal tertentu), rentang tanggal, kategori ("Lokal CMT" atau "Kargo"), nomor surat jalan, kode produksi, nama produk, warna, atau UP vendor. Gunakan tool ini setiap kali pengguna bertanya tentang penerimaan barang seperti "kemarin ada masuk kargo apa aja dan berapa aja", "hari ini CMT masuk apa aja", "minggu ini kargo masuk berapa", atau "surat jalan X isinya apa".',
        parameters: {
          type: 'OBJECT',
          properties: {
            start_date: {
              type: 'STRING',
              description: 'Tanggal awal format YYYY-MM-DD (contoh: "2026-11-09" untuk kemarin, atau tanggal awal periode)'
            },
            end_date: {
              type: 'STRING',
              description: 'Tanggal akhir format YYYY-MM-DD (contoh: "2026-11-09" jika mencari 1 hari spesifik seperti kemarin/hari ini)'
            },
            category: {
              type: 'STRING',
              description: 'Filter kategori penerimaan: "Kargo", "Lokal CMT", atau "Semua" (kosongkan jika ingin membaca CMT dan Kargo sekaligus)'
            },
            keyword: {
              type: 'STRING',
              description: 'Opsional: Kata kunci spesifik seperti Nomor Surat Jalan, Kode Produksi, Nama Produk, Warna, atau Kode UP Vendor'
            }
          }
        }
      },
      {
        name: 'generate_production_recap',
        description: 'Membuat rekapitulasi statistik penerimaan barang produksi (CMT & Kargo) bulanan berdasarkan bulan dan tahun.',
        parameters: {
          type: 'OBJECT',
          properties: {
            month: {
              type: 'NUMBER',
              description: 'Nomor bulan (1-12), contoh: 11 untuk November, 10 untuk Oktober'
            },
            year: {
              type: 'NUMBER',
              description: 'Tahun 4 digit, contoh: 2026'
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
        name: 'prepare_production_receipt_form',
        description: 'Membantu mengisi atau memperbarui Draft Form Input Penerimaan Barang Produksi (Lokal CMT atau Kargo) di menu Produksi -> Tab Input Penerimaan. Data HANYA diisikan ke Form Input di layar (Draft) agar pengguna tinggal mengecek, melengkapi data yang kurang, dan menekan tombol Submit/Simpan sendiri.',
        parameters: {
          type: 'OBJECT',
          properties: {
            mode: {
              type: 'STRING',
              description: '"replace" untuk mulai form surat jalan baru (default), atau "append" untuk menambahkan/memperbarui item produk ke draft form yang sedang aktif'
            },
            kategori: {
              type: 'STRING',
              description: 'Kategori penerimaan: "Lokal CMT" atau "Kargo"'
            },
            tanggal: {
              type: 'STRING',
              description: 'Tanggal penerimaan format YYYY-MM-DD (default tanggal hari ini)'
            },
            no_surat_jalan: {
              type: 'STRING',
              description: 'Nomor Surat Jalan / Resi Kargo (kosongkan "" jika pengguna belum menyebutkan agar bisa dilengkapi pengguna)'
            },
            keterangan_global: {
              type: 'STRING',
              description: 'Catatan umum surat jalan (opsional)'
            },
            products: {
              type: 'ARRAY',
              description: 'Daftar blok kode produksi beserta varian warna, ukuran, dan kuantitas yang akan diisikan ke form input',
              items: {
                type: 'OBJECT',
                properties: {
                  kode_produksi: {
                    type: 'STRING',
                    description: 'Kode produksi barang, contoh: "6612", "7312", "F25JBF3100"'
                  },
                  catatan: {
                    type: 'STRING',
                    description: 'Catatan khusus untuk kode produk ini (opsional)'
                  },
                  size_mode: {
                    type: 'STRING',
                    description: '"multi" jika memiliki ukuran S/M/L/XL dll, atau "allsize" jika ukurannya ALL SIZE'
                  },
                  variants: {
                    type: 'ARRAY',
                    description: 'Daftar varian warna, ukuran (size), dan jumlah (qty pcs) untuk kode produksi ini',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        warna: { type: 'STRING', description: 'Nama warna (contoh: "BLACK", "WHITE", "CREAM", atau "" jika belum disebutkan)' },
                        size: { type: 'STRING', description: 'Ukuran (contoh: "S", "M", "L", "XL", "2XL", "3XL", atau "ALL SIZE")' },
                        qty: { type: 'NUMBER', description: 'Jumlah pcs (isi 0 jika pengguna belum menyebutkan jumlah pastinya)' }
                      }
                    }
                  }
                },
                required: ['kode_produksi']
              }
            }
          },
          required: ['products']
        }
      },
      {
        name: 'view_production_receipt_form_draft',
        description: 'Melihat rincian data yang saat ini sedang ada di dalam Draft Form Input Penerimaan Produksi (Lokal CMT / Kargo).',
        parameters: {
          type: 'OBJECT',
          properties: {}
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
 * Helper format tanggal lokal YYYY-MM-DD (mengikuti zona waktu perangkat user)
 */
function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Helper mencari kandidat kartu Trello UP (Membedakan Kode Persis vs Kode Mirip seperti 6612 vs 6612-1)
 * beserta URL Foto Google Drive & Trello asli untuk ditampilkan di balon chat AI.
 */
function findTrelloCandidatesForCode(rawCode: string): {
  requestedCode: string;
  hasExactCodeMatch: boolean;
  needsSimilarCodeConfirmation: boolean;
  exactCandidate: TrelloCandidatePreview | null;
  candidates: TrelloCandidatePreview[];
} {
  const code = normalizeLookupCode(rawCode);
  if (!code) {
    return {
      requestedCode: '',
      hasExactCodeMatch: false,
      needsSimilarCodeConfirmation: false,
      exactCandidate: null,
      candidates: []
    };
  }

  const localTrelloList: TrelloUpItem[] = getLocalCachedTrelloItems().items || [];
  const baseRequested = extractBaseItemCode(code);
  const trelloMatch = matchTrelloByCode(code);

  const rawMatchedItems: TrelloUpItem[] = [];
  const seenCardIds = new Set<string>();

  const pushItem = (item?: TrelloUpItem) => {
    if (!item) return;
    const itemCodeNorm = normalizeLookupCode(item.item_code || item.card_name);
    const key = `${itemCodeNorm}_${item.up_code || item.list_name || ''}`;
    if (!seenCardIds.has(key)) {
      seenCardIds.add(key);
      rawMatchedItems.push(item);
    }
  };

  // 1. Cari yang persis (6612 === 6612) atau awalan/varian (6612-1, 6612-2, 6612A, dll)
  localTrelloList.forEach((t) => {
    const tCode = normalizeLookupCode(t.item_code);
    const tBase = extractBaseItemCode(t.item_code || t.card_name);
    if (!tCode) return;

    if (
      tCode === code ||
      tCode.startsWith(code + '-') ||
      tCode.startsWith(code + '_') ||
      tCode.startsWith(code + '/') ||
      tCode.startsWith(code + ' ') ||
      (baseRequested && baseRequested.length >= 3 && tBase === baseRequested) ||
      (code.length >= 4 && (tCode.includes(code) || code.includes(tCode)))
    ) {
      pushItem(t);
    }
  });

  // 2. Tambahkan dari hasil matcher 4-tier jika belum masuk
  if (trelloMatch) {
    pushItem(trelloMatch.matchedItem);
    if (Array.isArray(trelloMatch.alternateCandidates)) {
      trelloMatch.alternateCandidates.slice(0, 4).forEach((alt) => pushItem(alt));
    }
  }

  // Urutkan: Prioritas 1 = Exact Match (6612 === 6612), Prioritas 2 = Punya Foto, Prioritas 3 = UP terbaru
  rawMatchedItems.sort((a, b) => {
    const aExact = normalizeLookupCode(a.item_code) === code ? 1 : 0;
    const bExact = normalizeLookupCode(b.item_code) === code ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    const aHasPhoto = a.gdrive_image_url || a.trello_image_url ? 1 : 0;
    const bHasPhoto = b.gdrive_image_url || b.trello_image_url ? 1 : 0;
    if (aHasPhoto !== bHasPhoto) return bHasPhoto - aHasPhoto;

    return Number(b.list_pos ?? b.pos ?? 0) - Number(a.list_pos ?? a.pos ?? 0);
  });

  const hasExact = rawMatchedItems.some((item) => normalizeLookupCode(item.item_code) === code);

  const candidates: TrelloCandidatePreview[] = rawMatchedItems.slice(0, 5).map((item) => {
    const mCode = normalizeLookupCode(item.item_code || item.card_name) || code;
    const isExact = mCode === code;
    return {
      requestedCode: code,
      matchedCode: mCode,
      isExactCodeMatch: isExact,
      needsConfirmation: !hasExact || !isExact,
      productName: item.item_name || item.card_name || 'Tanpa Nama Produk',
      upCode: item.up_code || item.list_name || 'Tanpa UP',
      photoUrl: item.gdrive_image_url || item.trello_image_url || undefined,
      fallbackPhotoUrl: item.trello_image_url || undefined
    };
  });

  const exactCandidate = candidates.find((c) => c.isExactCodeMatch) || null;
  const needsSimilarCodeConfirmation = !hasExact && candidates.length > 0;

  return {
    requestedCode: code,
    hasExactCodeMatch: hasExact,
    needsSimilarCodeConfirmation,
    exactCandidate,
    candidates
  };
}

/**
 * 2. Eksekusi tool: lookup_production_code (Mendukung Single & Batch Codes + Deteksi Kode Mirip 6612 vs 6612-1 & Foto)
 */
async function executeLookupProductionCode(
  args: { code?: string; codes?: string[] },
  onCollectTrelloPreviews?: (previews: TrelloCandidatePreview[]) => void
): Promise<any> {
  const codeListRaw: string[] = [];
  if (Array.isArray(args.codes) && args.codes.length > 0) {
    args.codes.forEach((c) => {
      const norm = normalizeLookupCode(c);
      if (norm) codeListRaw.push(norm);
    });
  } else if (args.code) {
    const norm = normalizeLookupCode(args.code);
    if (norm) codeListRaw.push(norm);
  }

  if (codeListRaw.length === 0) {
    return { error: 'Kode produksi kosong' };
  }

  // Pastikan kamus Trello tersedia; jika kosong, muat dari cloud
  try {
    const localTrello = getLocalCachedTrelloItems();
    if (!localTrello.items || localTrello.items.length === 0) {
      await refreshTrelloLookupDictionaryFromCloud();
    }
  } catch {}

  const allPenerimaan = await fetchPenerimaanProduksiFromSupabase({ limit: 1500 }).catch(() => [] as PenerimaanProduksiItem[]);
  const collectedPreviews: TrelloCandidatePreview[] = [];

  const lookupSingleCode = (code: string) => {
    const candidateAnalysis = findTrelloCandidatesForCode(code);
    if (candidateAnalysis.candidates.length > 0) {
      collectedPreviews.push(...candidateAnalysis.candidates.slice(0, 4));
    }

    const matchedReceipts = allPenerimaan.filter((p) => {
      const pCode = normalizeLookupCode(p.kode_produksi);
      return pCode === code || pCode.startsWith(code + '-') || pCode.includes(code) || code.includes(pCode);
    });

    // Kelompokkan riwayat penerimaan per Surat Jalan untuk kode ini
    const sjMap = new Map<string, {
      tanggal_penerimaan: string;
      no_surat_jalan: string;
      kategori: string;
      kode_produksi: string;
      nama_produk: string;
      up_vendor: string;
      total_pcs: number;
      rincian_warna_size: string[];
    }>();

    matchedReceipts.forEach((r) => {
      const sjKey = `${r.tanggal_penerimaan}_${r.no_surat_jalan}_${r.kode_produksi}`;
      const meta = extractTrelloMetadataFromItem(r);
      const primaryCand = candidateAnalysis.exactCandidate || candidateAnalysis.candidates[0];
      const qty = Number(r.qty ?? (r as any).total_pcs ?? (r as any).total_qty ?? 0);
      if (!sjMap.has(sjKey)) {
        sjMap.set(sjKey, {
          tanggal_penerimaan: r.tanggal_penerimaan,
          no_surat_jalan: r.no_surat_jalan,
          kategori: r.kategori || 'Lokal CMT',
          kode_produksi: r.kode_produksi,
          nama_produk: meta.productName || primaryCand?.productName || r.nama_produk || '-',
          up_vendor: meta.upCode || primaryCand?.upCode || '-',
          total_pcs: 0,
          rincian_warna_size: []
        });
      }
      const entry = sjMap.get(sjKey)!;
      entry.total_pcs += qty;
      entry.rincian_warna_size.push(`${r.warna || '-'} (${r.size || 'ALL SIZE'}: ${qty} pcs)`);
    });

    return {
      query_code: code,
      apakah_ada_kode_persis_di_trello: candidateAnalysis.hasExactCodeMatch,
      perlu_tanya_konfirmasi_karena_kode_mirip: candidateAnalysis.needsSimilarCodeConfirmation,
      instruksi_untuk_ai: candidateAnalysis.needsSimilarCodeConfirmation
        ? `Kode persis "${code}" TIDAK ada di Trello UP, tetapi ditemukan kode yang mirip yaitu: ${candidateAnalysis.candidates.map((c) => `${c.matchedCode} (${c.productName} - ${c.upCode})`).join(', ')}. WAJIB TANYA DULU ke pengguna apakah yang dimaksud adalah kode ${candidateAnalysis.candidates[0]?.matchedCode} sesuai FOTO PRODUK yang otomatis dilampirkan di bawah balon chat ini!`
        : candidateAnalysis.hasExactCodeMatch
        ? `Kode "${code}" ditemukan persis di Trello UP (${candidateAnalysis.exactCandidate?.productName} - ${candidateAnalysis.exactCandidate?.upCode}). Foto produk juga otomatis ditampilkan di bawah balon chat.`
        : `Kode "${code}" belum ditemukan di Trello UP.`,
      kandidat_di_trello: candidateAnalysis.candidates.map((c) => ({
        kode_trello: c.matchedCode,
        status_kecocokan: c.isExactCodeMatch ? 'COCOK_PERSIS' : `MIRIP_DENGAN_${code}`,
        nama_produk: c.productName,
        up_vendor: c.upCode,
        foto_ditampilkan_di_chat: Boolean(c.photoUrl)
      })),
      total_kedatangan_tercatat: sjMap.size,
      total_pcs_pernah_diterima: Array.from(sjMap.values()).reduce((acc, s) => acc + s.total_pcs, 0),
      riwayat_penerimaan_terbaru: Array.from(sjMap.values()).slice(0, 8)
    };
  };

  const output =
    codeListRaw.length === 1
      ? lookupSingleCode(codeListRaw[0])
      : {
          is_batch: true,
          total_kode_dicari: codeListRaw.length,
          results: codeListRaw.map((c) => lookupSingleCode(c))
        };

  if (collectedPreviews.length > 0 && onCollectTrelloPreviews) {
    onCollectTrelloPreviews(collectedPreviews);
  }

  return output;
}

/**
 * 2B. Eksekusi tool BARU: query_production_receipts
 * Membaca rincian penerimaan barang produksi (Lokal CMT & Kargo) per tanggal (kemarin, hari ini, rentang tanggal),
 * per kategori, atau per kata kunci (No SJ, Kode Produksi, Nama Produk, Warna, UP Vendor).
 */
async function executeQueryProductionReceipts(args: {
  start_date?: string;
  end_date?: string;
  category?: string;
  keyword?: string;
}): Promise<any> {
  try {
    const localTrello = getLocalCachedTrelloItems();
    if (!localTrello.items || localTrello.items.length === 0) {
      await refreshTrelloLookupDictionaryFromCloud();
    }
  } catch {}

  const startDate = args.start_date ? String(args.start_date).trim() : undefined;
  const endDate = args.end_date ? String(args.end_date).trim() : undefined;
  const rawCategory = args.category ? String(args.category).trim() : '';
  const rawKeyword = args.keyword ? String(args.keyword).trim().toLowerCase() : '';

  // Ambil data real-time dari Supabase penerimaan_produksi
  let items: PenerimaanProduksiItem[] = [];
  try {
    items = await fetchPenerimaanProduksiFromSupabase({
      startDate,
      endDate,
      limit: 2000,
      forceRefresh: true
    });
  } catch (e) {
    console.warn('[WMS AI] Gagal fetch penerimaan_produksi untuk query_production_receipts:', e);
  }

  // Filter tambahan berdasarkan tanggal_penerimaan (jika dari cache lokal)
  if (startDate) {
    items = items.filter((it) => (it.tanggal_penerimaan || '') >= startDate);
  }
  if (endDate) {
    items = items.filter((it) => (it.tanggal_penerimaan || '') <= endDate);
  }

  // Filter Kategori ("Kargo" vs "Lokal CMT")
  const catLower = rawCategory.toLowerCase();
  const isFilterKargo = catLower.includes('kargo') || catLower.includes('cargo');
  const isFilterCmt = catLower.includes('cmt') || catLower.includes('lokal');

  if (isFilterKargo && !isFilterCmt) {
    items = items.filter((it) => (it.kategori || '').toLowerCase().includes('kargo'));
  } else if (isFilterCmt && !isFilterKargo) {
    items = items.filter((it) => {
      const k = (it.kategori || 'Lokal CMT').toLowerCase();
      return k.includes('cmt') || k.includes('lokal') || !k.includes('kargo');
    });
  }

  // Filter Keyword jika ada
  if (rawKeyword) {
    items = items.filter((it) => {
      const meta = extractTrelloMetadataFromItem(it);
      const trello = matchTrelloByCode(it.kode_produksi);
      const prodName = (meta.productName || trello?.productName || it.nama_produk || '').toLowerCase();
      const upVendor = (meta.upCode || trello?.upCode || '').toLowerCase();
      const targetStr = `${it.kode_produksi || ''} ${it.no_surat_jalan || ''} ${prodName} ${upVendor} ${it.warna || ''} ${it.keterangan || ''} ${it.operator || ''}`.toLowerCase();
      return targetStr.includes(rawKeyword);
    });
  }

  // Jika hasil pada tanggal yang diminta KOSONG (0 item), cek 3 tanggal kedatangan terakhir sebagai info proaktif
  let fallbackRecentArrivals: any[] = [];
  if (items.length === 0 && (startDate || endDate)) {
    try {
      const recentAll = await fetchPenerimaanProduksiFromSupabase({ limit: 300 });
      const filteredRecent = recentAll.filter((it) => {
        if (isFilterKargo && !isFilterCmt) return (it.kategori || '').toLowerCase().includes('kargo');
        if (isFilterCmt && !isFilterKargo) return !(it.kategori || '').toLowerCase().includes('kargo');
        return true;
      });

      const byDateMap = new Map<string, { tanggal: string; kategori: string; total_pcs: number; surat_jalan: Set<string>; kode_list: Set<string> }>();
      filteredRecent.forEach((it) => {
        const tgl = it.tanggal_penerimaan || '-';
        const key = `${tgl}_${it.kategori || 'Lokal CMT'}`;
        if (!byDateMap.has(key)) {
          byDateMap.set(key, {
            tanggal: tgl,
            kategori: it.kategori || 'Lokal CMT',
            total_pcs: 0,
            surat_jalan: new Set(),
            kode_list: new Set()
          });
        }
        const g = byDateMap.get(key)!;
        g.total_pcs += Number(it.qty ?? (it as any).total_pcs ?? (it as any).total_qty ?? 0);
        if (it.no_surat_jalan) g.surat_jalan.add(it.no_surat_jalan);
        if (it.kode_produksi) g.kode_list.add(it.kode_produksi);
      });

      fallbackRecentArrivals = Array.from(byDateMap.values())
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
        .slice(0, 4)
        .map((g) => ({
          tanggal: g.tanggal,
          kategori: g.kategori,
          total_pcs: g.total_pcs,
          jumlah_surat_jalan: g.surat_jalan.size,
          daftar_no_sj: Array.from(g.surat_jalan).join(', '),
          daftar_kode: Array.from(g.kode_list).slice(0, 8).join(', ')
        }));
    } catch {}
  }

  // Kelompokkan hasil berdasarkan Surat Jalan & Kode Produksi
  let grandTotalPcs = 0;
  let totalLokalCmtPcs = 0;
  let totalKargoPcs = 0;
  const uniqueSJ = new Set<string>();
  const uniqueCodes = new Set<string>();

  interface KodeDetailAgg {
    kode_produksi: string;
    nama_produk: string;
    up_vendor: string;
    kategori: string;
    no_surat_jalan: string;
    tanggal_penerimaan: string;
    operator: string;
    total_pcs: number;
    total_recount_pcs: number | null;
    selisih_audit: number | null;
    warna_map: Map<string, string[]>;
  }

  const codeGroupsMap = new Map<string, KodeDetailAgg>();

  items.forEach((it) => {
    const qty = Number(it.qty ?? (it as any).total_pcs ?? (it as any).total_qty ?? 0);
    const cat = it.kategori || 'Lokal CMT';
    const sj = (it.no_surat_jalan || 'TANPA-SJ').trim();
    const kode = (it.kode_produksi || 'TANPA-KODE').trim().toUpperCase();
    const tgl = it.tanggal_penerimaan || '-';

    grandTotalPcs += qty;
    if (cat.toLowerCase().includes('kargo')) {
      totalKargoPcs += qty;
    } else {
      totalLokalCmtPcs += qty;
    }

    uniqueSJ.add(sj);
    uniqueCodes.add(kode);

    const groupKey = `${tgl}___${cat}___${sj}___${kode}`;
    if (!codeGroupsMap.has(groupKey)) {
      const meta = extractTrelloMetadataFromItem(it);
      const trello = matchTrelloByCode(kode);
      codeGroupsMap.set(groupKey, {
        kode_produksi: kode,
        nama_produk: meta.productName || trello?.productName || it.nama_produk || 'Belum Ada Nama di Trello',
        up_vendor: meta.upCode || trello?.upCode || '-',
        kategori: cat,
        no_surat_jalan: sj,
        tanggal_penerimaan: tgl,
        operator: it.operator || '-',
        total_pcs: 0,
        total_recount_pcs: null,
        selisih_audit: null,
        warna_map: new Map()
      });
    }

    const grp = codeGroupsMap.get(groupKey)!;
    grp.total_pcs += qty;

    if (it.recount_qty !== null && it.recount_qty !== undefined) {
      grp.total_recount_pcs = (grp.total_recount_pcs || 0) + Number(it.recount_qty);
    }
    if (it.recount_selisih !== null && it.recount_selisih !== undefined) {
      grp.selisih_audit = (grp.selisih_audit || 0) + Number(it.recount_selisih);
    }

    const warnaKey = (it.warna || 'DEFAULT').trim().toUpperCase();
    if (!grp.warna_map.has(warnaKey)) {
      grp.warna_map.set(warnaKey, []);
    }
    grp.warna_map.get(warnaKey)!.push(`${it.size || 'ALL SIZE'}:${qty}`);
  });

  const detailedList = Array.from(codeGroupsMap.values()).map((g, idx) => {
    const rincianWarna: string[] = [];
    g.warna_map.forEach((sizes, warna) => {
      rincianWarna.push(`${warna} (${sizes.join(', ')})`);
    });

    return {
      no: idx + 1,
      tanggal_penerimaan: g.tanggal_penerimaan,
      kategori: g.kategori,
      no_surat_jalan: g.no_surat_jalan,
      kode_produksi: g.kode_produksi,
      nama_produk: g.nama_produk,
      up_vendor: g.up_vendor,
      rincian_warna_dan_size: rincianWarna.join(' | '),
      total_pcs: g.total_pcs,
      status_hitung_ulang:
        g.total_recount_pcs !== null
          ? `Sudah dihitung ulang (${g.total_recount_pcs} pcs, selisih: ${g.selisih_audit || 0})`
          : 'Belum hitung ulang',
      operator: g.operator
    };
  });

  return {
    filter_diterapkan: {
      start_date: startDate || 'Semua Tanggal',
      end_date: endDate || 'Semua Tanggal',
      kategori: rawCategory || 'Semua (Lokal CMT & Kargo)',
      keyword: rawKeyword || '-'
    },
    ringkasan: {
      total_baris_varian: items.length,
      total_surat_jalan: uniqueSJ.size,
      total_kode_produksi: uniqueCodes.size,
      total_pcs_keseluruhan: grandTotalPcs,
      total_pcs_lokal_cmt: totalLokalCmtPcs,
      total_pcs_kargo: totalKargoPcs
    },
    daftar_penerimaan: detailedList.slice(0, 60),
    catatan_tambahan_jika_kosong:
      items.length === 0
        ? {
            pesan: `Tidak ditemukan data penerimaan untuk filter tanggal ${startDate || ''} s/d ${endDate || ''} (${rawCategory || 'Semua Kategori'}).`,
            tanggal_kedatangan_terakhir_di_database: fallbackRecentArrivals
          }
        : undefined
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
    items = await fetchPenerimaanProduksiFromSupabase({ startDate, endDate, limit: 3000, forceRefresh: true });
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
  const categorySummary: Record<string, { pcs: number; surat_jalan: Set<string>; kode: Set<string> }> = {};
  const productSummary: Record<string, { nama: string; pcs: number; kategori: string }> = {};

  items.forEach((it) => {
    const qty = Number(it.qty ?? (it as any).total_pcs ?? (it as any).total_qty ?? 0);
    totalPcs += qty;
    if (it.no_surat_jalan) uniqueBatches.add(it.no_surat_jalan);
    if (it.kode_produksi) uniqueCodes.add(it.kode_produksi);

    const cat = it.kategori || 'Lokal CMT';
    if (!categorySummary[cat]) {
      categorySummary[cat] = { pcs: 0, surat_jalan: new Set(), kode: new Set() };
    }
    categorySummary[cat].pcs += qty;
    if (it.no_surat_jalan) categorySummary[cat].surat_jalan.add(it.no_surat_jalan);
    if (it.kode_produksi) categorySummary[cat].kode.add(it.kode_produksi);

    const kode = (it.kode_produksi || 'TANPA-KODE').trim().toUpperCase();
    const meta = extractTrelloMetadataFromItem(it);
    const trello = matchTrelloByCode(kode);
    const displayName = meta.productName || trello?.productName || it.nama_produk || kode;
    const key = `${kode} (${displayName})`;
    if (!productSummary[key]) {
      productSummary[key] = { nama: key, pcs: 0, kategori: cat };
    }
    productSummary[key].pcs += qty;
  });

  const formattedCategoryBreakdown: Record<string, { total_pcs: number; total_surat_jalan: number; total_kode: number }> = {};
  Object.entries(categorySummary).forEach(([cat, val]) => {
    formattedCategoryBreakdown[cat] = {
      total_pcs: val.pcs,
      total_surat_jalan: val.surat_jalan.size,
      total_kode: val.kode.size
    };
  });

  // Top 10 Produk Terbanyak
  const topProducts = Object.values(productSummary)
    .sort((a, b) => b.pcs - a.pcs)
    .slice(0, 10)
    .map((p) => ({ kode_dan_nama: p.nama, kategori: p.kategori, total_pcs: p.pcs }));

  return {
    periode: periodeLabel,
    rentang_tanggal: `${startDate} s/d ${endDate}`,
    total_surat_jalan: uniqueBatches.size,
    total_kode_produksi: uniqueCodes.size,
    total_pcs_diterima: totalPcs,
    breakdown_kategori: formattedCategoryBreakdown,
    top_10_produk_terbanyak: topProducts,
    total_baris_varian: items.length
  };
}

/**
 * 3B. Eksekusi tool BARU: prepare_production_receipt_form
 * Menyiapkan/mengisi Draft Form Input Penerimaan Produksi (CMT / Kargo)
 * di localStorage (`wms_penerimaan_produksi_form_draft`) dan memicu event UI
 * agar pengguna tinggal mengecek, melengkapi yang kurang, dan klik Simpan sendiri!
 */
async function executePrepareProductionReceiptForm(
  args: {
    mode?: 'replace' | 'append' | string;
    kategori?: string;
    tanggal?: string;
    no_surat_jalan?: string;
    keterangan_global?: string;
    products: Array<{
      kode_produksi: string;
      catatan?: string;
      size_mode?: 'multi' | 'allsize' | string;
      variants?: Array<{ warna?: string; size?: string; qty?: number }>;
    }>;
  },
  onCollectTrelloPreviews?: (previews: TrelloCandidatePreview[]) => void
): Promise<any> {
  if (!args.products || !Array.isArray(args.products) || args.products.length === 0) {
    return { error: 'Daftar produk untuk form penerimaan kosong.' };
  }

  try {
    const localTrello = getLocalCachedTrelloItems();
    if (!localTrello.items || localTrello.items.length === 0) {
      await refreshTrelloLookupDictionaryFromCloud();
    }
  } catch {}

  // Baca draft saat ini jika mode === 'append'
  let existingDraft: any = null;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('wms_penerimaan_produksi_form_draft') : null;
    if (raw) existingDraft = JSON.parse(raw);
  } catch {}

  const isAppend = String(args.mode || 'replace').toLowerCase() === 'append' && existingDraft;

  const rawKat = String(args.kategori || existingDraft?.formKategori || 'Lokal CMT').trim();
  const resolvedKategori: 'Lokal CMT' | 'Kargo' =
    rawKat.toLowerCase().includes('kargo') || rawKat.toLowerCase().includes('cargo') ? 'Kargo' : 'Lokal CMT';

  const resolvedTanggal =
    (args.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(args.tanggal.trim()) ? args.tanggal.trim() : null) ||
    existingDraft?.formTanggal ||
    formatLocalYmd(new Date());

  const resolvedNoSJ =
    args.no_surat_jalan !== undefined
      ? String(args.no_surat_jalan).trim().toUpperCase()
      : (existingDraft?.formNoSuratJalan || '');

  const resolvedKeteranganGlobal =
    args.keterangan_global !== undefined
      ? String(args.keterangan_global).trim()
      : (existingDraft?.formKeteranganGlobal || '');

  const defaultMultiSizes = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
  const preparedSummary: any[] = [];
  const missingFieldsQuestions: string[] = [];
  const similarCodeWarnings: string[] = [];
  const collectedPreviews: TrelloCandidatePreview[] = [];

  if (!resolvedNoSJ) {
    missingFieldsQuestions.push('Nomor Surat Jalan / Resi Kargo belum diisi');
  }

  const newBlocks = args.products.map((prod, bIdx) => {
    const kode = String(prod.kode_produksi || '').trim().toUpperCase();
    const candidateAnalysis = findTrelloCandidatesForCode(kode);

    // Lampirkan kartu foto produk di chat (baik cocok persis maupun kandidat mirip)
    if (candidateAnalysis.candidates.length > 0) {
      collectedPreviews.push(...candidateAnalysis.candidates.slice(0, 4));
    }

    let catatan = String(prod.catatan || '').trim();
    let fotoUrl = '';
    let statusTrelloLabel = 'Belum terdaftar di Trello UP';
    let upVendorLabel = '-';

    // ATURAN PENTING:
    // Hanya tempelkan Nama Produk & Foto Trello secara otomatis ke Form Input JIKA kode cocok persis (EXACT, misal 6612 == 6612).
    // Jika kode di Trello ternyata BEDA / MIRIP (misal user sebut "6612" tapi di Trello adanya "6612-1"),
    // JANGAN langsung auto-match ke form tanpa izin! Tanyakan dulu ke user sambil menampilkan Fotonya!
    if (candidateAnalysis.hasExactCodeMatch && candidateAnalysis.exactCandidate) {
      const exact = candidateAnalysis.exactCandidate;
      catatan = embedTrelloMetadataIntoKeterangan(catatan, exact.upCode, exact.productName);
      if (exact.photoUrl) {
        fotoUrl = exact.photoUrl;
      }
      statusTrelloLabel = exact.productName;
      upVendorLabel = exact.upCode;

      // Jika selain yang persis ada juga varian mirip lainnya (misal ada 6612 dan ada 6612-1), beri info ke user
      const otherVariants = candidateAnalysis.candidates.filter((c) => !c.isExactCodeMatch);
      if (otherVariants.length > 0) {
        similarCodeWarnings.push(
          `Untuk kode "${kode}", selain kode persis "${kode}" ditemukan juga varian kode mirip di Trello: ${otherVariants.map((v) => `${v.matchedCode} (${v.productName} - ${v.upCode})`).join(', ')}. Pastikan dengan pengguna apakah yang dimaksud "${kode}" atau "${otherVariants[0].matchedCode}" sesuai foto terlampir.`
        );
      }
    } else if (candidateAnalysis.needsSimilarCodeConfirmation && candidateAnalysis.candidates.length > 0) {
      const simList = candidateAnalysis.candidates
        .map((c) => `${c.matchedCode} (${c.productName} - ${c.upCode})`)
        .join(', ');
      statusTrelloLabel = `⚠️ BELUM AUTO-MATCH (Menunggu Konfirmasi User: Apakah maksudnya ${simList}?)`;
      similarCodeWarnings.push(
        `Kode "${kode}" TIDAK ditemukan persis di Trello UP, tetapi ada kode yang mirip yaitu: ${simList}. JANGAN auto-match diam-diam! WAJIB TANYA DULU ke pengguna apakah benar produk "${candidateAnalysis.candidates[0].matchedCode}" (${candidateAnalysis.candidates[0].productName}) seperti pada FOTO TERLAMPIR di bawah yang dimaksud! Jika pengguna menjawab "Ya", panggil kembali prepare_production_receipt_form dengan kode "${candidateAnalysis.candidates[0].matchedCode}".`
      );
    }

    const rawVariants = Array.isArray(prod.variants) ? prod.variants : [];
    const allSizeDetected =
      String(prod.size_mode || '').toLowerCase() === 'allsize' ||
      (rawVariants.length > 0 &&
        rawVariants.every((v) => {
          const sz = String(v.size || '').trim().toUpperCase();
          return sz === 'ALL SIZE' || sz === 'ALLSIZE' || sz === 'FREE SIZE';
        }));

    const sizeMode: 'multi' | 'allsize' = allSizeDetected ? 'allsize' : 'multi';

    // Kumpulkan kolom size
    const sizeColumns: string[] = sizeMode === 'allsize' ? ['ALL SIZE'] : [...defaultMultiSizes];
    if (sizeMode === 'multi') {
      rawVariants.forEach((v) => {
        const cleanSz = String(v.size || '').trim().toUpperCase();
        if (cleanSz && cleanSz !== 'ALL SIZE' && !sizeColumns.includes(cleanSz)) {
          sizeColumns.push(cleanSz);
        }
      });
    }

    // Kelompokkan berdasarkan warna
    const warnaMap = new Map<string, Map<string, number>>();
    const warnaOrder: string[] = [];

    rawVariants.forEach((v) => {
      const wName = String(v.warna || '').trim().toUpperCase();
      const sName = sizeMode === 'allsize' ? 'ALL SIZE' : (String(v.size || 'S').trim().toUpperCase() || 'S');
      const qtyNum = Math.max(0, Number(v.qty) || 0);

      if (!warnaMap.has(wName)) {
        warnaMap.set(wName, new Map());
        warnaOrder.push(wName);
      }
      const sMap = warnaMap.get(wName)!;
      sMap.set(sName, (sMap.get(sName) || 0) + qtyNum);
    });

    if (warnaOrder.length === 0) {
      warnaOrder.push('');
      warnaMap.set('', new Map());
    }

    let totalKodePcs = 0;
    const warnasFormatted = warnaOrder.map((wName, wIdx) => {
      const sMap = warnaMap.get(wName) || new Map();
      const sizesFormatted = sizeColumns.map((colSz, sIdx) => {
        const q = sMap.get(colSz) ?? 0;
        totalKodePcs += q;
        return {
          id: `sz_${Date.now()}_${bIdx}_${wIdx}_${sIdx}`,
          size: colSz,
          qty: q
        };
      });

      return {
        id: `warna_${Date.now()}_${bIdx}_${wIdx}`,
        warna: wName,
        sizes: sizesFormatted
      };
    });

    // Cek apakah warna atau qty untuk kode ini masih kosong
    const hasEmptyWarna = warnasFormatted.some((w) => !w.warna.trim());
    if (hasEmptyWarna) {
      missingFieldsQuestions.push(`Warna untuk kode ${kode} belum disebutkan`);
    }
    if (totalKodePcs === 0) {
      missingFieldsQuestions.push(`Jumlah (Qty pcs) per ukuran untuk kode ${kode} masih 0 pcs`);
    }

    preparedSummary.push({
      kode_diminta: kode,
      status_kecocokan_trello: candidateAnalysis.hasExactCodeMatch
        ? 'COCOK_PERSIS'
        : candidateAnalysis.needsSimilarCodeConfirmation
        ? 'PERLU_KONFIRMASI_KODE_MIRIP'
        : 'TIDAK_ADA_DI_TRELLO',
      nama_produk_trello: statusTrelloLabel,
      up_vendor_trello: upVendorLabel,
      kandidat_kode_mirip_di_trello: candidateAnalysis.needsSimilarCodeConfirmation
        ? candidateAnalysis.candidates.map((c) => ({
            kode_trello: c.matchedCode,
            nama_produk: c.productName,
            up_vendor: c.upCode,
            foto_sudah_dilampirkan_di_chat: Boolean(c.photoUrl)
          }))
        : undefined,
      foto_otomatis_terpasang: Boolean(fotoUrl),
      mode_ukuran: sizeMode === 'allsize' ? 'ALL SIZE' : `Multi-Size (${sizeColumns.join(', ')})`,
      rincian_warna: warnasFormatted.map((w) => ({
        warna: w.warna || '(Belum diisi)',
        ukuran_terisi: w.sizes.filter((s) => Number(s.qty) > 0).map((s) => `${s.size}: ${s.qty} pcs`).join(', ') || 'Semua 0 pcs'
      })),
      subtotal_pcs: totalKodePcs
    });

    return {
      id: `prod_${Date.now()}_${bIdx}_${Math.random().toString(36).substring(2, 6)}`,
      kode_produksi: kode,
      catatan,
      foto_url: fotoUrl,
      size_mode: sizeMode,
      size_columns: sizeColumns,
      warnas: warnasFormatted
    };
  });

  if (collectedPreviews.length > 0 && onCollectTrelloPreviews) {
    onCollectTrelloPreviews(collectedPreviews);
  }

  let finalBlocks = newBlocks;
  if (isAppend && Array.isArray(existingDraft?.productBlocks) && existingDraft.productBlocks.length > 0) {
    const existingBlocks = [...existingDraft.productBlocks].filter((b: any) => b && b.kode_produksi && b.kode_produksi.trim());
    const blockMap = new Map<string, any>();
    existingBlocks.forEach((b: any) => blockMap.set(String(b.kode_produksi).trim().toUpperCase(), b));
    newBlocks.forEach((nb) => blockMap.set(nb.kode_produksi, nb));
    finalBlocks = Array.from(blockMap.values());
  }

  const draftPayload = {
    fromAiAssistant: true,
    formKategori: resolvedKategori,
    formTanggal: resolvedTanggal,
    formNoSuratJalan: resolvedNoSJ,
    formKeteranganGlobal: resolvedKeteranganGlobal,
    productBlocks: finalBlocks,
    savedAt: Date.now()
  };

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('wms_penerimaan_produksi_form_draft', JSON.stringify(draftPayload));
      (window as any).__wms_pending_produksi_target = { tab: 'input', reloadDraft: true, draft: draftPayload };
      window.dispatchEvent(new CustomEvent('wms_prefill_penerimaan_produksi_form', { detail: draftPayload }));
      window.dispatchEvent(new CustomEvent('wms_production_draft_updated', { detail: draftPayload }));
    }
  } catch (e) {
    console.warn('[WMS AI] Gagal menyimpan draft form penerimaan ke localStorage:', e);
  }

  const grandTotalDraftPcs = finalBlocks.reduce((acc: number, b: any) => {
    const bSum = (b.warnas || []).reduce((wAcc: number, w: any) => {
      return wAcc + (w.sizes || []).reduce((sAcc: number, s: any) => sAcc + (Number(s.qty) || 0), 0);
    }, 0);
    return acc + bSum;
  }, 0);

  return {
    status: similarCodeWarnings.length > 0 ? 'waiting_similar_code_confirmation' : 'draft_prepared',
    catatan_penting: 'Data telah dimasukkan ke DRAFT FORM INPUT PENERIMAAN (BELUM DISUBMIT KE DATABASE). Pengguna tetap yang melakukan pengecekan akhir dan menekan tombol Simpan/Submit.',
    peringatan_wajib_konfirmasi_kode_mirip: similarCodeWarnings.length > 0 ? similarCodeWarnings : undefined,
    header_form: {
      kategori: resolvedKategori,
      tanggal: resolvedTanggal,
      no_surat_jalan: resolvedNoSJ || '(Belum diisi - tanyakan ke pengguna atau isi di form)',
      keterangan_global: resolvedKeteranganGlobal || '-'
    },
    total_kode_di_form: finalBlocks.length,
    total_pcs_di_form: grandTotalDraftPcs,
    rincian_produk_di_form: preparedSummary,
    data_yang_perlu_ditanyakan_ke_user: missingFieldsQuestions
  };
}

/**
 * 3C. Eksekusi tool BARU: view_production_receipt_form_draft
 */
async function executeViewProductionReceiptFormDraft(): Promise<any> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('wms_penerimaan_produksi_form_draft') : null;
    if (!raw) {
      return {
        ada_draft: false,
        pesan: 'Saat ini belum ada draft aktif di Form Input Penerimaan Produksi.'
      };
    }
    const parsed = JSON.parse(raw);
    const blocks = Array.isArray(parsed.productBlocks) ? parsed.productBlocks : [];
    let totalPcs = 0;
    const rincian = blocks.map((b: any) => {
      let kodePcs = 0;
      const warnas = (b.warnas || []).map((w: any) => {
        const activeSizes = (w.sizes || []).filter((s: any) => Number(s.qty) > 0);
        const wPcs = activeSizes.reduce((acc: number, s: any) => acc + (Number(s.qty) || 0), 0);
        kodePcs += wPcs;
        return {
          warna: w.warna || '(Belum diisi)',
          sizes: activeSizes.map((s: any) => `${s.size}: ${s.qty} pcs`).join(', ') || '0 pcs'
        };
      });
      totalPcs += kodePcs;
      return {
        kode_produksi: b.kode_produksi || '(Belum diisi)',
        catatan: b.catatan || '-',
        subtotal_pcs: kodePcs,
        warnas
      };
    });

    return {
      ada_draft: true,
      kategori: parsed.formKategori || 'Lokal CMT',
      tanggal: parsed.formTanggal || '-',
      no_surat_jalan: parsed.formNoSuratJalan || '(Belum diisi)',
      keterangan_global: parsed.formKeteranganGlobal || '-',
      total_kode: blocks.length,
      total_pcs: totalPcs,
      produk: rincian
    };
  } catch {
    return { ada_draft: false, pesan: 'Gagal membaca draft form penerimaan.' };
  }
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

const BASE_SYSTEM_INSTRUCTION = `Anda adalah Asisten AI Cerdas resmi untuk sistem WMS Inventory (Chocochips Warehouse).
Tugas utama Anda adalah membantu staf gudang, produksi, store, operasional, dan manajemen dengan cepat, akurat, dan ramah dalam Bahasa Indonesia.

PANDUAN & ATURAN UTAMA:
1. PENCARIAN BERBASIS NAMA PRODUK (DILARANG KERAS MEREKOMENDASIKAN / MEMINTA KODE SKU!):
   - Saat mencari stok rak gudang, pengguna biasa menyebut NAMA BAJU / PAKAIAN (contoh: "Ruth Top Cherry", "Sailor Top", "Taylor Pants", "Celana Kulot"), BUKAN Kode SKU barcode.
   - DILARANG KERAS menyuruh, meminta, atau merekomendasikan pengguna untuk memberikan Kode SKU!
   - Jika suatu produk berstatus tidak ditemukan di rak gudang, cukup laporkan statusnya dengan jelas: "❌ Stok Kosong / Belum Ada di Rak" tanpa pernah menyebut kata "Kode SKU".

2. BATCH LOOKUP STOK (CEK BANYAK PRODUK SEKALIGUS DALAM 1 KALI JALAN):
   - Jika pengguna memberikan daftar banyak nama produk sekaligus, WAJIB gunakan SATU KALI panggilan tool "lookup_product_stock" dengan parameter "queries" berupa array seluruh nama produk tersebut.
   - Sajikan hasil dalam format TABEL MARKDOWN LENGKAP:
     | No | Nama Produk | Status | Stok Fisik Gudang | Lokasi Rak | Stok DealPOS |

3. BACA & CARI DATA PENERIMAAN PRODUKSI (LOKAL CMT & KARGO) + TANYA JAWAB PINTAR:
   - Anda memiliki akses penuh ke database Penerimaan Barang Produksi (kategori "Lokal CMT" maupun "Kargo") melalui tool "query_production_receipts" dan "generate_production_recap".
   - Ketika pengguna bertanya seperti:
     * "Kemarin ada masuk kargo apa aja dan berapa aja?"
     * "Hari ini ada penerimaan CMT apa aja?"
     * "Minggu ini kargo yang masuk kode apa aja?"
     * "Surat jalan X isinya apa aja?"
     WAJIB panggil tool "query_production_receipts" dengan mengisi "start_date", "end_date" (sesuai referensi tanggal Hari Ini / Kemarin di bawah), dan "category" ("Kargo" atau "Lokal CMT").
   - Sajikan jawaban yang informatif dan rapi mencakup:
     a. Ringkasan Total (Total Surat Jalan, Total Kode Produksi, dan Total Pcs diterima).
     b. Tabel Rincian: | No | Tanggal | Kategori | No. Surat Jalan | Kode & Nama Produk (UP) | Rincian Warna & Size | Total Pcs | Status Hitung Ulang |
     c. Jika pada tanggal yang ditanyakan ternyata kosong (0 pcs), informasikan dengan sopan bahwa pada tanggal tersebut tidak ada kedatangan tercatat, lalu sebutkan informasi "tanggal_kedatangan_terakhir_di_database" yang dikembalikan oleh tool dan tanyakan apakah pengguna ingin melihat detail tanggal terakhir tersebut.
     d. Akhiri dengan kalimat tanya jawab interaktif (misal menawarkan cek kategori satunya, cek detail per ukuran, atau bantu buatkan rekap).

4. BANTU INPUT PENERIMAAN KE FORM INPUT PRODUKSI & KONFIRMASI KODE MIRIP + FOTO TRELLO (TETAP USER YANG CEK & SUBMIT!):
   - Anda dapat membantu pengguna menyiapkan dan mengisi Form Input Penerimaan Barang Produksi (CMT maupun Kargo) menggunakan tool "prepare_production_receipt_form" dan melihat draft aktif dengan "view_production_receipt_form_draft".
   - PRINSIP UTAMA: AI HANYA mengisikan data ke dalam Draft Form Input di layar. Pengguna yang akan mengecek kembali di layar, melengkapi bagian yang kurang, dan menekan tombol Submit / Simpan Penerimaan sendiri.
   - ATURAN WAJIB KONFIRMASI KODE MIRIP (CONTOH: USER SEBUT "6612", TAPI DI TRELLO ADANYA "6612-1") & LAMPIRAN FOTO PRODUK:
     * Jika pengguna menyebut kode produksi (misal "6612"), namun di Trello UP kode persis "6612" TIDAK ADA dan yang ditemukan adalah kode varian/mirip (seperti "6612-1", "6612-2", atau "6612A"):
     * Sistem TIDAK AKAN langsung auto-match diam-diam ke dalam form! Tool akan mengembalikan status "waiting_similar_code_confirmation" / "perlu_konfirmasi_kode_mirip" dan UI Chat akan OTOMATIS MELAMPIRKAN KARTU FOTO PRODUK TRELLO di bawah balasan Anda!
     * Tugas Anda saat status tersebut muncul:
       1. Beritahu pengguna dengan ramah bahwa kode persis yang disebut (misal "6612") tidak ditemukan di Trello UP, namun ditemukan kode yang mirip yaitu **"6612-1 — [Nama Produk] ([Kode UP])"**.
       2. Persilakan pengguna melihat **Foto Produk Trello** yang sudah Anda lampirkan di bawah pesan chat ini untuk memastikan apakah benar baju/artikel tersebut yang dimaksud.
       3. Tanyakan apakah pengguna setuju menggunakan kode **"6612-1"** tersebut (pengguna bisa langsung klik tombol **"✅ Ya, Pakai Kode 6612-1"** pada kartu foto atau membalas lewat chat).
       4. Begitu pengguna mengonfirmasi ("Ya pakai 6612-1"), panggil kembali "prepare_production_receipt_form" dengan menggunakan kode yang sudah dikonfirmasi tersebut ("6612-1") agar langsung masuk ke Draft Form Input beserta Nama Produk, UP, dan Fotonya!
     * Jika kode produksi COCOK PERSIS 100% di Trello UP, UI Chat juga otomatis menampilkan Kartu Foto Produk Trello sebagai verifikasi visual bagi pengguna.
   - ALUR TANYA JAWAB (Q&A SKILL) SAAT BANTU INPUT PENERIMAAN:
     a. Ketika pengguna meminta bantuan input penerimaan (baik lewat ketikan teks seperti "bantu input kargo kode 6612" maupun mengirim FOTO Surat Jalan / Nota / Packing List / File Excel):
        - Jika kode cocok persis di Trello UP, tool "prepare_production_receipt_form" akan otomatis mengisi Nama Produk, Kode UP Vendor, dan Foto Produk ke dalam Draft Form Input.
     b. LAKUKAN TANYA JAWAB PROAKTIF UNTUK DATA YANG BELUM LENGKAP:
        Periksa kelengkapan 5 komponen Form Input Penerimaan berikut:
        1. **Kategori**: Apakah penerimaan **Lokal CMT** atau **Kargo**?
        2. **Tanggal Penerimaan**: Default hari ini (atau sesuai tanggal yang tertulis di foto surat jalan).
        3. **No. Surat Jalan / Resi**: Nomor surat jalan vendor CMT atau resi kargo.
        4. **Kode Produksi**: Kode artikel barang (misal 6612, 6612-1, 7312).
        5. **Rincian Warna, Ukuran (S/M/L/XL atau ALL SIZE), dan Qty (pcs)**.
        Jika masih ada data di atas yang belum disebutkan oleh pengguna (atau di foto surat jalan ada bagian yang buram/belum jelas), TANYAKAN secara ramah dan terstruktur dalam poin-poin singkat agar pengguna bisa menjawab lewat chat (atau pengguna bisa langsung klik tombol **"Buka Form Input Produksi"** di bawah pesan Anda untuk melengkapi & klik Simpan sendiri).
     c. UPDATE BERTAHAP VIA TANYA JAWAB:
        - Ketika pengguna membalas dengan informasi tambahan (misal: "Ya pakai 6612-1, No SJ-nya KRG-102, warna Hitam S 10 M 15 L 10"), panggil kembali "prepare_production_receipt_form" (gunakan mode "replace" untuk memperbarui keseluruhan surat jalan tersebut, atau mode "append" jika pengguna minta "tambahkan lagi kode 8810").
        - Tampilkan tabel ringkasan draft form yang sudah terisi lengkap, lalu persilakan pengguna menekan tombol **"Buka Form Input Produksi"** untuk mengecek dan menekan tombol **Simpan Penerimaan**.

5. EKSTRAKSI LAMPIRAN MULTIMODAL (FOTO SURAT JALAN CMT/KARGO, NOTA, FILE EXCEL & CSV):
   - Jika pengguna melampirkan FOTO surat jalan / nota kedatangan CMT atau Kargo:
     Baca secara teliti Tanggal, Nomor Surat Jalan, Kategori (CMT/Kargo), daftar Kode Produksi, Warna, Size, dan Qty per ukuran.
     Jika pengguna meminta bantu input ke form penerimaan, langsung panggil "prepare_production_receipt_form" dengan seluruh data hasil ekstraksi foto tersebut, lalu laporkan hasilnya dan tanyakan jika ada bagian yang ingin dikoreksi!
   - Jika pengguna melampirkan foto atau Excel untuk cek stok / keranjang order inventory, gunakan "lookup_product_stock" atau "add_to_inventory_cart".

6. FITUR KERANJANG ORDER INVENTORY (INTERAKTIF & TANYA JAWAB NEGOSIASI):
   - Ketika pengguna meminta memasukkan barang ke keranjang order inventory:
     a. Panggil "lookup_product_stock" terlebih dahulu untuk memeriksa varian warna, size, dan stok fisik rak.
     b. Tanyakan qty jika belum disebutkan, dan tawarkan alternatif warna/size lain yang ready di rak jika yang diminta kosong (0 pcs).
     c. Setelah jelas/dikonfirmasi, panggil "add_to_inventory_cart".

7. TONE OF VOICE: Ramah, komunikatif, proaktif bertanya jika data belum lengkap, solutif, dan profesional.`;

function buildFullSystemInstruction(): string {
  const now = new Date();
  const todayStr = formatLocalYmd(now);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = formatLocalYmd(yesterday);

  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(now.getDate() - 2);
  const twoDaysAgoStr = formatLocalYmd(twoDaysAgo);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const sevenDaysAgoStr = formatLocalYmd(sevenDaysAgo);

  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const dateContext = `\n\nKONTEKS WAKTU REAL-TIME SAAT INI (WAJIB DIGUNAKAN UNTUK FILTER TANGGAL):
- Hari Ini: ${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()} (Format YYYY-MM-DD: "${todayStr}")
- Kemarin: ${dayNames[yesterday.getDay()]}, ${yesterday.getDate()} ${monthNames[yesterday.getMonth()]} ${yesterday.getFullYear()} (Format YYYY-MM-DD: "${yesterdayStr}")
- 2 Hari Lalu (Kemarin Lusa): "${twoDaysAgoStr}"
- 7 Hari Terakhir (Minggu Ini): start_date="${sevenDaysAgoStr}" s/d end_date="${todayStr}"
- Bulan Ini: Bulan ke-${now.getMonth() + 1} (${monthNames[now.getMonth()]}) Tahun ${now.getFullYear()}`;

  return BASE_SYSTEM_INSTRUCTION + dateContext;
}

/**
 * Mengirim pesan ke Google Gemini dengan multi-turn Tool Execution loop
 * Mendukung Multimodal Vision (Foto/Gambar) dan Ekstraksi Dokumen Spreadsheet (Excel/CSV)
 */
export async function sendChatMessageToGemini(
  conversationHistory: AiChatMessage[],
  userPrompt: string,
  onToolCallStart?: (toolName: string) => void,
  attachments?: AiAttachment[]
): Promise<{ text: string; executedTools: string[]; trelloCandidates?: TrelloCandidatePreview[] }> {
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
  const recentHistory = conversationHistory.slice(-8);
  recentHistory.forEach((msg) => {
    if (msg.role === 'user') {
      const histParts: any[] = [];
      // Jika ada lampiran gambar di riwayat user sebelumnya
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach((att) => {
          if (att.type === 'image' && att.base64Data) {
            histParts.push({
              inlineData: {
                mimeType: att.mimeType || 'image/jpeg',
                data: att.base64Data
              }
            });
          }
        });
      }
      histParts.push({ text: msg.text });
      contents.push({ role: 'user', parts: histParts });
    } else if (msg.role === 'model') {
      contents.push({ role: 'model', parts: [{ text: msg.text }] });
    }
  });

  // Tambahkan prompt & lampiran baru dari user
  const userParts: any[] = [];

  // 1. Sisipkan Gambar (Vision inlineData base64) jika ada
  if (attachments && attachments.length > 0) {
    attachments.forEach((att) => {
      if (att.type === 'image' && att.base64Data) {
        userParts.push({
          inlineData: {
            mimeType: att.mimeType || 'image/jpeg',
            data: att.base64Data
          }
        });
      }
    });
  }

  // 2. Sisipkan Teks Prompt beserta Ekstraksi Tabel Excel / CSV
  let fullPromptText = (userPrompt || '').trim();
  if (attachments && attachments.length > 0) {
    const docAttachments = attachments.filter((a) => a.type === 'excel' || a.type === 'csv' || a.type === 'file');
    if (docAttachments.length > 0) {
      const docSummaries = docAttachments.map((doc) => {
        return `\n\n--- LAMPIRAN FILE: "${doc.name}" (${doc.rowCount || 0} baris data) ---\n${doc.extractedText || ''}`;
      }).join('\n');
      fullPromptText = `${fullPromptText}\n${docSummaries}`.trim();
    }
  }

  userParts.push({
    text: fullPromptText || (attachments && attachments.length > 0 ? 'Tolong periksa, ekstrak data dari lampiran di atas, dan analisis dengan database WMS.' : 'Halo')
  });

  contents.push({
    role: 'user',
    parts: userParts
  });

  const executedTools: string[] = [];
  const collectedCandidatesMap = new Map<string, TrelloCandidatePreview>();
  const handleCollectTrelloPreviews = (previews: TrelloCandidatePreview[]) => {
    previews.forEach((p) => {
      const key = `${p.matchedCode}__${p.upCode || ''}`;
      if (!collectedCandidatesMap.has(key)) {
        collectedCandidatesMap.set(key, p);
      }
    });
  };
  const activeSystemInstruction = buildFullSystemInstruction();

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
          parts: [{ text: activeSystemInstruction }]
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
      const finalCandidates = Array.from(collectedCandidatesMap.values());
      return {
        text: textParts || 'Selesai memproses.',
        executedTools,
        trelloCandidates: finalCandidates.length > 0 ? finalCandidates : undefined
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
          toolResult = await executeLookupProductionCode(fnArgs, handleCollectTrelloPreviews);
        } else if (fnName === 'query_production_receipts') {
          toolResult = await executeQueryProductionReceipts(fnArgs);
        } else if (fnName === 'generate_production_recap') {
          toolResult = await executeGenerateProductionRecap(fnArgs);
        } else if (fnName === 'prepare_production_receipt_form') {
          toolResult = await executePrepareProductionReceiptForm(fnArgs, handleCollectTrelloPreviews);
        } else if (fnName === 'view_production_receipt_form_draft') {
          toolResult = await executeViewProductionReceiptFormDraft();
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
  const finalCandidates = Array.from(collectedCandidatesMap.values());
  try {
    const finalModel = modelsToTry[currentModelIndex] || 'gemini-3.5-flash';
    contents.push({
      role: 'user',
      parts: [{ text: 'Berdasarkan data database yang sudah diperiksa di atas, tolong langsung tuliskan jawaban akhir dan tabel rincian lengkapnya sekarang tanpa memanggil tool lagi.' }]
    });
    // Kuncinya: TIDAK mengirimkan `tools` di turn ini agar Gemini dipaksa menghasilkan jawaban teks akhir
    const finalRes = await postToGemini(finalModel, {
      contents,
      systemInstruction: { parts: [{ text: activeSystemInstruction }] }
    });
    const candidate = finalRes.candidates?.[0];
    const textParts = candidate?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join('\n');
    if (textParts && textParts.trim()) {
      return {
        text: textParts.trim(),
        executedTools,
        trelloCandidates: finalCandidates.length > 0 ? finalCandidates : undefined
      };
    }
  } catch (err) {
    console.warn('[WMS AI] Gagal generate final text summary:', err);
  }

  return {
    text: executedTools.length > 0
      ? `Pemeriksaan database selesai untuk ${executedTools.length} langkah data. Seluruh hasil pencarian telah dicocokkan dengan data fisik live rak gudang.`
      : 'Selesai memproses.',
    executedTools,
    trelloCandidates: finalCandidates.length > 0 ? finalCandidates : undefined
  };
}
