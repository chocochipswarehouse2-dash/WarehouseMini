import re

with open('src/components/PenerimaanProduksiView.tsx', 'r') as f:
    content = f.read()

# 1. Simplify the header
# Find the start of `{/* 1. Header Page */}` until `{/* 2. Top-Level Tab Switcher */}`
pattern_header = r'\{/\* 1\. Header Page \*/\}.*?\{/\* 2\. Top-Level Tab Switcher \*/\}'
replacement_header = """{/* 1. Header Page & Tabs Combined */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2 sm:p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Top-Level Tab Switcher */}"""

content = re.sub(pattern_header, replacement_header, content, flags=re.DOTALL)

# Then we need to fix the closing tags of the header. Let's see what follows `Top-Level Tab Switcher`
# It has:
#         <div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800">
#           <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl sm:flex sm:bg-transparent sm:dark:bg-transparent sm:p-0 sm:gap-3">
# Let's replace those two opening divs to avoid double padding/borders.

pattern_tabs_open = r'<div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800">\s*<div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl sm:flex sm:bg-transparent sm:dark:bg-transparent sm:p-0 sm:gap-3">'
replacement_tabs_open = r'<div className="flex-1 grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl sm:flex sm:bg-transparent sm:dark:bg-transparent sm:p-0 sm:gap-2">'
content = re.sub(pattern_tabs_open, replacement_tabs_open, content, flags=re.DOTALL)

# Wait, the closing tags. Let's search for `Input Batch</span>\n              <span`
# and its closing `</button>\n          </div>\n        </div>\n      </div>`
# I should remove one closing div because I removed the `<div className="mt-3...">` wrapper.
pattern_tabs_close = r'</button>\s*</div>\s*</div>\s*</div>'
# I need to insert the Quick Actions back in here, to be on the right side of the flex row!
# Let's restore the quick actions right after the tabs.
replacement_tabs_close = """</button>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-2 sm:mt-0">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg sm:rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>
          </div>
        </div>
      </div>"""

content = re.sub(pattern_tabs_close, replacement_tabs_close, content, flags=re.DOTALL)


# 2. Remove the 4 KPI Cards completely
# It starts at: {/* 4 KPI Summary Cards - Compact on mobile */}
# And ends before: {/* Filter Toolbar - Clean & space-efficient */}
pattern_kpis = r'\{/\* 4 KPI Summary Cards - Compact on mobile \*/\}.*?\{/\* Filter Toolbar - Clean & space-efficient \*/\}'
replacement_kpis = r'{/* Filter Toolbar - Clean & space-efficient */}'
content = re.sub(pattern_kpis, replacement_kpis, content, flags=re.DOTALL)


with open('src/components/PenerimaanProduksiView.tsx', 'w') as f:
    f.write(content)

