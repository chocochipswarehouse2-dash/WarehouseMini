const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

code = code.replace(
  "label: 'Scanner | Mutasi',",
  "label: 'Scanner | Mutasi | SO',"
);

code = code.replace(
  "shortLabel: 'Scan | Mutasi',",
  "shortLabel: 'Scan | Mutasi'," // Keep it short enough for collapsed mode
);

fs.writeFileSync('src/components/Sidebar.tsx', code);
console.log('Fixed sidebar label');
