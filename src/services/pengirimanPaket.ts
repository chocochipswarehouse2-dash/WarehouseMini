import { RiwayatHandoverPaket } from '../types';
import { supabaseFetch } from './supabase';

const LOCAL_STORAGE_HANDOVER_PAKET = 'wms_pengiriman_paket_handover_cache';

export function generateManifestId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MNF-${yy}${mm}${dd}-${rand}`;
}

export function generateHandoverId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `HO-PKT-${yy}${mm}${dd}-${rand}`;
}

export function getCachedHandoverList(): RiwayatHandoverPaket[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_HANDOVER_PAKET);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Gagal membaca cache handover paket:', e);
  }
  return [];
}

export function saveHandoverListToCache(list: RiwayatHandoverPaket[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_HANDOVER_PAKET, JSON.stringify(list));
  } catch (e) {
    console.warn('Gagal menyimpan cache handover paket:', e);
  }
}

export async function fetchHandoverPaketList(): Promise<RiwayatHandoverPaket[]> {
  try {
    const data = await supabaseFetch<any[]>(
      'pengiriman_paket_handover',
      'GET',
      null,
      'select=*&order=created_at.desc'
    );

    if (data && Array.isArray(data)) {
      const formatted: RiwayatHandoverPaket[] = data.map((d: any) => ({
        id: d.id,
        no_manifest: d.no_manifest,
        tgl_kirim: d.tgl_kirim || new Date().toISOString().split('T')[0],
        ekspedisi: d.ekspedisi || 'Ekspedisi',
        driver_kurir: d.driver_kurir || '',
        no_kendaraan: d.no_kendaraan || '',
        total_paket: Number(d.total_paket || 0),
        pic_nama: d.pic_nama || 'Petugas Gudang',
        pic_username: d.pic_username || 'operator',
        waktu_handover: d.waktu_handover || '',
        status: d.status || 'Diserahkan ke Kurir',
        keterangan: d.keterangan || '',
        resi_list: Array.isArray(d.resi_list)
          ? d.resi_list
          : typeof d.resi_list === 'string' && d.resi_list.startsWith('[')
          ? JSON.parse(d.resi_list)
          : d.resi_list
          ? [d.resi_list]
          : [],
        created_at: d.created_at || new Date().toISOString(),
        updated_at: d.updated_at || new Date().toISOString(),
      }));

      saveHandoverListToCache(formatted);
      return formatted;
    }
  } catch (e) {
    console.warn('Supabase fetch pengiriman_paket_handover error, fallback to cache:', e);
  }

  return getCachedHandoverList();
}

export async function saveHandoverPaket(
  payload: Omit<RiwayatHandoverPaket, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<{ success: boolean; data?: RiwayatHandoverPaket; message: string }> {
  try {
    const id = payload.id || generateHandoverId();
    const nowIso = new Date().toISOString();

    const newRecord: RiwayatHandoverPaket = {
      ...payload,
      id,
      total_paket: payload.resi_list ? payload.resi_list.length : payload.total_paket || 0,
      created_at: nowIso,
      updated_at: nowIso,
    };

    // Save to cache immediately
    const cached = getCachedHandoverList();
    const existingIndex = cached.findIndex((r) => r.id === id);
    let updatedList: RiwayatHandoverPaket[];
    if (existingIndex >= 0) {
      updatedList = [...cached];
      updatedList[existingIndex] = newRecord;
    } else {
      updatedList = [newRecord, ...cached];
    }
    saveHandoverListToCache(updatedList);

    // Save to Supabase
    try {
      const dbPayload = {
        id: newRecord.id,
        no_manifest: newRecord.no_manifest,
        tgl_kirim: newRecord.tgl_kirim,
        ekspedisi: newRecord.ekspedisi,
        driver_kurir: newRecord.driver_kurir,
        no_kendaraan: newRecord.no_kendaraan,
        total_paket: newRecord.total_paket,
        pic_nama: newRecord.pic_nama,
        pic_username: newRecord.pic_username,
        waktu_handover: newRecord.waktu_handover,
        status: newRecord.status,
        keterangan: newRecord.keterangan || '',
        resi_list: JSON.stringify(newRecord.resi_list || []),
        created_at: newRecord.created_at,
        updated_at: newRecord.updated_at,
      };

      if (payload.id && existingIndex >= 0) {
        await supabaseFetch('pengiriman_paket_handover', 'PATCH', dbPayload, `id=eq.${newRecord.id}`);
      } else {
        await supabaseFetch('pengiriman_paket_handover', 'POST', [dbPayload]);
      }
    } catch (dbErr) {
      console.warn('Simpan pengiriman_paket_handover ke Supabase tertunda (tersimpan lokal):', dbErr);
    }

    return {
      success: true,
      data: newRecord,
      message: `Manifest ${newRecord.no_manifest} (${newRecord.total_paket} paket) berhasil disimpan ke ${newRecord.ekspedisi}!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menyimpan handover paket',
    };
  }
}

export async function deleteHandoverPaket(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const cached = getCachedHandoverList();
    const updated = cached.filter((r) => r.id !== id);
    saveHandoverListToCache(updated);

    try {
      await supabaseFetch('pengiriman_paket_handover', 'DELETE', null, `id=eq.${id}`);
    } catch (e) {
      console.warn('Gagal hapus pengiriman_paket_handover di Supabase, fallback lokal:', e);
    }

    return {
      success: true,
      message: 'Data handover manifest berhasil dihapus.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menghapus data handover paket',
    };
  }
}
