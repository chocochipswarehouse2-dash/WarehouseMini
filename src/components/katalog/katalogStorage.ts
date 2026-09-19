import { KatalogBatch, KatalogItem } from '../../types';
import { saveWmsSettings, fetchWmsSettings } from '../../services/settings';
import initial325bData from '../../data/initialKatalog325b.json';
import { getSupabaseClient } from '../../services/supabase';


export const KATALOG_STORAGE_KEY = 'wms_katalog_manual_data';

// Helper kompresi gambar Data URI ke canvas agar hemat storage (<40KB per gambar)
export async function compressImageDataUri(dataUri: string, maxWidth = 700, quality = 0.8): Promise<string> {
  if (!dataUri || !dataUri.startsWith('data:image')) {
    return dataUri;
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUri);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.onerror = () => resolve(dataUri);
      img.src = dataUri;
    } catch {
      resolve(dataUri);
    }
  });
}

// Konversi data tersimpan ke list KatalogBatch
export function parseStoredKatalogBatches(rawStr: string | null | undefined): KatalogBatch[] {
  if (!rawStr || !rawStr.trim()) return [];
  try {
    const parsed = JSON.parse(rawStr);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    // Format Baru: Array of KatalogBatch ({ id, name, items: [...] })
    if ('items' in parsed[0] && 'name' in parsed[0]) {
      return parsed.map((b: any, idx: number) => ({
        id: b.id || `batch-${idx + 1}`,
        name: b.name || `Katalog ${idx + 1}`,
        description: b.description || '',
        publish_online: b.publish_online || '',
        publish_offline: b.publish_offline || '',
        created_at: b.created_at || new Date().toISOString(),
        updated_at: b.updated_at,
        is_hidden: Boolean(b.is_hidden),
        items: (b.items || []).map((it: any) => ({
          ...it,
          catalog_id: it.catalog_id || b.id || `batch-${idx + 1}`,
          catalog_name: it.catalog_name || b.name || `Katalog ${idx + 1}`,
          is_hidden: Boolean(it.is_hidden),
          publish_online: it.publish_online || '',
          publish_offline: it.publish_offline || '',
        })),
      }));
    }

    // Format Lama: Flat array of KatalogItem -> Bungkus ke batch default "325 B"
    const defaultBatch: KatalogBatch = {
      id: 'batch-325b',
      name: '325 B',
      created_at: new Date().toISOString(),
      is_hidden: false,
      items: parsed.map((it: any) => ({
        ...it,
        catalog_id: 'batch-325b',
        catalog_name: it.catalog_name || '325 B',
        is_hidden: Boolean(it.is_hidden),
        publish_online: it.publish_online || '',
        publish_offline: it.publish_offline || '',
      })),
    };
    return [defaultBatch];
  } catch (err) {
    console.error('Error parsing stored katalog batches:', err);
    return [];
  }
}

// Dapatkan batch default dari initial325b.json
export function getDefaultInitialBatch(): KatalogBatch {
  const items = (initial325bData as KatalogItem[]).map((it) => ({
    ...it,
    catalog_id: 'batch-325b',
    catalog_name: '325 B',
  }));

  return {
    id: 'batch-325b',
    name: '325 B',
    created_at: '2026-09-18T00:00:00.000Z',
    items,
  };
}

// Simpan list batches ke Supabase Cloud dan LocalStorage
export async function persistKatalogBatches(batches: KatalogBatch[]): Promise<boolean> {
  const jsonStr = JSON.stringify(batches);

  // 1. Simpan ke LocalStorage (lengkap dengan URL)
  try {
    localStorage.setItem(KATALOG_STORAGE_KEY, jsonStr);
  } catch (lsErr) {
    console.warn('LocalStorage save failed, trying fallback:', lsErr);
  }

  // 2. Simpan ke Supabase Cloud (tabel wms_katalog)
  // PASTI-KAN TIDAK ADA GAMBAR BASE64 YANG TERSIMPAN DI SUPABASE
  try {
    const client = getSupabaseClient();
    
    // Transform batches to rows
    const rowsToUpsert: any[] = [];
    batches.forEach((b) => {
      b.items.forEach((it) => {
        rowsToUpsert.push({
          id: it.id,
          catalog_id: b.id,
          catalog_name: b.name,
          nomor: it.nomor,
          deskripsi: it.deskripsi,
          price: String(it.price || ''),
          variants: it.variants || [],
          image_url: (it.image_url && it.image_url.startsWith('data:image')) ? '' : it.image_url,
          publish_online: it.publish_online || null,
          publish_offline: it.publish_offline || null,
          is_hidden: it.is_hidden || false,
        });
      });
    });

    if (rowsToUpsert.length > 0) {
      // Upsert ke wms_katalog (update on conflict ID)
      const { error } = await client.from('wms_katalog').upsert(rowsToUpsert, { onConflict: 'id' });
      if (error) throw error;

      // Bersihkan row yang sudah dihapus dari Supabase
      const activeIds = rowsToUpsert.map((r) => r.id);
      const { data: existingRows } = await client.from('wms_katalog').select('id');
      if (existingRows && existingRows.length > 0) {
        const idsToDelete = existingRows
          .map((r: any) => r.id)
          .filter((id: string) => !activeIds.includes(id));
        if (idsToDelete.length > 0) {
          for (let i = 0; i < idsToDelete.length; i += 50) {
            const chunk = idsToDelete.slice(i, i + 50);
            await client.from('wms_katalog').delete().in('id', chunk);
          }
        }
      }
    } else {
      // Jika semua item dihapus
      await client.from('wms_katalog').delete().neq('id', 'dummy-never-exists');
    }
    return true;
  } catch (cloudErr) {
    console.error('Supabase cloud save error for wms_katalog:', cloudErr);
    return false;
  }
}

// Ambil list batches dari Cloud atau LocalStorage
export async function loadKatalogBatches(): Promise<KatalogBatch[]> {
  // Ambil data lokal terlebih dahulu untuk sinkronisasi batch kosong
  let localBatches: KatalogBatch[] = [];
  const localStr = localStorage.getItem(KATALOG_STORAGE_KEY);
  if (localStr) {
    localBatches = parseStoredKatalogBatches(localStr);
  }

  try {
    const client = getSupabaseClient();
    const { data, error } = await client.from('wms_katalog').select('*').order('created_at', { ascending: true });
    
    if (!error && data && data.length > 0) {
      // Transform rows back to batches
      const batchMap = new Map<string, KatalogBatch>();

      // Masukkan kerangka batch dari local storage jika ada (misal batch kosong)
      localBatches.forEach((lb) => {
        batchMap.set(lb.id, {
          id: lb.id,
          name: lb.name,
          created_at: lb.created_at,
          updated_at: lb.updated_at,
          is_hidden: lb.is_hidden,
          items: [],
        });
      });
      
      data.forEach((row: any) => {
        const batchId = row.catalog_id || 'batch-325b';
        const batchName = row.catalog_name || 'Katalog';
        
        if (!batchMap.has(batchId)) {
          batchMap.set(batchId, {
            id: batchId,
            name: batchName,
            created_at: row.created_at || new Date().toISOString(),
            items: []
          });
        }
        
        // Ambil image_url lokal jika di cloud kosong tapi di lokal ada
        let rowImg = row.image_url || '';
        if (!rowImg) {
          const matchedLocalBatch = localBatches.find((b) => b.id === batchId);
          const matchedLocalItem = matchedLocalBatch?.items.find((it) => it.id === row.id);
          if (matchedLocalItem?.image_url) {
            rowImg = matchedLocalItem.image_url;
          }
        }

        batchMap.get(batchId)!.items.push({
          id: row.id,
          nomor: row.nomor || '',
          deskripsi: row.deskripsi || '',
          price: row.price || '',
          variants: row.variants || [],
          image_url: rowImg,
          catalog_id: batchId,
          catalog_name: batchName,
          is_hidden: row.is_hidden || false,
          publish_online: row.publish_online || '',
          publish_offline: row.publish_offline || '',
        });
      });
      
      const fromCloud = Array.from(batchMap.values());
      
      // Simpan mirror ke local storage
      try {
        localStorage.setItem(KATALOG_STORAGE_KEY, JSON.stringify(fromCloud));
      } catch {}
      return fromCloud;
    }
  } catch (err) {
    console.warn('Gagal fetch cloud katalog, mencoba local storage:', err);
  }

  // Fallback LocalStorage
  if (localBatches.length > 0) {
    return localBatches;
  }

  // Fallback Default: data 325B
  const defaultBatch = getDefaultInitialBatch();
  persistKatalogBatches([defaultBatch]).catch(() => {});
  return [defaultBatch];
}

// Helper ekstraksi nama dari nama file Excel (misal: "UPLOAD 325B OFFLINE.xlsx" -> "325 B")
export function extractCatalogNameFromFilename(filename: string): string {
  if (!filename) return 'Katalog Baru';
  const clean = filename.replace(/\.[^/.]+$/, ''); // Hapus ekstensi .xlsx
  
  // Deteksi pola "325B", "325 B", "326 B", dll.
  const match = clean.match(/(\d+\s*[A-Za-z]+|\d+)/i);
  if (match) {
    // Format "325B" jadi "325 B"
    const val = match[1].trim();
    const formatted = val.replace(/(\d+)([a-zA-Z]+)/, '$1 $2').toUpperCase();
    return formatted;
  }
  
  return clean.replace(/upload|katalog|offline|master/gi, '').trim() || clean;
}
