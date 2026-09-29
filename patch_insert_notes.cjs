const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const renderNotesCode = `
      {activeTab === 'notes' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1a2332] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <StickyNote className="w-6 h-6 text-primary-500" />
              Kumpulan Catatan
            </h2>
            <div className="flex flex-wrap gap-2">
              <select
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/50 outline-none min-w-[150px] bg-slate-50 dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 font-bold"
              >
                <option value="all">Semua Pembuat</option>
                {[...new Set(notes.map(n => n.created_by).filter(Boolean))].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
            {filteredNotes.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white dark:bg-[#1a2332] rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <StickyNote className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="font-bold text-lg mb-1">Belum ada catatan.</p>
                <p className="text-sm">Klik tombol + untuk menambah sticky note baru.</p>
              </div>
            ) : (
              filteredNotes.map(note => (
                <div 
                  key={note.id}
                  onClick={() => handleOpenAddNote(note)}
                  className={\`relative p-6 rounded-2xl shadow-sm border-2 group hover:-translate-y-1 hover:shadow-xl transition-all cursor-pointer flex flex-col min-h-[200px] \${
                    note.color === 'yellow' ? 'bg-[#fef9c3] border-[#fef08a] text-[#854d0e]' :
                    note.color === 'blue' ? 'bg-[#e0f2fe] border-[#bae6fd] text-[#075985]' :
                    note.color === 'green' ? 'bg-[#dcfce7] border-[#bbf7d0] text-[#166534]' :
                    note.color === 'pink' ? 'bg-[#fce7f3] border-[#fbcfe8] text-[#9d174d]' :
                    note.color === 'purple' ? 'bg-[#f3e8ff] border-[#e9d5ff] text-[#6b21a8]' :
                    'bg-[#ffedd5] border-[#fed7aa] text-[#9a3412]'
                  }\`}
                >
                  {/* Pin/Clip Graphic */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-3 rounded-full bg-black/10 shadow-inner border border-black/5" />
                  
                  <div className="flex justify-between items-start mb-3 gap-2">
                    <h3 className="font-black text-lg line-clamp-2 leading-tight">{note.title || 'Tanpa Judul'}</h3>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                      className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-black/10 text-black/40 hover:text-red-600 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="text-sm whitespace-pre-wrap flex-1 mb-6 opacity-90 font-medium">
                    {note.content}
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-black/10 flex justify-between items-center text-xs font-bold opacity-70">
                    <span className="flex items-center gap-1.5 bg-black/5 px-2 py-1 rounded-md">
                      <User className="w-3.5 h-3.5" /> {note.created_by}
                    </span>
                    <span>{note.created_at ? new Date(note.created_at).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}) : ''}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
`;

content = content.replace(
  /\{\/\* ===================================================================== \*\/\}\n\s*\{\/\* MODAL TAMBAH \/ EDIT AGENDA/,
  renderNotesCode + '\n\n      {/* ===================================================================== */}\n      {/* MODAL TAMBAH / EDIT AGENDA'
);

fs.writeFileSync('src/components/AgendaView.tsx', content);
