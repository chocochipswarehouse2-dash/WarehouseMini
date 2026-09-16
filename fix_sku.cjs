const fs = require('fs');
let content = fs.readFileSync('src/components/PickingTasksView.tsx', 'utf8');

const skuSpan = `<span className="text-xs sm:text-sm font-mono font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
                      {item.sku}
                    </span>`;

content = content.replace(skuSpan, '');

const nameBlock = `{/* BIG NAMA PRODUK */}
                  <h3 className="text-base sm:text-lg md:text-xl font-black text-slate-900 dark:text-white leading-tight">
                    {displayName}
                  </h3>`;

const newNameBlock = `{/* BIG NAMA PRODUK */}
                  <h3 className="text-base sm:text-lg md:text-xl font-black text-slate-900 dark:text-white leading-tight">
                    {displayName}
                  </h3>
                  <div className="mt-1">
                    <span className="text-xs sm:text-sm font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      SKU: <span className="text-slate-700 dark:text-slate-300">{item.sku}</span>
                    </span>
                  </div>`;

content = content.replace(nameBlock, newNameBlock);
fs.writeFileSync('src/components/PickingTasksView.tsx', content, 'utf8');
