with open('src/components/hr/LemburCutiView.tsx') as f:
    text = f.read()

# 1. Imports
# Add Trash2 to imports
old_imp = "  FileText,\n} from 'lucide-react';"
new_imp = "  FileText,\n  Trash2,\n} from 'lucide-react';"
if old_imp in text:
    text = text.replace(old_imp, new_imp)
    print("Added Trash2 to imports")
else:
    print("Could not find old_imp")

# Add deleteLemburRecord and deleteCutiRecord to supabase imports
old_sb = "  fetchCutiRecords,\n  submitCutiRecord,\n} from '../../services/supabase';"
new_sb = "  fetchCutiRecords,\n  submitCutiRecord,\n  deleteLemburRecord,\n  deleteCutiRecord,\n} from '../../services/supabase';"
if old_sb in text:
    text = text.replace(old_sb, new_sb)
    print("Added delete functions to supabase imports")
else:
    print("Could not find old_sb")

# 2. Add handlers for delete
old_handler = "  // Submit Lembur\n  const handleSubmitLembur = async (e: React.FormEvent) => {"
new_handler = """  // Handle Batal/Hapus Lembur Mandiri
  const handleDeleteMyLembur = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan dan menghapus pengajuan lembur ini?')) return;
    try {
      await deleteLemburRecord(id);
      setLemburList((prev) => prev.filter((l) => l.id !== id));
      playSuccessBeep();
      onShowToast('Pengajuan lembur berhasil dibatalkan & dihapus.', 'info');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal membatalkan pengajuan: ' + (err?.message || 'Error'), 'error');
    }
  };

  // Handle Batal/Hapus Cuti Mandiri
  const handleDeleteMyCuti = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan dan menghapus permohonan cuti ini?')) return;
    try {
      await deleteCutiRecord(id);
      setCutiList((prev) => prev.filter((c) => c.id !== id));
      playSuccessBeep();
      onShowToast('Permohonan cuti berhasil dibatalkan & dihapus.', 'info');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal membatalkan cuti: ' + (err?.message || 'Error'), 'error');
    }
  };

  // Submit Lembur
  const handleSubmitLembur = async (e: React.FormEvent) => {"

if old_handler in text:
    text = text.replace(old_handler, new_handler)
    print("Added delete handlers in LemburCutiView")
else:
    print("Could not find old_handler")

# 3. Add Delete button in myLembur render
old_lembur_badge = """                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full text-xs font-extrabold">
                          <Clock className="w-3.5 h-3.5" /> Diajukan
                        </span>
                      )}
                    </div>"""

new_lembur_badge = """                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full text-xs font-extrabold">
                            <Clock className="w-3.5 h-3.5" /> Diajukan
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMyLembur(l.id)}
                            title="Batalkan & Hapus Pengajuan"
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>"""

if old_lembur_badge in text:
    text = text.replace(old_lembur_badge, new_lembur_badge)
    print("Added delete button to myLembur JSX")
else:
    print("Could not find old_lembur_badge")

# 4. Add Delete button in myCuti render
# Note: we want the user to be able to delete if status === 'Diajukan'
# Let's inspect the cuti badge block:
old_cuti_badge = """                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full text-xs font-extrabold">
                          <Clock className="w-3.5 h-3.5" /> Menunggu Review
                        </span>
                      )}
                    </div>"""

new_cuti_badge = """                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full text-xs font-extrabold">
                            <Clock className="w-3.5 h-3.5" /> Menunggu Review
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMyCuti(c.id)}
                            title="Batalkan & Hapus Permohonan"
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>"""

if old_cuti_badge in text:
    text = text.replace(old_cuti_badge, new_cuti_badge)
    print("Added delete button to myCuti JSX")
else:
    print("Could not find old_cuti_badge")

with open('src/components/hr/LemburCutiView.tsx', 'w') as f:
    f.write(text)
print("Saved LemburCutiView.tsx")
