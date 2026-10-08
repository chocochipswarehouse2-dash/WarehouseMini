import React, { useState, useEffect } from 'react';
import { Ban, X, AlertTriangle, Send, Loader2, Info } from 'lucide-react';
import { ManualShipmentOrder } from '../../types';

interface CancelOrderModalProps {
  isOpen: boolean;
  order: ManualShipmentOrder | null;
  onClose: () => void;
  onConfirmCancel: (
    order: ManualShipmentOrder,
    reason: string,
    notes: string,
    sendWa: boolean
  ) => Promise<void>;
  isSubmitting?: boolean;
}

const COMMON_CANCEL_REASONS = [
  'Permintaan Pembatalan dari Customer',
  'Stok Produk Kosong / Tidak Tersedia di Toko',
  'Alamat / Kontak Customer Tidak Valid',
  'Kesalahan Input Data Pesanan',
  'Duplikasi Pesanan',
  'Kendala Operasional / Ekspedisi',
  'Lainnya (Tuliskan alasan spesifik)',
];

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  isOpen,
  order,
  onClose,
  onConfirmCancel,
  isSubmitting = false,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(COMMON_CANCEL_REASONS[0]);
  const [notes, setNotes] = useState<string>('');
  const [sendWa, setSendWa] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSelectedReason(COMMON_CANCEL_REASONS[0]);
      setNotes('');
      setSendWa(Boolean(order?.no_telp_store));
      setErrorMsg('');
    }
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (selectedReason === 'Lainnya (Tuliskan alasan spesifik)' && !notes.trim()) {
      setErrorMsg('Harap tuliskan catatan alasan pembatalan secara spesifik');
      return;
    }

    await onConfirmCancel(order, selectedReason, notes.trim(), sendWa);
  };

  const totalQty = (order.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-red-50/80 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 text-white rounded-xl shadow-xs">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-red-950 dark:text-red-200">
                Batalkan Pesanan
              </h3>
              <p className="text-xs text-red-700 dark:text-red-400 font-mono mt-0.5">
                {order.no_transaksi_customer || order.no_pesanan}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-white/50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {/* Info Card Ringkasan Pesanan */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
            <div className="flex justify-between items-start gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Store Pengirim:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                {order.nama_pengirim} {order.pic_store ? `(PIC: ${order.pic_store})` : ''}
              </span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Customer Tujuan:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                {order.nama_tujuan} {order.no_telp_tujuan ? `(${order.no_telp_tujuan})` : ''}
              </span>
            </div>
            <div className="flex justify-between items-start gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Total Produk:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {order.items?.length || 0} SKU ({totalQty} pcs)
              </span>
            </div>
          </div>

          {/* Alert Info Histori Tetap Ada */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Histori Tersimpan Permanen:</strong> Pesanan tidak akan dihapus dari database. Status akan diubah menjadi <span className="font-bold underline">Batal</span> dan alasan pembatalan ini akan dicatat ke dalam audit trail histori.
            </div>
          </div>

          {/* Dropdown Alasan Pembatalan */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Pilih Alasan Pembatalan <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {COMMON_CANCEL_REASONS.map((r, idx) => (
                <option key={idx} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Catatan / Keterangan Tambahan */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
              <span>Catatan / Rincian Alasan</span>
              {selectedReason === 'Lainnya (Tuliskan alasan spesifik)' && (
                <span className="text-red-500 text-[10px] font-normal">*Wajib diisi</span>
              )}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Customer membatalkan pesanan via chat karena salah pilih varian..."
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>

          {/* Opsi Kirim WA Fonnte ke Store */}
          {order.no_telp_store && (
            <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sendWa}
                onChange={(e) => setSendWa(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 dark:border-slate-600 focus:ring-emerald-500"
              />
              <div className="text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <Send className="w-3 h-3 text-emerald-600" />
                  Kirim Notifikasi Pembatalan via WhatsApp Fonnte ke Store
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                  Tujuan: {order.no_telp_store} ({order.nama_pengirim})
                </span>
              </div>
            </label>
          )}

          {errorMsg && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Footer Controls */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Membatalkan...</span>
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  <span>Konfirmasi Batalkan Pesanan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
