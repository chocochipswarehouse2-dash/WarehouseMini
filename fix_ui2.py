import re

with open('src/components/PenerimaanProduksiView.tsx', 'r') as f:
    content = f.read()

# Replace the bulky header with a more compact tab + action bar
pattern = r'\{/\* 1\. Header Page \*/\}.*?\{/\* 2\. Top-Level Tab Switcher \*/\}\s*<div className="[^"]*">\s*<div className="[^"]*">'

replacement = """{/* 1. Header Page */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl sm:bg-transparent sm:dark:bg-transparent sm:p-0 sm:gap-3 w-full sm:w-auto">"""

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

# Then find where the tabs div closes and the quick actions were.
# Actually, the quick actions were above the tabs, so I need to extract them first.

