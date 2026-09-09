const fs = require('fs');
let listContent = fs.readFileSync('src/components/ScannedItemsList.tsx', 'utf8');

const sizeLabelRegex = /\{item.size && \([\s\S]*?<\/span>\n\s*\)\}/;
if (sizeLabelRegex.test(listContent)) {
  const replacement = `{item.size && (
                      <span className="text-[10px] font-black bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase">
                        Size: {item.size}
                      </span>
                    )}
                    {/* Qty Label */}
                    <span className="text-[11px] font-black bg-primary-500/20 text-primary-700 dark:text-primary-300 border border-primary-500/40 px-2 py-0.5 rounded-md uppercase">
                      x{item.qty || 1}
                    </span>`;
  listContent = listContent.replace(sizeLabelRegex, replacement);
  console.log("Updated ScannedItemsList.tsx badges!");
} else {
  console.log("Could not find size label in ScannedItemsList.tsx");
}

fs.writeFileSync('src/components/ScannedItemsList.tsx', listContent, 'utf8');
