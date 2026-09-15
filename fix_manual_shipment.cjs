const fs = require('fs');
const filePath = 'src/components/PesananSaya/ManualShipmentTab.tsx';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/dari sheet outlet kolom C/ig, 'dari Database');
code = code.replace(/Simpan ke Sheet/ig, 'Simpan ke Database');

fs.writeFileSync(filePath, code);
