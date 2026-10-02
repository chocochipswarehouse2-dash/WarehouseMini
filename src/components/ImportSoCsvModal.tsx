import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import * as xlsx from 'xlsx';
import { ProductItem } from '../types';
import { processStockOpnameCsvImport } from '../services/supabase';

interface ImportSoCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  productCatalog?: ProductItem[];
  operatorName: string;
  onNotify?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onSuccess?: () => void;
}

interface ParsedSoRow {
  lokasi: string;
  sku: string;
  qty: number;
  keterangan: string;
  productName: string;
  isValid: boolean;
  errorMsg?: string;
}

export const ImportSoCsvModal: React.FC<ImportSoCsvModalProps> = ({
  isOpen,
  onClose,
  productCatalog = [],
  operatorName,
  onNotify,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedSoRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const catalogMap = new Map<string, string>();
  for (const p of productCatalog) {
    if (p && p.k) catalogMap.set(p.k.toUpperCase().trim(), p.p || p.k);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const parseFile = (fileToParse: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = xlsx.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

        if (!jsonData || jsonData.length === 0) {
          if (onNotify) onNotify('File kosong atau format tidak sesuai.', 'error');
          return;
        }

        const rows: ParsedSoRow[] = [];
        for (const row of jsonData) {
          const lokasi = (
            row['LOKASI'] ||
            row['Lokasi'] ||
            row['lokasi'] ||
            row['RAK'] ||
            row['Rak'] ||
            row['rak'] ||
            ''
          ).toString().trim();

          const sku = (
            row['SKU'] ||
            row['Sku'] ||
            row['sku'] ||
            row['KODE'] ||
            row['Kode'] ||
            row['Barcode'] ||
            row['BARCODE'] ||
            ''
          ).toString().trim().toUpperCase();

          const qtyRaw = row['QTY'] || row['Qty'] || row['qty'] || row['JUMLAH'] || row['Jumlah'] || 0;
          const keterangan = (row['KETERANGAN'] || row['Keterangan'] || row['keterangan'] || '').toString().trim();

          if (!sku && !lokasi && !qtyRaw) continue; // Skip blank line

          let isValid = true;
          let errorMsg = '';

          if (!lokasi) {
            isValid = false;
            errorMsg = 'Lokasi wajib diisi';
          }

          if (!sku) {
            isValid = false;
            errorMsg = errorMsg ? `${errorMsg}, SKU wajib diisi` : 'SKU wajib diisi';
          }

          const qty = parseInt(qtyRaw, 10);
          if (isNaN(qty) || qty < 0) {
            isValid = false;
            errorMsg = errorMsg ? `${errorMsg}, Qty tidak valid` : 'Qty harus angka >= 0';
          }

          const productName = catalogMap.get(sku) || sku;

          rows.push({
            lokasi: lokasi || 'Warehouse',
            sku,
            qty: isNaN(qty) ? 0 : qty,
            keterangan,
            productName,
            isValid,
            errorMsg,
          });
        }

        setParsedRows(rows);
        if (rows.length > 0) {
          const invalid = rows.filter((r) => !r.isValid).length;
          if (invalid > 0) {
            if (onNotify) onNotify(`Terbaca ${rows.length} baris, ada ${invalid} baris belum valid.`, 'warning');
          } else {
            if (onNotify) onNotify(`Berhasil membaca ${rows.length} baris data SO fisik.`, 'success');
          }
        }
      } catch (err: any) {
        console.error(err);
        if (onNotify) onNotify('Gagal membaca file CSV/Excel: ' + (err.message || ''), 'error');
      }
    };
    reader.readAsBinaryString(fileToParse);
  };

  const handleDownloadTemplate = () => {
    const ws = xlsx.utils.json_to_sheet([
      {
        'LOKASI': 'DF001',
        'SKU': 'STN451WH',
        'QTY': 1,
        'KETERANGAN': 'SO Fisik Rak DF001',
      },
      {
        'LOKASI': 'DF001',
        'SKU': 'STN501YL',
        'QTY': 1,
        'KETERANGAN': 'SO Fisik Rak DF001',
      },
    ]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Template_SO');
    xlsx.writeFile(wb, 'Template_Input_SO_Fisik.csv');
  };

  const handleProcessImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (!validRows.length) {
      if (onNotify) onNotify('Tidak ada baris data valid untuk diimpor.', 'warning');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await processStockOpnameCsvImport(
        validRows.map((r) => ({
          sku: r.sku,
          qty: r.qty,
          lokasi: r.lokasi,
          keterangan: r.keterangan || 'Hasil Impor CSV SO',
        })),
        operatorName
      );

      if (res.success) {
        if (onNotify) {
          onNotify(
            `Berhasil mengimpor SO Fisik (${res.invoice})! ${res.queueCount} item masuk antrean approval (termasuk rekonsiliasi 0-scan).`,
            'success'
          );
        }
        if (onSuccess) onSuccess();
        onClose();
      } else {
        if (onNotify) onNotify(`Gagal impor SO: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(e.message || 'Terjadi kesalahan sistem saat impor', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;
  const uniqueLocations = Array.from(new Set(parsedRows.map((r) => r.lokasi).filter(Boolean)));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#09090b] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Impor CSV / Excel Stock Opname
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Full Rak
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unggah hasil hitung fisik per lokasi rak. Sistem akan otomatis merekonsiliasi seluruh isi rak.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Blueprint Explanation Banner */}
        <div className="px-4 sm:px-5 py-2.5 bg-sky-50 dark:bg-sky-950/40 border-b border-sky-100 dark:border-sky-900/40 text-xs text-sky-800 dark:text-sky-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="font-semibold">Standar Rekonsiliasi Lokasi (Blueprint WMS):</strong> File ini dianggap
            sebagai fakta fisik lengkap untuk lokasi yang tercantum. Semua SKU di database pada lokasi tersebut yang
            <strong> tidak tercantum di file</strong> otomatis dihitung dengan <strong>Scan Fisik = 0 (ADJ_OUT)</strong>.
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* File Upload Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer transition-all hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {file ? file.name : 'Klik untuk pilih file CSV atau Excel'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Format kolom yang didukung: <code className="font-mono font-bold text-emerald-600">LOKASI, SKU, QTY</code>
            </p>
          </div>

          {/* Action Toolbar (Template Download & Stats) */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Unduh Template CSV</span>
            </button>

            {parsedRows.length > 0 && (
              <div className="flex items-center gap-3 font-semibold">
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {validCount} Valid
                </span>
                {invalidCount > 0 && (
                  <span className="text-red-500 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {invalidCount} Tidak Valid
                  </span>
                )}
                <span className="text-slate-500">
                  {uniqueLocations.length} Lokasi: {uniqueLocations.slice(0, 3).join(', ')}
                  {uniqueLocations.length > 3 ? '...' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                    <tr>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Lokasi</th>
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3">Nama Produk</th>
                      <th className="py-2 px-3 text-right">Qty Fisik</th>
                      <th className="py-2 px-3">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {parsedRows.slice(0, 50).map((row, idx) => (
                      <tr
                        key={idx}
                        className={row.isValid ? 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30' : 'bg-red-50/40 dark:bg-red-950/20 text-red-600'}
                      >
                        <td className="py-2 px-3">
                          {row.isValid ? (
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                          ) : (
                            <span className="text-[10px] font-bold text-red-500" title={row.errorMsg}>
                              Error
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {row.lokasi}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {row.sku}
                        </td>
                        <td className="py-2 px-3 truncate max-w-[180px] text-slate-700 dark:text-slate-300">
                          {row.productName}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {row.qty}
                        </td>
                        <td className="py-2 px-3 text-slate-500 truncate max-w-[120px]">
                          {row.keterangan || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 50 && (
                <div className="py-1.5 px-3 text-center text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
                  Menampilkan 50 dari {parsedRows.length} baris.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isProcessing || validCount === 0}
            onClick={handleProcessImport}
            className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Memproses Rekonsiliasi...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Proses Impor ({validCount} Baris)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
