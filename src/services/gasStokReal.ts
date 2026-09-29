/**
 * @deprecated Legacy module - Modul Inventory saat ini 100% menggunakan Supabase secara langsung
 * via fetchSupabaseStokFisikDirect() dan fetchAllStockRealtime() di src/services/supabase.ts.
 */
import { fetchWithDeltaSync } from './gasSync';
import { StockRealtimeItem } from '../types';

/**
 * Mengambil dan mensinkronisasi data Stok Real Fisik (Legacy Fallback)
 * Saat ini fetchWithDeltaSync telah dialihkan ke tabel stok_real_fisik di Supabase.
 */
export async function fetchAllStokRealFisik(): Promise<StockRealtimeItem[]> {
  try {
    const data = await fetchWithDeltaSync<any>('Stok Real', 
      (row) => row.id || `${row.sku}_${row.lokasi}`,
      (row) => row.id
    );
    
    // Normalisasi dan hanya tampilkan stok yang tidak 0
    return data
      .map((r) => ({
        id: r.id,
        sku: String(r.sku || '').toUpperCase(),
        lokasi: String(r.lokasi || ''),
        nama_produk: String(r.nama_produk || r.sku || ''),
        size: String(r.size || ''),
        area: String(r.area || ''),
        sisa_stok: Number(r.sisa_stok || 0)
      }))
      .filter(r => r.sisa_stok !== 0);
  } catch (err) {
    console.error('Error fetch Stok Real dari GAS', err);
    return [];
  }
}
