import { getStoredManualShipmentGasUrl } from './settings';

export interface AddressData {
  id: string;
  nama_penerima: string;
  no_telp: string;
  alamat: string;
  keterangan?: string;
  jasa_kirim?: string;
  created_at?: string;
}

const getGasUrl = () => {
  return getStoredManualShipmentGasUrl();
};

/**
 * Mengambil data alamat dari Google Sheet 'Data Alamat' via GAS
 */
export async function fetchDataAlamatList(): Promise<AddressData[]> {
  // 1. Cek cache lokal
  let cached: AddressData[] = [];
  try {
    const raw = localStorage.getItem('wms_cached_data_alamat');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cached = parsed;
      }
    }
  } catch {}

  const url = getGasUrl();
  if (!url) return cached;

  try {
    const res = await fetch(`${url}?action=getDataAlamat`, {
      method: 'GET',
    });
    if (res.ok) {
      const result = await res.json();
      if (result && result.success && Array.isArray(result.data)) {
        const list: AddressData[] = result.data.map((row: any) => ({
          id: String(row.id || `addr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`),
          nama_penerima: String(row.nama_penerima || row.nama || '').trim(),
          no_telp: String(row.no_telp || row.telp || '').trim(),
          alamat: String(row.alamat || '').trim(),
          keterangan: String(row.keterangan || row.deskripsi || '').trim(),
          jasa_kirim: String(row.jasa_kirim || row.ekspedisi || '').trim(),
          created_at: String(row.created_at || row.tanggal || '').trim(),
        })).filter((item: AddressData) => item.nama_penerima && item.alamat);

        try {
          localStorage.setItem('wms_cached_data_alamat', JSON.stringify(list));
        } catch {}

        return list;
      }
    }
  } catch (err) {
    console.warn('Gagal memuat Data Alamat dari GAS, menggunakan cache:', err);
  }

  return cached;
}

/**
 * Menyimpan satu atau banyak data alamat ke Google Sheet 'Data Alamat'
 */
export async function saveDataAlamatList(items: AddressData[]): Promise<boolean> {
  if (!items || items.length === 0) return true;

  // 1. Update cache lokal terlebih dahulu
  try {
    const raw = localStorage.getItem('wms_cached_data_alamat');
    let current: AddressData[] = raw ? JSON.parse(raw) : [];
    
    // Merge berdasarkan nama dan alamat
    const newItems = items.filter(
      item => !current.some(c => c.nama_penerima.toLowerCase() === item.nama_penerima.toLowerCase() && c.alamat.toLowerCase() === item.alamat.toLowerCase())
    );
    current = [...newItems, ...current];
    localStorage.setItem('wms_cached_data_alamat', JSON.stringify(current));
  } catch {}

  const url = getGasUrl();
  if (!url) return true;

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveDataAlamat',
        data: items,
      }),
    });
    return true;
  } catch (error) {
    console.error('Error saving data alamat to GAS:', error);
    return false;
  }
}

/**
 * Menghapus data alamat dari Google Sheet 'Data Alamat'
 */
export async function deleteDataAlamatItem(id: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem('wms_cached_data_alamat');
    if (raw) {
      const current: AddressData[] = JSON.parse(raw);
      const updated = current.filter(c => c.id !== id);
      localStorage.setItem('wms_cached_data_alamat', JSON.stringify(updated));
    }
  } catch {}

  const url = getGasUrl();
  if (!url) return true;

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'deleteDataAlamat',
        data: { id },
      }),
    });
    return true;
  } catch (error) {
    console.error('Error deleting data alamat from GAS:', error);
    return false;
  }
}
