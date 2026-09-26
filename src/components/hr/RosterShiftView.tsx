import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar,
  Search,
  Users,
  Filter,
  RotateCcw,
  Plus,
  Edit2,
  Trash2,
  Download,
  Upload,
  LayoutGrid,
  Table as TableIcon,
  CalendarDays,
  Clock,
  CheckCircle2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Check,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  FileDown,
  Shield,
  Lock,
} from 'lucide-react';
import { UserSession, RosterShiftRecord, KaryawanRecord } from '../../types';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import {
  fetchRosterShiftList,
  fetchKaryawanDirectory,
  saveRosterShift,
  batchSaveRosterShifts,
  deleteRosterShift,
  fetchMasterShiftList,
} from '../../services/supabase';

interface RosterShiftViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type ViewMode = 'table' | 'cards' | 'weekly';

const DEFAULT_SHIFTS: Record<string, { masuk: string; pulang: string; color: string; label: string }> = {
  'Shift 1': { masuk: '08:00', pulang: '17:00', color: 'blue', label: 'Shift 1 (08:00 - 17:00)' },
  'Shift 2': { masuk: '09:00', pulang: '18:00', color: 'indigo', label: 'Shift 2 (09:00 - 18:00)' },
  'Shift 3': { masuk: '12:00', pulang: '21:00', color: 'purple', label: 'Shift 3 (12:00 - 21:00)' },
  'Libur': { masuk: '', pulang: '', color: 'rose', label: 'Libur (Off)' },
  'Cuti': { masuk: '', pulang: '', color: 'amber', label: 'Cuti Tahunan' },
  'Izin': { masuk: '', pulang: '', color: 'teal', label: 'Izin / Sakit' },
};

export const RosterShiftView: React.FC<RosterShiftViewProps> = ({ session, onShowToast }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [rosterList, setRosterList] = useState<RosterShiftRecord[]>([]);
  const [karyawanList, setKaryawanList] = useState<KaryawanRecord[]>([]);

  // Access check: Edit & Hapus restricted to Admin & Superadmin only
  const userIsAdmin = useMemo(() => {
    return (
      isSuperadmin(session) ||
      hasPermission(session, 'action_edit_master') ||
      hasPermission(session, 'menu_hr_karyawan') ||
      hasPermission(session, 'menu_hr_approval') ||
      session?.role === 'admin' ||
      session?.role === 'superadmin'
    );
  }, [session]);

  // View & Filter States
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Weekly View Date Anchor (start of current week)
  const [weeklyAnchorDate, setWeeklyAnchorDate] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.setDate(diff));
  });

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<Partial<RosterShiftRecord> | null>(null);
  const [savingShift, setSavingShift] = useState<boolean>(false);

  // Import CSV Modal States
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [parsedCsvRows, setParsedCsvRows] = useState<Array<{
    nik: string;
    nama: string;
    tanggal: string;
    shift: string;
    jam_masuk: string;
    jam_pulang: string;
    keterangan: string;
    isValid: boolean;
    errorMsg?: string;
  }>>([]);
  const [importing, setImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete Confirm State
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [roster, employees] = await Promise.all([
        fetchRosterShiftList(),
        fetchKaryawanDirectory(),
      ]);
      setRosterList(roster);
      setKaryawanList(employees);
    } catch (err) {
      console.warn('Gagal memuat jadwal roster:', err);
      onShowToast('Gagal memuat jadwal roster', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Map NIK to employee
  const empMap = useMemo(() => {
    const map: Record<string, KaryawanRecord> = {};
    karyawanList.forEach((k) => {
      map[k.nik] = k;
    });
    return map;
  }, [karyawanList]);

  // Unique departments list
  const departments = useMemo(() => {
    const set = new Set<string>();
    karyawanList.forEach((k) => {
      if (k.divisi) set.add(k.divisi);
    });
    return Array.from(set);
  }, [karyawanList]);

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    return rosterList.filter((r) => {
      // Date filter
      if (selectedDate && r.tanggal !== selectedDate) {
        return false;
      }
      // Shift filter
      if (selectedShift !== 'all' && !r.shift.toLowerCase().includes(selectedShift.toLowerCase())) {
        return false;
      }
      // Department filter
      if (selectedDepartment !== 'all') {
        const emp = empMap[r.nik];
        if (emp && emp.divisi !== selectedDepartment) {
          return false;
        }
      }
      // Search
      if (searchQuery.trim()) {
        const emp = empMap[r.nik];
        const text = `${r.nik} ${emp?.nama || ''} ${emp?.divisi || ''} ${r.shift} ${r.keterangan || ''}`.toLowerCase();
        if (!text.includes(searchQuery.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [rosterList, selectedDate, selectedShift, selectedDepartment, searchQuery, empMap]);

  // Summary counts for current filtered or all
  const summaryStats = useMemo(() => {
    const active = selectedDate
      ? rosterList.filter((r) => r.tanggal === selectedDate)
      : rosterList;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    let libur = 0;
    let cuti = 0;

    active.forEach((r) => {
      const s = (r.shift || '').toLowerCase();
      if (s.includes('shift 1') || s === '1') s1++;
      else if (s.includes('shift 2') || s === '2') s2++;
      else if (s.includes('shift 3') || s === '3') s3++;
      else if (s.includes('libur') || s.includes('off')) libur++;
      else if (s.includes('cuti') || s.includes('izin') || s.includes('ijin')) cuti++;
    });

    return { total: active.length, s1, s2, s3, libur, cuti };
  }, [rosterList, selectedDate]);

  // Days in current weekly view
  const weeklyDays = useMemo(() => {
    const days: { dateStr: string; dayName: string; formattedDate: string }[] = [];
    const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weeklyAnchorDate);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dt}`;
      days.push({
        dateStr,
        dayName: dayNames[i],
        formattedDate: `${dt}/${m}`,
      });
    }
    return days;
  }, [weeklyAnchorDate]);

  // Open Edit Modal for existing or new shift
  const handleOpenEdit = (shift?: RosterShiftRecord) => {
    if (!userIsAdmin) {
      onShowToast('Hanya Admin yang dapat menambah atau mengedit jadwal shift', 'warning');
      return;
    }
    if (shift) {
      setEditingShift({
        id: shift.id,
        nik: shift.nik,
        tanggal: shift.tanggal,
        shift: shift.shift,
        jam_masuk: shift.jam_masuk || '08:00',
        jam_pulang: shift.jam_pulang || '17:00',
        keterangan: shift.keterangan || '',
      });
    } else {
      // Default new shift
      const defaultNik = karyawanList[0]?.nik || '';
      const nowStr = selectedDate || new Date().toISOString().slice(0, 10);
      setEditingShift({
        nik: defaultNik,
        tanggal: nowStr,
        shift: 'Shift 1',
        jam_masuk: '08:00',
        jam_pulang: '17:00',
        keterangan: '',
      });
    }
    setIsEditModalOpen(true);
  };

  // Handle Preset Shift Selection in Modal
  const handleShiftPresetChange = (presetName: string) => {
    if (!editingShift) return;
    const preset = DEFAULT_SHIFTS[presetName];
    if (preset) {
      setEditingShift({
        ...editingShift,
        shift: presetName,
        jam_masuk: preset.masuk,
        jam_pulang: preset.pulang,
      });
    } else {
      setEditingShift({
        ...editingShift,
        shift: presetName,
      });
    }
  };

  // Save Shift Handler
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin yang dapat menyimpan jadwal shift', 'error');
      return;
    }
    if (!editingShift || !editingShift.nik || !editingShift.tanggal || !editingShift.shift) {
      onShowToast('Mohon lengkapi NIK, Tanggal, dan Pilihan Shift', 'warning');
      return;
    }

    setSavingShift(true);
    try {
      const saved = await saveRosterShift(editingShift);
      onShowToast(
        `Jadwal shift ${saved.nik} (${saved.tanggal}) disimpan & status keterlambatan presensi disinkronkan otomatis!`,
        'success'
      );
      setIsEditModalOpen(false);
      setEditingShift(null);
      await loadData();
    } catch (err: any) {
      console.error('Save roster shift error:', err);
      onShowToast(`Gagal menyimpan jadwal shift: ${err.message || 'Terjadi kesalahan'}`, 'error');
    } finally {
      setSavingShift(false);
    }
  };

  // Delete Shift Handler
  const handleDeleteShift = async (id: number) => {
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin yang dapat menghapus jadwal shift', 'error');
      return;
    }
    if (!id) return;
    if (!window.confirm('Yakin ingin menghapus jadwal shift ini?')) return;

    setDeletingId(id);
    try {
      await deleteRosterShift(id);
      onShowToast('Jadwal shift berhasil dihapus', 'success');
      setRosterList((prev) => prev.filter((r) => r.id !== id));
      if (isEditModalOpen) {
        setIsEditModalOpen(false);
        setEditingShift(null);
      }
    } catch (err: any) {
      console.error('Delete roster shift error:', err);
      onShowToast(`Gagal menghapus shift: ${err.message || 'Error'}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Download CSV Template
  const handleDownloadCsvTemplate = () => {
    const headers = ['NIK', 'Nama Staf', 'Tanggal (YYYY-MM-DD)', 'Shift', 'Jam Masuk (HH:MM)', 'Jam Pulang (HH:MM)', 'Keterangan'];
    
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    const sampleRows: string[][] = [];
    if (karyawanList.length > 0) {
      karyawanList.slice(0, 8).forEach((k, idx) => {
        let shiftName = 'Shift 1';
        let jm = '08:00';
        let jp = '17:00';
        if (idx % 3 === 1) {
          shiftName = 'Shift 2';
          jm = '09:00';
          jp = '18:00';
        } else if (idx % 3 === 2) {
          shiftName = 'Shift 3';
          jm = '12:00';
          jp = '21:00';
        }
        sampleRows.push([k.nik, k.nama || '', todayStr, shiftName, jm, jp, 'Jadwal Reguler']);
      });
    } else {
      sampleRows.push(['WH0001', 'Staff Gudang 1', todayStr, 'Shift 1', '08:00', '17:00', 'Jadwal Normal']);
      sampleRows.push(['WH0002', 'Staff Gudang 2', todayStr, 'Shift 2', '09:00', '18:00', 'Piket Siang']);
      sampleRows.push(['WH0003', 'Staff Gudang 3', todayStr, 'Libur', '', '', 'Off Mingguan']);
    }

    const csvContent = [
      headers.join(','),
      ...sampleRows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Template_Jadwal_Roster_Shift_WMS.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast('Template CSV jadwal shift berhasil didownload', 'info');
  };

  // Export Filtered / All Roster Data to CSV
  const handleExportCsv = () => {
    const listToExport = filteredRoster.length > 0 ? filteredRoster : rosterList;
    if (listToExport.length === 0) {
      onShowToast('Tidak ada data jadwal shift untuk diekspor', 'warning');
      return;
    }

    const headers = ['No', 'Tanggal', 'NIK', 'Nama Staf', 'Divisi', 'Shift Kerja', 'Jam Masuk', 'Jam Pulang', 'Keterangan'];
    const rows = listToExport.map((r, idx) => {
      const emp = empMap[r.nik];
      return [
        String(idx + 1),
        r.tanggal,
        r.nik,
        emp?.nama || r.nik,
        emp?.divisi || 'Warehouse',
        r.shift,
        r.jam_masuk || '-',
        r.jam_pulang || '-',
        r.keterangan || '-',
      ];
    });

    const titleRow = `REKAPITULASI JADWAL ROSTER SHIFT GUDANG`;
    const filterInfo = selectedDate ? `Tanggal: ${selectedDate}` : `Semua Tanggal`;
    const shiftInfo = selectedShift !== 'all' ? `Shift: ${selectedShift}` : `Semua Shift`;

    const csvContent = [
      `"${titleRow}"`,
      `"${filterInfo} | ${shiftInfo} | Total: ${listToExport.length} Data"`,
      '',
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateTag = selectedDate || new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `Jadwal_Roster_Shift_${dateTag}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast(`Berhasil mengekspor ${listToExport.length} data jadwal roster shift ke CSV`, 'success');
  };

  // Parse CSV File
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin yang dapat mengimpor jadwal shift', 'error');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error('File kosong');

        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          throw new Error('File CSV minimal harus memiliki baris header dan 1 baris data');
        }

        const headerLine = lines[0];
        const delimiter = headerLine.includes(';') ? ';' : ',';

        const parseLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === delimiter && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        const rows = lines.slice(1).map((line) => parseLine(line));

        const parsed = rows.map((cols) => {
          let rawNik = (cols[0] || '').trim();
          let rawNama = (cols[1] || '').trim();
          let rawTanggal = (cols[2] || '').trim();
          let rawShift = (cols[3] || 'Shift 1').trim();
          let rawJamMasuk = (cols[4] || '').trim();
          let rawJamPulang = (cols[5] || '').trim();
          let rawKeterangan = (cols[6] || '').trim();

          if (!rawNik && rawNama) {
            const match = karyawanList.find(
              (k) => k.nama?.toLowerCase().trim() === rawNama.toLowerCase()
            );
            if (match) rawNik = match.nik;
          }

          if (rawNik && !rawNama && empMap[rawNik]) {
            rawNama = empMap[rawNik].nama;
          }

          let cleanTanggal = rawTanggal;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawTanggal)) {
            const [d, m, y] = rawTanggal.split('/');
            cleanTanggal = `${y}-${m}-${d}`;
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawTanggal)) {
            cleanTanggal = rawTanggal;
          }

          if (!rawJamMasuk && !rawJamPulang && DEFAULT_SHIFTS[rawShift]) {
            rawJamMasuk = DEFAULT_SHIFTS[rawShift].masuk;
            rawJamPulang = DEFAULT_SHIFTS[rawShift].pulang;
          }

          let isValid = true;
          let errorMsg = '';

          if (!rawNik) {
            isValid = false;
            errorMsg = 'NIK tidak ditemukan';
          } else if (!cleanTanggal || !/^\d{4}-\d{2}-\d{2}$/.test(cleanTanggal)) {
            isValid = false;
            errorMsg = 'Format tanggal harus YYYY-MM-DD';
          } else if (!rawShift) {
            isValid = false;
            errorMsg = 'Shift wajib diisi';
          }

          return {
            nik: rawNik.toUpperCase(),
            nama: rawNama,
            tanggal: cleanTanggal,
            shift: rawShift,
            jam_masuk: rawJamMasuk,
            jam_pulang: rawJamPulang,
            keterangan: rawKeterangan,
            isValid,
            errorMsg,
          };
        });

        setParsedCsvRows(parsed);
        setIsImportModalOpen(true);
      } catch (err: any) {
        console.error('Error parsing CSV:', err);
        onShowToast(`Gagal membaca file CSV: ${err.message || 'Format tidak valid'}`, 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Submit Batch CSV Import
  const handleExecuteImport = async () => {
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin yang dapat mengimpor jadwal shift', 'error');
      return;
    }
    const validRows = parsedCsvRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      onShowToast('Tidak ada data valid untuk diimpor', 'warning');
      return;
    }

    setImporting(true);
    try {
      const payload: Partial<RosterShiftRecord>[] = validRows.map((r) => ({
        nik: r.nik,
        tanggal: r.tanggal,
        shift: r.shift,
        jam_masuk: r.jam_masuk || undefined,
        jam_pulang: r.jam_pulang || undefined,
        keterangan: r.keterangan || undefined,
      }));

      const res = await batchSaveRosterShifts(payload);
      if (res.failed > 0) {
        onShowToast(
          `Impor selesai: ${res.success} berhasil, ${res.failed} gagal`,
          'warning'
        );
      } else {
        onShowToast(`Sukses mengimpor ${res.success} jadwal roster shift!`, 'success');
      }

      setIsImportModalOpen(false);
      setParsedCsvRows([]);
      await loadData();
    } catch (err: any) {
      console.error('Import error:', err);
      onShowToast(`Gagal mengimpor jadwal: ${err.message || 'Error'}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  // Shift Badge Helper
  const renderShiftBadge = (shiftName: string) => {
    const s = (shiftName || '').toLowerCase();
    let badgeClass = 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900';
    if (s.includes('shift 2') || s === '2') {
      badgeClass = 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900';
    } else if (s.includes('shift 3') || s === '3') {
      badgeClass = 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900';
    } else if (s.includes('libur') || s.includes('off')) {
      badgeClass = 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900';
    } else if (s.includes('cuti') || s.includes('izin') || s.includes('ijin')) {
      badgeClass = 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${badgeClass}`}>
        {shiftName}
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Hidden File Input for CSV */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleCsvFileUpload}
        className="hidden"
      />

      {/* HEADER BANNER */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131d31] shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                Jadwal Roster Shift Gudang
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-primary-500/15 text-primary-500 border border-primary-500/30">
                {rosterList.length} Jadwal
              </span>
              {!userIsAdmin && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  Mode Tinjau (Hanya Baca)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pengaturan pembagian jam kerja, jadwal piket, import CSV & monitoring staf warehouse
            </p>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh */}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Muat Ulang Data"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-blue-200 dark:border-blue-800 shadow-xs"
            title="Ekspor daftar jadwal shift ke berkas CSV"
          >
            <FileDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Ekspor CSV</span>
          </button>

          {/* Download CSV Template (Admin or general) */}
          <button
            type="button"
            onClick={handleDownloadCsvTemplate}
            className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-slate-200/60 dark:border-slate-700"
            title="Unduh format template CSV untuk jadwal shift"
          >
            <Download className="w-4 h-4 text-emerald-500" />
            <span>Template CSV</span>
          </button>

          {/* Admin Only Actions: Import CSV & Add Shift */}
          {userIsAdmin && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-emerald-300 dark:border-emerald-800"
                title="Import jadwal shift dari file CSV (Admin Only)"
              >
                <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Import CSV</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenEdit()}
                className="px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Shift</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* QUICK SUMMARY COUNTERS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Jadwal</div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{summaryStats.total}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 shadow-xs">
          <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Shift 1 (Pagi)</div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-0.5">{summaryStats.s1}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/20 shadow-xs">
          <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Shift 2 (Siang)</div>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{summaryStats.s2}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/20 shadow-xs">
          <div className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Shift 3 (Malam)</div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400 mt-0.5">{summaryStats.s3}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 shadow-xs">
          <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Libur (Off)</div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5">{summaryStats.libur}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-amber-500/5 dark:bg-amber-950/20 border border-amber-500/20 shadow-xs">
          <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Cuti / Izin</div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{summaryStats.cuti}</div>
        </div>
      </div>

      {/* CONTROLS BAR (VIEW SWITCHER + FILTERS + SEARCH) */}
      <div className="p-5 rounded-3xl bg-white dark:bg-[#131d31] shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
        {/* Top line: View mode switcher & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* View Mode Toggle */}
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 self-start">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TableIcon className="w-4 h-4" />
              <span>Tabel</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Kartu</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'weekly'
                  ? 'bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span>Mingguan</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari NIK, Nama Staf, atau Keterangan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white"
            />
          </div>
        </div>

        {/* Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
          {/* Date Picker */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tanggal</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-mono"
            />
          </div>

          {/* Shift Filter Dropdown */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Filter Shift</label>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-extrabold"
            >
              <option value="all">Semua Shift & Libur</option>
              <option value="Shift 1">Shift 1 (08:00 - 17:00)</option>
              <option value="Shift 2">Shift 2 (09:00 - 18:00)</option>
              <option value="Shift 3">Shift 3 (12:00 - 21:00)</option>
              <option value="Libur">Libur (Off)</option>
              <option value="Cuti">Cuti / Izin</option>
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Divisi</label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-extrabold"
            >
              <option value="all">Semua Divisi</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Date Shortcuts */}
          <div className="sm:col-span-3 lg:col-span-1 flex items-end gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setSelectedDate(now.toISOString().slice(0, 10));
              }}
              className="px-2.5 py-2 rounded-xl bg-primary-500/10 text-primary-500 font-black text-xs hover:bg-primary-500/20 cursor-pointer transition-all whitespace-nowrap"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => {
                const tmrw = new Date();
                tmrw.setDate(tmrw.getDate() + 1);
                setSelectedDate(tmrw.toISOString().slice(0, 10));
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 cursor-pointer transition-all whitespace-nowrap"
            >
              Besok
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate('')}
              className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 cursor-pointer transition-all whitespace-nowrap"
            >
              Semua
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT AREA BASED ON VIEW MODE */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-500" />
              <span className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Daftar Jadwal Roster ({filteredRoster.length})
              </span>
            </div>
            {selectedDate && (
              <span className="text-xs text-slate-500 font-mono font-bold">
                Tanggal: {selectedDate}
              </span>
            )}
          </div>

          {filteredRoster.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
              Tidak ada jadwal roster yang sesuai dengan filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-3.5">Tanggal</th>
                    <th className="py-3 px-3.5">Staf & NIK</th>
                    <th className="py-3 px-3.5">Divisi</th>
                    <th className="py-3 px-3.5">Shift Kerja</th>
                    <th className="py-3 px-3.5">Jam Kerja</th>
                    <th className="py-3 px-3.5">Keterangan</th>
                    <th className="py-3 px-3.5 text-right">{userIsAdmin ? 'Aksi (Admin)' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredRoster.map((r) => {
                    const emp = empMap[r.nik];
                    const isLibur = (r.shift || '').toLowerCase().includes('libur');

                    return (
                      <tr
                        key={r.id || `${r.nik}-${r.tanggal}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-3.5 font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {r.tanggal}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-extrabold text-slate-900 dark:text-white">
                            {emp?.nama || r.nik}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">{r.nik}</div>
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300">
                          {emp?.divisi || 'Warehouse'}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          {renderShiftBadge(r.shift)}
                        </td>
                        <td className="py-3 px-3.5 font-mono font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {isLibur ? (
                            <span className="text-slate-400 italic">Libur</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{r.jam_masuk || '08:00'} - {r.jam_pulang || '17:00'}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-slate-500 italic max-w-xs truncate">
                          {r.keterangan || '-'}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          {userIsAdmin ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(r)}
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-primary-500/10 hover:text-primary-500 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                title="Edit Jadwal Shift (Admin)"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {r.id && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteShift(r.id!)}
                                  disabled={deletingId === r.id}
                                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/10 hover:text-rose-500 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                  title="Hapus Jadwal Shift (Admin)"
                                >
                                  <Trash2 className={`w-3.5 h-3.5 ${deletingId === r.id ? 'animate-spin' : ''}`} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                              Terjadwal
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CARD VIEW */}
      {viewMode === 'cards' && (
        <div>
          {filteredRoster.length === 0 ? (
            <div className="bg-white dark:bg-[#131d31] rounded-3xl p-16 text-center border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30 text-slate-400" />
              Tidak ada jadwal roster yang sesuai dengan filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredRoster.map((r) => {
                const emp = empMap[r.nik];
                const isLibur = (r.shift || '').toLowerCase().includes('libur');
                const initial = (emp?.nama || r.nik).charAt(0).toUpperCase();

                return (
                  <div
                    key={r.id || `${r.nik}-${r.tanggal}`}
                    className="p-4 rounded-2xl bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 hover:border-primary-500/40 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                  >
                    <div>
                      {/* Card Top: Staff Info & Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black flex items-center justify-center text-sm border border-slate-200 dark:border-slate-700">
                            {initial}
                          </div>
                          <div>
                            <div className="font-extrabold text-xs text-slate-900 dark:text-white line-clamp-1">
                              {emp?.nama || r.nik}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-slate-400">{r.nik}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
                                {emp?.divisi || 'Warehouse'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Admin Only Actions */}
                        {userIsAdmin && (
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(r)}
                              className="p-1 rounded-md hover:bg-primary-500/10 hover:text-primary-500 text-slate-400 transition-colors cursor-pointer"
                              title="Edit Shift (Admin)"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {r.id && (
                              <button
                                type="button"
                                onClick={() => handleDeleteShift(r.id!)}
                                disabled={deletingId === r.id}
                                className="p-1 rounded-md hover:bg-rose-500/10 hover:text-rose-500 text-slate-400 transition-colors cursor-pointer"
                                title="Hapus Shift (Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Shift & Time Details */}
                      <div className="mt-3.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Jadwal Shift</span>
                          {renderShiftBadge(r.shift)}
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                          <span className="text-slate-400 font-normal text-[11px]">Jam Kerja:</span>
                          <span>
                            {isLibur ? 'Libur (Off)' : `${r.jam_masuk || '08:00'} - ${r.jam_pulang || '17:00'}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Date & Notes */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1 text-slate-500 font-mono font-semibold">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{r.tanggal}</span>
                      </div>
                      {r.keterangan && (
                        <span className="text-slate-400 italic max-w-[120px] truncate" title={r.keterangan}>
                          {r.keterangan}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* WEEKLY MATRIX VIEW */}
      {viewMode === 'weekly' && (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Week Navigator */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary-500" />
              <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Jadwal Mingguan ({weeklyDays[0].dateStr} s/d {weeklyDays[6].dateStr})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const d = new Date(weeklyAnchorDate);
                  d.setDate(d.getDate() - 7);
                  setWeeklyAnchorDate(d);
                }}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 cursor-pointer"
                title="Minggu Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const day = d.getDay();
                  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                  setWeeklyAnchorDate(new Date(d.setDate(diff)));
                }}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Minggu Ini
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(weeklyAnchorDate);
                  d.setDate(d.getDate() + 7);
                  setWeeklyAnchorDate(d);
                }}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 cursor-pointer"
                title="Minggu Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Matrix Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3.5 min-w-[160px]">Karyawan</th>
                  {weeklyDays.map((d) => (
                    <th key={d.dateStr} className="py-3 px-2 text-center min-w-[110px]">
                      <div>{d.dayName}</div>
                      <div className="text-[10px] font-mono text-slate-400 font-normal">{d.formattedDate}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {karyawanList
                  .filter((k) => {
                    if (selectedDepartment !== 'all' && k.divisi !== selectedDepartment) return false;
                    if (searchQuery.trim()) {
                      const text = `${k.nik} ${k.nama} ${k.divisi}`.toLowerCase();
                      if (!text.includes(searchQuery.toLowerCase())) return false;
                    }
                    return true;
                  })
                  .map((k) => {
                    return (
                      <tr key={k.nik} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3.5">
                          <div className="font-extrabold text-slate-900 dark:text-white">{k.nama}</div>
                          <div className="text-[10px] font-mono text-slate-400">{k.nik} • {k.divisi || 'Warehouse'}</div>
                        </td>
                        {weeklyDays.map((d) => {
                          const shiftMatch = rosterList.find(
                            (r) => r.nik === k.nik && r.tanggal === d.dateStr
                          );
                          const isLibur = (shiftMatch?.shift || '').toLowerCase().includes('libur');

                          return (
                            <td
                              key={d.dateStr}
                              className="py-2.5 px-2 text-center align-middle"
                              onClick={() => {
                                if (userIsAdmin) {
                                  if (shiftMatch) {
                                    handleOpenEdit(shiftMatch);
                                  } else {
                                    setEditingShift({
                                      nik: k.nik,
                                      tanggal: d.dateStr,
                                      shift: 'Shift 1',
                                      jam_masuk: '08:00',
                                      jam_pulang: '17:00',
                                      keterangan: '',
                                    });
                                    setIsEditModalOpen(true);
                                  }
                                }
                              }}
                            >
                              {shiftMatch ? (
                                <div className={`${userIsAdmin ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}>
                                  {renderShiftBadge(shiftMatch.shift)}
                                  <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                                    {isLibur ? 'Libur' : `${shiftMatch.jam_masuk || '08:00'}-${shiftMatch.jam_pulang || '17:00'}`}
                                  </div>
                                </div>
                              ) : userIsAdmin ? (
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-primary-500 hover:bg-primary-500/10 text-slate-300 hover:text-primary-500 flex items-center justify-center mx-auto transition-colors cursor-pointer"
                                  title={`Tambah shift untuk ${k.nama} (${d.dateStr})`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT / ADD SHIFT MODAL (ADMIN ONLY) */}
      {isEditModalOpen && editingShift && userIsAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-[#131d31] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-500">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {editingShift.id ? 'Edit Jadwal Shift' : 'Tambah Jadwal Shift'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Atur jadwal kerja harian staf gudang (Sinkronisasi presensi otomatis)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingShift(null);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveShift} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Employee Selection */}
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Karyawan / Staf
                </label>
                <select
                  value={editingShift.nik || ''}
                  onChange={(e) => setEditingShift({ ...editingShift, nik: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-bold"
                >
                  <option value="" disabled>Pilih Karyawan</option>
                  {karyawanList.map((k) => (
                    <option key={k.nik} value={k.nik}>
                      {k.nik} - {k.nama} ({k.divisi || 'Warehouse'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Input */}
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Tanggal Shift
                </label>
                <input
                  type="date"
                  value={editingShift.tanggal || ''}
                  onChange={(e) => setEditingShift({ ...editingShift, tanggal: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-mono font-bold"
                />
              </div>

              {/* Shift Presets */}
              <div>
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Pilihan Shift
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.keys(DEFAULT_SHIFTS).map((key) => {
                    const preset = DEFAULT_SHIFTS[key];
                    const isSelected = editingShift.shift === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleShiftPresetChange(key)}
                        className={`p-2.5 rounded-xl text-left border text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary-500/10 border-primary-500 text-primary-600 dark:text-primary-400 ring-2 ring-primary-500/20'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        <div className="font-extrabold">{key}</div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {preset.masuk ? `${preset.masuk} - ${preset.pulang}` : 'Non-Aktif'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Working Hours (Jam Masuk & Pulang) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Jam Masuk
                  </label>
                  <input
                    type="time"
                    value={editingShift.jam_masuk || ''}
                    onChange={(e) => setEditingShift({ ...editingShift, jam_masuk: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Jam Pulang
                  </label>
                  <input
                    type="time"
                    value={editingShift.jam_pulang || ''}
                    onChange={(e) => setEditingShift({ ...editingShift, jam_pulang: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Keterangan / Catatan Tambahan
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Piket Stock Opname, Lembur Siang, Backup"
                  value={editingShift.keterangan || ''}
                  onChange={(e) => setEditingShift({ ...editingShift, keterangan: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white"
                />
              </div>

              {/* Form Actions */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                {editingShift.id ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteShift(editingShift.id!)}
                    disabled={savingShift || deletingId === editingShift.id}
                    className="px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Shift</span>
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingShift(null);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingShift}
                    className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-black text-xs flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {savingShift && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingShift.id ? 'Simpan Perubahan' : 'Tambah Jadwal'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPORT CSV PREVIEW MODAL (ADMIN ONLY) */}
      {isImportModalOpen && userIsAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-3xl bg-white dark:bg-[#131d31] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Preview Import Jadwal Shift CSV
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Periksa data sebelum menyimpan ke sistem roster shift
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedCsvRows([]);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary Bar */}
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <span className="text-slate-600 dark:text-slate-300 font-bold">
                  Total Baris: <strong className="text-slate-900 dark:text-white">{parsedCsvRows.length}</strong>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Valid: {parsedCsvRows.filter((r) => r.isValid).length}
                </span>
                {parsedCsvRows.some((r) => !r.isValid) && (
                  <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Error: {parsedCsvRows.filter((r) => !r.isValid).length}
                  </span>
                )}
              </div>
            </div>

            {/* Table Preview */}
            <div className="p-5 overflow-y-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-black uppercase text-[10px]">
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">NIK</th>
                    <th className="py-2.5 px-3">Nama</th>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Shift</th>
                    <th className="py-2.5 px-3">Jam Kerja</th>
                    <th className="py-2.5 px-3">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {parsedCsvRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={
                        row.isValid
                          ? 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                          : 'bg-rose-50/50 dark:bg-rose-950/20'
                      }
                    >
                      <td className="py-2.5 px-3">
                        {row.isValid ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                            Valid
                          </span>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-bold"
                            title={row.errorMsg}
                          >
                            {row.errorMsg || 'Error'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{row.nik || '-'}</td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-700 dark:text-slate-300">
                        {row.nama || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{row.tanggal}</td>
                      <td className="py-2.5 px-3 font-sans font-bold">{row.shift}</td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {row.jam_masuk && row.jam_pulang ? `${row.jam_masuk}-${row.jam_pulang}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400 italic max-w-xs truncate">
                        {row.keterangan || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedCsvRows([]);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importing || parsedCsvRows.filter((r) => r.isValid).length === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan ke Database...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Import {parsedCsvRows.filter((r) => r.isValid).length} Jadwal Shift</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
