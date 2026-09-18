const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const renderNotesCode = `
      {activeTab === 'notes' && (
        <div className="p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <h2 className="text-xl font-bold text-gray-800">Catatan (Sticky Notes)</h2>
            <div className="flex flex-wrap gap-2">
              <select
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
                className="px-3 py-2 border rounded-xl text-sm bg-white"
              >
                <option value="all">Semua Pembuat</option>
                {[...new Set(notes.map(n => n.created_by).filter(Boolean))].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredNotes.length === 0 ? (
              <div className="col-span-full py-12 text-center text-gray-400 bg-white rounded-2xl border border-dashed">
                <StickyNote className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Belum ada catatan.</p>
                <button onClick={() => handleOpenAddNote()} className="mt-4 text-primary font-medium hover:underline">
                  Buat Catatan Baru
                </button>
              </div>
            ) : (
              filteredNotes.map(note => (
                <div 
                  key={note.id}
                  className={\`relative p-5 rounded-2xl shadow-sm border group hover:shadow-md transition-shadow cursor-pointer flex flex-col \${
                    note.color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                    note.color === 'blue' ? 'bg-blue-50 border-blue-200' :
                    note.color === 'green' ? 'bg-green-50 border-green-200' :
                    note.color === 'pink' ? 'bg-pink-50 border-pink-200' :
                    note.color === 'purple' ? 'bg-purple-50 border-purple-200' :
                    'bg-orange-50 border-orange-200'
                  }\`}
                  onClick={() => handleOpenAddNote(note)}
                >
                  {/* Sticky Note Pin/Clip Graphic (CSS representation) */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-4 rounded-full bg-black/10 shadow-sm border border-black/5" />
                  
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-gray-800 line-clamp-2 pr-6">{note.title}</h3>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                      className="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="text-gray-700 text-sm whitespace-pre-wrap flex-1 mb-4">
                    {note.content}
                  </div>
                  
                  <div className="mt-auto pt-3 border-t border-black/5 flex justify-between items-center text-xs text-gray-500">
                    <span className="flex items-center"><User className="w-3 h-3 mr-1" /> {note.created_by}</span>
                    <span>{note.created_at ? new Date(note.created_at).toLocaleDateString('id-ID') : ''}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
`;

content = content.replace(
  /\{\/\* --- MODALS ---\*\/\}/,
  renderNotesCode + '\n      {/* --- MODALS ---*/}'
);

fs.writeFileSync('src/components/AgendaView.tsx', content);
