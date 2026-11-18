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

import {
  supabaseFetch,
  fetchStockForSkus,
  fetchSupabaseStokFisikDirect,
  fetchPenerimaanProduksiFromSupabase,
  fetchLogsBySearch,
  fetchQcReportsFromSupabase,
  fetchPerbaikanTicketsFromSupabase,
  fetchPeminjamanFromSupabase,
  fetchRosterShiftList,
  fetchPresensiRange,
  fetchKaryawanDirectory,
  fetchLemburRecords,
  fetchCutiRecords,
  fetchIzinPulangAwalList,
  getAgendaEvents,
  getProjects,
  getNotes,
  getDelegatedTasks
} from './supabase';
import { getGlobalProductCatalogMap, lookupProductBySku, setGlobalProductCatalog, ProductLookupResult } from '../utils/productLookup';
import { cleanProductName, resolveProductDisplaySize, extractSizeFromSku } from '../utils/sortUtils';
import { getAllProductsFromLocalDb } from './localDb';
import { getLocalCachedTrelloItems, extractBaseItemCode } from './trelloSyncService';
import { fetchRackCapacityConfig, computeAllRackSlots, buildEnrichedCatalogMap } from './rackCapacityService';
import { fetchReturOrders } from './returBarangService';
import { fetchJneRecordsFromGas, getLocalCachedJneRecords } from './jneRekapService';
import { fetchIgLiveOrdersFromSupabase } from './igLiveService';
import {
  ProductItem,
  PenerimaanProduksiItem,
  TrelloUpItem,
  UserSession,
  UserPermissions,
  PickingListItem
} from '../types';
import { AiAttachment } from '../utils/aiAttachmentParser';
export type { AiAttachment };

export const SYSTEM_DOC_AI_CONFIG_ID = 'wms_ai_config';

export type AiUserRole = 'superadmin' | 'hr' | 'warehouse_ops' | 'store';

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
    subtitle?: string;
    filename?: string;
    headers: string[];
    rows: (string | number)[][];
    summary?: string;
    preferredFormat?: 'excel' | 'pdf' | 'both';
  };
}

export interface AiChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiChatMessage[];
}

export interface WmsAiConfig {
  allowedUsers: string[];
  enabled: boolean;
  model: string;
}

export function resolveAiUserRole(session?: UserSession | null): AiUserRole {
  if (!session) return 'warehouse_ops';
  const role = String(session.role || '').toLowerCase().trim();
  const uname = String(session.username || '').toLowerCase().trim();
  const perms: Partial<UserPermissions> = session.permissions || {};

  if (
    role === 'superadmin' ||
    role === 'owner' ||
    uname === 'warehouse' ||
    uname === 'admin' ||
    uname === 'chocoadm'
  ) {
    return 'superadmin';
  }
  if (
    role === 'hr & admin' ||
    Boolean(perms.menu_hr_approval) ||
    Boolean(perms.menu_hr_karyawan) ||
    Boolean(perms.menu_hr_roster) ||
    Boolean(perms.menu_hr_presensi) ||
    Boolean(perms.menu_hr_lembur_cuti)
  ) {
    return 'hr';
  }
  if (role === 'store' || Boolean(session.store_name) || Boolean(session.store_code)) {
    return 'store';
  }
  return 'warehouse_ops';
}

export async function checkServerAiHealth(): Promise<{ ok: boolean; configured: boolean; models: string[] }> {
  try {
    const res = await fetch('/api/ai', { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, configured: false, models: [] };
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      configured: Boolean(data?.configured),
      models: Array.isArray(data?.models) ? data.models : ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
    };
  } catch {
    return { ok: false, configured: false, models: [] };
  }
}

/**
 * Mengambil konfigurasi AI & daftar whitelist pengguna dari Supabase wms_system_docs
 */
export async function fetchAiConfig(): Promise<WmsAiConfig> {
  const defaultConfig: WmsAiConfig = {
    allowedUsers: ['admin', 'warehouse', 'chocoadm'],
    enabled: true,
    model: 'gemini-4-hydrogen'
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
        allowedUsers: Array.isArray(parsed.allowedUsers) ? parsed.allowedUsers : defaultConfig.allowedUsers,
        enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : true,
        model: 'gemini-4-hydrogen'
      };

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
 * Menyimpan konfigurasi whitelist pengguna ke Supabase wms_system_docs
 */
export async function saveAiConfig(config: Partial<WmsAiConfig>): Promise<boolean> {
  try {
    const current = await fetchAiConfig();
    const updated: WmsAiConfig = {
      allowedUsers: config.allowedUsers || current.allowedUsers,
      enabled: config.enabled !== undefined ? config.enabled : current.enabled,
      model: 'gemini-4-hydrogen'
    };

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

function sanitizeSessionsForCloud(sessions: AiChatSession[]): AiChatSession[] {
  return (sessions || []).slice(0, 20).map((s) => ({
    ...s,
    messages: (s.messages || []).slice(-30).map((m) => ({
      ...m,
      attachments: m.attachments
        ? m.attachments.map((att) => ({
            id: att.id,
            name: att.name,
            type: att.type,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes,
            rowCount: att.rowCount,
            extractedText: att.extractedText ? att.extractedText.slice(0, 2500) : undefined
          }))
        : undefined
    }))
  }));
}

export async function fetchAiChatSessionsFromCloud(username: string): Promise<AiChatSession[]> {
  const cleanUser = String(username || '').trim().toLowerCase();
  if (!cleanUser) return [];
  const docKey = `wms_ai_sessions_${cleanUser}`;
  try {
    const rows = await supabaseFetch<any[]>(
      'wms_system_docs',
      'GET',
      null,
      `or=(section_id.eq.${encodeURIComponent(docKey)},doc_key.eq.${encodeURIComponent(docKey)})&limit=1`
    );
    if (Array.isArray(rows) && rows[0]?.content) {
      const parsed = JSON.parse(rows[0].content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('[WMS AI] Gagal mengambil riwayat sesi cloud:', err);
  }
  return [];
}

export async function saveAiChatSessionsToCloud(username: string, sessions: AiChatSession[]): Promise<boolean> {
  const cleanUser = String(username || '').trim().toLowerCase();
  if (!cleanUser) return false;
  const docKey = `wms_ai_sessions_${cleanUser}`;
  const leanSessions = sanitizeSessionsForCloud(sessions);
  try {
    await supabaseFetch(
      'wms_system_docs',
      'POST',
      [
        {
          section_id: docKey,
          doc_key: docKey,
          title: `Riwayat Sesi AI (${cleanUser})`,
          content: JSON.stringify(leanSessions),
          updated_by: cleanUser,
          updated_at: new Date().toISOString()
        }
      ],
      'on_conflict=doc_key',
      true
    );
    return true;
  } catch (err) {
    console.warn('[WMS AI] Gagal menyinkronkan riwayat sesi ke cloud:', err);
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
      },
      {
        name: 'generate_exportable_report',
        description: 'Membuat dokumen laporan data terstruktur yang siap diunduh oleh pengguna dalam format File Excel (.xlsx) maupun Dokumen PDF (.pdf). WAJIB panggil tool ini ketika pengguna meminta dibuatkan laporan dalam format PDF atau Excel (baik laporan stok rak/DealPOS, laporan penerimaan CMT/Kargo, rekap bulanan, maupun tabel data kustom).',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Judul utama laporan (contoh: "Laporan Stok Fisik & DealPOS Gudang", "Laporan Penerimaan Kargo 10 November 2026")'
            },
            subtitle: {
              type: 'STRING',
              description: 'Subjudul atau keterangan periode laporan (opsional)'
            },
            filename: {
              type: 'STRING',
              description: 'Nama file tanpa ekstensi (contoh: "Laporan_Stok_Gudang" atau "Rekap_Penerimaan_Kargo")'
            },
            preferred_format: {
              type: 'STRING',
              description: 'Format yang diminta pengguna: "excel", "pdf", atau "both" (default: "both")'
            },
            summary: {
              type: 'STRING',
              description: 'Ringkasan total atau kesimpulan singkat di bagian atas laporan (contoh: "Total 7 SKU • Total Fisik: 5 pcs • Total DealPOS: 254 pcs")'
            },
            headers: {
              type: 'ARRAY',
              description: 'Daftar nama kolom tabel laporan, contoh: ["No", "Nama Produk & Varian", "Status Rak", "Stok Fisik", "Stok DealPOS", "Lokasi Rak"]',
              items: { type: 'STRING' }
            },
            rows: {
              type: 'ARRAY',
              description: 'Data baris tabel laporan (array 2 dimensi di mana setiap baris memiliki jumlah elemen yang sama dengan headers)',
              items: {
                type: 'ARRAY',
                items: { type: 'STRING' }
              }
            }
          },
          required: ['title', 'headers', 'rows']
        }
      },
      {
        name: 'audit_stock_and_mutations',
        description: 'Mengaudit histori pergerakan barang (IN, OUT, SO, ADJ_IN, ADJ_OUT) di log_produk, memeriksa selisih/anomali stok fisik vs kuota DealPOS, atau memeriksa kapasitas rak gudang (rak kosong, rak tersedia, rak overload).',
        parameters: {
          type: 'OBJECT',
          properties: {
            mode: {
              type: 'STRING',
              description: 'Mode audit: "mutations" (riwayat mutasi SKU/lokasi/invoice), "discrepancy" (audit selisih fisik vs DealPOS), atau "rack_capacity" (cek rak kosong/tersedia/overload). Default "mutations".'
            },
            keyword: {
              type: 'STRING',
              description: 'Nama produk, kode rak (misal "A012"), nomor invoice/SJ, atau SKU (untuk mode mutations/discrepancy)'
            },
            area: {
              type: 'STRING',
              description: 'Filter area rak untuk mode rack_capacity, misal "Warehouse", "Kolian", "Blok F", "Transit", "Sortir"'
            },
            rack_filter: {
              type: 'STRING',
              description: 'Filter status kapasitas rak: "empty", "available", "overload", atau "all"'
            },
            limit: {
              type: 'NUMBER',
              description: 'Batas maksimum baris hasil (default 25)'
            }
          }
        }
      },
      {
        name: 'check_picking_and_channel_orders',
        description: 'Memeriksa antrean tugas picking gudang (picking_list berdasarkan invoice_picking atau no_sj, termasuk status under-pick/over-pick) serta status pesanan channel IG Live (ig_live_orders).',
        parameters: {
          type: 'OBJECT',
          properties: {
            source: {
              type: 'STRING',
              description: '"picking", "ig_live", atau "all" (default "all")'
            },
            keyword: {
              type: 'STRING',
              description: 'Opsional: nomor SJ, invoice_picking (WA...), nama produk, tujuan, atau username IG'
            },
            only_incomplete: {
              type: 'BOOLEAN',
              description: 'Jika true, fokus tampilkan tugas picking yang belum selesai/kurang ambil atau order IG Live yang masih pending/picking'
            }
          }
        }
      },
      {
        name: 'check_qc_repair_and_loans',
        description: 'Memeriksa laporan inspeksi Quality Control (qc_reports), antrean tiket Perbaikan/Cuci/Permak/Defect (perbaikan_tickets), serta daftar Peminjaman SPS barang yang masih dipinjam/telat kembali.',
        parameters: {
          type: 'OBJECT',
          properties: {
            scope: {
              type: 'STRING',
              description: '"qc", "perbaikan", "peminjaman", atau "all" (default "all")'
            },
            keyword: {
              type: 'STRING',
              description: 'Opsional: kode produksi, nama produk, no tiket, PIC, atau nama peminjam'
            },
            only_active: {
              type: 'BOOLEAN',
              description: 'Jika true, prioritaskan tiket perbaikan aktif atau barang yang belum dikembalikan'
            }
          }
        }
      },
      {
        name: 'check_retur_and_jne_rekap',
        description: 'Memeriksa daftar tiket Retur Barang Pusat Resolusi (RTR-...) beserta status DealPOS/resinya, serta memeriksa data Rekap Tagihan Ongkir JNE.',
        parameters: {
          type: 'OBJECT',
          properties: {
            scope: {
              type: 'STRING',
              description: '"retur", "jne", atau "all" (default "all")'
            },
            keyword: {
              type: 'STRING',
              description: 'Opsional: no_retur, no_pesanan_asal, no_resi, nama customer, atau outlet'
            },
            status: {
              type: 'STRING',
              description: 'Opsional filter status retur: "diterima", "diproses", "dikirim", "batal"'
            }
          }
        }
      },
      {
        name: 'query_hr_operations',
        description: 'Khusus akun HR & Superadmin: mengecek jadwal Roster Shift karyawan, rekap Presensi masuk/pulang, serta daftar pengajuan Lembur, Cuti, dan Izin Pulang Awal (termasuk yang statusnya masih Diajukan / menunggu approval).',
        parameters: {
          type: 'OBJECT',
          properties: {
            scope: {
              type: 'STRING',
              description: '"roster", "presensi", "approvals", "karyawan", atau "summary" (default "summary")'
            },
            start_date: {
              type: 'STRING',
              description: 'Tanggal awal YYYY-MM-DD (default hari ini)'
            },
            end_date: {
              type: 'STRING',
              description: 'Tanggal akhir YYYY-MM-DD (default hari ini)'
            },
            keyword: {
              type: 'STRING',
              description: 'Opsional: nama karyawan, NIK, atau divisi'
            },
            only_pending_approvals: {
              type: 'BOOLEAN',
              description: 'Jika true, hanya tampilkan pengajuan Lembur/Cuti/Izin dengan status Diajukan'
            }
          }
        }
      },
      {
        name: 'prepare_manual_shipment_draft',
        description: 'Membantu mengekstrak detail pesanan dari teks chat WhatsApp/lampiran ke dalam Draft Form Input Manual Shipment (Pesanan Saya). AI hanya menyiapkan draft untuk dicek & disubmit manusia, tidak langsung menyimpan ke database.',
        parameters: {
          type: 'OBJECT',
          properties: {
            nama_pengirim: { type: 'STRING', description: 'Nama store pengirim (misal PIM, GI, PIK, Gudang)' },
            delivery_method: { type: 'STRING', description: '"expedition" atau "drop_store"' },
            drop_store_target: { type: 'STRING', description: 'Store tujuan jika drop_store' },
            jasa_kirim: { type: 'STRING', description: 'Nama ekspedisi, misal JNE Regular, J&T Express, GoSend Instant' },
            nama_tujuan: { type: 'STRING', description: 'Nama customer penerima' },
            no_telp_tujuan: { type: 'STRING', description: 'No HP / WhatsApp penerima' },
            email_customer: { type: 'STRING', description: 'Email customer (opsional)' },
            alamat_tujuan: { type: 'STRING', description: 'Alamat lengkap pengiriman' },
            notes_paket: { type: 'STRING', description: 'Catatan tambahan paket' },
            items: {
              type: 'ARRAY',
              description: 'Daftar produk yang dipesan (akan otomatis dilookup ke Master Produk berdasarkan nama/SKU)',
              items: {
                type: 'OBJECT',
                properties: {
                  product_query: { type: 'STRING', description: 'Nama produk + warna + size atau SKU dari teks pesanan' },
                  sku: { type: 'STRING', description: 'Opsional kode SKU bila sudah diketahui' },
                  size: { type: 'STRING', description: 'Opsional size permintaan' },
                  qty: { type: 'NUMBER', description: 'Jumlah pcs (default 1)' },
                  fulfillment: { type: 'STRING', description: 'Sumber pemenuhan, default "Gudang" atau nama Store' }
                }
              }
            }
          },
          required: ['nama_tujuan', 'items']
        }
      },
      {
        name: 'prepare_retur_barang_draft',
        description: 'Membantu mengekstrak komplain/permintaan retur customer dari chat WhatsApp/lampiran ke Draft Form Input Retur Barang (Pusat Resolusi). AI hanya menyiapkan draft untuk dicek & disubmit tim CS/Admin.',
        parameters: {
          type: 'OBJECT',
          properties: {
            no_pesanan_asal: { type: 'STRING', description: 'Nomor pesanan asal Shopee/Tiktok/Website/IG' },
            outlet_order: { type: 'STRING', description: 'Outlet asal order: Shopee, Tiktok, Tokped, Website, IGlive, dll' },
            kategori_alasan: { type: 'STRING', description: '"tukar_size_model", "defect_reject", "salah_kirim", atau "lainnya"' },
            alasan_retur: { type: 'STRING', description: 'Penjelasan alasan retur customer' },
            opsi_pengiriman: { type: 'STRING', description: 'Ekspedisi pengiriman barang pengganti' },
            nama_customer: { type: 'STRING', description: 'Nama customer' },
            no_hp: { type: 'STRING', description: 'Nomor HP/WA customer' },
            alamat_lengkap: { type: 'STRING', description: 'Alamat lengkap customer' },
            no_resi_customer: { type: 'STRING', description: 'No resi barang retur yang dikirim customer ke gudang (opsional)' },
            penanggung_biaya: { type: 'STRING', description: '"customer" atau "toko_free"' },
            produk_pesanan: {
              type: 'ARRAY',
              description: 'Daftar barang awal yang diretur customer',
              items: {
                type: 'OBJECT',
                properties: {
                  product_query: { type: 'STRING', description: 'Nama/SKU produk yang diretur' },
                  sku: { type: 'STRING' },
                  size: { type: 'STRING' },
                  qty: { type: 'NUMBER' }
                }
              }
            },
            produk_pengganti: {
              type: 'ARRAY',
              description: 'Daftar barang pengganti yang akan dikirim ke customer',
              items: {
                type: 'OBJECT',
                properties: {
                  product_query: { type: 'STRING', description: 'Nama/SKU produk pengganti' },
                  sku: { type: 'STRING' },
                  size: { type: 'STRING' },
                  qty: { type: 'NUMBER' },
                  fulfillment: { type: 'STRING', description: 'Default "Marketplace" atau nama Store' }
                }
              }
            }
          },
          required: ['nama_customer', 'alasan_retur']
        }
      },
      {
        name: 'query_agenda_and_projects',
        description: 'Membaca dan menganalisis data Kalender Agenda Event & Agenda Distribusi (wms_agenda), Daftar Task Delegasi Karyawan/CS/Admin (wms_tasks), Roadmap/Daftar Project (wms_projects), serta Sticky Notes & Checklist (wms_notes). Gunakan saat pengguna bertanya jadwal kegiatan, jadwal/tanggal distribusi barang, tugas delegasi, progress project, deadline terlambat/mendekat, atau catatan tim.',
        parameters: {
          type: 'OBJECT',
          properties: {
            scope: {
              type: 'STRING',
              description: '"agenda", "tasks", "projects", "notes", atau "all" (default "all")'
            },
            agenda_type: {
              type: 'STRING',
              description: 'Filter jenis kalender saat scope "agenda" atau "all": "all", "event" (Agenda Event), atau "distribusi" (Agenda Distribusi)'
            },
            start_date: {
              type: 'STRING',
              description: 'Filter tanggal mulai Agenda/Project YYYY-MM-DD'
            },
            end_date: {
              type: 'STRING',
              description: 'Filter tanggal akhir Agenda/Project YYYY-MM-DD'
            },
            category: {
              type: 'STRING',
              description: 'Filter kategori Agenda atau Project'
            },
            status: {
              type: 'STRING',
              description: 'Filter status Project ("planning", "in_progress", "review", "completed", "on_hold") atau Task ("pending", "in_progress", "completed")'
            },
            priority: {
              type: 'STRING',
              description: 'Filter prioritas Project/Task: "low", "medium", "high", "urgent"'
            },
            keyword: {
              type: 'STRING',
              description: 'Kata kunci judul, deskripsi, lokasi, toko tujuan distribusi, atau nama/ID penerima tugas'
            }
          }
        }
      },
      {
        name: 'prepare_agenda_or_project_draft',
        description: 'Membantu membuatkan Draft Agenda Event, Agenda Distribusi (jadwal & tanggal distribusi barang), Tugas Delegasi (Task untuk Admin/CS/ID Karyawan), Project baru, atau Sticky Note / Checklist baru untuk direview dan disimpan oleh pengguna di modul Agenda, Task & Project. AI hanya membuka draft di modal, manusia yang mengecek & klik Simpan.',
        parameters: {
          type: 'OBJECT',
          properties: {
            draft_type: {
              type: 'STRING',
              description: '"agenda" (Agenda Event), "agenda_distribusi" (Agenda Distribusi khusus jadwal/tanggal distribusi), "task" (Tugas Delegasi ke user/karyawan), "project", atau "note"'
            },
            agenda_type: {
              type: 'STRING',
              description: 'Opsional: "event" atau "distribusi"'
            },
            title: { type: 'STRING', description: 'Judul Agenda, Jadwal Distribusi, Tugas, Project, atau Catatan' },
            description: { type: 'STRING', description: 'Deskripsi detail Agenda/Distribusi/Tugas/Project atau isi konten Note' },
            start_date: { type: 'STRING', description: 'Tanggal mulai/distribusi format YYYY-MM-DD (default hari ini)' },
            end_date: { type: 'STRING', description: 'Tanggal selesai Agenda format YYYY-MM-DD' },
            deadline: { type: 'STRING', description: 'Tanggal deadline Project atau tenggat Task format YYYY-MM-DD' },
            due_date: { type: 'STRING', description: 'Tanggal tenggat waktu Task format YYYY-MM-DD' },
            is_all_day: { type: 'BOOLEAN', description: 'True jika agenda seharian penuh' },
            start_time: { type: 'STRING', description: 'Jam mulai agenda HH:mm, misal "09:00"' },
            end_time: { type: 'STRING', description: 'Jam selesai agenda HH:mm, misal "10:00"' },
            category: { type: 'STRING', description: 'Kategori Agenda (misal "operasional", "meeting", "supplier") atau kategori Project' },
            location: { type: 'STRING', description: 'Lokasi kegiatan/meeting atau tujuan distribusi (opsional)' },
            pic: { type: 'STRING', description: 'Nama PIC / penanggung jawab' },
            store_target: { type: 'STRING', description: 'Khusus agenda_distribusi: Store / Cabang tujuan distribusi' },
            expedition: { type: 'STRING', description: 'Khusus agenda_distribusi: Nama ekspedisi / armada pengiriman' },
            total_koli: { type: 'NUMBER', description: 'Khusus agenda_distribusi: Estimasi jumlah koli' },
            total_qty: { type: 'NUMBER', description: 'Khusus agenda_distribusi: Estimasi jumlah pcs' },
            dist_status: { type: 'STRING', description: 'Khusus agenda_distribusi: "terjadwal", "dikirim", atau "selesai"' },
            assigned_to_id: { type: 'STRING', description: 'Khusus task: Username atau NIK/ID Karyawan penerima tugas (misal "WH0004", "chococs1")' },
            assigned_to_name: { type: 'STRING', description: 'Khusus task: Nama lengkap penerima tugas' },
            priority: { type: 'STRING', description: 'Prioritas Project/Task: "low", "medium", "high", "urgent"' },
            status: { type: 'STRING', description: 'Status Project: "planning", "in_progress", "review", "completed", "on_hold"' },
            project_id: { type: 'STRING', description: 'Opsional ID project yang ditautkan' },
            tasks: {
              type: 'ARRAY',
              description: 'Daftar sub-task (checklist) untuk Project baru',
              items: { type: 'STRING' }
            },
            checklist: {
              type: 'ARRAY',
              description: 'Daftar item checklist untuk Sticky Note baru',
              items: { type: 'STRING' }
            },
            color: {
              type: 'STRING',
              description: 'Warna Sticky Note ("yellow", "blue", "green", "pink", "purple") atau warna Agenda'
            }
          },
          required: ['draft_type', 'title']
        }
      }
    ]
  }
];

const ALL_TOOL_DECLARATIONS = AI_TOOLS[0].functionDeclarations;

export function getToolsForRole(role: AiUserRole, session?: UserSession | null) {
  const perms: Partial<UserPermissions> = session?.permissions || {};
  const canHr =
    role === 'superadmin' ||
    role === 'hr' ||
    Boolean(
      perms.menu_hr_approval ||
        perms.menu_hr_karyawan ||
        perms.menu_hr_roster ||
        perms.menu_hr_presensi ||
        perms.menu_hr_lembur_cuti
    );

  const allowedDeclarations = ALL_TOOL_DECLARATIONS.filter((decl: any) => {
    if (decl.name === 'query_hr_operations' && !canHr) return false;
    if (role === 'store') {
      const storeHiddenTools = new Set([
        'query_hr_operations',
        'prepare_production_receipt_form',
        'view_production_receipt_form_draft',
        'audit_stock_and_mutations'
      ]);
      if (storeHiddenTools.has(decl.name)) return false;
    }
    return true;
  });

  return [{ functionDeclarations: allowedDeclarations }];
}

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
 * Normalisasi token ukuran pakaian agar konsisten saat dibandingkan
 * (misal 'S', 'M', 'L', 'XL', '2XL' -> 'XXL', 'ALL SIZE'/'DEFAULT' -> 'ALL')
 */
function normalizeSizeTokenForMatch(rawSize: string): string {
  const s = String(rawSize || '')
    .trim()
    .toUpperCase()
    .replace(/^SIZE\s*:?\s*/i, '')
    .replace(/^UKURAN\s*:?\s*/i, '')
    .replace(/^UK\s*:?\s*/i, '')
    .replace(/[()[\]]/g, '')
    .trim();
  if (!s || s === '-' || s === 'DEFAULT' || s === 'ALL' || s === 'ALL SIZE' || s === 'ALLSIZE' || s === 'FREE SIZE' || s === 'FREESIZE' || s === 'FS' || s === 'ONE SIZE' || s === 'ONESIZE' || s === 'OS') {
    return 'ALL';
  }
  if (s === '2XL') return 'XXL';
  if (s === '3XL') return 'XXXL';
  if (s === '4XL') return 'XXXXL';
  if (s === '2XS') return 'XXS';
  return s;
}

/**
 * Memisahkan query pengguna menjadi:
 * - `nameTokens`: daftar kata nama produk & warna (contoh: ["zilva", "top", "white"])
 * - `cleanProductNameQuery`: gabungan kata nama produk & warna ("zilva top white")
 * - `requestedSize`: ukuran spesifik jika pengguna menyebutkannya (contoh: "M", "S", "L", "XL", "XXL", "ALL"), atau null jika tidak sebut size
 */
function parseProductQueryAndSize(rawQuery: string): {
  nameTokens: string[];
  cleanProductNameQuery: string;
  requestedSize: string | null;
} {
  let working = String(rawQuery || '').trim();
  let requestedSize: string | null = null;

  // 1. Cek apakah ada ukuran di dalam tanda kurung, contoh: "Zilva Top White (M)" atau "(ALL SIZE)"
  const parenSizeMatch = working.match(/\(\s*(?:size\s*:?\s*|ukuran\s*:?\s*|uk\s*:?\s*)?(XXXL|3XL|XXL|2XL|XL|XS|XXS|S|M|L|ALL\s*SIZE|ALLSIZE|ALL|FREE\s*SIZE|FS)\s*\)/i);
  if (parenSizeMatch && parenSizeMatch[1]) {
    requestedSize = normalizeSizeTokenForMatch(parenSizeMatch[1]);
    working = working.replace(parenSizeMatch[0], ' ');
  }

  // 2. Cek apakah ada pola eksplisit "size M" / "ukuran S" / "- M" di akhir kalimat
  if (!requestedSize) {
    const explicitSizeMatch = working.match(/(?:[-–—/]\s*|\b(?:size|ukuran|uk)\s+)(XXXL|3XL|XXL|2XL|XL|XS|XXS|S|M|L|ALL\s*SIZE|ALLSIZE|ALL|FREE\s*SIZE|FS)\s*$/i);
    if (explicitSizeMatch && explicitSizeMatch[1]) {
      requestedSize = normalizeSizeTokenForMatch(explicitSizeMatch[1]);
      working = working.slice(0, explicitSizeMatch.index).trim();
    }
  }

  // 3. Cek apakah kata paling belakang adalah token ukuran pakaian standar (contoh: "Posy Dress Blue S" atau "Zilva Top White M")
  if (!requestedSize) {
    const trailingAllSize = working.match(/\b(ALL\s*SIZE|ALLSIZE|FREE\s*SIZE)\s*$/i);
    if (trailingAllSize && trailingAllSize[1]) {
      requestedSize = 'ALL';
      working = working.slice(0, trailingAllSize.index).trim();
    } else {
      const tokensTemp = working
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (tokensTemp.length >= 2) {
        const lastTok = tokensTemp[tokensTemp.length - 1].toUpperCase();
        if (/^(XXXL|3XL|XXL|2XL|XL|XS|XXS|S|M|L|ALL|FS)$/.test(lastTok)) {
          requestedSize = normalizeSizeTokenForMatch(lastTok);
          tokensTemp.pop();
          working = tokensTemp.join(' ');
        }
      }
    }
  }

  // Bersihkan kata tambahan non-nama seperti "size", "ukuran", "pcs"
  const nameTokens = working
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => Boolean(t) && !['size', 'ukuran', 'uk', 'pcs', 'pc', 'stok', 'cek'].includes(t));

  return {
    nameTokens,
    cleanProductNameQuery: nameTokens.join(' '),
    requestedSize
  };
}

/**
 * Menghitung angka DealPOS suatu item Master Produk persis mengikuti rumus resmi
 * `src/components/inventory/inventoryModel.ts` (Menu Inventory Tabel & Detail Drawer)
 */
function computeOfficialDealposBreakdown(item: any): {
  commercialDp: number;
  perbaikanDp: number;
  totalDp: number;
  dpMap: number;
  dpLive: number;
  dpStudio: number;
  dpPermak: number;
  dpDefect: number;
} {
  if (!item || typeof item !== 'object') {
    return { commercialDp: 0, perbaikanDp: 0, totalDp: 0, dpMap: 0, dpLive: 0, dpStudio: 0, dpPermak: 0, dpDefect: 0 };
  }

  const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
  const toNum = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const pickNum = (sources: Array<Record<string, any> | undefined | null>, keys: readonly string[]): number | undefined => {
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      if (!s) continue;
      for (let j = 0; j < keys.length; j++) {
        const v = s[keys[j]];
        if (v !== undefined && v !== null && v !== '') return toNum(v);
      }
    }
    return undefined;
  };

  const dpRaw = isObj(item.dealpos_channels)
    ? (item.dealpos_channels as Record<string, any>)
    : isObj(item.dealpos)
    ? (item.dealpos as Record<string, any>)
    : {};
  const dpD = isObj(dpRaw.d) ? dpRaw.d : undefined;
  const dpCabang = isObj(dpRaw.cabang) ? dpRaw.cabang : undefined;
  const dpB = isObj(dpRaw.b) ? dpRaw.b : undefined;

  const d: Record<string, any> = { ...dpRaw, ...(dpD || {}), ...(isObj(item.d) ? item.d : {}) };
  const b: Record<string, any> = { ...dpRaw, ...(dpCabang || {}), ...(dpB || {}), ...(isObj(item.b) ? item.b : {}) };

  const src = [d, dpRaw, dpD, item as Record<string, any>];
  const dpMap = pickNum(src, ['MAP', 'Gudang Utama', 'Marketplace', 'GUDANG', 'TOTAL', 'stokMap', 'q']) ?? toNum(item.q);
  const dpLive = pickNum(src, ['LIVE', 'Barang Live', 'Sample Live', 'stokLive']) ?? 0;
  const dpStudio = pickNum(src, ['STUDIO', 'Sample Studio', 'stokStudio']) ?? 0;
  const dpPermak = pickNum(src, ['PERMAK', 'Permak / Cuci', 'Permak']) ?? 0;
  const dpDefect = pickNum(src, ['DEFECT', 'Barang Cacat', 'Diskon Defect', 'Cacat']) ?? 0;
  const dpTotal5 = dpMap + dpLive + dpStudio + dpPermak + dpDefect;

  const chanSrc = [b, d, dpRaw, dpCabang, dpB];
  const whChannel = pickNum(chanSrc, ['WH', 'Warehouse']) ?? 0;
  const qcChannel = pickNum(chanSrc, ['QC', 'Gudang QC']) ?? 0;

  let commercialDp = dpMap + dpLive + dpStudio;
  if (commercialDp === 0 && whChannel !== 0) {
    commercialDp = whChannel;
  }
  const perbaikanDp = dpPermak + dpDefect + qcChannel;
  if (commercialDp === 0 && perbaikanDp === 0 && dpTotal5 !== 0) {
    commercialDp = dpTotal5;
  }

  return {
    commercialDp,
    perbaikanDp,
    totalDp: commercialDp + perbaikanDp,
    dpMap,
    dpLive,
    dpStudio,
    dpPermak,
    dpDefect
  };
}

/**
 * Helper: Mengambil nama produk bersih TANPA embel-embel ukuran di ujungnya
 * agar perbandingan nama produk ("Zilva Top White" vs "Zilva Top White (M)") akurat 100%.
 */
function getBaseProductNameTokens(rawName: string): string[] {
  const cleaned = cleanProductName(rawName || '')
    .replace(/\(\s*(?:size\s*:?\s*)?(?:XXXL|3XL|XXL|2XL|XL|XS|XXS|S|M|L|ALL\s*SIZE|ALLSIZE|ALL|DEFAULT)\s*\)/gi, ' ')
    .replace(/(?:[-–—/]\s*)(?:XXXL|3XL|XXL|2XL|XL|XS|XXS|S|M|L|ALL\s*SIZE|ALLSIZE|ALL|DEFAULT)\s*$/i, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return cleaned;
}

/**
 * Helper pencocokan kata utuh yang KETAT (Strict Whole-Word Token Matching):
 * Setiap kata di `requiredTokens` WAJIB ada sebagai kata utuh di dalam `targetWords`.
 * Mencegah kesalahan 'zilva top white m' mencocokkan 'ruth top white m' hanya karena 3 dari 4 kata cocok!
 */
function matchAllNameTokensStrict(targetWords: string[], requiredTokens: string[]): boolean {
  if (!requiredTokens || requiredTokens.length === 0) return false;
  return requiredTokens.every((reqTok) => targetWords.some((w) => w === reqTok));
}

/**
 * Eksekusi lookup 1 produk secara menyeluruh & teraudit:
 * - Memisahkan Nama Produk vs Size yang diminta (contoh: "Zilva Top White (M)" -> nama "zilva top white", size "M")
 * - Mengambil data live dari `master_produk` (termasuk `dealpos_channels`) DAN `stok_real_fisik` di Supabase
 * - Menghitung DealPOS persis dengan rumus `inventoryModel.ts` TANPA mencampur produk lain atau size lain!
 */
async function searchSingleProductDetail(rawQuery: string, masterProducts: ProductItem[]): Promise<any> {
  const { nameTokens, cleanProductNameQuery, requestedSize } = parseProductQueryAndSize(rawQuery);

  if (nameTokens.length === 0) {
    return {
      query: rawQuery,
      requested_size: requestedSize || 'SEMUA_SIZE',
      total_ditemukan: 0,
      total_stok_fisik: 0,
      lokasi_rak: 'Stok Kosong / Belum Ada di Rak Gudang',
      stok_dealpos: 0,
      products: [],
      pesan: `Nama produk "${rawQuery}" kosong.`
    };
  }

  // Kumpulkan kandidat produk yang 100% cocok seluruh kata nama produknya (Strict Whole-Word Match)
  const candidateBySku = new Map<string, { item: any; nameTier: 1 | 2 }>();

  const registerCandidate = (rawItem: any) => {
    if (!rawItem) return;
    const sku = String(rawItem.k || rawItem.sku || '').trim().toUpperCase();
    if (!sku || sku.startsWith('#')) return;

    const rawP = String(rawItem.p || rawItem.nama_produk || rawItem.product_name || rawItem.n || rawItem.nama || '').trim();
    const cleanP = cleanProductName(rawP) || rawP;
    if (!cleanP) return;

    const baseWords = getBaseProductNameTokens(cleanP);
    const fullWords = `${cleanP} ${rawItem.warna || ''} ${sku}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    // Cek apakah cocok secara exact SKU
    const isExactSku = nameTokens.length === 1 && nameTokens[0].toUpperCase() === sku;

    // Cek apakah SELURUH kata di nameTokens ada di nama produk
    const allTokensInBase = matchAllNameTokensStrict(baseWords, nameTokens);
    const allTokensInFull = !allTokensInBase && matchAllNameTokensStrict(fullWords, nameTokens);

    if (!isExactSku && !allTokensInBase && !allTokensInFull) {
      return; // DILARANG mencocokkan produk yang kehilangan salah satu kata nama/warna!
    }

    // Tier 1: Jumlah kata nama dasar produk sama persis dengan nameTokens (contoh: "zilva top white" === "zilva top white")
    // Tier 2: Mengandung seluruh kata nameTokens tetapi ada kata tambahan (contoh: "zilva knit top white")
    const isExactWordSet =
      isExactSku ||
      (allTokensInBase && baseWords.length === nameTokens.length) ||
      baseWords.join(' ') === cleanProductNameQuery;

    const tier: 1 | 2 = isExactWordSet ? 1 : 2;
    const existing = candidateBySku.get(sku);
    if (!existing) {
      candidateBySku.set(sku, { item: { ...rawItem, k: sku, sku, p: cleanP, nama_produk: cleanP }, nameTier: tier });
    } else {
      // Gabungkan data jika rawItem baru memiliki dealpos_channels yang lebih lengkap
      if (tier < existing.nameTier) existing.nameTier = tier;
      if (rawItem.dealpos_channels && Object.keys(rawItem.dealpos_channels).length > 0) {
        existing.item.dealpos_channels = rawItem.dealpos_channels;
      }
      if (rawItem.q !== undefined && Number(rawItem.q) !== 0 && !existing.item.q) {
        existing.item.q = rawItem.q;
      }
      if (rawItem.size && (!existing.item.size || existing.item.size === '-')) {
        existing.item.size = rawItem.size;
        existing.item.s = rawItem.size;
      }
    }
  };

  // 1. Scan dari Master Catalog di memori / IndexedDB
  for (let i = 0; i < masterProducts.length; i++) {
    registerCandidate(masterProducts[i]);
  }

  // 2. Query LANGSUNG ke Supabase `master_produk` & `stok_real_fisik` berdasarkan kata kunci utama
  // agar selalu mendapatkan `dealpos_channels` paling baru & produk yang baru diinput!
  const primaryToken = nameTokens[0];
  if (primaryToken && primaryToken.length >= 2) {
    try {
      const [liveMasterRows, liveStokRows] = await Promise.all([
        supabaseFetch<any[]>(
          'master_produk',
          'GET',
          null,
          `select=sku,nama_produk,kategori,size,price,dealpos_channels&or=(nama_produk.ilike.*${encodeURIComponent(primaryToken)}*,sku.ilike.*${encodeURIComponent(primaryToken)}*)&limit=100`
        ).catch(() => []),
        supabaseFetch<any[]>(
          'stok_real_fisik',
          'GET',
          null,
          `or=(nama_produk.ilike.*${encodeURIComponent(primaryToken)}*,sku.ilike.*${encodeURIComponent(primaryToken)}*)&limit=100`
        ).catch(() => [])
      ]);

      if (Array.isArray(liveMasterRows)) {
        liveMasterRows.forEach((r) => registerCandidate(r));
      }
      if (Array.isArray(liveStokRows)) {
        liveStokRows.forEach((r) => registerCandidate(r));
      }
    } catch (e) {
      console.warn('[WMS AI] Gagal live query master_produk/stok_real_fisik:', e);
    }
  }

  // Jika ada kecocokan Tier 1 (nama produk persis, misal "Zilva Top White"), buang kandidat Tier 2
  const allCandidates = Array.from(candidateBySku.values());
  const hasTier1 = allCandidates.some((c) => c.nameTier === 1);
  const nameMatchedCandidates = (hasTier1 ? allCandidates.filter((c) => c.nameTier === 1) : allCandidates).map(
    (c) => c.item
  );

  if (nameMatchedCandidates.length === 0) {
    return {
      query: rawQuery,
      requested_size: requestedSize || 'SEMUA_SIZE',
      total_ditemukan: 0,
      total_stok_fisik: 0,
      lokasi_rak: 'Stok Kosong / Belum Ada di Rak Gudang',
      stok_dealpos: 0,
      products: [],
      pesan: `Produk "${rawQuery}" tidak ditemukan di katalog maupun rak gudang.`
    };
  }

  // 3. Pastikan seluruh SKU kandidat memiliki data `master_produk` (terutama `dealpos_channels`) & `stok_real_fisik` LIVE dari Supabase!
  const candidateSkus = Array.from(
    new Set(nameMatchedCandidates.map((c) => String(c.k || c.sku || '').trim().toUpperCase()).filter(Boolean))
  );

  const liveMasterBySku = new Map<string, any>();
  let stockRacks: any[] = [];

  try {
    const encodedSkus = `(${candidateSkus.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(',')})`;
    const [freshMasterRows, freshStockRows] = await Promise.all([
      candidateSkus.length > 0
        ? supabaseFetch<any[]>(
            'master_produk',
            'GET',
            null,
            `select=sku,nama_produk,kategori,size,price,dealpos_channels&sku=in.${encodeURIComponent(encodedSkus)}`
          ).catch(() => [])
        : Promise.resolve([]),
      fetchStockForSkus(candidateSkus).catch(() => [])
    ]);

    if (Array.isArray(freshMasterRows)) {
      freshMasterRows.forEach((m) => {
        const s = String(m.sku || '').trim().toUpperCase();
        if (s) liveMasterBySku.set(s, m);
      });
    }
    if (Array.isArray(freshStockRows)) {
      stockRacks = freshStockRows;
    }
  } catch (e) {
    console.warn('[WMS AI] Gagal menyegarkan master_produk/stok_real_fisik per SKU:', e);
  }

  // 4. Kelompokkan lokasi fisik rak per SKU (menggabungkan lokasi yang sama & memisahkan Komersial vs Perbaikan)
  const rackMap = new Map<
    string,
    {
      locations: string[];
      totalFisik: number;
      commercialFisik: number;
      perbaikanFisik: number;
    }
  >();

  stockRacks.forEach((sr) => {
    const s = String(sr.sku || '').trim().toUpperCase();
    if (!s) return;
    if (!rackMap.has(s)) {
      rackMap.set(s, { locations: [], totalFisik: 0, commercialFisik: 0, perbaikanFisik: 0 });
    }
    const entry = rackMap.get(s)!;
    const qty = Number(sr.sisa_stok) || 0;
    const lok = String(sr.lokasi || '').trim().toUpperCase();
    const area = String(sr.area || '').trim().toUpperCase();
    if (qty !== 0 && lok && lok !== '-') {
      entry.locations.push(`${lok} (${qty} pcs)`);
      entry.totalFisik += qty;
      const isPerbaikan =
        area.includes('PERBAIKAN') ||
        area.includes('CUCI') ||
        area.includes('PERMAK') ||
        area.includes('DEFECT') ||
        lok.startsWith('CC') ||
        lok.startsWith('PMK') ||
        lok.startsWith('DF');
      if (isPerbaikan) {
        entry.perbaikanFisik += qty;
      } else {
        entry.commercialFisik += qty;
      }
    }
  });

  // 5. Bangun rincian lengkap untuk setiap varian SKU dari produk tersebut
  const allVariants = nameMatchedCandidates.map((item) => {
    const sku = String(item.k || item.sku || '').trim().toUpperCase();
    const freshMaster = liveMasterBySku.get(sku);
    const mergedItem = freshMaster ? { ...item, ...freshMaster, dealpos_channels: freshMaster.dealpos_channels || item.dealpos_channels } : item;

    const rawP = String(mergedItem.nama_produk || mergedItem.p || mergedItem.n || '').trim();
    const cleanP = cleanProductName(rawP) || rawP || sku;

    const rawSize = String(mergedItem.size || mergedItem.s || '');
    const resolvedSize = resolveProductDisplaySize(sku, rawSize, rawSize) || rawSize || '-';
    const normalizedVariantSize = normalizeSizeTokenForMatch(resolvedSize);

    const dpInfo = computeOfficialDealposBreakdown(mergedItem);
    const rackInfo = rackMap.get(sku) || { locations: [], totalFisik: 0, commercialFisik: 0, perbaikanFisik: 0 };

    return {
      nama_produk: cleanP,
      sku,
      size: resolvedSize,
      normalized_size: normalizedVariantSize,
      kategori: mergedItem.kategori || mergedItem.category || mergedItem.c || '-',
      stok_fisik_rak: rackInfo.totalFisik,
      stok_fisik_komersial: rackInfo.commercialFisik,
      stok_fisik_perbaikan: rackInfo.perbaikanFisik,
      lokasi_rak: rackInfo.locations.length > 0 ? rackInfo.locations.join(', ') : 'Kosong di Rak',
      stok_dealpos: dpInfo.commercialDp,
      stok_dealpos_perbaikan: dpInfo.perbaikanDp,
      stok_dealpos_total: dpInfo.totalDp,
      rincian_dealpos: {
        MAP: dpInfo.dpMap,
        LIVE: dpInfo.dpLive,
        STUDIO: dpInfo.dpStudio,
        PERMAK: dpInfo.dpPermak,
        DEFECT: dpInfo.dpDefect
      }
    };
  });

  // 6. FILTER KETAT BERDASARKAN UKURAN (SIZE) JIKA PENGGUNA MENYEBUTKAN SIZE SPESIFIK!
  // Contoh: Jika user meminta "Zilva Top White (M)" atau "Posy Dress Blue S",
  // HANYA hitung stok fisik & DealPOS milik ukuran tersebut! DILARANG menjumlahkan ukuran S + M + L + XL!
  let targetVariants = allVariants;
  let sizeNote = '';

  if (requestedSize) {
    const exactSizeMatches = allVariants.filter((v) => v.normalized_size === requestedSize);
    if (exactSizeMatches.length > 0) {
      targetVariants = exactSizeMatches;
    } else {
      // Jika ukuran yang diminta (misal M) tidak ada di katalog untuk produk ini (misal produk ini hanya ALL SIZE atau hanya ada S & L)
      targetVariants = [];
      const availableSizesInfo = allVariants
        .map((v) => `Size ${v.size}: Fisik ${v.stok_fisik_rak} pcs (${v.lokasi_rak}), DealPOS ${v.stok_dealpos}`)
        .join(' | ');
      sizeNote = `Varian ukuran "${requestedSize}" tidak terdaftar untuk produk ini. Varian ukuran yang terdaftar di sistem: ${availableSizesInfo || 'Tidak ada'}.`;
    }
  }

  let grandTotalFisik = 0;
  let grandTotalDealpos = 0;
  let grandTotalDealposAll = 0;
  const targetLocationsList: string[] = [];

  targetVariants.forEach((v) => {
    grandTotalFisik += v.stok_fisik_rak;
    grandTotalDealpos += v.stok_dealpos;
    grandTotalDealposAll += v.stok_dealpos_total;
    if (v.stok_fisik_rak !== 0 && v.lokasi_rak && v.lokasi_rak !== 'Kosong di Rak') {
      if (requestedSize || targetVariants.length === 1) {
        targetLocationsList.push(v.lokasi_rak);
      } else {
        targetLocationsList.push(`Size ${v.size}: ${v.lokasi_rak}`);
      }
    }
  });

  const cleanLocationsStr =
    targetLocationsList.length > 0
      ? Array.from(new Set(targetLocationsList)).join(', ')
      : 'Kosong di Rak';

  return {
    query: rawQuery,
    requested_size: requestedSize || 'SEMUA_SIZE',
    total_ditemukan: targetVariants.length,
    total_stok_fisik: grandTotalFisik,
    lokasi_rak: cleanLocationsStr,
    stok_dealpos: grandTotalDealpos,
    stok_dealpos_total_termasuk_perbaikan: grandTotalDealposAll,
    catatan_size: sizeNote || undefined,
    products: targetVariants,
    varian_size_lain_produk_ini:
      requestedSize && allVariants.length > targetVariants.length
        ? allVariants
            .filter((v) => v.normalized_size !== requestedSize)
            .map((v) => ({
              size: v.size,
              sku: v.sku,
              stok_fisik_rak: v.stok_fisik_rak,
              lokasi_rak: v.lokasi_rak,
              stok_dealpos: v.stok_dealpos
            }))
        : undefined
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
        size_diminta: itemRes.requested_size,
        status: itemRes.total_ditemukan > 0
          ? (itemRes.total_stok_fisik > 0 ? 'ADA_DI_RAK' : 'KOSONG_DI_RAK')
          : 'VARIAN_TIDAK_TERDAFTAR',
        total_stok_fisik: itemRes.total_stok_fisik || 0,
        lokasi_rak: itemRes.lokasi_rak || 'Kosong di Rak',
        stok_dealpos: itemRes.stok_dealpos ?? 0,
        stok_dealpos_termasuk_perbaikan: itemRes.stok_dealpos_total_termasuk_perbaikan ?? 0,
        catatan_size: itemRes.catatan_size || undefined,
        sku_terkait: itemRes.products?.map((p: any) => p.sku).filter(Boolean).join(', ') || '-',
        rincian_varian:
          itemRes.products
            ?.map(
              (p: any) =>
                `Size ${p.size}: Fisik ${p.stok_fisik_rak} pcs (${p.lokasi_rak}) | DealPOS: ${p.stok_dealpos}${
                  p.stok_dealpos_perbaikan ? ` (+Perbaikan: ${p.stok_dealpos_perbaikan})` : ''
                }`
            )
            .join(' ; ') || itemRes.catatan_size || '-'
      });
    });

    return {
      is_batch: true,
      total_permintaan: batchResults.length,
      pesan_ringkas: `Pemeriksaan batch ${batchResults.length} produk selesai diproses secara akurat per varian/size dari tabel master_produk & stok_real_fisik live.`,
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
const normalizeLookupCode = (code?: string): string => (code || '').trim().toUpperCase().replace(/\s+/g, '');

function findTrelloCandidatesForCode(rawCode: string): {
  requestedCode: string;
  hasExactCodeMatch: boolean;
  needsSimilarCodeConfirmation: boolean;
  exactCandidate: TrelloCandidatePreview | null;
  candidates: TrelloCandidatePreview[];
} {
  const code = normalizeLookupCode(rawCode);
  return {
    requestedCode: code,
    hasExactCodeMatch: false,
    needsSimilarCodeConfirmation: false,
    exactCandidate: null,
    candidates: []
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
      const qty = Number(r.qty ?? (r as any).total_pcs ?? (r as any).total_qty ?? 0);
      if (!sjMap.has(sjKey)) {
        sjMap.set(sjKey, {
          tanggal_penerimaan: r.tanggal_penerimaan,
          no_surat_jalan: r.no_surat_jalan,
          kategori: r.kategori || 'Lokal CMT',
          kode_produksi: r.kode_produksi,
          nama_produk: r.nama_produk || '-',
          up_vendor: r.keterangan || '-',
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
      const prodName = (it.nama_produk || '').toLowerCase();
      const targetStr = `${it.kode_produksi || ''} ${it.no_surat_jalan || ''} ${prodName} ${it.warna || ''} ${it.keterangan || ''} ${it.operator || ''}`.toLowerCase();
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
      codeGroupsMap.set(groupKey, {
        kode_produksi: kode,
        nama_produk: it.nama_produk || '-',
        up_vendor: it.keterangan || '-',
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
    const displayName = it.nama_produk || kode;
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
    let catatan = String(prod.catatan || '').trim();
    let fotoUrl = '';
    let statusTrelloLabel = '-';
    let upVendorLabel = '-';

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
      nama_produk_trello: statusTrelloLabel,
      up_vendor_trello: upVendorLabel,
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

/**
 * Helper internal: resolve 1 product query ke Master Produk Katalog (anti-anomali nama & size)
 */
async function resolveMasterProductItem(queryOrSku: string, requestedSize?: string): Promise<{
  sku: string;
  nama_produk: string;
  size: string;
  matched: boolean;
}> {
  const raw = String(queryOrSku || '').trim();
  if (!raw) return { sku: '', nama_produk: '', size: requestedSize || '-', matched: false };

  const catalog = await getResolvedMasterProducts();
  const upperRaw = raw.toUpperCase();
  const bySku = lookupProductBySku(upperRaw);
  if (bySku && bySku.found && bySku.nama_produk && bySku.nama_produk !== upperRaw) {
    return {
      sku: upperRaw,
      nama_produk: bySku.nama_produk,
      size: resolveProductDisplaySize(upperRaw, bySku.size, requestedSize) || bySku.size || '-',
      matched: true
    };
  }

  const tokens = raw.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  let best: ProductItem | null = null;
  let bestScore = -1;

  for (const p of catalog) {
    const sku = String(p.k || '').trim().toUpperCase();
    const name = cleanProductName(String(p.n || p.p || '')).trim();
    const size = resolveProductDisplaySize(sku, p.s || '');
    const haystack = `${sku} ${name} ${size}`.toLowerCase();

    let score = 0;
    for (const tk of tokens) {
      if (haystack.includes(tk)) score += 10;
    }
    if (requestedSize && size.toUpperCase() === requestedSize.trim().toUpperCase()) {
      score += 15;
    }
    if (score > bestScore && score > 0) {
      bestScore = score;
      best = p;
    }
  }

  if (best) {
    const sku = String(best.k || '').trim().toUpperCase();
    const masterInfo = lookupProductBySku(sku);
    return {
      sku,
      nama_produk: masterInfo?.nama_produk || cleanProductName(String(best.n || best.p || raw)),
      size: resolveProductDisplaySize(sku, masterInfo?.size || best.s || requestedSize),
      matched: true
    };
  }

  return { sku: '', nama_produk: raw, size: requestedSize || '-', matched: false };
}

/**
 * 7. Eksekusi tool: audit_stock_and_mutations
 */
async function executeAuditStockAndMutations(args: {
  mode?: string;
  keyword?: string;
  area?: string;
  rack_filter?: string;
  limit?: number;
}): Promise<any> {
  const mode = String(args.mode || 'mutations').toLowerCase().trim();
  const kw = String(args.keyword || '').trim();
  const limit = Math.max(5, Math.min(50, Number(args.limit) || 25));

  if (mode === 'rack_capacity') {
    const [config, allStock, catalog] = await Promise.all([
      fetchRackCapacityConfig(),
      fetchSupabaseStokFisikDirect(),
      getResolvedMasterProducts()
    ]);
    const catalogMap = buildEnrichedCatalogMap(catalog);
    const slots = computeAllRackSlots(config, allStock, [], catalogMap);
    const areaFilter = String(args.area || '').trim().toLowerCase();
    const rackFilter = String(args.rack_filter || 'all').trim().toLowerCase();

    let filtered = slots;
    if (areaFilter && areaFilter !== 'all' && areaFilter !== 'semua') {
      filtered = filtered.filter((s) => s.area.toLowerCase().includes(areaFilter));
    }
    if (kw) {
      const kwLower = kw.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.lokasi.toLowerCase().includes(kwLower) ||
          s.items.some((it) => it.sku.toLowerCase().includes(kwLower) || it.nama_produk.toLowerCase().includes(kwLower))
      );
    }

    const emptyCount = filtered.filter((s) => s.status === 'EMPTY').length;
    const overloadCount = filtered.filter((s) => s.status === 'OVERLOAD').length;
    const fullCount = filtered.filter((s) => s.status === 'FULL').length;
    const availableCount = filtered.filter((s) => s.status === 'SAFE' || s.status === 'EMPTY').length;

    if (rackFilter === 'empty') filtered = filtered.filter((s) => s.status === 'EMPTY');
    else if (rackFilter === 'available') filtered = filtered.filter((s) => s.status === 'EMPTY' || s.status === 'SAFE');
    else if (rackFilter === 'overload') filtered = filtered.filter((s) => s.status === 'OVERLOAD' || s.status === 'FULL');

    return {
      mode: 'rack_capacity',
      ringkasan: {
        total_slot_dievaluasi: slots.length,
        rak_kosong: emptyCount,
        rak_tersedia_aman: availableCount,
        rak_penuh: fullCount,
        rak_overload: overloadCount
      },
      daftar_rak: filtered.slice(0, limit).map((s) => ({
        lokasi: s.lokasi,
        area: s.area,
        kategori: s.category,
        stok_saat_ini: s.currentQty,
        kapasitas_maks: s.maxCapacity,
        keterisian_persen: s.fillPercent,
        sisa_kapasitas: s.availableSpace,
        status: s.status,
        sample_produk: s.items.slice(0, 4).map((i) => `${i.sku} - ${i.nama_produk} (${i.size}): ${i.qty} pcs`)
      }))
    };
  }

  if (mode === 'discrepancy') {
    const [allStock, catalog] = await Promise.all([fetchSupabaseStokFisikDirect(), getResolvedMasterProducts()]);
    const kwLower = kw.toLowerCase();
    const fisikMap = new Map<string, { qty: number; locations: string[] }>();
    for (const st of allStock) {
      const sku = String(st.sku || '').toUpperCase().trim();
      const q = Number(st.sisa_stok) || 0;
      if (!sku) continue;
      const cur = fisikMap.get(sku) || { qty: 0, locations: [] };
      cur.qty += q;
      if (q !== 0 && st.lokasi) cur.locations.push(`${st.lokasi} (${q})`);
      fisikMap.set(sku, cur);
    }

    const anomalies: any[] = [];
    for (const p of catalog) {
      const sku = String(p.k || '').toUpperCase().trim();
      if (!sku) continue;
      const master = lookupProductBySku(sku);
      const nama = master?.nama_produk || cleanProductName(String(p.n || p.p || sku));
      const size = resolveProductDisplaySize(sku, master?.size || p.s || '');
      if (kwLower && !`${sku} ${nama}`.toLowerCase().includes(kwLower)) continue;

      const dealpos = Number(p.q ?? (p as any).qty_dealpos ?? 0) || 0;
      const f = fisikMap.get(sku) || { qty: 0, locations: [] };
      const diff = f.qty - dealpos;
      if (diff !== 0 || f.qty < 0) {
        anomalies.push({
          sku,
          nama_produk: nama,
          size,
          stok_fisik: f.qty,
          stok_dealpos: dealpos,
          selisih_fisik_minus_dealpos: diff,
          lokasi_rak: f.locations.join(', ') || '-'
        });
      }
    }

    anomalies.sort((a, b) => Math.abs(b.selisih_fisik_minus_dealpos) - Math.abs(a.selisih_fisik_minus_dealpos));
    return {
      mode: 'discrepancy',
      total_sku_selisih: anomalies.length,
      daftar_selisih: anomalies.slice(0, limit)
    };
  }

  // Default: mutations (log_produk)
  const catalog = await getResolvedMasterProducts();
  const kwLower = kw.toLowerCase();
  const matchingSkus = kw
    ? catalog
        .filter((p) => {
          const sku = String(p.k || '').toLowerCase();
          const nm = String(p.n || p.p || '').toLowerCase();
          return sku.includes(kwLower) || nm.includes(kwLower);
        })
        .slice(0, 30)
        .map((p) => String(p.k || '').toUpperCase())
    : [];

  const logs = await fetchLogsBySearch(kw, Math.max(limit * 2, 50), matchingSkus);
  return {
    mode: 'mutations',
    kata_kunci: kw || '(Terbaru)',
    total_ditemukan: logs.length,
    mutasi: logs.slice(0, limit).map((l) => {
      const m = lookupProductBySku(l.sku);
      return {
        waktu: l.created_at,
        tipe: l.type,
        invoice: l.invoice,
        sku: l.sku,
        nama_produk: m?.nama_produk || l.nama_produk,
        size: resolveProductDisplaySize(l.sku, m?.size || l.size),
        area: l.area,
        lokasi: l.lokasi,
        qty: l.qty,
        operator: l.operator,
        keterangan: l.keterangan || '-'
      };
    })
  };
}

/**
 * 8. Eksekusi tool: check_picking_and_channel_orders
 */
async function executeCheckPickingAndChannelOrders(args: {
  source?: string;
  keyword?: string;
  only_incomplete?: boolean;
}): Promise<any> {
  const src = String(args.source || 'all').toLowerCase();
  const kw = String(args.keyword || '').trim().toLowerCase();
  const onlyIncomplete = Boolean(args.only_incomplete);

  const result: any = {};

  if (src === 'all' || src === 'picking') {
    const rows = await supabaseFetch<PickingListItem[]>(
      'picking_list',
      'GET',
      null,
      'select=*&order=created_at.desc&limit=250'
    ).catch(() => []);

    let filtered = rows || [];
    if (kw) {
      filtered = filtered.filter((r) =>
        `${r.invoice_picking || ''} ${r.no_sj || ''} ${r.tujuan || ''} ${r.sku || ''} ${r.nama_produk || ''} ${r.picker_name || ''}`
          .toLowerCase()
          .includes(kw)
      );
    }
    if (onlyIncomplete) {
      filtered = filtered.filter((r) => r.status !== 'SELESAI' || Number(r.qty_picked) !== Number(r.qty_req));
    }

    const totalReq = filtered.reduce<number>((s, r) => s + (Number(r.qty_req) || 0), 0);
    const totalPicked = filtered.reduce<number>((s, r) => s + (Number(r.qty_picked) || 0), 0);

    result.picking = {
      total_baris: filtered.length,
      total_qty_req: totalReq,
      total_qty_picked: totalPicked,
      selisih_qty: totalPicked - totalReq,
      daftar_tugas: filtered.slice(0, 30).map((r) => {
        const m = lookupProductBySku(r.sku);
        const selisih = (Number(r.qty_picked) || 0) - (Number(r.qty_req) || 0);
        return {
          invoice_picking: r.invoice_picking || '-',
          no_sj: r.no_sj,
          tanggal: r.tanggal,
          tujuan: r.tujuan,
          sku: r.sku,
          nama_produk: m?.nama_produk || r.nama_produk,
          size: resolveProductDisplaySize(r.sku, m?.size || r.size),
          lokasi_target: r.lokasi,
          qty_req: r.qty_req,
          qty_picked: r.qty_picked,
          selisih,
          status: r.status,
          picker: r.picker_name || '-'
        };
      })
    };
  }

  if (src === 'all' || src === 'ig_live') {
    const orders = await fetchIgLiveOrdersFromSupabase().catch(() => []);
    let filtered = orders || [];
    if (kw) {
      filtered = filtered.filter((o) =>
        `${o.no_pesanan} ${o.username_ig} ${o.nama_pembeli} ${o.no_resi} ${o.session_live || ''}`
          .toLowerCase()
          .includes(kw)
      );
    }
    if (onlyIncomplete) {
      filtered = filtered.filter((o) => !['DIKIRIM', 'SELESAI', 'BATAL'].includes(String(o.status || '').toUpperCase()));
    }
    result.ig_live = {
      total_order: filtered.length,
      daftar_order: filtered.slice(0, 25).map((o) => ({
        no_pesanan: o.no_pesanan,
        tanggal: o.tanggal,
        username_ig: o.username_ig,
        nama_pembeli: o.nama_pembeli,
        status: o.status,
        ekspedisi: o.ekspedisi,
        no_resi: o.no_resi || 'Belum ada resi',
        total_item: (Array.isArray(o.items) ? o.items : []).reduce((s: number, it: any) => s + (Number(it.qty) || 0), 0)
      }))
    };
  }

  return result;
}

/**
 * 9. Eksekusi tool: check_qc_repair_and_loans
 */
async function executeCheckQcRepairAndLoans(args: {
  scope?: string;
  keyword?: string;
  only_active?: boolean;
}): Promise<any> {
  const scope = String(args.scope || 'all').toLowerCase();
  const kw = String(args.keyword || '').trim().toLowerCase();
  const onlyActive = Boolean(args.only_active);
  const out: any = {};

  if (scope === 'all' || scope === 'qc') {
    const qcList = await fetchQcReportsFromSupabase({ limit: 150 }).catch(() => []);
    let filtered = qcList || [];
    if (kw) {
      filtered = filtered.filter((q) =>
        `${q.report_no} ${q.sku} ${q.nama_produk} ${q.kode_produksi || ''} ${q.pic_qc || ''} ${q.sumber_batch || ''}`
          .toLowerCase()
          .includes(kw)
      );
    }
    out.qc = {
      total_laporan: filtered.length,
      total_diperiksa_pcs: filtered.reduce<number>((s, q: any) => s + (Number(q.qty_diperiksa) || 0), 0),
      total_oke_pcs: filtered.reduce<number>((s, q: any) => s + (Number(q.qty_oke) || 0), 0),
      total_reject_pcs: filtered.reduce<number>((s, q: any) => s + (Number(q.qty_reject) || 0), 0),
      laporan_terbaru: filtered.slice(0, 20).map((q) => ({
        report_no: q.report_no,
        tanggal: q.tanggal,
        kode_atau_sku: q.kode_produksi || q.sku,
        nama_produk: q.nama_produk,
        size: q.size || '-',
        status: q.status,
        qty_diperiksa: q.qty_diperiksa,
        qty_oke: q.qty_oke,
        qty_reject: q.qty_reject,
        pic_qc: q.pic_qc,
        target_penanganan: q.target_penanganan || '-'
      }))
    };
  }

  if (scope === 'all' || scope === 'perbaikan') {
    const tickets = await fetchPerbaikanTicketsFromSupabase({ limit: 150 }).catch(() => []);
    let filtered = tickets || [];
    if (kw) {
      filtered = filtered.filter((t) =>
        `${t.ticket_no} ${t.sku} ${t.nama_produk} ${t.tahap} ${t.lokasi_sekarang} ${t.kategori_rusak}`
          .toLowerCase()
          .includes(kw)
      );
    }
    if (onlyActive) {
      filtered = filtered.filter((t) => !String(t.tahap || '').startsWith('SELESAI_'));
    }
    out.perbaikan = {
      total_tiket_aktif: filtered.length,
      total_pcs: filtered.reduce<number>((s, t: any) => s + (Number(t.qty) || 0), 0),
      daftar_tiket: filtered.slice(0, 25).map((t) => {
        const m = lookupProductBySku(t.sku);
        return {
          ticket_no: t.ticket_no,
          tanggal: t.tanggal,
          sku: t.sku,
          nama_produk: m?.nama_produk || t.nama_produk,
          size: resolveProductDisplaySize(t.sku, m?.size || t.size),
          qty: t.qty,
          tahap: t.tahap,
          status_pengerjaan: t.status_pengerjaan,
          lokasi_sekarang: t.lokasi_sekarang,
          kategori_rusak: t.kategori_rusak,
          petugas: t.petugas_reparasi || t.qc_pic || '-'
        };
      })
    };
  }

  if (scope === 'all' || scope === 'peminjaman') {
    const loans = await fetchPeminjamanFromSupabase(150).catch(() => []);
    let filtered = loans || [];
    if (kw) {
      filtered = filtered.filter((l) =>
        `${l.noPeminjaman || l.no_sps || ''} ${l.namaPeminjam || l.nama_peminjam || ''} ${l.keperluan || ''}`
          .toLowerCase()
          .includes(kw)
      );
    }
    if (onlyActive) {
      filtered = filtered.filter((l) => {
        const st = String(l.status || '').toUpperCase();
        return st.includes('DIPINJAM') || st.includes('SEBAGIAN');
      });
    }
    out.peminjaman = {
      total_dokumen: filtered.length,
      daftar_peminjaman: filtered.slice(0, 25).map((l) => ({
        no_sps: l.noPeminjaman || l.no_sps || l.id,
        peminjam: l.namaPeminjam || l.nama_peminjam || '-',
        keperluan: l.keperluan || '-',
        tgl_pinjam: l.tglPinjam || l.tanggal_pinjam || '-',
        estimasi_kembali: l.estimasiKembali || '-',
        status: l.status || 'Dipinjam',
        jumlah_sku: Array.isArray(l.items) ? l.items.length : 1
      }))
    };
  }

  return out;
}

/**
 * 10. Eksekusi tool: check_retur_and_jne_rekap
 */
async function executeCheckReturAndJneRekap(args: {
  scope?: string;
  keyword?: string;
  status?: string;
}): Promise<any> {
  const scope = String(args.scope || 'all').toLowerCase();
  const kw = String(args.keyword || '').trim().toLowerCase();
  const statusFilter = String(args.status || '').trim().toLowerCase();
  const out: any = {};

  if (scope === 'all' || scope === 'retur') {
    const returs = await fetchReturOrders().catch(() => []);
    let filtered = returs || [];
    if (kw) {
      filtered = filtered.filter((r) =>
        `${r.no_retur} ${r.no_pesanan_asal} ${r.nama_customer} ${r.outlet_order} ${r.no_resi} ${r.no_resi_customer}`
          .toLowerCase()
          .includes(kw)
      );
    }
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((r) => String(r.status || '').toLowerCase() === statusFilter);
    }
    out.retur_barang = {
      total_tiket: filtered.length,
      baru_diterima: filtered.filter((r) => r.status === 'diterima').length,
      diproses: filtered.filter((r) => r.status === 'diproses').length,
      selesai_dikirim: filtered.filter((r) => r.status === 'dikirim').length,
      daftar_tiket: filtered.slice(0, 25).map((r) => ({
        no_retur: r.no_retur,
        no_pesanan_asal: r.no_pesanan_asal,
        outlet_order: r.outlet_order,
        nama_customer: r.nama_customer,
        kategori_alasan: r.kategori_alasan,
        alasan_retur: r.alasan_retur,
        status: r.status,
        no_sj_gudang_retur: r.no_sj_gudang_retur || '-',
        no_invoice_return: r.no_invoice_return || '-',
        no_resi_pengganti: r.no_resi || 'Belum ada resi',
        produk_pengganti: (r.produk_pengganti || []).map((it) => `${it.sku} (${it.size}) x${it.qty}`)
      }))
    };
  }

  if (scope === 'all' || scope === 'jne') {
    const gasRes = await fetchJneRecordsFromGas().catch(() => ({
      success: false,
      records: getLocalCachedJneRecords(),
      total: 0
    }));
    let records = gasRes.records || [];
    if (kw) {
      records = records.filter((j) =>
        `${j.no_resi} ${j.nama_tujuan} ${j.alamat_tujuan} ${j.layanan} ${j.deskripsi || ''}`
          .toLowerCase()
          .includes(kw)
      );
    }
    const totalTagihan = records.reduce<number>((s, j: any) => s + (Number(j.nominal) || 0), 0);
    out.jne_rekap = {
      sumber_live: gasRes.success,
      total_resi: records.length,
      total_nominal_rp: totalTagihan,
      daftar_resi: records.slice(0, 25).map((j) => ({
        no_resi: j.no_resi,
        tanggal: j.tanggal,
        layanan: j.layanan,
        nominal_rp: j.nominal,
        nama_tujuan: j.nama_tujuan,
        deskripsi: j.deskripsi || '-'
      }))
    };
  }

  return out;
}

/**
 * 11. Eksekusi tool: query_hr_operations (Role-Gated: Superadmin & HR only)
 */
async function executeQueryHrOperations(
  args: {
    scope?: string;
    start_date?: string;
    end_date?: string;
    keyword?: string;
    only_pending_approvals?: boolean;
  },
  session?: UserSession | null
): Promise<any> {
  const aiRole = resolveAiUserRole(session);
  if (aiRole !== 'superadmin' && aiRole !== 'hr') {
    return {
      error: 'Akses ditolak: Data HR (Roster, Presensi, Lembur, Cuti, Karyawan) hanya dapat diakses oleh akun HR atau Superadmin.'
    };
  }

  const today = formatLocalYmd(new Date());
  const startDate = args.start_date || today;
  const endDate = args.end_date || startDate;
  const scope = String(args.scope || 'summary').toLowerCase();
  const kw = String(args.keyword || '').trim().toLowerCase();
  const onlyPending = Boolean(args.only_pending_approvals);

  const out: any = { periode: { start_date: startDate, end_date: endDate } };

  if (scope === 'summary' || scope === 'karyawan') {
    const karyawans = await fetchKaryawanDirectory().catch(() => []);
    const activeOnly = karyawans.filter((k) => k.status_aktif !== false);
    const filtered = kw
      ? activeOnly.filter((k) => `${k.nik} ${k.nama} ${k.divisi} ${k.jabatan || ''}`.toLowerCase().includes(kw))
      : activeOnly;
    out.karyawan = {
      total_aktif: activeOnly.length,
      daftar: filtered.slice(0, 30).map((k) => ({
        nik: k.nik,
        nama: k.nama,
        divisi: k.divisi,
        jabatan: k.jabatan || '-',
        role: k.role
      }))
    };
  }

  if (scope === 'summary' || scope === 'roster') {
    const roster = await fetchRosterShiftList(undefined, startDate, endDate).catch(() => []);
    const filtered = kw
      ? roster.filter((r) => `${r.nik} ${r.nama || ''} ${r.shift}`.toLowerCase().includes(kw))
      : roster;
    out.roster_shift = {
      total_entri: filtered.length,
      jadwal: filtered.slice(0, 35).map((r) => ({
        tanggal: r.tanggal,
        nik: r.nik,
        nama: r.nama || r.nik,
        shift: r.shift,
        jam_masuk: r.jam_masuk || '-',
        jam_pulang: r.jam_pulang || '-'
      }))
    };
  }

  if (scope === 'summary' || scope === 'presensi') {
    const presensi = await fetchPresensiRange(startDate, endDate).catch(() => []);
    const filtered = kw
      ? presensi.filter((p) => `${p.nik} ${p.nama || ''} ${p.status}`.toLowerCase().includes(kw))
      : presensi;
    out.presensi = {
      total_record: filtered.length,
      hadir_atau_log: filtered.slice(0, 35).map((p) => ({
        tanggal: p.tanggal,
        nik: p.nik,
        nama: p.nama || p.nik,
        shift: p.shift,
        status: p.status,
        jam_masuk: p.jam_masuk || '-',
        jam_pulang: p.jam_pulang || '-'
      }))
    };
  }

  if (scope === 'summary' || scope === 'approvals') {
    const [lembur, cuti, izin] = await Promise.all([
      fetchLemburRecords().catch(() => []),
      fetchCutiRecords().catch(() => []),
      fetchIzinPulangAwalList().catch(() => [])
    ]);

    const filterFn = (list: any[]) =>
      list.filter((r) => {
        if (onlyPending && r.status !== 'Diajukan') return false;
        if (kw && !`${r.nik} ${r.nama} ${r.divisi || ''} ${r.alasan || r.deskripsi || ''}`.toLowerCase().includes(kw)) {
          return false;
        }
        return true;
      });

    const fLembur = filterFn(lembur);
    const fCuti = filterFn(cuti);
    const fIzin = filterFn(izin);

    out.approvals = {
      pending_lembur: lembur.filter((r) => r.status === 'Diajukan').length,
      pending_cuti: cuti.filter((r) => r.status === 'Diajukan').length,
      pending_izin_pulang_awal: izin.filter((r) => r.status === 'Diajukan').length,
      daftar_lembur: fLembur.slice(0, 15).map((r) => ({
        id: r.id,
        tanggal: r.tanggal,
        nama: r.nama,
        durasi_jam: r.durasi_jam,
        status: r.status,
        deskripsi: r.deskripsi
      })),
      daftar_cuti: fCuti.slice(0, 15).map((r) => ({
        id: r.id,
        nama: r.nama,
        jenis: r.jenis,
        tgl_mulai: r.tgl_mulai,
        tgl_selesai: r.tgl_selesai,
        jumlah_hari: r.jumlah_hari,
        status: r.status
      })),
      daftar_izin_pulang_awal: fIzin.slice(0, 15).map((r) => ({
        id: r.id,
        tanggal: r.tanggal,
        nama: r.nama,
        jam_pulang_rencana: r.jam_pulang_rencana,
        status: r.status,
        alasan: r.alasan
      }))
    };
  }

  return out;
}

/**
 * 12. Eksekusi tool: prepare_manual_shipment_draft (Human-in-the-loop)
 */
async function executePrepareManualShipmentDraft(args: {
  nama_pengirim?: string;
  delivery_method?: string;
  drop_store_target?: string;
  jasa_kirim?: string;
  nama_tujuan: string;
  no_telp_tujuan?: string;
  email_customer?: string;
  alamat_tujuan?: string;
  notes_paket?: string;
  items: Array<{ product_query?: string; sku?: string; size?: string; qty?: number; fulfillment?: string }>;
}): Promise<any> {
  const resolvedItems: any[] = [];
  for (const it of args.items || []) {
    const master = await resolveMasterProductItem(it.sku || it.product_query || '', it.size);
    resolvedItems.push({
      sku: master.sku || it.sku || '',
      nama_produk: master.nama_produk || it.product_query || 'Produk',
      size: master.size || it.size || '-',
      qty: Math.max(1, Number(it.qty) || 1),
      fulfillment: it.fulfillment || 'Gudang',
      matched_master: master.matched
    });
  }

  const draft = {
    nama_pengirim: args.nama_pengirim || '',
    delivery_method: args.delivery_method === 'drop_store' ? 'drop_store' : 'expedition',
    drop_store_target: args.drop_store_target || '',
    jasa_kirim: args.jasa_kirim || '',
    nama_tujuan: args.nama_tujuan || '',
    no_telp_tujuan: args.no_telp_tujuan || '',
    email_customer: args.email_customer || '',
    alamat_tujuan: args.alamat_tujuan || '',
    notes_paket: args.notes_paket || '',
    items: resolvedItems,
    updatedAt: Date.now()
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('wms_manual_shipment_ai_draft', JSON.stringify(draft));
      (window as any).__wms_pending_pesanan_target = { manualSubTab: 'form', draft };
    } catch {}
  }

  return {
    status: 'draft_ready',
    pesan: 'Draft Form Manual Shipment telah disiapkan. Silakan klik tombol "Buka Form Manual Shipment" untuk memeriksa & menekan Submit.',
    draft
  };
}

/**
 * 13. Eksekusi tool: prepare_retur_barang_draft (Human-in-the-loop)
 */
async function executePrepareReturBarangDraft(args: {
  no_pesanan_asal?: string;
  outlet_order?: string;
  kategori_alasan?: string;
  alasan_retur?: string;
  opsi_pengiriman?: string;
  nama_customer: string;
  no_hp?: string;
  alamat_lengkap?: string;
  no_resi_customer?: string;
  penanggung_biaya?: string;
  produk_pesanan?: Array<{ product_query?: string; sku?: string; size?: string; qty?: number }>;
  produk_pengganti?: Array<{ product_query?: string; sku?: string; size?: string; qty?: number; fulfillment?: string }>;
}): Promise<any> {
  const origResolved: any[] = [];
  for (const it of args.produk_pesanan || []) {
    const master = await resolveMasterProductItem(it.sku || it.product_query || '', it.size);
    origResolved.push({
      sku: master.sku || it.sku || '',
      nama_produk: master.nama_produk || it.product_query || 'Produk Retur',
      size: master.size || it.size || '-',
      qty: Math.max(1, Number(it.qty) || 1)
    });
  }

  const repResolved: any[] = [];
  for (const it of args.produk_pengganti || []) {
    const master = await resolveMasterProductItem(it.sku || it.product_query || '', it.size);
    repResolved.push({
      sku: master.sku || it.sku || '',
      nama_produk: master.nama_produk || it.product_query || 'Produk Pengganti',
      size: master.size || it.size || '-',
      qty: Math.max(1, Number(it.qty) || 1),
      fulfillment: it.fulfillment || 'Marketplace'
    });
  }

  const draft = {
    no_pesanan_asal: args.no_pesanan_asal || '',
    outlet_order: args.outlet_order || 'Shopee',
    kategori_alasan: args.kategori_alasan || 'tukar_size_model',
    alasan_retur: args.alasan_retur || '',
    opsi_pengiriman: args.opsi_pengiriman || 'JNE Regular',
    nama_customer: args.nama_customer || '',
    no_hp: args.no_hp || '',
    alamat_lengkap: args.alamat_lengkap || '',
    no_resi_customer: args.no_resi_customer || '',
    penanggung_biaya: args.penanggung_biaya === 'toko_free' ? 'toko_free' : 'customer',
    produk_pesanan: origResolved,
    produk_pengganti: repResolved,
    updatedAt: Date.now()
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('wms_retur_barang_ai_draft', JSON.stringify(draft));
      (window as any).__wms_pending_retur_target = draft;
    } catch {}
  }

  return {
    status: 'draft_ready',
    pesan: 'Draft Form Retur Barang telah disiapkan. Silakan klik tombol "Buka Form Retur Barang" di Pusat Resolusi untuk memeriksa & Submit.',
    draft
  };
}

/**
 * 14. Eksekusi tool: query_agenda_and_projects
 */
async function executeQueryAgendaAndProjects(args: {
  scope?: string;
  agenda_type?: string;
  start_date?: string;
  end_date?: string;
  category?: string;
  status?: string;
  priority?: string;
  keyword?: string;
}): Promise<any> {
  const scope = String(args.scope || 'all').toLowerCase();
  const agendaTypeFilter = String(args.agenda_type || 'all').toLowerCase();
  const kw = String(args.keyword || '').trim().toLowerCase();
  const cat = String(args.category || '').trim().toLowerCase();
  const today = formatLocalYmd(new Date());
  const nextThreeDays = formatLocalYmd(new Date(Date.now() + 3 * 86400000));

  const out: any = { tanggal_hari_ini: today };

  if (scope === 'all' || scope === 'agenda') {
    const events = await getAgendaEvents().catch(() => []);
    let filtered = events || [];
    if (agendaTypeFilter === 'distribusi') {
      filtered = filtered.filter((ev) => ev.agenda_type === 'distribusi' || ev.category === 'distribusi');
    } else if (agendaTypeFilter === 'event') {
      filtered = filtered.filter((ev) => ev.agenda_type !== 'distribusi' && ev.category !== 'distribusi');
    }
    if (args.start_date) {
      filtered = filtered.filter((ev) => (ev.end_date || ev.start_date) >= args.start_date!);
    }
    if (args.end_date) {
      filtered = filtered.filter((ev) => ev.start_date <= args.end_date!);
    }
    if (cat) {
      filtered = filtered.filter((ev) => String(ev.category || '').toLowerCase().includes(cat));
    }
    if (kw) {
      filtered = filtered.filter((ev) =>
        `${ev.title} ${ev.description || ''} ${ev.location || ''} ${ev.pic || ''} ${ev.category} ${ev.distribution_info?.store_target || ''} ${ev.distribution_info?.expedition || ''}`
          .toLowerCase()
          .includes(kw)
      );
    }
    filtered.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
    out.agenda = {
      total_agenda: filtered.length,
      daftar: filtered.slice(0, 30).map((ev) => ({
        id: ev.id,
        jenis_kalender: ev.agenda_type === 'distribusi' || ev.category === 'distribusi' ? 'distribusi' : 'event',
        judul: ev.title,
        tanggal_mulai: ev.start_date,
        tanggal_selesai: ev.end_date || ev.start_date,
        jam: ev.is_all_day ? 'Seharian' : `${ev.start_time || '-'} - ${ev.end_time || '-'}`,
        kategori: ev.category,
        lokasi: ev.location || '-',
        pic: ev.pic || '-',
        distribusi: ev.distribution_info || null,
        project_id: ev.project_id || null,
        deskripsi: ev.description || '-'
      }))
    };
  }

  if (scope === 'all' || scope === 'tasks') {
    const tasks = await getDelegatedTasks().catch(() => []);
    let filtered = tasks || [];
    if (args.status) {
      filtered = filtered.filter((t) => String(t.status || '').toLowerCase() === String(args.status).toLowerCase());
    }
    if (args.priority) {
      filtered = filtered.filter((t) => String(t.priority || '').toLowerCase() === String(args.priority).toLowerCase());
    }
    if (kw) {
      filtered = filtered.filter((t) =>
        `${t.title} ${t.description || ''} ${t.assigned_to_name} ${t.assigned_to_id} ${t.assigned_by} ${t.work_report || ''}`
          .toLowerCase()
          .includes(kw)
      );
    }
    out.tasks = {
      total_tasks: filtered.length,
      daftar: filtered.slice(0, 30).map((t) => ({
        id: t.id,
        judul: t.title,
        status: t.status,
        prioritas: t.priority,
        tenggat: t.due_date || '-',
        penerima_id: t.assigned_to_id,
        penerima_nama: t.assigned_to_name,
        pemberi_tugas: t.assigned_by,
        laporan_hasil_kerja: t.work_report || '-',
        terlambat: Boolean(t.due_date && t.due_date < today && t.status !== 'completed')
      }))
    };
  }

  if (scope === 'all' || scope === 'projects') {
    const projects = await getProjects().catch(() => []);
    let filtered = projects || [];
    if (args.status) {
      filtered = filtered.filter((p) => String(p.status || '').toLowerCase() === String(args.status).toLowerCase());
    }
    if (args.priority) {
      filtered = filtered.filter((p) => String(p.priority || '').toLowerCase() === String(args.priority).toLowerCase());
    }
    if (cat) {
      filtered = filtered.filter((p) => String(p.category || '').toLowerCase().includes(cat));
    }
    if (kw) {
      filtered = filtered.filter((p) =>
        `${p.title} ${p.description || ''} ${p.pic || ''} ${p.category}`.toLowerCase().includes(kw)
      );
    }

    const enriched = filtered.map((p) => {
      const tasks = Array.isArray(p.tasks) ? p.tasks : [];
      const doneTasks = tasks.filter((t) => t.completed).length;
      const computedProgress = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : Number(p.progress) || 0;
      const isOverdue = Boolean(p.deadline && p.deadline < today && p.status !== 'completed');
      const isNearDeadline = Boolean(p.deadline && p.deadline >= today && p.deadline <= nextThreeDays && p.status !== 'completed');
      return {
        id: p.id,
        judul: p.title,
        status: p.status,
        prioritas: p.priority,
        kategori: p.category,
        pic: p.pic || '-',
        start_date: p.start_date || '-',
        deadline: p.deadline || '-',
        progress_persen: computedProgress,
        task_selesai: doneTasks,
        total_task: tasks.length,
        is_overdue: isOverdue,
        is_near_deadline: isNearDeadline,
        tasks_tertunda: tasks.filter((t) => !t.completed).slice(0, 6).map((t) => t.title)
      };
    });

    out.projects = {
      total_project: enriched.length,
      overdue_count: enriched.filter((p) => p.is_overdue).length,
      near_deadline_count: enriched.filter((p) => p.is_near_deadline).length,
      daftar: enriched.slice(0, 25)
    };
  }

  if (scope === 'all' || scope === 'notes') {
    const notes = await getNotes().catch(() => []);
    let filtered = notes || [];
    if (kw) {
      filtered = filtered.filter((n) =>
        `${n.title || ''} ${n.content || ''} ${(n.checklist || []).map((c) => c.text).join(' ')}`
          .toLowerCase()
          .includes(kw)
      );
    }
    out.notes = {
      total_catatan: filtered.length,
      daftar: filtered.slice(0, 20).map((n) => {
        const chk = Array.isArray(n.checklist) ? n.checklist : [];
        return {
          id: n.id,
          judul: n.title || '(Tanpa Judul)',
          isi: (n.content || '').slice(0, 180),
          checklist_total: chk.length,
          checklist_selesai: chk.filter((c) => c.is_completed).length,
          checklist_belum: chk.filter((c) => !c.is_completed).map((c) => c.text),
          pinned: Boolean(n.is_pinned),
          created_by: n.created_by || '-'
        };
      })
    };
  }

  return out;
}

/**
 * 15. Eksekusi tool: prepare_agenda_or_project_draft (Human-in-the-loop)
 */
async function executePrepareAgendaOrProjectDraft(args: {
  draft_type: 'agenda' | 'agenda_distribusi' | 'task' | 'project' | 'note';
  agenda_type?: 'event' | 'distribusi';
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  deadline?: string;
  due_date?: string;
  is_all_day?: boolean;
  start_time?: string;
  end_time?: string;
  category?: string;
  location?: string;
  pic?: string;
  store_target?: string;
  expedition?: string;
  total_koli?: number;
  total_qty?: number;
  dist_status?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  priority?: string;
  status?: string;
  project_id?: string;
  tasks?: string[];
  checklist?: string[];
  color?: string;
}): Promise<any> {
  const today = formatLocalYmd(new Date());
  const draftType = args.draft_type || 'agenda';
  const isDistribusi = draftType === 'agenda_distribusi' || args.agenda_type === 'distribusi';

  const payload = {
    draft_type: draftType,
    payload: {
      title: args.title || '',
      description: args.description || '',
      content: args.description || '',
      agenda_type: isDistribusi ? 'distribusi' : 'event',
      start_date: args.start_date || today,
      end_date: args.end_date || args.start_date || today,
      deadline: args.deadline || args.end_date || formatLocalYmd(new Date(Date.now() + 7 * 86400000)),
      due_date: args.due_date || args.deadline || formatLocalYmd(new Date(Date.now() + 2 * 86400000)),
      is_all_day: isDistribusi ? (args.is_all_day ?? true) : Boolean(args.is_all_day),
      start_time: args.start_time || '09:00',
      end_time: args.end_time || '10:00',
      category: args.category || (draftType === 'project' ? 'Operasional' : isDistribusi ? 'supplier' : 'operasional'),
      location: args.location || args.store_target || '',
      pic: args.pic || '',
      store_target: args.store_target || args.location || '',
      expedition: args.expedition || '',
      total_koli: args.total_koli,
      total_qty: args.total_qty,
      dist_status: args.dist_status || 'terjadwal',
      assigned_to_id: args.assigned_to_id || '',
      assigned_to_name: args.assigned_to_name || args.pic || '',
      priority: args.priority || 'medium',
      status: args.status || 'in_progress',
      project_id: args.project_id || undefined,
      tasks: Array.isArray(args.tasks) ? args.tasks : [],
      checklist: Array.isArray(args.checklist) ? args.checklist : [],
      color: args.color || (isDistribusi ? 'emerald' : undefined)
    },
    updatedAt: Date.now()
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('wms_agenda_ai_draft', JSON.stringify(payload));
      (window as any).__wms_pending_agenda_target = payload;
    } catch {}
  }

  const label =
    draftType === 'task'
      ? 'Tugas Delegasi'
      : isDistribusi
      ? 'Agenda Distribusi'
      : draftType === 'project'
      ? 'Project'
      : draftType === 'note'
      ? 'Sticky Note'
      : 'Agenda Kalender';
  return {
    status: 'draft_ready',
    draft_type: draftType,
    pesan: `Draft ${label} "${args.title}" telah disiapkan. Silakan klik tombol "Buka Draft di Agenda & Project" untuk mereview dan menyimpannya.`,
    draft: payload
  };
}

// =============================================================================
// MAIN CHAT COMPLETION CONTROLLER
// =============================================================================

const BASE_SYSTEM_INSTRUCTION = `Anda adalah Asisten AI Cerdas resmi untuk sistem WMS Inventory (Chocochips Warehouse).
Tugas utama Anda adalah membantu staf gudang, produksi, store, HR, operasional, dan manajemen dengan cepat, akurat, dan ramah dalam Bahasa Indonesia.

PANDUAN & ATURAN UTAMA:
1. PENCARIAN BERBASIS NAMA PRODUK & INTEGRITAS MASTER PRODUK:
   - Saat mencari stok rak gudang, pengguna biasa menyebut NAMA BAJU / PAKAIAN (contoh: "Ruth Top Cherry", "Sailor Top", "Taylor Pants"), BUKAN Kode SKU barcode.
   - DILARANG KERAS menyuruh, meminta, atau merekomendasikan pengguna untuk memberikan Kode SKU!
   - Selalu gunakan Nama Produk dan Size resmi hasil lookup Master Produk (tidak boleh menebak nama/size di luar master data).

2. BATCH & SINGLE LOOKUP STOK:
   - Jika pengguna memberikan daftar banyak produk sekaligus, gunakan SATU KALI panggilan tool "lookup_product_stock" dengan parameter "queries" berupa array seluruh nama produk.
   - Sajikan dalam format TABEL MARKDOWN LENGKAP dan DILARANG menyingkat lokasi rak dengan kata "dll." — tampilkan seluruh rak dan jumlah pcs-nya secara lengkap.

3. AUDIT STOK, KAPASITAS RAK, PICKING, QC, PERBAIKAN, RETUR & JNE:
   - Gunakan "audit_stock_and_mutations" untuk mengecek mutasi log_produk (IN/OUT/SO/ADJ), selisih stok fisik vs DealPOS, serta rak kosong/tersedia/overload.
   - Gunakan "check_picking_and_channel_orders" untuk memantau tugas picking (invoice_picking, no_sj, under/over-pick) dan order IG Live.
   - Gunakan "check_qc_repair_and_loans" untuk inspeksi QC, antrean Perbaikan (Cuci/Permak/Defect), dan Peminjaman SPS.
   - Gunakan "check_retur_and_jne_rekap" untuk tiket Retur Barang (RTR-...) di Pusat Resolusi dan Rekap Tagihan Ongkir JNE.
   - Gunakan "query_hr_operations" (khusus HR & Superadmin) untuk Roster Shift, Presensi, dan pengajuan Lembur/Cuti/Izin Pulang Awal.

4. INTEGRASI KALENDER AGENDA, PROJECT ROADMAP & STICKY NOTES:
   - Gunakan "query_agenda_and_projects" untuk memeriksa jadwal Agenda, deadline & progress Project, sub-tasks tertunda, serta Sticky Notes/Checklists.
   - Gunakan "prepare_agenda_or_project_draft" ketika pengguna meminta dibuatkan Agenda baru, Project baru dengan checklist tasks, atau Sticky Note — data hanya disiapkan sebagai draft modal agar pengguna mereview & klik Simpan sendiri.

5. HUMAN-IN-THE-LOOP DRAFT ASSISTANT (PRODUKSI, MANUAL SHIPMENT, RETUR BARANG, AGENDA & PROJECT):
   - AI TIDAK BOLEH langsung memodifikasi stok fisik rak/log_produk atau langsung menyimpan pesanan/retur/agenda permanen tanpa konfirmasi.
   - Gunakan "prepare_production_receipt_form", "prepare_manual_shipment_draft", "prepare_retur_barang_draft", dan "prepare_agenda_or_project_draft" untuk mengisi Draft Form agar pengguna mengecek & menekan Submit/Simpan sendiri.

6. EKSPOR LAPORAN EXCEL & PDF + EKSTRAKSI MULTIMODAL (FOTO, PDF, EXCEL/CSV):
   - Anda dapat membaca foto dokumen, dokumen PDF invoice/SJ/tagihan, serta spreadsheet Excel/CSV hingga 250 baris beserta ringkasan totalnya.
   - Ketika pengguna meminta laporan Excel (.xlsx) atau PDF (.pdf), panggil "generate_exportable_report" setelah data terverifikasi.

7. TONE OF VOICE: Ramah, ringkas, komunikatif, proaktif bertanya jika data form belum lengkap, dan solutif.`;

function buildFullSystemInstruction(session?: UserSession | null): string {
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

  const aiRole = resolveAiUserRole(session);
  const userName = session?.name || session?.username || 'Pengguna';
  const userContext = `\n\nKONTEKS PENGGUNA AKTIF:
- Nama / Username: ${userName} (${session?.username || '-'})
- Role AI: ${aiRole}${session?.store_name ? ` (Store: ${session.store_name})` : ''}`;

  const dateContext = `\n\nKONTEKS WAKTU REAL-TIME SAAT INI (WAJIB DIGUNAKAN UNTUK FILTER TANGGAL):
- Hari Ini: ${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()} (Format YYYY-MM-DD: "${todayStr}")
- Kemarin: ${dayNames[yesterday.getDay()]}, ${yesterday.getDate()} ${monthNames[yesterday.getMonth()]} ${yesterday.getFullYear()} (Format YYYY-MM-DD: "${yesterdayStr}")
- 2 Hari Lalu (Kemarin Lusa): "${twoDaysAgoStr}"
- 7 Hari Terakhir (Minggu Ini): start_date="${sevenDaysAgoStr}" s/d end_date="${todayStr}"
- Bulan Ini: Bulan ke-${now.getMonth() + 1} (${monthNames[now.getMonth()]}) Tahun ${now.getFullYear()}`;

  return BASE_SYSTEM_INSTRUCTION + userContext + dateContext;
}

/**
 * Mengirim pesan ke server /api/ai (@google/genai) dengan multi-turn Tool Execution loop
 * Mendukung Multimodal Vision (Foto & PDF) dan Ekstraksi Spreadsheet (Excel/CSV)
 */
export async function sendChatMessageToGemini(
  conversationHistory: AiChatMessage[],
  userPrompt: string,
  onToolCallStart?: (toolName: string) => void,
  attachments?: AiAttachment[],
  session?: UserSession | null
): Promise<{
  text: string;
  executedTools: string[];
  trelloCandidates?: TrelloCandidatePreview[];
  reportTable?: AiChatMessage['reportTable'];
  modelUsed?: string;
}> {
  const aiRole = resolveAiUserRole(session);
  const roleTools = getToolsForRole(aiRole, session);
  const contents: any[] = [];

  const recentHistory = conversationHistory.slice(-8);
  recentHistory.forEach((msg) => {
    if (msg.role === 'user') {
      const histParts: any[] = [];
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach((att) => {
          if ((att.type === 'image' || att.type === 'pdf') && att.base64Data) {
            histParts.push({
              inlineData: {
                mimeType: att.mimeType || (att.type === 'pdf' ? 'application/pdf' : 'image/jpeg'),
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

  const userParts: any[] = [];

  // 1. Sisipkan Gambar & PDF (Multimodal inlineData base64) jika ada
  if (attachments && attachments.length > 0) {
    attachments.forEach((att) => {
      if ((att.type === 'image' || att.type === 'pdf') && att.base64Data) {
        userParts.push({
          inlineData: {
            mimeType: att.mimeType || (att.type === 'pdf' ? 'application/pdf' : 'image/jpeg'),
            data: att.base64Data
          }
        });
      }
    });
  }

  // 2. Sisipkan Teks Prompt beserta Ekstraksi Tabel Excel / CSV / File Teks
  let fullPromptText = (userPrompt || '').trim();
  if (attachments && attachments.length > 0) {
    const docAttachments = attachments.filter((a) => a.type === 'excel' || a.type === 'csv' || a.type === 'file');
    if (docAttachments.length > 0) {
      const docSummaries = docAttachments
        .map((doc) => `\n\n--- LAMPIRAN FILE: "${doc.name}" (${doc.rowCount || 0} baris data) ---\n${doc.extractedText || ''}`)
        .join('\n');
      fullPromptText = `${fullPromptText}\n${docSummaries}`.trim();
    }
  }

  userParts.push({
    text:
      fullPromptText ||
      (attachments && attachments.length > 0
        ? 'Tolong periksa, ekstrak data dari lampiran di atas, dan analisis dengan database WMS.'
        : 'Halo')
  });

  contents.push({ role: 'user', parts: userParts });

  const executedTools: string[] = [];
  let generatedReportTable: AiChatMessage['reportTable'] | undefined = undefined;
  let modelUsed = 'gemini-4-hydrogen';
  const collectedCandidatesMap = new Map<string, TrelloCandidatePreview>();
  const handleCollectTrelloPreviews = (previews: TrelloCandidatePreview[]) => {
    previews.forEach((p) => {
      const key = `${p.matchedCode}__${p.upCode || ''}`;
      if (!collectedCandidatesMap.has(key)) {
        collectedCandidatesMap.set(key, p);
      }
    });
  };
  const activeSystemInstruction = buildFullSystemInstruction(session);

  const postToServerAi = async (payload: any): Promise<any> => {
    const attemptModels = [payload.requestedModel || 'gemini-4-hydrogen', 'gemini-2.5-flash'];
    let lastErr: any = null;
    for (let attempt = 0; attempt < attemptModels.length; attempt++) {
      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, requestedModel: attemptModels[attempt] })
        });
        const data = await response.json();
        if (!response.ok) {
          const errMsg = String(data?.error || `HTTP ${response.status}`);
          if (
            attempt < attemptModels.length - 1 &&
            (response.status === 503 ||
              response.status === 429 ||
              response.status === 502 ||
              response.status === 504 ||
              errMsg.toLowerCase().includes('unavailable') ||
              errMsg.toLowerCase().includes('high demand'))
          ) {
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          throw new Error(errMsg);
        }
        if (data?.model) modelUsed = data.model;
        return data;
      } catch (err: any) {
        lastErr = err;
        if (attempt < attemptModels.length - 1) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
      }
    }
    throw lastErr || new Error('Gagal menghubungi server AI.');
  };

  let loopCount = 0;
  const MAX_LOOPS = 8;

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    const geminiResponse = await postToServerAi({
      contents,
      tools: roleTools,
      systemInstruction: activeSystemInstruction,
      requestedModel: 'gemini-4-hydrogen'
    });

    const candidate = geminiResponse.candidates?.[0];
    if (!candidate || !candidate.content) {
      throw new Error('Tidak ada respon yang diterima dari server AI.');
    }

    const modelContent = candidate.content;
    const parts = modelContent.parts || [];
    const functionCallParts = parts.filter((p: any) => p.functionCall);

    if (functionCallParts.length === 0) {
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n');
      const finalCandidates = Array.from(collectedCandidatesMap.values());
      return {
        text: textParts || geminiResponse.text || 'Selesai memproses.',
        executedTools,
        trelloCandidates: finalCandidates.length > 0 ? finalCandidates : undefined,
        reportTable: generatedReportTable,
        modelUsed
      };
    }

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
        } else if (fnName === 'audit_stock_and_mutations') {
          toolResult = await executeAuditStockAndMutations(fnArgs);
        } else if (fnName === 'check_picking_and_channel_orders') {
          toolResult = await executeCheckPickingAndChannelOrders(fnArgs);
        } else if (fnName === 'check_qc_repair_and_loans') {
          toolResult = await executeCheckQcRepairAndLoans(fnArgs);
        } else if (fnName === 'check_retur_and_jne_rekap') {
          toolResult = await executeCheckReturAndJneRekap(fnArgs);
        } else if (fnName === 'query_hr_operations') {
          toolResult = await executeQueryHrOperations(fnArgs, session);
        } else if (fnName === 'prepare_manual_shipment_draft') {
          toolResult = await executePrepareManualShipmentDraft(fnArgs);
        } else if (fnName === 'prepare_retur_barang_draft') {
          toolResult = await executePrepareReturBarangDraft(fnArgs);
        } else if (fnName === 'query_agenda_and_projects') {
          toolResult = await executeQueryAgendaAndProjects(fnArgs);
        } else if (fnName === 'prepare_agenda_or_project_draft') {
          toolResult = await executePrepareAgendaOrProjectDraft(fnArgs);
        } else if (fnName === 'generate_exportable_report') {
          const rawHeaders = Array.isArray(fnArgs.headers) ? fnArgs.headers.map((h: any) => String(h ?? '')) : [];
          const rawRows = Array.isArray(fnArgs.rows)
            ? fnArgs.rows.map((r: any) => (Array.isArray(r) ? r.map((c: any) => String(c ?? '')) : []))
            : [];
          const prefFmt = String(fnArgs.preferred_format || 'both').toLowerCase();
          generatedReportTable = {
            title: String(fnArgs.title || 'Laporan Data WMS AI').trim(),
            subtitle: fnArgs.subtitle ? String(fnArgs.subtitle).trim() : undefined,
            filename: fnArgs.filename ? String(fnArgs.filename).trim() : undefined,
            headers: rawHeaders,
            rows: rawRows,
            summary: fnArgs.summary ? String(fnArgs.summary).trim() : undefined,
            preferredFormat: prefFmt === 'excel' ? 'excel' : prefFmt === 'pdf' ? 'pdf' : 'both'
          };
          toolResult = {
            status: 'report_ready',
            pesan: `Dokumen laporan "${generatedReportTable.title}" (${rawRows.length} baris data) telah berhasil disusun dan tombol Download Excel (.xlsx) serta Download PDF (.pdf) kini tampil di layar pengguna.`,
            total_baris: rawRows.length,
            kolom: rawHeaders
          };
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

    contents.push(modelContent);
    contents.push({ role: 'user', parts: functionResponseParts });
  }

  const finalCandidates = Array.from(collectedCandidatesMap.values());
  try {
    contents.push({
      role: 'user',
      parts: [
        {
          text: 'Berdasarkan data database yang sudah diperiksa di atas, tolong langsung tuliskan jawaban akhir dan tabel rincian lengkapnya sekarang tanpa memanggil tool lagi.'
        }
      ]
    });
    const finalRes = await postToServerAi({
      contents,
      systemInstruction: activeSystemInstruction,
      requestedModel: 'gemini-4-hydrogen'
    });
    const candidate = finalRes.candidates?.[0];
    const textParts = candidate?.content?.parts?.filter((p: any) => p.text).map((p: any) => p.text).join('\n');
    if (textParts && textParts.trim()) {
      return {
        text: textParts.trim(),
        executedTools,
        trelloCandidates: finalCandidates.length > 0 ? finalCandidates : undefined,
        reportTable: generatedReportTable,
        modelUsed
      };
    }
  } catch (err) {
    console.warn('[WMS AI] Gagal generate final text summary:', err);
  }

  return {
    text:
      executedTools.length > 0
        ? `Pemeriksaan database selesai untuk ${executedTools.length} langkah data. Seluruh hasil pencarian telah dicocokkan dengan data live WMS.`
        : 'Selesai memproses.',
    executedTools,
    trelloCandidates: finalCandidates.length > 0 ? finalCandidates : undefined,
    reportTable: generatedReportTable,
    modelUsed
  };
}
