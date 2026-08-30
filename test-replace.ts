import * as fs from 'fs';
const content = fs.readFileSync('src/components/ScanMethodSelector.tsx', 'utf-8');
const newContent = content.replace(
  /<button\s+id="btnModeFisik"[\s\S]*?<ScanLine className="w-3\.5 h-3\.5" \/>\s*<span>Fisik Gun<\/span>\s*<\/button>\s*<button\s+id="btnModeManual"[\s\S]*?<Keyboard className="w-3\.5 h-3\.5" \/>\s*<span>Manual<\/span>\s*<\/button>/,
  `<button
            id="btnModeFisik"
            type="button"
            onClick={() => onSelectMode('fisik')}
            className={\`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 \${
              currentMode === 'fisik' || currentMode === 'manual'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700/80 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }\`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Ketik / Gun</span>
          </button>`
);
fs.writeFileSync('src/components/ScanMethodSelector.tsx', newContent);
