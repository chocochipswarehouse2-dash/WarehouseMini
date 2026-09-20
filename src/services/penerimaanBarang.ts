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

// Default List Kategori Produk Mutasi Store
export const DEFAULT_KATEGORI_MUTASI_STORE: string[] = [
  'Tarikan MD',
  'Retur Reject',
  'Request',
  'Complementary',
  'Dokumen / Laporan',
  'Mutasi Antar Store',
  'Lainnya (Manual)',
];

const LOCAL_STORAGE_MUTASI_STORE = 'wms_penerimaan_mutasi_store_cache';
const LOCAL_STORAGE_PAKET = 'wms_penerimaan_paket_cache';
const LOCAL_STORAGE_EKSPEDISI = 'wms_ekspedisi_list_cache';
const LOCAL_STORAGE_KATEGORI_MUTASI = 'wms_kategori_mutasi_store_cache';

// ==============================================================================
// 1. KATEGORI MUTASI STORE MANAGEMENT (CRUD)
// ==============================================================================

export function fetchKategoriMutasiList(): string[] {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KATEGORI_MUTASI);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Gagal membaca cache kategori mutasi:', e);
  }
  return [...DEFAULT_KATEGORI_MUTASI_STORE];
}

export function saveKategoriMutasiList(categories: string[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KATEGORI_MUTASI, JSON.stringify(categories));
  } catch (e) {
    console.warn('Gagal menyimpan kategori mutasi ke cache:', e);
  }
}

export function addKategoriMutasi(newCategory: string): string[] {
  const clean = newCategory.trim();
  if (!clean) return fetchKategoriMutasiList();
  const current = fetchKategoriMutasiList();
  if (!current.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    const updated = [...current, clean];
    saveKategoriMutasiList(updated);
    return updated;
  }
  return current;
}

export function deleteKategoriMutasi(category: string): string[] {
  const current = fetchKategoriMutasiList();
  const updated = current.filter((c) => c !== category);
  saveKategoriMutasiList(updated.length > 0 ? updated : DEFAULT_KATEGORI_MUTASI_STORE);
  return updated.length > 0 ? updated : DEFAULT_KATEGORI_MUTASI_STORE;
}

export function updateKategoriMutasi(oldCategory: string, newCategory: string): string[] {
  const clean = newCategory.trim();
  if (!clean) return fetchKategoriMutasiList();
  const current = fetchKategoriMutasiList();
  const updated = current.map((c) => (c === oldCategory ? clean : c));
  saveKategoriMutasiList(updated);
  return updated;
}

// ==============================================================================
// 2. MUTASI STORE (PENERIMAAN DARI STORE)
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
        no_surat_jalan: item.no_surat_jalan || 'Tidak ada surat jalan',
        kategori_produk: item.kategori_produk || 'Mutasi Antar Store',
        up_tujuan: item.up_tujuan || 'Warehouse',
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
  const cleanSuratJalan =
    payload.no_surat_jalan && payload.no_surat_jalan.trim()
      ? payload.no_surat_jalan.trim()
      : 'Tidak ada surat jalan';

  const recordToSave = {
    ...payload,
    id: payload.id || undefined,
    tanggal_diterima: payload.tanggal_diterima || new Date().toISOString().split('T')[0],
    no_surat_jalan: cleanSuratJalan,
    kategori_produk: payload.kategori_produk || 'Mutasi Antar Store',
    up_tujuan: payload.up_tujuan || 'Warehouse',
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

export async function saveMutasiStoreBulk(
  payloads: PenerimaanMutasiStoreItem[]
): Promise<{ success: boolean; count: number; message: string }> {
  if (!payloads || payloads.length === 0) {
    return { success: false, count: 0, message: 'Tidak ada item yang disimpan.' };
  }

  const recordsToSave = payloads.map((payload) => {
    const cleanSuratJalan =
      payload.no_surat_jalan && payload.no_surat_jalan.trim()
        ? payload.no_surat_jalan.trim()
        : 'Tidak ada surat jalan';

    return {
      ...payload,
      id: payload.id || undefined,
      tanggal_diterima: payload.tanggal_diterima || new Date().toISOString().split('T')[0],
      no_surat_jalan: cleanSuratJalan,
      kategori_produk: payload.kategori_produk || 'Mutasi Antar Store',
      up_tujuan: payload.up_tujuan || 'Warehouse',
      qty: Number(payload.qty || 1),
      satuan_qty: payload.satuan_qty || 'Pcs',
      foto_urls: payload.foto_urls || [],
      lokasi_stamp: payload.lokasi_stamp || {},
      timestamp_input: payload.timestamp_input || new Date().toISOString(),
      created_at: payload.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  try {
    await supabaseFetch('penerimaan_mutasi_store', 'POST', recordsToSave);
    await fetchMutasiStoreList(); // Refresh cache
    return {
      success: true,
      count: recordsToSave.length,
      message: `${recordsToSave.length} laporan mutasi store berhasil disimpan!`,
    };
  } catch (err: any) {
    console.warn('Bulk save to Supabase error, updating local cache:', err);
    try {
      const localList: PenerimaanMutasiStoreItem[] = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_MUTASI_STORE) || '[]'
      );
      const withIds = recordsToSave.map((rec, i) => ({
        ...rec,
        id: rec.id || `local_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
      }));
      localList.unshift(...withIds);
      localStorage.setItem(LOCAL_STORAGE_MUTASI_STORE, JSON.stringify(localList));
      return {
        success: true,
        count: withIds.length,
        message: `${withIds.length} laporan tersimpan secara lokal (offline fallback).`,
      };
    } catch (e: any) {
      return { success: false, count: 0, message: e.message || 'Gagal menyimpan data.' };
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
  kategori?: string;
  noSuratJalan?: string;
  upTujuan?: string;
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

      // Calculate scale factor relative to reference width (designed to be very readable even on mobile)
      const scale = Math.max(0.85, Math.min(2.2, width / 900));
      const padding = Math.round(24 * scale);
      const fontSizeTitle = Math.round(28 * scale);
      const fontSizeHeading = Math.round(22 * scale);
      const fontSizeBody = Math.round(18 * scale);
      const lineHeight = Math.round(30 * scale);

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
        locationText = '📍 Lokasi: WMS Loading Dock Gudang';
      }

      // Prepare text lines for crisp display
      const lines: { text: string; font: string; color: string; isPill?: boolean }[] = [];

      // Line 1: Header (Title & Store / Ekspedisi)
      const titleEntity = `📦 ${options.title.toUpperCase()}${options.entityName ? ` : ${options.entityName}` : ''}`;
      lines.push({
        text: titleEntity,
        font: `bold ${fontSizeTitle}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
        color: '#38bdf8', // Bright Cyan
      });

      // Line 2: No Surat Jalan / Resi & Kategori
      const detailParts: string[] = [];
      if (options.noSuratJalan) {
        detailParts.push(`📄 SJ: ${options.noSuratJalan}`);
      }
      if (options.kategori) {
        detailParts.push(`🏷️ Kategori: ${options.kategori}`);
      }
      if (options.upTujuan) {
        detailParts.push(`🎯 UP: ${options.upTujuan}`);
      }
      if (options.qtyInfo) {
        detailParts.push(`🔢 Qty: ${options.qtyInfo}`);
      }

      if (detailParts.length > 0) {
        lines.push({
          text: detailParts.join('  |  '),
          font: `bold ${fontSizeHeading}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
          color: '#fbbf24', // Amber/Gold accent for high visibility
        });
      }

      // Line 3: Timestamp & PIC
      lines.push({
        text: `📅 ${dateFormatted}  |  👤 PIC: ${options.picName || 'Petugas'} (@${options.picUsername || 'operator'})`,
        font: `600 ${fontSizeBody}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
        color: '#f8fafc', // Pure Crisp White
      });

      // Line 4: Location
      lines.push({
        text: locationText,
        font: `600 ${fontSizeBody}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
        color: '#4ade80', // Emerald Green
      });

      // Draw bottom backdrop card with rounded top corners
      const cardHeight = lines.length * lineHeight + padding * 2;
      const cardY = height - cardHeight;

      // Dark solid gradient background for guaranteed 100% legibility
      const gradient = ctx.createLinearGradient(0, cardY, 0, height);
      gradient.addColorStop(0, 'rgba(10, 15, 29, 0.94)');
      gradient.addColorStop(1, 'rgba(5, 8, 16, 0.98)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, cardY, width, cardHeight);

      // Top highlight border on watermark bar
      ctx.fillStyle = '#0284c7'; // Primary blue bar
      ctx.fillRect(0, cardY, width, Math.max(4, Math.round(4 * scale)));

      // Render Text lines
      ctx.textBaseline = 'top';
      let currentY = cardY + padding * 0.7;

      lines.forEach((line) => {
        ctx.font = line.font;
        ctx.fillStyle = line.color;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 6 * scale;
        ctx.fillText(line.text, padding, currentY);
        currentY += lineHeight;
      });

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
