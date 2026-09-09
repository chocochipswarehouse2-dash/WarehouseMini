const fs = require('fs');

let soContent = fs.readFileSync('src/components/StockOpnameView.tsx', 'utf8');

// Replace the export logic
// find: `"${(it.nama_produk || '').replace(/"/g, '""')}"`,
// replace with: const pData = productCatalog?.find(p => p.k.toUpperCase() === it.sku.toUpperCase());
//               `"${((pData ? pData.p : it.nama_produk) || '').replace(/"/g, '""')}"`,

soContent = soContent.replace(
  /\`"\$\{\(it\.nama_produk \|\| ''\)\.replace\(\/"\/g, '""'\)\}"\`,/,
  `\`"\$\{((productCatalog?.find(p => p.k.toUpperCase() === it.sku.toUpperCase())?.p || it.nama_produk) || '').replace(/"/g, '""')}"\`,`
);

// Replace the display logic
// find: {item.nama_produk || '-'}
// replace with: {productCatalog?.find(p => p.k.toUpperCase() === item.sku.toUpperCase())?.p || item.nama_produk || '-'}

soContent = soContent.replace(
  /\{item\.nama_produk \|\| '-'\}/g,
  `{productCatalog?.find(p => p.k.toUpperCase() === item.sku.toUpperCase())?.p || item.nama_produk || '-'}`
);

fs.writeFileSync('src/components/StockOpnameView.tsx', soContent, 'utf8');
console.log('Fixed SO View');
