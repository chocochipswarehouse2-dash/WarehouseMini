const fs = require('fs');

let settings = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');

const sqlButton = `
        {/* Supabase QC SQL Tab Link (Admin only) */}
        {userIsSuperadmin && (
           <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
             <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Manajemen Database QC</h3>
             <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-indigo-800 dark:text-indigo-400 text-sm">Supabase QC Script & Tabel</div>
                  <div className="text-xs text-slate-500 mt-0.5">Kelola dan eksekusi query raw SQL khusus Quality Control</div>
                </div>
                <button
                  type="button"
                  onClick={() => alert("Silakan buka halaman Quality Control lalu tekan tombol Sync atau tambahkan di menu Admin terpisah.")}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Buka Modul
                </button>
             </div>
           </div>
        )}
`;

// Insert the SQL button inside the Settings tab content, specifically under system config.
// The easiest is just removing it from QC, as it is mainly a developer/setup tool anyway.

// Wait, the user specifically mentioned:
// "Ini juga saya rasa ga perlu tampil dipage utama, kalau mau taruh di pengaturan sistem saja mungkin. Jadi hanya admin yg liat dan seting"
// Since LaporanQcView.tsx had the banner and I just deleted it via sed.
// I will just add the Sync and SQL buttons to a new section in SettingsModal.

const target = `{/* Tab: SYSTEM */}`;
const replaceWith = `{/* Tab: SYSTEM */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/60 dark:border-emerald-900/30 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
                 <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-200">Supabase Cloud Sync QC</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Laporan inspeksi QC otomatis tersinkronisasi realtime.</p>
                    </div>
                 </div>
                 <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => window.dispatchEvent(new CustomEvent('force-qc-sync'))} className="flex-1 sm:flex-none px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors">Sinkronisasi Paksa</button>
                    {userIsSuperadmin && (
                      <button onClick={() => window.dispatchEvent(new CustomEvent('open-qc-sql'))} className="flex-1 sm:flex-none px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors">Script SQL QC</button>
                    )}
                 </div>
              </div>
`;

settings = settings.replace(target, replaceWith);
fs.writeFileSync('src/components/SettingsModal.tsx', settings, 'utf8');

console.log("Settings modified");

// Now we need to make sure the CustomEvents are listened to in QC View.
