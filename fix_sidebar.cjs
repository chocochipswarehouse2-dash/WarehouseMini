const fs = require('fs');

let sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
sidebar = sidebar.replace(/\{\/\* Pengecekan Surat Jalan \(Audit SJ vs Fisik\) \*\/\}\s*\{\(userIsAdmin \|\| hasPermission\(session, 'tab_ops_pesanan_transfer_order'\)\) && \(\s*<button\s*type="button"\s*onClick=\{\(\) => \{\s*handleNavClick\('tarikan_md'\);\s*onCloseMobile\(\);\s*\}\}\s*title="Pengecekan Surat Jalan vs Fisik Penerimaan"[\s\S]*?<\/button>\s*\)\}/, '');
fs.writeFileSync('src/components/Sidebar.tsx', sidebar);

let navbar = fs.readFileSync('src/components/Navbar.tsx', 'utf8');
navbar = navbar.replace(/case 'tarikan_md':\s*return \{ title: 'Pengecekan Surat Jalan', subtitle: 'Pengecekan Penerimaan vs Surat Jalan', icon: ClipboardCheck \};/, '');
fs.writeFileSync('src/components/Navbar.tsx', navbar);
