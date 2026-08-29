import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Download,
  CheckCircle2,
  Share2,
  Terminal,
  Layers,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
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
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  useEffect(() => {
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
        onNotify('Aplikasi berhasil dipasang di perangkat Android Anda!', 'success');
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

  const copyCommand = (cmd: string, stepIndex: number) => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopiedStep(stepIndex);
      onNotify('Perintah disalin ke clipboard!', 'success');
      setTimeout(() => setCopiedStep(null), 2500);
    });
  };

  if (!isOpen) return null;

  return (
    <div
      id="apkModalOverlay"
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[70] flex items-center justify-center p-4 overflow-y-auto"
    >
      <div
        id="apkModalCard"
        className="bg-white dark:bg-[#09090B] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800/80 transition-colors my-auto max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0F0F12]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-800 dark:text-slate-100">Aplikasi Android & APK WMS</h2>
              <p className="text-xs text-slate-400">Pasang langsung di HP atau build APK mandiri</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs text-slate-700 dark:text-slate-300 font-sans">
          {/* Method 1: Instant Native Android App (PWA) */}
          <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Metode 1: Pasang Langsung ke HP Android (Instan)
                </span>
              </div>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2 py-0.5 rounded text-[10px]">
                Direkomendasikan
              </span>
            </div>

            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              Aplikasi ini sudah berstandar <b>Progressive Web App (PWA)</b> dengan dukungan Kamera HP, Getaran Android, Push Notifikasi, Mode Gelap, dan Layar Tetap Aktif (Screen Wake Lock).
            </p>

            <button
              type="button"
              id="btnInstallPwaDirect"
              onClick={handleInstallPWA}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-black font-extrabold py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 text-xs tracking-wider transition-all uppercase"
            >
              <Download className="w-4 h-4" />
              <span>
                {isInstalled ? 'SUDAH TERPASANG SEBAGAI APLIKASI' : 'INSTALL APLIKASI KE HP SEKARANG'}
              </span>
            </button>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-[#09090B] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Petunjuk di Google Chrome Android:
              </p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Buka link aplikasi ini di browser Chrome HP.</li>
                <li>Ketuk ikon menu titik tiga (⋮) di pojok kanan atas.</li>
                <li>Pilih <b>"Install Aplikasi"</b> atau <b>"Tambahkan ke Layar Utama"</b>.</li>
                <li>Ikon Scanner Pintar akan muncul di daftar aplikasi HP Android Anda!</li>
              </ol>
            </div>
          </div>

          {/* Method 2: Convert to Standalone APK (Capacitor / PWABuilder) */}
          <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Metode 2: Export ke File APK (.apk / Android Studio)
              </span>
            </div>

            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              Jika Anda membutuhkan file installer <code>.apk</code> untuk didistribusikan via file sharing atau dipasang di perangkat scanner barcode industri (Zebra, Honeywell, Sunmi, Urovo):
            </p>

            {/* Option A: PWABuilder (Online No-Code APK) */}
            <div className="p-3 bg-white dark:bg-[#09090B] rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="font-bold text-slate-800 dark:text-slate-200">
                A. Generate APK Otomatis via PWABuilder (Gratis & Cepat):
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                1. Kunjungi <b>pwabuilder.com</b> di browser laptop/PC.<br />
                2. Masukkan URL aplikasi Scanner ini.<br />
                3. Klik <b>"Package for Android"</b> dan download file <code>.apk</code> siap pakai.
              </p>
            </div>

            {/* Option B: Capacitor CLI Command */}
            <div className="p-3 bg-white dark:bg-[#09090B] rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  B. Build APK dengan Capacitor:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyCommand(
                      'npm install @capacitor/core @capacitor/cli @capacitor/android && npx cap init "WMS Scanner" com.wms.scanner --web-dir dist && npm run build && npx cap add android && npx cap open android',
                      1
                    )
                  }
                  className="text-emerald-500 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  {copiedStep === 1 ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedStep === 1 ? 'Tersalin' : 'Salin Perintah'}</span>
                </button>
              </div>

              <div className="p-2.5 bg-black text-emerald-400 rounded-lg font-mono text-[10px] overflow-x-auto whitespace-pre leading-relaxed border border-slate-800">
                npm i @capacitor/core @capacitor/cli @capacitor/android{'\n'}
                npx cap init "WMS Scanner" com.wms.scanner --web-dir dist{'\n'}
                npm run build && npx cap add android && npx cap open android
              </div>
            </div>
          </div>

          {/* Maintenance & Bug Fix Guide */}
          <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Panduan Update & Maintenance APK (Jika Ada BUG)
              </span>
            </div>

            <div className="space-y-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed bg-white dark:bg-[#09090B] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <b className="text-slate-900 dark:text-slate-200">1. Jika Terpasang sebagai PWA (Metode 1):</b>
                <p className="mt-0.5">
                  Update bersifat <b>Otomatis (Instant OTA)</b>! Begitu Anda memperbaiki bug atau menambahkan fitur di web ini, seluruh HP operator yang sudah install aplikasi akan langsung menerima update saat membuka aplikasi tanpa perlu install ulang APK.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <b className="text-slate-900 dark:text-slate-200">2. Jika Menggunakan File APK Standalone (Metode 2):</b>
                <p className="mt-0.5">
                  &bull; Jika APK mengarah ke URL web (Webview/Capacitor Live): Perubahan UI/bug logic ter-update langsung.<br />
                  &bull; Jika APK offline bundle: Cukup build ulang dengan perintah <code>npm run build && npx cap copy android</code> lalu kirim file <code>.apk</code> baru ke tim gudang.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <b className="text-slate-900 dark:text-slate-200">3. Supabase & Database Cloud:</b>
                <p className="mt-0.5">
                  Data stok, produk, dan log transaksi tersimpan di cloud Supabase secara real-time, sehingga data tidak akan hilang saat aplikasi di-update.
                </p>
              </div>
            </div>
          </div>

          {/* Device Features Checklist */}
          <div className="p-3 bg-slate-100 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 text-[11px]">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Fitur Android yang Didukung Penuh:
            </div>
            <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400 font-mono text-[10px]">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Real-time Sync
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Push Notifikasi
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Screen Wake Lock
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Getaran Haptic
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Mode Gelap & Terang
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Scanner Gun USB/BT
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
