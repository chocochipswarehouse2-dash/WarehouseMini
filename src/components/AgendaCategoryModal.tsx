import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Check, Edit3, Palette } from 'lucide-react';
import { fetchWmsSettings, saveWmsSettings } from '../services/settings';

const PALETTE_OPTIONS = [
  { id: 'indigo', name: 'Ungu / Indigo', badgeBg: 'bg-indigo-100 dark:bg-indigo-950/50', badgeText: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-800', cardBg: 'bg-indigo-50/70 dark:bg-indigo-950/30', dot: 'bg-indigo-500', gradient: 'from-indigo-500 to-purple-600' },
  { id: 'emerald', name: 'Hijau / Emerald', badgeBg: 'bg-emerald-100 dark:bg-emerald-950/50', badgeText: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-800', cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/30', dot: 'bg-emerald-500', gradient: 'from-emerald-500 to-teal-600' },
  { id: 'sky', name: 'Biru / Sky', badgeBg: 'bg-sky-100 dark:bg-sky-950/50', badgeText: 'text-sky-700 dark:text-sky-300', border: 'border-sky-300 dark:border-sky-800', cardBg: 'bg-sky-50/70 dark:bg-sky-950/30', dot: 'bg-sky-500', gradient: 'from-sky-500 to-blue-600' },
  { id: 'amber', name: 'Kuning / Amber', badgeBg: 'bg-amber-100 dark:bg-amber-950/50', badgeText: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800', cardBg: 'bg-amber-50/70 dark:bg-amber-950/30', dot: 'bg-amber-500', gradient: 'from-amber-400 to-orange-500' },
  { id: 'rose', name: 'Merah / Rose', badgeBg: 'bg-rose-100 dark:bg-rose-950/50', badgeText: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-800', cardBg: 'bg-rose-50/70 dark:bg-rose-950/30', dot: 'bg-rose-500', gradient: 'from-rose-500 to-pink-600' },
  { id: 'slate', name: 'Abu-abu / Slate', badgeBg: 'bg-slate-100 dark:bg-slate-800', badgeText: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-700', cardBg: 'bg-slate-50/50 dark:bg-slate-800/40', dot: 'bg-slate-500', gradient: 'from-slate-500 to-slate-700' },
  { id: 'teal', name: 'Tosca / Teal', badgeBg: 'bg-teal-100 dark:bg-teal-950/50', badgeText: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-800', cardBg: 'bg-teal-50/70 dark:bg-teal-950/30', dot: 'bg-teal-500', gradient: 'from-teal-400 to-emerald-500' },
  { id: 'purple', name: 'Ungu Tua / Purple', badgeBg: 'bg-purple-100 dark:bg-purple-950/50', badgeText: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-800', cardBg: 'bg-purple-50/70 dark:bg-purple-950/30', dot: 'bg-purple-500', gradient: 'from-purple-500 to-indigo-600' },
];

export const AgendaCategoryModal = ({
  isOpen,
  onClose,
  currentConfig,
  onNotify
}: {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: Record<string, any>;
  onNotify?: (msg: string, type: 'success'|'error') => void;
}) => {
  const [categories, setCategories] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCategories(JSON.parse(JSON.stringify(currentConfig)));
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await saveWmsSettings({ agenda_categories: categories });
      if (res) {
        onNotify?.('Kategori Agenda berhasil diperbarui!', 'success');
        onClose();
      } else {
        onNotify?.('Gagal menyimpan kategori', 'error');
      }
    } catch (err) {
      onNotify?.('Terjadi kesalahan', 'error');
    }
    setIsSaving(false);
  };

  const handleAdd = () => {
    const newKey = 'cat_' + Date.now();
    setCategories({
      ...categories,
      [newKey]: {
        label: 'Kategori Baru',
        ...PALETTE_OPTIONS[0] // default color
      }
    });
    setEditingKey(newKey);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1a2332] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
          <div>
            <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary-500" />
              Kelola Kategori Agenda
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Dapat disesuaikan secara bebas oleh seluruh pengguna
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full hover:bg-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {Object.keys(categories).map(k => {
            const cat = categories[k];
            const isEditing = editingKey === k;
            
            return (
              <div key={k} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${cat.dot}`}></div>
                  {isEditing ? (
                    <input 
                      autoFocus
                      type="text" 
                      value={cat.label} 
                      onChange={e => setCategories({...categories, [k]: {...cat, label: e.target.value}})}
                      className="flex-1 text-sm font-bold bg-white dark:bg-[#1a2332] border border-primary-300 dark:border-primary-700 px-2 py-1 rounded-lg outline-none"
                    />
                  ) : (
                    <span className="flex-1 text-sm font-bold text-slate-700 dark:text-slate-200">{cat.label}</span>
                  )}
                  
                  <div className="flex gap-1">
                    <button onClick={() => setEditingKey(isEditing ? null : k)} className="p-1.5 text-slate-400 hover:text-primary-500 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
                      {isEditing ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Edit3 className="w-3.5 h-3.5" />}
                    </button>
                    <button 
                      onClick={() => {
                        const newCats = {...categories};
                        delete newCats[k];
                        setCategories(newCats);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-500 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
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
                        onClick={() => setCategories({...categories, [k]: {...cat, ...opt}})}
                        className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                          cat.badgeBg === opt.badgeBg ? 'border-primary-500 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
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
            onClick={handleAdd}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-primary-500 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center justify-center gap-2 font-bold text-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Kategori Baru
          </button>
        </div>

        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-white dark:bg-[#1a2332]">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            Batal
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 rounded-xl text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 shadow-md shadow-primary-500/20 disabled:opacity-70 flex items-center gap-2"
          >
            {isSaving ? 'Menyimpan...' : 'Simpan Kategori'}
          </button>
        </div>

      </div>
    </div>
  );
};
