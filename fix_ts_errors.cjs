const fs = require('fs');

const fixKaryawan = 'src/components/hr/KaryawanView.tsx';
let k = fs.readFileSync(fixKaryawan, 'utf8');
k = k.replace(/hasPermission\(session, false \/\* removed \*\/\)/g, "isSuperadmin(session)");
fs.writeFileSync(fixKaryawan, k);

const fixSettings = 'src/components/SettingsModal.tsx';
let s = fs.readFileSync(fixSettings, 'utf8');
s = s.replace(/hasPermission\(session, false \/\* removed \*\/\)/g, "isSuperadmin(session)");
fs.writeFileSync(fixSettings, s);
