import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  Trash2,
  Download,
  RotateCcw,
  CheckCircle2,
  Layers,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Search,
  Database,
  Building2,
  FileSpreadsheet,
  Info,
  Check,
} from 'lucide-react';
import { UserSession, StockRealtimeItem } from '../../types';
import { isSuperadmin } from '../../services/permissions';
import {
  KNOWN_BLOCKS,
  LocationPurgeSelection,
  resolveLocationsFromSelection,
  parseLocationRange,
} from '../../utils/locationPurgeUtils';
import {
  fetchLocationPurgePreview,
  purgeLogsByLocations,
  LocationPurgePreviewResult,
} from '../../services/supabase';

interface LocationPurgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  session?: UserSession | null;
  onNotify?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onSuccess?: () => void;
  allExistingLocations?: string[];
}

export const LocationPurgeModal: React.FC<LocationPurgeModalProps> = ({
  isOpen,
  onClose,
  session,
  onNotify = () => {},
  onSuccess = () => {},
  allExistingLocations = [],
}) => {
  const userIsSuperadmin = isSuperadmin(session);

  // Selection state
  const [mode, setMode] = useState<LocationPurgeSelection['mode']>('range');
  const [blockKey, setBlockKey] = useState<string>('A');
  const [fromRange, setFromRange] = useState<string>('A001');
  const [toRange, setToRange] = useState<string>('A005');
  const [singleLocation, setSingleLocation] = useState<string>('');
  const [customInput, setCustomInput] = useState<string>('');

  // Preview & impact state
  const [previewData, setPreviewData] = useState<LocationPurgePreviewResult | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Execution state
  const [confirmPhrase, setConfirmPhrase] = useState<string>('');
  const [deletePendingSo, setDeletePendingSo] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [hasDownloadedBackup, setHasDownloadedBackup] = useState<boolean>(false);

  // Resolved list of target locations based on current selection
  const targetLocations = useMemo(() => {
    return resolveLocationsFromSelection(
      {
        mode,
        blockKey,
        fromRange,
        toRange,
        singleLocation,
        customInput,
      },
      allExistingLocations
    );
  }, [mode, blockKey, fromRange, toRange, singleLocation, customInput, allExistingLocations]);

  // Reset preview when locations change
  useEffect(() => {
    setPreviewData(null);
    setPreviewError(null);
  }, [targetLocations.join(',')]);

  // Reset confirmation input when modal opens or mode changes
  useEffect(() => {
    if (isOpen) {
      setConfirmPhrase('');
      setHasDownloadedBackup(false);
    }
  }, [isOpen, mode]);

  // Load impact preview
  const handleCalculatePreview = async () => {
    if (targetLocations.length === 0) {
      onNotify('Silakan pilih atau masukkan minimal 1 lokasi', 'warning');
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError(null);
    try {
      const res = await fetchLocationPurgePreview(targetLocations);
      setPreviewData(res);
    } catch (err: any) {
      console.error('Error fetching purge preview:', err);
      setPreviewError(err.message || 'Gagal menghitung dampak lokasi');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Auto trigger preview on mode selection change
  useEffect(() => {
    if (isOpen && targetLocations.length > 0 && targetLocations.length <= 100) {
      const timer = setTimeout(() => {
        handleCalculatePreview();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, targetLocations.join(',')]);

  // Download backup JSON file
  const handleDownloadBackup = () => {
    if (!previewData || previewData.allLogs.length === 0) {
      // If no logs, create minimal snapshot
      const emptySnapshot = {
        metadata: {
          timestamp: new Date().toISOString(),
          operator: session?.name || session?.username || 'Superadmin',
          locations: targetLocations,
          note: 'Tidak ditemukan log mutasi pada lokasi ini saat backup dibuat.',
        },
        logs: [],
        stocks: previewData?.stockItems || [],
      };
      triggerJsonDownload(emptySnapshot, `backup_log_kosong_${targetLocations.slice(0, 3).join('_')}.json`);
      setHasDownloadedBackup(true);
      return;
    }

    const snapshot = {
      metadata: {
        timestamp: new Date().toISOString(),
        operator: session?.name || session?.username || 'Superadmin',
        totalLogs: previewData.totalLogs,
        uniqueSkus: previewData.uniqueSkus,
        totalPhysicalQty: previewData.totalPhysicalQty,
        locations: targetLocations,
        systemNote: 'WMS Location Purge Backup Snapshot',
      },
      stocksBeforePurge: previewData.stockItems,
      logs: previewData.allLogs,
    };

    const locLabel =
      targetLocations.length <= 3
        ? targetLocations.join('_')
        : `${targetLocations[0]}_sd_${targetLocations[targetLocations.length - 1]}`;
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `backup_wms_log_${locLabel}_${dateStr}.json`;

    triggerJsonDownload(snapshot, fileName);
    setHasDownloadedBackup(true);
    onNotify(`File backup berhasil diunduh (${previewData.allLogs.length} baris log)`, 'success');
  };

  const triggerJsonDownload = (data: any, fileName: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Execute purge
  const handleExecutePurge = async () => {
    if (targetLocations.length === 0) {
      onNotify('Pilih minimal 1 lokasi untuk di-reset', 'error');
      return;
    }

    if (confirmPhrase.trim().toUpperCase() !== 'RESET-LOKASI') {
      onNotify('Ketik teks konfirmasi "RESET-LOKASI" dengan benar', 'warning');
      return;
    }

    // Proactive safety: auto download backup if not yet downloaded
    if (!hasDownloadedBackup && previewData && previewData.allLogs.length > 0) {
      handleDownloadBackup();
    }

    setIsExecuting(true);
    try {
      const operator = session?.name || session?.username || 'Superadmin';
      const result = await purgeLogsByLocations(targetLocations, operator, deletePendingSo);

      if (result.success) {
        onNotify(
          `Berhasil! Seluruh log di ${targetLocations.length} lokasi telah dihapus. Stok fisik rak tersebut kini bersih 0 pcs.`,
          'success'
        );
        onSuccess();
        onClose();
      } else {
        onNotify(result.error || 'Gagal mereset log lokasi', 'error');
      }
    } catch (err: any) {
      console.error('Error during purge execution:', err);
      onNotify(err.message || 'Terjadi kesalahan sistem saat mereset lokasi', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  if (!isOpen) return null;

  const isConfirmed = confirmPhrase.trim().toUpperCase() === 'RESET-LOKASI';

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#131d31] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-[#0f172a]/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Pembersihan Log & Reset Stok Lokasi (0)
                </h2>
                <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 rounded text-[10px] font-black uppercase tracking-wider border border-rose-300 dark:border-rose-800">
                  DESTRUCTIVE RESET
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hapus riwayat log mutasi anomali lama & paksa stok fisik lokasi terpilih bersih kembali dari 0.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Informational Principle Alert */}
          <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Prinsip Kerja Reset Stok Fisik:</div>
              <p className="leading-relaxed text-amber-800/90 dark:text-amber-300/90 text-[11px]">
                Stok fisik rak dihitung langsung dari seluruh riwayat di tabel <code className="font-mono font-bold">log_produk</code> (<code className="font-mono">IN - OUT</code>). Dengan menghapus log pada lokasi terpilih, kalkulasi stok fisik rak tersebut otomatis <b>menjadi 0 murni</b>. Anomali lama hilang dan rak siap di-Stock Opname ulang dengan bersih.
              </p>
            </div>
          </div>

          {/* Mode Selector Tabs */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              1. Pilih Metode Pemilihan Lokasi:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 bg-slate-100 dark:bg-[#0b1324] rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMode('range')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'range'
                    ? 'bg-white dark:bg-[#131d31] text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>📏 Rentang Rak</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('block')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'block'
                    ? 'bg-white dark:bg-[#131d31] text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>🏢 Per Blok</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('single')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'single'
                    ? 'bg-white dark:bg-[#131d31] text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>🎯 Rak Tunggal</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === 'custom'
                    ? 'bg-white dark:bg-[#131d31] text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>🏷️ Multi-Pilihan</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('anomaly')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1 ${
                  mode === 'anomaly'
                    ? 'bg-white dark:bg-[#131d31] text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>⚠️ Anomali</span>
              </button>
            </div>
          </div>

          {/* Mode Controls Content */}
          <div className="p-4 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            {/* 1. Mode Range */}
            {mode === 'range' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Dari Rak (Mulai):
                    </label>
                    <input
                      type="text"
                      value={fromRange}
                      onChange={(e) => setFromRange(e.target.value.toUpperCase())}
                      placeholder="e.g. A001"
                      className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-rose-500 uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Sampai Rak (Akhir):
                    </label>
                    <input
                      type="text"
                      value={toRange}
                      onChange={(e) => setToRange(e.target.value.toUpperCase())}
                      placeholder="e.g. A005"
                      className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-rose-500 uppercase"
                    />
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Contoh: <code className="font-mono bg-slate-200/60 dark:bg-slate-800 px-1 py-0.5 rounded">A001</code> s/d <code className="font-mono bg-slate-200/60 dark:bg-slate-800 px-1 py-0.5 rounded">A005</code> akan otomatis mencakup rak <span className="font-mono font-bold">A001, A002, A003, A004, A005</span> (5 rak).
                </div>
              </div>
            )}

            {/* 2. Mode Block */}
            {mode === 'block' && (
              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  Pilih Blok Area yang Ingin Dikosongkan:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {KNOWN_BLOCKS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBlockKey(b.key)}
                      className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                        blockKey === b.key
                          ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131d31] text-slate-700 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      <div className="font-bold text-xs">{b.label}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{b.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Mode Single */}
            {mode === 'single' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Nama / Kode Rak Tunggal:
                  </label>
                  <input
                    type="text"
                    value={singleLocation}
                    onChange={(e) => setSingleLocation(e.target.value.toUpperCase())}
                    placeholder="e.g. A001, B037, X007, atau R024"
                    className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-rose-500 uppercase"
                  />
                </div>
                {allExistingLocations.length > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Rak aktif terdeteksi: </span>
                    <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto">
                      {allExistingLocations.slice(0, 15).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setSingleLocation(l.toUpperCase())}
                          className="px-2 py-0.5 text-[10px] font-mono bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded hover:border-rose-500 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Mode Custom */}
            {mode === 'custom' && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  Ketik atau Tempel Daftar Rak (Pisahkan dengan koma atau baris baru):
                </label>
                <textarea
                  rows={3}
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
                  placeholder="Contoh: A001, B005, D008, R024, V003"
                  className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-rose-500 uppercase"
                />
              </div>
            )}

            {/* 5. Mode Anomaly */}
            {mode === 'anomaly' && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  Pembersihan Otomatis Seluruh Rak Anomali / Non-Standar
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mode ini otomatis mencari semua nama lokasi yang tidak sesuai standar denah rak gudang (seperti tanda strip <code className="font-mono">-</code>, string <code className="font-mono">NULL</code>, salah ketik operator) untuk dibersihkan dari database.
                </p>
              </div>
            )}
          </div>

          {/* Target Locations Chips Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                2. Lokasi Target yang Akan Direset ({targetLocations.length} Rak):
              </span>
              <button
                type="button"
                onClick={handleCalculatePreview}
                disabled={isLoadingPreview || targetLocations.length === 0}
                className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className={`w-3 h-3 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                <span>{isLoadingPreview ? 'Menghitung...' : 'Hitung Ulang Dampak'}</span>
              </button>
            </div>

            <div className="p-3 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-xl max-h-24 overflow-y-auto flex flex-wrap gap-1.5">
              {targetLocations.length === 0 ? (
                <span className="text-xs text-slate-400 italic">Belum ada lokasi yang dipilih...</span>
              ) : (
                targetLocations.map((loc) => (
                  <span
                    key={loc}
                    className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 text-[11px] font-mono font-bold"
                  >
                    {loc}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Impact Stats Cards */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              3. Dampak Terhadap Database (Sebelum & Sesudah):
            </span>

            {isLoadingPreview ? (
              <div className="p-6 bg-slate-50 dark:bg-[#0b1324] rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                <span>Menghubungi Supabase untuk memeriksa baris log & stok fisik...</span>
              </div>
            ) : previewError ? (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{previewError}</span>
              </div>
            ) : previewData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Baris Log Mutasi</div>
                    <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">
                      {previewData.totalLogs.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-400">Akan dihapus permanen</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total SKU Fisik</div>
                    <div className="text-lg font-black text-slate-800 dark:text-white mt-0.5">
                      {previewData.uniqueSkus.toLocaleString()} <span className="text-xs text-rose-500 font-bold">→ 0</span>
                    </div>
                    <div className="text-[9px] text-slate-400">Reset ke 0 SKU</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Qty Fisik</div>
                    <div className="text-lg font-black text-slate-800 dark:text-white mt-0.5">
                      {previewData.totalPhysicalQty.toLocaleString()} <span className="text-xs text-rose-500 font-bold">→ 0</span>
                    </div>
                    <div className="text-[9px] text-slate-400">Reset ke 0 pcs</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Antrian SO Pending</div>
                    <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">
                      {previewData.pendingSoCount.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-400">Akan dibersihkan</div>
                  </div>
                </div>

                {/* Sample items currently recorded */}
                {previewData.stockItems.length > 0 && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#131d31]">
                    <div className="px-3 py-2 bg-slate-100 dark:bg-[#0f172a] text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>Daftar Barang Saat Ini di Rak Terpilih ({previewData.stockItems.length} record):</span>
                      <span className="text-[10px] text-slate-400 font-normal">Menampilkan maks 5 sample</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-36 overflow-y-auto">
                      {previewData.stockItems.slice(0, 5).map((item, idx) => (
                        <div key={`${item.sku}_${item.lokasi}_${idx}`} className="px-3 py-1.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">{item.sku}</span>
                            <span className="text-slate-500 ml-2 text-[11px]">{item.nama_produk}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono">
                              {item.lokasi}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{item.sisa_stok} pcs</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Backup Download Button & Options */}
          <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Cadangkan Data Sebelum Dihapus (.JSON)
              </div>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                Unduh file snapshot cadangan agar riwayat log mutasi tetap dapat diarsipkan jika sewaktu-waktu dibutuhkan.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadBackup}
              disabled={targetLocations.length === 0}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 ${
                hasDownloadedBackup
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30'
              }`}
            >
              {hasDownloadedBackup ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              <span>{hasDownloadedBackup ? 'Backup Terunduh ✓' : 'Unduh Backup Sekarang'}</span>
            </button>
          </div>

          {/* Options & Double Confirmation */}
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deletePendingSo}
                onChange={(e) => setDeletePendingSo(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Otomatis hapus / batalkan juga antrian Stock Opname (SO) berstatus PENDING di lokasi ini
              </span>
            </label>

            <div className="p-3.5 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl space-y-2">
              <label className="text-xs font-extrabold text-rose-900 dark:text-rose-200 block">
                Konfirmasi Keamanan: Ketik <span className="font-mono bg-rose-200/80 dark:bg-rose-900 px-1.5 py-0.5 rounded text-rose-900 dark:text-rose-100 font-black">RESET-LOKASI</span> di bawah ini:
              </label>
              <input
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="Ketik RESET-LOKASI"
                className="w-full px-3 py-2 bg-white dark:bg-[#131d31] border border-rose-300 dark:border-rose-700 rounded-xl text-xs font-mono font-bold text-rose-900 dark:text-rose-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 uppercase"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0f172a]/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500">
            {targetLocations.length} lokasi terpilih untuk di-reset ke 0.
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleExecutePurge}
              disabled={!isConfirmed || targetLocations.length === 0 || isExecuting}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                isConfirmed && targetLocations.length > 0 && !isExecuting
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/25 active:scale-95'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
              }`}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Mereset Data...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus Log & Reset dari 0</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
