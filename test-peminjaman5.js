import { fetchPeminjamanFromSupabase } from './src/services/supabase.js';

// We need to inject localStorage shim since Bun/Node doesn't have it natively
global.localStorage = {
  getItem: () => null,
  setItem: () => null
};

fetchPeminjamanFromSupabase().then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error);
