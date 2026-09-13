const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf-8');

const oldBatch = `      await supabaseFetch('picking_list', 'PATCH', { 
        status: 'SELESAI',
        picker_name: pickerName || 'Admin'
      }, \`no_sj=eq.\${encodedSj}\`);`;
const newBatch = `      await supabaseFetch('picking_list', 'PATCH', { 
        status: 'SELESAI',
        picker_name: pickerName || 'Admin'
      }, \`no_sj=eq.\${encodedSj}\`);
      
      // Also sync to peminjaman (legacy support)
      if (sj.toUpperCase().startsWith('SPS') || sj.toUpperCase().startsWith('PJM')) {
        await supabaseFetch('peminjaman', 'PATCH', { 
          status: 'SELESAI'
        }, \`no_peminjaman=eq.\${encodedSj}\`).catch(() => {});
      }`;

if (code.includes(oldBatch)) {
  code = code.replace(oldBatch, newBatch);
  fs.writeFileSync('src/services/supabase.ts', code);
  console.log('Fixed batch supabase sync to peminjaman');
} else {
  console.log('Could not find oldBatch block');
}
