const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const replaceInFile = (filePath, replacements) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  for (const [oldVal, newVal] of Object.entries(replacements)) {
    content = content.replace(new RegExp(oldVal, 'g'), newVal);
  }
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
};

const replacements = {
  "'can_approve_hr'": "'menu_hr_approval'",
  "'can_view_karyawan'": "'menu_hr_karyawan'",
  "'can_edit_data'": "'action_edit_master'",
  "'can_manage_users'": "false /* removed */",
  "'can_delete_data'": "'action_delete_master'",
  "'can_view_presensi'": "'menu_hr_presensi'",
  "'can_export_data'": "'action_export_data'",
  "'can_manual_shipment_action'": "'tab_ops_pesanan_manual_shipment'",
  "'can_tarikan_md'": "'tab_ops_pesanan_transfer_order'",
  "'can_approve_so'": "'tab_ops_mutasi_so'",
  "'can_sync_dealpos'": "'action_sync_dealpos'",
  "hasPermission\\(session, 'can_manage_settings'\\)": "isSuperadmin(session)",
  "hasPermission\\(session, 'can_manage_users'\\)": "isSuperadmin(session)"
};

const findFiles = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
};

const files = findFiles('src');
files.forEach(file => {
  replaceInFile(file, replacements);
});

