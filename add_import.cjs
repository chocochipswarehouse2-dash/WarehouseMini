const fs = require('fs');
const file = 'src/components/PeminjamanView.tsx';
let code = fs.readFileSync(file, 'utf8');

code = "import { getLocalUsers } from '../utils/localStore';\n" + code;
fs.writeFileSync(file, code);
