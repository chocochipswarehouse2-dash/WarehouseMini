const fs = require('fs');
let content = fs.readFileSync('src/components/PhysicalScanInput.tsx', 'utf8');

content = content.replace(
  'placeholder={placeholder || "Tembak Barcode / Tulis SKU..."}',
  'placeholder={placeholder || "Scan Barcode / Ketik..."}'
);

fs.writeFileSync('src/components/PhysicalScanInput.tsx', content, 'utf8');
