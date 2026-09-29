-- =====================================================================================
-- MEMBUAT TABEL WMS_KATALOG
-- =====================================================================================

DROP TABLE IF EXISTS public.wms_katalog CASCADE;

CREATE TABLE IF NOT EXISTS public.wms_katalog (
    id TEXT PRIMARY KEY,
    catalog_id TEXT NOT NULL,
    catalog_name TEXT NOT NULL,
    catalog_description TEXT,
    catalog_publish_online TEXT,
    catalog_publish_offline TEXT,
    nomor TEXT,
    deskripsi TEXT,
    price TEXT,
    variants JSONB DEFAULT '[]'::jsonb,
    image_url TEXT,
    publish_online TEXT,
    publish_offline TEXT,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pastikan kolom baru tersedia jika tabel sudah pernah dibuat sebelumnya
ALTER TABLE public.wms_katalog ADD COLUMN IF NOT EXISTS catalog_description TEXT;
ALTER TABLE public.wms_katalog ADD COLUMN IF NOT EXISTS catalog_publish_online TEXT;
ALTER TABLE public.wms_katalog ADD COLUMN IF NOT EXISTS catalog_publish_offline TEXT;
ALTER TABLE public.wms_katalog ADD COLUMN IF NOT EXISTS publish_online TEXT;
ALTER TABLE public.wms_katalog ADD COLUMN IF NOT EXISTS publish_offline TEXT;

-- =====================================================================================
-- MENGAKTIFKAN RLS (ROW LEVEL SECURITY)
-- =====================================================================================
ALTER TABLE public.wms_katalog ENABLE ROW LEVEL SECURITY;

-- Policy untuk mengizinkan akses READ (Select) bagi user yang terautentikasi (atau anon jika dibutuhkan)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.wms_katalog;
CREATE POLICY "Enable read access for all users" ON public.wms_katalog
    FOR SELECT USING (true);

-- Policy untuk mengizinkan INSERT bagi user yang terautentikasi
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.wms_katalog;
CREATE POLICY "Enable insert for authenticated users" ON public.wms_katalog
    FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Policy untuk mengizinkan UPDATE bagi user yang terautentikasi
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.wms_katalog;
CREATE POLICY "Enable update for authenticated users" ON public.wms_katalog
    FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Policy untuk mengizinkan DELETE bagi user yang terautentikasi
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.wms_katalog;
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
DO $$
DECLARE
    row_data jsonb;
    batch jsonb;
    item jsonb;
    manual_data text;
    col_exists boolean;
BEGIN
    -- 1. Cek apakah kolom katalog_manual_data ada di tabel wms_settings
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema='public' AND table_name='wms_settings' AND column_name='katalog_manual_data'
    ) INTO col_exists;

    -- 2. Jika kolom ada, ambil nilainya dari row 1
    IF col_exists THEN
        EXECUTE 'SELECT katalog_manual_data FROM public.wms_settings WHERE id = 1 LIMIT 1' INTO manual_data;
    END IF;

    -- 3. Jika kosong atau kolom tidak ada, coba ambil dari payload JSON di row 2 (CONFIG_GAS)
    IF manual_data IS NULL OR manual_data = '' THEN
        SELECT fonnte_group_target INTO manual_data 
        FROM public.wms_settings 
        WHERE id = 2 OR fonnte_token = 'CONFIG_GAS' 
        LIMIT 1;
        
        IF manual_data IS NOT NULL AND manual_data != '' THEN
            BEGIN
                manual_data := (manual_data::jsonb)->>'katalog_manual_data';
            EXCEPTION WHEN OTHERS THEN
                manual_data := NULL;
            END;
        END IF;
    END IF;

    -- 4. Jika data ditemukan, lakukan migrasi ke tabel wms_katalog
    IF manual_data IS NOT NULL AND manual_data != '' THEN
        row_data := manual_data::jsonb;
        FOR batch IN SELECT * FROM jsonb_array_elements(row_data)
        LOOP
            FOR item IN SELECT * FROM jsonb_array_elements(batch->'items')
            LOOP
                INSERT INTO public.wms_katalog(
                    id, catalog_id, catalog_name, nomor, deskripsi, price, variants, image_url, is_hidden, created_at
                ) VALUES (
                    COALESCE(item->>'id', gen_random_uuid()::text),
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
