import { StoreFaqItem } from '../types';

export const INITIAL_STORE_FAQS: StoreFaqItem[] = [
  {
    id: 'faq-split-fulfill-1',
    category: 'multi_store',
    is_pinned: true,
    question: 'Bagaimana cara kirim produk yang sama 2 pcs tapi 1 dari Marketplace dan 1 dari Store?',
    answer: 'Jika ada pesanan dengan 2 pcs produk yang sama (misal Darlene Cream 2 pcs) namun sumber pemenuhannya berbeda (1 dari stok Marketplace Gudang dan 1 dari rak Toko Cabang), Anda wajib memisahkan baris produk tersebut menggunakan tombol Split Fulfil.',
    keywords: ['split', 'fulfil', 'marketplace', 'store', '2 pcs', 'produk sama', 'beda toko', 'campur', 'pisah', 'pecah', 'baris', 'cabang'],
    button_badges: [
      { label: 'Split Fulfil', color: 'indigo', icon: 'GitFork' },
      { label: 'Fulfillment: Marketplace', color: 'emerald', icon: 'Store' },
      { label: 'Fulfillment: [Nama Store]', color: 'blue', icon: 'Building2' }
    ],
    action_steps: [
      { step: 1, title: 'Input Qty 2 pcs', desc: 'Scan atau ketik SKU produk di form Manual Shipment, lalu atur Qty menjadi 2 (atau lebih).' },
      { step: 2, title: 'Klik Tombol [Split Fulfil]', desc: 'Tombol ungu "Split Fulfil" akan otomatis muncul di bawah input Qty. Klik tombol tersebut.' },
      { step: 3, title: 'Baris Terpecah Otomatis', desc: 'Baris atas otomatis berkurang menjadi 1 pcs, dan baris baru di bawahnya terbuat dengan 1 pcs.' },
      { step: 4, title: 'Tentukan Fulfillment Masing-Masing', desc: 'Pilih Fulfillment "Marketplace" untuk baris 1, dan pilih nama Toko cabang untuk baris 2.' }
    ],
    view_count: 142
  },
  {
    id: 'faq-id-form-alter-manual',
    category: 'alteration_repair',
    is_pinned: true,
    question: 'No. ID Form Alter diisi apa dan oleh siapa? Apakah boleh dikosongkan?',
    answer: 'No. ID Form Alter WAJIB diisi manual oleh tim Store untuk setiap produk yang butuh alterasi, baik barang berasal dari Store maupun dari Marketplace. Nomor ini mengacu pada nomor pendaftaran formulir fisik alter di toko Anda (misal: ALT-CP-2610-001). Tidak boleh dikosongkan agar penjahit gudang memiliki nomor acuan SPK yang valid.',
    keywords: ['alter', 'alteration', 'id form alter', 'no id', 'manual', 'store', 'wajib', 'kosong', 'spk', 'penjahit', 'potong'],
    button_badges: [
      { label: 'Butuh Alteration / Permak', color: 'rose', icon: 'Scissors' },
      { label: 'No. ID Form Alter Store *', color: 'purple', icon: 'FileText' }
    ],
    action_steps: [
      { step: 1, title: 'Centang Opsi Alteration', desc: 'Pada baris produk, centang kotak "Butuh Alteration / Permak Pakaian".' },
      { step: 2, title: 'Isi No. ID Form Alter Manual', desc: 'Ketik nomor ID Form Alter sesuai nomor fisik pendaftaran di outlet toko Anda.' },
      { step: 3, title: 'Lengkapi Instruksi & Foto', desc: 'Tuliskan detail pengerjaan (contoh: "Potong panjang 4 cm rapi") dan unggah foto pakaian jika ada.' }
    ],
    view_count: 118
  },
  {
    id: 'faq-sold-out-handling',
    category: 'manual_shipment',
    is_pinned: true,
    question: 'Barang di toko penyedia ternyata kosong / reject (Sold Out), apa yang harus dilakukan Store?',
    answer: 'Tombol "Tandai Sold Out" adalah wewenang khusus Admin Gudang demi menjaga sinkronisasi stok dan DealPOS. Jika staf Store menemukan barang fisik di rak toko Anda ternyata kosong atau rusak, Store TIDAK BISA membatalkan langsung, melainkan harus segera melapor ke Admin Gudang.',
    keywords: ['sold out', 'kosong', 'habis', 'reject', 'rusak', 'cacat', 'batal', 'partial', 'kirim sebagian', 'toko kosong'],
    button_badges: [
      { label: 'Ajukan ke Admin Gudang', color: 'rose', icon: 'AlertTriangle' },
      { label: 'Kirim Sebagian / Partial (Proses Admin)', color: 'amber', icon: 'Package' }
    ],
    action_steps: [
      { step: 1, title: 'Verifikasi Fisik di Rak Toko', desc: 'Pastikan barang di toko Anda memang benar-benar kosong atau reject (rusak permanen).' },
      { step: 2, title: 'Laporkan ke Admin Gudang Segera', desc: 'Gunakan tab "Ajukan Kendala ke Superadmin" di Pusat Bantuan ini (atau hubungi Admin via chat). Informasikan No. Pesanan dan produk yang kosong.' },
      { step: 3, title: 'Admin Eksekusi di Sistem', desc: 'Admin Gudang akan menekan tombol "Tandai Sold" di sistem, lalu memutuskan apakah pesanan dikirim sebagian (partial) atau dialihkan ke toko lain.' }
    ],
    view_count: 95
  },
  {
    id: 'faq-send-store-to-wh',
    category: 'multi_store',
    question: 'Kapan Store harus mengirimkan barang fisik ke Gudang Pusat Chocochips?',
    answer: 'Store wajib mengirimkan barang fisik ke Gudang jika toko Anda ditunjuk sebagai penyedia barang pesanan store lain (Multi-Store Fulfillment), atau barang customer memerlukan pengerjaan alter/repair oleh penjahit gudang. Jika pemenuhan pesanan adalah Marketplace, toko tidak perlu mengirim barang.',
    keywords: ['kirim ke gudang', 'surat jalan struk', 'antar fisik', 'multi store', 'kurir internal', 'ekspedisi', 'packing'],
    button_badges: [
      { label: 'Cetak Surat Jalan Struk', color: 'blue', icon: 'Printer' },
      { label: 'Kirim ke Gudang', color: 'emerald', icon: 'Truck' }
    ],
    action_steps: [
      { step: 1, title: 'Periksa Tab Rekap Pesanan Toko', desc: 'Lihat daftar pesanan dengan label toko Anda sebagai penyedia barang, atau pesanan alter toko Anda.' },
      { step: 2, title: 'Cetak Surat Jalan Struk', desc: 'Pilih opsi "Cetak SJ Struk" pada kolom aksi, cetak dan masukkan ke dalam plastik bersama pakaian.' },
      { step: 3, title: 'Serahkan ke Kurir / Driver', desc: 'Serahkan barang fisik beserta struk ke kurir/driver internal untuk diantar ke Gudang Pusat.' }
    ],
    view_count: 82
  },
  {
    id: 'faq-resi-courier-input',
    category: 'resi_tracking',
    question: 'Siapa yang menginput nomor resi kurir ke customer?',
    answer: 'Nomor resi kurir pengiriman ke customer diinput sepenuhnya oleh Tim Admin Gudang Pusat setelah paket selesai dipacking dan ditempeli label ekspedisi. Tim Store TIDAK PERLU menginput nomor resi pengiriman customer saat mendaftarkan pesanan manual.',
    keywords: ['resi', 'no resi', 'kurir', 'jne', 'jnt', 'sicepat', 'gosend', 'ekspedisi', 'tracking', 'lacak'],
    button_badges: [
      { label: 'Input Resi (Khusus Admin Gudang)', color: 'blue', icon: 'Truck' }
    ],
    action_steps: [
      { step: 1, title: 'Store Input Pesanan', desc: 'Staf toko cukup memilih jasa kirim yang diminta customer dan melengkapi alamat tujuan.' },
      { step: 2, title: 'Gudang Packing & Cetak Resi', desc: 'Gudang Pusat mengumpulkan semua barang fisik dan mempacking paket.' },
      { step: 3, title: 'Status Berubah Dikirim', desc: 'Admin gudang menginput resi di WMS, dan status pesanan otomatis berubah menjadi "Dikirim".' }
    ],
    view_count: 73
  },
  {
    id: 'faq-no-sj-dealpos',
    category: 'stok_dealpos',
    question: 'Apa itu No. SJ DealPOS dan apakah wajib diisi saat input pesanan?',
    answer: 'No. SJ DealPOS adalah nomor Surat Jalan transfer resmi dari sistem DealPOS saat memotong stok alokasi marketplace ke gudang. Untuk Tim Store, kolom ini bersifat opsional saat pertama kali submit pesanan, dan dapat dilengkapi kemudian oleh Admin Gudang.',
    keywords: ['dealpos', 'no sj', 'surat jalan', 'tr', 'transfer', 'marketplace', 'alokasi'],
    button_badges: [
      { label: 'No SJ DealPOS (Opsional untuk Store)', color: 'amber', icon: 'FileText' }
    ],
    action_steps: [
      { step: 1, title: 'Opsional Saat Submit', desc: 'Jika PIC Store sudah memiliki nomor SJ transfer dari DealPOS, ketikkan di kolom No SJ DealPOS.' },
      { step: 2, title: 'Admin Gudang Bisa Update', desc: 'Jika belum ada, kosongkan saja. Admin Gudang akan mengupdate nomor SJ saat validasi barang di rak gudang.' }
    ],
    view_count: 64
  },
  {
    id: 'faq-cancel-manual-shipment',
    category: 'manual_shipment',
    question: 'Bagaimana cara membatalkan pesanan manual shipment yang salah input?',
    answer: 'Untuk menjaga keutuhan stok fisik dan histori audit, Tim Store (Outlet) TIDAK MEMILIKI tombol "Batalkan Pesanan" di layar mereka. Pembatalan hanya dapat dieksekusi oleh Admin Gudang setelah menerima permohonan dari Store.',
    keywords: ['batal', 'batalkan', 'cancel', 'salah input', 'keliru', 'hapus pesanan', 'store batal'],
    button_badges: [
      { label: 'Ajukan Kendala ke Superadmin (Store)', color: 'rose', icon: 'MessageSquare' },
      { label: 'Batalkan Pesanan (Khusus Admin Gudang)', color: 'slate', icon: 'Trash2' }
    ],
    action_steps: [
      { step: 1, title: 'Pastikan Paket Belum Diproses Kirim', desc: 'Pesanan hanya dapat dibatalkan jika statusnya masih baru dan belum dipacking/dikirim oleh ekspedisi.' },
      { step: 2, title: 'Ajukan Permohonan Batal dari Store', desc: 'Buka tombol "Bantuan Flow" -> klik tab "Ajukan Kendala ke Superadmin" (atau chat Admin Gudang). Cantumkan No. Pesanan dan alasan pembatalan (misal: customer ganti alamat/salah size).' },
      { step: 3, title: 'Admin Gudang Batalkan di Sistem', desc: 'Admin Gudang akan memverifikasi permohonan Anda dan menekan tombol merah "Batalkan Pesanan" di sistem gudang.' }
    ],
    view_count: 51
  }
];
