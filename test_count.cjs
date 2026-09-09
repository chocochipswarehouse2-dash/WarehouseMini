const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check() {
  try {
    const raw = fs.readFileSync('src/services/supabase.ts', 'utf8');
    const urlMatch = raw.match(/const SUPABASE_URL = '([^']+)'/);
    const keyMatch = raw.match(/const SUPABASE_ANON_KEY = '([^']+)'/);
    if (!urlMatch || !keyMatch) {
      console.log('No hardcoded creds found, they must be in env.');
      return;
    }
  } catch (e) {
    console.log(e);
  }
}
check();
