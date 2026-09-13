const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  "<RoadmapView />",
  "<RoadmapView session={session} onShowToast={showToast} />"
);

fs.writeFileSync('src/App.tsx', code);
console.log('Fixed RoadmapView');
