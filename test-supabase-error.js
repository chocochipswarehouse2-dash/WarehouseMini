import { createClient } from '@supabase/supabase-js';
try {
  createClient('https://filgijcfhgqlirzhvwho.supabase.co', 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD');
  console.log("Success with default key");
} catch (e) {
  console.error("Error with default key:", e.message);
}
