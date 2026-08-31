import { deletePickingSuratJalanBatchSupabase } from './src/services/supabase.js';
deletePickingSuratJalanBatchSupabase(['SPS-078810']).then(res => console.log('Result:', res));
