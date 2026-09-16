const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Add state
content = content.replace(/const \[scanMode, setScanMode\] = useState<'kamera' \| 'fisik' \| 'manual'>\('kamera'\);/, `const [scanMode, setScanMode] = useState<'kamera' | 'fisik' | 'manual'>('kamera');
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);`);

// Add toggle button to ScanMethodSelector area
content = content.replace(/<ScanMethodSelector currentMode={scanMode} onSelectMode={setScanMode} \/>/, `<div className="flex items-center justify-between gap-2">
                          <ScanMethodSelector currentMode={scanMode} onSelectMode={setScanMode} />
                          <button
                            type="button"
                            onClick={() => setIsToolbarVisible(!isToolbarVisible)}
                            className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 whitespace-nowrap"
                            title={isToolbarVisible ? "Sembunyikan Pengaturan Tag" : "Tampilkan Pengaturan Tag"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
                            <span className="hidden sm:inline">{isToolbarVisible ? "Sembunyikan Tag" : "Tampilkan Tag"}</span>
                          </button>
                        </div>`);

// Update QuickTagToolbar prop
content = content.replace(/<QuickTagToolbar/, `<QuickTagToolbar
                          isVisible={isToolbarVisible}`);

fs.writeFileSync('src/App.tsx', content);
