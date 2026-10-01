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
  Edit2,
  Trash2,
  Filter,
  Search,
  ArrowUpDown,
  Check,
  X,
} from 'lucide-react';
import { UserSession, LemburRecord, PerijinanCutiRecord } from '../../types';
import { HrApprovalView } from './HrApprovalView';
import { ShieldCheck, History } from 'lucide-react';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import {
  fetchLemburRecords,
  submitLemburRecord,
  fetchCutiRecords,
  submitCutiRecord,
  deleteLemburRecord,
  deleteCutiRecord,
  updateCutiStatus,
  updateCutiRecord,
  upsertRosterShiftForCuti,
  removeRosterShiftForCuti,
} from '../../services/supabase';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';
import { getUserPersonName, getUserNik } from '../../utils/userResolver';

interface LemburCutiViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const LemburCutiView: React.FC<LemburCutiViewProps> = ({ session, onShowToast }) => {
  const [activeTab, setActiveTab] = useState<'approval' | 'lembur' | 'cuti' | 'team_cuti'>('lembur');
  const canApprove = isSuperadmin(session) || session?.role === 'Super Admin' || session?.role === 'Manager' || hasPermission(session, 'menu_hr_approval');
  const [loading, setLoading] = useState<boolean>(true);

  const [lemburList, setLemburList] = useState<LemburRecord[]>([]);
  const [cutiList, setCutiList] = useState<PerijinanCutiRecord[]>([]);

  // Form Lembur State
  const [lemburDate, setLemburDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [lemburStart, setLemburStart] = useState<string>('17:00');
  const [lemburEnd, setLemburEnd] = useState<string>('19:00');
  const [lemburDesc, setLemburDesc] = useState<string>('');
  const [submittingLembur, setSubmittingLembur] = useState<boolean>(false);

  // Filter & Search states for Team Cuti
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>("");
  const [teamStatusFilter, setTeamStatusFilter] = useState<"all" | "Diajukan" | "Disetujui" | "Ditolak">("all");
  const [teamDivisiFilter, setTeamDivisiFilter] = useState<string>("all");
  const [teamSortBy, setTeamSortBy] = useState<"pending_first" | "date_desc" | "date_asc" | "name_asc">("pending_first");
  const [processingCutiId, setProcessingCutiId] = useState<string | null>(null);

  // Edit Cuti Modal State
  const [editingCutiItem, setEditingCutiItem] = useState<PerijinanCutiRecord | null>(null);
  const [savingEditCuti, setSavingEditCuti] = useState<boolean>(false);

  // Form Cuti State
  const [cutiType, setCutiType] = useState<string>('Cuti Tahunan');
  const [cutiStart, setCutiStart] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [cutiEnd, setCutiEnd] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [cutiReason, setCutiReason] = useState<string>('');
  const [submittingCuti, setSubmittingCuti] = useState<boolean>(false);

  const userNik = getUserNik(session);
  const userName = session?.name || getUserPersonName(session?.username) || 'Karyawan';

  const isAdmin = isSuperadmin(session) || hasPermission(session, 'menu_hr_approval');
  
  const loadData = async () => {
    setLoading(true);
    try {
      const lemburPromise = (isAdmin || canApprove) ? fetchLemburRecords() : fetchLemburRecords(userNik);
      const [lList, cList] = await Promise.all([
        lemburPromise,
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

  // Handle Batal & Hapus Pengajuan Mandiri (Lembur)
  const handleDeleteMyLembur = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan & menghapus pengajuan lembur ini?')) return;
    try {
      await deleteLemburRecord(id);
      setLemburList((prev) => prev.filter((l) => l.id !== id));
      playSuccessBeep();
      onShowToast('Pengajuan lembur berhasil dibatalkan & dihapus.', 'info');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal membatalkan lembur: ' + (err?.message || 'Error'), 'error');
    }
  };

  // Handle Batal & Hapus Permohonan Mandiri (Cuti)
  const handleDeleteMyCuti = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan & menghapus permohonan cuti ini?')) return;
    try {
      await deleteCutiRecord(id);
      setCutiList((prev) => prev.filter((c) => c.id !== id));
      playSuccessBeep();
      onShowToast('Permohonan cuti berhasil dibatalkan & dihapus.', 'info');
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal membatalkan cuti: ' + (err?.message || 'Error'), 'error');
    }
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

  // --- HANDLER APPROVAL & KELOLA CUTI TIM ---
  const handleApproveCuti = async (item: PerijinanCutiRecord) => {
    setProcessingCutiId(item.id);
    try {
      const approver = session?.name || session?.username || "Admin";
      await updateCutiStatus(item.id, "Disetujui", approver);
      await upsertRosterShiftForCuti({ ...item, status: "Disetujui", approved_by: approver });
      setCutiList((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: "Disetujui", approved_by: approver } : c))
      );
      playSuccessBeep();
      onShowToast(`Cuti ${item.nama} (${item.jumlah_hari} hari) berhasil disetujui & masuk ke jadwal roster!`, "success");
    } catch (err: any) {
      playErrorBeep();
      onShowToast(`Gagal menyetujui cuti: ${err?.message || "Error"}`, "error");
    } finally {
      setProcessingCutiId(null);
    }
  };

  const handleRejectCuti = async (item: PerijinanCutiRecord) => {
    const reason = prompt("Masukkan alasan penolakan cuti / ijin:") || "Ditolak oleh Atasan / HR";
    setProcessingCutiId(item.id);
    try {
      const approver = session?.name || session?.username || "Admin";
      await updateCutiStatus(item.id, "Ditolak", approver, reason);
      await removeRosterShiftForCuti(item);
      setCutiList((prev) =>
        prev.map((c) =>
          c.id === item.id ? { ...c, status: "Ditolak", approved_by: approver, catatan: reason } : c
        )
      );
      playSuccessBeep();
      onShowToast(`Pengajuan cuti ${item.nama} telah ditolak.`, "info");
    } catch (err: any) {
      playErrorBeep();
      onShowToast(`Gagal menolak cuti: ${err?.message || "Error"}`, "error");
    } finally {
      setProcessingCutiId(null);
    }
  };

  const handleResetCuti = async (item: PerijinanCutiRecord) => {
    if (!confirm(`Kembalikan status cuti ${item.nama} menjadi "Diajukan"?`)) return;
    setProcessingCutiId(item.id);
    try {
      await updateCutiStatus(item.id, "Diajukan", "");
      await removeRosterShiftForCuti(item);
      setCutiList((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: "Diajukan", approved_by: undefined } : c))
      );
      playSuccessBeep();
      onShowToast(`Status cuti ${item.nama} di-reset ke "Diajukan".`, "info");
    } catch (err: any) {
      playErrorBeep();
      onShowToast(`Gagal me-reset cuti: ${err?.message || "Error"}`, "error");
    } finally {
      setProcessingCutiId(null);
    }
  };

  const handleDeleteCuti = async (item: PerijinanCutiRecord) => {
    if (
      !confirm(
        `Hapus permanen permohonan cuti ${item.nama} (${item.tgl_mulai} s/d ${item.tgl_selesai})? Tindakan tidak dapat dibatalkan.`
      )
    )
      return;
    setProcessingCutiId(item.id);
    try {
      await deleteCutiRecord(item.id);
      await removeRosterShiftForCuti(item);
      setCutiList((prev) => prev.filter((c) => c.id !== item.id));
      playSuccessBeep();
      onShowToast(`Data cuti ${item.nama} berhasil dihapus permanen.`, "success");
    } catch (err: any) {
      playErrorBeep();
      onShowToast(`Gagal menghapus cuti: ${err?.message || "Error"}`, "error");
    } finally {
      setProcessingCutiId(null);
    }
  };

  const handleSaveEditCuti = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCutiItem) return;
    setSavingEditCuti(true);
    try {
      const days = calculateCutiDays(editingCutiItem.tgl_mulai, editingCutiItem.tgl_selesai);
      await updateCutiRecord(editingCutiItem.id, {
        tgl_mulai: editingCutiItem.tgl_mulai,
        tgl_selesai: editingCutiItem.tgl_selesai,
        jumlah_hari: days,
        jenis: editingCutiItem.jenis,
        alasan: editingCutiItem.alasan,
      });
      if (editingCutiItem.status === "Disetujui") {
        await upsertRosterShiftForCuti({ ...editingCutiItem, jumlah_hari: days });
      }
      setCutiList((prev) =>
        prev.map((c) =>
          c.id === editingCutiItem.id
            ? { ...c, ...editingCutiItem, jumlah_hari: days }
            : c
        )
      );
      setEditingCutiItem(null);
      playSuccessBeep();
      onShowToast(`Perubahan cuti ${editingCutiItem.nama} berhasil disimpan!`, "success");
    } catch (err: any) {
      playErrorBeep();
      onShowToast(`Gagal mengedit data cuti: ${err?.message || "Error"}`, "error");
    } finally {
      setSavingEditCuti(false);
    }
  };

  // Distinct divisions
  const availableDivisions = Array.from(
    new Set(cutiList.map((c) => c.divisi || "Warehouse"))
  );

  // Filter & Sort Team Cuti
  const filteredAndSortedTeamCuti = cutiList
    .filter((c) => {
      if (teamSearchQuery.trim()) {
        const q = teamSearchQuery.toLowerCase();
        const matchName = (c.nama || "").toLowerCase().includes(q);
        const matchNik = (c.nik || "").toLowerCase().includes(q);
        const matchJenis = (c.jenis || "").toLowerCase().includes(q);
        const matchAlasan = (c.alasan || "").toLowerCase().includes(q);
        if (!matchName && !matchNik && !matchJenis && !matchAlasan) return false;
      }
      if (teamStatusFilter !== "all" && c.status !== teamStatusFilter) {
        return false;
      }
      if (teamDivisiFilter !== "all" && (c.divisi || "Warehouse") !== teamDivisiFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (teamSortBy === "pending_first") {
        if (a.status === "Diajukan" && b.status !== "Diajukan") return -1;
        if (a.status !== "Diajukan" && b.status === "Diajukan") return 1;
        return (b.tgl_mulai || "").localeCompare(a.tgl_mulai || "");
      }
      if (teamSortBy === "date_desc") {
        return (b.tgl_mulai || "").localeCompare(a.tgl_mulai || "");
      }
      if (teamSortBy === "date_asc") {
        return (a.tgl_mulai || "").localeCompare(b.tgl_mulai || "");
      }
      if (teamSortBy === "name_asc") {
        return (a.nama || "").localeCompare(b.nama || "");
      }
      return 0;
    });

  const pendingCutiCount = cutiList.filter((c) => c.status === "Diajukan").length;
  const pendingLemburCount = lemburList.filter((l) => l.status === "Diajukan").length;
  const totalPendingCount = pendingCutiCount + pendingLemburCount;

  // Filter personal lembur
  const myLembur = lemburList.filter((l) => l.nik === userNik);
  const myCuti = cutiList.filter((c) => c.nik === userNik);

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      {/* TOP TAB NAVIGATION */}
      <div className="flex bg-white dark:bg-[#131d31] p-1.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 gap-1.5 overflow-x-auto">
        {canApprove && (
          <button
            type="button"
            onClick={() => setActiveTab("approval")}
            className={`flex-1 py-3 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "approval"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/25"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Approval Tim</span>
            {totalPendingCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === "approval"
                    ? "bg-white text-amber-600"
                    : "bg-rose-500 text-white animate-pulse"
                }`}
              >
                {totalPendingCount}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('lembur')}
          className={`flex-1 py-3 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'lembur'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Pengajuan Lembur ({myLembur.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cuti')}
          className={`flex-1 py-3 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'cuti'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Palmtree className="w-4 h-4" />
          <span>Ijin & Cuti Saya ({myCuti.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('team_cuti')}
          className={`flex-1 py-3 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'team_cuti'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Info Cuti Tim ({cutiList.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 0: APPROVAL & KELOLA TIM (KHUSUS ADMIN/ATASAN) */}
      {/* ========================================================================= */}
      {canApprove && activeTab === 'approval' && (
        <div className="animate-in fade-in duration-200">
          <HrApprovalView session={session} onShowToast={onShowToast} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: LEMBUR */}
      {/* ========================================================================= */}
      {activeTab === 'lembur' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* FORM INPUT LEMBUR */}
          <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-500">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Form Pengajuan Lembur
                </h3>
                <p className="text-[11px] text-slate-400">Kalkulasi durasi jam otomatis</p>
              </div>
            </div>

            <form onSubmit={handleSubmitLembur} className="space-y-2 text-xs">
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
                <span className="text-primary-500 font-black text-sm">
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
                className="w-full py-3 px-2 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submittingLembur ? 'Mengirim...' : 'Kirim Pengajuan Lembur'}</span>
              </button>
            </form>
          </div>

          {/* RIWAYAT LEMBUR SAYA */}
          <div className="lg:col-span-2 bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary-500" />
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
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/10 border border-primary-500/20 text-primary-600 dark:text-primary-400 rounded-full text-xs font-extrabold">
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* FORM INPUT CUTI */}
          <div className="bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5 mb-2">
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

            <form onSubmit={handleSubmitCuti} className="space-y-2 text-xs">
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
                className="w-full py-3 px-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submittingCuti ? 'Mengirim...' : 'Kirim Pengajuan Ijin / Cuti'}</span>
              </button>
            </form>
          </div>

          {/* RIWAYAT CUTI SAYA */}
          <div className="lg:col-span-2 bg-white dark:bg-[#131d31] rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
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
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/10 border border-primary-500/20 text-primary-600 dark:text-primary-400 rounded-full text-xs font-extrabold">
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
      {activeTab === "team_cuti" && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          {/* Header & Quick Counter Badges */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-500" />
                <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Papan Transparansi & Kelola Cuti Tim ({cutiList.length})
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Koordinasi cuti seluruh rekan kerja warehouse & kelola approval secara langsung.
              </p>
            </div>

            {/* Quick Status Count Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setTeamStatusFilter("all")}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                  teamStatusFilter === "all"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                Semua ({cutiList.length})
              </button>
              <button
                type="button"
                onClick={() => setTeamStatusFilter("Diajukan")}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  teamStatusFilter === "Diajukan"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100"
                }`}
              >
                <span>Diajukan</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-600/30 font-black">
                  {cutiList.filter((c) => c.status === "Diajukan").length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTeamStatusFilter("Disetujui")}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                  teamStatusFilter === "Disetujui"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"
                }`}
              >
                Disetujui ({cutiList.filter((c) => c.status === "Disetujui").length})
              </button>
              <button
                type="button"
                onClick={() => setTeamStatusFilter("Ditolak")}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                  teamStatusFilter === "Ditolak"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100"
                }`}
              >
                Ditolak ({cutiList.filter((c) => c.status === "Ditolak").length})
              </button>
            </div>
          </div>

          {/* FILTER & SEARCH TOOLBAR (Multi-Choice / DropSearch / Sort) */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80">
            {/* Search Input (DropSearch Multi-Text) */}
            <div className="sm:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={teamSearchQuery}
                onChange={(e) => setTeamSearchQuery(e.target.value)}
                placeholder="Cari nama karyawan, NIK, atau alasan cuti..."
                className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium"
              />
              {teamSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTeamSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Divisi */}
            <div className="sm:col-span-3">
              <select
                value={teamDivisiFilter}
                onChange={(e) => setTeamDivisiFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Semua Divisi</option>
                {availableDivisions.map((div) => (
                  <option key={div} value={div}>
                    Divisi: {div}
                  </option>
                ))}
              </select>
            </div>

            {/* Sorting Dropdown */}
            <div className="sm:col-span-4">
              <div className="relative">
                <select
                  value={teamSortBy}
                  onChange={(e) => setTeamSortBy(e.target.value as any)}
                  className="w-full pl-3 pr-7 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="pending_first">📌 Urutkan: Diajukan (Pending) Teratas</option>
                  <option value="date_desc">📅 Tanggal Mulai: Paling Baru (Terbaru)</option>
                  <option value="date_asc">📅 Tanggal Mulai: Paling Dekat (Terdekat)</option>
                  <option value="name_asc">👤 Nama Karyawan: A - Z</option>
                </select>
              </div>
            </div>
          </div>

          {/* LIST KARTU CUTI TIM */}
          {filteredAndSortedTeamCuti.length === 0 ? (
            <div className="text-center py-12 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
              Tidak ada data perijinan cuti yang sesuai dengan pencarian atau filter yang dipilih.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {filteredAndSortedTeamCuti.map((c) => {
                const isProcessing = processingCutiId === c.id;
                return (
                  <div
                    key={c.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#101726] border border-slate-200 dark:border-slate-800/90 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Baris Atas: Nama Staf & Badge Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{c.nama}</span>
                            {c.status === "Diajukan" && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {c.nik} • <span className="text-slate-600 dark:text-slate-300 font-bold">{c.divisi || "Warehouse"}</span>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            c.status === "Disetujui"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : c.status === "Ditolak"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>

                      {/* Periode Cuti & Durasi */}
                      <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                            Jenis Perijinan
                          </span>
                          <span className="font-extrabold text-slate-800 dark:text-slate-200">
                            {c.jenis} ({c.jumlah_hari} Hari)
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                            Rentang Tanggal
                          </span>
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {c.tgl_mulai} <span className="text-slate-400">s/d</span> {c.tgl_selesai}
                          </span>
                        </div>
                      </div>

                      {/* Alasan Pengajuan */}
                      {c.alasan && (
                        <div className="mt-2.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                            Alasan:
                          </span>
                          <p className="italic text-[11px] leading-relaxed">"{c.alasan}"</p>
                        </div>
                      )}

                      {/* Info Approval / Catatan Penolakan */}
                      {c.status === "Disetujui" && c.approved_by && (
                        <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Disetujui oleh: {c.approved_by}</span>
                        </div>
                      )}
                      {c.status === "Ditolak" && c.catatan && (
                        <div className="mt-2 text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Alasan Penolakan: {c.catatan}</span>
                        </div>
                      )}
                    </div>

                    {/* ACTION BUTTONS (Khusus Manager / Admin / Atasan) */}
                    {canApprove && (
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5 flex-wrap">
                        {/* Status Action Buttons */}
                        <div className="flex items-center gap-1.5">
                          {c.status === "Diajukan" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveCuti(c)}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-xs transition cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Setujui</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectCuti(c)}
                                disabled={isProcessing}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Tolak</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleResetCuti(c)}
                              disabled={isProcessing}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                              title="Kembalikan status cuti ke Diajukan"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reset ke Diajukan</span>
                            </button>
                          )}
                        </div>

                        {/* Edit & Delete Action Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingCutiItem({ ...c })}
                            disabled={isProcessing}
                            className="p-1.5 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
                            title="Edit data permohonan cuti"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCuti(c)}
                            disabled={isProcessing}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition cursor-pointer"
                            title="Hapus permanen data cuti"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL EDIT DATA CUTI ================= */}
      {editingCutiItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-500">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Edit Permohonan Cuti
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {editingCutiItem.nama} ({editingCutiItem.nik})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCutiItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCuti} className="space-y-3 pt-3 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                  Jenis Perijinan
                </label>
                <select
                  value={editingCutiItem.jenis}
                  onChange={(e) =>
                    setEditingCutiItem((prev) => (prev ? { ...prev, jenis: e.target.value } : null))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white font-extrabold"
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
                    required
                    value={editingCutiItem.tgl_mulai}
                    onChange={(e) =>
                      setEditingCutiItem((prev) =>
                        prev ? { ...prev, tgl_mulai: e.target.value } : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    required
                    value={editingCutiItem.tgl_selesai}
                    onChange={(e) =>
                      setEditingCutiItem((prev) =>
                        prev ? { ...prev, tgl_selesai: e.target.value } : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between font-bold">
                <span className="text-slate-500">Jumlah Hari Terhitung:</span>
                <span className="text-primary-600 dark:text-primary-400 font-black text-sm">
                  {calculateCutiDays(editingCutiItem.tgl_mulai, editingCutiItem.tgl_selesai)} Hari
                </span>
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">
                  Alasan Permohonan
                </label>
                <textarea
                  required
                  rows={3}
                  value={editingCutiItem.alasan}
                  onChange={(e) =>
                    setEditingCutiItem((prev) =>
                      prev ? { ...prev, alasan: e.target.value } : null
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
                ></textarea>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCutiItem(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEditCuti}
                  className="flex-1 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-bold shadow-md shadow-primary-500/20 cursor-pointer disabled:opacity-50"
                >
                  {savingEditCuti ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};