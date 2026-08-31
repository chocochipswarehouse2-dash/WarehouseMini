import { fetchPickingListFromSupabase } from './src/services/supabase.js';

global.localStorage = {
  getItem: () => null,
  setItem: () => null
};

async function run() {
    try {
        const data = await fetchPickingListFromSupabase();
        console.log("Found picking list items:", data.length);
        console.log("Recent 5:", data.slice(0, 5));
    } catch(err) {
        console.error("Error:", err);
    }
}
run();
