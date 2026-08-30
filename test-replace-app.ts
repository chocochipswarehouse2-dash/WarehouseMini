import * as fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/ke Supabase!/g, 'ke Database!');
content = content.replace(/ke Supabase\./g, 'ke Database.');
content = content.replace(/Supabase Error/g, 'Database Error');

fs.writeFileSync('src/App.tsx', content);
