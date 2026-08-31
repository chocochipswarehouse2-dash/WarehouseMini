import { supabaseFetch } from './src/services/supabase.js';
supabaseFetch('peminjaman', 'DELETE', null, `no_peminjaman=eq.SPS-078810`)
  .then(res => console.log('Deleted from peminjaman:', res))
  .catch(err => console.error('Error deleting peminjaman:', err.message));
