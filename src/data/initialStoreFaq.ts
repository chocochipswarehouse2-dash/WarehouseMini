import { StoreFaqItem } from '../types';

export const INITIAL_STORE_FAQS: StoreFaqItem[] = [
  {
    id: 'faq-cancel-manual-shipment',
    category: 'manual_shipment',
    is_pinned: true,
    question: 'Bagaimana cara membatalkan pesanan manual shipment yang salah input atau batal customer?',
    answer: 'Pembatalan pesanan di WMS memiliki alur berbeda antara Admin Gudang (yang memiliki wewenang eksekusi sistem) dan Staf Store (yang mengajukan permohonan pembatalan demi mencegah selisih stok).',
    target_audience: 'all',
    
    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Sebagai Admin Gudang / Superadmin, Anda memiliki hak akses penuh untuk membatalkan pesanan di sistem. Tombol pembatalan tersedia di tab Manual Shipment selama pesanan belum diterbitkan nomor resi kurirnya. Pembatalan oleh Admin akan otomatis melepaskan alokasi stok, mencatat log audit, dan mengirim notifikasi status ke PIC Store.',
    action_steps_admin: [
      { step: 1, title: 'Buka Tab Manual Shipment', desc: 'Masuk ke menu Pesanan Saya ➔ Tab "Manual Shipment". Gunakan kolom pencarian No. Pesanan untuk menemukan transaksi.' },
      { step: 2, title: 'Periksa Status & Resi', desc: 'Pastikan pesanan belum dipacking ekspedisi dan belum memiliki nomor resi. (Jika sudah ada resi, batalkan resi terlebih dahulu di kurir).' },
      { step: 3, title: 'Klik Tombol [Batalkan Pesanan]', desc: 'Pada kolom Aksi di sebelah kanan kartu pesanan, klik tombol merah bergambar tempat sampah bertuliskan "Batalkan Pesanan".' },
      { step: 4, title: 'Pilih Alasan & Konfirmasi', desc: 'Pilih alasan pembatalan (misal: "Permohonan dari Store", "Barang Sold Out", "Salah Alamat"), lalu konfirmasi pembatalan. Status pesanan akan berubah menjadi "cancelled".' }
    ],
    button_badges_admin: [
      { label: 'Batalkan Pesanan', color: 'rose', icon: 'Trash2' },
      { label: 'Status: Cancelled', color: 'slate', icon: 'Ban' },
      { label: 'Kirim Notifikasi WA', color: 'emerald', icon: 'MessageCircle' }
    ],
    admin_notes: '⚠️ Pembatalan pesanan yang melibatkan alokasi DealPOS akan memerlukan verifikasi void/koreksi SJ di DealPOS agar saldo kuota kasir kembali utuh.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Staf Store (Outlet) TIDAK MEMILIKI tombol "Batalkan Pesanan" di layar Anda demi mencegah selisih stok fisik antara gudang dan outlet. Jika terjadi salah input atau customer membatalkan pesanan, Store wajib mengajukan permohonan pembatalan ke Admin Gudang.',
    action_steps_store: [
      { step: 1, title: 'Pastikan Paket Belum Dikirim', desc: 'Periksa status pesanan di tab Manual Shipment toko Anda. Pembatalan hanya bisa diproses jika pesanan belum diserahkan ke ekspedisi.' },
      { step: 2, title: 'Klik Tombol [Ajukan Pembatalan]', desc: 'Klik tombol kuning "Ajukan ke Admin Sekarang" di bawah ini, atau gunakan tab "Ajukan Kendala ke Superadmin" di Pusat Bantuan ini.' },
      { step: 3, title: 'Cantumkan No. Pesanan & Alasan', desc: 'Tuliskan No. Pesanan dan alasan pembatalan secara rinci (contoh: "Customer ganti size / salah pilih kurir").' },
      { step: 4, title: 'Tunggu Eksekusi Admin Gudang', desc: 'Admin Gudang akan memverifikasi dan menekan tombol pembatalan di sistem. Status di layar Anda akan otomatis berubah menjadi Cancelled.' }
    ],
    button_badges_store: [
      { label: 'Ajukan ke Admin (Store)', color: 'rose', icon: 'MessageSquare' },
      { label: 'Status: Menunggu / Diproses', color: 'blue', icon: 'Clock' }
    ],
    store_notes: '💡 Tips Store: Jangan membuat pesanan pengganti baru sebelum mengajukan pembatalan pesanan lama ke Admin, agar tidak terjadi pengiriman ganda ke customer.',

    keywords: ['batal', 'batalkan', 'cancel', 'batalin', 'salah input', 'keliru', 'hapus pesanan', 'store batal', 'admin batal', 'void'],
    view_count: 185
  },

  {
    id: 'faq-sold-out-handling',
    category: 'manual_shipment',
    is_pinned: true,
    question: 'Apa perbedaan tombol "Tandai Sold" (Fulfill Marketplace) dan "Tandai Terima" (Fulfill Store), serta bagaimana alur barang kosong?',
    answer: 'Pada rincian produk pesanan, item dengan Fulfillment Marketplace/Gudang menampilkan tombol "Tandai Sold" (untuk menandai stok gudang kosong), sedangkan item dengan Fulfillment dari Store menampilkan tombol "Tandai Terima" (untuk menandai barang kiriman toko sudah diterima di Gudang). Apabila status pesanan berubah menjadi Terkirim / Selesai, sistem otomatis mengubah status item Store menjadi "Sudah Terima".',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Di tabel dan kartu Rekap Pesanan, aksi per-item disesuaikan otomatis berdasarkan sumber fulfillment: (1) Untuk item "Fulfillment Marketplace / Gudang", tersedia tombol merah "Tandai Sold" apabila stok fisik di gudang kosong/reject (dengan opsi Partial Fulfillment atau Batalkan Pesanan + WA otomatis ke Store). (2) Untuk item "Fulfillment dari Store" (misal Gading Serpong, Central Park, dll), tersedia tombol biru "Tandai Terima" untuk memverifikasi bahwa fisik barang dari toko cabang telah tiba di Gudang Pusat. Sekalipun Admin belum sempat mengklik "Tandai Terima", begitu pesanan diinput nomor resi / berstatus "Dikirim", sistem otomatis menandai item Store tersebut menjadi "Sudah Terima".',
    action_steps_admin: [
      { step: 1, title: 'Fulfill Marketplace: Klik [Tandai Sold] Jika Kosong', desc: 'Untuk produk yang diambil dari alokasi Marketplace/Gudang, klik tombol "Tandai Sold" jika stok fisik di rak gudang kosong.' },
      { step: 2, title: 'Pilih Resolusi Partial / Batal', desc: 'Pilih "Kirim Sebagian (Partial Fulfillment)" atau "Batalkan Seluruh Pesanan", lalu centang kirim WA Fonnte ke PIC Store.' },
      { step: 3, title: 'Fulfill Store: Klik [Tandai Terima] Saat Barang Tiba', desc: 'Untuk produk yang dikirim dari Store cabang, klik tombol biru "Tandai Terima" saat barang tiba di gudang agar berubah menjadi badge hijau "Sudah Terima".' },
      { step: 4, title: 'Otomatis "Sudah Terima" Saat Pesanan Terkirim', desc: 'Apabila Admin menginput No. Resi / menyelesaikan pengiriman sebelum sempat mengklik Tandai Terima, sistem otomatis mengubah status item Store menjadi "Sudah Terima".' }
    ],
    button_badges_admin: [
      { label: 'Tandai Sold (Marketplace)', color: 'rose', icon: 'AlertTriangle' },
      { label: 'Tandai Terima (Store)', color: 'blue', icon: 'CheckCircle2' },
      { label: 'Sudah Terima', color: 'emerald', icon: 'CheckCircle2' }
    ],
    admin_notes: 'ℹ️ Jika item Marketplace yang ditandai Sold Out ditemukan kembali, Admin dapat mengklik "Pulihkan". Untuk item Store yang belum terkirim, klik badge "Sudah Terima" jika ingin membatalkan status terima.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Staf Store tidak memiliki tombol eksekusi "Tandai Sold" maupun "Tandai Terima" (wewenang Admin Gudang), namun Store dapat memantau langsung badge status penerimaan barang toko di Gudang ("Belum Terima WH" ➔ "Sudah Terima"). Jika fisik pakaian di rak toko Anda ternyata kosong/cacat saat hendak dikirim ke gudang, segera laporkan ke Admin Gudang via Pusat Bantuan.',
    action_steps_store: [
      { step: 1, title: 'Pantau Badge Penerimaan Gudang', desc: 'Pada item yang difulfill dari toko Anda, status awal akan menampilkan "Belum Terima WH" dan berubah menjadi "Sudah Terima" setelah diterima Admin Gudang atau saat paket terkirim ke customer.' },
      { step: 2, title: 'Verifikasi Fisik Jika Stok Toko Kosong', desc: 'Jika barang di toko Anda ternyata kosong atau cacat permanen sebelum dikirim ke gudang, segera cek fisik rak toko.' },
      { step: 3, title: 'Laporkan ke Admin Gudang Segera', desc: 'Klik tombol "Ajukan ke Admin Sekarang" di Pusat Bantuan dengan menyebutkan No. Pesanan dan SKU agar Admin dapat mengalihkan fulfillment atau memproses partial.' }
    ],
    button_badges_store: [
      { label: 'Belum Terima WH (View Only)', color: 'amber', icon: 'Clock' },
      { label: 'Sudah Terima (View Only)', color: 'emerald', icon: 'CheckCircle2' },
      { label: 'Ajukan ke Admin Gudang', color: 'rose', icon: 'AlertTriangle' }
    ],
    store_notes: '⚠️ Penting: Jangan biarkan pesanan menggantung tanpa konfirmasi jika stok toko kosong. Begitu pesanan telah memiliki resi / berstatus Dikirim, status item toko otomatis tercatat Sudah Terima di Gudang.',

    keywords: ['sold out', 'tandai sold', 'tandai terima', 'sudah terima', 'belum terima wh', 'kosong', 'habis', 'reject', 'partial', 'fulfill store', 'fulfill marketplace'],
    view_count: 142
  },

  {
    id: 'faq-split-fulfill-1',
    category: 'multi_store',
    is_pinned: true,
    question: 'Bagaimana cara kirim produk yang sama 2 pcs tapi 1 dari Marketplace dan 1 dari Store?',
    answer: 'Jika ada pesanan dengan 2 pcs (atau lebih) produk yang sama namun sumber pemenuhannya berbeda (1 dari stok Marketplace Gudang dan 1 dari rak Toko Cabang), gunakan tombol Split Fulfil.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Fitur Split Fulfil memungkinkan Admin Gudang atau Store memecah item ber-qty > 1 menjadi baris tersendiri (qty 1) agar dapat dialokasikan ke sumber fulfillment yang berbeda. Sebagai Admin, Anda dapat mengedit dan mengubah alokasi fulfillment pesanan cabang kapan saja jika cabang penyedia mengalami kendala stok.',
    action_steps_admin: [
      { step: 1, title: 'Buka Form Input / Edit Pesanan', desc: 'Saat input pesanan baru atau klik "Edit" pada pesanan yang sudah ada di tab Manual Shipment.' },
      { step: 2, title: 'Input Qty 2 pcs (atau lebih)', desc: 'Masukkan Qty produk minimal 2. Tombol ungu "Split Fulfil" akan otomatis muncul di bawah input Qty.' },
      { step: 3, title: 'Klik [Split Fulfil]', desc: 'Baris produk terpecah menjadi 2 baris satuan. Baris pertama berisi 1 pcs dan baris kedua 1 pcs.' },
      { step: 4, title: 'Tentukan Sumber Fulfillment', desc: 'Pilih "Marketplace" untuk baris yang diambil dari rak gudang, dan pilih nama Cabang untuk baris yang difulfill toko.' }
    ],
    button_badges_admin: [
      { label: 'Split Fulfil', color: 'indigo', icon: 'GitFork' },
      { label: 'Fulfillment: Marketplace', color: 'emerald', icon: 'Store' },
      { label: 'Fulfillment: [Nama Store]', color: 'blue', icon: 'Building2' }
    ],
    admin_notes: 'ℹ️ Admin memiliki visibilitas stok menyeluruh di seluruh cabang. Jika toko yang dipilih kehabisan stok, Admin dapat langsung mengganti dropdown fulfillment ke cabang lain tanpa membatalkan order.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Gunakan tombol Split Fulfil jika customer Anda membeli 2 pcs produk yang sama (misal Darlene Cream 2 pcs), namun stok di toko Anda hanya ada 1 pcs dan 1 pcs lagi ingin diambil dari alokasi Gudang Pusat/Marketplace.',
    action_steps_store: [
      { step: 1, title: 'Input Qty 2 pcs di Form', desc: 'Scan atau ketik SKU produk di form Manual Shipment, lalu atur Qty menjadi 2 (atau lebih).' },
      { step: 2, title: 'Klik Tombol [Split Fulfil]', desc: 'Tombol ungu "Split Fulfil" akan otomatis muncul di bawah input Qty. Klik tombol tersebut.' },
      { step: 3, title: 'Baris Terpecah Menjadi 1 pcs Masing-Masing', desc: 'Baris atas otomatis berkurang menjadi 1 pcs, dan baris baru di bawahnya terbuat dengan 1 pcs.' },
      { step: 4, title: 'Atur Fulfillment Masing-Masing', desc: 'Pilih Fulfillment "Marketplace" untuk baris 1, dan pilih nama Toko Anda untuk baris 2.' }
    ],
    button_badges_store: [
      { label: 'Split Fulfil', color: 'indigo', icon: 'GitFork' },
      { label: 'Fulfillment: Marketplace', color: 'emerald', icon: 'Store' },
      { label: 'Fulfillment: Toko Anda', color: 'blue', icon: 'Building2' }
    ],
    store_notes: '💡 Jika salah satu item membutuhkan alterasi/potong panjang, pastikan Anda juga mencentang kotak alterasi dan mengisi nomor ID Form Alter pada baris tersebut.',

    keywords: ['split', 'fulfil', 'marketplace', 'store', '2 pcs', 'produk sama', 'beda toko', 'campur', 'pisah', 'pecah', 'baris', 'cabang'],
    view_count: 165
  },

  {
    id: 'faq-resi-courier-input',
    category: 'resi_tracking',
    question: 'Siapa yang menginput nomor resi kurir dan bagaimana cara update resi pengiriman ke customer?',
    answer: 'Nomor resi kurir pengiriman ke customer dikelola sepenuhnya oleh Admin Gudang setelah proses packing fisik selesai. Tim Store tidak perlu menginput nomor resi customer.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Admin Gudang bertugas menginput nomor resi ekspedisi setelah seluruh barang pesanan terkumpul, dipacking, dan ditempel label pengiriman. WMS menyediakan dua metode input resi: Satuan dan Massal (Bulk Update Resi via scan barcode).',
    action_steps_admin: [
      { step: 1, title: 'Input Satuan (Per-Pesanan)', desc: 'Pada baris pesanan di tab Manual Shipment, klik tombol biru "+ Input Resi" / "Update Resi", ketik nomor resi kurir, lalu klik Simpan.' },
      { step: 2, title: 'Input Massal (Bulk Update Resi)', desc: 'Klik tombol "⚡ Bulk Update Resi" di header tabel. Pilih kurir, lalu scan atau ketik nomor resi pada tabel "Belum Ada Resi" atau unggah CSV.' },
      { step: 3, title: 'Perubahan Status Otomatis ke Dikirim', desc: 'Pesanan dengan jasa kirim ekspedisi wajib memiliki No. Resi untuk berstatus "Dikirim". Selama resi belum diinput, status pesanan tetap "Diterima" atau "Diproses" (jika Label A6 & Picking List sudah dicetak).' }
    ],
    button_badges_admin: [
      { label: 'Update Resi (Satuan)', color: 'blue', icon: 'Truck' },
      { label: 'Bulk Update Resi (Scan Barcode)', color: 'indigo', icon: 'Sparkles' }
    ],
    admin_notes: '💡 Selama No. Resi belum diisi, pesanan ekspedisi tidak akan masuk ke tahap Dikirim/Selesai. Begitu resi tersimpan, status pesanan otomatis menjadi Dikirim dan item fulfillment Store otomatis tercatat Sudah Terima.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Tim Store TIDAK PERLU menginput nomor resi kurir pengiriman ke customer. Saat mendaftarkan pesanan manual, staf toko cukup memilih jenis kurir yang diminta customer (misal: JNE REG, J&T, SiCepat). Nomor resi akan diisi oleh Gudang Pusat setelah barang selesai dipacking.',
    action_steps_store: [
      { step: 1, title: 'Isi PIC Store & Pilih Jasa Kirim', desc: 'Saat membuat pesanan manual, kolom Store Pengirim sudah terkunci sesuai cabang toko Anda. Pada kolom "PIC Store", wajib ketik manual nama PIC yang menginput (bukan nama toko), lalu pilih Jasa Kirim customer.' },
      { step: 2, title: 'Pantau Status di Rekap Toko', desc: 'Buka tab Manual Shipment toko Anda. Pesanan yang sedang disiapkan berstatus "Diproses".' },
      { step: 3, title: 'Dapatkan Resi Otomatis', desc: 'Setelah Gudang Pusat menyerahkan paket ke kurir, status pesanan otomatis berganti menjadi "Dikirim" dan nomor resi kurir akan tampil di layar Anda untuk dibagikan ke customer.' }
    ],
    button_badges_store: [
      { label: 'Pilih Jasa Kirim Customer', color: 'emerald', icon: 'Truck' },
      { label: 'Pantau Status Pesanan', color: 'slate', icon: 'Clock' }
    ],
    store_notes: 'ℹ️ Jika customer menanyakan nomor resi sebelum status berubah "Dikirim", jelaskan bahwa paket sedang dalam antrean packing di Gudang Pusat.',

    keywords: ['resi', 'no resi', 'kurir', 'jne', 'jnt', 'sicepat', 'gosend', 'ekspedisi', 'tracking', 'lacak', 'admin resi', 'bulk resi'],
    view_count: 112
  },

  {
    id: 'faq-send-store-to-wh',
    category: 'multi_store',
    question: 'Kapan Store harus mengirimkan barang fisik ke Gudang Pusat dan bagaimana alurnya?',
    answer: 'Pengiriman barang fisik dari Toko ke Gudang dilakukan jika toko menjadi penyedia barang untuk pesanan multi-store atau pakaian membutuhkan alterasi/repair di gudang. Saat barang tiba di Gudang, Admin mengklik "Tandai Terima" pada item tersebut (atau otomatis berubah menjadi "Sudah Terima" saat pesanan terkirim).',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Admin Gudang memantau barang yang dikirim oleh cabang pada Rekap Pesanan maupun Tab Distribusi Store. Ketika fisik barang dari Store tiba di gudang, Admin langsung mengklik tombol "Tandai Terima" pada baris produk Store tersebut sehingga berubah menjadi badge hijau "Sudah Terima". Apabila pesanan langsung diinput resi / berubah status menjadi "Dikirim" sebelum Admin sempat mengklik "Tandai Terima", sistem secara otomatis mengubah status item Store tersebut menjadi "Sudah Terima".',
    action_steps_admin: [
      { step: 1, title: 'Pantau Barang Kiriman Store', desc: 'Lihat item dengan badge nama cabang (misal Gading Serpong Tangerang, Central Park Jakarta) pada kolom Rincian Produk.' },
      { step: 2, title: 'Klik [Tandai Terima] Saat Barang Tiba', desc: 'Saat driver internal menyerahkan fisik pakaian beserta Struk SJ, klik tombol biru "Tandai Terima" pada item produk tersebut.' },
      { step: 3, title: 'Otomatis "Sudah Terima" Saat Terkirim', desc: 'Saat resi pengiriman ke customer diinput (status pesanan Dikirim/Selesai), seluruh item fulfillment Store pada pesanan tersebut otomatis tercatat "Sudah Terima".' }
    ],
    button_badges_admin: [
      { label: 'Tandai Terima', color: 'blue', icon: 'CheckCircle2' },
      { label: 'Sudah Terima', color: 'emerald', icon: 'CheckCircle2' }
    ],
    admin_notes: 'ℹ️ Jika paket tiba dalam kondisi rusak atau tidak sesuai struk, segera dokumentasikan foto dan laporkan ke PIC toko pengirim.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Store WAJIB mengirimkan fisik pakaian ke Gudang Pusat jika toko Anda ditunjuk sebagai penyedia barang (Fulfillment Store), atau pakaian customer butuh alterasi oleh penjahit gudang. Anda dapat memantau apakah barang sudah diterima oleh Gudang melalui badge "Belum Terima WH" / "Sudah Terima" pada baris produk.',
    action_steps_store: [
      { step: 1, title: 'Cek Tab Rekap Pesanan Toko', desc: 'Buka Pesanan Saya ➔ Manual Shipment. Temukan pesanan dengan label toko Anda sebagai penyedia barang.' },
      { step: 2, title: 'Klik [SJ Struk] & [Kirim ke Gudang]', desc: 'Cetak Surat Jalan Struk Rangkap 2, masukkan ke dalam kemasan pakaian, lalu atur pengiriman ke Gudang Pusat.' },
      { step: 3, title: 'Pantau Status "Sudah Terima"', desc: 'Setelah barang tiba dan diverifikasi Admin Gudang (atau saat pesanan telah dikirim ke customer), badge item akan otomatis berubah menjadi "Sudah Terima".' }
    ],
    button_badges_store: [
      { label: 'SJ Struk', color: 'amber', icon: 'Printer' },
      { label: 'Kirim ke Gudang', color: 'blue', icon: 'Truck' },
      { label: 'Sudah Terima (View Only)', color: 'emerald', icon: 'CheckCircle2' }
    ],
    store_notes: '⚠️ Jangan kirim barang tanpa menyertakan Surat Jalan Struk fisik, karena gudang membutuhkan struk tersebut saat melakukan verifikasi "Tandai Terima".',

    keywords: ['kirim ke gudang', 'tandai terima', 'sudah terima', 'surat jalan struk', 'antar fisik', 'multi store', 'kurir internal', 'ekspedisi', 'packing', 'cabang ke gudang'],
    view_count: 98
  },

  {
    id: 'faq-pic-store-target-selesai-alter',
    category: 'alteration_repair',
    question: 'Kenapa kolom PIC Store / SA kosong dan berapa estimasi target selesai alterasi/repair?',
    answer: 'Kolom PIC Store / SA sengaja dikosongkan agar staf penginput wajib menuliskan nama aslinya sendiri demi akuntabilitas komunikasi. Target tanggal selesai pengerjaan otomatis diatur sistem ke +14 hari sejak tanggal pendaftaran.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Admin Gudang dan Penjahit membutuhkan nama asli PIC Store yang mengajukan alterasi/repair (bukan nama toko) agar jika terdapat kendala benang, kain, atau klarifikasi potongan, tim gudang dapat langsung menghubungi SA penanggung jawab melalui nomor WA yang dicantumkan. Target SLA standar pengerjaan gudang adalah 14 hari kerja sejak tiket didaftarkan.',
    action_steps_admin: [
      { step: 1, title: 'Buka Tiket Alteration & Repair', desc: 'Periksa kartu tiket di Tab Alteration & Repair. Lihat kolom PIC Store / SA.' },
      { step: 2, title: 'Lihat PIC & No. WA', desc: 'Identitas nama staf SA dan nomor WA PIC tertera langsung pada rincian tiket.' },
      { step: 3, title: 'Pantau Target Tanggal Selesai', desc: 'Gudang memprioritaskan pengerjaan sesuai target tanggal selesai (+14 hari dari submit).' }
    ],
    button_badges_admin: [
      { label: 'PIC Store & Kontak WA', color: 'blue', icon: 'User' },
      { label: 'Target: +14 Hari Submit', color: 'emerald', icon: 'Calendar' }
    ],
    admin_notes: 'ℹ️ Jika butuh klarifikasi pengerjaan, gunakan nomor WA PIC Store yang tertera di tiket alterasi.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Kolom PIC Store / SA sengaja TIDAK diisi otomatis dengan nama toko agar Anda wajib mengetikkan nama asli Anda (nama staf / SA yang sedang menginput). Hal ini memastikan penjahit gudang tahu persis siapa yang harus dihubungi. Untuk estimasi waktu, sistem secara otomatis menetapkan Target Tanggal Selesai ke +14 hari (2 minggu) dari tanggal pendaftaran.',
    action_steps_store: [
      { step: 1, title: 'Ketik Nama Asli di Kolom PIC Store / SA', desc: 'Masukkan nama panggilan / lengkap Anda (contoh: "Siti - SA Shift Pagi") dan nomor WhatsApp aktif Anda.' },
      { step: 2, title: 'Cek Target Tanggal Selesai', desc: 'Sistem otomatis mengisi tanggal selesai ke +14 hari dari hari ini. Anda bisa menyesuaikan jika ada permintaan khusus.' },
      { step: 3, title: 'Submit Pendaftaran Tiket', desc: 'Klik Simpan & Daftarkan Tiket. Bukti pendaftaran beserta estimasi selesai akan otomatis terbit.' }
    ],
    button_badges_store: [
      { label: 'PIC Store / SA * (Wajib Isi)', color: 'rose', icon: 'UserCheck' },
      { label: 'Target Otomatis +14 Hari', color: 'emerald', icon: 'Clock' }
    ],
    store_notes: '💡 Jangan isi nama toko di kolom PIC; ketik nama pribadi Anda agar komunikasi antar store dan penjahit gudang lancar.',

    keywords: ['pic store', 'sa', 'nama pic', 'nama sa', 'target selesai', '14 hari', '+14 hari', 'estimasi', 'alter', 'repair', 'sla', 'tenggat'],
    view_count: 142
  },

  {
    id: 'faq-default-no-wa-store-pic',
    category: 'manual_shipment',
    question: 'Dari mana nomor WhatsApp PIC Store terisi otomatis di form Manual Shipment & Alteration?',
    answer: 'Nomor WhatsApp PIC Store otomatis terisi secara default dari Master Kontak Toko (Pengaturan > Store & Outlet) yang tersimpan di database Supabase.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Admin dapat memperbarui nomor WhatsApp resmi masing-masing store melalui menu Pengaturan ➔ Tab "Store & Outlet". Seluruh notifikasi otomatis Fonnte (konfirmasi submit, penerbitan resi, pembatalan pesanan, dan kendala barang kosong) akan mengacu ke nomor WA resmi toko yang terdaftar.',
    action_steps_admin: [
      { step: 1, title: 'Buka Pengaturan Store & Outlet', desc: 'Buka SettingsModal ➔ klik tab "Store & Outlet".' },
      { step: 2, title: 'Klik Edit (Pensil) pada Baris Toko', desc: 'Perbarui nomor WhatsApp resmi toko. Data otomatis tersimpan ke Cloud Supabase.' },
      { step: 3, title: 'Notifikasi Otomatis Terintegrasi', desc: 'Sistem Fonnte akan otomatis mengarahkan seluruh broadcast dan alert order ke nomor resmi tersebut.' }
    ],
    button_badges_admin: [
      { label: 'Store & Outlet', color: 'blue', icon: 'Store' },
      { label: 'Master No. WhatsApp', color: 'emerald', icon: 'Phone' }
    ],
    admin_notes: 'ℹ️ Nomor WA yang disimpan di Store & Outlet langsung menjadi default saat form Manual Shipment atau Alteration dibuka oleh cabang.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Nomor WhatsApp PIC Store akan terisi secara otomatis dengan nomor resmi toko Anda sesuai akun login atau pilihan toko pengirim. Jika ada staf/SA tertentu yang memegang kendali atas pesanan khusus ini, nomor tersebut tetap dapat diedit secara manual sebelum mengirim pesanan.',
    action_steps_store: [
      { step: 1, title: 'Buka Form Pesanan / Alterasi', desc: 'Pilih nama toko pengirim. Nomor WhatsApp resmi toko akan otomatis muncul di kolom No. HP Store.' },
      { step: 2, title: 'Ketik Nama Asli PIC Store', desc: 'Tuliskan nama Anda di kolom PIC Store / SA.' },
      { step: 3, title: 'Kirim Pesanan', desc: 'Notifikasi status dan pesan konfirmasi dari sistem gudang akan dikirim ke nomor WA toko tersebut.' }
    ],
    button_badges_store: [
      { label: 'No. HP PIC Terisi Otomatis', color: 'emerald', icon: 'Phone' },
      { label: 'PIC Store * (Wajib Isi Nama)', color: 'rose', icon: 'User' }
    ],
    store_notes: '💡 Nomor WA toko terisi otomatis agar seluruh update gudang langsung masuk ke HP operasional toko Anda.',

    keywords: ['no wa store', 'no hp store', 'pic store', 'kontak toko', 'notifikasi wa', 'fonnte', 'default hp', 'store outlet'],
    view_count: 85
  },

  {
    id: 'faq-notif-wa-store-penyedia-otomatis',
    category: 'manual_shipment',
    question: 'Apakah Store Penyedia Barang otomatis menerima notifikasi WA saat pesanan disubmit?',
    answer: 'Ya, sistem WMS secara otomatis mengirim notifikasi WhatsApp permintaan penarikan barang ke nomor resmi Store Penyedia begitu pesanan yang membutuhkan pemenuhan antar-toko (Inter-Store) disubmit.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Ketika Store Pemohon mensubmit pesanan dengan produk yang diambil dari toko cabang lain (bukan gudang marketplace), Fonnte langsung memicu pengiriman pesan resmi "📦 PERMINTAAN PENGIRIMAN PRODUK (STORE ➔ WAREHOUSE)" ke nomor WhatsApp Store Penyedia barang tersebut. Admin juga tetap memiliki tombol "Notif WA Store" di kartu rekap jika sewaktu-waktu ingin memicu pengiriman ulang secara manual.',
    action_steps_admin: [
      { step: 1, title: 'Otomatisasi Saat Submit', desc: 'Sistem mendeteksi kolom fulfillment tiap item. Jika dialokasikan dari toko cabang, pesan WA penarikan otomatis terkirim.' },
      { step: 2, title: 'Tombol Notif WA Store Manual (Opsional)', desc: 'Admin dapat menekan tombol "Notif WA Store" pada kartu pesanan rekap untuk mengirim ulang follow up.' },
      { step: 3, title: 'Pantau Pengiriman Fisik', desc: 'Pastikan store penyedia segera mengirimkan pakaian ke gudang pusat dengan melampirkan Surat Jalan Struk.' }
    ],
    button_badges_admin: [
      { label: 'Auto-Send WA Inter-Store', color: 'emerald', icon: 'Send' },
      { label: 'Notif WA Store (Manual)', color: 'blue', icon: 'MessageCircle' }
    ],
    admin_notes: 'ℹ️ Pesan otomatis memuat rincian SKU, nama produk, size, qty, dan instruksi pencetakan Surat Jalan Rangkap 2 bagi toko penyedia.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Jika Anda membuat pesanan dan memilih barang dari toko cabang lain, Anda tidak perlu repot menghubungi toko penyedia secara terpisah. Sistem WMS akan otomatis mengirimkan pesan WhatsApp ke HP operasional toko penyedia barang berisi instruksi untuk mengirimkan pakaian tersebut ke Gudang Pusat.',
    action_steps_store: [
      { step: 1, title: 'Pilih Fulfillment Store pada Produk', desc: 'Di form pesanan manual, tentukan toko cabang yang menyediakan stok produk.' },
      { step: 2, title: 'Submit Pesanan', desc: 'Klik Simpan Pesanan. Notifikasi permintaan kirim barang langsung masuk otomatis ke WA toko penyedia.' },
      { step: 3, title: 'Toko Penyedia Mengirim Barang', desc: 'Toko penyedia akan mencetak Surat Jalan Kirim Struk dan mengirimkan fisik produk ke Gudang.' }
    ],
    button_badges_store: [
      { label: 'Kirim Otomatis ke WA Cabang', color: 'emerald', icon: 'CheckCircle2' },
      { label: 'Fulfillment Antar-Store', color: 'indigo', icon: 'Truck' }
    ],
    store_notes: '💡 Pastikan toko tujuan fulfillment dipilih dengan benar agar notifikasi penarikan terkirim ke cabang yang tepat.',

    keywords: ['notif wa store penyedia', 'inter store fulfillment', 'tarik barang cabang', 'surat jalan struk', 'kirim ke gudang', 'notifikasi otomatis'],
    view_count: 92
  },

  {
    id: 'faq-id-form-alter-manual',
    category: 'alteration_repair',
    question: 'No. ID Form Alter diisi apa dan oleh siapa? Apakah boleh dikosongkan?',
    answer: 'No. ID Form Alter mengacu pada nomor pendaftaran formulir fisik alter/reparasi. Wajib diisi oleh tim Store untuk setiap pakaian yang butuh permak/reparasi.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Penjahit dan Admin Gudang menggunakan No. ID Form Alter sebagai nomor SPK kerja utama di Tab Alteration & Repair. Nomor ini memastikan fisik pakaian yang tiba dari cabang dapat langsung dicocokkan dengan instruksi permak (panjang potong, lebar pinggang) dan foto instruksi tanpa risiko tertukar.',
    action_steps_admin: [
      { step: 1, title: 'Buka Tab Alteration & Repair', desc: 'Masuk ke menu Pesanan Saya ➔ Tab "Alteration & Repair".' },
      { step: 2, title: 'Cari Berdasarkan ID Form Alter', desc: 'Gunakan nomor ID Form Alter toko untuk membuka rincian instruksi jahitan dan foto pakaian.' },
      { step: 3, title: 'Update Tahapan Pengerjaan', desc: 'Perbarui status alur: "Diterima Gudang" ➔ "Dalam Pengerjaan" ➔ "Selesai QC".' }
    ],
    button_badges_admin: [
      { label: 'Cari ID Form Alter', color: 'purple', icon: 'Search' },
      { label: 'Status: Pengerjaan & QC', color: 'amber', icon: 'Scissors' }
    ],
    admin_notes: 'ℹ️ Jika nomor ID Form Alter terduplikasi atau tidak terbaca di fisik struk, Admin dapat menghubungi PIC store yang tertera di kartu order.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'No. ID Form Alter WAJIB diisi manual oleh tim Store untuk setiap produk yang butuh alterasi, baik barang berasal dari Store maupun dari Marketplace. Nomor ini mengacu pada nomor fisik formulir alter di toko Anda (misal: ALT-CP-2610-001). Tidak boleh dikosongkan agar penjahit gudang memiliki nomor acuan yang sah.',
    action_steps_store: [
      { step: 1, title: 'Centang Opsi Alteration', desc: 'Pada baris produk, centang kotak "Butuh Alteration / Permak Pakaian".' },
      { step: 2, title: 'Ketik No. ID Form Alter Manual', desc: 'Ketik nomor ID Form Alter sesuai nomor fisik pendaftaran di outlet toko Anda.' },
      { step: 3, title: 'Lengkapi Instruksi & Foto Pakaian', desc: 'Tuliskan detail pengerjaan (contoh: "Potong panjang 4 cm rapi") dan unggah foto pakaian jika ada instruksi khusus.' }
    ],
    button_badges_store: [
      { label: 'Butuh Alteration / Permak', color: 'rose', icon: 'Scissors' },
      { label: 'No. ID Form Alter Store *', color: 'purple', icon: 'FileText' }
    ],
    store_notes: '⚠️ Sistem akan memblokir pendaftaran jika kotak alter dicentang namun kolom No. ID Form Alter dibiarkan kosong.',

    keywords: ['alter', 'alteration', 'id form alter', 'no id', 'manual', 'store', 'wajib', 'kosong', 'spk', 'penjahit', 'potong', 'permak'],
    view_count: 135
  },

  {
    id: 'faq-no-sj-dealpos',
    category: 'stok_dealpos',
    question: 'Apa perbedaan No. Transaksi DealPOS (Store) dengan No. SJ Delivery DealPOS (MKT ➔ Store)?',
    answer: 'No. Transaksi DealPOS adalah nomor struk/invoice penjualan kasir yang wajib diisi oleh Store saat membuat pesanan. Sedangkan No. SJ Delivery DealPOS (MKT ➔ Store) adalah nomor Surat Jalan transfer stok dari Marketplace ke Store yang hanya bisa diisi/diubah oleh Admin WH (Store hanya bisa melihat/view).',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Admin Gudang (WH) memegang akses penuh untuk mengisi dan mengubah No. SJ Delivery DealPOS (MKT ➔ Store) pada item dengan fulfillment "Marketplace". Nomor ini terpisah dari No. Transaksi Kasir DealPOS yang diinput oleh Store.',
    action_steps_admin: [
      { step: 1, title: 'Buka DealPOS Backoffice', desc: 'Buat Surat Jalan (SJ Delivery) transfer stok dari alokasi Marketplace/Gudang ke Store pemesan.' },
      { step: 2, title: 'Klik + Input SJ DealPOS / Edit SJ DealPOS', desc: 'Pada kotak "Produk dari Marketplace" di tabel Rekap Pesanan, klik tombol "+ Input SJ DealPOS" atau "Edit SJ DealPOS".' },
      { step: 3, title: 'Simpan Nomor SJ Delivery', desc: 'Masukkan nomor SJ Delivery (contoh: 26.10.00286) dan simpan. Status item akan berubah menjadi SJ Lengkap.' }
    ],
    button_badges_admin: [
      { label: '+ Input SJ DealPOS', color: 'indigo', icon: 'FileText' },
      { label: 'Edit SJ DealPOS', color: 'indigo', icon: 'FileText' }
    ],
    admin_notes: 'ℹ️ Hanya akun Admin WH / Superadmin yang dapat melihat tombol Input/Edit SJ DealPOS. Akun Store hanya dapat melihat (view-only) nomor SJ yang sudah diinput Admin WH.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Saat membuat pesanan, Tim Store WAJIB mengisi "No. Transaksi DealPOS" (nomor struk penjualan kasir toko). Adapun "No. SJ Delivery DealPOS (MKT ➔ Store)" pada produk fulfillment Marketplace dibuat dan diinput oleh Admin WH — Tim Store hanya perlu memantau (view) nomor SJ tersebut di kartu pesanan.',
    action_steps_store: [
      { step: 1, title: 'Isi No. Transaksi DealPOS (Struk Kasir)', desc: 'Pada bagian Data Pengirim (Store), masukkan nomor struk transaksi penjualan DealPOS toko Anda (wajib diisi).' },
      { step: 2, title: 'Pantau Status SJ Delivery (MKT ➔ Store)', desc: 'Untuk produk yang diambil dari stok Marketplace, status awal akan tertulis "Menunggu No. SJ DealPOS".' },
      { step: 3, title: 'Lihat & Salin SJ Setelah Diinput Admin WH', desc: 'Setelah Admin WH memproses transfer stok, nomor SJ Delivery akan tampil pada kotak Produk dari Marketplace dan dapat Anda lihat/salin.' }
    ],
    button_badges_store: [
      { label: 'Menunggu No. SJ DealPOS (View Only)', color: 'amber', icon: 'Clock' }
    ],
    store_notes: '💡 Store tidak perlu dan tidak dapat mengedit No. SJ Delivery (MKT ➔ Store) karena dokumen transfer tersebut diterbitkan oleh Admin WH.',

    keywords: ['dealpos', 'no sj', 'surat jalan', 'transaksi dealpos', 'marketplace', 'alokasi', 'pos', 'kasir', 'view only'],
    view_count: 88
  },

  {
    id: 'faq-search-product-not-found',
    category: 'manual_shipment',
    is_pinned: true,
    question: 'Kenapa nama atau SKU produk tidak muncul saat diketik di kolom item pesanan / alterasi?',
    answer: 'Input pesanan Manual Shipment dan Alteration membutuhkan seluruh daftar produk master lengkap (nama dan SKU). Lokasi rak fisik dan stok gudang tidak ditampilkan saat input pesanan karena baru diperlukan nanti pada tahap Picking List oleh tim gudang.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Admin Gudang bertugas memastikan master produk lengkap di database. Input item pesanan oleh Store difokuskan pada identitas produk (nama, SKU, size). Informasi lokasi rak gudang dan stok fisik sengaja tidak dimunculkan di form pesanan Store agar proses entri cepat dan bersih, karena alokasi lokasi rak fisik diatur terpisah pada antrean Tugas Picking Gudang. Jika ada artikel baru diunggah di master, klik tombol "Sinkronkan" untuk memuat daftar produk terbaru.',
    action_steps_admin: [
      { step: 1, title: 'Ketik Minimal 2 Huruf', desc: 'Ketik minimal 2 karakter pada kolom pencarian (misal: "MAXTON" atau SKU "F26..."). Sistem akan mencari dari seluruh daftar produk master.' },
      { step: 2, title: 'Pilih Produk dari Daftar', desc: 'Pilih artikel sesuai nama dan ukuran. Informasi rak fisik akan otomatis ditentukan saat diteruskan ke Tugas Picking.' },
      { step: 3, title: 'Klik Tombol [Sinkronkan]', desc: 'Jika ada produk baru ditambahkan di master katalog, klik tombol "Sinkronkan" di samping header Item Pesanan untuk memperbarui daftar produk.' }
    ],
    button_badges_admin: [
      { label: 'Sinkronkan Katalog', color: 'indigo', icon: 'RefreshCw' }
    ],
    admin_notes: 'ℹ️ Seluruh produk master otomatis dapat dicari saat input pesanan. Penentuan lokasi rak fisik dilakukan pada tahap Picking List.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Untuk Tim Store, Anda hanya perlu memilih nama pakaian dan ukuran yang dipesan customer. Anda tidak perlu mengetahui lokasi rak gudang tempat barang disimpan, karena pencarian rak fisik akan diatur oleh tim picker gudang di Tugas Picking. Jika nama barang belum muncul, pastikan mengetik minimal 2 huruf atau klik tombol "Sinkronkan".',
    action_steps_store: [
      { step: 1, title: 'Ketik Nama Produk / SKU', desc: 'Ketik nama baju (misal "MAXTON" atau "DARLENE") di kolom scan/cari. Sistem akan menampilkan daftar produk yang cocok.' },
      { step: 2, title: 'Klik Tombol [Sinkronkan] Jika Belum Muncul', desc: 'Jika produk baru rilis dan belum muncul di browser Anda, klik tombol "Sinkronkan" di samping header Item Pesanan untuk mengunduh daftar produk terbaru.' },
      { step: 3, title: 'Khusus Alteration (Koleksi Lama)', desc: 'Jika pakaian yang di-alter merupakan koleksi lama yang tidak terdaftar di katalog, klik tombol "Produk Seri Lama / Non-Katalog" untuk mengisi deskripsi manual.' }
    ],
    button_badges_store: [
      { label: 'Sinkronkan (Katalog)', color: 'blue', icon: 'RefreshCw' },
      { label: 'Produk Seri Lama', color: 'amber', icon: 'HelpCircle' }
    ],
    store_notes: '💡 Tips Store: Anda cukup fokus memilih nama produk & SKU yang benar. Tim gudang yang akan mencari lokasi raknya saat proses picking.',

    keywords: ['tidak muncul', 'produk tidak ada', 'cari produk', 'sku hilang', 'maxton', 'darlene', 'katalog kosong', 'dropsearch', 'sinkronkan', 'katalog', 'live'],
    view_count: 210
  },

  {
    id: 'faq-ig-live-workflow',
    category: 'manual_shipment',
    is_pinned: true,
    question: 'Bagaimana alur kerja penanganan pesanan IG Live (Sinkronisasi GSheet, Picking List, Cetak Label A6, dan Resi)?',
    answer: 'Modul IG Live menghubungkan Google Sheets rekapan live dengan operasional WMS gudang secara 2-arah: data pesanan ditarik otomatis, digabungkan per Order ID, dicetak lembar picking & label thermal A6, dan resi kurir otomatis tersinkron balik ke Google Sheet.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Admin Gudang mengelola antrean pesanan dari sesi Instagram Live di menu Pesanan Saya ➔ Tab "IG Live". Seluruh pesanan disinkronkan dari Google Sheet (tab "Pesanan LIVE") melalui integrasi Web App Google Apps Script. Saat pesanan masuk, Admin dapat mengelompokkan barang ke Lembar Picking Massal (Wave Picking terurut rak A001-A100), mencetak Label Thermal A6 (lengkap QR Code & detail item), dan menginput nomor resi (satuan atau massal barcode). Setiap nomor resi dan status yang diperbarui di WMS otomatis tersinkron balik ke kolom P (Resi) dan kolom N (Status) pada Google Spreadsheet.',
    action_steps_admin: [
      { step: 1, title: 'Buka Tab IG Live & Sinkronkan', desc: 'Buka menu Pesanan Saya ➔ Tab "IG Live". Klik tombol "Sinkronkan GAS" di kanan atas untuk memuat pesanan terbaru dari sheet Pesanan LIVE.' },
      { step: 2, title: 'Cetak Picking List Massal', desc: 'Buka subtab "Picking & Packing" lalu klik "Cetak Picking List". Sistem otomatis mengurutkan barang berdasarkan prioritas rak fisik gudang.' },
      { step: 3, title: 'Klik [Selesaikan Picking]', desc: 'Setelah barang diambil dari rak fisik, klik "Selesaikan Picking". Status pesanan akan otomatis berubah menjadi "Sedang Dipacking".' },
      { step: 4, title: 'Cetak Label Pengiriman A6', desc: 'Pilih pesanan yang siap dikirim, lalu klik "Cetak Label (A6)". Tempelkan label thermal 105x148mm ke paket customer.' },
      { step: 5, title: 'Input Resi (Satuan atau Massal)', desc: 'Scan atau ketik nomor resi kurir di kolom Resi atau via tombol "Update Resi Massal". Resi dan status "Dikirim" otomatis terkirim dan tercatat di Google Sheet.' }
    ],
    button_badges_admin: [
      { label: 'Sinkronkan GAS', color: 'pink', icon: 'RefreshCw' },
      { label: 'Cetak Picking List', color: 'indigo', icon: 'Printer' },
      { label: 'Cetak Label (A6)', color: 'blue', icon: 'Tag' },
      { label: 'Update Resi Massal', color: 'emerald', icon: 'FileSpreadsheet' }
    ],
    admin_notes: '🚀 Integrasi 2-arah: Nomor resi yang Anda input di WMS otomatis tersimpan di kolom P Google Sheets tanpa perlu admin mengetik manual lagi di sheet.',

    // PERSPEKTIF TIM STORE / OUTLET / HOST LIVE
    answer_store: 'Tim Host / Admin Live cukup fokus merekap pesanan customer di Google Sheets tab "TRANSAKSI". Sistem sinkronisasi otomatis akan mengunci Order ID permanen di tab "Pesanan LIVE" dan mengirimkannya ke layar tim Gudang untuk segera dipacking. Ketika paket telah selesai dipacking dan dikirim, nomor resi kurir akan otomatis muncul di kolom P spreadsheet Anda.',
    action_steps_store: [
      { step: 1, title: 'Input Data Sesi Live di GSheet', desc: 'Isi nama customer, nomor WhatsApp, alamat, kode barang, ukuran, dan harga di tab TRANSAKSI spreadsheet.' },
      { step: 2, title: 'Order ID Terkunci Otomatis', desc: 'Script otomatis membuat Order ID permanen (ORD-YYMMDD-XXX) sehingga multi-item dari customer yang sama otomatis tergabung.' },
      { step: 3, title: 'Pantau Status & Resi', desc: 'Ketika tim gudang mencetak label dan memasukkan nomor resi ekspedisi, kolom Status dan Resi di spreadsheet akan otomatis terisi secara real-time.' }
    ],
    button_badges_store: [
      { label: 'Sheet: Pesanan LIVE', color: 'indigo', icon: 'FileSpreadsheet' },
      { label: 'Auto-Update Resi', color: 'emerald', icon: 'CheckCircle2' }
    ],
    store_notes: '💡 Tim Live tidak perlu repot menanyakan nomor resi satu per satu ke gudang, karena nomor resi otomatis terisi di spreadsheet.',

    keywords: ['ig live', 'instagram live', 'order id', 'picking list ig live', 'label a6', 'thermal a6', 'sinkronkan gas', 'update resi', 'pesanan live'],
    view_count: 140
  },

  {
    id: 'faq-two-step-print-diproses',
    category: 'manual_shipment',
    is_pinned: true,
    question: 'Kapan pesanan Manual Shipment / Alter berpindah dari tab "Pesanan Baru" ke "Sedang Diproses", dan bagaimana cara menggunakan fitur bantu Picking WA Grup (Fonnte) atau cetak massal?',
    answer: 'Pesanan hanya berpindah dari tab "Pesanan Baru" ke "Sedang Diproses" setelah Admin Gudang menyelesaikan 2 tahapan cetak: (1) Cetak Picking List (A4) DAN (2) Cetak Label Paket (A6). Fitur "Picking WA Grup (Fonnte)" merupakan fitur pembantu khusus Admin/Superadmin untuk meneruskan daftar barang & lokasi rak ke grup WA tim picker, dan tidak menggantikan syarat cetak Picking A4 & Label A6.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Sebagai Admin Gudang / Superadmin, syarat memindahkan pesanan dari tab "Pesanan Baru" ke "Sedang Diproses" tetap wajib menyelesaikan 2 tahapan cetak fisik: (1) Klik "Cetak Picking List (A4)" (lembar ceklis pengambilan barang), dan (2) Klik "Cetak Label Paket (A6)". Selain itu, tersedia tombol pembantu khusus Admin "📲 Picking WA Grup (Fonnte)" untuk mengirimkan rincian barang beserta lokasi rak gudang langsung ke Grup WhatsApp Gudang.',
    action_steps_admin: [
      { step: 1, title: 'Cek Indikator Status Cetak (2 Tahap Wajib)', desc: 'Setiap pesanan menampilkan status "Picking List (A4)" dan "Cetak Label (A6)". Keduanya wajib dicetak agar pesanan berpindah ke tab "Sedang Diproses".' },
      { step: 2, title: 'Fitur Pembantu: Kirim Picking ke WA Grup (Khusus Admin)', desc: 'Gunakan tombol "📲 Picking WA Grup" (pada bar Filter Cepat Cetak, toolbar multi-select, atau menu aksi pesanan) sebagai fitur pembantu untuk mengirim rincian SKU, Qty, Lokasi Rak Gudang, dan Instruksi Alterasi ke Grup WA via Fonnte.' },
      { step: 3, title: 'Cetak Picking List (A4) & Label Paket (A6) Massal', desc: 'Gunakan bar "Filter Cepat Cetak" (Belum Cetak Picking / Belum Cetak Label) lalu klik "⚡ Cetak Picking Massal" dan "⚡ Cetak Label Massal".' },
      { step: 4, title: 'Otomatis Pindah ke "Sedang Diproses"', desc: 'Begitu kedua dokumen (Picking List A4 ✓ dan Label Paket A6 ✓) selesai dicetak, status pesanan otomatis berubah menjadi "Diproses" dan berpindah ke tab "Sedang Diproses".' }
    ],
    button_badges_admin: [
      { label: '⚡ Cetak Picking Massal', color: 'indigo', icon: 'FileText' },
      { label: '⚡ Cetak Label Massal', color: 'amber', icon: 'Printer' },
      { label: '📲 Picking WA Grup (Bantu)', color: 'emerald', icon: 'Send' },
      { label: 'Label OK', color: 'emerald', icon: 'CheckCircle2' }
    ],
    admin_notes: '💡 Fitur "📲 Picking WA Grup" hanya tampil di akun Admin/Superadmin (tidak tampil di akun Store) dan berfungsi murni sebagai fitur pembantu koordinasi tim picker tanpa mengubah status cetak dokumen A4/A6.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Tim Store dapat memantau progres penyiapan pesanan di Gudang Pusat melalui indikator badge pada kartu/tabel pesanan. Pesanan yang baru Anda submit akan berada di tab "Pesanan Baru" sampai Admin Gudang menyelesaikan kedua tahapan cetak internal gudang: Cetak Picking List (A4) dan Cetak Label Paket (A6). Tim Store hanya perlu mencetak "SJ Struk Rangkap 2" apabila mengirimkan fisik barang dari toko ke gudang.',
    action_steps_store: [
      { step: 1, title: 'Pantau Indikator di Pesanan', desc: 'Pada tab Rekap Pesanan Toko, Anda dapat melihat progres status pesanan Anda (view-only untuk Store).' },
      { step: 2, title: 'Pindah ke "Sedang Diproses" Setelah 2 Tahap Cetak Gudang', desc: 'Setelah Admin Gudang mencetak Picking List (A4) dan Label Paket (A6), pesanan Anda akan otomatis berpindah ke tab "Sedang Diproses".' },
      { step: 3, title: 'Cetak SJ Struk (Khusus Kirim Barang Toko ke WH)', desc: 'Jika pesanan menggunakan stok fisik dari toko Anda, klik tombol "SJ Struk" / "Kirim" untuk mencetak struk tanda terima pengantaran ke gudang.' }
    ],
    button_badges_store: [
      { label: 'Belum Label (View Only)', color: 'slate', icon: 'Clock' },
      { label: 'Label OK', color: 'emerald', icon: 'CheckCircle2' },
      { label: 'SJ Struk (Khusus Store)', color: 'amber', icon: 'Printer' }
    ],
    store_notes: 'ℹ️ Jika pesanan masih berada di tab "Pesanan Baru" meskipun sudah terlihat "Picking OK", artinya Admin Gudang sedang menyiapkan barang dan segera mencetak Label Paket A6-nya.',

    keywords: ['belum cetak label', 'cetak label massal', 'picking list', 'picking wa grup', 'fonnte', 'lembar ceklis', 'pesanan baru', 'sedang diproses', '2 klik', 'indikator label', 'filter label'],
    view_count: 135
  },

  {
    id: 'faq-custom-sort-rekap-pesanan',
    category: 'manual_shipment',
    is_pinned: true,
    question: 'Bagaimana cara mengubah opsi tampilan (Panel Rapi, Tabel, Kartu) dan mengurutkan (Custom Sort) daftar pesanan di Rekap Manual Shipment & Alter?',
    answer: 'Di pojok kanan atas Rekap Pesanan Toko tersedia 3 opsi tampilan: "Panel Rapi" (tampilan split Master-Detail), "Tabel", dan "Kartu". Seluruh mode tampilan dilengkapi dropdown "Urutkan" (Custom Sort) untuk mengurutkan berdasarkan Waktu (Terbaru/Terlama FIFO), Nama Toko/Outlet, Customer, Jasa Kirim, Jumlah Qty, hingga Prioritas Belum Cetak.',
    target_audience: 'all',

    // PERSPEKTIF ADMIN GUDANG
    answer_admin: 'Sebagai Admin Gudang / CS, Anda dapat menggunakan menu dropdown "Urutkan:" yang berada tepat di sebelah kanan kolom pencarian (maupun dengan mengklik langsung judul kolom pada tampilan Tabel) baik di Rekap Pesanan Toko (Manual Shipment & Alter) maupun di Rekap Retur Barang. Fitur ini memudahkan tim gudang memproses antrean berdasarkan sistem FIFO (Terlama ➔ Terbaru), mengelompokkan paket per Outlet/Store (A ➔ Z), mengelompokkan per Kurir/Ekspedisi saat handover manifest, atau memprioritaskan pesanan yang Belum Cetak Label/Picking.',
    action_steps_admin: [
      { step: 1, title: 'Gunakan Dropdown [Urutkan:] di Toolbar Pencarian', desc: 'Pada tab Rekap Pesanan Toko atau Rekap Retur Barang, klik menu "Urutkan:" di sebelah kolom pencarian.' },
      { step: 2, title: 'Pilih Kriteria Urutan Operasional', desc: 'Pilih "⏳ Terlama ➔ Terbaru (FIFO)" untuk memproses antrean paling awal lebih dulu, "🏬 Per Toko / Store (A ➔ Z)" untuk pengelompokan cabang, "🚚 Jasa Kirim (A ➔ Z)" untuk serah terima kurir, atau "🖨️ Prioritas Belum Cetak" & "✂️ Target Selesai Alter Terdekat".' },
      { step: 3, title: 'Klik Header Kolom pada Mode Tabel', desc: 'Jika menggunakan tampilan Tabel, Anda juga dapat mengklik judul kolom ("No. Pesanan & Store", "Customer & Pengiriman", "Rincian Produk", "Resi & Cetak") untuk membalik urutan secara cepat.' },
      { step: 4, title: 'Klik [Reset] untuk Kembali ke Default', desc: 'Klik tombol merah "Reset" di sebelah kanan toolbar untuk mengembalikan urutan ke default (🕒 Terbaru ➔ Terlama).' }
    ],
    button_badges_admin: [
      { label: 'Urutkan: Terbaru / Terlama (FIFO)', color: 'indigo', icon: 'ArrowUpDown' },
      { label: 'Per Toko / Store (A ➔ Z)', color: 'blue', icon: 'Store' },
      { label: 'Prioritas Belum Cetak', color: 'amber', icon: 'Printer' },
      { label: 'Reset', color: 'rose', icon: 'RefreshCw' }
    ],
    admin_notes: '💡 Urutan yang Anda pilih juga otomatis berlaku ketika Anda mengekspor data ke CSV (Export CSV) maupun saat melakukan Cetak Picking List / Label A6 Massal.',

    // PERSPEKTIF TIM STORE / OUTLET
    answer_store: 'Tim Store dapat mengurutkan daftar pesanan di tab Rekap Pesanan Toko menggunakan menu dropdown "Urutkan:" di sebelah kolom pencarian. Anda bisa melihat pesanan dari yang paling baru diinput (Terbaru ➔ Terlama), mengurutkan dari antrean paling lama (Terlama ➔ Terbaru), mengurutkan berdasarkan Nama Customer (A ➔ Z), Jasa Kirim, maupun Target Selesai Alterasi.',
    action_steps_store: [
      { step: 1, title: 'Buka Tab Rekap Pesanan Toko', desc: 'Masuk ke menu Pesanan Saya ➔ klik tab "Rekap Pesanan".' },
      { step: 2, title: 'Klik Menu [Urutkan:] di Samping Kolom Cari', desc: 'Pilih urutan yang diinginkan: "🕒 Terbaru ➔ Terlama", "⏳ Terlama ➔ Terbaru (FIFO)", "👤 Nama Customer (A ➔ Z)", "🚚 Jasa Kirim", atau "✂️ Target Selesai Alter Terdekat".' },
      { step: 3, title: 'Klik Judul Kolom di Tampilan Tabel', desc: 'Pada mode tampilan Tabel, klik langsung judul kolom untuk mengganti urutan naik/turun secara instan.' }
    ],
    button_badges_store: [
      { label: 'Urutkan: Terbaru / Terlama', color: 'indigo', icon: 'ArrowUpDown' },
      { label: 'Nama Customer (A ➔ Z)', color: 'emerald', icon: 'User' },
      { label: 'Jasa Kirim (A ➔ Z)', color: 'blue', icon: 'Truck' }
    ],
    store_notes: 'ℹ️ Jika ingin kembali ke urutan awal (pesanan terbaru di bagian paling atas), cukup pilih "🕒 Terbaru ➔ Terlama" atau klik tombol "Reset".',

    keywords: ['sort', 'urutkan', 'sorting', 'terlama', 'terbaru', 'fifo', 'urut toko', 'per toko', 'urut customer', 'urut kurir', 'rekap pesanan', 'rekap retur'],
    view_count: 95
  }
];


