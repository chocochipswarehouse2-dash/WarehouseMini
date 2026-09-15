const fs = require('fs');

const fixSupabase = 'src/services/supabase.ts';
let s = fs.readFileSync(fixSupabase, 'utf8');
s = s.replace(/let processedPassword = user\.password\.trim\(\);\n    if \(processedPassword\.length !== 64\) \{\n      try \{\n        processedPassword = await computeSha256\(processedPassword\);\n      \} catch \(e\) \{\n        console\.warn\('Error hashing password:', e\);\n      \}\n    \}\n    payload\.password = processedPassword;/g, "payload.password = user.password.trim();");

s = s.replace(/let hashedPass = '';\n  if \(cleanPass\) \{\n    hashedPass = await computeSha256\(cleanPass\);\n  \}/g, "let hashedPass = cleanPass;");

fs.writeFileSync(fixSupabase, s);

const fixSettings = 'src/components/SettingsModal.tsx';
let sm = fs.readFileSync(fixSettings, 'utf8');
sm = sm.replace(/\{showPasswords \? \(usr\.password\?\.length === 64 \? '•••••• \(Terenkripsi\)' : \(usr\.password \|\| '123456'\)\) : '••••••'\}/g, "{showPasswords ? (usr.password || '123456') : '••••••'}");
fs.writeFileSync(fixSettings, sm);
