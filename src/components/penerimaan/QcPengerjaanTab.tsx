import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Scissors,
  Sparkles,
  Users,
  Play,
  Printer,
  Share2,
  Calendar,
  Building2,
  ChevronRight,
  Sparkle,
  Image as ImageIcon,
  Check,
  Plus,
  Factory,
  ArrowLeftRight,
  ArrowDownToLine,
  Truck,
  Package,
} from 'lucide-react';
import {
  UserSession,
  PenerimaanProduksiItem,
  QcPengerjaanJob,
  ProductItem,
  PengecekanSJRecord,
} from '../../types';
import {
  getSavedQcJobsFromLocal,
  buildOrGetQcJob,
  buildOrGetQcMutasiJob,
  buildOrGetQcMutasiJobFromRecord,
  extractProductInfoFromSJItem,
  saveSingleQcJob,
} from '../../services/qcPengerjaanService';
import {
  fetchTarikanMDRecords,
  getCachedPengecekanSJList,
} from '../../services/gasTarikanMD';
import { QcPengerjaanWorkspace } from './QcPengerjaanWorkspace';
import { QcBeritaAcaraModal } from './QcBeritaAcaraModal';

interface QcPengerjaanTabProps {
  session: UserSession | null;
  penerimaanItems: PenerimaanProduksiItem[];
  productCatalog?: ProductItem[];
  targetJobCode?: string; // Optional deep-link target kode produksi
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export type QcModeType = 'PRODUKSI' | 'MUTASI';

export const QcPengerjaanTab: React.FC<QcPengerjaanTabProps> = ({
  session,
  penerimaanItems,
  productCatalog = [],
  targetJobCode,
  onShowToast,
}) => {
  const [qcMode, setQcMode] = useState<QcModeType>('PRODUKSI');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('Semua');
  const [filterKategori, setFilterKategori] = useState<string>('Semua');
  const [beritaAcaraJob, setBeritaAcaraJob] = useState<QcPengerjaanJob | null>(null);
  
  // Mutasi records from Pengecekan Surat Jalan
  const [mutasiRecords, setMutasiRecords] = useState<PengecekanSJRecord[]>(() => getCachedPengecekanSJList());
  const [loadingMutasi, setLoadingMutasi] = useState<boolean>(false);

  // Load Pengecekan SJ records on mount and refresh
  const loadMutasiSJ = async () => {
    setLoadingMutasi(true);
    try {
      const data = await fetchTarikanMDRecords();
      setMutasiRecords(data);
    } catch {
      // silent fallback to cached
    } finally {
      setLoadingMutasi(false);
    }
  };

  useEffect(() => {
    loadMutasiSJ();
  }, []);

  // 1. Group items for QC PRODUKSI (dari Form Penerimaan Produksi)
  const produksiJobs: QcPengerjaanJob[] = useMemo(() => {
    const map = new Map<string, PenerimaanProduksiItem[]>();

    (penerimaanItems || []).forEach((item) => {
      const sj = (item.no_surat_jalan || 'TANPA_SJ').trim().toUpperCase();
      const kode = (item.kode_produksi || 'TANPA_KODE').trim().toUpperCase();
      const key = `${sj}___${kode}`;

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    });

    const jobs: QcPengerjaanJob[] = [];
    const currentUserName = session?.name || session?.username || '';

    map.forEach((items, key) => {
      const [sj, kode] = key.split('___');
      const job = buildOrGetQcJob(items, sj, kode, currentUserName);
      jobs.push(job);
    });

    return jobs;
  }, [penerimaanItems, session]);

  // 2. Group items for QC MUTASI (1 Surat Jalan + Store = 1 Master QC Job Card)
  const mutasiJobs: QcPengerjaanJob[] = useMemo(() => {
    const jobs: QcPengerjaanJob[] = [];
    const currentUserName = session?.name || session?.username || '';
    const savedLocalJobs = getSavedQcJobsFromLocal();

    // Filter mutasiRecords to only 'Penerimaan' or destination to Warehouse/Gudang
    const penerimaanSJRecords = (mutasiRecords || []).filter((rec) => {
      const isExplicitPenerimaan = rec.tipe_import === 'Penerimaan';
      const dest = (rec.destination || '').toLowerCase();
      const isDestWarehouse = dest.includes('warehouse') || dest.includes('gudang') || dest.includes('pusat');
      return isExplicitPenerimaan || (!rec.tipe_import && isDestWarehouse);
    });

    const processedJobIds = new Set<string>();

    penerimaanSJRecords.forEach((rec) => {
      const job = buildOrGetQcMutasiJobFromRecord(rec, currentUserName);
      processedJobIds.add(job.id);
      jobs.push(job);
    });

    // Also include any locally saved jobs with source_type === 'MUTASI' not yet in list
    Object.values(savedLocalJobs).forEach((j) => {
      if (j.source_type === 'MUTASI' && !processedJobIds.has(j.id)) {
        jobs.push(j);
      }
    });

    return jobs;
  }, [mutasiRecords, session]);

  // Current active job pool based on selected QC Mode
  const currentJobsPool = useMemo(() => {
    return qcMode === 'PRODUKSI' ? produksiJobs : mutasiJobs;
  }, [qcMode, produksiJobs, mutasiJobs]);

  // Deep-link to targetJobCode if specified
  useEffect(() => {
    if (targetJobCode) {
      const cleanTarget = targetJobCode.trim().toUpperCase();
      // Check in current pool or switch mode if found in other pool
      let match = currentJobsPool.find(
        (j) => j.kode_produksi.trim().toUpperCase() === cleanTarget
      );
      if (!match) {
        // Try other pool
        const otherPool = qcMode === 'PRODUKSI' ? mutasiJobs : produksiJobs;
        const otherMatch = otherPool.find(
          (j) => j.kode_produksi.trim().toUpperCase() === cleanTarget
        );
        if (otherMatch) {
          setQcMode(qcMode === 'PRODUKSI' ? 'MUTASI' : 'PRODUKSI');
          match = otherMatch;
        }
      }
      if (match) {
        setActiveJobId(match.id);
      }
    }
  }, [targetJobCode, currentJobsPool, mutasiJobs, produksiJobs, qcMode]);

  // Active Job instance
  const activeJob = useMemo(() => {
    if (!activeJobId) return null;
    return (
      produksiJobs.find((j) => j.id === activeJobId) ||
      mutasiJobs.find((j) => j.id === activeJobId) ||
      getSavedQcJobsFromLocal()[activeJobId] ||
      null
    );
  }, [activeJobId, produksiJobs, mutasiJobs]);

  // Filtered Job List
  const filteredJobs = useMemo(() => {
    return currentJobsPool.filter((j) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKode = j.kode_produksi.toLowerCase().includes(q);
        const matchNama = (j.nama_produk || '').toLowerCase().includes(q);
        const matchSj = j.no_surat_jalan.toLowerCase().includes(q);
        const matchWarna = (j.warna || '').toLowerCase().includes(q);
        const matchKategori = (j.kategori || '').toLowerCase().includes(q);
        const matchPic = (j.pic_list || []).some((p) => p.toLowerCase().includes(q));
        if (!matchKode && !matchNama && !matchSj && !matchWarna && !matchKategori && !matchPic) return false;
      }

      // Filter Status
      if (filterStatus !== 'Semua') {
        if (filterStatus === 'Menunggu' && j.status !== 'DRAFT') return false;
        if (filterStatus === 'Pengerjaan' && j.status !== 'IN_PROGRESS') return false;
        if (filterStatus === 'Selesai' && j.status !== 'COMPLETED') return false;
      }

      // Filter Kategori
      if (filterKategori !== 'Semua') {
        if (j.kategori !== filterKategori) return false;
      }

      return true;
    });
  }, [currentJobsPool, searchQuery, filterStatus, filterKategori]);

  // Overall KPI calculation for active pool
  const kpis = useMemo(() => {
    let totalJobs = currentJobsPool.length;
    let completedJobs = 0;
    let inProgressJobs = 0;
    let draftJobs = 0;
    let totalQtyAwal = 0;
    let totalQtyDiperiksa = 0;
    let totalQtyOke = 0;
    let totalQtyReject = 0;

    currentJobsPool.forEach((j) => {
      if (j.status === 'COMPLETED') completedJobs++;
      else if (j.status === 'IN_PROGRESS') inProgressJobs++;
      else draftJobs++;

      totalQtyAwal += j.total_qty_awal || 0;
      totalQtyDiperiksa += j.total_diperiksa || 0;
      totalQtyOke += j.total_qty_oke || 0;
      totalQtyReject += (j.total_qty_noda || 0) + (j.total_qty_permak || 0) + (j.total_qty_defect || 0);
    });

    const avgPassRate =
      totalQtyDiperiksa > 0
        ? Math.round((totalQtyOke / totalQtyDiperiksa) * 1000) / 10
        : 0;

    return {
      totalJobs,
      completedJobs,
      inProgressJobs,
      draftJobs,
      totalQtyAwal,
      totalQtyDiperiksa,
      totalQtyOke,
      totalQtyReject,
      avgPassRate,
    };
  }, [currentJobsPool]);

  // If in Workspace mode (1 specific job selected)
  if (activeJob) {
    return (
      <QcPengerjaanWorkspace
        job={activeJob}
        session={session}
        onBack={() => setActiveJobId(null)}
        onSaveJob={(updated) => {
          saveSingleQcJob(updated);
        }}
        onShowToast={onShowToast}
      />
    );
  }

  return (
    <div className="space-y-4 pb-20 animate-fadeIn">
      {/* 0. SUB-TAB PEMILIHAN: QC PRODUKSI vs QC MUTASI */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Main Segmented Toggle */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl max-w-full overflow-x-auto">
            <button
              type="button"
              id="btn-subtab-qc-produksi"
              onClick={() => {
                setQcMode('PRODUKSI');
                setSearchQuery('');
              }}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer select-none shrink-0 ${
                qcMode === 'PRODUKSI'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <Factory className="w-4 h-4" />
              <span>QC Produksi</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
                qcMode === 'PRODUKSI' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}>
                {produksiJobs.length}
              </span>
            </button>

            <button
              type="button"
              id="btn-subtab-qc-mutasi"
              onClick={() => {
                setQcMode('MUTASI');
                setSearchQuery('');
              }}
              className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer select-none shrink-0 ${
                qcMode === 'MUTASI'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-1 ring-emerald-500'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>QC Mutasi</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
                qcMode === 'MUTASI' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}>
                {mutasiJobs.length}
              </span>
            </button>
          </div>

          {/* Subtitle / Source info */}
          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
            <div className="text-slate-500 dark:text-slate-400 text-[11px] sm:text-xs">
              {qcMode === 'PRODUKSI' ? (
                <span>Sumber: <strong>Form Penerimaan Produksi CMT</strong></span>
              ) : (
                <span>Sumber: <strong>Pengecekan SJ (Penerimaan / Mutasi Masuk)</strong></span>
              )}
            </div>
            {qcMode === 'MUTASI' && (
              <button
                type="button"
                onClick={loadMutasiSJ}
                disabled={loadingMutasi}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition cursor-pointer border border-emerald-200 dark:border-emerald-800"
              >
                <RefreshCw className={`w-3 h-3 ${loadingMutasi ? 'animate-spin' : ''}`} />
                <span>Sync SJ</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 1. Header Banner & Quick KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Job {qcMode === 'PRODUKSI' ? 'QC Produksi' : 'QC Mutasi'}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {kpis.totalJobs}
            </span>
            <span className="text-[10px] text-slate-400">Job Kode</span>
          </div>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
            {kpis.completedJobs} Selesai • {kpis.inProgressJobs} Aktif
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Qty Setoran Awal
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-xl sm:text-2xl font-black ${qcMode === 'PRODUKSI' ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {kpis.totalQtyAwal}
            </span>
            <span className="text-[10px] text-slate-400">Pcs Fisik</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">
            Diperiksa: <strong>{kpis.totalQtyDiperiksa} pcs</strong>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Lolos OKE (Grade A)
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {kpis.totalQtyOke}
            </span>
            <span className="text-[10px] text-emerald-600/70">Pcs</span>
          </div>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1">
            Reject: {kpis.totalQtyReject} pcs
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
            Rata-rata Pass Rate
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400">
              {kpis.avgPassRate}%
            </span>
            <span className="text-[10px] text-blue-600/70">Kelolosan</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">
            Standar Mutu {qcMode === 'PRODUKSI' ? 'Produksi' : 'Mutasi'}
          </p>
        </div>
      </div>

      {/* 2. Filter & Search Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3 items-center">
          {/* Search Input */}
          <div className="lg:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={qcMode === 'PRODUKSI' ? "Cari Kode Produksi, No Surat Jalan, Warna, PIC..." : "Cari SKU, Kode, No SJ, Asal/Tujuan, PIC..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* Status Filter */}
          <div className="lg:col-span-4 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {['Semua', 'Menunggu', 'Pengerjaan', 'Selesai'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterStatus === st
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Kategori Filter */}
          <div className="lg:col-span-3">
            <select
              value={filterKategori}
              onChange={(e) => setFilterKategori(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 font-medium"
            >
              <option value="Semua">Semua Kategori</option>
              {qcMode === 'PRODUKSI' ? (
                <>
                  <option value="Lokal CMT">Lokal CMT</option>
                  <option value="Kargo">Kargo</option>
                </>
              ) : (
                <>
                  <option value="Mutasi">Semua Mutasi</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* 3. Daftar Kartu Master QC (1 Kode = 1 Kartu Rekap) */}
      {filteredJobs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-2">
          <Layers className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {qcMode === 'PRODUKSI'
              ? 'Tidak ada Kode Produksi yang cocok dengan filter'
              : 'Belum ada antrean QC Mutasi'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {qcMode === 'PRODUKSI'
              ? 'Pastikan data penerimaan barang sudah diinput di tab Form Penerimaan.'
              : 'Data QC Mutasi otomatis muncul saat Pengecekan Surat Jalan Penerimaan disubmit di modul Pengecekan SJ.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredJobs.map((job) => {
            const isCompleted = job.status === 'COMPLETED';
            const inProgress = job.status === 'IN_PROGRESS';
            const progressPercent =
              job.total_qty_awal > 0
                ? Math.min(100, Math.round((job.total_diperiksa / job.total_qty_awal) * 100))
                : 0;

            const isMutasiJob = job.source_type === 'MUTASI';

            return (
              <div
                key={job.id}
                id={`qc-card-${job.id}`}
                className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3.5 group"
              >
                {/* Header Kartu */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        isMutasiJob ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      } shrink-0`}>
                        SJ {job.no_surat_jalan}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 truncate">
                        {job.kategori || (isMutasiJob ? 'Mutasi Masuk' : 'Lokal CMT')}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : inProgress
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {isCompleted ? '🟢 Selesai' : inProgress ? '🔵 Pengerjaan' : '🟡 Menunggu'}
                    </span>
                  </div>

                  {/* Foto & Info Utama */}
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
                      {job.foto_url ? (
                        <img
                          src={job.foto_url}
                          alt={job.kode_produksi}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Layers className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                          isMutasiJob ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400'
                        }`}>
                          {isMutasiJob ? 'QC Mutasi Surat Jalan' : 'QC Produksi'}
                        </span>
                      </div>
                      <h3 className="text-base font-black font-mono text-slate-900 dark:text-white truncate mt-0.5">
                        {isMutasiJob ? `SJ ${job.no_surat_jalan}` : `#${job.kode_produksi}`}
                      </h3>
                      <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                        {isMutasiJob ? `🏪 Asal: ${job.store_asal || 'Store'}` : job.nama_produk}
                      </p>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                        {isMutasiJob ? (
                          <>📦 Rincian: <strong className="text-slate-800 dark:text-slate-200">{job.sizes.length} SKU / Varian</strong></>
                        ) : (
                          <>Warna: <strong className="text-slate-800 dark:text-slate-200">{job.warna || '-'}</strong></>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Fisik: <strong className={`${isMutasiJob ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'} font-bold`}>{job.total_qty_awal} pcs</strong> ({job.sizes.length} {isMutasiJob ? 'Item' : 'Size'})
                      </p>
                    </div>
                  </div>

                  {/* Tim PIC Pemeriksa */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {job.pic_list && job.pic_list.length > 0 ? (
                      job.pic_list.map((pic) => (
                        <span
                          key={pic}
                          className="px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          {pic}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Belum ada PIC</span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Progress QC:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {job.total_diperiksa} / {job.total_qty_awal} pcs ({progressPercent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${(job.total_qty_oke / (job.total_qty_awal || 1)) * 100}%` }}
                        className="bg-emerald-500 h-full"
                        title="Lolos OKE"
                      />
                      <div
                        style={{ width: `${((job.total_qty_noda + job.total_qty_permak + job.total_qty_defect) / (job.total_qty_awal || 1)) * 100}%` }}
                        className="bg-rose-500 h-full"
                        title="Reject"
                      />
                    </div>
                  </div>

                  {/* 4 Quick Pills */}
                  <div className="grid grid-cols-4 gap-1 text-center pt-1 text-[10px]">
                    <div className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">
                      OKE: {job.total_qty_oke}
                    </div>
                    <div className="p-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold">
                      Noda: {job.total_qty_noda}
                    </div>
                    <div className="p-1 rounded-md bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-bold">
                      Permak: {job.total_qty_permak}
                    </div>
                    <div className="p-1 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold">
                      Defect: {job.total_qty_defect}
                    </div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveJobId(job.id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 ${
                      isMutasiJob ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                    } text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer active:scale-98`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isCompleted ? 'Lihat / Edit QC' : 'Kerjakan QC'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBeritaAcaraJob(job)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors cursor-pointer"
                    title="Cetak Berita Acara & Rekap"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Berita Acara */}
      {beritaAcaraJob && (
        <QcBeritaAcaraModal
          isOpen={Boolean(beritaAcaraJob)}
          onClose={() => setBeritaAcaraJob(null)}
          job={beritaAcaraJob}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
};
