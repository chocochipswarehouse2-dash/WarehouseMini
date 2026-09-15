const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf8');

// Find the bad block
const badStart = "-- TABEL CETAK LABEL / ADDRESS BOOK";
const badEnd = 'CREATE POLICY "Allow public all access outlet_config" ON public.outlet_config FOR ALL USING (true);';

const blockToMove = code.substring(code.indexOf(badStart), code.indexOf(badEnd) + badEnd.length);

code = code.replace(blockToMove + "\n", "");
code = code.replace("export const AGENDA_PROJECT_SUPABASE_DDL_SQL = `", "export const AGENDA_PROJECT_SUPABASE_DDL_SQL = `\n" + blockToMove + "\n");

fs.writeFileSync('src/services/supabase.ts', code);
