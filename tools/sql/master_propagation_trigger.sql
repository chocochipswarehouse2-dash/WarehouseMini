-- =====================================================================
-- Master Produk = SATU-SATUNYA sumber nama_produk & size.
-- Jalankan SEKALI di Supabase SQL Editor.
-- 1) master_produk.updated_at otomatis ter-update tiap baris diubah
--    (dipakai watermark DELTA SYNC di client -> egress minimal).
-- 2) Perubahan nama_produk / size di master otomatis disalin ke tabel
--    turunan yang masih "hidup" (hanya LABEL, TIDAK menyentuh sisa_stok / qty).
--    log_produk (ledger append-only) sengaja TIDAK diubah.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_master_produk_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS master_produk_touch ON public.master_produk;
CREATE TRIGGER master_produk_touch
BEFORE UPDATE ON public.master_produk
FOR EACH ROW EXECUTE FUNCTION public.trg_master_produk_touch();

-- ---------------------------------------------------------------------
-- AKAR MASALAH: stok_real_fisik adalah VIEW atas log_produk dgn
--   MAX(lp.size) / MAX(lp.nama_produk)  -> MAX() huruf: 'L' > 'Default' dst,
-- sehingga size/nama salah & beda dari master (mis. Oprah Yellow = L).
-- FIX: ambil nama & size dari master_produk (VLOOKUP di level DB).
-- Kolom & urutan view TIDAK berubah (sisa_stok tetap IN - OUT).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.stok_real_fisik AS
SELECT 
  lp.sku,
  lp.lokasi,
  lp.area,
  COALESCE(m.nama_produk, MAX(lp.nama_produk)) as nama_produk,
  COALESCE(m.size, MAX(lp.size)) as size,
  SUM(
    CASE 
      WHEN lp.type IN ('IN', 'ADJ_IN') THEN lp.qty
      WHEN lp.type IN ('OUT', 'ADJ_OUT') THEN -lp.qty
      ELSE 0
    END
  ) as sisa_stok,
  MAX(lp.created_at) as updated_at
FROM public.log_produk lp
LEFT JOIN public.master_produk m ON m.sku = lp.sku
GROUP BY lp.sku, lp.lokasi, lp.area, m.nama_produk, m.size
HAVING SUM(
  CASE
    WHEN lp.type IN ('IN', 'ADJ_IN') THEN lp.qty
    WHEN lp.type IN ('OUT', 'ADJ_OUT') THEN -lp.qty
    ELSE 0
  END
) != 0;

-- picking_list (tabel biasa): sinkron nama dari master saat master berubah
CREATE OR REPLACE FUNCTION public.trg_master_produk_propagate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nama_produk IS DISTINCT FROM OLD.nama_produk THEN
    UPDATE public.picking_list SET nama_produk = NEW.nama_produk
     WHERE upper(sku) = upper(NEW.sku) AND nama_produk IS DISTINCT FROM NEW.nama_produk;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS master_produk_propagate ON public.master_produk;
CREATE TRIGGER master_produk_propagate
AFTER UPDATE ON public.master_produk
FOR EACH ROW EXECUTE FUNCTION public.trg_master_produk_propagate();
-- Index agar delta watermark cepat
CREATE INDEX IF NOT EXISTS idx_master_produk_updated_at ON public.master_produk (updated_at DESC);
