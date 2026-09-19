import React, { useState, useEffect } from 'react';
import { X, FolderPlus, Sparkles, Package, Save, RefreshCw } from 'lucide-react';
import { KatalogBatch } from '../../types';

interface KatalogCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingBatches: KatalogBatch[];
  onCreateBatch: (batchName: string) => Promise<void>;
  onNotify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const KatalogCreateModal: React.FC<KatalogCreateModalProps> = ({
  isOpen,
  onClose,
  existingBatches,
  onCreateBatch,
  onNotify,
}) => {
  const [catalogName, setCatalogName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCatalogName('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = catalogName.trim();
    if (!cleanName) {
      onNotify('Nama katalog wajib diisi!', 'warning');
      return;
    }

    // Cek apakah nama katalog sudah ada
    const duplicate = existingBatches.find(
      (b) => b.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      onNotify(`Katalog dengan nama "${cleanName}" sudah ada. Silakan gunakan nama lain.`, 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateBatch(cleanName);
      onClose();
    } catch (err: any) {
      console.error('Error creating catalog batch:', err);
      onNotify(`Gagal membuat katalog: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Buat Katalog Baru Manual
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tanpa perlu import file Excel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Nama Katalog / Koleksi <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={catalogName}
              onChange={(e) => setCatalogName(e.target.value)}
              placeholder="Contoh: 326 B, Summer 2026, Koleksi Gamis..."
              autoFocus
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Setelah dibuat, Anda dapat langsung menambahkan produk satu per satu dengan tombol <strong>"+ Tambah Produk"</strong>.
            </p>
          </div>

          <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-900 dark:text-indigo-300 leading-relaxed">
              Katalog baru akan langsung tersimpan secara permanen ke Supabase Cloud dan siap digunakan untuk cetak barcode maupun cetak katalog A4.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Membuat...</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-4 h-4" />
                  <span>Buat Katalog</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
