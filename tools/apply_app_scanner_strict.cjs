const fs = require('fs');

let p = 'src/App.tsx';
let c = fs.readFileSync(p, 'utf8');

// 1. Initial currentCategory state: change from 'ANOMALI' to ''
c = c.replace(
  "const [currentCategory, setCurrentCategory] = useState<CategoryType>('ANOMALI');",
  "const [currentCategory, setCurrentCategory] = useState<CategoryType>('');"
);

// 2. handleScannedItem: Reject early if category is not selected or location is missing
const skuDetectionTarget = "// 3. Detect SKU Item";
const skuDetectionReplacement = `// 3. Validasi Dini: Tolak scan jika Mode (#IN/#OUT/#SO) belum dipilih atau Lokasi kosong
    if (!currentCategoryRef.current || currentCategoryRef.current === 'ANOMALI') {
      playErrorBeep();
      vibrateDevice([150, 50, 150]);
      showToast('Wajib pilih mode scan terlebih dahulu (#IN, #OUT, atau #SO) sebelum scan barang!', 'error');
      return;
    }

    if (!currentLocationRef.current || currentLocationRef.current === 'DEFAULT' || currentLocationRef.current === 'ANOMALI') {
      playErrorBeep();
      vibrateDevice([150, 50, 150]);
      showToast('Wajib tentukan / pilih lokasi rak terlebih dahulu sebelum scan barang!', 'error');
      return;
    }

    // 3. Detect SKU Item`;

c = c.replace(skuDetectionTarget, skuDetectionReplacement);

// 3. In handleSaveData: Validate category and location strictly
const saveItemTarget = `        const cType: CategoryType = item.category || currentCategory || 'ANOMALI';
        const cLokasi = item.location || currentLocation || 'DEFAULT';`;

const saveItemReplacement = `        const cType: CategoryType = item.category || currentCategory;
        if (!cType || cType === 'ANOMALI') {
          setIsSaving(false);
          playErrorBeep();
          showToast(\`Item "\${line}" tidak memiliki mode scan valid (#IN/#OUT/#SO)! Mohon pilih mode terlebih dahulu.\`, 'error');
          return;
        }

        const cLokasi = (item.location || currentLocation || '').trim();
        if (!cLokasi || cLokasi === 'DEFAULT' || cLokasi === 'ANOMALI') {
          setIsSaving(false);
          playErrorBeep();
          showToast(\`Item "\${line}" belum memiliki lokasi rak fisik yang valid! Mohon tentukan lokasi rak.\`, 'error');
          return;
        }

        if (cType === 'ANOMALI') {
          setIsSaving(false);
          playErrorBeep();
          showToast('Mode ANOMALI dilarang pada Web App Scanner. Pilih #IN, #OUT, atau #SO.', 'error');
          return;
        }`;

c = c.replace(saveItemTarget, saveItemReplacement);

// 4. In handleSaveData reset:
c = c.replace(
  "setCurrentCategory('ANOMALI');",
  "setCurrentCategory('');\n      currentCategoryRef.current = '';"
);

fs.writeFileSync(p, c, 'utf8');
console.log('App.tsx successfully updated with strict Web Scanner validations!');

