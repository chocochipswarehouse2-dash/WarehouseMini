import re

with open('src/components/PenerimaanProduksiView.tsx', 'r') as f:
    content = f.read()

# 1. Remove the Header Title section (lines 1000 to 1017 roughly)
# I will match: <div className="flex items-center gap-2.5 sm:gap-3.5"> ... </div>
pattern_header = r'<div className="flex items-center gap-2\.5 sm:gap-3\.5">.*?<div className="flex items-center gap-2 self-end sm:self-center">'
replacement_header = r'<div className="flex items-center gap-2 self-end sm:self-center">'
content = re.sub(pattern_header, replacement_header, content, flags=re.DOTALL)

# 2. Remove the KPI Cards
# I will match: {/* 4 KPI Summary Cards - Compact on mobile */} ... </div> (the wrapper of the 4 cards)
pattern_kpi = r'\{/\* 4 KPI Summary Cards - Compact on mobile \*/\}.*?</div>\s*\{/\* Filter Toolbar'
replacement_kpi = r'{/* Filter Toolbar'
content = re.sub(pattern_kpi, replacement_kpi, content, flags=re.DOTALL)

with open('src/components/PenerimaanProduksiView.tsx', 'w') as f:
    f.write(content)

