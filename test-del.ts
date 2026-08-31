import { deletePickingSuratJalanBatchSupabase } from './src/services/supabase.js';
deletePickingSuratJalanBatchSupabase(['NONEXISTENT-SJ']).then(res => console.log('Result:', res));
