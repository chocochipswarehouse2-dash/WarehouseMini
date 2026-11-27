---
name: wms-jne-rekap-guardrails
description: Guardrails, Google Sheets JNEmember (A..K) & JNECorporate (A..L) column schemas, 2-way description sync & VLOOKUP Col K protection invariants, role-based Edit/Delete rules (Admin & Warehouse), and multi-source parsing standards for Rekap Tagihan JNE. Activate whenever modifying JneRekapView.tsx, jneRekapService.ts, jneRekapParser.ts, or gas/jne_tagihan_backend.js.
---

# WMS Rekap Tagihan JNE (`JNEmember` & `JNECorporated`) — Guardrails & Invariants

Wajib dibaca dan dipatuhi oleh **SEMUA agen coding** setiap kali mengubah modul **Rekap Tagihan JNE** (`src/components/JneRekapView.tsx`, `src/services/jneRekapService.ts`, `src/services/jneRekapParser.ts`, `gas/jne_tagihan_backend.js`, `src/services/permissions.ts`) serta **wajib mematuhi `.agents/skills/wms-antislop-copy/SKILL.md`** dalam seluruh label/teks UI.

---

## 1. Sumber Kebenaran Google Sheets (`1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k`)
- **GAS Script ID**: `1Z1cIj3vnYR_CxK_SLuFqeOvlxnT5dUf7brhgW2X1Njj-Qr0qC7F9QmgZ`
- Parameter routing: `sheet=member` (default) atau `sheet=corporate` di `doGet` & `doPost`.

### A. Tab `JNEmember` (`sheet=member`, `gid = 1026608111`, A..K)
1. **Kolom A (1)**: `""` *(Margin kosong)*
2. **Kolom B (2)**: `No`
3. **Kolom C (3)**: `Cnote No` *(Format teks `@`, mis. `013790032629726`)*
4. **Kolom D (4)**: `Deskripsi pengiriman` *(Sinkron 2 Arah WMS <-> GSheet)*
5. **Kolom E (5)**: `Services` *(Kode asli JNE: `CTC23`, `REG23`, `CTCYES23`, `YES23`, `JTR23`, dll.)*
6. **Kolom F (6)**: `Receiver Name`
7. **Kolom G (7)**: `Destination`
8. **Kolom H (8)**: `Shipper Name` *(Default: `CCH-CHOCOCHIPS`)*
9. **Kolom I (9)**: `Amount` *(Numerik Rupiah `"Rp   "#,##0`)*
10. **Kolom J (10)**: `Tanggal Pengiriman` *(`Date` format `dd/mm/yyyy`)*
11. **Kolom K (11)**: `Agen` *(Default: `JNE Member`)*

### B. Tab `JNECorporated` (`sheet=corporate`, Nama Sheet Asli: `JNECorporate`, `gid = 843586287`, A..L)
1. **Kolom A (1)**: `""` *(Margin kosong)*
2. **Kolom B (2)**: `No Resi` *(Format teks `@`, mis. `0148192500000060`, `CGKEC79399447826`)*
3. **Kolom C (3)**: `Deskripsi pengiriman` *(Sinkron 2 Arah WMS <-> GSheet)*
4. **Kolom D (4)**: `Tanggal Kiriman` *(`Date` format `dd/mm/yyyy`)*
5. **Kolom E (5)**: `Nama Penerima`
6. **Kolom F (6)**: `Alamat Penerima` *(Alamat jalan lengkap)*
7. **Kolom G (7)**: `Kota Tujuan Penerima`
8. **Kolom H (8)**: `Service` *(`REG23`, `CTC23`, `YES23`, `CTCYES23`, `YES`, `YES*`)*
9. **Kolom I (9)**: `Ongkir` *(Numerik Rupiah)*
10. **Kolom J (10)**: `Nominal Asuransi` *(Numerik, default `0`)*
11. **Kolom K (11)**: `Status Pembayaran` (**READ-ONLY VLOOKUP FORMULA**: `=IFERROR(VLOOKUP(B{row},'Tagihan JNECorporate'!L:N,3,0),"Belum Ada Tagihan")`)
12. **Kolom L (12)**: `Agen` *(Default: `JNECorporated`)*

---

## 2. Invarian Kritis Penulisan & Sinkronisasi 2 Arah
1. **Deteksi Baris Terakhir Berbasis Kolom Resi (`findLastDataRowByResiCol`)**:
   - Pada `JNECorporate`, formula `VLOOKUP` di Kolom K terisi sampai baris 2961+ meski baris 2697 ke bawah masih kosong resinya. **DILARANG** memakai `sheet.getLastRow() + 1` untuk append — wajib memindai Kolom Resi (`resiCol`) dari bawah ke atas agar baris baru langsung masuk setelah resi terakhir yang terisi, dan `doGet` wajib melewati baris tanpa `No Resi`.
2. **Proteksi Rumus VLOOKUP Kolom K `JNECorporate`**:
   - **DILARANG** menimpa Kolom K (`Status Pembayaran`) dengan teks biasa saat `upsertRecords` atau `updateRecord`. GAS wajib menulis rentang `B..J` dan `L` secara terpisah, serta hanya mengisi formula `VLOOKUP` pada baris baru jika sel Kolom K-nya belum berformula.
3. **Proteksi Leading Zero `Cnote No` / `No Resi`**:
   - Di GAS (`gas/jne_tagihan_backend.js`), **WAJIB** memanggil `.setNumberFormat("@")` pada Kolom Resi (`C` untuk member, `B` untuk corporate) **SEBELUM** `.setValues(...)` agar resi angka panjang tidak terpotong nol depan (`0137900...`, `014819...`) maupun berubah menjadi notasi ilmiah (`1.9126E+14`).
4. **Jangan Memangkas Kode `Services`**:
   - Pertahankan kode layanan asli (`CTC23`, `REG23`, `CTCYES23`, `YES23`, `YES`, `YES*`) apa adanya.
5. **Sinkronisasi 2 Arah Aman Deskripsi Pengiriman**:
   - Edit inline maupun batch hanya menulis ke `cfg.descCol` (`D` untuk member, `C` untuk corporate) dengan `LockService`, dan import tidak pernah mengosongkan deskripsi manual yang sudah ada secara default.
6. **Dilarang Auto-Match Berdasarkan Nama Penerima**.
7. **IndexedDB Cache + 200-Row Block Delta Sync (`WMS_LOCAL_DB` `meta` store)**:
   - Cache resi JNE (`jne_rekap_idb_member_v1`, `jne_rekap_idb_corporate_v1`) wajib disimpan di IndexedDB (`loadJneSnapshotFromIndexedDb` / `saveJneSnapshotToIndexedDb`) — DILARANG menyimpan ribuan baris ke `localStorage` agar tidak kena `QuotaExceededError`.
   - `doGet` di `gas/jne_tagihan_backend.js` wajib mendukung parameter delta (`client_sig`, `client_count`, `since_row`, `bs` = hash FNV-1a per blok 200 baris) dan mengembalikan `mode: "unchanged"` (~250B), `mode: "delta"` (`changed_blocks` + baris blok berubah saja), atau `mode: "full"` (dengan *self-healing* otomatis jika `merged.length !== total_records`). Mutasi lokal wajib mengosongkan `signature` sementara agar sinkronisasi berikutnya menarik blok terbaru.

---

## 3. Hak Akses Role (`canManageJneRekap`) & Standar UI Anti-Slop
- **Isi/Ubah Deskripsi & Tambah/Import Data**: Semua user dengan akses `canAccessJneRekap(session)`.
- **Edit Lengkap (`updateRecord`) & Hapus Baris (`deleteRecords`)**: Wajib dijaga `canManageJneRekap(session)` (Admin & Warehouse).
- **Copywriting UI**: Dilarang memunculkan huruf kolom mentah (`Kolom D Kosong`) atau istilah teknis AI (`memparsing`); gunakan istilah natural (`Perlu Isi Deskripsi`, `Deskripsi Lengkap`, `Total Resi`) sesuai `.agents/skills/wms-antislop-copy/SKILL.md`.
