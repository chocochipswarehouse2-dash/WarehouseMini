---
name: wms-product-lookup-integrity
description: Standar WAJIB lookup nama produk & size di WMS Inventory. Master Produk (master_produk) = satu-satunya kebenaran, VLOOKUP berdasarkan SKU persis. DILARANG menebak size/nama dari pola/akhiran SKU (regex) atau dari SKU saudara (prefix). Aktifkan setiap kali menyentuh sortUtils.ts, productLookup.ts, resolveProductName, resolveProductDisplaySize, extractSizeFromSku, wmsAiService.ts, form pilih produk (Alter/Retur/Manual Shipment/Peminjaman), atau saat user melaporkan nama/size produk salah.
---

# WMS Product Lookup Integrity

## Aturan Mutlak
1. **Sumber kebenaran = `master_produk` (VLOOKUP SKU persis).** Nama & size dari master tidak pernah dikoreksi oleh heuristik.
2. **DILARANG menebak size dari akhiran SKU.** Akhiran 2-3 huruf SKU biasanya KODE WARNA, bukan size:
   - Akhiran 'L': `YL`=Yellow, `OL`=Olive, `VL`=Violet, `PL`=Purple/Pale, `SL`=Silver, `CL`=Coral/Camel/Choco, `TL`=Teal, `GL`=Gold/Grey, `BL`=Blue/Black, `NL`=Natural/Navy, `RL`=Rose, `EL`=Emerald, `KL`=Khaki, `ML`=Mint, `LL`=Lilac, `DL`=Denim Light, `NVL`=Navy Light, `DBL`=Dusty Blue, `BNL`=Brown Light, `CRL`=Cream Light.
   - Akhiran 'M': `EM`=Emerald, `CM`=Caramel/Cream, `DM`=Dark Magenta/Denim, `LM`=Lime, `BM`=Brown/Blue, `PM`=Plum, `SM`=Salmon/Sage, `TM`=Teal, `GM`=Green/Grey, `KM`=Khaki, `YLM`=Yellow Mustard, `DGM`=Dark Grey, `BCM`=Black Choco.
   - Akhiran 'S': `RS`=Rust/Rose, `BS`=Black/Blue/Brown Stripe, `WS`=White Stripe, `NS`=Navy Stripe, `HS`=Houndstooth, `CS`=Cream Stripe, `GS`=Grey Stripe, `MS`=Mint Stripe, `SS`=Sage Stripe, `TS`=Teal Stripe, `KS`=Khaki Stripe, `ORS`=Old Rose, `CRS`=Cream Stripe.
   - Bug nyata yang dibersihkan: 7.020 produk di `master_produk` sempat tercemar pseudo-size akibat import regex lama. Telah disanitasi menyeluruh ke `size: 'Default'`.
   - Satu-satunya parsing yang diizinkan hanya jika SKU **tidak ada di master**: separator eksplisit (`-S`, `_M`, `/L`, `.XL`).
3. **Runtime Protection `isCorruptedColorCodeSize(sku, size)`**:
   - Jika suatu item memiliki kode akhiran warna tersebut dan terbaca size 'S', 'M', atau 'L' tanpa separator eksplisit, fungsi otomatis menolak dan mengembalikan size '-' / 'Default'.
4. **DILARANG menebak nama dari prefix SKU saudara** (`sku.slice(0,-2)`). Beda warna = beda produk.
   - Contoh nyata: `DF26KBF03DDC` harus **Taylor Pants Denim Blue** (S), bukan "Dark Denim".
5. **Tampilkan nilai `master_produk` APA ADANYA (Verbatim)**:
   - Jika di `master_produk` tertulis `Default`, tampilkan `Default` (JANGAN diubah ke `-` atau `ALL`).
   - Jika tertulis `ALL`, tampilkan `ALL`.
   - Saat import CSV Master Produk di `UpdateDatabaseModal.tsx`, WAJIB simpan kolom Variant/Size apa adanya (kosong → `'Default'`), DILARANG KERAS menjalankan regex/sanitizer/extractSizeFromSku yang mengarang size (`A->ALL`, `B->XS`, `G->XXL`, dll.).
6. Setiap perubahan `master_produk` (import CSV atau skrip) WAJIB menaikkan epoch (`bumpCloudCacheEpoch('MASTER_IMPORT')`) atau `updated_at` agar delta sync di semua perangkat aktif.
6. Nama dari katalog marketing (`katalogBatch.deskripsi`, `initial325bData`) hanyalah bantuan pencarian. Saat user memilih produk dan sebelum menyimpan, WAJIB disejajarkan ke master via `lookupProductBySku(sku)` / `alignItemWithMasterProduct`.
7. Pencarian berdasarkan NAMA (AI/UI) boleh fuzzy untuk menemukan kandidat, tetapi nama & size yang DITAMPILKAN harus berasal dari baris master untuk SKU kandidat.

## API Standar
- `isCorruptedColorCodeSize(sku, size)` → boolean (true jika pseudo-size dari kode warna).
- `lookupProductBySku(sku, catalogOrMap?, currentName?, currentSize?)` → `{found, nama_produk, size, hasNameMismatch, hasSizeMismatch}`
- `resolveProductName(sku, recordName, catalogItem)` → master dulu, record hanya jika SKU tidak ada di master.
- `resolveProductDisplaySize(sku, recordSize, catalogSize)` → master final; record/separator hanya jika SKU tidak ada di master.
- `extractSizeFromSku(sku)` → master dulu; tanpa master hanya separator eksplisit.

## Checklist Regresi (jalankan sebelum merge)
- [ ] `F26CTN698YL` (Erin Top Yellow) = size `-` / `Default` (BUKAN `L`).
- [ ] `F26CTN699YL` (Fernanda Top Yellow) = size `-` / `Default` (BUKAN `L`).
- [ ] `STN501YL` (Fiorella Top Yellow) = size `-` / `Default` (BUKAN `L`).
- [ ] `19LTO008OL` = size `-` / `Default` (BUKAN `L`).
- [ ] `B138CM` = size `-` / `Default` (BUKAN `M`).
- [ ] `DF26KBF03DDC` → "Taylor Pants Denim Blue" / S di Alter, Rekap, Mutasi, Inventory, AI.
- [ ] Tidak ada regex akhiran huruf baru (`/[A-Z0-9]([SML])$/`) di util lookup.
- [ ] Tidak ada fallback `prefix.get(sku.slice(...))` untuk nama.
- [ ] Form pilih produk memanggil `lookupProductBySku` saat select & saat submit.

## Audit Data Master
Data `master_produk` bisa tercemar tebakan lama (size mengikuti akhiran SKU padahal saudara warna lain `Default`). Audit read-only: `docs/audits/AUDIT_MASTER_SIZE_SUSPECT_2026-11-12.csv`. **Koreksi baris master HANYA setelah verifikasi fisik & persetujuan eksplisit user/admin** (jangan cleanup otomatis).

