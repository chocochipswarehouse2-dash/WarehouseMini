import * as fs from 'fs';
let content = fs.readFileSync('src/components/LiveInventoryDrawer.tsx', 'utf-8');

content = content.replace(/dari Supabase\./g, 'dari Database.');
content = content.replace(/Supabase Real-time Sync/g, 'Cloud Real-time Sync');
content = content.replace(/log_produk Supabase\./g, 'log_produk Cloud Database.');
content = content.replace(/GAS\/Sheets\/Supabase/g, 'GAS/Sheets/Cloud Database');

fs.writeFileSync('src/components/LiveInventoryDrawer.tsx', content);
