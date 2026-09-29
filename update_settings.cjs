const fs = require('fs');
let settings = fs.readFileSync('src/services/settings.ts', 'utf8');

settings = settings.replace(
  "roles: gasConfig.roles || null,",
  "roles: gasConfig.roles || null,\n          agenda_categories: gasConfig.agenda_categories || null,"
);

settings = settings.replace(
  "roles: updated.roles || null,",
  "roles: updated.roles || null,\n      agenda_categories: updated.agenda_categories || null,"
);

fs.writeFileSync('src/services/settings.ts', settings);
