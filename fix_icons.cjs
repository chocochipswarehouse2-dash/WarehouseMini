const fs = require('fs');

function replaceIcon(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // ensure Palette is imported
  if (!content.includes('Palette')) {
    content = content.replace(/Sun,\n/, 'Sun,\n  Palette,\n');
    content = content.replace(/Sun, /, 'Sun, Palette, ');
  }
  
  // Replace <Sun ... /> with <Palette ... />
  // We need to be careful. Let's just do a regex
  content = content.replace(/<Sun className="w-4 h-4 text-amber-400 fill-amber-400" \/>/g, '<Palette className="w-4 h-4 text-primary-500" />');
  content = content.replace(/<Sun className="w-4 h-4 text-amber-400" \/>/g, '<Palette className="w-4 h-4 text-primary-500" />');
  
  // For LoginModal it has: {darkMode ? <Sun ... /> : <Moon ... />}
  // We can just replace the whole ternary
  content = content.replace(/{darkMode \? <Sun className="w-4 h-4 text-amber-400" \/> : <Moon className="w-4 h-4 text-slate-600" \/>}/g, '<Palette className="w-4 h-4 text-primary-500" />');
  
  // In LoginModal, there might be a prop darkMode: boolean that is no longer used.
  if (filePath.includes('LoginModal.tsx')) {
    content = content.replace(/darkMode: boolean;\n/g, '');
    content = content.replace(/darkMode,\n/g, '');
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
}

replaceIcon('./src/components/Sidebar.tsx');
replaceIcon('./src/components/Navbar.tsx');
replaceIcon('./src/components/LoginModal.tsx');
