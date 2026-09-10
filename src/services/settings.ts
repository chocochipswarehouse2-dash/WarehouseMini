import { supabaseFetch } from './supabase';
import { WmsSettings } from '../types';

export const DEFAULT_GDRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB';

export const DEFAULT_GDRIVE_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwnGgT-ekW7L-HIE2RGxuBZQl5gATB4fUFYO-SxwGS16p8_Kc28q91gnd5N-Y30bA8Q9w/exec';

export const DEFAULT_MANUAL_SHIPMENT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwqoG7_rD_kLdO48x4W0-3f4m2A-xK7eH9fQp_6_h3Y/exec';

// In-memory cache for ultra-fast zero-latency access across components
let cachedSettings: WmsSettings | null = null;
let isFetchingPromise: Promise<WmsSettings | null> | null = null;

/**
 * Inisialisasi cache dari LocalStorage saat startup (0ms latency)
 */
function initCacheFromLocalStorage(): WmsSettings {
  if (cachedSettings) return cachedSettings;

  try {
    const gasEndpoint = localStorage.getItem('wms_gas_endpoint') || localStorage.getItem('wms_endpoint_url') || '';
    const manualShipmentGas = localStorage.getItem('wms_manual_shipment_gas_url') || DEFAULT_MANUAL_SHIPMENT_GAS_URL;
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
  if (cachedSettings?.manual_shipment_gas_url) return cachedSettings.manual_shipment_gas_url;
  return (
    localStorage.getItem('wms_manual_shipment_gas_url') ||
    DEFAULT_MANUAL_SHIPMENT_GAS_URL
  );
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

  const merged: WmsSettings = {
    ...data,
    gas_endpoint: data.gas_endpoint || jsonConfig.gas_endpoint || '',
    manual_shipment_gas_url: data.manual_shipment_gas_url || jsonConfig.manual_shipment_gas_url || DEFAULT_MANUAL_SHIPMENT_GAS_URL,
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
      const data = await supabaseFetch<WmsSettings[]>('wms_settings', 'GET', undefined, 'limit=1');
      if (data && data.length > 0) {
        return syncCacheAndStorage(data[0]);
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
    // Siapkan payload dengan config_json sebagai fallback kompatibilitas schema
    const configPayload = {
      gas_endpoint: updated.gas_endpoint,
      manual_shipment_gas_url: updated.manual_shipment_gas_url,
      gdrive_gas_url: updated.gdrive_gas_url,
      gdrive_folder_url: updated.gdrive_folder_url,
    };

    const payload: any = {
      ...settings,
      config_json: JSON.stringify(configPayload),
      updated_at: new Date().toISOString(),
    };

    // Ambil data eksisting untuk cek id
    let existingId: number | null = null;
    try {
      const existing = await supabaseFetch<WmsSettings[]>('wms_settings', 'GET', undefined, 'limit=1');
      if (existing && existing.length > 0 && existing[0].id) {
        existingId = existing[0].id;
      }
    } catch {}

    if (existingId) {
      // Coba UPDATE baris eksisting
      try {
        await supabaseFetch('wms_settings', 'PATCH', payload, `id=eq.${existingId}`);
      } catch (err) {
        // Jika skema kolom belum lengkap, coba simpan kolom dasar + config_json
        console.warn('Percobaan update kolom spesifik gagal, mencoba fallback payload:', err);
        const fallbackPayload = {
          fonnte_token: updated.fonnte_token,
          fonnte_group_target: updated.fonnte_group_target,
          fonnte_auto_send: updated.fonnte_auto_send,
          updated_at: payload.updated_at,
        };
        await supabaseFetch('wms_settings', 'PATCH', fallbackPayload, `id=eq.${existingId}`);
      }
    } else {
      // Coba INSERT baris id: 1
      try {
        await supabaseFetch('wms_settings', 'POST', { ...payload, id: 1 });
      } catch (err) {
        console.warn('Percobaan insert spesifik gagal, mencoba fallback insert:', err);
        const fallbackPayload = {
          id: 1,
          fonnte_token: updated.fonnte_token,
          fonnte_group_target: updated.fonnte_group_target,
          fonnte_auto_send: updated.fonnte_auto_send,
          updated_at: payload.updated_at,
        };
        await supabaseFetch('wms_settings', 'POST', fallbackPayload);
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to save WMS settings to Supabase:', error);
    return false;
  }
}
