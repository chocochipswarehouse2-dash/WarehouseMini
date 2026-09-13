const fs = require('fs');
let code = fs.readFileSync('src/services/gasTarikanMD.ts', 'utf-8');

// The issue might be that it wasn't passing draft.id vs draft.no_sj properly, but `deleteSJDraft` handles both:
// filter(d => d.no_sj !== no_sj && d.id !== no_sj);
// But wait, the function takes `no_sj`, let's rename param to idOrNoSj
const oldFunc = `export function deleteSJDraft(no_sj: string): void {
  const drafts = loadSJDrafts().filter(d => d.no_sj !== no_sj && d.id !== no_sj);
  localStorage.setItem(CACHE_KEY_DRAFTS, JSON.stringify(drafts));
}`;
const newFunc = `export function deleteSJDraft(idOrNoSj: string): void {
  const drafts = loadSJDrafts().filter(d => d.no_sj !== idOrNoSj && d.id !== idOrNoSj);
  localStorage.setItem(CACHE_KEY_DRAFTS, JSON.stringify(drafts));
}`;

code = code.replace(oldFunc, newFunc);
fs.writeFileSync('src/services/gasTarikanMD.ts', code);
console.log('Fixed gasTarikanMD draft delete param');
