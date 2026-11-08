# PRD & Plan: Modul Fulfilment Pesanan Online (Jalur C)

Modul di dalam WMS gudang fashion untuk menangani pesanan semua marketplace secara semi-manual: impor pesanan, picking list, scan-pack, dan handover ke kurir.

Status: Draft v1 · Pemilik produk: pengelola gudang · Stack: Supabase, Vercel, Google Apps Script (GAS)

## 1. Ringkasan

Pesanan online datang dari banyak marketplace, tetapi akses ke akun marketplace terbatas pada pesanan sehingga integrasi API langsung belum memungkinkan. Modul ini memakai **Jalur C (semi-manual)**: data pesanan diambil dari ekspor/CSV seller center (atau input manual), lalu seluruh proses gudang berjalan di WMS dengan task per PIC dan status tracking. Pembuatan label resmi dan request pickup tetap dilakukan di seller center masing-masing marketplace.

Struktur data dibuat generik (kolom `marketplace`, `order_source`) supaya nanti bisa naik ke integrasi aggregator atau API langsung tanpa mengubah alur gudang.

## 2. Masalah yang ingin diselesaikan

- Pesanan dari beberapa marketplace dikerjakan terpisah, tanpa satu tampilan terpusat.
- Picking dilakukan per pesanan, bukan per batch yang diurutkan berdasarkan lokasi rak, sehingga rute picker tidak efisien.
- Tidak ada validasi isi paket sebelum diserahkan ke kurir, sehingga rawan salah kirim (item atau ukuran salah).
- Serah terima ke kurir tidak tercatat per paket, sehingga paket hilang atau tertinggal sulit dilacak.
- Stok ready jual belum ter-reserve saat pesanan masuk, sehingga rawan oversell dan pesanan dibatalkan.
- Tidak ada pemantauan batas waktu (cut-off) pengiriman per kurir.

## 3. Tujuan dan indikator keberhasilan

| Tujuan | Indikator | Target awal |
| --- | --- | --- |
| Mengurangi salah kirim | Persentase paket salah isi yang lolos ke kurir | Mendekati 0% pada paket yang melewati scan-pack |
| Mempercepat picking | Rata-rata waktu picking per pesanan | Turun dibanding kondisi sebelum modul dipakai (ukur baseline di fase 0) |
| Menepati cut-off kurir | Persentase pesanan terkirim sebelum cut-off | Naik dan terlihat di dashboard harian |
| Kontrol serah terima | Paket ter-scan handover vs paket yang diambil kurir | 100% tercatat |
| Mencegah oversell | Pesanan batal karena stok tidak ada | Turun dibanding baseline |

### Bukan tujuan (fase ini)

- Integrasi API langsung ke marketplace atau aggregator.
- Pembuatan label atau resi oleh WMS sendiri.
- Request pickup otomatis dari WMS.
- Sinkronisasi stok balik ke marketplace.
- Pengelolaan retur pembeli secara penuh (hanya penanganan dasar, lihat F8).

## 4. Pengguna dan peran

Semua anggota tim bisa multi-role, jadi peran adalah **hak akses**, bukan jabatan tetap. Beberapa proses bisa berjalan bersamaan dengan urgensi sama.

| Peran | Pengguna tipikal | Kebutuhan utama |
| --- | --- | --- |
| Admin pesanan | Tim CS (fulfilment pesanan) | Impor pesanan, atur pengiriman di seller center, impor ulang resi, tangani pengecualian |
| Picker | Picker, helper | Menerima batch, mengambil barang sesuai rute rak, scan item |
| Packer/QC | QC Pass, picker, office boy | Scan-pack, validasi isi, kemasan, tempel label |
| Handover | Office boy, admin offline | Serah terima ke kurir dengan scan per paket |
| Supervisor | Warehouse (time keeper) | Pantau cut-off, beban kerja, antrean, dan masalah |

## 5. Alur end-to-end dan status

1. **Impor pesanan** → status `new`
2. **Pemetaan SKU dan reservasi stok** → `reserved` (atau `backorder` bila stok kurang)
3. **Atur pengiriman di seller center** (dilakukan CS di luar WMS), lalu **unduh label massal dan ekspor ulang** untuk mendapatkan nomor resi
4. **Impor resi** → pesanan siap dibuat batch
5. **Pembuatan batch dan picking list** → `batched`
6. **Picking dengan scan** → `picking` → `picked`
7. **Scan-pack (validasi isi + cocokkan resi)** → `packing` → `packed`
8. **Handover ke kurir (scan per paket)** → `handed_over`

Status samping: `cancelled`, `on_hold`, `exception`, `returned`.

Catatan: urutan di marketplace berbeda-beda (kapan nomor resi muncul, apakah label bisa diunduh massal). Detail per marketplace harus dikonfirmasi lewat contoh file di fase 0.

## 6. Kebutuhan fungsional

### F1. Impor pesanan

- Unggah file CSV/XLSX hasil ekspor seller center per marketplace.
- Satu *parser/adapter* per marketplace yang memetakan kolom ke format internal.
- Input manual untuk pesanan non-marketplace (misalnya offline atau chat).
- Deduplikasi berdasarkan `marketplace` + nomor pesanan, sehingga unggah ulang tidak membuat pesanan ganda.
- Pratinjau hasil impor (jumlah baru, duplikat, gagal beserta alasannya) sebelum disimpan.
- Penanganan pembatalan: impor ulang yang menandai pesanan sudah dibatalkan akan membatalkan task terkait.

### F2. Pemetaan SKU dan reservasi stok

- Tabel pemetaan SKU marketplace ke SKU internal (varian warna/ukuran).
- Pesanan dengan SKU belum terpetakan masuk antrean "perlu dipetakan", tidak diblokir seluruhnya.
- Reservasi hanya dari stok berstatus **ready jual** di lokasi yang sesuai; stok QC, defect, atau perbaikan tidak dihitung.
- Stok kurang memicu status `backorder` dan notifikasi ke admin pesanan.

### F3. Batch dan picking list

- Pembuatan batch otomatis per kurir/cut-off, atau manual oleh supervisor.
- Jenis batch: pesanan 1 item, multi item, dan campuran, supaya proses packing lebih cepat.
- Picking list diurutkan berdasarkan lokasi rak (rute), dapat dicetak (PDF) dan tampil di perangkat picker.
- Setiap batch membuat **task picking** dengan PIC, tenggat, dan status.
- Batch bisa dibagi ke beberapa picker.

### F4. Picking dengan scan

- Picker memindai barcode/tag item. Sistem memeriksa item benar dan jumlah sesuai.
- Item tidak ditemukan ditandai `short pick` dan masuk penanganan pengecualian.
- Progres batch terlihat real-time oleh supervisor.

### F5. Label dan resi

- Label resmi diunduh massal dari seller center dan dicetak di luar WMS (atau dari halaman cetak WMS bila PDF diunggah).
- Impor ulang ekspor pesanan untuk melengkapi nomor resi pada tiap pesanan.
- Pesanan tanpa resi tidak boleh masuk tahap packing, dan statusnya terlihat jelas.
- Pencocokan resi lewat scan barcode pada label saat packing.

### F6. Scan-pack (QC pengiriman)

- Packer memindai resi, sistem menampilkan isi pesanan, lalu packer memindai tiap item.
- Item salah atau berlebih memicu peringatan dan paket tidak bisa ditutup.
- Opsi cek kondisi barang (foto atau catatan) untuk barang yang dicurigai cacat.
- Pesanan selesai menjadi `packed` dan siap untuk handover.

### F7. Handover ke kurir

- Daftar paket per kurir untuk hari itu, dengan hitungan target vs ter-scan.
- Scan per paket saat serah terima, lalu catat waktu dan petugas.
- Penutupan sesi handover dengan ringkasan, dan bila perlu tanda tangan atau foto bukti.
- Selisih (paket belum ter-scan) ditampilkan sebelum kurir pergi.

### F8. Pengecualian

- Pesanan dibatalkan setelah picking: barang dikembalikan ke rak (task putaway) dan reservasi dilepas.
- Stok kurang atau barang cacat saat picking: tandai item, buat task QC/perbaikan, tawarkan penggantian atau pembatalan oleh CS.
- Retur dasar: terima paket retur, scan, arahkan ke zona QC, lalu perbarui status stok.
- Setiap pengecualian membuat task dengan PIC dan tercatat.

### F9. Dashboard dan pemantauan

- Antrean per tahap (baru, siap batch, picking, packing, siap handover).
- Hitung mundur cut-off per kurir dan daftar pesanan berisiko terlambat.
- Beban kerja per PIC dan produktivitas harian.
- Daftar pesanan bermasalah (tanpa resi, SKU belum terpetakan, backorder).

### F10. Integrasi task manager

- Setiap tahap (impor, batch, picking, packing, handover, pengecualian) otomatis membuat task dengan PIC dan status.
- Penugasan fleksibel untuk mendukung multi-role dan proses paralel.
- Notifikasi (WhatsApp/email lewat GAS) untuk task terlambat atau masalah kritis.

## 7. Kebutuhan non-fungsional

- **Kecepatan scan:** respons scan di bawah 1 detik, dan dapat dipakai di HP/scanner Bluetooth di jaringan gudang yang tidak selalu stabil.
- **Keandalan:** semua perubahan status tercatat dengan waktu dan pengguna (audit log).
- **Akses:** hak akses per peran, dan impor serta pembatalan hanya untuk admin pesanan.
- **Keamanan data:** data pelanggan (nama, alamat, telepon) hanya tampil bila perlu, dan dibatasi sesuai peran.
- **Perangkat:** antarmuka responsif untuk HP dan desktop, dengan halaman cetak untuk picking list.
- **Skalabilitas:** struktur adapter per marketplace supaya menambah marketplace atau mengganti ke API tidak merombak alur.

## 8. Model data (tabel utama)

| Tabel | Isi pokok |
| --- | --- |
| `orders` | marketplace, order\_no, resi, kurir, status, cut\_off, buyer ringkas, waktu per tahap |
| `order_items` | order\_id, sku\_marketplace, sku\_internal, qty, qty\_picked, qty\_packed |
| `sku_mappings` | marketplace, sku\_marketplace, sku\_internal |
| `stock_reservations` | order\_item\_id, lokasi, qty, status |
| `pick_batches` | tipe, kurir, cut\_off, status, PIC |
| `pick_batch_orders` | batch\_id, order\_id, urutan |
| `scan_logs` | jenis scan (pick/pack/handover), kode, order\_id, pengguna, waktu, hasil |
| `handover_sessions` | kurir, tanggal, jumlah target, jumlah ter-scan, petugas, status |
| `import_jobs` | marketplace, file, hasil (baru, duplikat, gagal), pengguna |
| `tasks` | tautan ke task manager WMS (tipe, PIC, status, tenggat, referensi) |

Tabel stok dan lokasi mengikuti struktur WMS yang sudah ada (status barang: baru, QC, lolos QC, defect/perbaikan, ready jual). Reservasi hanya merujuk ke stok ready jual.

## 9. Arsitektur dan integrasi

- **Supabase:** database, autentikasi, dan hak akses (RLS) per peran. Fungsi atomik (misalnya reservasi stok dan scan) dibuat di sisi database/Edge Function agar tidak terjadi *race condition* saat banyak PIC bekerja bersamaan.
- **Vercel:** antarmuka web (impor, batch, scan, dashboard) dan halaman cetak picking list.
- **GAS:** tetap untuk jembatan WhatsApp, email, dan Google Drive (notifikasi, arsip file impor). Logika inti tidak dijalankan di GAS.
- **Adapter marketplace:** modul parser terpisah per marketplace, dengan format keluaran yang sama.

## 10. Risiko dan asumsi

| Risiko / asumsi | Dampak | Mitigasi |
| --- | --- | --- |
| Format ekspor tiap marketplace berbeda dan bisa berubah | Impor gagal atau salah petakan | Kumpulkan contoh file di fase 0, buat pratinjau impor, uji tiap kali format berubah |
| Nomor resi baru ada setelah atur pengiriman | Alur dua kali impor, rawan terlewat | Status jelas "menunggu resi" dan daftar pesanan tanpa resi di dashboard |
| Langkah manual di seller center jadi hambatan pada jam sibuk | Cut-off terlewat | Dashboard cut-off, jadwal impor per jam, dan evaluasi naik ke Jalur A/B bila volume besar |
| Pemetaan SKU tidak lengkap | Pesanan tertahan | Antrean "perlu dipetakan" dan impor massal pemetaan |
| Barcode/tag item belum konsisten | Scan gagal | Pastikan semua stok ready jual punya barcode, sejalan dengan proses tempel tag di QC New Arrival |
| Jaringan gudang tidak stabil | Scan terhambat | Antrean scan lokal sementara dan sinkron ulang, diuji di lapangan |

Asumsi: stok ready jual dan lokasi rak sudah dikelola di WMS dan akurat; barcode/tag item sudah tersedia atau akan distandarkan.

## 11. Rencana pengembangan

Estimasi kasar, bergantung pada jumlah developer dan kecepatan umpan balik dari tim gudang. Setiap fase ditutup dengan uji coba nyata di gudang.

| Fase | Durasi estimasi | Isi | Hasil / kriteria selesai |
| --- | --- | --- | --- |
| 0. Persiapan | 1 minggu | Kumpulkan contoh ekspor tiap marketplace, daftar kurir dan cut-off, ukur baseline (waktu picking, salah kirim, pesanan batal), keputusan format barcode | Dokumen format impor dan baseline tersedia |
| 1. Fondasi data dan impor | 1-2 minggu | Skema tabel, adapter marketplace pertama (yang volumenya terbesar), pratinjau impor, deduplikasi, pemetaan SKU | Pesanan satu marketplace masuk benar ke WMS |
| 2. Batch dan picking | 1-2 minggu | Reservasi stok, pembuatan batch, picking list cetak/HP, scan picking, task picking | Satu batch nyata selesai dipicking lewat WMS |
| 3. Resi dan scan-pack | 1-2 minggu | Impor resi, scan-pack, validasi isi, status packed | Paket lolos validasi sebelum diserahkan |
| 4. Handover dan dashboard | 1 minggu | Sesi handover, dashboard cut-off dan antrean, notifikasi via GAS | Serah terima tercatat per paket |
| 5. Pengecualian dan adapter lain | 1-2 minggu | Pembatalan, short pick, retur dasar, adapter marketplace berikutnya | Semua marketplace aktif ditangani |
| 6. Pilot dan penyempurnaan | 1-2 minggu | Pilot paralel dengan cara lama, perbaiki berdasarkan masukan tim, pelatihan | Kriteria keberhasilan (bagian 3) terukur |

**Urutan rilis yang disarankan:** pilot dimulai dari satu marketplace dan satu jam cut-off, lalu diperluas bertahap. Cara lama tetap berjalan paralel sampai hasil pilot stabil.

## 12. Pertanyaan terbuka

1. Marketplace apa saja dan berapa volume pesanan harian masing-masing? (menentukan urutan adapter)
2. Kurir apa saja yang dipakai, dan kapan masing-masing cut-off-nya?
3. Apakah seluruh stok ready jual sudah punya barcode/tag yang bisa discan, dan format kodenya apa?
4. Perangkat apa yang dipakai di lapangan (HP, scanner Bluetooth, printer thermal)?
5. Siapa yang mengatur pengiriman di seller center dan pada jam berapa saja?
6. Bagaimana aturan penggantian bila stok kurang saat picking (ganti varian, batalkan, tunggu)?

## 13. Jalur naik ke integrasi otomatis (nanti)

Karena struktur data dan alur gudang sudah generik, peningkatan ke aggregator atau API langsung hanya mengganti **sumber pesanan** (F1) dan **sumber resi/label** (F5), serta menambah fungsi request pickup otomatis. Alur picking, scan-pack, handover, dan task manager tidak berubah.
