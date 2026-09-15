import { supabaseFetch } from './supabase';

export interface AddressData {
  id: string;
  nama_penerima: string;
  no_telp: string;
  alamat: string;
  keterangan?: string;
  jasa_kirim?: string;
  created_at?: string;
}

export async function fetchDataAlamatList(): Promise<AddressData[]> {
  try {
    const data = await supabaseFetch<any[]>('address_book', 'GET', null, 'select=*&order=created_at.desc');
    if (data && Array.isArray(data)) {
      return data.map(row => ({
        id: String(row.id),
        nama_penerima: String(row.nama_penerima).trim(),
        no_telp: String(row.no_telp || '').trim(),
        alamat: String(row.alamat).trim(),
        keterangan: String(row.keterangan || '').trim(),
        jasa_kirim: '',
        created_at: row.created_at || '',
      }));
    }
  } catch (err) {
    console.warn('Gagal memuat alamat dari Supabase:', err);
  }
  return [];
}

export async function saveDataAlamatList(newItems: Omit<AddressData, 'id'>[]): Promise<{ success: boolean; message: string }> {
  try {
    const payload = newItems.map(item => {
      const { id, ...rest } = item as any;
      return {
        ...rest,
        created_at: item.created_at || new Date().toISOString()
      };
    });
    await supabaseFetch('address_book', 'POST', payload);
    return { success: true, message: 'Berhasil menyimpan data ke address_book Supabase' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menyimpan ke address_book' };
  }
}

export async function deleteDataAlamatItem(id: string | number): Promise<{ success: boolean; message: string }> {
  try {
    await supabaseFetch('address_book', 'DELETE', null, `id=eq.${id}`);
    return { success: true, message: 'Berhasil menghapus dari address_book Supabase' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Gagal menghapus item dari address_book' };
  }
}
