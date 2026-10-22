import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ChevronDown,
  Layers,
  FileText,
  Image as ImageIcon,
  CheckSquare,
  Square,
  Sparkles,
  ArrowUpDown,
  Tag,
  ShieldCheck,
  Building2,
  Send
} from 'lucide-react';
import { UserSession } from '../types';
import {
  JneDetectedRecord,
  parseJneImportFile,
  normalizeNominal,
  cleanResi,
  normalizeDate
} from '../services/jneRekapParser';
import {
  fetchJneRecordsFromGas,
  saveJneRecordsToGas,
  updateDeskripsiToGas,
  exportJneRecordsToExcel,
  getStoredJneGasUrl,
  saveStoredJneGasUrl,
  DEFAULT_JNE_GAS_URL,
  getLocalCachedJneRecords,
  saveLocalCachedJneRecords
} from '../services/jneRekapService';

interface JneRekapViewProps {
  session: UserSession | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const DESKRIPSI_PRESETS = [
  'Order Web E-Commerce',
  'Endorsement / VIP Influencer',
  'Retur Pabrik / Supplier',
  'Shopee Live Drop',
  'Transfer Stok Antar Toko',
  'Pengiriman Bahan / Aksesoris',
  'Sample QC & Fitting',
  'Kiriman Kantor Pusat',
  'Order Manual WhatsApp'
];

export const JneRekapView: React.FC<JneRekapViewProps> = ({ session, onShowToast }) => {
  // Data state
  const [records, setRecords] = useState<JneDetectedRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [deskripsiStatusFilter, setDeskripsiStatusFilter] = useState<'ALL' | 'EMPTY' | 'FILLED'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'tanggal' | 'nominal' | 'resi'>('tanggal');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Inline editing deskripsi
  const [editingResi, setEditingResi] = useState<string | null>(null);
  const [editDeskripsiValue, setEditDeskripsiValue] = useState<string>('');

  // Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsingProgress, setParsingProgress] = useState<number>(0);
  const [parsedPreview, setParsedPreview] = useState<JneDetectedRecord[]>([]);
  const [parsedFileName, setParsedFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Batch Deskripsi Modal
  const [isBatchDeskripsiModalOpen, setIsBatchDeskripsiModalOpen] = useState<boolean>(false);
  const [batchDeskripsiText, setBatchDeskripsiText] = useState<string>('');

  // Manual Add Modal
  const [isManualAddModalOpen, setIsManualAddModalOpen] = useState<boolean>(false);
  const [manualForm, setManualForm] = useState({
    no_resi: '',
    tanggal: normalizeDate(new Date()),
    nominal: '',
    layanan: 'REG',
    nama_tujuan: '',
    alamat_tujuan: '',
    deskripsi: ''
  });

  // Settings Modal (GAS URL)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [gasUrlInput, setGasUrlInput] = useState<string>(getStoredJneGasUrl());

  // Initial load
  useEffect(() => {
    // 1. Load dari local cache dulu agar instan
    const cached = getLocalCachedJneRecords();
    if (cached.length > 0) {
      setRecords(cached);
    }
    // 2. Tarik update dari GAS
    handleFetchFromGas();
  }, []);

  // Fetch dari GAS
  const handleFetchFromGas = async () => {
    setIsLoading(true);
    try {
      const res = await fetchJneRecordsFromGas();
      if (res.success) {
        setRecords(res.records);
        setLastSyncTime(new Date().toLocaleTimeString('id-ID'));
        if (res.message) onShowToast(res.message, 'success');
      } else {
        if (res.error) onShowToast(res.error, 'warning');
      }
    } catch (err: any) {
      onShowToast(`Gagal load data: ${err?.message || String(err)}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Push / Simpan ke GAS
  const handlePushToGas = async () => {
    if (records.length === 0) {
      onShowToast('Tidak ada data rekap untuk disimpan ke Google Sheets.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const operatorName = session?.username || 'WMS Admin';
      const res = await saveJneRecordsToGas(records, operatorName);
      if (res.success) {
        onShowToast(res.message || 'Data berhasil disimpan ke Google Sheets!', 'success');
        setLastSyncTime(new Date().toLocaleTimeString('id-ID'));
      } else {
        onShowToast(res.error || 'Gagal menyimpan ke Google Sheets.', 'error');
      }
    } catch (err: any) {
      onShowToast(`Error saat menyimpan: ${err?.message || String(err)}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Simpan perubahan deskripsi satu baris
  const handleSaveInlineDeskripsi = async (resi: string) => {
    const cleanR = resi.trim().toUpperCase();
    const newDesc = editDeskripsiValue.trim();

    const updated = records.map(r =>
      r.no_resi.toUpperCase() === cleanR ? { ...r, deskripsi: newDesc } : r
    );
    setRecords(updated);
    saveLocalCachedJneRecords(updated);
    setEditingResi(null);

    try {
      const operatorName = session?.username || 'WMS Admin';
      await updateDeskripsiToGas(cleanR, newDesc, operatorName);
      onShowToast(`Deskripsi resi ${cleanR} berhasil diperbarui.`, 'success');
    } catch (e) {
      onShowToast(`Deskripsi tersimpan lokal.`, 'info');
    }
  };

  // Batch Simpan Deskripsi untuk item yang terpilih
  const handleApplyBatchDeskripsi = async () => {
    if (selectedIds.length === 0 || !batchDeskripsiText.trim()) return;

    const targetDesc = batchDeskripsiText.trim();
    const updated = records.map(r =>
      selectedIds.includes(r.id) ? { ...r, deskripsi: targetDesc } : r
    );

    setRecords(updated);
    saveLocalCachedJneRecords(updated);
    setIsBatchDeskripsiModalOpen(false);
    setBatchDeskripsiText('');
    onShowToast(`${selectedIds.length} resi berhasil diisi deskripsi: "${targetDesc}"`, 'success');

    // Sync ke GAS di background
    try {
      const operatorName = session?.username || 'WMS Admin';
      await saveJneRecordsToGas(updated, operatorName);
    } catch (e) {}
  };

  // Hapus baris terpilih
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Yakin ingin menghapus ${selectedIds.length} data rekap yang dipilih?`)) return;

    const remaining = records.filter(r => !selectedIds.includes(r.id));
    setRecords(remaining);
    saveLocalCachedJneRecords(remaining);
    setSelectedIds([]);
    onShowToast(`${selectedIds.length} data berhasil dihapus dari tabel lokal.`, 'info');
  };

  // Hapus single row
  const handleDeleteSingle = (id: string, resi: string) => {
    if (!window.confirm(`Hapus data resi ${resi}?`)) return;
    const remaining = records.filter(r => r.id !== id);
    setRecords(remaining);
    saveLocalCachedJneRecords(remaining);
    onShowToast(`Data resi ${resi} dihapus.`, 'info');
  };

  // Handle file drop / upload
  const handleFileUpload = async (file: File) => {
    setIsParsing(true);
    setParsingProgress(0);
    setParsedFileName(file.name);
    setParsedPreview([]);

    try {
      const result = await parseJneImportFile(file, (pct) => setParsingProgress(pct));
      if (result.success && result.records.length > 0) {
        setParsedPreview(result.records);
        onShowToast(`Berhasil mendeteksi ${result.records.length} data resi JNE dari ${file.name}!`, 'success');
      } else {
        onShowToast(result.error || 'Tidak ada data resi JNE yang terdeteksi dari file ini.', 'error');
      }
    } catch (err: any) {
      onShowToast(`Gagal memproses file: ${err?.message || String(err)}`, 'error');
    } finally {
      setIsParsing(false);
    }
  };

  // Konfirmasi hasil import ke tabel utama
  const handleConfirmImport = () => {
    if (parsedPreview.length === 0) return;

    // Merge dengan data existing berdasarkan no_resi (hindari duplikat)
    const existingMap = new Map<string, JneDetectedRecord>();
    records.forEach(r => existingMap.set(r.no_resi.toUpperCase(), r));

    let addedCount = 0;
    let updatedCount = 0;

    parsedPreview.forEach(p => {
      const key = p.no_resi.toUpperCase();
      if (existingMap.has(key)) {
        // Update field jika di data import ada yang baru
        const old = existingMap.get(key)!;
        existingMap.set(key, {
          ...old,
          nominal: p.nominal > 0 ? p.nominal : old.nominal,
          layanan: p.layanan || old.layanan,
          nama_tujuan: p.nama_tujuan !== '-' ? p.nama_tujuan : old.nama_tujuan,
          alamat_tujuan: p.alamat_tujuan !== '-' ? p.alamat_tujuan : old.alamat_tujuan,
          deskripsi: p.deskripsi || old.deskripsi,
          source_file: p.source_file || old.source_file
        });
        updatedCount++;
      } else {
        existingMap.set(key, p);
        addedCount++;
      }
    });

    const merged = Array.from(existingMap.values());
    setRecords(merged);
    saveLocalCachedJneRecords(merged);

    setIsImportModalOpen(false);
    setParsedPreview([]);
    setParsedFileName('');

    onShowToast(`Import selesai: ${addedCount} baru ditambahkan, ${updatedCount} data diperbarui.`, 'success');
  };

  // Tambah baris manual
  const handleSaveManualAdd = () => {
    const resi = cleanResi(manualForm.no_resi);
    if (!resi) {
      onShowToast('Nomor resi wajib diisi!', 'warning');
      return;
    }

    const newItem: JneDetectedRecord = {
      id: `JNE-${resi}-${Date.now()}`,
      no_resi: resi,
      tanggal: manualForm.tanggal || normalizeDate(new Date()),
      nominal: normalizeNominal(manualForm.nominal),
      layanan: manualForm.layanan || 'REG',
      nama_tujuan: manualForm.nama_tujuan.trim() || '-',
      alamat_tujuan: manualForm.alamat_tujuan.trim() || '-',
      deskripsi: manualForm.deskripsi.trim(),
      source_file: 'Manual Input'
    };

    // Cek duplikat
    const existingIndex = records.findIndex(r => r.no_resi.toUpperCase() === resi);
    let updated: JneDetectedRecord[];
    if (existingIndex !== -1) {
      updated = [...records];
      updated[existingIndex] = newItem;
      onShowToast(`Data resi ${resi} diperbarui.`, 'success');
    } else {
      updated = [newItem, ...records];
      onShowToast(`Resi ${resi} berhasil ditambahkan!`, 'success');
    }

    setRecords(updated);
    saveLocalCachedJneRecords(updated);
    setIsManualAddModalOpen(false);
    setManualForm({
      no_resi: '',
      tanggal: normalizeDate(new Date()),
      nominal: '',
      layanan: 'REG',
      nama_tujuan: '',
      alamat_tujuan: '',
      deskripsi: ''
    });
  };

  // Filter & Sorting
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchResi = r.no_resi.toLowerCase().includes(q);
        const matchNama = r.nama_tujuan.toLowerCase().includes(q);
        const matchAlamat = r.alamat_tujuan.toLowerCase().includes(q);
        const matchDeskripsi = r.deskripsi.toLowerCase().includes(q);
        const matchLayanan = r.layanan.toLowerCase().includes(q);
        if (!matchResi && !matchNama && !matchAlamat && !matchDeskripsi && !matchLayanan) {
          return false;
        }
      }

      // Layanan
      if (serviceFilter !== 'ALL') {
        if (r.layanan.toUpperCase() !== serviceFilter.toUpperCase()) {
          return false;
        }
      }

      // Status Deskripsi
      if (deskripsiStatusFilter === 'EMPTY' && r.deskripsi.trim() !== '') return false;
      if (deskripsiStatusFilter === 'FILLED' && r.deskripsi.trim() === '') return false;

      // Date Range
      if (startDate && r.tanggal < startDate) return false;
      if (endDate && r.tanggal > endDate) return false;

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'tanggal') {
        comparison = a.tanggal.localeCompare(b.tanggal);
      } else if (sortBy === 'nominal') {
        comparison = a.nominal - b.nominal;
      } else if (sortBy === 'resi') {
        comparison = a.no_resi.localeCompare(b.no_resi);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [records, searchQuery, serviceFilter, deskripsiStatusFilter, startDate, endDate, sortBy, sortOrder]);

  // Statistik & Metrics
  const stats = useMemo(() => {
    const totalCount = records.length;
    const totalNominal = records.reduce((sum, r) => sum + r.nominal, 0);
    const avgNominal = totalCount > 0 ? Math.round(totalNominal / totalCount) : 0;
    const filledDescCount = records.filter(r => r.deskripsi.trim() !== '').length;
    const emptyDescCount = totalCount - filledDescCount;
    const descPct = totalCount > 0 ? Math.round((filledDescCount / totalCount) * 100) : 0;

    // Breakdown Layanan
    const services: Record<string, number> = {};
    records.forEach(r => {
      const s = r.layanan || 'REG';
      services[s] = (services[s] || 0) + 1;
    });

    return {
      totalCount,
      totalNominal,
      avgNominal,
      filledDescCount,
      emptyDescCount,
      descPct,
      services
    };
  }, [records]);

  // Checkbox Selection
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map(r => r.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* 1. Header Toolbar & Action Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-rose-500 to-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Rekap Tagihan & Resi JNE
              </h1>
              <span className="bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-[11px] font-bold px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                JNE Express
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Import manifest Excel / PDF / Foto Nota, deteksi otomatis nomor resi & nominal ongkir, serta kelola deskripsi pengiriman.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Import File</span>
          </button>

          <button
            type="button"
            onClick={() => setIsManualAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Manual</span>
          </button>

          <button
            type="button"
            onClick={handlePushToGas}
            disabled={isSaving || records.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            title="Simpan atau update seluruh data ke sheet 'Rekap Tagihan JNE'"
          >
            <FileSpreadsheet className={`w-4 h-4 ${isSaving ? 'animate-bounce' : ''}`} />
            <span>{isSaving ? 'Menyimpan...' : 'Simpan ke GSheet'}</span>
          </button>

          <button
            type="button"
            onClick={handleFetchFromGas}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 active:scale-95 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs transition-all cursor-pointer"
            title="Tarik pembaruan dari Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Loading...' : 'Tarik GSheet'}</span>
          </button>

          <button
            type="button"
            onClick={() => exportJneRecordsToExcel(filteredRecords)}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs transition-all cursor-pointer"
            title="Download Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* 2. Metrics & KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Tagihan Nominal */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Tagihan JNE</span>
            <span className="text-emerald-500 font-black">IDR</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tracking-tight">
            Rp {stats.totalNominal.toLocaleString('id-ID')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Rata-rata / Resi:</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Rp {stats.avgNominal.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Card 2: Total Resi Terdeteksi */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Resi Terdata</span>
            <Receipt className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tracking-tight">
            {stats.totalCount} <span className="text-sm font-semibold text-slate-500">resi</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 overflow-x-auto">
            {Object.entries(stats.services).map(([svc, count]) => (
              <span key={svc} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold text-[10px] text-slate-700 dark:text-slate-300">
                {svc}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* Card 3: Kelengkapan Deskripsi */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Kelengkapan Deskripsi</span>
            <span className={`text-xs font-black ${stats.descPct >= 90 ? 'text-emerald-500' : 'text-amber-500'}`}>
              {stats.descPct}%
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tracking-tight">
            {stats.filledDescCount} <span className="text-sm font-semibold text-slate-500">/ {stats.totalCount}</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${stats.descPct >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${stats.descPct}%` }}
            ></div>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            {stats.emptyDescCount > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-bold">
                ⚠️ {stats.emptyDescCount} resi belum memiliki deskripsi
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                ✓ Seluruh resi sudah dideskripsikan
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Status Sinkronisasi GSheet */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Sinkronisasi Google Sheet</span>
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-2 truncate">
            Sheet: <span className="text-rose-600 font-black">Rekap Tagihan JNE</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Terakhir sync:</span>
            <span className="font-bold text-slate-600 dark:text-slate-300">
              {lastSyncTime || 'Belum tersinkron'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <a
              href="https://docs.google.com/spreadsheets/d/1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k/edit#gid=1026608111"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1"
            >
              <span>Buka Spreadsheet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* 3. Filter & Search Controls */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 flex-wrap sm:flex-nowrap">
          {/* Search Bar */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari no resi, nama, tujuan, deskripsi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-rose-500 text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Filter Layanan */}
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="py-1.5 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 focus:outline-hidden"
          >
            <option value="ALL">Semua Layanan</option>
            <option value="REG">REG (Reguler)</option>
            <option value="YES">YES (Yakin Esok Sampai)</option>
            <option value="JTR">JTR (JNE Trucking)</option>
            <option value="OKE">OKE (Ekonomis)</option>
            <option value="SPS">SPS (Super Speed)</option>
          </select>

          {/* Filter Status Deskripsi */}
          <select
            value={deskripsiStatusFilter}
            onChange={(e) => setDeskripsiStatusFilter(e.target.value as any)}
            className="py-1.5 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300 focus:outline-hidden"
          >
            <option value="ALL">Semua Status Deskripsi</option>
            <option value="EMPTY">⚠️ Belum Diisi Deskripsi ({stats.emptyDescCount})</option>
            <option value="FILLED">✓ Sudah Ada Deskripsi ({stats.filledDescCount})</option>
          </select>

          {/* Filter Tanggal */}
          <div className="flex items-center gap-1 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="py-1 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300"
              title="Dari Tanggal"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="py-1 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300"
              title="Sampai Tanggal"
            />
          </div>
        </div>

        {/* Batch Operations Bar if any selected */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/60 w-full md:w-auto justify-between">
            <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
              {selectedIds.length} Terpilih
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsBatchDeskripsiModalOpen(true)}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg shadow-2xs transition-all cursor-pointer flex items-center gap-1"
              >
                <Tag className="w-3 h-3" />
                <span>Isi Deskripsi Massal</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="px-2 py-1 bg-red-100 dark:bg-red-900/60 hover:bg-red-200 text-red-700 dark:text-red-300 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Hapus</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Main Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filteredRecords.length && filteredRecords.length > 0}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 rounded-sm border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                </th>
                <th className="p-3 w-12 text-center">No</th>
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortBy === 'resi') setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('resi'); setSortOrder('asc'); }
                    }}
                    className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>No. Resi JNE</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortBy === 'tanggal') setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('tanggal'); setSortOrder('desc'); }
                    }}
                    className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>Tgl Kirim</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-3 text-center">Layanan</th>
                <th className="p-3">Penerima & Alamat</th>
                <th className="p-3 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortBy === 'nominal') setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                      else { setSortBy('nominal'); setSortOrder('desc'); }
                    }}
                    className="flex items-center gap-1 justify-end ml-auto hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>Nominal (Rp)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-3 min-w-[240px]">
                  <span className="flex items-center gap-1 text-rose-700 dark:text-rose-400">
                    <Edit2 className="w-3 h-3" />
                    <span>Deskripsi Pengiriman</span>
                  </span>
                </th>
                <th className="p-3 w-16 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400 mb-3">
                      <Receipt className="w-8 h-8" />
                    </div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {records.length === 0 ? 'Belum ada data rekap tagihan JNE' : 'Tidak ada data yang cocok dengan filter'}
                    </div>
                    <div className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      {records.length === 0
                        ? 'Silakan klik tombol "Import File" untuk mengunggah file Excel, PDF, atau foto resi JNE Anda.'
                        : 'Coba ubah kata kunci pencarian atau reset filter tanggal dan layanan.'}
                    </div>
                    {records.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setIsImportModalOpen(true)}
                        className="mt-4 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Mulai Import File JNE</span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => {
                  const isSelected = selectedIds.includes(r.id);
                  const isEditing = editingResi === r.no_resi;
                  const isDescEmpty = !r.deskripsi.trim();

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(r.id)}
                          className="w-4 h-4 rounded-sm border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                      </td>

                      {/* No */}
                      <td className="p-3 text-center text-slate-400 font-bold">
                        {idx + 1}
                      </td>

                      {/* No Resi */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-slate-100">
                          <span>{r.no_resi}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(r.no_resi);
                              onShowToast(`No. Resi ${r.no_resi} disalin!`, 'info');
                            }}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                            title="Salin No Resi"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        {r.source_file && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={r.source_file}>
                            {r.source_file}
                          </div>
                        )}
                      </td>

                      {/* Tanggal */}
                      <td className="p-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.tanggal || '-'}
                      </td>

                      {/* Layanan */}
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider ${
                            r.layanan === 'YES'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300'
                              : r.layanan === 'JTR'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300'
                          }`}
                        >
                          {r.layanan || 'REG'}
                        </span>
                      </td>

                      {/* Nama & Alamat */}
                      <td className="p-3 max-w-xs">
                        <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {r.nama_tujuan || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1" title={r.alamat_tujuan}>
                          {r.alamat_tujuan || '-'}
                        </div>
                      </td>

                      {/* Nominal (Rp) */}
                      <td className="p-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap text-sm">
                        Rp {r.nominal.toLocaleString('id-ID')}
                      </td>

                      {/* Deskripsi Pengiriman (Editable Inline) */}
                      <td className="p-3">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                autoFocus
                                value={editDeskripsiValue}
                                onChange={(e) => setEditDeskripsiValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveInlineDeskripsi(r.no_resi);
                                  if (e.key === 'Escape') setEditingResi(null);
                                }}
                                placeholder="Ketik deskripsi atau pilih preset..."
                                className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border-2 border-rose-500 rounded-lg focus:outline-hidden text-slate-800 dark:text-slate-100 shadow-inner"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveInlineDeskripsi(r.no_resi)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md cursor-pointer"
                                title="Simpan"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingResi(null)}
                                className="p-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md cursor-pointer"
                                title="Batal"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Preset Buttons */}
                            <div className="flex items-center gap-1 flex-wrap">
                              {DESKRIPSI_PRESETS.slice(0, 4).map(preset => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setEditDeskripsiValue(preset)}
                                  className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/60 rounded text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => {
                              setEditingResi(r.no_resi);
                              setEditDeskripsiValue(r.deskripsi);
                            }}
                            className={`group flex items-center justify-between p-1.5 rounded-lg border transition-all cursor-pointer ${
                              isDescEmpty
                                ? 'border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                                : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200'
                            }`}
                            title="Klik untuk mengisi / mengedit deskripsi"
                          >
                            <span className="text-xs font-medium truncate">
                              {isDescEmpty ? '⚠️ Belum diisi (Klik untuk input deskripsi)' : r.deskripsi}
                            </span>
                            <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
                          </div>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteSingle(r.id, r.no_resi)}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: IMPORT FILE (EXCEL / PDF / GAMBAR NOTA) */}
      {/* ==================================================================== */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-rose-50 to-red-50 dark:from-slate-900 dark:to-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Import Tagihan & Resi JNE
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Mendukung file Excel (.xlsx, .xls, .csv), PDF invoice JNE (.pdf), atau Foto nota (.png, .jpg).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedPreview([]);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-rose-300 dark:border-rose-800/80 hover:border-rose-500 bg-rose-50/30 dark:bg-rose-950/20 rounded-2xl p-8 text-center cursor-pointer transition-all hover:scale-[1.005]"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                  accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg"
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <Upload className="w-7 h-7" />
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {isParsing ? 'Sedang Membaca & Mendeteksi Data...' : 'Klik atau Tarik File JNE ke Sini'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Format: .xlsx, .xls, .csv, .pdf, .png, .jpg (Deteksi otomatis No Resi, Tanggal, Nominal, & Layanan)
                </div>

                {isParsing && (
                  <div className="mt-4 max-w-xs mx-auto">
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-rose-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${parsingProgress > 0 ? parsingProgress : 60}%` }}
                      ></div>
                    </div>
                    <div className="text-[11px] font-bold text-rose-600 mt-1">
                      {parsingProgress > 0 ? `OCR Text Processing: ${parsingProgress}%` : 'Menganalisis baris dokumen...'}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Hasil Parse */}
              {parsedPreview.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Terdeteksi {parsedPreview.length} resi dari file: <strong className="text-rose-600">{parsedFileName}</strong></span>
                    </div>
                    <div className="text-xs font-bold text-emerald-600">
                      Total: Rp {parsedPreview.reduce((sum, r) => sum + r.nominal, 0).toLocaleString('id-ID')}
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 font-bold">
                        <tr>
                          <th className="p-2">No. Resi</th>
                          <th className="p-2">Tgl</th>
                          <th className="p-2">Layanan</th>
                          <th className="p-2">Penerima</th>
                          <th className="p-2 text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {parsedPreview.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-2 font-mono font-bold text-slate-900 dark:text-slate-100">{item.no_resi}</td>
                            <td className="p-2 text-slate-500">{item.tanggal}</td>
                            <td className="p-2 font-bold">{item.layanan}</td>
                            <td className="p-2 text-slate-600 truncate max-w-[120px]">{item.nama_tujuan}</td>
                            <td className="p-2 text-right font-mono font-bold text-emerald-600">
                              Rp {item.nominal.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setParsedPreview([]);
                }}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={parsedPreview.length === 0}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Tambahkan {parsedPreview.length} Data ke Tabel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: BATCH DESKRIPSI PENGIRIMAN */}
      {/* ==================================================================== */}
      {isBatchDeskripsiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Isi Deskripsi Massal ({selectedIds.length} Resi)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchDeskripsiModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                Ketik Deskripsi Pengiriman
              </label>
              <input
                type="text"
                autoFocus
                value={batchDeskripsiText}
                onChange={(e) => setBatchDeskripsiText(e.target.value)}
                placeholder="Contoh: Order Web #1024, Endorsement Selebgram, dll."
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
              />
            </div>

            {/* Quick Presets */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Pilih Dari Template Cepat:
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {DESKRIPSI_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBatchDeskripsiText(preset)}
                    className="text-[11px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/60 rounded-lg text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsBatchDeskripsiModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyBatchDeskripsi}
                disabled={!batchDeskripsiText.trim()}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Terapkan ke {selectedIds.length} Resi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: INPUT RESI MANUAL */}
      {/* ==================================================================== */}
      {isManualAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Tambah Data Resi JNE Manual
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsManualAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nomor Resi JNE *
                </label>
                <input
                  type="text"
                  value={manualForm.no_resi}
                  onChange={(e) => setManualForm({ ...manualForm, no_resi: e.target.value })}
                  placeholder="Contoh: 0123456789012"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Tanggal Pengiriman
                </label>
                <input
                  type="date"
                  value={manualForm.tanggal}
                  onChange={(e) => setManualForm({ ...manualForm, tanggal: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nominal Ongkir (Rp)
                </label>
                <input
                  type="number"
                  value={manualForm.nominal}
                  onChange={(e) => setManualForm({ ...manualForm, nominal: e.target.value })}
                  placeholder="Contoh: 19000"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Layanan JNE
                </label>
                <select
                  value={manualForm.layanan}
                  onChange={(e) => setManualForm({ ...manualForm, layanan: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold"
                >
                  <option value="REG">REG (Reguler)</option>
                  <option value="YES">YES (Yakin Esok Sampai)</option>
                  <option value="JTR">JTR (JNE Trucking)</option>
                  <option value="OKE">OKE (Ekonomis)</option>
                  <option value="SPS">SPS (Super Speed)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nama Penerima
                </label>
                <input
                  type="text"
                  value={manualForm.nama_tujuan}
                  onChange={(e) => setManualForm({ ...manualForm, nama_tujuan: e.target.value })}
                  placeholder="Nama customer / penerima"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Alamat / Kota Tujuan
                </label>
                <input
                  type="text"
                  value={manualForm.alamat_tujuan}
                  onChange={(e) => setManualForm({ ...manualForm, alamat_tujuan: e.target.value })}
                  placeholder="Contoh: Bandung, Jawa Barat"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Deskripsi Pengiriman
                </label>
                <input
                  type="text"
                  value={manualForm.deskripsi}
                  onChange={(e) => setManualForm({ ...manualForm, deskripsi: e.target.value })}
                  placeholder="Contoh: Order Web, Retur Pabrik, dll."
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsManualAddModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveManualAdd}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Simpan Resi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
