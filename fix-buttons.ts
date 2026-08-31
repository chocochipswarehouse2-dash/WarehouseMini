import { readFileSync, writeFileSync } from 'fs';
let content = readFileSync('src/components/PickingTasksView.tsx', 'utf-8');

content = content.replace(
  "onClick={() => handleOpenEditSJModal(group)}",
  "onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenEditSJModal(group); }}"
);

content = content.replace(
  "onClick={() => handleDeleteSingleSJ(group.no_sj)}",
  "onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSingleSJ(group.no_sj); }}"
);

writeFileSync('src/components/PickingTasksView.tsx', content);
console.log("Fixed button propagation");
