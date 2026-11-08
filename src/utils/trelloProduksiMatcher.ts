/**
 * =============================================================================
 * TRELLO PRODUKSI MATCHER & AUTO-LOOKUP UTILITY
 * =============================================================================
 * Menghubungkan Trello UP Catalog dengan Modul Penerimaan Produksi & Spreadsheet.
 * Mendukung pencocokan 4 tingkat (Tier 1: Exact, Tier 2: Base Code, Tier 3: Fuzzy, Tier 4: Image dHash)
 * untuk mengisi Nama Produk, Kode UP, dan Foto secara otomatis.
 */

import { TrelloUpItem, PenerimaanProduksiItem } from '../types';
import { extractBaseItemCode, getLocalCachedTrelloItems, fetchTrelloUpFromSupabase } from '../services/trelloSyncService';

export interface TrelloMatchResult {
  matchedItem: TrelloUpItem;
  tier: 'EXACT' | 'BASE_CODE' | 'FUZZY' | 'IMAGE';
  confidence: number; // 0 - 100
  productName: string;
  upCode: string;
  photoUrl?: string;
  alternateCandidates?: TrelloUpItem[];
}

export interface TrelloLookupDictionary {
  byExactCode: Map<string, TrelloUpItem[]>;
  byBaseCode: Map<string, TrelloUpItem[]>;
  allItems: TrelloUpItem[];
  lastIndexed: number;
}

let cachedDictionary: TrelloLookupDictionary | null = null;

/**
 * Normalisasi kode untuk pencarian case-insensitive dan tanpa whitespace/karakter liar
 */
export function normalizeLookupCode(raw?: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Membangun kamus indeks cepat O(1) dari daftar TrelloUpItem
 */
export function buildTrelloLookupDictionary(items: TrelloUpItem[]): TrelloLookupDictionary {
  const byExactCode = new Map<string, TrelloUpItem[]>();
  const byBaseCode = new Map<string, TrelloUpItem[]>();

  // Urutkan item dari yang paling baru (UP tertinggi / pos terakhir) agar match prioritas adalah UP terbaru
  const sorted = [...items].sort((a, b) => {
    const posA = Number(a.list_pos ?? a.pos ?? 0);
    const posB = Number(b.list_pos ?? b.pos ?? 0);
    return posB - posA;
  });

  sorted.forEach((item) => {
    const exact = normalizeLookupCode(item.item_code);
    if (exact) {
      if (!byExactCode.has(exact)) byExactCode.set(exact, []);
      byExactCode.get(exact)!.push(item);
    }

    const base = extractBaseItemCode(item.item_code || item.card_name);
    if (base && base.length >= 3) {
      if (!byBaseCode.has(base)) byBaseCode.set(base, []);
      byBaseCode.get(base)!.push(item);
    }
  });

  return {
    byExactCode,
    byBaseCode,
    allItems: sorted,
    lastIndexed: Date.now(),
  };
}

/**
 * Ambil kamus Trello dari cache lokal atau in-memory O(1)
 */
export function getTrelloLookupDictionary(): TrelloLookupDictionary {
  if (cachedDictionary && Date.now() - cachedDictionary.lastIndexed < 60_000) {
    return cachedDictionary;
  }
  const cached = getLocalCachedTrelloItems();
  cachedDictionary = buildTrelloLookupDictionary(cached.items || []);
  return cachedDictionary;
}

/**
 * Refresh kamus Trello dari Supabase di background
 */
export async function refreshTrelloLookupDictionaryFromCloud(): Promise<TrelloLookupDictionary> {
  try {
    const sbItems = await fetchTrelloUpFromSupabase();
    if (sbItems && sbItems.length > 0) {
      cachedDictionary = buildTrelloLookupDictionary(sbItems);
      return cachedDictionary;
    }
  } catch (err) {
    console.warn('[trelloProduksiMatcher] Gagal refresh dari cloud:', err);
  }
  return getTrelloLookupDictionary();
}

/**
 * Hitung Jaro-Winkler atau Levenshtein distance sederhana untuk fuzzy code matching
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;

  // Substring match
  if (str1.includes(str2) || str2.includes(str1)) {
    return Math.min(len1, len2) / maxLen;
  }

  // Levenshtein
  const matrix: number[][] = [];
  for (let i = 0; i <= len2; i++) matrix[i] = [i];
  for (let j = 0; j <= len1; j++) matrix[0][j] = j;

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[len2][len1];
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Menghitung skor kecocokan antara raw input code dengan kandidat kartu Trello.
 * Mempertimbangkan:
 * 1. Ketepatan kode (single exact vs compound / slash)
 * 2. Gender hint (WOMAN/LADIES/FEMALE vs MAN/MEN/MALE/COUPLE)
 * 3. Kesesuaian nama artikel / tipe pakaian
 * 4. Urutan list & posisi
 */
export function scoreCandidateMatch(
  rawInput: string,
  candidate: TrelloUpItem,
  baseCode: string
): number {
  let score = 50; // base score untuk base-code match

  const normInput = (rawInput || '').trim().toUpperCase();
  const cardNameUpper = (candidate.card_name || '').toUpperCase();
  const itemNameUpper = (candidate.item_name || '').toUpperCase();
  const itemCodeUpper = (candidate.item_code || '').toUpperCase();
  const combinedText = `${cardNameUpper} ${itemNameUpper} ${itemCodeUpper}`;

  // 1. Single exact code match vs compound (misal "25762" vs "25762 / 26762")
  const isInputCompound = normInput.includes('/') || normInput.includes('&');
  const isCandidateCompound = itemCodeUpper.includes('/') || itemCodeUpper.includes('&') || cardNameUpper.includes(' / ');

  if (!isInputCompound && !isCandidateCompound) {
    // Input tunggal dan kartu tunggal -> sangat kuat
    score += 40;
  } else if (!isInputCompound && isCandidateCompound) {
    // Input tunggal tapi kartu compound -> berikan penalti
    score -= 20;
  } else if (isInputCompound && isCandidateCompound) {
    // Keduanya compound -> bonus
    score += 30;
  }

  // 2. Gender hint detection
  const isWomanInput = /\b(WOMAN|WANITA|LADIES|LADY|FEMALE|CEWEK|GIRL)\b/i.test(normInput);
  const isManInput = /\b(MAN|PRIA|MALE|COWOK|BOY|MEN)\b/i.test(normInput);

  const isWomanCandidate = /\b(WOMAN|WANITA|LADIES|LADY|FEMALE|GIRL|DRESS|SKIRT|ROK|GAMIS|TOP|BLOUSE|CULOTTE|VIORICA)\b/i.test(combinedText);
  const isManCandidate = /\b(MAN|PRIA|MALE|COWOK|BOY|MEN|CEDRIC|KEMEJA|SHIRT|POLO)\b/i.test(combinedText);

  if (isWomanInput) {
    if (isWomanCandidate && !isManCandidate) {
      score += 40;
    } else if (isManCandidate && !isWomanCandidate) {
      score -= 50;
    } else if (isWomanCandidate && isManCandidate) {
      // Ada keduanya (misal couple card)
      score -= 10;
    }
  }

  if (isManInput) {
    if (isManCandidate && !isWomanCandidate) {
      score += 40;
    } else if (isWomanCandidate && !isManCandidate) {
      score -= 50;
    }
  }

  // 3. Exact Substring Match in Item Name
  const words = normInput.split(/[^A-Z0-9]+/).filter((w) => w.length >= 3 && w !== baseCode);
  for (const w of words) {
    if (combinedText.includes(w)) {
      score += 25;
    }
  }

  // 4. Posisi / Recency (list_pos atau pos)
  const pos = Number(candidate.list_pos ?? candidate.pos ?? 0);
  if (pos > 0) {
    score += Math.min(10, Math.log10(pos));
  }

  return score;
}

/**
 * Mencocokkan Kode Produksi dengan data Trello UP Catalog
 */
export function matchTrelloByCode(rawCode?: string): TrelloMatchResult | null {
  if (!rawCode) return null;
  const norm = normalizeLookupCode(rawCode);
  if (!norm || norm.length < 2) return null;

  const dict = getTrelloLookupDictionary();

  // 1. Tier 1: Exact Match (100% confidence)
  const exactMatches = dict.byExactCode.get(norm);
  if (exactMatches && exactMatches.length > 0) {
    const sortedExact = exactMatches.length > 1
      ? [...exactMatches].sort((a, b) => scoreCandidateMatch(norm, b, norm) - scoreCandidateMatch(norm, a, norm))
      : exactMatches;
    const primary = sortedExact[0];
    return {
      matchedItem: primary,
      tier: 'EXACT',
      confidence: 100,
      productName: primary.item_name || primary.card_name,
      upCode: primary.up_code || primary.list_name,
      photoUrl: primary.gdrive_image_url || primary.trello_image_url,
      alternateCandidates: sortedExact.length > 1 ? sortedExact.slice(1) : undefined,
    };
  }

  // 2. Tier 2: Base Code Match (misal "25289-A", "CHN25289", "25762 - WOMAN") -> "25762"
  const baseCode = extractBaseItemCode(norm);
  if (baseCode && baseCode.length >= 3) {
    const baseMatches = dict.byBaseCode.get(baseCode);
    if (baseMatches && baseMatches.length > 0) {
      const sortedBase = baseMatches.length > 1
        ? [...baseMatches].sort((a, b) => scoreCandidateMatch(norm, b, baseCode) - scoreCandidateMatch(norm, a, baseCode))
        : baseMatches;
      const primary = sortedBase[0];
      return {
        matchedItem: primary,
        tier: 'BASE_CODE',
        confidence: 95,
        productName: primary.item_name || primary.card_name,
        upCode: primary.up_code || primary.list_name,
        photoUrl: primary.gdrive_image_url || primary.trello_image_url,
        alternateCandidates: sortedBase.length > 1 ? sortedBase.slice(1) : undefined,
      };
    }
  }

  // 3. Tier 3: Fuzzy Code Similarity
  // Cari di antara semua kode Trello dengan similarity >= 0.75
  let bestItem: TrelloUpItem | null = null;
  let bestSim = 0;
  const candidates: { item: TrelloUpItem; sim: number; score: number }[] = [];

  for (const item of dict.allItems) {
    const targetCode = normalizeLookupCode(item.item_code);
    if (!targetCode) continue;

    const sim = calculateSimilarity(norm, targetCode);
    if (sim >= 0.75) {
      const cScore = scoreCandidateMatch(norm, item, baseCode || norm);
      candidates.push({ item, sim, score: sim * 100 + cScore });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    const bestCandidate = candidates[0];
    bestItem = bestCandidate.item;
    bestSim = bestCandidate.sim;

    return {
      matchedItem: bestItem,
      tier: 'FUZZY',
      confidence: Math.round(bestSim * 100),
      productName: bestItem.item_name || bestItem.card_name,
      upCode: bestItem.up_code || bestItem.list_name,
      photoUrl: bestItem.gdrive_image_url || bestItem.trello_image_url,
      alternateCandidates: candidates.slice(1).map((c) => c.item),
    };
  }

  return null;
}

/**
 * Menghitung Difference Hash (dHash) 64-bit sederhana dari gambar via Canvas HTML5 (Client-side)
 * Resize gambar menjadi 9x8 grayscale, lalu bandingkan pixel kiri vs kanan (64-bit boolean string)
 */
export function computeImageDHash(dataUrlOrImg: HTMLImageElement | string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.document) {
      resolve('');
      return;
    }

    const img = typeof dataUrlOrImg === 'string' ? new Image() : dataUrlOrImg;
    if (typeof dataUrlOrImg === 'string') {
      img.crossOrigin = 'anonymous';
      img.onload = () => processCanvas(img);
      img.onerror = () => resolve('');
      img.src = dataUrlOrImg;
    } else {
      if (img.complete && img.naturalWidth > 0) {
        processCanvas(img);
      } else {
        img.onload = () => processCanvas(img);
        img.onerror = () => resolve('');
      }
    }

    function processCanvas(imageEl: HTMLImageElement) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 9;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('');
          return;
        }

        ctx.drawImage(imageEl, 0, 0, 9, 8);
        const imgData = ctx.getImageData(0, 0, 9, 8).data;

        // Hitung grayscale brightness per pixel
        const gray: number[][] = [];
        for (let y = 0; y < 8; y++) {
          gray[y] = [];
          for (let x = 0; x < 9; x++) {
            const idx = (y * 9 + x) * 4;
            // Luminance: 0.299 R + 0.587 G + 0.114 B
            const brightness = imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114;
            gray[y][x] = brightness;
          }
        }

        // Bandingkan kiri vs kanan -> 64 bit hash
        let hash = '';
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            hash += gray[y][x] > gray[y][x + 1] ? '1' : '0';
          }
        }

        resolve(hash);
      } catch (err) {
        resolve('');
      }
    }
  });
}

/**
 * Hitung Hamming Distance antara 2 dHash (0 - 64 bit difference)
 */
export function computeHammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
  let diff = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) diff++;
  }
  return diff;
}

/**
 * Helper untuk menyisipkan atau memperkaya metadata UP dan Nama Produk ke keterangan / catatan
 */
export function embedTrelloMetadataIntoKeterangan(
  existingKeterangan?: string,
  upCode?: string,
  productName?: string
): string {
  let text = (existingKeterangan || '').trim();

  // Jika sudah ada tag UP lama, bersihkan terlebih dahulu
  text = text.replace(/\|\s*UP:[^|]*/gi, '').trim();
  text = text.replace(/\|\s*NAMA:[^|]*/gi, '').trim();

  const parts: string[] = [];
  if (text) parts.push(text);
  if (upCode) parts.push(`UP:${upCode.trim()}`);
  if (productName && !text.toLowerCase().includes(productName.toLowerCase())) {
    parts.push(`NAMA:${productName.trim()}`);
  }

  return parts.join(' | ');
}

/**
 * Helper untuk membaca UP dan Nama Produk dari record PenerimaanProduksiItem / Keterangan
 */
export function extractTrelloMetadataFromItem(item: Partial<PenerimaanProduksiItem>): {
  upCode: string;
  productName: string;
  cleanNotes: string;
} {
  let upCode = '';
  let productName = item.nama_produk || '';
  let notes = (item.keterangan || (item as any).catatan || '').trim();

  // Ekstrak tag UP:
  const upMatch = notes.match(/\bUP:\s*([^|]+)/i);
  if (upMatch && upMatch[1]) {
    upCode = upMatch[1].trim();
  }

  // Ekstrak tag NAMA:
  const nameMatch = notes.match(/\bNAMA:\s*([^|]+)/i);
  if (nameMatch && nameMatch[1] && !productName) {
    productName = nameMatch[1].trim();
  }

  // Bersihkan tag dari notes
  const cleanNotes = notes
    .replace(/\|\s*UP:[^|]*/gi, '')
    .replace(/\|\s*NAMA:[^|]*/gi, '')
    .replace(/RETUR_CMT:\d+(@[\d-]+)?/g, '')
    .replace(/^\|+|\|+$/g, '')
    .trim();

  return { upCode, productName, cleanNotes };
}

