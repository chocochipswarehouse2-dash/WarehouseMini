const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const regex = /if \(activeTab === 'calendar'\) handleOpenAddEvent\(\);\s*if \(activeTab === 'notes'\) handleOpenAddNote\(\);\s*else handleOpenAddProject\(\);/;

const replacement = `if (activeTab === 'calendar') handleOpenAddEvent();
            else if (activeTab === 'notes') handleOpenAddNote();
            else handleOpenAddProject();`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/AgendaView.tsx', content);
