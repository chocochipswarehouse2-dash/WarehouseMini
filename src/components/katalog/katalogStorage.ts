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
        created_at: b.created_at || new Date().toISOString(),
        updated_at: b.updated_at,
        is_hidden: Boolean(b.is_hidden),
        items: (b.items || []).map((it: any) => ({
          ...it,
          catalog_id: it.catalog_id || b.id || `batch-${idx + 1}`,
          catalog_name: it.catalog_name || b.name || `Katalog ${idx + 1}`,
          is_hidden: Boolean(it.is_hidden),
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
          is_hidden: it.is_hidden || false,
        });
      });
    });

    if (rowsToUpsert.length > 0) {
      // Upsert ke wms_katalog (update on conflict UUID)
      const { error } = await client.from('wms_katalog').upsert(rowsToUpsert, { onConflict: 'id' });
      if (error) throw error;
    }
    return true;
  } catch (cloudErr) {
    console.error('Supabase cloud save error for wms_katalog:', cloudErr);
    return false;
  }
}

// Ambil list batches dari Cloud atau LocalStorage
export async function loadKatalogBatches(): Promise<KatalogBatch[]> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.from('wms_katalog').select('*').order('created_at', { ascending: true });
    
    if (!error && data && data.length > 0) {
      // Transform rows back to batches
      const batchMap = new Map<string, KatalogBatch>();
      
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
        
        batchMap.get(batchId)!.items.push({
          id: row.id,
          nomor: row.nomor || '',
          deskripsi: row.deskripsi || '',
          price: row.price || '',
          variants: row.variants || [],
          image_url: row.image_url || '',
          catalog_id: batchId,
          catalog_name: batchName,
          is_hidden: row.is_hidden || false
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
  const localStr = localStorage.getItem(KATALOG_STORAGE_KEY);
  if (localStr) {
    const fromLocal = parseStoredKatalogBatches(localStr);
    if (fromLocal.length > 0) {
      return fromLocal;
    }
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
