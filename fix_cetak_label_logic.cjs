const fs = require('fs');

// Fix gasDataAlamat.ts
let apiCode = fs.readFileSync('src/services/gasDataAlamat.ts', 'utf8');
apiCode = apiCode.replace(
  /const payload = newItems.map\(item => \(\{/g,
  `const payload = newItems.map(item => {
      const { id, ...rest } = item as any;
      return {
        ...rest,`
);
apiCode = apiCode.replace(
  /created_at: item.created_at \|\| new Date\(\).toISOString\(\)\n\s*\}\)\);/g,
  `created_at: item.created_at || new Date().toISOString()
      };
    });`
);
fs.writeFileSync('src/services/gasDataAlamat.ts', apiCode);

// Fix CetakLabelView.tsx
let viewCode = fs.readFileSync('src/components/CetakLabelView.tsx', 'utf8');

viewCode = viewCode.replace(
  /await saveDataAlamatList\(\[newAddress\]\);/g,
  `const res = await saveDataAlamatList([newAddress]);
      if (!res.success) throw new Error(res.message);`
);

viewCode = viewCode.replace(
  /await saveDataAlamatList\(uniqueItems\);/g,
  `const res = await saveDataAlamatList(uniqueItems);
      if (!res.success) throw new Error(res.message);`
);

fs.writeFileSync('src/components/CetakLabelView.tsx', viewCode);
