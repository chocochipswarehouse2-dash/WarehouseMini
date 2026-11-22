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

    // Filter mutasiRecords: HANYA Surat Jalan Pengecekan Penerimaan (Barang masuk ke Gudang)
    const penerimaanSJRecords = (mutasiRecords || []).filter((rec) => {
      // 1. Jika ada flag tipe_import eksplisit
      if (rec.tipe_import === 'Pengiriman') return false;
      if (rec.tipe_import === 'Penerimaan') return true;

      // 2. Cek arah rute Source (Asal) dan Destination (Tujuan)
      const dest = (rec.destination || '').toLowerCase();
      const src = (rec.source || '').toLowerCase();
      
      const isDestWarehouse = dest.includes('warehouse') || dest.includes('gudang') || dest.includes('pusat') || dest.includes('wh');
      const isSourceWarehouse = src.includes('warehouse') || src.includes('gudang') || src.includes('pusat') || src.includes('wh');

      // Jika asal gudang dan tujuan toko/outlet => ini PENGIRIMAN (jangan masukkan ke QC Mutasi)
      if (isSourceWarehouse && !isDestWarehouse) return false;

      // Jika tujuan adalah Gudang/Warehouse => ini PENERIMAAN (masuk ke QC Mutasi)
      return isDestWarehouse;
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
    <div className="space-y-3 pb-20 animate-fadeIn">
      {/* 0. SUB-TAB PEMILIHAN: QC PRODUKSI vs QC MUTASI */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 sm:p-2.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Segmented Toggle */}
          <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              id="btn-subtab-qc-produksi"
              onClick={() => {
                setQcMode('PRODUKSI');
                setSearchQuery('');
              }}
              className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 min-h-[38px] rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                qcMode === 'PRODUKSI'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Factory className="w-3.5 h-3.5 shrink-0" />
              <span>QC Produksi</span>
              <span
                className={`px-1.5 py-0.5 text-[10px] rounded-full font-mono tabular-nums ${
                  qcMode === 'PRODUKSI'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
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
              className={`inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 min-h-[38px] rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                qcMode === 'MUTASI'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
              <span>QC Mutasi</span>
              <span
                className={`px-1.5 py-0.5 text-[10px] rounded-full font-mono tabular-nums ${
                  qcMode === 'MUTASI'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {mutasiJobs.length}
              </span>
            </button>
          </div>

          {/* Source info & Sync button */}
          <div className="flex items-center justify-between sm:justify-end gap-2 px-1 sm:px-0">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {qcMode === 'PRODUKSI'
                ? 'Sumber: Penerimaan Produksi CMT'
                : 'Sumber: Pengecekan SJ Mutasi Masuk'}
            </span>
            {qcMode === 'MUTASI' && (
              <button
                type="button"
                onClick={loadMutasiSJ}
                disabled={loadingMutasi}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer border border-slate-200 dark:border-slate-700 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingMutasi ? 'animate-spin' : ''}`} />
                <span>Sync SJ</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 1. Compact KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setFilterStatus('Semua')}
          className={`text-left bg-white dark:bg-slate-900 border rounded-2xl p-2.5 sm:p-3.5 transition-all cursor-pointer ${
            filterStatus === 'Semua'
              ? 'border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-500/20'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Job QC
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg sm:text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
              {kpis.totalJobs}
            </span>
            <span className="text-[10px] text-slate-400">job</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{kpis.completedJobs} selesai</span>
            {' · '}
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{kpis.inProgressJobs} aktif</span>
          </p>
        </button>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Setoran Awal
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg sm:text-2xl font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
              {kpis.totalQtyAwal.toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] text-slate-400">pcs</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            Diperiksa: <strong className="text-slate-700 dark:text-slate-200">{kpis.totalQtyDiperiksa.toLocaleString('id-ID')}</strong>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Lolos Grade A
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg sm:text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {kpis.totalQtyOke.toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] text-emerald-600/70">pcs</span>
          </div>
          <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5 tabular-nums">
            Reject: {kpis.totalQtyReject.toLocaleString('id-ID')} pcs
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Pass Rate
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-lg sm:text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
              {kpis.avgPassRate}%
            </span>
            <span className="text-[10px] text-slate-400">lolos</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Mutu {qcMode === 'PRODUKSI' ? 'Produksi' : 'Mutasi'}
          </p>
        </div>
      </div>

      {/* 2. Filter & Search Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xs space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={
                qcMode === 'PRODUKSI'
                  ? 'Cari kode produksi, no SJ, warna, PIC...'
                  : 'Cari SKU, kode, no SJ, asal toko, PIC...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 min-h-[40px] text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/70 dark:bg-slate-800/60 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* Kategori Filter */}
          <div className="sm:w-44 shrink-0">
            <select
              value={filterKategori}
              onChange={(e) => setFilterKategori(e.target.value)}
              className="w-full px-3 min-h-[40px] text-xs border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            >
              <option value="Semua">Semua Kategori</option>
              {qcMode === 'PRODUKSI' ? (
                <>
                  <option value="Lokal CMT">Lokal CMT</option>
                  <option value="Kargo">Kargo</option>
                </>
              ) : (
                <option value="Mutasi">Semua Mutasi</option>
              )}
            </select>
          </div>
        </div>

        {/* Status Filter — Horizontal Swipe on Mobile */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {[
            { id: 'Semua', label: 'Semua', count: kpis.totalJobs },
            { id: 'Menunggu', label: 'Menunggu', count: kpis.draftJobs },
            { id: 'Pengerjaan', label: 'Pengerjaan', count: kpis.inProgressJobs },
            { id: 'Selesai', label: 'Selesai', count: kpis.completedJobs },
          ].map((st) => {
            const active = filterStatus === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setFilterStatus(st.id)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{st.label}</span>
                <span
                  className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'bg-slate-200/70 dark:bg-slate-700/80 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {st.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Daftar Kartu Master QC */}
      {filteredJobs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <Layers className="w-9 h-9 text-slate-300 dark:text-slate-700 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            {qcMode === 'PRODUKSI'
              ? 'Tidak ada Kode Produksi yang cocok dengan filter'
              : 'Belum ada antrean QC Mutasi'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {qcMode === 'PRODUKSI'
              ? 'Pastikan data penerimaan barang sudah diinput di tab Form Penerimaan.'
              : 'Data QC Mutasi otomatis muncul saat Pengecekan Surat Jalan Penerimaan disubmit.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div className="p-3.5 space-y-3">
                  {/* Card Top Bar */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md truncate">
                        SJ {job.no_surat_jalan}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate">
                        {job.kategori || (isMutasiJob ? 'Mutasi' : 'Lokal CMT')}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        isCompleted
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : inProgress
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-500'
                            : inProgress
                            ? 'bg-indigo-500'
                            : 'bg-amber-500'
                        }`}
                      />
                      {isCompleted ? 'Selesai' : inProgress ? 'Pengerjaan' : 'Menunggu'}
                    </span>
                  </div>

                  {/* Thumbnail + Identity + Qty */}
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
                      {job.foto_url ? (
                        <img
                          src={job.foto_url}
                          alt={job.kode_produksi}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Layers className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-black font-mono text-slate-900 dark:text-white truncate">
                          {isMutasiJob ? `SJ ${job.no_surat_jalan}` : `#${job.kode_produksi}`}
                        </h3>
                        <span className="font-mono font-black text-sm tabular-nums text-indigo-600 dark:text-indigo-400 shrink-0">
                          {job.total_qty_awal} <span className="text-[10px] font-semibold text-slate-400">pcs</span>
                        </span>
                      </div>

                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate mt-0.5">
                        {isMutasiJob ? `Asal: ${job.store_asal || 'Store'}` : job.nama_produk || '-'}
                      </p>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {isMutasiJob
                          ? `${job.sizes.length} SKU / Varian`
                          : [job.warna && job.warna !== '-' ? job.warna : null, `${job.sizes.length} size`]
                              .filter(Boolean)
                              .join(' · ')}
                      </p>
                    </div>
                  </div>

                  {/* PIC inline strip */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {job.pic_list && job.pic_list.length > 0 ? (
                      job.pic_list.map((pic) => (
                        <span
                          key={pic}
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        >
                          {pic}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400">Belum ada PIC</span>
                    )}
                  </div>

                  {/* Slim Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">Progress QC</span>
                      <span className="font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">
                        {job.total_diperiksa}/{job.total_qty_awal} pcs ({progressPercent}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${(job.total_qty_oke / (job.total_qty_awal || 1)) * 100}%` }}
                        className="bg-emerald-500 h-full"
                        title="Lolos OKE"
                      />
                      <div
                        style={{
                          width: `${
                            ((job.total_qty_noda + job.total_qty_permak + job.total_qty_defect) /
                              (job.total_qty_awal || 1)) *
                            100
                          }%`,
                        }}
                        className="bg-rose-500 h-full"
                        title="Reject"
                      />
                    </div>
                  </div>
                </div>

                {/* Hairline 4-Metric Summary Strip */}
                <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-center py-2">
                  <div>
                    <span className="block text-[9px] font-bold uppercase text-slate-400">OKE</span>
                    <span className="text-xs font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {job.total_qty_oke}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase text-slate-400">Noda</span>
                    <span className="text-xs font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {job.total_qty_noda}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase text-slate-400">Permak</span>
                    <span className="text-xs font-black font-mono tabular-nums text-orange-600 dark:text-orange-400">
                      {job.total_qty_permak}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase text-slate-400">Defect</span>
                    <span className="text-xs font-black font-mono tabular-nums text-rose-600 dark:text-rose-400">
                      {job.total_qty_defect}
                    </span>
                  </div>
                </div>

                {/* Footer Action Controls */}
                <div className="flex items-center gap-2 p-2.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveJobId(job.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer active:scale-[0.98]"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isCompleted ? 'Lihat / Edit QC' : 'Kerjakan QC'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBeritaAcaraJob(job)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 min-h-[40px] bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    title="Cetak Berita Acara & Rekap"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Berita Acara</span>
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
