import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Package,
  Plus,
  Trash2,
  Camera,
  Upload,
  Link,
  Save,
  AlertTriangle,
  RefreshCw,
  Copy,
  Layers,
  Check,
  Image as ImageIcon,
} from 'lucide-react';
import { KatalogBatch, KatalogItem, KatalogVariant } from '../../types';
import { compressImageDataUri } from './katalogStorage';
import { uploadKatalogImageToGdrive } from '../../services/katalogGdrive';

interface KatalogProductModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  batchId: string;
  batchName: string;
  availableBatches?: KatalogBatch[];
  itemToEdit?: KatalogItem | null;
  onClose: () => void;
  onSave: (targetBatchId: string, item: KatalogItem) => Promise<void>;
  onDelete?: (batchId: string, itemId: string) => Promise<void>;
  onNotify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const KatalogProductModal: React.FC<KatalogProductModalProps> = ({
  isOpen,
  mode,
  batchId,
  batchName,
  availableBatches = [],
  itemToEdit,
  onClose,
  onSave,
  onDelete,
  onNotify,
}) => {
  const [selectedBatchId, setSelectedBatchId] = useState<string>(batchId);
  const [nomor, setNomor] = useState<string>('');
  const [deskripsi, setDeskripsi] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [variants, setVariants] = useState<KatalogVariant[]>([
    { warna: '', size: 'Default', sku: '', qty: 0 },
  ]);

  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inisialisasi state saat modal dibuka
  useEffect(() => {
    if (!isOpen) return;

    setSelectedBatchId(batchId);
    if (mode === 'edit' && itemToEdit) {
      setNomor(itemToEdit.nomor || '');
      setDeskripsi(itemToEdit.deskripsi || '');
      setPrice(String(itemToEdit.price || ''));
      setImageUrl(itemToEdit.image_url || '');
      setVariants(
        itemToEdit.variants && itemToEdit.variants.length > 0
          ? JSON.parse(JSON.stringify(itemToEdit.variants))
          : [{ warna: '', size: 'Default', sku: '', qty: 0 }]
      );
    } else {
      // Mode Add: reset form
      setNomor('');
      setDeskripsi('');
      setPrice('');
      setImageUrl('');
      setVariants([{ warna: '', size: 'Default', sku: '', qty: 0 }]);
    }
    setShowUrlInput(false);
    setCustomUrl('');
    setIsDraggingOver(false);
  }, [isOpen, mode, itemToEdit, batchId]);

  // Handler umum pemrosesan File/Blob Gambar (dari File Picker, Drag & Drop, atau Paste)
  const processImageFile = async (file: File | Blob) => {
    setIsProcessingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        if (!base64) {
          setIsProcessingImage(false);
          return;
        }

        const label = deskripsi || nomor || 'produk';
        onNotify('Mengompres dan mengunggah foto ke Google Drive Cloud...', 'info');
        
        // Kompres terlebih dahulu
        const compressed = await compressImageDataUri(base64, 800, 0.8);
        setImageUrl(compressed);

        // Upload ke Google Drive di background
        const gdriveRes = await uploadKatalogImageToGdrive(compressed, label);
        if (gdriveRes.success && gdriveRes.url && !gdriveRes.url.startsWith('data:')) {
          setImageUrl(gdriveRes.url);
          onNotify('Foto berhasil diunggah ke Google Drive Cloud!', 'success');
        } else {
          onNotify('Foto disimpan di memori lokal.', 'info');
        }
        setIsProcessingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error reading image:', err);
      onNotify('Gagal memproses gambar', 'error');
      setIsProcessingImage(false);
    }
  };

  // Handler global Clipboard Paste (Ctrl+V) saat modal dibuka
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      // Jika user sedang mengetik di input text/url/number biasa, dan bukan menempel gambar murni, biarkan default
      const items = e.clipboardData?.items;
      if (!items) return;

      let foundImage = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            foundImage = true;
            onNotify('Foto dari Clipboard (Paste) terdeteksi!', 'info');
            processImageFile(blob);
            break;
          }
        }
      }

      // Jika user menempel teks berupa link gambar direct url
      if (!foundImage) {
        const text = e.clipboardData?.getData('text')?.trim();
        if (text && /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i.test(text)) {
          setImageUrl(text);
          onNotify('Link foto dari clipboard berhasil diterapkan!', 'success');
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, deskripsi, nomor]);

  if (!isOpen) return null;

  // Format input harga agar otomatis rapi
  const handlePriceChange = (val: string) => {
    const raw = val.replace(/[^0-9]/g, '');
    if (!raw) {
      setPrice('');
      return;
    }
    const formatted = Number(raw).toLocaleString('id-ID');
    setPrice(formatted);
  };

  // Upload & Kompres Foto via Input File Picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImageFile(file);
    // Reset file input value so same file can be re-selected if needed
    if (e.target) e.target.value = '';
  };

  // Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        onNotify('Foto berhasil di-drop!', 'info');
        await processImageFile(file);
      } else {
        onNotify('File yang di-drop harus berupa gambar (JPG/PNG/WEBP)', 'warning');
      }
    }
  };

  // Tambah baris varian baru
  const handleAddVariant = () => {
    const lastVariant = variants[variants.length - 1];
    setVariants((prev) => [
      ...prev,
      {
        warna: lastVariant ? lastVariant.warna : '',
        size: lastVariant ? lastVariant.size : 'Default',
        sku: '',
        qty: 0,
      },
    ]);
  };

  // Duplikasi baris varian
  const handleDuplicateVariant = (idx: number) => {
    const source = variants[idx];
    if (!source) return;
    const next = [...variants];
    next.splice(idx + 1, 0, {
      ...source,
      sku: source.sku ? `${source.sku}-COPY` : '',
    });
    setVariants(next);
  };

  // Hapus baris varian
  const handleRemoveVariant = (idx: number) => {
    if (variants.length <= 1) {
      onNotify('Produk minimal harus memiliki 1 varian', 'warning');
      return;
    }
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  // Update nilai varian
  const handleVariantChange = (
    idx: number,
    field: keyof KatalogVariant,
    value: string | number
  ) => {
    setVariants((prev) =>
      prev.map((v, i) => {
        if (i !== idx) return v;
        if (field === 'qty') {
          return { ...v, qty: Math.max(0, parseInt(String(value), 10) || 0) };
        }
        return { ...v, [field]: value };
      })
    );
  };

  // Submit Simpan Produk
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDeskripsi = deskripsi.trim();
    if (!cleanDeskripsi) {
      onNotify('Nama produk wajib diisi!', 'warning');
      return;
    }

    // Filter varian yang valid
    const cleanVariants = variants.map((v) => ({
      warna: v.warna.trim() || '-',
      size: v.size.trim() || 'Default',
      sku: v.sku.trim() || '-',
      qty: Number(v.qty) || 0,
    }));

    const currentBatch = availableBatches.find((b) => b.id === selectedBatchId);
    const targetCatalogName = currentBatch ? currentBatch.name : batchName;

    const finalItem: KatalogItem = {
      id: mode === 'edit' && itemToEdit ? itemToEdit.id : `KAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      nomor: nomor.trim(),
      deskripsi: cleanDeskripsi,
      price: price.trim(),
      image_url: imageUrl.trim(),
      variants: cleanVariants,
      catalog_id: selectedBatchId,
      catalog_name: targetCatalogName,
    };

    setIsSaving(true);
    try {
      await onSave(selectedBatchId, finalItem);
      onClose();
    } catch (err: any) {
      console.error('Save product error:', err);
      onNotify(`Gagal menyimpan produk: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Hapus Produk
  const handleDelete = async () => {
    if (!itemToEdit || !onDelete) return;
    if (!window.confirm(`Yakin ingin menghapus produk "${itemToEdit.deskripsi}" dari katalog?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(batchId, itemToEdit.id);
      onClose();
    } catch (err: any) {
      console.error('Delete product error:', err);
      onNotify(`Gagal menghapus produk: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[94vh] sm:max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">
                  {mode === 'edit' ? 'Edit Isi Produk Katalog' : 'Tambah Produk Baru ke Katalog'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Katalog Target:{' '}
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    {availableBatches.find((b) => b.id === selectedBatchId)?.name || batchName}
                  </strong>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isDeleting}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Form (Scrollable) */}
          <div className="p-5 overflow-y-auto space-y-5 flex-1 text-slate-800 dark:text-slate-200">
            {/* Pemilihan Katalog (Jika mode tambah dan ada beberapa katalog) */}
            {availableBatches.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Pilih Katalog
                </label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  {availableBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      Katalog {b.name} ({b.items.length} produk)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Nomor & Nama Produk & Harga */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              {/* Nomor Urut */}
              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  No. Katalog
                </label>
                <input
                  type="text"
                  value={nomor}
                  onChange={(e) => setNomor(e.target.value)}
                  placeholder="Contoh: 1"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Nama Produk */}
              <div className="sm:col-span-5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Nama Model / Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                  placeholder="Contoh: Quisera Top"
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Harga Jual */}
              <div className="sm:col-span-4">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Harga Jual (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="text"
                    value={price}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    placeholder="315.000"
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-black text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* SEKSI FOTO PRODUK */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`space-y-2 p-3.5 rounded-xl border transition-all ${
                isDraggingOver
                  ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 border-dashed ring-2 ring-indigo-400'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Foto Produk
                </label>
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200/60 dark:border-indigo-800/60 flex items-center gap-1">
                  <span>💡 Bisa Drag & Drop atau Tekan</span>
                  <kbd className="px-1 py-0.2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-[10px] font-mono shadow-2xs font-bold">
                    Ctrl + V
                  </kbd>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Image Preview Box & Direct Drop Target */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-28 h-28 rounded-xl border-2 transition-all bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs relative group cursor-pointer ${
                    isDraggingOver
                      ? 'border-indigo-500 bg-indigo-50/50 scale-105'
                      : 'border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                  }`}
                  title="Klik untuk memilih foto atau seret/drop gambar langsung ke kotak ini"
                >
                  {imageUrl ? (
                    <>
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover object-top"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-medium p-1 text-center">
                        <Camera className="w-5 h-5 mb-0.5" />
                        <span>Ganti Foto</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center group-hover:text-indigo-500 transition-colors">
                      <ImageIcon className="w-7 h-7 opacity-50 mb-1" />
                      <span className="text-[10px] font-bold leading-tight">Drop / Pilih Foto</span>
                    </div>
                  )}

                  {isProcessingImage && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white text-xs gap-1.5 p-2 text-center">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span className="text-[10px] font-semibold">Mengompres...</span>
                    </div>
                  )}

                  {isDraggingOver && (
                    <div className="absolute inset-0 bg-indigo-600/80 backdrop-blur-xs flex flex-col items-center justify-center text-white text-xs font-bold gap-1 p-2 text-center">
                      <Upload className="w-6 h-6 animate-bounce" />
                      <span className="text-[11px] leading-tight">Lepaskan di Sini</span>
                    </div>
                  )}
                </div>

                {/* Upload Action Buttons */}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessingImage}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Pilih / Foto Kamera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Link className="w-3.5 h-3.5" />
                      <span>{showUrlInput ? 'Tutup Input Link' : 'Tempel Link Foto'}</span>
                    </button>

                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                      >
                        Hapus Foto
                      </button>
                    )}
                  </div>

                  {showUrlInput && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="url"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://...link-foto-produk.jpg"
                        className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customUrl.trim()) {
                            setImageUrl(customUrl.trim());
                            setCustomUrl('');
                            setShowUrlInput(false);
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl"
                      >
                        Terapkan
                      </button>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 leading-tight">
                    Foto yang diunggah otomatis dikompresi hemat kuota/storage dan disimpan di Google Drive Cloud. Mendukung <strong>Drag & Drop</strong> dan <strong>Copy-Paste (Ctrl+V)</strong> langsung dari screenshot atau browser.
                  </p>
                </div>
              </div>
            </div>

            {/* SEKSI DAFTAR VARIAN */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Daftar Varian Produk ({variants.length})
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Atur warna, size, SKU barcode, dan stok fisik untuk produk ini.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Varian</span>
                </button>
              </div>

              {/* Tabel Varian */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xs">
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100/90 dark:bg-slate-800/90 sticky top-0 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="py-2 px-3">Warna</th>
                        <th className="py-2 px-2.5">Size</th>
                        <th className="py-2 px-2.5">SKU / Barcode</th>
                        <th className="py-2 px-2.5 text-right w-20">Stok</th>
                        <th className="py-2 px-2 text-center w-16">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {variants.map((v, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          {/* Warna */}
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={v.warna}
                              onChange={(e) => handleVariantChange(idx, 'warna', e.target.value)}
                              placeholder="Brown / Grey"
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Size */}
                          <td className="py-1.5 px-2.5">
                            <input
                              type="text"
                              value={v.size}
                              onChange={(e) => handleVariantChange(idx, 'size', e.target.value)}
                              placeholder="Default / M / L"
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* SKU */}
                          <td className="py-1.5 px-2.5">
                            <input
                              type="text"
                              value={v.sku}
                              onChange={(e) => handleVariantChange(idx, 'sku', e.target.value.toUpperCase())}
                              placeholder="F26ITN816BN"
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-[11px] text-violet-700 dark:text-violet-400 font-semibold focus:outline-hidden focus:ring-1 focus:ring-indigo-500 uppercase"
                            />
                          </td>

                          {/* Qty */}
                          <td className="py-1.5 px-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              value={v.qty}
                              onChange={(e) => handleVariantChange(idx, 'qty', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-right focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Aksi Baris */}
                          <td className="py-1.5 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateVariant(idx)}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Duplikasi baris varian ini"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveVariant(idx)}
                                disabled={variants.length <= 1}
                                className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Hapus varian ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Aksi */}
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3 shrink-0">
            {/* Tombol Hapus Produk (Hanya jika mode edit) */}
            {mode === 'edit' && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="px-3.5 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Hapus Produk Ini</span>
              </button>
            ) : (
              <div />
            )}

            {/* Batal & Simpan */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving || isDeleting || isProcessingImage}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>{mode === 'edit' ? 'Simpan Perubahan' : 'Tambah ke Katalog'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
