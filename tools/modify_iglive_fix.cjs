const fs = require('fs');
const path = require('path');

const filepath = path.join('d:\\Antigravity\\WMS Inventory\\src\\services\\igLiveService.ts');
let content = fs.readFileSync(filepath, 'utf8');

// 1. Fix import
content = content.replace("import { supabase, getAreaFromLokasi", "import { getSupabaseClient, getAreaFromLokasi");

// 2. Add const supabase = getSupabaseClient(); inside functions
content = content.replace(/supabase\s*\n\s*\.from/g, "getSupabaseClient().from");

fs.writeFileSync(filepath, content);
console.log("igLiveService.ts fixed");
