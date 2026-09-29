const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const replacement = `  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (projectStatusFilter !== 'all' && p.status !== projectStatusFilter) return false;
      if (projectPriorityFilter !== 'all' && p.priority !== projectPriorityFilter) return false;
      if (creatorFilter !== 'all' && p.created_by !== creatorFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        const matchPic = p.pic?.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchPic) return false;
      }
      return true;
    });
  }, [projects, projectStatusFilter, projectPriorityFilter, creatorFilter, searchQuery]);

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (creatorFilter !== 'all' && n.created_by !== creatorFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (n.title || '').toLowerCase().includes(q);
        const matchContent = (n.content || '').toLowerCase().includes(q);
        if (!matchTitle && !matchContent) return false;
      }
      return true;
    });
  }, [notes, creatorFilter, searchQuery]);`;

const regex = /const filteredProjects = useMemo\(\(\) => \{[\s\S]*?\}, \[projects, projectStatusFilter, searchQuery\]\);/;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/AgendaView.tsx', content);
