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
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { UserSession, RosterShiftRecord, KaryawanRecord, MasterShiftRecord } from '../../types';
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

interface ShiftPreset {
  masuk: string;
  pulang: string;
  color: string;
  label: string;
  badgeBg: string;
  badgeText: string;
}

const DEFAULT_SHIFTS: Record<string, ShiftPreset> = {
  'Shift 1': {
    masuk: '08:00',
    pulang: '17:00',
    color: 'blue',
    label: 'Shift 1 (08:00 - 17:00)',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
    badgeText: 'text-blue-700 dark:text-blue-300',
  },
  'Shift 2': {
    masuk: '09:00',
    pulang: '18:00',
    color: 'indigo',
    label: 'Shift 2 (09:00 - 18:00)',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
  },
  'Shift 3': {
    masuk: '12:00',
    pulang: '21:00',
    color: 'purple',
    label: 'Shift 3 (12:00 - 21:00)',
    badgeBg: 'bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800',
    badgeText: 'text-purple-700 dark:text-purple-300',
  },
  'Libur': {
    masuk: '',
    pulang: '',
    color: 'rose',
    label: 'Libur (Off)',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800',
    badgeText: 'text-rose-700 dark:text-rose-300',
  },
  'Cuti': {
    masuk: '',
    pulang: '',
    color: 'amber',
    label: 'Cuti Tahunan',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
    badgeText: 'text-amber-700 dark:text-amber-300',
  },
  'Izin': {
    masuk: '',
    pulang: '',
    color: 'teal',
    label: 'Izin / Sakit',
    badgeBg: 'bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800',
    badgeText: 'text-teal-700 dark:text-teal-300',
  },
};

export const RosterShiftView: React.FC<RosterShiftViewProps> = ({ session, onShowToast }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [rosterList, setRosterList] = useState<RosterShiftRecord[]>([]);
  const [karyawanList, setKaryawanList] = useState<KaryawanRecord[]>([]);
  const [masterShifts, setMasterShifts] = useState<MasterShiftRecord[]>([]);

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

  // Dropdown / Combobox Search states in Edit Modal
  const [employeeSearchText, setEmployeeSearchText] = useState<string>('');
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState<boolean>(false);
  const employeeDropdownRef = useRef<HTMLDivElement>(null);

  const [shiftSearchText, setShiftSearchText] = useState<string>('');
  const [isShiftDropdownOpen, setIsShiftDropdownOpen] = useState<boolean>(false);
  const shiftDropdownRef = useRef<HTMLDivElement>(null);

  // Inline Quick Shift Change State (Dropdown in table)
  const [inlineOpenRowId, setInlineOpenRowId] = useState<number | null>(null);
  const [inlineSavingRowId, setInlineSavingRowId] = useState<number | null>(null);

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

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(e.target as Node)) {
        setIsEmployeeDropdownOpen(false);
      }
      if (shiftDropdownRef.current && !shiftDropdownRef.current.contains(e.target as Node)) {
        setIsShiftDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [roster, employees, shifts] = await Promise.all([
        fetchRosterShiftList(),
        fetchKaryawanDirectory(),
        fetchMasterShiftList(),
      ]);
      setRosterList(roster);
      setKaryawanList(employees);
      setMasterShifts(shifts);
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

  // Combined Shift Options (Presets + Custom from master_shift)
  const allShiftOptions = useMemo(() => {
    const map = new Map<string, ShiftPreset>();
    Object.entries(DEFAULT_SHIFTS).forEach(([k, v]) => {
      map.set(k, v);
    });

    masterShifts.forEach((m) => {
      if (m.nama_shift && !map.has(m.nama_shift)) {
        map.set(m.nama_shift, {
          masuk: m.jam_masuk || '',
          pulang: m.jam_pulang || '',
          color: 'blue',
          label: `${m.nama_shift} (${m.jam_masuk || '08:00'} - ${m.jam_pulang || '17:00'})`,
          badgeBg: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
          badgeText: 'text-blue-700 dark:text-blue-300',
        });
      }
    });

    return Array.from(map.entries()).map(([name, config]) => ({
      name,
      ...config,
    }));
  }, [masterShifts]);

  // Filtered Employees for Droplist in Edit Modal
  const filteredEmployeesForModal = useMemo(() => {
    if (!employeeSearchText.trim()) return karyawanList;
    const q = employeeSearchText.toLowerCase().trim();
    return karyawanList.filter(
      (k) =>
        k.nik.toLowerCase().includes(q) ||
        (k.nama && k.nama.toLowerCase().includes(q)) ||
        (k.divisi && k.divisi.toLowerCase().includes(q)) ||
        (k.jabatan && k.jabatan.toLowerCase().includes(q))
    );
  }, [karyawanList, employeeSearchText]);

  // Filtered Shifts for Droplist in Edit Modal
  const filteredShiftsForModal = useMemo(() => {
    if (!shiftSearchText.trim()) return allShiftOptions;
    const q = shiftSearchText.toLowerCase().trim();
    return allShiftOptions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        s.masuk.includes(q) ||
        s.pulang.includes(q)
    );
  }, [allShiftOptions, shiftSearchText]);

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
      else if (s.includes('cuti') || s.includes('izin') || s.includes('ijin') || s.includes('sakit')) cuti++;
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
    setEmployeeSearchText('');
    setShiftSearchText('');
    setIsEmployeeDropdownOpen(false);
    setIsShiftDropdownOpen(false);

    if (shift) {
      const sName = shift.shift || 'Shift 1';
      const preset = DEFAULT_SHIFTS[sName];
      setEditingShift({
        id: shift.id,
        nik: shift.nik,
        tanggal: shift.tanggal,
        shift: sName,
        jam_masuk: shift.jam_masuk || preset?.masuk || '08:00',
        jam_pulang: shift.jam_pulang || preset?.pulang || '17:00',
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

  // Handle Preset or Droplist Shift Selection in Modal
  const handleSelectShift = (shiftName: string) => {
    if (!editingShift) return;
    const match = allShiftOptions.find((s) => s.name === shiftName) || DEFAULT_SHIFTS[shiftName];
    if (match) {
      setEditingShift({
        ...editingShift,
        shift: shiftName,
        jam_masuk: match.masuk || '',
        jam_pulang: match.pulang || '',
      });
    } else {
      setEditingShift({
        ...editingShift,
        shift: shiftName,
      });
    }
    setIsShiftDropdownOpen(false);
  };

  // Quick Inline Shift Change from Table or Card
  const handleQuickInlineShiftChange = async (
    shiftRecord: RosterShiftRecord,
    newShiftName: string
  ) => {
    if (!userIsAdmin) {
      onShowToast('Hanya Admin yang dapat mengedit shift', 'warning');
      return;
    }
    setInlineSavingRowId(shiftRecord.id);
    try {
      const match = allShiftOptions.find((s) => s.name === newShiftName) || DEFAULT_SHIFTS[newShiftName];
      const payload: Partial<RosterShiftRecord> = {
        id: shiftRecord.id,
        nik: shiftRecord.nik,
        tanggal: shiftRecord.tanggal,
        shift: newShiftName,
        jam_masuk: match?.masuk || '',
        jam_pulang: match?.pulang || '',
        keterangan: shiftRecord.keterangan,
      };

      const saved = await saveRosterShift(payload);
      onShowToast(
        `Shift ${saved.nik} diubah ke ${newShiftName}. Presensi & kalkulasi keterlambatan telah disinkronkan otomatis!`,
        'success'
      );
      setInlineOpenRowId(null);
      await loadData();
    } catch (err: any) {
      console.error('Quick inline shift error:', err);
      onShowToast(`Gagal mengubah shift: ${err.message || 'Error'}`, 'error');
    } finally {
      setInlineSavingRowId(null);
    }
  };

  // Save Shift Handler from Modal
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin yang dapat menyimpan jadwal shift', 'error');
      return;
    }
    if (!editingShift || !editingShift.nik || !editingShift.tanggal || !editingShift.shift) {
      onShowToast('Mohon lengkapi NIK/Karyawan, Tanggal, dan Pilihan Shift', 'warning');
      return;
    }

    setSavingShift(true);
    try {
      const saved = await saveRosterShift(editingShift);
      onShowToast(
        `Jadwal shift ${saved.nik} (${saved.tanggal}) berhasil disimpan. Presensi & kalkulasi keterlambatan diperbarui otomatis!`,
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
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        if (!text) throw new Error('File kosong');

        const lines = text
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length <= 1) {
          throw new Error('File CSV tidak memiliki baris data');
        }

        const delimiter = lines[0].includes(';') ? ';' : ',';
        const parseLine = (line: string): string[] => {
          const result: string[] = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === delimiter && !inQuotes) {
              result.push(cur.trim());
              cur = '';
            } else {
              cur += char;
            }
          }
          result.push(cur.trim());
          return result;
        };

        const headerCols = parseLine(lines[0]).map((h) => h.toLowerCase());
        const nikIdx = headerCols.findIndex((h) => h.includes('nik'));
        const namaIdx = headerCols.findIndex((h) => h.includes('nama'));
        const tglIdx = headerCols.findIndex((h) => h.includes('tanggal') || h.includes('tgl') || h.includes('date'));
        const shiftIdx = headerCols.findIndex((h) => h.includes('shift'));
        const jmIdx = headerCols.findIndex((h) => h.includes('masuk') || h.includes('in'));
        const jpIdx = headerCols.findIndex((h) => h.includes('pulang') || h.includes('out'));
        const ketIdx = headerCols.findIndex((h) => h.includes('keterangan') || h.includes('ket') || h.includes('catatan'));

        const parsed: typeof parsedCsvRows = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = parseLine(lines[i]);
          if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

          let rawNik = nikIdx >= 0 ? cols[nikIdx] : cols[0] || '';
          let rawNama = namaIdx >= 0 ? cols[namaIdx] : cols[1] || '';
          let rawTgl = tglIdx >= 0 ? cols[tglIdx] : cols[2] || '';
          let rawShift = shiftIdx >= 0 ? cols[shiftIdx] : cols[3] || 'Shift 1';
          let rawJm = jmIdx >= 0 ? cols[jmIdx] : cols[4] || '';
          let rawJp = jpIdx >= 0 ? cols[jpIdx] : cols[5] || '';
          let rawKet = ketIdx >= 0 ? cols[ketIdx] : cols[6] || '';

          // Normalize NIK
          rawNik = rawNik.replace(/['"]/g, '').trim().toUpperCase();
          rawNama = rawNama.replace(/['"]/g, '').trim();

          // Try match employee if NIK missing
          if (!rawNik && rawNama) {
            const found = karyawanList.find((k) => k.nama.toLowerCase() === rawNama.toLowerCase());
            if (found) rawNik = found.nik;
          }

          // Date format normalize (YYYY-MM-DD)
          rawTgl = rawTgl.replace(/['"]/g, '').trim();
          let validDate = rawTgl;
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawTgl)) {
            const [d, m, y] = rawTgl.split('/');
            validDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(rawTgl)) {
            const [d, m, y] = rawTgl.split('-');
            validDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }

          // Default shift hours
          rawShift = rawShift.replace(/['"]/g, '').trim();
          if (!rawJm && !rawJp) {
            const sLower = rawShift.toLowerCase();
            if (sLower.includes('1') || sLower.includes('shift 1')) {
              rawJm = '08:00';
              rawJp = '17:00';
            } else if (sLower.includes('2') || sLower.includes('shift 2')) {
              rawJm = '09:00';
              rawJp = '18:00';
            } else if (sLower.includes('3') || sLower.includes('shift 3')) {
              rawJm = '12:00';
              rawJp = '21:00';
            }
          }

          let isValid = true;
          let errorMsg = '';

          if (!rawNik) {
            isValid = false;
            errorMsg = 'NIK tidak ditemukan / tidak valid';
          } else if (!/^\d{4}-\d{2}-\d{2}$/.test(validDate)) {
            isValid = false;
            errorMsg = 'Format tanggal harus YYYY-MM-DD';
          } else if (!rawShift) {
            isValid = false;
            errorMsg = 'Pilihan shift wajib diisi';
          }

          parsed.push({
            nik: rawNik,
            nama: rawNama || empMap[rawNik]?.nama || rawNik,
            tanggal: validDate,
            shift: rawShift,
            jam_masuk: rawJm,
            jam_pulang: rawJp,
            keterangan: rawKet,
            isValid,
            errorMsg,
          });
        }

        setParsedCsvRows(parsed);
        setIsImportModalOpen(true);
      } catch (err: any) {
        onShowToast(`Gagal membaca file CSV: ${err.message || 'Format tidak dikenali'}`, 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Execute Import Valid CSV Rows
  const handleExecuteImport = async () => {
    const validRows = parsedCsvRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      onShowToast('Tidak ada data valid yang dapat diimpor', 'warning');
      return;
    }

    setImporting(true);
    try {
      const payload = validRows.map((r) => ({
        nik: r.nik,
        tanggal: r.tanggal,
        shift: r.shift,
        jam_masuk: r.jam_masuk || null,
        jam_pulang: r.jam_pulang || null,
        keterangan: r.keterangan || 'Import CSV',
      }));

      const result = await batchSaveRosterShifts(payload);
      onShowToast(
        `Berhasil mengimpor ${result.success} jadwal shift ke database! Presensi otomatis disinkronkan.`,
        'success'
      );
      if (result.failed > 0) {
        onShowToast(`${result.failed} data gagal disimpan. Periksa kembali format data.`, 'warning');
      }
      setIsImportModalOpen(false);
      setParsedCsvRows([]);
      await loadData();
    } catch (err: any) {
      console.error('Execute import error:', err);
      onShowToast(`Gagal mengimpor jadwal: ${err.message || 'Error'}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  // Navigate weekly view
  const handlePrevWeek = () => {
    const d = new Date(weeklyAnchorDate);
    d.setDate(d.getDate() - 7);
    setWeeklyAnchorDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(weeklyAnchorDate);
    d.setDate(d.getDate() + 7);
    setWeeklyAnchorDate(d);
  };

  const handleTodayWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    setWeeklyAnchorDate(new Date(d.setDate(diff)));
  };

  // Helper badge color
  const getShiftBadgeStyle = (shiftName: string) => {
    const match = DEFAULT_SHIFTS[shiftName];
    if (match) {
      return { bg: match.badgeBg, text: match.badgeText };
    }
    const sLower = (shiftName || '').toLowerCase();
    if (sLower.includes('1')) return { bg: DEFAULT_SHIFTS['Shift 1'].badgeBg, text: DEFAULT_SHIFTS['Shift 1'].badgeText };
    if (sLower.includes('2')) return { bg: DEFAULT_SHIFTS['Shift 2'].badgeBg, text: DEFAULT_SHIFTS['Shift 2'].badgeText };
    if (sLower.includes('3')) return { bg: DEFAULT_SHIFTS['Shift 3'].badgeBg, text: DEFAULT_SHIFTS['Shift 3'].badgeText };
    if (sLower.includes('libur') || sLower.includes('off')) return { bg: DEFAULT_SHIFTS['Libur'].badgeBg, text: DEFAULT_SHIFTS['Libur'].badgeText };
    if (sLower.includes('cuti')) return { bg: DEFAULT_SHIFTS['Cuti'].badgeBg, text: DEFAULT_SHIFTS['Cuti'].badgeText };
    return { bg: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300' };
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* TOP STATS & ACTIONS BAR */}
      <div className="bg-white dark:bg-[#131d31] rounded-3xl p-4 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-primary-500/10 text-primary-500 dark:text-primary-400">
                <Calendar className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Jadwal Roster Shift Gudang
              </h2>
              {userIsAdmin ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <Shield className="w-3 h-3" /> Admin Mode
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  <Lock className="w-3 h-3" /> Mode Tinjau
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Pengaturan shift tim gudang & pembaruan otomatis status keterlambatan presensi
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Download Template CSV */}
            <button
              type="button"
              onClick={handleDownloadCsvTemplate}
              className="px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Download format CSV untuk import jadwal"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Template CSV</span>
            </button>

            {/* Export Roster CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Ekspor daftar jadwal roster saat ini ke file CSV"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>

            {/* Import CSV (Admin Only) */}
            {userIsAdmin && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleCsvFileUpload}
                  accept=".csv,text/csv"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Upload jadwal shift massal via CSV"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Import CSV</span>
                </button>

                {/* Add Shift Button */}
                <button
                  type="button"
                  onClick={() => handleOpenEdit()}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-primary-600 hover:bg-primary-500 text-white shadow-sm shadow-primary-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Shift</span>
                </button>
              </>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              title="Segarkan Data"
            >
              <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* SUMMARY STATS TILES */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800/80">
          <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-0.5">
              Total Jadwal
            </span>
            <span className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100">
              {summaryStats.total} <span className="text-[11px] font-normal text-slate-400">staf</span>
            </span>
          </div>

          <div className="bg-blue-50/50 dark:bg-blue-950/30 p-3 rounded-2xl border border-blue-100 dark:border-blue-900/40">
            <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider block mb-0.5">
              Shift 1 (08:00)
            </span>
            <span className="text-base sm:text-lg font-black text-blue-700 dark:text-blue-300">
              {summaryStats.s1}
            </span>
          </div>

          <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider block mb-0.5">
              Shift 2 (09:00)
            </span>
            <span className="text-base sm:text-lg font-black text-indigo-700 dark:text-indigo-300">
              {summaryStats.s2}
            </span>
          </div>

          <div className="bg-purple-50/50 dark:bg-purple-950/30 p-3 rounded-2xl border border-purple-100 dark:border-purple-900/40">
            <span className="text-[10px] font-black text-purple-500 uppercase tracking-wider block mb-0.5">
              Shift 3 (12:00)
            </span>
            <span className="text-base sm:text-lg font-black text-purple-700 dark:text-purple-300">
              {summaryStats.s3}
            </span>
          </div>

          <div className="bg-rose-50/50 dark:bg-rose-950/30 p-3 rounded-2xl border border-rose-100 dark:border-rose-900/40">
            <span className="text-[10px] font-black text-rose-500 uppercase tracking-wider block mb-0.5">
              Libur / Off
            </span>
            <span className="text-base sm:text-lg font-black text-rose-700 dark:text-rose-300">
              {summaryStats.libur}
            </span>
          </div>

          <div className="bg-amber-50/50 dark:bg-amber-950/30 p-3 rounded-2xl border border-amber-100 dark:border-amber-900/40">
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-wider block mb-0.5">
              Cuti / Izin
            </span>
            <span className="text-base sm:text-lg font-black text-amber-700 dark:text-amber-300">
              {summaryStats.cuti}
            </span>
          </div>
        </div>
      </div>

      {/* FILTER & VIEW CONTROLS */}
      <div className="bg-white dark:bg-[#131d31] rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Left: Search & Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari NIK, Nama staf, Divisi..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 text-slate-800 dark:text-slate-100 font-medium"
            />
          </div>

          {/* Date Picker */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 text-slate-800 dark:text-slate-100 font-bold"
            />
          </div>

          {/* Shift Filter Dropdown */}
          <select
            value={selectedShift}
            onChange={(e) => setSelectedShift(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 text-slate-800 dark:text-slate-100 font-bold"
          >
            <option value="all">Semua Shift</option>
            <option value="Shift 1">Shift 1 (08:00)</option>
            <option value="Shift 2">Shift 2 (09:00)</option>
            <option value="Shift 3">Shift 3 (12:00)</option>
            <option value="Libur">Libur (Off)</option>
            <option value="Cuti">Cuti / Izin</option>
          </select>

          {/* Department Filter */}
          {departments.length > 0 && (
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 text-slate-800 dark:text-slate-100 font-bold"
            >
              <option value="all">Semua Divisi</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          {/* Reset Filters */}
          {(searchQuery || selectedShift !== 'all' || selectedDepartment !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedShift('all');
                setSelectedDepartment('all');
              }}
              className="p-2 rounded-xl text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Right: View Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white dark:bg-[#131d31] text-primary-600 dark:text-primary-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Tabel</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-white dark:bg-[#131d31] text-primary-600 dark:text-primary-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Kartu</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('weekly')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'weekly'
                ? 'bg-white dark:bg-[#131d31] text-primary-600 dark:text-primary-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Mingguan</span>
          </button>
        </div>
      </div>

      {/* MAIN VIEW CONTENTS */}
      {loading ? (
        <div className="bg-white dark:bg-[#131d31] rounded-3xl p-12 border border-slate-200/80 dark:border-slate-800 flex flex-col items-center justify-center">
          <RotateCcw className="w-8 h-8 text-primary-500 animate-spin mb-3" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Memuat Jadwal Roster Shift...</p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black tracking-wider">
                  <th className="py-3.5 px-4">Tanggal</th>
                  <th className="py-3.5 px-4">Karyawan / Staf</th>
                  <th className="py-3.5 px-4">Divisi & Jabatan</th>
                  <th className="py-3.5 px-4">Shift & Jam Kerja</th>
                  <th className="py-3.5 px-4">Catatan / Tugas</th>
                  <th className="py-3.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                {filteredRoster.map((r) => {
                  const emp = empMap[r.nik];
                  const badgeStyle = getShiftBadgeStyle(r.shift);
                  const isInlineOpen = inlineOpenRowId === r.id;
                  const isInlineSaving = inlineSavingRowId === r.id;

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Tanggal */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.tanggal}
                      </td>

                      {/* Karyawan */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 font-black flex items-center justify-center text-xs shrink-0">
                            {emp?.nama ? emp.nama.slice(0, 2).toUpperCase() : r.nik.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 dark:text-white">
                              {emp?.nama || r.nik}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              NIK: {r.nik}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Divisi & Jabatan */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold">
                          {emp?.divisi || 'Warehouse'}
                        </span>
                        {emp?.jabatan && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{emp.jabatan}</div>
                        )}
                      </td>

                      {/* Shift & Quick Inline Droplist */}
                      <td className="py-3 px-4 relative">
                        {userIsAdmin ? (
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={() => setInlineOpenRowId(isInlineOpen ? null : r.id)}
                              disabled={isInlineSaving}
                              className={`px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${badgeStyle.bg} ${badgeStyle.text} hover:opacity-85 shadow-2xs`}
                              title="Klik untuk ubah shift cepat"
                            >
                              {isInlineSaving ? (
                                <RotateCcw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Clock className="w-3 h-3 opacity-70" />
                              )}
                              <span>{r.shift}</span>
                              <ChevronDown className="w-3 h-3 opacity-60" />
                            </button>

                            {/* Dropdown Menu for Quick Change */}
                            {isInlineOpen && (
                              <div className="absolute left-0 top-full mt-1.5 z-40 w-48 bg-white dark:bg-[#131d31] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 animate-in fade-in zoom-in-95 duration-100">
                                <div className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                  Pilih Shift Cepat
                                </div>
                                {allShiftOptions.map((opt) => (
                                  <button
                                    key={opt.name}
                                    type="button"
                                    onClick={() => handleQuickInlineShiftChange(r, opt.name)}
                                    className={`w-full px-3 py-2 text-left text-xs font-bold flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                                      r.shift === opt.name
                                        ? 'text-primary-600 dark:text-primary-400 bg-primary-50/50 dark:bg-primary-950/30'
                                        : 'text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <div>
                                      <div className="font-extrabold">{opt.name}</div>
                                      <div className="text-[10px] font-normal text-slate-400">
                                        {opt.masuk ? `${opt.masuk} - ${opt.pulang}` : 'Non-Aktif'}
                                      </div>
                                    </div>
                                    {r.shift === opt.name && <Check className="w-3.5 h-3.5 text-primary-500" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 ${badgeStyle.bg} ${badgeStyle.text}`}
                          >
                            <Clock className="w-3 h-3 opacity-70" />
                            <span>{r.shift}</span>
                          </span>
                        )}

                        {r.jam_masuk && r.jam_pulang && (
                          <div className="text-[10px] font-mono text-slate-400 mt-1">
                            {r.jam_masuk} - {r.jam_pulang}
                          </div>
                        )}
                      </td>

                      {/* Catatan */}
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {r.keterangan || '-'}
                      </td>

                      {/* Aksi (Admin Only) */}
                      <td className="py-3 px-4 text-right">
                        {userIsAdmin ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(r)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-950 dark:hover:text-primary-400 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                              title="Edit Jadwal Shift Lengkap"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteShift(r.id)}
                              disabled={deletingId === r.id}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                              title="Hapus Jadwal"
                            >
                              {deletingId === r.id ? (
                                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-[10px] italic">
                            Read-only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredRoster.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center">
                        <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          Tidak ada jadwal roster shift yang sesuai kriteria pencarian
                        </p>
                        {userIsAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit()}
                            className="mt-3 px-3.5 py-1.5 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 font-bold text-xs hover:bg-primary-500/20 cursor-pointer"
                          >
                            + Tambah Jadwal Shift Baru
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filteredRoster.map((r) => {
            const emp = empMap[r.nik];
            const badgeStyle = getShiftBadgeStyle(r.shift);

            return (
              <div
                key={r.id}
                className="bg-white dark:bg-[#131d31] rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 font-black flex items-center justify-center text-sm">
                        {emp?.nama ? emp.nama.slice(0, 2).toUpperCase() : r.nik.slice(0, 2)}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white leading-tight">
                          {emp?.nama || r.nik}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400 block">
                          NIK: {r.nik}
                        </span>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      {emp?.divisi || 'Warehouse'}
                    </span>
                  </div>

                  <div className="space-y-2 py-2 border-y border-slate-100 dark:border-slate-800/80 my-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Tanggal:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                        {r.tanggal}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Shift:</span>
                      <span
                        className={`px-2 py-0.5 rounded-lg font-extrabold border ${badgeStyle.bg} ${badgeStyle.text}`}
                      >
                        {r.shift}
                      </span>
                    </div>

                    {r.jam_masuk && r.jam_pulang && (
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400 font-sans">Jam Kerja:</span>
                        <span className="text-slate-600 dark:text-slate-300 font-bold">
                          {r.jam_masuk} - {r.jam_pulang}
                        </span>
                      </div>
                    )}

                    {r.keterangan && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl">
                        "{r.keterangan}"
                      </div>
                    )}
                  </div>
                </div>

                {userIsAdmin && (
                  <div className="flex items-center justify-end gap-2 pt-2 mt-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(r)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-950 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteShift(r.id)}
                      disabled={deletingId === r.id}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {filteredRoster.length === 0 && (
            <div className="col-span-full bg-white dark:bg-[#131d31] rounded-3xl p-12 text-center text-slate-400 border border-slate-200/80 dark:border-slate-800">
              Tidak ada data shift yang ditemukan
            </div>
          )}
        </div>
      ) : (
        /* WEEKLY MATRIX VIEW */
        <div className="bg-white dark:bg-[#131d31] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-4 sm:p-5 overflow-hidden">
          {/* Weekly Header Navigator */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevWeek}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Minggu Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleTodayWeek}
                className="px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Minggu Ini
              </button>
              <button
                type="button"
                onClick={handleNextWeek}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Minggu Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs font-black text-slate-700 dark:text-slate-300">
              Periode: {weeklyDays[0]?.formattedDate} s/d {weeklyDays[6]?.formattedDate}
            </span>
          </div>

          {/* Weekly Matrix Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-3 font-black text-slate-500 uppercase text-[10px] min-w-[140px]">
                    Staf Karyawan
                  </th>
                  {weeklyDays.map((d) => (
                    <th
                      key={d.dateStr}
                      className={`py-3 px-2 text-center min-w-[100px] ${
                        d.dateStr === new Date().toISOString().slice(0, 10)
                          ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 font-black'
                          : 'text-slate-500 font-bold'
                      }`}
                    >
                      <div className="text-[11px]">{d.dayName}</div>
                      <div className="text-[10px] font-mono opacity-70">{d.formattedDate}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                {karyawanList
                  .filter((k) => selectedDepartment === 'all' || k.divisi === selectedDepartment)
                  .filter((k) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      k.nik.toLowerCase().includes(q) ||
                      k.nama.toLowerCase().includes(q) ||
                      (k.divisi && k.divisi.toLowerCase().includes(q))
                    );
                  })
                  .map((k) => (
                    <tr key={k.nik} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-2.5 px-3">
                        <div className="font-extrabold text-slate-900 dark:text-white truncate max-w-[130px]">
                          {k.nama}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">{k.nik}</div>
                      </td>

                      {weeklyDays.map((day) => {
                        const shiftRec = rosterList.find(
                          (r) => r.nik === k.nik && r.tanggal === day.dateStr
                        );
                        const sName = shiftRec?.shift || '-';
                        const badgeStyle = getShiftBadgeStyle(sName);

                        return (
                          <td key={day.dateStr} className="py-2.5 px-1.5 text-center">
                            {shiftRec ? (
                              <button
                                type="button"
                                onClick={() => userIsAdmin && handleOpenEdit(shiftRec)}
                                className={`w-full py-1.5 px-1 rounded-xl text-[11px] font-extrabold border transition-all truncate block ${badgeStyle.bg} ${badgeStyle.text} ${
                                  userIsAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                                }`}
                                title={
                                  userIsAdmin
                                    ? `Klik untuk edit shift ${k.nama} pada ${day.dateStr}`
                                    : undefined
                                }
                              >
                                {sName}
                              </button>
                            ) : userIsAdmin ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingShift({
                                    nik: k.nik,
                                    tanggal: day.dateStr,
                                    shift: 'Shift 1',
                                    jam_masuk: '08:00',
                                    jam_pulang: '17:00',
                                    keterangan: '',
                                  });
                                  setIsEditModalOpen(true);
                                }}
                                className="w-full py-1 px-1 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-600 hover:border-primary-400 hover:text-primary-500 text-[10px] font-bold cursor-pointer"
                                title={`Atur shift untuk ${k.nama} (${day.dateStr})`}
                              >
                                + Shift
                              </button>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT / TAMBAH SHIFT MODAL WITH DROPSEARCH / DROPLIST */}
      {isEditModalOpen && editingShift && (
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
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary-500" />
                    Kalkulasi keterlambatan & presensi diperbarui otomatis
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
              {/* Employee DropSearch Selection */}
              <div ref={employeeDropdownRef} className="relative">
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Karyawan / Staf Gudang (DropSearch)
                </label>
                
                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsEmployeeDropdownOpen(!isEmployeeDropdownOpen)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-slate-800 dark:text-white hover:border-primary-500 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Users className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                    {editingShift.nik ? (
                      <span>
                        <strong className="text-primary-600 dark:text-primary-400">
                          {empMap[editingShift.nik]?.nama || editingShift.nik}
                        </strong>{' '}
                        <span className="text-slate-400 font-mono text-[11px]">
                          ({editingShift.nik}) - {empMap[editingShift.nik]?.divisi || 'Warehouse'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">Pilih Karyawan / Staf...</span>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </button>

                {/* DropSearch Popup */}
                {isEmployeeDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#131d31] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 max-h-60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={employeeSearchText}
                        onChange={(e) => setEmployeeSearchText(e.target.value)}
                        placeholder="Ketik NIK atau Nama Staf..."
                        autoFocus
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-primary-500 text-slate-800 dark:text-slate-100 font-medium"
                      />
                    </div>

                    <div className="overflow-y-auto space-y-1 flex-1 max-h-48 pr-1">
                      {filteredEmployeesForModal.map((k) => (
                        <button
                          key={k.nik}
                          type="button"
                          onClick={() => {
                            setEditingShift({ ...editingShift, nik: k.nik });
                            setIsEmployeeDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                            editingShift.nik === k.nik
                              ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/30'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="font-extrabold">{k.nama}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {k.nik} • {k.divisi || 'Warehouse'} {k.jabatan ? `• ${k.jabatan}` : ''}
                            </div>
                          </div>
                          {editingShift.nik === k.nik && <Check className="w-4 h-4 text-primary-500" />}
                        </button>
                      ))}
                      {filteredEmployeesForModal.length === 0 && (
                        <div className="p-3 text-center text-xs text-slate-400 font-normal">
                          Karyawan tidak ditemukan
                        </div>
                      )}
                    </div>
                  </div>
                )}
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

              {/* Shift Selection: DropSearch / Droplist */}
              <div ref={shiftDropdownRef} className="relative">
                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Pilihan Shift (Droplist & DropSearch)
                </label>

                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsShiftDropdownOpen(!isShiftDropdownOpen)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-left font-bold text-slate-800 dark:text-white hover:border-primary-500 transition-colors cursor-pointer mb-2"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Clock className="w-3.5 h-3.5 text-primary-500 shrink-0" />
                    <span>
                      <strong className="text-primary-600 dark:text-primary-400 font-black">
                        {editingShift.shift || 'Pilih Shift'}
                      </strong>
                      {editingShift.jam_masuk && editingShift.jam_pulang && (
                        <span className="text-slate-400 font-mono text-[11px] ml-2">
                          ({editingShift.jam_masuk} - {editingShift.jam_pulang})
                        </span>
                      )}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </button>

                {/* DropSearch Popup */}
                {isShiftDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#131d31] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 max-h-60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={shiftSearchText}
                        onChange={(e) => setShiftSearchText(e.target.value)}
                        placeholder="Cari Shift (Shift 1, Shift 2, Libur, Cuti...)"
                        autoFocus
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-primary-500 text-slate-800 dark:text-slate-100 font-medium"
                      />
                    </div>

                    <div className="overflow-y-auto space-y-1 flex-1 max-h-48 pr-1">
                      {filteredShiftsForModal.map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => handleSelectShift(opt.name)}
                          className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                            editingShift.shift === opt.name
                              ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/30'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="font-extrabold">{opt.name}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {opt.masuk ? `${opt.masuk} - ${opt.pulang}` : 'Non-Aktif / Hari Libur'}
                            </div>
                          </div>
                          {editingShift.shift === opt.name && <Check className="w-4 h-4 text-primary-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Shift Pills for Instant 1-Click Select */}
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.keys(DEFAULT_SHIFTS).map((key) => {
                    const preset = DEFAULT_SHIFTS[key];
                    const isSelected = editingShift.shift === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectShift(key)}
                        className={`p-2 rounded-xl text-left border text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary-500/10 border-primary-500 text-primary-600 dark:text-primary-400 ring-2 ring-primary-500/20'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                        }`}
                      >
                        <div className="font-extrabold text-[11px] truncate">{key}</div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {preset.masuk ? `${preset.masuk}-${preset.pulang}` : 'Off'}
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
                    Jam Masuk (Otomatis dari Shift)
                  </label>
                  <input
                    type="time"
                    value={editingShift.jam_masuk || ''}
                    onChange={(e) => setEditingShift({ ...editingShift, jam_masuk: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Jam Pulang (Otomatis dari Shift)
                  </label>
                  <input
                    type="time"
                    value={editingShift.jam_pulang || ''}
                    onChange={(e) => setEditingShift({ ...editingShift, jam_pulang: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-primary-500 dark:text-white font-mono font-bold"
                  />
                </div>
              </div>

              {/* Auto Sync Presensi Info Callout */}
              <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Sinkronisasi Presensi Otomatis:</strong> Mengubah shift ini akan langsung memperbarui kalkulasi keterlambatan presensi karyawan pada tanggal tersebut.
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
                    <span>{editingShift.id ? 'Simpan & Hitung Ulang' : 'Tambah Jadwal'}</span>
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
