const fs = require('fs');
let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
sidebar = sidebar.replace(
`          {darkMode ? (
            <Palette className="w-4 h-4 text-primary-500" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700 fill-slate-700" />
          )}`,
`          <Palette className="w-4 h-4 text-slate-500" />`
);
fs.writeFileSync('src/components/Sidebar.tsx', sidebar, 'utf8');
