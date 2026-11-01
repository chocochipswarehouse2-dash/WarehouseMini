import { AgendaEvent } from '../types';
import { getGdriveConfig } from './gdriveUpload';
import { getAgendaEvents, saveAgendaEvent } from './supabase';

import { DEFAULT_GDRIVE_GAS_URL, getStoredGasEndpoint } from './settings';

export interface GCalSyncResponse {
  success: boolean;
  google_event_id?: string | null;
  message?: string;
  error?: string;
}

export interface GCalFetchedEvent {
  google_event_id: string;
  wms_id?: string | null;
  title: string;
  description: string;
  location: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
}

export const LAST_GCAL_SYNC_KEY = 'wms_last_gcal_sync_timestamp';

/**
 * Mendapatkan endpoint URL Google Apps Script Backend utama
 */
function getGasEndpoint(): string {
  try {
    const { gasUrl } = getGdriveConfig();
    const candidate = (gasUrl || '').trim();
    if (candidate && !candidate.includes('AKfycbwnGgT') && !candidate.includes('AKfycbyO4tMN')) {
      return candidate;
    }
    const mainGas = getStoredGasEndpoint();
    if (mainGas && !mainGas.includes('AKfycbwnGgT') && !mainGas.includes('AKfycbyO4tMN')) {
      return mainGas.trim();
    }
    return DEFAULT_GDRIVE_GAS_URL;
  } catch {
    return DEFAULT_GDRIVE_GAS_URL;
  }
}

/**
 * Mengirim 1 event agenda WMS ke Google Calendar (Create, Update, atau Delete)
 */
export async function syncEventToGoogleCalendar(
  event: AgendaEvent,
  isDelete: boolean = false
): Promise<GCalSyncResponse> {
  const endpoint = getGasEndpoint();
  if (!endpoint) {
    return { success: false, error: 'Endpoint GAS belum dikonfigurasi.' };
  }

  try {
    const payload = {
      action: 'syncCalendarEvent',
      eventData: {
        id: event.id,
        google_event_id: event.google_event_id || null,
        title: event.title,
        description: event.description || '',
        start_date: event.start_date,
        end_date: event.end_date || event.start_date,
        start_time: event.start_time || '',
        end_time: event.end_time || '',
        is_all_day: Boolean(event.is_all_day),
        category: event.category,
        location: event.location || '',
        pic: event.pic || '',
        is_delete: isDelete,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Gagal menghubungi Google Apps Script`);
    }

    const data: GCalSyncResponse = await res.json();
    return data;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[GCalSync] Gagal sync event ke Google Calendar:', errMsg);
    return { success: false, error: errMsg };
  }
}

/**
 * Menarik daftar event dari Google Calendar akun Google admin via GAS
 */
export async function fetchEventsFromGoogleCalendar(
  startDate?: string,
  endDate?: string
): Promise<{ success: boolean; events: GCalFetchedEvent[]; error?: string }> {
  const endpoint = getGasEndpoint();
  if (!endpoint) {
    return { success: false, events: [], error: 'Endpoint GAS belum dikonfigurasi.' };
  }

  try {
    const payload = {
      action: 'fetchGoogleCalendar',
      startDate: startDate || null,
      endDate: endDate || null,
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Gagal mengambil data dari Google Apps Script`);
    }

    const data = await res.json();
    if (data.success && Array.isArray(data.events)) {
      return { success: true, events: data.events };
    }

    return { success: false, events: [], error: data.error || 'Respons GAS tidak valid' };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[GCalSync] Gagal menarik event dari Google Calendar:', errMsg);
    return { success: false, events: [], error: errMsg };
  }
}

/**
 * Rekonsiliasi 2-Arah Penuh antara WMS Agenda dan Google Calendar
 * Menarik event dari Google Calendar dan memasukkannya ke database WMS jika belum ada
 */
export async function reconcileGoogleCalendarTwoWay(
  onProgress?: (status: string) => void
): Promise<{ added: number; updated: number; totalGcal: number }> {
  if (onProgress) onProgress('Menghubungi Google Calendar via GAS...');

  const fetchRes = await fetchEventsFromGoogleCalendar();
  if (!fetchRes.success || !fetchRes.events) {
    throw new Error(fetchRes.error || 'Gagal mengambil event dari Google Calendar');
  }

  const gcalEvents = fetchRes.events;
  if (onProgress) onProgress(`Memproses ${gcalEvents.length} event dari Google Calendar...`);

  // Ambil data WMS yang ada saat ini
  const currentWmsEvents = await getAgendaEvents();
  const wmsMapByGoogleId = new Map<string, AgendaEvent>();
  const wmsMapById = new Map<string, AgendaEvent>();

  for (const ev of currentWmsEvents) {
    if (ev.google_event_id) {
      wmsMapByGoogleId.set(ev.google_event_id, ev);
    }
    if (ev.id) {
      wmsMapById.set(ev.id, ev);
    }
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const gEv of gcalEvents) {
    // 1. Cek apakah ada yang cocok berdasarkan wms_id tag di deskripsi
    let existing: AgendaEvent | undefined;
    if (gEv.wms_id && wmsMapById.has(gEv.wms_id)) {
      existing = wmsMapById.get(gEv.wms_id);
    } else if (wmsMapByGoogleId.has(gEv.google_event_id)) {
      existing = wmsMapByGoogleId.get(gEv.google_event_id);
    }

    if (!existing) {
      // Event baru dari Google Calendar -> Tambahkan ke WMS
      const newEvent: Partial<AgendaEvent> = {
        title: gEv.title || 'Agenda Google Calendar',
        description: gEv.description || '',
        start_date: gEv.start_date,
        end_date: gEv.end_date || gEv.start_date,
        start_time: gEv.start_time || '',
        end_time: gEv.end_time || '',
        is_all_day: gEv.is_all_day,
        category: 'umum',
        location: gEv.location || '',
        pic: 'Google Calendar',
        google_event_id: gEv.google_event_id,
        source: 'google_calendar',
      };

      await saveAgendaEvent(newEvent);
      addedCount++;
    } else {
      // Event sudah ada, perbarui google_event_id jika belum tercatat
      if (!existing.google_event_id || existing.google_event_id !== gEv.google_event_id) {
        existing.google_event_id = gEv.google_event_id;
        await saveAgendaEvent(existing);
        updatedCount++;
      }
    }
  }

  // Tandai waktu terakhir sync
  try {
    localStorage.setItem(LAST_GCAL_SYNC_KEY, new Date().toISOString());
  } catch {}

  if (onProgress) onProgress(`Selesai! ${addedCount} event baru ditambahkan, ${updatedCount} diselaraskan.`);

  return {
    added: addedCount,
    updated: updatedCount,
    totalGcal: gcalEvents.length,
  };
}
