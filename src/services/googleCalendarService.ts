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
  pic?: string;
  category?: string;
  updated_at?: string;
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

let isReconcilingInProgress = false;

/**
 * Rekonsiliasi 2-Arah Penuh antara WMS Agenda dan Google Calendar
 * Menarik event dari Google Calendar dan memasukkannya ke database WMS jika belum ada
 */
import { deleteAgendaEvent } from './supabase';

export async function reconcileGoogleCalendarTwoWay(
  onProgress?: (status: string) => void
): Promise<{ added: number; updated: number; deleted: number; totalGcal: number }> {
  if (isReconcilingInProgress) {
    return { added: 0, updated: 0, deleted: 0, totalGcal: 0 };
  }
  isReconcilingInProgress = true;

  try {
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
    let deletedCount = 0;

    const normalizeTitle = (t: string) => (t || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const seenGoogleIdsInFetch = new Set<string>();

    for (const gEv of gcalEvents) {
      seenGoogleIdsInFetch.add(gEv.google_event_id);

      // 1. Cek apakah ada yang cocok berdasarkan wms_id tag di deskripsi
      let existing: AgendaEvent | undefined;
      if (gEv.wms_id && wmsMapById.has(gEv.wms_id)) {
        existing = wmsMapById.get(gEv.wms_id);
      } else if (wmsMapByGoogleId.has(gEv.google_event_id)) {
        existing = wmsMapByGoogleId.get(gEv.google_event_id);
      } else {
        // Fallback matching cerdas: Judul dan tanggal mulai (anti duplikasi)
        const gTitleNorm = normalizeTitle(gEv.title);
        existing = currentWmsEvents.find((wEv) => {
          const wTitleNorm = normalizeTitle(wEv.title);
          const isTitleMatch =
            wTitleNorm === gTitleNorm ||
            wTitleNorm.replace(/[^a-z0-9]/g, '') === gTitleNorm.replace(/[^a-z0-9]/g, '');
          const isDateMatch = wEv.start_date === gEv.start_date;
          return isTitleMatch && isDateMatch;
        });
      }

      if (!existing) {
        // Event baru dari Google Calendar -> Tambahkan ke WMS
        const newEvent: Partial<AgendaEvent> = {
          id: gEv.wms_id || undefined,
          title: gEv.title || 'Agenda Google Calendar',
          description: gEv.description || '',
          start_date: gEv.start_date,
          end_date: gEv.end_date || gEv.start_date,
          start_time: gEv.start_time || '',
          end_time: gEv.end_time || '',
          is_all_day: gEv.is_all_day,
          category: gEv.category || 'umum',
          location: gEv.location || '',
          pic: gEv.pic || 'Google Calendar',
          google_event_id: gEv.google_event_id,
          source: 'google_calendar',
        };

        const saved = await saveAgendaEvent(newEvent);
        addedCount++;
        if (saved.id) wmsMapById.set(saved.id, saved);
        if (saved.google_event_id) wmsMapByGoogleId.set(saved.google_event_id, saved);
        currentWmsEvents.push(saved);
      } else {
        // Event sudah ada: Bandingkan dan selaraskan perubahan dari Google Calendar ke WMS
        let hasChanges = false;

        if (!existing.google_event_id || existing.google_event_id !== gEv.google_event_id) {
          existing.google_event_id = gEv.google_event_id;
          hasChanges = true;
        }

        // Jika judul diubah di Google Calendar
        if (gEv.title && gEv.title !== existing.title) {
          existing.title = gEv.title;
          hasChanges = true;
        }

        // Jika tanggal diubah di Google Calendar
        if (gEv.start_date && gEv.start_date !== existing.start_date) {
          existing.start_date = gEv.start_date;
          hasChanges = true;
        }
        const effectiveEnd = gEv.end_date || gEv.start_date;
        if (effectiveEnd && effectiveEnd !== (existing.end_date || existing.start_date)) {
          existing.end_date = effectiveEnd;
          hasChanges = true;
        }

        // Jika jam diubah di Google Calendar
        if (gEv.start_time !== undefined && gEv.start_time !== (existing.start_time || '')) {
          existing.start_time = gEv.start_time;
          hasChanges = true;
        }
        if (gEv.end_time !== undefined && gEv.end_time !== (existing.end_time || '')) {
          existing.end_time = gEv.end_time;
          hasChanges = true;
        }
        if (gEv.is_all_day !== undefined && gEv.is_all_day !== existing.is_all_day) {
          existing.is_all_day = gEv.is_all_day;
          hasChanges = true;
        }

        // Jika lokasi atau deskripsi diubah di Google Calendar
        if (gEv.location !== undefined && gEv.location !== (existing.location || '')) {
          existing.location = gEv.location;
          hasChanges = true;
        }
        if (gEv.description !== undefined && gEv.description !== (existing.description || '')) {
          existing.description = gEv.description;
          hasChanges = true;
        }
        if (gEv.pic && gEv.pic !== existing.pic) {
          existing.pic = gEv.pic;
          hasChanges = true;
        }
        if (gEv.category && gEv.category !== existing.category) {
          existing.category = gEv.category;
          hasChanges = true;
        }

        if (hasChanges) {
          const updated = await saveAgendaEvent(existing);
          updatedCount++;
          if (updated.id) wmsMapById.set(updated.id, updated);
          if (updated.google_event_id) wmsMapByGoogleId.set(updated.google_event_id, updated);
        }
      }
    }

    // 2. Deteksi event yang dihapus di Google Calendar dalam rentang pantau (60 hari lalu s/d 180 hari ke depan)
    const nowMs = Date.now();
    const minCheckDate = new Date(nowMs - (60 * 24 * 3600 * 1000)).toISOString().slice(0, 10);
    const maxCheckDate = new Date(nowMs + (180 * 24 * 3600 * 1000)).toISOString().slice(0, 10);

    for (const wEv of currentWmsEvents) {
      if (!wEv.google_event_id || !wEv.id) continue;
      if (wEv.start_date >= minCheckDate && wEv.start_date <= maxCheckDate) {
        if (!seenGoogleIdsInFetch.has(wEv.google_event_id)) {
          // Event ini telah dihapus di Google Calendar
          if (wEv.source === 'google_calendar') {
            await deleteAgendaEvent(wEv.id);
            deletedCount++;
          } else {
            // Jika asalnya dibuat di WMS, lepaskan tautan google_event_id
            wEv.google_event_id = undefined;
            await saveAgendaEvent(wEv);
            updatedCount++;
          }
        }
      }
    }

    // Tandai waktu terakhir sync
    try {
      localStorage.setItem(LAST_GCAL_SYNC_KEY, new Date().toISOString());
    } catch {}

    if (onProgress) onProgress(`Selesai! ${addedCount} baru, ${updatedCount} diselaraskan, ${deletedCount} dihapus.`);

    return {
      added: addedCount,
      updated: updatedCount,
      deleted: deletedCount,
      totalGcal: gcalEvents.length,
    };
  } finally {
    isReconcilingInProgress = false;
  }
}

