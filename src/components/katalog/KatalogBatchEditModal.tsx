import React, { useState, useEffect } from 'react';
import {
  X,
  Edit3,
  Calendar,
  Globe,
  Store,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { KatalogBatch } from '../../types';

export interface BatchEditPayload {
  name: string;
  description?: string;
  publish_online?: string;
  publish_offline?: string;
  applyMode: 'all' | 'empty_only' | 'none';
  applyDescriptionToProducts?: boolean;
}

interface KatalogBatchEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: KatalogBatch | null;
  existingBatches: KatalogBatch[];
  onSave: (batchId: string, payload: BatchEditPayload) => Promise<void>;
  onNotify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const KatalogBatchEditModal: React.FC<KatalogBatchEditModalProps> = ({
  isOpen,
  onClose,
  batch,
  existingBatches,
  onSave,
  onNotify,
}) => {
  const [catalogName, setCatalogName] = useState('');
  const [description, setDescription] = useState('');
  const [publishOnline, setPublishOnline] = useState('');
  const [publishOffline, setPublishOffline] = useState('');
  const [applyMode, setApplyMode] = useState<'all' | 'empty_only' | 'none'>('all');
  const [applyDescriptionToProducts, setApplyDescriptionToProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && batch) {
      setCatalogName(batch.name || '');
      setDescription(batch.description || '');

      // Cari tanggal publish yang umum / representatif dari produk jika ada
      const firstWithOnline = batch.items.find((it) => Boolean(it.publish_online));
      const firstWithOffline = batch.items.find((it) => Boolean(it.publish_offline));

      setPublishOnline(batch.publish_online || firstWithOnline?.publish_online || '');
      setPublishOffline(batch.publish_offline || firstWithOffline?.publish_offline || '');

      // Default apply mode: Jika mayoritas kosong, gunakan 'all' atau 'empty_only'
      const emptyCount = batch.items.filter(
        (it) => !it.publish_online && !it.publish_offline
      ).length;
      if (emptyCount > 0) {
        setApplyMode('all');
      } else {
        setApplyMode('all');
      }
      setApplyDescriptionToProducts(false);
    }
  }, [isOpen, batch]);

  if (!isOpen || !batch) return null;

  // Statistik produk dalam batch
  const totalItems = batch.items.length;
  const itemsWithOnline = batch.items.filter((it) => Boolean(it.publish_online)).length;
  const itemsWithOffline = batch.items.filter((it) => Boolean(it.publish_offline)).length;
  const itemsEmptyBoth = batch.items.filter(
    (it) => !it.publish_online && !it.publish_offline
  ).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = catalogName.trim();
    if (!cleanName) {
      onNotify('Nama katalog wajib diisi!', 'warning');
      return;
    }

    // Cek duplikasi jika nama berubah
    if (cleanName.toLowerCase() !== batch.name.trim().toLowerCase()) {
      const duplicate = existingBatches.find(
        (b) => b.id !== batch.id && b.name.trim().toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        onNotify(`Katalog dengan nama "${cleanName}" sudah ada. Silakan gunakan nama lain.`, 'warning');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSave(batch.id, {
        name: cleanName,
        description: description.trim() || undefined,
        publish_online: publishOnline.trim() || undefined,
        publish_offline: publishOffline.trim() || undefined,
        applyMode,
        applyDescriptionToProducts,
      });
      onClose();
    } catch (err: any) {
      console.error('Error saving batch:', err);
      onNotify(`Gagal menyimpan perubahan katalog: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl max-h-[94vh] sm:max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Edit3 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 truncate">
                  Edit Katalog & Atur Massal Produk
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Katalog: <span className="font-bold text-indigo-600 dark:text-indigo-400">{batch.name}</span> ({totalItems} Produk)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 sm:space-y-5">
            {/* Bagian 1: Nama & Deskripsi Katalog */}
            <div className="space-y-3 p-4 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Nama Katalog / Koleksi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={catalogName}
                  onChange={(e) => setCatalogName(e.target.value)}
                  placeholder="Contoh: 325 B, Summer 2026, Koleksi Gamis..."
                  required
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Deskripsi / Keterangan Katalog <span className="text-[10px] font-normal text-slate-500">(opsional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Catatan mengenai katalog, tema koleksi, atau instruksi rilis..."
                  className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Bagian 2: Jadwal Publish Massal */}
            <div className="p-4 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Jadwal Rilis / Publish Massal
                  </span>
                </div>

                {/* Badge Status */}
                <div>
                  {publishOnline && !publishOffline && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      🌐 Online Only
                    </span>
                  )}
                  {!publishOnline && publishOffline && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      🏬 Offline Only
                    </span>
                  )}
                  {publishOnline && publishOffline && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      🌐 Online & 🏬 Offline
                    </span>
                  )}
                  {!publishOnline && !publishOffline && (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-200/80 text-slate-600 dark:bg-slate-750 dark:text-slate-400">
                      Belum Terjadwal
                    </span>
                  )}
                </div>
              </div>

              {/* Input Tanggal Online & Offline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Publish Online</span>
                    </span>
                    {publishOnline && (
                      <button
                        type="button"
                        onClick={() => setPublishOnline('')}
                        className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold cursor-pointer"
                      >
                        ✕ Kosongkan
                      </button>
                    )}
                  </label>
                  <input
                    type="date"
                    value={publishOnline}
                    onChange={(e) => setPublishOnline(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Publish Offline (Store)</span>
                    </span>
                    {publishOffline && (
                      <button
                        type="button"
                        onClick={() => setPublishOffline('')}
                        className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold cursor-pointer"
                      >
                        ✕ Kosongkan
                      </button>
                    )}
                  </label>
                  <input
                    type="date"
                    value={publishOffline}
                    onChange={(e) => setPublishOffline(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Status Kondisi Produk Saat Ini */}
              <div className="p-3 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-indigo-100 dark:border-indigo-900/50 text-xs space-y-2">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span>Total Produk di Katalog ini:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-bold">{totalItems} Produk</strong>
                </div>
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>• Sudah ada tanggal Online:</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{itemsWithOnline} produk</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>• Sudah ada tanggal Offline:</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{itemsWithOffline} produk</span>
                </div>
                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>• Masih belum ada tanggal sama sekali:</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">{itemsEmptyBoth} produk</span>
                </div>
              </div>

              {/* Pilihan Cara Menerapkan Tanggal ke Produk */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Terapkan Tanggal Publish ke Produk:</span>
                </label>

                <div className="space-y-2">
                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      applyMode === 'all'
                        ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 ring-1 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="applyMode"
                      value="all"
                      checked={applyMode === 'all'}
                      onChange={() => setApplyMode('all')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        ⚡ Terapkan ke SEMUA {totalItems} Produk (Update Massal)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        Seluruh produk dalam katalog ini otomatis diseragamkan dengan tanggal publish di atas.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      applyMode === 'empty_only'
                        ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 ring-1 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="applyMode"
                      value="empty_only"
                      checked={applyMode === 'empty_only'}
                      onChange={() => setApplyMode('empty_only')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        🎯 Terapkan HANYA ke Produk yang Tanggalnya Masih Kosong ({itemsEmptyBoth} Produk)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        Produk yang sudah memiliki tanggal tidak akan diubah atau ditimpa.
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      applyMode === 'none'
                        ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 ring-1 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="applyMode"
                      value="none"
                      checked={applyMode === 'none'}
                      onChange={() => setApplyMode('none')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        🔒 Jangan Ubah Tanggal Produk
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                        Hanya perbarui informasi nama atau deskripsi katalog saja.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50 shrink-0 gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !catalogName.trim()}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Perubahan Katalog</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
