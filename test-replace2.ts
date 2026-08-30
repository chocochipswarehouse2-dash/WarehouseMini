import * as fs from 'fs';
const content = fs.readFileSync('src/components/PhysicalScanInput.tsx', 'utf-8');
const newContent = content.replace(
  /'Scanner Aktif — Siap tembak barcode'/g,
  "'Scanner Aktif — Siap ketik / scan barcode'"
).replace(
  /'Klik kolom input untuk menghubungkan gun scanner'/g,
  "'Klik kolom input untuk mengetik atau scan'"
);
fs.writeFileSync('src/components/PhysicalScanInput.tsx', newContent);
