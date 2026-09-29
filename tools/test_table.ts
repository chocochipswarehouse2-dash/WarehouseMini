import { fetchWmsSettings, saveWmsSettings } from '../src/services/settings';

async function test() {
  console.log("Checking if table exists by doing a GET...");
  const existing = await fetchWmsSettings();
  console.log("Existing settings:", existing);
}
test();
