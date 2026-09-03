const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<BottomSaveBar\s+items=\{scannedData\}\s+keterangan=\{keterangan\}\s+onChangeKeterangan=\{setKeterangan\}\s+onSave=\{handleSaveData\}[\s\S]*?<React\.Suspense/m;

const replacement = `<BottomSaveBar
                    items={scannedData}
                    keterangan={keterangan}
                    onChangeKeterangan={setKeterangan}
                    onSave={handleSaveData}
                    isSaving={isSaving}
                  />
                </div>
              </div>
            </div>
          )}

          <React.Suspense`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', code);
