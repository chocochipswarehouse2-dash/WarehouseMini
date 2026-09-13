const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Add import OperasiStokView
appContent = appContent.replace(
  "import { Sidebar } from './components/Sidebar';",
  "import { Sidebar } from './components/Sidebar';\nimport { OperasiStokView } from './components/OperasiStokView';"
);

// 2. Remove standalone 'scanner', 'stock_opname', and 'mutasi_log' from render. 
// We will replace 'scanner' block with 'operasi_stok' block, and delete 'stock_opname' & 'mutasi_log'.

// First, we extract the scanner block
const scannerRegex = /\{activePage === 'scanner' && \([\s\S]*?\}\s*\)/;
const scannerMatch = appContent.match(scannerRegex);
if (!scannerMatch) {
  console.log('Scanner block not found');
  process.exit(1);
}

const scannerContent = scannerMatch[0].replace("{activePage === 'scanner' && (", "").slice(0, -1).trim();

// Next, extract stock opname block
const soRegex = /\{activePage === 'stock_opname' && \([\s\S]*?\}\s*\)/;
const soMatch = appContent.match(soRegex);
const soContent = soMatch ? soMatch[0].replace("{activePage === 'stock_opname' && (", "").slice(0, -1).trim() : '';

// Extract mutasi log block
const mutasiRegex = /\{activePage === 'mutasi_log' && \([\s\S]*?\}\s*\)/;
const mutasiMatch = appContent.match(mutasiRegex);
const mutasiContent = mutasiMatch ? mutasiMatch[0].replace("{activePage === 'mutasi_log' && (", "").slice(0, -1).trim() : '';

// Now replace scanner block with operasi_stok block
const newOperasiStokBlock = `{activePage === 'operasi_stok' && (
  <OperasiStokView
    scannerComponent={
      ${scannerContent}
    }
    mutasiLogComponent={
      ${mutasiContent}
    }
    stockOpnameComponent={
      ${soContent}
    }
  />
)}`;

appContent = appContent.replace(scannerMatch[0], newOperasiStokBlock);
appContent = appContent.replace(soMatch[0], '');
appContent = appContent.replace(mutasiMatch[0], '');

fs.writeFileSync('src/App.tsx', appContent);
console.log('Successfully patched App.tsx');

