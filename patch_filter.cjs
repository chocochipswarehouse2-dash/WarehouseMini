const fs = require('fs');
const content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

let newContent = content.replace(
  /const filteredProjects = useMemo\(\(\) => \{\s*return projects\.filter\(p => \{\s*const matchSearch = p\.title\.toLowerCase\(\)\.includes\(searchQuery\.toLowerCase\(\)\) \|\|\s*p\.description\?\.toLowerCase\(\)\.includes\(searchQuery\.toLowerCase\(\)\);\s*const matchStatus = projectStatusFilter === 'all' \|\| p\.status === projectStatusFilter;\s*return matchSearch && matchStatus;\s*\}\);\s*\}, \[projects, projectStatusFilter, searchQuery\]\);/g,
  `const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = projectStatusFilter === 'all' || p.status === projectStatusFilter;
      const matchPriority = projectPriorityFilter === 'all' || p.priority === projectPriorityFilter;
      const matchCreator = creatorFilter === 'all' || p.created_by === creatorFilter;
      return matchSearch && matchStatus && matchPriority && matchCreator;
    });
  }, [projects, projectStatusFilter, projectPriorityFilter, creatorFilter, searchQuery]);

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      const matchSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          n.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCreator = creatorFilter === 'all' || n.created_by === creatorFilter;
      return matchSearch && matchCreator;
    });
  }, [notes, creatorFilter, searchQuery]);`
);

fs.writeFileSync('src/components/AgendaView.tsx', newContent);
