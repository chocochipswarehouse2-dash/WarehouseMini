const fs = require('fs');
let content = fs.readFileSync('src/services/supabase.ts', 'utf8');

// replace the inline logic with cleanProductName
const regex = /\/\/ Clean repeated\/duplicated names[\s\S]*?const nama = rawNama;/;
const replacement = `const nama = cleanProductName(rawNama);`;

if (content.match(regex)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync('src/services/supabase.ts', content, 'utf8');
  console.log('Fixed extractProductFromRow with cleanProductName');
} else {
  console.log('Regex not found');
}
