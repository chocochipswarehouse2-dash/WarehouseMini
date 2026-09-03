import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  Zap,
  Palmtree,
  Users,
  PlusCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  RotateCcw,
} from 'lucide-react';
import { UserSession, LemburRecord, PerijinanCutiRecord } from '../../types';
import {
  fetchLemburRecords,
  submitLemburRecord,
  fetchCutiRecords,
  submitCutiRecord,
} from '../../services/supabase';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';

interface LemburCutiViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const LemburCutiView: React.FC<LemburCutiViewProps> = ({ session, onShowToast }) => {
  const [activeTab, setActiveTab] = useState<'lembur' | 'cuti' | 'team_cuti'>('lembur');
  const [loading, setLoading] = useState<boolean>(true);

  const [lemburList, setLemburList] = useState<LemburRecord[]>([]);
  const [cutiList, setCutiList] = useState<PerijinanCutiRecord[]>([]);

  // Form Lembur State
  const [lemburDate, setLemburDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [lemburStart, setLemburStart] = useState<string>('17:00');
  const [lemburEnd, setLemburEnd] = useState<string>('19:00');
  const [lemburDesc, setLemburDesc] = useState<string>('');
  const [submittingLembur, setSubmittingLembur] = useState<boolean>(false);

  // Form Cuti State
  const [cutiType, setCutiType] = useState<string>('Cuti Tahunan');
  const [cutiStart, setCutiStart] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [cutiEnd, setCutiEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [cutiReason, setCutiReason] = useState<string>('');
  const [submittingCuti, setSubmittingCuti] = useState<boolean>(false);

  const userNik = session?.nik || (session?.username && session.username.startsWith('WH') ? session.username : 'WH0001');
  const userName = session?.name || session?.username || 'Karyawan';

  const loadData = async () => {
    setLoading(true);
    try {
      const [lList, cList] = await Promise.all([
        fetchLemburRecords(),
        fetchCutiRecords(),
      ]);
      setLemburList(lList);
      setCutiList(cList);
    } catch (err) {
      console.warn('Gagal memuat data lembur & cuti:', err);
      onShowToast('Gagal memuat data lembur & cuti', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calculate Lembur Duration in Hours
  const calculateDuration = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diffMinutes = h2 * 60 + m2 - (h1 * 60 + m1);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // crossover midnight
    return Math.round((diffMinutes / 60) * 10) / 10;
  };

  // Calculate Cuti Days
  const calculateCutiDays = (start: string, end: string): number => {
    if (!start || !end) return 1;
    const d1 = new Date(start);
    const d2 = new Date(end);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // Submit Lembur
  const handleSubmitLembur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lemburDesc.trim()) {
      onShowToast('Mohon tulis deskripsi / alasan lembur!', 'warning');
      return;
    }

    const durasi = calculateDuration(lemburStart, lemburEnd);
    if (durasi <= 0) {
      onShowToast('Durasi lembur harus lebih dari 0 jam!', 'warning');
      return;
    }

    setSubmittingLembur(true);
    try {
      const rateLembur = 10000; // default rate
      const total = durasi * rateLembur;

      const payload: Partial<LemburRecord> = {
        nik: userNik,
        nama: userName,
        divisi: session?.divisi || 'Warehouse',
        tanggal: lemburDate,
        deskripsi: lemburDesc.trim(),
        jam_mulai: lemburStart,
        jam_selesai: lemburEnd,
        durasi_jam: durasi,
        rate_lembur: rateLembur,
        total_lembur: total,
        status: 'Diajukan',
      };

      const res = await submitLemburRecord(payload);
      setLemburList((prev) => [res, ...prev]);
      setLemburDesc('');
      playSuccessBeep();
      onShowToast(`Pengajuan lembur ${durasi} jam berhasil dikirim ke Admin!`, 'success');
    } catch (err) {
      playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Gagal mengajukan lembur.';
      onShowToast(msg, 'error');
    } finally {
      setSubmittingLembur(false);
    }
  };

  // Submit Cuti
  const handleSubmitCuti = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cutiReason.trim()) {
      onShowToast('Mohon tulis alasan pengajuan cuti/ijin!', 'warning');
      return;
    }

    const days = calculateCutiDays(cutiStart, cutiEnd);
    setSubmittingCuti(true);
    try {
      const payload: Partial<PerijinanCutiRecord> = {
        nik: userNik,
        nama: userName,
        divisi: session?.divisi || 'Warehouse',
        jenis: cutiType,
        tgl_mulai: cutiStart,
        tgl_selesai: cutiEnd,
        jumlah_hari: days,
        alasan: cutiReason.trim(),
        status: 'Diajukan',
      };

      const res = await submitCutiRecord(payload);
      setCutiList((prev) => [res, ...prev]);
      setCutiReason('');
      playSuccessBeep();
      onShowToast(`Pengajuan ${cutiType} (${days} hari) berhasil dikirim ke Admin!`, 'success');
    } catch (err) {
      playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Gagal mengajukan cuti.';
      onShowToast(msg, 'error');
    } finally {
      setSubmittingCuti(false);
    }
  };

  // Filter personal lembur
  const myLembur = lemburList.filter((l) => l.nik === userNik);
  const myCuti = cutiList.filter((c) => c.nik === userNik);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* TOP TAB NAVIGATION */}
      <div className="flex bg-white dark:bg-[#131d31] p-1.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('lembur')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'lembur'
              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Pengajuan Lembur ({myLembur.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cuti')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'cuti'
              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Palmtree className="w-4 h-4" />
          <span>Ijin & Cuti Saya ({myCuti.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('team_cuti')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'team_cuti'
              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Info Cuti Tim ({cutiList.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LEMBUR */}
      {/* ========================================================================= */}
      {activeTab === 'lembur' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FORM INPUT LEMBUR */}
          <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-[#ff7a00]/10 flex items-center justify-center text-[#ff7a00]">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Form Pengajuan Lembur
                </h3>
                <p className="text-[11px] text-slate-400">Kalkulasi durasi jam otomatis</p>
              </div>
            </div>

            <form onSubmit={handleSubmitLembur} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                  Tanggal Lembur
                </label>
                <input
                  type="date"
                  value={lemburDate}
                  onChange={(e) => setLemburDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:text-white font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                    Jam Mulai
                  </label>
                  <input
                    type="time"
                    value={lemburStart}
                    onChange={(e) => setLemburStart(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                    Jam Selesai
                  </label>
                  <input
                    type="time"
                    value={lemburEnd}
                    onChange={(e) => setLemburEnd(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl flex items-center justify-between font-bold">
                <span className="text-slate-500">Estimasi Durasi:</span>
                <span className="text-[#ff7a00] font-black text-sm">
                  {calculateDuration(lemburStart, lemburEnd)} Jam
                </span>
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                  Keterangan / Pekerjaan Lembur
                </label>
                <textarea
                  rows={3}
                  value={lemburDesc}
                  onChange={(e) => setLemburDesc(e.target.value)}
                  placeholder="Contoh: Photoshoot luar kota, packing pesanan event, SO..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:text-white"
                  required
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={submittingLembur}
                className="w-full py-3 px-4 rounded-xl bg-[#ff7a00] hover:bg-[#e06c00] text-white font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-[#ff7a00]/20 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submittingLembur ? 'Mengirim...' : 'Kirim Pengajuan Lembur'}</span>
              </button>
            </form>
          </div>

          {/* RIWAYAT LEMBUR SAYA */}
          <div className="lg:col-span-2 bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#ff7a00]" />
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Riwayat Pengajuan Lembur Saya ({myLembur.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {myLembur.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Belum ada data pengajuan lembur pribadi.
              </div>
            ) : (
              <div className="space-y-3">
                {myLembur.map((l) => (
                  <div
                    key={l.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {l.tanggal}
                        </span>
                        <span className="font-mono text-slate-500">
                          ({l.jam_mulai?.slice(0, 5)} - {l.jam_selesai?.slice(0, 5)})
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-500">
                          {l.durasi_jam} Jam
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 mt-1">{l.deskripsi}</p>
                      {l.catatan && (
                        <div className="text-[11px] text-slate-500 mt-0.5 italic">
                          Catatan Admin: {l.catatan}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0">
                      {l.status === 'Disetujui' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-extrabold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Disetujui
                        </span>
                      ) : l.status === 'Ditolak' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-full text-xs font-extrabold">
                          <XCircle className="w-3.5 h-3.5" /> Ditolak
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full text-xs font-extrabold">
                          <AlertCircle className="w-3.5 h-3.5" /> Menunggu Approval
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CUTI SAYA */}
      {/* ========================================================================= */}
      {activeTab === 'cuti' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FORM INPUT CUTI */}
          <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-500">
                <Palmtree className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Form Pengajuan Ijin / Cuti
                </h3>
                <p className="text-[11px] text-slate-400">Cuti tahunan, sakit, atau ijin</p>
              </div>
            </div>

            <form onSubmit={handleSubmitCuti} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                  Jenis Perijinan
                </label>
                <select
                  value={cutiType}
                  onChange={(e) => setCutiType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:text-white font-extrabold"
                >
                  <option value="Cuti Tahunan">Cuti Tahunan</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Ijin">Ijin Keperluan Lain</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    type="date"
                    value={cutiStart}
                    onChange={(e) => setCutiStart(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    value={cutiEnd}
                    onChange={(e) => setCutiEnd(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl flex items-center justify-between font-bold">
                <span className="text-slate-500">Jumlah Hari:</span>
                <span className="text-teal-600 dark:text-teal-400 font-black text-sm">
                  {calculateCutiDays(cutiStart, cutiEnd)} Hari
                </span>
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                  Alasan / Keterangan
                </label>
                <textarea
                  rows={3}
                  value={cutiReason}
                  onChange={(e) => setCutiReason(e.target.value)}
                  placeholder="Tuliskan alasan perijinan atau cuti secara jelas..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 dark:text-white"
                  required
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={submittingCuti}
                className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submittingCuti ? 'Mengirim...' : 'Kirim Pengajuan Ijin / Cuti'}</span>
              </button>
            </form>
          </div>

          {/* RIWAYAT CUTI SAYA */}
          <div className="lg:col-span-2 bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
              Riwayat Cuti & Ijin Saya ({myCuti.length})
            </h3>

            {myCuti.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Belum ada riwayat perijinan atau cuti pribadi.
              </div>
            ) : (
              <div className="space-y-3">
                {myCuti.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">
                          {c.jenis}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-500/10 text-teal-600 dark:text-teal-400">
                          {c.jumlah_hari} Hari
                        </span>
                      </div>
                      <div className="font-mono text-slate-500 mt-1">
                        {c.tgl_mulai} s/d {c.tgl_selesai}
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 mt-1">{c.alasan}</p>
                    </div>

                    <div className="shrink-0">
                      {c.status === 'Disetujui' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full text-xs font-extrabold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Disetujui
                        </span>
                      ) : c.status === 'Ditolak' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-full text-xs font-extrabold">
                          <XCircle className="w-3.5 h-3.5" /> Ditolak
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full text-xs font-extrabold">
                          <AlertCircle className="w-3.5 h-3.5" /> Menunggu Approval
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: INFO CUTI TIM */}
      {/* ========================================================================= */}
      {activeTab === 'team_cuti' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#ff7a00]" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Papan Transparansi Cuti Tim ({cutiList.length})
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Informasi cuti seluruh rekan kerja warehouse untuk memudahkan koordinasi shift harian.
          </p>

          {cutiList.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Belum ada perijinan cuti terdaftar dalam tim.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {cutiList.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800/70 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-slate-900 dark:text-white">{c.nama}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {c.nik} • {c.divisi || 'Warehouse'}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        c.status === 'Disetujui'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {c.jenis} ({c.jumlah_hari} Hari)
                    </span>
                    <span className="font-mono text-slate-500">
                      {c.tgl_mulai} s/d {c.tgl_selesai}
                    </span>
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
