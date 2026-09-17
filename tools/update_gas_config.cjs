const fs = require('fs');

// 1. SupabaseBridge.js
const bridgePath = 'D:/Antigravity/GAS WMS Mini/SupabaseBridge.js';
let bridgeContent = fs.readFileSync(bridgePath, 'utf8');
bridgeContent = bridgeContent.replace(
  /const SUPABASE_URL\s*=\s*["'][^"']+["'];/,
  'const SUPABASE_URL = "https://atdedxyiielpmzjlnriv.supabase.co";'
);
bridgeContent = bridgeContent.replace(
  /const SUPABASE_ANON_KEY\s*=\s*["'][^"']+["'];/,
  'const SUPABASE_ANON_KEY = "sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb";'
);
fs.writeFileSync(bridgePath, bridgeContent, 'utf8');
console.log('✅ SupabaseBridge.js updated.');

// 2. WmsAuth.js
const authPath = 'D:/Antigravity/GAS WMS Mini/WmsAuth.js';
let authContent = fs.readFileSync(authPath, 'utf8');
authContent = authContent.replace(
  /https:\/\/vxongwtxmhjixhzeoidp\.supabase\.co/g,
  'https://atdedxyiielpmzjlnriv.supabase.co'
);
fs.writeFileSync(authPath, authContent, 'utf8');
console.log('✅ WmsAuth.js updated.');

// 3. Wmsupdatedatabase.js
const updateDbPath = 'D:/Antigravity/GAS WMS Mini/Wmsupdatedatabase.js';
let updateDbContent = fs.readFileSync(updateDbPath, 'utf8');
updateDbContent = updateDbContent.replace(
  /https:\/\/vxongwtxmhjixhzeoidp\.supabase\.co/g,
  'https://atdedxyiielpmzjlnriv.supabase.co'
);
fs.writeFileSync(updateDbPath, updateDbContent, 'utf8');
console.log('✅ Wmsupdatedatabase.js updated.');
