import * as fs from 'fs';
let content = fs.readFileSync('src/components/BottomSaveBar.tsx', 'utf-8');

content = content.replace(/MENYIMPAN KE SUPABASE & GAS\.\.\./g, 'MENYIMPAN DATA...');

fs.writeFileSync('src/components/BottomSaveBar.tsx', content);
