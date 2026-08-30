import { createClient } from '@supabase/supabase-js';
global.window = {}; // Polyfill window to simulate browser
try {
  const fakeSecretKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig';
  createClient('https://filgijcfhgqlirzhvwho.supabase.co', fakeSecretKey);
  console.log("Success");
} catch (e) {
  console.error("Error:", e.message);
}
