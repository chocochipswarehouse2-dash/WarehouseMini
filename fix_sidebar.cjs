const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

code = code.replace(
  "label: 'Scanner & Ops Stok',",
  "label: 'Scanner | Mutasi',"
);

code = code.replace(
  "shortLabel: 'Ops Stok',",
  "shortLabel: 'Scan | Mutasi',"
);

fs.writeFileSync('src/components/Sidebar.tsx', code);
console.log('Fixed sidebar');
