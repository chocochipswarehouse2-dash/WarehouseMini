import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Receipt,
  FileSpreadsheet,
  Upload,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Check,
  X,
  Plus,
  Download,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Sparkles,
  ArrowUpDown,
  Tag,
  MoreHorizontal,
  Table as TableIcon,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Settings,
  Loader2,
} from 'lucide-react';
import { UserSession } from '../types';
import { canManageJneRekap } from '../services/permissions';
import { AppActionSheet, AppActionGroup } from './common/AppActionSheet';
import {
  JneDetectedRecord,
  JneDeskripsiCategory,
  DEFAULT_AGEN_NAME,
  DEFAULT_JNE_SERVICE,
  DEFAULT_SHIPPER_NAME,
  classifyJneDeskripsi,
  cleanResi,
  formatDisplayDateJne,
  normalizeDate,
  normalizeJneService,
  normalizeNominal,
  parseJneImportFile,
  parsePastedJneText,
} from '../services/jneRekapParser';
import {
  JNE_GSHEET_URL,
  JNE_SHEET_NAME,
  DEFAULT_JNE_GAS_URL,
  fetchJneRecordsFromGas,
  upsertJneRecordsToGas,
  updateDeskripsiToGas,
  bulkUpdateDeskripsiToGas,
  updateSingleJneRecordToGas,
  deleteJneRecordsFromGas,
  exportJneRecordsToExcel,
  exportJneRecordsToCsv,
  getLocalCachedJneRecords,
  saveLocalCachedJneRecords,
  getStoredJneGasUrl,
  saveStoredJneGasUrl,
} from '../services/jneRekapService';

interface JneRekapViewProps {
  session: UserSession | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

type CategoryTab = 'ALL' | 'EMPTY' | 'FILLED' | JneDeskripsiCategory;
type AddModalTab = 'import' | 'manual' | 'paste';
type DuplicateHandlingMode = 'fill_empty_desc' | 'skip_existing' | 'overwrite_all';

const DESKRIPSI_QUICK_PRESETS = [
  '#MS',
  'Website ',
  'ORDER ID #',
  'Retur #',
  'PR Seeding ',
  'MANUAL SHIPMENT - ',
  'Titipan HRD',
  'Sample QC & Fitting',
];

const SERVICE_QUICK_CHIPS = ['CTC23', 'REG23', 'CTCYES23', 'YES23', 'JTR23', 'OKE23'];
const SHIPPER_PRESETS = ['CCH-CHOCOCHIPS', 'CCH-ERICA STEPHANIE'];

const VIEW_MODE_STORAGE_KEY = 'wms_jne_rekap_view_mode';

export const JneRekapView: React.FC<JneRekapViewProps> = ({ session, onShowToast }) => {
  const canManage = useMemo(() => canManageJneRekap(session), [session]);
  const operatorName = session?.username || 'WMS User';

  // View Mode (2-Mode Standard: Tabel & Kartu)
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'table' || saved === 'card') return saved;
      return window.innerWidth < 768 ? 'card' : 'table';
    }
    return 'table';
  });

  const handleSetViewMode = (mode: 'table' | 'card') => {
    setViewMode(mode);
    try {
      sessionStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {}
  };

  // Core Data State
  const [records, setRecords] = useState<JneDetectedRecord[]>(() => getLocalCachedJneRecords());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncSource, setSyncSource] = useState<'gas' | 'gviz' | 'cache' | null>(null);

  // Per-row saving status for inline Kolom D sync
  const [savingResiSet, setSavingResiSet] = useState<Set<string>>(new Set());
  const [savedFlashResiSet, setSavedFlashResiSet] = useState<Set<string>>(new Set());

  // Filter, Search, Sort & Pagination
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [shipperFilter, setShipperFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_desc' | 'amount_asc' | 'resi_asc'>('newest');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Selection (keyed by clean Cnote No)
  const [selectedResiSet, setSelectedResiSet] = useState<Set<string>>(new Set());

  // Inline Editing Kolom D (Deskripsi pengiriman)
  const [editingResi, setEditingResi] = useState<string | null>(null);
  const [editDeskripsiValue, setEditDeskripsiValue] = useState<string>('');
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  // Utility Popover Header (`⋯`)
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState<boolean>(false);
  const utilityMenuRef = useRef<HTMLDivElement | null>(null);

  // Row Action Sheet (`⋯`)
  const [actionSheetRecord, setActionSheetRecord] = useState<JneDetectedRecord | null>(null);

  // Unified Add / Import Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addModalTab, setAddModalTab] = useState<AddModalTab>('import');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsingProgress, setParsingProgress] = useState<number>(0);
  const [parsingStatusLabel, setParsingStatusLabel] = useState<string>('');
  const [stagingRecords, setStagingRecords] = useState<JneDetectedRecord[]>([]);
  const [stagingSourceInfo, setStagingSourceInfo] = useState<string>('');
  const [duplicateMode, setDuplicateMode] = useState<DuplicateHandlingMode>('fill_empty_desc');
  const [isSubmittingStaging, setIsSubmittingStaging] = useState<boolean>(false);
  const [pasteRawText, setPasteRawText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Manual Single Add Form
  const [manualForm, setManualForm] = useState({
    no_resi: '',
    deskripsi: '',
    layanan: DEFAULT_JNE_SERVICE,
    nama_tujuan: '',
    alamat_tujuan: '',
    nama_pengirim: DEFAULT_SHIPPER_NAME,
    nominal: '',
    tanggal: normalizeDate(new Date()),
    agen: DEFAULT_AGEN_NAME,
  });
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);

  // Full Row Edit Modal (Admin & Warehouse)
  const [editingFullRecord, setEditingFullRecord] = useState<{
    original_no_resi: string;
    row_number?: number;
    no?: string | number;
    no_resi: string;
    deskripsi: string;
    layanan: string;
    nama_tujuan: string;
    alamat_tujuan: string;
    nama_pengirim: string;
    nominal: string;
    tanggal: string;
    agen: string;
  } | null>(null);
  const [isSavingFullEdit, setIsSavingFullEdit] = useState<boolean>(false);

  // Batch Deskripsi Modal
  const [isBatchDescModalOpen, setIsBatchDescModalOpen] = useState<boolean>(false);
  const [batchDescValue, setBatchDescValue] = useState<string>('');
  const [isSavingBatchDesc, setIsSavingBatchDesc] = useState<boolean>(false);

  // Delete Confirmation Modal (Admin & Warehouse)
  const [deleteTargetResis, setDeleteTargetResis] = useState<string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // GAS Endpoint Settings Modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [gasUrlInput, setGasUrlInput] = useState<string>(() => getStoredJneGasUrl());

  // Fetch data live dari GSheet JNEMember
  const handleRefreshFromGsheet = useCallback(
    async (silent: boolean = false) => {
      setIsLoading(true);
      try {
        const res = await fetchJneRecordsFromGas();
        if (res.records) {
          setRecords(res.records);
        }
        setSyncSource(res.source || null);
        if (res.success) {
          setLastSyncTime(
            new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          );
          if (!silent && res.message) {
            onShowToast(res.message, 'success');
          }
        } else if (!silent && res.error) {
          onShowToast(res.error, 'warning');
        }
      } catch (err: any) {
        if (!silent) {
          onShowToast(`Gagal memuat GSheet JNEMember: ${err?.message || String(err)}`, 'error');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [onShowToast]
  );

  useEffect(() => {
    handleRefreshFromGsheet(true);
  }, [handleRefreshFromGsheet]);

  // Focus inline input automatically
  useEffect(() => {
    if (editingResi && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [editingResi]);

  // Close utility popover on outside click
  useEffect(() => {
    if (!isUtilityMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (utilityMenuRef.current && !utilityMenuRef.current.contains(e.target as Node)) {
        setIsUtilityMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isUtilityMenuOpen]);

  // Process uploaded or pasted files into staging table
  const handleProcessFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setIsAddModalOpen(true);
      setAddModalTab('import');
      setIsParsing(true);
      setParsingProgress(10);

      let collected: JneDetectedRecord[] = [];
      const sourceLabels: string[] = [];
      let lastEngineLabel = '';

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setParsingStatusLabel(`Memproses ${file.name} (${i + 1}/${files.length})...`);
          const res = await parseJneImportFile(file, (pct) => {
            const base = Math.round((i / files.length) * 100);
            const slice = Math.round((pct / files.length));
            setParsingProgress(Math.min(99, base + slice));
          });

          if (res.success && res.records.length > 0) {
            collected = collected.concat(res.records);
            sourceLabels.push(file.name);
            if (res.engine === 'gemini-vision') lastEngineLabel = 'AI Vision';
            else if (res.engine === 'xlsx') lastEngineLabel = 'Excel/CSV';
            else if (res.engine === 'pdf-text') lastEngineLabel = 'PDF';
            else if (res.engine === 'ocr-fallback') lastEngineLabel = 'OCR';
          } else if (files.length === 1) {
            onShowToast(
              res.error || `Tidak ada nomor resi JNE yang terdeteksi dari ${file.name}.`,
              'warning'
            );
          }
        }

        if (collected.length > 0) {
          setStagingRecords((prev) => {
            const mergedMap = new Map<string, JneDetectedRecord>();
            prev.forEach((item) => mergedMap.set(cleanResi(item.no_resi), item));
            collected.forEach((item) => mergedMap.set(cleanResi(item.no_resi), item));
            return Array.from(mergedMap.values());
          });
          const labelSummary = `${sourceLabels.join(', ')}${lastEngineLabel ? ` • via ${lastEngineLabel}` : ''}`;
          setStagingSourceInfo(labelSummary);
          onShowToast(
            `Berhasil mengekstrak ${collected.length} baris resi JNE ke tabel pratinjau!`,
            'success'
          );
        }
      } catch (err: any) {
        onShowToast(`Gagal memparsing lampiran: ${err?.message || String(err)}`, 'error');
      } finally {
        setIsParsing(false);
        setParsingProgress(0);
        setParsingStatusLabel('');
      }
    },
    [onShowToast]
  );

  // Global Paste Screenshot (`Ctrl+V`) support
  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = item.type.split('/')[1] || 'png';
            const namedFile = new File(
              [blob],
              `Screenshot_JNE_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.${ext}`,
              { type: item.type }
            );
            imageFiles.push(namedFile);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleProcessFiles(imageFiles);
      }
    };

    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [handleProcessFiles]);

  // O(1) Map of existing Cnote No in GSheet JNEMember
  const existingRecordByResiMap = useMemo(() => {
    const map = new Map<string, JneDetectedRecord>();
    for (const r of records) {
      const key = cleanResi(r.no_resi);
      if (key) map.set(key, r);
    }
    return map;
  }, [records]);

  // Distinct Services & Shippers for dynamic filter dropdowns
  const { distinctServices, distinctShippers } = useMemo(() => {
    const sSet = new Set<string>();
    const shSet = new Set<string>();
    for (const r of records) {
      if (r.layanan) sSet.add(r.layanan.toUpperCase());
      if (r.nama_pengirim) shSet.add(r.nama_pengirim);
    }
    return {
      distinctServices: Array.from(sSet).sort(),
      distinctShippers: Array.from(shSet).sort(),
    };
  }, [records]);

  // Category Counts (computed in single O(N) pass)
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryTab, number> = {
      ALL: records.length,
      EMPTY: 0,
      FILLED: 0,
      MANUAL_SHIPMENT: 0,
      WEBSITE: 0,
      RETUR: 0,
      PR_SEEDING: 0,
      OTHER: 0,
    };
    for (const r of records) {
      const cat = classifyJneDeskripsi(r.deskripsi);
      counts[cat] = (counts[cat] || 0) + 1;
      if (cat === 'EMPTY') counts.EMPTY++;
      else counts.FILLED++;
    }
    return counts;
  }, [records]);

  // Filtered & Sorted Records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = records.filter((r) => {
      if (categoryTab === 'EMPTY' && r.deskripsi.trim() !== '') return false;
      if (categoryTab === 'FILLED' && r.deskripsi.trim() === '') return false;
      if (
        categoryTab !== 'ALL' &&
        categoryTab !== 'EMPTY' &&
        categoryTab !== 'FILLED' &&
        classifyJneDeskripsi(r.deskripsi) !== categoryTab
      ) {
        return false;
      }

      if (serviceFilter !== 'ALL' && r.layanan.toUpperCase() !== serviceFilter) return false;
      if (shipperFilter !== 'ALL' && r.nama_pengirim !== shipperFilter) return false;
      if (startDate && r.tanggal && r.tanggal < startDate) return false;
      if (endDate && r.tanggal && r.tanggal > endDate) return false;

      if (q) {
        const hay = `${r.no_resi} ${r.deskripsi} ${r.nama_tujuan} ${r.alamat_tujuan} ${r.layanan} ${r.nama_pengirim} ${r.agen}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        const cmpDate = (b.tanggal || '').localeCompare(a.tanggal || '');
        if (cmpDate !== 0) return cmpDate;
        return (b.row_number || 0) - (a.row_number || 0);
      }
      if (sortBy === 'oldest') {
        const cmpDate = (a.tanggal || '').localeCompare(b.tanggal || '');
        if (cmpDate !== 0) return cmpDate;
        return (a.row_number || 0) - (b.row_number || 0);
      }
      if (sortBy === 'amount_desc') return (b.nominal || 0) - (a.nominal || 0);
      if (sortBy === 'amount_asc') return (a.nominal || 0) - (b.nominal || 0);
      return a.no_resi.localeCompare(b.no_resi);
    });

    return filtered;
  }, [records, categoryTab, serviceFilter, shipperFilter, startDate, endDate, searchQuery, sortBy]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryTab, serviceFilter, shipperFilter, startDate, endDate, searchQuery, sortBy, pageSize]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRecords.length / pageSize)),
    [filteredRecords.length, pageSize]
  );

  const paginatedRecords = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredRecords.slice(startIdx, startIdx + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  // Summary Metrics for Filtered Set
  const metrics = useMemo(() => {
    let totalAmount = 0;
    let emptyCount = 0;
    let filledCount = 0;
    for (const r of filteredRecords) {
      totalAmount += r.nominal || 0;
      if (r.deskripsi.trim()) filledCount++;
      else emptyCount++;
    }
    const avgAmount = filteredRecords.length > 0 ? Math.round(totalAmount / filteredRecords.length) : 0;
    return { totalAmount, emptyCount, filledCount, avgAmount };
  }, [filteredRecords]);

  const activeAdvancedFilterCount = useMemo(() => {
    let cnt = 0;
    if (serviceFilter !== 'ALL') cnt++;
    if (shipperFilter !== 'ALL') cnt++;
    if (startDate) cnt++;
    if (endDate) cnt++;
    return cnt;
  }, [serviceFilter, shipperFilter, startDate, endDate]);

  const selectedSummary = useMemo(() => {
    let totalNominal = 0;
    const list: JneDetectedRecord[] = [];
    selectedResiSet.forEach((resiKey) => {
      const rec = existingRecordByResiMap.get(resiKey);
      if (rec) {
        list.push(rec);
        totalNominal += rec.nominal || 0;
      }
    });
    return { count: list.length, totalNominal, list };
  }, [selectedResiSet, existingRecordByResiMap]);

  const resetAllFilters = () => {
    setCategoryTab('ALL');
    setSearchQuery('');
    setServiceFilter('ALL');
    setShipperFilter('ALL');
    setStartDate('');
    setEndDate('');
  };

  const applyQuickDateRange = (days: number | 'this_month' | 'all') => {
    if (days === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }
    const now = new Date();
    const endIso = normalizeDate(now);
    if (days === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(normalizeDate(firstDay));
      setEndDate(endIso);
      return;
    }
    const past = new Date(now.getTime() - (days - 1) * 86400 * 1000);
    setStartDate(normalizeDate(past));
    setEndDate(endIso);
  };

  // Start Inline Edit Kolom D
  const startInlineEditDeskripsi = (rec: JneDetectedRecord) => {
    setEditingResi(cleanResi(rec.no_resi));
    setEditDeskripsiValue(rec.deskripsi || '');
  };

  // Save Inline Kolom D to GSheet JNEMember (+ optional auto-advance to next row)
  const commitInlineDeskripsi = async (targetResi: string, advanceNext: boolean = false) => {
    const cleanTarget = cleanResi(targetResi);
    const trimmedDesc = editDeskripsiValue.trim();
    const existing = existingRecordByResiMap.get(cleanTarget);

    // Determine next visible row if Enter was pressed
    let nextRowToEdit: JneDetectedRecord | null = null;
    if (advanceNext) {
      const currIdx = paginatedRecords.findIndex((r) => cleanResi(r.no_resi) === cleanTarget);
      if (currIdx !== -1 && currIdx + 1 < paginatedRecords.length) {
        nextRowToEdit = paginatedRecords[currIdx + 1];
      }
    }

    if (nextRowToEdit) {
      setEditingResi(cleanResi(nextRowToEdit.no_resi));
      setEditDeskripsiValue(nextRowToEdit.deskripsi || '');
    } else {
      setEditingResi(null);
    }

    if (existing && (existing.deskripsi || '').trim() === trimmedDesc) {
      return;
    }

    // Optimistic UI update
    setRecords((prev) => {
      const next = prev.map((r) =>
        cleanResi(r.no_resi) === cleanTarget ? { ...r, deskripsi: trimmedDesc } : r
      );
      saveLocalCachedJneRecords(next);
      return next;
    });

    setSavingResiSet((prev) => new Set(prev).add(cleanTarget));
    try {
      const res = await updateDeskripsiToGas(cleanTarget, trimmedDesc, operatorName);
      if (res.success) {
        setSavedFlashResiSet((prev) => new Set(prev).add(cleanTarget));
        setTimeout(() => {
          setSavedFlashResiSet((prev) => {
            const n = new Set(prev);
            n.delete(cleanTarget);
            return n;
          });
        }, 2200);
      } else {
        onShowToast(
          `Gagal simpan Kolom D Cnote ${cleanTarget} ke GSheet: ${res.error || 'Unknown error'}`,
          'error'
        );
      }
    } finally {
      setSavingResiSet((prev) => {
        const n = new Set(prev);
        n.delete(cleanTarget);
        return n;
      });
    }
  };

  // Toggle selection
  const toggleSelectResi = (noResi: string) => {
    const key = cleanResi(noResi);
    setSelectedResiSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isAllCurrentPageSelected =
    paginatedRecords.length > 0 &&
    paginatedRecords.every((r) => selectedResiSet.has(cleanResi(r.no_resi)));

  const toggleSelectCurrentPage = () => {
    setSelectedResiSet((prev) => {
      const next = new Set(prev);
      if (isAllCurrentPageSelected) {
        paginatedRecords.forEach((r) => next.delete(cleanResi(r.no_resi)));
      } else {
        paginatedRecords.forEach((r) => next.add(cleanResi(r.no_resi)));
      }
      return next;
    });
  };

  // Batch update Kolom D
  const handleSaveBatchDeskripsi = async () => {
    if (selectedSummary.count === 0) return;
    const descVal = batchDescValue.trim();
    setIsSavingBatchDesc(true);

    try {
      const updates = selectedSummary.list.map((r) => ({
        no_resi: r.no_resi,
        deskripsi: descVal,
      }));
      const res = await bulkUpdateDeskripsiToGas(updates, operatorName);
      if (res.success) {
        const selKeys = new Set(updates.map((u) => cleanResi(u.no_resi)));
        setRecords((prev) => {
          const next = prev.map((r) =>
            selKeys.has(cleanResi(r.no_resi)) ? { ...r, deskripsi: descVal } : r
          );
          saveLocalCachedJneRecords(next);
          return next;
        });
        setIsBatchDescModalOpen(false);
        setBatchDescValue('');
        setSelectedResiSet(new Set());
        onShowToast(
          res.message || `${updates.length} baris Kolom D berhasil disimpan ke GSheet JNEMember.`,
          'success'
        );
      } else {
        onShowToast(res.error || 'Gagal menyimpan deskripsi massal ke GSheet.', 'error');
      }
    } finally {
      setIsSavingBatchDesc(false);
    }
  };

  // Submit Manual Single Record directly to GSheet JNEMember
  const handleSaveManualRecord = async (keepOpenForNext: boolean) => {
    const cleanedResi = cleanResi(manualForm.no_resi);
    if (!cleanedResi || cleanedResi.length < 6) {
      onShowToast('Nomor Cnote / Resi JNE wajib diisi dengan benar.', 'warning');
      return;
    }

    setIsSavingManual(true);
    try {
      const newRec: JneDetectedRecord = {
        id: `JNE-${cleanedResi}-${Date.now()}`,
        no_resi: cleanedResi,
        deskripsi: manualForm.deskripsi.trim(),
        layanan: normalizeJneService(manualForm.layanan),
        nama_tujuan: manualForm.nama_tujuan.trim() || '-',
        alamat_tujuan: manualForm.alamat_tujuan.trim() || '-',
        nama_pengirim: manualForm.nama_pengirim.trim() || DEFAULT_SHIPPER_NAME,
        nominal: normalizeNominal(manualForm.nominal),
        tanggal: normalizeDate(manualForm.tanggal) || normalizeDate(new Date()),
        agen: manualForm.agen.trim() || DEFAULT_AGEN_NAME,
      };

      const res = await upsertJneRecordsToGas([newRec], {
        operator: operatorName,
        overwriteExisting: true,
        overwriteDeskripsi: Boolean(newRec.deskripsi),
      });

      if (res.success) {
        onShowToast(res.message || `Cnote ${cleanedResi} tersimpan ke GSheet JNEMember!`, 'success');
        await handleRefreshFromGsheet(true);

        setManualForm((prev) => ({
          ...prev,
          no_resi: '',
          deskripsi: '',
          nama_tujuan: '',
          alamat_tujuan: '',
          nominal: '',
        }));

        if (!keepOpenForNext) {
          setIsAddModalOpen(false);
        }
      } else {
        onShowToast(res.error || 'Gagal menyimpan data manual ke GSheet.', 'error');
      }
    } finally {
      setIsSavingManual(false);
    }
  };

  // Parse pasted text into Staging Table
  const handleParsePastedTextToStaging = () => {
    const res = parsePastedJneText(pasteRawText, 'Tempel Baris');
    if (!res.success || res.records.length === 0) {
      onShowToast(res.error || 'Tidak ditemukan data Cnote dari teks tersebut.', 'warning');
      return;
    }
    setStagingRecords((prev) => {
      const map = new Map<string, JneDetectedRecord>();
      prev.forEach((p) => map.set(cleanResi(p.no_resi), p));
      res.records.forEach((p) => map.set(cleanResi(p.no_resi), p));
      return Array.from(map.values());
    });
    setStagingSourceInfo('Tempel Teks / Spreadsheet');
    setPasteRawText('');
    setAddModalTab('import');
    onShowToast(`${res.records.length} baris berhasil diurai ke tabel pratinjau.`, 'success');
  };

  // Update field inside Staging Preview Table
  const updateStagingField = (
    idx: number,
    field: keyof JneDetectedRecord,
    value: string | number
  ) => {
    setStagingRecords((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        if (field === 'nominal') return { ...item, nominal: normalizeNominal(value) };
        if (field === 'no_resi') return { ...item, no_resi: cleanResi(value) };
        return { ...item, [field]: String(value) };
      })
    );
  };

  // Submit Staging Records to GSheet JNEMember
  const handleCommitStagingToGsheet = async () => {
    const validRows = stagingRecords.filter((r) => cleanResi(r.no_resi).length >= 6);
    if (validRows.length === 0) {
      onShowToast('Tidak ada baris Cnote yang valid untuk disimpan.', 'warning');
      return;
    }

    setIsSubmittingStaging(true);
    try {
      const res = await upsertJneRecordsToGas(validRows, {
        operator: operatorName,
        skipDuplicates: duplicateMode === 'skip_existing',
        overwriteExisting: duplicateMode === 'overwrite_all',
        overwriteDeskripsi: duplicateMode === 'overwrite_all',
      });

      if (res.success) {
        onShowToast(
          res.message || `${validRows.length} data berhasil dikirim ke GSheet JNEMember!`,
          'success'
        );
        setStagingRecords([]);
        setStagingSourceInfo('');
        setIsAddModalOpen(false);
        await handleRefreshFromGsheet(true);
      } else {
        onShowToast(res.error || 'Gagal menyimpan hasil import ke GSheet JNEMember.', 'error');
      }
    } finally {
      setIsSubmittingStaging(false);
    }
  };

  // Open Full Edit Modal (Admin & Warehouse)
  const openFullEditModal = (rec: JneDetectedRecord) => {
    if (!canManage) {
      onShowToast('Akses edit penuh khusus akun Admin & Warehouse.', 'warning');
      return;
    }
    setEditingFullRecord({
      original_no_resi: rec.no_resi,
      row_number: rec.row_number,
      no: rec.no,
      no_resi: rec.no_resi,
      deskripsi: rec.deskripsi || '',
      layanan: rec.layanan || DEFAULT_JNE_SERVICE,
      nama_tujuan: rec.nama_tujuan === '-' ? '' : rec.nama_tujuan,
      alamat_tujuan: rec.alamat_tujuan === '-' ? '' : rec.alamat_tujuan,
      nama_pengirim: rec.nama_pengirim || DEFAULT_SHIPPER_NAME,
      nominal: String(rec.nominal || 0),
      tanggal: rec.tanggal || normalizeDate(new Date()),
      agen: rec.agen || DEFAULT_AGEN_NAME,
    });
  };

  const handleSaveFullEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFullRecord || !canManage) return;
    const newCnote = cleanResi(editingFullRecord.no_resi);
    if (!newCnote) {
      onShowToast('Cnote No tidak boleh kosong.', 'warning');
      return;
    }

    setIsSavingFullEdit(true);
    try {
      const res = await updateSingleJneRecordToGas(
        editingFullRecord.original_no_resi,
        {
          no: editingFullRecord.no,
          no_resi: newCnote,
          deskripsi: editingFullRecord.deskripsi.trim(),
          layanan: normalizeJneService(editingFullRecord.layanan),
          nama_tujuan: editingFullRecord.nama_tujuan.trim() || '-',
          alamat_tujuan: editingFullRecord.alamat_tujuan.trim() || '-',
          nama_pengirim: editingFullRecord.nama_pengirim.trim() || DEFAULT_SHIPPER_NAME,
          nominal: normalizeNominal(editingFullRecord.nominal),
          tanggal: normalizeDate(editingFullRecord.tanggal),
          agen: editingFullRecord.agen.trim() || DEFAULT_AGEN_NAME,
        },
        operatorName
      );

      if (res.success) {
        onShowToast(res.message || `Cnote ${newCnote} berhasil diperbarui di GSheet.`, 'success');
        setEditingFullRecord(null);
        await handleRefreshFromGsheet(true);
      } else {
        onShowToast(res.error || 'Gagal menyimpan perubahan ke GSheet.', 'error');
      }
    } finally {
      setIsSavingFullEdit(false);
    }
  };

  // Confirm Delete from GSheet (Admin & Warehouse)
  const handleConfirmDeleteFromGsheet = async () => {
    if (!deleteTargetResis || deleteTargetResis.length === 0 || !canManage) return;
    setIsDeleting(true);
    try {
      const res = await deleteJneRecordsFromGas(deleteTargetResis, operatorName);
      if (res.success) {
        const delSet = new Set(deleteTargetResis.map(cleanResi));
        setRecords((prev) => prev.filter((r) => !delSet.has(cleanResi(r.no_resi))));
        setSelectedResiSet((prev) => {
          const next = new Set(prev);
          delSet.forEach((k) => next.delete(k));
          return next;
        });
        setDeleteTargetResis(null);
        onShowToast(
          res.message || `${deleteTargetResis.length} baris berhasil dihapus dari GSheet JNEMember.`,
          'success'
        );
      } else {
        onShowToast(res.error || 'Gagal menghapus baris di GSheet JNEMember.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string, label: string = 'Cnote No') => {
    navigator.clipboard.writeText(text);
    onShowToast(`${label} ${text} disalin.`, 'info');
  };

  const renderServiceBadge = (srv: string) => {
    const upper = (srv || '').toUpperCase();
    let cls =
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    if (upper.includes('YES')) {
      cls =
        'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700';
    } else if (upper.includes('CTC')) {
      cls =
        'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800';
    } else if (upper.includes('REG')) {
      cls =
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
    } else if (upper.includes('JTR')) {
      cls =
        'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700';
    }
    return (
      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono border ${cls}`}>
        {upper || 'REG23'}
      </span>
    );
  };

  // Staging Stats
  const stagingStats = useMemo(() => {
    let newCount = 0;
    let dupCount = 0;
    let totalAmount = 0;
    for (const r of stagingRecords) {
      totalAmount += r.nominal || 0;
      if (existingRecordByResiMap.has(cleanResi(r.no_resi))) dupCount++;
      else newCount++;
    }
    return { newCount, dupCount, totalAmount };
  }, [stagingRecords, existingRecordByResiMap]);

  // Action Sheet Groups for Selected Row (`⋯`)
  const actionSheetGroups: AppActionGroup[] = useMemo(() => {
    if (!actionSheetRecord) return [];
    const rec = actionSheetRecord;

    const mainItems: AppActionGroup['items'] = [
      {
        id: 'edit_col_d',
        label: rec.deskripsi ? 'Ubah Deskripsi Pengiriman (Kolom D)' : 'Isi Deskripsi Pengiriman (Kolom D)',
        description: 'Tulis langsung ke Kolom D pada GSheet JNEMember',
        icon: <Tag className="w-4 h-4" />,
        tone: 'primary',
        onClick: () => startInlineEditDeskripsi(rec),
      },
      {
        id: 'copy_cnote',
        label: 'Salin Nomor Resi (Cnote No)',
        description: rec.no_resi,
        icon: <Copy className="w-4 h-4" />,
        onClick: () => copyToClipboard(rec.no_resi, 'Cnote No'),
      },
      {
        id: 'track_jne',
        label: 'Cek Pelacakan JNE',
        description: 'Buka halaman tracking JNE untuk nomor resi ini',
        icon: <ExternalLink className="w-4 h-4" />,
        onClick: () =>
          window.open(
            `https://www.jne.co.id/tracking-package`,
            '_blank',
            'noopener,noreferrer'
          ),
      },
      {
        id: 'open_gsheet',
        label: 'Buka Sheet JNEMember',
        description: rec.row_number ? `Baris #${rec.row_number} di Google Sheets` : 'Lihat langsung di Google Sheets',
        icon: <FileSpreadsheet className="w-4 h-4" />,
        onClick: () => window.open(JNE_GSHEET_URL, '_blank', 'noopener,noreferrer'),
      },
    ];

    const adminItems: AppActionGroup['items'] = canManage
      ? [
          {
            id: 'edit_full',
            label: 'Edit Lengkap Semua Kolom',
            description: 'Ubah Cnote, Penerima, Tujuan, Layanan, Nominal, atau Tanggal',
            icon: <Edit2 className="w-4 h-4" />,
            onClick: () => openFullEditModal(rec),
          },
          {
            id: 'delete_row',
            label: 'Hapus Baris dari GSheet',
            description: 'Hapus permanen baris resi ini dari sheet JNEMember',
            icon: <Trash2 className="w-4 h-4" />,
            tone: 'danger',
            onClick: () => setDeleteTargetResis([rec.no_resi]),
          },
        ]
      : [];

    return [
      { title: 'Operasi Resi & Kolom D', items: mainItems },
      ...(adminItems.length > 0 ? [{ title: 'Pengelolaan Admin & Warehouse', items: adminItems }] : []),
    ];
  }, [actionSheetRecord, canManage]);

  const categoryTabDefs: Array<{ id: CategoryTab; label: string; count: number }> = [
    { id: 'ALL', label: 'Semua', count: categoryCounts.ALL },
    { id: 'EMPTY', label: 'Kolom D Kosong', count: categoryCounts.EMPTY },
    { id: 'FILLED', label: 'Kolom D Terisi', count: categoryCounts.FILLED },
    { id: 'MANUAL_SHIPMENT', label: 'Manual Shipment', count: categoryCounts.MANUAL_SHIPMENT },
    { id: 'WEBSITE', label: 'Website / Order', count: categoryCounts.WEBSITE },
    { id: 'RETUR', label: 'Retur', count: categoryCounts.RETUR },
    { id: 'PR_SEEDING', label: 'PR / Seeding', count: categoryCounts.PR_SEEDING },
    { id: 'OTHER', label: 'Lainnya', count: categoryCounts.OTHER },
  ];

  return (
    <div className="w-full max-w-full p-0 sm:px-4 lg:px-6 sm:py-4 pb-24 lg:pb-6 space-y-3 sm:space-y-4">
      {/* 1. HEADER TOOLBAR (Standar Anti-Pelangi: Maks 1 Tombol Solid Primary) */}
      <div className="bg-white dark:bg-slate-900 border-b sm:border border-slate-200 dark:border-slate-800 sm:rounded-2xl px-3 py-3 sm:p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Rekap Tagihan JNE
              </h1>
              <a
                href={JNE_GSHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Buka Google Sheets JNEMember"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 hover:opacity-85 transition-opacity"
              >
                <FileSpreadsheet className="w-3 h-3 shrink-0" />
                <span>Sheet: {JNE_SHEET_NAME}</span>
                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              </a>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                {records.length.toLocaleString('id-ID')} resi
                {lastSyncTime ? ` · Sync ${lastSyncTime}` : ''}
                {syncSource === 'gviz' ? ' (Read-Only Fallback)' : ''}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              Sinkron 2 arah dengan GSheet <b>JNEMember</b> — klik <b>Kolom D (Deskripsi Pengiriman)</b> untuk isi manual, atau tekan <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] border border-slate-200 dark:border-slate-700">Ctrl+V</kbd> untuk langsung memparsing screenshot tagihan/resi.
            </p>
          </div>

          {/* Kanan: 1 Primary CTA + Refresh + Utility `⋯` + 2-Mode Switcher */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => {
                setAddModalTab('import');
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer min-h-[38px] sm:min-h-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Tambah / Import</span>
            </button>

            <button
              type="button"
              onClick={() => handleRefreshFromGsheet(false)}
              disabled={isLoading}
              title="Muat ulang data terbaru dari GSheet JNEMember"
              className="inline-flex items-center gap-1.5 px-2.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 min-h-[38px] sm:min-h-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
              <span className="hidden sm:inline">{isLoading ? 'Memuat...' : 'Sinkron'}</span>
            </button>

            {/* Menu Utilitas `⋯` */}
            <div className="relative" ref={utilityMenuRef}>
              <button
                type="button"
                onClick={() => setIsUtilityMenuOpen((v) => !v)}
                title="Menu Ekspor & Utilitas"
                className="inline-flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-2xs cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {isUtilityMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-1.5 z-40">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUtilityMenuOpen(false);
                      exportJneRecordsToExcel(filteredRecords, 'JNEMember_Rekap');
                      onShowToast(`Mengunduh ${filteredRecords.length} baris ke Excel (.xlsx)`, 'success');
                    }}
                    disabled={filteredRecords.length === 0}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUtilityMenuOpen(false);
                      exportJneRecordsToCsv(filteredRecords, 'JNEMember_Rekap');
                      onShowToast(`Mengunduh ${filteredRecords.length} baris ke CSV (.csv)`, 'success');
                    }}
                    disabled={filteredRecords.length === 0}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Export CSV (.csv)</span>
                  </button>
                  <a
                    href={JNE_GSHEET_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsUtilityMenuOpen(false)}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    <span>Buka GSheet JNEMember</span>
                  </a>
                  {canManage && (
                    <>
                      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                      <button
                        type="button"
                        onClick={() => {
                          setIsUtilityMenuOpen(false);
                          setGasUrlInput(getStoredJneGasUrl());
                          setIsSettingsModalOpen(true);
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5 text-slate-500" />
                        <span>Pengaturan Koneksi GAS</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Segmented Switcher 2 Mode (`Tabel | Kartu`) */}
            <div className="inline-flex p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => handleSetViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetViewMode('card')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  viewMode === 'card'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                <span>Kartu</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. KPI SUMMARY CARDS (4 Kartu Interaktif) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 px-1.5 sm:px-0">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-3.5 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Tagihan (Filter)
          </div>
          <div className="text-sm sm:text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            Rp {metrics.totalAmount.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            Rata-rata Rp {metrics.avgAmount.toLocaleString('id-ID')} / resi
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCategoryTab('ALL')}
          className={`text-left bg-white dark:bg-slate-900 border rounded-xl p-3 sm:p-3.5 shadow-2xs transition-colors cursor-pointer ${
            categoryTab === 'ALL'
              ? 'border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-500/20'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Jumlah Cnote Tampil
          </div>
          <div className="text-sm sm:text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {filteredRecords.length.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            Dari {records.length.toLocaleString('id-ID')} total baris GSheet
          </div>
        </button>

        <button
          type="button"
          onClick={() => setCategoryTab(categoryTab === 'FILLED' ? 'ALL' : 'FILLED')}
          className={`text-left bg-white dark:bg-slate-900 border rounded-xl p-3 sm:p-3.5 shadow-2xs transition-colors cursor-pointer ${
            categoryTab === 'FILLED'
              ? 'border-emerald-400 dark:border-emerald-700 ring-1 ring-emerald-500/20'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Kolom D Terisi
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>
          <div className="text-sm sm:text-lg font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 mt-1">
            {categoryCounts.FILLED.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {records.length > 0 ? Math.round((categoryCounts.FILLED / records.length) * 100) : 0}% sudah ada deskripsi
          </div>
        </button>

        <button
          type="button"
          onClick={() => setCategoryTab(categoryTab === 'EMPTY' ? 'ALL' : 'EMPTY')}
          className={`text-left bg-white dark:bg-slate-900 border rounded-xl p-3 sm:p-3.5 shadow-2xs transition-colors cursor-pointer ${
            categoryTab === 'EMPTY'
              ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-500/25'
              : categoryCounts.EMPTY > 0
                ? 'border-amber-300/80 dark:border-amber-800/80 hover:border-amber-400'
                : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Kolom D Kosong
            </span>
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          </div>
          <div className="text-sm sm:text-lg font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-300 mt-1">
            {categoryCounts.EMPTY.toLocaleString('id-ID')}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {categoryCounts.EMPTY > 0 ? 'Klik untuk lengkapi Kolom D' : 'Semua resi sudah lengkap'}
          </div>
        </button>
      </div>

      {/* 3. SWIPE CATEGORY TABS + SEARCH & COLLAPSIBLE FILTER */}
      <div className="bg-white dark:bg-slate-900 border-y sm:border border-slate-200 dark:border-slate-800 sm:rounded-2xl p-2.5 sm:p-3.5 space-y-2.5 shadow-2xs">
        {/* Horizontal Swipe Tabs (Zero Wrap di Mobile) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth pb-0.5">
          {categoryTabDefs.map((tab) => {
            const active = categoryTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryTab(tab.id)}
                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab.count.toLocaleString('id-ID')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Single Search & Sort Row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Cnote No, Deskripsi Kolom D, Nama Penerima, Tujuan..."
              className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="newest">Terbaru (Tanggal & Baris)</option>
              <option value="oldest">Terlama</option>
              <option value="amount_desc">Ongkir Tertinggi</option>
              <option value="amount_asc">Ongkir Terendah</option>
              <option value="resi_asc">Cnote No (A-Z)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setIsFilterExpanded((v) => !v)}
            className={`inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              isFilterExpanded || activeAdvancedFilterCount > 0
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5 shrink-0" />
            <span>Filter</span>
            {activeAdvancedFilterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                {activeAdvancedFilterCount}
              </span>
            )}
          </button>

          {(activeAdvancedFilterCount > 0 || categoryTab !== 'ALL' || searchQuery) && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="py-1.5 px-2.5 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        {/* Collapsible Secondary Filters */}
        {isFilterExpanded && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Dari Tanggal
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Sampai Tanggal
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Services (Layanan)
                </label>
                <select
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                >
                  <option value="ALL">Semua Layanan</option>
                  {distinctServices.map((srv) => (
                    <option key={srv} value={srv}>
                      {srv}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Shipper Name
                </label>
                <select
                  value={shipperFilter}
                  onChange={(e) => setShipperFilter(e.target.value)}
                  className="w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                >
                  <option value="ALL">Semua Pengirim</option>
                  {distinctShippers.map((sh) => (
                    <option key={sh} value={sh}>
                      {sh}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Periode Cepat:</span>
              {[
                { label: '7 Hari Terakhir', action: () => applyQuickDateRange(7) },
                { label: '30 Hari Terakhir', action: () => applyQuickDateRange(30) },
                { label: 'Bulan Ini', action: () => applyQuickDateRange('this_month') },
                { label: 'Semua Waktu', action: () => applyQuickDateRange('all') },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={p.action}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. CONTEXTUAL BATCH ACTION BAR (Hanya muncul saat ada baris dicentang) */}
      {selectedSummary.count > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-950/50 border-y sm:border border-indigo-200 dark:border-indigo-800 sm:rounded-xl px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-200">
            <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white font-mono tabular-nums">
              {selectedSummary.count}
            </span>
            <span>resi dipilih</span>
            <span className="text-indigo-600 dark:text-indigo-300 font-mono tabular-nums">
              · Rp {selectedSummary.totalNominal.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setBatchDescValue('');
                setIsBatchDescModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Isi Kolom D Massal</span>
            </button>

            <button
              type="button"
              onClick={() => {
                exportJneRecordsToExcel(selectedSummary.list, 'JNEMember_Terpilih');
                onShowToast(`Mengunduh ${selectedSummary.count} baris terpilih.`, 'success');
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>

            {canManage && (
              <button
                type="button"
                onClick={() => setDeleteTargetResis(selectedSummary.list.map((r) => r.no_resi))}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus ({selectedSummary.count})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedResiSet(new Set())}
              className="px-2 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
            >
              Batal Pilih
            </button>
          </div>
        </div>
      )}

      {/* 5. MAIN DATA VIEW (2-MODE: TABEL & KARTU) */}
      <div className="bg-white dark:bg-slate-900 border-y sm:border border-slate-200 dark:border-slate-800 sm:rounded-2xl shadow-2xs overflow-hidden">
        {isLoading && records.length === 0 ? (
          <div className="py-16 px-4 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Memuat data dari Google Sheets JNEMember...
            </div>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-14 px-4 text-center space-y-3">
            <Receipt className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {records.length === 0
                ? 'Belum ada data di memori lokal'
                : 'Tidak ada data resi yang cocok dengan filter aktif'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {records.length === 0
                ? 'Klik tombol Sinkron untuk menarik data dari GSheet JNEMember, atau klik Tambah / Import untuk memasukkan data baru.'
                : 'Coba ubah kata kunci pencarian atau klik Reset Filter untuk menampilkan seluruh resi.'}
            </p>
            {records.length > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <>
            {/* A. DESKTOP EXECUTIVE TABLE (`hidden md:block`, `lg:table-fixed`) */}
            <div className="hidden md:block w-full overflow-x-auto">
              <table className="w-full lg:table-fixed text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="w-10 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isAllCurrentPageSelected}
                        onChange={toggleSelectCurrentPage}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="lg:w-[17%] px-3 py-2.5">Cnote No & Tanggal</th>
                    <th className="lg:w-[27%] px-3 py-2.5">Deskripsi Pengiriman (Kolom D)</th>
                    <th className="lg:w-[21%] px-3 py-2.5">Penerima & Tujuan</th>
                    <th className="lg:w-[13%] px-3 py-2.5">Services & Shipper</th>
                    <th className="lg:w-[11%] px-3 py-2.5 text-right">Amount</th>
                    <th className="lg:w-[11%] px-3 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                  {paginatedRecords.map((rec) => {
                    const resiKey = cleanResi(rec.no_resi);
                    const isSelected = selectedResiSet.has(resiKey);
                    const isEditingThis = editingResi === resiKey;
                    const isSavingThis = savingResiSet.has(resiKey);
                    const isSavedFlash = savedFlashResiSet.has(resiKey);

                    return (
                      <tr
                        key={rec.id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center align-top pt-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectResi(rec.no_resi)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>

                        {/* Cnote No & Tanggal */}
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono font-bold text-slate-900 dark:text-white truncate"
                              title={rec.no_resi}
                            >
                              {rec.no_resi}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rec.no_resi)}
                              title="Salin Cnote No"
                              className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0 cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                            {[
                              formatDisplayDateJne(rec.tanggal),
                              rec.row_number ? `Baris #${rec.row_number}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </td>

                        {/* Kolom D: Deskripsi Pengiriman (Inline Spreadsheet Edit) */}
                        <td className="px-3 py-2 align-top">
                          {isEditingThis ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  ref={inlineInputRef}
                                  type="text"
                                  value={editDeskripsiValue}
                                  onChange={(e) => setEditDeskripsiValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      commitInlineDeskripsi(rec.no_resi, !e.shiftKey);
                                    } else if (e.key === 'Escape') {
                                      setEditingResi(null);
                                    }
                                  }}
                                  placeholder="Ketik deskripsi pengiriman (Enter = Simpan & Lanjut)"
                                  className="flex-1 min-w-0 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border-2 border-indigo-500 text-slate-900 dark:text-white focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => commitInlineDeskripsi(rec.no_resi, false)}
                                  title="Simpan ke Kolom D GSheet"
                                  className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shrink-0 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingResi(null)}
                                  title="Batal"
                                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="flex items-center gap-1 flex-wrap">
                                {DESKRIPSI_QUICK_PRESETS.slice(0, 5).map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => {
                                      setEditDeskripsiValue(preset);
                                      inlineInputRef.current?.focus();
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/60 text-slate-600 dark:text-slate-300 hover:text-indigo-700 cursor-pointer"
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startInlineEditDeskripsi(rec)}
                              title="Klik untuk mengisi/mengubah Kolom D di GSheet JNEMember"
                              className={`w-full text-left group rounded-lg px-2 py-1.5 -mx-2 transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                                rec.deskripsi
                                  ? 'hover:bg-slate-100/90 dark:hover:bg-slate-800/70'
                                  : 'bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 border border-dashed border-amber-300 dark:border-amber-800'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                {rec.deskripsi ? (
                                  <span className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 break-words">
                                    {rec.deskripsi}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                    + Klik untuk isi Deskripsi (Kolom D)
                                  </span>
                                )}
                                {isSavingThis && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    Menyimpan ke GSheet...
                                  </span>
                                )}
                                {!isSavingThis && isSavedFlash && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                                    <Check className="w-2.5 h-2.5" />
                                    Tersimpan di GSheet
                                  </span>
                                )}
                              </div>
                              <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 transition-opacity" />
                            </button>
                          )}
                        </td>

                        {/* Penerima & Tujuan */}
                        <td className="px-3 py-2.5 align-top">
                          <div
                            className="font-bold text-slate-900 dark:text-white truncate"
                            title={rec.nama_tujuan}
                          >
                            {rec.nama_tujuan || '-'}
                          </div>
                          <div
                            className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5"
                            title={rec.alamat_tujuan}
                          >
                            {rec.alamat_tujuan || '-'}
                          </div>
                        </td>

                        {/* Services & Shipper */}
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {renderServiceBadge(rec.layanan)}
                          </div>
                          <div
                            className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-1"
                            title={`${rec.nama_pengirim} · ${rec.agen}`}
                          >
                            {[rec.nama_pengirim, rec.agen].filter(Boolean).join(' · ')}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="px-3 py-2.5 align-top text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                          Rp {(rec.nominal || 0).toLocaleString('id-ID')}
                        </td>

                        {/* Aksi (`1 Primary CTA + ⋯`) */}
                        <td className="px-3 py-2.5 align-top text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => startInlineEditDeskripsi(rec)}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              {rec.deskripsi ? 'Kolom D' : '+ Isi D'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActionSheetRecord(rec)}
                              title="Aksi lainnya"
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 flex items-center justify-center cursor-pointer"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* B. MOBILE NATIVE COMPACT LIST-TABLE (`md:hidden` — ZERO Horizontal Scroll) */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedRecords.map((rec) => {
                const resiKey = cleanResi(rec.no_resi);
                const isSelected = selectedResiSet.has(resiKey);
                const isEditingThis = editingResi === resiKey;
                const isSavingThis = savingResiSet.has(resiKey);

                return (
                  <div
                    key={rec.id}
                    className={`p-3 space-y-1.5 ${
                      isSelected ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectResi(rec.no_resi)}
                          className="w-4 h-4 mt-0.5 rounded border-slate-300 text-indigo-600 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                              {rec.nama_tujuan || '-'}
                            </span>
                            <span className="text-xs font-extrabold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                              Rp {(rec.nominal || 0).toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                              {rec.no_resi}
                            </span>
                            <span>·</span>
                            {renderServiceBadge(rec.layanan)}
                            <span>·</span>
                            <span className="tabular-nums">{formatDisplayDateJne(rec.tanggal)}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {rec.alamat_tujuan || '-'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActionSheetRecord(rec)}
                        className="w-10 h-10 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                        aria-label="Menu Aksi"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Baris Kolom D Mobile */}
                    <div className="pl-6">
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            ref={inlineInputRef}
                            type="text"
                            value={editDeskripsiValue}
                            onChange={(e) => setEditDeskripsiValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInlineDeskripsi(rec.no_resi, false);
                              if (e.key === 'Escape') setEditingResi(null);
                            }}
                            placeholder="Isi Deskripsi Pengiriman (Kolom D)..."
                            className="flex-1 min-w-0 px-2.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border-2 border-indigo-500 text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => commitInlineDeskripsi(rec.no_resi, false)}
                            className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold shrink-0"
                          >
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingResi(null)}
                            className="h-9 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startInlineEditDeskripsi(rec)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 ${
                            rec.deskripsi
                              ? 'bg-slate-50 dark:bg-slate-800/70 text-slate-800 dark:text-slate-100 font-semibold'
                              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-dashed border-amber-300 dark:border-amber-800 font-semibold'
                          }`}
                        >
                          <span className="truncate">
                            {isSavingThis
                              ? 'Menyimpan ke GSheet...'
                              : rec.deskripsi || '+ Ketuk untuk isi Deskripsi (Kolom D)'}
                          </span>
                          <Edit2 className="w-3 h-3 text-slate-400 shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* MODE 2: VERSI KARTU (Single-Elevation Native App Cards) */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-4 p-2 sm:p-4 bg-slate-50/40 dark:bg-slate-950/30">
            {paginatedRecords.map((rec) => {
              const resiKey = cleanResi(rec.no_resi);
              const isSelected = selectedResiSet.has(resiKey);
              const isEditingThis = editingResi === resiKey;
              const isSavingThis = savingResiSet.has(resiKey);

              return (
                <div
                  key={rec.id}
                  className={`rounded-2xl border bg-white dark:bg-slate-900 flex flex-col justify-between transition-shadow shadow-2xs hover:shadow-sm ${
                    isSelected
                      ? 'border-indigo-400 dark:border-indigo-600 ring-1 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    {/* Card Header */}
                    <div className="px-3.5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectResi(rec.no_resi)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 shrink-0 cursor-pointer"
                        />
                        <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {rec.no_resi}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(rec.no_resi)}
                          className="text-slate-400 hover:text-indigo-600 shrink-0 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      {renderServiceBadge(rec.layanan)}
                    </div>

                    {/* Subject & Route */}
                    <div className="px-3.5 py-3 space-y-1 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                          {rec.nama_tujuan || '-'}
                        </span>
                        <span className="text-xs sm:text-sm font-extrabold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 shrink-0">
                          Rp {(rec.nominal || 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                        {rec.alamat_tujuan || '-'}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {[formatDisplayDateJne(rec.tanggal), rec.nama_pengirim, rec.agen]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>

                    {/* Kolom D Section */}
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Deskripsi Pengiriman (Kolom D)
                      </div>
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={inlineInputRef}
                            type="text"
                            value={editDeskripsiValue}
                            onChange={(e) => setEditDeskripsiValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitInlineDeskripsi(rec.no_resi, false);
                              if (e.key === 'Escape') setEditingResi(null);
                            }}
                            placeholder="Ketik Kolom D..."
                            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border-2 border-indigo-500 text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => commitInlineDeskripsi(rec.no_resi, false)}
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => startInlineEditDeskripsi(rec)}
                          className={`text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-1.5 transition-colors ${
                            rec.deskripsi
                              ? 'text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100'
                              : 'text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 border border-dashed border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {isSavingThis
                            ? 'Menyimpan ke GSheet...'
                            : rec.deskripsi || '+ Klik untuk isi Deskripsi'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: 2 Kontrol Seragam (`1 Primary CTA + ⋯`) */}
                  <div className="px-3.5 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startInlineEditDeskripsi(rec)}
                      className="flex-1 h-10 sm:h-8 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                    >
                      {rec.deskripsi ? 'Ubah Kolom D' : 'Isi Kolom D'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionSheetRecord(rec)}
                      className="h-10 sm:h-8 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 flex items-center justify-center cursor-pointer"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PAGINATION FOOTER */}
        {filteredRecords.length > 0 && (
          <div className="px-3 sm:px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span className="tabular-nums">
                Menampilkan{' '}
                <b>
                  {((currentPage - 1) * pageSize + 1).toLocaleString('id-ID')}–
                  {Math.min(currentPage * pageSize, filteredRecords.length).toLocaleString('id-ID')}
                </b>{' '}
                dari <b>{filteredRecords.length.toLocaleString('id-ID')}</b> resi
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="py-1 px-2 rounded-md text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                <option value={50}>50 / hal</option>
                <option value={100}>100 / hal</option>
                <option value={250}>250 / hal</option>
                <option value={2000}>Semua</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <span className="px-2 font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* UNIFIED ROW ACTION SHEET (`⋯` Mobile Bottom Sheet & Desktop Action Modal) */}
      {/* ========================================================================= */}
      <AppActionSheet
        isOpen={Boolean(actionSheetRecord)}
        onClose={() => setActionSheetRecord(null)}
        title={actionSheetRecord?.nama_tujuan || 'Aksi Data Resi JNE'}
        subtitle={
          actionSheetRecord
            ? `${actionSheetRecord.no_resi} · Rp ${(actionSheetRecord.nominal || 0).toLocaleString('id-ID')}`
            : undefined
        }
        groups={actionSheetGroups}
      />

      {/* ========================================================================= */}
      {/* UNIFIED TAMBAH & IMPORT MODAL (Excel, CSV, Gambar/SS AI Vision, Manual)   */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !isSubmittingStaging && !isSavingManual && setIsAddModalOpen(false)}
        >
          <div
            className="w-full sm:max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  Tambah & Import Data ke GSheet JNEMember
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pilih sumber input: Upload Excel/CSV, Lampiran Gambar/Screenshot (AI Vision), Input Manual, atau Tempel Teks.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sub-Tabs */}
            <div className="px-4 sm:px-5 pt-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {[
                {
                  id: 'import' as AddModalTab,
                  label: `Import Excel / CSV / Gambar SS${stagingRecords.length > 0 ? ` (${stagingRecords.length})` : ''}`,
                  icon: <Upload className="w-3.5 h-3.5" />,
                },
                {
                  id: 'manual' as AddModalTab,
                  label: 'Input Manual Satuan',
                  icon: <Plus className="w-3.5 h-3.5" />,
                },
                {
                  id: 'paste' as AddModalTab,
                  label: 'Tempel Baris Spreadsheet',
                  icon: <ClipboardPaste className="w-3.5 h-3.5" />,
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAddModalTab(t.id)}
                  className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 border-b-2 text-xs font-bold transition-colors cursor-pointer ${
                    addModalTab === t.id
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {addModalTab === 'import' && (
                <>
                  {/* Dropzone Multi-Format */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.pdf"
                    onChange={(e) => {
                      const fl = e.target.files ? Array.from(e.target.files) : [];
                      if (fl.length > 0) handleProcessFiles(fl);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />

                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fl = Array.from(e.dataTransfer.files || []);
                      if (fl.length > 0) handleProcessFiles(fl);
                    }}
                    onClick={() => !isParsing && fileInputRef.current?.click()}
                    className={`rounded-2xl border-2 border-dashed p-5 text-center transition-colors cursor-pointer ${
                      isParsing
                        ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/70 dark:bg-slate-800/40'
                    }`}
                  >
                    {isParsing ? (
                      <div className="space-y-2 py-2">
                        <Loader2 className="w-7 h-7 text-indigo-600 animate-spin mx-auto" />
                        <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                          {parsingStatusLabel || 'Mengekstrak data resi...'} ({parsingProgress}%)
                        </div>
                        <div className="w-48 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mx-auto">
                          <div
                            className="h-full bg-indigo-600 transition-all duration-200"
                            style={{ width: `${parsingProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400">
                          <FileSpreadsheet className="w-6 h-6" />
                          <ImageIcon className="w-6 h-6" />
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                          Klik untuk pilih file, seret ke sini, atau tekan{' '}
                          <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[11px]">
                            Ctrl+V
                          </kbd>{' '}
                          untuk tempel Screenshot
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Mendukung <b>Excel (.xlsx/.xls)</b>, <b>CSV (.csv)</b>,{' '}
                          <b>Gambar / Screenshot Tabel & Struk Resi (.png/.jpg/.webp — AI Vision)</b>, dan <b>PDF (.pdf)</b>.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Tabel Staging Preview Hasil Parsing */}
                  {stagingRecords.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                        <div className="space-y-0.5">
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                            <span>Pratinjau Hasil Parsing ({stagingRecords.length} Baris)</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300">
                              {stagingStats.newCount} Baru
                            </span>
                            {stagingStats.dupCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300">
                                {stagingStats.dupCount} Sudah Ada di GSheet
                              </span>
                            )}
                            <span className="font-mono text-indigo-600 dark:text-indigo-400">
                              · Total Rp {stagingStats.totalAmount.toLocaleString('id-ID')}
                            </span>
                          </div>
                          {stagingSourceInfo && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Sumber: {stagingSourceInfo} — Anda dapat mengedit sel mana pun sebelum disimpan ke GSheet.
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={duplicateMode}
                            onChange={(e) => setDuplicateMode(e.target.value as DuplicateHandlingMode)}
                            className="py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                          >
                            <option value="fill_empty_desc">
                              Jika Cnote sudah ada: Jaga data lama, isi Kolom D jika kosong
                            </option>
                            <option value="skip_existing">
                              Jika Cnote sudah ada: Lewati seluruh duplikat
                            </option>
                            <option value="overwrite_all">
                              Jika Cnote sudah ada: Perbarui seluruh kolom
                            </option>
                          </select>

                          <button
                            type="button"
                            onClick={() => {
                              setStagingRecords([]);
                              setStagingSourceInfo('');
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            Bersihkan
                          </button>
                        </div>
                      </div>

                      <div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[42vh]">
                        <table className="w-full text-left border-collapse text-xs min-w-[820px]">
                          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                              <th className="px-2.5 py-2 w-20">Status</th>
                              <th className="px-2.5 py-2 w-40">Cnote No</th>
                              <th className="px-2.5 py-2 w-48">Deskripsi (Kolom D)</th>
                              <th className="px-2.5 py-2 w-24">Services</th>
                              <th className="px-2.5 py-2 w-40">Receiver Name</th>
                              <th className="px-2.5 py-2 w-40">Destination</th>
                              <th className="px-2.5 py-2 w-28 text-right">Amount (Rp)</th>
                              <th className="px-2.5 py-2 w-32">Tanggal</th>
                              <th className="px-2 py-2 w-10 text-center">✕</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {stagingRecords.map((row, idx) => {
                              const exists = existingRecordByResiMap.has(cleanResi(row.no_resi));
                              return (
                                <tr key={`${row.id}-${idx}`} className="bg-white dark:bg-slate-900">
                                  <td className="px-2.5 py-1.5">
                                    {exists ? (
                                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300">
                                        ADA
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300">
                                        BARU
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      value={row.no_resi}
                                      onChange={(e) => updateStagingField(idx, 'no_resi', e.target.value)}
                                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      value={row.deskripsi}
                                      onChange={(e) => updateStagingField(idx, 'deskripsi', e.target.value)}
                                      placeholder="Opsional (Kolom D)"
                                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      value={row.layanan}
                                      onChange={(e) => updateStagingField(idx, 'layanan', e.target.value.toUpperCase())}
                                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      value={row.nama_tujuan === '-' ? '' : row.nama_tujuan}
                                      onChange={(e) => updateStagingField(idx, 'nama_tujuan', e.target.value)}
                                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="text"
                                      value={row.alamat_tujuan === '-' ? '' : row.alamat_tujuan}
                                      onChange={(e) => updateStagingField(idx, 'alamat_tujuan', e.target.value)}
                                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="number"
                                      value={row.nominal || 0}
                                      onChange={(e) => updateStagingField(idx, 'nominal', e.target.value)}
                                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-right text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      type="date"
                                      value={row.tanggal}
                                      onChange={(e) => updateStagingField(idx, 'tanggal', e.target.value)}
                                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setStagingRecords((prev) => prev.filter((_, i) => i !== idx))
                                      }
                                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mx-auto" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {addModalTab === 'manual' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Cnote No (Nomor Resi JNE) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={manualForm.no_resi}
                      onChange={(e) => setManualForm({ ...manualForm, no_resi: e.target.value })}
                      placeholder="Contoh: 013790032629726"
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Tanggal Pengiriman <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={manualForm.tanggal}
                      onChange={(e) => setManualForm({ ...manualForm, tanggal: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Deskripsi Pengiriman (Kolom D)
                    </label>
                    <input
                      type="text"
                      value={manualForm.deskripsi}
                      onChange={(e) => setManualForm({ ...manualForm, deskripsi: e.target.value })}
                      placeholder="Contoh: #MSLMP-261122-RYYS / PR Seeding ... / Website ..."
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      {DESKRIPSI_QUICK_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setManualForm({ ...manualForm, deskripsi: p })}
                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Receiver Name (Nama Penerima)
                    </label>
                    <input
                      type="text"
                      value={manualForm.nama_tujuan}
                      onChange={(e) => setManualForm({ ...manualForm, nama_tujuan: e.target.value })}
                      placeholder="Contoh: MELISA"
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Destination (Kecamatan / Kota Tujuan)
                    </label>
                    <input
                      type="text"
                      value={manualForm.alamat_tujuan}
                      onChange={(e) => setManualForm({ ...manualForm, alamat_tujuan: e.target.value })}
                      placeholder="Contoh: KELAPA DUA,TANGERANG"
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Amount / Nominal Ongkir (Rp)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={manualForm.nominal}
                      onChange={(e) => setManualForm({ ...manualForm, nominal: e.target.value })}
                      placeholder="Contoh: 10000"
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Services (Layanan JNE)
                    </label>
                    <input
                      type="text"
                      value={manualForm.layanan}
                      onChange={(e) =>
                        setManualForm({ ...manualForm, layanan: e.target.value.toUpperCase() })
                      }
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {SERVICE_QUICK_CHIPS.map((srv) => (
                        <button
                          key={srv}
                          type="button"
                          onClick={() => setManualForm({ ...manualForm, layanan: srv })}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                            manualForm.layanan === srv
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {srv}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Shipper Name (Pengirim)
                    </label>
                    <input
                      type="text"
                      value={manualForm.nama_pengirim}
                      onChange={(e) => setManualForm({ ...manualForm, nama_pengirim: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {SHIPPER_PRESETS.map((sh) => (
                        <button
                          key={sh}
                          type="button"
                          onClick={() => setManualForm({ ...manualForm, nama_pengirim: sh })}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          {sh}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                      Agen
                    </label>
                    <input
                      type="text"
                      value={manualForm.agen}
                      onChange={(e) => setManualForm({ ...manualForm, agen: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {addModalTab === 'paste' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Salin beberapa baris langsung dari file Excel / Google Sheets lain atau daftar resi, lalu tempel di bawah ini:
                  </p>
                  <textarea
                    rows={8}
                    value={pasteRawText}
                    onChange={(e) => setPasteRawText(e.target.value)}
                    placeholder={`Contoh tempel baris:\n013790032618026\t#MSLWS-261121-BLCU\tCTC23\tCINDY NATASYA S\tCILINCING ,JAKARTA U\tCCH-CHOCOCHIPS\t10000\t23/11/2026\tJNE Member`}
                    className="w-full p-3 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleParsePastedTextToStaging}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Urai ke Tabel Pratinjau</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Sticky Footer */}
            <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex items-center justify-between gap-2 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Tutup
              </button>

              {addModalTab === 'import' && (
                <button
                  type="button"
                  disabled={stagingRecords.length === 0 || isSubmittingStaging}
                  onClick={handleCommitStagingToGsheet}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-45 cursor-pointer"
                >
                  {isSubmittingStaging ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan ke GSheet...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan {stagingRecords.length} Baris ke GSheet JNEMember</span>
                    </>
                  )}
                </button>
              )}

              {addModalTab === 'manual' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingManual}
                    onClick={() => handleSaveManualRecord(true)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    Simpan & Tambah Lagi
                  </button>
                  <button
                    type="button"
                    disabled={isSavingManual}
                    onClick={() => handleSaveManualRecord(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingManual ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Simpan ke GSheet</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL BATCH UPDATE KOLOM D (DESKRIPSI PENGIRIMAN MASSAL)                  */}
      {/* ========================================================================= */}
      {isBatchDescModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isSavingBatchDesc && setIsBatchDescModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Isi Kolom D Massal ({selectedSummary.count} Resi)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Menulis serentak ke kolom <b>Deskripsi pengiriman</b> di GSheet JNEMember.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchDescModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                autoFocus
                value={batchDescValue}
                onChange={(e) => setBatchDescValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveBatchDeskripsi();
                }}
                placeholder="Contoh: PR Seeding Campaign November..."
                className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                {DESKRIPSI_QUICK_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBatchDescValue(p)}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBatchDescModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingBatchDesc}
                onClick={handleSaveBatchDeskripsi}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer"
              >
                {isSavingBatchDesc && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Simpan ke {selectedSummary.count} Baris</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EDIT LENGKAP SEMUA KOLOM (KHUSUS ADMIN & WAREHOUSE)                 */}
      {/* ========================================================================= */}
      {editingFullRecord && canManage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => !isSavingFullEdit && setEditingFullRecord(null)}
        >
          <form
            onSubmit={handleSaveFullEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Edit Data Resi JNE (Admin & Warehouse)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Cnote Awal: {editingFullRecord.original_no_resi}
                  {editingFullRecord.row_number ? ` · Baris #${editingFullRecord.row_number}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFullRecord(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Cnote No (Kolom C)
                </label>
                <input
                  type="text"
                  required
                  value={editingFullRecord.no_resi}
                  onChange={(e) =>
                    setEditingFullRecord({ ...editingFullRecord, no_resi: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Tanggal Pengiriman (Kolom J)
                </label>
                <input
                  type="date"
                  value={editingFullRecord.tanggal}
                  onChange={(e) =>
                    setEditingFullRecord({ ...editingFullRecord, tanggal: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Deskripsi Pengiriman (Kolom D)
                </label>
                <input
                  type="text"
                  value={editingFullRecord.deskripsi}
                  onChange={(e) =>
                    setEditingFullRecord({ ...editingFullRecord, deskripsi: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Receiver Name (Kolom F)
                </label>
                <input
                  type="text"
                  value={editingFullRecord.nama_tujuan}
                  onChange={(e) =>
                    setEditingFullRecord({ ...editingFullRecord, nama_tujuan: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Destination (Kolom G)
                </label>
                <input
                  type="text"
                  value={editingFullRecord.alamat_tujuan}
                  onChange={(e) =>
                    setEditingFullRecord({ ...editingFullRecord, alamat_tujuan: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Services (Kolom E)
                </label>
                <input
                  type="text"
                  value={editingFullRecord.layanan}
                  onChange={(e) =>
                    setEditingFullRecord({
                      ...editingFullRecord,
                      layanan: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Amount / Ongkir Rp (Kolom I)
                </label>
                <input
                  type="number"
                  min={0}
                  value={editingFullRecord.nominal}
                  onChange={(e) =>
                    setEditingFullRecord({ ...editingFullRecord, nominal: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Shipper Name (Kolom H)
                </label>
                <input
                  type="text"
                  value={editingFullRecord.nama_pengirim}
                  onChange={(e) =>
                    setEditingFullRecord({ ...editingFullRecord, nama_pengirim: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Agen (Kolom K)
                </label>
                <input
                  type="text"
                  value={editingFullRecord.agen}
                  onChange={(e) =>
                    setEditingFullRecord({ ...editingFullRecord, agen: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEditingFullRecord(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSavingFullEdit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 cursor-pointer"
              >
                {isSavingFullEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Simpan Perubahan GSheet</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL KONFIRMASI HAPUS DARI GSHEET (KHUSUS ADMIN & WAREHOUSE)             */}
      {/* ========================================================================= */}
      {deleteTargetResis && canManage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isDeleting && setDeleteTargetResis(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Hapus {deleteTargetResis.length} Baris dari GSheet JNEMember?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Baris resi berikut akan dihapus langsung dari tab <b>JNEMember</b> di Google Sheets:
                </p>
              </div>
            </div>

            <div className="max-h-32 overflow-y-auto p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap gap-1.5">
              {deleteTargetResis.slice(0, 25).map((r) => (
                <span
                  key={r}
                  className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  {r}
                </span>
              ))}
              {deleteTargetResis.length > 25 && (
                <span className="text-[11px] text-slate-500 font-semibold">
                  +{deleteTargetResis.length - 25} lainnya
                </span>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTargetResis(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteFromGsheet}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 cursor-pointer"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Ya, Hapus dari GSheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL PENGATURAN ENDPOINT GAS                                             */}
      {/* ========================================================================= */}
      {isSettingsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsSettingsModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Pengaturan Endpoint Google Apps Script (JNEMember)
              </h3>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                Web App URL (`/exec`)
              </label>
              <input
                type="url"
                value={gasUrlInput}
                onChange={(e) => setGasUrlInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setGasUrlInput(DEFAULT_JNE_GAS_URL)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Kembalikan ke Default Endpoint Resmi
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  saveStoredJneGasUrl(gasUrlInput);
                  setIsSettingsModalOpen(false);
                  onShowToast('Endpoint GAS disimpan. Memuat ulang data...', 'success');
                  handleRefreshFromGsheet(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                Simpan & Tes Koneksi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
