const fs = require('fs');
let code = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

code = code.replace(
  "import { \n  AgendaEvent, ProjectItem, AgendaCategory",
  "import { fetchWmsSettings, saveWmsSettings } from '../services/settings';\nimport { \n  AgendaEvent, ProjectItem, AgendaCategory"
);

code = code.replace(
  "const CATEGORY_CONFIG: Record<AgendaCategory, { ",
  "export const DEFAULT_CATEGORY_CONFIG: Record<string, { \n  id?: string;"
);

// We need to inject the `categoryConfig` state and fetch logic
const hookInject = `  const [searchQuery, setSearchQuery] = useState('');
  
  const [categoryConfig, setCategoryConfig] = useState<Record<string, any>>(DEFAULT_CATEGORY_CONFIG);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    fetchWmsSettings().then(settings => {
      if (settings?.agenda_categories) {
        setCategoryConfig(settings.agenda_categories);
        
        // Update selected categories based on loaded config
        const initialSelected: Record<string, boolean> = {};
        Object.keys(settings.agenda_categories).forEach(k => {
          initialSelected[k] = true;
        });
        setSelectedCategories(initialSelected);
      }
    });
    
    const handleSettingsChange = (e: any) => {
      if (e.detail?.agenda_categories) {
        setCategoryConfig(e.detail.agenda_categories);
      }
    };
    window.addEventListener('wms_settings_changed', handleSettingsChange);
    return () => window.removeEventListener('wms_settings_changed', handleSettingsChange);
  }, []);
`;

code = code.replace(
  "const [searchQuery, setSearchQuery] = useState('');",
  hookInject
);

code = code.replace(
  "const [selectedCategories, setSelectedCategories] = useState<Record<AgendaCategory, boolean>>({",
  "const [selectedCategories, setSelectedCategories] = useState<Record<string, boolean>>({"
);

code = code.replace(
  /meeting: true, operasional: true, project: true, supplier: true, urgent: true, umum: true/g,
  ""
); // Need a better replacement for resetting categories.

fs.writeFileSync('src/components/AgendaView.tsx', code);
