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
} from 'lucide-react';
import {
  UserSession,
  KaryawanRecord,
  PresensiRecord,
  LemburRecord,
  PerijinanCutiRecord,
  RosterShiftRecord,
} from '../../types';
import {
  fetchKaryawanDirectory,
  fetchPresensiRange,
  fetchLemburRecords,
  fetchCutiRecords,
  fetchRosterShiftList,
} from '../../services/supabase';

interface HrRekapViewProps {
  session: UserSession | null;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const HrRekapView: React.FC<HrRekapViewProps> = ({ session, onShowToast }) => {
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
  const [activeTab, setActiveTab] = useState<'ringkasan' | 'lembur' | 'cuti' | 'absensi'>('ringkasan');
  const [loading, setLoading] = useState<boolean>(false);

  const [karyawanList, setKaryawanList] = useState<KaryawanRecord[]>([]);
  const [presensiList, setPresensiList] = useState<PresensiRecord[]>([]);
  const [lemburList, setLemburList] = useState<LemburRecord[]>([]);
  const [cutiList, setCutiList] = useState<PerijinanCutiRecord[]>([]);
  const [rosterList, setRosterList] = useState<RosterShiftRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [karyawans, presensis, lemburs, cutis, rosters] = await Promise.all([
        fetchKaryawanDirectory(),
        fetchPresensiRange(startDate, endDate),
        fetchLemburRecords(),
        fetchCutiRecords(),
        fetchRosterShiftList(undefined, startDate, endDate),
      ]);

      setKaryawanList(karyawans);
      setPresensiList(presensis);
      setLemburList(lemburs);
      setCutiList(cutis);
      setRosterList(rosters);
    } catch (err) {
      console.error('Error loading rekap data:', err);
      onShowToast('Gagal memuat data rekap HR.', 'error');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    csvContent += `REKAPITULASI HR (${startDate} s/d ${endDate})\n\n`;

    if (activeTab === 'ringkasan') {
      csvContent += 'NIK,Nama,Divisi,Jadwal Hari,Total Masuk,Tidak Masuk,Tepat Waktu,Terlambat,Lembur Disetujui (Jam),Estimasi Upah Lembur (Rp),Cuti (Hari)\n';
      summaryPerKaryawan.forEach((s) => {
        csvContent += `"${s.nik}","${s.nama}","${s.divisi}",${s.totalJadwalKerja},${s.totalHadir},${s.totalTidakMasuk},${s.totalTepatWaktu},${s.totalTerlambat},${s.totalJamLembur},${s.totalUangLembur},${s.totalHariCuti}\n`;
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 pb-24 text-slate-800 dark:text-slate-100">
      {/* HEADER */}
      <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#ff7a00]/10 text-[#ff7a00]">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Rekap & Laporan HR
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
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-[#ff7a00] hover:bg-[#e06c00] text-white shadow-md shadow-[#ff7a00]/20 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          <Filter className="w-4 h-4 text-[#ff7a00]" />
          <span>Filter Periode & Karyawan</span>
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
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#ff7a00]"
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
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#ff7a00]"
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
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#ff7a00]"
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
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#ff7a00] truncate"
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
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#ff7a00]"
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
            <Clock className="w-4 h-4 text-rose-500" />
            <span>Terlambat</span>
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
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
            <Zap className="w-4 h-4 text-[#ff7a00]" />
            <span>Lembur ACC</span>
          </div>
          <div className="text-2xl font-black text-[#ff7a00]">
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
          className={`px-4 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'ringkasan'
              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Ringkasan Per Karyawan ({summaryPerKaryawan.length})
        </button>
        <button
          onClick={() => setActiveTab('lembur')}
          className={`px-4 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'lembur'
              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Detail Lemburan ({filteredLembur.length})
        </button>
        <button
          onClick={() => setActiveTab('cuti')}
          className={`px-4 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'cuti'
              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Detail Cuti & Ijin ({filteredCuti.length})
        </button>
        <button
          onClick={() => setActiveTab('absensi')}
          className={`px-4 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'absensi'
              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Detail Log Presensi ({filteredPresensi.length})
        </button>
      </div>

      {/* TAB 1: RINGKASAN PER KARYAWAN */}
      {activeTab === 'ringkasan' && (
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-4 px-4">Karyawan</th>
                  <th className="py-4 px-3">Divisi</th>
                  <th className="py-4 px-3 text-center">Jadwal</th>
                  <th className="py-4 px-3 text-center text-emerald-600 dark:text-emerald-400">
                    Masuk
                  </th>
                  <th className="py-4 px-3 text-center text-amber-600 dark:text-amber-400">
                    Tidak Masuk
                  </th>
                  <th className="py-4 px-3 text-center text-rose-600 dark:text-rose-400">
                    Terlambat
                  </th>
                  <th className="py-4 px-3 text-center text-[#ff7a00]">
                    Lembur (Jam)
                  </th>
                  <th className="py-4 px-3 text-right">Est. Upah Lembur</th>
                  <th className="py-4 px-3 text-center text-teal-600 dark:text-teal-400">
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
                      <td className="py-3.5 px-4">
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
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {s.totalTerlambat}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-black text-[#ff7a00]">
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
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
              Daftar Semua Lemburan Sesuai Filter
            </h2>
            <span className="text-xs text-slate-400 font-bold">{filteredLembur.length} data</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-4 px-4">Tanggal</th>
                  <th className="py-4 px-3">Karyawan</th>
                  <th className="py-4 px-3 text-center">Waktu Mulai - Selesai</th>
                  <th className="py-4 px-3 text-center">Durasi</th>
                  <th className="py-4 px-3">Keterangan / Alasan</th>
                  <th className="py-4 px-3 text-center">Status</th>
                  <th className="py-4 px-3">Disetujui Oleh</th>
                  <th className="py-4 px-3 text-right">Total (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLembur.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Tidak ada catatan lembur yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredLembur.map((l) => (
                    <tr
                      key={l.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {l.tanggal}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900 dark:text-white">{l.nama}</div>
                        <div className="text-[10px] text-slate-400 font-mono">NIK: {l.nik}</div>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                        {l.jam_mulai} - {l.jam_selesai}
                      </td>
                      <td className="py-3 px-3 text-center font-black text-[#ff7a00]">
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
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
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
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
              Daftar Permohonan Cuti / Ijin Sesuai Filter
            </h2>
            <span className="text-xs text-slate-400 font-bold">{filteredCuti.length} data</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-4 px-4">Karyawan</th>
                  <th className="py-4 px-3">Jenis</th>
                  <th className="py-4 px-3 text-center">Periode Tanggal</th>
                  <th className="py-4 px-3 text-center">Durasi</th>
                  <th className="py-4 px-3">Alasan</th>
                  <th className="py-4 px-3 text-center">Status</th>
                  <th className="py-4 px-3">Disetujui Oleh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCuti.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Tidak ada catatan cuti/ijin yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredCuti.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-4">
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
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
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
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
              Riwayat Presensi Masuk & Pulang Sesuai Filter
            </h2>
            <span className="text-xs text-slate-400 font-bold">{filteredPresensi.length} data</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[11px]">
                  <th className="py-4 px-4">Tanggal</th>
                  <th className="py-4 px-3">Karyawan</th>
                  <th className="py-4 px-3">Shift</th>
                  <th className="py-4 px-3 text-center">Jam Masuk</th>
                  <th className="py-4 px-3 text-center">Jam Pulang</th>
                  <th className="py-4 px-3 text-center">Status</th>
                  <th className="py-4 px-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPresensi.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Tidak ada rekaman presensi yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredPresensi.map((p, idx) => (
                    <tr
                      key={p.id || idx}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap font-mono">
                        {p.tanggal}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-extrabold text-slate-900 dark:text-white">{p.nama || p.nik}</div>
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
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
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
    </div>
  );
};
