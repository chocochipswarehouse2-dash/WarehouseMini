const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';

async function run() {
  const sql = `
CREATE OR REPLACE FUNCTION sync_peminjaman_to_picking()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if already exists to avoid duplicates if React app inserts too
  IF NOT EXISTS (
    SELECT 1 FROM public.picking_list 
    WHERE no_sj = NEW.no_peminjaman AND sku = NEW.sku
  ) THEN
    INSERT INTO public.picking_list (
      no_sj,
      tanggal,
      tujuan,
      sku,
      nama_produk,
      qty_req,
      qty_picked,
      lokasi,
      status,
      picker_name
    ) VALUES (
      NEW.no_peminjaman,
      NEW.tanggal_pinjam::text,
      'SPS: ' || NEW.pic || ' - ' || NEW.keperluan,
      NEW.sku,
      NEW.nama_produk,
      NEW.qty,
      0,
      NEW.lokasi,
      'PENDING',
      ''
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_peminjaman ON public.peminjaman;
CREATE TRIGGER trigger_sync_peminjaman
AFTER INSERT ON public.peminjaman
FOR EACH ROW
EXECUTE FUNCTION sync_peminjaman_to_picking();

-- Backfill missing
INSERT INTO public.picking_list (no_sj, tanggal, tujuan, sku, nama_produk, qty_req, qty_picked, lokasi, status, picker_name)
SELECT 
  p.no_peminjaman,
  p.tanggal_pinjam::text,
  'SPS: ' || p.pic || ' - ' || p.keperluan,
  p.sku,
  p.nama_produk,
  p.qty,
  0,
  p.lokasi,
  'PENDING',
  ''
FROM public.peminjaman p
WHERE NOT EXISTS (
  SELECT 1 FROM public.picking_list pl WHERE pl.no_sj = p.no_peminjaman AND pl.sku = p.sku
);
`;

  const res = await fetch(`${url}/rest/v1/rpc/execute_sql`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql_statement: sql })
  });
  console.log(res.status, await res.text());
}
run();
