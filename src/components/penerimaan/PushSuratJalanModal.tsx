import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Search,
  RefreshCw,
  X,
  Send,
  ExternalLink,
  Layers,
  Calendar,
  AlertCircle,
  Minimize2,
  Maximize2,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { PenerimaanProduksiItem } from '../../types';
import { DraggableFloatingBubble, BubbleDragHandle } from '../common/DraggableFloatingBubble';
import {
  pushSuratJalanToGoogleSheet,
  SuratJalanPushPayload,
} from '../../services/gasProduksiSync';

interface PushSuratJalanModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataList: PenerimaanProduksiItem[];
  preSelectedNoSJ?: string;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface SuratJalanGroup {
  no_surat_jalan: string;
  tanggal: string;
  kategori: string;
  up_vendor: string;
  operator: string;
  totalQty: number;
  distinctCodes: string[];
  itemsCount: number;
  items: PenerimaanProduksiItem[];
}

export const PushSuratJalanModal: React.FC<PushSuratJalanModalProps> = ({
  isOpen,
  onClose,
  dataList,
  preSelectedNoSJ,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSJList, setSelectedSJList] = useState<string[]>(() =>
    preSelectedNoSJ ? [preSelectedNoSJ] : []
  );
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [pushStep, setPushStep] = useState<'idle' | 'pushing' | 'completed' | 'failed'>('idle');
  const [lastPushUrl, setLastPushUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setIsMinimized(false);
      if (!isPushing) {
        setPushStep('idle');
      }
    }
  }, [isOpen]);

  // Kelompokkan data penerimaan produksi berdasarkan No Surat Jalan
  const groupedSuratJalan = useMemo(() => {
    if (!isOpen) return [];
    const map = new Map<string, SuratJalanGroup>();

    dataList.forEach((it) => {
      const sjKey = (it.no_surat_jalan || 'SJ-TANPA-NOMOR').trim();
      if (!map.has(sjKey)) {
        map.set(sjKey, {
          no_surat_jalan: sjKey,
          tanggal: it.tanggal_penerimaan || '',
          kategori: it.kategori || 'Lokal CMT',
          up_vendor: it.keterangan || '-',
          operator: it.operator || 'Operator Gudang',
          totalQty: 0,
          distinctCodes: [],
          itemsCount: 0,
          items: [],
        });
      }

      const group = map.get(sjKey)!;
      group.totalQty += Number(it.qty) || 0;
      group.itemsCount += 1;
      group.items.push(it);

      const c = (it.kode_produksi || '').trim().toUpperCase();
      if (c && !group.distinctCodes.includes(c)) {
        group.distinctCodes.push(c);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.tanggal !== a.tanggal) return b.tanggal.localeCompare(a.tanggal);
      return a.no_surat_jalan.localeCompare(b.no_surat_jalan);
    });
  }, [isOpen, dataList]);

  // Filtered berdasarkan live dropsearch
  const filteredSJGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedSuratJalan;
    const q = searchQuery.trim().toLowerCase();
    return groupedSuratJalan.filter(
      (g) =>
        g.no_surat_jalan.toLowerCase().includes(q) ||
        g.tanggal.toLowerCase().includes(q) ||
        g.kategori.toLowerCase().includes(q) ||
        g.up_vendor.toLowerCase().includes(q) ||
        g.distinctCodes.some((c) => c.toLowerCase().includes(q))
    );
  }, [groupedSuratJalan, searchQuery]);

  // Total terpilih summary
  const selectedSummary = useMemo(() => {
    const selectedObj = groupedSuratJalan.filter((g) =>
      selectedSJList.includes(g.no_surat_jalan)
    );
    let totalQty = 0;
    let totalItems = 0;
    selectedObj.forEach((g) => {
      totalQty += g.totalQty;
      totalItems += g.itemsCount;
    });
    return {
      count: selectedObj.length,
      totalQty,
      totalItems,
      groups: selectedObj,
    };
  }, [groupedSuratJalan, selectedSJList]);

  if (!isOpen && !isPushing) return null;

  // Toggle selection
  const handleToggleSJ = (noSj: string) => {
    setSelectedSJList((prev) =>
      prev.includes(noSj) ? prev.filter((s) => s !== noSj) : [...prev, noSj]
    );
  };

  // Pilih Semua Hasil Search
  const handleSelectAllFiltered = () => {
    const newItems = filteredSJGroups.map((g) => g.no_surat_jalan);
    setSelectedSJList((prev) => Array.from(new Set([...prev, ...newItems])));
  };

  // Bersihkan Pilihan
  const handleClearSelection = () => {
    setSelectedSJList([]);
  };

  // Eksekusi Push ke Google Sheets
  const handleExecutePush = async () => {
    if (selectedSummary.count === 0) {
      onShowToast('Pilih minimal 1 Surat Jalan untuk di-push ke Google Sheet.', 'warning');
      return;
    }

    try {
      setIsPushing(true);
      setPushStep('pushing');
      const payloads: SuratJalanPushPayload[] = selectedSummary.groups.map((g) => ({
        no_surat_jalan: g.no_surat_jalan,
        tanggal: g.tanggal,
        kategori: g.kategori,
        up_vendor: g.up_vendor,
        operator: g.operator,
        is_recount: false,
        items: g.items.map((it) => ({
          kode_produksi: it.kode_produksi || '',
          nama_produk: it.nama_produk || '',
          warna: it.warna || '',
          size: it.size || '',
          qty: Number(it.qty) || 0,
          foto_url: it.foto_url || '',
          keterangan: it.keterangan || '',
        })),
      }));

      const res = await pushSuratJalanToGoogleSheet(payloads);

      if (res.success) {
        setPushStep('completed');
        onShowToast(
          res.message ||
            `Sukses mengirim ${payloads.length} Surat Jalan ke tab masing-masing!`,
          'success'
        );
        if (res.sheetUrl) {
          setLastPushUrl(res.sheetUrl);
        }
      } else {
        setPushStep('failed');
        onShowToast(res.message || 'Gagal push ke Google Sheets', 'error');
      }
    } catch (err: any) {
      console.error('Error executing push SJ:', err);
      setPushStep('failed');
      onShowToast('Gagal mengirim ke Google Sheets: ' + (err?.message || err), 'error');
    } finally {
      setIsPushing(false);
    }
  };

  if (isMinimized || !isOpen) {
    return (
      <DraggableFloatingBubble
        storageKey="push_sj_sheets_minimized"
        defaultAnchor="bottom-left"
        defaultOffset={{ x: 16, y: 140 }}
        zIndexClass="z-[70]"
        className="w-[calc(100vw-2rem)] sm:w-96"
        ariaLabel="Push Surat Jalan Sheet Minimized"
      >
        <div className="w-full bg-slate-900/95 dark:bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 p-3.5 backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-start justify-between gap-2.5">
            <div
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-90"
            >
              <BubbleDragHandle tone="dark" className="-ml-1" />
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  pushStep === 'completed' && !isPushing
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}
              >
                {isPushing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : pushStep === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold tracking-tight truncate">
                  {isPushing
                    ? `Mengirim ${selectedSummary.count} SJ ke Sheets...`
                    : pushStep === 'completed'
                    ? 'Push Surat Jalan Selesai!'
                    : 'Push Surat Jalan ke Sheets'}
                </div>
                <div className="text-[11px] text-slate-400 truncate font-mono">
                  {selectedSummary.count} SJ terpilih • {selectedSummary.totalQty.toLocaleString('id-ID')} pcs
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Buka</span>
              </button>
              {!isPushing && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMinimized(false);
                    onClose();
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </DraggableFloatingBubble>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* HEADER MODAL */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                <span>Push Surat Jalan ke Google Sheets</span>
                <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                  1 SJ = 1 Tab Sheet
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Pilih surat jalan kedatangan yang ingin dipush/dire-push sebagai sheet terpisah
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="px-2.5 py-1.5 text-xs font-bold text-indigo-200 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              title="Minimize ke Bubble Mengambang"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Minimize</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (isPushing) {
                  setIsMinimized(true);
                } else {
                  onClose();
                }
              }}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SEARCH & TOOLBAR BAR */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            {/* Dropsearch Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari No. Surat Jalan, Tanggal, Kode Produksi, atau Vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filter Actions */}
            <div className="flex items-center gap-2 shrink-0 text-xs">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-bold transition cursor-pointer"
              >
                Pilih Semua ({filteredSJGroups.length})
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                className="px-3 py-2 bg-white dark:bg-slate-850 hover:bg-red-50 hover:text-red-600 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-xl font-bold transition cursor-pointer"
              >
                Kosongkan
              </button>
            </div>
          </div>

          {/* Banner Status Pilihan */}
          <div className="flex items-center justify-between text-xs px-1 text-slate-600 dark:text-slate-300">
            <div>
              <span>Terpilih: </span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-black">
                {selectedSummary.count} Surat Jalan
              </strong>{' '}
              <span>
                ({selectedSummary.totalQty.toLocaleString('id-ID')} pcs &bull;{' '}
                {selectedSummary.totalItems} baris varian)
              </span>
            </div>
            {lastPushUrl && (
              <a
                href={lastPushUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold text-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka Google Sheets</span>
              </a>
            )}
          </div>
        </div>

        {/* LIST DAFTAR SURAT JALAN */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredSJGroups.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-semibold">
                Tidak ditemukan Surat Jalan yang sesuai dengan "{searchQuery}".
              </p>
            </div>
          ) : (
            filteredSJGroups.map((group) => {
              const isChecked = selectedSJList.includes(group.no_surat_jalan);
              return (
                <div
                  key={group.no_surat_jalan}
                  onClick={() => handleToggleSJ(group.no_surat_jalan)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between gap-4 ${
                    isChecked
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500/80 shadow-xs'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 shrink-0 cursor-pointer"
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                          {group.no_surat_jalan}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded-md">
                          {group.kategori}
                        </span>
                        {isChecked && (
                          <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-extrabold rounded-md uppercase">
                            Siap Dipush
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{group.tanggal || '-'}</span>
                        </span>
                        <span>&bull;</span>
                        <span>
                          Kode: <strong className="font-mono text-slate-700 dark:text-slate-200">{group.distinctCodes.join(', ') || '-'}</strong>
                        </span>
                        {group.up_vendor && group.up_vendor !== '-' && (
                          <>
                            <span>&bull;</span>
                            <span>Vendor/UP: {group.up_vendor}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                      {group.totalQty.toLocaleString('id-ID')} pcs
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      {group.itemsCount} varian baris
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>
              Tiap Surat Jalan akan otomatis dibuatkan <strong>1 Tab Sheet khusus</strong> di Google Spreadsheet.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Minimize</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (isPushing) {
                  setIsMinimized(true);
                } else {
                  onClose();
                }
              }}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              {isPushing ? 'Sembunyikan' : 'Tutup'}
            </button>
            <button
              type="button"
              onClick={handleExecutePush}
              disabled={isPushing || selectedSummary.count === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer shadow-md disabled:cursor-not-allowed"
            >
              {isPushing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Sedang Mengirim ke Sheets...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    Push {selectedSummary.count > 0 ? `${selectedSummary.count} SJ Terpilih` : 'ke Sheets'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
