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
} from 'lucide-react';
import {
  UserSession,
  PenerimaanProduksiItem,
  QcPengerjaanJob,
  ProductItem,
} from '../../types';
import {
  getSavedQcJobsFromLocal,
  buildOrGetQcJob,
  saveSingleQcJob,
} from '../../services/qcPengerjaanService';
import { QcPengerjaanWorkspace } from './QcPengerjaanWorkspace';
import { QcBeritaAcaraModal } from './QcBeritaAcaraModal';

interface QcPengerjaanTabProps {
  session: UserSession | null;
  penerimaanItems: PenerimaanProduksiItem[];
  productCatalog?: ProductItem[];
  targetJobCode?: string; // Optional deep-link target kode produksi
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const QcPengerjaanTab: React.FC<QcPengerjaanTabProps> = ({
  session,
  penerimaanItems,
  productCatalog = [],
  targetJobCode,
  onShowToast,
}) => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('Semua');
  const [filterKategori, setFilterKategori] = useState<string>('Semua');
  const [beritaAcaraJob, setBeritaAcaraJob] = useState<QcPengerjaanJob | null>(null);

  // Group items by (no_surat_jalan + kode_produksi)
  const groupedJobs: QcPengerjaanJob[] = useMemo(() => {
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

  // Deep-link to targetJobCode if specified
  useEffect(() => {
    if (targetJobCode) {
      const cleanTarget = targetJobCode.trim().toUpperCase();
      const match = groupedJobs.find(
        (j) => j.kode_produksi.trim().toUpperCase() === cleanTarget
      );
      if (match) {
        setActiveJobId(match.id);
      }
    }
  }, [targetJobCode, groupedJobs]);

  // Active Job instance
  const activeJob = useMemo(() => {
    if (!activeJobId) return null;
    return groupedJobs.find((j) => j.id === activeJobId) || null;
  }, [activeJobId, groupedJobs]);

  // Filtered Job List
  const filteredJobs = useMemo(() => {
    return groupedJobs.filter((j) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchKode = j.kode_produksi.toLowerCase().includes(q);
        const matchSj = j.no_surat_jalan.toLowerCase().includes(q);
        const matchWarna = (j.warna || '').toLowerCase().includes(q);
        const matchPic = (j.pic_list || []).some((p) => p.toLowerCase().includes(q));
        if (!matchKode && !matchSj && !matchWarna && !matchPic) return false;
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
  }, [groupedJobs, searchQuery, filterStatus, filterKategori]);

  // Overall KPI calculation
  const kpis = useMemo(() => {
    let totalJobs = groupedJobs.length;
    let completedJobs = 0;
    let inProgressJobs = 0;
    let draftJobs = 0;
    let totalQtyAwal = 0;
    let totalQtyDiperiksa = 0;
    let totalQtyOke = 0;
    let totalQtyReject = 0;

    groupedJobs.forEach((j) => {
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
  }, [groupedJobs]);

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
      {/* 1. Header Banner & Quick KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Kode Pengerjaan
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
            Total Pcs Setoran Awal
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">
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
            Standar Mutu Produksi
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
              placeholder="Cari Kode Produksi, No Surat Jalan, Warna, PIC..."
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
              <option value="Lokal CMT">Lokal CMT</option>
              <option value="Kargo">Kargo</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Daftar Kartu Master QC (1 Kode = 1 Kartu Rekap) */}
      {filteredJobs.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-2">
          <Layers className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Tidak ada Kode Produksi yang cocok dengan filter
          </h3>
          <p className="text-xs text-slate-400">
            Pastikan data penerimaan barang sudah diinput di tab Form Penerimaan.
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
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shrink-0">
                        SJ {job.no_surat_jalan}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 truncate">
                        {job.kategori || 'Lokal CMT'}
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
                      <h3 className="text-base font-black font-mono text-slate-900 dark:text-white truncate">
                        #{job.kode_produksi}
                      </h3>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                        Warna: <strong className="text-slate-800 dark:text-slate-200">{job.warna || '-'}</strong>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Setoran: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{job.total_qty_awal} pcs</strong> ({job.sizes.length} Size)
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
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-600/20 cursor-pointer active:scale-98"
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
