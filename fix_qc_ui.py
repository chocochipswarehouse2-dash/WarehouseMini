import re

with open('src/components/LaporanQcView.tsx', 'r') as f:
    content = f.read()

content = content.replace('''
        const data = await fetchQcReportsFromSupabase();
        if (mounted && data && data.length > 0) {
          setReports(data);
''', '''
        const data = await fetchQcReportsFromSupabase();
        if (mounted && data) {
          setReports(data);
''')

with open('src/components/LaporanQcView.tsx', 'w') as f:
    f.write(content)

