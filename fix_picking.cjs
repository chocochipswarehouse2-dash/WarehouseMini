const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf-8');

const originalPeminjamanSync = `// Skip items that are already returned to avoid re-adding them to picking list
      if (pStatus === 'DIKEMBALIKAN' || pStatus === 'SELESAI') continue;`;
      
const newPeminjamanSync = `// Skip items that are already returned to avoid re-adding them to picking list
      if (pStatus === 'DIKEMBALIKAN' || pStatus === 'SELESAI') continue;
      
      // Additional safety check: If it already exists in the map as SELESAI, don't overwrite it with a PENDING status from Peminjaman
      const existing = itemsMap.get(\`\${no_sj}__\${sku}\`);
      if (existing && existing.status === 'SELESAI') continue;`;

code = code.replace(originalPeminjamanSync, newPeminjamanSync);
fs.writeFileSync('src/services/supabase.ts', code);
console.log('Fixed picking overwrite bug');
