import * as fs from 'fs';
let content = fs.readFileSync('src/components/PickingTasksView.tsx', 'utf-8');

content = content.replace(/dari Supabase/g, 'dari Database');
content = content.replace(/ke Supabase/g, 'ke Database');
content = content.replace(/di Supabase/g, 'di Database');
content = content.replace(/database Supabase log_produk/g, 'database log_produk');
content = content.replace(/Sinkronisasi Supabase/g, 'Sinkronisasi Database');

fs.writeFileSync('src/components/PickingTasksView.tsx', content);
