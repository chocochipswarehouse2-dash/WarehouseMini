const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace(/tarikan_md: 'pengecekan-sj',\n/, '');
app = app.replace(/'pengecekan-sj': 'tarikan_md',\n/, '');
fs.writeFileSync('src/App.tsx', app);

let perms = fs.readFileSync('src/services/permissions.ts', 'utf8');
perms = perms.replace(/case 'tarikan_md': return hasPermission\(session, 'tab_ops_pesanan_transfer_order'\);\n/, '');
fs.writeFileSync('src/services/permissions.ts', perms);
