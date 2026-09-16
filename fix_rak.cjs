const fs = require('fs');
let content = fs.readFileSync('src/components/PickingTasksView.tsx', 'utf8');
content = content.replace(/Rak SJ:/g, '');
fs.writeFileSync('src/components/PickingTasksView.tsx', content, 'utf8');
