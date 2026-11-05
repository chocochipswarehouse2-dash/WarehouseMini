const fs = require('fs');
const path = require('path');

const filepath = path.join('d:\\Antigravity\\WMS Inventory\\src\\services\\igLiveService.ts');
let content = fs.readFileSync(filepath, 'utf8');

// 1. Add supabase import
if (!content.includes("import { supabase }")) {
  content = content.replace("import { getAreaFromLokasi", "import { supabase, getAreaFromLokasi");
}

// 2. Replace getStoredIgLiveOrders and saveStoredIgLiveOrders
const fetchSupabaseReplacement = `
/**
 * Load Orders from Supabase
 */
export async function fetchIgLiveOrdersFromSupabase(): Promise<IGLiveOrder[]> {
  try {
    const { data, error } = await supabase
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
    const { error } = await supabase
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
`;

// Replace from getStoredIgLiveOrders to saveStoredIgLiveOrders
content = content.replace(
  /\/\*\*\s*\n\s*\* Load Orders from LocalStorage[\s\S]*?export function saveStoredIgLiveOrders[\s\S]*?}\n/m,
  fetchSupabaseReplacement
);

// 3. Update fetchOrdersFromGas to merge with Supabase data
const fetchGasReplacement = `
    // Fetch existing records from Supabase to preserve manual changes (Resi & Status)
    const { data: existingData } = await supabase
      .from('ig_live_orders')
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
        row.no_pesanan || row.order_id || row.id || \`IGL-\${Date.now()}-\${idx + 1}\`
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
`;

content = content.replace(
  /\/\/ Mapping raw data into standardized IGLiveOrder[\s\S]*?\/\/ Save and return\s*saveStoredIgLiveOrders\(mapped\);/m,
  fetchGasReplacement
);

fs.writeFileSync(filepath, content);
console.log("igLiveService.ts updated");
