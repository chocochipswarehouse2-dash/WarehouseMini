/**
 * Service untuk upload foto reject / QC ke Google Drive via Google Apps Script (GAS) Web App.
 * Menghindari beban Egress di Supabase dengan menyimpan gambar langsung di Google Drive
 * dan hanya menyimpan URL / File ID di database Supabase.
 */

export const DEFAULT_GDRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB';

export const DEFAULT_GDRIVE_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwnGgT-ekW7L-HIE2RGxuBZQl5gATB4fUFYO-SxwGS16p8_Kc28q91gnd5N-Y30bA8Q9w/exec';

/**
 * Ekstrak ID Folder dari URL Google Drive atau string ID langsung
 */
export function extractGdriveFolderId(urlOrId: string): string {
  if (!urlOrId) return '14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB';
  const clean = urlOrId.trim();
  // Format: https://drive.google.com/drive/folders/14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB
  const match = clean.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return match[1];

  // Format: https://drive.google.com/open?id=14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB
  const matchId = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId && matchId[1]) return matchId[1];

  // Jika berupa ID langsung tanpa URL
  if (/^[a-zA-Z0-9_-]{20,}$/.test(clean)) return clean;

  return '14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB';
}

/**
 * Ambil konfigurasi GDrive aktif dari LocalStorage
 */
export function getGdriveConfig(): { folderUrl: string; folderId: string; gasUrl: string } {
  const folderUrl =
    localStorage.getItem('wms_gdrive_folder_url') || DEFAULT_GDRIVE_FOLDER_URL;
  const gasUrl =
    localStorage.getItem('wms_gdrive_gas_url') || DEFAULT_GDRIVE_GAS_URL;
  const folderId = extractGdriveFolderId(folderUrl);

  return { folderUrl, folderId, gasUrl };
}

/**
 * Simpan konfigurasi GDrive ke LocalStorage
 */
export function saveGdriveConfig(folderUrl: string, gasUrl: string): void {
  localStorage.setItem('wms_gdrive_folder_url', folderUrl.trim());
  localStorage.setItem('wms_gdrive_gas_url', gasUrl.trim());
}

export interface GdriveUploadResult {
  success: boolean;
  url: string;
  fileId?: string;
  error?: string;
}

/**
 * Upload satu gambar (Base64 dataUrl) ke Google Drive via GAS
 */
export async function uploadImageToGdrive(
  base64Data: string,
  filename?: string
): Promise<GdriveUploadResult> {
  // Jika bukan base64 (sudah berupa URL web / http), tidak perlu diupload ulang
  if (!base64Data || !base64Data.startsWith('data:')) {
    return { success: true, url: base64Data };
  }

  const { folderId, gasUrl } = getGdriveConfig();

  if (!gasUrl) {
    return {
      success: false,
      url: base64Data,
      error: 'GAS Web App URL belum dikonfigurasi.',
    };
  }

  const generatedFilename =
    filename || `Reject_QC_${Date.now()}_${Math.floor(100 + Math.random() * 900)}.jpg`;

  try {
    const payload = {
      base64: base64Data,
      filename: generatedFilename,
      folderId: folderId,
    };

    const response = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const result = await response.json();

    if (result.status === 'success' && result.fileId) {
      // Format URL CDN langsung Google (sangat cepat, no-cookie, no egress Supabase)
      const directCdnUrl = `https://lh3.googleusercontent.com/d/${result.fileId}`;
      return {
        success: true,
        url: directCdnUrl,
        fileId: result.fileId,
      };
    } else {
      console.warn('GAS upload warning:', result.message || result);
      return {
        success: false,
        url: base64Data, // Fallback tetap gunakan dataUrl agar foto tidak hilang
        error: result.message || 'Gagal upload ke Google Drive',
      };
    }
  } catch (err: any) {
    console.warn('Gagal upload ke Google Drive via GAS, menggunakan fallback lokal:', err);
    return {
      success: false,
      url: base64Data, // Fallback ke dataUrl lokal
      error: err?.message || 'Koneksi ke GAS gagal',
    };
  }
}

/**
 * Upload beberapa foto sekaligus ke Google Drive
 * Mengembalikan array URL (Google Drive CDN jika sukses, atau base64 jika gagal)
 */
export async function uploadMultipleImagesToGdrive(
  dataUrls: string[],
  prefix = 'QC'
): Promise<string[]> {
  if (!dataUrls || dataUrls.length === 0) return [];

  const uploadPromises = dataUrls.map(async (dataUrl, idx) => {
    // Jika sudah URL http/https, abaikan
    if (!dataUrl.startsWith('data:')) return dataUrl;

    const fname = `${prefix}_${Date.now()}_${idx + 1}.jpg`;
    const res = await uploadImageToGdrive(dataUrl, fname);
    return res.url;
  });

  return Promise.all(uploadPromises);
}

/**
 * Test koneksi ke Google Apps Script dan Google Drive
 */
export async function testGdriveConnection(
  customGasUrl?: string,
  customFolderUrl?: string
): Promise<{ success: boolean; message: string; fileId?: string }> {
  const gasUrl = (customGasUrl || getGdriveConfig().gasUrl).trim();
  const folderId = extractGdriveFolderId(customFolderUrl || getGdriveConfig().folderUrl);

  if (!gasUrl) {
    return { success: false, message: 'URL Google Apps Script tidak boleh kosong.' };
  }

  // 1x1 transparent JPEG probe
  const probeBase64 =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({
        base64: probeBase64,
        filename: `probe_test_${Date.now()}.jpg`,
        folderId: folderId,
      }),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
    });

    const result = await response.json();

    if (result.status === 'success' && result.fileId) {
      return {
        success: true,
        message: 'Koneksi Google Drive & GAS Berhasil! Siap menyimpan foto reject.',
        fileId: result.fileId,
      };
    } else {
      const errMsg = result.message || 'Error tidak diketahui dari GAS.';
      if (errMsg.includes('Access denied: DriveApp')) {
        return {
          success: false,
          message:
            'Akses DriveApp Ditolak: Otorisasi Google Drive belum dijalankan di editor Apps Script Anda.',
        };
      }
      return {
        success: false,
        message: `GAS Error: ${errMsg}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal menghubungi Google Apps Script: ${err?.message || err}`,
    };
  }
}
