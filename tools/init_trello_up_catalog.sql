-- =============================================================================
-- TABEL TRELLO UP CATALOG (KOLEKSI UP & SUSUNAN ARTIKEL)
-- =============================================================================
-- Menyimpan metadata artikel, nomor urutan susunan, foto Trello & Google Drive,
-- serta siap dihubungkan ke sistem Produksi & Operasional Warehouse.

CREATE TABLE IF NOT EXISTS public.trello_up_catalog (
    id TEXT PRIMARY KEY,                       -- Trello Card ID (e.g. 692effac8e6bbe0d552dcb04)
    board_id TEXT NOT NULL DEFAULT 'zCN7H9VD', -- Trello Board ShortLink / ID
    list_id TEXT NOT NULL,                     -- Trello List ID (e.g. 692effac8e6bbe0d552dc89b)
    list_name TEXT NOT NULL,                   -- e.g. 'UP 279 - 4 SEPT'
    up_code TEXT NOT NULL,                     -- e.g. 'UP 279'
    publish_date_raw TEXT,                     -- e.g. '4 SEPT'
    publish_date DATE,                         -- e.g. 2026-09-04 (jika dapat diparsing)
    card_name TEXT NOT NULL,                   -- e.g. '25289 // Ravelia Top'
    item_code TEXT,                            -- e.g. '25289' (Kunci link ke master_produk / produksi)
    item_name TEXT,                            -- e.g. 'Ravelia Top'
    qty_note TEXT,                             -- e.g. '@ 1'
    description TEXT,                          -- Catatan / deskripsi kartu
    sequence_order INT NOT NULL DEFAULT 1,     -- Urutan susunan kartu (1, 2, 3...)
    pos DOUBLE PRECISION,                      -- Trello floating pos untuk sorting exact
    trello_attachment_id TEXT,                 -- Attachment ID foto utama di Trello
    trello_image_url TEXT,                     -- URL unduh foto dari Trello
    gdrive_file_id TEXT,                       -- Google Drive File ID foto (setelah sinkronisasi GDrive)
    gdrive_image_url TEXT,                     -- URL foto Google Drive (thumbnail / view)
    gdrive_folder_id TEXT,                     -- ID folder UP di Google Drive
    gdrive_folder_name TEXT,                   -- Nama folder UP di Drive (e.g. 'UP 279')
    status TEXT NOT NULL DEFAULT 'ACTIVE',     -- 'ACTIVE' | 'ARCHIVED' | 'DELETED'
    raw_json JSONB,                            -- Menyimpan info lengkap attachment, label, preview
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),  -- Terakhir disinkronkan dari Trello
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks untuk query cepat dan filtering
CREATE INDEX IF NOT EXISTS idx_trello_up_list_name ON public.trello_up_catalog(list_name);
CREATE INDEX IF NOT EXISTS idx_trello_up_code ON public.trello_up_catalog(up_code);
CREATE INDEX IF NOT EXISTS idx_trello_up_item_code ON public.trello_up_catalog(item_code);
CREATE INDEX IF NOT EXISTS idx_trello_up_sequence ON public.trello_up_catalog(up_code, sequence_order);
CREATE INDEX IF NOT EXISTS idx_trello_up_status ON public.trello_up_catalog(status);

-- Enable Row Level Security (RLS) & Public Policies
ALTER TABLE public.trello_up_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on trello_up_catalog" ON public.trello_up_catalog;
CREATE POLICY "Allow public read access on trello_up_catalog"
    ON public.trello_up_catalog FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated/anon insert on trello_up_catalog" ON public.trello_up_catalog;
CREATE POLICY "Allow authenticated/anon insert on trello_up_catalog"
    ON public.trello_up_catalog FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated/anon update on trello_up_catalog" ON public.trello_up_catalog;
CREATE POLICY "Allow authenticated/anon update on trello_up_catalog"
    ON public.trello_up_catalog FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated/anon delete on trello_up_catalog" ON public.trello_up_catalog;
CREATE POLICY "Allow authenticated/anon delete on trello_up_catalog"
    ON public.trello_up_catalog FOR DELETE USING (true);

