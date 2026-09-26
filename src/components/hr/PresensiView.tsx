import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Edit2,
  Save,
  X,
  Clock,
  Calendar,
  CheckCircle2,
  LogIn,
  LogOut,
  AlertCircle,
  Sparkles,
  CalendarDays,
  UserCheck,
  Coffee,
  RotateCcw,
  ShieldAlert,
  Shield,
  Zap,
  ArrowRightLeft,
  Award,
  TrendingUp,
  AlertTriangle,
  FileText,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  UserSession,
  PresensiRecord,
  RosterShiftRecord,
  MasterShiftRecord,
  KaryawanRecord,
  IzinPulangAwalRecord,
  TukarShiftRecord,
  KpiAbsensiSummary,
} from '../../types';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import { getUserPersonName, getUserNik } from '../../utils/userResolver';
import {
  fetchPresensiToday,
  fetchPresensiRange,
  submitPresensiRecord,
  fetchRosterShiftList,
  fetchMasterShiftList,
  fetchKaryawanDirectory,
  fetchIzinPulangAwalList,
  submitIzinPulangAwalRecord,
  fetchTukarShiftList,
  submitTukarShiftRecord,
  fetchLemburRecords,
  fetchCutiRecords,
} from '../../services/supabase';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';
import { calculateKpiAbsensi } from '../../utils/kpiCalculator';

interface PresensiViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const PresensiView: React.FC<PresensiViewProps> = ({ session, onShowToast }) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');
  const [todayIso, setTodayIso] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'harian' | 'kpi' | 'tukar_shift' | 'log'>('harian');
  const [logRecords, setLogRecords] = useState<PresensiRecord[]>([]);
  const [loadingLog, setLoadingLog] = useState<boolean>(false);
  const [editingPresensiId, setEditingPresensiId] = useState<number | string | null>(null);
  const [editPresensiData, setEditPresensiData] = useState<Partial<PresensiRecord>>({});

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [todayPresensi, setTodayPresensi] = useState<PresensiRecord | null>(null);
  const [upcomingRoster, setUpcomingRoster] = useState<RosterShiftRecord[]>([]);
  const [shifts, setShifts] = useState<MasterShiftRecord[]>([]);
  const [karyawanList, setKaryawanList] = useState<KaryawanRecord[]>([]);

  // Early checkout (Izin Pulang Awal)
  const [izinPulangList, setIzinPulangList] = useState<IzinPulangAwalRecord[]>([]);
  const [showIzinPulangModal, setShowIzinPulangModal] = useState<boolean>(false);
  const [izinPulangJam, setIzinPulangJam] = useState<string>('14:00');
  const [izinPulangAlasan, setIzinPulangAlasan] = useState<string>('');
  const [submittingIzinPulang, setSubmittingIzinPulang] = useState<boolean>(false);

  // Tukar shift states
  const [tukarShiftList, setTukarShiftList] = useState<TukarShiftRecord[]>([]);
  const [showTukarShiftModal, setShowTukarShiftModal] = useState<boolean>(false);
  const [tsMyTanggal, setTsMyTanggal] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tsMyShift, setTsMyShift] = useState<string>('Shift 1');
  const [tsTargetNik, setTsTargetNik] = useState<string>('');
  const [tsTargetTanggal, setTsTargetTanggal] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [tsTargetShift, setTsTargetShift] = useState<string>('Shift 2');
  const [tsAlasan, setTsAlasan] = useState<string>('');
  const [submittingTukarShift, setSubmittingTukarShift] = useState<boolean>(false);

  // KPI states
  const [myKpiSummary, setMyKpiSummary] = useState<KpiAbsensiSummary | null>(null);
  const [loadingKpi, setLoadingKpi] = useState<boolean>(false);

  const userNik = getUserNik(session);
  const userName = session?.name || getUserPersonName(session?.username) || 'Karyawan';

  // Helper for ISO-compliant time string (HH:mm:ss with colons)
  const getFormatTime = (d: Date = new Date()): string => {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  // Realtime clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = getFormatTime(now);
      const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const iso = `${year}-${month}-${day}`;

      setCurrentTime(timeStr);
      setCurrentDateStr(dateStr);
      setTodayIso(iso);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load data for today
  const loadData = useCallback(async () => {
    if (!todayIso || !userNik) return;
    setLoading(true);
    try {
      const [presensi, masterShifts, roster, kList, izinPulang, tukarShift] = await Promise.all([
        fetchPresensiToday(userNik, todayIso),
        fetchMasterShiftList(),
        fetchRosterShiftList(userNik, todayIso),
        fetchKaryawanDirectory(),
        fetchIzinPulangAwalList(userNik, todayIso),
        fetchTukarShiftList(userNik),
      ]);
      setTodayPresensi(presensi);
      setShifts(masterShifts);
      setUpcomingRoster(roster.slice(0, 7));
      setKaryawanList(kList);
      setIzinPulangList(izinPulang);
      setTukarShiftList(tukarShift);
    } catch (err) {
      console.warn('Gagal memuat data presensi:', err);
    } finally {
      setLoading(false);
    }
  }, [todayIso, userNik]);

  useEffect(() => {
    if (todayIso) {
      loadData();
    }
  }, [todayIso, loadData]);

  // Load Log Data
  const loadLogData = useCallback(async () => {
    setLoadingLog(true);
    try {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      const start = d.toISOString().slice(0, 10);
      const data = await fetchPresensiRange(start, todayIso);
      setLogRecords(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoadingLog(false);
    }
  }, [todayIso]);

  useEffect(() => {
    if (activeTab === 'log') {
      loadLogData();
    }
  }, [activeTab, loadLogData]);

  // Load My KPI Data for this month
  const loadMyKpi = useCallback(async () => {
    if (!userNik) return;
    setLoadingKpi(true);
    try {
      const d = new Date();
      d.setDate(1);
      const startOfMonth = d.toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);

      const [presensis, rosters, lemburs, cutis, izins] = await Promise.all([
        fetchPresensiRange(startOfMonth, today, userNik),
        fetchRosterShiftList(userNik, startOfMonth, today),
        fetchLemburRecords(userNik),
        fetchCutiRecords(userNik),
        fetchIzinPulangAwalList(userNik),
      ]);

      const me = karyawanList.find((k) => k.nik === userNik) || {
        nik: userNik,
        nama: userName,
        divisi: session?.role || 'Warehouse',
      };

      const kpi = calculateKpiAbsensi({
        karyawan: me,
        presensiList: presensis,
        rosterList: rosters,
        lemburList: lemburs,
        cutiList: cutis,
        izinPulangAwalList: izins,
        startDate: startOfMonth,
        endDate: today,
      });

      setMyKpiSummary(kpi);
    } catch (err) {
      console.warn('Gagal kalkulasi KPI absensi:', err);
    } finally {
      setLoadingKpi(false);
    }
  }, [userNik, karyawanList, userName, session?.role]);

  useEffect(() => {
    if (activeTab === 'kpi' || activeTab === 'harian') {
      loadMyKpi();
    }
  }, [activeTab, loadMyKpi]);

  const todayRoster = upcomingRoster.find((r) => r.tanggal === todayIso);
  const isShiftLibur = todayRoster?.shift?.toLowerCase().includes('libur');

  // Determine standard shift end time
  const shiftStandarPulang = useMemo(() => {
    if (todayRoster?.jam_pulang) return todayRoster.jam_pulang.slice(0, 5);
    const sLower = (todayRoster?.shift || 'Shift 1').toLowerCase();
    if (sLower.includes('shift 2') || sLower === '2') return '18:00';
    if (sLower.includes('shift 3') || sLower === '3') return '21:00';
    return '17:00';
  }, [todayRoster]);

  // Check if current time has reached checkout time
  const isPastCheckoutTime = useMemo(() => {
    if (!currentTime || !shiftStandarPulang) return true;
    const currentHHmm = currentTime.slice(0, 5);
    return currentHHmm >= shiftStandarPulang;
  }, [currentTime, shiftStandarPulang]);

  // Check today's early checkout approval status
  const todayApprovedEarlyCheckout = useMemo(() => {
    return izinPulangList.find((i) => i.tanggal === todayIso && i.status === 'Disetujui');
  }, [izinPulangList, todayIso]);

  const todayPendingEarlyCheckout = useMemo(() => {
    return izinPulangList.find((i) => i.tanggal === todayIso && i.status === 'Diajukan');
  }, [izinPulangList, todayIso]);

  // Can checkout condition: already checked in, not checked out yet, and (reached shift end OR has approved early checkout)
  const canCheckoutNow = Boolean(
    todayPresensi?.jam_masuk &&
    !todayPresensi?.jam_pulang &&
    (isPastCheckoutTime || todayApprovedEarlyCheckout)
  );

  // Handle Absen Masuk
  const handleAbsenMasuk = async () => {
    if (!userNik || !todayIso) return;
    setSubmitting(true);
    try {
      const nowTime = getFormatTime();
      const currentRoster = upcomingRoster.find((r) => r.tanggal === todayIso);
      const shiftName = currentRoster?.shift || 'Shift 1';
      const staffFullName = session?.name || getUserPersonName(userNik, userNik);

      const payload: Partial<PresensiRecord> = {
        nik: userNik,
        nama: staffFullName,
        tanggal: todayIso,
        shift: shiftName,
        status: 'Hadir',
        jam_masuk: nowTime,
        catatan: `Presensi Masuk via WMS (${nowTime})`,
      };

      const result = await submitPresensiRecord(payload);
      if (result) {
        setTodayPresensi(result);
        playSuccessBeep();
        onShowToast(`Berhasil Presensi Masuk jam ${nowTime}! Semangat bekerja!`, 'success');
        loadMyKpi();
      }
    } catch (err) {
      playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Gagal presensi masuk.';
      onShowToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Absen Pulang
  const handleAbsenPulang = async () => {
    if (!todayPresensi || !userNik || !todayIso) return;
    setSubmitting(true);
    try {
      const nowTime = getFormatTime();
      const staffFullName = session?.name || todayPresensi.nama || getUserPersonName(userNik, userNik);
      
      let noteAppend = ` | Pulang (${nowTime})`;
      if (todayApprovedEarlyCheckout) {
        noteAppend += ` [Izin Pulang Awal Disetujui: ${todayApprovedEarlyCheckout.approved_by || 'HR'}]`;
      }

      const payload: Partial<PresensiRecord> = {
        ...todayPresensi,
        nama: staffFullName,
        jam_pulang: nowTime,
        catatan: (todayPresensi.catatan || '') + noteAppend,
      };

      const result = await submitPresensiRecord(payload);
      if (result) {
        setTodayPresensi(result);
        playSuccessBeep();
        onShowToast(`Berhasil Presensi Pulang jam ${nowTime}! Terima kasih atas dedikasinya hari ini!`, 'success');
        loadMyKpi();
      }
    } catch (err) {
      playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Gagal presensi pulang.';
      onShowToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Submit Izin Pulang Lebih Awal
  const handleSubmitIzinPulang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!izinPulangAlasan.trim()) {
      onShowToast('Mohon tuliskan alasan izin pulang lebih awal.', 'warning');
      return;
    }
    setSubmittingIzinPulang(true);
    try {
      const record = await submitIzinPulangAwalRecord({
        nik: userNik,
        nama: userName,
        divisi: session?.role || 'Warehouse',
        tanggal: todayIso,
        jam_pulang_rencana: izinPulangJam,
        jam_pulang_standar: shiftStandarPulang,
        shift: todayRoster?.shift || 'Shift 1',
        alasan: izinPulangAlasan.trim(),
      });
      setIzinPulangList((prev) => [record, ...prev]);
      setShowIzinPulangModal(false);
      setIzinPulangAlasan('');
      playSuccessBeep();
      onShowToast('Pengajuan izin pulang awal berhasil dikirim ke HR/Atasan!', 'success');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal mengajukan izin pulang awal: ' + (err?.message || 'Error'), 'error');
    } finally {
      setSubmittingIzinPulang(false);
    }
  };

  // Handle Submit Tukar Shift
  const handleSubmitTukarShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tsTargetNik) {
      onShowToast('Pilih rekan kerja yang diajak tukar shift.', 'warning');
      return;
    }
    if (!tsAlasan.trim()) {
      onShowToast('Tuliskan alasan pengajuan tukar shift.', 'warning');
      return;
    }
    const targetKaryawan = karyawanList.find((k) => k.nik === tsTargetNik);
    setSubmittingTukarShift(true);
    try {
      const record = await submitTukarShiftRecord({
        pemohon_nik: userNik,
        pemohon_nama: userName,
        pemohon_tanggal: tsMyTanggal,
        pemohon_shift_asal: tsMyShift,
        target_nik: tsTargetNik,
        target_nama: targetKaryawan?.nama || tsTargetNik,
        target_tanggal: tsTargetTanggal,
        target_shift_asal: tsTargetShift,
        alasan: tsAlasan.trim(),
      });
      setTukarShiftList((prev) => [record, ...prev]);
      setShowTukarShiftModal(false);
      setTsAlasan('');
      playSuccessBeep();
      onShowToast('Pengajuan tukar shift berhasil dikirim! Jadwal shift akan otomatis berubah setelah di-approve HR.', 'success');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal mengajukan tukar shift: ' + (err?.message || 'Error'), 'error');
    } finally {
      setSubmittingTukarShift(false);
    }
  };

  const userIsAdmin = isSuperadmin(session);
  const canViewPresensi = userIsAdmin || hasPermission(session, 'menu_hr_presensi');

  if (!canViewPresensi) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center shadow-lg space-y-2">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-950/60 rounded-2xl flex items-center justify-center mx-auto text-primary-600 dark:text-primary-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Akses Presensi &amp; Shift Dibatasi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Akun Anda (<b className="text-slate-700 dark:text-slate-200">{session?.name || session?.username}</b> - Role: <b className="text-primary-500">{session?.role}</b>) tidak memiliki hak akses untuk membuka modul <b>Presensi &amp; Shift</b>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('harian')}
          className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer transition-colors ${activeTab === 'harian' ? 'border-primary-500 text-primary-500' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Clock className="w-4 h-4" />
          <span>Presensi Harian</span>
        </button>
        <button
          onClick={() => setActiveTab('kpi')}
          className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer transition-colors ${activeTab === 'kpi' ? 'border-primary-500 text-primary-500' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <Award className="w-4 h-4" />
          <span>KPI Absensi Saya</span>
          {myKpiSummary && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${myKpiSummary.grade === 'A+' || myKpiSummary.grade === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' : myKpiSummary.grade === 'B' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'}`}>
              Grade {myKpiSummary.grade} ({myKpiSummary.nilaiKpiAbsensi} Pts)
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('tukar_shift')}
          className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer transition-colors ${activeTab === 'tukar_shift' ? 'border-primary-500 text-primary-500' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>Pengajuan Tukar Shift</span>
          {tukarShiftList.filter((t) => t.status === 'Diajukan').length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('log')}
          className={`px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer transition-colors ${activeTab === 'log' ? 'border-primary-500 text-primary-500' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <FileText className="w-4 h-4" />
          <span>Log Presensi</span>
        </button>
      </div>

      {/* ================= TAB 1: PRESENSI HARIAN ================= */}
      {activeTab === 'harian' && (
        <div className="space-y-4">
          {/* HEADER CLOCK & PROFILE BANNER */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-[#1e293b] p-6 sm:p-8 text-white shadow-xl border border-slate-700/60">
            <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-primary-500/15 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Clock className="w-44 h-44" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="px-3 py-1 bg-primary-500/20 border border-primary-500/40 text-primary-400 rounded-full text-xs font-black tracking-wider uppercase flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Live Digital Presensi WMS
                  </span>
                  <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-full text-xs font-bold">
                    WIB (UTC+7)
                  </span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-black tracking-tight font-mono text-white drop-shadow-md">
                  {currentTime || '--:--:--'}
                </h1>
                <p className="text-sm sm:text-base text-slate-300 mt-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary-400" />
                  {currentDateStr || 'Memuat tanggal...'}
                </p>
              </div>

              {/* User Badge Info & Quick KPI */}
              <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 shrink-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary-500 to-amber-400 flex items-center justify-center text-white font-black text-lg shadow-md">
                  {session?.name ? session.name.charAt(0).toUpperCase() : session?.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-extrabold text-sm text-white">
                    {session?.name || getUserPersonName(session?.username) || session?.username}
                  </div>
                  <div className="text-xs text-slate-300 font-mono">NIK: {userNik}</div>
                  <div className="text-[11px] font-semibold text-primary-300">{session?.role}</div>
                </div>
                {myKpiSummary && (
                  <div className="pl-3 border-l border-white/20 text-right">
                    <div className="text-[10px] text-slate-300 uppercase font-bold">Nilai Absensi</div>
                    <div className="text-base font-black text-amber-300">
                      {myKpiSummary.nilaiKpiAbsensi} <span className="text-xs font-bold text-white">({myKpiSummary.grade})</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TODAY PRESENSI CARD ACTION */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* ACTION CARD */}
            <div className="md:col-span-2 bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-500">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                        Absensi Kehadiran Hari Ini
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Jadwal Shift: <b className="text-slate-700 dark:text-slate-200">{todayRoster?.shift || 'Shift 1'}</b>
                        {todayRoster?.jam_masuk && ` (${todayRoster.jam_masuk} - ${todayRoster.jam_pulang})`}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={loadData}
                    disabled={loading}
                    title="Refresh Status"
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
                  >
                    <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Status Indicator Box */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 mb-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</div>
                      <div className="mt-1 flex items-center gap-1.5 font-extrabold text-sm">
                        {todayPresensi ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" /> {todayPresensi.status || 'Hadir'}
                          </span>
                        ) : isShiftLibur ? (
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <Coffee className="w-4 h-4" /> Libur
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-500">
                            <AlertCircle className="w-4 h-4" /> Belum Presensi
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jam Masuk</div>
                      <div className="mt-1 font-mono font-black text-sm text-slate-800 dark:text-white">
                        {todayPresensi?.jam_masuk || '--:--'}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jam Pulang Shift</div>
                      <div className="mt-1 font-mono font-black text-sm text-slate-800 dark:text-white">
                        {shiftStandarPulang}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jam Checkout Aktual</div>
                      <div className="mt-1 font-mono font-black text-sm text-slate-800 dark:text-white">
                        {todayPresensi?.jam_pulang || '--:--'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* EARLY CHECKOUT NOTICE / BADGE */}
                {todayApprovedEarlyCheckout && !todayPresensi?.jam_pulang && (
                  <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
                    <Unlock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-extrabold flex items-center gap-1.5">
                        <span>Izin Pulang Lebih Awal Telah Disetujui!</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 text-[10px]">
                          Approved by {todayApprovedEarlyCheckout.approved_by || 'HR'}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                        Jam rencana pulang: <b>{todayApprovedEarlyCheckout.jam_pulang_rencana}</b> — Alasan: "{todayApprovedEarlyCheckout.alasan}". Anda sudah dapat melakukan presensi pulang sekarang.
                      </p>
                    </div>
                  </div>
                )}

                {todayPendingEarlyCheckout && !todayPresensi?.jam_pulang && (
                  <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                    <div>
                      <div className="font-extrabold">Pengajuan Izin Pulang Lebih Awal Sedang Ditinjau (Pending)</div>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        Jam diajukan: <b>{todayPendingEarlyCheckout.jam_pulang_rencana}</b> — Menunggu approval dari Atasan / HR.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* TOMBOL MASUK */}
                  {!todayPresensi?.jam_masuk ? (
                    <button
                      type="button"
                      onClick={handleAbsenMasuk}
                      disabled={submitting || loading || isShiftLibur}
                      className="w-full py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <LogIn className="w-5 h-5" />
                      <span>{submitting ? 'Memproses...' : 'Presensi Masuk Sekarang'}</span>
                    </button>
                  ) : (
                    <div className="py-3.5 px-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-sm flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Sudah Masuk ({todayPresensi.jam_masuk})</span>
                    </div>
                  )}

                  {/* TOMBOL PULANG (HANYA AKTIF SAAT SUDAH JAM PULANG / ADA IZIN APPROVED) */}
                  {!todayPresensi?.jam_pulang ? (
                    <button
                      type="button"
                      onClick={handleAbsenPulang}
                      disabled={!canCheckoutNow || submitting || loading}
                      className={`w-full py-3.5 px-5 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:cursor-not-allowed ${
                        canCheckoutNow
                          ? 'bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {canCheckoutNow ? (
                        <>
                          <LogOut className="w-5 h-5" />
                          <span>{submitting ? 'Memproses...' : 'Presensi Pulang Sekarang'}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 text-slate-400" />
                          <span>Belum Jam Pulang ({shiftStandarPulang})</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="py-3.5 px-5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span>Sudah Presensi Pulang ({todayPresensi.jam_pulang})</span>
                    </div>
                  )}
                </div>

                {/* ALTERNATIF: AJUKAN IZIN PULANG LEBIH AWAL */}
                {todayPresensi?.jam_masuk && !todayPresensi?.jam_pulang && !isPastCheckoutTime && !todayApprovedEarlyCheckout && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50">
                    <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Perlu pulang sebelum jam {shiftStandarPulang}? Ajukan izin pulang awal.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowIzinPulangModal(true)}
                      disabled={Boolean(todayPendingEarlyCheckout)}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{todayPendingEarlyCheckout ? 'Izin Diajukan' : 'Ajukan Izin Pulang Awal'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* SHIFT RULES & QUICK ROSTER */}
            <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Clock className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Ketentuan Shift
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTukarShiftModal(true)}
                    className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-bold text-[11px] flex items-center gap-1 border border-indigo-200 dark:border-indigo-800 cursor-pointer transition-colors"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Tukar Shift</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {shifts.length > 0 ? (
                    shifts.map((s) => (
                      <div
                        key={s.id || s.nama_shift}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                            {s.nama_shift}
                          </span>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Toleransi {s.toleransi} menit
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold px-2 py-1 bg-white dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                          {s.jam_masuk?.slice(0, 5)} - {s.jam_pulang?.slice(0, 5)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-xs flex justify-between">
                        <b>Shift 1</b>
                        <span className="font-mono">08:00 - 17:00</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-xs flex justify-between">
                        <b>Shift 2</b>
                        <span className="font-mono">09:00 - 18:00</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Roster 7 Hari Ke Depan */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 text-primary-500" />
                  <span>Jadwal 7 Hari Anda:</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {upcomingRoster.map((r) => (
                    <div
                      key={r.tanggal}
                      className={`p-2 rounded-xl text-center min-w-[54px] shrink-0 border ${
                        r.tanggal === todayIso
                          ? 'bg-primary-50 dark:bg-primary-950/60 border-primary-500 text-primary-700 dark:text-primary-300 font-extrabold'
                          : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <div className="text-[9px] font-bold uppercase">{r.tanggal.slice(8, 10)}/{r.tanggal.slice(5, 7)}</div>
                      <div className="text-[10px] font-extrabold truncate mt-0.5">{r.shift}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: KPI ABSENSI SAYA ================= */}
      {activeTab === 'kpi' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#131d31] p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-6 h-6 text-amber-500" />
                <span>KPI &amp; Nilai Kedisiplinan Absensi Saya</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Periode Bulan Ini ({new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' })}) — Dinilai otomatis dari ketepatan jam berangkat, jam pulang, dan absensi.
              </p>
            </div>
            <button
              onClick={loadMyKpi}
              disabled={loadingKpi}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-2 cursor-pointer transition-colors"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loadingKpi ? 'animate-spin' : ''}`} />
              <span>Hitung Ulang KPI</span>
            </button>
          </div>

          {myKpiSummary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* SKOR UTAMA */}
              <div className="md:col-span-1 rounded-3xl p-6 bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white shadow-lg flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-100">Nilai KPI Absensi</div>
                  <div className="text-5xl font-black font-mono mt-2">{myKpiSummary.nilaiKpiAbsensi}</div>
                  <div className="text-sm font-extrabold mt-1 text-amber-100">Grade: {myKpiSummary.grade}</div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/20">
                  <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-extrabold">
                    {myKpiSummary.labelStatus}
                  </span>
                </div>
              </div>

              {/* 3 METRIK RINCIAN */}
              <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Nilai Berangkat */}
                <div className="bg-white dark:bg-[#131d31] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Skor Jam Berangkat</span>
                    <LogIn className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="my-2">
                    <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                      {myKpiSummary.skorBerangkat} <span className="text-xs text-slate-400 font-normal">/ 100</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      Tepat Waktu: <b>{myKpiSummary.totalOnTime}</b> hari ({myKpiSummary.persenOnTime}%)
                    </div>
                  </div>
                  <div className="text-[11px] text-amber-600 dark:text-amber-400">
                    Terlambat: {myKpiSummary.totalTerlambat} hari ({myKpiSummary.totalMenitTerlambat} mnt)
                  </div>
                </div>

                {/* 2. Nilai Pulang */}
                <div className="bg-white dark:bg-[#131d31] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Skor Jam Pulang</span>
                    <LogOut className="w-4 h-4 text-primary-500" />
                  </div>
                  <div className="my-2">
                    <div className="text-3xl font-black font-mono text-primary-500">
                      {myKpiSummary.skorPulang} <span className="text-xs text-slate-400 font-normal">/ 100</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      Pulang Tepat/Lembur: <b>{myKpiSummary.totalPulangNormal}</b> hari
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Izin Pulang Awal: {myKpiSummary.totalPulangAwalIzin}x | Tanpa Izin: {myKpiSummary.totalPulangAwalTanpaIzin}x
                  </div>
                </div>

                {/* 3. Rekap Kehadiran */}
                <div className="bg-white dark:bg-[#131d31] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Tingkat Kehadiran</span>
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="my-2">
                    <div className="text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
                      {myKpiSummary.persenKehadiran}%
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      Hadir: <b>{myKpiSummary.totalHadir}</b> dari {myKpiSummary.totalHariKerja} hari kerja
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Cuti/Izin: {myKpiSummary.totalCutiIzin} hari | Alpha: {myKpiSummary.totalAlpha}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STANDAR PENILAIAN CARD */}
          <div className="bg-white dark:bg-[#131d31] p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary-500" />
              <span>Standar &amp; Rumus Penilaian KPI Absensi Warehouse</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200">1. Kedisiplinan Berangkat (Bobot 45%)</div>
                <p className="text-[11px] text-slate-500">Tepat waktu = 100 Pts. Terlambat 1-15m = 85 Pts, 16-30m = 70 Pts, &gt;30m = 50 Pts.</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200">2. Kedisiplinan Pulang (Bobot 35%)</div>
                <p className="text-[11px] text-slate-500">Pulang sesuai jam shift = 100 Pts. Izin Pulang Awal (Disetujui HR) = 90 Pts. Pulang cepat tanpa izin = 40 Pts.</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 space-y-1">
                <div className="font-bold text-slate-800 dark:text-slate-200">3. Kehadiran &amp; Mangkir (Bobot 20%)</div>
                <p className="text-[11px] text-slate-500">Persentase hari masuk kerja dikurangi penalti mangkir (Alpha -8 Pts per hari).</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: PENGAJUAN TUKAR SHIFT ================= */}
      {activeTab === 'tukar_shift' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#131d31] p-5 rounded-3xl border border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="w-6 h-6 text-indigo-500" />
                <span>Pengajuan Tukar Shift Antar Karyawan</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ajukan pertukaran jadwal shift dengan rekan kerja. Begitu disetujui oleh HR/Superadmin, jadwal shift kedua pihak otomatis tertukar di sistem.
              </p>
            </div>
            <button
              onClick={() => setShowTukarShiftModal(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer transition-colors"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>+ Buat Pengajuan Tukar Shift</span>
            </button>
          </div>

          {/* RIWAYAT PENGAJUAN TUKAR SHIFT */}
          <div className="bg-white dark:bg-[#131d31] rounded-3xl p-5 border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-3">
              Daftar Pengajuan Tukar Shift Anda
            </h3>

            {tukarShiftList.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                Belum ada riwayat pengajuan tukar shift.
              </div>
            ) : (
              <div className="space-y-3">
                {tukarShiftList.map((ts) => (
                  <div
                    key={ts.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                          {ts.pemohon_nama} ({ts.pemohon_tanggal} - {ts.pemohon_shift_asal})
                        </span>
                        <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                          {ts.target_nama} ({ts.target_tanggal} - {ts.target_shift_asal})
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Alasan: "{ts.alasan}"
                      </p>
                      {ts.catatan && (
                        <p className="text-[11px] text-slate-400">
                          Catatan HR: {ts.catatan} (oleh: {ts.approved_by || 'Admin'})
                        </p>
                      )}
                    </div>

                    <div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black inline-flex items-center gap-1 ${
                          ts.status === 'Disetujui'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : ts.status === 'Ditolak'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {ts.status === 'Disetujui' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        {ts.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 4: LOG PRESENSI ================= */}
      {activeTab === 'log' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              Riwayat Log Presensi (30 Hari Terakhir)
            </h2>
            <button
              onClick={loadLogData}
              disabled={loadingLog}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
            >
              <RotateCcw className={`w-4 h-4 ${loadingLog ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap text-slate-900 dark:text-white">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">NIK</th>
                  <th className="p-3">Nama</th>
                  <th className="p-3">Shift</th>
                  <th className="p-3">Jam Masuk</th>
                  <th className="p-3">Jam Pulang</th>
                  <th className="p-3">Status</th>
                  {userIsAdmin && <th className="p-3">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logRecords.map((r, i) => (
                  <tr key={r.id || i}>
                    <td className="p-3">{r.tanggal}</td>
                    <td className="p-3">{r.nik}</td>
                    <td className="p-3">
                      {r.nama && r.nama.trim().toLowerCase() !== r.nik.trim().toLowerCase()
                        ? r.nama
                        : getUserPersonName(r.nik, r.nama || r.nik)}
                    </td>
                    {editingPresensiId === r.id ? (
                      <>
                        <td className="p-3">
                          <select
                            value={editPresensiData.shift || 'Shift 1'}
                            onChange={(e) => setEditPresensiData({ ...editPresensiData, shift: e.target.value })}
                            className="border p-1.5 rounded-lg text-xs bg-white dark:bg-slate-900"
                          >
                            <option value="Shift 1">Shift 1</option>
                            <option value="Shift 2">Shift 2</option>
                            <option value="Shift 3">Shift 3</option>
                            <option value="Libur">Libur</option>
                            <option value="Cuti">Cuti</option>
                            <option value="Izin">Izin</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <input
                            type="time"
                            value={editPresensiData.jam_masuk || ''}
                            onChange={(e) => setEditPresensiData({ ...editPresensiData, jam_masuk: e.target.value })}
                            className="border p-1.5 rounded-lg text-xs font-mono"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="time"
                            value={editPresensiData.jam_pulang || ''}
                            onChange={(e) => setEditPresensiData({ ...editPresensiData, jam_pulang: e.target.value })}
                            className="border p-1.5 rounded-lg text-xs font-mono"
                          />
                        </td>
                        <td className="p-3">
                          <select
                            value={editPresensiData.status || 'Hadir'}
                            onChange={(e) => setEditPresensiData({ ...editPresensiData, status: e.target.value })}
                            className="border p-1.5 rounded-lg text-xs"
                          >
                            <option value="Hadir">Hadir</option>
                            <option value="Terlambat">Terlambat</option>
                            <option value="Alpha">Alpha</option>
                            <option value="Izin">Izin</option>
                            <option value="Cuti">Cuti</option>
                            <option value="Libur">Libur</option>
                          </select>
                        </td>
                        <td className="p-3 flex items-center gap-1.5">
                          <button
                            onClick={async () => {
                              if (!editPresensiData.id) return;
                              try {
                                await submitPresensiRecord(editPresensiData);
                                onShowToast('Presensi berhasil diperbarui', 'success');
                                setEditingPresensiId(null);
                                loadLogData();
                              } catch(e: any) {
                                onShowToast(`Gagal update: ${e.message || 'Error'}`, 'error');
                              }
                            }}
                            className="p-1 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingPresensiId(null)} className="p-1 rounded bg-slate-100 text-slate-400">
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3">{r.shift}</td>
                        <td className="p-3 font-mono">{r.jam_masuk || '-'}</td>
                        <td className="p-3 font-mono">{r.jam_pulang || '-'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'Hadir' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                            {r.status}
                          </span>
                        </td>
                        {userIsAdmin && (
                          <td className="p-3">
                            <button onClick={() => { setEditingPresensiId(r.id || null); setEditPresensiData(r); }} className="text-blue-500 p-1 hover:bg-blue-50 rounded"><Edit2 className="w-4 h-4"/></button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
                {logRecords.length === 0 && !loadingLog && (
                  <tr><td colSpan={8} className="text-center p-4 text-slate-400">Tidak ada log data presensi</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL 1: IZIN PULANG LEBIH AWAL ================= */}
      {showIzinPulangModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-black">
                  <Zap className="w-4 h-4" />
                </div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Izin Pulang Lebih Awal
                </h3>
              </div>
              <button
                onClick={() => setShowIzinPulangModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitIzinPulang} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Jam Pulang yang Diinginkan
                </label>
                <input
                  type="time"
                  required
                  value={izinPulangJam}
                  onChange={(e) => setIzinPulangJam(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Jam pulang normal shift Anda: <b>{shiftStandarPulang}</b>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Alasan Pulang Lebih Awal
                </label>
                <textarea
                  required
                  rows={3}
                  value={izinPulangAlasan}
                  onChange={(e) => setIzinPulangAlasan(e.target.value)}
                  placeholder="Contoh: Sakit mendadak / ada keperluan keluarga darurat / dsb"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                ></textarea>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIzinPulangModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingIzinPulang}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {submittingIzinPulang ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: PENGAJUAN TUKAR SHIFT ================= */}
      {showTukarShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-black">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    Formulir Tukar Shift
                  </h3>
                  <p className="text-[11px] text-slate-400">Shift PIC otomatis tertukar saat diapprove HR</p>
                </div>
              </div>
              <button
                onClick={() => setShowTukarShiftModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTukarShift} className="space-y-3.5">
              {/* SHIFT SAYA */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                <span className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                  1. Jadwal Shift Anda Yang Mau Ditukar
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Tanggal Shift Anda</label>
                    <input
                      type="date"
                      required
                      value={tsMyTanggal}
                      onChange={(e) => setTsMyTanggal(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Shift Anda</label>
                    <select
                      value={tsMyShift}
                      onChange={(e) => setTsMyShift(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                    >
                      <option value="Shift 1">Shift 1 (08:00 - 17:00)</option>
                      <option value="Shift 2">Shift 2 (09:00 - 18:00)</option>
                      <option value="Shift 3">Shift 3 (12:00 - 21:00)</option>
                      <option value="Libur">Libur (Off)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SHIFT REKAN KERJA */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 space-y-2">
                <span className="text-xs font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                  2. Ditukar Dengan Rekan Kerja &amp; Shift
                </span>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Pilih Rekan Kerja</label>
                  <select
                    required
                    value={tsTargetNik}
                    onChange={(e) => setTsTargetNik(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="">-- Pilih Rekan Karyawan --</option>
                    {karyawanList
                      .filter((k) => k.nik !== userNik)
                      .map((k) => (
                        <option key={k.nik} value={k.nik}>
                          {k.nama} ({k.nik} - {k.divisi || 'Staff'})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Tanggal Shift Rekan</label>
                    <input
                      type="date"
                      required
                      value={tsTargetTanggal}
                      onChange={(e) => setTsTargetTanggal(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Shift Rekan Yang Diambil</label>
                    <select
                      value={tsTargetShift}
                      onChange={(e) => setTsTargetShift(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                    >
                      <option value="Shift 1">Shift 1 (08:00 - 17:00)</option>
                      <option value="Shift 2">Shift 2 (09:00 - 18:00)</option>
                      <option value="Shift 3">Shift 3 (12:00 - 21:00)</option>
                      <option value="Libur">Libur (Off)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Alasan Tukar Shift
                </label>
                <textarea
                  required
                  rows={2}
                  value={tsAlasan}
                  onChange={(e) => setTsAlasan(e.target.value)}
                  placeholder="Contoh: Ada acara keluarga penting / kuliah / urusan pribadi"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTukarShiftModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingTukarShift}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {submittingTukarShift ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
