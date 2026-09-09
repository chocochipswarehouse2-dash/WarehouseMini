const fs = require('fs');
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

appContent = appContent.replace(
  /nama_produk: item.productName \|\| \(pData \? pData.p : line\),/g,
  `nama_produk: pData ? pData.p : (item.productName || line),`
);

appContent = appContent.replace(
  /nama_produk: sysRow\?\.nama_produk \|\| pData\?\.p \|\| sku,/g,
  `nama_produk: pData?.p || sysRow?.nama_produk || sku,`
);

fs.writeFileSync('src/App.tsx', appContent, 'utf8');
console.log('Fixed App.tsx inserts');
