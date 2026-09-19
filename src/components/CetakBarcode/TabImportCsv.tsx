import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  ClipboardPaste,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProductItem } from '../../types';
import {
  ProductBarcodeItem,
  getProductMasterPrice,
  parseRawPrice,
  isRealSize,
  formatProductPriceWithTag,
} from './types';

interface TabImportCsvProps {
  catalogMap: Map<string, ProductItem>;
  onAddMultipleToQueue: (items: Omit<ProductBarcodeItem, 'id' | 'selected'>[]) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const TabImportCsv: React.FC<TabImportCsvProps> = ({
  catalogMap,
  onAddMultipleToQueue,
  onShowToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteText, setPasteText] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreviewList, setImportPreviewList] = useState<Omit<ProductBarcodeItem, 'id' | 'selected'>[]>([]);

  // 1. Download Template CSV
  const handleDownloadCsvTemplate = () => {
    const csvContent =
      'SKU,Qty,Nama Produk,Size,Harga,Lokasi\n' +
      'TSH-BLK-S,10,Kaos Polos Hitam,S,150000,A-01\n' +
      'TSH-BLK-M,15,Kaos Polos Hitam,M,150000,A-01\n' +
      'TSH-BLK-L,20,Kaos Polos Hitam,L,150000,A-01\n' +
      'DRS-WHT-ALL,5,Maxi Dress Broken White,All Size,285000,B-03\n' +
      'PNT-DNM-XL,8,Taylor Pants Denim,XL,220000,C-05\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_cetak_barcode_produk.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast?.('Template CSV berhasil diunduh.', 'success');
  };

  // 2. Download Template XLSX
  const handleDownloadExcelTemplate = () => {
    const data = [
      ['SKU', 'Qty', 'Nama Produk', 'Size', 'Harga', 'Lokasi'],
      ['TSH-BLK-S', 10, 'Kaos Polos Hitam', 'S', 150000, 'A-01'],
      ['TSH-BLK-M', 15, 'Kaos Polos Hitam', 'M', 150000, 'A-01'],
      ['TSH-BLK-L', 20, 'Kaos Polos Hitam', 'L', 150000, 'A-01'],
      ['DRS-WHT-ALL', 5, 'Maxi Dress Broken White', 'All Size', 285000, 'B-03'],
      ['PNT-DNM-XL', 8, 'Taylor Pants Denim', 'XL', 220000, 'C-05'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BarcodeTemplate');
    XLSX.writeFile(wb, 'template_cetak_barcode_produk.xlsx');
    onShowToast?.('Template Excel (.xlsx) berhasil diunduh.', 'success');
  };

  // Process Parsed Rows
  const processImportRows = (rows: any[]) => {
    if (!rows || rows.length === 0) {
      onShowToast?.('File kosong atau tidak ada data yang terbaca.', 'warning');
      return;
    }

    const parsedItems: Omit<ProductBarcodeItem, 'id' | 'selected'>[] = [];

    rows.forEach((row) => {
      // Find key mappings case-insensitively
      const keys = Object.keys(row);
      const getVal = (candidates: string[]) => {
        for (const cand of candidates) {
          const matchedKey = keys.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cand.toLowerCase());
          if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
            return String(row[matchedKey]).trim();
          }
        }
        return '';
      };

      const sku = getVal(['sku', 'kodesku', 'kode', 'barcode', 'itemcode', 'item_code']);
      if (!sku) return;

      const qtyVal = getVal(['qty', 'jumlah', 'stiker', 'copies', 'count', 'quantity', 'total']);
      const parsedQty = Math.max(1, parseInt(qtyVal, 10) || 1);

      const catalogHit = catalogMap.get(sku.toLowerCase());

      const rawNama = getVal(['namaproduk', 'nama', 'productname', 'title', 'itemname', 'deskripsi']);
      const finalNama = rawNama || (catalogHit ? String(catalogHit.n || catalogHit.p || catalogHit.nama_produk || '') : sku);

      const rawSize = getVal(['size', 'ukuran', 'sz', 'varian']);
      const finalSize = isRealSize(rawSize)
        ? rawSize
        : catalogHit && isRealSize(catalogHit.s || catalogHit.size)
        ? String(catalogHit.s || catalogHit.size).trim()
        : '';

      const rawPrice = getVal(['harga', 'price', 'tagprice', 'masterprice', 'hargaproduk']);
      const parsedPrice = parseRawPrice(rawPrice);
      const masterPrice = getProductMasterPrice(catalogHit);
      const finalPrice = parsedPrice > 0 ? parsedPrice : masterPrice > 0 ? masterPrice : undefined;

      const rawLokasi = getVal(['lokasi', 'rak', 'bin', 'location', 'lokasirak']);
      const finalLokasi = rawLokasi || (catalogHit ? String(catalogHit.lokasi || '') : '');

      parsedItems.push({
        sku,
        nama: finalNama,
        size: finalSize,
        price: finalPrice,
        lokasi: finalLokasi,
        copies: parsedQty,
      });
    });

    if (parsedItems.length === 0) {
      onShowToast?.('Tidak ditemukan kolom SKU valid pada data import.', 'error');
      return;
    }

    setImportPreviewList(parsedItems);
    setIsImportModalOpen(true);
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const jsonData = XLSX.utils.sheet_to_json(ws);
        processImportRows(jsonData);
      } catch (err) {
        console.error('File parse error:', err);
        onShowToast?.('Gagal membaca file Excel/CSV. Pastikan format valid.', 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Handle Clipboard Paste Text
  const handleProcessPasteText = () => {
    if (!pasteText.trim()) return;

    const lines = pasteText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const parsedRows: any[] = [];

    lines.forEach((line) => {
      // Split by tab or multiple spaces or comma
      const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : line.includes(',') ? ',' : /\s{2,}/;
      const parts = line.split(delimiter).map((p) => p.trim());
      if (parts.length === 0 || !parts[0]) return;

      parsedRows.push({
        sku: parts[0],
        qty: parts[1] || '1',
        nama: parts[2] || '',
        size: parts[3] || '',
        harga: parts[4] || '',
        lokasi: parts[5] || '',
      });
    });

    processImportRows(parsedRows);
  };

  // Commit Preview List
  const handleCommitImport = () => {
    onAddMultipleToQueue(importPreviewList);
    const totalCopies = importPreviewList.reduce((acc, i) => acc + (i.copies || 1), 0);
    onShowToast?.(`Berhasil mengimpor ${importPreviewList.length} SKU (${totalCopies} stiker)`, 'success');
    setIsImportModalOpen(false);
    setPasteText('');
    setImportPreviewList([]);
  };

  return (
    <div className="space-y-4">
      {/* 1. Drag & Drop File Box */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-purple-300 dark:border-purple-800/80 hover:border-purple-500 dark:hover:border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 rounded-2xl p-6 text-center cursor-pointer transition-all group"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          className="hidden"
        />
        <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 mx-auto flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <div className="font-black text-sm text-slate-900 dark:text-white">
          Pilih File Spreadsheet (Excel .xlsx, .xls atau .csv)
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          Kolom otomatis terdeteksi: <b>SKU</b>, <b>Qty</b> (Jumlah Stiker), <b>Nama Produk</b>, <b>Size</b>, <b>Harga</b>, dan <b>Lokasi</b>.
        </p>
        <div className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 rounded-xl text-xs font-bold text-purple-600 dark:text-purple-400 shadow-2xs">
          <Upload className="w-3.5 h-3.5" />
          <span>Upload File dari Komputer / HP</span>
        </div>
      </div>

      {/* 2. Download Templates Box */}
      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <span className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Download className="w-4 h-4 text-purple-600" />
          Template Format Import Tersedia:
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadCsvTemplate}
            className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 rounded-lg font-black flex items-center gap-1.5 hover:bg-blue-100 transition-colors cursor-pointer text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Template .CSV</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadExcelTemplate}
            className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg font-black flex items-center gap-1.5 hover:bg-emerald-100 transition-colors cursor-pointer text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Template .XLSX</span>
          </button>
        </div>
      </div>

      {/* 3. Quick Paste Text Area */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <ClipboardPaste className="w-4 h-4 text-purple-600" />
            <span>Atau Paste Salinan Tabel dari Excel / Spreadsheet:</span>
          </label>
          <button
            type="button"
            onClick={() => setPasteText('')}
            className="text-[10px] text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
          >
            Bersihkan
          </button>
        </div>
        <textarea
          rows={3}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Contoh format per baris:&#10;TSH-BLK-M    10    Kaos Hitam    M    150000    A-01&#10;TSH-BLK-L    15    Kaos Hitam    L    150000    A-01"
          className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleProcessPasteText}
            disabled={!pasteText.trim()}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            Proses Teks Clipboard
          </button>
        </div>
      </div>

      {/* 4. IMPORT PREVIEW MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-600" />
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Pratinjau Hasil Import ({importPreviewList.length} SKU)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl text-xs flex items-center justify-between">
                <div>
                  <span className="font-black text-purple-950 dark:text-purple-200">
                    {importPreviewList.length} SKU Terverifikasi
                  </span>{' '}
                  <span className="text-purple-700 dark:text-purple-300">
                    (Total {importPreviewList.reduce((acc, i) => acc + (i.copies || 1), 0)} lembar stiker)
                  </span>
                </div>
                <span className="text-[11px] text-purple-600 font-bold">
                  Diperkaya Master Katalog
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-black text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Nama Produk</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3">Harga</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {importPreviewList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-bold font-mono text-slate-900 dark:text-white">
                          {item.sku}
                        </td>
                        <td className="py-2 px-3 truncate max-w-[180px]">{item.nama}</td>
                        <td className="py-2 px-3">{item.size || '-'}</td>
                        <td className="py-2 px-3 font-bold text-purple-700 dark:text-purple-300">
                          {item.price ? `Rp ${new Intl.NumberFormat('id-ID').format(item.price)}` : '-'}
                        </td>
                        <td className="py-2 px-3 text-center font-black text-purple-600">
                          {item.copies}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Masukkan ke Antrean Cetak</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
