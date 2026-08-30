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

/**
 * Fuzzy search that splits a search query by spaces and checks if ALL terms exist
 * within the target string.
 */
export function fuzzySearch(query: string, target: string): boolean {
  if (!query.trim()) return true;
  const terms = query.toLowerCase().trim().split(/\s+/);
  const targetLower = (target || '').toLowerCase();
  return terms.every(term => targetLower.includes(term));
}

/**
 * Fuzzy search that splits a search query by spaces and checks if ALL terms exist
 * within ANY of the target strings.
 */
export function fuzzySearchMultiple(query: string, targets: (string | undefined)[]): boolean {
  if (!query.trim()) return true;
  const terms = query.toLowerCase().trim().split(/\s+/);
  const targetsLower = targets.map(t => (t || '').toLowerCase());
  
  return terms.every(term => {
    return targetsLower.some(target => target.includes(term));
  });
}
