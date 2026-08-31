import { readFileSync, writeFileSync } from 'fs';
let content = readFileSync('src/services/supabase.ts', 'utf-8');

const targetFunc1 = `export async function deletePickingSuratJalanBatchSupabase(no_sjs: string[]): Promise<boolean> {
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

const replaceFunc1 = `export async function deletePickingSuratJalanBatchSupabase(no_sjs: string[]): Promise<boolean> {
  if (!no_sjs || no_sjs.length === 0) return true;
  try {
    // Delete one by one to avoid PostgREST 'in' syntax issues with special chars
    for (const sj of no_sjs) {
      const encodedSj = encodeURIComponent(sj);
      await supabaseFetch('picking_list', 'DELETE', null, \`no_sj=eq.\${encodedSj}\`);
      await supabaseFetch('peminjaman', 'DELETE', null, \`no_peminjaman=eq.\${encodedSj}\`).catch(() => {});
    }
    // Clean up local caches
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cachedStr = localStorage.getItem('wms_picking_cache');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Array.isArray(cached)) {
            const newCache = cached.filter(item => !no_sjs.includes(item.no_sj));
            localStorage.setItem('wms_picking_cache', JSON.stringify(newCache));
          }
        }
        const rawCachedStr = localStorage.getItem('wms_raw_picking_list_cache');
        if (rawCachedStr) {
          const rawCached = JSON.parse(rawCachedStr);
          if (Array.isArray(rawCached)) {
            const newRawCache = rawCached.filter(item => !no_sjs.includes(item.no_sj));
            localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify(newRawCache));
          }
        }
      }
    } catch (err) {
      console.warn('Failed to clean local cache after delete', err);
    }
    return true;
  } catch (e) {
    console.error('deletePickingSuratJalanBatchSupabase error:', e);
    return false;
  }
}`;

content = content.replace(targetFunc1, replaceFunc1);

const targetFunc2 = `export async function completePickingSuratJalanBatchSupabase(no_sjs: string[], pickerName: string): Promise<boolean> {
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
    // Update local caches
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cachedStr = localStorage.getItem('wms_picking_cache');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Array.isArray(cached)) {
            const newCache = cached.map(item => no_sjs.includes(item.no_sj) ? { ...item, status: 'SELESAI', picker_name: pickerName || 'Admin' } : item);
            localStorage.setItem('wms_picking_cache', JSON.stringify(newCache));
          }
        }
      }
    } catch (err) {}
    return true;
  } catch (e) {
    console.error('completePickingSuratJalanBatchSupabase error:', e);
    return false;
  }
}`;

content = content.replace(targetFunc2, replaceFunc2);
writeFileSync('src/services/supabase.ts', content);
console.log("Updated delete/complete batch to clear cache");
