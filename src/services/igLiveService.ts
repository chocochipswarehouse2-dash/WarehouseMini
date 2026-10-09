import { ProductItem } from '../types';
import { getSupabaseClient, getAreaFromLokasi, getPickingPriority, generateUUID } from './supabase';

export { generateUUID };

export type IGLiveOrderStatus =
  | 'menunggu_pembayaran'
  | 'siap_diproses'
  | 'diproses'
  | 'dikirim'
  | 'selesai'
  | 'batal';

export interface IGLiveItem {
  sku: string;
  nama_produk: string;
  size: string;
  qty: number;
  harga?: number;
  lokasi?: string;
  area?: string;
  priority?: number;
  picked?: boolean;
}

export interface IGLiveOrder {
  id: string;
  no_pesanan: string;
  tanggal: string; // ISO string or YYYY-MM-DD HH:mm
  session_live?: string;
  username_ig: string;
  nama_pembeli: string;
  no_telp: string;
  alamat_lengkap: string;
  kota_kabupaten?: string;
  provinsi?: string;
  kode_pos?: string;

  // Ekspedisi
  ekspedisi: string;
  layanan?: string;
  no_resi: string;
  biaya_ongkir?: number;
  total_bayar?: number;

  status: IGLiveOrderStatus;
  alasan_batal?: string;
  catatan?: string;

  items: IGLiveItem[];

  // Tracking
  waktu_picking?: string;
  petugas_picking?: string;
  is_picked?: boolean;
  waktu_packing?: string;
  petugas_packing?: string;
  waktu_kirim?: string;

  created_at?: string;
  updated_at?: string;
}

const STORAGE_KEY_ORDERS = 'chocochips_iglive_orders_v1';
const STORAGE_KEY_GAS_URL = 'chocochips_iglive_gas_url_v1';
const STORAGE_KEY_SHEET_NAME = 'chocochips_iglive_sheet_name_v1';

/**
 * Standard SKU Lookup dari Master Product Catalog
 * Menjamin nama produk dan size selalu sesuai standar master data, tanpa anomali.
 */
export function lookupMasterProduct(sku: string, catalog: ProductItem[]): {
  sku: string;
  nama_produk: string;
  size: string;
  lokasi: string;
  area: string;
  priority: number;
  harga?: number;
} {
  const cleanSku = (sku || '').trim().toUpperCase();
  const match = catalog.find(
    (p) => (p.k || '').trim().toUpperCase() === cleanSku
  );

  if (match) {
    const rawLokasi = match.lokasi || '-';
    const area = getAreaFromLokasi(rawLokasi);
    const priority = getPickingPriority(rawLokasi, area);

    return {
      sku: match.k,
      nama_produk: match.n || match.p || cleanSku,
      size: match.s || '-',
      lokasi: rawLokasi,
      area,
      priority,
      harga: match.price || 0,
    };
  }

  // Fallback jika belum di catalog
  const area = getAreaFromLokasi('-');
  return {
    sku: cleanSku,
    nama_produk: cleanSku,
    size: '-',
    lokasi: '-',
    area,
    priority: 4,
    harga: 0,
  };
}

/**
 * Generate Realistic Dummy Orders untuk IG Live
 */
export function getInitialDummyOrders(catalog: ProductItem[]): IGLiveOrder[] {
  // Ambil beberapa SKU dari catalog jika ada, atau gunakan default
  const getCatSku = (idx: number, fallback: { sku: string; nama: string; size: string; loc: string }) => {
    if (catalog && catalog.length > idx && catalog[idx].k) {
      const c = catalog[idx];
      return {
        sku: c.k,
        nama: c.n || c.p || c.k,
        size: c.s || 'M',
        loc: c.lokasi || 'A005',
      };
    }
    return fallback;
  };

  const p1 = getCatSku(0, { sku: 'DRS-VELVET-M', nama: 'Velvet Midnight Evening Dress', size: 'M', loc: 'A012' });
  const p2 = getCatSku(1, { sku: 'TOP-SILK-S', nama: 'Silk Bow Satin Blouse Ivory', size: 'S', loc: 'B024' });
  const p3 = getCatSku(2, { sku: 'PNT-WIDE-L', nama: 'Highwaist Pleated Trousers Cream', size: 'L', loc: 'A045' });
  const p4 = getCatSku(3, { sku: 'BLZ-CHIC-FREE', nama: 'Oversized Tweed Cropped Blazer', size: 'Free', loc: 'C018' });
  const p5 = getCatSku(4, { sku: 'BELT-GOLD-UNI', nama: 'Golden Chain Leather Waist Belt', size: 'All Size', loc: 'BELT002' });
  const p6 = getCatSku(5, { sku: 'KOL-BASIC-M', nama: 'Basic Linen Shirt Soft Pastel', size: 'M', loc: 'R015' });

  const now = new Date();
  const formatTime = (minusHours: number) => {
    const d = new Date(now.getTime() - minusHours * 3600 * 1000);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  };

  return [
    {
      id: 'IGL-20261008-001',
      no_pesanan: 'IGL-20261008-001',
      tanggal: formatTime(2),
      session_live: 'Live Flash Drop Autumn 10.10',
      username_ig: '@clarashintaa_',
      nama_pembeli: 'Clara Shinta',
      no_telp: '081288992211',
      alamat_lengkap: 'Jl. Senopati No. 42B, Kebayoran Baru, Jakarta Selatan',
      kota_kabupaten: 'Jakarta Selatan',
      provinsi: 'DKI Jakarta',
      kode_pos: '12190',
      ekspedisi: 'J&T Express',
      layanan: 'Reguler',
      no_resi: 'JT98217349182',
      biaya_ongkir: 18000,
      total_bayar: 348000,
      status: 'siap_diproses',
      catatan: 'Kirim sebelum jam 3 sore ya kak, terima kasih!',
      items: [
        {
          sku: p1.sku,
          nama_produk: p1.nama,
          size: p1.size,
          qty: 1,
          harga: 250000,
          lokasi: p1.loc,
          area: getAreaFromLokasi(p1.loc),
          priority: getPickingPriority(p1.loc),
          picked: false,
        },
        {
          sku: p5.sku,
          nama_produk: p5.nama,
          size: p5.size,
          qty: 1,
          harga: 80000,
          lokasi: p5.loc,
          area: getAreaFromLokasi(p5.loc),
          priority: getPickingPriority(p5.loc),
          picked: false,
        },
      ],
    },
    {
      id: 'IGL-20261008-002',
      no_pesanan: 'IGL-20261008-002',
      tanggal: formatTime(3),
      session_live: 'Live Flash Drop Autumn 10.10',
      username_ig: '@anissa_boutique',
      nama_pembeli: 'Anissa Rahmawati',
      no_telp: '081399881122',
      alamat_lengkap: 'Cluster Graha Harmoni Blok B2 No. 8, BSD City, Tangerang Selatan',
      kota_kabupaten: 'Tangerang Selatan',
      provinsi: 'Banten',
      kode_pos: '15310',
      ekspedisi: 'SiCepat',
      layanan: 'BEST (Next Day)',
      no_resi: '002938174011',
      biaya_ongkir: 22000,
      total_bayar: 420000,
      status: 'diproses',
      waktu_picking: formatTime(1),
      petugas_picking: 'Ahmad Gudang',
      is_picked: true,
      catatan: 'Tolong packing bubble wrap rapi ya.',
      items: [
        {
          sku: p2.sku,
          nama_produk: p2.nama,
          size: p2.size,
          qty: 2,
          harga: 199000,
          lokasi: p2.loc,
          area: getAreaFromLokasi(p2.loc),
          priority: getPickingPriority(p2.loc),
          picked: true,
        },
      ],
    },
    {
      id: 'IGL-20261008-003',
      no_pesanan: 'IGL-20261008-003',
      tanggal: formatTime(5),
      session_live: 'Live Flash Drop Autumn 10.10',
      username_ig: '@nadia.febriana',
      nama_pembeli: 'Nadia Febriana',
      no_telp: '085712345678',
      alamat_lengkap: 'Jl. Riau No. 115, Bandung Wetan, Kota Bandung',
      kota_kabupaten: 'Kota Bandung',
      provinsi: 'Jawa Barat',
      kode_pos: '40115',
      ekspedisi: 'JNE Express',
      layanan: 'Reguler',
      no_resi: 'JNE8877112200',
      biaya_ongkir: 15000,
      total_bayar: 310000,
      status: 'dikirim',
      waktu_picking: formatTime(4),
      petugas_picking: 'Ahmad Gudang',
      is_picked: true,
      waktu_packing: formatTime(3),
      petugas_packing: 'Siti Packing',
      waktu_kirim: formatTime(2),
      items: [
        {
          sku: p3.sku,
          nama_produk: p3.nama,
          size: p3.size,
          qty: 1,
          harga: 295000,
          lokasi: p3.loc,
          area: getAreaFromLokasi(p3.loc),
          priority: getPickingPriority(p3.loc),
          picked: true,
        },
      ],
    },
    {
      id: 'IGL-20261008-004',
      no_pesanan: 'IGL-20261008-004',
      tanggal: formatTime(6),
      session_live: 'Live Evening Glam Session',
      username_ig: '@jessica_milla',
      nama_pembeli: 'Jessica Aurelia',
      no_telp: '081122334455',
      alamat_lengkap: 'Apartemen Menteng Park Tower Diamond Lt. 18 No. 05, Jakarta Pusat',
      kota_kabupaten: 'Jakarta Pusat',
      provinsi: 'DKI Jakarta',
      kode_pos: '10330',
      ekspedisi: 'SPX Express',
      layanan: 'Standard',
      no_resi: 'SPXID029482718',
      biaya_ongkir: 12000,
      total_bayar: 490000,
      status: 'siap_diproses',
      catatan: 'Titip di resepsionis lobi.',
      items: [
        {
          sku: p4.sku,
          nama_produk: p4.nama,
          size: p4.size,
          qty: 1,
          harga: 478000,
          lokasi: p4.loc,
          area: getAreaFromLokasi(p4.loc),
          priority: getPickingPriority(p4.loc),
          picked: false,
        },
      ],
    },
    {
      id: 'IGL-20261008-005',
      no_pesanan: 'IGL-20261008-005',
      tanggal: formatTime(8),
      session_live: 'Live Evening Glam Session',
      username_ig: '@maya.anggelia',
      nama_pembeli: 'Maya Anggelia',
      no_telp: '081988776655',
      alamat_lengkap: 'Perumahan Bukit Golf Mediterania Blok D8 No. 12, Pantai Indah Kapuk',
      kota_kabupaten: 'Jakarta Utara',
      provinsi: 'DKI Jakarta',
      kode_pos: '14470',
      ekspedisi: 'J&T Express',
      layanan: 'Reguler',
      no_resi: 'JT09812739182',
      biaya_ongkir: 18000,
      total_bayar: 238000,
      status: 'menunggu_pembayaran',
      catatan: 'Menunggu konfirmasi bukti transfer BCA',
      items: [
        {
          sku: p6.sku,
          nama_produk: p6.nama,
          size: p6.size,
          qty: 1,
          harga: 220000,
          lokasi: p6.loc,
          area: getAreaFromLokasi(p6.loc),
          priority: getPickingPriority(p6.loc),
          picked: false,
        },
      ],
    },
    {
      id: 'IGL-20261008-006',
      no_pesanan: 'IGL-20261008-006',
      tanggal: formatTime(12),
      session_live: 'Live Flash Drop Autumn 10.10',
      username_ig: '@fannytan__',
      nama_pembeli: 'Fanny Tanaka',
      no_telp: '082155443322',
      alamat_lengkap: 'Jl. Mayjend Sungkono No. 89, Dukuh Pakis, Surabaya',
      kota_kabupaten: 'Surabaya',
      provinsi: 'Jawa Timur',
      kode_pos: '60225',
      ekspedisi: 'JNE Express',
      layanan: 'YES',
      no_resi: 'JNE9911228833',
      biaya_ongkir: 35000,
      total_bayar: 585000,
      status: 'selesai',
      waktu_picking: formatTime(10),
      is_picked: true,
      waktu_packing: formatTime(9),
      waktu_kirim: formatTime(8),
      items: [
        {
          sku: p1.sku,
          nama_produk: p1.nama,
          size: p1.size,
          qty: 1,
          harga: 250000,
          lokasi: p1.loc,
          area: getAreaFromLokasi(p1.loc),
          priority: getPickingPriority(p1.loc),
          picked: true,
        },
        {
          sku: p3.sku,
          nama_produk: p3.nama,
          size: p3.size,
          qty: 1,
          harga: 295000,
          lokasi: p3.loc,
          area: getAreaFromLokasi(p3.loc),
          priority: getPickingPriority(p3.loc),
          picked: true,
        },
      ],
    },
    {
      id: 'IGL-20261008-007',
      no_pesanan: 'IGL-20261008-007',
      tanggal: formatTime(15),
      session_live: 'Live Flash Drop Autumn 10.10',
      username_ig: '@dewi_sari88',
      nama_pembeli: 'Dewi Sartika',
      no_telp: '081233449988',
      alamat_lengkap: 'Jl. Gatot Subroto No. 200, Semarang Selatan',
      kota_kabupaten: 'Semarang',
      provinsi: 'Jawa Tengah',
      kode_pos: '50241',
      ekspedisi: 'SiCepat',
      layanan: 'Reguler',
      no_resi: '-',
      biaya_ongkir: 16000,
      total_bayar: 215000,
      status: 'batal',
      alasan_batal: 'Permintaan pembeli: Salah pilih size dan transfer dibatalkan',
      items: [
        {
          sku: p2.sku,
          nama_produk: p2.nama,
          size: p2.size,
          qty: 1,
          harga: 199000,
          lokasi: p2.loc,
          area: getAreaFromLokasi(p2.loc),
          priority: getPickingPriority(p2.loc),
          picked: false,
        },
      ],
    },
  ];
}

/**
 * Validasi apakah sebuah string memiliki format UUID yang valid (8-4-4-4-12 hex)
 */
export function isValidUuid(str?: string | null): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Load Orders from Supabase
 */
export async function fetchIgLiveOrdersFromSupabase(): Promise<IGLiveOrder[]> {
  try {
    const { data, error } = await getSupabaseClient()
      .from('ig_live_orders')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    // Parse jsonb items
    return (data || []).map(row => ({
      ...row,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items
    }));
  } catch (err) {
    console.error('[IGLIVE] Gagal fetch dari Supabase:', err);
    return [];
  }
}

/**
 * Upsert Orders to Supabase
 * Memastikan kolom 'id' tidak dikirim jika bukan format UUID valid (mencegah error Postgres 22P02)
 */
export async function upsertIgLiveOrdersToSupabase(orders: IGLiveOrder[]): Promise<boolean> {
  if (!orders || orders.length === 0) return true;
  try {
    const payload = orders.map((o) => {
      const row: any = {
        no_pesanan: o.no_pesanan,
        tanggal: o.tanggal || new Date().toISOString(),
        session_live: o.session_live || 'IG Live Session',
        username_ig: o.username_ig || '@customer',
        nama_pembeli: o.nama_pembeli || 'Customer IG',
        no_telp: o.no_telp || '',
        alamat_lengkap: o.alamat_lengkap || '',
        kota_kabupaten: o.kota_kabupaten || '',
        provinsi: o.provinsi || '',
        kode_pos: o.kode_pos || '',
        ekspedisi: o.ekspedisi || 'JNE',
        layanan: o.layanan || 'REG',
        no_resi: o.no_resi || '-',
        biaya_ongkir: Number(o.biaya_ongkir || 0),
        total_bayar: Number(o.total_bayar || 0),
        status: o.status || 'siap_diproses',
        alasan_batal: o.alasan_batal || '',
        catatan: o.catatan || '',
        items: o.items, // Supabase handles jsonb automatically
        is_picked: !!o.is_picked,
        waktu_picking: o.waktu_picking || null,
        petugas_picking: o.petugas_picking || null,
        waktu_packing: o.waktu_packing || null,
        petugas_packing: o.petugas_packing || null,
        waktu_kirim: o.waktu_kirim || null,
        updated_at: new Date().toISOString(),
      };

      // HANYA sertakan kolom 'id' jika string tersebut adalah UUID valid
      // Jika bernilai custom string seperti "IGL-GS-...", id TIDAK dikirim agar default gen_random_uuid() di Supabase aktif
      if (o.id && isValidUuid(o.id)) {
        row.id = o.id;
      }

      return row;
    });

    const { error } = await getSupabaseClient()
      .from('ig_live_orders')
      .upsert(payload, { onConflict: 'no_pesanan' });
      
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[IGLIVE] Gagal upsert ke Supabase:', err);
    return false;
  }
}

/**
 * Hapus Pesanan dari Supabase
 */
export async function deleteIgLiveOrderFromSupabase(noPesanan: string, id?: string): Promise<boolean> {
  if (!noPesanan) return true;
  try {
    let query = getSupabaseClient().from('ig_live_orders').delete();
    if (id && isValidUuid(id)) {
      query = query.or(`no_pesanan.eq.${noPesanan},id.eq.${id}`);
    } else {
      query = query.eq('no_pesanan', noPesanan);
    }
    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[IGLIVE] Gagal delete dari Supabase:', err);
    return false;
  }
}

/**
 * Sync LocalStorage to Supabase (Run once)
 */
export async function syncLocalIgLiveToSupabase(): Promise<void> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ORDERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('[IGLIVE] Menemukan data lokal, migrasi ke Supabase...');
        const success = await upsertIgLiveOrdersToSupabase(parsed);
        if (success) {
          localStorage.removeItem(STORAGE_KEY_ORDERS);
          console.log('[IGLIVE] Migrasi lokal berhasil diselesaikan.');
        }
      } else {
        localStorage.removeItem(STORAGE_KEY_ORDERS);
      }
    }
  } catch (err) {
    console.warn('[IGLIVE] Error migrasi data lokal:', err);
  }
}

/**
 * Old Save for compatibility (Bypass to Supabase Async - not ideal but keeps old signatures happy if any)
 * Note: Components should be updated to use async upsertIgLiveOrdersToSupabase instead.
 */
export function saveStoredIgLiveOrders(orders: IGLiveOrder[]): void {
  upsertIgLiveOrdersToSupabase(orders);
}

/**
 * Old Get for compatibility (Returns empty, components must be refactored)
 */
export function getStoredIgLiveOrders(catalog: ProductItem[]): IGLiveOrder[] {
  return [];
}

/**
 * Get GAS Web App URL
 */
export function getStoredIgLiveGasUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_GAS_URL) || '';
  } catch {
    return '';
  }
}

/**
 * Save GAS Web App URL
 */
export function saveStoredIgLiveGasUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_GAS_URL, url.trim());
  } catch {
    // noop
  }
}

/**
 * Get Target Sheet Name (Default: 'transaksi')
 */
export function getStoredIgLiveSheetName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_SHEET_NAME) || 'transaksi';
  } catch {
    return 'transaksi';
  }
}

/**
 * Save Target Sheet Name
 */
export function saveStoredIgLiveSheetName(sheetName: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_SHEET_NAME, sheetName.trim() || 'transaksi');
  } catch {
    // noop
  }
}

import Papa from 'papaparse';

/**
 * Tarik / Sinkronisasi Data Pesanan dari URL GAS atau Google Sheets langsung
 * Standar: Target utama sheet/tab adalah "transaksi".
 */
export async function fetchOrdersFromGas(
  gasUrl: string,
  catalog: ProductItem[],
  customSheetName?: string
): Promise<{ success: boolean; orders?: IGLiveOrder[]; message: string }> {
  let url = (gasUrl || '').trim();
  if (!url) {
    return { success: false, message: 'URL GAS / Google Sheets belum diatur' };
  }

  const targetSheet = (customSheetName || getStoredIgLiveSheetName() || 'transaksi').trim();

  // Deteksi apakah ini link Google Sheets
  const isGoogleSheets = url.includes('docs.google.com/spreadsheets') || url.includes('spreadsheets.google.com');

  try {
    let rawList: any[] = [];

    if (isGoogleSheets) {
      // 1. Ekstrak ID dan GID dari link Google Sheets
      const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      
      if (!idMatch) {
        throw new Error('Link Google Sheets tidak valid (ID dokumen tidak ditemukan)');
      }
      
      const sheetId = idMatch[1];
      let csvText = '';
      let fetchSuccess = false;

      // 2. Prioritas 1: Ambil langsung tab sheet "transaksi" via Google Visualization API
      // Ini menjamin sheet yang ditarik adalah sheet transaksi, bukan gid=0 (sheet default/rekap)
      const gvizCandidateUrls = [
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(targetSheet)}`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=transaksi`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Transaksi`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=TRANSAKSI`,
      ];

      for (const testUrl of gvizCandidateUrls) {
        try {
          const resp = await fetch(testUrl);
          if (resp.ok) {
            const txt = await resp.text();
            // Validasi apakah bukan halaman HTML login/error
            if (txt && !txt.includes('<!DOCTYPE html>') && !txt.includes('<html')) {
              csvText = txt;
              fetchSuccess = true;
              break;
            }
          }
        } catch {
          // Lanjut ke kandidat berikutnya
        }
      }

      // 3. Prioritas 2 (Fallback): Gunakan gid dari URL jika user mencantumkan GID eksplisit
      if (!fetchSuccess && gidMatch && gidMatch[1] && gidMatch[1] !== '0') {
        try {
          const gidUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gidMatch[1]}`;
          const resp = await fetch(gidUrl);
          if (resp.ok) {
            const txt = await resp.text();
            if (txt && !txt.includes('<!DOCTYPE html>') && !txt.includes('<html')) {
              csvText = txt;
              fetchSuccess = true;
            }
          }
        } catch {
          // noop
        }
      }

      // 4. Prioritas 3 (Fallback terakhir): Export standard gid=0
      if (!fetchSuccess) {
        const fallbackUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
        const resp = await fetch(fallbackUrl);
        if (!resp.ok) {
          throw new Error(`Gagal mengunduh data dari Google Sheets (HTTP ${resp.status}). Pastikan akses file adalah "Anyone with the link / Siapa saja yang memiliki link" sebagai Viewer.`);
        }
        csvText = await resp.text();
      }
      
      // 5. Parsing CSV menggunakan PapaParse
      const parsed = Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
      });
      
      if (parsed.errors && parsed.errors.length > 0) {
        console.warn('[IGLIVE] PapaParse errors:', parsed.errors);
      }
      
      const rows = (parsed.data || []) as string[][];
      if (rows.length === 0) {
        return { success: false, message: `Sheet "${targetSheet}" kosong atau tidak memiliki baris data.` };
      }
      
      // 6. Deteksi baris header dan pemetaan kolom secara dinamis
      // Format baku sheet "transaksi":
      // NAMA PEMESAN | NO HP | ALAMAT | KODE | PRODUCT NAME | SIZE | SKU | HARGA LIVE | QTY | PRICE | SHIPPING | TOTAL | STATUS | KET | RESI
      let headerRowIndex = -1;
      const colMap: Record<string, number> = {};

      for (let r = 0; r < Math.min(10, rows.length); r++) {
        const rowCells = rows[r].map((c) => String(c || '').toUpperCase().trim());
        const hasNama = rowCells.some((c) => c.includes('NAMA') || c.includes('PEMESAN') || c.includes('CUSTOMER'));
        const hasItem = rowCells.some((c) => c.includes('SKU') || c.includes('PRODUCT') || c.includes('PRODUK') || c.includes('KODE') || c.includes('BARANG'));
        
        if (hasNama || hasItem) {
          headerRowIndex = r;
          rowCells.forEach((c, idx) => {
            if ((c.includes('NAMA') && c.includes('PEMESAN')) || c === 'PEMESAN' || c === 'CUSTOMER' || c === 'BUYER' || c === 'NAMA') {
              if (colMap['nama'] === undefined) colMap['nama'] = idx;
            }
            if (c.includes('HP') || c.includes('TELP') || c.includes('WHATSAPP') || c.includes('PHONE') || c.includes('WA')) {
              if (colMap['hp'] === undefined) colMap['hp'] = idx;
            }
            if (c.includes('ALAMAT') || c.includes('ADDRESS')) {
              if (colMap['alamat'] === undefined) colMap['alamat'] = idx;
            }
            if (c.includes('PRODUCT') || c.includes('NAMA PRODUK') || c.includes('NAMA BARANG') || c.includes('ITEM NAME')) {
              if (colMap['produk'] === undefined) colMap['produk'] = idx;
            }
            if (c === 'SIZE' || c === 'UKURAN') {
              if (colMap['size'] === undefined) colMap['size'] = idx;
            }
            if (c === 'SKU' || c.includes('KODE BARANG') || c.includes('BARCODE') || (c === 'KODE' && colMap['sku'] === undefined)) {
              if (colMap['sku'] === undefined) colMap['sku'] = idx;
            }
            if (c.includes('HARGA LIVE') || (c.includes('HARGA') && !c.includes('TOTAL')) || (c === 'PRICE' && colMap['harga'] === undefined)) {
              if (colMap['harga'] === undefined) colMap['harga'] = idx;
            }
            if (c === 'QTY' || c.includes('JUMLAH') || c.includes('QUANTITY') || c.includes('PCS')) {
              if (colMap['qty'] === undefined) colMap['qty'] = idx;
            }
            if (c.includes('SHIPPING') || c.includes('ONGKIR') || c.includes('BIAYA ONGKIR')) {
              if (colMap['ongkir'] === undefined) colMap['ongkir'] = idx;
            }
            if (c === 'TOTAL' || c.includes('TOTAL BAYAR') || c.includes('GRAND TOTAL')) {
              if (colMap['total'] === undefined) colMap['total'] = idx;
            }
            if (c === 'STATUS' || c.includes('STATUS PESANAN')) {
              if (colMap['status'] === undefined) colMap['status'] = idx;
            }
            if (c === 'KET' || c.includes('CATATAN') || c.includes('KETERANGAN') || c.includes('NOTES')) {
              if (colMap['ket'] === undefined) colMap['ket'] = idx;
            }
            if (c === 'RESI' || c.includes('NO RESI') || c.includes('AWB') || c.includes('TRACKING')) {
              if (colMap['resi'] === undefined) colMap['resi'] = idx;
            }
            if (c.includes('NO PESANAN') || c.includes('ORDER ID') || c.includes('INVOICE') || c.includes('NO TRANSAKSI')) {
              if (colMap['no_pesanan'] === undefined) colMap['no_pesanan'] = idx;
            }
          });
          break;
        }
      }

      const dataStartRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 1;
      
      const cleanNumber = (str: any) => {
        if (!str) return 0;
        return Number(String(str).replace(/[^0-9.-]+/g, '')) || 0;
      };

      for (let i = dataStartRow; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length === 0) continue;
        
        // Ambil data berdasarkan deteksi kolom dinamis, fallback ke indeks standar
        const namaPembeli = (colMap['nama'] !== undefined ? r[colMap['nama']] : r[0]) || '';
        const noHp = (colMap['hp'] !== undefined ? r[colMap['hp']] : r[1]) || '';
        const alamat = (colMap['alamat'] !== undefined ? r[colMap['alamat']] : r[2]) || '';
        const productName = (colMap['produk'] !== undefined ? r[colMap['produk']] : r[4]) || '';
        const size = (colMap['size'] !== undefined ? r[colMap['size']] : r[5]) || '-';
        const sku = (colMap['sku'] !== undefined ? r[colMap['sku']] : r[6]) || '';
        const hargaLive = cleanNumber(colMap['harga'] !== undefined ? r[colMap['harga']] : r[7]);
        const qty = cleanNumber(colMap['qty'] !== undefined ? r[colMap['qty']] : r[8]) || 1;
        const shipping = cleanNumber(colMap['ongkir'] !== undefined ? r[colMap['ongkir']] : r[10]);
        const total = cleanNumber(colMap['total'] !== undefined ? r[colMap['total']] : r[11]);
        const rawStatus = String((colMap['status'] !== undefined ? r[colMap['status']] : r[12]) || '').toLowerCase().trim();
        const catatan = (colMap['ket'] !== undefined ? r[colMap['ket']] : r[13]) || '';
        const resi = (colMap['resi'] !== undefined ? r[colMap['resi']] : r[14]) || '';
        const explicitOrderNo = (colMap['no_pesanan'] !== undefined ? String(r[colMap['no_pesanan']] || '').trim() : '');

        // Skip baris yang tidak memiliki informasi pembeli dan SKU
        if (!namaPembeli && !noHp && !sku && !productName) continue;
        
        let status: IGLiveOrderStatus = 'siap_diproses';
        if (rawStatus.includes('cancel') || rawStatus.includes('batal')) status = 'batal';
        else if (rawStatus.includes('selesai') || rawStatus.includes('done')) status = 'selesai';
        else if (rawStatus.includes('dikirim') || rawStatus.includes('kirim')) status = 'dikirim';
        else if (rawStatus.includes('proses') || rawStatus.includes('packing')) status = 'diproses';
        else if (rawStatus.includes('tunggu') || rawStatus.includes('belum bayar')) status = 'menunggu_pembayaran';
        
        const finalOrderNo = explicitOrderNo || `IGL-GS-${Date.now()}-${i}`;

        rawList.push({
          id: finalOrderNo,
          no_pesanan: finalOrderNo,
          nama_pembeli: namaPembeli || 'Customer IG',
          username_ig: (namaPembeli || 'customer_ig').replace(/\s+/g, '_').toLowerCase(),
          no_telp: noHp,
          alamat_lengkap: alamat,
          biaya_ongkir: shipping,
          total_bayar: total || (hargaLive * qty + shipping),
          status,
          catatan,
          no_resi: resi,
          items: [
            {
              sku,
              nama_produk: productName,
              size,
              qty,
              harga: hargaLive,
            },
          ],
        });
      }

    } else {
      // Logic untuk GAS JSON API
      // Jika URL adalah endpoint GAS dan belum memiliki parameter table, otomatis arahkan ke table=transaksi
      let fetchUrl = url;
      if (fetchUrl.includes('script.google.com') && !fetchUrl.includes('table=') && !fetchUrl.includes('action=')) {
        const separator = fetchUrl.includes('?') ? '&' : '?';
        fetchUrl = `${fetchUrl}${separator}table=${encodeURIComponent(targetSheet)}&action=getTransaksi`;
      }

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const json = await response.json();

      if (Array.isArray(json)) {
        rawList = json;
      } else if (json && Array.isArray(json.data)) {
        rawList = json.data;
      } else if (json && Array.isArray(json.orders)) {
        rawList = json.orders;
      } else if (json && Array.isArray(json.pesanan)) {
        rawList = json.pesanan;
      } else {
        throw new Error('Format respon JSON dari GAS tidak valid (harus array atau { data: [...] })');
      }
    }

    
    // Fetch existing records from Supabase to preserve manual changes (Resi & Status & UUID)
    const { data: existingData } = await getSupabaseClient().from('ig_live_orders')
      .select('id, no_pesanan, no_resi, status');
      
    const existingMap = new Map();
    if (existingData) {
      existingData.forEach((row: any) => {
        existingMap.set(row.no_pesanan, { 
          id: row.id,
          no_resi: row.no_resi, 
          status: row.status 
        });
      });
    }

    // Mapping raw data into standardized IGLiveOrder
    const mapped: IGLiveOrder[] = rawList.map((row, idx) => {
      const orderNo = String(
        row.no_pesanan || row.order_id || row.id || `IGL-${Date.now()}-${idx + 1}`
      ).trim();

      const existing = existingMap.get(orderNo);

      // Normalize items
      const rawItems = Array.isArray(row.items)
        ? row.items
        : [
            {
              sku: row.sku || row.kode || row.item_code || '',
              qty: Number(row.qty || row.jumlah || 1),
            },
          ];

      const items: IGLiveItem[] = rawItems.map((rawIt: any) => {
        const sku = String(rawIt.sku || rawIt.kode || rawIt.item_code || '').trim();
        const master = lookupMasterProduct(sku, catalog);
        return {
          sku: master.sku || sku,
          nama_produk: master.nama_produk || rawIt.nama_produk,
          size: master.size !== '-' ? master.size : (rawIt.size || '-'),
          qty: Number(rawIt.qty || 1) || 1,
          harga: Number(rawIt.harga || rawIt.price || master.harga || 0),
          lokasi: master.lokasi,
          area: master.area,
          priority: master.priority,
          picked: !!rawIt.picked,
        };
      });

      // Preserve status & resi if it was already updated in Supabase
      const finalResi = existing && existing.no_resi && existing.no_resi !== '-' 
        ? existing.no_resi 
        : (row.no_resi || row.resi || row.tracking_no || '-');
        
      const finalStatus = existing && existing.status && existing.status !== 'siap_diproses'
        ? existing.status
        : ((row.status as IGLiveOrderStatus) || 'siap_diproses');

      const existingId = existing && existing.id && isValidUuid(existing.id) ? existing.id : undefined;

      return {
        id: existingId || orderNo,
        no_pesanan: orderNo,
        tanggal: row.tanggal || row.created_at || new Date().toISOString().substring(0, 19).replace('T', ' '),
        session_live: row.session_live || row.live_session || 'IG Live Session',
        username_ig: row.username_ig || row.ig_handle || row.username || '@customer',
        nama_pembeli: row.nama_pembeli || row.customer_name || row.pembeli || 'Customer IG',
        no_telp: row.no_telp || row.phone || row.whatsapp || '',
        alamat_lengkap: row.alamat_lengkap || row.alamat || row.address || '',
        kota_kabupaten: row.kota || row.kota_kabupaten || '',
        provinsi: row.provinsi || '',
        kode_pos: row.kode_pos || '',
        ekspedisi: row.ekspedisi || row.courier || row.kurir || 'JNE',
        layanan: row.layanan || row.service || 'REG',
        no_resi: finalResi,
        biaya_ongkir: Number(row.biaya_ongkir || row.ongkir || 0),
        total_bayar: Number(row.total_bayar || row.total || 0),
        status: finalStatus as IGLiveOrderStatus,
        alasan_batal: row.alasan_batal || '',
        catatan: row.catatan || row.notes || '',
        items,
        is_picked: !!row.is_picked,
        waktu_picking: row.waktu_picking,
        petugas_picking: row.petugas_picking,
      };
    });

    // Save and return
    await upsertIgLiveOrdersToSupabase(mapped);

    const refreshed = await fetchIgLiveOrdersFromSupabase();
    const finalOrders = refreshed && refreshed.length > 0 ? refreshed : mapped;

    return {
      success: true,
      orders: finalOrders,
      message: `Berhasil menarik ${mapped.length} pesanan dari sumber data`,
    };
  } catch (err: any) {
    console.error('[IGLIVE] Gagal fetch:', err);
    return {
      success: false,
      message: err?.message || 'Gagal terhubung ke sumber data',
    };
  }
}
