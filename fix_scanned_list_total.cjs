const fs = require('fs');
let content = fs.readFileSync('src/components/ScannedItemsList.tsx', 'utf8');

// Insert totalScannedQty right before return
content = content.replace(
  /export const ScannedItemsList: React.FC<ScannedItemsListProps> = \(\{ items, onRemoveItem, onClearAll \}\) => \{/,
  `export const ScannedItemsList: React.FC<ScannedItemsListProps> = ({ items, onRemoveItem, onClearAll }) => {
  const totalScannedQty = items.reduce((sum, item) => sum + (item.qty || 1), 0);`
);

// Replace the specific {items.length} inside the header badge
const badgeRegex = /<span([\s\S]*?)>([\s\S]*?)\{items\.length\}([\s\S]*?)<\/span>/;
content = content.replace(badgeRegex, `<span$1>$2{totalScannedQty}$3</span>`);

fs.writeFileSync('src/components/ScannedItemsList.tsx', content, 'utf8');
