/**
 * =============================================================================
 * TRELLO SYNC SERVICE — WMS CHOCOCHIPS
 * =============================================================================
 * Menghubungkan Trello Board (UPLOAD 2026 NEW) ke WMS dan Supabase.
 * Menangani ekstraksi data susunan artikel, kode barang, foto, tanggal tayang,
 * pewarisan foto lintas UP untuk kode barang yang sama, serta sinkronisasi dinamis
 * ke Google Drive & Supabase.
 */

import { getSupabaseClient } from './supabase';
import { TrelloUpItem } from '../types';
import { uploadImageToGdrive } from './gdriveUpload';
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
 * Ekstrak kode artikel dasar (misal "622289 (foto hanya ilustrasi)" -> "622289")
 * Digunakan untuk pencocokan foto lintas UP atau dari Katalog Produk.
 */
export function extractBaseItemCode(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // 1. Pola kode produksi angka atau alfanumerik (cth: D1055, 25762, CCT045, 25751, DF26KBF03)
  const codeMatch = trimmed.match(/^([A-Za-z]{0,4}\d{2,8}[A-Za-z0-9_-]*?)\b/);
  if (codeMatch && codeMatch[1].length >= 3) {
    return codeMatch[1].toUpperCase();
  }
  const firstToken = trimmed.split(/[\/\-\s]+/)[0].trim().toUpperCase();
  if (firstToken && firstToken.length >= 3 && /\d{2,}/.test(firstToken)) {
    return firstToken;
  }
  return trimmed.toUpperCase();
}

/**
 * Parsing nama kartu Trello (misal "25289 // Ravelia Top", "958 - Quincy Skirt", atau "622289 (foto hanya ilustrasi)")
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

  // Jika dimulai dengan kode angka atau alfanumerik (misal "D1055 Crimson Top", "622289 (foto hanya ilustrasi)")
  const leadingCodeMatch = cleanRaw.match(/^([A-Za-z]{0,4}\d{2,8}[A-Za-z0-9_-]*?)\s+(.+)$/);
  if (leadingCodeMatch) {
    return {
      itemCode: leadingCodeMatch[1].trim().toUpperCase(),
      itemName: leadingCodeMatch[2].trim(),
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
 * Ambil kamus foto manual dari Katalog Produk lokal bila ada
 */
function getManualCatalogPhotosByCode(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const raw = localStorage.getItem('wms_katalog_manual_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [key, val] of Object.entries(parsed as Record<string, any>)) {
          const photo = val?.imageUrl || val?.photoUrl || val?.foto;
          if (photo && typeof photo === 'string') {
            const base = extractBaseItemCode(key);
            if (base) map.set(base, photo);
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return map;
}

/**
 * Perkaya daftar TrelloUpItem dengan:
 * 1. Mempertahankan `gdrive_image_url` yang sudah ada di Supabase / cache lokal untuk kartu yang sama
 *    (kecuali cover attachment di Trello berubah ke ID baru).
 * 2. Pewarisan foto lintas UP berdasarkan `item_code` yang sama (jika sebuah kartu di UP lain lupa diberi foto,
 *    otomatis mewarisi foto dari artikel berkode sama di UP lain atau Katalog Produk).
 */
export function enrichTrelloItemsWithPhotos(
  items: TrelloUpItem[],
  referenceItems: TrelloUpItem[] = []
): TrelloUpItem[] {
  const refById = new Map<string, TrelloUpItem>();
  const donorByCode = new Map<string, { gdrive_image_url?: string; gdrive_file_id?: string; gdrive_folder_name?: string; trello_image_url?: string }>();

  const registerDonor = (row: TrelloUpItem) => {
    const code = extractBaseItemCode(row.item_code || row.card_name);
    if (!code || code.length < 3) return;
    const existing = donorByCode.get(code);
    if (row.gdrive_image_url) {
      donorByCode.set(code, {
        gdrive_image_url: row.gdrive_image_url,
        gdrive_file_id: row.gdrive_file_id || existing?.gdrive_file_id,
        gdrive_folder_name: row.gdrive_folder_name || existing?.gdrive_folder_name,
        trello_image_url: row.trello_image_url || existing?.trello_image_url,
      });
    } else if (row.trello_image_url && !existing?.gdrive_image_url && !existing?.trello_image_url) {
      donorByCode.set(code, {
        trello_image_url: row.trello_image_url,
      });
    }
  };

  for (const ref of referenceItems) {
    if (ref?.id) refById.set(ref.id, ref);
    registerDonor(ref);
  }
  for (const item of items) {
    registerDonor(item);
  }

  const manualCatalogMap = getManualCatalogPhotosByCode();

  // Pass 1: Pertahankan GDrive URL per ID kartu (selama attachment cover tidak diganti ke file berbeda)
  const pass1 = items.map((item) => {
    const prev = refById.get(item.id);
    let gdriveUrl = item.gdrive_image_url;
    let gdriveFileId = item.gdrive_file_id;
    let gdriveFolder = item.gdrive_folder_name;
    let trelloUrl = item.trello_image_url;

    if (!gdriveUrl && prev?.gdrive_image_url) {
      const attachmentChanged =
        item.trello_attachment_id &&
        prev.trello_attachment_id &&
        item.trello_attachment_id !== prev.trello_attachment_id;
      if (!attachmentChanged) {
        gdriveUrl = prev.gdrive_image_url;
        gdriveFileId = prev.gdrive_file_id;
        gdriveFolder = prev.gdrive_folder_name;
      }
    }
    if (!trelloUrl && prev?.trello_image_url) {
      trelloUrl = prev.trello_image_url;
    }

    const updated: TrelloUpItem = {
      ...item,
      gdrive_image_url: gdriveUrl,
      gdrive_file_id: gdriveFileId,
      gdrive_folder_name: gdriveFolder,
      trello_image_url: trelloUrl,
    };
    registerDonor(updated);
    return updated;
  });

  // Pass 2: Wariskan foto lintas UP untuk kode artikel yang sama jika kartu ini tidak punya foto
  return pass1.map((item) => {
    if (item.gdrive_image_url) return item;
    const code = extractBaseItemCode(item.item_code || item.card_name);
    if (!code) return item;

    const donor = donorByCode.get(code);
    if (donor) {
      // Jika kartu ini sendiri tidak punya attachment di Trello, atau belum punya gdrive_image_url tapi donor punya:
      // Catatan: jika kartu punya trello_image_url sendiri yang berbeda, jangan timpa dengan foto kode lain kecuali memang kode barangnya identik
      if (!item.trello_image_url && (donor.gdrive_image_url || donor.trello_image_url)) {
        return {
          ...item,
          gdrive_image_url: donor.gdrive_image_url || item.gdrive_image_url,
          gdrive_file_id: donor.gdrive_file_id || item.gdrive_file_id,
          gdrive_folder_name: donor.gdrive_folder_name || item.gdrive_folder_name,
          trello_image_url: item.trello_image_url || donor.trello_image_url,
        };
      }
      if (!item.gdrive_image_url && donor.gdrive_image_url && (!item.trello_image_url || item.trello_image_url === donor.trello_image_url)) {
        return {
          ...item,
          gdrive_image_url: donor.gdrive_image_url,
          gdrive_file_id: donor.gdrive_file_id || item.gdrive_file_id,
          gdrive_folder_name: donor.gdrive_folder_name || item.gdrive_folder_name,
        };
      }
    }

    const catalogPhoto = manualCatalogMap.get(code);
    if (!item.gdrive_image_url && !item.trello_image_url && catalogPhoto) {
      return {
        ...item,
        gdrive_image_url: catalogPhoto,
      };
    }

    return item;
  });
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
        return { items: enrichTrelloItemsWithPhotos(items, items), lastSynced };
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
    const existing = getLocalCachedTrelloItems().items;
    const enriched = enrichTrelloItemsWithPhotos(items, existing);

    // Simpan data bersih termasuk list_pos, list_index, dan gdrive_image_url agar foto & urutan selalu stabil
    const leanItems = enriched.map(i => {
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
        trello_attachment_id: i.trello_attachment_id,
        trello_image_url: i.trello_image_url,
        gdrive_file_id: i.gdrive_file_id,
        gdrive_image_url: i.gdrive_image_url,
        gdrive_folder_name: i.gdrive_folder_name,
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

    const rawItems = (data || []).map((row: any) => {
      const meta = resolveTrelloListMeta(row.list_id, row.list_name);
      const parsed = parseCardName(row.card_name || '');
      return {
        ...row,
        item_code: parsed.itemCode || row.item_code,
        item_name: parsed.itemName || row.item_name,
        list_pos: row.list_pos ?? row.raw_json?.list_pos ?? meta?.pos,
        list_index: row.list_index ?? row.raw_json?.list_index ?? meta?.index,
      };
    }) as TrelloUpItem[];

    return enrichTrelloItemsWithPhotos(rawItems, rawItems);
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
  for (let listIdx = 0; listIdx < sortedLists.length; listIdx++) {
    const listInfo = sortedLists[listIdx];
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
      } else if (c.cover?.scaled && Array.isArray(c.cover.scaled) && c.cover.scaled.length > 0) {
        // Fallback jika cover diambil dari scaled cover object Trello
        const bestScaled = c.cover.scaled.find((s: any) => s.width >= 600) || c.cover.scaled[c.cover.scaled.length - 1];
        if (bestScaled?.url) {
          photoUrl = bestScaled.url;
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
        list_index: listIdx,
        trello_attachment_id: attachmentId,
        trello_image_url: photoUrl,
        status: 'ACTIVE',
        raw_json: {
          badges: c.badges,
          labels: c.labels,
          attachmentsCount: c.attachments?.length || 0,
          list_pos: listInfo.pos,
          list_index: listIdx
        },
        last_synced_at: new Date().toISOString()
      });
    });
  }

  return results;
}

/**
 * Sinkronisasi penuh: Tarik dari Trello, gabungkan `gdrive_image_url` dari Supabase/cache,
 * simpan ke Supabase, dan perbarui cache lokal tanpa menghapus URL Google Drive.
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
    const rawTransformed = transformTrelloData(lists, cards);

    // Ambil referensi item yang sudah ada (dari cache lokal & Supabase) agar gdrive_image_url tidak pernah hilang!
    const cachedItems = getLocalCachedTrelloItems().items;
    const sbExistingItems = await fetchTrelloUpFromSupabase();
    const combinedRefs = [...sbExistingItems, ...cachedItems];
    const transformedItems = enrichTrelloItemsWithPhotos(rawTransformed, combinedRefs);

    // Deteksi perubahan (edit / tambah / pindah list / geser urutan / ganti cover / hapus)
    const signature = computeTrelloSignature(lists, transformedItems);
    let previousSignature = '';
    try { previousSignature = localStorage.getItem(LOCAL_STORAGE_SIGNATURE_KEY) || ''; } catch { /* ignore */ }
    const changed = signature !== previousSignature;

    // Simpan ke Cache Lokal (dengan gdrive_image_url yang sudah utuh)
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
          const chunk = transformedItems.slice(i, i + chunkSize).map(item => {
            const payload: Record<string, any> = {
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
            };
            if (item.gdrive_image_url) {
              payload.gdrive_image_url = item.gdrive_image_url;
            }
            if (item.gdrive_file_id) {
              payload.gdrive_file_id = item.gdrive_file_id;
            }
            if (item.gdrive_folder_name) {
              payload.gdrive_folder_name = item.gdrive_folder_name;
            }
            return payload;
          });

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

/**
 * Konversi Blob menjadi Data URL Base64
 */
function blobToBase64DataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Gagal membaca blob sebagai base64'));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Sinkronisasi otomatis foto kartu Trello baru yang sudah memiliki `trello_image_url`
 * tetapi belum diunggah ke Google Drive (`gdrive_image_url` kosong).
 */
export async function syncMissingTrelloPhotosToGdrive(
  items: TrelloUpItem[],
  onProgress?: (done: number, total: number, updatedItem: TrelloUpItem) => void
): Promise<{ syncedCount: number; updatedItems: TrelloUpItem[] }> {
  const candidates = items.filter(
    (i) => !i.gdrive_image_url && !!i.trello_image_url && i.trello_image_url.includes('trello.com')
  );

  if (candidates.length === 0) {
    return { syncedCount: 0, updatedItems: items };
  }

  const supabase = getSupabaseClient();
  const updatedMap = new Map<string, Partial<TrelloUpItem>>();
  let syncedCount = 0;

  for (let idx = 0; idx < candidates.length; idx++) {
    const item = candidates[idx];
    try {
      const authHeader = `OAuth oauth_consumer_key="${DEFAULT_TRELLO_KEY}", oauth_token="${DEFAULT_TRELLO_TOKEN}"`;
      const response = await fetch(item.trello_image_url!, {
        headers: { Authorization: authHeader },
      });
      if (!response.ok) continue;

      const blob = await response.blob();
      const base64DataUrl = await blobToBase64DataUrl(blob);
      const safeName = `${item.up_code}_${item.sequence_order}_${item.item_code}`
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 80);

      const uploadRes = await uploadImageToGdrive(base64DataUrl, `${safeName}.jpg`);
      if (uploadRes.success && uploadRes.url) {
        const patch: Partial<TrelloUpItem> = {
          gdrive_image_url: uploadRes.url,
          gdrive_file_id: uploadRes.fileId,
          gdrive_folder_name: item.list_name || item.up_code,
        };
        updatedMap.set(item.id, patch);
        syncedCount++;

        if (supabase) {
          await supabase
            .from('trello_up_catalog')
            .update(patch)
            .eq('id', item.id);
        }

        onProgress?.(syncedCount, candidates.length, { ...item, ...patch });
      }
    } catch (err) {
      console.warn('Gagal auto-upload foto Trello ke GDrive:', item.card_name, err);
    }
  }

  const merged = enrichTrelloItemsWithPhotos(
    items.map((i) => (updatedMap.has(i.id) ? { ...i, ...updatedMap.get(i.id)! } : i)),
    items
  );
  setLocalCachedTrelloItems(merged);
  return { syncedCount, updatedItems: merged };
}

/**
 * Upload foto manual dari komputer/HP untuk kartu Trello yang belum memiliki foto di Trello asli
 * (misal kartu kode barang yang belum dilampiri foto oleh tim desain).
 * Menyimpan foto ke Google Drive dan mengupdate semua kartu dengan kode artikel yang sama di Supabase.
 */
export async function uploadManualPhotoForTrelloItem(
  targetItem: TrelloUpItem,
  base64DataUrl: string
): Promise<{ success: boolean; gdriveUrl?: string; error?: string }> {
  try {
    const safeName = `Manual_${targetItem.up_code}_${targetItem.item_code || targetItem.id}`
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 80);

    const res = await uploadImageToGdrive(base64DataUrl, `${safeName}.jpg`);
    if (!res.success || !res.url) {
      return { success: false, error: res.error || 'Gagal mengunggah foto ke Google Drive' };
    }

    const supabase = getSupabaseClient();
    const baseCode = extractBaseItemCode(targetItem.item_code || targetItem.card_name);

    if (supabase) {
      // Update kartu ini secara langsung
      await supabase
        .from('trello_up_catalog')
        .update({
          gdrive_image_url: res.url,
          gdrive_file_id: res.fileId || null,
          gdrive_folder_name: targetItem.list_name || targetItem.up_code || null,
        })
        .eq('id', targetItem.id);

      // Jika ada kartu lain dengan item_code persis sama yang juga belum punya gdrive_image_url, lengkapi sekaligus
      if (baseCode && baseCode.length >= 4) {
        await supabase
          .from('trello_up_catalog')
          .update({
            gdrive_image_url: res.url,
            gdrive_file_id: res.fileId || null,
            gdrive_folder_name: targetItem.list_name || targetItem.up_code || null,
          })
          .eq('item_code', targetItem.item_code)
          .is('gdrive_image_url', null);
      }
    }

    return { success: true, gdriveUrl: res.url };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal menyimpan foto manual' };
  }
}
