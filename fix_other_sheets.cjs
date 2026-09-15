const fs = require('fs');

let cetakLabel = fs.readFileSync('src/components/CetakLabelView.tsx', 'utf8');
cetakLabel = cetakLabel.replace(/sheet Data Alamat/ig, 'Database Data Alamat');
fs.writeFileSync('src/components/CetakLabelView.tsx', cetakLabel);

let distri = fs.readFileSync('src/components/PesananSaya/DistribusiStoreTab.tsx', 'utf8');
distri = distri.replace(/SUBMIT PENGECEKAN KE DATABASE \/ GOOGLE SHEET/ig, 'SUBMIT PENGECEKAN KE DATABASE');
distri = distri.replace(/ke sheet dengan No SJ/ig, 'ke Database dengan No SJ');
distri = distri.replace(/ke database sheet/ig, 'ke Database');
fs.writeFileSync('src/components/PesananSaya/DistribusiStoreTab.tsx', distri);

