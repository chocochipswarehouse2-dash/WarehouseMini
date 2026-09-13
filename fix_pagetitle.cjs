const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  "operasi_stok: 'Scanner & Ops Stok',",
  "operasi_stok: 'Scanner | Mutasi | SO',"
);

fs.writeFileSync('src/App.tsx', code);
