const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const noteModalCode = `
      {/* Note Modal */}
      {isNoteModalOpen && editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-bold text-gray-800">
                {editingNote.id ? 'Edit Catatan' : 'Buat Catatan Baru'}
              </h2>
              <button onClick={() => setNoteModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <form onSubmit={handleSaveNote} className="p-4 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul (Opsional)</label>
                <input
                  type="text"
                  value={editingNote.title}
                  onChange={e => setEditingNote({...editingNote, title: e.target.value})}
                  className="w-full border rounded-xl px-3 py-2"
                  placeholder="Judul catatan..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Isi Catatan <span className="text-red-500">*</span></label>
                <textarea
                  required
                  value={editingNote.content}
                  onChange={e => setEditingNote({...editingNote, content: e.target.value})}
                  className="w-full border rounded-xl px-3 py-2 h-32 resize-none"
                  placeholder="Tulis sesuatu..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Warna Sticky Note</label>
                <div className="flex gap-3">
                  {(['yellow', 'blue', 'green', 'pink', 'purple', 'orange'] as const).map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setEditingNote({...editingNote, color})}
                      className={\`w-8 h-8 rounded-full border-2 transition-transform \${
                        editingNote.color === color ? 'scale-110 border-gray-800' : 'border-transparent hover:scale-105'
                      } \${
                        color === 'yellow' ? 'bg-yellow-200' :
                        color === 'blue' ? 'bg-blue-200' :
                        color === 'green' ? 'bg-green-200' :
                        color === 'pink' ? 'bg-pink-200' :
                        color === 'purple' ? 'bg-purple-200' :
                        'bg-orange-200'
                      }\`}
                    />
                  ))}
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setNoteModalOpen(false)}
                  className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="px-4 py-2 text-white bg-primary hover:bg-primary/90 rounded-xl flex items-center"
                >
                  {isSyncing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
`;

content = content.replace(
  /\{isProjectModalOpen && editingProject && \(/,
  noteModalCode + '\n      {isProjectModalOpen && editingProject && ('
);

fs.writeFileSync('src/components/AgendaView.tsx', content);
