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
} from 'lucide-react';
import { UserSession, KaryawanRecord } from '../../types';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import { fetchKaryawanDirectory, upsertKaryawanRecord, deleteKaryawanRecord } from '../../services/supabase';

interface KaryawanViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const KaryawanView: React.FC<KaryawanViewProps> = ({ session, onShowToast }) => {
  const [karyawanList, setKaryawanList] = useState<KaryawanRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDivisi, setSelectedDivisi] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Modals & Drawers
  const [selectedKaryawan, setSelectedKaryawan] = useState<KaryawanRecord | null>(null);
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
  const canView = userIsAdmin || hasPermission(session, 'can_view_karyawan');
  const canEdit = userIsAdmin || hasPermission(session, 'can_edit_data') || hasPermission(session, 'can_manage_users');
  const canDelete = userIsAdmin || hasPermission(session, 'can_delete_data');
  const canSeeSalary = userIsAdmin;

  // Load Karyawan Directory
  const loadKaryawan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKaryawanDirectory();
      setKaryawanList(data);
    } catch (err: any) {
      onShowToast('Gagal memuat data karyawan: ' + (err?.message || 'Error'), 'error');
    } finally {
      setLoading(false);
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

  // Filtered Karyawan
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return karyawanList.filter((k) => {
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
  }, [karyawanList, searchQuery, selectedDivisi]);

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

    const headers = ['NIK', 'Nama Lengkap', 'Divisi', 'Username', 'Role', 'No HP', 'Email', 'Alamat'];
    const rows = filteredList.map((k) => [
      `"${k.nik}"`,
      `"${k.nama}"`,
      `"${k.divisi || ''}"`,
      `"${k.username || ''}"`,
      `"${k.role || ''}"`,
      `"${k.no_hp || ''}"`,
      `"${k.email || ''}"`,
      `"${(k.alamat || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Direktori_Karyawan_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('File CSV direktori karyawan berhasil diunduh!', 'success');
  };

  // Access Denied Screen
  if (!canView) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center shadow-lg space-y-4">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 rounded-2xl flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Akses Menu Karyawan Dibatasi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Akun Anda (<b className="text-slate-700 dark:text-slate-200">{session?.name || session?.username}</b> - Role: <b className="text-[#ff7a00]">{session?.role}</b>) tidak memiliki hak akses untuk membuka modul <b>Data & Direktori Karyawan</b>.
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 text-left space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#ff7a00]" />
              <span>Pengaturan Hak Akses Role:</span>
            </div>
            <p>
              Hubungi Superadmin untuk mengaktifkan izin <b>can_view_karyawan</b> pada akun Anda melalui menu <b>Pengaturan &gt; Manajemen Pengguna &amp; Role</b>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Data &amp; Direktori Karyawan
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-mono">
                  {filteredList.length} Staf
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Master data karyawan, profil staf divisi, kontak darurat dan sinkronisasi NIK WMS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadKaryawan}
              disabled={loading}
              title="Refresh Data dari Supabase"
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#ff7a00]' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-3.5 py-2 bg-[#ff7a00] hover:bg-[#e06b00] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#ff7a00]/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Karyawan</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col sm:flex-row items-center gap-2.5">
            {/* Search input */}
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari NIK, nama, divisi, username..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
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
              className="w-full sm:w-auto px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:border-[#ff7a00]"
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
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-[#101726] text-[#ff7a00] shadow-xs'
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
                    ? 'bg-white dark:bg-[#101726] text-[#ff7a00] shadow-xs'
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
                title="Sembunyikan / Tampilkan Gaji & Rate"
              >
                {showSalary ? <EyeOff className="w-3.5 h-3.5 text-[#ff7a00]" /> : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                <span className="hidden md:inline">{showSalary ? 'Tutup Gaji' : 'Lihat Gaji'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading && karyawanList.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <RefreshCw className="w-8 h-8 text-[#ff7a00] animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Memuat direktori data karyawan...</p>
          <p className="text-[11px] text-slate-400 mt-1">Mengambil dari database Supabase</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-3">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Tidak ada data karyawan ditemukan</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery || selectedDivisi !== 'ALL'
              ? 'Tidak ada staf yang cocok dengan kriteria pencarian atau filter divisi yang dipilih.'
              : 'Belum ada data staf karyawan yang tersimpan di database.'}
          </p>
          {(searchQuery || selectedDivisi !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedDivisi('ALL');
              }}
              className="text-xs text-[#ff7a00] font-bold hover:underline cursor-pointer"
            >
              Reset Filter Pencarian
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredList.map((k) => {
            const isMe = session?.nik === k.nik || session?.username?.toLowerCase() === k.username?.toLowerCase();
            return (
              <div
                key={k.nik}
                className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:border-[#ff7a00]/50 hover:shadow-md transition-all flex flex-col justify-between group"
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
                      setIsDetailOpen(true);
                    }}
                    className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1"
                  >
                    <Eye className="w-3 h-3 text-teal-500" />
                    <span>Detail</span>
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
                  <th className="p-3">Username</th>
                  <th className="p-3">No. HP</th>
                  {canSeeSalary && <th className="p-3">Gaji Pokok</th>}
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredList.map((k) => {
                  const isMe = session?.nik === k.nik || session?.username?.toLowerCase() === k.username?.toLowerCase();
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
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-300">
                        @{k.username || '-'}
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
                              setIsDetailOpen(true);
                            }}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg cursor-pointer"
                            title="Lihat Profil Lengkap"
                          >
                            <Eye className="w-3.5 h-3.5 text-teal-500" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(k)}
                              className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-lg cursor-pointer"
                              title="Edit Data"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmNik(k.nik)}
                              className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-lg cursor-pointer"
                              title="Hapus Karyawan"
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

      {/* DETAIL MODAL / DRAWER */}
      {isDetailOpen && selectedKaryawan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-black text-lg text-white">
                  {selectedKaryawan.nama.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">{selectedKaryawan.nama}</h3>
                  <p className="text-xs text-teal-100 font-mono">NIK: {selectedKaryawan.nik}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1 mb-0.5">
                    <Briefcase className="w-3 h-3" />
                    <span>Divisi</span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-white">
                    {selectedKaryawan.divisi || 'Umum'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1 mb-0.5">
                    <Shield className="w-3 h-3" />
                    <span>Role Sistem</span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-white capitalize">
                    {selectedKaryawan.role || 'User'}
                  </div>
                </div>
              </div>

              {/* Kontak & Info Pribadi */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-teal-500" />
                    <span>Nomor WhatsApp / HP:</span>
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-white">
                    {selectedKaryawan.no_hp || '-'}
                  </span>
                </div>

                {selectedKaryawan.email && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-teal-500" />
                      <span>Email:</span>
                    </span>
                    <span className="font-bold text-slate-800 dark:text-white">{selectedKaryawan.email}</span>
                  </div>
                )}

                {selectedKaryawan.alamat && (
                  <div className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-teal-500" />
                      <span>Alamat Domisili:</span>
                    </span>
                    <p className="text-slate-700 dark:text-slate-200 font-medium pl-5">{selectedKaryawan.alamat}</p>
                  </div>
                )}

                {selectedKaryawan.kontak_darurat && (
                  <div className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-1">
                    <span className="text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Kontak Darurat:</span>
                    </span>
                    <p className="text-slate-700 dark:text-slate-200 font-mono text-[11px] pl-5">
                      {selectedKaryawan.kontak_darurat}
                    </p>
                  </div>
                )}
              </div>

              {/* Data Finansial (Superadmin Only) */}
              {canSeeSalary && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Informasi Finansial &amp; Lembur (Superadmin)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSalary(!showSalary)}
                      className="text-[#ff7a00] hover:underline cursor-pointer text-[10px]"
                    >
                      {showSalary ? 'Sembunyikan' : 'Buka'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Gaji Pokok:</span>
                      <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                        {showSalary ? `Rp ${(selectedKaryawan.gaji_pokok || 0).toLocaleString('id-ID')}` : '••••••'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Rate Lembur / Jam:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {showSalary ? `Rp ${(selectedKaryawan.rate_lembur || 10000).toLocaleString('id-ID')}` : '••••••'}
                      </span>
                    </div>
                  </div>
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
                  className="px-4 py-2 bg-[#ff7a00] hover:bg-[#e06b00] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
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
            <div className="p-4 sm:p-5 bg-white dark:bg-[#131d31] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
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

            <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00] disabled:opacity-60"
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
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
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Kontak Darurat (Nama &amp; Hubungan)
                  </label>
                  <input
                    type="text"
                    value={formData.kontak_darurat || ''}
                    onChange={(e) => setFormData({ ...formData, kontak_darurat: e.target.value })}
                    placeholder="e.g. Ibu Ani - Orang Tua - 0812345678"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
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
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
                />
              </div>

              {canSeeSalary && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
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
                        className="w-full px-3 py-1.5 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
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
                        className="w-full px-3 py-1.5 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#ff7a00]"
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
                  className="px-5 py-2 bg-[#ff7a00] hover:bg-[#e06b00] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-[#ff7a00]/20 disabled:opacity-50 flex items-center gap-1.5"
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
          <div className="bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
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
