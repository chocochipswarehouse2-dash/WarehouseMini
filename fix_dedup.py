import re

with open('src/components/LiveInventoryDrawer.tsx', 'r') as f:
    content = f.read()

logs_bad = """        const data = await fetchAllLogs(15000);
        setLogs(data);"""
logs_good = """        const data = await fetchAllLogs(15000);
        // Deduplicate
        const unique = Array.from(new Map(data.map(item => [item.id || Math.random(), item])).values());
        setLogs(unique);"""
content = content.replace(logs_bad, logs_good)

so_bad = """        const data = await fetchStockOpnameQueue('ALL', 15000);
        setSoQueue(data);"""
so_good = """        const data = await fetchStockOpnameQueue('ALL', 15000);
        const unique = Array.from(new Map(data.map(item => [item.id || Math.random(), item])).values());
        setSoQueue(unique);"""
content = content.replace(so_bad, so_good)


with open('src/components/LiveInventoryDrawer.tsx', 'w') as f:
    f.write(content)
