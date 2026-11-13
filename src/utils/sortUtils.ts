export function getSizeWeight(size: string): number {
  const s = (size || '').toUpperCase().trim();
  if (s === 'XXS' || s === '2XS') return 1;
  if (s === 'XS') return 2;
  if (s === 'S') return 3;
  if (s === 'M') return 4;
  if (s === 'L') return 5;
  if (s === 'XL') return 6;
  if (s === 'XXL' || s === '2XL') return 7;
  if (s === 'XXXL' || s === '3XL') return 8;
  if (s === 'XXXXL' || s === '4XL') return 9;
  if (s === '5XL') return 10;
  if (s === 'ALL' || s === 'ALLSIZE' || s === 'ALL SIZE' || s === 'FREESIZE' || s === 'FREE SIZE' || s === 'OS' || s === 'ONESIZE' || s === 'ONE SIZE') return 98;
  if (s === 'DEFAULT' || s === '-' || s === '') return 99;

  // Numerical sizes like 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36...
  const num = parseFloat(s);
  if (!isNaN(num)) {
    return 20 + num;
  }

  return 50; // other unknown sizes
}

export function sortAlphabeticalAndSize<T>(
  items: T[],
  getName: (item: T) => string,
  getSize: (item: T) => string
): T[] {
  return items.sort((a, b) => {
    const nameA = getName(a).toLowerCase().trim();
    const nameB = getName(b).toLowerCase().trim();
    
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    
    // Names are identical, sort by size
    const sizeA = getSizeWeight(getSize(a));
    const sizeB = getSizeWeight(getSize(b));
    return sizeA - sizeB;
  });
}

let lastQueryFuzzy = '';
let lastTermsFuzzy: string[] = [];

function getTerms(query: string): string[] {
  if (query !== lastQueryFuzzy) {
    lastQueryFuzzy = query;
    lastTermsFuzzy = query.toLowerCase().trim().split(/\s+/);
  }
  return lastTermsFuzzy;
}

let lastQueryPartial = '';
let lastKeywordsPartial: string[] = [];

function getPartialKeywords(query: string): string[] {
  if (query !== lastQueryPartial) {
    lastQueryPartial = query;
    lastKeywordsPartial = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }
  return lastKeywordsPartial;
}

/**
 * Partial multi-keyword search (identical to Inventory search):
 * Splits query by whitespace, checks if every keyword exists within any of the provided target fields.
 */
export function partialSearchMatch(
  query: string,
  ...targets: (string | number | boolean | null | undefined)[]
): boolean {
  if (!query || !query.trim()) return true;
  const keywords = getPartialKeywords(query);
  if (keywords.length === 0) return true;

  // Build combined text with minimal allocations
  let combinedText = '';
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t !== null && t !== undefined && t !== '') {
      combinedText += (combinedText ? ' ' : '') + String(t);
    }
  }
  const lower = combinedText.toLowerCase();

  for (let k = 0; k < keywords.length; k++) {
    if (!lower.includes(keywords[k])) return false;
  }
  return true;
}

/**
 * Fuzzy search that splits a search query by spaces and checks if ALL terms exist
 * within the target string.
 */
export function fuzzySearch(query: string, target: string): boolean {
  if (!query.trim()) return true;
  const terms = getTerms(query);
  const targetLower = (target || '').toLowerCase();
  for (let i = 0; i < terms.length; i++) {
    if (!targetLower.includes(terms[i])) return false;
  }
  return true;
}

/**
 * Fuzzy search that splits a search query by spaces and checks if ALL terms exist
 * within ANY of the target strings.
 */
export function fuzzySearchMultiple(query: string, targets: (string | undefined)[]): boolean {
  if (!query.trim()) return true;
  const terms = getTerms(query);
  
  // Avoid array map allocation if possible, use simple loops
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    let found = false;
    for (let j = 0; j < targets.length; j++) {
      const t = targets[j];
      if (t && t.toLowerCase().includes(term)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Extract size from SKU.
 * Follows strict priority order:
 * 1. Authoritative VLOOKUP: Look up SKU directly in Master Product catalog first.
 * 2. If genuinely not in master product, extracts from explicit separator (- / _ / space) e.g. "SKU-M", "SKU_XL".
 * 3. Never attempts fragile regex guessing for complex/unseparated SKUs.
 */
export function extractSizeFromSku(sku: string): string {
  // VLOOKUP murni ke master_produk: size = nilai master APA ADANYA.
  // SKU tidak ada di master => '-'. TIDAK ADA regex / tebakan dari akhiran SKU.
  const clean = (sku || '').trim().toUpperCase();
  if (!clean) return '-';
  const { exact } = getMasterLookupMaps();
  const found = exact.get(clean);
  if (found) {
    const mSize = String(found.size || '').trim();
    return mSize || '-';
  }
  return '-';
}
/**
 * Format product name so the size is guaranteed to be visible in the name
 * if size is known and not already contained in the product name.
 */
export function formatProductNameWithSize(name: string, size?: string): string {
  const cleanName = (name || '').trim();
  const cleanSize = (size || '').trim().toUpperCase();
  if (!cleanName) return '';
  if (!cleanSize || cleanSize === '-' || cleanSize === 'DEFAULT') {
    return cleanName;
  }

  // Check if name already has the size (e.g. "Luca Skirt Brown - M", "Luca Skirt Brown (M)", "Luca Skirt Brown M")
  const regex = new RegExp(`(?:[-/( ]|^)\\s*${cleanSize}\\s*(?:[-/) ]|$)`, 'i');
  if (regex.test(cleanName)) {
    return cleanName;
  }

  return `${cleanName} - ${cleanSize}`;
}
/**
 * Cleans up duplicated product names often found in bad legacy data 
 * e.g., "Genevive Shorts Black (M) - GENEVIVE SHORTS BLACK (M) - GENEVIVE SHORTS BLACK (M)"
 * or "Narcissa Top Brown (S) - NARCISSA TOP BROWN (S) - NARCISSA..."
 * or nested repetitive size patterns like "Nami Shorts Black (Size: Nami Shorts Black (XXL))".
 */
export function cleanProductName(name: string): string {
  if (!name) return '';
  let cleaned = name.trim();

  // 1. Strip (Size: ... anything ...) until balanced
  while (cleaned.includes('(Size:')) {
    const idx = cleaned.indexOf('(Size:');
    let depth = 0;
    let end = -1;
    for (let i = idx; i < cleaned.length; i++) {
      if (cleaned[i] === '(') depth++;
      else if (cleaned[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      cleaned = cleaned.slice(0, idx) + cleaned.slice(end + 1);
    } else {
      cleaned = cleaned.slice(0, idx);
    }
    cleaned = cleaned.trim();
  }

  // 2. Comprehensive deduplication of multi-segment repetitive names (e.g. A - A - A)
  const separatorRegex = /\s*[-â€“â€”|]\s*/;
  if (separatorRegex.test(cleaned)) {
    const rawParts = cleaned.split(separatorRegex).map((p) => p.trim()).filter(Boolean);
    if (rawParts.length > 1) {
      // Normalizer helper: strips parentheses, spaces, punctuation, case
      const normalizeSeg = (s: string) =>
        s.toLowerCase().replace(/[\(\)\[\]\-_/]/g, ' ').replace(/\s+/g, ' ').trim();

      const uniqueParts: string[] = [];
      const seenNormalized: string[] = [];

      for (const part of rawParts) {
        const norm = normalizeSeg(part);
        if (!norm) continue;

        const isDuplicate = seenNormalized.some(
          (seen) =>
            seen === norm ||
            (seen.length > 4 && norm.length > 4 && (seen.startsWith(norm) || norm.startsWith(seen)))
        );

        if (!isDuplicate) {
          uniqueParts.push(part);
          seenNormalized.push(norm);
        }
      }

      if (uniqueParts.length > 0) {
        // Prioritize segment with mixed case (Title Case) over ALL-CAPS
        const mixedCasePart = uniqueParts.find((p) => /[A-Z]/.test(p) && /[a-z]/.test(p));
        cleaned = mixedCasePart || uniqueParts[0];
      }
    }
  }

  // 3. Remove trailing duplicate size parentheses (e.g. "(M) (M)" -> "(M)")
  cleaned = cleaned.replace(/\s*\(([A-Z0-9/ ]+)\)\s*\(\1\)/gi, ' ($1)');

  // 4. Remove redundant double whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned;
}

/**
 * Extracts a clean single size token (e.g. 'XXL', 'S', 'L', 'All Size')
 * even if the input string contains full product titles or variation strings.
 */
export function extractCleanSizeToken(str?: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  if (/^(ALL SIZE|DEFAULT|ALL|ONESIZE|ONE SIZE|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|\d{2})$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  // Find standard size inside parentheses e.g. (XXL) or (Size: XXL) or (L)
  const sizeInParen = trimmed.match(/\((?:Size:\s*)?(XXXL|XXL|XL|XS|S|M|L|2XL|3XL|\d{2}|ALL\s*SIZE)\)/i);
  if (sizeInParen && sizeInParen[1]) {
    return sizeInParen[1].toUpperCase();
  }
  // Match standard size at the end of string
  const endSize = trimmed.match(/\b(XXXL|XXL|XL|XS|S|M|L|2XL|3XL|\d{2})\b$/i);
  if (endSize && endSize[1]) {
    return endSize[1].toUpperCase();
  }

  // If the input is actually a full product title / variant name (e.g. "Wintour Skirt Blue")
  if (
    /\b(skirt|top|dress|pants|blouse|shirt|cardigan|knit|outer|jacket|shorts|culotte|jeans|vest|tunic|tee|kaos|celana|rok)\b/i.test(trimmed) ||
    trimmed.split(/\s+/).length > 2
  ) {
    return 'Default';
  }

  return trimmed;
}

/**
 * 2-letter color suffix codes commonly used across Chocochips SKUs.
 * In single-size/All-Size items, these suffixes end with 'L' (e.g. YL=Yellow, OL=Olive, VL=Violet),
 * 'M' (e.g. CM=Caramel, EM=Emerald, DM=Denim), or 'S' (e.g. RS=Rust, BS=Black Stripe, WS=White Stripe).
 * NAIVE REGEX often mistakenly parses these last letters as clothing sizes 'L', 'M', or 'S'.
 */
export const KNOWN_2LETTER_COLOR_CODES = new Set([
  'YL', 'OL', 'VL', 'PL', 'SL', 'CL', 'TL', 'GL', 'BL', 'NL', 'RL', 'EL', 'KL', 'ML', 'LL', 'DL',
  'EM', 'CM', 'DM', 'LM', 'BM', 'PM', 'SM', 'TM', 'GM', 'KM', 'MM', 'RM', 'NM', 'AM',
  'BS', 'WS', 'NS', 'HS', 'RS', 'CS', 'GS', 'MS', 'SS', 'TS', 'KS', 'LS', 'OS', 'PS'
]);

export const KNOWN_3LETTER_COLOR_CODES = new Set([
  'NVL', 'ORS', 'CRS', 'DBL', 'BNL', 'YLM', 'DGM', 'BCM', 'CRL', 'BKL', 'WHL', 'GRL', 'PKL', 'RDL'
]);

/**
 * Checks if a given size ('S', 'M', 'L') is a false positive derived from a SKU color abbreviation suffix.
 * Example false positives:
 * - F26CTN699YL with size 'L' (YL = Yellow)
 * - STN501YL with size 'L' (YL = Yellow)
 * - 19LTO008OL with size 'L' (OL = Olive)
 * - B138CM with size 'M' (CM = Caramel)
 * - ST0103ORS with size 'S' (ORS = Old Rose)
 */
export function isCorruptedColorCodeSize(sku?: string | null, size?: unknown): boolean {
  if (!sku || size === undefined || size === null) return false;
  const cleanSku = String(sku).trim().toUpperCase();
  const cleanSize = String(size).trim().toUpperCase();

  // Only S, M, L are vulnerable to false positive color suffix collisions
  if (cleanSize !== 'S' && cleanSize !== 'M' && cleanSize !== 'L') return false;

  // Genuine multi-size SKUs with explicit separators (-S, _M, /L, .XL) are ALWAYS legitimate
  if (/[-_/\s.](S|M|L)$/i.test(cleanSku)) return false;

  if (cleanSku.length < 4) return false;

  const suf2 = cleanSku.slice(-2);
  const suf3 = cleanSku.slice(-3);

  if (KNOWN_2LETTER_COLOR_CODES.has(suf2) && suf2.endsWith(cleanSize)) {
    return true;
  }
  if (KNOWN_3LETTER_COLOR_CODES.has(suf3) && suf3.endsWith(cleanSize)) {
    return true;
  }

  return false;
}

/**
 * Validates whether a value is a legitimate clothing size (e.g. S, M, L, XL, XXL, 28, 30, etc.)
 * Returns false if value is null, undefined, '-', 'Default', or if it's erroneously set to a
 * full product/variant title (e.g. "Wintour Skirt Blue").
 */
export function isRealSize(sz?: unknown): boolean {
  if (sz === undefined || sz === null) return false;
  const clean = String(sz).trim();
  if (
    !clean ||
    clean === '-' ||
    clean.toLowerCase() === 'default' ||
    clean.toLowerCase() === 'none' ||
    clean.toLowerCase() === 'null' ||
    clean.toLowerCase() === 'undefined'
  ) {
    return false;
  }
  // Check if it's erroneously set to a full product/variant title (e.g. "Wintour Skirt Blue")
  if (
    /\b(skirt|top|dress|pants|pant|blouse|shirt|cardigan|knit|outer|jacket|shorts|culotte|jeans|vest|tunic|tee|kaos|celana|rok)\b/i.test(clean) ||
    clean.split(/\s+/).length > 2
  ) {
    return false;
  }
  return true;
}

interface CachedMasterEntry {
  name: string;
  size: string;
  category?: string;
}

let masterExactMap: Map<string, CachedMasterEntry> | null = null;
let masterPrefixMap: Map<string, string> | null = null;
let lastMasterMapBuild = 0;

/**
 * Directly populate master lookup maps from in-memory catalog
 */
export function setSortUtilsMasterCatalog(catalog: any[], lookupMap?: Map<string, any>): void {
  if (!masterExactMap) masterExactMap = new Map();
  if (!masterPrefixMap) masterPrefixMap = new Map();

  if (lookupMap && lookupMap instanceof Map) {
    for (const [k, p] of lookupMap.entries()) {
      if (!p) continue;
      const rawName = String(p.p || p.nama_produk || p.n || p.nama || '').trim();
      let rawSize = String(p.s || p.size || p.ukuran || p.varian || p.variant || '').trim();
      if (isCorruptedColorCodeSize(k, rawSize)) {
        rawSize = 'Default';
      }
      const rawCat = String(p.kategori || p.category || (p as any).c || (p as any).jenis || '').trim();
      masterExactMap.set(k, { name: rawName, size: rawSize, category: rawCat });
    }
  } else if (Array.isArray(catalog)) {
    for (let i = 0; i < catalog.length; i++) {
      const p = catalog[i];
      if (!p) continue;
      const k = String(p.k || p.sku || '').trim().toUpperCase();
      if (!k) continue;
      const rawName = String(p.p || p.nama_produk || p.n || p.nama || '').trim();
      let rawSize = String(p.s || p.size || p.ukuran || p.varian || p.variant || '').trim();
      if (isCorruptedColorCodeSize(k, rawSize)) {
        rawSize = 'Default';
      }
      const rawCat = String(p.kategori || p.category || (p as any).c || (p as any).jenis || '').trim();
      masterExactMap.set(k, { name: rawName, size: rawSize, category: rawCat });
    }
  }
}

function getMasterLookupMaps(): { exact: Map<string, CachedMasterEntry>; prefix: Map<string, string> } {
  const now = Date.now();
  if (masterExactMap && masterExactMap.size > 0 && masterPrefixMap && now - lastMasterMapBuild < 60000) {
    return { exact: masterExactMap, prefix: masterPrefixMap };
  }
  if (!masterExactMap) masterExactMap = new Map();
  if (!masterPrefixMap) masterPrefixMap = new Map();
  lastMasterMapBuild = now;

  // 1. High-speed check: global in-memory catalog Map
  if (typeof window !== 'undefined' && (window as any).__wms_global_catalog_map) {
    const gMap = (window as any).__wms_global_catalog_map as Map<string, any>;
    if (gMap && gMap.size > 0) {
      for (const [k, p] of gMap.entries()) {
        if (!p) continue;
        const rawName = String(p.p || p.nama_produk || p.n || p.nama || '').trim();
        let rawSize = String(p.s || p.size || p.ukuran || p.varian || p.variant || '').trim();
        if (isCorruptedColorCodeSize(k, rawSize)) {
          rawSize = 'Default';
        }
        const rawCat = String(p.kategori || p.category || (p as any).c || (p as any).jenis || '').trim();
        masterExactMap.set(k, { name: rawName, size: rawSize, category: rawCat });
      }
      return { exact: masterExactMap, prefix: masterPrefixMap };
    }
  }

  // 2. Fallback to localStorage caches
  if (typeof window !== 'undefined' && window.localStorage) {
    const cacheKeys = ['wms_master_produk', 'wms_product_cache', 'wms_catalog_cache', 'wms_dealpos_products'];
    for (const cKey of cacheKeys) {
      try {
        const cacheRaw = localStorage.getItem(cKey);
        if (!cacheRaw) continue;
        const cacheList = JSON.parse(cacheRaw);
        if (Array.isArray(cacheList)) {
          for (let i = 0; i < cacheList.length; i++) {
            const p = cacheList[i];
            if (!p) continue;
            const k = String(p.k || p.sku || '').trim().toUpperCase();
            if (!k) continue;
            const rawName = String(p.p || p.nama_produk || p.n || p.nama || '').trim();
            let rawSize = String(p.s || p.size || p.ukuran || p.varian || p.variant || '').trim();
            if (isCorruptedColorCodeSize(k, rawSize)) {
              rawSize = 'Default';
            }
            const rawCat = String(p.kategori || p.category || (p as any).c || (p as any).jenis || '').trim();
            if (!masterExactMap.has(k)) {
              masterExactMap.set(k, {
                name: rawName,
                size: rawSize,
                category: rawCat,
              });
            }
            if (k.length >= 6 && rawName && rawName.toUpperCase() !== k) {
              const pref = k.slice(0, -2);
              if (!masterPrefixMap.has(pref)) {
                masterPrefixMap.set(pref, rawName);
              }
            }
          }
          // Stop after first populated master product cache to avoid redundant JSON parsing
          if (masterExactMap.size > 0) break;
        }
      } catch {}
    }
  }

  return { exact: masterExactMap, prefix: masterPrefixMap };
}

/**
 * Infer apparel/garment category from product title keywords
 * Prevents pseudo-categories like 'Physical Stock' or undefined categories from contaminating views.
 */
export function inferCategoryFromProductName(name: string): string {
  if (!name) return 'CLOTHING';
  const lower = name.toLowerCase();

  if (/\b(dress|maxi|midi)\b/.test(lower)) return 'CLOTHING/DRESS';
  if (/\b(top|blouse|shirt|tee|t-shirt|tank|camisole)\b/.test(lower)) return 'CLOTHING/TOP/BLOUSE';
  if (/\b(knit|sweater|cardigan)\b/.test(lower)) return 'CLOTHING/TOP/KNIT';
  if (/\b(outer|jacket|blazer|vest|coat)\b/.test(lower)) return 'CLOTHING/OUTER';
  if (/\b(pants|celana|trousers|cullote|kulot|jeans|denim)\b/.test(lower)) return 'CLOTHING/BOTTOM/PANTS';
  if (/\b(shorts)\b/.test(lower)) return 'CLOTHING/BOTTOM/SHORTS';
  if (/\b(skirt|rok)\b/.test(lower)) return 'CLOTHING/BOTTOM/SKIRT';
  if (/\b(set|oneset|suit)\b/.test(lower)) return 'CLOTHING/ONE SET';
  if (/\b(belt)\b/.test(lower)) return 'ACCESSORIES/BELT';
  if (/\b(bag)\b/.test(lower)) return 'ACCESSORIES/BAG';
  if (/\b(hijab|pashmina|scarf)\b/.test(lower)) return 'ACCESSORIES/SCARF';

  return 'CLOTHING';
}

/**
 * Look up official DealPOS category by matching product name against master products.
 * If sibling variants exist in master catalog (e.g. Timora Top Brown in S/M with CLOTHING/TOP/BLOUSE),
 * returns the authoritative master category.
 */
export function lookupCategoryByName(
  productName: string,
  catalogOrMap?: any[] | Map<string, any> | null
): string | null {
  if (!productName) return null;
  const cleanName = productName.trim().toLowerCase();
  if (!cleanName) return null;

  // 1. Check passed-in map or catalog
  if (catalogOrMap instanceof Map) {
    for (const item of catalogOrMap.values()) {
      if (!item) continue;
      const pName = String(item.p || item.n || item.nama_produk || item.nama || '').trim().toLowerCase();
      if (pName === cleanName || (cleanName.length > 5 && pName.startsWith(cleanName))) {
        const cat = String(item.kategori || item.category || item.c || '').trim();
        if (cat && cat !== '-' && cat.toUpperCase() !== 'PHYSICAL STOCK') return cat;
      }
    }
  } else if (Array.isArray(catalogOrMap)) {
    for (let i = 0; i < catalogOrMap.length; i++) {
      const item = catalogOrMap[i];
      if (!item) continue;
      const pName = String(item.p || item.n || item.nama_produk || item.nama || '').trim().toLowerCase();
      if (pName === cleanName || (cleanName.length > 5 && pName.startsWith(cleanName))) {
        const cat = String(item.kategori || item.category || item.c || '').trim();
        if (cat && cat !== '-' && cat.toUpperCase() !== 'PHYSICAL STOCK') return cat;
      }
    }
  }

  // 2. Check cached master lookup
  const { exact } = getMasterLookupMaps();
  for (const item of exact.values()) {
    if (!item) continue;
    const pName = String(item.name || '').trim().toLowerCase();
    if (pName === cleanName || (cleanName.length > 5 && pName.startsWith(cleanName))) {
      const cat = String(item.category || '').trim();
      if (cat && cat !== '-' && cat.toUpperCase() !== 'PHYSICAL STOCK') return cat;
    }
  }

  return null;
}

/**
 * Resolves the most accurate product name using Master Product as the single source of truth.
 * Rules:
 * 1. Master product name is authoritative.
 * 2. Look up SKU in catalogItem or master_produk cache before accepting any input name.
 * 3. Calculated or inputted names that differ from master product are anomalies and must not override master data.
 */
export function resolveProductName(
  sku?: string,
  recordName?: string,
  catalogItem?: { p?: string; nama_produk?: string; n?: string; [key: string]: any }
): string {
  const cleanSku = (sku || '').trim().toUpperCase();

  // 1. Direct catalogItem match if provided
  if (catalogItem) {
    const catName = cleanProductName(
      (catalogItem.p || catalogItem.nama_produk || catalogItem.n || (catalogItem as any).nama || '').trim()
    );
    if (
      catName &&
      catName.toUpperCase() !== cleanSku &&
      catName.toUpperCase().replace(/\s+/g, '') !== cleanSku.replace(/\s+/g, '')
    ) {
      return catName;
    }
  }

  // 2. Exact O(1) VLOOKUP in Master Product Map
  if (cleanSku) {
    const { exact, prefix } = getMasterLookupMaps();
    const found = exact.get(cleanSku);
    if (found && found.name) {
      const foundName = cleanProductName(found.name);
      if (foundName && foundName.toUpperCase() !== cleanSku) {
        return foundName;
      }
    }
    // DILARANG menebak nama dari prefix SKU saudara (sibling): beda warna/varian = beda nama
    // (mis. DF26KBF03DDC = "Taylor Pants Denim Blue", bukan nama varian lain).
    void prefix;
  }

  // 3. Fallback to record name only if SKU not found in master product
  const cleanRecordName = cleanProductName((recordName || '').trim());
  const isRecordNameValid =
    cleanRecordName &&
    cleanRecordName.toUpperCase() !== cleanSku &&
    cleanRecordName.toUpperCase().replace(/\s+/g, '') !== cleanSku.replace(/\s+/g, '');

  if (isRecordNameValid) return cleanRecordName;

  return cleanSku;
}

/**
 * Resolves the display size for an item using Master Product as the primary standard:
 * 1. Master product size from catalog (official size)
 * 2. Master product size from SKU lookup in master_produk cache
 * 3. Fallback to record size or SKU suffix only if item is not found in master product
 */
export function resolveProductDisplaySize(
  sku?: string,
  recordSize?: string,
  catalogSize?: string
): string | null {
  const cleanSku = (sku || '').trim().toUpperCase();

  // 1. VLOOKUP SKU -> master_produk. SKU ada di master => nilai master APA ADANYA
  //    (Default tetap Default, ALL tetap ALL). Tanpa regex / konversi / tebakan.
  if (cleanSku) {
    const { exact } = getMasterLookupMaps();
    const found = exact.get(cleanSku);
    if (found) {
      const mSize = String(found.size || '').trim();
      return mSize || null;
    }
  }

  // 2. Katalog (turunan master) hanya bila SKU belum ada di map master
  if (catalogSize && String(catalogSize).trim()) {
    return String(catalogSize).trim();
  }
  // 3. Fallback only if SKU NOT in master product: record size
  const rawSize = extractCleanSizeToken(recordSize || '');
  if (rawSize && rawSize !== '-' && rawSize.toUpperCase() !== 'DEFAULT' && isRealSize(rawSize) && !isCorruptedColorCodeSize(cleanSku, rawSize)) {
    return rawSize;
  }

  if (recordSize && (recordSize.toUpperCase() === 'DEFAULT' || recordSize.toUpperCase() === 'ALL SIZE')) {
    return 'Default';
  }

  return null;
}
