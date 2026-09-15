const fs = require('fs');
const filePath = 'src/components/CetakLabelView.tsx';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/Sheet 'Data Alamat'/g, "Database");
code = code.replace(/Google Sheet Data Alamat/g, "Database");
code = code.replace(/Sheet "Data Alamat"/g, 'Database');
code = code.replace(/Supabase & Sheet Data Alamat/g, 'Supabase Database');
code = code.replace(/Supabase & Google Sheet/g, 'Supabase Database');
code = code.replace(/Google Sheet 'outlet' kolom C/g, 'Database Outlet Config');
code = code.replace(/Sinkron Sheet/g, 'Sinkron Database');
code = code.replace(/Sheet Outlet Kolom C/g, 'Database Config');
code = code.replace(/Jasa Kirim dari Sheet/g, 'Jasa Kirim dari Database');
code = code.replace(/Data Alamat \(Google Sheets & Local Cache\)/g, 'Data Alamat (Database & Local Cache)');

fs.writeFileSync(filePath, code);
