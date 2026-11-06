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

export const DEFAULT_TRELLO_BOARD_ID = 'zCN7H9VD';
export const DEFAULT_TRELLO_KEY = 'd4d21774e001c525d41aabbbb9b9940a';
export const DEFAULT_TRELLO_TOKEN = 'ATTA24c8656d86fe6a0499a0e81d8c8f2f0f200ec6e7d52a9259646c1e84e03943ac56487FCC';

const LOCAL_STORAGE_CACHE_KEY = 'wms_trello_up_catalog_cache';
const LOCAL_STORAGE_LAST_SYNC_KEY = 'wms_trello_up_last_sync';

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
  // Regex mencari UP [angka]
  const upMatch = clean.match(/(UP\s*\d+[a-zA-Z0-9_\-\s]*?)(?:\s*-\s*|\s+)(\d+\s+[a-zA-Z]+|\d+\/\d+|\w+.*)?$/i);

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
      if (Array.isArray(items)) {
        return { items, lastSynced };
      }
    }
  } catch (err) {
    console.warn('Gagal membaca cache lokal Trello:', err);
  }
  return { items: [], lastSynced: null };
}

/**
 * Simpan data ke cache lokal
 */
export function setLocalCachedTrelloItems(items: TrelloUpItem[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(items));
    localStorage.setItem(LOCAL_STORAGE_LAST_SYNC_KEY, new Date().toISOString());
  } catch (err) {
    console.warn('Gagal menyimpan cache lokal Trello:', err);
  }
}

/**
 * Tarik data live dari Trello API (Mengambil lists & cards dengan attachment gambar)
 */
export async function fetchLiveTrelloBoard(
  apiKey: string = DEFAULT_TRELLO_KEY,
  apiToken: string = DEFAULT_TRELLO_TOKEN,
  boardId: string = DEFAULT_TRELLO_BOARD_ID
): Promise<{ lists: any[]; cards: any[] }> {
  const url = `https://api.trello.com/1/boards/${boardId}?key=${apiKey}&token=${apiToken}&lists=open&cards=open&attachments=true`;

  const response = await fetch(url);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gagal menghubungi Trello API (Status ${response.status}): ${errText}`);
  }

  const json = await response.json();
  return {
    lists: json.lists || [],
    cards: json.cards || []
  };
}

/**
 * Transformasi raw Trello response menjadi daftar `TrelloUpItem` terstruktur
 */
export function transformTrelloData(lists: any[], cards: any[]): TrelloUpItem[] {
  const listMap = new Map<string, any>();
  lists.forEach(l => listMap.set(l.id, l));

  // Kelompokkan kartu per list dan urutkan berdasarkan pos
  const cardsByList = new Map<string, any[]>();
  cards.forEach(c => {
    if (!cardsByList.has(c.idList)) {
      cardsByList.set(c.idList, []);
    }
    cardsByList.get(c.idList)!.push(c);
  });

  const results: TrelloUpItem[] = [];

  // Urutkan setiap list kartu berdasarkan pos
  for (const [listId, listCards] of cardsByList.entries()) {
    const listInfo = listMap.get(listId);
    if (!listInfo) continue;

    const listName = listInfo.name || '';
    const { upCode, publishDateRaw } = parseListName(listName);

    // Filter: Abaikan list arsip / list yang jelas bukan UP jika ada
    const isUpList = /UP\s*\d+/i.test(listName) || /SEPT|OKT|NOV|DES|JAN|FEB|MAR|APR|MEI|JUN|JUL|AGUS/i.test(listName);

    listCards.sort((a, b) => a.pos - b.pos);

    listCards.forEach((c, idx) => {
      const { itemCode, itemName, qtyNote } = parseCardName(c.name);

      // Cari attachment foto utama (cover atau attachment pertama bertipe gambar)
      let photoUrl: string | undefined;
      let attachmentId: string | undefined;

      if (c.attachments && c.attachments.length > 0) {
        // Cari gambar terbesar / cover
        const imgAtt = c.attachments.find((att: any) =>
          att.mimeType?.startsWith('image/') ||
          /\.(jpg|jpeg|png|webp|gif)$/i.test(att.name || att.url)
        ) || c.attachments[0];

        if (imgAtt) {
          attachmentId = imgAtt.id;
          // Gunakan preview berukuran optimal (600x600 atau 1200x1200) jika ada agar loading cepat dan hemat bandwidth
          if (imgAtt.previews && imgAtt.previews.length > 0) {
            const goodPreview = imgAtt.previews.find((p: any) => p.width >= 600) || imgAtt.previews[imgAtt.previews.length - 1];
            photoUrl = goodPreview ? goodPreview.url : imgAtt.url;
          } else {
            photoUrl = imgAtt.url;
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
        trello_attachment_id: attachmentId,
        trello_image_url: photoUrl,
        status: 'ACTIVE',
        raw_json: {
          badges: c.badges,
          labels: c.labels,
          attachmentsCount: c.attachments?.length || 0
        },
        last_synced_at: new Date().toISOString()
      });
    });
  }

  return results;
}

/**
 * Sinkronisasi penuh: Tarik dari Trello, simpan ke Supabase (jika tabel ada), dan perbarui cache lokal
 */
export async function syncTrelloUpCatalog(
  apiKey: string = DEFAULT_TRELLO_KEY,
  apiToken: string = DEFAULT_TRELLO_TOKEN,
  boardId: string = DEFAULT_TRELLO_BOARD_ID
): Promise<{ success: boolean; totalItems: number; supabaseSaved: boolean; error?: string }> {
  try {
    const { lists, cards } = await fetchLiveTrelloBoard(apiKey, apiToken, boardId);
    const transformedItems = transformTrelloData(lists, cards);

    // Simpan ke Cache Lokal
    setLocalCachedTrelloItems(transformedItems);

    // Coba simpan / upsert ke Supabase
    let supabaseSaved = false;
    const supabase = getSupabaseClient();
    if (supabase && transformedItems.length > 0) {
      try {
        // Chunk per 100 baris untuk efisiensi
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
            console.warn('Supabase upsert warning (tabel mungkin belum dibuat):', upsertError.message);
            break;
          } else {
            supabaseSaved = true;
          }
        }
      } catch (sbErr) {
        console.warn('Supabase trello_up_catalog belum dibuat / error:', sbErr);
      }
    }

    return {
      success: true,
      totalItems: transformedItems.length,
      supabaseSaved
    };
  } catch (err: any) {
    console.error('Error saat sinkronisasi Trello:', err);
    return {
      success: false,
      totalItems: 0,
      supabaseSaved: false,
      error: err.message || 'Gagal sinkronisasi data Trello'
    };
  }
}

