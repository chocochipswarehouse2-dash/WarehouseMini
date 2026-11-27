import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { NumberInput } from '../common/NumberInput';
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
  Eye,
  EyeOff,
  Info,
  Wallet,
  Send,
  Lock,
  Unlock,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
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
  submitPresensiRecord,
  saveRosterShift,
} from '../../services/supabase';
import {
  fetchPublishedPayslipsForPeriod,
  publishPayslipsForPeriod,
  unpublishPayslipsForPeriod,
  PublishedPayslipPeriodDoc,
} from '../../services/hrPayslipService';
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
import { calculateKpiAbsensiBatch } from '../../utils/kpiCalculator';
import { getUserPersonName } from '../../utils/userResolver';
import {
  buildDetailedHrReport,
  exportHrReportToXlsx,
  exportHrReportToCsv,
  evaluatePresensiForAudit,
  SummaryKaryawanRow,
} from '../../utils/hrExportUtils';
import {
  INDONESIAN_MONTHS,
  getActivePayrollPeriod,
  getPayrollPeriodByMonthKey,
  getPreviousPayrollPeriod,
  detectMatchingPayrollPeriod,
  formatLocalIsoDate,
  calculateMonthlyPayroll,
  exportMonthlyPayrollToXlsx,
  BolosDeductionMode,
  EmployeeMonthlyPayrollRow,
  PayrollAbsenceDetailItem,
} from '../../utils/hrPayrollUtils';

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
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<SummaryKaryawanRow | null>(null);
  const [selectedPayrollSlipNik, setSelectedPayrollSlipNik] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | number | null>(null);

  // Siklus periode administrasi & gaji: Tgl 26 bulan sebelumnya s/d Tgl 25 bulan berjalan
  const initialPayrollPeriod = useMemo(() => getActivePayrollPeriod(), []);
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState<string>(initialPayrollPeriod.monthKey);
  const [payrollYearDraft, setPayrollYearDraft] = useState<string>(String(initialPayrollPeriod.year));
  const [startDate, setStartDate] = useState<string>(initialPayrollPeriod.startDate);
  const [endDate, setEndDate] = useState<string>(initialPayrollPeriod.endDate);

  // Pengaturan kalkulasi gaji bulanan sesuai aturan gudang
  const [potonganBolosMode, setPotonganBolosMode] = useState<BolosDeductionMode>('proporsional');
  const [potonganBolosNominal, setPotonganBolosNominal] = useState<number>(100000);
  const [potonganTidakAbsenPulangNominal, setPotonganTidakAbsenPulangNominal] = useState<number>(10000);
  const [potongGajiCutiIzinSakit, setPotongGajiCutiIzinSakit] = useState<boolean>(true);
  const [toleransiTerlambatMenit, setToleransiTerlambatMenit] = useState<number>(30);
  const [potonganTerlambatPerKejadian, setPotonganTerlambatPerKejadian] = useState<number>(5000);
  const [sertakanPotonganKasbon, setSertakanPotonganKasbon] = useState<boolean>(false);
  const [showSalaryNumbers, setShowSalaryNumbers] = useState<boolean>(true);

  // Publish Slip Gaji (Supabase Cloud Visibility Control)
  const [publishedPeriodDoc, setPublishedPeriodDoc] = useState<PublishedPayslipPeriodDoc | null>(null);
  const [loadingPublishState, setLoadingPublishState] = useState<boolean>(false);
  const [publishingPayslips, setPublishingPayslips] = useState<boolean>(false);

  // Inline Edit Absensi Ketidakhadiran di dalam Slip Gaji
  const [editingAbsenceItem, setEditingAbsenceItem] = useState<PayrollAbsenceDetailItem | null>(null);
  const [absEditStatus, setAbsEditStatus] = useState<'Hadir' | 'Libur' | 'Sakit' | 'Izin' | 'Cuti' | 'Alpha'>('Hadir');
  const [absEditShift, setAbsEditShift] = useState<string>('Shift 1');
  const [absEditJamMasuk, setAbsEditJamMasuk] = useState<string>('08:00');
  const [absEditJamPulang, setAbsEditJamPulang] = useState<string>('17:00');
  const [absEditCatatan, setAbsEditCatatan] = useState<string>('');
  const [savingAbsenceEdit, setSavingAbsenceEdit] = useState<boolean>(false);

  const [selectedNik, setSelectedNik] = useState<string>('ALL');
  const [selectedDivisi, setSelectedDivisi] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [presensiShiftFilter, setPresensiShiftFilter] = useState<string>('ALL');
  const [presensiStatusFilter, setPresensiStatusFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'ringkasan' | 'gaji' | 'kpi' | 'lembur' | 'cuti' | 'absensi'>('ringkasan');
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
        fetchLemburRecords(undefined, startDate, endDate),
        fetchCutiRecords(undefined, startDate, endDate),
        fetchRosterShiftList(undefined, startDate, endDate),
        fetchIzinPulangAwalList(undefined, startDate, endDate),
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

  // Deteksi apakah rentang tanggal saat ini cocok dengan siklus cut-off 26–25
  const matchingPayrollPeriod = useMemo(
    () => detectMatchingPayrollPeriod(startDate, endDate),
    [startDate, endDate]
  );

  const [selectedPayrollYear, selectedPayrollMonthNum] = useMemo(() => {
    const parts = (selectedPayrollMonth || '').split('-').map(Number);
    const fallbackYear = new Date().getFullYear();
    const fallbackMonth = new Date().getMonth() + 1;
    if (
      parts.length === 2 &&
      Number.isFinite(parts[0]) &&
      Number.isFinite(parts[1]) &&
      parts[1] >= 1 &&
      parts[1] <= 12
    ) {
      return [parts[0], parts[1]];
    }
    return [fallbackYear, fallbackMonth];
  }, [selectedPayrollMonth]);

  useEffect(() => {
    setPayrollYearDraft(String(selectedPayrollYear));
  }, [selectedPayrollYear]);

  const handleSelectPayrollMonth = (monthKey: string) => {
    if (!monthKey) return;
    const period = getPayrollPeriodByMonthKey(monthKey);
    setSelectedPayrollMonth(period.monthKey);
    setPayrollYearDraft(String(period.year));
    setStartDate(period.startDate);
    setEndDate(period.endDate);
  };

  const handleStepPayrollMonth = (deltaMonths: number) => {
    const nextDate = new Date(selectedPayrollYear, selectedPayrollMonthNum - 1 + deltaMonths, 1);
    const nextKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    handleSelectPayrollMonth(nextKey);
  };

  const handlePayrollYearInputChange = (rawVal: string) => {
    const cleanDigits = rawVal.replace(/\D/g, '').slice(0, 4);
    setPayrollYearDraft(cleanDigits);
    if (cleanDigits.length === 4) {
      const parsedYear = Number(cleanDigits);
      if (parsedYear >= 2000 && parsedYear <= 2100) {
        handleSelectPayrollMonth(
          `${parsedYear}-${String(selectedPayrollMonthNum).padStart(2, '0')}`
        );
      }
    }
  };

  // Set Date Range Presets (Mengikuti siklus administrasi karyawan Tgl 26 bulan lalu - Tgl 25 bulan berjalan)
  const setDatePreset = (preset: 'today' | 'this_month' | 'last_month' | 'all') => {
    const today = new Date();
    if (preset === 'today') {
      const d = formatLocalIsoDate(today);
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'this_month') {
      const activePeriod = getActivePayrollPeriod(today);
      setSelectedPayrollMonth(activePeriod.monthKey);
      setStartDate(activePeriod.startDate);
      setEndDate(activePeriod.endDate);
    } else if (preset === 'last_month') {
      const prevPeriod = getPreviousPayrollPeriod(today);
      setSelectedPayrollMonth(prevPeriod.monthKey);
      setStartDate(prevPeriod.startDate);
      setEndDate(prevPeriod.endDate);
    } else if (preset === 'all') {
      const y = today.getFullYear();
      setStartDate(`${y - 1}-12-26`);
      setEndDate(`${y}-12-25`);
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

  const presensiShiftOptions = useMemo(() => {
    const set = new Set<string>();
    presensiList.forEach((p) => {
      if (p.shift && p.shift.trim()) set.add(p.shift.trim());
    });
    return Array.from(set).sort();
  }, [presensiList]);

  // Presensi Filtered
  const filteredPresensi = useMemo(() => {
    return presensiList.filter((p) => {
      if (p.tanggal < startDate || p.tanggal > endDate) return false;
      if (selectedNik !== 'ALL' && p.nik !== selectedNik) return false;
      if (selectedDivisi !== 'ALL') {
        const k = karyawanList.find((item) => item.nik === p.nik);
        if (k?.divisi !== selectedDivisi) return false;
      }
      if (presensiShiftFilter !== 'ALL' && (p.shift || '').toLowerCase() !== presensiShiftFilter.toLowerCase()) {
        return false;
      }
      const evalRes = evaluatePresensiForAudit(p);
      if (presensiStatusFilter !== 'ALL') {
        if (presensiStatusFilter === 'BOLOS_SEMUA') {
          if (!evalRes.isBolosTidakAbsenPulang && !evalRes.isBolosTidakAbsenDatang) return false;
        } else if (presensiStatusFilter === 'BOLOS_TIDAK_PULANG' || presensiStatusFilter === 'BELUM_PULANG') {
          if (!evalRes.isBolosTidakAbsenPulang) return false;
        } else if (presensiStatusFilter === 'BOLOS_TIDAK_DATANG') {
          if (!evalRes.isBolosTidakAbsenDatang) return false;
        } else if (
          (p.status || '').toLowerCase() !== presensiStatusFilter.toLowerCase() &&
          evalRes.auditStatusLabel.toLowerCase() !== presensiStatusFilter.toLowerCase()
        ) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const resolvedName =
          p.nama && p.nama.trim().toLowerCase() !== String(p.nik || '').trim().toLowerCase()
            ? p.nama
            : getUserPersonName(p.nik, p.nama || p.nik);
        const matchNama = (resolvedName || '').toLowerCase().includes(q);
        const matchNik = String(p.nik || '').toLowerCase().includes(q);
        const matchShift = String(p.shift || '').toLowerCase().includes(q);
        const matchStatus =
          String(p.status || '').toLowerCase().includes(q) ||
          evalRes.auditStatusLabel.toLowerCase().includes(q);
        const matchCatatan = String(p.catatan || '').toLowerCase().includes(q);
        const matchTanggal = String(p.tanggal || '').toLowerCase().includes(q);
        if (!matchNama && !matchNik && !matchShift && !matchStatus && !matchCatatan && !matchTanggal) {
          return false;
        }
      }
      return true;
    });
  }, [presensiList, startDate, endDate, selectedNik, selectedDivisi, presensiShiftFilter, presensiStatusFilter, searchQuery, karyawanList]);

  // Rekap Per Karyawan Aggregation with Leave, Absence (Bolos) & Overtime
  const detailedReport = useMemo(() => {
    return buildDetailedHrReport({
      karyawanList: filteredKaryawan,
      presensiList,
      rosterList,
      lemburList,
      cutiList,
      startDate,
      endDate,
    });
  }, [filteredKaryawan, presensiList, rosterList, lemburList, cutiList, startDate, endDate]);

  const summaryPerKaryawan = detailedReport.summaryRows;

  // KPI Summary Evaluation across filtered period (O(N+M) batch)
  const kpiBatchMap = useMemo(() => {
    return calculateKpiAbsensiBatch({
      karyawanList: filteredKaryawan,
      presensiList,
      rosterList,
      lemburList,
      cutiList,
      izinPulangAwalList: izinPulangList,
      startDate,
      endDate,
    });
  }, [filteredKaryawan, presensiList, rosterList, lemburList, cutiList, izinPulangList, startDate, endDate]);

  const kpiSummaryList = useMemo(() => {
    const list: KpiAbsensiSummary[] = [];
    for (const k of filteredKaryawan) {
      const kpi = kpiBatchMap[k.nik];
      if (kpi) list.push(kpi);
    }
    list.sort(
      (a, b) =>
        b.nilaiKpiAbsensi - a.nilaiKpiAbsensi ||
        b.persenKehadiran - a.persenKehadiran ||
        a.totalAlpha - b.totalAlpha ||
        a.totalCutiIzin - b.totalCutiIzin ||
        b.totalHadir - a.totalHadir
    );
    return list;
  }, [filteredKaryawan, kpiBatchMap]);

  // Kalkulasi Gaji Bulanan (Siklus Periode 26 Bulan Lalu – 25 Bulan Berjalan; Jadwal Shift Tetap 1 – Akhir Bulan)
  const monthlyPayroll = useMemo(() => {
    return calculateMonthlyPayroll({
      monthKey: matchingPayrollPeriod?.monthKey || selectedPayrollMonth,
      startDateOverride: startDate,
      endDateOverride: endDate,
      karyawanList: filteredKaryawan,
      presensiList,
      rosterList,
      lemburList,
      cutiList,
      izinPulangAwalList: izinPulangList,
      config: {
        potonganBolosMode,
        potonganBolosNominal,
        potonganTidakAbsenPulangNominal,
        potongGajiCutiIzinSakit,
        toleransiTerlambatMenit,
        potonganTerlambatPerKejadian,
        sertakanPotonganKasbon,
      },
    });
  }, [
    matchingPayrollPeriod,
    selectedPayrollMonth,
    startDate,
    endDate,
    filteredKaryawan,
    presensiList,
    rosterList,
    lemburList,
    cutiList,
    izinPulangList,
    potonganBolosMode,
    potonganBolosNominal,
    potonganTidakAbsenPulangNominal,
    potongGajiCutiIzinSakit,
    toleransiTerlambatMenit,
    potonganTerlambatPerKejadian,
    sertakanPotonganKasbon,
  ]);

  const selectedPayrollSlip: EmployeeMonthlyPayrollRow | null = useMemo(() => {
    if (!selectedPayrollSlipNik) return null;
    const key = selectedPayrollSlipNik.trim().toUpperCase();
    return monthlyPayroll.rows.find((r) => (r.nik || '').trim().toUpperCase() === key) || null;
  }, [selectedPayrollSlipNik, monthlyPayroll.rows]);

  const loadPublishedStatus = useCallback(
    async (forceRefresh = false) => {
      if (!monthlyPayroll.period.monthKey) return;
      setLoadingPublishState(true);
      try {
        const doc = await fetchPublishedPayslipsForPeriod(monthlyPayroll.period.monthKey, forceRefresh);
        setPublishedPeriodDoc(doc);
      } catch {
        setPublishedPeriodDoc(null);
      } finally {
        setLoadingPublishState(false);
      }
    },
    [monthlyPayroll.period.monthKey]
  );

  useEffect(() => {
    if (activeTab === 'gaji' || selectedPayrollSlipNik) {
      loadPublishedStatus(false);
    }
  }, [activeTab, selectedPayrollSlipNik, loadPublishedStatus]);

  const handlePublishAllPayslips = async () => {
    if (!isAdmin) {
      onShowToast('Akses ditolak: Hanya HR / Admin yang dapat mempublikasikan slip gaji.', 'warning');
      return;
    }
    if (monthlyPayroll.rows.length === 0) {
      onShowToast('Tidak ada data karyawan pada periode ini.', 'warning');
      return;
    }
    const ok = window.confirm(
      `Publish Slip Gaji Periode ${monthlyPayroll.period.label} (${monthlyPayroll.period.rangeLabel}) untuk ${monthlyPayroll.rows.length} karyawan?\n\n` +
        `Setelah di-publish, masing-masing karyawan dapat melihat slip gaji miliknya sendiri di menu Presensi -> Tab "Slip Gaji".`
    );
    if (!ok) return;

    setPublishingPayslips(true);
    try {
      const updated = await publishPayslipsForPeriod({
        period: monthlyPayroll.period,
        rows: monthlyPayroll.rows,
        publishedBy: session?.name || session?.username || 'HR Admin',
      });
      setPublishedPeriodDoc(updated);
      playSuccessBeep();
      onShowToast(
        `Slip gaji periode ${monthlyPayroll.period.label} (${monthlyPayroll.rows.length} karyawan) resmi dipublikasikan!`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal publish slip gaji:', err);
      playErrorBeep();
      onShowToast(err?.message || 'Gagal mempublikasikan slip gaji.', 'error');
    } finally {
      setPublishingPayslips(false);
    }
  };

  const handleUnpublishAllPayslips = async () => {
    if (!isAdmin) return;
    const ok = window.confirm(
      `Tarik kembali (Unpublish) seluruh slip gaji periode ${monthlyPayroll.period.label}?\n\nKaryawan tidak akan bisa melihat slip gaji periode ini sampai Anda klik Publish kembali.`
    );
    if (!ok) return;

    setPublishingPayslips(true);
    try {
      await unpublishPayslipsForPeriod({
        monthKey: monthlyPayroll.period.monthKey,
        updatedBy: session?.name || session?.username || 'HR Admin',
      });
      setPublishedPeriodDoc(null);
      onShowToast(`Publikasi slip gaji periode ${monthlyPayroll.period.label} berhasil ditarik.`, 'info');
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal menarik publikasi slip gaji.', 'error');
    } finally {
      setPublishingPayslips(false);
    }
  };

  const handleToggleSinglePayslipPublish = async (row: EmployeeMonthlyPayrollRow) => {
    if (!isAdmin) return;
    const nikKey = (row.nik || '').trim().toUpperCase();
    const isAlreadyPublished = Boolean(publishedPeriodDoc?.slipsByNik?.[nikKey]);
    setPublishingPayslips(true);
    try {
      if (isAlreadyPublished) {
        const updated = await unpublishPayslipsForPeriod({
          monthKey: monthlyPayroll.period.monthKey,
          targetNik: nikKey,
          updatedBy: session?.name || session?.username || 'HR Admin',
        });
        setPublishedPeriodDoc(updated);
        onShowToast(`Slip gaji ${row.nama} ditarik dari tampilan karyawan.`, 'info');
      } else {
        const updated = await publishPayslipsForPeriod({
          period: monthlyPayroll.period,
          rows: [row],
          publishedBy: session?.name || session?.username || 'HR Admin',
          mergeExisting: true,
        });
        setPublishedPeriodDoc(updated);
        playSuccessBeep();
        onShowToast(`Slip gaji ${row.nama} (${monthlyPayroll.period.label}) dipublikasikan!`, 'success');
      }
    } catch (err: any) {
      playErrorBeep();
      onShowToast(err?.message || 'Gagal mengubah status publikasi slip gaji.', 'error');
    } finally {
      setPublishingPayslips(false);
    }
  };

  const handleStartEditAbsenceItem = (item: PayrollAbsenceDetailItem) => {
    setEditingAbsenceItem(item);
    if (item.tipe === 'TIDAK_ABSEN_PULANG') setAbsEditStatus('Hadir');
    else if (item.tipe === 'SAKIT') setAbsEditStatus('Sakit');
    else if (item.tipe === 'IZIN') setAbsEditStatus('Izin');
    else if (item.tipe === 'CUTI') setAbsEditStatus('Cuti');
    else setAbsEditStatus('Hadir');

    const rawShift = item.shiftJadwal || 'Shift 1';
    const isSpecialShift = ['libur', 'off', 'sakit', 'skt', 'izin', 'ijin', 'ijn', 'cuti', 'cti', 'bolos', 'alpha'].some((k) =>
      rawShift.toLowerCase().includes(k)
    );
    const defaultWorkShift = isSpecialShift ? 'Shift 1' : rawShift;
    setAbsEditShift(defaultWorkShift);

    const sLow = defaultWorkShift.toLowerCase();
    const defaultStart = sLow.includes('3b')
      ? '11:00'
      : sLow.includes('3')
      ? '12:00'
      : sLow.includes('2')
      ? '09:00'
      : '08:00';
    const defaultEnd = sLow.includes('3b')
      ? '20:00'
      : sLow.includes('3')
      ? '21:00'
      : sLow.includes('2')
      ? '18:00'
      : '17:00';

    setAbsEditJamMasuk(item.jamMasuk ? item.jamMasuk.slice(0, 5) : defaultStart);
    setAbsEditJamPulang(item.jamPulang ? item.jamPulang.slice(0, 5) : defaultEnd);
    setAbsEditCatatan(item.alasan && !item.alasan.startsWith('Tidak ada absen') ? item.alasan : 'Koreksi absensi oleh HR');
  };

  const handleSaveAbsenceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayrollSlip || !editingAbsenceItem) return;
    if (!isAdmin) {
      onShowToast('Akses ditolak: Hanya HR / Admin yang dapat mengedit absensi.', 'warning');
      return;
    }

    setSavingAbsenceEdit(true);
    try {
      const nik = (selectedPayrollSlip.nik || '').trim().toUpperCase();
      const tanggal = editingAbsenceItem.tanggal;
      const isHadir = absEditStatus === 'Hadir';
      const cleanJamMasuk = isHadir && absEditJamMasuk ? (absEditJamMasuk.length === 5 ? `${absEditJamMasuk}:00` : absEditJamMasuk) : null;
      const cleanJamPulang = isHadir && absEditJamPulang ? (absEditJamPulang.length === 5 ? `${absEditJamPulang}:00` : absEditJamPulang) : null;

      if (editingAbsenceItem.presensiId) {
        const res = await updatePresensiRecord(editingAbsenceItem.presensiId, {
          status: absEditStatus,
          shift: isHadir ? absEditShift : absEditStatus,
          jam_masuk: cleanJamMasuk as any,
          jam_pulang: cleanJamPulang as any,
          catatan: absEditCatatan || null,
        });
        if (!res.success) {
          throw new Error(res.error || 'Gagal memperbarui catatan presensi.');
        }
      } else {
        await submitPresensiRecord({
          nik,
          tanggal,
          shift: isHadir ? absEditShift : absEditStatus,
          status: absEditStatus,
          jam_masuk: cleanJamMasuk || undefined,
          jam_pulang: cleanJamPulang || undefined,
          catatan: absEditCatatan || `Koreksi HR (${absEditStatus})`,
        });
      }

      // Sinkronkan juga jadwal Roster pada tanggal tersebut agar status Libur / Sakit / Cuti / Hadir konsisten
      if (absEditStatus === 'Libur' || absEditStatus === 'Sakit' || absEditStatus === 'Izin' || absEditStatus === 'Cuti' || absEditStatus === 'Alpha') {
        await saveRosterShift({
          nik,
          nama: selectedPayrollSlip.nama,
          tanggal,
          shift: absEditStatus === 'Alpha' ? 'Bolos' : absEditStatus,
          jam_masuk: '',
          jam_pulang: '',
          keterangan: absEditCatatan || `Diubah HR (${absEditStatus})`,
        }).catch(() => {});
      } else if (isHadir && editingAbsenceItem.rosterId) {
        // Pastikan roster kembali ke shift kerja normal jika sebelumnya Libur/SKT/BOLOS
        const sLow = absEditShift.toLowerCase();
        const jm = sLow.includes('3b') ? '11:00' : sLow.includes('3') ? '12:00' : sLow.includes('2') ? '09:00' : '08:00';
        const jp = sLow.includes('3b') ? '20:00' : sLow.includes('3') ? '21:00' : sLow.includes('2') ? '18:00' : '17:00';
        await saveRosterShift({
          nik,
          nama: selectedPayrollSlip.nama,
          tanggal,
          shift: absEditShift,
          jam_masuk: jm,
          jam_pulang: jp,
          keterangan: absEditCatatan || 'Koreksi hadir oleh HR',
        }).catch(() => {});
      }

      await loadData();
      setEditingAbsenceItem(null);
      playSuccessBeep();
      onShowToast(`Absensi ${selectedPayrollSlip.nama} tanggal ${tanggal} diubah ke "${absEditStatus}". Gaji otomatis dihitung ulang!`, 'success');
    } catch (err: any) {
      console.error('Error save absence edit:', err);
      playErrorBeep();
      onShowToast(err?.message || 'Gagal menyimpan koreksi absensi.', 'error');
    } finally {
      setSavingAbsenceEdit(false);
    }
  };

  // Grand Totals
  const grandTotals = useMemo(() => {
    let jamLembur = 0;
    let uangLembur = 0;
    let hadir = 0;
    let terlambat = 0;
    let cuti = 0;
    let tidakMasuk = 0;
    let bolos = 0;
    let bolosTidakAbsenPulang = 0;
    let bolosTidakAbsenDatang = 0;

    summaryPerKaryawan.forEach((s) => {
      jamLembur += s.totalJamLembur;
      uangLembur += s.totalUangLembur;
      hadir += s.totalHadir;
      terlambat += s.totalTerlambat;
      cuti += s.totalHariCuti;
      tidakMasuk += s.totalTidakMasuk;
      bolos += s.totalHariBolos;
      bolosTidakAbsenPulang += s.totalBolosTidakAbsenPulang || 0;
      bolosTidakAbsenDatang += s.totalBolosTidakAbsenDatang || 0;
    });

    return {
      jamLembur,
      uangLembur,
      hadir,
      terlambat,
      cuti,
      tidakMasuk,
      bolos,
      bolosTidakAbsenPulang,
      bolosTidakAbsenDatang,
    };
  }, [summaryPerKaryawan]);

  // Export to Excel XLSX (Multi-sheet with neat table formatting)
  const exportToXLSX = () => {
    if (activeTab === 'gaji') {
      if (monthlyPayroll.rows.length === 0) {
        onShowToast('Tidak ada data karyawan untuk kalkulasi gaji.', 'warning');
        return;
      }
      try {
        exportMonthlyPayrollToXlsx(monthlyPayroll);
        onShowToast(
          `File Excel (.xlsx) Kalkulasi Gaji Periode ${monthlyPayroll.period.label} berhasil diunduh!`,
          'success'
        );
      } catch (err: any) {
        console.error('Error export payroll XLSX:', err);
        onShowToast('Gagal mengekspor Excel gaji: ' + (err?.message || 'Error'), 'error');
      }
      return;
    }

    if (summaryPerKaryawan.length === 0) {
      onShowToast('Tidak ada data karyawan untuk diekspor.', 'warning');
      return;
    }
    try {
      exportHrReportToXlsx({
        data: detailedReport,
        startDate,
        endDate,
        periodLabel: matchingPayrollPeriod?.label,
      });
      onShowToast('File Excel (.xlsx) Rekap Karyawan berhasil diunduh!', 'success');
    } catch (err: any) {
      console.error('Error export XLSX:', err);
      onShowToast('Gagal mengekspor file Excel: ' + (err?.message || 'Error'), 'error');
    }
  };

  // Export CSV Helper
  const exportToCSV = () => {
    if (summaryPerKaryawan.length === 0) {
      onShowToast('Tidak ada data untuk diekspor.', 'warning');
      return;
    }

    if (activeTab === 'ringkasan') {
      try {
        exportHrReportToCsv({
          data: detailedReport,
          startDate,
          endDate,
          periodLabel: matchingPayrollPeriod?.label,
        });
        onShowToast('File CSV Rekap Lengkap berhasil diunduh!', 'success');
      } catch (err: any) {
        console.error('Error export CSV:', err);
        onShowToast('Gagal mengekspor CSV: ' + (err?.message || 'Error'), 'error');
      }
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    const periodeHeader = matchingPayrollPeriod
      ? `Periode ${matchingPayrollPeriod.label} (${startDate} s/d ${endDate})`
      : `${startDate} s/d ${endDate}`;
    csvContent += `REKAPITULASI KARYAWAN & ABSENSI (${periodeHeader})\n\n`;

    if (activeTab === 'gaji') {
      csvContent += 'No,NIK,Nama,Divisi,Periode,Rentang,Jadwal,Hadir,Cuti,Bolos,Terlambat,Lembur (Jam),Gaji Pokok,Tunjangan,Uang Lembur,Pendapatan Kotor,Potongan Bolos,Potongan Terlambat,Potongan Kasbon,Total Potongan,Gaji Bersih\n';
      monthlyPayroll.rows.forEach((r) => {
        csvContent += `${r.no},"${r.nik}","${r.nama}","${r.divisi}","${r.payrollPeriodLabel}","${r.startDate} s/d ${r.endDate}",${r.totalJadwalKerja},${r.totalHadir},${r.totalHariCuti},${r.totalHariBolos},${r.totalTerlambat},${r.totalJamLembur},${r.gajiPokok},${r.tunjangan},${r.uangLembur},${r.totalPendapatanKotor},${r.potonganBolos},${r.potonganTerlambat},${r.potonganKasbon},${r.totalPotongan},${r.gajiBersih}\n`;
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
    <div className="p-2 sm:p-3 w-full max-w-full space-y-3 pb-24 text-slate-800 dark:text-slate-100">
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
            className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
          <button
            onClick={exportToXLSX}
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-extrabold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25 transition-all cursor-pointer"
            title="Download file Excel .xlsx dengan tabel rapi, multi-sheet, format kolom & data lengkap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel (.xlsx) Rapi</span>
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-2.5 text-xs font-bold rounded-xl bg-primary-500 hover:bg-primary-600 text-white shadow-md shadow-primary-500/20 transition-colors cursor-pointer"
            title="Download file CSV rekapitulasi data"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-primary-500" />
            <span>Filter Periode &amp; Karyawan</span>
            {matchingPayrollPeriod ? (
              <span className="normal-case font-bold text-[11px] px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60">
                Periode {matchingPayrollPeriod.label} ({matchingPayrollPeriod.shortRangeLabel})
              </span>
            ) : (
              <span className="normal-case font-mono font-bold text-[11px] px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Rentang Kustom: {startDate} s/d {endDate}
              </span>
            )}
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
              title={`Siklus 26–25 aktif: ${initialPayrollPeriod.label} (${initialPayrollPeriod.shortRangeLabel})`}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary-500 hover:text-white transition-all cursor-pointer"
            >
              Periode Ini (26–25)
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('last_month')}
              title="Siklus 26–25 periode sebelumnya"
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary-500 hover:text-white transition-all cursor-pointer"
            >
              Periode Lalu (26–25)
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 hover:bg-primary-500 hover:text-white transition-all cursor-pointer"
            >
              Semua Periode ({new Date().getFullYear()})
            </button>
          </div>
        </div>

        {/* Info Siklus Cut-Off 26-25 vs Jadwal Shift 1-Akhir Bulan */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
          <div className="flex items-start sm:items-center gap-2">
            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong>Siklus Administrasi &amp; Gaji:</strong> Tgl <strong>26 bulan sebelumnya</strong> s/d Tgl <strong>25 bulan berjalan</strong> (contoh: 26 Okt – 25 Nov = <strong>November</strong>). Jadwal Shift (Roster) tetap <strong>Tgl 1 – Akhir Bulan</strong>.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          {/* Pemilih Periode Bulan (Nama Bulan Saja) & Tahun Terpisah */}
          <div className="sm:col-span-2 lg:col-span-2">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-8">
                <label className="block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                  Periode Bulan (26–25)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleStepPayrollMonth(-1)}
                    title="Bulan Sebelumnya"
                    className="p-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <select
                    aria-label="Pilih Bulan Periode"
                    value={selectedPayrollMonthNum}
                    onChange={(e) => {
                      const m = Number(e.target.value) || 1;
                      handleSelectPayrollMonth(
                        `${selectedPayrollYear}-${String(m).padStart(2, '0')}`
                      );
                    }}
                    className="w-full min-w-0 px-2.5 py-2 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {INDONESIAN_MONTHS.map((mName, idx) => (
                      <option key={mName} value={idx + 1}>
                        {mName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleStepPayrollMonth(1)}
                    title="Bulan Berikutnya"
                    className="p-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer shrink-0"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="col-span-4">
                <label className="block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                  Tahun
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  aria-label="Tahun Periode"
                  value={payrollYearDraft}
                  onChange={(e) => handlePayrollYearInputChange(e.target.value)}
                  onBlur={() => setPayrollYearDraft(String(selectedPayrollYear))}
                  placeholder={String(new Date().getFullYear())}
                  className="w-full px-2.5 py-2 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 font-bold font-mono text-center text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Tanggal Mulai */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 mb-1">
              Dari Tanggal
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
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
          <div className="text-[10px] text-slate-400 mt-0.5">Total hari absen</div>
        </div>

        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold mb-1">
            <Palmtree className="w-4 h-4 text-teal-500" />
            <span>Cuti / Ijin</span>
          </div>
          <div className="text-2xl font-black text-teal-600 dark:text-teal-400">
            {grandTotals.cuti} <span className="text-xs font-bold">Hari</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Izin/Cuti resmi</div>
        </div>

        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 text-rose-500 text-xs font-bold mb-1">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span>Bolos (Audit)</span>
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
            {grandTotals.bolos} <span className="text-xs font-bold">Hari</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
            {grandTotals.bolosTidakAbsenPulang} Tak Absen Pulang • {grandTotals.bolosTidakAbsenDatang} Tak Datang
          </div>
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
      </div>

      {/* TABS HEADER */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setActiveTab('ringkasan')}
          className={`px-3 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'ringkasan'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Ringkasan Per Karyawan ({summaryPerKaryawan.length})
        </button>
        <button
          onClick={() => setActiveTab('gaji')}
          className={`px-3 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'gaji'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Kalkulasi Gaji ({monthlyPayroll.rows.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('kpi')}
          className={`px-3 py-2.5 text-xs font-extrabold rounded-2xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'kpi'
              ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>KPI &amp; Nilai Absensi ({kpiSummaryList.length})</span>
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

      {/* TAB KALKULASI GAJI BULANAN (SIKLUS 26 BULAN LALU - 25 BULAN BERJALAN) */}
      {activeTab === 'gaji' && (
        <div className="space-y-4">
          {/* Header & Parameter Kalkulasi Gaji */}
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Kalkulasi Gaji Bulanan — Periode {monthlyPayroll.period.label}</span>
                  </h2>
                  {publishedPeriodDoc && Object.keys(publishedPeriodDoc.slipsByNik || {}).length > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <Unlock className="w-3 h-3" />
                      Terpublikasi ({Object.keys(publishedPeriodDoc.slipsByNik).length} Slip)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <Lock className="w-3 h-3" />
                      {loadingPublishState ? 'Mengecek...' : 'Belum Dipublish (Terkunci)'}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Siklus Gaji: <strong className="font-mono text-slate-700 dark:text-slate-200">{monthlyPayroll.period.startDate}</strong> s/d <strong className="font-mono text-slate-700 dark:text-slate-200">{monthlyPayroll.period.endDate}</strong> ({monthlyPayroll.period.rangeLabel}) · Sumber Jadwal Shift kalender 1–akhir bulan ({monthlyPayroll.shiftCalendarMonths.previousMonth.label} &amp; {monthlyPayroll.shiftCalendarMonths.currentMonth.label}).
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowSalaryNumbers((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  {showSalaryNumbers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showSalaryNumbers ? 'Sembunyikan' : 'Tampilkan'}</span>
                </button>
                <button
                  type="button"
                  onClick={exportToXLSX}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Export Excel (.xlsx)</span>
                </button>
                {isAdmin && publishedPeriodDoc && Object.keys(publishedPeriodDoc.slipsByNik || {}).length > 0 && (
                  <button
                    type="button"
                    disabled={publishingPayslips}
                    onClick={handleUnpublishAllPayslips}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
                    title="Tarik kembali agar karyawan tidak dapat melihat slip periode ini"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Tarik Slip</span>
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    disabled={publishingPayslips || monthlyPayroll.rows.length === 0}
                    onClick={handlePublishAllPayslips}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition-colors cursor-pointer"
                    title="Publikasikan slip gaji periode ini agar dapat dilihat oleh masing-masing karyawan"
                  >
                    {publishingPayslips ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>
                      {publishedPeriodDoc && Object.keys(publishedPeriodDoc.slipsByNik || {}).length > 0
                        ? 'Publish Ulang Slip Gaji'
                        : 'Publish Slip Gaji'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Pengaturan Formula Potongan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Potong Tidak Hadir (Tanpa Absen)
                </label>
                <select
                  value={potonganBolosMode}
                  onChange={(e) => setPotonganBolosMode(e.target.value as BolosDeductionMode)}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="proporsional">Proporsional (Gaji ÷ Hari)</option>
                  <option value="nominal">Nominal Tetap / Hari</option>
                  <option value="tanpa_potongan">Tanpa Potongan</option>
                </select>
              </div>

              {potonganBolosMode === 'nominal' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    Nominal Tidak Hadir / Hari (Rp)
                  </label>
                  <NumberInput
                    value={potonganBolosNominal}
                    onValueChange={(val) => setPotonganBolosNominal(Math.max(0, val))}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono font-bold"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Denda Tak Absen Pulang (Rp)
                </label>
                <NumberInput
                  value={potonganTidakAbsenPulangNominal}
                  onValueChange={(val) => setPotonganTidakAbsenPulangNominal(Math.max(0, val))}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Toleransi Telat / Bulan (Mnt)
                </label>
                <NumberInput
                  value={toleransiTerlambatMenit}
                  onValueChange={(val) => setToleransiTerlambatMenit(Math.max(0, val))}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Denda Telat &gt;{toleransiTerlambatMenit}m / Hari (Rp)
                </label>
                <NumberInput
                  value={potonganTerlambatPerKejadian}
                  onValueChange={(val) => setPotonganTerlambatPerKejadian(Math.max(0, val))}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono font-bold"
                />
              </div>

              <div className="flex flex-col justify-end gap-1.5">
                <label className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer select-none">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    Cuti/Izin/Sakit Unpaid
                  </span>
                  <input
                    type="checkbox"
                    checked={potongGajiCutiIzinSakit}
                    onChange={(e) => setPotongGajiCutiIzinSakit(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
                  />
                </label>
                <label className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer select-none">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    Potong Saldo Kasbon
                  </span>
                  <input
                    type="checkbox"
                    checked={sertakanPotonganKasbon}
                    onChange={(e) => setSertakanPotonganKasbon(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* 4 Ringkasan Total Payroll */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Gaji Pokok + Tunjangan
                </span>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                  {showSalaryNumbers
                    ? `Rp ${(monthlyPayroll.totals.totalGajiPokok + monthlyPayroll.totals.totalTunjangan).toLocaleString('id-ID')}`
                    : 'Rp •••••••'}
                </div>
                <span className="text-[10px] text-slate-400">
                  {monthlyPayroll.totals.totalKaryawan} karyawan
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Total Upah Lembur ACC
                </span>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                  {showSalaryNumbers
                    ? `Rp ${monthlyPayroll.totals.totalUangLembur.toLocaleString('id-ID')}`
                    : 'Rp •••••••'}
                </div>
                <span className="text-[10px] text-slate-400">
                  {monthlyPayroll.totals.totalJamLembur} jam disetujui
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Total Potongan
                </span>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
                  {showSalaryNumbers
                    ? `Rp ${monthlyPayroll.totals.totalPotongan.toLocaleString('id-ID')}`
                    : 'Rp •••••••'}
                </div>
                <span className="text-[10px] text-slate-400">
                  {monthlyPayroll.totals.totalTidakHadirTanpaAbsen} tak hadir · {monthlyPayroll.totals.totalHariCutiIzinSakit} cuti/izin/sakit · {monthlyPayroll.totals.totalTidakAbsenPulang} tak pulang · {monthlyPayroll.totals.totalHariTerlambatDipotong}x telat &gt;{toleransiTerlambatMenit}m
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300 block">
                  Total Gaji Bersih (Take-Home)
                </span>
                <div className="text-base sm:text-lg font-black font-mono tabular-nums text-indigo-700 dark:text-indigo-200 mt-1">
                  {showSalaryNumbers
                    ? `Rp ${monthlyPayroll.totals.totalGajiBersih.toLocaleString('id-ID')}`
                    : 'Rp •••••••'}
                </div>
                <span className="text-[10px] text-indigo-600/80 dark:text-indigo-300/80">
                  Periode {monthlyPayroll.period.label}
                </span>
              </div>
            </div>
          </div>

          {/* Tabel Kalkulasi Gaji (Desktop) + Kartu Ringkas (Mobile) */}
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Karyawan</th>
                    <th className="py-2.5 px-3 text-center">Kehadiran (26–25)</th>
                    <th className="py-2.5 px-3 text-right">Gaji Pokok</th>
                    <th className="py-2.5 px-3 text-right">Tunjangan</th>
                    <th className="py-2.5 px-3 text-right">Lembur ACC</th>
                    <th className="py-2.5 px-3 text-right text-rose-500">Potongan</th>
                    <th className="py-2.5 px-3 text-right text-indigo-600 dark:text-indigo-400">Gaji Bersih</th>
                    <th className="py-2.5 px-3 text-center">Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {monthlyPayroll.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Tidak ada data karyawan pada periode ini.
                      </td>
                    </tr>
                  ) : (
                    monthlyPayroll.rows.map((r) => (
                      <tr
                        key={r.nik}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-900 dark:text-white">{r.nama}</span>
                            {r.isProrataKaryawanBaru && (
                              <span
                                title={`Karyawan baru masuk ${r.tglBergabung || '-'}. Pra-Join (${r.praJoinLabel || `${r.totalHariBelumBergabung} hari`}) tidak dihitung Bolos.`}
                                className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                              >
                                Prorata · Join {r.tglBergabung}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {r.nik} · {r.divisi}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="font-bold text-slate-800 dark:text-slate-100 font-mono tabular-nums">
                            {r.totalHariDibayar}/{r.totalJadwalKerja} Dibayar
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Cuti/Izin/Skt: <span className={r.totalHariCutiIzinSakit > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>{r.totalHariCutiIzinSakit}</span> · Tak Hadir:{' '}
                            <span className={r.totalTidakHadirTanpaAbsen > 0 ? 'text-rose-500 font-bold' : ''}>
                              {r.totalTidakHadirTanpaAbsen}
                            </span>
                            {r.totalTidakAbsenPulang > 0 && (
                              <span className="text-amber-600 dark:text-amber-400 font-bold"> · Tak Plg: {r.totalTidakAbsenPulang}x</span>
                            )}{' '}
                            · Telat: {r.totalMenitTerlambat}m
                          </div>
                          {r.totalHariBelumBergabung > 0 && (
                            <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                              Pra-Join: {r.totalHariBelumBergabung} hari (Belum Bergabung)
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                          <div>{showSalaryNumbers ? `Rp ${r.gajiPokok.toLocaleString('id-ID')}` : 'Rp ••••••'}</div>
                          {r.isProrataKaryawanBaru && (
                            <div className="text-[10px] text-indigo-500 font-sans font-semibold">
                              Prorata {r.totalJadwalKerja}/{r.totalHariKerjaPeriodePenuh}h
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          {r.tunjangan > 0
                            ? showSalaryNumbers
                              ? `Rp ${r.tunjangan.toLocaleString('id-ID')}`
                              : 'Rp ••••'
                            : '-'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                            {r.uangLembur > 0
                              ? showSalaryNumbers
                                ? `+Rp ${r.uangLembur.toLocaleString('id-ID')}`
                                : '+Rp ••••'
                              : '-'}
                          </div>
                          {r.totalJamLembur > 0 && (
                            <div className="text-[10px] text-slate-400 font-mono">{r.totalJamLembur} Jam</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                            {r.totalPotongan > 0
                              ? showSalaryNumbers
                                ? `-Rp ${r.totalPotongan.toLocaleString('id-ID')}`
                                : '-Rp ••••'
                              : '-'}
                          </div>
                          {r.totalPotongan > 0 && (
                            <div className="text-[10px] text-slate-400">
                              {[
                                r.potonganTidakAbsenPulang > 0 ? `Tak Plg ${r.totalTidakAbsenPulang}x` : null,
                                r.potonganTidakHadir > 0 ? `Tak Hadir ${r.totalTidakHadirTanpaAbsen}h` : null,
                                r.potonganCutiIzinSakit > 0 ? `Cuti/Skt ${r.totalHariCutiIzinSakit}h` : null,
                                r.potonganTerlambat > 0 ? `Telat ${r.totalHariTerlambatDipotong}x` : null,
                                r.potonganKasbon > 0 ? 'Kasbon' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-indigo-700 dark:text-indigo-300 text-sm">
                          {showSalaryNumbers ? `Rp ${r.gajiBersih.toLocaleString('id-ID')}` : 'Rp •••••••'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAbsenceItem(null);
                              setSelectedPayrollSlipNik(r.nik);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Slip</span>
                            {publishedPeriodDoc?.slipsByNik?.[(r.nik || '').trim().toUpperCase()] && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Sudah dipublish ke karyawan" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Compact List-Table (Zero Horizontal Scroll) */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {monthlyPayroll.rows.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Tidak ada data karyawan pada periode ini.
                </div>
              ) : (
                monthlyPayroll.rows.map((r) => (
                  <div
                    key={r.nik}
                    onClick={() => {
                      setEditingAbsenceItem(null);
                      setSelectedPayrollSlipNik(r.nik);
                    }}
                    className="p-3.5 flex items-center justify-between gap-3 active:bg-slate-50 dark:active:bg-slate-900/50 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                          {r.nama}
                        </span>
                        {r.isProrataKaryawanBaru && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 shrink-0">
                            Prorata · Join {r.tglBergabung}
                          </span>
                        )}
                        {publishedPeriodDoc?.slipsByNik?.[(r.nik || '').trim().toUpperCase()] && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                            Published
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate">
                        {r.nik} · {r.divisi} · Dibayar {r.totalHariDibayar}/{r.totalJadwalKerja}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Tak Hadir: <strong className={r.totalTidakHadirTanpaAbsen > 0 ? 'text-rose-500' : ''}>{r.totalTidakHadirTanpaAbsen}h</strong> · Cuti/Skt: {r.totalHariCutiIzinSakit}h · Tak Plg: {r.totalTidakAbsenPulang}x
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                        {showSalaryNumbers ? `Rp ${r.gajiBersih.toLocaleString('id-ID')}` : 'Rp ••••••'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Detail &amp; Edit →</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

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
                <div className="grid grid-cols-3 gap-1.5 w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                  <div>
                    <span className="text-slate-400 block">Kehadiran</span>
                    <strong className="text-indigo-600 dark:text-indigo-400 font-black">
                      {kpiSummaryList[1].persenKehadiran}% ({kpiSummaryList[1].totalHadir}/{kpiSummaryList[1].totalHariKerja})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Berangkat</span>
                    <strong className="text-emerald-500 font-black">{kpiSummaryList[1].skorBerangkat} pts</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Pulang</span>
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
                <div className="grid grid-cols-3 gap-1.5 w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Kehadiran</span>
                    <strong className="text-indigo-600 dark:text-indigo-400 font-black">
                      {kpiSummaryList[0].persenKehadiran}% ({kpiSummaryList[0].totalHadir}/{kpiSummaryList[0].totalHariKerja})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Berangkat</span>
                    <strong className="text-emerald-500 font-black">{kpiSummaryList[0].skorBerangkat} pts</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Pulang</span>
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
                <div className="grid grid-cols-3 gap-1.5 w-full mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                  <div>
                    <span className="text-slate-400 block">Kehadiran</span>
                    <strong className="text-indigo-600 dark:text-indigo-400 font-black">
                      {kpiSummaryList[2].persenKehadiran}% ({kpiSummaryList[2].totalHadir}/{kpiSummaryList[2].totalHariKerja})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Berangkat</span>
                    <strong className="text-emerald-500 font-black">{kpiSummaryList[2].skorBerangkat} pts</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Pulang</span>
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
                  Nilai dihitung dari rasio kehadiran (40%), kedisiplinan jam datang (35%), jam pulang (25%), minus penalti alpha (-8/hari) &amp; pulang awal tanpa izin (-5/hari).
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
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                Ringkasan Kehadiran, Cuti & Lembur Karyawan
              </h2>
              <span className="text-xs text-slate-400 font-bold">
                Periode: {startDate} s/d {endDate} • {summaryPerKaryawan.length} Karyawan
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportToXLSX}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel (.xlsx) Rapi</span>
              </button>
              <button
                type="button"
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold shadow-sm shadow-primary-500/20 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV Lengkap</span>
              </button>
            </div>
          </div>
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
                  <th className="py-2 px-3 text-center text-primary-600 dark:text-primary-400">
                    Terlambat
                  </th>
                  <th className="py-2 px-3 text-center text-teal-600 dark:text-teal-400">
                    Cuti / Izin
                  </th>
                  <th className="py-2 px-3 text-center text-rose-600 dark:text-rose-400">
                    Bolos
                  </th>
                  <th className="py-2 px-3 text-center text-amber-600 dark:text-amber-400">
                    Total Tidak Masuk
                  </th>
                  <th className="py-2 px-3 text-center text-primary-500">
                    Lembur (Jam)
                  </th>
                  <th className="py-2 px-3 text-right">Est. Upah Lembur</th>
                  <th className="py-2 px-3 text-center">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {summaryPerKaryawan.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      Tidak ada data karyawan yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  summaryPerKaryawan.map((s) => (
                    <tr
                      key={s.nik}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3 px-2">
                        <div className="font-extrabold text-slate-900 dark:text-white">{s.nama}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          NIK: {s.nik}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-1 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                          {s.divisi}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-bold">
                        {s.totalJadwalKerja > 0 ? s.totalJadwalKerja : '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center font-black px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                          {s.totalHadir}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
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
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center font-black px-2.5 py-0.5 rounded-lg ${
                            s.totalHariCuti > 0
                              ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {s.totalHariCuti > 0 ? `${s.totalHariCuti} Hari` : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`inline-flex items-center justify-center font-black px-2.5 py-0.5 rounded-lg ${
                              s.totalHariBolos > 0
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold'
                                : 'text-slate-400'
                            }`}
                          >
                            {s.totalHariBolos > 0 ? `${s.totalHariBolos} Hari` : '-'}
                          </span>
                          {s.totalHariBolos > 0 && (
                            <div className="flex flex-wrap items-center justify-center gap-1 text-[9px] font-bold">
                              {s.totalBolosTidakAbsenPulang > 0 && (
                                <span
                                  className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60"
                                  title="Bolos karena tidak melakukan absen pulang"
                                >
                                  Tak Pulang: {s.totalBolosTidakAbsenPulang}
                                </span>
                              )}
                              {s.totalBolosTidakAbsenDatang > 0 && (
                                <span
                                  className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                                  title="Bolos karena tidak melakukan absen datang"
                                >
                                  Tak Datang: {s.totalBolosTidakAbsenDatang}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center font-black px-2.5 py-0.5 rounded-lg ${
                            s.totalTidakMasuk > 0
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {s.totalTidakMasuk > 0 ? `${s.totalTidakMasuk} Hari` : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-black text-primary-500">
                        {s.totalJamLembur > 0 ? `${s.totalJamLembur} Jam` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {s.totalUangLembur > 0
                          ? `Rp ${s.totalUangLembur.toLocaleString('id-ID')}`
                          : '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedEmployeeDetail(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                          title="Lihat rincian tanggal cuti, tidak masuk, bolos & lembur"
                        >
                          <Eye className="w-3.5 h-3.5 text-primary-500" />
                          <span>Rincian</span>
                        </button>
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
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                Riwayat Presensi Masuk & Pulang Sesuai Filter
              </h2>
              <span className="text-xs text-slate-400 font-bold">{filteredPresensi.length} log presensi ditemukan</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, NIK, shift, catatan..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select
                value={presensiShiftFilter}
                onChange={(e) => setPresensiShiftFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="ALL">Semua Shift</option>
                {presensiShiftOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={presensiStatusFilter}
                onChange={(e) => setPresensiStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="ALL">Semua Status</option>
                <option value="Hadir">Hadir (Lengkap Masuk & Pulang)</option>
                <option value="Tepat Waktu">Tepat Waktu</option>
                <option value="Terlambat">Terlambat</option>
                <option value="BOLOS_SEMUA">Bolos (Semua Audit Bolos)</option>
                <option value="BOLOS_TIDAK_PULANG">Bolos (Tidak Absen Pulang)</option>
                <option value="BOLOS_TIDAK_DATANG">Bolos (Tidak Absen Datang)</option>
                <option value="Izin">Izin</option>
                <option value="Cuti">Cuti</option>
                <option value="Sakit">Sakit</option>
                <option value="Alpha">Alpha</option>
              </select>
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
                  <th className="py-2 px-3 text-center">Status Audit</th>
                  <th className="py-2 px-3">Catatan Absensi (Audit)</th>
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
                  filteredPresensi.map((p, idx) => {
                    const evalRes = evaluatePresensiForAudit(p);
                    const isBolosAudit = evalRes.isBolosTidakAbsenPulang || evalRes.isBolosTidakAbsenDatang;
                    return (
                      <tr
                        key={p.id || idx}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors ${
                          isBolosAudit ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''
                        }`}
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
                        <td className="py-3 px-3 text-center font-mono font-bold">
                          {evalRes.hasMasuk ? (
                            <span className="text-emerald-600 dark:text-emerald-400">{p.jam_masuk}</span>
                          ) : evalRes.isBolosTidakAbsenDatang ? (
                            <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                              Tidak Absen Datang
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          {evalRes.hasPulang ? (
                            <span className="text-slate-700 dark:text-slate-200 font-bold">{p.jam_pulang}</span>
                          ) : evalRes.isBolosTidakAbsenPulang ? (
                            <span
                              className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold"
                              title="Karyawan melakukan tap masuk namun tidak melakukan absen pulang -> Ditandai Bolos (Tidak dihitung masuk kerja)"
                            >
                              Tidak Absen Pulang
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black ${
                                isBolosAudit
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                                  : evalRes.isValidHadir && (p.status === 'Tepat Waktu' || p.status === 'Hadir')
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : evalRes.isValidHadir && p.status === 'Terlambat'
                                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-400'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {evalRes.auditStatusLabel}
                            </span>
                            {evalRes.isBolosTidakAbsenPulang && p.status && (
                              <span className="text-[9px] text-slate-400">
                                Log awal: {p.status} (Tap Masuk {p.jam_masuk})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 text-[11px] truncate max-w-xs" title={p.catatan || ''}>
                          {p.catatan || '-'}
                        </td>
                      {isAdmin && (
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingPresensi(p)}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 transition cursor-pointer"
                              title="Edit Log Presensi"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePresensi(p)}
                              disabled={actionLoadingId === p.id}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-50"
                              title="Hapus Log Presensi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                      </tr>
                    );
                  })
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
                  <NumberInput
                    min={0}
                    step={0.5}
                    allowDecimal
                    value={editingLembur.durasi_jam}
                    selectOnFocus
                    onValueChange={(val) => setEditingLembur({ ...editingLembur, durasi_jam: val })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-bold mb-1">Total Upah Lembur (Rp)</label>
                  <NumberInput
                    min={0}
                    value={editingLembur.total_lembur ?? 0}
                    selectOnFocus
                    onValueChange={(val) => setEditingLembur({ ...editingLembur, total_lembur: val })}
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
                <NumberInput
                  min={1}
                  value={editingCuti.jumlah_hari}
                  selectOnFocus
                  onValueChange={(val) => setEditingCuti({ ...editingCuti, jumlah_hari: Math.max(1, val) })}
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

      {/* MODAL RINCIAN KETIDAKHADIRAN, CUTI & LEMBUR PER KARYAWAN */}
      {selectedEmployeeDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-primary-500/10 text-primary-500">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {selectedEmployeeDetail.nama}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    NIK: <span className="font-mono font-bold">{selectedEmployeeDetail.nik}</span> • Divisi: {selectedEmployeeDetail.divisi} • Periode: {startDate} s/d {endDate}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployeeDetail(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Jadwal & Hadir</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">
                  {selectedEmployeeDetail.totalHadir} / {selectedEmployeeDetail.totalJadwalKerja} Hari
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/40">
                <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 block uppercase">Cuti / Izin</span>
                <span className="text-lg font-black text-teal-700 dark:text-teal-300">
                  {selectedEmployeeDetail.totalHariCuti} Hari
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 block uppercase">Bolos (Audit)</span>
                <span className="text-lg font-black text-rose-700 dark:text-rose-300">
                  {selectedEmployeeDetail.totalHariBolos} Hari
                </span>
                <span className="text-[10px] text-rose-600/80 dark:text-rose-300/80 block mt-0.5">
                  Tak Pulang: {selectedEmployeeDetail.totalBolosTidakAbsenPulang || 0} • Tak Datang: {selectedEmployeeDetail.totalBolosTidakAbsenDatang || 0}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-primary-50 dark:bg-primary-950/30 border border-primary-100 dark:border-primary-900/40">
                <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400 block uppercase">Lembur ACC</span>
                <span className="text-lg font-black text-primary-700 dark:text-primary-300">
                  {selectedEmployeeDetail.totalJamLembur} Jam
                </span>
              </div>
            </div>

            {/* Section 1: Rincian Ketidakhadiran & Cuti */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Palmtree className="w-4 h-4 text-teal-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Rincian Tanggal Tidak Masuk, Cuti & Audit Bolos ({selectedEmployeeDetail.tidakMasukItems.length})
                </h4>
              </div>
              {selectedEmployeeDetail.tidakMasukItems.length === 0 ? (
                <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span>Karyawan ini hadir 100% lengkap (masuk & pulang) pada semua jadwal kerja periode ini.</span>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase text-[10px]">
                        <th className="py-2 px-3">Tanggal</th>
                        <th className="py-2 px-3">Kategori</th>
                        <th className="py-2 px-3">Tap Absensi (Audit)</th>
                        <th className="py-2 px-3">Keterangan / Bukti Audit</th>
                        <th className="py-2 px-3">Shift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {selectedEmployeeDetail.tidakMasukItems.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap font-mono">
                            {item.tanggal}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                                item.isBolos
                                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                                  : 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                              }`}
                            >
                              {item.kategori}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                            {item.isBolos ? (
                              item.jenisBolos === 'TIDAK_ABSEN_PULANG' ? (
                                <div className="flex flex-col">
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    Masuk: {item.jamMasuk || '-'}
                                  </span>
                                  <span className="text-rose-600 dark:text-rose-400 font-bold">
                                    Pulang: Kosong
                                  </span>
                                </div>
                              ) : (
                                <span className="text-rose-600 dark:text-rose-400 font-bold">
                                  Masuk: - | Pulang: -
                                </span>
                              )
                            ) : (
                              <span className="text-teal-600 dark:text-teal-400 font-sans font-bold">
                                Izin/Cuti Resmi
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                            {item.alasan}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                            {item.shiftJadwal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section 2: Rincian Lembur */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Rincian Data Lembur Karyawan ({selectedEmployeeDetail.lemburItems.length})
                </h4>
              </div>
              {selectedEmployeeDetail.lemburItems.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/80 text-slate-500 text-xs font-medium">
                  Tidak ada catatan lembur untuk karyawan ini pada periode terpilih.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-extrabold uppercase text-[10px]">
                        <th className="py-2 px-3">Tanggal</th>
                        <th className="py-2 px-3 text-center">Waktu</th>
                        <th className="py-2 px-3 text-center">Durasi</th>
                        <th className="py-2 px-3">Tugas / Alasan</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3 text-right">Upah (Rp)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {selectedEmployeeDetail.lemburItems.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {item.tanggal}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {item.jamMulai} - {item.jamSelesai}
                          </td>
                          <td className="py-2.5 px-3 text-center font-black text-primary-500">
                            {item.durasiJam} Jam
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                            {item.deskripsi}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                                item.status === 'Disetujui'
                                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold font-mono text-slate-700 dark:text-slate-300">
                            {item.totalLembur > 0 ? `Rp ${item.totalLembur.toLocaleString('id-ID')}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedEmployeeDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RINCIAN SLIP GAJI BULANAN (SIKLUS 26-25) + RINCIAN & EDIT KETIDAKHADIRAN + PUBLISH */}
      {selectedPayrollSlip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Rincian Kalkulasi Gaji · Periode {selectedPayrollSlip.payrollPeriodLabel}
                  </span>
                  {publishedPeriodDoc?.slipsByNik?.[(selectedPayrollSlip.nik || '').trim().toUpperCase()] ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <Check className="w-3 h-3" /> Published ke Karyawan
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <Lock className="w-3 h-3" /> Belum Dipublish
                    </span>
                  )}
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  {selectedPayrollSlip.nama}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {selectedPayrollSlip.nik} · {selectedPayrollSlip.divisi} · {selectedPayrollSlip.startDate} s/d {selectedPayrollSlip.endDate} · Upah Harian: Rp {selectedPayrollSlip.upahHarian.toLocaleString('id-ID')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingAbsenceItem(null);
                  setSelectedPayrollSlipNik(null);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold">Dibayar / Jadwal</div>
                <div className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {selectedPayrollSlip.totalHariDibayar}/{selectedPayrollSlip.totalJadwalKerja}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold">Tak Plg (10rb)</div>
                <div className="text-sm font-black font-mono text-amber-600 dark:text-amber-400">
                  {selectedPayrollSlip.totalTidakAbsenPulang}x
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold">Cuti/Izin/Sakit</div>
                <div className="text-sm font-black font-mono text-teal-600 dark:text-teal-400">
                  {selectedPayrollSlip.totalHariCutiIzinSakit}h
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold">Tak Hadir</div>
                <div className="text-sm font-black font-mono text-rose-600 dark:text-rose-400">
                  {selectedPayrollSlip.totalTidakHadirTanpaAbsen}h
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1">
                <div className="text-[10px] text-slate-400 font-bold">Telat (Bln)</div>
                <div className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">
                  {selectedPayrollSlip.totalMenitTerlambat}m
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              {selectedPayrollSlip.isProrataKaryawanBaru && (
                <div className="p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 text-[11px] text-indigo-900 dark:text-indigo-200 space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>Karyawan Baru · Perhitungan Gaji Prorata (Join: {selectedPayrollSlip.tglBergabung})</span>
                  </div>
                  <p>
                    Tanggal <strong>{selectedPayrollSlip.praJoinLabel || `${selectedPayrollSlip.totalHariBelumBergabung} hari`}</strong> ditandai sebagai{' '}
                    <span className="font-bold underline decoration-indigo-400">Belum Bergabung (Pra-Join)</span> — tidak dihitung Bolos/Alpha &amp; tidak memotong KPI.
                  </p>
                  <p className="text-indigo-700 dark:text-indigo-300">
                    Gaji Pokok &amp; Tunjangan diprorata <strong>{selectedPayrollSlip.totalJadwalKerja}/{selectedPayrollSlip.totalHariKerjaPeriodePenuh} hari kerja</strong> (dari bulanan penuh{' '}
                    {showSalaryNumbers
                      ? `Rp ${selectedPayrollSlip.gajiPokokBulanan.toLocaleString('id-ID')}`
                      : 'Rp ••••••'}
                    ).
                  </p>
                </div>
              )}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Komponen Pendapatan
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    Gaji Pokok
                    {selectedPayrollSlip.isProrataKaryawanBaru && (
                      <span className="ml-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                        (Prorata {selectedPayrollSlip.totalJadwalKerja}/{selectedPayrollSlip.totalHariKerjaPeriodePenuh}h)
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-bold shrink-0">
                    {showSalaryNumbers ? `Rp ${selectedPayrollSlip.gajiPokok.toLocaleString('id-ID')}` : 'Rp ••••••'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    Tunjangan
                    {selectedPayrollSlip.isProrataKaryawanBaru && selectedPayrollSlip.tunjanganBulanan > 0 && (
                      <span className="ml-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                        (Prorata)
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-bold shrink-0">
                    {showSalaryNumbers ? `Rp ${selectedPayrollSlip.tunjangan.toLocaleString('id-ID')}` : 'Rp ••••••'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-300">
                    Upah Lembur ACC ({selectedPayrollSlip.totalJamLembur} Jam)
                  </span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {showSalaryNumbers ? `+Rp ${selectedPayrollSlip.uangLembur.toLocaleString('id-ID')}` : '+Rp ••••'}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-black">
                  <span>Total Pendapatan Kotor</span>
                  <span className="font-mono">
                    {showSalaryNumbers ? `Rp ${selectedPayrollSlip.totalPendapatanKotor.toLocaleString('id-ID')}` : 'Rp ••••••'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-800 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Komponen Potongan
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    Denda Datang Tidak Absen Pulang ({selectedPayrollSlip.totalTidakAbsenPulang}x · Gaji tetap dibayar)
                  </span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                    {showSalaryNumbers ? `-Rp ${selectedPayrollSlip.potonganTidakAbsenPulang.toLocaleString('id-ID')}` : '-Rp ••••'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    Potongan Tidak Hadir Tanpa Absen ({selectedPayrollSlip.totalTidakHadirTanpaAbsen} hari)
                  </span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                    {showSalaryNumbers ? `-Rp ${selectedPayrollSlip.potonganTidakHadir.toLocaleString('id-ID')}` : '-Rp ••••'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    Potongan Cuti / Izin / Sakit Unpaid (C:{selectedPayrollSlip.totalHariCuti} · I:{selectedPayrollSlip.totalHariIzin} · S:{selectedPayrollSlip.totalHariSakit})
                  </span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                    {showSalaryNumbers ? `-Rp ${selectedPayrollSlip.potonganCutiIzinSakit.toLocaleString('id-ID')}` : '-Rp ••••'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    Potongan Terlambat &gt;{selectedPayrollSlip.toleransiTerlambatMenit} mnt ({selectedPayrollSlip.totalHariTerlambatDipotong} hari · total {selectedPayrollSlip.totalMenitTerlambat} mnt)
                  </span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                    {showSalaryNumbers ? `-Rp ${selectedPayrollSlip.potonganTerlambat.toLocaleString('id-ID')}` : '-Rp ••••'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-300">
                    Potongan Kasbon (Saldo: Rp {selectedPayrollSlip.saldoKasbon.toLocaleString('id-ID')})
                  </span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                    {showSalaryNumbers ? `-Rp ${selectedPayrollSlip.potonganKasbon.toLocaleString('id-ID')}` : '-Rp ••••'}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-black text-rose-600 dark:text-rose-400">
                  <span>Total Potongan</span>
                  <span className="font-mono">
                    {showSalaryNumbers ? `-Rp ${selectedPayrollSlip.totalPotongan.toLocaleString('id-ID')}` : '-Rp ••••'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-600 text-white flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">
                    Gaji Bersih (Take-Home Pay)
                  </div>
                  <div className="text-[11px] text-indigo-100">
                    Periode {selectedPayrollSlip.payrollPeriodLabel} (Siklus 26–25)
                  </div>
                </div>
                <div className="text-xl font-black font-mono tabular-nums">
                  {showSalaryNumbers ? `Rp ${selectedPayrollSlip.gajiBersih.toLocaleString('id-ID')}` : 'Rp •••••••'}
                </div>
              </div>

              {/* Rincian Ketidakhadiran & Edit Absensi Inline */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Rincian Ketidakhadiran &amp; Tak Absen Pulang ({selectedPayrollSlip.detailTidakHadirItems.length} Hari)
                  </span>
                  {isAdmin && selectedPayrollSlip.detailTidakHadirItems.length > 0 && (
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      Klik &quot;Edit&quot; untuk koreksi langsung
                    </span>
                  )}
                </div>

                {selectedPayrollSlip.detailTidakHadirItems.length === 0 ? (
                  <div className="py-2.5 text-center text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    Kehadiran penuh tanpa ketidakhadiran / lupa absen pulang pada periode ini.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                    {selectedPayrollSlip.detailTidakHadirItems.map((item) => {
                      const isEditingThis = editingAbsenceItem?.tanggal === item.tanggal;
                      return (
                        <div
                          key={`${item.tanggal}_${item.tipe}`}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-slate-900 dark:text-white">
                                  {item.tanggal}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                  {item.shiftJadwal}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    item.tipe === 'TIDAK_ABSEN_PULANG'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                      : item.tipe === 'TIDAK_HADIR'
                                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                      : 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                                  }`}
                                >
                                  {item.statusLabel}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {item.alasan}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                                {item.potonganNominal > 0
                                  ? `-Rp ${item.potonganNominal.toLocaleString('id-ID')}`
                                  : 'Rp 0'}
                              </span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditingThis
                                      ? setEditingAbsenceItem(null)
                                      : handleStartEditAbsenceItem(item)
                                  }
                                  className="px-2 py-1 rounded-lg text-[10px] font-bold border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 cursor-pointer flex items-center gap-1"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>{isEditingThis ? 'Batal' : 'Edit'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Form Koreksi Absensi Ketidakhadiran Inline */}
                          {isEditingThis && (
                            <form
                              onSubmit={handleSaveAbsenceEdit}
                              className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 space-y-2"
                            >
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                    Status Baru
                                  </label>
                                  <select
                                    value={absEditStatus}
                                    onChange={(e) => setAbsEditStatus(e.target.value as any)}
                                    className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold"
                                  >
                                    <option value="Hadir">Hadir (Dibayar)</option>
                                    <option value="Libur">Libur / Off (Tanpa Potong)</option>
                                    <option value="Sakit">Sakit (Unpaid)</option>
                                    <option value="Izin">Izin (Unpaid)</option>
                                    <option value="Cuti">Cuti (Unpaid)</option>
                                    <option value="Alpha">Alpha / Tidak Hadir</option>
                                  </select>
                                </div>

                                {absEditStatus === 'Hadir' && (
                                  <>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                        Shift
                                      </label>
                                      <select
                                        value={absEditShift}
                                        onChange={(e) => setAbsEditShift(e.target.value)}
                                        className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold"
                                      >
                                        <option value="Shift 1">Shift 1 (08-17)</option>
                                        <option value="Shift 2">Shift 2 (09-18)</option>
                                        <option value="Shift 3a">Shift 3a (12-21)</option>
                                        <option value="Shift 3b">Shift 3b (11-20)</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                        Jam Masuk
                                      </label>
                                      <input
                                        type="time"
                                        value={absEditJamMasuk}
                                        onChange={(e) => setAbsEditJamMasuk(e.target.value)}
                                        className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                        Jam Pulang
                                      </label>
                                      <input
                                        type="time"
                                        value={absEditJamPulang}
                                        onChange={(e) => setAbsEditJamPulang(e.target.value)}
                                        className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={absEditCatatan}
                                  onChange={(e) => setAbsEditCatatan(e.target.value)}
                                  placeholder="Catatan koreksi absensi HR..."
                                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
                                />
                                <button
                                  type="submit"
                                  disabled={savingAbsenceEdit}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  {savingAbsenceEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  <span>Simpan Koreksi</span>
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Rincian Keterlambatan (Kuota Toleransi 30 Menit/Bulan) */}
              {selectedPayrollSlip.detailTerlambatItems.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Rincian Keterlambatan (Toleransi {selectedPayrollSlip.toleransiTerlambatMenit} mnt/bln · Total {selectedPayrollSlip.totalMenitTerlambat} mnt)
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {selectedPayrollSlip.detailTerlambatItems.map((lt) => (
                      <div
                        key={lt.tanggal}
                        className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{lt.tanggal}</span>
                          <span className="text-slate-400 font-mono">Masuk {lt.jamMasuk}</span>
                          <span className="text-amber-700 dark:text-amber-300 font-bold">
                            +{lt.menitTerlambat}m (Akum: {lt.akumulasiMenit}m)
                          </span>
                        </div>
                        <span
                          className={`font-mono font-bold shrink-0 ${
                            lt.melewatiToleransi
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {lt.melewatiToleransi
                            ? `-Rp ${lt.potonganNominal.toLocaleString('id-ID')}`
                            : 'Toleransi'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const detail = selectedPayrollSlip.summaryRow;
                    setEditingAbsenceItem(null);
                    setSelectedPayrollSlipNik(null);
                    setSelectedEmployeeDetail(detail);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Lihat Audit Lengkap
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={publishingPayslips}
                    onClick={() => handleToggleSinglePayslipPublish(selectedPayrollSlip)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                      publishedPeriodDoc?.slipsByNik?.[(selectedPayrollSlip.nik || '').trim().toUpperCase()]
                        ? 'border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {publishedPeriodDoc?.slipsByNik?.[(selectedPayrollSlip.nik || '').trim().toUpperCase()] ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Tarik Slip Ini</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Publish Slip Ini</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingAbsenceItem(null);
                  setSelectedPayrollSlipNik(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
