import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { UserSession, PresensiRecord, RosterShiftRecord, MasterShiftRecord } from '../../types';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import {
  fetchPresensiToday,
  fetchPresensiRange,
  submitPresensiRecord,
  fetchRosterShiftList,
  fetchMasterShiftList,
} from '../../services/supabase';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';

interface PresensiViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const PresensiView: React.FC<PresensiViewProps> = ({ session, onShowToast }) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDateStr, setCurrentDateStr] = useState<string>('');
  const [todayIso, setTodayIso] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'harian' | 'log'>('harian');
  const [logRecords, setLogRecords] = useState<PresensiRecord[]>([]);
  const [loadingLog, setLoadingLog] = useState<boolean>(false);
  const [editingPresensiId, setEditingPresensiId] = useState<number | string | null>(null);
  const [editPresensiData, setEditPresensiData] = useState<Partial<PresensiRecord>>({});

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


  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [todayPresensi, setTodayPresensi] = useState<PresensiRecord | null>(null);
  const [upcomingRoster, setUpcomingRoster] = useState<RosterShiftRecord[]>([]);
  const [shifts, setShifts] = useState<MasterShiftRecord[]>([]);

  const userNik = session?.nik || (session?.username && session.username.startsWith('WH') ? session.username : 'WH0001');

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
      // Format WIB HH:mm:ss
      const timeStr = getFormatTime(now);
      const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      // ISO YYYY-MM-DD
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
      const [presensi, masterShifts, roster] = await Promise.all([
        fetchPresensiToday(userNik, todayIso),
        fetchMasterShiftList(),
        fetchRosterShiftList(userNik, todayIso),
      ]);
      setTodayPresensi(presensi);
      setShifts(masterShifts);
      setUpcomingRoster(roster.slice(0, 7));
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

  // Handle Absen Masuk
  const handleAbsenMasuk = async () => {
    if (!userNik || !todayIso) return;
    setSubmitting(true);
    try {
      const nowTime = getFormatTime();
      const currentRoster = upcomingRoster.find((r) => r.tanggal === todayIso);
      const shiftName = currentRoster?.shift || 'Shift 1';

      const payload: Partial<PresensiRecord> = {
        nik: userNik,
        tanggal: todayIso,
        shift: shiftName,
        status: 'Hadir',
        jam_masuk: nowTime,
        catatan: `Presensi Masuk via WMS Mobile (${nowTime})`,
      };

      const result = await submitPresensiRecord(payload);
      if (result) {
        setTodayPresensi(result);
        playSuccessBeep();
        onShowToast(`Berhasil Presensi Masuk jam ${nowTime}! Semangat bekerja!`, 'success');
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
      const payload: Partial<PresensiRecord> = {
        ...todayPresensi,
        jam_pulang: nowTime,
        catatan: (todayPresensi.catatan || '') + ` | Pulang (${nowTime})`,
      };

      const result = await submitPresensiRecord(payload);
      if (result) {
        setTodayPresensi(result);
        playSuccessBeep();
        onShowToast(`Berhasil Presensi Pulang jam ${nowTime}! Terima kasih atas dedikasinya!`, 'success');
      }
    } catch (err) {
      playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Gagal presensi pulang.';
      onShowToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const todayRoster = upcomingRoster.find((r) => r.tanggal === todayIso);
  const isShiftLibur = todayRoster?.shift?.toLowerCase().includes('libur');

  const userIsAdmin = isSuperadmin(session);
  const canViewPresensi = userIsAdmin || hasPermission(session, 'can_view_presensi');

  if (!canViewPresensi) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center shadow-lg space-y-4">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/60 rounded-2xl flex items-center justify-center mx-auto text-rose-600 dark:text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Akses Presensi &amp; Shift Dibatasi
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Akun Anda (<b className="text-slate-700 dark:text-slate-200">{session?.name || session?.username}</b> - Role: <b className="text-[#ff7a00]">{session?.role}</b>) tidak memiliki hak akses untuk membuka modul <b>Presensi &amp; Shift</b>.
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 text-left space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#ff7a00]" />
              <span>Pengaturan Hak Akses Role:</span>
            </div>
            <p>
              Hubungi Superadmin untuk mengaktifkan izin <b>can_view_presensi</b> pada profil role akun Anda melalui menu <b>Pengaturan &gt; Manajemen Pengguna &amp; Role</b>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('harian')}
          className={`px-4 py-3 text-sm font-bold border-b-2 ${activeTab === 'harian' ? 'border-[#ff7a00] text-[#ff7a00]' : 'border-transparent text-slate-500'}`}
        >
          Presensi Harian
        </button>
        <button
          onClick={() => setActiveTab('log')}
          className={`px-4 py-3 text-sm font-bold border-b-2 ${activeTab === 'log' ? 'border-[#ff7a00] text-[#ff7a00]' : 'border-transparent text-slate-500'}`}
        >
          Log Presensi
        </button>
      </div>
      
      {activeTab === 'harian' && (
        <div className="space-y-6">
      {/* HEADER CLOCK & PROFILE BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-[#1e293b] p-6 sm:p-8 text-white shadow-xl border border-slate-700/60">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#ff7a00]/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-0 right-0 p-6 opacity-10">
          <Clock className="w-44 h-44" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-[#ff7a00]/20 border border-[#ff7a00]/40 text-[#ff7a00] rounded-full text-xs font-black tracking-wider uppercase flex items-center gap-1.5">
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
              <Calendar className="w-4 h-4 text-[#ff7a00]" />
              {currentDateStr || 'Memuat tanggal...'}
            </p>
          </div>

          {/* User Badge Info */}
          <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#ff7a00] to-amber-400 flex items-center justify-center text-white font-black text-lg shadow-md">
              {session?.name ? session.name.charAt(0).toUpperCase() : session?.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-extrabold text-sm text-white">{session?.name || session?.username}</div>
              <div className="text-xs text-slate-300 font-mono">NIK: {userNik}</div>
              <div className="text-[11px] font-semibold text-[#ff7a00]">{session?.role}</div>
            </div>
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
                <div className="w-9 h-9 rounded-xl bg-[#ff7a00]/10 flex items-center justify-center text-[#ff7a00]">
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
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</div>
                  <div className="mt-1 flex items-center gap-1.5 font-extrabold text-sm">
                    {todayPresensi ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" /> Hadir
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
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Jam Pulang</div>
                  <div className="mt-1 font-mono font-black text-sm text-slate-800 dark:text-white">
                    {todayPresensi?.jam_pulang || '--:--'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
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
                <span>Sudah Presensi Masuk ({todayPresensi.jam_masuk})</span>
              </div>
            )}

            {!todayPresensi?.jam_pulang ? (
              <button
                type="button"
                onClick={handleAbsenPulang}
                disabled={!todayPresensi?.jam_masuk || submitting || loading}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#ff7a00] hover:bg-[#e06c00] text-white font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-[#ff7a00]/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogOut className="w-5 h-5" />
                <span>{submitting ? 'Memproses...' : 'Presensi Pulang'}</span>
              </button>
            ) : (
              <div className="py-3.5 px-5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>Sudah Presensi Pulang ({todayPresensi.jam_pulang})</span>
              </div>
            )}
          </div>
        </div>

        {/* SHIFT RULES SUMMARY */}
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Ketentuan Shift Warehouse
              </h3>
            </div>

            <div className="space-y-3">
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
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-xs flex justify-between">
                    <b>Shift 3</b>
                    <span className="font-mono">12:00 - 21:00</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
            Khusus hari <b>Sabtu</b> Shift 3: 11:00 - 20:00 • Hari Minggu: <b>Libur</b>
          </div>
        </div>
      </div>

      {/* UPCOMING 7 DAYS ROSTER PREVIEW */}
      <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Jadwal Kerja Saya (7 Hari ke Depan)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daftar jadwal shift yang telah ditetapkan oleh Admin
              </p>
            </div>
          </div>
        </div>

        {upcomingRoster.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            Belum ada data jadwal roster untuk 7 hari ke depan.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {upcomingRoster.map((r) => {
              const isToday = r.tanggal === todayIso;
              const isLibur = r.shift.toLowerCase().includes('libur');

              const d = new Date(r.tanggal);
              const dayName = d.toLocaleDateString('id-ID', { weekday: 'short' });
              const dateFormatted = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

              return (
                <div
                  key={r.id || r.tanggal}
                  className={`p-3.5 rounded-2xl text-center border transition-all ${
                    isToday
                      ? 'border-[#ff7a00] bg-[#ff7a00]/10 ring-2 ring-[#ff7a00]/30 shadow-md'
                      : isLibur
                      ? 'border-slate-200/50 dark:border-slate-800/50 bg-slate-100/50 dark:bg-slate-900/30 opacity-70'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="text-[11px] font-bold text-slate-400 uppercase">{dayName}</div>
                  <div className="font-extrabold text-sm text-slate-800 dark:text-slate-200 my-0.5">
                    {dateFormatted}
                  </div>
                  <div className="mt-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        isLibur
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                          : isToday
                          ? 'bg-[#ff7a00] text-white'
                          : 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300'
                      }`}
                    >
                      {r.shift}
                    </span>
                  </div>
                  {r.jam_masuk && !isLibur && (
                    <div className="text-[10px] font-mono text-slate-500 mt-1">
                      {r.jam_masuk}-{r.jam_pulang}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

        </div>
      )}

      {activeTab === 'log' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 border border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-black text-lg text-slate-900 dark:text-white">Log Presensi (30 Hari Terakhir)</h2>
            <button onClick={loadLogData} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg"><RotateCcw className="w-4 h-4" /></button>
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
                    <td className="p-3">{r.nama_karyawan || r.nik}</td>
                    
                    {editingPresensiId === r.id ? (
                      <>
                        <td className="p-3">
                           <input type="text" value={editPresensiData.shift || ''} onChange={e => setEditPresensiData({...editPresensiData, shift: e.target.value})} className="border p-1 rounded w-20 text-xs bg-transparent dark:border-slate-700"/>
                        </td>
                        <td className="p-3">
                           <input type="time" value={editPresensiData.jam_masuk || ''} onChange={e => setEditPresensiData({...editPresensiData, jam_masuk: e.target.value})} className="border p-1 rounded w-20 text-xs bg-transparent dark:border-slate-700"/>
                        </td>
                        <td className="p-3">
                           <input type="time" value={editPresensiData.jam_pulang || ''} onChange={e => setEditPresensiData({...editPresensiData, jam_pulang: e.target.value})} className="border p-1 rounded w-20 text-xs bg-transparent dark:border-slate-700"/>
                        </td>
                        <td className="p-3">
                           <select value={editPresensiData.status || ''} onChange={e => setEditPresensiData({...editPresensiData, status: e.target.value})} className="border p-1 rounded w-24 text-xs bg-white dark:bg-slate-900 dark:border-slate-700">
                             <option value="Hadir">Hadir</option>
                             <option value="Terlambat">Terlambat</option>
                             <option value="Alpha">Alpha</option>
                             <option value="Izin">Izin</option>
                             <option value="Cuti">Cuti</option>
                           </select>
                        </td>
                        <td className="p-3 flex gap-2">
                          <button onClick={async () => {
                            if (!editPresensiData.id) return;
                            try {
                              await submitPresensiRecord(editPresensiData);
                              onShowToast('Presensi berhasil diupdate', 'success');
                              setEditingPresensiId(null);
                              loadLogData();
                            } catch(e) {
                              onShowToast('Gagal update', 'error');
                            }
                          }} className="text-emerald-500"><Save className="w-4 h-4" /></button>
                          <button onClick={() => setEditingPresensiId(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3">{r.shift}</td>
                        <td className="p-3">{r.jam_masuk || '-'}</td>
                        <td className="p-3">{r.jam_pulang || '-'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${r.status === 'Hadir' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                            {r.status}
                          </span>
                        </td>
                        {userIsAdmin && (
                          <td className="p-3">
                            <button onClick={() => { setEditingPresensiId(r.id || null); setEditPresensiData(r); }} className="text-blue-500 p-1 hover:bg-blue-50 dark:hover:bg-blue-900 rounded"><Edit2 className="w-4 h-4"/></button>
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
    </div>
  );
};
