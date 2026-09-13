const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf-8');

// Replace the condition in fetchPickingListFromSupabase
const oldCondition = `// Skip items that are already returned to avoid re-adding them to picking list
      if (pStatus === 'DIKEMBALIKAN') continue;`;

const newCondition = `// Skip items that are already returned to avoid re-adding them to picking list
      if (pStatus === 'DIKEMBALIKAN' || pStatus === 'SELESAI') continue;`;

if (code.includes(oldCondition)) {
  code = code.replace(oldCondition, newCondition);
  fs.writeFileSync('src/services/supabase.ts', code);
  console.log('Fixed peminjaman sync logic');
} else {
  console.log('Could not find exact string for oldCondition');
}
