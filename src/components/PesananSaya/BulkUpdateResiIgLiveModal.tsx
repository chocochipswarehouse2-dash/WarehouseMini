import React, { useState, useRef } from 'react';
import { X, Download, UploadCloud, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import { IGLiveOrder } from '../../types';

interface BulkUpdateResiIgLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: IGLiveOrder[];
  onSaveBatch: (updates: { id: string; newResi: string }[]) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface ParsedResiRow {
  no_pesanan: string;
  newResi: string;
  statusText: string;
  isValid: boolean;
  orderId?: string;
}

export const BulkUpdateResiIgLiveModal: React.FC<BulkUpdateResiIgLiveModalProps> = ({
  isOpen,
  onClose,
  orders,
  onSaveBatch,
  onShowToast,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedResiRow[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    // orders that need resi
    const targetOrders = orders.filter((o) => o.status !== 'batal' && o.status !== 'selesai' && (!o.no_resi || o.no_resi === '-'));
    const listToExport = targetOrders.length > 0 ? targetOrders : orders.filter(o => o.status !== 'batal');

    if (listToExport.length === 0) {
      onShowToast('Tidak ada data pesanan aktif untuk template.', 'warning');
      return;
    }

    const headers = ['No Pesanan', 'Pembeli', 'Ekspedisi', 'No Resi Baru'];
    const rows = listToExport.map((o) => [
      `"${o.no_pesanan}"`,
      `"${o.nama_pembeli}"`,
      `"${o.ekspedisi}"`,
      `""` // Empty string for resi
    ].join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Template_Resi_IGLive_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast('Template CSV berhasil diunduh', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedResiRow[] = [];
        
        results.data.forEach((row: any) => {
          // Identify columns
          const keys = Object.keys(row);
          const noPesananKey = keys.find(k => k.toLowerCase().includes('pesanan')) || keys[0];
          const resiKey = keys.find(k => k.toLowerCase().includes('resi')) || keys[keys.length - 1];

          if (!noPesananKey || !resiKey) return;

          const noPesananRaw = (row[noPesananKey] || '').trim();
          const newResiRaw = (row[resiKey] || '').trim().toUpperCase();

          if (!noPesananRaw) return;

          const matched = orders.find(o => o.no_pesanan.toLowerCase() === noPesananRaw.toLowerCase());
          
          let isValid = false;
          let statusText = '';
          
          if (!matched) {
            statusText = 'Pesanan tidak ditemukan';
          } else if (!newResiRaw || newResiRaw === '-') {
            statusText = 'Resi kosong, diabaikan';
          } else {
            isValid = true;
            statusText = 'Siap diupdate';
          }

          rows.push({
            no_pesanan: noPesananRaw,
            newResi: newResiRaw,
            isValid,
            statusText,
            orderId: matched?.id
          });
        });

        setParsedRows(rows);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: () => {
        onShowToast('Gagal membaca file CSV', 'error');
      }
    });
  };

  const handleSave = () => {
    const validUpdates = parsedRows
      .filter(r => r.isValid && r.orderId && r.newResi)
      .map(r => ({ id: r.orderId!, newResi: r.newResi }));

    if (validUpdates.length === 0) {
      onShowToast('Tidak ada resi valid yang bisa diupdate', 'warning');
      return;
    }

    onSaveBatch(validUpdates);
    onShowToast(`Berhasil menyimpan ${validUpdates.length} resi`, 'success');
    setParsedRows([]);
    setCsvFile(null);
    onClose();
  };

  const validCount = parsedRows.filter(r => r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            Update Resi Massal (IG Live)
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleDownloadTemplate}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 dark:text-blue-300 py-3 rounded-xl font-bold border border-blue-200 dark:border-blue-800 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Template CSV
            </button>
            
            <label className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/40 dark:text-emerald-300 py-3 rounded-xl font-bold border border-emerald-200 dark:border-emerald-800 transition-all cursor-pointer">
              <UploadCloud className="w-4 h-4" />
              Upload CSV Resi
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {parsedRows.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800 p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">
                  Preview Import CSV ({csvFile?.name})
                </span>
                <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">
                  {validCount} baris valid
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900/50">
                    <tr>
                      <th className="p-2 font-bold">No Pesanan</th>
                      <th className="p-2 font-bold">Resi Baru</th>
                      <th className="p-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : 'bg-rose-50/30 dark:bg-rose-900/10'}>
                        <td className="p-2 font-mono">{row.no_pesanan}</td>
                        <td className="p-2 font-mono font-bold text-slate-800 dark:text-slate-200">{row.newResi || '-'}</td>
                        <td className="p-2 flex items-center gap-1">
                          {row.isValid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                          <span className={row.isValid ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
                            {row.statusText}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 font-bold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={validCount === 0}
            className="px-5 py-2.5 font-bold text-white bg-pink-600 rounded-xl hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
          >
            Simpan {validCount} Resi
          </button>
        </div>

      </div>
    </div>
  );
};
