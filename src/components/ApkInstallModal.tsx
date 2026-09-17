import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Apple,
  Monitor,
  Download,
  CheckCircle2,
  Share2,
  Sparkles,
  ShieldCheck,
  Zap,
  Check,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface ApkInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ApkInstallModal: React.FC<ApkInstallModalProps> = ({
  isOpen,
  onClose,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'pc'>('android');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Detect device OS to select initial tab
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
    if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
      setActiveTab('ios');
    } else if (/android/i.test(userAgent)) {
      setActiveTab('android');
    } else {
      setActiveTab('android');
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        onNotify('Aplikasi berhasil dipasang di perangkat Anda!', 'success');
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      onNotify(
        'Buka menu browser Chrome di HP Anda (titik 3 di kanan atas) lalu pilih "Tambahkan ke Layar Utama" / "Install Aplikasi".',
        'info'
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="apkModalOverlay"
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[70] flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        id="apkModalCard"
        className="bg-white dark:bg-[#09090B] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800/80 transition-colors my-auto max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0F0F12]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>Pasang Aplikasi WMS (PWA)</span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400">
                  INSTAN
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bisa dipasang di Android, iPhone (iOS), & Komputer tanpa App Store
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/40 p-1.5 gap-1.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'android'
                ? 'bg-white dark:bg-[#131d31] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Android</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'ios'
                ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Apple className="w-4 h-4" />
            <span>iPhone / iPad</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pc')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'pc'
                ? 'bg-white dark:bg-[#131d31] text-primary-600 dark:text-primary-400 shadow-sm border border-slate-200 dark:border-slate-700'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>Laptop / PC</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs text-slate-700 dark:text-slate-300 font-sans">
          
          {/* TAB 1: ANDROID */}
          {activeTab === 'android' && (
            <div className="space-y-3.5">
              <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                    <Smartphone className="w-4 h-4 text-emerald-500" />
                    <span>Pasang di HP Android (Google Chrome)</span>
                  </div>
                  <span className="bg-emerald-500/10 text-emerald-500 font-bold px-2 py-0.5 rounded text-[10px]">
                    Chrome
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Aplikasi ini berjalan sebagai <b>Progressive Web App (PWA)</b> native dengan akses penuh ke kamera scanner, getaran getar (haptic), push notifikasi, dan layar tetap aktif.
                </p>

                {/* Instant Install Button */}
                <button
                  type="button"
                  id="btnInstallPwaDirect"
                  onClick={handleInstallPWA}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-black font-extrabold py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 text-xs tracking-wider transition-all uppercase cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {isInstalled ? 'SUDAH TERPASANG DI PERANGKAT' : 'PASANG KE HP ANDROID SEKARANG'}
                  </span>
                </button>
              </div>

              {/* Step by Step Manual Android */}
              <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5">
                <div className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Petunjuk Pemasangan Manual di Android:</span>
                </div>
                <div className="space-y-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </span>
                    <div>
                      Buka link WMS Inventory menggunakan browser <b>Google Chrome</b> di HP Android Anda.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </span>
                    <div>
                      Ketuk <b>ikon titik tiga (⋮)</b> di pojok kanan atas browser Chrome.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      3
                    </span>
                    <div>
                      Pilih menu <b>"Install Aplikasi"</b> atau <b>"Tambahkan ke Layar Utama" (Add to Home screen)</b>.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      4
                    </span>
                    <div>
                      Konfirmasi dengan mengetuk <b>"Install"</b>. Ikon WMS akan langsung muncul di beranda HP Anda!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IPHONE / IPAD (IOS) */}
          {activeTab === 'ios' && (
            <div className="space-y-3.5">
              <div className="p-4 bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                    <Apple className="w-4 h-4 text-indigo-500" />
                    <span>Bisa untuk iPhone & iPad? Tentu Saja!</span>
                  </div>
                  <span className="bg-indigo-500/10 text-indigo-500 font-bold px-2 py-0.5 rounded text-[10px]">
                    Safari iOS
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Apple mendukung PWA sepenuhnya di iPhone dan iPad. Anda dapat memasang WMS langsung ke Layar Utama (Home Screen) <b>tanpa perlu App Store</b>, dan aplikasi akan berjalan <i>fullscreen</i> tanpa bilah URL Safari!
                </p>

                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <Info className="w-4 h-4 shrink-0 text-amber-500" />
                  <span>
                    <strong>Penting:</strong> Di iPhone, wajib dibuka menggunakan browser bawaan <strong>Safari</strong> (bukan dari browser dalam WhatsApp / Instagram / Chrome iOS).
                  </span>
                </div>
              </div>

              {/* Step by step iPhone Safari */}
              <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5">
                <div className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Petunjuk 4 Langkah di iPhone (Safari):</span>
                </div>

                <div className="space-y-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </span>
                    <div>
                      Buka link WMS Inventory di browser <b>Safari</b> pada iPhone/iPad Anda.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </span>
                    <div>
                      Ketuk tombol <b>Bagikan (Share)</b> berikon kotak dengan panah ke atas ( <span className="font-mono font-black text-indigo-500">⎋</span> atau <span className="font-mono font-black text-indigo-500">[↑]</span> ) di bilah menu bawah layar Safari.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      3
                    </span>
                    <div>
                      Gulir sedikit ke bawah pada menu yang muncul, lalu pilih <b>"Tambahkan ke Layar Utama" (Add to Home Screen)</b>.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      4
                    </span>
                    <div>
                      Ketuk <b>"Tambah" (Add)</b> di sudut kanan atas. Selesai! Ikon aplikasi WMS sekarang tampil di layar utama iPhone Anda.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LAPTOP / PC */}
          {activeTab === 'pc' && (
            <div className="space-y-3.5">
              <div className="p-4 bg-primary-500/5 dark:bg-primary-950/20 border border-primary-500/30 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                    <Monitor className="w-4 h-4 text-primary-500" />
                    <span>Mode Jendela Penuh (Full View App) di PC</span>
                  </div>
                  <span className="bg-primary-500/10 text-primary-500 font-bold px-2 py-0.5 rounded text-[10px]">
                    Chrome / Edge
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Aplikasi ini mendukung <b>Tampilan Penuh (Standalone Window)</b> layaknya aplikasi desktop (seperti software kasir/POS asli) tanpa address bar, tombol navigasi, atau tab browser.
                </p>
              </div>

              {deferredPrompt && (
                <button
                  type="button"
                  onClick={handleInstallPWA}
                  className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-primary-600/20 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Pasang Warehouse Mini ke Komputer Sekarang</span>
                </button>
              )}

              <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 text-[11px] text-slate-600 dark:text-slate-400">
                <div className="font-bold text-slate-900 dark:text-white text-xs">
                  Langkah agar Tampil Layaknya Aplikasi (Bukan Browser):
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-primary-500/10 text-primary-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      1
                    </span>
                    <div>
                      <b>Metode 1 (Rekomendasi Utama):</b> Pada address bar (kolom URL browser) di kanan atas, klik ikon <b>Monitor kecil dengan panah bawah</b> (<i>"Install Warehouse Mini"</i>), lalu klik <b>Install</b>.
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-primary-500/10 text-primary-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      2
                    </span>
                    <div>
                      <b>Metode 2 (Jika lewat Titik Tiga):</b> Klik menu <b>titik tiga (⋮)</b> Chrome/Edge &rarr; pilih <b>Simpan dan bagikan</b> (Save and share) &rarr; pilih <b>"Instal Warehouse Mini"</b>.<br />
                      <span className="text-amber-600 dark:text-amber-400 text-[10px] font-semibold mt-1 block">
                        *Catatan: Jika memilih "Buat pintasan" (Create shortcut), <b>WAJIB CENTANG</b> kotak <i>"Buka sebagai jendela" (Open as window)</i> agar tidak terbuka sebagai tab browser biasa.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center shrink-0 text-xs">
                      3
                    </span>
                    <div>
                      <b>Sematkan ke Taskbar:</b> Saat jendela aplikasi terbuka sendiri (tanpa URL bar), <b>klik kanan ikon WMS di Taskbar Windows</b> bawah layar laptop/PC &rarr; pilih <b>"Sematkan ke taskbar" (Pin to taskbar)</b>.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Keunggulan PWA Card */}
          <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5">
            <div className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Mengapa Memilih PWA Dibandingkan APK Biasa?</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800/80 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Update Otomatis (OTA)</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                  Jika ada fitur baru atau perbaikan bug, aplikasi di HP langsung ter-update tanpa perlu download/install ulang file APK!
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800/80 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ringan & Cepat</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                  Hanya berukuran beberapa megabyte, hemat memori RAM, dan tidak membebani HP kru gudang.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800/80 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Scanner Kamera & Haptic</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                  Akses kamera barcode super cepat, getaran saat scan berhasil, dan nada peringatan.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800/80 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Realtime Supabase Cloud</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[10px] leading-relaxed">
                  Seluruh data tersinkronisasi langsung antar perangkat secara real-time tanpa delay.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-[#0F0F12]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
