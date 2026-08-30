import { fetchAllStockRealtime } from './src/services/supabase.ts';
async function test() {
  const data = await fetchAllStockRealtime(100);
  console.log(data?.length);
}
test();
