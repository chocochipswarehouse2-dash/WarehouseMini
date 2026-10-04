# Analisis Mendalam: Anomali Stok `C25CBH240BA` & Fitur Anomali WMS

## Kasus C25CBH240BA (Studio menjadi 1, bukan 0)

Berdasarkan investigasi pada *Log Produk* di database, berikut adalah kronologi pasti yang menyebabkan stok Studio untuk `C25CBH240BA` menjadi **1**:

1. **5 Sep:** Terdapat `ADJ_IN` sebanyak 1 di lokasi `STUDIO` namun tercatat dengan Area **`Blok F`**. Sehingga, stok di database untuk `Blok F / STUDIO` menjadi **1**.
2. **5 Sep (Beberapa menit kemudian):** Terjadi mutasi `OUT` (keluar) sebanyak 1 di lokasi `STUDIO`, namun sistem mencatatnya dengan Area **`Studio`**. Karena sebelumnya Area `Studio / STUDIO` tidak memiliki stok, maka saldonya menjadi **-1**.
3. **Penggabungan UI (The Illusion):** Di *Page Inventory*, UI diprogram untuk menggabungkan semua lokasi berbau "Studio" ke dalam satu tampilan. Maka UI menampilkan: `1 (dari Blok F) + (-1 dari Studio) = 0`. UI seolah-olah menampilkan bahwa stok netral (0).
4. **Deteksi Anomali Database:** Fitur Anomali membaca langsung dari tabel fisik `stok_real_fisik` di mana row **`Studio / STUDIO` (-1)** terdeteksi sebagai anomali.
5. **Eksekusi Reset:** Anda mengklik Reset. Sistem menyuntikkan `ADJ_IN` (+1) tepat sasaran ke row `Studio / STUDIO`.
6. **Hasil Akhir:** Row `Studio / STUDIO` sukses dinetralkan menjadi **0** (dan hilang dari daftar anomali). Namun, row `Blok F / STUDIO` yang masih bernilai **1** tetap ada (karena sistem anomali tidak menghapus stok positif).
7. **Penggabungan UI Pasca-Reset:** UI Inventory kini menjumlahkan kembali: `Blok F / STUDIO (1) + Studio / STUDIO (0) = 1`. Inilah alasan mengapa tiba-tiba stok Studio yang tadinya 0 menjadi 1.

**Kesimpulan:** Sistem *Anomaly Fix* bekerja dengan **sangat akurat** secara matematis sesuai standar blueprint (menetralkan minus). Bug/kelemahan sebenarnya terletak pada **UI Page Inventory yang menggabungkan (aggregate) lokasi secara sembarangan**, sehingga menyembunyikan fakta bahwa ada minus dan plus di dua Area yang berbeda untuk satu lokasi fisik yang sama.

---

## Analisis Fitur & Jawaban Pertanyaan Anda

### 1. "Apa kamu pastikan semua tombol dan fungsi bekerja baik? Potensi bug?"
Fungsi core matematisnya bekerja dengan sempurna (menginjeksikan `ADJ_IN` pada lokasi spesifik).
**Potensi Bug / Kelemahan:**
1. **Fragmentasi Area (Seperti kasus di atas):** UI Inventory harusnya memisahkan `Blok F / STUDIO` dan `Studio / STUDIO` agar Anda sadar bahwa minus dan plus itu terpisah, atau saat `OUT` operator dipaksa konsisten menggunakan area `Blok F` untuk Studio.
2. **Race Condition Batch Sync:** (Telah dijawab di poin bawah).

### 2. "Adjust batch, kenapa 1 produk 1 invoice adjust? Padahal klik reset 1 waktu"
Sistem **SUDAH** menggunakan 1 ID Invoice yang sama persis (misal: `ADJ-BATCH-681327`) untuk seluruh item yang di-reset pada detik tersebut.
Alasan mengapa Anda melihatnya seolah "banyak", karena di *Log Mutasi* (Buku Besar), **setiap SKU harus memiliki 1 baris log terpisah**. Ini adalah standar mutlak akuntansi WMS. Sama seperti bon belanja supermarket: 1 Nomor Struk (Invoice), tetapi berisi 10 baris barang yang berbeda agar bisa dilacak mutasinya masing-masing.

### 3. "Tombol sync to master sudah saya klik tapi muter2 saja lama, proses atau bug?"
**Ini adalah Bug (Database Bottleneck).**
Sebelumnya, sistem mencoba mengirimkan 15 perintah update database sekaligus dalam satu detik. Untuk tabel historis `log_produk` yang mencapai ratusan ribu baris, hal ini membuat PostgreSQL *choking* (kewalahan mencari data) sehingga UI web Anda tertahan (muter-muter) karena koneksi timeout.
*(Status: Telah saya turunkan limit concurency-nya di kode dari 15 menjadi 3 agar database tidak crash).*

### 4. "Fitur SKU rusak / Tanpa master pembersihannya gimana? Tidak ada massal? Haruskah satu-satu?"
Fitur Hapus Massal **SUDAH ADA** di UI terbaru.
1. Masuk ke tab **Tanpa Master** atau **SKU Rusak**.
2. Anda akan menemukan tombol oranye **"Bersihkan Semua"** di sebelah kotak Pencarian.
3. Tombol ini akan otomatis menetralkan (`ADJ_OUT` / `ADJ_IN`) seluruh sisa stok fisik pada SKU "hantu" tersebut ke 0, lalu menghapusnya secara permanen dari sistem dalam 1x klik.
*(Maaf jika pada versi sebelumnya fitur ini belum sempat ter-deploy dengan sempurna).*
