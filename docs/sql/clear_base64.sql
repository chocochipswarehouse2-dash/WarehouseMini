UPDATE perbaikan_tickets
SET foto_urls = '[]'::jsonb
WHERE foto_urls::text LIKE '%data:image%';

UPDATE laporan_qc
SET foto_urls = '[]'::jsonb
WHERE foto_urls::text LIKE '%data:image%';
