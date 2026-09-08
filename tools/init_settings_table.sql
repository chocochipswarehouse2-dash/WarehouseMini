CREATE TABLE IF NOT EXISTS public.wms_settings (
  id integer PRIMARY KEY DEFAULT 1,
  fonnte_token text,
  fonnte_group_target text,
  fonnte_auto_send boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.wms_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read and write settings (or specific roles)
DROP POLICY IF EXISTS "Allow read access to all authenticated users for settings" ON public.wms_settings;
CREATE POLICY "Allow read access to all authenticated users for settings"
  ON public.wms_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert/update access to authenticated users for settings" ON public.wms_settings;
CREATE POLICY "Allow insert/update access to authenticated users for settings"
  ON public.wms_settings FOR ALL
  USING (true)
  WITH CHECK (true);
