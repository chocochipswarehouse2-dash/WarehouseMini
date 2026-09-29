import React, { useState, useEffect, useMemo } from 'react';
import { X, Send, Copy, ExternalLink, MessageSquare, AlertTriangle, CheckCircle2, RefreshCw, Smartphone } from 'lucide-react';
import {
  SuratJalanSelisihMessageParams,
  generateSuratJalanSelisihMessage,
  getWhatsAppWebUrl,
  sendFonnteMessage,
  getFonnteConfig,
} from '../../services/whatsapp';
import { ProductItem } from '../../types';

export interface DistribusiSelisihWaModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: SuratJalanSelisihMessageParams | null;
  productCatalog?: ProductItem[];
  onNotify: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const DistribusiSelisihWaModal: React.FC<DistribusiSelisihWaModalProps> = ({
  isOpen,
  onClose,
  params,
  productCatalog = [],
  onNotify,
}) => {
  const [waText, setWaText] = useState<string>('');
  const [targetWa, setTargetWa] = useState<string>('');
  const [isSendingFonnte, setIsSendingFonnte] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const fonnteConfig = useMemo(() => getFonnteConfig(), [isOpen]);

  // Inisialisasi teks pesan dan target nomor saat modal dibuka
  useEffect(() => {
    if (!isOpen || !params) return;

    const generated = generateSuratJalanSelisihMessage({
      ...params,
      productCatalog: productCatalog || params.productCatalog || [],
    });
    setWaText(generated);

    const defaultTarget = fonnteConfig.groupTarget || '';
    setTargetWa(defaultTarget);
    setIsCopied(false);
  }, [isOpen, params, productCatalog, fonnteConfig.groupTarget]);

  if (!isOpen || !params) return null;

  const type = params.type || 'kurang';
  const isKurang = type === 'kurang';
  const titleColor = isKurang ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400';
  const headerBg = isKurang ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/50' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50';

  // 1. KIRIM LANGSUNG VIA BOT FONNTE
  const handleSendFonnte = async () => {
    if (!fonnteConfig.token) {
      onNotify('Token WhatsApp Fonnte belum diatur di menu Pengaturan Sistem.', 'warning');
      return;
    }

    const target = targetWa.trim() || fonnteConfig.groupTarget;
    if (!target) {
      onNotify('Target nomor WhatsApp atau Group ID belum diisi.', 'warning');
      return;
    }

    if (!waText.trim()) {
      onNotify('Pesan WhatsApp tidak boleh kosong.', 'warning');
      return;
    }

    setIsSendingFonnte(true);
    try {
      const res = await sendFonnteMessage(target, waText, fonnteConfig.token);
      if (res.success) {
        onNotify(`Laporan selisih SJ ${params.no_sj} berhasil dikirim ke WhatsApp (${target}) via Bot Fonnte!`, 'success');
        onClose();
      } else {
        onNotify(`Gagal mengirim via Bot Fonnte: ${res.message}`, 'error');
      }
    } catch (err: any) {
      onNotify(`Gagal terhubung ke Fonnte: ${err.message || err}`, 'error');
    } finally {
      setIsSendingFonnte(false);
    }
  };

  // 2. BUKA WHATSAPP WEB (MANUAL)
  const handleOpenWhatsAppWeb = () => {
    if (!waText.trim()) {
      onNotify('Pesan WhatsApp kosong.', 'warning');
      return;
    }
    const url = getWhatsAppWebUrl(targetWa, waText);
    window.open(url, '_blank');
    onNotify('Membuka WhatsApp...', 'info');
  };

  // 3. SALIN TEKS PESAN
  const handleCopyText = () => {
    navigator.clipboard.writeText(waText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
    onNotify('Teks laporan selisih berhasil disalin ke clipboard!', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1e293b] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 dark:bg-[#25D366]/20 flex items-center justify-center text-[#1DA851] dark:text-[#25D366] shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Laporan Selisih Surat Jalan
                </h3>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${headerBg} ${titleColor}`}>
                  {isKurang ? 'Selisih Kurang' : 'Selisih Lebih'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                No SJ: <strong className="text-slate-700 dark:text-slate-200">{params.no_sj}</strong> · Tujuan: <strong className="text-slate-700 dark:text-slate-200">{params.destination || '-'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY CONTENT */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          
          {/* TARGET WHATSAPP & FONNTE STATUS */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-slate-500" />
                Target WhatsApp (Grup / Nomor Penerima):
              </label>
              {fonnteConfig.token ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Bot Fonnte Terhubung
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="w-3 h-3" /> Token Fonnte Belum Diset di Pengaturan
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={targetWa}
                onChange={(e) => setTargetWa(e.target.value)}
                placeholder="Contoh: 12036302xxxx@g.us atau 08123456789"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 font-mono text-xs focus:ring-2 focus:ring-[#25D366] focus:border-[#25D366] transition-all"
              />
              {fonnteConfig.groupTarget && targetWa !== fonnteConfig.groupTarget && (
                <button
                  type="button"
                  onClick={() => setTargetWa(fonnteConfig.groupTarget)}
                  className="px-2.5 py-2 text-[11px] font-semibold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg shrink-0 transition-colors cursor-pointer"
                  title="Gunakan Target Grup Default dari Pengaturan"
                >
                  Reset Default
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              *Bisa diisi <strong>Group ID</strong> (akhiran <code className="font-mono text-slate-600 dark:text-slate-300">@g.us</code>) untuk kirim ke Grup Gudang/Toko, atau <strong>Nomor HP</strong> perorangan.
            </p>
          </div>

          {/* EDITABLE LIVE PREVIEW TEXT */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-[#25D366]" />
                Preview & Edit Pesan WhatsApp:
              </label>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                {isCopied ? 'Tersalin!' : 'Salin Teks'}
              </button>
            </div>

            <textarea
              rows={11}
              value={waText}
              onChange={(e) => setWaText(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-mono text-[11px] leading-relaxed focus:ring-2 focus:ring-[#25D366] focus:border-[#25D366] resize-y transition-all"
              placeholder="Ketik teks pesan..."
            />
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Tutup
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {/* OPSI BUKA WA WEB */}
            <button
              type="button"
              onClick={handleOpenWhatsAppWeb}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Buka WhatsApp Web di tab browser baru"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              Buka WA Web
            </button>

            {/* OPSI KIRIM OTOMATIS VIA BOT FONNTE */}
            <button
              type="button"
              disabled={isSendingFonnte}
              onClick={handleSendFonnte}
              className="px-4 py-2 bg-[#25D366] hover:bg-[#1DA851] disabled:bg-slate-400 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-98 cursor-pointer"
              title="Kirim pesan langsung melalui WhatsApp Bot Fonnte"
            >
              {isSendingFonnte ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Mengirim via Bot...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Kirim via Bot Fonnte
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
