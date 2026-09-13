const fs = require('fs');
let code = fs.readFileSync('src/components/PesananSaya/PesananSayaView.tsx', 'utf-8');

code = code.replace(
  "{ id: 'distribusi', label: 'Distribusi Store', icon: Store },",
  "{ id: 'distribusi', label: 'Transfer Order', icon: Store },"
);

code = code.replace(
  '<span className="text-slate-600 dark:text-slate-300">Distribusi Store</span>',
  '<span className="text-slate-600 dark:text-slate-300">Transfer Order</span>'
);

code = code.replace(
  'Dashboard utama ini nantinya akan menampilkan progress gabungan dari Manual Shipment dan Distribusi Store secara real-time.',
  'Dashboard utama ini nantinya akan menampilkan progress gabungan dari Manual Shipment dan Transfer Order secara real-time.'
);

fs.writeFileSync('src/components/PesananSaya/PesananSayaView.tsx', code);
console.log('Fixed Distribusi Store -> Transfer Order');
