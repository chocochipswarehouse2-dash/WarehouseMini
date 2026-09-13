#!/bin/bash
# Remove penerimaan_barang block (lines 108-115)
# Actually, I'll use awk or python to precisely replace it.
cat << 'PY_EOF' > fix.py
import re

with open('src/components/Sidebar.tsx', 'r') as f:
    content = f.read()

# Replace penerimaan_barang, pengiriman, penerimaan with loading_dock
# Let's find the blocks and remove them

block1_pattern = r'\{\s*id: \'penerimaan_barang\' as ActivePage,.*?\},'
content = re.sub(block1_pattern, '', content, flags=re.DOTALL)

block2_pattern = r'\{\s*id: \'pengiriman\' as ActivePage,.*?\},'
content = re.sub(block2_pattern, '', content, flags=re.DOTALL)

block3_pattern = r'\{\s*id: \'penerimaan\' as ActivePage,.*?\},'
loading_dock_block = """{
      id: 'loading_dock' as ActivePage,
      label: 'Loading Dock',
      shortLabel: 'Loading Dock',
      icon: Truck,
      description: 'Penerimaan & Pengiriman Terpadu',
      access: (s: any) => canPenerimaanBarang(s) || canPengiriman(s) || canPenerimaan(s),
    },"""

content = re.sub(block3_pattern, loading_dock_block, content, flags=re.DOTALL)

with open('src/components/Sidebar.tsx', 'w') as f:
    f.write(content)
PY_EOF
python3 fix.py
