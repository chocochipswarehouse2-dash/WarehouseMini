import { createClient } from '@supabase/supabase-js';
async function run() {
  try {
    const client = createClient('https://filgijcfhgqlirzhvwho.supabase.co/', 'anon-key');
    const { error } = await client.from('log_produk').select('id').limit(1);
    console.log("Fetch done:", error?.message || "No error");
  } catch(e) {
    console.error("Caught:", e.message);
  }
}
run();
