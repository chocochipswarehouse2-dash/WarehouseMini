const fs = require('fs');

let apiCode = fs.readFileSync('src/services/gasManualShipment.ts', 'utf8');
apiCode = apiCode.replace(
  /const submitPayload = \{\s*\.\.\.payload,\s*created_at: payload.created_at \|\| new Date\(\).toISOString\(\)\s*\};/g,
  `const { id, ...rest } = payload as any;
    const submitPayload = {
      ...rest,
      created_at: payload.created_at || new Date().toISOString()
    };`
);

fs.writeFileSync('src/services/gasManualShipment.ts', apiCode);
