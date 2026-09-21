import { KatalogBatch, KatalogItem } from '../../types';
import { saveWmsSettings, fetchWmsSettings } from '../../services/settings';
import initial325bData from '../../data/initialKatalog325b.json';
import { getSupabaseClient } from '../../services/supabase';
import { syncAndMigrateKatalogImagesToGdrive } from '../../services/katalogGdrive';


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
  let activeBatches = batches;

  // 1. Otomatis upload semua gambar base64 ke Google Drive terlebih dahulu
  const hasBase64 = activeBatches.some((b) =>
    b.items.some((it) => it.image_url && it.image_url.startsWith('data:image'))
  );

  if (hasBase64) {
    try {
      const gdriveRes = await syncAndMigrateKatalogImagesToGdrive(activeBatches);
      if (gdriveRes && gdriveRes.updatedBatches) {
        activeBatches = gdriveRes.updatedBatches;
      }
    } catch (gdriveErr) {
      console.warn('Otomatis upload foto ke Google Drive gagal, melanjutkan dengan URL/base64 cache:', gdriveErr);
    }
  }

  const jsonStr = JSON.stringify(activeBatches);

  // 2. Simpan ke LocalStorage
  try {
    localStorage.setItem(KATALOG_STORAGE_KEY, jsonStr);
  } catch (lsErr) {
    console.warn('LocalStorage save failed, trying fallback:', lsErr);
  }

  // 3. Simpan snapshot struktur katalog ke Supabase wms_settings (Sinkronisasi Cloud Terpadu)
  try {
    await saveWmsSettings({ katalog_manual_data: jsonStr });
  } catch (settingsErr) {
    console.warn('Gagal simpan snapshot katalog ke wms_settings:', settingsErr);
  }

  // 4. Simpan ke Supabase Cloud (tabel wms_katalog baris per baris)
  try {
    const client = getSupabaseClient();
    
    // Transform batches to rows
    const rowsToUpsert: any[] = [];
    activeBatches.forEach((b) => {
      b.items.forEach((it) => {
        rowsToUpsert.push({
          id: it.id,
          catalog_id: b.id,
          catalog_name: b.name,
          catalog_description: b.description || '',
          catalog_publish_online: b.publish_online || '',
          catalog_publish_offline: b.publish_offline || '',
          nomor: it.nomor || '',
          deskripsi: it.deskripsi || '',
          price: String(it.price || ''),
          variants: it.variants || [],
          image_url: it.image_url || '',
          publish_online: it.publish_online || '',
          publish_offline: it.publish_offline || '',
          is_hidden: it.is_hidden || false,
        });
      });
    });

    if (rowsToUpsert.length > 0) {
      // Upsert ke wms_katalog (update on conflict ID)
      let upsertRes = await client.from('wms_katalog').upsert(rowsToUpsert, { onConflict: 'id' });
      
      // Jika gagal karena kolom belum ada di schema DB Supabase tertentu, coba fallback bertahap
      if (upsertRes.error) {
        console.warn('Upsert wms_katalog lengkap gagal, mencoba fallback struktur dasar:', upsertRes.error);
        
        // Fallback 1: Dengan publish_online & publish_offline tanpa catalog_* metadata
        const fallback1Rows = rowsToUpsert.map((r) => ({
          id: r.id,
          catalog_id: r.catalog_id,
          catalog_name: r.catalog_name,
          nomor: r.nomor,
          deskripsi: r.deskripsi,
          price: r.price,
          variants: r.variants,
          image_url: r.image_url,
          publish_online: r.publish_online,
          publish_offline: r.publish_offline,
          is_hidden: r.is_hidden,
        }));
        upsertRes = await client.from('wms_katalog').upsert(fallback1Rows, { onConflict: 'id' });

        // Fallback 2: Struktur dasar lama
        if (upsertRes.error) {
          const fallback2Rows = rowsToUpsert.map((r) => ({
            id: r.id,
            catalog_id: r.catalog_id,
            catalog_name: r.catalog_name,
            nomor: r.nomor,
            deskripsi: r.deskripsi,
            price: r.price,
            variants: r.variants,
            image_url: r.image_url,
            is_hidden: r.is_hidden,
          }));
          await client.from('wms_katalog').upsert(fallback2Rows, { onConflict: 'id' });
        }
      }

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
    return true;
  }
}

// Ambil list batches dari Cloud atau LocalStorage
export async function loadKatalogBatches(): Promise<KatalogBatch[]> {
  // 1. Ambil data lokal terlebih dahulu sebagai fallback instan
  let localBatches: KatalogBatch[] = [];
  const localStr = localStorage.getItem(KATALOG_STORAGE_KEY);
  if (localStr) {
    localBatches = parseStoredKatalogBatches(localStr);
  }

  // 2. Query Supabase secara PARALEL untuk kecepatan maksimum
  let cloudSettingsBatches: KatalogBatch[] = [];
  let tableRows: any[] | null = null;

  try {
    const client = getSupabaseClient();
    const [settingsRes, catalogRes] = await Promise.allSettled([
      fetchWmsSettings(true),
      client.from('wms_katalog').select('*').order('created_at', { ascending: true }),
    ]);

    if (settingsRes.status === 'fulfilled' && settingsRes.value?.katalog_manual_data) {
      cloudSettingsBatches = parseStoredKatalogBatches(settingsRes.value.katalog_manual_data);
    }

    if (catalogRes.status === 'fulfilled' && !catalogRes.value.error && catalogRes.value.data) {
      tableRows = catalogRes.value.data;
    }
  } catch (err) {
    console.warn('Fetch Supabase paralel gagal:', err);
  }

  // 3. Jika data tabel wms_katalog ada dari Supabase, rakit batch
  if (tableRows && tableRows.length > 0) {
    const batchMap = new Map<string, KatalogBatch>();
    const sourceBatches = cloudSettingsBatches.length > 0 ? cloudSettingsBatches : localBatches;

    sourceBatches.forEach((sb) => {
      batchMap.set(sb.id, {
        id: sb.id,
        name: sb.name,
        description: sb.description || '',
        publish_online: sb.publish_online || '',
        publish_offline: sb.publish_offline || '',
        created_at: sb.created_at || new Date().toISOString(),
        updated_at: sb.updated_at,
        is_hidden: sb.is_hidden || false,
        items: [],
      });
    });

    tableRows.forEach((row: any) => {
      const batchId = row.catalog_id || 'batch-325b';
      const batchName = row.catalog_name || 'Katalog';

      if (!batchMap.has(batchId)) {
        batchMap.set(batchId, {
          id: batchId,
          name: batchName,
          description: row.catalog_description || '',
          publish_online: row.catalog_publish_online || '',
          publish_offline: row.catalog_publish_offline || '',
          created_at: row.created_at || new Date().toISOString(),
          is_hidden: Boolean(row.is_hidden),
          items: [],
        });
      }

      const b = batchMap.get(batchId)!;
      if (!b.description && row.catalog_description) b.description = row.catalog_description;
      if (!b.publish_online && row.catalog_publish_online) b.publish_online = row.catalog_publish_online;
      if (!b.publish_offline && row.catalog_publish_offline) b.publish_offline = row.catalog_publish_offline;

      let rowImg = row.image_url || '';
      if (!rowImg) {
        const matchedBatch = sourceBatches.find((sb) => sb.id === batchId) || localBatches.find((lb) => lb.id === batchId);
        const matchedItem = matchedBatch?.items.find((it) => it.id === row.id);
        if (matchedItem?.image_url) {
          rowImg = matchedItem.image_url;
        }
      }

      let itemOnline = row.publish_online || '';
      let itemOffline = row.publish_offline || '';
      if (!itemOnline || !itemOffline) {
        const matchedBatch = sourceBatches.find((sb) => sb.id === batchId);
        const matchedItem = matchedBatch?.items.find((it) => it.id === row.id);
        if (!itemOnline && matchedItem?.publish_online) itemOnline = matchedItem.publish_online;
        if (!itemOffline && matchedItem?.publish_offline) itemOffline = matchedItem.publish_offline;
      }

      b.items.push({
        id: row.id,
        nomor: row.nomor || '',
        deskripsi: row.deskripsi || '',
        price: row.price || '',
        variants: row.variants || [],
        image_url: rowImg,
        catalog_id: batchId,
        catalog_name: batchName,
        is_hidden: row.is_hidden || false,
        publish_online: itemOnline,
        publish_offline: itemOffline,
      });
    });

    const fromCloud = Array.from(batchMap.values());
    try {
      localStorage.setItem(KATALOG_STORAGE_KEY, JSON.stringify(fromCloud));
    } catch {}
    return fromCloud;
  }

  // Fallback 1: Cloud Settings Snapshot dari wms_settings
  if (cloudSettingsBatches.length > 0) {
    try {
      localStorage.setItem(KATALOG_STORAGE_KEY, JSON.stringify(cloudSettingsBatches));
    } catch {}
    return cloudSettingsBatches;
  }

  // Fallback 2: LocalStorage
  if (localBatches.length > 0) {
    return localBatches;
  }

  // Fallback 3: Default initial data 325B
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
