import { fetchRealtimeChannelStocksSupabase } from './src/services/supabase.js';

global.localStorage = {
  getItem: () => null,
  setItem: () => null
};

fetchRealtimeChannelStocksSupabase().then(res => {
   console.log("Sample Studio:", res.filter(x => x.studioQty > 0).slice(0, 3));
}).catch(console.error);
