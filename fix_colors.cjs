const fs = require('fs');
const path = require('path');

const DIRECTORIES = ['src/components', 'src/components/hr', 'src'];
const IGNORE_FILES = ['Toast.tsx', 'ErrorBoundary.tsx', 'LaporanQcView.tsx', 'KaryawanView.tsx'];

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (fullPath === 'src/components' || fullPath === 'src/components/hr') {
         processDirectory(fullPath);
      }
    } else if (fullPath.endsWith('.tsx') && !IGNORE_FILES.includes(file)) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // text-[#ff7a00] -> text-primary-500
      content = content.replace(/text-\[\#ff7a00\]/g, 'text-primary-500');
      
      // bg-[#ff7a00] -> bg-primary-500
      content = content.replace(/bg-\[\#ff7a00\]/g, 'bg-primary-500');
      
      // border-[#ff7a00] -> border-primary-500
      content = content.replace(/border-\[\#ff7a00\]/g, 'border-primary-500');
      
      // ring-[#ff7a00] -> ring-primary-500
      content = content.replace(/ring-\[\#ff7a00\]/g, 'ring-primary-500');
      
      // from-[#ff7a00] -> from-primary-500
      content = content.replace(/from-\[\#ff7a00\]/g, 'from-primary-500');
      
      // via-[#ff7a00] -> via-primary-500
      content = content.replace(/via-\[\#ff7a00\]/g, 'via-primary-500');
      
      // to-[#ff7a00] -> to-primary-500
      content = content.replace(/to-\[\#ff7a00\]/g, 'to-primary-500');
      
      // fill-[#ff7a00] -> fill-primary-500
      content = content.replace(/fill-\[\#ff7a00\]/g, 'fill-primary-500');
      
      // shadow-[#ff7a00] -> shadow-primary-500
      content = content.replace(/shadow-\[\#ff7a00\]/g, 'shadow-primary-500');

      // Now for the custom opacities like bg-[#ff7a00]/10 -> bg-primary-500/10
      // We can use a regex for this to catch anything like [type]-[\#ff7a00]/[opacity]
      const opacityRegex = /(text|bg|border|ring|shadow|from|to|via)-\[\#ff7a00\]\/([0-9]{1,3})/g;
      content = content.replace(opacityRegex, '$1-primary-500/$2');
      
      // And the hover states hover:bg-[#ff7a00] -> hover:bg-primary-500
      // the first replaces already caught most of these, but let's be sure. 
      // wait, hover:bg-[#ff7a00] is just hover:bg-primary-500 because the previous `bg-[#ff7a00]` -> `bg-primary-500` applies to it since it's a simple string replace.
      
      // Let's also check for hover:bg-[#e06c00] or hover:bg-[#e06b00] or hover:bg-[#e66e00] which is the hover orange.
      content = content.replace(/hover:bg-\[\#e06c00\]/g, 'hover:bg-primary-600');
      content = content.replace(/hover:bg-\[\#e06b00\]/g, 'hover:bg-primary-600');
      content = content.replace(/hover:bg-\[\#e66e00\]/g, 'hover:bg-primary-600');
      content = content.replace(/hover:text-\[\#ff7a00\]/g, 'hover:text-primary-500');
      
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }
}

const rootFiles = fs.readdirSync('src');
for (const file of rootFiles) {
  const fullPath = path.join('src', file);
  if (fullPath.endsWith('.tsx') && !IGNORE_FILES.includes(file)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    content = content.replace(/text-\[\#ff7a00\]/g, 'text-primary-500');
    content = content.replace(/bg-\[\#ff7a00\]/g, 'bg-primary-500');
    content = content.replace(/border-\[\#ff7a00\]/g, 'border-primary-500');
    content = content.replace(/ring-\[\#ff7a00\]/g, 'ring-primary-500');
    content = content.replace(/from-\[\#ff7a00\]/g, 'from-primary-500');
    content = content.replace(/via-\[\#ff7a00\]/g, 'via-primary-500');
    content = content.replace(/to-\[\#ff7a00\]/g, 'to-primary-500');
    content = content.replace(/fill-\[\#ff7a00\]/g, 'fill-primary-500');
    content = content.replace(/shadow-\[\#ff7a00\]/g, 'shadow-primary-500');
    
    const opacityRegex = /(text|bg|border|ring|shadow|from|to|via)-\[\#ff7a00\]\/([0-9]{1,3})/g;
    content = content.replace(opacityRegex, '$1-primary-500/$2');

    content = content.replace(/hover:bg-\[\#e06c00\]/g, 'hover:bg-primary-600');
    content = content.replace(/hover:bg-\[\#e06b00\]/g, 'hover:bg-primary-600');
    content = content.replace(/hover:bg-\[\#e66e00\]/g, 'hover:bg-primary-600');
    
    fs.writeFileSync(fullPath, content, 'utf8');
  }
}

processDirectory('src/components');
