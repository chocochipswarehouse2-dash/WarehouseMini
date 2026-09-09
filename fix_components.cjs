const fs = require('fs');

function updateComponent(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/onToggleDarkMode: \(\) => void;/g, 'onOpenThemePicker: () => void;');
  content = content.replace(/onToggleDarkMode,/g, 'onOpenThemePicker,');
  content = content.replace(/onClick={onToggleDarkMode}/g, 'onClick={onOpenThemePicker}');
  
  if (filePath.includes('LoginModal')) {
     // replace moon and sun logic with just a Sparkles icon maybe? Or keep Sun/Moon and just call onOpenThemePicker.
     // I will just replace the icon to Sparkles to indicate theme
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
}

updateComponent('./src/components/Sidebar.tsx');
updateComponent('./src/components/Navbar.tsx');
updateComponent('./src/components/LoginModal.tsx');
