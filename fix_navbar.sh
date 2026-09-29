cat << 'PY_EOF' > fix_nav.py
import re

with open('src/components/Navbar.tsx', 'r') as f:
    content = f.read()

# Add loading dock case
loading_dock_case = """      case 'loading_dock':
        return { title: 'Loading Dock', subtitle: 'Area terpadu untuk mengatur kedatangan barang dari vendor CMT, penerimaan retur, dan pengiriman barang ke customer.', icon: ArrowRightLeft };
      case 'dashboard':"""

content = content.replace("      case 'dashboard':", loading_dock_case)

with open('src/components/Navbar.tsx', 'w') as f:
    f.write(content)
PY_EOF
python3 fix_nav.py
