const fs = require('fs');

// Fix App.tsx
let appContent = fs.readFileSync('src/App.tsx', 'utf8');
appContent = appContent.replace(/<Navbar[\s\S]*?\/>/g, '');
appContent = appContent.replace(/setIsToolbarVisible\(\(\) => \{\}\)/g, '(() => {})(true)');
// Actually let's just make setIsToolbarVisible take an argument to avoid TS2554
appContent = appContent.replace(/\(\(\) => \{\}\)/g, '((_val: boolean) => {})');

fs.writeFileSync('src/App.tsx', appContent, 'utf8');

// Fix ShopeeTab.tsx
let shopeeContent = fs.readFileSync('src/components/PesananSaya/ShopeeTab.tsx', 'utf8');
// ShopeeTab.tsx(143,30): error TS2349: This expression is not callable.  Type '{}' has no call signatures.
// ShopeeTab.tsx(143,37): error TS2304: Cannot find name 'sku'.
fs.writeFileSync('src/components/PesananSaya/ShopeeTab.tsx.bak', shopeeContent, 'utf8');
