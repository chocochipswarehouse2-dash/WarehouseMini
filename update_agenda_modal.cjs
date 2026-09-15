const fs = require('fs');
let code = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

code = code.replace(
  "import { fetchWmsSettings, saveWmsSettings } from '../services/settings';",
  "import { fetchWmsSettings, saveWmsSettings } from '../services/settings';\nimport { AgendaCategoryModal } from './AgendaCategoryModal';"
);

// Inject modal at the end before </div>
const modalComponent = `
      {/* Category Editor Modal */}
      <AgendaCategoryModal 
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        currentConfig={categoryConfig}
        onNotify={onShowToast}
      />
    </div>
  );
};`;

code = code.replace(/    <\/div>\n  \);\n\};\n\nexport default AgendaView;/g, modalComponent + "\n\nexport default AgendaView;");

fs.writeFileSync('src/components/AgendaView.tsx', code);
