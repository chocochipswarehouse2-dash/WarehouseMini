const fs = require('fs');

const filesToFix = [
  'src/components/PeminjamanView.tsx',
  'src/components/PickingTasksView.tsx',
  'src/services/supabase.ts'
];

for (const file of filesToFix) {
  let content = fs.readFileSync(file, 'utf8');
  
  if (file === 'src/components/PeminjamanView.tsx') {
    content = content.replace(/const formattedNama = formatProductNameWithSize\(it.produk, cleanSize\);/g, 'const formattedNama = it.produk;');
  }
  
  if (file === 'src/components/PickingTasksView.tsx') {
    content = content.replace(/const effectiveName = formatProductNameWithSize\(item\.nama_produk, effectiveSize\);/g, 'const effectiveName = item.nama_produk;');
    content = content.replace(/const effectiveName = formatProductNameWithSize\(it\.nama_produk \|\| cleanSku, effectiveSize\);/g, 'const effectiveName = it.nama_produk || cleanSku;');
    content = content.replace(/const formattedNama = formatProductNameWithSize\(cleanNama, cleanSize\);/g, 'const formattedNama = cleanNama;');
    content = content.replace(/const effectiveName = formatProductNameWithSize\(r\.nama_produk \|\| cleanSku, effectiveSize\);/g, 'const effectiveName = r.nama_produk || cleanSku;');
    content = content.replace(/const displayName = formatProductNameWithSize\(item\.nama_produk \|\| itemSku, displaySize\);/g, 'const displayName = item.nama_produk || itemSku;');
  }
  
  if (file === 'src/services/supabase.ts') {
    content = content.replace(/const formattedNama = formatProductNameWithSize\(rawNama, cleanSize\);/g, 'const formattedNama = rawNama;');
    content = content.replace(/nama_produk = formatProductNameWithSize\(nama_produk, rawSize\);/g, '// nama_produk = nama_produk;');
    content = content.replace(/pNama = formatProductNameWithSize\(pNama, pSize\);/g, '// pNama = pNama;');
    content = content.replace(/nama = formatProductNameWithSize\(nama, cleanSize\);/g, '// nama = nama;');
  }
  
  fs.writeFileSync(file, content, 'utf8');
}

console.log('Fixed formatProductNameWithSize usages');
