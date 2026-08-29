with open('src/components/LiveInventoryDrawer.tsx', 'r') as f:
    content = f.read()

# Fix Logs
logs_bad = """                </div>
                {filteredLogs.length > logDisplayLimit && (
                  <button
                    onClick={() => setLogDisplayLimit(prev => prev + 100)}
                    className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Tampilkan lebih banyak ({filteredLogs.length - logDisplayLimit} tersisa)
                  </button>
                )}
              )}"""
logs_good = """                  {filteredLogs.length > logDisplayLimit && (
                    <button
                      onClick={() => setLogDisplayLimit(prev => prev + 100)}
                      className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Tampilkan lebih banyak ({filteredLogs.length - logDisplayLimit} tersisa)
                    </button>
                  )}
                </div>
              )}"""
content = content.replace(logs_bad, logs_good)

# Fix SO
so_bad = """                </div>
                {filteredSoQueue.length > soDisplayLimit && (
                  <button
                    onClick={() => setSoDisplayLimit(prev => prev + 100)}
                    className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Tampilkan lebih banyak ({filteredSoQueue.length - soDisplayLimit} tersisa)
                  </button>
                )}
              )}"""
so_good = """                  {filteredSoQueue.length > soDisplayLimit && (
                    <button
                      onClick={() => setSoDisplayLimit(prev => prev + 100)}
                      className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Tampilkan lebih banyak ({filteredSoQueue.length - soDisplayLimit} tersisa)
                    </button>
                  )}
                </div>
              )}"""
content = content.replace(so_bad, so_good)

# Fix Stock
stock_bad = """                </div>
                {filteredStockList.length > stockDisplayLimit && (
                  <button
                    onClick={() => setStockDisplayLimit(prev => prev + 100)}
                    className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Tampilkan lebih banyak ({filteredStockList.length - stockDisplayLimit} tersisa)
                  </button>
                )}
              )}"""
stock_good = """                  {filteredStockList.length > stockDisplayLimit && (
                    <button
                      onClick={() => setStockDisplayLimit(prev => prev + 100)}
                      className="w-full py-3 mt-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Tampilkan lebih banyak ({filteredStockList.length - stockDisplayLimit} tersisa)
                    </button>
                  )}
                </div>
              )}"""
content = content.replace(stock_bad, stock_good)

with open('src/components/LiveInventoryDrawer.tsx', 'w') as f:
    f.write(content)

