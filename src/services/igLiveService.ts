import { ProductItem } from '../types';
import { getSupabaseClient, getAreaFromLokasi, getPickingPriority } from './supabase';

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
 */
export async function upsertIgLiveOrdersToSupabase(orders: IGLiveOrder[]): Promise<boolean> {
  if (!orders || orders.length === 0) return true;
  try {
    const { error } = await getSupabaseClient()
      .from('ig_live_orders')
      .upsert(orders.map(o => ({
        ...o,
        items: o.items // Supabase handles jsonb automatically
      })), { onConflict: 'no_pesanan' });
      
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[IGLIVE] Gagal upsert ke Supabase:', err);
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

import Papa from 'papaparse';

/**
 * Tarik / Sinkronisasi Data Pesanan dari URL GAS atau Google Sheets langsung
 */
export async function fetchOrdersFromGas(
  gasUrl: string,
  catalog: ProductItem[]
): Promise<{ success: boolean; orders?: IGLiveOrder[]; message: string }> {
  let url = (gasUrl || '').trim();
  if (!url) {
    return { success: false, message: 'URL GAS / Google Sheets belum diatur' };
  }

  // Deteksi apakah ini link Google Sheets
  const isGoogleSheets = url.includes('docs.google.com/spreadsheets') || url.includes('spreadsheets.google.com');

  try {
    let rawList: any[] = [];

    if (isGoogleSheets) {
      // 1. Ekstrak ID dan GID dari link Google Sheets
      const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
      
      if (!idMatch) {
        throw new Error('Link Google Sheets tidak valid (ID tidak ditemukan)');
      }
      
      const sheetId = idMatch[1];
      const gid = gidMatch ? gidMatch[1] : '0';
      
      // 2. Ubah menjadi link export CSV
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      
      // 3. Fetch CSV data
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`Gagal mengunduh CSV (HTTP ${response.status}). Pastikan akses sheet adalah "Anyone with the link".`);
      }
      
      const csvText = await response.text();
      
      // 4. Parsing menggunakan PapaParse
      const parsed = Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
      });
      
      if (parsed.errors && parsed.errors.length > 0) {
        console.warn('[IGLIVE] PapaParse errors:', parsed.errors);
      }
      
      const rows = parsed.data as string[][];
      
      // Asumsi format kolom sesuai sheet "transaksi":
      // Baris 0: Instruksi
      // Baris 1: Header (NAMA PEMESAN, NO HP, ALAMAT, KODE, PRODUCT NAME, SIZE, SKU, HARGA LIVE, QTY, PRICE, SHIPPING, TOTAL, STATUS, KET, RESI)
      // Baris 2 dst: Data
      
      let dataStartRow = 1;
      // Cari baris header secara dinamis jika format agak bergeser
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        if (rows[i].length > 5 && String(rows[i][0]).toUpperCase().includes('NAMA PEMESAN')) {
          dataStartRow = i + 1;
          break;
        }
      }
      
      const cleanNumber = (str: string) => {
        if (!str) return 0;
        return Number(String(str).replace(/[^0-9.-]+/g, '')) || 0;
      };

      for (let i = dataStartRow; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0] && !r[1] && !r[6]) continue; // Skip baris kosong
        
        // Pemetaan kolom berdasarkan struktur CSV
        const namaPembeli = r[0] || 'Customer IG';
        const noHp = r[1] || '';
        const alamat = r[2] || '';
        // const kode = r[3] || ''; // Tidak wajib
        const productName = r[4] || '';
        const size = r[5] || '';
        const sku = r[6] || '';
        const hargaLive = cleanNumber(r[7]);
        const qty = cleanNumber(r[8]) || 1;
        // const price = cleanNumber(r[9]); // Sama dengan harga * qty
        const shipping = cleanNumber(r[10]);
        const total = cleanNumber(r[11]);
        const rawStatus = String(r[12] || '').toLowerCase().trim();
        const catatan = r[13] || '';
        const resi = r[14] || '';
        
        let status: IGLiveOrderStatus = 'siap_diproses';
        if (rawStatus.includes('cancel') || rawStatus.includes('batal')) status = 'batal';
        else if (rawStatus.includes('selesai') || rawStatus.includes('done')) status = 'selesai';
        else if (rawStatus.includes('dikirim') || rawStatus.includes('kirim')) status = 'dikirim';
        else if (rawStatus.includes('proses') || rawStatus.includes('packing')) status = 'diproses';
        else if (rawStatus.includes('tunggu') || rawStatus.includes('belum bayar')) status = 'menunggu_pembayaran';
        
        rawList.push({
          id: `IGL-GS-${Date.now()}-${i}`,
          no_pesanan: `IGL-GS-${Date.now()}-${i}`,
          nama_pembeli: namaPembeli,
          username_ig: namaPembeli.replace(/\s+/g, '_').toLowerCase(),
          no_telp: noHp,
          alamat_lengkap: alamat,
          biaya_ongkir: shipping,
          total_bayar: total,
          status,
          catatan,
          no_resi: resi,
          items: [
            {
              sku,
              nama_produk: productName,
              size,
              qty,
              harga: hargaLive
            }
          ]
        });
      }

    } else {
      // Logic untuk GAS JSON API
      const response = await fetch(url, {
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

    
    // Fetch existing records from Supabase to preserve manual changes (Resi & Status)
    const { data: existingData } = await getSupabaseClient().from('ig_live_orders')
      .select('no_pesanan, no_resi, status');
      
    const existingMap = new Map();
    if (existingData) {
      existingData.forEach((row: any) => {
        existingMap.set(row.no_pesanan, { no_resi: row.no_resi, status: row.status });
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

      return {
        id: orderNo,
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
        ekspedisi: row.ekspedisi || row.courier || row.kurir || 'J&T Express',
        layanan: row.layanan || row.service || 'Reguler',
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

    return {
      success: true,
      orders: mapped,
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
