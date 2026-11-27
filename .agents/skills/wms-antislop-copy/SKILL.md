---
name: wms-antislop-copy
description: Aturan penulisan copywriting UI berbahasa Indonesia yang natural, langsung ke intinya, dan bebas istilah teknis mentah / gaya bahasa AI kaku di seluruh modul WMS Inventory.
---

# WMS Anti-Slop UI Copy Standard

Semua agen coding WAJIB menulis label, judul kartu, tombol, placeholder, tooltip, dan pesan notifikasi menggunakan **bahasa operasional gudang/toko yang natural** — bukan terjemahan teknis sistem atau klise AI.

---

## 1. Dilarang Muncul di Teks UI Pengguna
1. **Huruf Kolom / Istilah Struktur Spreadsheet & Database**:
   - ❌ `"Kolom D Kosong"`, `"Kolom D Terisi"`, `"Isi Kolom D Massal"`, `"Deskripsi (Kolom D)"`, `"Cnote No (Kolom C)"`, `"total baris GSheet"`.
   - ✅ `"Perlu Isi Deskripsi"`, `"Deskripsi Lengkap"`, `"Isi Deskripsi Massal"`, `"Deskripsi Pengiriman"`, `"No. Resi (Cnote)"`, `"total resi"`.
2. **Jargon Developer / Teknis AI**:
   - ❌ `"memparsing"`, `"pratinjau hasil parsing"`, `"diurai ke staging"`, `"upsert ke GSheet"`, `"payload tidak valid"`, `"fallback lokal"`.
   - ✅ `"membaca"`, `"hasil baca data"`, `"siap disimpan"`, `"simpan ke Google Sheets"`, `"data belum lengkap"`, `"mode offline"`.
3. **Kalimat Instruksi Bertele-tele / Meta-Deskriptif**:
   - ❌ `"Pilih sumber input: Upload Excel/CSV, Lampiran Gambar/Screenshot (AI Vision), Input Manual, atau Tempel Teks."`
   - ❌ `"Klik tombol Sinkron untuk menarik data dari GSheet JNEMember, atau klik Tambah / Import untuk memasukkan data baru."`
   - ✅ `"Import file Excel, CSV, PDF, gambar resi, atau input manual."`
   - ✅ `"Klik Sinkron untuk ambil data terbaru, atau Tambah Data untuk input baru."`

---

## 2. Tabel Padanan Cepat (Before -> After)

| Konteks | ❌ Hindari (Slop / Teknis) | ✅ Gunakan (Natural) |
|---|---|---|
| Filter belum diisi | `Kolom D Kosong` | `Perlu Isi Deskripsi` |
| Filter sudah diisi | `Kolom D Terisi` | `Deskripsi Lengkap` |
| Kartu KPI total | `Jumlah Cnote Tampil` / `Dari 1.494 total baris GSheet` | `Total Resi` / `Dari 1.494 resi` |
| Sub-keterangan KPI kosong | `Klik untuk lengkapi Kolom D` | `Klik untuk melengkapi` |
| Tombol aksi baris | `Kolom D` / `+ Isi D` / `Ubah Kolom D` | `Ubah` / `Isi Deskripsi` / `Ubah Deskripsi` |
| Modal massal | `Isi Kolom D Massal` | `Isi Deskripsi Massal` |
| Placeholder input | `Ketik deskripsi pengiriman (Enter = Simpan & Lanjut)` | `Ketik deskripsi, tekan Enter untuk simpan` |
| Progress screenshot/PDF | `Memproses... / Gagal memparsing lampiran` | `Membaca file... / Gagal membaca file` |
| Subjudul halaman | `Sinkron 2 arah dengan GSheet ... — untuk langsung memparsing screenshot` | `Sinkron otomatis dengan Google Sheets — klik deskripsi untuk mengisi, atau tekan Ctrl+V untuk tempel screenshot.` |

---

## 3. Prinsip Penulisan Cepat
- **Singkat & Operasional**: Gunakan kata yang langsung dipahami admin/operator (`Perlu Isi Deskripsi`, `Belum Ada Tagihan`, `Simpan`, `Hapus`).
- **Konsisten Istilah Domain**: Gunakan `No. Resi` / `Cnote`, `Deskripsi`, `Ongkir`, `Tujuan`, `Penerima`, `Google Sheets`.
- **Maksimal 1 Kalimat Pendek untuk Subjudul**: Jika tombol sudah jelas (`Tambah / Import`, `Sinkron`), jangan ulangi instruksinya panjang lebar di paragraf.
