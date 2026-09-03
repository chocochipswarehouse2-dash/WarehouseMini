const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const search = `                </div>
                            </div>
          )}`;
const replace = `                </div>
              </div>
            </div>
          )}`;

code = code.replace(search, replace);
fs.writeFileSync('src/App.tsx', code);
