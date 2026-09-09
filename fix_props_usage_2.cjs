const fs = require('fs');

let navbar = fs.readFileSync('src/components/Navbar.tsx', 'utf8');
navbar = navbar.replace(/title=\{darkMode \? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'\}/g, `title="Pilih Tema"`);
navbar = navbar.replace(/\{darkMode \? \([\s\S]*?<\/Palette>[\s\S]*?\) : \([\s\S]*?<\/Moon>[\s\S]*?\)\}/g, `<Palette className="w-4.5 h-4.5 text-slate-500" />`);
fs.writeFileSync('src/components/Navbar.tsx', navbar, 'utf8');

