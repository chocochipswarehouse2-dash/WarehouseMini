import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Filter,
  RotateCcw,
  Search,
  Zap,
  Palmtree,
  Calendar,
  Award,
  Sparkles,
  TrendingUp,
  LogIn,
  LogOut,
  Edit2,
  Trash2,
  Undo2,
  ShieldCheck,
  X,
  Save,
} from 'lucide-react';
import { isSuperadmin, hasPermission } from '../../services/permissions';
import {
  updateLemburStatus,
  updateLemburRecord,
  deleteLemburRecord,
  updateCutiStatus,
  updateCutiRecord,
  deleteCutiRecord,
  removeRosterShiftForCuti,
  updatePresensiRecord,
  deletePresensiRecord,
} from '../../services/supabase';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';
import {
  UserSession,
  KaryawanRecord,
  PresensiRecord,
  LemburRecord,
  PerijinanCutiRecord,
  RosterShiftRecord,
  IzinPulangAwalRecord,
  KpiAbsensiSummary,
} from '../../types';
import {
  fetchKaryawanDirectory,
  fetchPresensiRange,
  fetchLemburRecords,
  fetchCutiRecords,
  fetchRosterShiftList,
  fetchIzinPulangAwalList,
} from '../../services/supabase';
import { calculateKpiAbsensi } from '../../utils/kpiCalculator';
import { getUserPersonName } from '../../utils/userResolver';

interface HrRekapViewProps {
  session: UserSession | null;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const HrRekapView: React.FC<HrRekapViewProps> = ({ session, onShowToast }) => {
  const isAdmin = isSuperadmin(session) || session?.role === 'Super Admin' || session?.role === 'Manager' || hasPermission(session, 'menu_hr_approval');

  // Modal Edit States
  const [editingLembur, setEditingLembur] = useState<LemburRecord | null>(null);
  const [editingCuti, setEditingCuti] = useState<PerijinanCutiRecord | null>(null);
  const [editingPresensi, setEditingPresensi] = useState<PresensiRecord | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | number | null>(null);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const startOfMonthStr = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [startDate, setStartDate] = useState<string>(startOfMonthStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedNik, setSelectedNik] = useState<string>('ALL');
  const [selectedDivisi, setSelectedDivisi] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ringkasan' | 'kpi' | 'lembur' | 'cuti' | 'absensi'>('ringkasan');
  const [loading, setLoading] = useState<boolean>(false);

  const [karyawanList, setKaryawanList] = useState<KaryawanRecord[]>([]);
  const [presensiList, setPresensiList] = useState<PresensiRecord[]>([]);
  const [lemburList, setLemburList] = useState<LemburRecord[]>([]);
  const [cutiList, setCutiList] = useState<PerijinanCutiRecord[]>([]);
  const [rosterList, setRosterList] = useState<RosterShiftRecord[]>([]);
  const [izinPulangList, setIzinPulangList] = useState<IzinPulangAwalRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [karyawans, presensis, lemburs, cutis, rosters, izins] = await Promise.all([
        fetchKaryawanDirectory(),
        fetchPresensiRange(startDate, endDate),
        fetchLemburRecords(),
        fetchCutiRecords(),
        fetchRosterShiftList(undefined, startDate, endDate),
        fetchIzinPulangAwalList(),
      ]);

      setKaryawanList(karyawans);
      setPresensiList(presensis);
      setLemburList(lemburs);
      setCutiList(cutis);
      setRosterList(rosters);
      setIzinPulangList(izins);
    } catch (err) {
      console.error('Error loading rekap data:', err);
      onShowToast('Gagal memuat data rekap operasional.', 'error');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set Date Range Presets
  const setDatePreset = (preset: 'today' | 'this_month' | 'last_month' | 'all') => {
    const today = new Date();
    if (preset === 'today') {
      const d = today.toISOString().slice(0, 10);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'this_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const last = today.toISOString().slice(0, 10);
      setStartDate(first);
      setEndDate(last);
    } else if (preset === 'last_month') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10);
      const last = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10);
      setStartDate(first);
      setEndDate(last);
    } else if (preset === 'all') {
      setStartDate('2026-01-01');
      setEndDate('2026-12-31');
    }
  };

  // --- LEMBUR HANDLERS ---
  const handleResetLembur = async (item: LemburRecord) => {
    if (!confirm(`Batalkan persetujuan lembur untuk ${item.nama}? Status akan dikembalikan ke 'Diajukan'.`)) return;
    setActionLoadingId(item.id);
    try {
      await updateLemburStatus(item.id, 'Diajukan', '');
      setLemburList((prev) =>
        prev.map((l) => (l.id === item.id ? { ...l, status: 'Diajukan', approved_by: undefined } : l))
      );
      playSuccessBeep();
      onShowToast(`Lembur ${item.nama} telah dibatalkan & status di-reset ke 'Diajukan'.`, 'info');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal membatalkan approval lembur: ' + (err?.message || 'Error'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteLembur = async (item: LemburRecord) => {
    if (!confirm(`Hapus permanen lembur ${item.nama} (${item.tanggal})? Tindakan tidak dapat dibatalkan.`)) return;
    setActionLoadingId(item.id);
    try {
      await deleteLemburRecord(item.id);
      setLemburList((prev) => prev.filter((l) => l.id !== item.id));
      playSuccessBeep();
      onShowToast(`Data lembur ${item.nama} berhasil dihapus permanen.`, 'success');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menghapus lembur: ' + (err?.message || 'Error'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveEditLembur = async () => {
    if (!editingLembur) return;
    setActionLoadingId(editingLembur.id);
    try {
      await updateLemburRecord(editingLembur.id, {
        tanggal: editingLembur.tanggal,
        jam_mulai: editingLembur.jam_mulai,
        jam_selesai: editingLembur.jam_selesai,
        durasi_jam: editingLembur.durasi_jam,
        deskripsi: editingLembur.deskripsi,
        total_lembur: editingLembur.total_lembur,
      });
      setLemburList((prev) =>
        prev.map((l) => (l.id === editingLembur.id ? { ...editingLembur } : l))
      );
      playSuccessBeep();
      onShowToast('Data lembur berhasil diperbarui!', 'success');
      setEditingLembur(null);
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menyimpan perubahan lembur: ' + (err?.message || 'Error'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // --- CUTI HANDLERS ---
  const handleResetCuti = async (item: PerijinanCutiRecord) => {
    if (!confirm(`Batalkan persetujuan cuti untuk ${item.nama}? Status akan dikembalikan ke 'Diajukan'.`)) return;
    setActionLoadingId(item.id);
    try {
      await updateCutiStatus(item.id, 'Diajukan', '');
      await removeRosterShiftForCuti(item);
      setCutiList((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: 'Diajukan', approved_by: undefined } : c))
      );
      playSuccessBeep();
      onShowToast(`Cuti ${item.nama} telah dibatalkan & status di-reset ke 'Diajukan'.`, 'info');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal membatalkan approval cuti: ' + (err?.message || 'Error'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteCuti = async (item: PerijinanCutiRecord) => {
    if (!confirm(`Hapus permanen permohonan cuti ${item.nama} (${item.tgl_mulai} s/d ${item.tgl_selesai})? Tindakan tidak dapat dibatalkan.`)) return;
    setActionLoadingId(item.id);
    try {
      await deleteCutiRecord(item.id);
      await removeRosterShiftForCuti(item);
      setCutiList((prev) => prev.filter((c) => c.id !== item.id));
      playSuccessBeep();
      onShowToast(`Data cuti ${item.nama} berhasil dihapus permanen.`, 'success');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menghapus cuti: ' + (err?.message || 'Error'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveEditCuti = async () => {
    if (!editingCuti) return;
    setActionLoadingId(editingCuti.id);
    try {
      await updateCutiRecord(editingCuti.id, {
        jenis: editingCuti.jenis,
        tgl_mulai: editingCuti.tgl_mulai,
        tgl_selesai: editingCuti.tgl_selesai,
        jumlah_hari: editingCuti.jumlah_hari,
        alasan: editingCuti.alasan,
      });
      setCutiList((prev) =>
        prev.map((c) => (c.id === editingCuti.id ? { ...editingCuti } : c))
      );
      playSuccessBeep();
      onShowToast('Data cuti berhasil diperbarui!', 'success');
      setEditingCuti(null);
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menyimpan perubahan cuti: ' + (err?.message || 'Error'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // --- PRESENSI HANDLERS ---
  const handleDeletePresensi = async (item: PresensiRecord) => {
    if (!confirm(`Hapus log presensi ${item.nama || item.nik} pada ${item.tanggal}? Tindakan tidak dapat dibatalkan.`)) return;
    setActionLoadingId(item.id);
    try {
      const res = await deletePresensiRecord(item.id);
      if (res.success) {
        setPresensiList((prev) => prev.filter((p) => p.id !== item.id));
        playSuccessBeep();
        onShowToast(`Log presensi ${item.nama || item.nik} berhasil dihapus.`, 'success');
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menghapus presensi: ' + (err?.message || 'Error'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveEditPresensi = async () => {
    if (!editingPresensi) return;
    setActionLoadingId(editingPresensi.id);
    try {
      const res = await updatePresensiRecord(editingPresensi.id, {
        jam_masuk: editingPresensi.jam_masuk,
        jam_pulang: editingPresensi.jam_pulang,
        shift: editingPresensi.shift,
        status: editingPresensi.status,
        catatan: editingPresensi.catatan,
      });
      if (res.success) {
        setPresensiList((prev) =>
          prev.map((p) => (p.id === editingPresensi.id ? { ...editingPresensi } : p))
        );
        playSuccessBeep();
        onShowToast('Log presensi berhasil diperbarui!', 'success');
        setEditingPresensi(null);
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menyimpan perubahan presensi: ' + (err?.message || 'Error'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };


  // List unique divisi
  const divisiList = useMemo(() => {
    const set = new Set<string>();
    karyawanList.forEach((k) => {
      if (k.divisi) set.add(k.divisi);
    });
    return Array.from(set);
  }, [karyawanList]);

  // Filtered Karyawan
  const filteredKaryawan = useMemo(() => {
    return karyawanList.filter((k) => {
      if (selectedNik !== 'ALL' && k.nik !== selectedNik) return false;
      if (selectedDivisi !== 'ALL' && k.divisi !== selectedDivisi) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (k.nama || '').toLowerCase().includes(q);
        const matchNik = (k.nik || '').toLowerCase().includes(q);
        if (!matchName && !matchNik) return false;
      }
      return true;
    });
  }, [karyawanList, selectedNik, selectedDivisi, searchQuery]);

  // Lembur Filtered by Date Range & Search
  const filteredLembur = useMemo(() => {
    return lemburList.filter((l) => {
      if (l.tanggal < startDate || l.tanggal > endDate) return false;
      if (selectedNik !== 'ALL' && l.nik !== selectedNik) return false;
      if (selectedDivisi !== 'ALL') {
        const k = karyawanList.find((item) => item.nik === l.nik);
        if (k?.divisi !== selectedDivisi) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNama = (l.nama || '').toLowerCase().includes(q);
        const matchNik = (l.nik || '').toLowerCase().includes(q);
        const matchDesc = (l.deskripsi || '').toLowerCase().includes(q);
        if (!matchNama && !matchNik && !matchDesc) return false;
      }
      return true;
    });
  }, [lemburList, startDate, endDate, selectedNik, selectedDivisi, searchQuery, karyawanList]);

  // Cuti Filtered
  const filteredCuti = useMemo(() => {
    return cutiList.filter((c) => {
      if (c.tgl_selesai < startDate || c.tgl_mulai > endDate) return false;
      if (selectedNik !== 'ALL' && c.nik !== selectedNik) return false;
      if (selectedDivisi !== 'ALL') {
        const k = karyawanList.find((item) => item.nik === c.nik);
        if (k?.divisi !== selectedDivisi) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNama = (c.nama || '').toLowerCase().includes(q);
        const matchNik = (c.nik || '').toLowerCase().includes(q);
        const matchAlasan = (c.alasan || '').toLowerCase().includes(q);
        if (!matchNama && !matchNik && !matchAlasan) return false;
      }
      return true;
    });
  }, [cutiList, startDate, endDate, selectedNik, selectedDivisi, searchQuery, karyawanList]);

  // Presensi Filtered
  const filteredPresensi = useMemo(() => {
    return presensiList.filter((p) => {
      if (p.tanggal < startDate || p.tanggal > endDate) return false;
      if (selectedNik !== 'ALL' && p.nik !== selectedNik) return false;
      if (selectedDivisi !== 'ALL') {
        const k = karyawanList.find((item) => item.nik === p.nik);
        if (k?.divisi !== selectedDivisi) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNama = (p.nama || '').toLowerCase().includes(q);
        const matchNik = (p.nik || '').toLowerCase().includes(q);
        if (!matchNama && !matchNik) return false;
      }
      return true;
    });
  }, [presensiList, startDate, endDate, selectedNik, selectedDivisi, searchQuery, karyawanList]);

  // Rekap Per Karyawan Aggregation
  const summaryPerKaryawan = useMemo(() => {
    return filteredKaryawan.map((k) => {
      const pRecords = presensiList.filter(
        (p) => p.nik === k.nik && p.tanggal >= startDate && p.tanggal <= endDate
      );
      const totalHadir = pRecords.filter((p) => p.jam_masuk).length;
      const totalTerlambat = pRecords.filter((p) => p.status === 'Terlambat').length;
      const totalTepatWaktu = pRecords.filter((p) => p.status === 'Tepat Waktu' || p.status === 'Hadir').length;

      // Lembur Disetujui
      const lRecords = lemburList.filter(
        (l) =>
          l.nik === k.nik &&
          l.tanggal >= startDate &&
          l.tanggal <= endDate &&
          l.status === 'Disetujui'
      );
      const totalJamLembur = lRecords.reduce((acc, curr) => acc + (Number(curr.durasi_jam) || 0), 0);
      const totalUangLembur = lRecords.reduce((acc, curr) => acc + (Number(curr.total_lembur) || 0), 0);

      // Cuti Disetujui
      const cRecords = cutiList.filter(
        (c) =>
          c.nik === k.nik &&
          c.status === 'Disetujui' &&
          !(c.tgl_selesai < startDate || c.tgl_mulai > endDate)
      );
      const totalHariCuti = cRecords.reduce((acc, curr) => acc + (Number(curr.jumlah_hari) || 0), 0);

      // Scheduled workdays from Roster
      const rRecords = rosterList.filter(
        (r) =>
          r.nik === k.nik &&
          r.tanggal >= startDate &&
          r.tanggal <= endDate &&
          r.shift &&
          r.shift.toUpperCase() !== 'OFF' &&
          r.shift.toUpperCase() !== 'LIBUR'
      );
      const totalJadwalKerja = rRecords.length;
      const totalTidakMasuk = totalJadwalKerja > 0 ? Math.max(0, totalJadwalKerja - totalHadir) : 0;

      return {
        nik: k.nik,
        nama: k.nama,
        divisi: k.divisi || '-',
        totalJadwalKerja,
        totalHadir,
        totalTidakMasuk,
        totalTerlambat,
        totalTepatWaktu,
        totalJamLembur,
        totalUangLembur,
        totalHariCuti,
      };
    });
  }, [filteredKaryawan, presensiList, lemburList, cutiList, rosterList, startDate, endDate]);

  // KPI Summary Evaluation across filtered period
  const kpiSummaryList = useMemo(() => {
    const list = filteredKaryawan.map((k) => {
      return calculateKpiAbsensi({
        karyawan: k,
        presensiList,
        rosterList,
        lemburList,
        cutiList,
        izinPulangAwalList: izinPulangList,
        startDate,
        endDate,
      });
    });
    // Sort descending by Nilai KPI
    list.sort((a, b) => b.nilaiKpiAbsensi - a.nilaiKpiAbsensi);
    return list;
  }, [filteredKaryawan, presensiList, rosterList, lemburList, cutiList, izinPulangList, startDate, endDate]);

  // Grand Totals
  const grandTotals = useMemo(() => {
    let jamLembur = 0;
    let uangLembur = 0;
    let hadir = 0;
    let terlambat = 0;
    let cuti = 0;
    let tidakMasuk = 0;

    summaryPerKaryawan.forEach((s) => {
      jamLembur += s.totalJamLembur;
      uangLembur += s.totalUangLembur;
      hadir += s.totalHadir;
      terlambat += s.totalTerlambat;
      cuti += s.totalHariCuti;
      tidakMasuk += s.totalTidakMasuk;
    });

    return { jamLembur, uangLembur, hadir, terlambat, cuti, tidakMasuk };
  }, [summaryPerKaryawan]);

  // Export CSV Helper
  const exportToCSV = () => {
    if (summaryPerKaryawan.length === 0) {
      onShowToast('Tidak ada data untuk diekspor.', 'warning');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += `REKAPITULASI KARYAWAN & ABSENSI (${startDate} s/d ${endDate})\n\n`;

    if (activeTab === 'ringkasan') {
      csvContent += 'NIK,Nama,Divisi,Jadwal Hari,Total Masuk,Tidak Masuk,Tepat Waktu,Terlambat,Lembur Disetujui (Jam),Estimasi Upah Lembur (Rp),Cuti (Hari)\n';
      summaryPerKaryawan.forEach((s) => {
        csvContent += `"${s.nik}","${s.nama}","${s.divisi}",${s.totalJadwalKerja},${s.totalHadir},${s.totalTidakMasuk},${s.totalTepatWaktu},${s.totalTerlambat},${s.totalJamLembur},${s.totalUangLembur},${s.totalHariCuti}\n`;
      });
    } else if (activeTab === 'kpi') {
      csvContent += 'Rank,NIK,Nama,Divisi,Grade,Nilai KPI,Status Kedisiplinan,Skor Berangkat,Skor Pulang,% On-Time,% Kehadiran,Total Hadir,Jadwal Kerja,Terlambat (x),Total Menit Terlambat,Pulang Normal,Izin Pulang Awal,Alpha\n';
      kpiSummaryList.forEach((k, idx) => {
        csvContent += `${idx + 1},"${k.nik}","${k.nama}","${k.divisi}","${k.grade}",${k.nilaiKpiAbsensi},"${k.labelStatus}",${k.skorBerangkat},${k.skorPulang},${k.persenOnTime}%,${k.persenKehadiran}%,${k.totalHadir},${k.totalHariKerja},${k.totalTerlambat},${k.totalMenitTerlambat},${k.totalPulangNormal},${k.totalPulangAwalIzin},${k.totalAlpha}\n`;
      });
    } else if (activeTab === 'lembur') {
      csvContent += 'Tanggal,NIK,Nama,Jam Mulai,Jam Selesai,Durasi (Jam),Keterangan,Status,Disetujui Oleh,Total (Rp)\n';
      filteredLembur.forEach((l) => {
        csvContent += `"${l.tanggal}","${l.nik}","${l.nama}","${l.jam_mulai}","${l.jam_selesai}",${l.durasi_jam},"${(l.deskripsi || '').replace(/"/g, '""')}","${l.status}","${l.approved_by || '-'}","${l.total_lembur || 0}"\n`;
      });
    } else if (activeTab === 'cuti') {
      csvContent += 'NIK,Nama,Jenis,Tanggal Mulai,Tanggal Selesai,Durasi (Hari),Alasan,Status,Disetujui Oleh\n';
      filteredCuti.forEach((c) => {
        csvContent += `"${c.nik}","${c.nama}","${c.jenis}","${c.tgl_mulai}","${c.tgl_selesai}",${c.jumlah_hari},"${(c.alasan || '').replace(/"/g, '""')}","${c.status}","${c.approved_by || '-'}"\n`;
      });
    } else if (activeTab === 'absensi') {
      csvContent += 'Tanggal,NIK,Nama,Shift,Jam Masuk,Jam Pulang,Status,Catatan\n';
      filteredPresensi.forEach((p) => {
        csvContent += `"${p.tanggal}","${p.nik}","${p.nama || '-'}","${p.shift || '-'}","${p.jam_masuk || '-'}","${p.jam_pulang || '-'}","${p.status || '-'}","${(p.catatan || '-').replace(/"/g, '""')}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rekap_HR_${activeTab}_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast(`File CSV Rekap ${activeTab} berhasil diunduh!`, 'success');
  };

  return (
    <div className="p-2 sm:p-3 max-w-7xl mx-auto space-y-3 pb-24 text-slate-800 dark:text-slate-100">
      {/* HEADER */}
      <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-primary-500/10 text-primary-500">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Rekap & Laporan Karyawan
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Rekap kehadiran, keterlambatan, lemburan disetujui, dan cuti karyawan
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-2 py-2.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-2 py-2.5 text-xs font-bold rounded-xl bg-primary-500 hover:bg-primary-600 text-white shadow-md shadow-primary-500/20 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-primary-500" />
            <span>Filter Periode & Karyawan</span>
          </div>
          {/* Quick Date Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 mr-1">Preset:</span>
            <button
              type="button"
              onClick={() => setDatePreset('today')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary-500 hover:text-white transition-all cursor-pointer"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('this_month')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary-500 hover:text-white transition-all cursor-pointer"
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('last_month')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary-500 hover:text-white transition-all cursor-pointer"
            >
              Bulan Lalu
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 hover:bg-primary-500 hover:text-white transition-all cursor-pointer"
            >
              Semua Periode (2026)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Tanggal Mulai */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Tanggal Selesai */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              Sampai Tanggal
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Divisi */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              Divisi
            </label>
            <select
              value={selectedDivisi}
              onChange={(e) => setSelectedDivisi(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="ALL">Semua Divisi</option>
              {divisiList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Karyawan (NIK / Nama) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              Pilih Karyawan
            </label>
            <select
              value={selectedNik}
              onChange={(e) => setSelectedNik(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 truncate"
            >
              <option value="ALL">Semua Karyawan ({karyawanList.length})</option>
              {karyawanList.map((k) => (
                <option key={k.nik} value={k.nik}>
                  {k.nama} ({k.nik})
                </option>
              ))}
            </select>
          </div>

          {/* Cari Keyword */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              Pencarian Cepat
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama / NIK..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-1">
            <Users className="w-4 h-4 text-blue-500" />
            <span>Karyawan</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {filteredKaryawan.length}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Total terfilter</div>
        </div>

        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Total Masuk</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {grandTotals.hadir}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Hari kehadiran</div>
        </div>

        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-1">
            <Clock className="w-4 h-4 text-primary-500" />
            <span>Terlambat</span>
          </div>
          <div className="text-2xl font-black text-primary-600 dark:text-primary-400">
            {grandTotals.terlambat}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Kejadian terlambat</div>
        </div>

        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-1">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span>Tidak Masuk</span>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            {grandTotals.tidakMasuk}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Tanpa presensi</div>
        </div>

        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-1">
            <Zap className="w-4 h-4 text-primary-500" />
            <span>Lembur ACC</span>
          </div>
          <div className="text-2xl font-black text-primary-500">
            {grandTotals.jamLembur} <span className="text-xs font-bold">Jam</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Rp {grandTotals.uangLembur.toLocaleString('id-ID')}
          </div>
        </div>

        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-1">
            <Palmtree className="w-4 h-4 text-teal-500" />
            <span>Cuti / Ijin</span>
          </div>
          <div className="text-2xl font-black text-teal-600 dark:text-teal-400">
            {grandTotals.cuti} <span className="text-xs font-bold">Hari</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Cuti disetujui</div>
        </div>
      </div>

      {/* TABS HEADER */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('ringkasan')}
          className={`px-2 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'ringkasan'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Ringkasan Per Karyawan ({summaryPerKaryawan.length})
        </button>
        <button
          onClick={() => setActiveTab('kpi')}
          className={`px-2 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'kpi'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>KPI & Nilai Absensi ({kpiSummaryList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('lembur')}
          className={`px-2 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'lembur'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Detail Lemburan ({filteredLembur.length})
        </button>
        <button
          onClick={() => setActiveTab('cuti')}
          className={`px-2 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'cuti'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Detail Cuti & Ijin ({filteredCuti.length})
        </button>
        <button
          onClick={() => setActiveTab('absensi')}
          className={`px-2 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'absensi'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Detail Log Presensi ({filteredPresensi.length})
        </button>
      </div>

      {/* TAB KPI & NILAI ABSENSI */}
      {activeTab === 'kpi' && (
        <div className="space-y-4">
          {/* TOP 3 PODIUM */}
          {kpiSummaryList.length >= 3 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* RANK 2 */}
              <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl relative overflow-hidden flex flex-col items-center text-center shadow-sm">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black flex items-center justify-center text-base mb-2">
                  🥈 #2
                </div>
                <div className="font-black text-slate-900 dark:text-white text-base">
                  {kpiSummaryList[1].nama}
                </div>
                <div className="text-[11px] text-slate-400 font-mono mb-2">NIK: {kpiSummaryList[1].nik}</div>
                <div className="text-3xl font-black text-primary-500 mb-1">
                  {kpiSummaryList[1].nilaiKpiAbsensi}
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                  Grade {kpiSummaryList[1].grade} • {kpiSummaryList[1].labelStatus}
                </span>
                <div className="grid grid-cols-2 gap-2 w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                  <div>
                    <span className="text-slate-400 block">Berangkat (On-Time)</span>
                    <strong className="text-emerald-500 font-black">{kpiSummaryList[1].skorBerangkat} pts</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Pulang Normal</span>
                    <strong className="text-primary-500 font-black">{kpiSummaryList[1].skorPulang} pts</strong>
                  </div>
                </div>
              </div>

              {/* RANK 1 */}
              <div className="bg-gradient-to-b from-primary-500/10 via-white to-white dark:from-primary-500/10 dark:via-[#131d31] dark:to-[#131d31] border-2 border-primary-500/40 p-4 rounded-3xl relative overflow-hidden flex flex-col items-center text-center shadow-lg shadow-primary-500/10">
                <div className="w-12 h-12 rounded-2xl bg-primary-500 text-white font-black flex items-center justify-center text-lg mb-2 shadow-md shadow-primary-500/30">
                  👑 #1
                </div>
                <div className="font-black text-slate-900 dark:text-white text-lg">
                  {kpiSummaryList[0].nama}
                </div>
                <div className="text-[11px] text-slate-400 font-mono mb-2">NIK: {kpiSummaryList[0].nik}</div>
                <div className="text-4xl font-black text-primary-500 mb-1">
                  {kpiSummaryList[0].nilaiKpiAbsensi}
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Grade {kpiSummaryList[0].grade} • {kpiSummaryList[0].labelStatus}
                </span>
                <div className="grid grid-cols-2 gap-2 w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Berangkat (On-Time)</span>
                    <strong className="text-emerald-500 font-black">{kpiSummaryList[0].skorBerangkat} pts ({kpiSummaryList[0].persenOnTime}%)</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Pulang Normal</span>
                    <strong className="text-primary-500 font-black">{kpiSummaryList[0].skorPulang} pts</strong>
                  </div>
                </div>
              </div>

              {/* RANK 3 */}
              <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl relative overflow-hidden flex flex-col items-center text-center shadow-sm">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black flex items-center justify-center text-base mb-2">
                  🥉 #3
                </div>
                <div className="font-black text-slate-900 dark:text-white text-base">
                  {kpiSummaryList[2].nama}
                </div>
                <div className="text-[11px] text-slate-400 font-mono mb-2">NIK: {kpiSummaryList[2].nik}</div>
                <div className="text-3xl font-black text-primary-500 mb-1">
                  {kpiSummaryList[2].nilaiKpiAbsensi}
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                  Grade {kpiSummaryList[2].grade} • {kpiSummaryList[2].labelStatus}
                </span>
                <div className="grid grid-cols-2 gap-2 w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                  <div>
                    <span className="text-slate-400 block">Berangkat (On-Time)</span>
                    <strong className="text-emerald-500 font-black">{kpiSummaryList[2].skorBerangkat} pts</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Pulang Normal</span>
                    <strong className="text-primary-500 font-black">{kpiSummaryList[2].skorPulang} pts</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TABLE FULL LEADERBOARD */}
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary-500" />
                  <span>Leaderboard Kedisiplinan & Nilai Absensi Karyawan</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Nilai dihitung dari kedisiplinan jam datang (45%), jam pulang (35%), rasio kehadiran (20%), minus poin keterlambatan/alpha/pulang awal tanpa izin.
                </p>
              </div>
              <span className="text-xs text-slate-400 font-bold">{kpiSummaryList.length} Karyawan</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                    <th className="py-2 px-2 text-center w-12">Rank</th>
                    <th className="py-2 px-3">Karyawan</th>
                    <th className="py-2 px-3">Divisi</th>
                    <th className="py-2 px-3 text-center">Grade</th>
                    <th className="py-2 px-3 text-center text-primary-500">Nilai KPI</th>
                    <th className="py-2 px-3 text-center text-emerald-600 dark:text-emerald-400">Skor Berangkat</th>
                    <th className="py-2 px-3 text-center text-blue-600 dark:text-blue-400">Skor Pulang</th>
                    <th className="py-2 px-3 text-center">% On-Time</th>
                    <th className="py-2 px-3 text-center">Terlambat</th>
                    <th className="py-2 px-3 text-center">Pulang Normal / Izin</th>
                    <th className="py-2 px-3 text-center text-rose-500">Alpha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {kpiSummaryList.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        Tidak ada data KPI karyawan pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    kpiSummaryList.map((k, idx) => (
                      <tr
                        key={k.nik}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                      >
                        <td className="py-3 px-2 text-center font-black text-slate-700 dark:text-slate-300">
                          {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `#${idx + 1}`}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-extrabold text-slate-900 dark:text-white">{k.nama}</div>
                          <div className="text-[10px] text-slate-400 font-mono">NIK: {k.nik}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{k.divisi}</td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                              k.grade === 'A+'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : k.grade === 'A'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                : k.grade === 'B'
                                ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                                : k.grade === 'C'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {k.grade}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="font-black text-base text-primary-500">{k.nilaiKpiAbsensi}</div>
                          <div className="text-[9px] text-slate-400 font-bold">{k.labelStatus}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            {k.skorBerangkat} pts
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {k.totalOnTime}/{k.totalHadir} tepat waktu
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                            {k.skorPulang} pts
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {k.totalPulangNormal} normal
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                          {k.persenOnTime}%
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={k.totalTerlambat > 0 ? 'text-primary-500 font-bold' : 'text-slate-400'}>
                            {k.totalTerlambat > 0 ? `${k.totalTerlambat}x (${k.totalMenitTerlambat}m)` : '-'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-300 text-[11px]">
                          {k.totalPulangAwalIzin > 0 && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 text-[10px] mr-1">
                              Izin: {k.totalPulangAwalIzin}x
                            </span>
                          )}
                          {k.totalPulangAwalTanpaIzin > 0 && (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 text-[10px]">
                              Tanpa Izin: {k.totalPulangAwalTanpaIzin}x
                            </span>
                          )}
                          {k.totalPulangAwalIzin === 0 && k.totalPulangAwalTanpaIzin === 0 && (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-rose-500">
                          {k.totalAlpha > 0 ? `${k.totalAlpha} Hari` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: RINGKASAN PER KARYAWAN */}
      {activeTab === 'ringkasan' && (
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-2 px-2">Karyawan</th>
                  <th className="py-2 px-3">Divisi</th>
                  <th className="py-2 px-3 text-center">Jadwal</th>
                  <th className="py-2 px-3 text-center text-emerald-600 dark:text-emerald-400">
                    Masuk
                  </th>
                  <th className="py-2 px-3 text-center text-amber-600 dark:text-amber-400">
                    Tidak Masuk
                  </th>
                  <th className="py-2 px-3 text-center text-primary-600 dark:text-primary-400">
                    Terlambat
                  </th>
                  <th className="py-2 px-3 text-center text-primary-500">
                    Lembur (Jam)
                  </th>
                  <th className="py-2 px-3 text-right">Est. Upah Lembur</th>
                  <th className="py-2 px-3 text-center text-teal-600 dark:text-teal-400">
                    Cuti (Hari)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {summaryPerKaryawan.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Tidak ada data karyawan yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  summaryPerKaryawan.map((s) => (
                    <tr
                      key={s.nik}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3.5 px-2">
                        <div className="font-extrabold text-slate-900 dark:text-white">{s.nama}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          NIK: {s.nik}
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2.5 py-1 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                          {s.divisi}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold">
                        {s.totalJadwalKerja > 0 ? s.totalJadwalKerja : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className="inline-flex items-center justify-center font-black px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                          {s.totalHadir}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center font-black px-2.5 py-0.5 rounded-lg ${
                            s.totalTidakMasuk > 0
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {s.totalTidakMasuk}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center font-black px-2.5 py-0.5 rounded-lg ${
                            s.totalTerlambat > 0
                              ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {s.totalTerlambat}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-black text-primary-500">
                        {s.totalJamLembur > 0 ? `${s.totalJamLembur} Jam` : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {s.totalUangLembur > 0
                          ? `Rp ${s.totalUangLembur.toLocaleString('id-ID')}`
                          : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-center font-black text-teal-600 dark:text-teal-400">
                        {s.totalHariCuti > 0 ? `${s.totalHariCuti} Hari` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DETAIL LEMBURAN */}
      {activeTab === 'lembur' && (
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                Daftar Semua Lemburan Sesuai Filter
              </h2>
              <span className="text-xs text-slate-400 font-bold">{filteredLembur.length} data lembur ditemukan</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Detail Lembur (CSV)</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-2 px-2">Tanggal</th>
                  <th className="py-2 px-3">Karyawan</th>
                  <th className="py-2 px-3 text-center">Waktu Mulai - Selesai</th>
                  <th className="py-2 px-3 text-center">Durasi</th>
                  <th className="py-2 px-3">Keterangan / Alasan</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3">Disetujui Oleh</th>
                  <th className="py-2 px-3 text-right">Total (Rp)</th>
                  {isAdmin && <th className="py-2 px-3 text-center w-28">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLembur.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} className="py-12 text-center text-slate-400">
                      Tidak ada catatan lembur yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredLembur.map((l) => (
                    <tr
                      key={l.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-2 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {l.tanggal}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900 dark:text-white">{l.nama}</div>
                        <div className="text-[10px] text-slate-400 font-mono">NIK: {l.nik}</div>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                        {l.jam_mulai} - {l.jam_selesai}
                      </td>
                      <td className="py-3 px-3 text-center font-black text-primary-500">
                        {l.durasi_jam} Jam
                      </td>
                      <td className="py-3 px-3 max-w-xs truncate text-slate-600 dark:text-slate-300">
                        {l.deskripsi || '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black ${
                            l.status === 'Disetujui'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : l.status === 'Ditolak'
                              ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400'
                              : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                        {l.approved_by ? (
                          <div>
                            <div className="font-bold">{l.approved_by}</div>
                            {l.catatan && (
                              <div className="text-[10px] text-slate-400 italic">
                                "{l.catatan}"
                              </div>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-800 dark:text-slate-200 font-mono">
                        Rp {(l.total_lembur || 0).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DETAIL CUTI */}
      {activeTab === 'cuti' && (
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                Daftar Permohonan Cuti / Ijin Sesuai Filter
              </h2>
              <span className="text-xs text-slate-400 font-bold">{filteredCuti.length} data cuti/ijin ditemukan</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Detail Cuti (CSV)</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-2 px-2">Karyawan</th>
                  <th className="py-2 px-3">Jenis</th>
                  <th className="py-2 px-3 text-center">Periode Tanggal</th>
                  <th className="py-2 px-3 text-center">Durasi</th>
                  <th className="py-2 px-3">Alasan</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3">Disetujui Oleh</th>
                  {isAdmin && <th className="py-2 px-3 text-center w-28">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCuti.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="py-12 text-center text-slate-400">
                      Tidak ada catatan cuti/ijin yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredCuti.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-2">
                        <div className="font-extrabold text-slate-900 dark:text-white">{c.nama}</div>
                        <div className="text-[10px] text-slate-400 font-mono">NIK: {c.nik}</div>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-700 dark:text-slate-300">
                        {c.jenis}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono">
                        {c.tgl_mulai} s/d {c.tgl_selesai}
                      </td>
                      <td className="py-3 px-3 text-center font-black text-teal-600 dark:text-teal-400">
                        {c.jumlah_hari} Hari
                      </td>
                      <td className="py-3 px-3 max-w-xs truncate text-slate-600 dark:text-slate-300">
                        {c.alasan || '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black ${
                            c.status === 'Disetujui'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : c.status === 'Ditolak'
                              ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400'
                              : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                        {c.approved_by || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: DETAIL LOG PRESENSI */}
      {activeTab === 'absensi' && (
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                Riwayat Presensi Masuk & Pulang Sesuai Filter
              </h2>
              <span className="text-xs text-slate-400 font-bold">{filteredPresensi.length} log presensi ditemukan</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Detail Presensi (CSV)</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-2 px-2">Tanggal</th>
                  <th className="py-2 px-3">Karyawan</th>
                  <th className="py-2 px-3">Shift</th>
                  <th className="py-2 px-3 text-center">Jam Masuk</th>
                  <th className="py-2 px-3 text-center">Jam Pulang</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3">Catatan</th>
                  {isAdmin && <th className="py-2 px-3 text-center w-24">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPresensi.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="py-12 text-center text-slate-400">
                      Tidak ada rekaman presensi yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredPresensi.map((p, idx) => (
                    <tr
                      key={p.id || idx}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-2 font-bold text-slate-900 dark:text-white whitespace-nowrap font-mono">
                        {p.tanggal}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900 dark:text-white">
                          {p.nama && p.nama.trim().toLowerCase() !== p.nik.trim().toLowerCase()
                            ? p.nama
                            : getUserPersonName(p.nik, p.nama || p.nik)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">NIK: {p.nik}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-semibold">
                        {p.shift || '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {p.jam_masuk || '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-600 dark:text-slate-300">
                        {p.jam_pulang || '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black ${
                            p.status === 'Tepat Waktu' || p.status === 'Hadir'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : p.status === 'Terlambat'
                              ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {p.status || '-'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-xs">
                        {p.catatan || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EDIT LEMBUR */}
      {/* ========================================================================= */}
      {editingLembur && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-500" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  Edit Data Lembur: {editingLembur.nama}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingLembur(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">Tanggal</label>
                <input
                  type="date"
                  value={editingLembur.tanggal}
                  onChange={(e) => setEditingLembur({ ...editingLembur, tanggal: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    value={editingLembur.jam_mulai}
                    onChange={(e) => setEditingLembur({ ...editingLembur, jam_mulai: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Jam Selesai</label>
                  <input
                    type="time"
                    value={editingLembur.jam_selesai}
                    onChange={(e) => setEditingLembur({ ...editingLembur, jam_selesai: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Durasi (Jam)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editingLembur.durasi_jam}
                    onChange={(e) => setEditingLembur({ ...editingLembur, durasi_jam: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Total Upah Lembur (Rp)</label>
                  <input
                    type="number"
                    value={editingLembur.total_lembur || 0}
                    onChange={(e) => setEditingLembur({ ...editingLembur, total_lembur: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">Keterangan / Alasan Pekerjaan</label>
                <textarea
                  value={editingLembur.deskripsi}
                  onChange={(e) => setEditingLembur({ ...editingLembur, deskripsi: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingLembur(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEditLembur}
                disabled={actionLoadingId === editingLembur.id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary-500 hover:bg-primary-600 text-white shadow-md shadow-primary-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EDIT CUTI */}
      {/* ========================================================================= */}
      {editingCuti && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-500" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  Edit Permohonan Cuti: {editingCuti.nama}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCuti(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">Jenis Cuti / Ijin</label>
                <select
                  value={editingCuti.jenis}
                  onChange={(e) => setEditingCuti({ ...editingCuti, jenis: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium"
                >
                  <option value="Cuti Tahunan">Cuti Tahunan</option>
                  <option value="Sakit">Sakit (SKD)</option>
                  <option value="Ijin Tidak Masuk">Ijin Tidak Masuk</option>
                  <option value="Cuti Melahirkan">Cuti Melahirkan</option>
                  <option value="Cuti Menikah">Cuti Menikah</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={editingCuti.tgl_mulai}
                    onChange={(e) => setEditingCuti({ ...editingCuti, tgl_mulai: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Tanggal Selesai</label>
                  <input
                    type="date"
                    value={editingCuti.tgl_selesai}
                    onChange={(e) => setEditingCuti({ ...editingCuti, tgl_selesai: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">Durasi (Jumlah Hari)</label>
                <input
                  type="number"
                  min="1"
                  value={editingCuti.jumlah_hari}
                  onChange={(e) => setEditingCuti({ ...editingCuti, jumlah_hari: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">Alasan</label>
                <textarea
                  value={editingCuti.alasan}
                  onChange={(e) => setEditingCuti({ ...editingCuti, alasan: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingCuti(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEditCuti}
                disabled={actionLoadingId === editingCuti.id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary-500 hover:bg-primary-600 text-white shadow-md shadow-primary-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EDIT PRESENSI */}
      {/* ========================================================================= */}
      {editingPresensi && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-500" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  Edit Presensi: {editingPresensi.nama || editingPresensi.nik} ({editingPresensi.tanggal})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPresensi(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Shift</label>
                  <input
                    type="text"
                    value={editingPresensi.shift || ''}
                    onChange={(e) => setEditingPresensi({ ...editingPresensi, shift: e.target.value })}
                    placeholder="Contoh: Pagi / Mid / Siang"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Status Kehadiran</label>
                  <select
                    value={editingPresensi.status || 'Hadir'}
                    onChange={(e) => setEditingPresensi({ ...editingPresensi, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium"
                  >
                    <option value="Hadir">Hadir</option>
                    <option value="Tepat Waktu">Tepat Waktu</option>
                    <option value="Terlambat">Terlambat</option>
                    <option value="Izin">Izin</option>
                    <option value="Sakit">Sakit</option>
                    <option value="Alpha">Alpha</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Jam Masuk</label>
                  <input
                    type="time"
                    step="1"
                    value={editingPresensi.jam_masuk || ''}
                    onChange={(e) => setEditingPresensi({ ...editingPresensi, jam_masuk: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Jam Pulang</label>
                  <input
                    type="time"
                    step="1"
                    value={editingPresensi.jam_pulang || ''}
                    onChange={(e) => setEditingPresensi({ ...editingPresensi, jam_pulang: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">Catatan</label>
                <textarea
                  value={editingPresensi.catatan || ''}
                  onChange={(e) => setEditingPresensi({ ...editingPresensi, catatan: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingPresensi(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEditPresensi}
                disabled={actionLoadingId === editingPresensi.id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary-500 hover:bg-primary-600 text-white shadow-md shadow-primary-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
