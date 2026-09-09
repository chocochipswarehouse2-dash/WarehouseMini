const fs = require('fs');
const path = './src/components/SettingsModal.tsx';
let content = fs.readFileSync(path, 'utf8');

// We need to remove the Theme and Dark Mode block from SettingsModal.
const startStr = '{/* Dark mode */}';
const endStr = '{/* Audio & Vibration Test */}';
if (content.includes(startStr) && content.includes(endStr)) {
  const before = content.substring(0, content.indexOf(startStr));
  const after = content.substring(content.indexOf(endStr));
  content = before + after;
}

// Remove the themeColor Picker from SettingsModal which we added earlier.
const pickerStr = '{/* Theme Color Picker */}';
const pickerEndStr = '{/* ========================================================================= */}';
if (content.includes(pickerStr)) {
  const before = content.substring(0, content.indexOf(pickerStr));
  const after = content.substring(content.indexOf(pickerEndStr, content.indexOf(pickerStr)));
  content = before + after;
}

fs.writeFileSync(path, content, 'utf8');
