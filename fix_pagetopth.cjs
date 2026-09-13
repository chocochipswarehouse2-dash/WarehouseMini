const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  "dashboard: 'dashboard',",
  "dashboard: 'dashboard',\n  operasi_stok: 'operasi-stok',"
);
code = code.replace(
  "const PATH_TO_PAGE: Record<string, ActivePage> = {",
  "const PATH_TO_PAGE: Record<string, ActivePage> = {\n  'operasi-stok': 'operasi_stok',"
);

fs.writeFileSync('src/App.tsx', code);
console.log('Fixed page to path');
