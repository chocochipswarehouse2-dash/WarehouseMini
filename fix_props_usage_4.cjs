const fs = require('fs');
let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
const regex = /\{darkMode \? \([\s\S]*?<\/Palette>[\s\S]*?\) : \([\s\S]*?<\/Moon>[\s\S]*?\)\}/;
sidebar = sidebar.replace(regex, `<Palette className="w-4 h-4 text-slate-500" />`);
fs.writeFileSync('src/components/Sidebar.tsx', sidebar, 'utf8');
