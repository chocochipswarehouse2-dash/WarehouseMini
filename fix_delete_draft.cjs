const fs = require('fs');
let code = fs.readFileSync('src/components/PesananSaya/DistribusiStoreTab.tsx', 'utf-8');

// The activeDraft might need to be cleared if it is the one being deleted.
const oldDeleteDraft = `if (window.confirm(\`Hapus draft SJ "\${draft.no_sj}" dari antrean?\`)) {
                                  deleteSJDraft(draft.id);
                                  setDrafts(prev => prev.filter(d => d.id !== draft.id));
                                  onShowToast(\`Draft SJ "\${draft.no_sj}" dihapus.\`, 'info');
                                }`;
const newDeleteDraft = `if (window.confirm(\`Hapus draft SJ "\${draft.no_sj}" dari antrean?\`)) {
                                  deleteSJDraft(draft.id);
                                  setDrafts(prev => prev.filter(d => d.id !== draft.id));
                                  if (activeDraftId === draft.id) {
                                    setActiveDraftId(null);
                                  }
                                  onShowToast(\`Draft SJ "\${draft.no_sj}" dihapus.\`, 'info');
                                }`;

code = code.replace(oldDeleteDraft, newDeleteDraft);
fs.writeFileSync('src/components/PesananSaya/DistribusiStoreTab.tsx', code);
console.log('Fixed active draft clear on delete');
