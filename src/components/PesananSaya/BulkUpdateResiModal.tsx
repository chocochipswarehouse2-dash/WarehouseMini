import React, { useState, useMemo } from 'react';
import {
  X,
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Save,
  Package,
  Scissors,
  Truck,
  ArrowRight,
  FileText,
  Copy,
  Check,
  Filter,
  Sparkles,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { ManualShipmentOrder } from '../../types';
import { bulkUpdateShipmentResi, BulkResiUpdateItem } from '../../services/gasManualShipment';

interface BulkUpdateResiModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: ManualShipmentOrder[];
  onSuccess: (updatedCount: number) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface CsvParsedRow {
  rawOrderRef: string;
  orderId: string;
  matchedOrder?: ManualShipmentOrder;
  oldResi: string;
  newResi: string;
  statusText: string;
  isValid: boolean;
  matchType: 'exact_no_pesanan' | 'exact_order_id_customer' | 'not_found';
}

export const BulkUpdateResiModal: React.FC<BulkUpdateResiModalProps> = ({
  isOpen,
  onClose,
  orders,
  onSuccess,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'table' | 'csv'>('table');
  const [filterMode, setFilterMode] = useState<'no_resi_only' | 'all'>('no_resi_only');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoMarkAsShipped, setAutoMarkAsShipped] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Table direct edit state: map of order.no_pesanan -> new resi string
  const [tableResiInputs, setTableResiInputs] = useState<Record<string, string>>({});
  
  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvFileName, setCsvFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<CsvParsedRow[]>([]);
  const [csvParseErrors, setCsvParseErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Quick paste text state
  const [quickPasteText, setQuickPasteText] = useState('');
  const [showQuickPaste, setShowQuickPaste] = useState(false);

  // Filter orders for direct table editing
  const filteredTableOrders = useMemo(() => {
    return orders.filter((o) => {
      // Exclude purely cancelled orders if not needed
      if (o.status === 'batal') return false;

      // Filter no resi only
      if (filterMode === 'no_resi_only') {
        const hasResi = (o.no_resi || '').trim().length > 0;
        if (hasResi) return false;
      }

      // Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchNoPesanan = (o.no_pesanan || '').toLowerCase().includes(q);
        const matchCustomerOrderId = (o.no_transaksi_customer || '').toLowerCase().includes(q);
        const matchNamaTujuan = (o.nama_tujuan || '').toLowerCase().includes(q);
        const matchNamaPengirim = (o.nama_pengirim || '').toLowerCase().includes(q);
        const matchJasaKirim = (o.jasa_kirim || '').toLowerCase().includes(q);
        const matchNoResi = (o.no_resi || '').toLowerCase().includes(q);
        return matchNoPesanan || matchCustomerOrderId || matchNamaTujuan || matchNamaPengirim || matchJasaKirim || matchNoResi;
      }

      return true;
    });
  }, [orders, filterMode, searchTerm]);

  // Count orders without resi
  const unassignedCount = useMemo(() => {
    return orders.filter((o) => o.status !== 'batal' && !(o.no_resi || '').trim()).length;
  }, [orders]);

  // Count changed inputs in table mode
  const changedInputsCount = useMemo(() => {
    let count = 0;
    Object.entries(tableResiInputs).forEach(([no_pesanan, val]) => {
      const trimmed = val.trim();
      if (!trimmed) return;
      const original = orders.find((o) => o.no_pesanan === no_pesanan);
      if (original && (original.no_resi || '').trim() !== trimmed) {
        count++;
      }
    });
    return count;
  }, [tableResiInputs, orders]);

  if (!isOpen) return null;

  // Handle direct table resi change
  const handleTableResiChange = (no_pesanan: string, value: string) => {
    setTableResiInputs((prev) => ({
      ...prev,
      [no_pesanan]: value.toUpperCase(),
    }));
  };

  // Quick Paste Handler: paste multi-line resis to fill empty inputs sequentially
  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;
    const lines = quickPasteText
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      onShowToast('Tidak ada nomor resi yang terdeteksi dari teks yang ditempel.', 'warning');
      return;
    }

    const newInputs = { ...tableResiInputs };
    let filledCount = 0;

    filteredTableOrders.forEach((order, index) => {
      if (index < lines.length) {
        newInputs[order.no_pesanan] = lines[index].toUpperCase();
        filledCount++;
      }
    });

    setTableResiInputs(newInputs);
    setQuickPasteText('');
    setShowQuickPaste(false);
    onShowToast(`Berhasil memasukkan ${filledCount} nomor resi secara berurutan!`, 'success');
  };

  // Submit direct table edits
  const handleSaveTableResi = async () => {
    const updateList: BulkResiUpdateItem[] = [];

    Object.entries(tableResiInputs).forEach(([no_pesanan, newResiRaw]) => {
      const newResi = newResiRaw.trim();
      if (!newResi) return;

      const order = orders.find((o) => o.no_pesanan === no_pesanan);
      if (!order) return;

      // Only update if changed
      if ((order.no_resi || '').trim() !== newResi) {
        updateList.push({
          id: order.id,
          no_pesanan: order.no_pesanan,
          no_resi: newResi,
          update_status_to_dikirim: autoMarkAsShipped,
        });
      }
    });

    if (updateList.length === 0) {
      onShowToast('Tidak ada perubahan nomor resi yang perlu disimpan.', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bulkUpdateShipmentResi(updateList);
      if (result.successCount > 0) {
        onShowToast(`Berhasil memperbarui ${result.successCount} nomor resi pesanan!`, 'success');
        onSuccess(result.successCount);
        onClose();
      } else {
        onShowToast(`Gagal memperbarui resi: ${result.errors.join(', ')}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`Terjadi kesalahan: ${err?.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // CSV TEMPLATE GENERATOR & DOWNLOAD
  // -------------------------------------------------------------
  const handleDownloadTemplate = () => {
    // Collect target orders: by default all orders without resi, or currently filtered
    const targetOrders = orders.filter((o) => o.status !== 'batal' && !(o.no_resi || '').trim());
    const ordersToExport = targetOrders.length > 0 ? targetOrders : orders.filter((o) => o.status !== 'batal');

    if (ordersToExport.length === 0) {
      onShowToast('Tidak ada data pesanan untuk dibuatkan template.', 'warning');
      return;
    }

    // Standard CSV headers matching requirements
    const headers = [
      'No Pesanan (Jangan Diubah)',
      'Order ID Customer',
      'Tanggal Dibuat',
      'Store Pengirim',
      'PIC Store',
      'Nama Penerima',
      'No Telp Penerima',
      'Alamat Tujuan',
      'Jasa Kirim',
      'No Resi (Wajib Diisi Admin)',
      'Ada Alteration',
      'Status Saat Ini',
    ];

    const escapeCsv = (val: string | number | undefined | null) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = ordersToExport.map((o) => {
      const hasAlter = (o.items || []).some(
        (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter
      ) || o.order_type === 'alteration_repair';

      const itemsSummary = (o.items || []).map((it) => `${it.sku || it.nama_produk} (x${it.qty})`).join('; ');

      return [
        escapeCsv(o.no_pesanan),
        escapeCsv(o.no_transaksi_customer || o.no_pesanan),
        escapeCsv(o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID') : ''),
        escapeCsv(o.nama_pengirim || ''),
        escapeCsv(o.pic_store || ''),
        escapeCsv(o.nama_tujuan || ''),
        escapeCsv(o.no_telp_tujuan || ''),
        escapeCsv(o.alamat_tujuan || ''),
        escapeCsv(o.jasa_kirim || ''),
        escapeCsv(o.no_resi || ''), // Admin will fill this column
        escapeCsv(hasAlter ? 'YA (ALTER)' : 'TIDAK'),
        escapeCsv(o.status || 'diterima'),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Template_Update_Resi_ManualShipment_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onShowToast(`Template CSV berhasil diunduh (${ordersToExport.length} pesanan)!`, 'success');
  };

  // -------------------------------------------------------------
  // CSV FILE PARSER & PREVIEW
  // -------------------------------------------------------------
  const parseCsvText = (text: string) => {
    const lines = text
      .split(/\r\n|\n|\r/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      setCsvParseErrors(['File CSV kosong atau hanya berisi baris judul.']);
      setParsedRows([]);
      return;
    }

    // Detect delimiter (, or ;)
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';

    // Parse header
    const rawHeaders = splitCsvLine(firstLine, delimiter).map((h) => h.toLowerCase().trim().replace(/^[\uFEFF"']|["']$/g, ''));

    // Find column indexes
    let noPesananIdx = rawHeaders.findIndex(
      (h) => h.includes('no pesanan') || h.includes('no_pesanan') || h.includes('nopesanan') || h === 'id' || h === 'order id'
    );
    let orderIdCustomerIdx = rawHeaders.findIndex(
      (h) => h.includes('order id customer') || h.includes('no_transaksi_customer') || h.includes('transaksi customer')
    );
    let noResiIdx = rawHeaders.findIndex(
      (h) => h.includes('no resi') || h.includes('no_resi') || h.includes('resi') || h.includes('tracking') || h.includes('awb')
    );

    // Fallbacks if header names differ
    if (noPesananIdx === -1) noPesananIdx = 0; // Default first col
    if (noResiIdx === -1) {
      // Find col with resi in it or 9th index
      noResiIdx = rawHeaders.length > 9 ? 9 : rawHeaders.length - 1;
    }

    const parsed: CsvParsedRow[] = [];
    const errors: string[] = [];

    // Map existing orders for super-fast lookup
    const orderMapByNoPesanan = new Map<string, ManualShipmentOrder>();
    const orderMapByCustomerOrderId = new Map<string, ManualShipmentOrder>();

    orders.forEach((o) => {
      if (o.no_pesanan) {
        orderMapByNoPesanan.set(o.no_pesanan.trim().toUpperCase(), o);
      }
      if (o.no_transaksi_customer) {
        orderMapByCustomerOrderId.set(o.no_transaksi_customer.trim().toUpperCase(), o);
      }
    });

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const cols = splitCsvLine(line, delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      const rawNoPesanan = cols[noPesananIdx] || '';
      const rawCustomerOrderId = orderIdCustomerIdx !== -1 ? cols[orderIdCustomerIdx] || '' : '';
      const rawResi = cols[noResiIdx] || '';

      const cleanNoPesanan = rawNoPesanan.trim().toUpperCase();
      const cleanCustomerOrderId = rawCustomerOrderId.trim().toUpperCase();
      const cleanResi = rawResi.trim().toUpperCase();

      if (!cleanNoPesanan && !cleanCustomerOrderId) {
        continue;
      }

      // Try match
      let matched: ManualShipmentOrder | undefined = undefined;
      let matchType: CsvParsedRow['matchType'] = 'not_found';

      if (cleanNoPesanan && orderMapByNoPesanan.has(cleanNoPesanan)) {
        matched = orderMapByNoPesanan.get(cleanNoPesanan);
        matchType = 'exact_no_pesanan';
      } else if (cleanCustomerOrderId && orderMapByCustomerOrderId.has(cleanCustomerOrderId)) {
        matched = orderMapByCustomerOrderId.get(cleanCustomerOrderId);
        matchType = 'exact_order_id_customer';
      } else if (cleanNoPesanan && orderMapByCustomerOrderId.has(cleanNoPesanan)) {
        matched = orderMapByCustomerOrderId.get(cleanNoPesanan);
        matchType = 'exact_order_id_customer';
      }

      const isValid = !!matched && cleanResi.length > 0;
      let statusText = '';
      if (!matched) {
        statusText = 'Order ID tidak ditemukan di sistem';
      } else if (!cleanResi) {
        statusText = 'Nomor resi kosong';
      } else if ((matched.no_resi || '').trim().toUpperCase() === cleanResi) {
        statusText = 'Sama dengan resi saat ini (Skip)';
      } else {
        statusText = 'Siap Diperbarui';
      }

      parsed.push({
        rawOrderRef: rawNoPesanan || rawCustomerOrderId,
        orderId: matched ? matched.no_pesanan : (rawNoPesanan || rawCustomerOrderId),
        matchedOrder: matched,
        oldResi: matched?.no_resi || '-',
        newResi: cleanResi,
        statusText,
        isValid: isValid && statusText === 'Siap Diperbarui',
        matchType,
      });
    }

    setParsedRows(parsed);
    setCsvParseErrors(errors);
  };

  // Helper for splitting CSV line respecting quotes
  const splitCsvLine = (text: string, delimiter: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cur += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur);
    return result;
  };

  const handleFileUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onShowToast('Harap pilih file berformat .CSV', 'error');
      return;
    }
    setCsvFile(file);
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        parseCsvText(content);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Submit CSV batch update
  const handleApplyCsvUpdate = async () => {
    const validRows = parsedRows.filter((r) => r.isValid && r.matchedOrder && r.newResi);
    if (validRows.length === 0) {
      onShowToast('Tidak ada data resi valid yang siap diperbarui.', 'warning');
      return;
    }

    const updateList: BulkResiUpdateItem[] = validRows.map((r) => ({
      id: r.matchedOrder!.id,
      no_pesanan: r.matchedOrder!.no_pesanan,
      no_resi: r.newResi,
      update_status_to_dikirim: autoMarkAsShipped,
    }));

    setIsSubmitting(true);
    try {
      const result = await bulkUpdateShipmentResi(updateList);
      if (result.successCount > 0) {
        onShowToast(`Berhasil memperbarui ${result.successCount} resi via import CSV!`, 'success');
        onSuccess(result.successCount);
        onClose();
      } else {
        onShowToast(`Gagal update resi: ${result.errors.join(', ')}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`Terjadi kesalahan: ${err?.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Update No. Resi Massal
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                  {unassignedCount} Belum Ada Resi
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Input cepat resi langsung di tabel atau import template spreadsheet CSV
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center justify-between px-5 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-wrap gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'table'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Input Langsung di Tabel</span>
              {changedInputsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-600 text-white font-mono">
                  {changedInputsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('csv')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'csv'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import CSV & Template</span>
            </button>
          </div>

          {/* Option: Auto update status to dikirim */}
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoMarkAsShipped}
              onChange={(e) => setAutoMarkAsShipped(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
            />
            <span>Auto tandai status pesanan menjadi <strong className="text-indigo-600 dark:text-indigo-400">"Dikirim"</strong></span>
          </label>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
          
          {/* ============================================================== */}
          {/* TAB 1: DIRECT TABLE EDIT */}
          {/* ============================================================== */}
          {activeTab === 'table' && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filter Mode */}
                  <div className="inline-flex p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setFilterMode('no_resi_only')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        filterMode === 'no_resi_only'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Hanya Belum Ada Resi ({unassignedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('all')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        filterMode === 'all'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Semua Pesanan ({orders.length})
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Cari Order ID, customer, ekspedisi..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Quick Paste Trigger */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickPaste(!showQuickPaste)}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Tempel Resi Berurutan</span>
                  </button>
                </div>
              </div>

              {/* Quick Paste Collapse Box */}
              {showQuickPaste && (
                <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Tempel Daftar Resi (1 Baris = 1 Pesanan Sesuai Urutan Tabel)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQuickPaste(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={quickPasteText}
                    onChange={(e) => setQuickPasteText(e.target.value)}
                    placeholder="Contoh:&#10;SPXID0123456789&#10;JP9876543210&#10;SOC100234912"
                    className="w-full text-xs font-mono p-2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleApplyQuickPaste}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      Terapkan ke Baris Tabel
                    </button>
                  </div>
                </div>
              )}

              {/* Table of Orders */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-100/90 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 backdrop-blur-xs font-bold text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">Order ID / Tanggal</th>
                        <th className="py-2.5 px-3">Store Pengirim</th>
                        <th className="py-2.5 px-3">Penerima & Tujuan</th>
                        <th className="py-2.5 px-3">Jasa Kirim</th>
                        <th className="py-2.5 px-3 min-w-[200px]">
                          Input No. Resi Pengiriman <span className="text-red-500">*</span>
                        </th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                      {filteredTableOrders.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            Tidak ada pesanan yang sesuai filter.
                          </td>
                        </tr>
                      ) : (
                        filteredTableOrders.map((order, idx) => {
                          const currentInputValue =
                            tableResiInputs[order.no_pesanan] !== undefined
                              ? tableResiInputs[order.no_pesanan]
                              : order.no_resi || '';

                          const isModified =
                            (order.no_resi || '').trim() !== currentInputValue.trim() &&
                            currentInputValue.trim().length > 0;

                          const hasAlter = (order.items || []).some(
                            (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter
                          ) || order.order_type === 'alteration_repair';

                          return (
                            <tr
                              key={order.no_pesanan || idx}
                              className={`transition-colors ${
                                isModified
                                  ? 'bg-indigo-50/60 dark:bg-indigo-950/40'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                {idx + 1}
                              </td>
                              
                              <td className="py-2 px-3">
                                <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                  {order.no_transaksi_customer || order.no_pesanan}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {order.created_at ? new Date(order.created_at).toLocaleDateString('id-ID') : '-'}
                                </div>
                                {hasAlter && (
                                  <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                    <Scissors className="w-2.5 h-2.5" />
                                    Ada Alter
                                  </span>
                                )}
                              </td>

                              <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300">
                                {order.nama_pengirim}
                                {order.pic_store && (
                                  <div className="text-[10px] text-slate-400">PIC: {order.pic_store}</div>
                                )}
                              </td>

                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {order.nama_tujuan}
                                </div>
                                <div className="text-[10px] text-slate-400 line-clamp-1 max-w-[200px]" title={order.alamat_tujuan}>
                                  {order.alamat_tujuan || '-'}
                                </div>
                              </td>

                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold border border-slate-200 dark:border-slate-700">
                                  {order.jasa_kirim || '-'}
                                </span>
                              </td>

                              <td className="py-2 px-3">
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={currentInputValue}
                                    onChange={(e) => handleTableResiChange(order.no_pesanan, e.target.value)}
                                    placeholder="Masukkan No. Resi..."
                                    className={`w-full font-mono text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 ${
                                      isModified
                                        ? 'border-indigo-500 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 font-bold ring-1 ring-indigo-500'
                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                                    }`}
                                  />
                                  {isModified && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                                  )}
                                </div>
                              </td>

                              <td className="py-2 px-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                                    order.status === 'dikirim'
                                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                      : order.status === 'diproses'
                                      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                                  }`}
                                >
                                  {order.status || 'Pending'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: CSV IMPORT & TEMPLATE DRIVEN */}
          {/* ============================================================== */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              
              {/* Step 1: Download Template */}
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold">
                      1
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Unduh Template Pesanan Tanpa Resi (CSV)
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 pl-7 max-w-xl">
                    Sistem akan mengekspor seluruh pesanan toko yang belum memiliki nomor resi ke dalam file CSV standar. Admin cukup membuka di Excel, mengisi kolom <strong>No Resi</strong>, simpan, lalu unggah kembali pada Langkah 2.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs whitespace-nowrap self-stretch sm:self-auto justify-center"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Template CSV ({unassignedCount} Pesanan)</span>
                </button>
              </div>

              {/* Step 2: Upload CSV */}
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold">
                    2
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Unggah File CSV yang Telah Diisi Resi
                  </h4>
                </div>

                {/* Dropzone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/50 dark:bg-slate-900/30'
                  }`}
                >
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tarik dan lepaskan file CSV Anda di sini, atau
                  </p>
                  <label className="mt-2 inline-block px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg cursor-pointer shadow-xs transition-colors">
                    <span>Pilih File CSV</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  {csvFileName && (
                    <div className="mt-2 text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>{csvFileName}</span>
                    </div>
                  )}
                </div>

                {/* Parsing Summary & Error Warning */}
                {csvParseErrors.length > 0 && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      {csvParseErrors.map((err, i) => (
                        <div key={i}>{err}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview Table of Matched CSV Rows */}
                {parsedRows.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Pratinjau Hasil Sinkronisasi ({parsedRows.length} baris data)
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                          ✓ {parsedRows.filter((r) => r.isValid).length} Siap Update
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-[11px]">
                          {parsedRows.filter((r) => !r.isValid).length} Skip / Invalid
                        </span>
                      </div>
                    </div>

                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[40vh] overflow-y-auto bg-white dark:bg-slate-900">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-slate-100/90 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                          <tr>
                            <th className="py-2 px-3">Order Ref</th>
                            <th className="py-2 px-3">Penerima & Store</th>
                            <th className="py-2 px-3">Resi Semula</th>
                            <th className="py-2 px-3">Resi Baru (Akan Disimpan)</th>
                            <th className="py-2 px-3 text-center">Status Matching</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                          {parsedRows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                row.isValid
                                  ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                                  : 'bg-slate-50/30 dark:bg-slate-900/30 opacity-70'
                              }
                            >
                              <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white">
                                {row.orderId}
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {row.matchedOrder?.nama_tujuan || '-'}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {row.matchedOrder?.nama_pengirim || '-'}
                                </div>
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-400">
                                {row.oldResi || '-'}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                {row.newResi || <span className="text-red-400 italic">(Kosong)</span>}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {row.isValid ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                                    <Check className="w-3 h-3" /> Siap Update
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                    {row.statusText}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {activeTab === 'table' ? (
              <span>
                {changedInputsCount > 0 ? (
                  <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                    {changedInputsCount} nomor resi
                  </strong>
                ) : (
                  'Belum ada perubahan'
                )}{' '}
                siap disimpan ke database
              </span>
            ) : (
              <span>
                {parsedRows.filter((r) => r.isValid).length > 0 ? (
                  <strong className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {parsedRows.filter((r) => r.isValid).length} nomor resi
                  </strong>
                ) : (
                  'Belum ada file CSV diunggah'
                )}{' '}
                siap diupdate
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>

            {activeTab === 'table' ? (
              <button
                type="button"
                onClick={handleSaveTableResi}
                disabled={isSubmitting || changedInputsCount === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Semua Resi ({changedInputsCount})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApplyCsvUpdate}
                disabled={isSubmitting || parsedRows.filter((r) => r.isValid).length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengupdate Database...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      Terapkan & Update Semua Resi ({parsedRows.filter((r) => r.isValid).length})
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
