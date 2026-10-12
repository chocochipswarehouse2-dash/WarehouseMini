import React, { useState } from 'react';
import {
  X,
  MessageCircle,
  Building2,
  Phone,
  Send,
  Copy,
  ExternalLink,
  Package,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { ManualShipmentOrder } from '../../types';
import {
  resolveOrderSourceStore,
  saveStoreContact,
  getFullStoreName
} from '../../services/gasManualShipment';
import { sendFonnteMessage, getFonnteConfig, normalizeWhatsAppNumber } from '../../services/whatsapp';

interface WaStoreNoticeModalProps {
  order: ManualShipmentOrder;
  onClose: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const WaStoreNoticeModal: React.FC<WaStoreNoticeModalProps> = ({
  order,
  onClose,
  onShowToast,
}) => {
  const resolved = resolveOrderSourceStore(order);

  const [targetStore, setTargetStore] = useState(resolved.sourceStoreName);
  const [phoneNumber, setPhoneNumber] = useState(resolved.phone || '');
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const requesterStore = resolved.requesterStoreName;
  const isInterStore = resolved.isInterStoreFulfillment;
  const items = resolved.itemsFromSource;

  const itemsText = items.map((it, idx) => {
    const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` (Size: *${it.size}*)` : '';
    const fulText = it.fulfillment ? ` [Fulfillment: ${it.fulfillment}]` : '';
    const alterText = it.needs_alteration || it.id_form_alter || it.alteration_detail
      ? `\n     ✂️ *Instruksi Alter:* ${it.alteration_detail || it.layanan_type || 'Perlu Alterasi'}`
      : '';
    return `  ${idx + 1}. *${it.sku || '-'}* - ${it.nama_produk}${sizeStr} - *${it.qty || 1} pcs*${fulText}${alterText}`;
  }).join('\n');

  const waMessage = `📦 *PERMINTAAN PENGIRIMAN PRODUK (STORE ➔ WAREHOUSE)*
--------------------------------------------------
Halo Tim *${targetStore}*,
${isInterStore 
  ? `Terdapat pesanan penarikan barang dari Store Anda yang diajukan oleh *${requesterStore}* untuk dikirimkan ke Gudang Pusat Chocochips:`
  : `Terdapat pesanan manual shipment dari Store Anda yang wajib dikirimkan ke Gudang Pusat Chocochips:`}

📋 *Rincian Pesanan:*
• *Order ID / No. Pesanan:* ${order.no_transaksi_customer || order.no_pesanan}
• *Store Pemohon:* ${requesterStore} (PIC: ${order.pic_store || '-'})
• *Store Penyedia Barang:* ${targetStore}
• *Customer Tujuan Akhir:* ${order.nama_tujuan || '-'}
• *Waktu Permintaan:* ${new Date().toLocaleString('id-ID')}

👕 *Daftar Produk yang Wajib Dikirim dari Store Anda:*
${itemsText || '  1. Produk Pakaian Pesanan'}

🚚 *Tujuan Pengiriman:* WAREHOUSE CHOCOCHIPS (Gudang Pusat)
📄 *Dokumen Wajib:*
Mohon buka sistem WMS, login akun toko *${targetStore}*, dan cetak *Surat Jalan Kirim (Struk Rangkap 2)*:
  - Lembar 1: Simpan sebagai arsip bukti pengiriman toko Anda
  - Lembar 2: Lampirkan pada fisik pakaian / polybag yang dikirim ke gudang.

Mohon segera diproses dan kirimkan fisik barang ke gudang. Terima kasih!
_WMS Warehouse System_`;

  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val);
    saveStoreContact(targetStore, val);
  };

  const handleSendFonnte = async () => {
    const cleanPhone = normalizeWhatsAppNumber(phoneNumber);
    if (!cleanPhone) {
      onShowToast(`Nomor WhatsApp untuk ${targetStore} belum diisi! Silakan ketik nomor telepon terlebih dahulu.`, 'warning');
      return;
    }

    setIsSending(true);
    // Simpan ke direktori kontak
    saveStoreContact(targetStore, phoneNumber);

    const fonnteCfg = getFonnteConfig();
    if (!fonnteCfg.token) {
      // Fallback salin dan buka WA Web
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(waMessage);
      }
      onShowToast('Token Fonnte belum dikonfigurasi. Format pesan disalin dan WhatsApp Web dibuka.', 'info');
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`;
      window.open(waUrl, '_blank');
      setIsSending(false);
      onClose();
      return;
    }

    try {
      const res = await sendFonnteMessage(cleanPhone, waMessage, fonnteCfg.token);
      if (res.success) {
        onShowToast(`✅ Notifikasi permintaan kirim berhasil dikirim ke WhatsApp ${targetStore} (${cleanPhone})!`, 'success');
        onClose();
      } else {
        onShowToast(`Gagal mengirim via Fonnte: ${res.message || 'Error koneksi'}. Teks telah disalin ke clipboard.`, 'warning');
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(waMessage);
        }
      }
    } catch (e: any) {
      onShowToast(`Error kirim WA: ${e?.message || 'Gagal'}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenWaWeb = () => {
    const cleanPhone = normalizeWhatsAppNumber(phoneNumber);
    if (cleanPhone) {
      saveStoreContact(targetStore, phoneNumber);
    }
    const waUrl = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(waMessage)}`;
    window.open(waUrl, '_blank');
    onShowToast(`Membuka WhatsApp untuk ${targetStore}`, 'info');
  };

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(waMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onShowToast('Format notifikasi permintaan kirim berhasil disalin!', 'success');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full flex flex-col overflow-hidden my-auto max-h-[95vh]">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-950/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Notifikasi Permintaan Kirim ke Store
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Order #{order.no_pesanan}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Modal */}
        <div className="p-5 overflow-y-auto space-y-4">
          
          {/* Info Banner Alur Penarikan Antar Store */}
          {isInterStore ? (
            <div className="p-3 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-xl text-xs space-y-1">
              <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Skema Penarikan Antar-Store (Inter-Store Fulfillment)</span>
              </div>
              <p className="text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed">
                Pesanan dibuat oleh <strong>{requesterStore}</strong>, namun barang fisik diambil dari <strong>{targetStore}</strong>. Notifikasi ini dikirimkan ke <strong>{targetStore}</strong> agar mengirimkan fisik pakaian ke Warehouse.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs space-y-1">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Pengiriman dari Toko Pengirim: {targetStore}</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                Notifikasi untuk mengingatkan tim toko mengirimkan fisik pakaian beserta lampiran Surat Jalan Struk ke gudang pusat.
              </p>
            </div>
          )}

          {/* Form Store Tujuan & No HP */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
                Toko Asal Barang (Penerima Notifikasi WhatsApp)
              </label>
              <div className="flex items-center gap-2 p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>{targetStore}</span>
                {isInterStore && (
                  <span className="ml-auto text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                    Fulfillment Asal
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Nomor WhatsApp Toko {targetStore}</span>
                </label>
                <span className="text-[10px] text-slate-400">Tersimpan di Master Kontak</span>
              </div>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="Contoh: 081288990022"
                className="w-full px-3 py-2 text-xs sm:text-sm font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-slate-900 dark:text-white"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Nomor ini otomatis terisi dari Direktori Kontak Store. Anda dapat mengedit nomor jika PIC shift sedang berganti.
              </p>
            </div>
          </div>

          {/* Daftar Barang yang Wajib Dikirim */}
          <div>
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-indigo-500" />
              <span>Barang yang Wajib Dikirim dari {targetStore} ({items.length} item)</span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 mr-1.5">{it.sku || '-'}</span>
                    <span className="text-slate-800 dark:text-slate-200">{it.nama_produk}</span>
                    {it.size && it.size !== 'ALL' && it.size !== '-' && (
                      <span className="ml-1 text-[10px] text-slate-500 font-semibold">• Size {it.size}</span>
                    )}
                  </div>
                  <span className="font-bold text-emerald-600 ml-2 shrink-0">{it.qty || 1} pcs</span>
                </div>
              ))}
            </div>
          </div>

          {/* Preview Teks WhatsApp */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                Preview Pesan WhatsApp
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Tersalin!' : 'Salin Teks'}</span>
              </button>
            </div>
            <div className="p-3 bg-slate-900 text-slate-200 rounded-xl text-[10.5px] font-mono leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto select-all border border-slate-800">
              {waMessage}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin</span>
            </button>
            <button
              type="button"
              onClick={handleOpenWaWeb}
              className="px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Buka Chat WhatsApp langsung di Tab Baru"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka WA Web</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isSending}
            onClick={handleSendFonnte}
            className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ml-auto"
          >
            {isSending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Mengirim...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Kirim WA (Fonnte API)</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
