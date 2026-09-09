function cleanName(name) {
  if (!name) return name;
  const parts = name.split(' - ');
  if (parts.length > 1) {
    const first = parts[0].trim().toLowerCase();
    const second = parts[1].trim().toLowerCase();
    if (first === second || second.startsWith(first)) {
      return parts[0].trim();
    }
  }
  return name.trim();
}

console.log(cleanName("Narcissa Top Brown (S) - NARCISSA TOP BROWN (S) - NARCISSA TOP BROWN (S)"));
console.log(cleanName("Genevive Shorts Black (M) - GENEVIVE SHORTS BLACK (M)"));
console.log(cleanName("DS100 - Taylor Top White"));
console.log(cleanName("Imogene Jacket Khaki"));
