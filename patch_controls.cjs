const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const regexControls = /\{\/\* Controls Bar for Projects \*\/\}[\s\S]*?<div className="bg-white dark:bg-\[\#1a2332\] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">[\s\S]*?\{\/\* Status Filter Chips \(Scrollable on mobile\) \*\/\}[\s\S]*?\{\/\* Actions: Search & Add \*\/\}[\s\S]*?<\/button>\s*<\/div>\s*<\/div>/;

const replacementControls = `{/* Controls Bar for Projects */}
          <div className="bg-white dark:bg-[#1a2332] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between items-stretch gap-3">
            <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={projectStatusFilter}
                  onChange={(e) => setProjectStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary-500 outline-none bg-slate-50 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 min-w-[130px]"
                >
                  <option value="all">Semua Status</option>
                  <option value="planned">Mulai (Planned)</option>
                  <option value="in_progress">Berjalan (In Progress)</option>
                  <option value="review">Evaluasi (Review)</option>
                  <option value="completed">Selesai (Completed)</option>
                  <option value="on_hold">Ditunda (On Hold)</option>
                </select>
                <select
                  value={projectPriorityFilter}
                  onChange={(e) => setProjectPriorityFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary-500 outline-none bg-slate-50 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 min-w-[130px]"
                >
                  <option value="all">Semua Urgensi</option>
                  <option value="low">Rendah (Low)</option>
                  <option value="medium">Sedang (Medium)</option>
                  <option value="high">Tinggi (High)</option>
                  <option value="urgent">Mendesak (Urgent)</option>
                </select>
                <select
                  value={creatorFilter}
                  onChange={(e) => setCreatorFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary-500 outline-none bg-slate-50 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 min-w-[130px]"
                >
                  <option value="all">Semua Pembuat</option>
                  {[...new Set(projects.map(p => p.created_by).filter(Boolean))].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              
              {/* Actions: Search & Add */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari project / PIC..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <button
                  onClick={() => handleOpenAddProject()}
                  className="bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md shadow-primary-500/20 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Project</span>
                </button>
              </div>
            </div>
          </div>`;

content = content.replace(regexControls, replacementControls);

fs.writeFileSync('src/components/AgendaView.tsx', content);
