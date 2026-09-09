const fs = require('fs');

let mutasi = fs.readFileSync('src/components/MutasiLogView.tsx', 'utf8');

// For mobile layout:
// {item.nama_produk || '-'}
// to
// {productCatalog?.find(p => p.k.toUpperCase() === item.sku.toUpperCase())?.p || item.nama_produk || '-'}

mutasi = mutasi.replace(
  /\{item\.nama_produk \|\| '-'\}/g,
  `{productCatalog?.find(p => p.k.toUpperCase() === item.sku.toUpperCase())?.p || item.nama_produk || '-'}`
);

fs.writeFileSync('src/components/MutasiLogView.tsx', mutasi, 'utf8');
console.log('Fixed MutasiLogView');
