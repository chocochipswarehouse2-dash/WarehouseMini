import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Upload, RefreshCw, Send, ChevronDown, ChevronUp, CheckCircle2,
  AlertTriangle, Package, FileText, Trash2, ClipboardCheck, X,
  Minus, Plus, RotateCcw, ArrowUpDown, ScanLine,
} from 'lucide-react';
import { UserSession, TarikanMDItem, TarikanMDScanResult, TarikanMDRecord } from '../types';
import { hasPermission, isSuperadmin } from '../services/permissions';
import { PhysicalScanInput } from './PhysicalScanInput';
import {
  fetchTarikanMDRecords,
  submitTarikanMD,
  deleteTarikanMD,
} from '../services/gasTarikanMD';

interface TarikanMDViewProps {
  session: UserSession | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

// ==========================================
// CSV PARSER
// ==========================================
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === ',' || char === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

interface ParsedCSV {
  items: TarikanMDItem[];
  no_sj: string;
  source: string;
  destination: string;
  tanggal_sj: string;
}

function parseCsvFile(content: string): ParsedCSV {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV kosong atau tidak valid');

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.replace(/"/g, '').trim().toLowerCase());

  const col = {
    date:    headers.findIndex(h => h === 'date'),
    noSj:    headers.findIndex(h => h === 'number delivery' || h === 'number_delivery' || h === 'no sj' || h === 'no_sj'),
    category:headers.findIndex(h => h === 'category'),
    product: headers.findIndex(h => h === 'product'),
    variant: headers.findIndex(h => h === 'variant'),
    code:    headers.findIndex(h => h === 'code' || h === 'sku'),
    qty:     headers.findIndex(h => h === 'qty' || h === 'quantity'),
    source:  headers.findIndex(h => h === 'source'),
    dest:    headers.findIndex(h => h === 'destination'),
  };

  const skuMap = new Map<string, TarikanMDItem>();
  let no_sj = '', source = '', destination = '', tanggal_sj = '';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);

    const get = (idx: number) => idx >= 0 ? (cols[idx] || '').replace(/"/g, '').trim() : '';

    const sku = get(col.code);
    if (!sku) continue;

    if (!no_sj)       no_sj       = get(col.noSj);
    if (!source)      source      = get(col.source);
    if (!destination) destination = get(col.dest);
    if (!tanggal_sj)  tanggal_sj  = get(col.date);

    const qty = parseInt(get(col.qty) || '0', 10) || 0;
    const nama = get(col.variant) || get(col.product) || sku;
    const category = get(col.category);

    if (skuMap.has(sku)) {
      skuMap.get(sku)!.qty_sj += qty;
    } else {
      skuMap.set(sku, { sku, nama_produk: nama, category, qty_sj: qty });
    }
  }

  if (skuMap.size === 0) throw new Error('Tidak ada data SKU yang ditemukan. Pastikan kolom "Code" ada di CSV.');

  return { items: Array.from(skuMap.values()), no_sj, source, destination, tanggal_sj };
}

// ==========================================
// SUBCOMPONENTS
// ==========================================
const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    COCOK:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
    KURANG:  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
    LEBIH:   'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
    SELISIH: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================
export const TarikanMDView: React.FC<TarikanMDViewProps> = ({ session, onShowToast }) => {
  const userIsAdmin = isSuperadmin(session);
  const canAction = userIsAdmin || hasPermission(session, 'can_tarikan_md');

  // ---- TABS ----
  const [activeTab, setActiveTab] = useState<'pengecekan' | 'rekap'>('pengecekan');

  // ---- PENGECEKAN STATE ----
  const [csvItems, setCsvItems] = useState<TarikanMDItem[]>([]);
  const [noSj, setNoSj] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [tanggalSj, setTanggalSj] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  // sku -> qty_scan (for items in SJ)
  const [scanQty, setScanQty] = useState<Record<string, number>>({});
  // sku -> { nama, qty } for items NOT in SJ
  const [unexpected, setUnexpected] = useState<Record<string, { nama?: string; qty: number }>>({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- REKAP STATE ----
  const [records, setRecords] = useState<TarikanMDRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'rekap') loadRecords();
  }, [activeTab]);

  // ---- COMPUTED ----
  const comparisonData = useMemo<TarikanMDScanResult[]>(() => {
    return csvItems.map(item => {
      const qty_scan = scanQty[item.sku] ?? 0;
      const selisih = qty_scan - item.qty_sj;
      return {
        ...item,
        qty_scan,
        selisih,
        status: selisih === 0 ? 'COCOK' : selisih < 0 ? 'KURANG' : 'LEBIH',
      };
    });
  }, [csvItems, scanQty]);

  const summary = useMemo(() => {
    const total_sj    = comparisonData.reduce((s, i) => s + i.qty_sj, 0);
    const total_scan  = comparisonData.reduce((s, i) => s + i.qty_scan, 0);
    const cocok       = comparisonData.filter(i => i.status === 'COCOK').length;
    const kurang      = comparisonData.filter(i => i.status === 'KURANG').length;
    const lebih       = comparisonData.filter(i => i.status === 'LEBIH').length;
    const unexpectedCount = Object.keys(unexpected).length;
    const total_unexpected_qty = Object.values(unexpected).reduce((s, v) => s + v.qty, 0);
    const has_selisih = kurang > 0 || lebih > 0 || unexpectedCount > 0;
    return { total_sj, total_scan, cocok, kurang, lebih, unexpectedCount, total_unexpected_qty, has_selisih };
  }, [comparisonData, unexpected]);

  // ---- CSV IMPORT ----
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result as string;
        const parsed = parseCsvFile(content);
        setCsvItems(parsed.items);
        setNoSj(parsed.no_sj);
        setSource(parsed.source);
        setDestination(parsed.destination);
        setTanggalSj(parsed.tanggal_sj);
        setScanQty({});
        setUnexpected({});
        onShowToast(`✅ ${parsed.items.length} SKU berhasil dimuat dari "${file.name}"`, 'success');
      } catch (err) {
        onShowToast(`Gagal baca CSV: ${err instanceof Error ? err.message : 'Format tidak valid'}`, 'error');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onShowToast]);

  // ---- SCAN HANDLER ----
  const handleScan = useCallback((rawSku: string) => {
    const sku = rawSku.trim();
    if (!sku) return;
    if (csvItems.length === 0) {
      onShowToast('Import CSV Surat Jalan dulu sebelum scan!', 'warning');
      return;
    }
    const found = csvItems.find(
      item => item.sku === sku || item.sku.toUpperCase() === sku.toUpperCase()
    );
    if (found) {
      setScanQty(prev => ({ ...prev, [found.sku]: (prev[found.sku] ?? 0) + 1 }));
    } else {
      setUnexpected(prev => ({
        ...prev,
        [sku]: { qty: (prev[sku]?.qty ?? 0) + 1 },
      }));
      onShowToast(`⚠️ SKU "${sku}" tidak ada di Surat Jalan (dicatat sebagai Lebih)`, 'warning');
    }
  }, [csvItems, onShowToast]);

  const handleManualQty = (sku: string, value: number) => {
    setScanQty(prev => ({ ...prev, [sku]: Math.max(0, value) }));
  };

  // ---- RESET ----
  const handleReset = () => {
    setCsvItems([]);
    setNoSj('');
    setSource('');
    setDestination('');
    setTanggalSj('');
    setScanQty({});
    setUnexpected({});
    setCsvFileName('');
  };

  // ---- SUBMIT ----
  const handleSubmit = async () => {
    if (!noSj) { onShowToast('No Surat Jalan tidak ditemukan di CSV!', 'warning'); return; }
    if (csvItems.length === 0) { onShowToast('Import CSV dahulu!', 'warning'); return; }

    const allItems: TarikanMDScanResult[] = [
      ...comparisonData,
      ...Object.entries(unexpected).map(([sku, val]) => ({
        sku,
        nama_produk: val.nama || sku,
        qty_sj: 0,
        qty_scan: val.qty,
        selisih: val.qty,
        status: 'LEBIH' as const,
      })),
    ];

    const record: TarikanMDRecord = {
      no_sj: noSj,
      tanggal_sj: tanggalSj,
      source,
      destination,
      total_qty_sj: summary.total_sj,
      total_qty_terima: summary.total_scan + summary.total_unexpected_qty,
      status_komparasi: summary.has_selisih ? 'SELISIH' : 'COCOK',
      submitted_by: session?.name || session?.username || 'Unknown',
      items_json: JSON.stringify(allItems),
      created_at: new Date().toISOString(),
    };

    setSubmitting(true);
    try {
      const ok = await submitTarikanMD(record);
      if (ok) {
        onShowToast(`✅ Penerimaan SJ "${noSj}" berhasil disimpan!`, 'success');
        handleReset();
        setActiveTab('rekap');
      } else {
        onShowToast('Gagal simpan ke Google Sheet. Pastikan GAS URL sudah disetting!', 'error');
      }
    } catch {
      onShowToast('Terjadi error saat submit. Coba lagi.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- LOAD REKAP ----
  const loadRecords = async () => {
    setLoadingRecords(true);
    try {
      const data = await fetchTarikanMDRecords();
      setRecords(data.reverse()); // Terbaru di atas
    } catch {
      onShowToast('Gagal memuat rekap penerimaan. Cek GAS URL.', 'error');
    } finally {
      setLoadingRecords(false);
    }
  };

  // ---- DELETE ----
  const handleDeleteRecord = async (no_sj: string) => {
    if (!window.confirm(`Yakin hapus rekap SJ "${no_sj}"?`)) return;
    setDeletingId(no_sj);
    try {
      await deleteTarikanMD(no_sj);
      setRecords(prev => prev.filter(r => r.no_sj !== no_sj));
      onShowToast('Rekap berhasil dihapus!', 'success');
    } catch {
      onShowToast('Gagal menghapus rekap.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0b1324]">
      {/* ---- HEADER ---- */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/30 flex items-center justify-center text-primary-500 shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">Tarikan MD</h1>
            <p className="text-xs text-slate-400">Pengecekan penerimaan barang vs Surat Jalan</p>
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1">
          {(['pengecekan', 'rekap'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-white dark:bg-[#131d31] text-primary-500 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab === 'pengecekan' ? '🔍 Pengecekan Barang' : '📋 Rekap Penerimaan'}
            </button>
          ))}
        </div>
      </div>

      {/* ---- BODY ---- */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">

        {/* ====================== TAB PENGECEKAN ====================== */}
        {activeTab === 'pengecekan' && (
          <>
            {/* Import CSV */}
            <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5 text-primary-500" />
                  Import Surat Jalan (CSV)
                </h3>
                {csvItems.length > 0 && (
                  <button type="button" onClick={handleReset}
                    className="text-xs text-slate-400 hover:text-rose-500 flex items-center gap-1 cursor-pointer transition-colors">
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>

              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full py-3.5 border-2 border-dashed rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  csvItems.length > 0
                    ? 'border-primary-400/50 bg-primary-50/50 dark:bg-primary-950/20 text-primary-500'
                    : 'border-slate-300 dark:border-slate-700 text-slate-400 hover:border-primary-400 hover:text-primary-500'
                }`}
              >
                <Upload className="w-4 h-4" />
                {csvFileName || 'Klik untuk import file CSV Surat Jalan'}
              </button>

              {/* SJ Info */}
              {csvItems.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'No SJ', value: noSj },
                    { label: 'Tanggal', value: tanggalSj },
                    { label: 'Source', value: source },
                    { label: 'Destination', value: destination },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2.5 border border-slate-200 dark:border-slate-700">
                      <div className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">{label}</div>
                      <div className="text-xs font-bold text-slate-800 dark:text-white truncate">{value || '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {csvItems.length > 0 && (
              <>
                {/* SCAN INPUT */}
                <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <h3 className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ScanLine className="w-3.5 h-3.5 text-primary-500" />
                    Scan Barcode / Input Manual
                  </h3>
                  <PhysicalScanInput
                    onScan={handleScan}
                    products={[]}
                    placeholder="SCAN BARCODE ATAU KETIK SKU LALU ENTER..."
                  />
                  <p className="text-[10px] text-slate-400">
                    Setiap scan = +1 qty untuk SKU tersebut. Qty juga bisa diubah langsung di tabel bawah.
                  </p>
                </div>

                {/* SUMMARY STATS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Qty SJ',  value: summary.total_sj,           color: 'text-slate-800 dark:text-white',        bg: 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800' },
                    { label: 'Total Discan',  value: summary.total_scan + summary.total_unexpected_qty, color: 'text-blue-600 dark:text-blue-400',  bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900' },
                    { label: 'SKU Cocok',     value: summary.cocok,              color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900' },
                    { label: 'SKU Selisih',   value: summary.kurang + summary.lebih + summary.unexpectedCount, color: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`${bg} rounded-xl p-3 border`}>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                      <div className={`text-2xl font-black ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* COMPARISON TABLE */}
                <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <ArrowUpDown className="w-3.5 h-3.5 text-primary-500" />
                    <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                      Komparasi Barang ({comparisonData.length} SKU)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500">
                          <th className="text-left px-3 py-2.5 font-bold">SKU / Produk</th>
                          <th className="text-center px-3 py-2.5 font-bold w-16">Qty SJ</th>
                          <th className="text-center px-3 py-2.5 font-bold w-28">Qty Scan</th>
                          <th className="text-center px-3 py-2.5 font-bold w-16">Selisih</th>
                          <th className="text-center px-3 py-2.5 font-bold w-20">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {comparisonData.map(item => (
                          <tr
                            key={item.sku}
                            className={`transition-colors ${
                              item.status === 'COCOK'  ? 'bg-emerald-50/40 dark:bg-emerald-950/10' :
                              item.status === 'KURANG' ? 'bg-rose-50/40 dark:bg-rose-950/10' :
                              item.status === 'LEBIH'  ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                            }`}
                          >
                            <td className="px-3 py-2.5">
                              <div className="font-bold text-slate-800 dark:text-white font-mono text-[11px]">{item.sku}</div>
                              <div className="text-slate-400 text-[10px] truncate max-w-[150px]">{item.nama_produk}</div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-slate-700 dark:text-slate-200">{item.qty_sj}</td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button type="button"
                                  onClick={() => handleManualQty(item.sku, item.qty_scan - 1)}
                                  className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-900 flex items-center justify-center transition-colors cursor-pointer">
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <input
                                  type="number"
                                  value={item.qty_scan}
                                  onChange={e => handleManualQty(item.sku, parseInt(e.target.value) || 0)}
                                  className="w-11 text-center font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none border border-slate-300 dark:border-slate-600 rounded-lg text-xs py-0.5"
                                  min={0}
                                />
                                <button type="button"
                                  onClick={() => handleManualQty(item.sku, item.qty_scan + 1)}
                                  className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-900 flex items-center justify-center transition-colors cursor-pointer">
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`font-extrabold ${
                                item.selisih === 0 ? 'text-emerald-500' :
                                item.selisih < 0  ? 'text-rose-500' : 'text-amber-500'
                              }`}>
                                {item.selisih > 0 ? `+${item.selisih}` : item.selisih}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <StatusBadge status={item.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Unexpected (SKU tidak ada di SJ) */}
                  {Object.keys(unexpected).length > 0 && (
                    <div className="border-t border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
                        <AlertTriangle className="w-3 h-3" />
                        SKU Tidak Ada di SJ (Lebih / Tidak Terduga)
                      </div>
                      <div className="space-y-1">
                        {Object.entries(unexpected).map(([sku, val]) => (
                          <div key={sku} className="flex items-center justify-between bg-amber-100/60 dark:bg-amber-900/20 rounded-lg px-3 py-1.5">
                            <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-300">{sku}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">×{val.qty}</span>
                              <button type="button"
                                onClick={() => setUnexpected(prev => { const n = { ...prev }; delete n[sku]; return n; })}
                                className="text-slate-400 hover:text-rose-500 cursor-pointer transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* SUBMIT AREA */}
                <div className={`rounded-2xl border-2 p-4 ${
                  summary.has_selisih
                    ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                }`}>
                  <div className="flex items-start gap-2 mb-3">
                    {summary.has_selisih
                      ? <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                      : <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />}
                    <div className={`text-sm font-bold ${summary.has_selisih ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                      {summary.has_selisih
                        ? `Ada ${summary.kurang + summary.lebih + summary.unexpectedCount} SKU berselisih — periksa kembali sebelum submit!`
                        : 'Semua barang cocok dengan Surat Jalan ✓'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !noSj || csvItems.length === 0}
                    className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all shadow-md shadow-primary-500/20 cursor-pointer"
                  >
                    {submitting
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Menyimpan...</>
                      : <><Send className="w-4 h-4" /> Submit Penerimaan ke Google Sheet</>}
                  </button>
                </div>
              </>
            )}

            {/* EMPTY STATE */}
            {csvItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/10 to-primary-500/5 border border-primary-500/20 flex items-center justify-center mb-4">
                  <FileText className="w-10 h-10 text-primary-400" />
                </div>
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-1">Mulai dengan Import CSV</h3>
                <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                  Import file CSV dari Surat Jalan untuk memulai proses pengecekan dan komparasi penerimaan barang.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-primary-500/20 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Import CSV Sekarang
                </button>
              </div>
            )}
          </>
        )}

        {/* ====================== TAB REKAP ====================== */}
        {activeTab === 'rekap' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-white">Rekap Penerimaan</h3>
                <p className="text-[11px] text-slate-400">{records.length} data tersimpan</p>
              </div>
              <button type="button" onClick={loadRecords}
                className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-500/10 rounded-xl transition-all cursor-pointer">
                <RefreshCw className={`w-4 h-4 ${loadingRecords ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingRecords ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <RefreshCw className="w-7 h-7 animate-spin text-primary-500" />
                <span className="text-sm">Memuat rekap...</span>
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-medium text-slate-400">Belum ada rekap penerimaan</p>
                <p className="text-xs text-slate-400 mt-1">Submit pengecekan di tab Pengecekan Barang</p>
              </div>
            ) : (
              <div className="space-y-2">
                {records.map((rec, idx) => {
                  const isExpanded = expandedRow === rec.no_sj;
                  let items: TarikanMDScanResult[] = [];
                  try { items = JSON.parse(rec.items_json || '[]'); } catch { /* ignore */ }

                  return (
                    <div key={`${rec.no_sj}-${idx}`} className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                      {/* ROW HEADER */}
                      <div
                        onClick={() => setExpandedRow(isExpanded ? null : rec.no_sj)}
                        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${rec.status_komparasi === 'COCOK' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-800 dark:text-white font-mono">{rec.no_sj}</span>
                            <StatusBadge status={rec.status_komparasi} />
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{rec.source} → {rec.destination}</span>
                            <span>·</span>
                            <span>{rec.tanggal_sj}</span>
                            <span>·</span>
                            <span>{rec.submitted_by}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                            {rec.total_qty_terima} / {rec.total_qty_sj} pcs
                          </div>
                          <div className="text-[10px] text-slate-400">terima / SJ</div>
                        </div>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                      </div>

                      {/* EXPANDED DETAIL */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-800">
                          {/* Admin actions */}
                          {userIsAdmin && (
                            <div className="flex gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-700">
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(rec.no_sj)}
                                disabled={deletingId === rec.no_sj}
                                className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-rose-200 dark:border-rose-800 disabled:opacity-50"
                              >
                                {deletingId === rec.no_sj
                                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                                  : <Trash2 className="w-3 h-3" />}
                                Hapus
                              </button>
                            </div>
                          )}

                          {/* Detail table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                                  <th className="text-left px-3 py-2 font-bold">SKU</th>
                                  <th className="text-left px-3 py-2 font-bold">Nama Produk</th>
                                  <th className="text-center px-3 py-2 font-bold">SJ</th>
                                  <th className="text-center px-3 py-2 font-bold">Terima</th>
                                  <th className="text-center px-3 py-2 font-bold">Selisih</th>
                                  <th className="text-center px-3 py-2 font-bold">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {items.map((item, i) => (
                                  <tr key={`${item.sku}-${i}`} className={
                                    item.status === 'COCOK'  ? 'bg-emerald-50/30 dark:bg-emerald-950/10' :
                                    item.status === 'KURANG' ? 'bg-rose-50/30 dark:bg-rose-950/10' :
                                    item.status === 'LEBIH'  ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                                  }>
                                    <td className="px-3 py-2 font-mono text-[10px] text-slate-600 dark:text-slate-400 font-bold">{item.sku}</td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[140px] truncate">{item.nama_produk}</td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300">{item.qty_sj}</td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300">{item.qty_scan}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`font-extrabold ${
                                        item.selisih === 0 ? 'text-emerald-500' :
                                        item.selisih < 0  ? 'text-rose-500' : 'text-amber-500'
                                      }`}>
                                        {item.selisih > 0 ? `+${item.selisih}` : item.selisih}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <StatusBadge status={item.status} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
