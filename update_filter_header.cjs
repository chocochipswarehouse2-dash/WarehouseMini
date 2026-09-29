const fs = require('fs');
let code = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const target = `<button 
                  onClick={() => setSelectedCategories(Object.keys(categoryConfig).reduce((acc, k) => ({...acc, [k]: true}), {}))}
                  className="text-[10px] text-primary-500 font-bold hover:underline"
                >
                  Reset
                </button>`;

const replacement = `<div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="text-[10px] text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                  <button 
                    onClick={() => setSelectedCategories(Object.keys(categoryConfig).reduce((acc, k) => ({...acc, [k]: true}), {}))}
                    className="text-[10px] text-primary-500 font-bold hover:underline"
                  >
                    Reset
                  </button>
                </div>`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/AgendaView.tsx', code);
