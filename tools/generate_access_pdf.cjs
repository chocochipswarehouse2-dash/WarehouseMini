const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default;

const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
});

// Color Palette
const PRIMARY = [15, 23, 42];     // Slate 900
const ACCENT = [249, 115, 22];    // Orange 500
const VIEW_COLOR = [2, 132, 199]; // Sky 600
const DRAFT_COLOR = [13, 148, 136]; // Teal 600
const ACTION_COLOR = [234, 88, 12]; // Orange 600
const CONTROL_COLOR = [225, 29, 72]; // Rose 600
const BORDER_COLOR = [226, 232, 240];

// Helper to draw Header
function drawCoverPage() {
  // Background Header
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, 210, 45, 'F');

  // Accent Line
  doc.setFillColor(...ACCENT);
  doc.rect(0, 45, 210, 3, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('WMS INVENTORY — SISTEM HAK AKSES', 14, 20);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('Matriks Pemetaan 4 Hierarki Role Akses: Seluruh Halaman, Tab & Fitur', 14, 28);
  doc.text('Standar Operasional Gudang: User (Kru) vs Admin (Superadmin)', 14, 35);

  doc.setTextColor(15, 23, 42);
  let y = 58;

  // Introduction Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BORDER_COLOR);
  doc.roundedRect(14, y, 182, 38, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PRIMARY);
  doc.text('PENJELASAN 4 PILAR HIERARKI AKSES', 18, y + 8);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text('1. VIEW (Melihat): Membuka halaman, membaca stok rak, memantau daftar order & histori. [Semua User]', 18, y + 15);
  doc.text('2. INPUT / DRAFT (Form Sementara): Scan barcode, isi form, edit/hapus baris barang sebelum klik Simpan. [Semua User]', 18, y + 21);
  doc.text('3. AKSI OPERASIONAL (Eksekusi): Submit/simpan ke database, cetak label barcode, setting printer/scanner. [Semua User]', 18, y + 27);
  doc.text('4. KONTROL / OTORISASI (Wewenang Penuh): Koreksi data tersimpan (Edit/Hapus), approval SO, master & setup. [Khusus Admin]', 18, y + 33);

  return y + 45;
}

const tableData = [
  // 1. Dashboard
  [
    '1. Dashboard Utama',
    '• Kartu KPI Ringkasan\n• Grafik Aktivitas Gudang\n• Alert Stok Minimum\n• Shortcut Menu Cepat',
    'Lihat metrik KPI, grafik volume transaksi, status koneksi Supabase & GAS, daftar produk hampir habis.',
    'Filter rentang tanggal (Hari Ini, 7 Hari, 30 Hari, Kustom), filter status.',
    'Klik navigasi cepat ke form mutasi, picking, atau scan barcode.',
    'Atur target KPI gudang, konfigurasi ambang batas alert stok, ekspor laporan eksekutif.'
  ],
  // 2. Agenda & Project
  [
    '2. Agenda & Project',
    '• Kalender Kerja Gudang\n• Proyek & Task List Tim\n• Status Progres Pekerjaan',
    'Lihat kalender kerja, jadwal Stock Opname, jadwal kedatangan CMT, timeline tugas tim.',
    'Isi form task baru, tambah checklist kerja, lampirkan foto sebelum disimpan.',
    'Tandai tugas selesai (Checklist Done), update progres pekerjaan mandiri.',
    'Edit/hapus tugas yang sudah tersimpan, delegasi/ubah penanggung jawab task.'
  ],
  // 3. Pesanan Saya
  [
    '3. Pesanan Saya\n(Multi-Channel)',
    '• Manual Shipment\n• Transfer Order (TO)\n• Shopee & TikTok Shop\n• Website / WooCommerce\n• Lazada',
    'Lihat pesanan masuk, rincian SKU barang per pesanan, status siap kirim/terkirim/batal.',
    'Ketik nomor resi manual, scan barcode verifikasi packing di keranjang sebelum kirim.',
    'Cetak label pengiriman thermal / resi kurir, ubah status pesanan menjadi "Siap Kirim" (Packed).',
    'Batalkan pesanan tersimpan (Void Order), koreksi alamat/item tersimpan, setup API toko & webhook.'
  ],
  // 4. Pusat Resolusi
  [
    '4. Pusat Resolusi',
    '• Retur Pelanggan\n• Refund (Ganti Dana)\n• RTS (Gagal Kirim Kurir)\n• Komplain Barang Rusak\n• Rating & Review Toko',
    'Lihat daftar klaim retur, nomor resi RTS balik ke gudang, histori komplain dan rating toko.',
    'Isi form penerimaan retur, ketik nomor resi retur, pilih alasan retur, unggah foto unboxing.',
    'Submit barang retur ke rak karantina gudang, cetak tanda terima retur.',
    'Approval penukaran barang / ganti dana (Refund), hapus tiket retur, edit status retur tersimpan, ekspor Excel.'
  ],
  // 5. Produksi & CMT
  [
    '5. Produksi & CMT',
    '• Penerimaan Barang Jadi CMT\n• Monitoring Kargo Produksi\n• Surat Jalan Masuk',
    'Lihat daftar surat jalan CMT masuk, progres PO produksi, riwayat kargo kain & aksesoris.',
    'Input nomor surat jalan, scan barcode SKU barang jadi, ketik qty kirim vs riil terima, foto nota jalan.',
    'Submit penerimaan barang jadi (resmi menambah stok gudang), cetak tanda terima vendor CMT.',
    'Koreksi/revisi penerimaan tersimpan jika ada komplain CMT, hapus surat jalan salah input, approval selisih kargo.'
  ],
  // 6. Loading Dock
  [
    '6. Loading Dock',
    '• Penerimaan Store/Paket\n• Pengiriman Ekspedisi\n(J&T, SiCepat, SPX, JNE)',
    'Lihat jadwal pick-up kurir, daftar karung/koli siap kirim, histori paket keluar.',
    'Scan resi paket ke manifest serah terima, foto kurir pick-up & nomor polisi kendaraan.',
    'Submit manifest serah terima kurir ekspedisi, cetak bukti serah terima (Surat Jalan Ekspedisi).',
    'Batalkan serah terima paket yang tertinggal/keliru, edit manifest tersimpan, hapus log duplikat.'
  ],
  // 7. Scanner | Mutasi | SO
  [
    '7. Scanner, Mutasi\n& Stock Opname',
    '• Scanner Barcode In / Out\n• Mutasi Antar Rak & Gudang\n• Histori Log Mutasi\n• Stock Opname (SO Fisik)',
    'Lihat log mutasi masuk/keluar, histori perpindahan rak, status sesi Stock Opname aktif.',
    'Scan barcode SKU ke keranjang draft, atur qty (+/-), pilih rak asal & tujuan, hapus baris salah scan.',
    'Submit transaksi mutasi ke Supabase, input angka hitung fisik (blind count) SO, setelan scanner HP (beep/getar).',
    'KOREKSI DATA TERSIMPAN: Edit/Void mutasi tersimpan, APPROVAL & EKSEKUSI selisih SO ke sistem, ekspor Excel.'
  ],
  // 8. Katalog Produk
  [
    '8. Katalog Produk\n& Master SKU',
    '• Galeri Foto & Visual Model\n• Lookup Master SKU & Size\n• Upload File Excel Master\n• Batch Sync Google Drive',
    'Lihat katalog visual foto produk, lookup SKU resmi, standar nama & ukuran, harga jual.',
    'Form tambah produk baru (isi nama, SKU, size, kategori), pilih foto produk sebelum diunggah.',
    'Download foto produk, gunakan lookup SKU untuk mencetak label barcode.',
    'TAMBAH/EDIT/HAPUS MASTER PRODUK, upload massal file Excel master SKU, sinkronisasi batch folder Google Drive.'
  ],
  // 9. Laporan QC & Perbaikan
  [
    '9. Laporan QC\n& Perbaikan',
    '• Antrean Reject / Cacat\n• Antrean Cuci Noda\n• Antrean Permak Jahit\n• Approval Biaya Perbaikan\n• Defect Afkir Permanen',
    'Lihat daftar barang rusak/kotor, estimasi biaya reparasi, status pengerjaan laundry & tailor.',
    'Isi form laporan reject baru (scan SKU, pilih jenis cacat: sobek, noda, kancing), unggah foto kondisi fisik.',
    'Submit laporan reject ke antrean perbaikan, cetak QC Tag (label gantung) barang cacat.',
    'APPROVAL BIAYA PERBAIKAN (ACC Harga), putuskan afkir permanen (write-off stok), edit/hapus laporan tersimpan.'
  ],
  // 10. Inventory & Rak
  [
    '10. Inventory\n& Pemetaan Rak',
    '• Saldo Stok Real-Time\n• Pemetaan Lokasi Rak (Bin)\n• Alert Stok Menipis/Habis\n• Kuota Stok DealPOS',
    'Lihat sisa saldo stok per SKU, per warna, per ukuran, dan lokasi rak penyimpanannya.',
    'Filter pencarian cepat berdasarkan nama produk, SKU, kategori, atau nomor rak.',
    'Cetak laporan daftar rak, pilih produk untuk cetak barcode massal.',
    'Penyesuaian manual saldo stok (Manual Adjustment), tambah/edit/hapus master nomor rak, ekspor database ke Excel.'
  ],
  // 11. Tugas Picking
  [
    '11. Tugas Picking\n& Packing',
    '• Antrean Picking E-Commerce\n• Keranjang Troli Picking\n• Verifikasi Meja Packing',
    'Lihat daftar pesanan yang harus diambil di rak, rincian lokasi rak barang, kuantiti yang diminta.',
    'Scan barcode saat ambil barang di rak, beri centang barang yang sudah masuk troli.',
    'Selesaikan batch picking (Complete Batch), cetak lembar tugas picking (Picking Slip).',
    'Batalkan tugas picking yang sedang berjalan, alihkan tugas ke picker lain, koreksi data picking tersimpan.'
  ],
  // 12. Peminjaman SPS
  [
    '12. Peminjaman (SPS)',
    '• Form Peminjaman Sampel\n(Live Studio, Endorse, Marketing)\n• Status Sedang Dipinjam\n• Pengembalian & Cek Fisik',
    'Lihat daftar barang dipinjam, jatuh tempo pengembalian, status barang (Dipinjam / Kembali / Rusak).',
    'Scan SKU yang dipinjam, ketik nama peminjam & divisi, tanggal janji kembali, foto kondisi awal.',
    'Submit transaksi peminjaman, cetak nota surat jalan SPS, submit konfirmasi penerimaan barang kembali.',
    'Otorisasi status khusus, edit catatan peminjaman tersimpan, hapus catatan peminjaman, hapus denda barang hilang.'
  ],
  // 13. Cetak Barcode
  [
    '13. Cetak Barcode\n& Cetak Label',
    '• Cetak Barcode 50x20 mm\n• Cetak Label Resi Pengiriman\n• Preview & Antrean Cetak',
    'Preview visual barcode dan label sebelum dicetak, cek status konektivitas printer thermal.',
    'Pilih SKU dari master, tentukan jumlah rangkap cetak (copies), pilih elemen label (Nama, Size, Barcode).',
    'Eksekusi tombol cetak ke printer Bluetooth / USB thermal 50x20 mm, kalibrasi kertas (Feed).',
    'Ubah template desain barcode, konfigurasi printer default sistem, hapus histori antrean cetak.'
  ],
  // 14. Modul HR
  [
    '14. HR & Presensi',
    '• Data Karyawan & Roster Shift\n• Presensi Mandiri (GPS + Foto)\n• Pengajuan Lembur & Cuti\n• Approval HR & Rekap Gaji',
    'Karyawan melihat jadwal shift sendiri, riwayat absensi diri, sisa kuota cuti, dan profil pribadi.',
    'Isi form cuti/lembur, upload surat sakit dokter, ambil foto selfie presensi masuk/pulang.',
    'Submit presensi masuk/pulang (Clock-in/out), kirim pengajuan cuti/lembur mandiri.',
    'APPROVAL CUTI & LEMBUR, tambah/edit/hapus data karyawan, atur roster tim, edit absensi manual, ekspor rekap gaji.'
  ],
  // 15. Setup / Pengaturan
  [
    '15. Pengaturan\n(Modal Setup)',
    '• Printer Thermal & Scanner\n• Tema & Tampilan Pribadi\n• Manajemen Akun & Password\n• Manajemen Role & Hak Akses\n• Konfigurasi Database Supabase\n• Integrasi Cloud & Webhook',
    'USER: Melihat status printer & opsi tampilan pribadi.\nADMIN: Melihat daftar user, role, tabel database, status webhook.',
    'USER: Pilih perangkat Bluetooth di daftar pairing, atur ukuran font.\nADMIN: Isi form user baru, ketik password baru, atur centang permission.',
    'USER & ADMIN: Sambungkan printer Bluetooth, tes print thermal 50x20 mm, tes scanner beep/getar, ganti Dark/Light mode.',
    'KHUSUS ADMIN: Tambah/edit/hapus akun pengguna, reset password, ubah role, atur hak akses, simpan konfigurasi Supabase & GAS, trigger sync cloud.'
  ]
];

// Start building PDF
const startY = drawCoverPage();

autoTable(doc, {
  startY: startY,
  head: [[
    'Modul / Halaman',
    'Tab & Komponen',
    '1. VIEW\n(Melihat)',
    '2. INPUT / DRAFT\n(Form Sementara)',
    '3. AKSI OPERASIONAL\n(Submit & Cetak)',
    '4. KONTROL / OTORISASI\n(Khusus Admin)'
  ]],
  body: tableData,
  theme: 'grid',
  styles: {
    font: 'helvetica',
    fontSize: 7.2,
    cellPadding: 2.2,
    valign: 'top',
    overflow: 'linebreak',
    textColor: [30, 41, 59],
    lineColor: BORDER_COLOR,
    lineWidth: 0.15,
  },
  headStyles: {
    fillColor: PRIMARY,
    textColor: [255, 255, 255],
    fontStyle: 'bold',
    fontSize: 7.5,
    halign: 'center',
    valign: 'middle',
  },
  columnStyles: {
    0: { cellWidth: 26, fontStyle: 'bold', textColor: [15, 23, 42] },
    1: { cellWidth: 32 },
    2: { cellWidth: 31 },
    3: { cellWidth: 31 },
    4: { cellWidth: 31 },
    5: { cellWidth: 31, fontStyle: 'bold', textColor: [190, 18, 60] },
  },
  alternateRowStyles: {
    fillColor: [248, 250, 252],
  },
  margin: { left: 14, right: 14, top: 15, bottom: 15 },
  didDrawPage: function (data) {
    // Header for subsequent pages
    if (doc.internal.getNumberOfPages() > 1) {
      doc.setFillColor(...PRIMARY);
      doc.rect(0, 0, 210, 10, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('WMS INVENTORY — MATRIKS 4 HIERARKI HAK AKSES PER MODUL', 14, 6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text('Standar Operasional Gudang (User vs Admin)', 140, 6.5);
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Halaman ${data.pageNumber} | WMS Warehouse Mini Inventory System | Dokumen Resmi Hak Akses`,
      14,
      doc.internal.pageSize.height - 8
    );
    doc.text(
      'Dicetak: 2026-09-27 | WMS Chocochips Inventory',
      doc.internal.pageSize.width - 70,
      doc.internal.pageSize.height - 8
    );
  }
});

// Output file to public/
const outputDir = path.join(__dirname, '../public');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'DOKUMEN_HIERARKI_HAK_AKSES_WMS.pdf');
const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outputPath, pdfBuffer);

console.log(`PDF berhasil dibuat: ${outputPath} (${pdfBuffer.length} bytes)`);
