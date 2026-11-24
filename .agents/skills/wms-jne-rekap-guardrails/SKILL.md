---
name: wms-jne-rekap-guardrails
description: Guardrails, Google Sheets JNEMember column schema (A..K), 2-way Column D sync invariants, role-based Edit/Delete rules (Admin & Warehouse), and multi-source parsing standards (Excel, CSV, Gemini Vision Screenshot/Image, PDF, Paste) for Rekap Tagihan JNE. Activate whenever modifying JneRekapView.tsx, jneRekapService.ts, jneRekapParser.ts, or gas/jne_tagihan_backend.js.
---

# WMS Rekap Tagihan JNE (`JNEMember`) — Guardrails & Invariants

Wajib dibaca dan dipatuhi oleh **SEMUA agen coding** setiap kali mengubah modul **Rekap Tagihan JNE** (`src/components/JneRekapView.tsx`, `src/services/jneRekapService.ts`, `src/services/jneRekapParser.ts`, `gas/jne_tagihan_backend.js`, `src/services/permissions.ts`).

---

## 1. Sumber Kebenaran Google Sheets (`JNEMember`)
- **Spreadsheet ID**: `1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k`
- **Target Sheet**: `JNEMember` (`gid = 1026608111`)
- **GAS Script ID**: `1Z1cIj3vnYR_CxK_SLuFqeOvlxnT5dUf7brhgW2X1Njj-Qr0qC7F9QmgZ`
- **Struktur Kolom Baku (Baris 1 = Header, Baris 2+ = Data)**:
  1. **Kolom A (1)**: `""` *(Margin kosong — jangan digeser)*
  2. **Kolom B (2)**: `No`
  3. **Kolom C (3)**: `Cnote No` *(Nomor Resi JNE, mis. `013790032629726`)*
  4. **Kolom D (4)**: `Deskripsi pengiriman` *(Sinkronisasi 2 Arah Frontend WMS <-> GSheet)*
  5. **Kolom E (5)**: `Services` *(Kode asli JNE: `CTC23`, `REG23`, `CTCYES23`, `YES23`, `JTR23`, dll.)*
  6. **Kolom F (6)**: `Receiver Name` *(Nama Penerima)*
  7. **Kolom G (7)**: `Destination` *(Kecamatan/Kota Tujuan)*
  8. **Kolom H (8)**: `Shipper Name` *(Default: `CCH-CHOCOCHIPS`, atau `CCH-ERICA STEPHANIE`)*
  9. **Kolom I (9)**: `Amount` *(Numerik murni Rupiah dengan format sel `"Rp   "#,##0`)*
  10. **Kolom J (10)**: `Tanggal Pengiriman` *(Objek `Date` pukul 12:00 siang dengan format sel `dd/mm/yyyy`)*
  11. **Kolom K (11)**: `Agen` *(Default: `JNE Member`)*

---

## 2. Invarian Kritis Penulisan & Sinkronisasi 2 Arah
1. **Proteksi Leading Zero `Cnote No` (`0137900...`)**:
   - Di GAS (`gas/jne_tagihan_backend.js`), **WAJIB** memanggil `.setNumberFormat("@")` pada Kolom C **SEBELUM** `.setValues(...)` agar angka `0` di depan nomor resi tidak pernah terpotong oleh auto-coercion angka Google Sheets.
   - Saat membaca GSheet (`doGet`) maupun Excel (`XLSX`), gunakan `getDisplayValues()` / `raw: false` untuk Kolom C agar leading `0` terjaga 100%.
2. **Jangan Memangkas Kode `Services`**:
   - Pertahankan kode layanan asli JNE Member seperti `CTC23`, `REG23`, `CTCYES23`, `YES23` apa adanya — **DILARANG** mengubah `CTC23` menjadi `REG`.
3. **Sinkronisasi 2 Arah Aman Kolom D (`Deskripsi pengiriman`)**:
   - Edit inline maupun batch Kolom D di WMS hanya menulis ke sel `D{row}` (`action: "updateDeskripsi"` / `"bulkUpdateDeskripsi"`) dengan `LockService`, tanpa menimpa rumus/kolom lain di GSheet.
   - Saat import resi yang `Cnote No`-nya sudah ada di GSheet, secara default (`overwriteDeskripsi = false`) **DILARANG menimpa/mengosongkan** Kolom D di GSheet yang sudah diisi manual oleh user di GSheet.
   - **DILARANG** melakukan full-sheet overwrite dari state seluruh tabel frontend ke GSheet; hanya kirim baris baru/staging yang ditambahkan atau baris spesifik yang diedit.
4. **Dilarang Auto-Match Berdasarkan Nama Penerima**:
   - Nama penerima (`Receiver Name`) sering kembar/mirip antar pesanan berbeda. Jangan pernah menebak deskripsi pengiriman dari nama penerima.

---

## 3. Hak Akses Role (`canManageJneRekap`)
- **Isi / Edit Kolom D & Tambah / Import Data**: Semua user yang memiliki hak akses halaman `canAccessJneRekap(session)`.
- **Edit Lengkap Seluruh Kolom (`updateRecord`) & Hapus Baris GSheet (`deleteRecords`)**: **WAJIB** dijaga dengan `canManageJneRekap(session)` (khusus role/akun **Admin** & **Warehouse**, menolak akun Store/Outlet).
- Penghapusan baris di GAS **WAJIB** diurutkan *descending* (dari nomor baris terbesar ke terkecil / bawah ke atas) dengan penggabungan blok `sheet.deleteRows(startRow, count)` agar indeks baris atas tidak bergeser.

---

## 4. Standar Multi-Source Parser & UI
- Semua file import (**Excel `.xlsx/.xls`**, **CSV `.csv`**, **Gambar/Screenshot `.png/.jpg/.webp` via `/api/ai` Gemini Vision + `Ctrl+V` Paste**, **PDF `.pdf`**, dan **Tempel Teks**) **WAJIB** masuk ke **Tabel Staging Pratinjau** terlebih dahulu agar user dapat mengecek status `BARU` vs `ADA` dan mengoreksi sel sebelum disimpan ke `JNEMember`.
- Antarmuka wajib mematuhi standar 2-Mode (`Tabel` & `Kartu`), zero horizontal scroll pada mode Tabel Mobile (`md:hidden`), maksimal 1 tombol solid primary di header toolbar, dan paginasi client-side (`50`/`100`/`250`/`Semua`) agar tetap instan pada ribuan baris resi.
