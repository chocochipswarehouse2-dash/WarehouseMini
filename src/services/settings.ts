import { supabaseFetch } from './supabase';
import { WmsSettings } from '../types';
import { updateRoleTemplates } from './permissions';

export const DEFAULT_GDRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1oFx9WFm8Ch_DlOxw66WRy4nH-kIAXwcw';

export const DEFAULT_GDRIVE_GAS_URL =
  'https://script.google.com/macros/s/AKfycbyFxfqoqJhrPJOioPxnmbGJTjTTAwli6b87lgOQCPFDOoCVt5EJg3NHZT56zI52rM63/exec';

export const DEFAULT_MANUAL_SHIPMENT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbyFxfqoqJhrPJOioPxnmbGJTjTTAwli6b87lgOQCPFDOoCVt5EJg3NHZT56zI52rM63/exec';

// In-memory cache for ultra-fast zero-latency access across components
let cachedSettings: WmsSettings | null = null;
let isFetchingPromise: Promise<WmsSettings | null> | null = null;

const LS_SETTINGS_UPDATED_AT_KEY = 'wms_settings_max_updated_at';
const LS_SETTINGS_SNAPSHOT_KEY = 'wms_settings_snapshot_v1';
const LS_RECOUNT_DOC_UPDATED_AT_KEY = 'wms_recount_doc_updated_at';
const RECOUNT_AUDIT_SWR_TTL_MS = 2 * 60 * 1000;

let memoryRecountAuditCache: Record<string, any> | null = null;
let memoryRecountAuditLastFetch = 0;
let inflightRecountAuditPromise: Promise<Record<string, any>> | null = null;

/**
 * Validasi dan bersihkan URL GAS jika merupakan URL script mati/404 lama
 */
function sanitizeManualShipmentGasUrl(url?: string): string {
  if (
    !url ||
    !url.trim() ||
    url.includes('AKfycbwqoG7_rD_kLdO48x4W0-3f4m2A-xK7eH9fQp_6_h3Y') ||
    url.includes('AKfycby4J497I-m4H99KSvBDkkSr6_kn9BoIDwALRa3lE1ZiPyJPIAd0AYE6-r6yqCdFONmpSg') ||
    url.includes('AKfycbwnGgT-ekW7L-HIE2RGxuBZQl5gATB4fUFYO-SxwGS16p8_Kc28q91gnd5N-Y30bA8Q9w') ||
    url.includes('AKfycbyO4tMN0j4p9xzWGigWKe8HXdbo8BcwSM0TNELiEHVGbrCgQlyAJWY9LuOcrQUl-oOU')
  ) {
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
    const gasEndpoint = localStorage.getItem('wms_gas_endpoint') || localStorage.getItem('wms_endpoint_url') || DEFAULT_MANUAL_SHIPMENT_GAS_URL;
    const storedManualGas = localStorage.getItem('wms_manual_shipment_gas_url') || '';
    const manualShipmentGas = sanitizeManualShipmentGasUrl(storedManualGas);
    if (storedManualGas !== manualShipmentGas) {
      localStorage.setItem('wms_manual_shipment_gas_url', manualShipmentGas);
    }

    const storedGdriveGas = localStorage.getItem('wms_gdrive_gas_url') || '';
    const gdriveGas = sanitizeGdriveGasUrl(storedGdriveGas);
    if (storedGdriveGas !== gdriveGas) {
      localStorage.setItem('wms_gdrive_gas_url', gdriveGas);
    }
    const gdriveFolder = localStorage.getItem('wms_gdrive_folder_url') || DEFAULT_GDRIVE_FOLDER_URL;
    const fonnteToken = localStorage.getItem('wms_fonnte_token') || '';
    const fonnteTarget = localStorage.getItem('wms_fonnte_group_target') || '';
    const fonnteAuto = localStorage.getItem('wms_fonnte_auto_send') !== 'false';
    const waWebhookGasUrl = localStorage.getItem('wms_wa_webhook_gas_url') || '';
    const katalogManualData = localStorage.getItem('wms_katalog_manual_data') || '';
    const presensiLocationsStored = localStorage.getItem('wms_presensi_location_config');
    let parsedPresensiLocations = null;
    if (presensiLocationsStored) {
      try { parsedPresensiLocations = JSON.parse(presensiLocationsStored); } catch {}
    }
    const rolesConfig = localStorage.getItem('wms_roles_config');
    let parsedRoles = null;
    if (rolesConfig) {
      try {
        parsedRoles = JSON.parse(rolesConfig);
        updateRoleTemplates(parsedRoles);
      } catch {}
    }

    let snapshotSettings: Partial<WmsSettings> | null = null;
    try {
      const snapRaw = localStorage.getItem(LS_SETTINGS_SNAPSHOT_KEY);
      if (snapRaw) snapshotSettings = JSON.parse(snapRaw);
    } catch {}

    let parsedRecountMap = snapshotSettings?.recount_audit_map || null;
    if (!parsedRecountMap) {
      const recountStored = localStorage.getItem('wms_recount_audit_map');
      if (recountStored) {
        try { parsedRecountMap = JSON.parse(recountStored); } catch {}
      }
    }

    cachedSettings = {
      gas_endpoint: gasEndpoint,
      manual_shipment_gas_url: manualShipmentGas,
      gdrive_gas_url: gdriveGas,
      gdrive_folder_url: gdriveFolder,
      fonnte_token: fonnteToken,
      fonnte_group_target: fonnteTarget,
      fonnte_auto_send: fonnteAuto,
      wa_webhook_gas_url: waWebhookGasUrl,
      katalog_manual_data: katalogManualData,
      presensi_locations: parsedPresensiLocations || snapshotSettings?.presensi_locations || null,
      agenda_categories: snapshotSettings?.agenda_categories || null,
      recount_audit_map: parsedRecountMap,
      roles: parsedRoles || snapshotSettings?.roles || null,
    };
  } catch {
    cachedSettings = {
      gas_endpoint: DEFAULT_MANUAL_SHIPMENT_GAS_URL,
      manual_shipment_gas_url: DEFAULT_MANUAL_SHIPMENT_GAS_URL,
      gdrive_gas_url: DEFAULT_GDRIVE_GAS_URL,
      gdrive_folder_url: DEFAULT_GDRIVE_FOLDER_URL,
      wa_webhook_gas_url: '',
      katalog_manual_data: '',
    };
  }
  return cachedSettings;
}

/**
 * Mengambil konfigurasi WMS aktif dari cache memori atau LocalStorage
 */
export function getSettings(): WmsSettings {
  if (cachedSettings) return cachedSettings;
  return initCacheFromLocalStorage();
}

/**
 * Ambil endpoint GAS Webhook WA yang sedang aktif
 */
export function getStoredWaWebhookGasUrl(): string {
  if (cachedSettings?.wa_webhook_gas_url) return cachedSettings.wa_webhook_gas_url;
  return (
    localStorage.getItem('wms_wa_webhook_gas_url') || ''
  );
}

/**
 * Ambil endpoint GAS utama yang sedang aktif (Tersinkronisasi dari Supabase Cloud)
 */
export function getStoredGasEndpoint(): string {
  if (cachedSettings?.gas_endpoint) return cachedSettings.gas_endpoint;
  return (
    localStorage.getItem('wms_gas_endpoint') ||
    localStorage.getItem('wms_endpoint_url') ||
    DEFAULT_MANUAL_SHIPMENT_GAS_URL
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

function sanitizeGdriveGasUrl(url?: string): string {
  if (
    !url ||
    !url.trim() ||
    url.includes('AKfycby4J497I-m4H99KSvBDkkSr6_kn9BoIDwALRa3lE1ZiPyJPIAd0AYE6-r6yqCdFONmpSg') ||
    url.includes('AKfycbyO4tMN0j4p9xzWGigWKe8HXdbo8BcwSM0TNELiEHVGbrCgQlyAJWY9LuOcrQUl-oOU') ||
    url.includes('AKfycbwnGgT-ekW7L-HIE2RGxuBZQl5gATB4fUFYO-SxwGS16p8_Kc28q91gnd5N-Y30bA8Q9w')
  ) {
    return DEFAULT_GDRIVE_GAS_URL;
  }
  return url.trim();
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

  const rawGdriveGas = data.gdrive_gas_url || jsonConfig.gdrive_gas_url || DEFAULT_GDRIVE_GAS_URL;
  const safeGdriveGas = sanitizeGdriveGasUrl(rawGdriveGas);

  const merged: WmsSettings = {
    ...data,
    gas_endpoint: data.gas_endpoint || jsonConfig.gas_endpoint || '',
    manual_shipment_gas_url: safeManualGas,
    gdrive_gas_url: safeGdriveGas,
    gdrive_folder_url: data.gdrive_folder_url || jsonConfig.gdrive_folder_url || DEFAULT_GDRIVE_FOLDER_URL,
    roles: data.roles || jsonConfig.roles || null,
    presensi_locations: data.presensi_locations !== undefined ? data.presensi_locations : (jsonConfig.presensi_locations || cachedSettings?.presensi_locations || null),
    katalog_manual_data: data.katalog_manual_data !== undefined ? data.katalog_manual_data : (jsonConfig.katalog_manual_data || cachedSettings?.katalog_manual_data || ''),
    recount_audit_map: data.recount_audit_map !== undefined ? data.recount_audit_map : (jsonConfig.recount_audit_map || cachedSettings?.recount_audit_map || null),
  };

  cachedSettings = merged;

  // Sync to localStorage for immediate offline/startup retrieval
  try {
    if (merged.roles) {
      localStorage.setItem('wms_roles_config', JSON.stringify(merged.roles));
      updateRoleTemplates(merged.roles!);
    }
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
    if (merged.wa_webhook_gas_url !== undefined) {
      localStorage.setItem('wms_wa_webhook_gas_url', merged.wa_webhook_gas_url);
    }
    if (merged.katalog_manual_data !== undefined) {
      localStorage.setItem('wms_katalog_manual_data', merged.katalog_manual_data);
    }
    if (merged.recount_audit_map) {
      localStorage.setItem('wms_recount_audit_map', JSON.stringify(merged.recount_audit_map));
    }
    if (merged.presensi_locations) {
      localStorage.setItem('wms_presensi_location_config', JSON.stringify(merged.presensi_locations));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wms_presensi_location_changed', { detail: merged.presensi_locations }));
      }
    }
    localStorage.setItem(LS_SETTINGS_SNAPSHOT_KEY, JSON.stringify(merged));
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
export async function fetchWmsSettings(forceRefresh = false, hardBypass = false): Promise<WmsSettings | null> {
  // Jika sudah ada di memori dan tidak dipaksa refresh, return instan
  if (cachedSettings && !forceRefresh) {
    return cachedSettings;
  }

  // Hindari race condition multiple fetch
  if (isFetchingPromise && !hardBypass) {
    return isFetchingPromise;
  }

  initCacheFromLocalStorage();

  isFetchingPromise = (async () => {
    try {
      // Lightweight ~150B updated_at watermark check before downloading ~392 KB wms_settings payload
      if (!hardBypass) {
        try {
          const localWm = localStorage.getItem(LS_SETTINGS_UPDATED_AT_KEY) || '';
          const hasSnapshot = Boolean(localStorage.getItem(LS_SETTINGS_SNAPSHOT_KEY));
          if (localWm && hasSnapshot && cachedSettings) {
            const wmRows = await supabaseFetch<Array<{ updated_at?: string }>>(
              'wms_settings',
              'GET',
              undefined,
              'select=updated_at&order=updated_at.desc.nullslast&limit=1'
            );
            const remoteWm = Array.isArray(wmRows) && wmRows[0]?.updated_at ? String(wmRows[0].updated_at) : '';
            if (remoteWm && remoteWm === localWm) {
              return cachedSettings;
            }
          }
        } catch {}
      }

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

        let maxUpdatedAt = '';
        for (const r of rows) {
          const ts = r?.updated_at ? String(r.updated_at) : '';
          if (ts && (!maxUpdatedAt || ts > maxUpdatedAt)) maxUpdatedAt = ts;
        }

        const merged: WmsSettings = {
          id: 1,
          fonnte_token: row1.fonnte_token || '',
          fonnte_group_target: row1.fonnte_group_target || '',
          fonnte_auto_send: row1.fonnte_auto_send !== undefined ? row1.fonnte_auto_send : true,
          wa_webhook_gas_url: row1.wa_webhook_gas_url || gasConfig.wa_webhook_gas_url || '',
          gas_endpoint: row1.gas_endpoint || gasConfig.gas_endpoint || '',
          manual_shipment_gas_url: row1.manual_shipment_gas_url || gasConfig.manual_shipment_gas_url || DEFAULT_MANUAL_SHIPMENT_GAS_URL,
          gdrive_gas_url: row1.gdrive_gas_url || gasConfig.gdrive_gas_url || DEFAULT_GDRIVE_GAS_URL,
          gdrive_folder_url: row1.gdrive_folder_url || gasConfig.gdrive_folder_url || DEFAULT_GDRIVE_FOLDER_URL,
          roles: gasConfig.roles || null,
          presensi_locations: gasConfig.presensi_locations || null,
          agenda_categories: gasConfig.agenda_categories || null,
          katalog_manual_data: row1.katalog_manual_data || gasConfig.katalog_manual_data || localStorage.getItem('wms_katalog_manual_data') || '',
          recount_audit_map: gasConfig.recount_audit_map || null,
          updated_at: maxUpdatedAt || row1.updated_at || new Date().toISOString(),
        };

        try {
          if (maxUpdatedAt) {
            localStorage.setItem(LS_SETTINGS_UPDATED_AT_KEY, maxUpdatedAt);
          }
        } catch {}

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
  const savedAt = new Date().toISOString();
  const current = initCacheFromLocalStorage();
  const updated: WmsSettings = {
    ...current,
    ...settings,
    updated_at: savedAt,
  };
  syncCacheAndStorage(updated);

  // 2. Persist ke Supabase Cloud
  try {
    const configPayload = {
      gas_endpoint: updated.gas_endpoint || '',
      manual_shipment_gas_url: updated.manual_shipment_gas_url || DEFAULT_MANUAL_SHIPMENT_GAS_URL,
      gdrive_gas_url: updated.gdrive_gas_url || DEFAULT_GDRIVE_GAS_URL,
      gdrive_folder_url: updated.gdrive_folder_url || DEFAULT_GDRIVE_FOLDER_URL,
      wa_webhook_gas_url: updated.wa_webhook_gas_url || '',
      roles: updated.roles || null,
      agenda_categories: updated.agenda_categories || null,
      katalog_manual_data: updated.katalog_manual_data || '',
      presensi_locations: updated.presensi_locations || null,
      recount_audit_map: updated.recount_audit_map || null,
    };

    // A. Simpan row id: 1 (Fonnte & kolom spesifik jika sudah ada di database)
    try {
      const row1Payload: any = {
        fonnte_token: updated.fonnte_token || '',
        fonnte_group_target: updated.fonnte_group_target || '',
        fonnte_auto_send: updated.fonnte_auto_send !== undefined ? updated.fonnte_auto_send : true,
        wa_webhook_gas_url: updated.wa_webhook_gas_url || '',
        gas_endpoint: updated.gas_endpoint || '',
        manual_shipment_gas_url: updated.manual_shipment_gas_url || '',
        gdrive_gas_url: updated.gdrive_gas_url || '',
        gdrive_folder_url: updated.gdrive_folder_url || '',
        katalog_manual_data: updated.katalog_manual_data || '',
        updated_at: savedAt,
      };
      await supabaseFetch('wms_settings', 'PATCH', row1Payload, 'id=eq.1');
    } catch {
      try {
        const fallbackRow1 = {
          fonnte_token: updated.fonnte_token || '',
          fonnte_group_target: updated.fonnte_group_target || '',
          fonnte_auto_send: updated.fonnte_auto_send !== undefined ? updated.fonnte_auto_send : true,
          updated_at: savedAt,
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
        updated_at: savedAt,
      };
      try {
        await supabaseFetch('wms_settings', 'PATCH', row2Payload, 'id=eq.2');
      } catch {
        await supabaseFetch('wms_settings', 'POST', row2Payload);
      }
    } catch (err) {
      console.warn('Gagal menyimpan fallback config row 2:', err);
    }

    try {
      localStorage.setItem(LS_SETTINGS_UPDATED_AT_KEY, savedAt);
    } catch {}

    return true;
  } catch (error) {
    console.error('Failed to save WMS settings to Supabase:', error);
    return false;
  }
}

function normalizeRecountCodeKey(code: string): string {
  return String(code || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '')
    .trim()
    .toUpperCase();
}

function isIncomingRecountNewer(existing: any, incoming: any): boolean {
  if (!incoming || typeof incoming !== 'object') return false;
  if (!existing || typeof existing !== 'object') return true;
  const exTime = String(existing.updated_at || existing.tanggal_audit || '');
  const inTime = String(incoming.updated_at || incoming.tanggal_audit || '');
  if (inTime && exTime && inTime !== exTime) {
    return inTime > exTime;
  }
  if (inTime && !exTime) return true;
  const exRound = Number(existing.round || 0);
  const inRound = Number(incoming.round || 0);
  if (inRound !== exRound) return inRound > exRound;
  const exVars = Array.isArray(existing.variants) ? existing.variants.length : 0;
  const inVars = Array.isArray(incoming.variants) ? incoming.variants.length : 0;
  return inVars > exVars;
}

export function mergeRecountAuditMaps(
  baseMap: Record<string, any> | null | undefined,
  incomingMap: Record<string, any> | null | undefined
): Record<string, any> {
  const result: Record<string, any> = {};
  const absorb = (src: Record<string, any> | null | undefined) => {
    if (!src || typeof src !== 'object') return;
    Object.keys(src).forEach((rawKey) => {
      const rec = src[rawKey];
      const normKey = normalizeRecountCodeKey(rawKey || rec?.kode_produksi || '');
      if (!normKey || !rec || typeof rec !== 'object') return;
      if (!result[normKey] || isIncomingRecountNewer(result[normKey], rec)) {
        result[normKey] = {
          ...rec,
          kode_produksi: normKey,
        };
      }
    });
  };
  absorb(baseMap);
  absorb(incomingMap);
  return result;
}

/**
 * Ambil map data hasil hitung ulang (audit re-count) per kode produksi
 */
export function getRecountAuditMap(): Record<string, any> {
  if (cachedSettings?.recount_audit_map && Object.keys(cachedSettings.recount_audit_map).length > 0) {
    return cachedSettings.recount_audit_map;
  }
  try {
    const raw = localStorage.getItem('wms_recount_audit_map');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

/**
 * Ambil data hitung ulang terbaru dari Cloud (wms_system_docs & wms_settings)
 * Memastikan semua user & perangkat lain melihat kode mana saja yang sudah dihitung
 */
export async function fetchRecountAuditMapFromCloud(forceRefresh = false): Promise<Record<string, any>> {
  if (
    !forceRefresh &&
    memoryRecountAuditCache &&
    Date.now() - memoryRecountAuditLastFetch < RECOUNT_AUDIT_SWR_TTL_MS
  ) {
    return memoryRecountAuditCache;
  }
  if (!forceRefresh && inflightRecountAuditPromise) {
    return inflightRecountAuditPromise;
  }

  const runFetch = async (): Promise<Record<string, any>> => {
    let localAuditMap: Record<string, any> = mergeRecountAuditMaps(getRecountAuditMap(), {});

    try {
      const rawLogs = localStorage.getItem('wms_penerimaan_recount_logs');
      if (rawLogs) {
        const logs = JSON.parse(rawLogs);
        if (Array.isArray(logs)) {
          const logMap: Record<string, any> = {};
          logs.forEach((log: any) => {
            const code = normalizeRecountCodeKey(log.kode_produksi || '');
            if (code) {
              const totalSelisih = Number(log.total_selisih) || 0;
              const candidate = {
                kode_produksi: code,
                tanggal_audit: log.tanggal_audit,
                total_asli: Number(log.total_sebelumnya) || 0,
                total_fisik: Number(log.total_fisik) || 0,
                total_selisih: totalSelisih,
                status: totalSelisih === 0 ? 'MATCH' : totalSelisih < 0 ? 'KURANG' : 'LEBIH',
                round: Number(log.round || 1),
                auditor: log.auditor || 'Auditor Fisik',
                catatan: log.general_notes || '',
                updated_at: log.created_at || log.tanggal_audit || '',
                variants: (log.details || []).map((d: any) => ({
                  warna: d.warna,
                  size: d.size,
                  qty_asli: Number(d.qty_sebelumnya) || 0,
                  qty_fisik: Number(d.qty_fisik) || 0,
                  selisih: Number(d.selisih) || 0,
                  status: Number(d.selisih) === 0 ? 'MATCH' : Number(d.selisih) < 0 ? 'KURANG' : 'LEBIH',
                  note: d.catatan || '',
                })),
              };
              if (!logMap[code] || isIncomingRecountNewer(logMap[code], candidate)) {
                logMap[code] = candidate;
              }
            }
          });
          localAuditMap = mergeRecountAuditMaps(localAuditMap, logMap);
        }
      }
    } catch (eLogs) {}

    let docWmUpdatedAt = '';
    try {
      const docWm = await supabaseFetch<Array<{ updated_at?: string }>>(
        'wms_system_docs',
        'GET',
        undefined,
        'section_id=eq.recount_audit_results&select=updated_at&limit=1'
      );
      if (Array.isArray(docWm) && docWm[0]?.updated_at) {
        docWmUpdatedAt = String(docWm[0].updated_at);
      }
    } catch {}

    const prevDocWm = (() => {
      try { return localStorage.getItem(LS_RECOUNT_DOC_UPDATED_AT_KEY) || ''; } catch { return ''; }
    })();

    let settingsMap: Record<string, any> = {};
    try {
      const s = await fetchWmsSettings(true);
      if (s && s.recount_audit_map && Object.keys(s.recount_audit_map).length > 0) {
        settingsMap = mergeRecountAuditMaps(s.recount_audit_map, {});
      }
    } catch (eSet) {}

    if (
      !forceRefresh &&
      docWmUpdatedAt &&
      prevDocWm &&
      docWmUpdatedAt === prevDocWm &&
      Object.keys(localAuditMap).length > 0
    ) {
      const fastMerged = mergeRecountAuditMaps(settingsMap, localAuditMap);
      memoryRecountAuditCache = fastMerged;
      memoryRecountAuditLastFetch = Date.now();
      return fastMerged;
    }

    let docMap: Record<string, any> = {};
    try {
      const doc = await supabaseFetch<any[]>(
        'wms_system_docs',
        'GET',
        undefined,
        'section_id=eq.recount_audit_results&select=content,updated_at&limit=1'
      );
      if (doc && doc[0]) {
        if (doc[0].updated_at) {
          try { localStorage.setItem(LS_RECOUNT_DOC_UPDATED_AT_KEY, String(doc[0].updated_at)); } catch {}
        }
        if (doc[0].content) {
          const parsed = JSON.parse(doc[0].content);
          if (typeof parsed === 'object' && parsed !== null) {
            docMap = mergeRecountAuditMaps(parsed, {});
          }
        }
      }
    } catch (eDoc) {}

    const cloudMap = mergeRecountAuditMaps(docMap, settingsMap);
    const mergedMap = mergeRecountAuditMaps(cloudMap, localAuditMap);

    const needsDocHeal = Object.keys(mergedMap).some(
      (k) => !docMap[k] || isIncomingRecountNewer(docMap[k], mergedMap[k])
    );
    const needsSettingsHeal = Object.keys(mergedMap).some(
      (k) => !settingsMap[k] || isIncomingRecountNewer(settingsMap[k], mergedMap[k])
    );

    if (needsDocHeal && Object.keys(mergedMap).length > 0) {
      const healAt = new Date().toISOString();
      try {
        await supabaseFetch(
          'wms_system_docs',
          'POST',
          [
            {
              section_id: 'recount_audit_results',
              content: JSON.stringify(mergedMap),
              updated_by: 'Auto-Sync Merge',
              updated_at: healAt,
            },
          ],
          'on_conflict=section_id',
          true
        );
        try { localStorage.setItem(LS_RECOUNT_DOC_UPDATED_AT_KEY, healAt); } catch {}
      } catch {}
    }
    if (needsSettingsHeal && Object.keys(mergedMap).length > 0) {
      saveWmsSettings({ recount_audit_map: mergedMap }).catch(() => {});
    }

    memoryRecountAuditCache = mergedMap;
    memoryRecountAuditLastFetch = Date.now();
    try {
      localStorage.setItem('wms_recount_audit_map', JSON.stringify(mergedMap));
      if (cachedSettings) cachedSettings.recount_audit_map = mergedMap;
    } catch {}

    return mergedMap;
  };

  if (!forceRefresh) {
    inflightRecountAuditPromise = runFetch().finally(() => {
      inflightRecountAuditPromise = null;
    });
    return inflightRecountAuditPromise;
  }
  return runFetch();
}

/**
 * Simpan hasil audit hitung ulang kode produksi ke Cloud Supabase & LocalStorage
 * Menyimpan ganda ke wms_system_docs dan wms_settings agar langsung tersinkron ke semua perangkat lain
 */
export async function saveRecountAuditRecord(record: {
  kode_produksi: string;
  tanggal_audit?: string;
  total_asli: number;
  total_fisik: number;
  total_selisih: number;
  status: string;
  round: number;
  auditor?: string;
  catatan?: string;
  updated_at?: string;
  audited_dates?: string[];
  variants: Array<{
    warna: string;
    size: string;
    qty_asli: number;
    qty_fisik: number;
    selisih: number;
    status: string;
    note?: string;
  }>;
}): Promise<boolean> {
  const normCode = normalizeRecountCodeKey(record.kode_produksi);
  const currentMap = mergeRecountAuditMaps(getRecountAuditMap(), {});
  const prevRec = currentMap[normCode];
  const prevHistory: any[] = Array.isArray(prevRec?.history) ? [...prevRec.history] : [];
  if (prevRec && prevRec.total_fisik !== undefined) {
    const prevSnapshot = {
      round: prevRec.round || 1,
      tanggal_audit: prevRec.tanggal_audit || (prevRec.updated_at ? String(prevRec.updated_at).slice(0, 10) : ''),
      total_asli: prevRec.total_asli,
      total_fisik: prevRec.total_fisik,
      total_selisih: prevRec.total_selisih,
      status: prevRec.status,
      auditor: prevRec.auditor,
      catatan: prevRec.catatan,
      updated_at: prevRec.updated_at,
      variants: prevRec.variants,
    };
    const alreadyExists = prevHistory.some(
      (h) => Number(h.round) === Number(prevSnapshot.round) && Number(h.total_fisik) === Number(prevSnapshot.total_fisik)
    );
    if (!alreadyExists && Number(prevSnapshot.round) !== Number(record.round)) {
      prevHistory.push(prevSnapshot);
    }
  }

  const updatedMap = {
    ...currentMap,
    [normCode]: {
      ...record,
      kode_produksi: normCode,
      updated_at: record.updated_at || new Date().toISOString(),
      history: prevHistory,
    },
  };

  // Sync cache lokal
  memoryRecountAuditCache = updatedMap;
  memoryRecountAuditLastFetch = Date.now();
  try {
    localStorage.setItem('wms_recount_audit_map', JSON.stringify(updatedMap));
    if (cachedSettings) cachedSettings.recount_audit_map = updatedMap;
  } catch {}

  // Sync ke Cloud A: wms_system_docs key 'recount_audit_results'
  const savedDocAt = new Date().toISOString();
  try {
    await supabaseFetch(
      'wms_system_docs',
      'POST',
      [
        {
          section_id: 'recount_audit_results',
          content: JSON.stringify(updatedMap),
          updated_by: record.auditor || 'WMS Auditor',
          updated_at: savedDocAt,
        },
      ],
      'on_conflict=section_id',
      true
    );
    try { localStorage.setItem(LS_RECOUNT_DOC_UPDATED_AT_KEY, savedDocAt); } catch {}
  } catch (errDoc) {
    console.warn('Gagal sync recount ke wms_system_docs:', errDoc);
  }

  // Sync ke Cloud B: wms_settings
  await saveWmsSettings({ recount_audit_map: updatedMap });

  // Broadcast window event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_recount_audit_updated', { detail: { auditMap: updatedMap } }));
  }

  return true;
}
