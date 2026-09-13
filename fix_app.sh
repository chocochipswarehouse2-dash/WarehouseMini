cat << 'PY_EOF' > fix.py
import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Replace lazy loads
content = re.sub(r'const PenerimaanBarangView = [^\n]+\n', '', content)
content = re.sub(r'const PengirimanView = [^\n]+\n', '', content)
content = re.sub(r'const PenerimaanProduksiView = [^\n]+\n', '', content)

new_import = "const LoadingDockView = lazyWithRetry(() => import('./components/LoadingDockView').then(m => ({ default: m.LoadingDockView })));\n"
content = re.sub(r'(const DashboardView = [^\n]+\n)', r'\1' + new_import, content)

# Replace activePage checks
penerimaan_barang_block = r'\{\s*activePage === \'penerimaan_barang\'\s*&&\s*\(\s*<PenerimaanBarangView \/>\s*\)\s*\}'
content = re.sub(penerimaan_barang_block, '', content)

pengiriman_block = r'\{\s*activePage === \'pengiriman\'\s*&&\s*\(\s*<PengirimanView \/>\s*\)\s*\}'
content = re.sub(pengiriman_block, '', content)

penerimaan_block = r'\{\s*activePage === \'penerimaan\'\s*&&\s*\(\s*<PenerimaanProduksiView[^>]+>\s*\)\s*\}'
loading_dock_block = """{activePage === 'loading_dock' && (
                  <LoadingDockView
                    session={session}
                    productCatalog={productDatabase}
                    onShowToast={showToast}
                  />
              )}"""

content = re.sub(penerimaan_block, loading_dock_block, content)

with open('src/App.tsx', 'w') as f:
    f.write(content)
PY_EOF
python3 fix.py
