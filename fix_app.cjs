const fs = require('fs');
const path = './src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/<Navbar\n/g, '<Navbar\n          onOpenThemePicker={() => setIsThemePickerOpen(true)}\n');
content = content.replace(/<Sidebar\n/g, '<Sidebar\n        onOpenThemePicker={() => setIsThemePickerOpen(true)}\n');
content = content.replace(/<LoginModal\n/g, '<LoginModal\n        onOpenThemePicker={() => setIsThemePickerOpen(true)}\n');

fs.writeFileSync(path, content, 'utf8');
