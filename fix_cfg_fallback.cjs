const fs = require('fs');
let code = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const fallback = "categoryConfig[evt.category] || Object.values(categoryConfig)[0] || { label: evt.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700', border: 'border-slate-300', cardBg: 'bg-white', dot: 'bg-slate-500' }";

code = code.replace(/const cfg = categoryConfig\[evt\.category\];/g, `const cfg = ${fallback};`);
code = code.replace(/categoryConfig\[detailEvent.category\]/g, `(categoryConfig[detailEvent.category] || Object.values(categoryConfig)[0] || { label: detailEvent.category, badgeBg: 'bg-slate-100', badgeText: 'text-slate-700' })`);

fs.writeFileSync('src/components/AgendaView.tsx', code);
