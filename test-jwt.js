import { createClient } from '@supabase/supabase-js';
try {
  // Let's create a fake JWT with service_role to see if it throws
  const fakeSecretKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig';
  createClient('https://filgijcfhgqlirzhvwho.supabase.co', fakeSecretKey);
  console.log("Success");
} catch (e) {
  console.error("Error:", e.message);
}
