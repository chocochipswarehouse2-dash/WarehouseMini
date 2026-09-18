import { KatalogBatch, KatalogItem } from '../types';
import { uploadImageToGdrive } from './gdriveUpload';
import { compressImageDataUri } from '../components/katalog/katalogStorage';

export interface UploadProgressCallback {
  (current: number, total: number, itemName: string): void;
}

/**
 * Memeriksa apakah string adalah data base64 (data:image/...)
 */
export function isBase64DataUrl(str: string | null | undefined): boolean {
  if (!str) return false;
  return typeof str === 'string' && str.startsWith('data:image');
}

/**
 * Upload satu foto produk katalog (Base64 atau file) ke Google Drive
 * Mengembalikan direct CDN Google Drive URL (lh3.googleusercontent.com/d/...)
 */
export async function uploadKatalogImageToGdrive(
  imageSource: string,
  productName: string,
  catalogName = 'Katalog'
): Promise<{ success: boolean; url: string; error?: string }> {
  if (!imageSource) {
    return { success: true, url: '' };
  }

  // Jika sudah berupa URL web (bukan base64), langsung gunakan
  if (!isBase64DataUrl(imageSource)) {
    return { success: true, url: imageSource };
  }

  try {
    // Kompresi terlebih dahulu agar hemat kuota upload & ringan di Google Drive
    const compressed = await compressImageDataUri(imageSource, 800, 0.8);
    const safeProdName = (productName || 'product')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const safeCatName = (catalogName || 'batch')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 15);
    const filename = `KATALOG_${safeCatName}_${safeProdName}_${Date.now()}.jpg`;

    const res = await uploadImageToGdrive(compressed, filename);
    if (res.success && res.url && !res.url.startsWith('data:')) {
      return { success: true, url: res.url };
    } else {
      return {
        success: false,
        url: imageSource,
        error: res.error || 'Gagal mengupload gambar ke Google Drive',
      };
    }
  } catch (err: any) {
    console.error('Error uploading catalog image to GDrive:', err);
    return {
      success: false,
      url: imageSource,
      error: err?.message || 'Error koneksi Google Drive',
    };
  }
}

/**
 * Migrasi batch items: Cari semua gambar yang masih berupa base64,
 * upload ke Google Drive via GAS, dan ganti dengan direct URL Google Drive.
 * Aman: Jika upload gagal, data tetap berjalan tanpa kehilangan referensi.
 */
export async function syncAndMigrateKatalogImagesToGdrive(
  batches: KatalogBatch[],
  onProgress?: UploadProgressCallback
): Promise<{ updatedBatches: KatalogBatch[]; migratedCount: number; errors: string[] }> {
  // 1. Kumpulkan semua item yang memiliki gambar base64
  const itemsToUpload: { batchId: string; itemId: string; name: string; catName: string; base64: string }[] = [];

  batches.forEach((b) => {
    b.items.forEach((it) => {
      if (isBase64DataUrl(it.image_url)) {
        itemsToUpload.push({
          batchId: b.id,
          itemId: it.id,
          name: it.deskripsi || 'Produk',
          catName: b.name || 'Katalog',
          base64: it.image_url!,
        });
      }
    });
  });

  if (itemsToUpload.length === 0) {
    return { updatedBatches: batches, migratedCount: 0, errors: [] };
  }

  let completed = 0;
  const total = itemsToUpload.length;
  const urlMap: Record<string, string> = {};
  const errors: string[] = [];

  // 2. Upload secara concurrent terkontrol (chunk of 2-3 to respect GAS rate limits)
  const chunkSize = 2;
  for (let i = 0; i < itemsToUpload.length; i += chunkSize) {
    const chunk = itemsToUpload.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (task) => {
        try {
          if (onProgress) {
            onProgress(completed + 1, total, task.name);
          }
          const res = await uploadKatalogImageToGdrive(task.base64, task.name, task.catName);
          if (res.success && res.url && !res.url.startsWith('data:')) {
            urlMap[task.itemId] = res.url;
          } else if (res.error) {
            errors.push(`${task.name}: ${res.error}`);
          }
        } catch (err: any) {
          errors.push(`${task.name}: ${err?.message || 'Gagal upload'}`);
        } finally {
          completed++;
        }
      })
    );
  }

  // 3. Gandakan state batches dengan URL Google Drive yang baru
  let migratedCount = 0;
  const updatedBatches = batches.map((b) => ({
    ...b,
    items: b.items.map((it) => {
      if (urlMap[it.id]) {
        migratedCount++;
        return { ...it, image_url: urlMap[it.id] };
      }
      return it;
    }),
  }));

  return { updatedBatches, migratedCount, errors };
}

/**
 * Membersihkan URL gambar base64 dari batch sebelum disimpan ke Supabase
 * jika pengguna secara eksplisit meminta Supabase bersih tanpa data gambar base64.
 * URL web/Google Drive tetap dipertahankan utuh.
 */
export function stripBase64ImagesForSupabase(batches: KatalogBatch[]): KatalogBatch[] {
  return batches.map((b) => ({
    ...b,
    items: b.items.map((it) => {
      if (isBase64DataUrl(it.image_url)) {
        // Jangan simpan base64 ke Supabase
        return { ...it, image_url: '' };
      }
      return it;
    }),
  }));
}
