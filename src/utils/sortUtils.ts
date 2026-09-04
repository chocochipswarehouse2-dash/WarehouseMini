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