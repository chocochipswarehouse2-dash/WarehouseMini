const fs = require('fs');

// Fix ScannedItemsList.tsx
let scannedContent = fs.readFileSync('src/components/ScannedItemsList.tsx', 'utf8');

const targetFunction = `export const ScannedItemsList: React.FC<ScannedItemsListProps> = ({
  items,
  onRemoveItem,
  onClearAll,
}) => {`;

const targetReplacement = `export const ScannedItemsList: React.FC<ScannedItemsListProps> = ({
  items,
  onRemoveItem,
  onClearAll,
}) => {
  const totalScannedQty = items.reduce((sum, item) => sum + (item.qty || 1), 0);`;

if (scannedContent.includes(targetFunction)) {
  scannedContent = scannedContent.replace(targetFunction, targetReplacement);
  fs.writeFileSync('src/components/ScannedItemsList.tsx', scannedContent, 'utf8');
  console.log('Fixed ScannedItemsList.tsx');
} else {
  console.log('Could not fix ScannedItemsList.tsx - target not found');
}

// Fix LoginModal.tsx
let loginContent = fs.readFileSync('src/components/LoginModal.tsx', 'utf8');
loginContent = loginContent.replace(/title=\{darkMode \? 'Beralih ke Tema Terang \(Light Mode\)' : 'Beralih ke Tema Gelap \(Dark Mode\)'\}/g, `title="Pilih Tema"`);
loginContent = loginContent.replace(/\{darkMode \? <Palette className="w-4 h-4 text-primary-500" \/> : <Moon className="w-4 h-4 text-slate-600" \/>\}/g, `<Palette className="w-4 h-4 text-slate-600" />`);
fs.writeFileSync('src/components/LoginModal.tsx', loginContent, 'utf8');
console.log('Fixed LoginModal.tsx');
