import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Image as ImageIcon, Trash2, Camera, Upload, BookOpen } from 'lucide-react';
import * as xlsx from 'xlsx';
import { KatalogItem, KatalogVariant } from '../types';
import { fetchWmsSettings, saveWmsSettings } from '../services/settings';
import { uploadImageToGdrive } from '../services/gdriveUpload';

interface KatalogProdukViewProps {
  onNotify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const KatalogProdukView: React.FC<KatalogProdukViewProps> = ({ onNotify }) => {
  const [catalog, setCatalog] = useState<KatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [targetUploadId, setTargetUploadId] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    setIsLoading(true);
    try {
      const settings = await fetchWmsSettings();
      const dataStr = settings?.katalog_manual_data;
      if (dataStr) {
        setCatalog(JSON.parse(dataStr));
      } else {
        setCatalog([]);
      }
    } catch (err) {
      console.error('Failed to load catalog', err);
      onNotify('Gagal memuat katalog', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const saveCatalog = async (newCatalog: KatalogItem[]) => {
    try {
      await saveWmsSettings({ katalog_manual_data: JSON.stringify(newCatalog) });
      setCatalog(newCatalog);
      onNotify('Katalog berhasil disimpan', 'success');
    } catch (err) {
      console.error('Failed to save catalog', err);
      onNotify('Gagal menyimpan katalog', 'error');
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = xlsx.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
        
        let currentItem: KatalogItem | null = null;
        const newCatalog: KatalogItem[] = [];
        let idCounter = 1;

        let lastWarna = '';

        for (const row of jsonData) {
          const no = (row['NO'] || row['No'] || row['no'] || '').toString().trim();
          const deskripsi = (row['DESKRIPSI'] || row['Deskripsi'] || row['deskripsi'] || '').toString().trim();
          const priceStr = (row['PRICE'] || row['Price'] || row['price'] || row['HARGA'] || '').toString().trim();
          
          if (deskripsi) {
            if (currentItem) {
              newCatalog.push(currentItem);
            }
            currentItem = {
              id: `KAT-${Date.now()}-${idCounter++}`,
              nomor: no,
              deskripsi: deskripsi,
              price: priceStr,
              variants: [],
              image_url: ''
            };
            lastWarna = ''; // Reset on new item
          }
          
          if (currentItem) {
            let warna = (row['WARNA'] || row['Warna'] || row['warna'] || '').toString().trim();
            const size = (row['SIZE'] || row['Size'] || row['size'] || '').toString().trim();
            const sku = (row['SKU'] || row['Sku'] || row['sku'] || '').toString().trim();
            const qtyRaw = row['QTY'] || row['Qty'] || row['qty'] || 0;
            const qty = parseInt(qtyRaw, 10) || 0;
            
            if (warna) {
              lastWarna = warna;
            } else {
              // Inherit from merged cell if available
              warna = lastWarna;
            }

            if (sku || warna || size) {
              currentItem.variants.push({ warna, size, sku, qty });
            }
          }
        }
        if (currentItem) {
          newCatalog.push(currentItem);
        }

        await saveCatalog(newCatalog);
      } catch (err) {
        console.error('Error importing', err);
        onNotify('Gagal membaca file Excel', 'error');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleClearCatalog = async () => {
    if (confirm('Yakin ingin menghapus seluruh data katalog Manual?')) {
      await saveCatalog([]);
    }
  };

  const triggerImageUpload = (id: string) => {
    setTargetUploadId(id);
    if (imageInputRef.current) {
      imageInputRef.current.click();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetUploadId) return;

    setUploadingImageId(targetUploadId);
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const base64Data = ev.target?.result as string;
        // Upload to Drive via GAS
        const filename = `Katalog_${targetUploadId}_${Date.now()}.png`;
        const result = await uploadImageToGdrive(base64Data, filename);
        
        if (result.success && result.url) {
          const updatedCatalog = catalog.map(item => 
            item.id === targetUploadId ? { ...item, image_url: result.url } : item
          );
          await saveCatalog(updatedCatalog);
        } else {
          onNotify(result.error || 'Gagal mengupload gambar', 'error');
        }
      } catch (err) {
        console.error('Upload err', err);
        onNotify('Gagal mengupload gambar', 'error');
      } finally {
        setUploadingImageId(null);
        setTargetUploadId(null);
        if (imageInputRef.current) imageInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Memuat Katalog...</div>;
  }

  return (
    <div className="w-full min-h-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Katalog Produk</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Katalog Manual ({catalog.length} Produk)</p>
        </div>
        
        <div className="flex items-center gap-3">
          {catalog.length > 0 && (
            <button
              onClick={handleClearCatalog}
              className="px-4 py-2 text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 rounded-xl transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Katalog</span>
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isImporting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span>Import Excel</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportExcel}
          />
          <input
            type="file"
            ref={imageInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
          />
        </div>
      </div>

      {catalog.length === 0 ? (
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Katalog Kosong</h2>
          <p className="text-slate-500 max-w-md mb-6">
            Silakan import file Excel Katalog Anda. Struktur kolom yang didukung: NO, DESKRIPSI, PRICE, WARNA, SIZE, SKU, QTY.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 text-sm font-bold text-white bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition-colors flex items-center gap-2"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import Sekarang</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {catalog.map(item => {
            const totalQty = item.variants.reduce((sum, v) => sum + v.qty, 0);
            const isUploading = uploadingImageId === item.id;

            return (
              <div key={item.id} className="bg-white dark:bg-[#09090b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                
                {/* Image Section */}
                <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800 relative group border-b border-slate-200 dark:border-slate-800">
                  {item.image_url ? (
                    <img 
                      src={item.image_url} 
                      alt={item.deskripsi} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                      <span className="text-sm font-medium">Tanpa Gambar</span>
                    </div>
                  )}

                  {/* Upload Overlay */}
                  <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${isUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button
                      onClick={() => triggerImageUpload(item.id)}
                      disabled={isUploading}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
                    >
                      {isUploading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                      <span>{item.image_url ? 'Ganti Gambar' : 'Upload Gambar'}</span>
                    </button>
                  </div>
                </div>

                {/* Content Section */}
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      {item.nomor && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded mr-2">No. {item.nomor}</span>}
                      <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">{item.deskripsi || 'Tanpa Nama'}</h3>
                    </div>
                    {item.price && (
                      <span className="text-sm font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 px-2 py-1 rounded">
                        Rp {item.price}
                      </span>
                    )}
                  </div>

                  {/* Variants Table */}
                  <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex-1">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400">
                        <tr>
                          <th className="py-1.5 px-2 font-bold">Warna</th>
                          <th className="py-1.5 px-2 font-bold">Size</th>
                          <th className="py-1.5 px-2 font-bold">SKU</th>
                          <th className="py-1.5 px-2 font-bold text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {item.variants.map((v, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">{v.warna || '-'}</td>
                            <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">{v.size || '-'}</td>
                            <td className="py-1.5 px-2 font-mono text-[10px] text-slate-500">{v.sku || '-'}</td>
                            <td className="py-1.5 px-2 font-bold text-right text-slate-800 dark:text-slate-200">{v.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700">
                        <tr>
                          <td colSpan={3} className="py-2 px-2 text-right font-bold text-slate-600 dark:text-slate-400">Total:</td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{totalQty}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
