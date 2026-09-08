const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');

// 1. Add state
const statePattern = `const [databaseStatusMsg, setDatabaseStatusMsg] = useState<string>('');`;
const newState = `const [databaseStatusMsg, setDatabaseStatusMsg] = useState<string>('');
  const [gdriveFolderUrl, setGdriveFolderUrl] = useState<string>('');`;
code = code.replace(statePattern, newState);

// 2. Set initial value
const initPattern = `setSupabaseUrl(storedSupabase.url);
      setSupabaseKey(storedSupabase.key);`;
const newInit = `setSupabaseUrl(storedSupabase.url);
      setSupabaseKey(storedSupabase.key);
      setGdriveFolderUrl(localStorage.getItem('wms_gdrive_folder_url') || 'https://drive.google.com/drive/folders/14TtBGzNIAVOxjBsxYGBt4G8fKj4nUYrB');`;
code = code.replace(initPattern, newInit);

// 3. Update handleSaveDatabase
const savePattern = `  const handleSaveDatabase = () => {
    const cleanUrl = supabaseUrl.trim();
    const cleanKey = supabaseKey.trim();

    if (!cleanUrl || !cleanKey) {
      onNotify('URL dan Anon Key Supabase tidak boleh kosong!', 'warning');
      return;
    }

    saveSupabaseConfig(cleanUrl, cleanKey);
    onNotify('Konfigurasi Supabase berhasil disimpan!', 'success');
    playSuccessBeep();
  };`;
const newSave = `  const handleSaveDatabase = () => {
    const cleanUrl = supabaseUrl.trim();
    const cleanKey = supabaseKey.trim();
    const cleanGdrive = gdriveFolderUrl.trim();

    if (!cleanUrl || !cleanKey) {
      onNotify('URL dan Anon Key Supabase tidak boleh kosong!', 'warning');
      return;
    }

    saveSupabaseConfig(cleanUrl, cleanKey);
    localStorage.setItem('wms_gdrive_folder_url', cleanGdrive);
    onNotify('Konfigurasi Supabase & GDrive berhasil disimpan!', 'success');
    playSuccessBeep();
  };`;
code = code.replace(savePattern, newSave);

// 4. Add UI for GDrive URL
const uiPattern = `                  <textarea
                    rows={3}
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                  />
                </div>`;
const newUi = `                  <textarea
                    rows={3}
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                  />
                </div>
                
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-[#ff7a00]"><path d="M7.71,9.79l-4,6.93h12.56l4-6.93H7.71z M10.49,11.39h6.98l-2.26,3.93h-6.98L10.49,11.39z M13.71,8.39l-4,6.93L5.71,15.3l4-6.93H13.71z M16.49,10l-2.26,3.93l-4-6.93l2.26-3.93L16.49,10z"/></svg>
                      Google Drive Folder URL (Foto Reject)
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                    Penyimpanan alternatif untuk mengakali Egress Supabase. Membutuhkan skrip Google Apps Script (GAS) untuk menjembatani upload. <br/>
                    <i>Untuk saat ini hanya menyimpan konfigurasi tujuan di sistem.</i>
                  </p>
                  <input
                    type="text"
                    value={gdriveFolderUrl}
                    onChange={(e) => setGdriveFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                  />
                </div>`;
code = code.replace(uiPattern, newUi);

fs.writeFileSync('src/components/SettingsModal.tsx', code);
console.log('Update success');
