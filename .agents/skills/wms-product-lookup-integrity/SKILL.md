---
name: wms-product-lookup-integrity
description: Standar WAJIB lookup nama produk & size di WMS Inventory. Master Produk (master_produk) = satu-satunya kebenaran, VLOOKUP berdasarkan SKU persis. DILARANG menebak size/nama dari pola/akhiran SKU (regex) atau dari SKU saudara (prefix). Aktifkan setiap kali menyentuh sortUtils.ts, productLookup.ts, resolveProductName, resolveProductDisplaySize, extractSizeFromSku, wmsAiService.ts, form pilih produk (Alter/Retur/Manual Shipment/Peminjaman), atau saat user melaporkan nama/size produk salah.
---

# WMS Product Lookup Integrity

## Aturan Mutlak
1. **Sumber kebenaran = `master_produk` (VLOOKUP SKU persis).** Nama & size dari master tidak pernah dikoreksi oleh heuristik.
2. **DILARANG menebak size dari akhiran SKU.** Akhiran huruf SKU biasanya KODE WARNA, bukan size: `YL`=Yellow, `OL`=Olive, `EM`=Emerald, `CM`=Caramel, `DM`=Dark Magenta, `LM`=Light Magenta, `SL`=Soft Lemon, `DD`=Dark Denim/Denim.
   - Contoh bug nyata: `F26CTN698YL` (Erin Top Yellow) terbaca size `L`.
   - Satu-satunya parsing yang diizinkan hanya jika SKU **tidak ada di master**: separator eksplisit (`-S`, `_M`, `/L`, `.XL`).
3. **DILARANG menebak nama dari prefix SKU saudara** (`sku.slice(0,-2)`). Beda warna = beda produk.
   - Contoh bug nyata: `DF26KBF03DDC` harus **Taylor Pants Denim Blue** (S), bukan "Dark Denim".
4. **Jika SKU ada di master dan size master `Default`/kosong → hasil size `-`/`Default`**, jangan diisi tebakan.
5. Nama dari katalog marketing (`katalogBatch.deskripsi`, `initial325bData`) hanyalah bantuan pencarian. Saat user memilih produk dan sebelum menyimpan, WAJIB disejajarkan ke master via `lookupProductBySku(sku)` / `alignItemWithMasterProduct`.
6. Pencarian berdasarkan NAMA (AI/UI) boleh fuzzy untuk menemukan kandidat, tetapi nama & size yang DITAMPILKAN harus berasal dari baris master untuk SKU kandidat.

## API Standar
- `lookupProductBySku(sku, catalogOrMap?, currentName?, currentSize?)` → `{found, nama_produk, size, hasNameMismatch, hasSizeMismatch}`
- `resolveProductName(sku, recordName, catalogItem)` → master dulu, record hanya jika SKU tidak ada di master.
- `resolveProductDisplaySize(sku, recordSize, catalogSize)` → master final; record/separator hanya jika SKU tidak ada di master.
- `extractSizeFromSku(sku)` → master dulu; tanpa master hanya separator eksplisit.

## Checklist Regresi (jalankan sebelum merge)
- [ ] `F26CTN698YL` ≠ size inferensi `L` bila master `Default`.
- [ ] `DF26KBF03DDC` → "Taylor Pants Denim Blue" / S di Alter, Rekap, Mutasi, Inventory, AI.
- [ ] Tidak ada regex akhiran huruf baru (`/[A-Z0-9]([SML])$/`) di util lookup.
- [ ] Tidak ada fallback `prefix.get(sku.slice(...))` untuk nama.
- [ ] Form pilih produk memanggil `lookupProductBySku` saat select & saat submit.

## Audit Data Master
Data `master_produk` bisa tercemar tebakan lama (size mengikuti akhiran SKU padahal saudara warna lain `Default`). Audit read-only: `docs/audits/AUDIT_MASTER_SIZE_SUSPECT_2026-11-12.csv`. **Koreksi baris master HANYA setelah verifikasi fisik & persetujuan eksplisit user/admin** (jangan cleanup otomatis).

