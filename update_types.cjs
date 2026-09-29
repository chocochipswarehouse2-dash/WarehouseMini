const fs = require('fs');
let types = fs.readFileSync('src/types.ts', 'utf8');

types = types.replace(
  "export type AgendaCategory = 'meeting' | 'operasional' | 'project' | 'supplier' | 'urgent' | 'umum';",
  "export type AgendaCategory = string;"
);

types = types.replace(
  "roles?: Record<string, any>;",
  "roles?: Record<string, any>;\n  agenda_categories?: Record<string, any>;"
);

fs.writeFileSync('src/types.ts', types);
