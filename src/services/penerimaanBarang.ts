import {
  PenerimaanMutasiStoreItem,
  PenerimaanPaketItem,
  EkspedisiConfigItem,
  LocationStamp,
} from '../types';
import { supabaseFetch } from './supabase';
import { fetchOutlets, saveOutlet, deleteOutlet, DEFAULT_OUTLETS } from './gasManualShipment';
import { uploadMultipleImagesToGdrive, uploadImageToGdrive } from './gdriveUpload';

// Default List Ekspedisi
export const DEFAULT_EKSPEDISI: string[] = [
  'JNE Express',
  'J&T Express',
  'SiCepat',
  'Shopee Xpress (SPX)',
  'Anteraja',
  'Ninja Xpress',
  'Lion Parcel',
  'Wahana',
  'Paxel',
  'ID Express',
  'Grab Express / GoSend',
  'Lalamove / Deliveree',
  'Kurir Toko / Internal',
];

const LOCAL_STORAGE_MUTASI_STORE = 'wms_penerimaan_mutasi_store_cache';
const LOCAL_STORAGE_PAKET = 'wms_penerimaan_paket_cache';
const LOCAL_STORAGE_EKSPEDISI = 'wms_ekspedisi_list_cache';

// ==============================================================================
// 1. MUTASI STORE (PENERIMAAN DARI STORE)
// ==============================================================================

export async function fetchMutasiStoreList(): Promise<PenerimaanMutasiStoreItem[]> {
  try {
    const data = await supabaseFetch<any[]>(
      'penerimaan_mutasi_store',
      'GET',
      null,
      'select=*&order=created_at.desc'
    );
    if (data && Array.isArray(data)) {
      const formatted: PenerimaanMutasiStoreItem[] = data.map((item) => ({
        id: item.id,
        tanggal_diterima: item.tanggal_diterima || new Date().toISOString().split('T')[0],
        asal_store_id: item.asal_store_id || '',
        asal_store_nama: item.asal_store_nama || 'Store',
        deskripsi: item.deskripsi || '',
        qty: Number(item.qty || 0),
        satuan_qty: item.satuan_qty || 'Pcs',
        foto_urls: Array.isArray(item.foto_urls)
          ? item.foto_urls
          : typeof item.foto_urls === 'string' && item.foto_urls.startsWith('[')
          ? JSON.parse(item.foto_urls)
          : item.foto_urls
          ? [item.foto_urls]
          : [],
        lokasi_stamp:
          typeof item.lokasi_stamp === 'object' && item.lokasi_stamp !== null
            ? item.lokasi_stamp
            : typeof item.lokasi_stamp === 'string' && item.lokasi_stamp.startsWith('{')
            ? JSON.parse(item.lokasi_stamp)
            : undefined,
        pic_nama: item.pic_nama || '',
        pic_username: item.pic_username || '',
        timestamp_input: item.timestamp_input || item.created_at,
        keterangan: item.keterangan || '',
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
      localStorage.setItem(LOCAL_STORAGE_MUTASI_STORE, JSON.stringify(formatted));
      return formatted;
    }
  } catch (err) {
    console.warn('Gagal fetch penerimaan_mutasi_store dari Supabase, fallback ke cache:', err);
  }

  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_MUTASI_STORE);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}

  return [];
}

export async function saveMutasiStore(
  payload: PenerimaanMutasiStoreItem
): Promise<{ success: boolean; data?: PenerimaanMutasiStoreItem; message: string }> {
  const recordToSave = {
    ...payload,
    id: payload.id || undefined,
    tanggal_diterima: payload.tanggal_diterima || new Date().toISOString().split('T')[0],
    qty: Number(payload.qty || 1),
    satuan_qty: payload.satuan_qty || 'Pcs',
    foto_urls: payload.foto_urls || [],
    lokasi_stamp: payload.lokasi_stamp || {},
    timestamp_input: payload.timestamp_input || new Date().toISOString(),
    created_at: payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    if (payload.id) {
      await supabaseFetch(
        'penerimaan_mutasi_store',
        'PATCH',
        recordToSave,
        `id=eq.${payload.id}`
      );
    } else {
      await supabaseFetch('penerimaan_mutasi_store', 'POST', [recordToSave]);
    }

    // Refresh local cache
    const currentList = await fetchMutasiStoreList();
    return { success: true, message: 'Data mutasi store berhasil disimpan!', data: recordToSave };
  } catch (err: any) {
    console.warn('Save to Supabase error, updating local cache:', err);
    // Offline local save
    try {
      const localList: PenerimaanMutasiStoreItem[] = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_MUTASI_STORE) || '[]'
      );
      const generatedId = payload.id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newRecord = { ...recordToSave, id: generatedId };
      const index = localList.findIndex((i) => i.id === generatedId);
      if (index >= 0) {
        localList[index] = newRecord;
      } else {
        localList.unshift(newRecord);
      }
      localStorage.setItem(LOCAL_STORAGE_MUTASI_STORE, JSON.stringify(localList));
      return { success: true, message: 'Tersimpan secara lokal (offline fallback).', data: newRecord };
    } catch (e: any) {
      return { success: false, message: e.message || 'Gagal menyimpan data.' };
    }
  }
}

export async function deleteMutasiStore(id: string): Promise<{ success: boolean; message: string }> {
  try {
    await supabaseFetch('penerimaan_mutasi_store', 'DELETE', null, `id=eq.${id}`);
  } catch (err) {
    console.warn('Delete in Supabase failed, removing from local cache:', err);
  }

  try {
    const localList: PenerimaanMutasiStoreItem[] = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_MUTASI_STORE) || '[]'
    );
    const filtered = localList.filter((i) => i.id !== id);
    localStorage.setItem(LOCAL_STORAGE_MUTASI_STORE, JSON.stringify(filtered));
    return { success: true, message: 'Laporan mutasi store berhasil dihapus.' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal menghapus data.' };
  }
}

// ==============================================================================
// 2. PENERIMAAN PAKET (DARI EKSPEDISI)
// ==============================================================================

export async function fetchPenerimaanPaketList(): Promise<PenerimaanPaketItem[]> {
  try {
    const data = await supabaseFetch<any[]>(
      'penerimaan_paket',
      'GET',
      null,
      'select=*&order=created_at.desc'
    );
    if (data && Array.isArray(data)) {
      const formatted: PenerimaanPaketItem[] = data.map((item) => ({
        id: item.id,
        tanggal_diterima: item.tanggal_diterima || new Date().toISOString().split('T')[0],
        ekspedisi: item.ekspedisi || 'J&T Express',
        no_resi: item.no_resi || '',
        qty_paket: Number(item.qty_paket || 1),
        foto_urls: Array.isArray(item.foto_urls)
          ? item.foto_urls
          : typeof item.foto_urls === 'string' && item.foto_urls.startsWith('[')
          ? JSON.parse(item.foto_urls)
          : item.foto_urls
          ? [item.foto_urls]
          : [],
        lokasi_stamp:
          typeof item.lokasi_stamp === 'object' && item.lokasi_stamp !== null
            ? item.lokasi_stamp
            : typeof item.lokasi_stamp === 'string' && item.lokasi_stamp.startsWith('{')
            ? JSON.parse(item.lokasi_stamp)
            : undefined,
        pic_nama: item.pic_nama || '',
        pic_username: item.pic_username || '',
        timestamp_input: item.timestamp_input || item.created_at,
        keterangan: item.keterangan || '',
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
      localStorage.setItem(LOCAL_STORAGE_PAKET, JSON.stringify(formatted));
      return formatted;
    }
  } catch (err) {
    console.warn('Gagal fetch penerimaan_paket dari Supabase, fallback ke cache:', err);
  }

  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_PAKET);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}

  return [];
}

export async function savePenerimaanPaket(
  payload: PenerimaanPaketItem
): Promise<{ success: boolean; data?: PenerimaanPaketItem; message: string }> {
  const recordToSave = {
    ...payload,
    id: payload.id || undefined,
    tanggal_diterima: payload.tanggal_diterima || new Date().toISOString().split('T')[0],
    qty_paket: Number(payload.qty_paket || 1),
    foto_urls: payload.foto_urls || [],
    lokasi_stamp: payload.lokasi_stamp || {},
    timestamp_input: payload.timestamp_input || new Date().toISOString(),
    created_at: payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    if (payload.id) {
      await supabaseFetch('penerimaan_paket', 'PATCH', recordToSave, `id=eq.${payload.id}`);
    } else {
      await supabaseFetch('penerimaan_paket', 'POST', [recordToSave]);
    }

    await fetchPenerimaanPaketList();
    return { success: true, message: 'Data penerimaan paket berhasil disimpan!', data: recordToSave };
  } catch (err: any) {
    console.warn('Save to Supabase error, updating local cache:', err);
    try {
      const localList: PenerimaanPaketItem[] = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_PAKET) || '[]'
      );
      const generatedId = payload.id || `local_pkt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newRecord = { ...recordToSave, id: generatedId };
      const index = localList.findIndex((i) => i.id === generatedId);
      if (index >= 0) {
        localList[index] = newRecord;
      } else {
        localList.unshift(newRecord);
      }
      localStorage.setItem(LOCAL_STORAGE_PAKET, JSON.stringify(localList));
      return { success: true, message: 'Tersimpan secara lokal (offline fallback).', data: newRecord };
    } catch (e: any) {
      return { success: false, message: e.message || 'Gagal menyimpan data.' };
    }
  }
}

export async function deletePenerimaanPaket(id: string): Promise<{ success: boolean; message: string }> {
  try {
    await supabaseFetch('penerimaan_paket', 'DELETE', null, `id=eq.${id}`);
  } catch (err) {
    console.warn('Delete in Supabase failed, removing from local cache:', err);
  }

  try {
    const localList: PenerimaanPaketItem[] = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_PAKET) || '[]'
    );
    const filtered = localList.filter((i) => i.id !== id);
    localStorage.setItem(LOCAL_STORAGE_PAKET, JSON.stringify(filtered));
    return { success: true, message: 'Laporan penerimaan paket berhasil dihapus.' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal menghapus data.' };
  }
}

// ==============================================================================
// 3. MASTER DAFTAR EKSPEDISI (TAMBAH / EDIT / HAPUS)
// ==============================================================================

export async function fetchEkspedisiList(): Promise<string[]> {
  try {
    const data = await supabaseFetch<any[]>('ekspedisi_config', 'GET', null, 'select=*&order=nama.asc');
    if (data && Array.isArray(data) && data.length > 0) {
      const list = data.map((d) => d.nama).filter(Boolean);
      localStorage.setItem(LOCAL_STORAGE_EKSPEDISI, JSON.stringify(list));
      return list;
    }
  } catch (err) {
    console.warn('Fetch ekspedisi_config error, fallback ke cache/default:', err);
  }

  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_EKSPEDISI);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  return DEFAULT_EKSPEDISI;
}

export async function saveEkspedisi(namaEkspedisi: string): Promise<{ success: boolean; message: string }> {
  const cleanName = namaEkspedisi.trim();
  if (!cleanName) return { success: false, message: 'Nama ekspedisi tidak boleh kosong' };

  try {
    await supabaseFetch('ekspedisi_config', 'POST', [
      { nama: cleanName, is_active: true, created_at: new Date().toISOString() },
    ]);
  } catch (err) {
    console.warn('Supabase save ekspedisi error, updating local:', err);
  }

  try {
    const current = await fetchEkspedisiList();
    if (!current.includes(cleanName)) {
      current.push(cleanName);
      localStorage.setItem(LOCAL_STORAGE_EKSPEDISI, JSON.stringify(current));
    }
    return { success: true, message: `Ekspedisi "${cleanName}" berhasil ditambahkan.` };
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal menyimpan ekspedisi.' };
  }
}

export async function deleteEkspedisi(namaEkspedisi: string): Promise<{ success: boolean; message: string }> {
  try {
    await supabaseFetch('ekspedisi_config', 'DELETE', null, `nama=eq.${encodeURIComponent(namaEkspedisi)}`);
  } catch (err) {
    console.warn('Supabase delete ekspedisi error:', err);
  }

  try {
    const current = await fetchEkspedisiList();
    const filtered = current.filter((item) => item !== namaEkspedisi);
    localStorage.setItem(LOCAL_STORAGE_EKSPEDISI, JSON.stringify(filtered));
    return { success: true, message: `Ekspedisi "${namaEkspedisi}" berhasil dihapus.` };
  } catch (e: any) {
    return { success: false, message: e.message || 'Gagal menghapus ekspedisi.' };
  }
}

// Re-export store functions from gasManualShipment for convenient uniform import
export { fetchOutlets, saveOutlet, deleteOutlet, DEFAULT_OUTLETS };

// ==============================================================================
// 4. WATERMARK CANVAS STAMPER (TIMESTAMP + GPS LOCATION + PIC)
// ==============================================================================

export interface WatermarkOptions {
  title: string;
  timestampStr?: string;
  location?: LocationStamp;
  picName: string;
  picUsername?: string;
  entityName?: string; // Nama Store atau Nama Ekspedisi
  qtyInfo?: string;
}

export async function applyPhotoWatermark(
  imageSource: string,
  options: WatermarkOptions
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Create canvas with max dimension 1600px for high quality yet lightweight
      const maxDim = 1600;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(imageSource);
        return;
      }

      // Draw base image
      ctx.drawImage(img, 0, 0, width, height);

      // Calculate scale factor relative to standard 1080p
      const scale = Math.max(0.6, Math.min(1.8, width / 1000));
      const padding = 20 * scale;
      const fontSizeTitle = Math.round(20 * scale);
      const fontSizeBody = Math.round(15 * scale);
      const lineHeight = Math.round(24 * scale);

      // Date format
      const dateNow = new Date();
      const dateFormatted =
        options.timestampStr ||
        `${dateNow.getDate()} ${dateNow.toLocaleString('id-ID', { month: 'short' })} ${dateNow.getFullYear()} • ${String(
          dateNow.getHours()
        ).padStart(2, '0')}:${String(dateNow.getMinutes()).padStart(2, '0')}:${String(
          dateNow.getSeconds()
        ).padStart(2, '0')} WIB`;

      // GPS location string
      let locationText = '';
      if (options.location && options.location.latitude && options.location.longitude) {
        const lat = options.location.latitude.toFixed(6);
        const lng = options.location.longitude.toFixed(6);
        const acc = options.location.accuracy ? ` (±${Math.round(options.location.accuracy)}m)` : '';
        locationText = `📍 GPS: ${lat}, ${lng}${acc}`;
      } else {
        locationText = '📍 Lokasi: WMS Loading Dock Warehouse';
      }

      // Prepare text lines
      const line1 = `📦 ${options.title.toUpperCase()} ${options.entityName ? `• ${options.entityName}` : ''}`;
      const line2 = `📅 ${dateFormatted} | 👤 PIC: ${options.picName || 'Operator'} (${options.picUsername || 'user'})`;
      const line3 = `${locationText} ${options.qtyInfo ? `| Qty: ${options.qtyInfo}` : ''}`;

      const lines = [line1, line2, line3];

      // Draw bottom backdrop card with rounded top corners
      const cardHeight = lines.length * lineHeight + padding * 2.2;
      const cardY = height - cardHeight;

      // Dark translucent gradient background
      const gradient = ctx.createLinearGradient(0, cardY, 0, height);
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0.88)');
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0.98)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, cardY, width, cardHeight);

      // Top highlight border on watermark bar
      ctx.fillStyle = 'rgba(59, 130, 246, 0.8)'; // Brand blue accent
      ctx.fillRect(0, cardY, width, 3 * scale);

      // Render Text
      ctx.textBaseline = 'top';

      // Line 1: Title (Bold Cyan/White)
      ctx.font = `bold ${fontSizeTitle}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#38bdf8'; // Cyan accent
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText(line1, padding, cardY + padding * 0.8);

      // Line 2: Timestamp & PIC (Bright White)
      ctx.font = `600 ${fontSizeBody}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#f8fafc';
      ctx.shadowBlur = 3;
      ctx.fillText(line2, padding, cardY + padding * 0.8 + lineHeight * 1.1);

      // Line 3: Location (Emerald / Slate)
      ctx.font = `500 ${fontSizeBody}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = '#4ade80'; // Emerald accent for GPS
      ctx.shadowBlur = 3;
      ctx.fillText(line3, padding, cardY + padding * 0.8 + lineHeight * 2.1);

      // Convert back to JPEG data URL
      try {
        const watermarkedUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(watermarkedUrl);
      } catch (err) {
        console.warn('Canvas toDataURL failed:', err);
        resolve(imageSource);
      }
    };

    img.onerror = () => {
      resolve(imageSource);
    };

    img.src = imageSource;
  });
}
