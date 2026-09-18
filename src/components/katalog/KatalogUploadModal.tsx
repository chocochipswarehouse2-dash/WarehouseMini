import React, { useState, useEffect } from 'react';
import { X, UploadCloud, Layers, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { KatalogBatch, KatalogItem } from '../../types';

interface KatalogUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedItems: KatalogItem[];
  suggestedName: string;
  sourceFileName: string;
  existingBatches: KatalogBatch[];
  onConfirmSave: (batchName: string, mode: 'new' | 'replace', targetBatchId?: string) => Promise<void>;
}

export const KatalogUploadModal: React.FC<KatalogUploadModalProps> = ({
  isOpen,
  onClose,
  parsedItems,
  suggestedName,
  sourceFileName,
  existingBatches,
  onConfirmSave,
}) => {
  const [catalogName, setCatalogName] = useState(suggestedName);
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [targetBatchId, setTargetBatchId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCatalogName(suggestedName || 'Katalog Baru');
    // Jika ada nama yang sama persis dengan yang sudah ada, default ke replace atau new
    const existing = existingBatches.find(
      (b) => b.name.trim().toLowerCase() === (suggestedName || '').trim().toLowerCase()
    );
    if (existing) {
      setMode('replace');
      setTargetBatchId(existing.id);
    } else {
      setMode('new');
      if (existingBatches.length > 0) {
        setTargetBatchId(existingBatches[0].id);
      }
    }
  }, [suggestedName, existingBatches, isOpen]);

  if (!isOpen) return null;

  const totalVariants = parsedItems.reduce((acc, it) => acc + (it.variants?.length || 0), 0);
  const totalQty = parsedItems.reduce(
    (acc, it) => acc + (it.variants?.reduce((vSum, v) => vSum + (v.qty || 0), 0) || 0),
    0
  );
  const totalImages = parsedItems.filter((it) => Boolean(it.image_url)).length;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = catalogName.trim();
    if (!finalName) return;

    setIsSaving(true);
    try {
      await onConfirmSave(finalName, mode, mode === 'replace' ? targetBatchId : undefined);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Simpan & Kelompokkan Katalog
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dari file: <span className="font-semibold text-slate-700 dark:text-slate-300">{sourceFileName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Ringkasan Data yang Diekstrak */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-center">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Produk</span>
              <p className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">{parsedItems.length}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Total Varian</span>
              <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{totalVariants}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Foto Terbaca</span>
              <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400">{totalImages} Item</p>
            </div>
          </div>

          {/* Opsi Mode Upload: Baru vs Replace */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pilihan Penyimpanan:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  mode === 'new'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="uploadMode"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="font-bold text-sm">Katalog Baru</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Buat kelompok terpisah (misal: 326 B, 325 A).
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  mode === 'replace'
                    ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <input
                  type="radio"
                  name="uploadMode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  disabled={existingBatches.length === 0}
                  className="mt-1 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <div className="font-bold text-sm">Replace / Timpa</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Perbarui data pada katalog yang sudah ada.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Jika Mode Replace: Dropdown Pilih Katalog yang Mau Ditimpa */}
          {mode === 'replace' && (
            <div className="space-y-1.5 p-3.5 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/50">
              <label className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Pilih Katalog yang Akan Ditimpa (Replace):
              </label>
              <select
                value={targetBatchId}
                onChange={(e) => {
                  setTargetBatchId(e.target.value);
                  const selected = existingBatches.find((b) => b.id === e.target.value);
                  if (selected) setCatalogName(selected.name);
                }}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              >
                {existingBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.items.length} Produk)
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Data produk lama dalam katalog ini akan digantikan dengan data baru dari file Excel ini.
              </p>
            </div>
          )}

          {/* Input Nama Katalog */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Nama / No Katalog (Contoh: "326 B", "325 A"):
            </label>
            <input
              type="text"
              required
              value={catalogName}
              onChange={(e) => setCatalogName(e.target.value)}
              placeholder="Contoh: 326 B atau 325 A"
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-hidden transition-all shadow-xs"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Nama ini akan muncul sebagai badge tanda pengenal di setiap kartu produk dan opsi filter katalog.
            </p>
          </div>

          {/* Daftar Singkat Produk yang akan disimpan */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Preview Daftar Produk ({parsedItems.length}):
            </span>
            <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 p-2 text-xs">
              {parsedItems.slice(0, 10).map((it, idx) => (
                <div key={idx} className="py-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-slate-400">#{it.nomor || idx + 1}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {it.deskripsi || 'Tanpa Nama'}
                    </span>
                  </div>
                  <div className="text-right text-slate-500 dark:text-slate-400 shrink-0">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {it.price ? `Rp ${it.price}` : '-'}
                    </span>{' '}
                    • {it.variants?.length || 0} Varian
                  </div>
                </div>
              ))}
              {parsedItems.length > 10 && (
                <div className="py-1.5 text-center text-slate-400 italic">
                  + {parsedItems.length - 10} produk lainnya
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving || !catalogName.trim()}
              className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan ke Cloud & Lokal...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Katalog "{catalogName}"</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
