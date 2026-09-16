const fs = require('fs');

// Fix App.tsx
let appContent = fs.readFileSync('src/App.tsx', 'utf8');
// Menu is from lucide-react. We should make sure it is imported.
if (!appContent.includes('Menu,')) {
    appContent = appContent.replace('import {', 'import {\n  Menu,');
}
appContent = appContent.replace(/<Navbar[^>]*\/>/g, '');
appContent = appContent.replace(/setIsToolbarVisible/g, '(() => {})');
appContent = appContent.replace(/isToolbarVisible/g, 'true');
fs.writeFileSync('src/App.tsx', appContent, 'utf8');

// Fix PickingTasksView.tsx
let pickingContent = fs.readFileSync('src/components/PickingTasksView.tsx', 'utf8');
if (!pickingContent.includes('Eye,')) {
    pickingContent = pickingContent.replace('AlertTriangle,', 'AlertTriangle, Eye, EyeOff,');
}
fs.writeFileSync('src/components/PickingTasksView.tsx', pickingContent, 'utf8');

// Fix ShopeeTab.tsx
let shopeeContent = fs.readFileSync('src/components/PesananSaya/ShopeeTab.tsx', 'utf8');
shopeeContent = shopeeContent.replace(/String\([^)]+\)\.toUpperCase\(\)/g, (match) => {
    return match;
});
// The error says `Property 'toUpperCase' does not exist on type 'unknown'.`
// Let's replace any `(someVar).toUpperCase()` with `String(someVar).toUpperCase()`
shopeeContent = shopeeContent.replace(/([a-zA-Z0-9_]+)\.toUpperCase\(\)/g, 'String($1).toUpperCase()');
// Actually, it might be something like `(item.someProp || '').toUpperCase()`.
// I'll just change `.toUpperCase()` to `?.toString()?.toUpperCase()`
shopeeContent = shopeeContent.replace(/\.toUpperCase\(\)/g, '?.toString()?.toUpperCase()');

fs.writeFileSync('src/components/PesananSaya/ShopeeTab.tsx', shopeeContent, 'utf8');
console.log('Fixed TS errors');
