export function getSizeWeight(size: string): number {
  const s = (size || '').toUpperCase().trim();
  if (s === 'XS') return 1;
  if (s === 'S') return 2;
  if (s === 'M') return 3;
  if (s === 'L') return 4;
  if (s === 'XL') return 5;
  if (s === 'XXL' || s === '2XL') return 6;
  if (s === 'XXXL' || s === '3XL') return 7;
  if (s === 'ALL') return 98;
  if (s === 'DEFAULT' || s === '-' || s === '') return 99;
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

/**
 * Partial multi-keyword search (identical to Inventory search):
 * Splits query by whitespace, checks if every keyword exists within any of the provided target fields.
 */
export function partialSearchMatch(
  query: string,
  ...targets: (string | number | boolean | null | undefined)[]
): boolean {
  if (!query || !query.trim()) return true;
  const keywords = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return true;

  const combinedText = targets
    .map((t) => (t !== null && t !== undefined ? String(t) : ''))
    .join(' ')
    .toLowerCase();

  return keywords.every((kw) => combinedText.includes(kw));
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
 * Extract size from SKU if size is not explicitly provided.
 * Recognizes common apparel sizing patterns:
 * - Separated by - / _ / space: e.g. "SKU-M", "SKU_XL", "SKU S"
 * - Trailing standard sizes: e.g. "XXXL", "3XL", "XXL", "2XL", "XL", "XS", "ALL", "FS"
 * - Single letter trailing codes: e.g. "F26FBH363BNM" -> "M", "F24CBI160WHS" -> "S", "F24CBI160CHS" -> "S"
 */
export function extractSizeFromSku(sku: string): string {
  const clean = (sku || '').trim().toUpperCase();
  if (!clean || clean.length < 3) return '-';

  // 1. Explicit separator: -S, _M, /L, .XL, -ALL, -FS
  const sepMatch = clean.match(/[-_/\s.](XXXL|3XL|XXL|2XL|XL|XS|[SML]|ALL|FS)$/i);
  if (sepMatch) return sepMatch[1].toUpperCase();

  // 2. Trailing multi-character standard sizes
  const multiMatch = clean.match(/(XXXL|3XL|XXL|2XL|XL|XS|ALL|FS)$/i);
  if (multiMatch) return multiMatch[1].toUpperCase();

  // 3. Trailing single letter size (S, M, L) preceded by letter/digit (e.g. BNM -> M, WHS -> S, CHS -> S)
  if (clean.length >= 4) {
    const singleMatch = clean.match(/[A-Z0-9]([SML])$/i);
    if (singleMatch) return singleMatch[1].toUpperCase();
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
  const separatorRegex = /\s*[-–—|]\s*/;
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
  return trimmed;
}

/**
 * Resolves the most accurate product name by checking the catalog and existing record name,
 * ensuring placeholder names (which are identical to SKU) never overwrite a real product name.
 */
export function resolveProductName(
  sku?: string,
  recordName?: string,
  catalogItem?: { p?: string; nama_produk?: string; n?: string; [key: string]: any }
): string {
  const cleanSku = (sku || '').trim().toUpperCase();
  const cleanRecordName = cleanProductName((recordName || '').trim());
  const isRecordNameValid =
    cleanRecordName &&
    cleanRecordName.toUpperCase() !== cleanSku &&
    cleanRecordName.toUpperCase().replace(/\s+/g, '') !== cleanSku.replace(/\s+/g, '');

  const catName = cleanProductName(
    (catalogItem?.p || catalogItem?.nama_produk || catalogItem?.n || (catalogItem as any)?.nama || '').trim()
  );
  const isCatNameValid =
    catName &&
    catName.toUpperCase() !== cleanSku &&
    catName.toUpperCase().replace(/\s+/g, '') !== cleanSku.replace(/\s+/g, '');

  // 1. Prioritize catalog name if valid and not equal to SKU
  if (isCatNameValid) return catName;
  // 2. Prioritize record name if valid and not equal to SKU
  if (isRecordNameValid) return cleanRecordName;

  // 3. Fallback to localStorage product cache if available in browser
  if (cleanSku && typeof window !== 'undefined' && window.localStorage) {
    try {
      const cacheRaw = localStorage.getItem('wms_product_cache');
      if (cacheRaw) {
        const cacheList = JSON.parse(cacheRaw);
        if (Array.isArray(cacheList)) {
          const found = cacheList.find(
            (p: any) =>
              (p.k && p.k.trim().toUpperCase() === cleanSku) ||
              (p.sku && String(p.sku).trim().toUpperCase() === cleanSku)
          );
          const foundName = cleanProductName(
            (found?.p || found?.nama_produk || found?.n || (found as any)?.nama || '').trim()
          );
          if (foundName && foundName.toUpperCase() !== cleanSku) {
            return foundName;
          }
        }
      }
    } catch {}
  }

  return cleanRecordName || cleanSku;
}

/**
 * Resolves the display size for an item:
 * 1. SKU suffix (authoritative in WMS)
 * 2. Explicit size from record (if not '-' or 'Default')
 * 3. Size from catalog
 * 4. 'All Size' if explicitly marked as 'Default' or no size variant
 */
export function resolveProductDisplaySize(
  sku?: string,
  recordSize?: string,
  catalogSize?: string
): string | null {
  const cleanSku = (sku || '').trim().toUpperCase();
  const fromSku = extractSizeFromSku(cleanSku);
  if (fromSku && fromSku !== '-' && fromSku !== 'DEFAULT') {
    return fromSku;
  }

  const rawSize = extractCleanSizeToken(recordSize || '');
  if (rawSize && rawSize !== '-' && rawSize.toUpperCase() !== 'DEFAULT') {
    return rawSize;
  }

  const cleanCatSize = extractCleanSizeToken(catalogSize || '');
  if (cleanCatSize && cleanCatSize !== '-' && cleanCatSize.toUpperCase() !== 'DEFAULT') {
    return cleanCatSize;
  }

  if (recordSize && recordSize.toUpperCase() === 'DEFAULT') {
    return 'All Size';
  }

  return null;
}
