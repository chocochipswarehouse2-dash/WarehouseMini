import { fetchWithDeltaSync } from './gasSync';
import { StockOpnameQueueItem } from '../types';

/**
 * Mengambil dan mensinkronisasi data Stok Opname Queue dari GAS
 * Menggunakan Delta Sync pattern (hanya menarik data yang berubah).
 */
export async function fetchStockOpnameQueueFromGAS(): Promise<StockOpnameQueueItem[]> {
  try {
    const data = await fetchWithDeltaSync<any>('Stok Opname Queue', 
      (row) => row.id,
      (row) => row.id
    );
    
    return data.map((r) => ({
      id: r.id,
      sesi_id: r.sesi_id || '',
      tanggal: r.tanggal || '',
      sku: String(r.sku || '').toUpperCase(),
      nama_produk: String(r.nama_produk || r.sku || ''),
      size: String(r.size || ''),
      lokasi: String(r.lokasi || ''),
      area: String(r.area || ''),
      qty_fisik: Number(r.qty_fisik || 0),
      qty_sistem: Number(r.qty_sistem || 0),
      selisih: Number(r.selisih || 0),
      pic: String(r.pic || ''),
      status: String(r.status || 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED',
      keterangan: String(r.keterangan || ''),
      jenis: r.jenis || 'Opname',
      operator: r.operator || '',
      invoice: r.invoice || '',
      created_at: String(r.created_at || ''),
      updated_at: String(r.updated_at || ''),
    }));
  } catch (err) {
    console.error('Error fetch Stok Opname Queue dari GAS', err);
    return [];
  }
}
