import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Briefcase,
  Shield,
  ShieldAlert,
  Download,
  CheckCircle2,
  X,
  UserCheck,
  Building,
  DollarSign,
  AlertTriangle,
  Award,
  TrendingUp,
  LogIn,
  LogOut,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  UserSession,
  KaryawanRecord,
  PresensiRecord,
  RosterShiftRecord,
  LemburRecord,
  PerijinanCutiRecord,
  IzinPulangAwalRecord,
  KpiAbsensiSummary,
} from '../../types';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import {
  fetchKaryawanDirectory,
  upsertKaryawanRecord,
  deleteKaryawanRecord,
  fetchPresensiRange,
  fetchRosterShiftList,
  fetchLemburRecords,
  fetchCutiRecords,
  fetchIzinPulangAwalList,
} from '../../services/supabase';
import { calculateKpiAbsensi } from '../../utils/kpiCalculator';

interface KaryawanViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const KaryawanView: React.FC<KaryawanViewProps> = ({ session, onShowToast }) => {
  const [karyawanList, setKaryawanList] = useState<KaryawanRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDivisi, setSelectedDivisi] = useState<string>('ALL');
  const [sortByKpi, setSortByKpi] = useState<'default' | 'kpi_desc' | 'kpi_asc' | 'ontime_desc'>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // KPI Attendance data for all employees (current month)
  const [kpiMap, setKpiMap] = useState<Record<string, KpiAbsensiSummary>>({});
  const [loadingKpi, setLoadingKpi] = useState<boolean>(false);

  // Modals & Drawers
  const [selectedKaryawan, setSelectedKaryawan] = useState<KaryawanRecord | null>(null);
  const [detailTab, setDetailTab] = useState<'profil' | 'kpi'>('profil');
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [deleteConfirmNik, setDeleteConfirmNik] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Sensitive data toggle for admin
  const [showSalary, setShowSalary] = useState<boolean>(false);

  // Form State
  const [formData, setFormData] = useState<Partial<KaryawanRecord>>({
    nik: '',
    nama: '',
    divisi: 'Warehouse',
    username: '',
    password: '',
    role: 'user',
    no_hp: '',
    email: '',
    alamat: '',
    tgl_lahir: '',
    tgl_bergabung: '',
    kontak_darurat: '',
    gaji_pokok: 0,
    rate_lembur: 10000,
    saldo_kasbon: 0,
  });

  // Access checks
  const userIsAdmin = isSuperadmin(session);
  const canView = userIsAdmin || hasPermission(session, 'menu_hr_karyawan');
  const canEdit = userIsAdmin || hasPermission(session, 'action_edit_master');
  const canDelete = userIsAdmin || hasPermission(session, 'action_delete_master');
  const canSeeSalary = userIsAdmin;

  // Load Karyawan Directory & Compute KPI
  const loadKaryawan = useCallback(async () => {
    setLoading(true);
    setLoadingKpi(true);
    try {
      const data = await fetchKaryawanDirectory();
      setKaryawanList(data);

      // Compute KPI for current month
      const d = new Date();
      d.setDate(1);
      const startOfMonth = d.toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      const [presensis, rosters, lemburs, cutis, izins] = await Promise.all([
        fetchPresensiRange(startOfMonth, today),
        fetchRosterShiftList(undefined, startOfMonth, today),
        fetchLemburRecords(),
        fetchCutiRecords(),
        fetchIzinPulangAwalList(),
      ]);

      const map: Record<string, KpiAbsensiSummary> = {};
      data.forEach((k) => {
        const summary = calculateKpiAbsensi({
          karyawan: k,
          presensiList: presensis,
          rosterList: rosters,
          lemburList: lemburs,
          cutiList: cutis,
          izinPulangAwalList: izins,
          startDate: startOfMonth,
          endDate: today,
        });
        map[k.nik.toUpperCase()] = summary;
      });
      setKpiMap(map);
    } catch (err: any) {
      onShowToast('Gagal memuat data karyawan: ' + (err?.message || 'Error'), 'error');
    } finally {
      setLoading(false);
      setLoadingKpi(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    if (canView) {
      loadKaryawan();
    }
  }, [canView, loadKaryawan]);

  // Unique divisions
  const divisions = useMemo(() => {
    const set = new Set<string>();
    karyawanList.forEach((k) => {
      if (k.divisi) set.add(k.divisi);
    });
    return Array.from(set).sort();
  }, [karyawanList]);

  // Filtered & Sorted Karyawan
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let result = karyawanList.filter((k) => {
      const matchQuery =
        !q ||
        k.nik.toLowerCase().includes(q) ||
        k.nama.toLowerCase().includes(q) ||
        (k.divisi && k.divisi.toLowerCase().includes(q)) ||
        (k.username && k.username.toLowerCase().includes(q)) ||
        (k.no_hp && k.no_hp.toLowerCase().includes(q));

      const matchDivisi = selectedDivisi === 'ALL' || k.divisi === selectedDivisi;

      return matchQuery && matchDivisi;
    });

    // Sorting by KPI
    if (sortByKpi === 'kpi_desc') {
      result.sort((a, b) => {
        const scoreA = kpiMap[a.nik.toUpperCase()]?.nilaiKpiAbsensi ?? 0;
        const scoreB = kpiMap[b.nik.toUpperCase()]?.nilaiKpiAbsensi ?? 0;
        return scoreB - scoreA;
      });
    } else if (sortByKpi === 'kpi_asc') {
      result.sort((a, b) => {
        const scoreA = kpiMap[a.nik.toUpperCase()]?.nilaiKpiAbsensi ?? 0;
        const scoreB = kpiMap[b.nik.toUpperCase()]?.nilaiKpiAbsensi ?? 0;
        return scoreA - scoreB;
      });
    } else if (sortByKpi === 'ontime_desc') {
      result.sort((a, b) => {
        const scoreA = kpiMap[a.nik.toUpperCase()]?.persenOnTime ?? 0;
        const scoreB = kpiMap[b.nik.toUpperCase()]?.persenOnTime ?? 0;
        return scoreB - scoreA;
      });
    }

    return result;
  }, [karyawanList, searchQuery, selectedDivisi, sortByKpi, kpiMap]);

  // Open Form for Adding
  const handleOpenAdd = () => {
    setFormData({
      nik: '',
      nama: '',
      divisi: 'Warehouse',
      username: '',
      password: '',
      role: 'user',
      no_hp: '',
      email: '',
      alamat: '',
      tgl_lahir: '',
      tgl_bergabung: '',
      kontak_darurat: '',
      gaji_pokok: 0,
      rate_lembur: 10000,
      saldo_kasbon: 0,
    });
    setIsEditing(false);
    setIsFormOpen(true);
  };

  // Open Form for Editing
  const handleOpenEdit = (k: KaryawanRecord) => {
    setFormData({ ...k });
    setIsEditing(true);
    setIsFormOpen(true);
  };

  // Save Karyawan
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nik || !formData.nama) {
      onShowToast('NIK dan Nama Lengkap wajib diisi!', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const res = await upsertKaryawanRecord(formData);
      if (res.success) {
        onShowToast(`Data karyawan ${formData.nama} berhasil disimpan!`, 'success');
        setIsFormOpen(false);
        await loadKaryawan();
      } else {
        onShowToast(res.message || 'Gagal menyimpan data karyawan', 'error');
      }
    } catch (err: any) {
      onShowToast('Terjadi kesalahan: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Karyawan
  const handleDelete = async (nik: string) => {
    try {
      const res = await deleteKaryawanRecord(nik);
      if (res.success) {
        onShowToast(`Karyawan dengan NIK ${nik} berhasil dihapus`, 'success');
        setDeleteConfirmNik(null);
        if (selectedKaryawan?.nik === nik) {
          setIsDetailOpen(false);
          setSelectedKaryawan(null);
        }
        await loadKaryawan();
      } else {
        onShowToast(res.message || 'Gagal menghapus karyawan', 'error');
      }
    } catch (err: any) {
      onShowToast('Gagal menghapus: ' + err.message, 'error');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredList.length === 0) {
      onShowToast('Tidak ada data karyawan untuk diekspor', 'warning');
      return;
    }

    const headers = ['NIK', 'Nama Lengkap', 'Divisi', 'KPI Score', 'Grade', 'OnTime %', 'No HP', 'Email', 'Alamat'];
    const rows = filteredList.map((k) => {
      const kpi = kpiMap[k.nik.toUpperCase()];
      return [
        `"${k.nik}"`,
        `"${k.nama}"`,
        `"${k.divisi || ''}"`,
        `"${kpi?.nilaiKpiAbsensi ?? '-'}"`,
        `"${kpi?.grade ?? '-'}"`,
        `"${kpi?.persenOnTime ?? '-'}%"`,
        `"${k.no_hp || ''}"`,
        `"${k.email || ''}"`,
        `"${(k.alamat || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Direktori_Karyawan_KPI_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('File CSV direktori karyawan berhasil diunduh!', 'success');
  };

  // Access Denied Screen
  if (!canView) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center shadow-lg space-y-2">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 rounded-2xl flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Akses Menu Karyawan Dibatasi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Akun Anda (<b className="text-slate-700 dark:text-slate-200">{session?.name || session?.username}</b> - Role: <b className="text-primary-500">{session?.role}</b>) tidak memiliki hak akses untuk membuka modul <b>Data &amp; Direktori Karyawan</b>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header Toolbar */}
      <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 dark:text-white">
                  Direktori Karyawan &amp; Penilaian KPI
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                  {karyawanList.length} Staf
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manajemen data karyawan, kontak, akun, dan skor KPI kedisiplinan absensi
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadKaryawan}
              disabled={loading}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary-500' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-teal-500" />
              <span>Ekspor CSV</span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-3.5 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-primary-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Karyawan</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col sm:flex-row items-center gap-2.5">
            {/* Search input */}
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari NIK, nama, divisi, username..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Divisi selector */}
            <select
              value={selectedDivisi}
              onChange={(e) => setSelectedDivisi(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:border-primary-500"
            >
              <option value="ALL">Semua Divisi ({karyawanList.length})</option>
              {divisions.map((div) => {
                const count = karyawanList.filter((k) => k.divisi === div).length;
                return (
                  <option key={div} value={div}>
                    Divisi {div} ({count})
                  </option>
                );
              })}
            </select>

            {/* Sort by KPI */}
            <select
              value={sortByKpi}
              onChange={(e) => setSortByKpi(e.target.value as any)}
              className="w-full sm:w-auto px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-amber-600 dark:text-amber-400 font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="default">Urutkan: Default</option>
              <option value="kpi_desc">🏆 KPI Tertinggi (Nilai Absen)</option>
              <option value="kpi_asc">⚠️ KPI Terendah (Nilai Absen)</option>
              <option value="ontime_desc">⏰ Ketepatan On-Time Tertinggi</option>
            </select>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-[#101726] text-primary-500 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-[#101726] text-primary-500 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Tabel
              </button>
            </div>

            {/* Salary mask toggle for admin */}
            {canSeeSalary && (
              <button
                type="button"
                onClick={() => setShowSalary(!showSalary)}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
                title="Sembunyikan / Tampilkan Gaji"
              >
                {showSalary ? <EyeOff className="w-3.5 h-3.5 text-primary-500" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                <span className="hidden md:inline">{showSalary ? 'Tutup Gaji' : 'Lihat Gaji'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading && karyawanList.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Memuat direktori data karyawan...</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-3">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Tidak ada data karyawan ditemukan</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Tidak ada staf yang cocok dengan kriteria pencarian atau filter divisi yang dipilih.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredList.map((k) => {
            const isMe = session?.nik === k.nik || session?.username?.toLowerCase() === k.username?.toLowerCase();
            const kpi = kpiMap[k.nik.toUpperCase()];

            return (
              <div
                key={k.nik}
                className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:border-primary-500/50 hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Card Header: Avatar, NIK & Divisi */}
                  <div className="flex items-start justify-between gap-2.5 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                        {k.nama.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          <span>{k.nama}</span>
                          {isMe && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-bold">
                              Saya
                            </span>
                          )}
                        </h4>
                        <span className="font-mono text-[10px] text-slate-400 block truncate">
                          NIK: <b className="text-slate-700 dark:text-slate-300">{k.nik}</b>
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0 uppercase tracking-tight">
                      {k.divisi || 'Umum'}
                    </span>
                  </div>

                  {/* KPI CARD BADGE */}
                  {kpi && (
                    <div className="mb-3 p-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-500 shrink-0" />
                        <div>
                          <div className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300">
                            KPI Absen: <b>{kpi.nilaiKpiAbsensi} Pts</b>
                          </div>
                          <div className="text-[9px] text-slate-500 dark:text-slate-400">
                            On-Time: {kpi.persenOnTime}% • Pulang: {kpi.skorPulang} Pts
                          </div>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                          kpi.grade === 'A+' || kpi.grade === 'A'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : kpi.grade === 'B'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        Grade {kpi.grade}
                      </span>
                    </div>
                  )}

                  {/* Metadata info */}
                  <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-2.5 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Username Login:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                        @{k.username || '-'}
                      </span>
                    </div>

                    {k.no_hp && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>No. Telepon:</span>
                        </span>
                        <span className="font-mono text-slate-700 dark:text-slate-200">{k.no_hp}</span>
                      </div>
                    )}

                    {canSeeSalary && (
                      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                        <span className="text-slate-400 text-[10px]">Gaji Pokok:</span>
                        <span className="font-mono font-black text-[11px] text-emerald-600 dark:text-emerald-400">
                          {showSalary ? `Rp ${(k.gaji_pokok || 0).toLocaleString('id-ID')}` : 'Rp •••••••'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKaryawan(k);
                      setDetailTab('profil');
                      setIsDetailOpen(true);
                    }}
                    className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Eye className="w-3 h-3 text-teal-500" />
                    <span>Detail &amp; KPI</span>
                  </button>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(k)}
                      title="Edit Data Karyawan"
                      className="p-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-lg text-xs transition-all cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmNik(k.nik)}
                      title="Hapus Karyawan"
                      className="p-1.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 rounded-lg text-xs transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3">NIK</th>
                  <th className="p-3">Nama Karyawan</th>
                  <th className="p-3">Divisi</th>
                  <th className="p-3">KPI Absensi</th>
                  <th className="p-3">On-Time %</th>
                  <th className="p-3">No. HP</th>
                  {canSeeSalary && <th className="p-3">Gaji Pokok</th>}
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredList.map((k) => {
                  const isMe = session?.nik === k.nik || session?.username?.toLowerCase() === k.username?.toLowerCase();
                  const kpi = kpiMap[k.nik.toUpperCase()];

                  return (
                    <tr key={k.nik} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {k.nik}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{k.nama}</span>
                          {isMe && (
                            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-bold">
                              Saya
                            </span>
                          )}
                        </div>
                        {k.email && <div className="text-[10px] text-slate-400">{k.email}</div>}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                          {k.divisi || 'Umum'}
                        </span>
                      </td>
                      <td className="p-3">
                        {kpi ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-amber-600 dark:text-amber-400">
                              {kpi.nilaiKpiAbsensi}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                              kpi.grade === 'A+' || kpi.grade === 'A'
                                ? 'bg-emerald-100 text-emerald-700'
                                : kpi.grade === 'B'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {kpi.grade}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {kpi ? `${kpi.persenOnTime}%` : '-'}
                      </td>
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                        {k.no_hp || '-'}
                      </td>
                      {canSeeSalary && (
                        <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {showSalary ? `Rp ${(k.gaji_pokok || 0).toLocaleString('id-ID')}` : 'Rp •••••••'}
                        </td>
                      )}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedKaryawan(k);
                              setDetailTab('profil');
                              setIsDetailOpen(true);
                            }}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg cursor-pointer"
                            title="Lihat Profil & KPI"
                          >
                            <Eye className="w-3.5 h-3.5 text-teal-500" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(k)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-500 rounded-lg cursor-pointer"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmNik(k.nik)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-rose-500 rounded-lg cursor-pointer"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAIL DRAWER / MODAL WITH KPI TAB */}
      {isDetailOpen && selectedKaryawan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-700 text-white relative">
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="absolute right-4 top-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-white text-teal-700 font-black text-2xl flex items-center justify-center shadow-md">
                  {selectedKaryawan.nama.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-black">{selectedKaryawan.nama}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-teal-100">
                    <span className="font-mono font-bold">NIK: {selectedKaryawan.nik}</span>
                    <span>•</span>
                    <span className="px-2 py-0.2 rounded-full bg-white/20 font-extrabold uppercase text-[10px]">
                      {selectedKaryawan.divisi || 'Umum'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sub tabs */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-white/20">
                <button
                  type="button"
                  onClick={() => setDetailTab('profil')}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                    detailTab === 'profil' ? 'bg-white text-teal-800 shadow-xs' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  Profil &amp; Kontak
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('kpi')}
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailTab === 'kpi' ? 'bg-white text-teal-800 shadow-xs' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Penilaian KPI Absensi</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {detailTab === 'profil' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Username Sistem:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                      @{selectedKaryawan.username || '-'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">No. WhatsApp / HP:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                      {selectedKaryawan.no_hp || '-'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Email:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {selectedKaryawan.email || '-'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Kontak Darurat:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {selectedKaryawan.kontak_darurat || '-'}
                    </span>
                  </div>

                  <div className="sm:col-span-2 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Alamat Domisili:</span>
                    <span className="text-slate-800 dark:text-slate-100">
                      {selectedKaryawan.alamat || '-'}
                    </span>
                  </div>
                </div>
              ) : (
                /* TAB KPI DETAIL */
                <div className="space-y-3.5">
                  {kpiMap[selectedKaryawan.nik.toUpperCase()] ? (
                    (() => {
                      const kpi = kpiMap[selectedKaryawan.nik.toUpperCase()];
                      return (
                        <>
                          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-between shadow-md">
                            <div>
                              <div className="text-xs text-amber-100 font-bold uppercase">Nilai KPI Absensi Bulan Ini</div>
                              <div className="text-4xl font-black font-mono mt-1">{kpi.nilaiKpiAbsensi} Pts</div>
                              <div className="text-xs text-amber-100 font-bold mt-0.5">{kpi.labelStatus}</div>
                            </div>
                            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-2xl text-white">
                              {kpi.grade}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 text-xs">
                            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] text-slate-400 block">Skor Jam Berangkat:</span>
                              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                {kpi.skorBerangkat} / 100
                              </span>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                On-Time: {kpi.totalOnTime} hari ({kpi.persenOnTime}%) • Telat: {kpi.totalTerlambat} ({kpi.totalMenitTerlambat} mnt)
                              </div>
                            </div>

                            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] text-slate-400 block">Skor Jam Pulang:</span>
                              <span className="text-lg font-black text-primary-500 font-mono">
                                {kpi.skorPulang} / 100
                              </span>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Pulang Normal: {kpi.totalPulangNormal} hari • Izin Pulang Awal: {kpi.totalPulangAwalIzin}x
                              </div>
                            </div>

                            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] text-slate-400 block">Tingkat Kehadiran:</span>
                              <span className="text-lg font-black text-blue-600 dark:text-blue-400 font-mono">
                                {kpi.persenKehadiran}%
                              </span>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Masuk: {kpi.totalHadir} dari {kpi.totalHariKerja} hari kerja
                              </div>
                            </div>

                            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-100 dark:border-slate-800">
                              <span className="text-[10px] text-slate-400 block">Cuti / Alpha / Lembur:</span>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                                Cuti: {kpi.totalCutiIzin}h • Alpha: {kpi.totalAlpha}h • Lembur: {kpi.totalLemburJam}j
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      Belum ada rekaman data presensi untuk dihitung KPI bulan ini.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                Tutup
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDetailOpen(false);
                    handleOpenEdit(selectedKaryawan);
                  }}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  Edit Data
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="p-4 bg-white dark:bg-[#131d31] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  {isEditing ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  {isEditing ? `Edit Data Karyawan: "${formData.nama}"` : 'Tambah Karyawan Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    NIK Karyawan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isEditing}
                    value={formData.nik || ''}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value.toUpperCase() })}
                    placeholder="e.g. WH0011"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nama || ''}
                    onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                    placeholder="e.g. Rian Pratama"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Divisi
                  </label>
                  <input
                    type="text"
                    value={formData.divisi || ''}
                    onChange={(e) => setFormData({ ...formData, divisi: e.target.value })}
                    placeholder="e.g. QC / Warehouse"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Username Akun
                  </label>
                  <input
                    type="text"
                    value={formData.username || ''}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. UserQC10"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    No. WhatsApp / HP
                  </label>
                  <input
                    type="text"
                    value={formData.no_hp || ''}
                    onChange={(e) => setFormData({ ...formData, no_hp: e.target.value })}
                    placeholder="e.g. 08123456789"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. rian@example.com"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Kontak Darurat
                  </label>
                  <input
                    type="text"
                    value={formData.kontak_darurat || ''}
                    onChange={(e) => setFormData({ ...formData, kontak_darurat: e.target.value })}
                    placeholder="e.g. Ibu Ani - 0812345678"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Alamat Lengkap
                </label>
                <textarea
                  rows={2}
                  value={formData.alamat || ''}
                  onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                  placeholder="Alamat domisili staf..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                />
              </div>

              {canSeeSalary && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Konfigurasi Gaji &amp; Lembur (Superadmin)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Gaji Pokok (Rp)
                      </label>
                      <input
                        type="number"
                        value={formData.gaji_pokok || 0}
                        onChange={(e) => setFormData({ ...formData, gaji_pokok: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                        Rate Lembur per Jam (Rp)
                      </label>
                      <input
                        type="number"
                        value={formData.rate_lembur || 10000}
                        onChange={(e) => setFormData({ ...formData, rate_lembur: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-primary-500/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{isEditing ? 'Simpan Perubahan' : 'Tambah Karyawan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmNik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Konfirmasi Hapus Karyawan</h3>
              <p className="text-xs text-slate-500">
                Yakin ingin menghapus karyawan dengan NIK <b className="font-mono text-rose-600">{deleteConfirmNik}</b>? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmNik(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmNik)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Ya, Hapus Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
