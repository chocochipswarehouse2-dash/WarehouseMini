/**
 * =============================================================================
 * TRELLO SYNC SERVICE — WMS CHOCOCHIPS
 * =============================================================================
 * Menghubungkan Trello Board (UPLOAD 2026 NEW) ke WMS dan Supabase.
 * Menangani ekstraksi data susunan artikel, kode barang, foto, tanggal tayang,
 * serta sinkronisasi dinamis (reorder, edit, delete, move folder).
 */

import { getSupabaseClient } from './supabase';
import { TrelloUpItem } from '../types';
import baselineBoardLists from '../data/trelloBoardLists.json';

export const DEFAULT_TRELLO_BOARD_ID = 'zCN7H9VD';
export const DEFAULT_TRELLO_KEY = 'd4d21774e001c525d41aabbbb9b9940a';
export const DEFAULT_TRELLO_TOKEN = 'ATTA24c8656d86fe6a0499a0e81d8c8f2f0f200ec6e7d52a9259646c1e84e03943ac56487FCC';

const LOCAL_STORAGE_CACHE_KEY = 'wms_trello_up_catalog_cache';
const LOCAL_STORAGE_LAST_SYNC_KEY = 'wms_trello_up_last_sync';
const LOCAL_STORAGE_LISTS_KEY = 'wms_trello_board_lists_map';
const LOCAL_STORAGE_SIGNATURE_KEY = 'wms_trello_board_signature';

/** Interval auto-sync berkala dari Trello asli (ms). */
export const TRELLO_AUTO_SYNC_INTERVAL_MS = 60_000;

/** Paksa sync berikutnya menulis ulang ke Supabase (dipakai tombol Sync manual). */
export function resetTrelloSyncSignature(): void {
  try { localStorage.removeItem(LOCAL_STORAGE_SIGNATURE_KEY); } catch { /* ignore */ }
}

/** Sidik jari ringan seluruh board: berubah bila ada edit/tambah/pindah/geser/hapus kartu atau list. */
function computeTrelloSignature(lists: any[], items: TrelloUpItem[]): string {
  const listPart = (lists || []).map((l: any) => `${l.id}:${l.name}:${l.pos}`).join('|');
  const itemPart = items
    .map((i) => `${i.id}:${i.list_id}:${i.pos}:${i.card_name}:${i.qty_note || ''}:${i.trello_attachment_id || ''}:${i.trello_image_url || ''}:${(i.description || '').length}`)
    .sort()
    .join('|');
  let h = 5381;
  const s = `${listPart}#${itemPart}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${items.length}-${(h >>> 0).toString(36)}`;
}

export interface TrelloListMeta {
  pos: number;
  index: number;
  name: string;
}

/**
 * Membaca kamus posisi list Trello (urutan horizontal kiri ke kanan).
 * Menggabungkan baseline kompilasi dengan cache dinamis live dari browser.
 */
export function getTrelloListPositionsMap(): Record<string, TrelloListMeta> {
  const map: Record<string, TrelloListMeta> = { ...(baselineBoardLists as Record<string, TrelloListMeta>) };
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_LISTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.assign(map, parsed);
      }
    }
  } catch (err) {
    console.warn('Gagal membaca cache list positions Trello:', err);
  }
  return map;
}

/**
 * Menyimpan pemetaan posisi list Trello live ke localStorage
 */
export function saveTrelloListPositionsMap(lists: any[]): void {
  try {
    const sorted = [...(lists || [])].sort((a, b) => (Number(a.pos) || 0) - (Number(b.pos) || 0));
    const map: Record<string, TrelloListMeta> = {};
    sorted.forEach((l, idx) => {
      map[l.id] = {
        pos: Number(l.pos) || 0,
        index: idx,
        name: l.name || ''
      };
    });
    localStorage.setItem(LOCAL_STORAGE_LISTS_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Gagal menyimpan cache list positions Trello:', err);
  }
}

/**
 * Resolusi posisi dan indeks list Trello berdasarkan listId atau nama list
 */
export function resolveTrelloListMeta(listId?: string, listName?: string): TrelloListMeta | null {
  const map = getTrelloListPositionsMap();
  if (listId && map[listId]) {
    return map[listId];
  }
  if (listName) {
    const cleanName = listName.trim().toLowerCase();
    for (const id in map) {
      if (map[id].name && map[id].name.trim().toLowerCase() === cleanName) {
        return map[id];
      }
    }
  }
  return null;
}

/**
 * Parsing nama kartu Trello (misal "25289 // Ravelia Top" atau "958 // Quincy Skirt")
 */
export function parseCardName(cardName: string): { itemCode: string; itemName: string; qtyNote?: string } {
  if (!cardName) return { itemCode: '', itemName: '' };

  const raw = cardName.trim();
  let qtyNote: string | undefined;

  // Cek apakah ada catatan @ 1 atau @ 2 di nama
  const atMatch = raw.match(/@\s*(\d+)/i);
  if (atMatch) {
    qtyNote = `@ ${atMatch[1]}`;
  }

  // Bersihkan teks @ dari nama sebelum pemisahan
  const cleanRaw = raw.replace(/@\s*\d+/gi, '').trim();

  if (cleanRaw.includes('//')) {
    const parts = cleanRaw.split('//').map(p => p.trim());
    return {
      itemCode: parts[0] || '',
      itemName: parts.slice(1).join(' // ') || parts[0] || '',
      qtyNote
    };
  }

  if (cleanRaw.includes('-')) {
    const parts = cleanRaw.split('-').map(p => p.trim());
    return {
      itemCode: parts[0] || '',
      itemName: parts.slice(1).join(' - ') || parts[0] || '',
      qtyNote
    };
  }

  return {
    itemCode: cleanRaw,
    itemName: cleanRaw,
    qtyNote
  };
}

/**
 * Parsing nama kolom/list Trello (misal "UP 279 - 4 SEPT" atau "UP 280 - 13 SEPT")
 */
export function parseListName(listName: string): { upCode: string; publishDateRaw: string } {
  if (!listName) return { upCode: '', publishDateRaw: '' };

  const clean = listName.trim();
  if (clean.includes('-')) {
    const parts = clean.split('-').map(p => p.trim());
    return {
      upCode: parts[0] || clean,
      publishDateRaw: parts.slice(1).join(' - ') || ''
    };
  }

  return {
    upCode: clean,
    publishDateRaw: ''
  };
}

/**
 * Ambil data dari cache lokal (cepat saat pertama kali render)
 */
export function getLocalCachedTrelloItems(): { items: TrelloUpItem[]; lastSynced: string | null } {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
    const lastSynced = localStorage.getItem(LOCAL_STORAGE_LAST_SYNC_KEY);
    if (raw) {
      const items = JSON.parse(raw);
      if (Array.isArray(items) && items.length > 0) {
        return { items, lastSynced };
      }
    }
  } catch (err) {
    console.warn('Gagal membaca cache lokal Trello:', err);
  }
  return { items: [], lastSynced: null };
}

/**
 * Simpan data ke cache lokal (hanya metadata ringan agar tidak melebihi kuota 5MB)
 */
export function setLocalCachedTrelloItems(items: TrelloUpItem[]): void {
  try {
    // Simpan data bersih termasuk list_pos dan list_index agar pengurutan selalu stabil
    const leanItems = items.map(i => {
      const meta = (i.list_pos === undefined || i.list_index === undefined)
        ? resolveTrelloListMeta(i.list_id, i.list_name)
        : null;

      return {
        id: i.id,
        board_id: i.board_id,
        list_id: i.list_id,
        list_name: i.list_name,
        up_code: i.up_code,
        publish_date_raw: i.publish_date_raw,
        card_name: i.card_name,
        item_code: i.item_code,
        item_name: i.item_name,
        qty_note: i.qty_note,
        sequence_order: i.sequence_order,
        pos: i.pos,
        list_pos: i.list_pos ?? i.raw_json?.list_pos ?? meta?.pos,
        list_index: i.list_index ?? i.raw_json?.list_index ?? meta?.index,
        trello_image_url: i.trello_image_url,
        gdrive_image_url: i.gdrive_image_url,
        status: i.status,
        last_synced_at: i.last_synced_at
      };
    });
    localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(leanItems));
    localStorage.setItem(LOCAL_STORAGE_LAST_SYNC_KEY, new Date().toISOString());
  } catch (err) {
    console.warn('Gagal menyimpan cache lokal Trello:', err);
  }
}

/**
 * Ambil seluruh data dari database Supabase (trello_up_catalog)
 */
export async function fetchTrelloUpFromSupabase(): Promise<TrelloUpItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('trello_up_catalog')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('sequence_order', { ascending: true });

    if (error) {
      console.warn('Gagal memuat trello_up_catalog dari Supabase:', error.message);
      return [];
    }

    const items = (data || []).map((row: any) => {
      const meta = resolveTrelloListMeta(row.list_id, row.list_name);
      return {
        ...row,
        list_pos: row.list_pos ?? row.raw_json?.list_pos ?? meta?.pos,
        list_index: row.list_index ?? row.raw_json?.list_index ?? meta?.index,
      };
    }) as TrelloUpItem[];

    return items;
  } catch (err) {
    console.warn('Exception fetch trello_up_catalog:', err);
    return [];
  }
}

/**
 * Tarik data live dari Trello API (Mengambil lists & cards dengan attachment gambar lengkap)
 */
export async function fetchLiveTrelloBoard(
  apiKey: string = DEFAULT_TRELLO_KEY,
  apiToken: string = DEFAULT_TRELLO_TOKEN,
  boardId: string = DEFAULT_TRELLO_BOARD_ID
): Promise<{ lists: any[]; cards: any[] }> {
  const listsUrl = `https://api.trello.com/1/boards/${boardId}/lists?key=${apiKey}&token=${apiToken}&filter=open`;
  const cardsUrl = `https://api.trello.com/1/boards/${boardId}/cards?key=${apiKey}&token=${apiToken}&attachments=true&fields=name,idList,pos,desc,badges,cover,idAttachmentCover`;

  const [listsRes, cardsRes] = await Promise.all([
    fetch(listsUrl),
    fetch(cardsUrl)
  ]);

  if (!listsRes.ok) {
    const errText = await listsRes.text();
    throw new Error(`Gagal mengambil lists Trello (Status ${listsRes.status}): ${errText}`);
  }
  if (!cardsRes.ok) {
    const errText = await cardsRes.text();
    throw new Error(`Gagal mengambil cards Trello (Status ${cardsRes.status}): ${errText}`);
  }

  const [lists, cards] = await Promise.all([
    listsRes.json(),
    cardsRes.json()
  ]);

  return {
    lists: lists || [],
    cards: cards || []
  };
}

/**
 * Transformasi raw Trello response menjadi daftar `TrelloUpItem` terstruktur
 */
export function transformTrelloData(lists: any[], cards: any[]): TrelloUpItem[] {
  // Urutkan lists secara ketat sesuai posisi horizontal di papan Trello asli (l.pos ascending)
  const sortedLists = [...(lists || [])].sort((a, b) => (Number(a.pos) || 0) - (Number(b.pos) || 0));
  const listMap = new Map<string, any>();
  sortedLists.forEach((l, idx) => listMap.set(l.id, { ...l, index: idx }));

  // Kelompokkan kartu per list dan urutkan berdasarkan pos kartu di dalam list
  const cardsByList = new Map<string, any[]>();
  cards.forEach(c => {
    if (!cardsByList.has(c.idList)) {
      cardsByList.set(c.idList, []);
    }
    cardsByList.get(c.idList)!.push(c);
  });

  const results: TrelloUpItem[] = [];

  // Iterasi persis sesuai urutan list di papan Trello asli (Kiri ke Kanan)
  for (const listInfo of sortedLists) {
    const listCards = cardsByList.get(listInfo.id);
    if (!listCards || listCards.length === 0) continue;

    const listId = listInfo.id;
    const listName = listInfo.name || '';
    const { upCode, publishDateRaw } = parseListName(listName);

    listCards.sort((a, b) => a.pos - b.pos);

    listCards.forEach((c, idx) => {
      const { itemCode, itemName, qtyNote } = parseCardName(c.name);

      let photoUrl: string | undefined;
      let attachmentId: string | undefined;

      if (c.attachments && c.attachments.length > 0) {
        const isImageAttachment = (att: any) =>
          att.mimeType?.startsWith('image/') ||
          /\.(jpg|jpeg|png|webp|gif)$/i.test(att.name || att.url || '');

        const coverId = c.idAttachmentCover || c.cover?.idAttachment;
        let chosenAtt: any = null;

        // 1. Prioritas Utama: Cover resmi Trello jika merupakan gambar
        if (coverId) {
          const matched = c.attachments.find((att: any) => att.id === coverId);
          if (matched && isImageAttachment(matched)) {
            chosenAtt = matched;
          }
        }

        // 2. Prioritas Kedua: Attachment gambar yang BUKAN "BELUM ADA SAMPLE" (ambil yang paling baru)
        if (!chosenAtt) {
          const realImageAtts = c.attachments.filter((att: any) =>
            isImageAttachment(att) && !/BELUM.*SAMPLE/i.test(att.name || '')
          );
          if (realImageAtts.length > 0) {
            chosenAtt = realImageAtts[realImageAtts.length - 1];
          }
        }

        // 3. Prioritas Ketiga: Attachment gambar apapun
        if (!chosenAtt) {
          chosenAtt = c.attachments.find(isImageAttachment) || c.attachments[c.attachments.length - 1];
        }

        if (chosenAtt) {
          attachmentId = chosenAtt.id;
          // Gunakan preview berukuran optimal (600x600 atau 1200x1200) jika ada agar loading cepat
          if (chosenAtt.previews && chosenAtt.previews.length > 0) {
            const goodPreview =
              chosenAtt.previews.find((p: any) => p.width >= 600) ||
              chosenAtt.previews[chosenAtt.previews.length - 1];
            photoUrl = goodPreview ? goodPreview.url : chosenAtt.url;
          } else {
            photoUrl = chosenAtt.url;
          }
        }
      }

      results.push({
        id: c.id,
        board_id: DEFAULT_TRELLO_BOARD_ID,
        list_id: listId,
        list_name: listName,
        up_code: upCode || listName,
        publish_date_raw: publishDateRaw,
        card_name: c.name,
        item_code: itemCode,
        item_name: itemName,
        qty_note: qtyNote,
        description: c.desc || '',
        sequence_order: idx + 1,
        pos: c.pos,
        list_pos: listInfo.pos,
        list_index: listInfo.index,
        trello_attachment_id: attachmentId,
        trello_image_url: photoUrl,
        status: 'ACTIVE',
        raw_json: {
          badges: c.badges,
          labels: c.labels,
          attachmentsCount: c.attachments?.length || 0,
          list_pos: listInfo.pos,
          list_index: listInfo.index
        },
        last_synced_at: new Date().toISOString()
      });
    });
  }

  return results;
}

/**
 * Sinkronisasi penuh: Tarik dari Trello, simpan ke Supabase, dan perbarui cache lokal
 */
export async function syncTrelloUpCatalog(
  apiKey: string = DEFAULT_TRELLO_KEY,
  apiToken: string = DEFAULT_TRELLO_TOKEN,
  boardId: string = DEFAULT_TRELLO_BOARD_ID
): Promise<{ success: boolean; totalItems: number; supabaseSaved: boolean; items: TrelloUpItem[]; changed: boolean; archivedCount: number; error?: string }> {
  try {
    const { lists, cards } = await fetchLiveTrelloBoard(apiKey, apiToken, boardId);
    // Simpan posisi live lists Trello ke memory & localStorage
    saveTrelloListPositionsMap(lists);
    const transformedItems = transformTrelloData(lists, cards);

    // Deteksi perubahan (edit / tambah / pindah list / geser urutan / ganti cover / hapus)
    const signature = computeTrelloSignature(lists, transformedItems);
    let previousSignature = '';
    try { previousSignature = localStorage.getItem(LOCAL_STORAGE_SIGNATURE_KEY) || ''; } catch { /* ignore */ }
    const changed = signature !== previousSignature;

    // Simpan ke Cache Lokal
    setLocalCachedTrelloItems(transformedItems);

    if (!changed) {
      return { success: true, totalItems: transformedItems.length, supabaseSaved: true, items: transformedItems, changed: false, archivedCount: 0 };
    }

    // Simpan / upsert ke Supabase
    let supabaseSaved = false;
    let archivedCount = 0;
    const supabase = getSupabaseClient();
    if (supabase && transformedItems.length > 0) {
      try {
        const chunkSize = 100;
        for (let i = 0; i < transformedItems.length; i += chunkSize) {
          const chunk = transformedItems.slice(i, i + chunkSize).map(item => ({
            id: item.id,
            board_id: item.board_id,
            list_id: item.list_id,
            list_name: item.list_name,
            up_code: item.up_code,
            publish_date_raw: item.publish_date_raw,
            card_name: item.card_name,
            item_code: item.item_code,
            item_name: item.item_name,
            qty_note: item.qty_note,
            description: item.description,
            sequence_order: item.sequence_order,
            pos: item.pos,
            trello_attachment_id: item.trello_attachment_id,
            trello_image_url: item.trello_image_url,
            status: item.status,
            raw_json: item.raw_json,
            last_synced_at: item.last_synced_at
          }));

          const { error: upsertError } = await supabase
            .from('trello_up_catalog')
            .upsert(chunk, { onConflict: 'id' });

          if (upsertError) {
            console.warn('Supabase upsert warning:', upsertError.message);
            break;
          } else {
            supabaseSaved = true;
          }
        }
      } catch (sbErr) {
        console.warn('Supabase trello_up_catalog error:', sbErr);
      }

      // Arsipkan kartu yang sudah dihapus / di-archive / pindah board di Trello asli
      if (supabaseSaved) {
        try {
          const liveIds = new Set(transformedItems.map((i) => i.id));
          const boardKey = transformedItems[0]?.board_id;
          let q = supabase.from('trello_up_catalog').select('id').eq('status', 'ACTIVE');
          if (boardKey) q = q.eq('board_id', boardKey);
          const { data: activeRows } = await q.limit(10000);
          const staleIds = (activeRows || []).map((r: any) => r.id).filter((id: string) => !liveIds.has(id));
          for (let i = 0; i < staleIds.length; i += 100) {
            const { error: archErr } = await supabase
              .from('trello_up_catalog')
              .update({ status: 'ARCHIVED', last_synced_at: new Date().toISOString() })
              .in('id', staleIds.slice(i, i + 100));
            if (archErr) { console.warn('Archive stale trello cards warning:', archErr.message); break; }
            archivedCount += Math.min(100, staleIds.length - i);
          }
        } catch (archErr) {
          console.warn('Archive stale trello cards error:', archErr);
        }
      }
    }

    if (supabaseSaved) {
      try { localStorage.setItem(LOCAL_STORAGE_SIGNATURE_KEY, signature); } catch { /* ignore */ }
    }

    return {
      success: true,
      totalItems: transformedItems.length,
      supabaseSaved,
      items: transformedItems,
      changed: true,
      archivedCount,
    };
  } catch (err: any) {
    console.error('Error saat sinkronisasi Trello:', err);
    return {
      success: false,
      totalItems: 0,
      supabaseSaved: false,
      items: [],
      changed: false,
      archivedCount: 0,
      error: err.message || 'Gagal sinkronisasi data Trello'
    };
  }
}
