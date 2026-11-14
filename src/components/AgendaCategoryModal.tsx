import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Check, Edit3, Palette, RotateCcw } from 'lucide-react';
import { fetchWmsSettings, saveWmsSettings } from '../services/settings';
import { DEFAULT_CATEGORY_CONFIG } from './AgendaView';

const PALETTE_OPTIONS = [
  { id: 'indigo', name: 'Ungu / Indigo', hex: '#8430ce', barBg: 'bg-[#8430ce] hover:bg-[#7226b5] text-white', badgeBg: 'bg-indigo-100 dark:bg-indigo-950/50', badgeText: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-800', cardBg: 'bg-indigo-50/70 dark:bg-indigo-950/30', dot: 'bg-indigo-500', gradient: 'from-indigo-500 to-purple-600' },
  { id: 'emerald', name: 'Hijau / Emerald', hex: '#0b8043', barBg: 'bg-[#0b8043] hover:bg-[#096e39] text-white', badgeBg: 'bg-emerald-100 dark:bg-emerald-950/50', badgeText: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-800', cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/30', dot: 'bg-emerald-500', gradient: 'from-emerald-500 to-teal-600' },
  { id: 'sky', name: 'Biru / Sky', hex: '#039be5', barBg: 'bg-[#039be5] hover:bg-[#0288d1] text-white', badgeBg: 'bg-sky-100 dark:bg-sky-950/50', badgeText: 'text-sky-700 dark:text-sky-300', border: 'border-sky-300 dark:border-sky-800', cardBg: 'bg-sky-50/70 dark:bg-sky-950/30', dot: 'bg-sky-500', gradient: 'from-sky-500 to-blue-600' },
  { id: 'amber', name: 'Kuning / Amber', hex: '#f59e0b', barBg: 'bg-[#f59e0b] hover:bg-[#d97706] text-white', badgeBg: 'bg-amber-100 dark:bg-amber-950/50', badgeText: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800', cardBg: 'bg-amber-50/70 dark:bg-amber-950/30', dot: 'bg-amber-500', gradient: 'from-amber-400 to-orange-500' },
  { id: 'rose', name: 'Merah / Rose', hex: '#d50000', barBg: 'bg-[#d50000] hover:bg-[#b70000] text-white', badgeBg: 'bg-rose-100 dark:bg-rose-950/50', badgeText: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-800', cardBg: 'bg-rose-50/70 dark:bg-rose-950/30', dot: 'bg-rose-500', gradient: 'from-rose-500 to-pink-600' },
  { id: 'slate', name: 'Abu-abu / Slate', hex: '#546e7a', barBg: 'bg-[#546e7a] hover:bg-[#455a64] text-white', badgeBg: 'bg-slate-100 dark:bg-slate-800', badgeText: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-700', cardBg: 'bg-slate-50/50 dark:bg-slate-800/40', dot: 'bg-slate-500', gradient: 'from-slate-500 to-slate-700' },
  { id: 'teal', name: 'Tosca / Teal', hex: '#00897b', barBg: 'bg-[#00897b] hover:bg-[#00796b] text-white', badgeBg: 'bg-teal-100 dark:bg-teal-950/50', badgeText: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-800', cardBg: 'bg-teal-50/70 dark:bg-teal-950/30', dot: 'bg-teal-500', gradient: 'from-teal-400 to-emerald-500' },
  { id: 'purple', name: 'Ungu Tua / Purple', hex: '#7c3aed', barBg: 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white', badgeBg: 'bg-purple-100 dark:bg-purple-950/50', badgeText: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-800', cardBg: 'bg-purple-50/70 dark:bg-purple-950/30', dot: 'bg-purple-500', gradient: 'from-purple-500 to-indigo-600' },
];

export const AgendaCategoryModal = ({
  isOpen,
  onClose,
  currentConfig,
  onNotify,
  onSaveSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: Record<string, any>;
  onNotify?: (msg: string, type: 'success' | 'error') => void;
  onSaveSuccess?: (newConfig: Record<string, any>) => void;
}) => {
  const [categories, setCategories] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCategories(JSON.parse(JSON.stringify(currentConfig)));
      setEditingKey(null);
      setConfirmReset(false);
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) return null;

  const categoryKeys = Object.keys(categories);

  const handleSave = async () => {
    if (categoryKeys.length === 0) {
      onNotify?.('Minimal harus ada 1 kategori agenda.', 'error');
      return;
    }
    const sanitized: Record<string, any> = {};
    for (const k of categoryKeys) {
      const item = categories[k];
      const cleanLabel = String(item?.label || '').trim();
      if (!cleanLabel) {
        onNotify?.('Nama kategori tidak boleh kosong.', 'error');
        setEditingKey(k);
        return;
      }
      sanitized[k] = { ...item, label: cleanLabel };
    }

    setIsSaving(true);
    try {
      const res = await saveWmsSettings({ agenda_categories: sanitized });
      if (res) {
        onNotify?.('Kategori Agenda berhasil diperbarui!', 'success');
        onSaveSuccess?.(sanitized);
        onClose();
      } else {
        onNotify?.('Gagal menyimpan kategori', 'error');
      }
    } catch {
      onNotify?.('Terjadi kesalahan saat menyimpan kategori', 'error');
    }
    setIsSaving(false);
  };

  const handleResetToDefault = async () => {
    const defaultConfig = JSON.parse(JSON.stringify(DEFAULT_CATEGORY_CONFIG));
    setCategories(defaultConfig);
    setConfirmReset(false);
    setEditingKey(null);
    setIsSaving(true);
    try {
      const res = await saveWmsSettings({ agenda_categories: defaultConfig });
      if (res) {
        onNotify?.('Kategori Agenda berhasil di-reset ke standar sistem!', 'success');
        onSaveSuccess?.(defaultConfig);
        onClose();
      } else {
        onNotify?.('Gagal menyimpan reset kategori', 'error');
      }
    } catch {
      onNotify?.('Terjadi kesalahan saat reset kategori', 'error');
    }
    setIsSaving(false);
  };

  const handleAdd = () => {
    const newKey = 'cat_' + Date.now();
    setCategories({
      ...categories,
      [newKey]: {
        label: 'Kategori Baru',
        ...PALETTE_OPTIONS[0]
      }
    });
    setEditingKey(newKey);
    setConfirmReset(false);
  };

  const handleDeleteCategory = (k: string) => {
    if (categoryKeys.length <= 1) {
      onNotify?.('Minimal harus tersisa 1 kategori agenda.', 'error');
      return;
    }
    const newCats = { ...categories };
    delete newCats[k];
    setCategories(newCats);
    if (editingKey === k) {
      setEditingKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1a2332] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Palette className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Kelola Kategori Agenda
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Label &amp; warna dapat disesuaikan untuk seluruh tim gudang
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
            aria-label="Tutup modal kategori"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 flex-1">
          {categoryKeys.map(k => {
            const cat = categories[k];
            const isEditing = editingKey === k;
            
            return (
              <div key={k} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${cat.dot}`}></div>
                  {isEditing ? (
                    <input 
                      autoFocus
                      type="text" 
                      value={cat.label} 
                      onChange={e => setCategories({ ...categories, [k]: { ...cat, label: e.target.value } })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (String(cat.label || '').trim()) setEditingKey(null);
                        } else if (e.key === 'Escape') {
                          setEditingKey(null);
                        }
                      }}
                      placeholder="Nama kategori..."
                      className="flex-1 min-w-0 text-xs sm:text-sm font-bold bg-white dark:bg-[#1a2332] border border-indigo-400 dark:border-indigo-600 px-2.5 py-1.5 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 dark:text-white"
                    />
                  ) : (
                    <span
                      onClick={() => setEditingKey(k)}
                      className="flex-1 min-w-0 truncate text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      {cat.label}
                    </span>
                  )}
                  
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingKey(isEditing ? null : k)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
                      title={isEditing ? 'Selesai edit' : 'Edit nama & warna'}
                    >
                      {isEditing ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Edit3 className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDeleteCategory(k)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
                      title="Hapus kategori"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
                    {PALETTE_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCategories({ ...categories, [k]: { ...cat, ...opt } })}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all cursor-pointer ${
                          cat.badgeBg === opt.badgeBg ? 'border-indigo-600 scale-110 shadow-xs' : 'border-transparent hover:scale-105'
                        }`}
                        title={opt.name}
                      >
                        <div className={`w-4 h-4 rounded-full ${opt.dot}`}></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button 
            type="button"
            onClick={handleAdd}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors flex items-center justify-center gap-2 font-bold text-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Tambah Kategori Baru
          </button>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#1a2332] shrink-0 space-y-2.5">
          {confirmReset && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-amber-800 dark:text-amber-200">
                Reset semua kategori ke standar sistem?
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Tidak
                </button>
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  disabled={isSaving}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer"
                >
                  Ya, Reset
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={isSaving || confirmReset}
              className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 flex items-center gap-1.5 px-2.5 py-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer disabled:opacity-50"
              title="Kembalikan semua kategori ke susunan default sistem"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs disabled:opacity-70 flex items-center gap-1.5 cursor-pointer"
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Kategori'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
