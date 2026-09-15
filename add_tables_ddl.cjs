const fs = require('fs');
const filePath = 'src/services/supabase.ts';
let code = fs.readFileSync(filePath, 'utf8');

const additionalDDL = `
-- TABEL CETAK LABEL / ADDRESS BOOK
CREATE TABLE IF NOT EXISTS public.address_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_penerima TEXT NOT NULL,
  no_telp TEXT,
  alamat TEXT,
  keterangan TEXT,
  jasa_kirim TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABEL MANUAL SHIPMENT / PESANAN MANUAL
CREATE TABLE IF NOT EXISTS public.manual_shipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_pesanan TEXT UNIQUE NOT NULL,
  no_resi TEXT,
  nama_penerima TEXT NOT NULL,
  no_telp TEXT,
  alamat TEXT,
  keterangan TEXT,
  jasa_kirim TEXT,
  status TEXT DEFAULT 'Pending',
  tanggal_scan TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABEL OUTLET CONFIG
CREATE TABLE IF NOT EXISTS public.outlet_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  fulfillment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.address_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access address_book" ON public.address_book FOR ALL USING (true);
CREATE POLICY "Allow public all access manual_shipment" ON public.manual_shipment FOR ALL USING (true);
CREATE POLICY "Allow public all access outlet_config" ON public.outlet_config FOR ALL USING (true);
`;

code = code.replace(
  "export const AGENDA_PROJECT_SUPABASE_DDL_SQL = `",
  additionalDDL + "\nexport const AGENDA_PROJECT_SUPABASE_DDL_SQL = `"
);

fs.writeFileSync(filePath, code);
