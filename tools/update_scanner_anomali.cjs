const fs = require('fs');

// 1. Update QuickTagToolbar.tsx - Remove ANOMALI button
let qtPath = 'src/components/QuickTagToolbar.tsx';
let qt = fs.readFileSync(qtPath, 'utf8');
qt = qt.replace(/\r?\n\s*<button[\s\S]*?onClick=\{\(\) => onSelectCategory\('ANOMALI'\)\}[\s\S]*?<\/button>/, '');
fs.writeFileSync(qtPath, qt, 'utf8');
console.log('QuickTagToolbar.tsx updated. Has ANOMALI button:', qt.includes("onSelectCategory('ANOMALI')"));

// 2. Update ScannedItemsList.tsx - Change category cycle and remove ANOMALI button option
let siPath = 'src/components/ScannedItemsList.tsx';
let si = fs.readFileSync(siPath, 'utf8');
si = si.replace(
  "const nextCat: CategoryType = cat === 'ANOMALI' ? 'IN' : cat === 'IN' ? 'OUT' : cat === 'OUT' ? 'SO' : 'ANOMALI';",
  "const nextCat: CategoryType = cat === 'IN' ? 'OUT' : cat === 'OUT' ? 'SO' : 'IN';"
);
si = si.replace('title="Klik untuk ubah mode (#IN / #OUT / #SO / #ANOMALI)"', 'title="Klik untuk ubah mode (#IN / #OUT / #SO)"');
fs.writeFileSync(siPath, si, 'utf8');
console.log('ScannedItemsList.tsx updated.');

