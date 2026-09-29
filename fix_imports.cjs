const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

content = content.replace(
  /getProjects,\s*saveProject,\s*deleteProject\s*\}/,
  'getProjects, saveProject, deleteProject, getNotes, saveNote, deleteNote }'
);

content = content.replace(
  /ProjectPriority,\s*AgendaAttachment,\s*ProjectTask\s*\}/,
  'ProjectPriority, AgendaAttachment, ProjectTask, NoteItem, NoteColor }'
);

fs.writeFileSync('src/components/AgendaView.tsx', content);
