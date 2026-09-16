const fs = require('fs');
let content = fs.readFileSync('src/components/PickingTasksView.tsx', 'utf8');

const oldCode = `            let displayName = item.nama_produk || itemSku;
              
            // Auto clean name and extract size if missing
            const sizesList = ['XXXL','XXL','XL','L','M','S','XS','ALL','FS'];
            const sizeRegex = new RegExp(\`[\\\\s\\\\-\\\\[\\\\(]+(\${sizesList.join('|')})[\\\\]\\\\)]?\\\\s*$\`, 'i');
            const nameMatch = displayName.match(sizeRegex);
            if (nameMatch) {
              if (displaySize === '-') displaySize = nameMatch[1].toUpperCase();
              displayName = displayName.substring(0, nameMatch.index).trim();
            }`;

const newCode = `            let displayName = catMatch?.n || item.nama_produk || itemSku;
              
            // Auto clean name and extract size if missing
            const sizesList = ['XXXL','XXL','XL','L','M','S','XS','ALL','FS'];
            const sizeRegex = new RegExp(\`[\\\\s\\\\-\\\\[\\\\(]+(\${sizesList.join('|')})[\\\\]\\\\)]?\\\\s*$\`, 'i');
            const nameMatch = displayName.match(sizeRegex);
            if (nameMatch) {
              displaySize = nameMatch[1].toUpperCase();
              displayName = displayName.substring(0, nameMatch.index).trim();
            }
            
            // Fallback to catalog size if current displaySize is weird (e.g. user mapped wrong column)
            if (displaySize && displaySize.length > 5 && catMatch?.s) {
              displaySize = catMatch.s;
            }
            if (displaySize && displaySize.length > 5 && !catMatch?.s) {
               const ext = extractSizeFromSku(itemSku);
               if (ext !== '-') displaySize = ext;
            }`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('src/components/PickingTasksView.tsx', content, 'utf8');
