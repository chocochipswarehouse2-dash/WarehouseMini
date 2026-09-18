-- =====================================================================================
-- MEMBUAT TABEL WMS_KATALOG
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.wms_katalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id TEXT NOT NULL,
    catalog_name TEXT NOT NULL,
    nomor TEXT,
    deskripsi TEXT,
    price TEXT,
    variants JSONB DEFAULT '[]'::jsonb,
    image_url TEXT,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================================
-- MENGAKTIFKAN RLS (ROW LEVEL SECURITY)
-- =====================================================================================
ALTER TABLE public.wms_katalog ENABLE ROW LEVEL SECURITY;

-- Policy untuk mengizinkan akses READ (Select) bagi user yang terautentikasi (atau anon jika dibutuhkan)
CREATE POLICY "Enable read access for all users" ON public.wms_katalog
    FOR SELECT USING (true);

-- Policy untuk mengizinkan INSERT bagi user yang terautentikasi
CREATE POLICY "Enable insert for authenticated users" ON public.wms_katalog
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Policy untuk mengizinkan UPDATE bagi user yang terautentikasi
CREATE POLICY "Enable update for authenticated users" ON public.wms_katalog
    FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Policy untuk mengizinkan DELETE bagi user yang terautentikasi
CREATE POLICY "Enable delete for authenticated users" ON public.wms_katalog
    FOR DELETE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- =====================================================================================
-- TRIGGER UPDATE TIMESTAMP
-- =====================================================================================
CREATE OR REPLACE FUNCTION update_wms_katalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_wms_katalog_timestamp ON public.wms_katalog;

CREATE TRIGGER update_wms_katalog_timestamp
    BEFORE UPDATE ON public.wms_katalog
    FOR EACH ROW
    EXECUTE FUNCTION update_wms_katalog_updated_at();

-- =====================================================================================
-- SCRIPT MIGRASI (OPSIONAL - JALANKAN SEKALI JIKA INGIN MEMINDAHKAN DARI WMS_SETTINGS)
-- Jika ingin otomatis memindahkan dari wms_settings ke wms_katalog, uncomment baris di bawah
-- =====================================================================================
/*
DO $$
DECLARE
    row_data jsonb;
    batch jsonb;
    item jsonb;
    manual_data text;
BEGIN
    SELECT katalog_manual_data INTO manual_data FROM public.wms_settings LIMIT 1;
    IF manual_data IS NOT NULL AND manual_data != '' THEN
        row_data := manual_data::jsonb;
        FOR batch IN SELECT * FROM jsonb_array_elements(row_data)
        LOOP
            FOR item IN SELECT * FROM jsonb_array_elements(batch->'items')
            LOOP
                INSERT INTO public.wms_katalog(
                    id, catalog_id, catalog_name, nomor, deskripsi, price, variants, image_url, is_hidden, created_at
                ) VALUES (
                    COALESCE((item->>'id')::uuid, gen_random_uuid()),
                    COALESCE(item->>'catalog_id', batch->>'id', 'batch-325b'),
                    COALESCE(item->>'catalog_name', batch->>'name', '325 B'),
                    item->>'nomor',
                    item->>'deskripsi',
                    item->>'price',
                    COALESCE(item->'variants', '[]'::jsonb),
                    item->>'image_url',
                    COALESCE((item->>'is_hidden')::boolean, FALSE),
                    COALESCE((batch->>'created_at')::timestamptz, NOW())
                ) ON CONFLICT (id) DO NOTHING;
            END LOOP;
        END LOOP;
    END IF;
END $$;
*/
