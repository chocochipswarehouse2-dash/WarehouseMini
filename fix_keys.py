import re

with open('src/components/LiveInventoryDrawer.tsx', 'r') as f:
    content = f.read()

# Fix logs map key
content = re.sub(r'key=\{log\.id \|\| `\$\{log\.sku\}_\$\{idx\}`\}', r'key={`${log.id || log.sku}_${idx}`}', content)

# Fix SO map key
content = re.sub(r'key=\{item\.id \|\| `\$\{item\.sku\}_\$\{idx\}`\}', r'key={`${item.id || item.sku}_${idx}`}', content)

# Fix stock map key
content = re.sub(r'key=\{st\.id \|\| `\$\{st\.sku\}_\$\{st\.lokasi\}_\$\{idx\}`\}', r'key={`${st.id || st.sku}_${st.lokasi}_${idx}`}', content)

with open('src/components/LiveInventoryDrawer.tsx', 'w') as f:
    f.write(content)
