const fs = require('fs');
const path = './src/components/SettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// replace props
content = content.replace(/  darkMode: boolean;\n  onToggleDarkMode: \(\) => void;\n  themeColor: string;\n  setThemeColor: \(color: string\) => void;\n/g, '');
content = content.replace(/  darkMode,\n  onToggleDarkMode,\n  themeColor,\n  setThemeColor,\n/g, '');

fs.writeFileSync(path, content, 'utf8');
