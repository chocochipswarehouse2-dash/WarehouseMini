const fs = require('fs');

const fixOperasiStok = 'src/components/OperasiStokView.tsx';
let o = fs.readFileSync(fixOperasiStok, 'utf8');
o = o.replace(/tab_ops_stok_scanner/g, "tab_ops_mutasi_scanner");
o = o.replace(/tab_ops_stok_mutasi_log/g, "tab_ops_mutasi_log");
o = o.replace(/tab_ops_stok_stock_opname/g, "tab_ops_mutasi_so");
fs.writeFileSync(fixOperasiStok, o);
