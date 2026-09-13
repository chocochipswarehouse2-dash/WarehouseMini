import { ManualShipmentOrder } from '../types';
import { getStoredManualShipmentGasUrl, DEFAULT_MANUAL_SHIPMENT_GAS_URL } from './settings';
import { getSupabaseClient } from './supabase';
import { fetchWithDeltaSync } from './gasSync';
export { DEFAULT_MANUAL_SHIPMENT_GAS_URL };

export const DEFAULT_OUTLETS: { nama: string; fulfillment: string }[] = [
  { nama: 'Mall Kelapa Gading', fulfillment: 'Mall Kelapa Gading' },
  { nama: 'La Vela Tangerang', fulfillment: 'La Vela Tangerang' },
  { nama: 'Paskal Hyper Square Bandung', fulfillment: 'Paskal Hyper Square Bandung' },
  { nama: 'Gading Serpong Tangerang', fulfillment: 'Gading Serpong Tangerang' },
  { nama: 'Ciputra World Surabaya', fulfillment: 'Ciputra World Surabaya' },
  { nama: 'Puri Indah Mall', fulfillment: 'Puri Indah Mall' },
  { nama: 'By The Sea PIK', fulfillment: 'By The Sea PIK' },
  { nama: 'Pakuwon Mall Surabaya', fulfillment: 'Pakuwon Mall Surabaya' },
  { nama: 'Living World Tangerang', fulfillment: 'Living World Tangerang' },
  { nama: 'Lippo Mall Puri', fulfillment: 'Lippo Mall Puri' },
  { nama: 'Sun Plaza Medan', fulfillment: 'Sun Plaza Medan' },
  { nama: 'Deli Park Medan', fulfillment: 'Deli Park Medan' },
  { nama: 'Central Park Jakarta', fulfillment: 'Central Park Jakarta' },
];

export const DEFAULT_JASA_KIRIM: string[] = [
  'JNE Regular',
  'JNE YES',
  'J&T Express',
  'SiCepat REG',
  'SiCepat BEST',
  'Anteraja Regular',
  'Anteraja Same Day',
  'GoSend Instant',
  'GoSend Same Day',
  'GrabExpress Instant',
  'GrabExpress Same Day',
  'Paxel',
  'SPX Standard',
  'SPX Instant',
  'Lion Parcel',
  'Wahana',
  'Kurir Toko / Internal',
];

const getGasUrl = () => {
  return getStoredManualShipmentGasUrl();
};

/**
 * Mengambil daftar pilihan Jasa Kirim dari Sheet 'outlet' Kolom C baris 2
 * Menggunakan caching cerdas dan fallback jika offline/script belum diperbarui
 */
export async function fetchJasaKirimList(): Promise<string[]> {
  // 1. Ambil dari cache lokal terlebih dahulu jika ada
  let cached: string[] = [];
  try {
    const raw = localStorage.getItem('wms_cached_jasa_kirim');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) cached = parsed;
    }
  } catch {}

  const fallback = cached.length > 0 ? cached : DEFAULT_JASA_KIRIM;

  // 2. Coba endpoint action=getJasaKirim jika sudah dibuat di Apps Script
  try {
    const url = `${getGasUrl()}?action=getJasaKirim`;
    const res = await fetch(url, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
        const cleaned: string[] = data.data
          .map((item: any) => (typeof item === 'string' ? item : item?.jasa_kirim || item?.nama || item?.name || ''))
          .map((s: string) => s.trim())
          .filter(Boolean);
        if (cleaned.length > 0) {
          const uniqueList: string[] = Array.from(new Set<string>(cleaned));
          try {
            localStorage.setItem('wms_cached_jasa_kirim', JSON.stringify(uniqueList));
          } catch {}
          return uniqueList;
        }
      }
    }
  } catch (e) {
    // Lewati jika belum ada
  }

  // 3. Coba dari getOutlets jika Apps Script memetakan kolom C ke data outlet
  try {
    const url = `${getGasUrl()}?action=getOutlets`;
    const res = await fetch(url, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.jasa_kirim) && data.jasa_kirim.length > 0) {
        const cleaned: string[] = Array.from(
          new Set<string>(data.jasa_kirim.map((s: any) => String(s || '').trim()).filter(Boolean))
        );
        if (cleaned.length > 0) {
          try {
            localStorage.setItem('wms_cached_jasa_kirim', JSON.stringify(cleaned));
          } catch {}
          return cleaned;
        }
      }
      if (data && data.success && Array.isArray(data.data)) {
        const fromItems: string[] = data.data
          .map((item: any) => item?.jasa_kirim || item?.courier || item?.ekspedisi || item?.col_c || '')
          .map((s: string) => String(s || '').trim())
          .filter(Boolean);
        if (fromItems.length > 0) {
          const uniqueList: string[] = Array.from(new Set<string>(fromItems));
          try {
            localStorage.setItem('wms_cached_jasa_kirim', JSON.stringify(uniqueList));
          } catch {}
          return uniqueList;
        }
      }
    }
  } catch (error) {
    console.warn('Gagal memuat list jasa kirim dari GAS, menggunakan fallback:', error);
  }

  return fallback;
}

export async function fetchOutlets(): Promise<{ nama: string; fulfillment: string }[]> {
  // 1. Ambil dari cache lokal terlebih dahulu jika ada
  let cached: { nama: string; fulfillment: string }[] = [];
  try {
    const raw = localStorage.getItem('wms_cached_outlets');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) cached = parsed;
    }
  } catch {}

  const fallback = cached.length > 0 ? cached : DEFAULT_OUTLETS;

  try {
    const url = `${getGasUrl()}?action=getOutlets`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
      try {
        localStorage.setItem('wms_cached_outlets', JSON.stringify(data.data));
      } catch {}
      return data.data;
    }
  } catch (error) {
    console.warn('Gagal memuat outlets dari GAS, menggunakan data fallback lokal:', error);
  }

  return fallback;
}

export function normalizeManualShipmentRecords(rawData: any[]): ManualShipmentOrder[] {
  const map = new Map<string, ManualShipmentOrder>();

  rawData.forEach((row) => {
    const key = row.id || row.no_pesanan;
    if (!key) return;

    if (!map.has(key)) {
      let no_transaksi_pengirim: string[] = [];
      try {
        if (typeof row.no_transaksi_pengirim === 'string') {
           if (row.no_transaksi_pengirim.startsWith('[')) {
               no_transaksi_pengirim = JSON.parse(row.no_transaksi_pengirim);
           } else {
               no_transaksi_pengirim = row.no_transaksi_pengirim.split(',').map((s: string) => s.trim()).filter(Boolean);
           }
        } else if (Array.isArray(row.no_transaksi_pengirim)) {
            no_transaksi_pengirim = row.no_transaksi_pengirim;
        }
      } catch (e) {
          console.warn("failed parsing no_transaksi_pengirim", e);
      }

      map.set(key, {
        id: row.id,
        no_pesanan: row.no_pesanan || '',
        nama_pengirim: row.nama_pengirim || '',
        no_telp_store: row.no_telp_store || '',
        no_transaksi_pengirim: no_transaksi_pengirim,
        nama_tujuan: row.nama_tujuan || '',
        no_telp_tujuan: String(row.no_telp_tujuan || ''),
        alamat_tujuan: row.alamat_tujuan || '',
        notes_paket: row.notes_paket || '',
        no_transaksi_customer: row.no_transaksi_customer || '',
        jasa_kirim: row.jasa_kirim || '',
        no_resi: row.no_resi || '',
        status: row.status || 'diterima',
        submitted_by: row.submitted_by || '',
        created_at: row.created_at || row.tanggal,
        items: []
      });
    }

    const parent = map.get(key)!;

    if (row.sku && row.nama_produk) {
      parent.items.push({
        id: `${row.sku}_${Date.now()}`,
        sku: row.sku,
        nama_produk: row.nama_produk,
        qty: parseInt(row.qty, 10) || 0,
        fulfillment: 'NO_REFILL'
      });
    } else if (row.items && typeof row.items === 'string' && row.items.startsWith('[')) {
      try {
         parent.items = JSON.parse(row.items);
      } catch (e) {}
    } else if (Array.isArray(row.items)) {
         parent.items = row.items;
    }
  });

  const finalRecords = Array.from(map.values());
  finalRecords.sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return finalRecords;
}

export async function fetchManualShipments(): Promise<ManualShipmentOrder[]> {
  // 1. Ambil dari cache lokal terlebih dahulu jika ada
  let cached: ManualShipmentOrder[] = [];
  try {
    const raw = localStorage.getItem('wms_cached_manual_shipments');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) cached = parsed;
    }
  } catch {}

  try {
    const data = await fetchWithDeltaSync<any>('Manual Shipment', 
      (row) => row.id && row.sku ? `${row.id}_${row.sku}` : row.id,
      (row) => row.id
    );
    
    if (data && Array.isArray(data)) {
      const normalized = normalizeManualShipmentRecords(data);
      try {
        localStorage.setItem('wms_cached_manual_shipments', JSON.stringify(normalized));
      } catch {}
      return normalized;
    }
  } catch (error) {
    console.warn('Gagal memuat manual shipments, menggunakan cache lokal:', error);
  }

  return cached;
}

export async function submitManualShipment(orderData: ManualShipmentOrder): Promise<boolean> {
  // Simpan ke cache lokal segera (optimistic update)
  try {
    const raw = localStorage.getItem('wms_cached_manual_shipments');
    const list: ManualShipmentOrder[] = raw ? JSON.parse(raw) : [];
    const updated = [orderData, ...list.filter((o) => o.no_pesanan !== orderData.no_pesanan)];
    localStorage.setItem('wms_cached_manual_shipments', JSON.stringify(updated));
  } catch {}

  try {
    const sb = getSupabaseClient();
    const payload = {
      no_pesanan: orderData.no_pesanan,
      tanggal: orderData.created_at || new Date().toISOString(),
      nama_pengirim: orderData.nama_pengirim,
      pic_store: orderData.pic_store || null,
      no_telp_store: orderData.no_telp_store,
      no_transaksi_pengirim: orderData.no_transaksi_pengirim,
      nama_tujuan: orderData.nama_tujuan,
      no_telp_tujuan: orderData.no_telp_tujuan,
      alamat_tujuan: orderData.alamat_tujuan,
      notes_paket: orderData.notes_paket,
      no_transaksi_customer: orderData.no_transaksi_customer,
      jasa_kirim: orderData.jasa_kirim || '',
      no_resi: orderData.no_resi || '',
      status: orderData.status,
      submitted_by: orderData.submitted_by || '',
      items: orderData.items,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb.from('manual_shipment').upsert(payload, { onConflict: 'no_pesanan' });
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('Error submitting shipment:', error);
    return false;
  }
}

export async function updateShipmentResi(no_pesanan: string, no_resi: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem('wms_cached_manual_shipments');
    if (raw) {
      const list: ManualShipmentOrder[] = JSON.parse(raw);
      const updated = list.map((o) => (o.no_pesanan === no_pesanan ? { ...o, no_resi } : o));
      localStorage.setItem('wms_cached_manual_shipments', JSON.stringify(updated));
    }
  } catch {}

  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('manual_shipment')
      .update({ no_resi, updated_at: new Date().toISOString() })
      .eq('no_pesanan', no_pesanan);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating resi:', error);
    return false;
  }
}

export async function updateShipmentStatus(no_pesanan: string, status: 'diterima' | 'diproses' | 'dikirim' | 'batal'): Promise<boolean> {
  try {
    const raw = localStorage.getItem('wms_cached_manual_shipments');
    if (raw) {
      const list: ManualShipmentOrder[] = JSON.parse(raw);
      const updated = list.map((o) => (o.no_pesanan === no_pesanan ? { ...o, status } : o));
      localStorage.setItem('wms_cached_manual_shipments', JSON.stringify(updated));
    }
  } catch {}

  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('manual_shipment')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('no_pesanan', no_pesanan);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating status:', error);
    return false;
  }
}

export async function deleteManualShipment(no_pesanan: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem('wms_cached_manual_shipments');
    if (raw) {
      const list: ManualShipmentOrder[] = JSON.parse(raw);
      const updated = list.filter((o) => o.no_pesanan !== no_pesanan);
      localStorage.setItem('wms_cached_manual_shipments', JSON.stringify(updated));
    }
  } catch {}

  try {
    const sb = getSupabaseClient();
    const { error } = await sb
      .from('manual_shipment')
      .delete()
      .eq('no_pesanan', no_pesanan);
      
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting shipment:', error);
    return false;
  }
}

export async function editManualShipment(orderData: ManualShipmentOrder): Promise<boolean> {
  try {
    const raw = localStorage.getItem('wms_cached_manual_shipments');
    if (raw) {
      const list: ManualShipmentOrder[] = JSON.parse(raw);
      const updated = list.map((o) => (o.no_pesanan === orderData.no_pesanan ? orderData : o));
      localStorage.setItem('wms_cached_manual_shipments', JSON.stringify(updated));
    }
  } catch {}

  try {
    const sb = getSupabaseClient();
    const payload = {
      no_pesanan: orderData.no_pesanan,
      tanggal: orderData.created_at || new Date().toISOString(),
      nama_pengirim: orderData.nama_pengirim,
      pic_store: orderData.pic_store || null,
      no_telp_store: orderData.no_telp_store,
      no_transaksi_pengirim: orderData.no_transaksi_pengirim,
      nama_tujuan: orderData.nama_tujuan,
      no_telp_tujuan: orderData.no_telp_tujuan,
      alamat_tujuan: orderData.alamat_tujuan,
      notes_paket: orderData.notes_paket,
      no_transaksi_customer: orderData.no_transaksi_customer,
      jasa_kirim: orderData.jasa_kirim || '',
      no_resi: orderData.no_resi || '',
      status: orderData.status,
      submitted_by: orderData.submitted_by || '',
      items: orderData.items,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb.from('manual_shipment').update(payload).eq('no_pesanan', orderData.no_pesanan);
    if (error) throw error;
    
    return true;
  } catch (error) {
    console.error('Error editing shipment:', error);
    return false;
  }
}
