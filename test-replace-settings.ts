import * as fs from 'fs';
let content = fs.readFileSync('src/components/SettingsModal.tsx', 'utf-8');

// Replacements in SettingsModal.tsx
content = content.replace(/Supabase di-reset ke konfigurasi default Chocochips!/g, 'Database di-reset ke konfigurasi default Chocochips!');
content = content.replace(/handleTestSupabase/g, 'handleTestDatabase');
content = content.replace(/isTestingSupabase/g, 'isTestingDatabase');
content = content.replace(/setIsTestingSupabase/g, 'setIsTestingDatabase');
content = content.replace(/supabaseStatusMsg/g, 'databaseStatusMsg');
content = content.replace(/setSupabaseStatusMsg/g, 'setDatabaseStatusMsg');
content = content.replace(/supabaseStatus/g, 'databaseStatus');
content = content.replace(/setSupabaseStatus/g, 'setDatabaseStatus');
content = content.replace(/Koneksi database Supabase berhasil!/g, 'Koneksi database berhasil!');
content = content.replace(/Koneksi Supabase berhasil terhubung!/g, 'Koneksi database berhasil terhubung!');
content = content.replace(/Gagal menghubungi database Supabase\./g, 'Gagal menghubungi database.');
content = content.replace(/Koneksi Supabase gagal:/g, 'Koneksi database gagal:');
content = content.replace(/Katalog produk master berhasil disinkronkan dari Supabase!/g, 'Katalog produk master berhasil disinkronkan dari Cloud!');
content = content.replace(/Also sync to Supabase table if available/g, 'Also sync to Database table if available');
content = content.replace(/Supabase Cloud DB, Integrasi Google Apps Script/g, 'Cloud DB, Integrasi Google Apps Script');
content = content.replace(/activeTab === 'supabase'/g, "activeTab === 'database'");
content = content.replace(/setActiveTab\('supabase'\)/g, "setActiveTab('database')");
content = content.replace(/<span>Supabase Database<\/span>/g, '<span>Cloud Database</span>');
content = content.replace(/TAB: SUPABASE CONFIG/g, 'TAB: DATABASE CONFIG');
content = content.replace(/Status Supabase Realtime/g, 'Status Database Realtime');
content = content.replace(/Supabase Project URL/g, 'Database Project URL');
content = content.replace(/Supabase URL/g, 'Database URL');
content = content.replace(/Supabase Anon \/ Public API Key/g, 'Database Anon \/ Public API Key');
content = content.replace(/Supabase Key/g, 'Database Key');
content = content.replace(/https:\/\/xyz\.supabase\.co/g, 'https://xyz.database.co');
content = content.replace(/handleResetSupabase/g, 'handleResetDatabase');
content = content.replace(/handleSaveSupabase/g, 'handleSaveDatabase');
content = content.replace(/Simpan Konfigurasi Supabase/g, 'Simpan Konfigurasi Database');

fs.writeFileSync('src/components/SettingsModal.tsx', content);
