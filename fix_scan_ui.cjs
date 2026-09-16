const fs = require('fs');

// 1. Fix ScanMethodSelector
let scanSel = fs.readFileSync('src/components/ScanMethodSelector.tsx', 'utf8');
// Remove background and padding from wrapper
scanSel = scanSel.replace(
  /className="bg-white dark:bg-\[#0F0F12\] rounded-t-2xl px-3 py-2 border-b border-slate-200 dark:border-slate-800 transition-colors"/,
  'className="w-full"'
);
// Change texts
scanSel = scanSel.replace(/>Ketik \/ Gun<\/span>/, '>Ketik / Scanner</span>');
fs.writeFileSync('src/components/ScanMethodSelector.tsx', scanSel, 'utf8');

// 2. Fix App.tsx wrapper
let appContent = fs.readFileSync('src/App.tsx', 'utf8');
const oldWrapper = `<div className="flex items-center justify-between gap-2">
                          <ScanMethodSelector currentMode={scanMode} onSelectMode={setScanMode} />
                          <button
                            type="button"
                            onClick={() => ((_val: boolean) => {})(!true)}
                            className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 whitespace-nowrap"
                            title={true ? "Sembunyikan Pengaturan Tag" : "Tampilkan Pengaturan Tag"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
                            <span className="hidden sm:inline">{true ? "Sembunyikan Tag" : "Tampilkan Tag"}</span>
                          </button>
                        </div>`;
                        
const newWrapper = `<div className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-[#0F0F12] border-b border-slate-200 dark:border-slate-800">
                          <div className="flex-1 min-w-0">
                            <ScanMethodSelector currentMode={scanMode} onSelectMode={setScanMode} />
                          </div>
                          <button
                            type="button"
                            onClick={() => ((_val: boolean) => {})(!true)}
                            className="p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 whitespace-nowrap shadow-sm"
                            title={true ? "Sembunyikan Pengaturan Tag" : "Tampilkan Pengaturan Tag"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
                            <span className="hidden sm:inline">{true ? "Sembunyikan Tag" : "Tampilkan Tag"}</span>
                          </button>
                        </div>`;

if (appContent.includes(oldWrapper)) {
  appContent = appContent.replace(oldWrapper, newWrapper);
} else {
  console.log("Could not find wrapper in App.tsx");
}

fs.writeFileSync('src/App.tsx', appContent, 'utf8');

