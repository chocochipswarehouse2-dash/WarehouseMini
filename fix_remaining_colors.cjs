const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/text-\[\#ff7a00\]/g, 'text-primary-500');
  content = content.replace(/bg-\[\#ff7a00\]/g, 'bg-primary-500');
  content = content.replace(/border-\[\#ff7a00\]/g, 'border-primary-500');
  content = content.replace(/ring-\[\#ff7a00\]/g, 'ring-primary-500');
  content = content.replace(/shadow-\[\#ff7a00\]/g, 'shadow-primary-500');
  const opacityRegex = /(text|bg|border|ring|shadow|from|to|via)-\[\#ff7a00\]\/([0-9]{1,3})/g;
  content = content.replace(opacityRegex, '$1-primary-500/$2');
  
  content = content.replace(/hover:bg-\[\#e06c00\]/g, 'hover:bg-primary-600');
  content = content.replace(/hover:bg-\[\#e06b00\]/g, 'hover:bg-primary-600');
  
  content = content.replace(/#ff7a00/g, 'var(--theme-500)');

  fs.writeFileSync(file, content, 'utf8');
}

fixFile('src/components/hr/KaryawanView.tsx');
fixFile('src/components/Sidebar.tsx');
fixFile('src/components/Navbar.tsx');
fixFile('src/components/FulfillmentRefillModal.tsx');
fixFile('src/components/ErrorBoundary.tsx');
fixFile('src/components/PickingTasksView.tsx');
fixFile('src/App.tsx');

let indexCss = fs.readFileSync('src/index.css', 'utf8');
indexCss = indexCss.replace(/#ff7a00/g, 'var(--theme-500)');
fs.writeFileSync('src/index.css', indexCss, 'utf8');

