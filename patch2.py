import os

with open('src/components/LiveInventoryDrawer.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    new_lines.append(lines[i])
    
    # Check if we are at the end of TAB 1 loop
    if ' {/* TAB 2: STOCK OPNAME' in lines[i]:
        # Backtrack to the last </div> and inject the Load More Logs
        # Actually, let's find the closing of the `filteredLogs.map` div.
        pass

    i += 1
