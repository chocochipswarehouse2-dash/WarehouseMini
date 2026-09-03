const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// The block starts around 790:
/*
          {activePage === 'scanner' && (
            <div className="block">
              <div className="max-w-2xl mx-auto space-y-4">
*/
const search = `                  />
                </div>
                            </div>
          )}`;
const replace = `                  />
                </div>
              </div>
            </div>
          )}`;
code = code.replace(search, replace);
fs.writeFileSync('src/App.tsx', code);
