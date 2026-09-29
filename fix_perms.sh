cat << 'PY_EOF' > fix.py
import re

with open('src/services/permissions.ts', 'r') as f:
    content = f.read()

# Replace access cases
block = r'''    case 'penerimaan_barang':
      return hasPermission\(session, 'can_penerimaan_barang'\);
    case 'packing':
      return hasPermission\(session, 'can_packing'\);
    case 'pengiriman':
      return hasPermission\(session, 'can_pengiriman'\);
    case 'agenda':
      return hasPermission\(session, 'can_agenda'\);
    case 'scanner':
      return hasPermission\(session, 'can_scan'\);
    case 'penerimaan':
      return hasPermission\(session, 'can_penerimaan'\) || hasPermission\(session, 'can_scan'\);'''

new_block = """    case 'packing':
      return hasPermission(session, 'can_packing');
    case 'agenda':
      return hasPermission(session, 'can_agenda');
    case 'scanner':
      return hasPermission(session, 'can_scan');
    case 'loading_dock':
      return hasPermission(session, 'can_penerimaan_barang') || hasPermission(session, 'can_pengiriman') || hasPermission(session, 'can_penerimaan');"""

content = re.sub(block, new_block, content)

with open('src/services/permissions.ts', 'w') as f:
    f.write(content)
PY_EOF
python3 fix.py
