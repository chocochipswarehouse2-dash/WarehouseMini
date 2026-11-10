# PRD & Plan: Modul Fulfilment Pesanan Online (Jalur C)

Modul di dalam WMS gudang fashion untuk menangani pesanan semua marketplace secara semi-manual: impor pesanan, picking list, scan-pack, dan handover ke kurir.

Status: Draft v2 · Pemilik produk: pengelola gudang · Stack: Supabase, Vercel, Google Apps Script (GAS)

## 1. Ringkasan

Modul ini membuat gudang bisa memproses pesanan semua marketplace dalam satu sistem tanpa integrasi API: CS mengekspor data dari Seller Center, mengimpornya ke WMS, dan seluruh proses gudang berjalan di WMS dengan task per PIC. Pendekatannya **Jalur C (semi-manual)**, karena akses ke akun marketplace terbatas pada pesanan.

**SOP impor:** CS selalu menarik ekspor dari **tab "Semua"** di Shopee, bukan tab Perlu Dikirim. Hanya tab Semua yang memuat pesanan batal dan alasan pembatalannya, dan itu dibutuhkan untuk alert tahan paket (bagian 6).

Label resmi dan request pickup tetap dilakukan CS di Seller Center. Struktur data dibuat generik (`marketplace`, `order_source`) supaya naik ke aggregator atau API langsung nanti tidak mengubah alur gudang.

## 2. Masalah, tujuan, dan ruang lingkup

Modul ini menutup enam masalah fulfilment pesanan online dan diukur dengan enam indikator di bawah.

- Pesanan dari beberapa marketplace dikerjakan terpisah, tanpa satu tampilan terpusat.
- Picking dilakukan per pesanan, bukan per batch yang diurutkan berdasarkan lokasi rak.
- Isi paket tidak divalidasi sebelum diserahkan ke kurir, sehingga rawan salah kirim.
- Serah terima ke kurir tidak tercatat per paket.
- Pesanan yang dibatalkan setelah diproses bisa tetap sampai ke kurir, dan stok belum ter-reserve saat pesanan masuk (rawan oversell).
- Tenggat tidak dipantau per pesanan, padahal sekitar 38% baris pesanan Shopee adalah Instant atau Same Day.

| Tujuan | Indikator | Target awal |
| --- | --- | --- |
| Mengurangi salah kirim | Persentase paket salah isi yang lolos ke kurir | Mendekati 0% pada paket yang melewati scan-pack |
| Mencegah paket batal terkirim | Paket berstatus TAHAN yang sampai ke kurir | 0; setiap alert selesai sebelum handover |
| Menepati tenggat | Persentase pesanan siap sebelum tenggatnya, instan dan Same Day dipantau terpisah | Naik dibanding baseline fase 0 |
| Kontrol serah terima | Paket diambil kurir vs paket ter-scan | 100% tercatat |
| Mempercepat picking | Rata-rata waktu picking per pesanan | Turun dibanding baseline fase 0 |
| Mencegah oversell | Pesanan batal karena stok tidak ada | Turun dibanding baseline fase 0 |

### Di luar ruang lingkup fase ini

- Integrasi API langsung ke marketplace atau aggregator.
- Pembuatan label atau resi oleh WMS, dan request pickup otomatis.
- Sinkronisasi stok balik ke marketplace.
- Pengelolaan retur pembeli secara penuh (hanya penanganan dasar, lihat F9).
- Pesanan "Pengiriman Kilat" (dikirim dari stok Shopee): tidak diproses gudang dan tidak pernah muncul di Perlu Dikirim.

## 3. Pengguna dan peran

Peran adalah **hak akses**, bukan jabatan tetap: semua anggota tim bisa multi-role, dan beberapa proses berjalan bersamaan dengan urgensi sama.

| Peran | Pengguna tipikal | Kebutuhan utama |
| --- | --- | --- |
| Admin pesanan | Tim CS (fulfilment pesanan) | Impor dari tab Semua, cetak picking list/ceklis, request pickup, cetak label, tangani pengecualian dan alert pembatalan |
| Picker | Picker, helper | Menerima batch, mengambil barang sesuai rute rak |
| Packer/QC | QC Pass, picker, office boy | Scan-pack, validasi isi, kemasan, tempel label |
| Handover | Office boy, admin offline | Serah terima ke kurir dengan scan per paket |
| Supervisor | Warehouse (time keeper) | Pantau tenggat, beban kerja, antrean, pesanan pre-order, dan alert |

## 4. Temuan dari data Shopee

Sepuluh temuan dari ekspor Shopee 9 Okt sampai 8 Nov 2026 (2.807 baris, 2.160 pesanan) menentukan aturan impor, status, dan validasi di bagian berikutnya.

| Temuan | Dampak pada rancangan |
| --- | --- |
| Satu baris per item. 83% pesanan hanya berisi satu item (1.790 dari 2.160), maksimum 11 item | Kunci impor = No. Pesanan, baris digabung per pesanan; jalur cepat untuk pesanan satu item |
| Resi baru ada setelah pengiriman diatur: dari 47 baris Perlu Dikirim, hanya 1 yang punya resi (status Telah diproses) | Alur impor berulang; resi dilengkapi di impor berikutnya; picking tidak menunggu resi |
| Tenggat ada per pesanan dengan jam spesifik: reguler 23:59, instan dan Same Day lebih awal (mis. 11:00, 16:59). Sekitar 38% baris adalah Instant atau Same Day | Prioritas dan batch berdasarkan tenggat, bukan hanya kurir; jalur prioritas instan |
| 28 variasi penulisan Opsi Pengiriman; format resi berbeda per kurir (awalan SPXI, SD-, IN-, GK-, angka untuk JNE) | Tabel normalisasi ke kurir, layanan, dan golongan; validasi scan resi per kurir |
| Teks status tidak baku, mis. "Pesanan diterima, namun Pembeli masih dapat mengajukan pengembalian hingga \<tanggal>" | Pemetaan ke status internal dengan pencocokan awalan |
| Sekitar seperempat baris berstatus Batal, separuhnya otomatis karena belum dibayar. 6 pesanan batal sudah punya resi. Status Batal dan alasannya hanya ada di ekspor Semua | SOP impor dari tab Semua; alert tahan paket (bagian 6) |
| Pre-order tidak bertanda eksplisit. Tenggat 34 sampai 42 hari pada 28 pesanan, berlaku per pesanan, dibanding 0 sampai 4 hari pada pesanan lain | Pesanan bertenggat panjang masuk antrean Pre-order; penanda `is_preorder` per SKU |
| Nomor Referensi SKU unik per varian (1.104 kode). Sekitar 4% baris tanpa SKU Induk (kemasan bagkecil dan BAGBESAR). 235 baris adalah hadiah gratis (freeleatherwallet, harga Rp0) | Kunci pemetaan SKU; penanda item kemasan dan item hadiah (ikut dipacking, bukan stok jual) |
| Volume: median 42 pesanan per hari, puncak 269 pada 10 Okt; pesanan masuk merata 24 jam | Batch bergulir per jam; kapasitas dirancang sekitar 5 kali median |
| Pesanan "Pengiriman Kilat" (dikirim dari stok Shopee) tidak muncul di Perlu Dikirim | Hanya status Perlu Dikirim yang membuat task gudang |

## 5. Alur end-to-end

Pesanan melewati satu jalur bersama sampai picking list dicetak, lalu terbagi menurut layanan.

&#91;embedded content: alur fulfilment · dua jalur dan satu pengaman pembatalan\]

Pada jalur reguler, CS meminta pickup dan mencetak label segera setelah picking list dicetak. Pada instan dan Same Day, request pickup baru dilakukan setelah paket siap, jadi packing divalidasi lewat No. Pesanan dan resi diikat saat label ditempel.

Resi adalah atribut pesanan, bukan status: pesanan bisa sedang diproses dengan atau tanpa resi.

### Status pesanan di WMS

| Status | Arti | Masuk saat |
| --- | --- | --- |
| `new` Baru | Pesanan hasil impor, picking list belum dicetak | Impor |
| `preorder` Pre-order | Tidak ikut batch; dilepas supervisor | Impor: tenggat lebih dari 5 hari atau SKU `is_preorder` |
| `processing` Sedang diproses | Picking list dan ceklis sudah dicetak | CS mengonfirmasi cetak |
| `packed` Packed | Isi paket lolos scan-pack | Scan-pack selesai |
| `ready_pickup` Siap request pickup | Hanya instan dan Same Day: CS meminta pickup sekarang | Packed |
| `handed_over` Diserahkan | Paket sudah diserahkan ke kurir | Scan handover |
| `hold` TAHAN | Pesanan batal terdeteksi saat sudah diproses; paket ditarik | Impor berikutnya |
| `check` Perlu dicek | Resi berbeda, atau pesanan hilang dari ekspor sebelum diserahkan | Impor berikutnya |

Status samping: `cancelled` dan `returned`.

## 6. Aturan impor dan pembatalan

Setiap impor mencocokkan pesanan lewat No. Pesanan, dan hasilnya ditentukan tabel di bawah. CS mengekspor dari tab Semua pada setiap putaran; hanya pesanan berstatus Perlu Dikirim yang membuat task gudang, sedangkan status lain hanya memperbarui pesanan yang sudah ada.

| Kondisi di file baru | Sudah pernah diimpor? | Resi di impor pertama | Tindakan |
| --- | --- | --- | --- |
| Belum ada resi | Belum | - | Pesanan baru, masuk tab Pesanan Baru (atau Pre-order bila tenggat panjang) |
| Belum ada resi | Sudah | - | Dilewati, tidak diimpor ulang |
| Sudah ada resi | Belum | - | Pesanan baru dengan penanda "resi sudah ada" (admin mungkin tidak sengaja klik request pickup). Instan dan Same Day ditandai mendesak, karena kurir mungkin sudah dipanggil |
| Sudah ada resi | Sudah | Belum ada | Hanya resi yang dilengkapi; status tidak ditarik kembali ke tab Pesanan Baru |
| Sudah ada resi | Sudah | Sudah ada | Dilewati; bila resinya berbeda, ditandai Perlu dicek |
| Pesanan lama tidak ada di file baru | Sudah | - | Bila di WMS belum diserahkan ke kurir, ditandai Perlu dicek |

Setiap impor menampilkan ringkasan: berapa pesanan baru, dilewati, resi dilengkapi, dan perlu dicek.

### Alert pembatalan

Pesanan yang sudah di WMS dan terbaca berstatus Batal pada impor berikutnya otomatis menjadi **TAHAN**, supaya paket tidak sampai ke kurir. Tindakannya tergantung posisi pesanan:

| Posisi di WMS | Tindakan |
| --- | --- |
| Sedang diproses (picking list sudah dicetak) | Alert merah ke CS dan picker; picking pesanan ini dihentikan |
| Sudah dipick atau sedang packing | Paket dihentikan dan tidak boleh ditutup; task "tarik paket" untuk petugas packing |
| Packed atau siap pickup, di meja packing | Task "tarik paket dari meja" dengan PIC; setelah barang kembali ke rak, reservasi stok dilepas |
| Sudah diserahkan ke kurir | Alert khusus bahwa paket sudah di kurir; CS menindaklanjuti ke kurir atau Shopee, barang diperlakukan sebagai retur |

Lapisan pengaman:

- Alert muncul di dashboard dan layar packing, dan notifikasi WhatsApp lewat GAS dikirim ke CS dan supervisor. Task baru tertutup setelah petugas mengonfirmasi paket sudah ditemukan dan dipisahkan.
- Scan handover atas paket berstatus TAHAN diblokir dengan peringatan merah dan bunyi. Ini pengaman terakhir bila alert terlewat.
- Sesi handover menampilkan waktu impor terakhir dan memberi peringatan bila sudah lewat batas tertentu. Sebelum kurir datang, CS mengimpor ulang sebagai pemeriksaan terakhir, terutama untuk instan dan Same Day.

Keterbatasan Jalur C: alert hanya secepat putaran impor. Pembeli bisa membatalkan kapan saja setelah impor terakhir, jadi risikonya sebanding dengan jarak antar impor dan lapisan scan saat handover.

## 7. Kebutuhan fungsional

Sebelas kebutuhan mencakup impor, picking, validasi packing, handover, dan pengaman pembatalan.

### F1. Impor pesanan

- Unggah XLSX/CSV ekspor tab Semua. Importer membaca sheet "orders" berdasarkan namanya dan mengabaikan sheet lain (mis. "Advance Fulfilment").
- Satu adapter per marketplace memetakan kolom ke format internal, dan baris digabung per No. Pesanan.
- Aturan impor ulang mengikuti bagian 6, dengan pratinjau hasil (baru, dilewati, resi dilengkapi, perlu dicek, gagal) sebelum disimpan.
- Normalisasi: Opsi Pengiriman menjadi kurir, layanan, dan golongan (instan, Same Day, reguler); teks status menjadi status internal lewat pencocokan awalan. Usulan golongan: Instant dan Instant Prioritas = instan, Same Day = Same Day, Reguler, Hemat Kargo, dan Next Day = reguler.
- Hanya status Perlu Dikirim yang membuat task. Input manual tersedia untuk pesanan non-marketplace.

### F2. Pemetaan SKU, jenis item, dan reservasi stok

- Tabel pemetaan Nomor Referensi SKU ke SKU internal (varian warna dan ukuran). SKU yang belum terpetakan masuk antrean "perlu dipetakan" tanpa memblokir seluruh impor.
- Jenis item: barang jual, item hadiah (harga Rp0, ikut dipacking, bukan stok jual), dan item kemasan (tidak dipicking).
- Reservasi hanya dari stok ready jual. Stok kurang memberi status `backorder` dan notifikasi ke admin pesanan.
- Pesanan bertenggat lebih dari 5 hari (ambang bisa diubah) atau berisi SKU `is_preorder` masuk status `preorder`: tidak ikut batch dan baru direservasi saat dilepas supervisor.

### F3. Picking list dan lembar ceklis CS

- Batch bergulir per jam, dikelompokkan menurut tenggat pesanan, bukan hanya kurir. Instan dan Same Day mendapat jalur prioritas, dan pesanan satu item mendapat jalur cepat.
- Picking list diurutkan menurut lokasi rak sekaligus menjadi lembar ceklis CS, dengan barcode No. Pesanan per pesanan dan nomor batch.
- CS mengonfirmasi cetak, lalu pesanan menjadi Sedang diproses. Cetak ulang diperbolehkan dan tercatat.
- Setiap batch membuat task picking dengan PIC, tenggat, dan status.

### F4. Picking

- Picker mengambil barang menurut rute rak dan mencentang di lembar. Short pick ditandai dan masuk F9.
- Asumsi fase awal: picking memakai ceklis, dan validasi penuh terjadi di scan-pack (F6).

### F5. Request pickup dan label (di Seller Center)

- Dilakukan CS di luar WMS: reguler segera setelah picking list dicetak, instan dan Same Day setelah paket siap.
- WMS menampilkan antrean "siap request pickup" untuk instan dan Same Day dengan hitung mundur tenggat.
- Resi masuk ke WMS lewat impor berikutnya, atau diikat saat scan label (F6). Pesanan tanpa resi tetap boleh dipicking dan dipacking, tetapi resi wajib terikat sebelum handover.

### F6. Scan-pack dengan alternatif resi

- Packer memindai resi atau barcode No. Pesanan, sistem menampilkan isi pesanan, lalu item dipindai satu per satu. Resi dipakai bila sudah ada di WMS, bila belum, No. Pesanan dipakai.
- Bila resi dan No. Pesanan sama-sama dipindai tetapi mengarah ke pesanan berbeda, paket diblokir.
- Item salah atau berlebih memberi peringatan dan paket tidak bisa ditutup.
- Instan dan Same Day divalidasi lewat No. Pesanan. Setelah label dicetak, petugas memindai resi pada label lalu No. Pesanan, sehingga resi terikat ke pesanan tanpa menunggu impor berikutnya.
- Resi yang tidak dikenal WMS meminta scan No. Pesanan untuk mengikatnya, dan tidak boleh lolos ke handover sebelum terikat.
- Log scan mencatat metode validasi (resi, No. Pesanan, atau pengikatan manual). Format resi divalidasi per kurir.

### F7. Handover ke kurir

- Daftar paket per kurir hari itu, target vs ter-scan, dengan scan resi per paket serta waktu dan petugas tercatat.
- Paket berstatus TAHAN atau tanpa resi terikat diblokir. Sesi menampilkan waktu impor terakhir.
- Selisih (paket belum ter-scan) ditampilkan sebelum kurir pergi; penutupan sesi dengan ringkasan, dan foto bukti bila perlu.

### F8. Alert pembatalan dan tahan paket

- Deteksi saat impor, status `hold`, task "tarik paket" dengan PIC, alert di dashboard dan WhatsApp lewat GAS, serta blokir di handover. Rinciannya ada di bagian 6.

### F9. Pengecualian lain

- Short pick atau barang cacat saat picking: item ditandai, task QC atau perbaikan dibuat, dan CS memutuskan ganti varian, batalkan, atau tunggu.
- Pembatalan setelah resi dibuat: barang dikembalikan ke rak (task putaway) dan reservasi dilepas.
- Retur dasar: terima paket, scan, arahkan ke zona QC, perbarui status stok.
- Setiap pengecualian membuat task dengan PIC dan tercatat.

### F10. Dashboard dan pemantauan

- Antrean per status (baru, pre-order, sedang diproses, packed, siap pickup, TAHAN, perlu dicek) dan waktu impor terakhir.
- Hitung mundur tenggat per pesanan, daftar yang berisiko terlambat, instan dan Same Day dipisah.
- Beban kerja per PIC, serta daftar masalah (SKU belum terpetakan, backorder, resi belum terikat).

### F11. Integrasi task manager

- Setiap tahap membuat task dengan PIC dan status; penugasan fleksibel untuk multi-role dan proses paralel.
- Notifikasi WhatsApp atau email lewat GAS untuk task terlambat dan alert kritis.

## 8. Model data

Tiga belas tabel baru melengkapi tabel stok dan lokasi WMS yang sudah ada; yang paling menentukan perilaku modul adalah `orders`, `shipping_option_map`, `scan_logs`, dan `order_alerts`.

| Tabel | Isi pokok |
| --- | --- |
| `orders` | marketplace, order\_no (unik per marketplace), resi, kurir, layanan, golongan (reguler, instan, Same Day), status, tenggat, is\_preorder, cara resi terikat, waktu per tahap, data pembeli (akses dibatasi) |
| `order_items` | order\_id, sku\_marketplace, sku\_internal, qty, jenis item (jual, hadiah, kemasan), qty\_picked, qty\_packed |
| `sku_mappings` | marketplace, Nomor Referensi SKU, sku\_internal |
| `shipping_option_map` | teks Opsi Pengiriman, kurir, layanan, golongan |
| `status_map` | awalan teks status marketplace, status internal |
| `stock_reservations` | order\_item\_id, lokasi, qty, status |
| `pick_batches` | tipe, golongan, tenggat, status, PIC |
| `pick_batch_orders` | batch\_id, order\_id, urutan |
| `scan_logs` | jenis scan (pick, pack, ikat resi, handover), kode, order\_id, pengguna, waktu, hasil, metode (resi, No. Pesanan, ikat manual) |
| `handover_sessions` | kurir, tanggal, jumlah target, jumlah ter-scan, petugas, waktu impor terakhir, status |
| `import_jobs` | marketplace, file, hasil (baru, dilewati, resi dilengkapi, perlu dicek, gagal), pengguna, waktu |
| `order_alerts` | order\_id, jenis (hold, check), posisi saat terdeteksi, status, task\_id, dikonfirmasi oleh dan waktu |
| `tasks` | tautan ke task manager WMS (tipe, PIC, status, tenggat, referensi) |

Tabel SKU WMS mendapat dua kolom baru: `is_preorder` dan jenis item. Status barang di tabel stok mengikuti yang sudah ada (baru, QC, lolos QC, defect atau perbaikan, ready jual), dan reservasi hanya merujuk ke stok ready jual.

## 9. Non-fungsional, arsitektur, dan jalur naik

Logika inti berjalan di Supabase dan Vercel, sedangkan GAS tetap menjadi jembatan notifikasi dan arsip.

### Kebutuhan non-fungsional

- **Kecepatan scan:** respons di bawah 1 detik, bisa dipakai di HP atau scanner Bluetooth pada jaringan gudang yang tidak selalu stabil.
- **Keandalan:** setiap perubahan status dicatat dengan waktu dan pengguna (audit log).
- **Akses:** hak akses per peran; impor, pelepasan pre-order, dan pembatalan hanya untuk admin pesanan dan supervisor.
- **Data pembeli:** nama, telepon, dan alamat hanya tampil bila perlu dan dibatasi sesuai peran (picker tidak melihatnya).
- **Perangkat:** antarmuka responsif untuk HP dan desktop, dengan halaman cetak picking list dan ceklis.
- **Kapasitas:** dirancang untuk sekitar 5 kali median harian (puncak 269 pesanan pada 10 Okt), dengan pesanan masuk sepanjang 24 jam.

### Arsitektur

- **Supabase:** database, autentikasi, hak akses (RLS) per peran. Fungsi atomik (reservasi stok, scan, deteksi pembatalan) berjalan di database atau Edge Function agar tidak terjadi *race condition* saat banyak PIC bekerja bersamaan.
- **Vercel:** antarmuka web (impor, batch, scan, dashboard) dan halaman cetak.
- **GAS:** tetap untuk WhatsApp, email, dan Google Drive (notifikasi alert, arsip file impor). Logika inti tidak dijalankan di GAS.
- **Adapter marketplace:** parser terpisah per marketplace dengan format keluaran yang sama.

### Jalur naik ke integrasi otomatis

Karena struktur data dan alur gudang generik, naik ke aggregator atau API langsung hanya mengganti **sumber pesanan** (F1) dan **sumber resi dan label** (F5), serta menambah request pickup otomatis. Picking, scan-pack, handover, alert pembatalan, dan task manager tidak berubah, dan jeda deteksi pembatalan menyusut karena status bisa disinkronkan lebih sering.

## 10. Risiko dan asumsi

Risiko terbesar di Jalur C adalah jeda antara pembatalan pembeli dan impor berikutnya, dan mitigasinya berlapis di scan handover.

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Jeda deteksi pembatalan sama dengan jarak antar impor | Paket batal sampai ke kurir | Impor ulang sebelum kurir datang, blokir scan handover untuk paket TAHAN, peringatan bila impor terakhir sudah lama |
| Format ekspor tiap marketplace berbeda dan bisa berubah | Impor gagal atau salah petakan | Contoh file di fase 0, pratinjau impor, uji ulang tiap format berubah |
| Instan dan Same Day dipacking sebelum resi ada | Validasi lemah | Validasi lewat No. Pesanan, resi diikat saat label ditempel |
| Admin tidak sengaja request pickup sebelum pesanan diimpor | Kurir instan datang sebelum paket siap | Aturan impor "resi sudah ada" menandai pesanan mendesak |
| Tenggat panjang bertabrakan dengan opsi Instant atau Same Day | Prioritas salah | Cek manual, ambang pre-order bisa diubah, penanda `is_preorder` per SKU |
| Pemetaan SKU tidak lengkap | Pesanan tertahan | Antrean "perlu dipetakan" dan impor massal pemetaan |
| Barcode atau tag item belum konsisten | Scan gagal | Standarkan format, sejalan dengan proses tempel tag di QC New Arrival |
| Jaringan gudang tidak stabil | Scan terhambat | Antrean scan lokal sementara lalu sinkron ulang, diuji di lapangan |
| Langkah manual di Seller Center jadi hambatan di jam sibuk | Tenggat terlewat | Dashboard tenggat, jadwal impor per jam, evaluasi naik ke Jalur A atau B bila volume besar |

Asumsi: stok ready jual dan lokasi rak sudah dikelola di WMS dan akurat; barcode atau tag item sudah ada atau akan distandarkan; No. Pesanan tercetak pada label Shopee belum dipastikan dan menunggu contoh label PDF.

## 11. Rencana pengembangan

Tujuh fase memakan sekitar 7 sampai 13 minggu, dan setiap fase ditutup dengan uji coba nyata di gudang. Estimasi kasar, bergantung pada jumlah developer dan kecepatan umpan balik tim gudang.

| Fase | Durasi estimasi | Isi | Selesai bila |
| --- | --- | --- | --- |
| 0. Persiapan | 1 minggu | Contoh ekspor marketplace lain, contoh label PDF, skema WMS di Supabase, jam kedatangan pickup tiap kurir, baseline (waktu picking, salah kirim, pesanan batal), keputusan di bagian 12 | Dokumen format impor dan baseline tersedia |
| 1. Fondasi data dan impor | 1-2 minggu | Skema tabel, adapter Shopee dari tab Semua, normalisasi layanan dan status, aturan impor ulang, pratinjau impor, pemetaan SKU | Impor ulang tidak menggandakan pesanan dan resi terlengkapi tanpa menarik status |
| 2. Batch dan picking list | 1-2 minggu | Klasifikasi layanan, antrean pre-order, reservasi stok, batch per tenggat, picking list dan ceklis cetak, status Sedang diproses | Satu batch nyata dicetak dan dipicking lewat WMS |
| 3. Scan-pack dan resi | 1-2 minggu | Validasi lewat resi atau No. Pesanan, ikat resi, antrean siap request pickup untuk instan dan Same Day | Paket reguler dan instan lolos validasi sebelum diserahkan |
| 4. Handover dan alert pembatalan | 1-2 minggu | Sesi handover, status TAHAN, task tarik paket, blokir scan, notifikasi WhatsApp lewat GAS, dashboard tenggat | Pesanan batal uji tertahan di semua posisi dan handover tercatat per paket |
| 5. Pengecualian dan adapter lain | 1-2 minggu | Short pick, putaway, retur dasar, adapter marketplace berikutnya | Semua marketplace aktif ditangani |
| 6. Pilot dan penyempurnaan | 1-2 minggu | Pilot paralel dengan cara lama, perbaikan dari masukan tim, pelatihan | Indikator di bagian 2 terukur |

**Urutan rilis yang disarankan:** pilot dimulai dari satu marketplace dan satu rentang jam, lalu diperluas bertahap. Cara lama tetap berjalan paralel sampai hasil pilot stabil.

## 12. Keputusan dan pertanyaan terbuka

Empat usulan perlu dikonfirmasi dan delapan hal masih menunggu data atau jawaban sebelum fase 1 dimulai.

### Usulan yang perlu dikonfirmasi

- [ ] Golongan layanan: Instant dan Instant Prioritas = instan, Same Day = Same Day, Reguler, Hemat Kargo, dan Next Day = reguler.
- [ ] Pre-order: tenggat lebih dari 5 hari dari waktu dibuat otomatis masuk antrean Pre-order, ditambah penanda `is_preorder` per SKU.
- [ ] Fase awal memakai ceklis kertas untuk picking, dengan validasi penuh di scan-pack.
- [ ] Cetak picking list dikonfirmasi CS sebelum status berubah menjadi Sedang diproses, dengan cetak ulang yang tercatat.

### Pertanyaan terbuka

- [ ] Marketplace apa saja selain Shopee, dan berapa volume pesanan harian masing-masing? (menentukan urutan adapter)
- [ ] Apakah No. Pesanan tercetak pada label Shopee? (butuh contoh label PDF yang sudah disamarkan)
- [ ] Bagaimana skema tabel stok dan lokasi di Supabase, dan apa format SKU dan barcode atau tag item?
- [ ] Jam berapa saja kurir datang menjemput, per kurir?
- [ ] Perangkat apa yang dipakai di lapangan (HP, scanner Bluetooth, printer thermal atau biasa)?
- [ ] Produk apa saja yang sedang atau pernah pre-order, dan apakah pesanan campuran dikirim sekaligus setelah semua item siap atau boleh sebagian?
- [ ] Bagaimana aturan bila stok kurang saat picking: ganti varian, batalkan, atau tunggu?
- [ ] Seberapa sering CS mengimpor, dan berapa lama batas waktu impor terakhir sebelum handover memberi peringatan?
