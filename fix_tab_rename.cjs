const fs = require('fs');
let code = fs.readFileSync('src/components/PesananSaya/PesananSayaView.tsx', 'utf-8');

code = code.replace(
  "import { DistribusiStoreTab } from './DistribusiStoreTab';",
  "import { DistribusiStoreTab } from './DistribusiStoreTab';"
);

code = code.replace(
  "<DistribusiStoreTab session={session} productCatalog={productCatalog} onShowToast={onShowToast} />",
  "<DistribusiStoreTab session={session} productCatalog={productCatalog} onShowToast={onShowToast} />"
);

// We didn't change the component name, just the UI labels.
