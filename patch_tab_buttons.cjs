const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const regex = /<button\s+onClick=\{\(\) => setActiveTab\('project'\)\}[\s\S]*?<\/button>/;

const newButton = `<button
            onClick={() => setActiveTab('project')}
            className={\`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all \${
              activeTab === 'project'
                ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }\`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Project & Task</span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full font-bold">
              {filteredProjects.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={\`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all \${
              activeTab === 'notes'
                ? 'bg-white dark:bg-[#101726] text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }\`}
          >
            <StickyNote className="w-4 h-4" />
            <span>Catatan</span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full font-bold">
              {filteredNotes.length}
            </span>
          </button>`;

content = content.replace(regex, newButton);

fs.writeFileSync('src/components/AgendaView.tsx', content);
