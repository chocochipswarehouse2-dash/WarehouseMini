function _partialSearchMatch(query, ...targets) {
  if (!query || !query.trim()) return true;
  const keywords = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return true;
  const combinedText = targets
    .map((t) => (t !== null && t !== undefined ? String(t) : ''))
    .join(' ')
    .toLowerCase();
  return keywords.every((kw) => combinedText.includes(kw));
}
console.log(_partialSearchMatch("F26EBH358BRL", "F26EBH358BRL", "Izbel Skirt", "L", ""));
