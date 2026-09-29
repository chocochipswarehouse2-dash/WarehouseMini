import React, { useState, useRef } from 'react';
import { X, UploadCloud, AlertCircle, FileSpreadsheet, CheckCircle2, ChevronRight, Save } from 'lucide-react';
import * as xlsx from 'xlsx';
import { ProductItem } from '../types';

interface ImportStokModalProps {
  onClose: () => void;
  productCatalog: ProductItem[];
  onNotify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onProcess: (validRows: ImportRow[]) => Promise<void>;
  isOpen: boolean;
}

export interface ImportRow {
  sku: string;
  tipe: 'IN' | 'OUT' | 'SO';
  qty: number;
  lokasi: string;
  keterangan: string;
  isValid: boolean;
  errorMsg?: string;
  productName?: string;
}

export const ImportStokModal: React.FC<ImportStokModalProps> = ({
  onClose,
  productCatalog,
  onNotify,
  onProcess,
  isOpen
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    parseExcel(selectedFile);
  };

  const parseExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = xlsx.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON array
        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (jsonData.length === 0) {
          onNotify('File kosong atau format salah.', 'error');
          return;
        }

        // Validate and map rows
        const parsedRows: ImportRow[] = jsonData.map((row: any, index: number) => {
          const sku = (row['SKU'] || row['sku'] || row['Sku'] || '').toString().trim().toUpperCase();
          let tipeRaw = (row['TIPE'] || row['Tipe'] || row['tipe'] || '').toString().trim().toUpperCase();
          let qtyRaw = row['QTY'] || row['Qty'] || row['qty'] || 0;
          const lokasi = (row['LOKASI'] || row['Lokasi'] || row['lokasi'] || '').toString().trim();
          const keterangan = (row['KETERANGAN'] || row['Keterangan'] || row['keterangan'] || '').toString().trim();

          let isValid = true;
          let errorMsg = '';
          let productName = '';

          // Normalize Tipe
          if (tipeRaw !== 'IN' && tipeRaw !== 'OUT' && tipeRaw !== 'SO') {
            isValid = false;
            errorMsg = 'Tipe harus IN, OUT, atau SO';
          }

          // Normalize Qty
          const qty = parseInt(qtyRaw, 10);
          if (isNaN(qty) || qty < 0) {
            isValid = false;
            errorMsg = errorMsg ? `${errorMsg}, Qty tidak valid` : 'Qty harus berupa angka positif';
          }

          // Validate SKU
          if (!sku) {
            isValid = false;
            errorMsg = errorMsg ? `${errorMsg}, SKU kosong` : 'SKU tidak boleh kosong';
          } else {
            const product = productCatalog.find(p => p.k.toUpperCase() === sku);
            if (!product) {
              isValid = false;
              errorMsg = errorMsg ? `${errorMsg}, SKU tidak ditemukan` : 'SKU tidak ada di Master Data';
            } else {
              productName = product.p || sku;
            }
          }

          return {
            sku,
            tipe: tipeRaw as 'IN' | 'OUT' | 'SO',
            qty,
            lokasi: lokasi || 'Warehouse',
            keterangan,
            isValid,
            errorMsg,
            productName
          };
        });

        // Filter out completely empty rows
        const filteredRows = parsedRows.filter(r => r.sku !== '' || (r.tipe as string) !== '' || r.qty !== 0);
        
        setPreviewData(filteredRows);
        if (filteredRows.length > 0) {
          const invalidCount = filteredRows.filter(r => !r.isValid).length;
          if (invalidCount > 0) {
            onNotify(`Ditemukan ${invalidCount} baris bermasalah.`, 'warning');
          } else {
            onNotify(`Berhasil membaca ${filteredRows.length} baris data.`, 'success');
          }
        }

      } catch (err) {
        console.error(err);
        onNotify('Gagal membaca file Excel.', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleProcess = async () => {
    const validRows = previewData.filter(r => r.isValid);
    if (validRows.length === 0) {
      onNotify('Tidak ada data valid untuk diproses.', 'warning');
      return;
    }
    
    setIsProcessing(true);
    try {
      await onProcess(validRows);
      onNotify(`Berhasil memproses ${validRows.length} data impor.`, 'success');
      onClose();
    } catch (err: any) {
      onNotify(err.message || 'Gagal memproses data.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = () => {
    const ws = xlsx.utils.json_to_sheet([
      {
        'SKU': 'TEST-SKU-01',
        'Tipe': 'SO',
        'Qty': 10,
        'Lokasi': 'RAK-A1',
        'Keterangan': 'Opname Rutin'
      },
      {
        'SKU': 'TEST-SKU-02',
        'Tipe': 'IN',
        'Qty': 50,
        'Lokasi': 'Gudang Utama',
        'Keterangan': 'PO-20231015'
      },
      {
        'SKU': 'TEST-SKU-03',
        'Tipe': 'OUT',
        'Qty': 2,
        'Lokasi': 'Gudang Utama',
        'Keterangan': 'INV-001'
      }
    ]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Template');
    xlsx.writeFile(wb, 'Template_Import_Stok.xlsx');
  };

  const validCount = previewData.filter(r => r.isValid).length;
  const invalidCount = previewData.length - validCount;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#09090b] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                Impor Data Stok (IN/OUT/SO)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload file Excel/CSV untuk memproses stok secara massal.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {!file && (
            <div className="space-y-6">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:border-emerald-500 transition-colors group"
              >
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-900/20 group-hover:text-emerald-600 transition-colors">
                  <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-emerald-500" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Pilih file Excel atau CSV
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
                  File harus memiliki header kolom: SKU, Tipe, Qty, Lokasi, Keterangan
                </p>
                <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm">
                  Jelajahi File
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".xlsx,.xls,.csv" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
              </div>

              <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/50 rounded-xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
                <div className="text-xs text-sky-800 dark:text-sky-300 space-y-1">
                  <p className="font-bold text-sm mb-1">Format Kolom yang Dibutuhkan:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><span className="font-semibold">SKU</span> (Wajib): Kode barang sesuai Master Produk.</li>
                    <li><span className="font-semibold">Tipe</span> (Wajib): Diisi <code className="bg-sky-100 dark:bg-sky-900 px-1 rounded">IN</code>, <code className="bg-sky-100 dark:bg-sky-900 px-1 rounded">OUT</code>, atau <code className="bg-sky-100 dark:bg-sky-900 px-1 rounded">SO</code>.</li>
                    <li><span className="font-semibold">Qty</span> (Wajib): Jumlah barang (angka).</li>
                    <li><span className="font-semibold">Lokasi</span> (Opsional): Nama lokasi/rak fisik barang.</li>
                    <li><span className="font-semibold">Keterangan</span> (Opsional): Nomor referensi atau alasan mutasi.</li>
                  </ul>
                  <div className="pt-2">
                    <button 
                      onClick={downloadTemplate}
                      className="text-sky-600 dark:text-sky-400 font-bold hover:underline flex items-center gap-1"
                    >
                      Download Template Excel <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {file && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                  <div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{file.name}</div>
                    <div className="text-xs text-slate-500">
                      {validCount} baris valid, {invalidCount} bermasalah
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setPreviewData([]);
                  }}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Ganti File
                </button>
              </div>

              {/* Table Preview */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#09090b]">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 font-bold text-slate-600 dark:text-slate-400">Status</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 dark:text-slate-400">SKU</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 dark:text-slate-400">Produk</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 dark:text-slate-400">Tipe</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Qty</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 dark:text-slate-400">Lokasi</th>
                        <th className="px-3 py-2.5 font-bold text-slate-600 dark:text-slate-400">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {previewData.map((row, idx) => (
                        <tr key={idx} className={row.isValid ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50' : 'bg-red-50 dark:bg-red-900/10'}>
                          <td className="px-3 py-2">
                            {row.isValid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <div className="flex items-center gap-1 text-red-600 dark:text-red-400" title={row.errorMsg}>
                                <AlertCircle className="w-4 h-4" />
                                <span className="text-[10px] font-bold max-w-[100px] truncate">{row.errorMsg}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-700 dark:text-slate-300">{row.sku}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title={row.productName}>{row.productName || '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              row.tipe === 'IN' ? 'bg-emerald-100 text-emerald-700' :
                              row.tipe === 'OUT' ? 'bg-rose-100 text-rose-700' :
                              row.tipe === 'SO' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {row.tipe}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-bold text-right text-slate-700 dark:text-slate-300">{row.qty}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.lokasi || '-'}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[150px] truncate" title={row.keterangan}>{row.keterangan || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {invalidCount > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg flex gap-2 border border-red-100 dark:border-red-900/50">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>Hanya baris yang valid yang akan diproses. Baris dengan tanda silang akan diabaikan. Pastikan SKU sesuai dengan nama di Master Produk.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleProcess}
            disabled={!file || validCount === 0 || isProcessing}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Proses {validCount} Baris</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
