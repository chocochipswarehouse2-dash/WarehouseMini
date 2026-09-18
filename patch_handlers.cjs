const fs = require('fs');
const content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

let newContent = content.replace(
  /const handleOpenAddProject = \(existing\?: ProjectItem\) => \{/,
  `const handleOpenAddNote = (existing?: NoteItem) => {
    if (existing) {
      setEditingNote({ ...existing });
    } else {
      setEditingNote({
        title: '',
        content: '',
        color: 'yellow',
        created_by: session?.name || session?.username || 'Warehouse'
      });
    }
    setNoteModalOpen(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote?.content?.trim()) {
      onShowToast?.('Isi catatan wajib diisi', 'error');
      return;
    }
    setIsSyncing(true);
    try {
      await saveNote(editingNote);
      onShowToast?.('Catatan berhasil disimpan!', 'success');
      setNoteModalOpen(false);
      loadData();
    } catch (err) {
      onShowToast?.('Gagal menyimpan catatan', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus catatan ini?')) return;
    try {
      await deleteNote(id);
      onShowToast?.('Catatan berhasil dihapus', 'info');
      loadData();
    } catch (err) {
      onShowToast?.('Gagal menghapus catatan', 'error');
    }
  };

  const handleOpenAddProject = (existing?: ProjectItem) => {`
);

fs.writeFileSync('src/components/AgendaView.tsx', newContent);
