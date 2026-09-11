import { supabaseFetch } from './supabase';
import { WmsSettings } from '../types';

export const DEFAULT_GDRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB';

export const DEFAULT_GDRIVE_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwnGgT-ekW7L-HIE2RGxuBZQl5gATB4fUFYO-SxwGS16p8_Kc28q91gnd5N-Y30bA8Q9w/exec';

export const DEFAULT_MANUAL_SHIPMENT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwnGgT-ekW7L-HIE2RGxuBZQl5gATB4fUFYO-SxwGS16p8_Kc28q91gnd5N-Y30bA8Q9w/exec';

// In-memory cache for ultra-fast zero-latency access across components
let cachedSettings: WmsSettings | null = null;
let isFetchingPromise: Promise<WmsSettings | null> | null = null;

/**
 * Validasi dan bersihkan URL GAS jika merupakan URL script mati/404 lama
 */
function sanitizeManualShipmentGasUrl(url?: string): string {
  if (!url || !url.trim() || url.includes('AKfycbwqoG7_rD_kLdO48x4W0-3f4m2A-xK7eH9fQp_6_h3Y')) {
    return DEFAULT_MANUAL_SHIPMENT_GAS_URL;
  }
  return url.trim();
}

/**
 * Inisialisasi cache dari LocalStorage saat startup (0ms latency)
 */
function initCacheFromLocalStorage(): WmsSettings {
  if (cachedSettings) return cachedSettings;

  try {
    const gasEndpoint = localStorage.getItem('wms_gas_endpoint') || localStorage.getItem('wms_endpoint_url') || '';
    const storedManualGas = localStorage.getItem('wms_manual_shipment_gas_url') || '';
    const manualShipmentGas = sanitizeManualShipmentGasUrl(storedManualGas);
    if (storedManualGas !== manualShipmentGas) {
      localStorage.setItem('wms_manual_shipment_gas_url', manualShipmentGas);
    }

    const gdriveGas = localStorage.getItem('wms_gdrive_gas_url') || DEFAULT_GDRIVE_GAS_URL;
    const gdriveFolder = localStorage.getItem('wms_gdrive_folder_url') || DEFAULT_GDRIVE_FOLDER_URL;
    const fonnteToken = localStorage.getItem('wms_fonnte_token') || '';
    const fonnteTarget = localStorage.getItem('wms_fonnte_group_target') || '';
    const fonnteAuto = localStorage.getItem('wms_fonnte_auto_send') !== 'false';

    cachedSettings = {
      gas_endpoint: gasEndpoint,
      manual_shipment_gas_url: manualShipmentGas,
      gdrive_gas_url: gdriveGas,
      gdrive_folder_url: gdriveFolder,
      fonnte_token: fonnteToken,
      fonnte_group_target: fonnteTarget,
      fonnte_auto_send: fonnteAuto,
    };
  } catch {
    cachedSettings = {
      gas_endpoint: '',
      manual_shipment_gas_url: DEFAULT_MANUAL_SHIPMENT_GAS_URL,
      gdrive_gas_url: DEFAULT_GDRIVE_GAS_URL,
      gdrive_folder_url: DEFAULT_GDRIVE_FOLDER_URL,
    };
  }
  return cachedSettings;
}

/**
 * Ambil endpoint GAS utama yang sedang aktif (Tersinkronisasi dari Supabase Cloud)
 */
export function getStoredGasEndpoint(): string {
  if (cachedSettings?.gas_endpoint) return cachedSettings.gas_endpoint;
  return (
    localStorage.getItem('wms_gas_endpoint') ||
    localStorage.getItem('wms_endpoint_url') ||
    ''
  );
}

/**
 * Ambil endpoint GAS Manual Shipment yang sedang aktif
 */
export function getStoredManualShipmentGasUrl(): string {
  const current = cachedSettings?.manual_shipment_gas_url ||
    localStorage.getItem('wms_manual_shipment_gas_url') ||
    DEFAULT_MANUAL_SHIPMENT_GAS_URL;
  return sanitizeManualShipmentGasUrl(current);
}

/**
 * Ambil endpoint GDrive GAS Upload yang sedang aktif
 */
export function getStoredGdriveGasUrl(): string {
  if (cachedSettings?.gdrive_gas_url) return cachedSettings.gdrive_gas_url;
  return (
    localStorage.getItem('wms_gdrive_gas_url') ||
    DEFAULT_GDRIVE_GAS_URL
  );
}

/**
 * Ambil GDrive Folder URL yang sedang aktif
 */
export function getStoredGdriveFolderUrl(): string {
  if (cachedSettings?.gdrive_folder_url) return cachedSettings.gdrive_folder_url;
  return (
    localStorage.getItem('wms_gdrive_folder_url') ||
    DEFAULT_GDRIVE_FOLDER_URL
  );
}

/**
 * Sinkronisasi memori & LocalStorage dengan data terbaru dari Supabase
 */
function syncCacheAndStorage(data: WmsSettings): WmsSettings {
  // Extract JSON payload if backend stores JSON payload
  let jsonConfig: Partial<WmsSettings> = {};
  if (data.config_json) {
    try {
      jsonConfig = JSON.parse(data.config_json);
    } catch {}
  }

  const rawManualGas = data.manual_shipment_gas_url || jsonConfig.manual_shipment_gas_url || DEFAULT_MANUAL_SHIPMENT_GAS_URL;
  const safeManualGas = sanitizeManualShipmentGasUrl(rawManualGas);

  const merged: WmsSettings = {
    ...data,
    gas_endpoint: data.gas_endpoint || jsonConfig.gas_endpoint || '',
    manual_shipment_gas_url: safeManualGas,
    gdrive_gas_url: data.gdrive_gas_url || jsonConfig.gdrive_gas_url || DEFAULT_GDRIVE_GAS_URL,
    gdrive_folder_url: data.gdrive_folder_url || jsonConfig.gdrive_folder_url || DEFAULT_GDRIVE_FOLDER_URL,
  };

  cachedSettings = merged;

  // Sync to localStorage for immediate offline/startup retrieval
  try {
    if (merged.gas_endpoint) {
      localStorage.setItem('wms_gas_endpoint', merged.gas_endpoint);
      localStorage.setItem('wms_endpoint_url', merged.gas_endpoint);
    }
    if (merged.manual_shipment_gas_url) {
      localStorage.setItem('wms_manual_shipment_gas_url', merged.manual_shipment_gas_url);
    }
    if (merged.gdrive_gas_url) {
      localStorage.setItem('wms_gdrive_gas_url', merged.gdrive_gas_url);
    }
    if (merged.gdrive_folder_url) {
      localStorage.setItem('wms_gdrive_folder_url', merged.gdrive_folder_url);
    }
    if (merged.fonnte_token) {
      localStorage.setItem('wms_fonnte_token', merged.fonnte_token);
    }
    if (merged.fonnte_group_target) {
      localStorage.setItem('wms_fonnte_group_target', merged.fonnte_group_target);
    }
    if (merged.fonnte_auto_send !== undefined) {
      localStorage.setItem('wms_fonnte_auto_send', String(merged.fonnte_auto_send));
    }
  } catch {}

  // Dispatch event agar seluruh UI bereaksi seketika
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('wms_settings_changed', { detail: merged })
    );
  }

  return merged;
}

/**
 * Ambil konfigurasi global WMS dari Supabase Cloud (berlaku untuk semua pengguna)
 */
export async function fetchWmsSettings(forceRefresh = false): Promise<WmsSettings | null> {
  // Jika sudah ada di memori dan tidak dipaksa refresh, return instan
  if (cachedSettings && !forceRefresh) {
    return cachedSettings;
  }

  // Hindari race condition multiple fetch
  if (isFetchingPromise && !forceRefresh) {
    return isFetchingPromise;
  }

  initCacheFromLocalStorage();

  isFetchingPromise = (async () => {
    try {
      const rows = await supabaseFetch<any[]>('wms_settings', 'GET', undefined, 'order=id.asc');
      if (rows && rows.length > 0) {
        // Cari baris utama (id: 1) dan baris konfigurasi ekstensi (CONFIG_GAS / id: 2)
        const row1 = rows.find((r) => r.id === 1) || rows[0];
        const row2 = rows.find((r) => r.id === 2 || r.fonnte_token === 'CONFIG_GAS');

        let gasConfig: any = {};
        if (row2 && row2.fonnte_group_target) {
          try {
            gasConfig = JSON.parse(row2.fonnte_group_target);
          } catch {}
        }

        const merged: WmsSettings = {
          id: 1,
          fonnte_token: row1.fonnte_token || '',
          fonnte_group_target: row1.fonnte_group_target || '',
          fonnte_auto_send: row1.fonnte_auto_send !== undefined ? row1.fonnte_auto_send : true,
          gas_endpoint: row1.gas_endpoint || gasConfig.gas_endpoint || '',
          manual_shipment_gas_url: row1.manual_shipment_gas_url || gasConfig.manual_shipment_gas_url || DEFAULT_MANUAL_SHIPMENT_GAS_URL,
          gdrive_gas_url: row1.gdrive_gas_url || gasConfig.gdrive_gas_url || DEFAULT_GDRIVE_GAS_URL,
          gdrive_folder_url: row1.gdrive_folder_url || gasConfig.gdrive_folder_url || DEFAULT_GDRIVE_FOLDER_URL,
          updated_at: row1.updated_at || new Date().toISOString(),
        };

        return syncCacheAndStorage(merged);
      }
      return cachedSettings;
    } catch (error) {
      console.warn('WMS global settings fetch warning (menggunakan cache lokal):', error);
      return cachedSettings;
    } finally {
      isFetchingPromise = null;
    }
  })();

  return isFetchingPromise;
}

/**
 * Simpan konfigurasi global WMS ke Supabase Cloud (1 kali simpan = setup semua user)
 */
export async function saveWmsSettings(settings: Partial<WmsSettings>): Promise<boolean> {
  // 1. Optimistic update cache lokal seketika
  const current = initCacheFromLocalStorage();
  const updated: WmsSettings = {
    ...current,
    ...settings,
    updated_at: new Date().toISOString(),
  };
  syncCacheAndStorage(updated);

  // 2. Persist ke Supabase Cloud
  try {
    const configPayload = {
      gas_endpoint: updated.gas_endpoint || '',
      manual_shipment_gas_url: updated.manual_shipment_gas_url || DEFAULT_MANUAL_SHIPMENT_GAS_URL,
      gdrive_gas_url: updated.gdrive_gas_url || DEFAULT_GDRIVE_GAS_URL,
      gdrive_folder_url: updated.gdrive_folder_url || DEFAULT_GDRIVE_FOLDER_URL,
    };

    // A. Simpan row id: 1 (Fonnte & kolom spesifik jika sudah ada di database)
    try {
      const row1Payload: any = {
        fonnte_token: updated.fonnte_token || '',
        fonnte_group_target: updated.fonnte_group_target || '',
        fonnte_auto_send: updated.fonnte_auto_send !== undefined ? updated.fonnte_auto_send : true,
        gas_endpoint: updated.gas_endpoint || '',
        manual_shipment_gas_url: updated.manual_shipment_gas_url || '',
        gdrive_gas_url: updated.gdrive_gas_url || '',
        gdrive_folder_url: updated.gdrive_folder_url || '',
        updated_at: new Date().toISOString(),
      };
      await supabaseFetch('wms_settings', 'PATCH', row1Payload, 'id=eq.1');
    } catch {
      // Jika kolom gas_endpoint belum ditambahkan ke schema tabel di Supabase, update hanya kolom fonnte di row 1
      try {
        const fallbackRow1 = {
          fonnte_token: updated.fonnte_token || '',
          fonnte_group_target: updated.fonnte_group_target || '',
          fonnte_auto_send: updated.fonnte_auto_send !== undefined ? updated.fonnte_auto_send : true,
          updated_at: new Date().toISOString(),
        };
        await supabaseFetch('wms_settings', 'PATCH', fallbackRow1, 'id=eq.1');
      } catch {}
    }

    // B. Simpan/Upsert row id: 2 sebagai payload JSON config agar 100% kompatibel tanpa perlu migrasi manual
    try {
      const row2Payload = {
        id: 2,
        fonnte_token: 'CONFIG_GAS',
        fonnte_group_target: JSON.stringify(configPayload),
        fonnte_auto_send: false,
        updated_at: new Date().toISOString(),
      };
      // Coba patch id: 2 dulu
      try {
        await supabaseFetch('wms_settings', 'PATCH', row2Payload, 'id=eq.2');
      } catch {
        // Jika belum ada row 2, lakukan insert
        await supabaseFetch('wms_settings', 'POST', row2Payload);
      }
    } catch (err) {
      console.warn('Gagal menyimpan fallback config row 2:', err);
    }

    return true;
  } catch (error) {
    console.error('Failed to save WMS settings to Supabase:', error);
    return false;
  }
}
