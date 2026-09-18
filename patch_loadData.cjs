const fs = require('fs');
const content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

let newContent = content.replace(
  /const \[agendaData, projectData\] = await Promise\.all\(\[\s*getAgendaEvents\(\),\s*getProjects\(\)\s*\]\);/,
  `const [agendaData, projectData, noteData] = await Promise.all([
        getAgendaEvents(),
        getProjects(),
        getNotes()
      ]);`
);

newContent = newContent.replace(
  /setProjects\(projectData\);/,
  `setProjects(projectData);\n      setNotes(noteData);`
);

newContent = newContent.replace(
  /const handleProjectUpdate = \(\) => loadData\(\);/,
  `const handleProjectUpdate = () => loadData();\n    const handleNoteUpdate = () => loadData();`
);

newContent = newContent.replace(
  /window\.addEventListener\('wms_projects_updated', handleProjectUpdate\);/,
  `window.addEventListener('wms_projects_updated', handleProjectUpdate);\n    window.addEventListener('wms_notes_updated', handleNoteUpdate);`
);

newContent = newContent.replace(
  /window\.removeEventListener\('wms_projects_updated', handleProjectUpdate\);/,
  `window.removeEventListener('wms_projects_updated', handleProjectUpdate);\n      window.removeEventListener('wms_notes_updated', handleNoteUpdate);`
);

fs.writeFileSync('src/components/AgendaView.tsx', newContent);
