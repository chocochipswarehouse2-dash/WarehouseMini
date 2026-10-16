import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Printer,
  Building2,
  ShieldCheck,
  Truck,
  Scissors,
  MessageCircle,
  FileText,
  CheckCircle2,
  AlertOctagon,
  Clock,
  Package,
  Sparkles,
  Layers,
  ArrowRight,
  FileCheck,
  Check,
  Ban,
  Tag,
  Search,
  RefreshCw,
  Edit3
} from 'lucide-react';
import { UserSession } from '../../types';

interface SopPresentationModalProps {
  session: UserSession | null;
  onClose: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const SopPresentationModal: React.FC<SopPresentationModalProps> = ({
  session,
  onClose,
  onShowToast,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'admin' | 'store'>('admin');

  const totalSlides = 8;

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev < totalSlides - 1 ? prev + 1 : 0));
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : totalSlides - 1));
  }, [totalSlides]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        prevSlide();
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide, isFullscreen, onClose]);

  // Auto play slideshow
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setInterval(() => {
        nextSlide();
      }, 7000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, nextSlide]);

  const slidesTitle = [
    '1. Tahap 1: Store Input Pesanan & Pendaftaran Sistem',
    '2. Tahap 2: Pemrosesan Order oleh Admin & Gudang Pusat',
    '3. Tahap 3: Pengiriman, Input Resi & WA Notif Customer',
    '4. Case Study 1: Multi-Store Fulfillment (Order Lintas Toko)',
    '5. Case Study 2: Penanganan Stok Kosong & Pengalihan Alokasi',
    '6. Case Study 3: Modul Alteration & Repair (SPK Penjahit)',
    '7. Case Study 4: Pembatalan Order & Panduan Tombol UI Aksi',
    '8. Checklist & Best Practices Operasional Admin & Store'
  ];

  const handlePrintSop = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden print:p-0 print:bg-white print:static">
      <div
        className={`bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col transition-all duration-300 w-full overflow-hidden ${
          isFullscreen ? 'fixed inset-0 rounded-none z-[10000]' : 'max-w-6xl max-h-[92vh] h-[850px]'
        }`}
      >
        {/* HEADER TOOLBAR */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Panduan Step-by-Step Flow Operasional</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                  Admin & Store Workflow
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-extrabold text-white truncate max-w-md sm:max-w-xl">
                {slidesTitle[currentSlide]}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handlePrintSop}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Cetak SOP / Export PDF"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isPlaying ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isPlaying ? 'Jeda Slideshow' : 'Mulai Slideshow Otomatis'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer hidden sm:flex"
              title={isFullscreen ? 'Keluar Fullscreen' : 'Mode Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer ml-1"
              title="Tutup Presentasi"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PROGRESS BAR */}
        <div className="w-full bg-slate-800 h-1 shrink-0">
          <div
            className="bg-indigo-500 h-1 transition-all duration-300"
            style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }}
          />
        </div>

        {/* SLIDE CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950/60 relative">
          
          {/* SLIDE 1: TAHAP 1 - STORE INPUT PESANAN */}
          {currentSlide === 0 && (
            <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-slate-800 pb-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[11px] font-bold font-mono mb-1">
                  LANGKAH 1 DARI 3
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <span>Tahap 1: Store Input Pesanan Manual Shipment</span>
                </h2>
                <p className="text-xs text-slate-400">Rincian data yang wajib diisi oleh tim Store/Admin dan efek otomatis saat pesanan di-submit.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Form Field Detail */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h3 className="font-bold text-indigo-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4 text-indigo-400" />
                    <span>Rincian Form Input Pesanan (Wajib Diisi):</span>
                  </h3>
                  
                  <ul className="space-y-2 text-slate-300 text-[11px]">
                    <li className="p-2 rounded bg-slate-950 border border-slate-800">
                      <strong className="text-white">1. Toko Pemohon / Pengirim:</strong> Pilih cabang outlet (misal: <em>Central Park Jakarta</em>).
                    </li>
                    <li className="p-2 rounded bg-slate-950 border border-slate-800">
                      <strong className="text-white">2. Data Customer:</strong> Nama Lengkap, Nomor HP/WhatsApp Aktif, dan Alamat Lengkap Pengiriman.
                    </li>
                    <li className="p-2 rounded bg-slate-950 border border-slate-800">
                      <strong className="text-white">3. Ekspedisi & Tipe Kirim:</strong> Pilih JNE YES/REG, GoSend/Grab, Paxel, atau Pick Up Store.
                    </li>
                    <li className="p-2 rounded bg-slate-950 border border-slate-800">
                      <strong className="text-white">4. Pilihan Layanan:</strong> <em>Manual Shipment Biasa</em>, <em>Alteration (Potong)</em>, atau <em>Repair (Perbaikan)</em>.
                    </li>
                    <li className="p-2 rounded bg-slate-950 border border-slate-800">
                      <strong className="text-white">5. Item Produk:</strong> Cari SKU Produk, Tentukan Size (S/M/L), Qty, dan Catatan Tambahan (detail cm potong jika alter).
                    </li>
                  </ul>
                </div>

                {/* Submit Effect & Registration */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h3 className="font-bold text-emerald-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Apa yang Terjadi Setelah Tombol 'Submit' Diklik?</span>
                  </h3>

                  <div className="space-y-2.5 text-[11px] text-slate-300">
                    <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-800/80 space-y-1">
                      <div className="font-bold text-indigo-300">🆔 1. Menerbitkan No. Invoice Unik Permanen</div>
                      <p className="text-slate-400">Sistem otomatis mencetak ID Invoice unik seperti <strong className="text-sky-300 font-mono">MSCPJ-261014-A8JG</strong> sebagai acuan lacak.</p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/80 space-y-1">
                      <div className="font-bold text-amber-300">📌 2. Pendaftaran Status 'Perlu Diproses'</div>
                      <p className="text-slate-400">Pesanan langsung terdaftar di Tab <strong className="text-amber-200">Perlu Diproses / Diterima</strong> untuk siap ditindaklanjuti oleh Tim Gudang.</p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/80 space-y-1">
                      <div className="font-bold text-emerald-300">💬 3. Notifikasi Fonnte WA Terarah ke Toko Penyedia</div>
                      <p className="text-slate-400">Jika produk ditarik dari toko lain, pesan WA otomatis terkirim ke kontak resmi toko penyedia untuk mengambil fisik baju dari rak.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 2: TAHAP 2 - PEMROSESAN OLEH ADMIN & GUDANG */}
          {currentSlide === 1 && (
            <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-slate-800 pb-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[11px] font-bold font-mono mb-1">
                  LANGKAH 2 DARI 3
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  <span>Tahap 2: Pemrosesan Order oleh Tim Admin & Gudang Pusat</span>
                </h2>
                <p className="text-xs text-slate-400">Langkah operasional dari melihat tab 'Perlu Diproses', cetak picking list, cetak label A6, hingga Surat Jalan Struk.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                {/* Step A: Picking List */}
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sky-300">
                    <FileText className="w-4 h-4 text-sky-400" />
                    <span>1. Cetak Picking List</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Tim Admin/Gudang menekan tombol <strong className="text-sky-200">Cetak Picking List</strong> untuk dicetak lembar ambilan barang dari lokasi rak gudang/toko.
                  </p>
                  <div className="p-2 rounded bg-sky-950/60 border border-sky-800/80 text-[10px] text-sky-300 font-mono">
                    📋 Ambil Barang: SKU & Rak Tertera
                  </div>
                </div>

                {/* Step B: Label A6 */}
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <Tag className="w-4 h-4 text-amber-400" />
                    <span>2. Cetak Label A6 Stiker</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Menekan tombol <strong className="text-amber-200">Cetak Label A6</strong> untuk mencetak stiker thermal kemasan luar yang memuat nama customer, alamat, & barcode invoice.
                  </p>
                  <div className="p-2 rounded bg-amber-950/60 border border-amber-800/80 text-[10px] text-amber-300 font-mono">
                    🏷️ Tempel di Plastik / Kardus Luar
                  </div>
                </div>

                {/* Step C: SJ Struk Thermal */}
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-300">
                    <Printer className="w-4 h-4 text-emerald-400" />
                    <span>3. Cetak SJ Struk Thermal</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Menekan tombol <strong className="text-emerald-200">Cetak SJ Struk (Rangkap 2)</strong>: Lembar 1 untuk arsip fisik toko, Lembar 2 ditempel pada baju.
                  </p>
                  <div className="p-2 rounded bg-emerald-950/60 border border-emerald-800/80 text-[10px] text-emerald-300 font-mono">
                    🖨️ Struk Thermal Rangkap 2
                  </div>
                </div>
              </div>

              {/* SJ DealPOS Input Special Feature */}
              <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 text-xs space-y-2">
                <div className="font-bold text-indigo-300 flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-indigo-400" />
                  <span>Pengisian No. SJ DealPOS (Khusus Alokasi Gudang Utama / Marketplace):</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Untuk item yang diambil dari stok Gudang Utama (Marketplace), Admin menekan tombol <strong className="text-sky-300">+ Input SJ DealPOS</strong> dan mengisi nomor Surat Jalan DealPOS (misal: <strong className="font-mono text-emerald-300">26.10.00035</strong>). Ini otomatis mencatat potongan stok di Gudang Utama tanpa membutuhkan pengiriman fisik antar toko.
                </p>
              </div>
            </div>
          )}

          {/* SLIDE 3: TAHAP 3 - PENGIRIMAN, INPUT RESI & WA CUSTOMER */}
          {currentSlide === 2 && (
            <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-slate-800 pb-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[11px] font-bold font-mono mb-1">
                  LANGKAH 3 DARI 3
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Truck className="w-5 h-5 text-indigo-400" />
                  <span>Tahap 3: Input Resi Ekspedisi & Notifikasi WA Customer</span>
                </h2>
                <p className="text-xs text-slate-400">Prosedur penyerahan ke kurir ekspedisi akhir, pengisian resi resmi, dan pengiriman WhatsApp ke pelanggan.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Step Input Resi */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h3 className="font-bold text-sky-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-sky-400" />
                    <span>1. Input Nomor Resi Ekspedisi (JNE/Gojek/Paxel)</span>
                  </h3>

                  <ol className="space-y-2 text-[11px] text-slate-300 list-decimal list-inside">
                    <li>Setelah fisik barang lengkap di Gudang, barang diserahkan ke kurir ekspedisi.</li>
                    <li>Admin menekan tombol <strong className="text-sky-300">+ Input Resi</strong> atau <strong className="text-sky-300">Update Resi Massal</strong>.</li>
                    <li>Pilih nama kurir resmi (misal: <em>JNE YES / GoSend / Paxel</em>) dan masukkan nomor resi.</li>
                    <li>Sistem otomatis memperbarui status pesanan menjadi <strong className="text-emerald-400 font-bold">Dikirim</strong> (Badge Hijau).</li>
                  </ol>
                </div>

                {/* Step WA Customer */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h3 className="font-bold text-emerald-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-emerald-400" />
                    <span>2. Kirim Notifikasi WA Resmi ke Customer</span>
                  </h3>

                  <div className="space-y-2 text-[11px] text-slate-300">
                    <p>Admin menekan tombol <strong className="text-emerald-300">💬 Kirim WA Customer</strong> pada kartu pesanan. Pop-up modal terisi otomatis draf pesan WhatsApp:</p>
                    
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-300 space-y-1">
                      <div className="text-emerald-400 font-bold">Halo Sis Effendy,</div>
                      <div>Pesanan #MSCPJ-261014-A8JG di Chocochips telah dikirim via JNE YES!</div>
                      <div>No. Resi: <span className="text-amber-300 font-bold">JNE123456789</span></div>
                      <div className="text-slate-400">Terima kasih telah berbelanja di Chocochips! ✨</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Completion */}
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-center text-xs text-emerald-300 font-bold">
                ✅ Transaksi Selesai: Resi tercatat di database, WhatsApp terkirim, dan riwayat pesanan tersimpan rapi.
              </div>
            </div>
          )}

          {/* SLIDE 4: CASE STUDY 1 - MULTI-STORE FULFILLMENT */}
          {currentSlide === 3 && (
            <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-slate-800 pb-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[11px] font-bold font-mono mb-1">
                  CASE STUDY 1
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
                  <span>Multi-Store Fulfillment (Pemisahan Tugas Item Lintas Toko)</span>
                </h2>
                <p className="text-xs text-slate-400">Studi kasus saat 1 transaksi meminta item yang diambil dari lokasi berbeda (Gudang Utama vs Store Fisik).</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertOctagon className="w-4 h-4 text-amber-400" />
                  <span>Contoh Kasus Riil: Order #MSCPJ-261014-A8JG (Central Park Jakarta)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Item 1 Marketplace */}
                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2">
                    <div className="flex items-center justify-between font-bold text-amber-300">
                      <span>Item 1: Marketplace (Gudang Utama)</span>
                      <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">SJ DealPOS</span>
                    </div>
                    <p className="text-slate-300"><strong>Fernanda Top Cream - Default (1 pcs)</strong></p>
                    <p className="text-[11px] text-slate-400">
                      • Item disiapkan dari alokasi Gudang Utama.<br />
                      • Gudang memasukkan No. SJ DealPOS (`26.10.00035`).<br />
                      • <strong className="text-amber-200">Toko tidak perlu mengirimkan produk ini dari toko fisik.</strong>
                    </p>
                  </div>

                  {/* Item 2 Store BTS */}
                  <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/40 space-y-2">
                    <div className="flex items-center justify-between font-bold text-blue-300">
                      <span>Item 2: By The Sea PIK (Store Penyedia)</span>
                      <span className="text-[10px] bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30">Kirim dari Toko</span>
                    </div>
                    <p className="text-slate-300"><strong>Yabell Dress Dark Red - Default (1 pcs)</strong></p>
                    <p className="text-[11px] text-slate-400">
                      • Item ditarik dari rak toko By The Sea PIK.<br />
                      • Notifikasi WA penarikan otomatis terkirim ke WhatsApp resmi By The Sea PIK.<br />
                      • Tim BTS mencetak SJ Struk Thermal & menekan 'Kirim ke Gudang'.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Poin Penting Operasional:</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Sistem otomatis memilah pesan dan tugas. Toko Central Park Jakarta (pemohon) tidak mendapatkan pesan redundan untuk barang Gudang, dan toko By The Sea PIK langsung melihat barang miliknya di daftar teratas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 5: CASE STUDY 2 - PENANGANAN STOK KOSONG / SOLD OUT */}
          {currentSlide === 4 && (
            <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-slate-800 pb-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[11px] font-bold font-mono mb-1">
                  CASE STUDY 2
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5 text-rose-400" />
                  <span>Penanganan Stok Kosong / Sold Out & Pengalihan Alokasi</span>
                </h2>
                <p className="text-xs text-slate-400">Langkah penyelesaian jika stok di toko penyedia pertama ternyata habis atau cacat (defect).</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Step 1 Gudang */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="font-bold text-rose-400 flex items-center gap-1.5">
                    <Ban className="w-4 h-4 text-rose-400" />
                    <span>1. Tandai 'Sold Out'</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Jika barang di toko penyedia habis, tim menekan tombol <strong className="text-rose-300">Tandai Sold Out</strong> pada item tersebut.
                  </p>
                  <div className="p-2 rounded bg-rose-950/60 border border-rose-800 text-[10px] text-rose-300 font-mono">
                    ⚠️ SOLD OUT: Stok Toko Fisik Kosong
                  </div>
                </div>

                {/* Step 2 WA Notif */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="font-bold text-amber-400 flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-amber-400" />
                    <span>2. Warning WA Otomatis</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Sistem Fonnte otomatis mengirimkan pesan peringatan ke WhatsApp Admin & Store Pemohon.
                  </p>
                  <div className="p-2 rounded bg-amber-950/60 border border-amber-800 text-[10px] text-amber-300 font-mono">
                    💬 "⚠️ STOK SOLD OUT untuk Order #MSCPJ-xxx. Mohon pengalihan alokasi."
                  </div>
                </div>

                {/* Step 3 Admin Edit */}
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>3. Admin Pindahkan Alokasi</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    <strong>Admin Pusat</strong> membuka tombol <strong className="text-emerald-300">Edit Pesanan</strong>, lalu mengubah alokasi toko ke toko lain yang punya stok (misal: <em>Senayan City</em>).
                  </p>
                  <div className="p-2 rounded bg-emerald-950/60 border border-emerald-800 text-[10px] text-emerald-300 font-mono">
                    🏢 Alokasi Baru: "Senayan City"
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 text-xs space-y-2">
                <h4 className="font-bold text-indigo-300">💡 Alur Pengalihan yang Terbaca & Rapi</h4>
                <p className="text-slate-300 leading-relaxed">
                  Setelah Admin memperbarui alokasi toko ke toko Senayan City, notifikasi WA penarikan barang baru akan langsung terkirim ke WhatsApp toko Senayan City. Tim Senayan City cukup mencetak SJ Struk baru dan mengirimkan barang ke Gudang.
                </p>
              </div>
            </div>
          )}

          {/* SLIDE 6: CASE STUDY 3 - MODUL ALTERATION & REPAIR */}
          {currentSlide === 5 && (
            <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-slate-800 pb-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[11px] font-bold font-mono mb-1">
                  CASE STUDY 3
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-rose-400" />
                  <span>Modul Alteration & Repair (SPK Penjahit & QC Ukuran)</span>
                </h2>
                <p className="text-xs text-slate-400">Prosedur penanganan pakaian yang memerlukan potong panjang, kecilkan, atau perbaikan sebelum dikirim.</p>
              </div>

              {/* Flow Stages */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                  Alur 7 Tahapan Status Flow Alteration:
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-800 text-amber-300">
                    <div className="font-bold">1. Diajukan</div>
                    <div className="text-[10px] text-slate-400">Form alterasi diisi oleh store</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-950/50 border border-blue-800 text-blue-300">
                    <div className="font-bold">2. Dikirim Store</div>
                    <div className="text-[10px] text-slate-400">Fisik baju dikirim ke gudang</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-950/50 border border-indigo-800 text-indigo-300">
                    <div className="font-bold">3. Diterima Gudang</div>
                    <div className="text-[10px] text-slate-400">Verifikasi baju fisik di gudang</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-950/50 border border-purple-800 text-purple-300">
                    <div className="font-bold">4. Sedang Pengerjaan</div>
                    <div className="text-[10px] text-slate-400">Proses jahit via SPK</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-1">
                  <div className="p-2.5 rounded-xl bg-teal-950/50 border border-teal-800 text-teal-300">
                    <div className="font-bold">5. Selesai QC</div>
                    <div className="text-[10px] text-slate-400">Pemeriksaan cm potong & jahitan</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-sky-950/50 border border-sky-800 text-sky-300">
                    <div className="font-bold">6. Dikirim Kembali</div>
                    <div className="text-[10px] text-slate-400">Pengiriman ke Customer/Store</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300">
                    <div className="font-bold">7. Selesai</div>
                    <div className="text-[10px] text-slate-400">Selesai diserahkan ke pelanggan</div>
                  </div>
                </div>
              </div>

              {/* Unique Features */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-rose-300 flex items-center gap-1">
                    <FileText className="w-4 h-4 text-rose-400" />
                    <span>Cetak SPK Penjahit</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Pencetakan lembar instruksi khusus penjahit lengkap dengan QR Code & detail cm potong.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-sky-300 flex items-center gap-1">
                    <MessageCircle className="w-4 h-4 text-sky-400" />
                    <span>WA Update Progres</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Notifikasi WhatsApp otomatis mengabarkan perkembangan jahit ke customer dari waktu ke waktu.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Verifikasi Akhir QC</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Pemeriksaan hasil jahit memastikan panjang dan kerapian jahitan sesuai instruksi sebelum dibungkus.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 7: CASE STUDY 4 - PEMBATALAN ORDER & PANDUAN TOMBOL UI */}
          {currentSlide === 6 && (
            <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-slate-800 pb-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[11px] font-bold font-mono mb-1">
                  CASE STUDY 4 & CHEAT SHEET
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  <span>Pembatalan Order & Panduan Lengkap Tombol UI</span>
                </h2>
                <p className="text-xs text-slate-400">Penanganan kasus pembatalan/retur pesanan serta cheat sheet fungsi tombol aksi di aplikasi WMS.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Pembatalan & Retur Case */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h3 className="font-bold text-rose-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                    <Ban className="w-4 h-4 text-rose-400" />
                    <span>Kasus Pembatalan (Cancel) & Retur Customer</span>
                  </h3>
                  
                  <div className="space-y-2 text-[11px] text-slate-300">
                    <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 space-y-1">
                      <strong className="text-rose-300">• Customer Membatalkan Pesanan:</strong>
                      <p className="text-slate-400">Admin menekan tombol <strong className="text-white">Edit</strong> $\rightarrow$ Ubah Status ke <strong className="text-rose-300">Batal</strong>. Kartu pesanan akan berubah merah dan tidak lagi ditagihkan ke toko.</p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800 space-y-1">
                      <strong className="text-amber-300">• Penukaran Size / Retur Barang:</strong>
                      <p className="text-slate-400">Buat transaksi baru bertipe <strong className="text-amber-200">Repair / Penukaran</strong> agar riwayat stok lama dan baju penukaran baru tidak membingungkan pencatatan.</p>
                    </div>
                  </div>
                </div>

                {/* Cheat Sheet Tombol Aksi */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h3 className="font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-indigo-400" />
                    <span>Cheat Sheet Fungsi Tombol Aksi Utama UI</span>
                  </h3>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between p-2 rounded bg-sky-500/10 border border-sky-500/30">
                      <span className="font-bold text-sky-300 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>📄 Cetak Picking List</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Cetak daftar ambil di rak</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/30">
                      <span className="font-bold text-amber-300 flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5" />
                        <span>🏷️ Cetak Label A6</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Stiker thermal paket luar</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                      <span className="font-bold text-emerald-300 flex items-center gap-1">
                        <Printer className="w-3.5 h-3.5" />
                        <span>🖨️ Cetak SJ Struk</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Struk thermal rangkap 2</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-indigo-500/10 border border-indigo-500/30">
                      <span className="font-bold text-indigo-300 flex items-center gap-1">
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>+ Input SJ DealPOS</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Potong stok Gudang Utama</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-purple-500/10 border border-purple-500/30">
                      <span className="font-bold text-purple-300 flex items-center gap-1">
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>💬 Kirim WA Customer</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Kirim notif resi ke customer</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SLIDE 8: CHECKLIST & BEST PRACTICES OPERASIONAL */}
          {currentSlide === 7 && (
            <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="border-b border-slate-800 pb-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Checklist & Best Practices Operasional Harian</span>
                </h2>
                <p className="text-xs text-slate-400">Panduan kepatuhan harian untuk seluruh tim Admin Pusat dan Tim Outlet Store Chocochips.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Checklist Store */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <h3 className="font-bold text-sky-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <Building2 className="w-4 h-4 text-sky-400" />
                    <span>Checklist Harian Tim Outlet Store:</span>
                  </h3>
                  
                  <ul className="space-y-2 text-[11px] text-slate-300">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <span>Buka menu <strong>Pesanan Saya ➔ Manual Shipment</strong> setiap pagi dan periksa pesan WA Fonnte penarikan barang.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <span>Tarik produk fisik dari rak toko sesuai daftar item pada kartu pesanan.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <span>Cetak <strong>SJ Struk Thermal Rangkap 2</strong> (Lembar 1 arsip toko, Lembar 2 ditempel pada polybag baju).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <span>Tekan tombol <strong>🚚 Kirim ke Gudang</strong> dan catat nama supir/kurir titipan pengantar barang.</span>
                    </li>
                  </ul>
                </div>

                {/* Checklist Admin */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <h3 className="font-bold text-indigo-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <span>Checklist Harian Tim Admin Pusat / Gudang:</span>
                  </h3>

                  <ul className="space-y-2 text-[11px] text-slate-300">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>Pantau tab <strong>Perlu Diproses</strong> dan cetak Picking List untuk runner gudang.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>Verifikasi fisik barang tiba dari toko dengan mencocokkan Lembar 2 SJ Struk Thermal.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>Cetak <strong>Label A6 Stiker Thermal</strong> untuk ditempel pada kemasan paket luar.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span>Input nomor resi resmi ekspedisi dan kirim notifikasi WA ke customer via tombol <strong>💬 Kirim WA Customer</strong>.</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center space-y-2 py-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-lg font-extrabold text-white">SOP Operasional Manual Shipment & Alteration Siap Dijalankan</h3>
                <p className="text-xs text-slate-300 max-w-xl mx-auto">
                  Dengan alur kerja ini, seluruh proses pengajuan, penarikan barang, pengemasan, dan pengiriman berjalan cepat, rapi, dan transparan untuk seluruh tim Chocochips.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* BOTTOM NAVIGATION CONTROLS */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-mono text-indigo-400 font-bold">Slide {currentSlide + 1} / {totalSlides}</span>
            <span className="hidden sm:inline">• Gunakan tombol panah keyboard (← / →) untuk navigasi</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevSlide}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sebelumnya</span>
            </button>

            {/* Jump Selector */}
            <div className="hidden md:flex items-center gap-1">
              {Array.from({ length: totalSlides }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                    currentSlide === idx ? 'bg-indigo-500 w-6' : 'bg-slate-700 hover:bg-slate-500'
                  }`}
                  title={`Ke Slide ${idx + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={nextSlide}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
            >
              <span>{currentSlide === totalSlides - 1 ? 'Mulai Lagi' : 'Berikutnya'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
