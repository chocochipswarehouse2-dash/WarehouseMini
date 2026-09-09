const fs = require('fs');
let navbar = fs.readFileSync('src/components/Navbar.tsx', 'utf8');
const regex = /\{darkMode \? \([\s\S]*?<\/span>[\s\S]*?<\/>\s*\)\}/;
navbar = navbar.replace(regex, `<>
              <Palette className="w-4 h-4 text-slate-500" />
              <span className="hidden md:inline font-bold text-slate-500">Tema</span>
            </>`);
fs.writeFileSync('src/components/Navbar.tsx', navbar, 'utf8');
