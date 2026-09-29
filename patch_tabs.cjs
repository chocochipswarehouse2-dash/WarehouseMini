const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

// The Title
content = content.replace(
  /if \(activeTab === 'project'\) return 'Manajemen Project \& Inisiatif';/,
  `if (activeTab === 'project') return 'Manajemen Project & Inisiatif';\n    if (activeTab === 'notes') return 'Catatan & Sticky Notes';`
);

content = content.replace(
  /\{activeTab === 'calendar' \? <Calendar className="w-6 h-6" \/> : <Briefcase className="w-6 h-6" \/>\}/,
  `{activeTab === 'calendar' ? <Calendar className="w-6 h-6" /> : activeTab === 'project' ? <Briefcase className="w-6 h-6" /> : <StickyNote className="w-6 h-6" />}`
);

content = content.replace(
  /<button\s*onClick=\{\(\) => setActiveTab\('project'\)\}\s*className=\{`flex-1 sm:flex-none flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors\s*\$\{activeTab === 'project'\s*\? 'text-primary border-b-2 border-primary'\s*: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'\s*\}`\}\s*>\s*<Briefcase className="w-4 h-4 mr-2" \/>\s*Projects\s*<\/button>/,
  `<button
            onClick={() => setActiveTab('project')}
            className={\`flex-1 sm:flex-none flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors
              \${
              activeTab === 'project'
                ? 'text-primary border-b-2 border-primary'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }\`}
          >
            <Briefcase className="w-4 h-4 mr-2" />
            Projects
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={\`flex-1 sm:flex-none flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors
              \${
              activeTab === 'notes'
                ? 'text-primary border-b-2 border-primary'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }\`}
          >
            <StickyNote className="w-4 h-4 mr-2" />
            Catatan
          </button>`
);

content = content.replace(
  /if \(activeTab === 'calendar'\) handleOpenAddEvent\(\);/,
  `if (activeTab === 'calendar') handleOpenAddEvent();\n            if (activeTab === 'notes') handleOpenAddNote();`
);

fs.writeFileSync('src/components/AgendaView.tsx', content);
