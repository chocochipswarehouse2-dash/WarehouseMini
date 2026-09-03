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
} from 'lucide-react';
import { UserSession, LemburRecord, PerijinanCutiRecord } from '../../types';
import {
  fetchLemburRecords,
  updateLemburStatus,
  fetchCutiRecords,
  updateCutiStatus,
} from '../../services/supabase';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';

interface HrApprovalViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const HrApprovalView: React.FC<HrApprovalViewProps> = ({ session, onShowToast }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [activeSection, setActiveSection] = useState<'lembur' | 'cuti'>('lembur');

  const [lemburList, setLemburList] = useState<LemburRecord[]>([]);
  const [cutiList, setCutiList] = useState<PerijinanCutiRecord[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER BANNER */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131d31] shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#ff7a00]/10 border border-[#ff7a00]/20 flex items-center justify-center text-[#ff7a00]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                Pusat Persetujuan HR (Approval Admin)
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                KHUSUS ADMIN
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Validasi dan konfirmasi pengajuan lembur dan cuti karyawan warehouse
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setActiveSection('lembur')}
          className={`p-5 rounded-3xl border transition-all text-left flex items-center justify-between cursor-pointer ${
            activeSection === 'lembur'
              ? 'border-[#ff7a00] bg-[#ff7a00]/10 ring-2 ring-[#ff7a00]/30 shadow-md'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131d31] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Antrean Lembur
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {pendingLembur.length} Pengajuan
              </div>
            </div>
          </div>
          {pendingLembur.length > 0 && (
            <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('cuti')}
          className={`p-5 rounded-3xl border transition-all text-left flex items-center justify-between cursor-pointer ${
            activeSection === 'cuti'
              ? 'border-[#ff7a00] bg-[#ff7a00]/10 ring-2 ring-[#ff7a00]/30 shadow-md'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131d31] hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 flex items-center justify-center text-teal-500">
              <Palmtree className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Antrean Ijin / Cuti
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {pendingCuti.length} Pengajuan
              </div>
            </div>
          </div>
          {pendingCuti.length > 0 && (
            <span className="w-3 h-3 rounded-full bg-teal-500 animate-pulse"></span>
          )}
        </button>
      </div>

      {/* SECTION: APPROVAL LEMBUR */}
      {activeSection === 'lembur' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
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
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
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
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Setujui</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRejectLembur(item)}
                      disabled={processingId === item.id}
                      className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5 border border-rose-500/20 cursor-pointer disabled:opacity-50"
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

      {/* SECTION: APPROVAL CUTI */}
      {activeSection === 'cuti' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Palmtree className="w-4 h-4 text-teal-500" />
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Daftar Pengajuan Ijin / Cuti Menunggu Persetujuan ({pendingCuti.length})
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
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
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
                    <p className="text-slate-700 dark:text-slate-300 mt-1">{item.alasan}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApproveCuti(item)}
                      disabled={processingId === item.id}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Setujui</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRejectCuti(item)}
                      disabled={processingId === item.id}
                      className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5 border border-rose-500/20 cursor-pointer disabled:opacity-50"
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
