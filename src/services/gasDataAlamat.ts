import { getStoredManualShipmentGasUrl } from './settings';
import { getSupabaseClient } from './supabase';

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
 * Mengambil data alamat dengan prioritas utama dari Supabase (address_book & manual_shipment)
 * sehingga data termuat benar, instan, dan bebas dari kendala login Google Apps Script.
 */
export async function fetchDataAlamatList(): Promise<AddressData[]> {
  // 1. Ambil cache lokal terlebih dahulu (0ms responsivitas fallback)
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

  const mergedMap = new Map<string, AddressData>();
  let hasNetworkSuccess = false;

  // 2. Prioritas Utama: Load langsung dari Supabase
  try {
    const sb = getSupabaseClient();
    // A. Ambil dari tabel address_book Supabase
    const { data: abData, error: abErr } = await sb
      .from('address_book')
      .select('*')
      .order('created_at', { ascending: false });

    if (!abErr && Array.isArray(abData)) {
      hasNetworkSuccess = true;
      abData.forEach((row: any) => {
        if (row.nama_penerima && row.alamat) {
          const key = `${String(row.nama_penerima).trim().toLowerCase()}_${String(row.alamat).trim().toLowerCase()}`;
          mergedMap.set(key, {
            id: String(row.id),
            nama_penerima: String(row.nama_penerima).trim(),
            no_telp: String(row.no_telp || '').trim(),
            alamat: String(row.alamat).trim(),
            keterangan: String(row.keterangan || '').trim(),
            jasa_kirim: '',
            created_at: row.created_at || '',
          });
        }
      });
    }
  } catch (supabaseError) {
    console.warn('Gagal memuat alamat dari Supabase:', supabaseError);
  }

  // 3. Gabungkan dengan data dari Google Apps Script (GAS) Sheet Data Alamat
  const url = getGasUrl();
  if (url) {
    try {
      const res = await fetch(`${url}?action=getDataAlamat`, { method: 'GET' });
      if (res.ok) {
        const result = await res.json();
        if (result && result.success && Array.isArray(result.data)) {
          hasNetworkSuccess = true;
          result.data.forEach((row: any) => {
            const nama = String(row.nama_penerima || row.nama || '').trim();
            const alamat = String(row.alamat || '').trim();
            if (nama && alamat) {
              const key = `${nama.toLowerCase()}_${alamat.toLowerCase()}`;
              if (!mergedMap.has(key)) {
                mergedMap.set(key, {
                  id: String(row.id || `gas_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`),
                  nama_penerima: nama,
                  no_telp: String(row.no_telp || row.telp || '').trim(),
                  alamat: alamat,
                  keterangan: String(row.keterangan || row.deskripsi || '').trim(),
                  jasa_kirim: String(row.jasa_kirim || row.ekspedisi || '').trim(),
                  created_at: String(row.created_at || row.tanggal || '').trim(),
                });
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn('Gagal memuat data dari GAS Data Alamat', e);
    }
  }

  if (hasNetworkSuccess) {
    const finalList = Array.from(mergedMap.values());
    try {
      localStorage.setItem('wms_cached_data_alamat', JSON.stringify(finalList));
    } catch {}
    return finalList;
  }
  
  return cached;
}

/**
 * Menyimpan satu atau banyak data alamat ke Supabase 'address_book' dan cache
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

  // 2. Simpan ke Supabase address_book
  try {
    const sb = getSupabaseClient();
    const rowsToInsert = items.map(item => ({
      nama_penerima: item.nama_penerima.trim(),
      no_telp: item.no_telp ? item.no_telp.trim() : null,
      alamat: item.alamat.trim(),
      keterangan: item.keterangan ? item.keterangan.trim() : (item.jasa_kirim ? `Kurir: ${item.jasa_kirim}` : null),
    }));

    const { error: insertErr } = await sb.from('address_book').insert(rowsToInsert);
    if (insertErr) {
      console.warn('Gagal insert ke tabel address_book Supabase:', insertErr);
    }
  } catch (err) {
    console.error('Error saving data alamat to Supabase:', err);
  }

  // 3. Kirim ke Google Apps Script di background (opsional jika aktif)
  const gasUrl = getGasUrl();
  if (gasUrl) {
    try {
      const url = gasUrl.includes('?') ? `${gasUrl}&action=saveDataAlamat` : `${gasUrl}?action=saveDataAlamat`;
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveDataAlamat',
          data: items,
        }),
      }).catch(() => {});
    } catch {}
  }

  return true;
}

/**
 * Menghapus data alamat dari Supabase dan cache
 */
export async function deleteDataAlamatItem(id: string, namaPenerima?: string): Promise<boolean> {
  // 1. Hapus dari cache lokal
  try {
    const raw = localStorage.getItem('wms_cached_data_alamat');
    if (raw) {
      const current: AddressData[] = JSON.parse(raw);
      const updated = current.filter(c => c.id !== id && (!namaPenerima || c.nama_penerima !== namaPenerima));
      localStorage.setItem('wms_cached_data_alamat', JSON.stringify(updated));
    }
  } catch {}

  // 2. Hapus dari Supabase
  try {
    const sb = getSupabaseClient();
    if (!id.startsWith('ms_') && !id.startsWith('gas_') && !id.startsWith('addr_')) {
      // UUID valid dari Supabase address_book
      await sb.from('address_book').delete().eq('id', id);
    } else if (namaPenerima) {
      await sb.from('address_book').delete().eq('nama_penerima', namaPenerima);
    }
  } catch (error) {
    console.error('Error deleting data alamat from Supabase:', error);
  }

  // 3. Trigger ke GAS jika ada
  const gasUrl = getGasUrl();
  if (gasUrl) {
    try {
      const url = gasUrl.includes('?') ? `${gasUrl}&action=deleteDataAlamat` : `${gasUrl}?action=deleteDataAlamat`;
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deleteDataAlamat',
          data: { id, nama_penerima: namaPenerima },
        }),
      }).catch(() => {});
    } catch {}
  }

  return true;
}

