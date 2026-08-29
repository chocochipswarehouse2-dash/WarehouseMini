import re

with open('src/components/LiveInventoryDrawer.tsx', 'r') as f:
    content = f.read()

load_more_logs = """
                  {filteredLogs.length > logDisplayLimit && (
                    <button
                      onClick={() => setLogDisplayLimit(prev => prev + 100)}
                      className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Tampilkan lebih banyak ({filteredLogs.length - logDisplayLimit} tersisa)
                    </button>
                  )}"""

load_more_so = """
                  {filteredSoQueue.length > soDisplayLimit && (
                    <button
                      onClick={() => setSoDisplayLimit(prev => prev + 100)}
                      className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Tampilkan lebih banyak ({filteredSoQueue.length - soDisplayLimit} tersisa)
                    </button>
                  )}"""

load_more_stock = """
                  {filteredStockList.length > stockDisplayLimit && (
                    <button
                      onClick={() => setStockDisplayLimit(prev => prev + 100)}
                      className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Tampilkan lebih banyak ({filteredStockList.length - stockDisplayLimit} tersisa)
                    </button>
                  )}"""


# Replace before 'TAB 2: STOCK OPNAME'
log_idx = content.find('{/* TAB 2: STOCK OPNAME (SO)')
if log_idx != -1:
    before_tab2 = content[:log_idx]
    # find the last '</div>' block before tab2
    last_div = before_tab2.rfind('</div>')
    last_div = before_tab2.rfind('</div>', 0, last_div)
    last_div = before_tab2.rfind('</div>', 0, last_div)
    # Actually just insert it before the closing '</div>\n              )\n            }'
    
    # Let's use simpler replacement by finding where the map function closes:
