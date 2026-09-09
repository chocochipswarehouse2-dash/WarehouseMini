const fs = require('fs');

// Fix Sidebar.tsx
let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
sidebar = sidebar.replace(/title=\{darkMode \? 'Ubah ke Mode Terang' : 'Ubah ke Mode Gelap'\}/g, `title="Pilih Tema"`);
sidebar = sidebar.replace(/\{darkMode \? \([\s\S]*?<\/Palette>[\s\S]*?\)\}/g, `<Palette className="w-5 h-5 text-slate-500 group-hover:text-primary-500 transition-colors" />`);
sidebar = sidebar.replace(/<span>\{darkMode \? 'Mode Terang' : 'Mode Gelap'\}<\/span>/g, `<span>Pilih Tema</span>`);
sidebar = sidebar.replace(/\{darkMode \? 'DARK' : 'LIGHT'\}/g, `'TEMA'`);
fs.writeFileSync('src/components/Sidebar.tsx', sidebar, 'utf8');

// Fix Navbar.tsx
let navbar = fs.readFileSync('src/components/Navbar.tsx', 'utf8');
navbar = navbar.replace(/title=\{darkMode \? 'Beralih ke Tema Terang' : 'Beralih ke Tema Gelap'\}/g, `title="Pilih Tema"`);
navbar = navbar.replace(/\{darkMode \? \([\s\S]*?<\/Palette>[\s\S]*?\) : \([\s\S]*?<\/Moon>[\s\S]*?\)\}/g, `<Palette className="w-4.5 h-4.5 text-slate-500" />`);
fs.writeFileSync('src/components/Navbar.tsx', navbar, 'utf8');

