const fs = require('fs');
let code = fs.readFileSync('src/main.tsx', 'utf8');

const injection = `
// GLOBAL OVERRIDE: Prevent QuotaExceededError from crashing the app
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
  try {
    originalSetItem.apply(this, [key, value]);
  } catch (e) {
    const err = e as any;
    console.warn(\`[QuotaExceeded] localStorage is full when setting \${key}.\`);
    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      // Clear large caches to free up space
      try {
        localStorage.removeItem('wms_product_cache');
        localStorage.removeItem('wms_picking_cache');
        localStorage.removeItem('wms_raw_picking_list_cache');
        localStorage.removeItem('wms_local_perbaikan_tickets');
        localStorage.removeItem('wms_local_qc_reports');
        localStorage.removeItem('wms_local_penerimaan_produksi');
        localStorage.removeItem('gas_delta_sync_Stok Real');
        localStorage.removeItem('gas_delta_sync_Mutasi Log');
        // Retry once
        originalSetItem.apply(this, [key, value]);
      } catch (retryErr) {
        console.error('Still failed after clearing caches.', retryErr);
      }
    }
  }
};
`;

if (!code.includes('GLOBAL OVERRIDE')) {
  code = code.replace("import './index.css';", "import './index.css';\n" + injection);
  fs.writeFileSync('src/main.tsx', code);
}
