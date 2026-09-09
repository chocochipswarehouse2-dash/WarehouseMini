const fs = require('fs');

let content = fs.readFileSync('src/services/supabase.ts', 'utf8');

const regex = /const nama = String\(\s*row\.nama_produk \|\|[\s\S]*?sku\s*\)\.trim\(\);/;

const replacement = `let rawNama = String(
    row.nama_produk ||
    row.nama_barang ||
    row.nama ||
    row.product_name ||
    row.name ||
    row.title ||
    row.deskripsi ||
    sku
  ).trim();

  // Clean repeated/duplicated names (e.g. "Narcissa Top (S) - NARCISSA TOP (S) - NARCISSA...")
  const parts = rawNama.split(' - ');
  if (parts.length > 1) {
    const first = parts[0].trim().toLowerCase();
    const second = parts[1].trim().toLowerCase();
    // If the second part is identical to the first, or the second part is just a truncated version of the first
    if (first === second || second.startsWith(first) || first.startsWith(second)) {
      rawNama = parts[0].trim();
    }
  }
  const nama = rawNama;`;

if (content.match(regex)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync('src/services/supabase.ts', content, 'utf8');
  console.log('Fixed extractProductFromRow');
} else {
  console.log('Could not find regex in supabase.ts');
}
