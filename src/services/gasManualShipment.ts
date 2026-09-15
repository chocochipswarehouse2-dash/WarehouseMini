import { ManualShipmentOrder } from '../types';
import { supabaseFetch } from './supabase';

export const DEFAULT_MANUAL_SHIPMENT_GAS_URL = '';

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
  'JNE Regular', 'JNE YES', 'J&T Express', 'SiCepat REG', 'SiCepat BEST',
  'Anteraja Regular', 'Anteraja Same Day', 'GoSend Instant', 'GoSend Same Day',
  'GrabExpress Instant', 'GrabExpress Same Day', 'Paxel', 'SPX Standard',
  'SPX Instant', 'Lion Parcel', 'Wahana', 'Kurir Toko / Internal',
];

export async function fetchJasaKirimList(): Promise<string[]> {
  try {
    const raw = localStorage.getItem('wms_cached_jasa_kirim');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_JASA_KIRIM;
}

export async function fetchOutlets(): Promise<{ id?: string, nama: string; fulfillment: string }[]> {
  try {
    const data = await supabaseFetch<any[]>('outlet_config', 'GET', null, 'select=*&order=nama.asc');
    if (data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn('Error fetching outlets', err);
  }
  return DEFAULT_OUTLETS;
}

export async function saveOutlet(outlet: { id?: string, nama: string, fulfillment: string }): Promise<{ success: boolean; message: string }> {
  try {
    if (outlet.id) {
      await supabaseFetch('outlet_config', 'PATCH', {
        nama: outlet.nama,
        fulfillment: outlet.fulfillment
      }, `id=eq.${outlet.id}`);
      return { success: true, message: 'Berhasil mengupdate store' };
    } else {
      await supabaseFetch('outlet_config', 'POST', [{
        nama: outlet.nama,
        fulfillment: outlet.fulfillment,
        created_at: new Date().toISOString()
      }]);
      return { success: true, message: 'Berhasil menambahkan store baru' };
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan data store' };
  }
}

export async function deleteOutlet(id: string): Promise<{ success: boolean; message: string }> {
  try {
    await supabaseFetch('outlet_config', 'DELETE', null, `id=eq.${id}`);
    return { success: true, message: 'Berhasil menghapus store' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menghapus store' };
  }
}

export async function submitManualShipment(payload: ManualShipmentOrder): Promise<{ success: boolean; message: string }> {
  try {
    const { id, ...rest } = payload as any;
    const submitPayload = {
      ...rest,
      created_at: payload.created_at || new Date().toISOString()
    };
    await supabaseFetch('manual_shipment', 'POST', [submitPayload]);
    return { success: true, message: 'Berhasil menyimpan data ke Supabase' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan ke Supabase' };
  }
}

export async function fetchManualShipments(): Promise<ManualShipmentOrder[]> {
  try {
    const data = await supabaseFetch<ManualShipmentOrder[]>('manual_shipment', 'GET', null, 'select=*&order=created_at.desc');
    return data || [];
  } catch (err) {
    console.warn('Error fetching manual shipments', err);
    return [];
  }
}

export async function updateShipmentStatus(id: string, status: string): Promise<boolean> {
  try {
    await supabaseFetch('manual_shipment', 'PATCH', { status }, `id=eq.${id}`);
    return true;
  } catch (err) {
    console.warn('Error updateShipmentStatus', err);
    return false;
  }
}

export async function updateShipmentResi(id: string, resi: string, timestamp?: string): Promise<boolean> {
  try {
    const payload: any = { no_resi: resi };
    if (timestamp) {
      payload.tanggal_scan = timestamp;
    }
    await supabaseFetch('manual_shipment', 'PATCH', payload, `id=eq.${id}`);
    return true;
  } catch (err) {
    console.warn('Error updateShipmentResi', err);
    return false;
  }
}

export async function deleteManualShipment(no_pesanan: string): Promise<boolean> {
  try {
    await supabaseFetch('manual_shipment', 'DELETE', null, `no_pesanan=eq.${no_pesanan}`);
    return true;
  } catch (err) {
    console.warn('Error deleteManualShipment', err);
    return false;
  }
}

export async function editManualShipment(payload: ManualShipmentOrder): Promise<{ success: boolean; message: string }> {
  try {
    if (!payload.id) {
      return { success: false, message: 'ID tidak ditemukan untuk diupdate' };
    }
    await supabaseFetch('manual_shipment', 'PATCH', payload, `id=eq.${payload.id}`);
    return { success: true, message: 'Berhasil mengupdate data' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal mengupdate data' };
  }
}
