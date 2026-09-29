import re

with open('src/services/supabase.ts', 'r') as f:
    content = f.read()

# Fix fetchQcReportsFromSupabase
content = re.sub(
    r'if\s*\(mergedMap\.size\s*>\s*0\s*\|\|\s*\(mergedMap\.size\s*===\s*0\s*&&\s*localData\.length\s*>\s*0\)\)\s*\{([\s\S]*?)\}\s*const finalResults',
    r'\1\n  const finalResults',
    content
)

# Fix fetchPerbaikanTicketsFromSupabase
content = re.sub(
    r'if\s*\(allRemoteTickets\.length\s*>\s*0\)\s*\{([\s\S]*?return localData;\s*)\}\s*\}\s*catch\s*\(err\)\s*\{',
    r'\1\n  } catch (err) {',
    content
)

with open('src/services/supabase.ts', 'w') as f:
    f.write(content)

