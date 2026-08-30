import * as fs from 'fs';
let content = fs.readFileSync('src/components/PeminjamanView.tsx', 'utf-8');

content = content.replace(/dari Supabase!/g, 'dari Database!');
content = content.replace(/dari Supabase/g, 'dari Database');
content = content.replace(/real Supabase/g, 'real Database');
content = content.replace(/ke Supabase!/g, 'ke Database!');
content = content.replace(/ke Supabase/g, 'ke Database');
content = content.replace(/Stok Real-Time Supabase/g, 'Stok Real-Time Database');
content = content.replace(/Real-Time Stok Supabase/g, 'Real-Time Stok Database');

fs.writeFileSync('src/components/PeminjamanView.tsx', content);
