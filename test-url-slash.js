import { createClient } from '@supabase/supabase-js';
try {
  createClient('https://filgijcfhgqlirzhvwho.supabase.co/', 'anon-key');
  console.log("With trailing slash: OK");
} catch(e) {
  console.error("With trailing slash:", e.message);
}
try {
  createClient('filgijcfhgqlirzhvwho.supabase.co', 'anon-key');
  console.log("No protocol: OK");
} catch(e) {
  console.error("No protocol:", e.message);
}
