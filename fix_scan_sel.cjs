const fs = require('fs');

let content = fs.readFileSync('src/components/ScanMethodSelector.tsx', 'utf8');

content = content.replace(
  '<span>Ketik / Scanner</span>',
  '<span className="whitespace-nowrap">Ketik / Scan</span>'
);

content = content.replace(
  '<span>Kamera HP</span>',
  '<span className="whitespace-nowrap">Kamera HP</span>'
);

fs.writeFileSync('src/components/ScanMethodSelector.tsx', content, 'utf8');
console.log('Fixed ScanMethodSelector text');
