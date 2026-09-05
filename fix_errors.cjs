const fs = require('fs');

const pViewFile = 'src/components/PeminjamanView.tsx';
let pViewCode = fs.readFileSync(pViewFile, 'utf8');

// Add import
pViewCode = pViewCode.replace("import { getSupabaseClient } from '@/services/supabase';", "import { getSupabaseClient } from '@/services/supabase';\nimport { getLocalUsers } from '@/utils/localStore';");
// Change phone to no_hp
pViewCode = pViewCode.replace("const targetPhone = currentUser?.phone;", "const targetPhone = currentUser?.no_hp || (currentUser as any)?.phone;");

fs.writeFileSync(pViewFile, pViewCode);

const sModalFile = 'src/components/SettingsModal.tsx';
let sModalCode = fs.readFileSync(sModalFile, 'utf8');
sModalCode = sModalCode.replace("phone: newPhone.trim() || undefined,", "no_hp: newPhone.trim() || undefined,");
fs.writeFileSync(sModalFile, sModalCode);

console.log("Fixed files");
