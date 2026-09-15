const fs = require('fs');

let apiCode = fs.readFileSync('src/services/gasDataAlamat.ts', 'utf8');
apiCode = apiCode.replace(
  /const payload = newItems.map\(item => \{[\s\S]*?\}\);/m,
  `const payload = newItems.map(item => {
      const { id, ...rest } = item as any;
      return {
        ...rest,
        created_at: item.created_at || new Date().toISOString()
      };
    });`
);
fs.writeFileSync('src/services/gasDataAlamat.ts', apiCode);
