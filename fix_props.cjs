const fs = require('fs');

// Fix Sidebar.tsx
let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
sidebar = sidebar.replace(/darkMode: boolean;\n/g, '');
sidebar = sidebar.replace(/darkMode,\n/g, '');
fs.writeFileSync('src/components/Sidebar.tsx', sidebar, 'utf8');

// Fix Navbar.tsx
let navbar = fs.readFileSync('src/components/Navbar.tsx', 'utf8');
navbar = navbar.replace(/darkMode: boolean;\n/g, '');
navbar = navbar.replace(/darkMode,\n/g, '');
fs.writeFileSync('src/components/Navbar.tsx', navbar, 'utf8');

