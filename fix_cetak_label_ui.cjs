const fs = require('fs');
const filePath = 'src/components/CetakLabelView.tsx';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/Simpan ke Sheet Data Alamat/g, 'Simpan ke Database');
code = code.replace(/Simpan ke Sheet/g, 'Simpan ke Database');
code = code.replace(/PILIHAN JASA KIRIM \(SHEET OUTLET KOLOM C\)/g, 'PILIHAN JASA KIRIM');
code = code.replace(/Alamat berhasil disimpan ke Sheet/g, 'Alamat berhasil disimpan ke Database');

fs.writeFileSync(filePath, code);
