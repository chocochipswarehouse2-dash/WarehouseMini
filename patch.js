const fs = require('fs');
let code = fs.readFileSync('src/components/LiveInventoryDrawer.tsx', 'utf8');
code = code.replace(/setLogs\(unique\);/g, 'setLogs(unique); window.lastError = "OK_LOGS_" + unique.length;');
code = code.replace(/console\.warn\('Error loading live data:', e\);/g, 'console.warn("Error loading live data:", e); window.lastError = e.message || e.toString();');
fs.writeFileSync('src/components/LiveInventoryDrawer.tsx', code);
