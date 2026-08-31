import { readFileSync, writeFileSync } from 'fs';
let content = readFileSync('src/services/supabase.ts', 'utf-8');

const targetFunc1 = `export async function deletePickingSuratJalanBatchSupabase(no_sjs: string[]): Promise<boolean> {
  if (!no_sjs || no_sjs.length === 0) return true;
  try {
    const sjList = no_sjs.map(s => encodeURIComponent(s)).join(',');
    await supabaseFetch('picking_list', 'DELETE', null, \`no_sj=in.(\${sjList})\`);
    // Also delete from peminjaman if they exist
    await supabaseFetch('peminjaman', 'DELETE', null, \`no_peminjaman=in.(\${sjList})\`).catch(() => {});
    return true;
  } catch (e) {
    console.error('deletePickingSuratJalanBatchSupabase error:', e);
    return false;
  }
}`;

const replaceFunc1 = `export async function deletePickingSuratJalanBatchSupabase(no_sjs: string[]): Promise<boolean> {
  if (!no_sjs || no_sjs.length === 0) return true;
  try {
    // Delete one by one to avoid PostgREST 'in' syntax issues with special chars
    for (const sj of no_sjs) {
      const encodedSj = encodeURIComponent(sj);
      await supabaseFetch('picking_list', 'DELETE', null, \`no_sj=eq.\${encodedSj}\`);
      await supabaseFetch('peminjaman', 'DELETE', null, \`no_peminjaman=eq.\${encodedSj}\`).catch(() => {});
    }
    return true;
  } catch (e) {
    console.error('deletePickingSuratJalanBatchSupabase error:', e);
    return false;
  }
}`;

if (content.includes(targetFunc1)) {
  content = content.replace(targetFunc1, replaceFunc1);
}

const targetFunc2 = `export async function completePickingSuratJalanBatchSupabase(no_sjs: string[], pickerName: string): Promise<boolean> {
  if (!no_sjs || no_sjs.length === 0) return true;
  try {
    const sjList = no_sjs.map(s => encodeURIComponent(s)).join(',');
    await supabaseFetch('picking_list', 'PATCH', { 
      status: 'SELESAI',
      picker_name: pickerName || 'Admin'
    }, \`no_sj=in.(\${sjList})\`);
    return true;
  } catch (e) {
    console.error('completePickingSuratJalanBatchSupabase error:', e);
    return false;
  }
}`;

const replaceFunc2 = `export async function completePickingSuratJalanBatchSupabase(no_sjs: string[], pickerName: string): Promise<boolean> {
  if (!no_sjs || no_sjs.length === 0) return true;
  try {
    for (const sj of no_sjs) {
      const encodedSj = encodeURIComponent(sj);
      await supabaseFetch('picking_list', 'PATCH', { 
        status: 'SELESAI',
        picker_name: pickerName || 'Admin'
      }, \`no_sj=eq.\${encodedSj}\`);
    }
    return true;
  } catch (e) {
    console.error('completePickingSuratJalanBatchSupabase error:', e);
    return false;
  }
}`;

if (content.includes(targetFunc2)) {
  content = content.replace(targetFunc2, replaceFunc2);
}

writeFileSync('src/services/supabase.ts', content);
console.log("Updated to loop-based batch operations");
