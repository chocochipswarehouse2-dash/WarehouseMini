const fs = require('fs');
const path = require('path');

const DIRECTORIES = ['src/components', 'src/components/hr', 'src'];

const IGNORE_FILES = [
  'Toast.tsx',
  'ErrorBoundary.tsx',
  'LaporanQcView.tsx', // Contains reject stats
  'KaryawanView.tsx', // Contains explicit delete modal
];

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
      
      // Replace tailwind rose classes with primary classes
      const regex = /(bg|text|border|shadow|ring|from|to|via)-rose-([0-9]{2,3})/g;
      const newContent = content.replace(regex, '$1-primary-$2');
      
      // Also hover, focus, dark states
      const regexState = /(hover|focus|dark|active):([a-z]+)-rose-([0-9]{2,3})/g;
      const newContent2 = newContent.replace(regexState, '$1:$2-primary-$3');
      
      if (content !== newContent2) {
        fs.writeFileSync(fullPath, newContent2, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

// Start from root TSX files and directories
const rootFiles = fs.readdirSync('src');
for (const file of rootFiles) {
  const fullPath = path.join('src', file);
  if (fullPath.endsWith('.tsx') && !IGNORE_FILES.includes(file)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    const regex = /(bg|text|border|shadow|ring|from|to|via)-rose-([0-9]{2,3})/g;
    const newContent = content.replace(regex, '$1-primary-$2');
    const regexState = /(hover|focus|dark|active):([a-z]+)-rose-([0-9]{2,3})/g;
    const newContent2 = newContent.replace(regexState, '$1:$2-primary-$3');
    if (content !== newContent2) {
      fs.writeFileSync(fullPath, newContent2, 'utf8');
      console.log(`Updated ${fullPath}`);
    }
  }
}

processDirectory('src/components');
