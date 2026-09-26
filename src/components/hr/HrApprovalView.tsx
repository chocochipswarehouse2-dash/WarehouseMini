import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Palmtree,
  Zap,
  RotateCcw,
  ShieldCheck,
  User,
  Calendar,
  Search,
  CheckCheck,
  ArrowRightLeft,
  Unlock,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import {
  UserSession,
  LemburRecord,
  PerijinanCutiRecord,
  TukarShiftRecord,
  IzinPulangAwalRecord,
} from '../../types';
import {
  fetchLemburRecords,
  updateLemburStatus,
  fetchCutiRecords,
  updateCutiStatus,
  fetchTukarShiftList,
  updateTukarShiftStatus,
  fetchIzinPulangAwalList,
  updateIzinPulangAwalStatus,
} from '../../services/supabase';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';

interface HrApprovalViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const HrApprovalView: React.FC<HrApprovalViewProps> = ({ session, onShowToast }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSection, setActiveSection] = useState<'lembur' | 'cuti' | 'tukar_shift' | 'izin_pulang' | 'riwayat_lembur'>('lembur');
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));

  const [lemburList, setLemburList] = useState<LemburRecord[]>([]);
  const [cutiList, setCutiList] = useState<PerijinanCutiRecord[]>([]);
  const [tukarShiftList, setTukarShiftList] = useState<TukarShiftRecord[]>([]);
  const [izinPulangList, setIzinPulangList] = useState<IzinPulangAwalRecord[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [lList, cList, tsList, ipList] = await Promise.all([
        fetchLemburRecords(),
        fetchCutiRecords(),
        fetchTukarShiftList(),
        fetchIzinPulangAwalList(),
      ]);
      setLemburList(lList);
      setCutiList(cList);
      setTukarShiftList(tsList);
      setIzinPulangList(ipList);
    } catch (err) {
      console.warn('Gagal memuat data approval HR:', err);
      onShowToast('Gagal memuat data approval HR', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingLembur = lemburList.filter((l) => l.status === 'Diajukan');
  const pendingCuti = cutiList.filter((c) => c.status === 'Diajukan');
  const pendingTukarShift = tukarShiftList.filter((t) => t.status === 'Diajukan');
  const pendingIzinPulang = izinPulangList.filter((i) => i.status === 'Diajukan');

  // Handle Approve Lembur
  const handleApproveLembur = async (item: LemburRecord) => {
    setProcessingId(item.id);
    try {
      const approver = session?.name || session?.username || 'Admin';
      await updateLemburStatus(item.id, 'Disetujui', approver);
      setLemburList((prev) =>
        prev.map((l) => (l.id === item.id ? { ...l, status: 'Disetujui', approved_by: approver } : l))
      );
      playSuccessBeep();
      onShowToast(`Lembur ${item.nama} (${item.durasi_jam} jam) berhasil disetujui!`, 'success');
    } catch (err) {
      playErrorBeep();
      onShowToast('Gagal menyetujui lembur.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Reject Lembur
  const handleRejectLembur = async (item: LemburRecord) => {
    const reason = prompt('Masukkan alasan penolakan lembur:') || 'Ditolak oleh Admin';
    setProcessingId(item.id);
    try {
      const approver = session?.name || session?.username || 'Admin';
      await updateLemburStatus(item.id, 'Ditolak', approver, reason);
      setLemburList((prev) =>
        prev.map((l) => (l.id === item.id ? { ...l, status: 'Ditolak', approved_by: approver, catatan: reason } : l))
      );
      playSuccessBeep();
      onShowToast(`Lembur ${item.nama} telah ditolak.`, 'info');
    } catch (err) {
      playErrorBeep();
      onShowToast('Gagal menolak lembur.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Approve Cuti
  const handleApproveCuti = async (item: PerijinanCutiRecord) => {
    setProcessingId(item.id);
    try {
      const approver = session?.name || session?.username || 'Admin';
      await updateCutiStatus(item.id, 'Disetujui', approver);
      setCutiList((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: 'Disetujui', approved_by: approver } : c))
      );
      playSuccessBeep();
      onShowToast(`Pengajuan cuti ${item.nama} (${item.jumlah_hari} hari) berhasil disetujui!`, 'success');
    } catch (err) {
      playErrorBeep();
      onShowToast('Gagal menyetujui cuti.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Reject Cuti
  const handleRejectCuti = async (item: PerijinanCutiRecord) => {
    const reason = prompt('Masukkan alasan penolakan cuti/ijin:') || 'Ditolak oleh Admin';
    setProcessingId(item.id);
    try {
      const approver = session?.name || session?.username || 'Admin';
      await updateCutiStatus(item.id, 'Ditolak', approver, reason);
      setCutiList((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: 'Ditolak', approved_by: approver, catatan: reason } : c))
      );
      playSuccessBeep();
      onShowToast(`Pengajuan cuti ${item.nama} telah ditolak.`, 'info');
    } catch (err) {
      playErrorBeep();
      onShowToast('Gagal menolak cuti.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Approve Tukar Shift (AUTOMATICALLY SWAPS ROSTER SHIFTS FOR BOTH EMPLOYEES!)
  const handleApproveTukarShift = async (item: TukarShiftRecord) => {
    setProcessingId(item.id);
    try {
      const approver = session?.name || session?.username || 'Admin';
      await updateTukarShiftStatus(item, 'Disetujui', approver);
      setTukarShiftList((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, status: 'Disetujui', approved_by: approver } : t))
      );
      playSuccessBeep();
      onShowToast(
        `Tukar Shift ${item.pemohon_nama} & ${item.target_nama} disetujui! Jadwal shift kedua karyawan otomatis tertukar di Roster.`,
        'success'
      );
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menyetujui tukar shift: ' + (err?.message || 'Error'), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Reject Tukar Shift
  const handleRejectTukarShift = async (item: TukarShiftRecord) => {
    const reason = prompt('Masukkan alasan penolakan tukar shift:') || 'Ditolak oleh Admin';
    setProcessingId(item.id);
    try {
      const approver = session?.name || session?.username || 'Admin';
      await updateTukarShiftStatus(item, 'Ditolak', approver, reason);
      setTukarShiftList((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, status: 'Ditolak', approved_by: approver, catatan: reason } : t))
      );
      playSuccessBeep();
      onShowToast(`Pengajuan tukar shift ditolak.`, 'info');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menolak tukar shift.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Approve Izin Pulang Lebih Awal
  const handleApproveIzinPulang = async (item: IzinPulangAwalRecord) => {
    setProcessingId(item.id);
    try {
      const approver = session?.name || session?.username || 'Admin';
      await updateIzinPulangAwalStatus(item.id, 'Disetujui', approver);
      setIzinPulangList((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'Disetujui', approved_by: approver } : i))
      );
      playSuccessBeep();
      onShowToast(`Izin pulang awal ${item.nama} jam ${item.jam_pulang_rencana} berhasil disetujui!`, 'success');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menyetujui izin pulang awal.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Reject Izin Pulang Lebih Awal
  const handleRejectIzinPulang = async (item: IzinPulangAwalRecord) => {
    const reason = prompt('Masukkan alasan penolakan izin pulang awal:') || 'Ditolak oleh Admin';
    setProcessingId(item.id);
    try {
      const approver = session?.name || session?.username || 'Admin';
      await updateIzinPulangAwalStatus(item.id, 'Ditolak', approver, reason);
      setIzinPulangList((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'Ditolak', approved_by: approver, catatan: reason } : i))
      );
      playSuccessBeep();
      onShowToast(`Izin pulang awal ${item.nama} telah ditolak.`, 'info');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menolak izin pulang awal.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* HEADER BANNER */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131d31] shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                Pusat Persetujuan HR &amp; Operasional (Approval)
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                KHUSUS ADMIN / HR
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Validasi lembur, cuti, tukar shift otomatis, dan izin pulang lebih awal karyawan warehouse
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* QUICK SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. LEMBUR */}
        <button
          type="button"
          onClick={() => setActiveSection('lembur')}
          className={`p-4 rounded-3xl border transition-all text-left flex items-center justify-between cursor-pointer ${
            activeSection === 'lembur'
              ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30 shadow-md'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131d31] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Lembur</div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {pendingLembur.length}
              </div>
            </div>
          </div>
          {pendingLembur.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>}
        </button>

        {/* 2. CUTI */}
        <button
          type="button"
          onClick={() => setActiveSection('cuti')}
          className={`p-4 rounded-3xl border transition-all text-left flex items-center justify-between cursor-pointer ${
            activeSection === 'cuti'
              ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30 shadow-md'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131d31] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 flex items-center justify-center text-teal-500">
              <Palmtree className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Ijin / Cuti</div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {pendingCuti.length}
              </div>
            </div>
          </div>
          {pendingCuti.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse"></span>}
        </button>

        {/* 3. TUKAR SHIFT */}
        <button
          type="button"
          onClick={() => setActiveSection('tukar_shift')}
          className={`p-4 rounded-3xl border transition-all text-left flex items-center justify-between cursor-pointer ${
            activeSection === 'tukar_shift'
              ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30 shadow-md'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131d31] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Tukar Shift</div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {pendingTukarShift.length}
              </div>
            </div>
          </div>
          {pendingTukarShift.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>}
        </button>

        {/* 4. IZIN PULANG AWAL */}
        <button
          type="button"
          onClick={() => setActiveSection('izin_pulang')}
          className={`p-4 rounded-3xl border transition-all text-left flex items-center justify-between cursor-pointer ${
            activeSection === 'izin_pulang'
              ? 'border-primary-500 bg-primary-500/10 ring-2 ring-primary-500/30 shadow-md'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131d31] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Pulang Awal</div>
              <div className="text-xl font-black text-slate-900 dark:text-white">
                {pendingIzinPulang.length}
              </div>
            </div>
          </div>
          {pendingIzinPulang.length > 0 && <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>}
        </button>
      </div>

      {/* ================= SECTION 1: APPROVAL LEMBUR ================= */}
      {activeSection === 'lembur' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Daftar Pengajuan Lembur Menunggu Persetujuan ({pendingLembur.length})
              </h2>
            </div>
          </div>

          {pendingLembur.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Tidak ada pengajuan lembur yang menunggu approval saat ini.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingLembur.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                        {item.nama}
                      </span>
                      <span className="text-slate-400 font-mono">({item.nik})</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        {item.durasi_jam} Jam
                      </span>
                    </div>

                    <div className="font-mono text-slate-500 mt-1">
                      Tanggal: <b>{item.tanggal}</b> • Jam: {item.jam_mulai?.slice(0, 5)} s/d {item.jam_selesai?.slice(0, 5)}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mt-1">{item.deskripsi}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApproveLembur(item)}
                      disabled={processingId === item.id}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Setujui</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectLembur(item)}
                      disabled={processingId === item.id}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 font-bold flex items-center gap-1.5 border border-rose-200 dark:border-rose-800 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Tolak</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= SECTION 2: APPROVAL CUTI ================= */}
      {activeSection === 'cuti' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Palmtree className="w-4 h-4 text-teal-500" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Daftar Pengajuan Ijin &amp; Cuti ({pendingCuti.length})
              </h2>
            </div>
          </div>

          {pendingCuti.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Tidak ada pengajuan cuti yang menunggu approval saat ini.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingCuti.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                        {item.nama}
                      </span>
                      <span className="text-slate-400 font-mono">({item.nik})</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-500/10 text-teal-600 dark:text-teal-400">
                        {item.jenis} ({item.jumlah_hari} Hari)
                      </span>
                    </div>

                    <div className="font-mono text-slate-500 mt-1">
                      Periode: <b>{item.tgl_mulai}</b> s/d <b>{item.tgl_selesai}</b>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mt-1">Alasan: "{item.alasan}"</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApproveCuti(item)}
                      disabled={processingId === item.id}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Setujui</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectCuti(item)}
                      disabled={processingId === item.id}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 font-bold flex items-center gap-1.5 border border-rose-200 dark:border-rose-800 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Tolak</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= SECTION 3: APPROVAL TUKAR SHIFT ================= */}
      {activeSection === 'tukar_shift' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Pengajuan Tukar Shift Karyawan ({pendingTukarShift.length})
              </h2>
            </div>
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1 rounded-xl">
              ⚡ Otomatis swap jadwal roster saat disetujui
            </span>
          </div>

          {pendingTukarShift.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Tidak ada pengajuan tukar shift yang menunggu persetujuan.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingTukarShift.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                        {item.pemohon_nama}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 text-[11px] font-mono border">
                        {item.pemohon_tanggal} ({item.pemohon_shift_asal})
                      </span>
                      <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                        {item.target_nama}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 text-[11px] font-mono border">
                        {item.target_tanggal} ({item.target_shift_asal})
                      </span>
                    </div>

                    <p className="text-slate-700 dark:text-slate-300">Alasan: "{item.alasan}"</p>
                    <p className="text-[11px] text-slate-400">Diajukan pada: {new Date(item.created_at || '').toLocaleString('id-ID')}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApproveTukarShift(item)}
                      disabled={processingId === item.id}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Setujui &amp; Swap Jadwal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectTukarShift(item)}
                      disabled={processingId === item.id}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 font-bold flex items-center gap-1.5 border border-rose-200 dark:border-rose-800 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Tolak</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= SECTION 4: APPROVAL IZIN PULANG AWAL ================= */}
      {activeSection === 'izin_pulang' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Unlock className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Pengajuan Izin Pulang Lebih Awal ({pendingIzinPulang.length})
              </h2>
            </div>
          </div>

          {pendingIzinPulang.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Tidak ada pengajuan izin pulang awal yang menunggu persetujuan.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingIzinPulang.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-amber-50/40 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                        {item.nama}
                      </span>
                      <span className="text-slate-400 font-mono">({item.nik})</span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        Pulang Jam: {item.jam_pulang_rencana} (Normal: {item.jam_pulang_standar || '17:00'})
                      </span>
                    </div>

                    <div className="font-mono text-slate-500">
                      Tanggal: <b>{item.tanggal}</b> • Shift: <b>{item.shift}</b>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">Alasan: "{item.alasan}"</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApproveIzinPulang(item)}
                      disabled={processingId === item.id}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Setujui Izin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectIzinPulang(item)}
                      disabled={processingId === item.id}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 font-bold flex items-center gap-1.5 border border-rose-200 dark:border-rose-800 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Tolak</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
