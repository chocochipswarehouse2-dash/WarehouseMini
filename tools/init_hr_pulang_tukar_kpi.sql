-- =============================================================================
-- SQL SCHEMA: IZIN PULANG AWAL & TUKAR SHIFT (HR MANAGEMENT)
-- =============================================================================

-- 1. Table: izin_pulang_awal
CREATE TABLE IF NOT EXISTS public.izin_pulang_awal (
    id TEXT PRIMARY KEY,
    nik TEXT NOT NULL,
    nama TEXT NOT NULL,
    divisi TEXT DEFAULT 'Warehouse',
    tanggal DATE NOT NULL,
    jam_pulang_rencana TEXT NOT NULL,
    jam_pulang_standar TEXT,
    shift TEXT NOT NULL,
    alasan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Diajukan' CHECK (status IN ('Diajukan', 'Disetujui', 'Ditolak')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    catatan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_izin_pulang_awal_nik ON public.izin_pulang_awal (nik);
CREATE INDEX IF NOT EXISTS idx_izin_pulang_awal_tanggal ON public.izin_pulang_awal (tanggal);
CREATE INDEX IF NOT EXISTS idx_izin_pulang_awal_status ON public.izin_pulang_awal (status);

-- 2. Table: tukar_shift
CREATE TABLE IF NOT EXISTS public.tukar_shift (
    id TEXT PRIMARY KEY,
    pemohon_nik TEXT NOT NULL,
    pemohon_nama TEXT NOT NULL,
    pemohon_tanggal DATE NOT NULL,
    pemohon_shift_asal TEXT NOT NULL,
    target_nik TEXT NOT NULL,
    target_nama TEXT NOT NULL,
    target_tanggal DATE NOT NULL,
    target_shift_asal TEXT NOT NULL,
    alasan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Diajukan' CHECK (status IN ('Diajukan', 'Disetujui', 'Ditolak')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    catatan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tukar_shift_pemohon ON public.tukar_shift (pemohon_nik);
CREATE INDEX IF NOT EXISTS idx_tukar_shift_target ON public.tukar_shift (target_nik);
CREATE INDEX IF NOT EXISTS idx_tukar_shift_status ON public.tukar_shift (status);
