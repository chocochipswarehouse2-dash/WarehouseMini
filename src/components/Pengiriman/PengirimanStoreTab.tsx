import React, { useState, useEffect, useMemo } from 'react';
import {
  Store,
  Calendar,
  Layers,
  FileText,
  Plus,
  Trash2,
  Printer,
  Send,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  Truck,
  Box,
  ChevronRight,
  AlertCircle,
  Copy,
  QrCode,
  ArrowRight,
  RefreshCw,
  Eye,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import {
  UserSession,
  PengirimanStoreReport,
  PengirimanStoreItem,
  PengirimanStoreTrip,
  KoliMarkingLabel,
  SatuanPengirimanStore,
} from '../../types';
import {
  fetchPengirimanStoreReports,
  savePengirimanStoreReport,
  processKirimStoreReports,
  deletePengirimanStoreReport,
  generateKoliLabelsForReport,
  getTodayDateString,
  getCurrentTimeString,
} from '../../services/pengirimanStore';
import { fetchOutlets, DEFAULT_OUTLETS } from '../../services/gasManualShipment';
import { KoliMarkingPrintModal } from './KoliMarkingPrintModal';

interface PengirimanStoreTabProps {
  session?: UserSession | null;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface ItemInputRow {
  tempId: string;
  noSuratJalan: string;
  deskripsi: string;
  qty: number | '';
  satuan: SatuanPengirimanStore;
  keterangan: string;
}

export const PengirimanStoreTab: React.FC<PengirimanStoreTabProps> = ({
  session = null,
  onShowToast = () => {},
}) => {
  // Sub-tab Navigation
  const [activeSubTab, setActiveSubTab] = useState<'laporan' | 'dispatched' | 'kirim' | 'histori'>('laporan');

  // Master Store Data
  const [stores, setStores] = useState<{ id?: string; nama: string; fulfillment?: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState<boolean>(false);

  // Data Reports
  const [reports, setReports] = useState<PengirimanStoreReport[]>([]);
  const [loadingReports, setLoadingReports] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // FORM LAPORAN STATE
  // --------------------------------------------------------------------------
  const [storeTujuan, setStoreTujuan] = useState<string>('');
  const [customStoreInput, setCustomStoreInput] = useState<string>('');
  const [isCustomStore, setIsCustomStore] = useState<boolean>(false);
  const [tanggalLaporan, setTanggalLaporan] = useState<string>(getTodayDateString());
  const [defaultNoSuratJalan, setDefaultNoSuratJalan] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);

  // Dynamic multi-item input rows
  const [itemRows, setItemRows] = useState<ItemInputRow[]>([
    {
      tempId: 'row-1',
      noSuratJalan: '',
      deskripsi: '',
      qty: 1,
      satuan: 'Koli',
      keterangan: '',
    },
  ]);

  // --------------------------------------------------------------------------
  // DISPATCHED & SELECTION STATE
  // --------------------------------------------------------------------------
  const [searchDispatched, setSearchDispatched] = useState<string>('');
  const [filterStoreDispatched, setFilterStoreDispatched] = useState<string>('');
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);

  // --------------------------------------------------------------------------
  // TAB KIRIM (ATUR PENGIRIMAN) STATE
  // --------------------------------------------------------------------------
  const [tanggalKirim, setTanggalKirim] = useState<string>(getTodayDateString());
  const [waktuKirim, setWaktuKirim] = useState<string>(getCurrentTimeString());
  const [dikirimOleh, setDikirimOleh] = useState<string>('');
  const [armada, setArmada] = useState<string>('Mobil Box');
  const [noPolisi, setNoPolisi] = useState<string>('');
  const [catatanKirim, setCatatanKirim] = useState<string>('');
  const [isProcessingKirim, setIsProcessingKirim] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // HISTORI STATE
  // --------------------------------------------------------------------------
  const [searchHistori, setSearchHistori] = useState<string>('');
  const [filterStoreHistori, setFilterStoreHistori] = useState<string>('');
  const [selectedDetailReport, setSelectedDetailReport] = useState<PengirimanStoreReport | null>(null);

  // --------------------------------------------------------------------------
  // CETAK MODAL STATE
  // --------------------------------------------------------------------------
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [labelsToPrint, setLabelsToPrint] = useState<KoliMarkingLabel[]>([]);
  const [printModalTitle, setPrintModalTitle] = useState<string>('Cetak Barcode / QR Marking Koli');

  // Load initial data
  useEffect(() => {
    loadStoreList();
    loadReportsList();
  }, []);

  const loadStoreList = async () => {
    setLoadingStores(true);
    try {
      const data = await fetchOutlets();
      if (data && data.length > 0) {
        setStores(data);
        if (!storeTujuan) setStoreTujuan(data[0].nama);
      } else {
        setStores(DEFAULT_OUTLETS);
        if (!storeTujuan) setStoreTujuan(DEFAULT_OUTLETS[0].nama);
      }
    } catch {
      setStores(DEFAULT_OUTLETS);
    } finally {
      setLoadingStores(false);
    }
  };

  const loadReportsList = async () => {
    setLoadingReports(true);
    try {
      const data = await fetchPengirimanStoreReports();
      setReports(data || []);
    } catch (e) {
      console.warn('Gagal memuat laporan pengiriman store:', e);
    } finally {
      setLoadingReports(false);
    }
  };

  // Reports categorization
  const dispatchedReports = useMemo(() => {
    return reports.filter((r) => r.status === 'dispatched');
  }, [reports]);

  const sentReports = useMemo(() => {
    return reports.filter((r) => r.status === 'sent');
  }, [reports]);

  const totalDispatchedKoli = useMemo(() => {
    return dispatchedReports.reduce((acc, r) => acc + (r.total_koli || 0), 0);
  }, [dispatchedReports]);

  // --------------------------------------------------------------------------
  // ITEM ROWS HANDLERS (MULTI-ITEM SUBMIT)
  // --------------------------------------------------------------------------
  const handleAddRow = () => {
    setItemRows((prev) => [
      ...prev,
      {
        tempId: `row-${Date.now()}-${Math.random()}`,
        noSuratJalan: defaultNoSuratJalan || '',
        deskripsi: '',
        qty: 1,
        satuan: 'Koli',
        keterangan: '',
      },
    ]);
  };

  const handleDuplicateRow = (index: number) => {
    const target = itemRows[index];
    if (!target) return;
    const duplicated: ItemInputRow = {
      ...target,
      tempId: `row-${Date.now()}-${Math.random()}`,
    };
    const updated = [...itemRows];
    updated.splice(index + 1, 0, duplicated);
    setItemRows(updated);
  };

  const handleRemoveRow = (index: number) => {
    if (itemRows.length <= 1) {
      onShowToast('Minimal harus ada 1 barang dalam laporan', 'warning');
      return;
    }
    setItemRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateRow = (index: number, field: keyof ItemInputRow, val: any) => {
    setItemRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Calculate live total koli in form
  const formCalculatedKoli = useMemo(() => {
    return itemRows.reduce((acc, row) => {
      const q = Math.max(1, Number(row.qty) || 1);
      if (row.satuan === 'Pcs') {
        return acc + 1; // 1 koli jika satuan pcs
      }
      return acc + q; // sejumlah qty jika satuan koli
    }, 0);
  }, [itemRows]);

  // --------------------------------------------------------------------------
  // SUBMIT FORM LAPORAN KE DISPATCHED
  // --------------------------------------------------------------------------
  const handleSubmitReport = async (autoPrint: boolean = false) => {
    const finalStore = isCustomStore ? customStoreInput.trim() : storeTujuan;

    if (!finalStore) {
      onShowToast('Pilih atau masukkan Store Tujuan', 'warning');
      return;
    }

    // Validate rows
    const invalidRow = itemRows.find((r) => !r.deskripsi.trim());
    if (invalidRow) {
      onShowToast('Deskripsi barang tidak boleh kosong pada setiap baris', 'warning');
      return;
    }

    setIsSubmittingReport(true);
    try {
      const sanitizedItems: PengirimanStoreItem[] = itemRows.map((r, idx) => {
        const rawQty = Math.max(1, Number(r.qty) || 1);
        const sj = r.noSuratJalan.trim() || defaultNoSuratJalan.trim() || 'Tidak ada no surat jalan';
        const isPcs = r.satuan === 'Pcs';
        const hitungKoli = isPcs ? 1 : Math.max(1, Math.round(rawQty));

        return {
          id: `item-${Date.now()}-${idx}`,
          no_surat_jalan: sj,
          deskripsi: r.deskripsi.trim(),
          qty: rawQty,
          satuan: r.satuan,
          hitung_koli: hitungKoli,
          keterangan: r.keterangan?.trim() || '',
        };
      });

      const res = await savePengirimanStoreReport({
        store_tujuan: finalStore,
        tanggal_laporan: tanggalLaporan,
        items: sanitizedItems,
        total_item_count: sanitizedItems.length,
        total_koli: sanitizedItems.reduce((acc, c) => acc + c.hitung_koli, 0),
        pic_nama: session?.name || 'Petugas Gudang',
        pic_username: session?.username || 'operator',
      });

      if (res.success && res.data) {
        onShowToast(res.message, 'success');
        await loadReportsList();

        // If auto print requested
        if (autoPrint) {
          const generatedLabels = generateKoliLabelsForReport(res.data);
          setLabelsToPrint(generatedLabels);
          setPrintModalTitle(`Cetak Label Marking: ${res.data.store_tujuan} (${res.data.total_koli} Koli)`);
          setPrintModalOpen(true);
        }

        // Reset form to fresh row
        setItemRows([
          {
            tempId: `row-${Date.now()}`,
            noSuratJalan: '',
            deskripsi: '',
            qty: 1,
            satuan: 'Koli',
            keterangan: '',
          },
        ]);
        setDefaultNoSuratJalan('');

        // Move user to Dispatched tab to see their report
        if (!autoPrint) {
          setActiveSubTab('dispatched');
        }
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal menyimpan laporan', 'error');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // --------------------------------------------------------------------------
  // DISPATCHED TAB ACTIONS
  // --------------------------------------------------------------------------
  const handleToggleSelectReport = (reportId: string) => {
    setSelectedReportIds((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    );
  };

  const handleSelectAllDispatched = () => {
    if (selectedReportIds.length === filteredDispatched.length) {
      setSelectedReportIds([]);
    } else {
      setSelectedReportIds(filteredDispatched.map((r) => r.id));
    }
  };

  const handlePrintLabelsForReport = (report: PengirimanStoreReport) => {
    const labels = generateKoliLabelsForReport(report);
    setLabelsToPrint(labels);
    setPrintModalTitle(`Cetak Label Koli: ${report.store_tujuan} (${report.total_koli} Koli)`);
    setPrintModalOpen(true);
  };

  const handlePrintSelectedLabels = () => {
    if (selectedReportIds.length === 0) return;
    const selected = dispatchedReports.filter((r) => selectedReportIds.includes(r.id));
    const allLabels: KoliMarkingLabel[] = [];
    selected.forEach((r) => {
      allLabels.push(...generateKoliLabelsForReport(r));
    });

    setLabelsToPrint(allLabels);
    setPrintModalTitle(`Cetak Batch: ${selected.length} Laporan (${allLabels.length} Label Koli)`);
    setPrintModalOpen(true);
  };

  const handleDeleteReport = async (report: PengirimanStoreReport) => {
    if (!window.confirm(`Hapus laporan pengiriman ke "${report.store_tujuan}" (${report.id})?`)) return;
    const res = await deletePengirimanStoreReport(report.id);
    if (res.success) {
      onShowToast(res.message, 'success');
      setSelectedReportIds((prev) => prev.filter((id) => id !== report.id));
      await loadReportsList();
    } else {
      onShowToast(res.message, 'error');
    }
  };

  const handleGoToKirimWithSelected = (reportId?: string) => {
    if (reportId) {
      setSelectedReportIds([reportId]);
    }
    setActiveSubTab('kirim');
  };

  // Filtered Dispatched List
  const filteredDispatched = useMemo(() => {
    return dispatchedReports.filter((r) => {
      const matchStore = !filterStoreDispatched || r.store_tujuan === filterStoreDispatched;
      const q = searchDispatched.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.store_tujuan.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.items.some(
          (it) => it.deskripsi.toLowerCase().includes(q) || it.no_surat_jalan.toLowerCase().includes(q)
        );
      return matchStore && matchSearch;
    });
  }, [dispatchedReports, filterStoreDispatched, searchDispatched]);

  // --------------------------------------------------------------------------
  // TAB KIRIM: PROSES PENGIRIMAN
  // --------------------------------------------------------------------------
  const selectedDispatchedObjects = useMemo(() => {
    return dispatchedReports.filter((r) => selectedReportIds.includes(r.id));
  }, [dispatchedReports, selectedReportIds]);

  const totalKoliToShip = useMemo(() => {
    return selectedDispatchedObjects.reduce((acc, r) => acc + r.total_koli, 0);
  }, [selectedDispatchedObjects]);

  const targetStoresInTrip = useMemo(() => {
    return Array.from(new Set(selectedDispatchedObjects.map((r) => r.store_tujuan)));
  }, [selectedDispatchedObjects]);

  const handleConfirmKirim = async () => {
    if (selectedReportIds.length === 0) {
      onShowToast('Pilih minimal 1 laporan dispatched yang akan dikirim', 'warning');
      return;
    }

    if (!dikirimOleh.trim()) {
      onShowToast('Masukkan nama pengirim / driver yang membawa barang', 'warning');
      return;
    }

    setIsProcessingKirim(true);
    try {
      const res = await processKirimStoreReports({
        report_ids: selectedReportIds,
        tanggal_kirim: tanggalKirim,
        waktu_kirim: waktuKirim,
        dikirim_oleh: dikirimOleh.trim(),
        armada: armada.trim(),
        no_polisi: noPolisi.trim(),
        catatan: catatanKirim.trim(),
        pic_nama: session?.name || 'Petugas Gudang',
        pic_username: session?.username || 'operator',
      });

      if (res.success) {
        onShowToast(res.message, 'success');
        setSelectedReportIds([]);
        setDikirimOleh('');
        setNoPolisi('');
        setCatatanKirim('');
        await loadReportsList();
        setActiveSubTab('histori');
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal memproses pengiriman', 'error');
    } finally {
      setIsProcessingKirim(false);
    }
  };

  // --------------------------------------------------------------------------
  // HISTORI FILTER & LIST
  // --------------------------------------------------------------------------
  const filteredHistori = useMemo(() => {
    return sentReports.filter((r) => {
      const matchStore = !filterStoreHistori || r.store_tujuan === filterStoreHistori;
      const q = searchHistori.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.store_tujuan.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.dikirim_oleh && r.dikirim_oleh.toLowerCase().includes(q)) ||
        (r.trip_id && r.trip_id.toLowerCase().includes(q)) ||
        r.items.some(
          (it) => it.deskripsi.toLowerCase().includes(q) || it.no_surat_jalan.toLowerCase().includes(q)
        );
      return matchStore && matchSearch;
    });
  }, [sentReports, filterStoreHistori, searchHistori]);

  return (
    <div className="space-y-4">
      {/* Sub-Tabs Selector Header */}
      <div className="bg-white dark:bg-[#131d31] p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 w-full sm:w-auto">
          {/* 1. Form Laporan Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('laporan')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'laporan'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Form Laporan</span>
          </button>

          {/* 2. Dispatched Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('dispatched')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none relative ${
              activeSubTab === 'dispatched'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Box className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Dispatched</span>
            {dispatchedReports.length > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeSubTab === 'dispatched'
                    ? 'bg-white text-amber-700'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                }`}
              >
                {dispatchedReports.length} ({totalDispatchedKoli} Koli)
              </span>
            )}
          </button>

          {/* 3. Kirim Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('kirim')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'kirim'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Kirim</span>
            {selectedReportIds.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                {selectedReportIds.length}
              </span>
            )}
          </button>

          {/* 4. Histori Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('histori')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'histori'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Histori</span>
            {sentReports.length > 0 && (
              <span className="ml-1 text-[11px] opacity-80">({sentReports.length})</span>
            )}
          </button>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={loadReportsList}
          disabled={loadingReports}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Segarkan Data"
        >
          <RefreshCw className={`w-4 h-4 ${loadingReports ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. SUB-TAB: FORM LAPORAN (INPUT BARANG DIKIRIM)                      */}
      {/* ==================================================================== */}
      {activeSubTab === 'laporan' && (
        <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-5">
          {/* Header Card Section */}
          <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Form Laporan Pengiriman Store
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Input pengiriman barang ke cabang toko / outlet. Bisa input banyak barang dalam 1 submit.
                </p>
              </div>

              {/* Live Koli Counter */}
              <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 px-3 py-1.5 rounded-xl">
                <Box className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <div className="text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Total Koli: </span>
                  <span className="font-black text-indigo-700 dark:text-indigo-300 text-sm">
                    {formCalculatedKoli} Koli
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">({itemRows.length} Barang)</span>
                </div>
              </div>
            </div>

            {/* Form Fields: Store Tujuan, Tanggal, Default No SJ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              {/* Store Tujuan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-indigo-500" />
                  Store Tujuan <span className="text-rose-500">*</span>
                </label>
                {!isCustomStore ? (
                  <div className="flex gap-1.5">
                    <select
                      value={storeTujuan}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomStore(true);
                          setCustomStoreInput('');
                        } else {
                          setStoreTujuan(e.target.value);
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {stores.map((s, idx) => (
                        <option key={s.id || idx} value={s.nama}>
                          {s.nama}
                        </option>
                      ))}
                      <option value="__custom__">+ Tulis Store Lainnya (Manual)...</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Ketik nama store tujuan..."
                      value={customStoreInput}
                      onChange={(e) => setCustomStoreInput(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-indigo-400 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setIsCustomStore(false)}
                      className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>

              {/* Tanggal Laporan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Tanggal Laporan
                </label>
                <input
                  type="date"
                  value={tanggalLaporan}
                  onChange={(e) => setTanggalLaporan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Default No Surat Jalan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  No Surat Jalan (Umum)
                  <span className="text-[10px] text-slate-400 font-normal">(opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Jika kosong: 'Tidak ada no surat jalan'"
                  value={defaultNoSuratJalan}
                  onChange={(e) => setDefaultNoSuratJalan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section: Dynamic Multi-Item Barang Dikirim */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Daftar Barang Dikirim ({itemRows.length})
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  • Satuan <strong className="text-indigo-600 dark:text-indigo-400">Pcs</strong> dihitung 1 koli, satuan <strong className="text-indigo-600 dark:text-indigo-400">Koli</strong> dihitung per koli
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddRow}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/60 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Barang
              </button>
            </div>

            {/* Item Rows Cards/Table */}
            <div className="space-y-2.5">
              {itemRows.map((row, idx) => {
                const hitungKoliThisRow =
                  row.satuan === 'Pcs' ? 1 : Math.max(1, Number(row.qty) || 1);

                return (
                  <div
                    key={row.tempId}
                    className="p-3 bg-slate-50/90 dark:bg-slate-800/40 rounded-xl border border-slate-200/90 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center gap-2.5 transition-all hover:border-indigo-300 dark:hover:border-indigo-700"
                  >
                    {/* Index Indicator */}
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[11px] font-black flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>

                    {/* No Surat Jalan (Item specific) */}
                    <div className="w-full md:w-44 space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 md:hidden">
                        No Surat Jalan
                      </label>
                      <input
                        type="text"
                        placeholder={defaultNoSuratJalan || 'Tidak ada no surat jalan'}
                        value={row.noSuratJalan}
                        onChange={(e) => handleUpdateRow(idx, 'noSuratJalan', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    {/* Deskripsi Barang (Manual Text) */}
                    <div className="flex-1 w-full space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 md:hidden">
                        Deskripsi Barang <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Kemeja Flanel Men (Navy/Hitam), Hanger Display, dll."
                        value={row.deskripsi}
                        onChange={(e) => handleUpdateRow(idx, 'deskripsi', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    {/* Qty & Satuan */}
                    <div className="flex items-center gap-1.5 w-full md:w-auto">
                      <div className="w-20">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 md:hidden block">
                          Qty
                        </label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={row.qty}
                          onChange={(e) =>
                            handleUpdateRow(
                              idx,
                              'qty',
                              e.target.value === '' ? '' : Math.max(1, Number(e.target.value))
                            )
                          }
                          className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-black text-center text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>

                      <div className="w-24">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 md:hidden block">
                          Satuan
                        </label>
                        <select
                          value={row.satuan}
                          onChange={(e) =>
                            handleUpdateRow(idx, 'satuan', e.target.value as SatuanPengirimanStore)
                          }
                          className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                        >
                          <option value="Koli">Koli</option>
                          <option value="Pcs">Pcs</option>
                        </select>
                      </div>

                      {/* Calculated Koli pill */}
                      <div className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-md text-[10px] font-black shrink-0 border border-indigo-200 dark:border-indigo-800/50">
                        ={hitungKoliThisRow} Koli
                      </div>
                    </div>

                    {/* Actions: Duplicate & Delete */}
                    <div className="flex items-center gap-1 self-end md:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDuplicateRow(idx)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Duplikat Baris"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {itemRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                          title="Hapus Baris"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form Action Buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Disimpan ke tab <strong className="text-amber-600 dark:text-amber-400">Dispatched (Ready Kirim)</strong> dengan barcode/marking koli.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSubmitReport(false)}
                disabled={isSubmittingReport}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Box className="w-4 h-4 text-amber-500" />
                <span>Simpan ke Dispatched</span>
              </button>

              <button
                type="button"
                onClick={() => handleSubmitReport(true)}
                disabled={isSubmittingReport}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25 flex items-center gap-2 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Submit & Cetak Barcode Koli</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. SUB-TAB: DISPATCHED (READY KIRIM)                                 */}
      {/* ==================================================================== */}
      {activeSubTab === 'dispatched' && (
        <div className="space-y-3">
          {/* Toolbar: Search, Filter Store, & Multi-Select Action */}
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Store, No SJ, atau Deskripsi..."
                  value={searchDispatched}
                  onChange={(e) => setSearchDispatched(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Filter Store */}
              <select
                value={filterStoreDispatched}
                onChange={(e) => setFilterStoreDispatched(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="">Semua Store Tujuan</option>
                {stores.map((s, idx) => (
                  <option key={s.id || idx} value={s.nama}>
                    {s.nama}
                  </option>
                ))}
              </select>

              {/* Select All Toggle */}
              {filteredDispatched.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllDispatched}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {selectedReportIds.length === filteredDispatched.length ? (
                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>Pilih Semua ({filteredDispatched.length})</span>
                </button>
              )}
            </div>

            {/* Batch Action Bar if selected */}
            {selectedReportIds.length > 0 && (
              <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                  {selectedReportIds.length} Terpilih
                </span>

                <button
                  type="button"
                  onClick={handlePrintSelectedLabels}
                  className="px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak Barcode
                </button>

                <button
                  type="button"
                  onClick={() => handleGoToKirimWithSelected()}
                  className="px-3 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Atur Pengiriman
                </button>
              </div>
            )}
          </div>

            {/* Dispatched Cards Grid */}
            {filteredDispatched.length === 0 ? (
              <div className="bg-white dark:bg-[#131d31] p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                <Box className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Tidak ada laporan di antrean Dispatched
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Semua barang telah dikirim atau belum ada input baru. Buat laporan di tab{' '}
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('laporan')}
                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    Form Laporan
                  </button>
                  .
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredDispatched.map((rep) => {
                  const isChecked = selectedReportIds.includes(rep.id);

                  return (
                    <div
                      key={rep.id}
                      className={`bg-white dark:bg-[#131d31] rounded-2xl border transition-all p-4 space-y-3 ${
                        isChecked
                          ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                          : 'border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={() => handleToggleSelectReport(rep.id)}
                            className="mt-0.5 text-slate-400 hover:text-indigo-600 transition-colors"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-5 h-5 text-indigo-600" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-400" />
                            )}
                          </button>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                                <Store className="w-4 h-4 text-indigo-500" />
                                {rep.store_tujuan}
                              </h4>
                              <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Ready Kirim
                              </span>
                              <span className="text-xs font-mono text-slate-400">({rep.id})</span>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {rep.tanggal_laporan}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5" />
                                PIC: {rep.pic_nama}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Total Koli Badge */}
                        <div className="text-right shrink-0">
                          <div className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-3 py-1 rounded-xl text-right">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Koli</span>
                            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                              {rep.total_koli} Koli
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Items Rincian List */}
                      <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800/80">
                        <div className="text-[10px] font-black uppercase text-slate-500 mb-1.5">
                          Rincian Barang ({rep.items.length} item):
                        </div>
                        <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60 text-xs">
                          {rep.items.map((it, itIdx) => (
                            <div key={it.id || itIdx} className="py-1.5 flex justify-between items-center gap-2">
                              <div className="flex-1 truncate">
                                <span className="font-mono text-[11px] text-slate-500 mr-2">
                                  [{it.no_surat_jalan}]
                                </span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {it.deskripsi}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-slate-600 dark:text-slate-400 font-semibold">
                                  {it.qty} {it.satuan}
                                </span>
                                <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-black text-[10px] px-1.5 py-0.5 rounded-sm">
                                  {it.hitung_koli} Koli
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons per Report */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteReport(rep)}
                          className="text-xs text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 font-bold flex items-center gap-1 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2 py-1 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handlePrintLabelsForReport(rep)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Cetak Barcode / QR ({rep.total_koli} Label)
                          </button>

                          <button
                            type="button"
                            onClick={() => handleGoToKirimWithSelected(rep.id)}
                            className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Kirim Sekarang
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. SUB-TAB: KIRIM (ATUR PENGIRIMAN)                                  */}
      {/* ==================================================================== */}
      {activeSubTab === 'kirim' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left / Top 2 Cols: Form Atur Pengiriman */}
          <div className="lg:col-span-2 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Atur Pengiriman Toko
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Konfirmasi keberangkatan barang dari status <span className="font-bold text-amber-600">Dispatched</span> menuju toko tujuan.
              </p>
            </div>

            {/* Input Trip Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Tanggal Kirim */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Tanggal Kirim <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={tanggalKirim}
                  onChange={(e) => setTanggalKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Waktu Kirim */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Jam Berangkat
                </label>
                <input
                  type="time"
                  value={waktuKirim}
                  onChange={(e) => setWaktuKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Dikirim Oleh Siapa */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                  Dikirim Oleh (Driver / Kurir) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pak Joko (Driver Internal) / Nama Staff"
                  value={dikirimOleh}
                  onChange={(e) => setDikirimOleh(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                {/* Quick picker suggestion */}
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {['Driver Toko Internal', 'Kurir Operasional', 'Staff Logistik'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setDikirimOleh(sug)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Armada / Kendaraan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-slate-400" />
                  Jenis Kendaraan / Armada
                </label>
                <select
                  value={armada}
                  onChange={(e) => setArmada(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="Mobil Box">Mobil Box</option>
                  <option value="Blind Van / GranMax">Blind Van / GranMax</option>
                  <option value="Mobil Pick-up">Mobil Pick-up</option>
                  <option value="Motor Kurir Toko">Motor Kurir Toko</option>
                  <option value="Ekspedisi Rekanan (Lalamove/Deliveree)">Ekspedisi Rekanan (Lalamove/Deliveree)</option>
                  <option value="Lainnya">Lainnya...</option>
                </select>
              </div>

              {/* No Polisi Kendaraan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nomor Polisi Kendaraan <span className="text-[10px] text-slate-400 font-normal">(opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: B 1234 CD"
                  value={noPolisi}
                  onChange={(e) => setNoPolisi(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono uppercase text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Catatan Pengiriman */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Catatan Pengiriman / Keterangan Trip
                </label>
                <input
                  type="text"
                  placeholder="Catatan tambahan untuk store atau driver..."
                  value={catatanKirim}
                  onChange={(e) => setCatatanKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Confirm Send Button */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleConfirmKirim}
                disabled={isProcessingKirim || selectedReportIds.length === 0}
                className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>Konfirmasi Pengiriman ({totalKoliToShip} Koli)</span>
              </button>
            </div>
          </div>

          {/* Right Col: Selected Dispatched Manifest Preview */}
          <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                Barang yang Diberangkatkan
              </h4>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full">
                {selectedReportIds.length} Laporan
              </span>
            </div>

            {selectedDispatchedObjects.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                <Box className="w-8 h-8 text-slate-300 mx-auto" />
                <p>Belum ada laporan dispatched yang dipilih.</p>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('dispatched')}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  Pilih dari tab Dispatched
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {selectedDispatchedObjects.map((r) => (
                  <div
                    key={r.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-black text-xs uppercase text-slate-900 dark:text-white">
                        {r.store_tujuan}
                      </span>
                      <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">
                        {r.total_koli} Koli
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      {r.items.map((it, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="truncate max-w-[160px]">• {it.deskripsi}</span>
                          <span className="font-semibold">
                            {it.qty} {it.satuan}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Total Manifest Summary */}
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex justify-between items-center text-xs font-bold">
                  <span className="text-indigo-950 dark:text-indigo-200">Total Muatan:</span>
                  <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                    {totalKoliToShip} Koli ({targetStoresInTrip.length} Store)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. SUB-TAB: HISTORI PENGIRIMAN                                       */}
      {/* ==================================================================== */}
      {activeSubTab === 'histori' && (
        <div className="space-y-3">
          {/* Toolbar: Search & Filter */}
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Store, Driver, No SJ..."
                  value={searchHistori}
                  onChange={(e) => setSearchHistori(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <select
                value={filterStoreHistori}
                onChange={(e) => setFilterStoreHistori(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="">Semua Store Tujuan</option>
                {stores.map((s, idx) => (
                  <option key={s.id || idx} value={s.nama}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Total <strong className="text-emerald-600 dark:text-emerald-400">{filteredHistori.length}</strong> Pengiriman Terkirim
            </div>
          </div>

          {/* Histori Table / Cards */}
          {filteredHistori.length === 0 ? (
            <div className="bg-white dark:bg-[#131d31] p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <Clock className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Belum ada histori pengiriman
              </h4>
              <p className="text-xs text-slate-500">
                Laporan yang telah diproses di tab Kirim akan otomatis tercatat di sini.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-3">Tgl / Jam Kirim</th>
                      <th className="px-3.5 py-3">Store Tujuan</th>
                      <th className="px-3.5 py-3">Dikirim Oleh</th>
                      <th className="px-3.5 py-3">Armada / Nopol</th>
                      <th className="px-3.5 py-3">Jumlah Koli</th>
                      <th className="px-3.5 py-3">Status</th>
                      <th className="px-3.5 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredHistori.map((rep) => (
                      <tr
                        key={rep.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {rep.tanggal_kirim || rep.tanggal_laporan}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {rep.waktu_kirim ? `${rep.waktu_kirim} WIB` : '-'}
                          </div>
                        </td>

                        <td className="px-3.5 py-3">
                          <div className="font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-indigo-500" />
                            {rep.store_tujuan}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{rep.id}</div>
                        </td>

                        <td className="px-3.5 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {rep.dikirim_oleh || '-'}
                        </td>

                        <td className="px-3.5 py-3 text-slate-600 dark:text-slate-400">
                          <div>{rep.armada || '-'}</div>
                          {rep.no_polisi && (
                            <span className="text-[10px] font-mono font-bold text-slate-500">
                              {rep.no_polisi}
                            </span>
                          )}
                        </td>

                        <td className="px-3.5 py-3">
                          <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-black px-2 py-0.5 rounded-md">
                            {rep.total_koli} Koli
                          </span>
                        </td>

                        <td className="px-3.5 py-3">
                          <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-black text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 w-fit uppercase">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Terkirim
                          </span>
                        </td>

                        <td className="px-3.5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedDetailReport(rep)}
                              className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            >
                              Detail
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintLabelsForReport(rep)}
                              className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                              title="Cetak Ulang Label Barcode/QR"
                            >
                              <Printer className="w-3 h-3" />
                              Label
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* DETAIL REPORT MODAL                                                  */}
      {/* ==================================================================== */}
      {selectedDetailReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase">
                  Detail Pengiriman ke {selectedDetailReport.store_tujuan}
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">{selectedDetailReport.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailReport(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-[10px]">Tgl & Jam Kirim:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedDetailReport.tanggal_kirim || selectedDetailReport.tanggal_laporan}{' '}
                    {selectedDetailReport.waktu_kirim && `(${selectedDetailReport.waktu_kirim} WIB)`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Dikirim Oleh (Driver):</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedDetailReport.dikirim_oleh || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Armada / No Polisi:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedDetailReport.armada || '-'} {selectedDetailReport.no_polisi && `(${selectedDetailReport.no_polisi})`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Total Koli:</span>
                  <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
                    {selectedDetailReport.total_koli} Koli
                  </span>
                </div>
              </div>

              {/* Rincian Barang */}
              <div>
                <div className="font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Rincian Barang ({selectedDetailReport.items.length}):
                </div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {selectedDetailReport.items.map((it, i) => (
                    <div key={i} className="p-2 flex justify-between items-center text-[11px]">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">{it.deskripsi}</div>
                        <div className="text-[10px] text-slate-400 font-mono">SJ: {it.no_surat_jalan}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{it.qty} {it.satuan}</div>
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-black">{it.hitung_koli} Koli</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedDetailReport.catatan_kirim && (
                <div className="text-slate-500 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60">
                  <strong className="text-amber-800 dark:text-amber-300">Catatan: </strong>
                  {selectedDetailReport.catatan_kirim}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setSelectedDetailReport(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePrintLabelsForReport(selectedDetailReport);
                  setSelectedDetailReport(null);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Label Koli
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL CETAK BARCODE / QR MARKING KOLI                                */}
      {/* ==================================================================== */}
      <KoliMarkingPrintModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        labels={labelsToPrint}
        title={printModalTitle}
      />
    </div>
  );
};
