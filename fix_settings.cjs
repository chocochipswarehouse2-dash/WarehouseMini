const fs = require('fs');
const file = 'src/components/SettingsModal.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'const userToSave: LocalUserRecord = {\n      username: cleanU,\n      name: cleanName,\n      password: cleanP || (editingIndex !== null ? userList[editingIndex].password : \'123456\'),\n      role: newRole,\n      permissions: { ...newPermissions },\n      nik: newNik.trim() || undefined,\n      no_hp: newPhone.trim() || undefined,\n      email: newEmail.trim() || undefined,\n    };',
  'const userToSave: LocalUserRecord = {\n      username: cleanU,\n      name: cleanName,\n      password: cleanP || (editingIndex !== null ? userList[editingIndex].password : \'123456\'),\n      role: newRole,\n      permissions: { ...newPermissions },\n      nik: newNik.trim() || undefined,\n      phone: newPhone.trim() || undefined,\n      email: newEmail.trim() || undefined,\n    };'
);

code = code.replace(
  'saveWmsUserToSupabase({\n      username: cleanU,\n      name: cleanName,\n      role: newRole,\n      password: userToSave.password,\n      permissions: newPermissions,\n      nik: newNik.trim() || undefined,\n      phone: newPhone.trim() || undefined,\n      email: newEmail.trim() || undefined,\n    });',
  'saveWmsUserToSupabase({\n      username: cleanU,\n      name: cleanName,\n      role: newRole,\n      password: userToSave.password,\n      permissions: newPermissions,\n      nik: newNik.trim() || undefined,\n      no_hp: newPhone.trim() || undefined,\n      email: newEmail.trim() || undefined,\n    });'
);

fs.writeFileSync(file, code);
