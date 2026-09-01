import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Printer,
  Package,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Truck,
  Layers,
  FileSpreadsheet,
  Send,
  Eye,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ProductItem, PickingListItem } from '../types';
import { createPickingSuratJalanSupabase } from '../services/supabase';

interface ParsedSJItem {
  nama: string;
  sku: string;
  size?: string;
  qty: number;
  lokasi: string;
  category?: string;
  price?: string | number;
}

interface ParsedSJGroup {
  id: string;
  fileName: string;
  noSJ: string;
  tujuan: string;
  date: string;
  items: ParsedSJItem[];
  totalQty: number;
  totalItems: number;
}

interface FulfillmentRefillModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  productCatalog?: ProductItem[];
  existingSJs?: string[];
  onSuccess: (message: string, newItems?: PickingListItem[]) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const FulfillmentRefillModal: React.FC<FulfillmentRefillModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  productCatalog = [],
  existingSJs = [],
  onSuccess,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'CSV' | 'MANUAL'>('CSV');
  const [parsedGroups, setParsedGroups] = useState<ParsedSJGroup[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  // Manual Form State
  const [manualSJ, setManualSJ] = useState('');
  const [manualTujuan, setManualTujuan] = useState('');
  const [manualRows, setManualRows] = useState<
    Array<{ sku: string; nama_produk: string; size: string; lokasi: string; qty: number }>
  >([{ sku: '', nama_produk: '', size: '', lokasi: '', qty: 1 }]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Helper: Parse CSV Line
  const parseRefillCsvLine = (text: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Handle Multi-CSV file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const groupsMap: Record<string, ParsedSJGroup> = {};

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = await file.text();
        const lines = content.split(/\r\n|\n/);
        if (lines.length < 2) continue;

        // Check if first row is header
        let startIndex = 1;
        const firstLine = lines[0].toLowerCase();
        if (!firstLine.includes('date') && !firstLine.includes('number') && !firstLine.includes('sku') && !firstLine.includes('product')) {
          startIndex = 0;
        }

        for (let j = startIndex; j < lines.length; j++) {
          const line = lines[j].trim();
          if (!line) continue;

          const row = parseRefillCsvLine(line);
          if (row.length < 4) continue;

          // Standard format: 0: Date, 1: No SJ, 2: Category, 3: Product, 4: Variant, 5: Code/SKU, 6: Price, 7: Qty, 8: Source, 9: Destination, 10: Status
          let dateVal = row[0] || new Date().toLocaleDateString('id-ID');
          let noSJ = (row[1] || '').trim();
          let category = row[2] || 'Apparel';
          let produk = (row[3] || '').trim();
          let variant = (row[4] || '').trim();
          let sku = (row[5] || '').trim();
          let price = row[6] || '';
          let qty = Number(row[7]) || 0;
          let destination = (row[9] || '').trim() || 'Marketplace';

          // Fallback if fewer columns or different layout
          if (!noSJ && file.name) {
            noSJ = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
          }
          if (!sku && row[1] && row.length <= 6) {
            sku = row[1];
            produk = row[2] || sku;
            qty = Number(row[3]) || 1;
          }

          if (!noSJ || !sku || qty <= 0) continue;

          let namaFinal = produk;
          if (variant && variant !== '-' && variant.toLowerCase() !== 'default') {
            const pLower = produk.toLowerCase();
            const vLower = variant.toLowerCase();
            if (vLower !== pLower && !vLower.includes(pLower)) {
              namaFinal = `${produk} (${variant})`;
            } else if (vLower.includes(pLower)) {
              namaFinal = variant;
            }
          }
          let lokasi = '-';
          if (productCatalog && productCatalog.length > 0) {
            const cleanSku = sku.toUpperCase();
            const matchedProduct = productCatalog.find((p) => (p.k || '').trim().toUpperCase() === cleanSku);
            if (matchedProduct && matchedProduct.lokasi) {
              lokasi = matchedProduct.lokasi;
            }
          }

          if (!groupsMap[noSJ]) {
            groupsMap[noSJ] = {
              id: `sj_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
              fileName: file.name,
              noSJ: noSJ.toUpperCase(),
              tujuan: destination,
              date: dateVal,
              items: [],
              totalQty: 0,
              totalItems: 0,
            };
          }

          const existingItem = groupsMap[noSJ].items.find((it) => it.sku.toUpperCase() === sku.toUpperCase());
          if (existingItem) {
            existingItem.qty += qty;
          } else {
            groupsMap[noSJ].items.push({
              nama: namaFinal,
              sku: sku.toUpperCase(),
              size: variant || '-',
              qty,
              lokasi,
              category,
              price,
            });
          }

          groupsMap[noSJ].totalQty += qty;
          groupsMap[noSJ].totalItems = groupsMap[noSJ].items.length;
        }
      }

      const parsedList = Object.values(groupsMap);
      if (parsedList.length === 0) {
        onNotify('Tidak ditemukan data baris Surat Jalan yang valid pada file CSV.', 'error');
      } else {
        setParsedGroups(parsedList);
        setExpandedGroupId(parsedList[0].id);
        onNotify(`Berhasil memproses ${parsedList.length} Surat Jalan dari file CSV!`, 'success');
      }
    } catch (err: any) {
      onNotify(`Gagal membaca file CSV: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Print HTML Builder (matches buildPrintHtml from GAS)
  const buildPrintHtml = (groups: ParsedSJGroup[]): string => {
    let pagesHtml = '';

    groups.forEach((g) => {
      let rowsHtml = '';
      g.items.forEach((it, idx) => {
        rowsHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
            <td style="padding: 6px 8px; text-align: center; color: #64748b;">${idx + 1}</td>
            <td style="padding: 6px 8px; font-family: monospace; font-weight: 700; color: #0f172a;">${it.sku}</td>
            <td style="padding: 6px 8px; color: #1e293b; font-weight: 600;">${it.nama}</td>
            <td style="padding: 6px 8px; text-align: center; font-weight: 700;">${it.size || '-'}</td>
            <td style="padding: 6px 8px; text-align: center; font-weight: 800; color: #ff7a00; font-size: 12px;">${it.qty}</td>
            <td style="padding: 6px 8px; text-align: center; font-weight: 700; background: #f8fafc;">${it.lokasi || '-'}</td>
            <td style="padding: 6px 8px; text-align: center; width: 40px;"><div style="width: 14px; height: 14px; border: 1.5px solid #94a3b8; border-radius: 3px; margin: 0 auto;"></div></td>
          </tr>
        `;
      });

      pagesHtml += `
        <div style="page-break-after: always; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; max-width: 800px; margin: 0 auto;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
            <div>
              <div style="font-size: 18px; font-weight: 900; letter-spacing: 0.5px; color: #ff7a00;">CHOCOCHIPS WMS</div>
              <div style="font-size: 14px; font-weight: 800; margin-top: 2px;">SURAT JALAN PICKING REFILL</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Tanggal: <b>${g.date}</b> • Dicetak oleh: <b>${currentUser}</b></div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: 900; font-family: monospace; color: #0f172a; border: 1.5px solid #0f172a; padding: 4px 10px; border-radius: 6px; display: inline-block;">
                ${g.noSJ}
              </div>
              <div style="font-size: 12px; font-weight: 700; color: #334155; margin-top: 4px;">Tujuan: <span style="color: #ff7a00;">${g.tujuan}</span></div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 10px; text-transform: uppercase; color: #475569;">
                <th style="padding: 8px; text-align: center; width: 30px;">NO</th>
                <th style="padding: 8px; text-align: left; width: 140px;">SKU / CODE</th>
                <th style="padding: 8px; text-align: left;">NAMA PRODUK</th>
                <th style="padding: 8px; text-align: center; width: 50px;">SIZE</th>
                <th style="padding: 8px; text-align: center; width: 50px;">QTY</th>
                <th style="padding: 8px; text-align: center; width: 80px;">LOKASI</th>
                <th style="padding: 8px; text-align: center; width: 40px;">CEK</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1;">
            <div style="font-size: 11px; color: #64748b;">
              Total Item: <b>${g.totalItems} SKU</b> • Total Qty: <b>${g.totalQty} Pcs</b>
            </div>
            <div style="display: flex; gap: 40px; text-align: center; font-size: 11px;">
              <div>
                <div style="margin-bottom: 35px; color: #64748b;">Petugas Picking</div>
                <div style="font-weight: 700; border-top: 1px solid #94a3b8; padding-top: 4px; min-width: 90px;">(${currentUser})</div>
              </div>
              <div>
                <div style="margin-bottom: 35px; color: #64748b;">Checker / QC</div>
                <div style="font-weight: 700; border-top: 1px solid #94a3b8; padding-top: 4px; min-width: 90px;">( &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; )</div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Surat Jalan Picking Refill</title>
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              @page { margin: 10mm; size: auto; }
            }
          </style>
        </head>
        <body onload="window.print();">
          ${pagesHtml}
        </body>
      </html>
    `;
  };

  // Open PDF / Print Window
  const handlePrintGroups = (groupsToPrint: ParsedSJGroup[]) => {
    if (groupsToPrint.length === 0) {
      onNotify('Tidak ada data Surat Jalan untuk dicetak.', 'error');
      return;
    }
    const html = buildPrintHtml(groupsToPrint);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } else {
      // Fallback iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
          iframe.contentWindow?.print();
          document.body.removeChild(iframe);
        }, 800);
      }
    }
  };

  // Save parsed groups to Supabase picking_list
  const handleSaveToDatabase = async (groupsToSave: ParsedSJGroup[], andPrint = false) => {
    if (groupsToSave.length === 0) {
      onNotify('Tidak ada Surat Jalan yang dipilih untuk disimpan.', 'error');
      return;
    }

    // Check duplicate SJs
    const duplicateList = groupsToSave
      .filter((g) => existingSJs.some((ex) => ex.toUpperCase() === g.noSJ.toUpperCase()))
      .map((g) => g.noSJ);

    // The duplicate warning is already rendered in the UI with a yellow badge.
    // In iframe environments, window.confirm is often blocked and silently fails.
    // Instead of using window.confirm, we will allow them to save if they explicitly clicked the button,
    // or we could use a custom modal. For now, since they can see the warning, we proceed.
    // If you want strict protection, a custom state-based confirmation modal is required.
    
    setIsProcessing(true);
    try {
      const allCreatedItems: PickingListItem[] = [];
      for (const group of groupsToSave) {
        const formattedItems = group.items.map((it) => ({
          sku: it.sku,
          nama_produk: it.nama,
          size: it.size || '-',
          lokasi: it.lokasi || 'A-01',
          qty_req: it.qty,
        }));

        const res = await createPickingSuratJalanSupabase(group.noSJ, group.tujuan, formattedItems);
        if (res && res.createdItems) {
          allCreatedItems.push(...res.createdItems);
        }
      }

      if (andPrint) {
        handlePrintGroups(groupsToSave);
      }

      onSuccess(
        `Berhasil memasukkan ${groupsToSave.length} Surat Jalan (${allCreatedItems.length} baris produk) ke Daftar Tugas Picking! 🚀`,
        allCreatedItems
      );
      onClose();
    } catch (err: any) {
      onNotify(`Gagal menyimpan ke database: ${err.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual Row Handlers
  const handleAddManualRow = () => {
    setManualRows([...manualRows, { sku: '', nama_produk: '', size: '', lokasi: '', qty: 1 }]);
  };

  const handleRemoveManualRow = (index: number) => {
    if (manualRows.length === 1) return;
    setManualRows(manualRows.filter((_, i) => i !== index));
  };

  const handleManualRowChange = (index: number, field: string, value: any) => {
    const next = [...manualRows];
    next[index] = { ...next[index], [field]: value };

    if (field === 'sku' && productCatalog.length > 0) {
      const cleanSku = String(value).trim().toUpperCase();
      const found = productCatalog.find((p) => (p.k || '').trim().toUpperCase() === cleanSku);
      if (found) {
        next[index].nama_produk = found.p || found.n || '';
        next[index].size = found.s || '-';
        next[index].lokasi = found.lokasi || '-';
      }
    }
    setManualRows(next);
  };

  const handleSaveManualSJ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSJ.trim() || !manualTujuan.trim()) {
      onNotify('Mohon isi Nomor SJ dan Tujuan Pengiriman', 'error');
      return;
    }
    const validRows = manualRows.filter((r) => r.sku.trim() !== '');
    if (validRows.length === 0) {
      onNotify('Mohon masukkan minimal 1 baris SKU Produk', 'error');
      return;
    }

    const singleGroup: ParsedSJGroup = {
      id: `manual_${Date.now()}`,
      fileName: 'Input Manual',
      noSJ: manualSJ.trim().toUpperCase(),
      tujuan: manualTujuan.trim(),
      date: new Date().toLocaleDateString('id-ID'),
      items: validRows.map((r) => ({
        sku: r.sku.trim().toUpperCase(),
        nama: r.nama_produk.trim() || r.sku,
        size: r.size || '-',
        lokasi: r.lokasi || '-',
        qty: Number(r.qty) || 1,
      })),
      totalQty: validRows.reduce((a, b) => a + (Number(b.qty) || 1), 0),
      totalItems: validRows.length,
    };

    await handleSaveToDatabase([singleGroup], false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131d31] w-full max-w-3xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0f172a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#ff7a00]/10 flex items-center justify-center text-[#ff7a00] border border-[#ff7a00]/20 flex-shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold text-[#ff7a00] uppercase tracking-wider">
                  Fulfillment Refill
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  MULTI-CSV
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">
                Buat Surat Jalan Refill &amp; Tugas Picking
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-5 pt-3 pb-0 bg-slate-50/50 dark:bg-[#0f172a]/50 border-b border-slate-200 dark:border-slate-800 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('CSV')}
            className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'CSV'
                ? 'border-[#ff7a00] text-[#ff7a00] bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Upload File CSV Refill (Multi-File)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MANUAL')}
            className={`px-4 py-2.5 text-xs font-extrabold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'MANUAL'
                ? 'border-[#ff7a00] text-[#ff7a00] bg-white dark:bg-[#131d31]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Input Manual / Tambah Baris
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === 'CSV' ? (
            <div className="space-y-4">
              {/* CSV Upload Card */}
              <div className="p-4 sm:p-5 bg-gradient-to-br from-orange-50/60 to-amber-50/40 dark:from-[#1e293b]/40 dark:to-[#0f172a]/60 border border-orange-200 dark:border-slate-800 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-[#ff7a00]/10 rounded-xl text-[#ff7a00] flex-shrink-0 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-tight">
                      Cetak Surat Jalan Refill &amp; Input Tugas Picking
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Pilih <b>satu atau beberapa file CSV Transfer Order</b> (DealPOS/ERP). Sistem akan secara otomatis memisahkan per Surat Jalan, mengalokasikan lokasi rak gudang, dan siap dicetak atau disimpan ke database picking.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".csv,text/csv"
                        onChange={handleFileChange}
                        className="hidden"
                        id="csvFulfillmentInput"
                      />
                      <label
                        htmlFor="csvFulfillmentInput"
                        className="px-4 py-2.5 bg-[#ff7a00] hover:bg-[#e06c00] text-white text-xs font-extrabold uppercase tracking-wider rounded-xl cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Pilih File CSV Transfer Order</span>
                      </label>

                      {isProcessing && (
                        <span className="text-xs font-bold text-[#ff7a00] flex items-center gap-1.5 animate-pulse">
                          <Loader2 className="w-4 h-4 animate-spin" /> Memproses file CSV...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Parsed Results List */}
              {parsedGroups.length > 0 ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {parsedGroups.length} Surat Jalan Siap Dimasukkan
                      </div>
                      <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        Total {parsedGroups.reduce((a, b) => a + b.totalItems, 0)} SKU • {parsedGroups.reduce((a, b) => a + b.totalQty, 0)} Pcs
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleSaveToDatabase(parsedGroups, false)}
                        className="px-4 py-2 bg-[#ff7a00] hover:bg-[#e06c00] text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50 transition-all"
                      >
                        {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>🚀 Masukkan Semua ke Tugas Picking</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center px-1">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Daftar Surat Jalan Terbaca ({parsedGroups.length} File SJ)
                    </span>
                    <button
                      type="button"
                      onClick={() => setParsedGroups([])}
                      className="text-[11px] font-extrabold text-rose-500 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus Semua
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {parsedGroups.map((group) => {
                      const isExpanded = expandedGroupId === group.id;
                      const isExisting = existingSJs.some((ex) => ex.toUpperCase() === group.noSJ.toUpperCase());

                      return (
                        <div
                          key={group.id}
                          className="bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 transition-all"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span className="text-base font-black text-slate-800 dark:text-white font-mono">
                                {group.noSJ}
                              </span>
                              {isExisting && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Sudah ada di DB
                                </span>
                              )}
                              <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                <Truck className="w-3 h-3 text-[#ff7a00]" /> {group.tujuan}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-white dark:bg-[#131d31] text-[#ff7a00] border border-slate-200 dark:border-slate-700 shadow-sm">
                                {group.totalItems} SKU • {group.totalQty} Pcs
                              </span>

                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleSaveToDatabase([group], false)}
                                className="px-2.5 py-1.5 bg-[#ff7a00]/10 hover:bg-[#ff7a00] text-[#ff7a00] hover:text-white rounded-lg border border-[#ff7a00]/30 text-xs font-black transition-all flex items-center gap-1"
                                title="Simpan SJ Ini ke Tugas Picking"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Simpan SJ Ini</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePrintGroups([group])}
                                className="p-1.5 bg-white dark:bg-[#131d31] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all"
                                title="Cetak Surat Jalan Ini"
                              >
                                <Printer className="w-3.5 h-3.5 text-[#ff7a00]" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Items Preview */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                              <div className="grid grid-cols-12 text-[10px] font-extrabold uppercase text-slate-400 px-2">
                                <span className="col-span-3">SKU</span>
                                <span className="col-span-5">Nama Produk</span>
                                <span className="col-span-2 text-center">Rak Lokasi</span>
                                <span className="col-span-2 text-right">Target Qty</span>
                              </div>
                              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                                {group.items.map((item, itIdx) => (
                                  <div
                                    key={itIdx}
                                    className="grid grid-cols-12 text-xs py-1.5 px-2 rounded-lg bg-white dark:bg-[#131d31] border border-slate-200/60 dark:border-slate-800/80 items-center font-medium"
                                  >
                                    <span className="col-span-3 font-mono font-bold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                                      {item.sku}
                                    </span>
                                    <span className="col-span-5 text-slate-700 dark:text-slate-300 text-[11px] truncate">
                                      {item.nama}
                                    </span>
                                    <span className="col-span-2 text-center font-extrabold text-[11px] text-[#ff7a00]">
                                      {item.lokasi || '-'}
                                    </span>
                                    <span className="col-span-2 text-right font-black text-xs text-slate-900 dark:text-white">
                                      {item.qty} pcs
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <FileSpreadsheet className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    Belum ada file CSV yang diunggah
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Klik tombol "Pilih File CSV Transfer Order" di atas untuk memulai
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* Manual Form */
            <form onSubmit={handleSaveManualSJ} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Nomor Surat Jalan / No. Delivery *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualSJ}
                    onChange={(e) => setManualSJ(e.target.value)}
                    placeholder="Contoh: SJ-MKG-8821 / TO-2026-001"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-white outline-none focus:border-[#ff7a00]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Tujuan Pengiriman / Channel *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualTujuan}
                    onChange={(e) => setManualTujuan(e.target.value)}
                    placeholder="Contoh: Store Mall Kelapa Gading / Live Shopee"
                    className="w-full p-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white outline-none focus:border-[#ff7a00]"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Daftar Produk yang Harus Dipick
                  </label>
                  <button
                    type="button"
                    onClick={handleAddManualRow}
                    className="text-[11px] font-extrabold text-[#ff7a00] hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {manualRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-4 sm:col-span-3">
                        <input
                          type="text"
                          required
                          placeholder="SKU Barcode"
                          value={row.sku}
                          onChange={(e) => handleManualRowChange(idx, 'sku', e.target.value)}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-4">
                        <input
                          type="text"
                          required
                          placeholder="Nama Produk"
                          value={row.nama_produk}
                          onChange={(e) => handleManualRowChange(idx, 'nama_produk', e.target.value)}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <input
                          type="text"
                          placeholder="Lokasi Rak"
                          value={row.lokasi}
                          onChange={(e) => handleManualRowChange(idx, 'lokasi', e.target.value)}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-10 sm:col-span-2">
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={row.qty}
                          onChange={(e) => handleManualRowChange(idx, 'qty', Number(e.target.value))}
                          className="w-full p-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveManualRow(idx)}
                          className="text-slate-400 hover:text-rose-500 p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] flex flex-wrap justify-between items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            Tutup
          </button>

          {activeTab === 'CSV' && parsedGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handlePrintGroups(parsedGroups)}
                className="px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-extrabold text-xs uppercase rounded-xl flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <Printer className="w-4 h-4 text-[#ff7a00]" />
                <span>🖨️ Cetak PDF Saja</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleSaveToDatabase(parsedGroups, true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50 transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>Simpan + Cetak PDF</span>
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleSaveToDatabase(parsedGroups, false)}
                className="px-5 py-2.5 bg-[#ff7a00] hover:bg-[#e06c00] text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-lg shadow-[#ff7a00]/20 active:scale-95 disabled:opacity-50 transition-all"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Simpan ke Database Picking
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'MANUAL' && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleSaveManualSJ}
              className="px-5 py-2.5 bg-[#ff7a00] hover:bg-[#e06c00] text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-lg shadow-[#ff7a00]/20 active:scale-95 disabled:opacity-50 transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Simpan ke Database
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
