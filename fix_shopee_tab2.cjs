const fs = require('fs');
let shopeeContent = fs.readFileSync('src/components/PesananSaya/ShopeeTab.tsx', 'utf8');

shopeeContent = shopeeContent.replace(/p\.sku\.toUpperCase\(\)/g, "String(p.sku).toUpperCase()");

fs.writeFileSync('src/components/PesananSaya/ShopeeTab.tsx', shopeeContent, 'utf8');
