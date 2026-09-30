import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Calendar,
  User,
  Clock,
  ArrowLeft,
  Printer,
  RefreshCw,
  FileText,
  Check,
  X,
  Sparkles,
  Image as ImageIcon,
  Save,
  Loader2,
  History,
  Scale,
  CheckSquare,
  Square,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import {
  UserSession,
  PenerimaanProduksiItem,
  ProductItem,
  PenerimaanRecountLogItem,
} from '../../types';
import {
  updatePenerimaanProduksiItemsInSupabase,
  savePenerimaanRecountLog,
  fetchPenerimaanRecountLogs,
} from '../../services/supabase';
import {
  pushMasterRecountDeltaToGoogleSheet,
  MasterRecountDeltaItem,
} from '../../services/gasProduksiSync';

export interface AuditHitungUlangTabProps {
  session: UserSession | null;
  penerimaanItems: PenerimaanProduksiItem[];
  productCatalog?: ProductItem[];
  initialTargetCode?: string;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshData: () => Promise<void>;
  onOpenLightbox?: (data: { url: string; title: string; subtitle?: string }) => void;
}

export interface CodeAuditGroup {
  kode_produksi: string;
  nama_produk: string;
  kategori: string;
  vendor_up?: string;
  photo_url?: string;
  total_asli: number;
  total_fisik: number | null;
  total_selisih: number | null;
  status_audit: 'BELUM' | 'MATCH' | 'KURANG' | 'LEBIH';
  has_diff: boolean;
  is_counted: boolean;
  last_auditor?: string;
  last_audit_date?: string;
  last_round?: number;
  last_notes?: string;
  distinct_colors: string[];
  distinct_sizes: string[];
  distinct_dates: string[];
  items: PenerimaanProduksiItem[];
}

const LOCAL_STORAGE_RECOUNT_QUEUE = 'wms_recount_selected_queue';

export const AuditHitungUlangTab: React.FC<AuditHitungUlangTabProps> = ({
  session,
  penerimaanItems,
  productCatalog = [],
  initialTargetCode,
  onShowToast,
  onRefreshData,
  onOpenLightbox,
}) => {
  // Current active mode: 'queue' (Antrian & Daftar Pekerjaan) | 'workspace' (Lembar Kerja Input Fisik)
  const [activeMode, setActiveMode] = useState<'queue' | 'workspace'>('queue');
  const [selectedCode, setSelectedCode] = useState<string>(initialTargetCode || '');

  // Queue of explicitly selected codes for recount
  const [queuedCodes, setQueuedCodes] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_RECOUNT_QUEUE);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const saveQueuedCodes = (list: string[]) => {
    setQueuedCodes(list);
    try {
      localStorage.setItem(LOCAL_STORAGE_RECOUNT_QUEUE, JSON.stringify(list));
    } catch {}
  };

  const handleAddToQueue = (code: string) => {
    const norm = code.trim().toUpperCase();
    if (!norm) return;
    if (!queuedCodes.includes(norm)) {
      const updated = [norm, ...queuedCodes];
      saveQueuedCodes(updated);
    }
  };

  const handleRemoveFromQueue = (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const norm = code.trim().toUpperCase();
    const updated = queuedCodes.filter((c) => c !== norm);
    saveQueuedCodes(updated);
    onShowToast(`Kode ${norm} dikeluarkan dari antrian hitung ulang.`, 'info');
  };

  // Queue Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'uncounted' | 'diff' | 'match'>('all');
  const [filterKategori, setFilterKategori] = useState<string>('Semua');

  // Quick Code Picker Modal State
  const [isPickerModalOpen, setIsPickerModalOpen] = useState<boolean>(false);
  const [pickerSearch, setPickerSearch] = useState<string>('');

  // History Log Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [historyLogs, setHistoryLogs] = useState<PenerimaanRecountLogItem[]>([]);
  const [historyTargetCode, setHistoryTargetCode] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Workspace Form State for Active Code
  const [auditDate, setAuditDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [auditorName, setAuditorName] = useState<string>(() => {
    return session?.nama || session?.username || session?.email || 'Auditor Fisik';
  });
  const [generalNotes, setGeneralNotes] = useState<string>('');
  // Map key: `${warna}_${size}` -> { recountQty: number | null, note: string }
  const [variantInputs, setVariantInputs] = useState<Record<string, { recountQty: number | null; note: string }>>({});
  const [isSavingAudit, setIsSavingAudit] = useState<boolean>(false);
  const [isSyncingSheet, setIsSyncingSheet] = useState<boolean>(false);

  // Print ref for direct isolated printing
  const printContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-open workspace if initialTargetCode is given
  useEffect(() => {
    if (initialTargetCode) {
      const norm = initialTargetCode.trim().toUpperCase();
      handleAddToQueue(norm);
      setSelectedCode(norm);
      setActiveMode('workspace');
    }
  }, [initialTargetCode]);

  // Aggregate ALL arrival items by `kode_produksi` (for picker search)
  const allCodeGroups = useMemo<CodeAuditGroup[]>(() => {
    const map = new Map<string, {
      items: PenerimaanProduksiItem[];
      nama_produk: string;
      kategori: string;
      vendor_up?: string;
      photo_url?: string;
      distinct_colors: Set<string>;
      distinct_sizes: Set<string>;
      distinct_dates: Set<string>;
    }>();

    penerimaanItems.forEach((it) => {
      const code = (it.kode_produksi || '').trim().toUpperCase();
      if (!code) return;

      if (!map.has(code)) {
        map.set(code, {
          items: [],
          nama_produk: it.nama_produk || '',
          kategori: it.kategori || 'Lokal CMT',
          vendor_up: (it as any).up_vendor || (it as any).vendor || '',
          photo_url: it.photo_url || '',
          distinct_colors: new Set(),
          distinct_sizes: new Set(),
          distinct_dates: new Set(),
        });
      }

      const grp = map.get(code)!;
      grp.items.push(it);
      if (!grp.nama_produk && it.nama_produk) grp.nama_produk = it.nama_produk;
      if (!grp.photo_url && it.photo_url) grp.photo_url = it.photo_url;
      if (it.warna) grp.distinct_colors.add(it.warna.trim());
      if (it.size) grp.distinct_sizes.add(it.size.trim());
      if (it.tanggal_penerimaan) grp.distinct_dates.add(it.tanggal_penerimaan);
    });

    const results: CodeAuditGroup[] = [];

    map.forEach((grp, code) => {
      let totalAsli = 0;
      let totalFisik: number | null = null;
      let totalSelisih: number | null = null;
      let isCounted = false;
      let hasDiff = false;
      let lastAuditor: string | undefined = undefined;
      let lastAuditDate: string | undefined = undefined;
      let lastRound: number | undefined = undefined;
      let lastNotes: string | undefined = undefined;

      const varMap = new Map<string, { asli: number; fisik: number | null; selisih: number | null }>();

      grp.items.forEach((it) => {
        const vKey = `${it.warna || ''}_${it.size || ''}`;
        const qtyAsli = Number(it.qty) || 0;
        totalAsli += qtyAsli;

        if (!varMap.has(vKey)) {
          varMap.set(vKey, { asli: 0, fisik: null, selisih: null });
        }
        varMap.get(vKey)!.asli += qtyAsli;

        if (it.recount_qty !== undefined && it.recount_qty !== null) {
          isCounted = true;
          varMap.get(vKey)!.fisik = Number(it.recount_qty);
          if (it.recount_auditor) lastAuditor = it.recount_auditor;
          if (it.recount_updated_at) lastAuditDate = it.recount_updated_at;
          if (it.recount_round && (!lastRound || it.recount_round > lastRound)) lastRound = it.recount_round;
          if (it.recount_notes) lastNotes = it.recount_notes;
        }
      });

      if (isCounted) {
        let sumFisik = 0;
        varMap.forEach((val) => {
          const effectiveFisik = val.fisik !== null ? val.fisik : val.asli;
          sumFisik += effectiveFisik;
        });
        totalFisik = sumFisik;
        totalSelisih = totalFisik - totalAsli;
        if (totalSelisih !== 0) hasDiff = true;
      }

      let statusAudit: 'BELUM' | 'MATCH' | 'KURANG' | 'LEBIH' = 'BELUM';
      if (isCounted) {
        if (totalSelisih === 0) statusAudit = 'MATCH';
        else if ((totalSelisih || 0) < 0) statusAudit = 'KURANG';
        else statusAudit = 'LEBIH';
      }

      results.push({
        kode_produksi: code,
        nama_produk: grp.nama_produk,
        kategori: grp.kategori,
        vendor_up: grp.vendor_up,
        photo_url: grp.photo_url,
        total_asli: totalAsli,
        total_fisik: totalFisik,
        total_selisih: totalSelisih,
        status_audit: statusAudit,
        has_diff: hasDiff,
        is_counted: isCounted,
        last_auditor: lastAuditor,
        last_audit_date: lastAuditDate,
        last_round: lastRound,
        last_notes: lastNotes,
        distinct_colors: Array.from(grp.distinct_colors),
        distinct_sizes: Array.from(grp.distinct_sizes),
        distinct_dates: Array.from(grp.distinct_dates),
        items: grp.items,
      });
    });

    return results.sort((a, b) => {
      if (a.has_diff && !b.has_diff) return -1;
      if (!a.has_diff && b.has_diff) return 1;
      if (!a.is_counted && b.is_counted) return -1;
      if (a.is_counted && !b.is_counted) return 1;
      return a.kode_produksi.localeCompare(b.kode_produksi);
    });
  }, [penerimaanItems]);

  // SELECTIVE QUEUE: Only include codes that are in `queuedCodes` OR already have recount data
  const codeGroups = useMemo<CodeAuditGroup[]>(() => {
    return allCodeGroups.filter((g) => {
      const isExplicitlyQueued = queuedCodes.includes(g.kode_produksi);
      const isAlreadyCounted = g.is_counted;
      return isExplicitlyQueued || isAlreadyCounted;
    });
  }, [allCodeGroups, queuedCodes]);

  // Summary Metrics KPI (Based on Selective Queue)
  const metrics = useMemo(() => {
    let uncounted = 0;
    let diff = 0;
    let match = 0;

    codeGroups.forEach((g) => {
      if (!g.is_counted) uncounted++;
      else if (g.has_diff) diff++;
      else match++;
    });

    return {
      total: codeGroups.length,
      uncounted,
      diff,
      match,
    };
  }, [codeGroups]);

  // Filtered queue
  const filteredQueue = useMemo(() => {
    let list = codeGroups;

    if (filterKategori !== 'Semua') {
      list = list.filter((g) => g.kategori === filterKategori);
    }

    if (filterStatus === 'uncounted') {
      list = list.filter((g) => !g.is_counted);
    } else if (filterStatus === 'diff') {
      list = list.filter((g) => g.has_diff);
    } else if (filterStatus === 'match') {
      list = list.filter((g) => g.is_counted && !g.has_diff);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (g) =>
          g.kode_produksi.toLowerCase().includes(q) ||
          g.nama_produk.toLowerCase().includes(q) ||
          (g.vendor_up && g.vendor_up.toLowerCase().includes(q)) ||
          (g.last_auditor && g.last_auditor.toLowerCase().includes(q)) ||
          g.distinct_colors.some((c) => c.toLowerCase().includes(q))
      );
    }

    return list;
  }, [codeGroups, filterStatus, filterKategori, searchQuery]);

  // Selected code group for workspace
  const activeGroup = useMemo(() => {
    if (!selectedCode) return null;
    return allCodeGroups.find((g) => g.kode_produksi === selectedCode) || null;
  }, [allCodeGroups, selectedCode]);

  // Group active code items into distinct variants (Warna + Size)
  const activeVariants = useMemo(() => {
    if (!activeGroup) return [];

    const map = new Map<string, {
      warna: string;
      size: string;
      qty_asli: number;
      existing_fisik: number | null;
      existing_round?: number;
      existing_note?: string;
    }>();

    activeGroup.items.forEach((it) => {
      const w = it.warna || '-';
      const s = it.size || '-';
      const key = `${w}_${s}`;

      if (!map.has(key)) {
        map.set(key, {
          warna: w,
          size: s,
          qty_asli: 0,
          existing_fisik: it.recount_qty !== undefined && it.recount_qty !== null ? Number(it.recount_qty) : null,
          existing_round: it.recount_round,
          existing_note: it.recount_notes,
        });
      }

      map.get(key)!.qty_asli += Number(it.qty) || 0;
      if (it.recount_qty !== undefined && it.recount_qty !== null) {
        map.get(key)!.existing_fisik = Number(it.recount_qty);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const c = a.warna.localeCompare(b.warna);
      if (c !== 0) return c;
      return a.size.localeCompare(b.size);
    });
  }, [activeGroup]);

  // Initialize variantInputs when activeGroup changes
  useEffect(() => {
    if (!activeGroup) return;

    const initialMap: Record<string, { recountQty: number | null; note: string }> = {};

    activeVariants.forEach((v) => {
      const key = `${v.warna}_${v.size}`;
      initialMap[key] = {
        recountQty: v.existing_fisik !== null ? v.existing_fisik : null,
        note: v.existing_note || '',
      };
    });

    setVariantInputs(initialMap);
    setGeneralNotes(activeGroup.last_notes || '');
    if (activeGroup.last_auditor) setAuditorName(activeGroup.last_auditor);
  }, [activeGroup, activeVariants]);

  // Live calculations for current workspace
  const workspaceSummary = useMemo(() => {
    let totalAsli = 0;
    let totalFisik = 0;
    let filledCount = 0;

    activeVariants.forEach((v) => {
      totalAsli += v.qty_asli;
      const key = `${v.warna}_${v.size}`;
      const inp = variantInputs[key];
      if (inp && inp.recountQty !== null && !isNaN(inp.recountQty)) {
        totalFisik += inp.recountQty;
        filledCount++;
      } else {
        totalFisik += v.qty_asli;
      }
    });

    const totalSelisih = totalFisik - totalAsli;

    return {
      totalAsli,
      totalFisik,
      totalSelisih,
      filledCount,
      totalVariants: activeVariants.length,
    };
  }, [activeVariants, variantInputs]);

  // Quick Action: Fill all variants with original arrival qty
  const handleQuickFillSameAsOriginal = () => {
    const updated: Record<string, { recountQty: number | null; note: string }> = {};
    activeVariants.forEach((v) => {
      const key = `${v.warna}_${v.size}`;
      updated[key] = {
        recountQty: v.qty_asli,
        note: variantInputs[key]?.note || '',
      };
    });
    setVariantInputs(updated);
    onShowToast('Seluruh kuantitas fisik telah diisi sama persis dengan kedatangan asli.', 'info');
  };

  // Quick Action: Reset all inputs
  const handleResetInputs = () => {
    const updated: Record<string, { recountQty: number | null; note: string }> = {};
    activeVariants.forEach((v) => {
      const key = `${v.warna}_${v.size}`;
      updated[key] = {
        recountQty: null,
        note: '',
      };
    });
    setVariantInputs(updated);
    onShowToast('Kolom input fisik telah dikosongkan.', 'info');
  };

  // Open Workspace for a specific code (and ensure it is in the queue)
  const handleOpenWorkspace = (code: string) => {
    const norm = code.trim().toUpperCase();
    handleAddToQueue(norm);
    setSelectedCode(norm);
    setActiveMode('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save Audit & Auto-Push Targeted Delta to Master Sheet
  const handleSaveAndAutoPush = async () => {
    if (!activeGroup) return;

    if (workspaceSummary.filledCount === 0) {
      if (!window.confirm('Belum ada angka fisik yang diisi. Apakah Anda ingin menandai seluruh varian klop sesuai surat jalan asli?')) {
        return;
      }
      handleQuickFillSameAsOriginal();
    }

    try {
      setIsSavingAudit(true);

      const nextRound = (activeGroup.last_round || 0) + 1;
      const nowIso = new Date().toISOString();

      // 1. Map updated fields to each PenerimaanProduksiItem in this code
      const updatedItems: PenerimaanProduksiItem[] = activeGroup.items.map((it) => {
        const key = `${it.warna || '-'}_${it.size || '-'}`;
        const inputVal = variantInputs[key];
        const fisikVal = inputVal && inputVal.recountQty !== null ? inputVal.recountQty : Number(it.qty) || 0;
        const selisih = fisikVal - (Number(it.qty) || 0);
        const status = selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH';

        return {
          ...it,
          // PENTING: it.qty asli tetap murni dan tidak pernah ditimpa
          qty: it.qty,
          recount_qty: fisikVal,
          recount_selisih: selisih,
          recount_status: status,
          recount_round: nextRound,
          recount_notes: inputVal?.note || generalNotes || it.recount_notes,
          recount_auditor: auditorName || 'Auditor Fisik',
          recount_updated_at: nowIso,
        };
      });

      // 2. Simpan ke database Supabase
      await updatePenerimaanProduksiItemsInSupabase(updatedItems);

      // 3. Catat ke riwayat log audit (History Logs)
      try {
        const detailRecords = activeVariants.map((v) => {
          const key = `${v.warna}_${v.size}`;
          const sv = variantInputs[key];
          const fisik = sv && sv.recountQty !== null ? sv.recountQty : v.qty_asli;
          return {
            kode_produksi: activeGroup.kode_produksi,
            nama_produk: activeGroup.nama_produk,
            warna: v.warna,
            size: v.size,
            qty_sebelumnya: v.qty_asli,
            qty_fisik: fisik,
            selisih: fisik - v.qty_asli,
            catatan: sv?.note || generalNotes || '',
          };
        });

        await savePenerimaanRecountLog({
          tanggal_audit: auditDate,
          auditor: auditorName || 'Auditor Fisik',
          kode_produksi: activeGroup.kode_produksi,
          total_sebelumnya: workspaceSummary.totalAsli,
          total_fisik: workspaceSummary.totalFisik,
          total_selisih: workspaceSummary.totalSelisih,
          general_notes: generalNotes,
          details: detailRecords,
        });
      } catch (logErr) {
        console.warn('Gagal catat log audit:', logErr);
      }

      // 4. AUTO-PUSH TARGETED DELTA KE MASTER SHEET DI GOOGLE SPREADSHEET (ANTI-TIMEOUT)
      setIsSyncingSheet(true);
      try {
        const deltaItems: MasterRecountDeltaItem[] = activeVariants.map((v) => {
          const key = `${v.warna}_${v.size}`;
          const sv = variantInputs[key];
          const fisik = sv && sv.recountQty !== null ? sv.recountQty : v.qty_asli;
          const selisih = fisik - v.qty_asli;
          const status = selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH';

          return {
            kode_produksi: activeGroup.kode_produksi,
            warna: v.warna,
            size: v.size,
            qty_asli: v.qty_asli,
            qty_fisik: fisik,
            selisih,
            status,
            round: nextRound,
            auditor: auditorName || 'Auditor',
            catatan: sv?.note || generalNotes || '',
            updated_at: nowIso,
          };
        });

        const deltaRes = await pushMasterRecountDeltaToGoogleSheet({
          activeTab: activeGroup.kategori === 'Kargo' ? 'Kargo' : 'CMT',
          kode_produksi: activeGroup.kode_produksi,
          items: deltaItems,
        });

        if (deltaRes.success) {
          onShowToast(
            `Hasil audit Kode ${activeGroup.kode_produksi} berhasil disimpan & Master Sheet Google telah terupdate otomatis!`,
            'success'
          );
        } else {
          onShowToast(
            `Data berhasil disimpan ke database. Sinkronisasi Sheet: ${deltaRes.message || 'Tertunda'}`,
            'info'
          );
        }
      } catch (sheetErr: any) {
        console.warn('Auto-push delta Google Sheet tertunda:', sheetErr);
        onShowToast('Data tersimpan di database. Auto-push Google Sheet akan dicoba kembali saat online.', 'info');
      } finally {
        setIsSyncingSheet(false);
      }

      // Pastikan kode tersimpan dalam antrian terpilih
      handleAddToQueue(activeGroup.kode_produksi);

      // 5. Muat ulang data induk dan kembali ke daftar antrian
      await onRefreshData();
      setActiveMode('queue');
    } catch (err: any) {
      console.error('Error saving audit:', err);
      onShowToast(`Gagal menyimpan hasil audit: ${err.message || 'Terjadi kesalahan sistem'}`, 'error');
    } finally {
      setIsSavingAudit(false);
    }
  };

  // Open History Logs Modal for a code
  const handleOpenHistoryModal = async (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setHistoryTargetCode(code);
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);
    try {
      const logs = await fetchPenerimaanRecountLogs(code);
      setHistoryLogs(logs);
    } catch (err) {
      console.warn('Error loading recount logs:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Direct Browser Print for Form Lembar Fisik
  const handlePrintPhysicalForm = () => {
    if (!printContainerRef.current) return;
    const content = printContainerRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>LEMBAR KERJA VERIFIKASI FISIK - ${selectedCode}</title>
          <style>
            @page { size: portrait; margin: 12mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .header-box { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-family: monospace; }
            .sign-box { margin-top: 30px; display: flex; justify-content: space-between; text-align: center; font-size: 10px; }
            .sign-line { margin-top: 45px; border-top: 1px solid #475569; width: 130px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${content}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      {/* ========================================================
          1. STATS METRICS & KPI CARDS (TERPILIH DI ANTRIAN)
          ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Total Kode Terpilih */}
        <div
          onClick={() => {
            setFilterStatus('all');
            setActiveMode('queue');
          }}
          className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            filterStatus === 'all' && activeMode === 'queue'
              ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-75">Antrian Terpilih</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black mt-1">{metrics.total}</div>
          <div className="text-[10px] opacity-70 mt-0.5">Kode masuk antrian audit</div>
        </div>

        {/* Belum Dihitung (Antrian) */}
        <div
          onClick={() => {
            setFilterStatus('uncounted');
            setActiveMode('queue');
          }}
          className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            filterStatus === 'uncounted' && activeMode === 'queue'
              ? 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-500'
              : 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-300 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-75">Antrian Belum</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black mt-1 text-amber-600 dark:text-amber-400">
            {metrics.uncounted}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">Menunggu hitung fisik</div>
        </div>

        {/* Ada Selisih */}
        <div
          onClick={() => {
            setFilterStatus('diff');
            setActiveMode('queue');
          }}
          className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            filterStatus === 'diff' && activeMode === 'queue'
              ? 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-500'
              : 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-300 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-75">Ada Selisih</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black mt-1 text-rose-600 dark:text-rose-400">
            {metrics.diff}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">Fisik ≠ Surat Jalan</div>
        </div>

        {/* Selesai / Klop */}
        <div
          onClick={() => {
            setFilterStatus('match');
            setActiveMode('queue');
          }}
          className={`p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            filterStatus === 'match' && activeMode === 'queue'
              ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500'
              : 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-300 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-75">Klop (Match)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
            {metrics.match}
          </div>
          <div className="text-[10px] opacity-70 mt-0.5">Diaudit &amp; Sesuai 100%</div>
        </div>
      </div>

      {/* ========================================================
          2. VIEW ROUTER: QUEUE BOARD vs WORKSPACE LEMBAR KERJA
          ======================================================== */}
      {activeMode === 'queue' ? (
        /* ========================================================
            MODE 1: ANTRIAN AUDIT & DAFTAR PEKERJAAN
            ======================================================== */
        <div className="space-y-3">
          {/* Toolbar Antrian: Search, Filter Tabs, & Button Panggil Kode */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari Kode Produksi, Nama Produk, Petugas di Antrian..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Button Panggil Kode / Audit Baru */}
                <button
                  type="button"
                  onClick={() => setIsPickerModalOpen(true)}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Panggil / Tambah Kode Audit</span>
                </button>

                {/* Refresh */}
                <button
                  type="button"
                  onClick={onRefreshData}
                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition border border-slate-200 dark:border-slate-700"
                  title="Muat Ulang Data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Tabs / Pills */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400 mr-1">Status:</span>
                {[
                  { id: 'all', label: `Semua (${metrics.total})` },
                  { id: 'uncounted', label: `⏳ Antrian Belum (${metrics.uncounted})` },
                  { id: 'diff', label: `⚠️ Ada Selisih (${metrics.diff})` },
                  { id: 'match', label: `✅ Klop (${metrics.match})` },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setFilterStatus(st.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      filterStatus === st.id
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Kategori Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px] font-bold">
                {['Semua', 'Lokal CMT', 'Kargo'].map((kat) => (
                  <button
                    key={kat}
                    type="button"
                    onClick={() => setFilterKategori(kat)}
                    className={`px-2.5 py-0.5 rounded-md transition cursor-pointer ${
                      filterKategori === kat
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-black'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {kat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Antrian List / Cards */}
          {filteredQueue.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 sm:p-14 text-center text-slate-400 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Scale className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <p className="text-base font-extrabold text-slate-700 dark:text-slate-200">
                  {codeGroups.length === 0
                    ? 'Belum Ada Kode di Antrian Hitung Ulang'
                    : 'Tidak ada kode antrian yang sesuai filter'}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {codeGroups.length === 0
                    ? 'Hanya kode penerimaan terpilih yang akan masuk ke antrian ini. Klik tombol di bawah untuk memanggil kode yang perlu diverifikasi fisiknya.'
                    : 'Coba ubah kata kunci pencarian atau ganti status filter di atas.'}
                </p>
              </div>

              {codeGroups.length === 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setIsPickerModalOpen(true)}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black inline-flex items-center gap-2 shadow-sm transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Panggil / Tambah Kode Audit Sekarang</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredQueue.map((item) => {
                return (
                  <div
                    key={item.kode_produksi}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-3.5 transition shadow-xs flex flex-col justify-between ${
                      item.has_diff
                        ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/10'
                        : item.is_counted
                        ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/10'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      {/* Top Bar: Code Badge + Category + Remove Queue Button */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          {/* Thumbnail */}
                          {item.photo_url ? (
                            <img
                              src={item.photo_url}
                              alt={item.kode_produksi}
                              className="w-10 h-10 rounded-lg object-contain bg-slate-100 dark:bg-slate-800 border border-slate-200 cursor-pointer"
                              referrerPolicy="no-referrer"
                              onClick={() =>
                                onOpenLightbox &&
                                onOpenLightbox({
                                  url: item.photo_url!,
                                  title: `Kode Produksi: ${item.kode_produksi}`,
                                  subtitle: item.nama_produk,
                                })
                              }
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <span className="font-mono text-sm font-black text-slate-900 dark:text-white">
                              {item.kode_produksi}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-bold">
                              {item.kategori} {item.vendor_up ? `• UP: ${item.vendor_up}` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge & Close button */}
                        <div className="flex items-center gap-1.5">
                          <div>
                            {!item.is_counted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800">
                                <Clock className="w-3 h-3" />
                                <span>Belum Dihitung</span>
                              </span>
                            ) : item.total_selisih === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>✅ Match (0)</span>
                              </span>
                            ) : (item.total_selisih || 0) < 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800">
                                <TrendingDown className="w-3 h-3" />
                                <span>⚠️ Kurang ({item.total_selisih} pcs)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
                                <TrendingUp className="w-3 h-3" />
                                <span>📦 Lebih (+{item.total_selisih} pcs)</span>
                              </span>
                            )}
                          </div>

                          {/* Tombol Hapus dari Antrian */}
                          <button
                            type="button"
                            onClick={(e) => handleRemoveFromQueue(item.kode_produksi, e)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                            title="Keluarkan dari antrian terpilih"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Product Name */}
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 line-clamp-1 mb-2">
                        {item.nama_produk || 'Produk Tanpa Nama'}
                      </p>

                      {/* Qty Comparison Box */}
                      <div className="grid grid-cols-3 gap-1 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-200 dark:border-slate-750 text-center font-mono">
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold block uppercase">Asli Kedatangan</span>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-100">{item.total_asli} pcs</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold block uppercase">Fisik Hitung</span>
                          <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                            {item.total_fisik !== null ? `${item.total_fisik} pcs` : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 font-bold block uppercase">Selisih</span>
                          <span
                            className={`text-xs font-black ${
                              item.total_selisih === null
                                ? 'text-slate-400'
                                : item.total_selisih === 0
                                ? 'text-emerald-600'
                                : item.total_selisih < 0
                                ? 'text-rose-600'
                                : 'text-blue-600'
                            }`}
                          >
                            {item.total_selisih !== null
                              ? item.total_selisih > 0
                                ? `+${item.total_selisih}`
                                : item.total_selisih
                              : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Auditor & Timestamp Footer */}
                      <div className="mt-2 text-[10px] text-slate-500 space-y-0.5">
                        {item.last_auditor ? (
                          <div className="flex items-center justify-between">
                            <span>Petugas: <strong className="text-slate-700 dark:text-slate-300">{item.last_auditor}</strong></span>
                            {item.last_round ? <span className="text-rose-600 font-bold">Putaran {item.last_round}</span> : null}
                          </div>
                        ) : (
                          <div className="text-slate-400 italic">Belum ada riwayat audit fisik</div>
                        )}
                        {item.last_audit_date ? (
                          <div className="text-slate-400 text-[9px]">
                            Update: {new Date(item.last_audit_date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleOpenWorkspace(item.kode_produksi)}
                        className="flex-1 py-1.5 px-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition cursor-pointer"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>{item.is_counted ? 'Re-Audit Fisik' : 'Hitung Sekarang'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleOpenHistoryModal(item.kode_produksi, e)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                        title="Lihat Log Riwayat Putaran"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleRemoveFromQueue(item.kode_produksi, e)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 hover:text-rose-600 text-slate-400 rounded-xl text-xs font-bold transition cursor-pointer"
                        title="Hapus / Keluarkan dari Antrian"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================
            MODE 2: LEMBAR KERJA VERIFIKASI FISIK (WORKSPACE FOKUS)
            ======================================================== */
        activeGroup && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-5 animate-in fade-in duration-150">
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveMode('queue')}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali ke Antrian</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintPhysicalForm}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
                  title="Cetak Lembar Kerja Fisik (Kertas)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Form Kertas</span>
                </button>
              </div>
            </div>

            {/* Header Kode & Metadata Produk */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-750">
              <div className="flex items-center gap-3">
                {activeGroup.photo_url ? (
                  <img
                    src={activeGroup.photo_url}
                    alt={activeGroup.kode_produksi}
                    className="w-16 h-16 rounded-xl object-contain bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer"
                    referrerPolicy="no-referrer"
                    onClick={() =>
                      onOpenLightbox &&
                      onOpenLightbox({
                        url: activeGroup.photo_url!,
                        title: `Kode: ${activeGroup.kode_produksi}`,
                        subtitle: activeGroup.nama_produk,
                      })
                    }
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-0.5 rounded-lg border border-rose-200 dark:border-rose-900">
                      {activeGroup.kode_produksi}
                    </span>
                    <span className="text-xs font-bold text-slate-500 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {activeGroup.kategori}
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">
                    {activeGroup.nama_produk || 'Produk Tanpa Nama'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total Kedatangan Surat Jalan: <strong className="text-slate-800 dark:text-slate-200">{activeGroup.total_asli} pcs</strong>
                    {activeGroup.vendor_up ? ` • UP: ${activeGroup.vendor_up}` : ''}
                  </p>
                </div>
              </div>

              {/* Form Metadata Auditor & Tanggal */}
              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Tanggal Audit:</label>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">Nama Petugas / Auditor:</label>
                  <input
                    type="text"
                    value={auditorName}
                    onChange={(e) => setAuditorName(e.target.value)}
                    placeholder="Nama Auditor..."
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Quick Helper Actions */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-rose-500" />
                <span>Lembar Verifikasi Fisik per Varian (Warna &amp; Size)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleQuickFillSameAsOriginal}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                >
                  ⚡ Set Semua Sesuai Asli
                </button>
                <button
                  type="button"
                  onClick={handleResetInputs}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            {/* Tabel Lembar Kerja Fisik */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-xs text-left border-collapse min-w-[650px]">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2.5 px-3 text-center w-12">No</th>
                    <th className="py-2.5 px-3">Warna</th>
                    <th className="py-2.5 px-3 text-center w-16">Size</th>
                    <th className="py-2.5 px-3 text-center w-28">Kedatangan Asli</th>
                    <th className="py-2.5 px-3 text-center w-36 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                      Input Qty Fisik
                    </th>
                    <th className="py-2.5 px-3 text-center w-24">Selisih</th>
                    <th className="py-2.5 px-3 text-center w-28">Status</th>
                    <th className="py-2.5 px-3 min-w-[120px]">Catatan Varian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 font-medium">
                  {activeVariants.map((v, idx) => {
                    const key = `${v.warna}_${v.size}`;
                    const inp = variantInputs[key] || { recountQty: null, note: '' };
                    const isCustomEntered = inp.recountQty !== null;
                    const selisih = isCustomEntered ? (inp.recountQty - v.qty_asli) : 0;

                    return (
                      <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition">
                        <td className="py-2 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-100">{v.warna}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold">{v.size}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                          {v.qty_asli}
                        </td>
                        {/* Input Qty Fisik */}
                        <td className="py-1 px-2 text-center bg-blue-50/30 dark:bg-blue-950/20">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            placeholder={String(v.qty_asli)}
                            value={inp.recountQty !== null ? inp.recountQty : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                              setVariantInputs((prev) => ({
                                ...prev,
                                [key]: {
                                  recountQty: val,
                                  note: prev[key]?.note || '',
                                },
                              }));
                            }}
                            className={`w-24 text-center font-mono font-black text-xs py-1.5 px-2 rounded-lg border outline-none transition ${
                              isCustomEntered
                                ? selisih === 0
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-300'
                                  : selisih < 0
                                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-300 ring-1 ring-rose-300'
                                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-300 ring-1 ring-blue-300'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                            }`}
                          />
                        </td>
                        {/* Selisih */}
                        <td className="py-2 px-3 text-center font-mono font-bold">
                          {isCustomEntered ? (
                            selisih === 0 ? (
                              <span className="text-emerald-600 font-bold">0</span>
                            ) : selisih < 0 ? (
                              <span className="text-rose-600 font-black">{selisih}</span>
                            ) : (
                              <span className="text-blue-600 font-black">+{selisih}</span>
                            )
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        {/* Status */}
                        <td className="py-2 px-3 text-center">
                          {isCustomEntered ? (
                            selisih === 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Match
                              </span>
                            ) : selisih < 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                Kurang
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                Lebih
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 text-[10px] italic">Belum diisi</span>
                          )}
                        </td>
                        {/* Catatan Varian */}
                        <td className="py-1 px-2">
                          <input
                            type="text"
                            placeholder="Catatan varian..."
                            value={inp.note || ''}
                            onChange={(e) => {
                              const noteVal = e.target.value;
                              setVariantInputs((prev) => ({
                                ...prev,
                                [key]: {
                                  recountQty: prev[key]?.recountQty ?? null,
                                  note: noteVal,
                                },
                              }));
                            }}
                            className="w-full text-xs py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-700 dark:text-slate-200 focus:bg-white"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Metrics Comparison Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900 text-white p-4 rounded-2xl shadow-sm">
              <div className="text-center sm:text-left">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Surat Jalan Asli</span>
                <span className="text-2xl font-black font-mono">{workspaceSummary.totalAsli} pcs</span>
              </div>
              <div className="text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Fisik Hasil Audit</span>
                <span className="text-2xl font-black font-mono text-blue-400">{workspaceSummary.totalFisik} pcs</span>
              </div>
              <div className="text-center sm:text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Selisih</span>
                <span
                  className={`text-2xl font-black font-mono ${
                    workspaceSummary.totalSelisih === 0
                      ? 'text-emerald-400'
                      : workspaceSummary.totalSelisih < 0
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {workspaceSummary.totalSelisih > 0
                    ? `+${workspaceSummary.totalSelisih}`
                    : workspaceSummary.totalSelisih}{' '}
                  pcs
                </span>
              </div>
            </div>

            {/* General Notes */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Catatan Umum Audit (Opsional):
              </label>
              <textarea
                rows={2}
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                placeholder="Tuliskan keterangan bila ada riwayat reject, selisih kirim, atau instruksi dari supervisor..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {/* Save & Push Master Sheet Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveMode('queue')}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal &amp; Kembali
              </button>

              <button
                type="button"
                disabled={isSavingAudit || isSyncingSheet}
                onClick={handleSaveAndAutoPush}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                {isSavingAudit || isSyncingSheet ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isSyncingSheet ? 'Auto-Pushing Google Sheet...' : 'Menyimpan Hasil Audit...'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Simpan &amp; Auto-Push Master Sheet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )
      )}

      {/* ========================================================
          3. MODAL: PANGGIL KODE AUDIT CEPAT (+ BUAT ANTRIAN)
          ======================================================== */}
      {isPickerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Panggil Kode Produksi ke Antrian</h3>
                  <p className="text-[11px] text-slate-500">Pilih kode barang dari riwayat kedatangan untuk diverifikasi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPickerModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search in picker */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Ketik kode produksi / nama produk / vendor UP..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  autoFocus
                />
              </div>
            </div>

            {/* List of Available Codes across entire history */}
            <div className="p-3 overflow-y-auto space-y-1.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
              {allCodeGroups
                .filter(
                  (g) =>
                    !pickerSearch.trim() ||
                    g.kode_produksi.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                    g.nama_produk.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                    (g.vendor_up && g.vendor_up.toLowerCase().includes(pickerSearch.toLowerCase()))
                )
                .slice(0, 40)
                .map((g) => {
                  const isInQueue = queuedCodes.includes(g.kode_produksi);
                  return (
                    <div
                      key={g.kode_produksi}
                      onClick={() => {
                        setIsPickerModalOpen(false);
                        handleOpenWorkspace(g.kode_produksi);
                      }}
                      className="p-2.5 hover:bg-rose-50/50 dark:hover:bg-rose-950/30 rounded-xl transition cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5">
                        {g.photo_url ? (
                          <img
                            src={g.photo_url}
                            alt={g.kode_produksi}
                            className="w-9 h-9 rounded-lg object-contain bg-slate-100 dark:bg-slate-800 border border-slate-200"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <span className="font-mono text-xs font-black text-rose-600 dark:text-rose-400">
                            {g.kode_produksi}
                          </span>
                          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 line-clamp-1">
                            {g.nama_produk || 'Produk Tanpa Nama'}
                          </p>
                          <span className="text-[10px] text-slate-400">
                            {g.kategori} • Total: {g.total_asli} pcs
                          </span>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-1.5">
                        {g.is_counted ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            {g.total_selisih === 0 ? '✅ Match' : `⚠️ Selisih: ${g.total_selisih}`}
                          </span>
                        ) : isInQueue ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800">
                            Di Antrian
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            + Pilih
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          4. MODAL: RIWAYAT AUDIT LOG PUTARAN
          ======================================================== */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Riwayat Audit Fisik: {historyTargetCode}
                  </h3>
                  <p className="text-[11px] text-slate-500">Log putaran hasil hitung ulang fisik gudang</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {isLoadingHistory ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-rose-500" />
                  <p className="text-xs">Memuat catatan log audit...</p>
                </div>
              ) : historyLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <p className="text-xs">Belum ada riwayat audit fisik yang tercatat untuk kode ini.</p>
                </div>
              ) : (
                historyLogs.map((log, idx) => (
                  <div
                    key={log.id || idx}
                    className="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Tanggal: {log.tanggal_audit} &bull; Oleh: <strong className="text-rose-600">{log.auditor}</strong>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {log.created_at ? new Date(log.created_at).toLocaleString('id-ID') : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl text-center font-mono text-xs">
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Sebelumnya</span>
                        <span className="font-bold">{log.total_sebelumnya}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Fisik</span>
                        <span className="font-black text-blue-600">{log.total_fisik}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Selisih</span>
                        <span
                          className={`font-black ${
                            log.total_selisih === 0
                              ? 'text-emerald-600'
                              : log.total_selisih < 0
                              ? 'text-rose-600'
                              : 'text-blue-600'
                          }`}
                        >
                          {log.total_selisih > 0 ? `+${log.total_selisih}` : log.total_selisih}
                        </span>
                      </div>
                    </div>

                    {log.general_notes ? (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 italic">
                        Catatan: "{log.general_notes}"
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          5. HIDDEN PRINT CONTAINER (DIRECT ISOLATED PRINT)
          ======================================================== */}
      <div ref={printContainerRef} style={{ display: 'none' }}>
        {activeGroup && (
          <div>
            <div className="header-box">
              <h2 style={{ fontSize: '15px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                LEMBAR KERJA VERIFIKASI FISIK KEDATANGAN
              </h2>
              <p style={{ fontSize: '10px', color: '#475569', margin: '3px 0 0 0' }}>
                WMS CHOCOCHIPS WAREHOUSE &bull; AUDIT KEDATANGAN BARANG GUDANG
              </p>
              <div style={{ marginTop: '8px', fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <strong>Kode Produksi:</strong>{' '}
                  <span className="badge" style={{ backgroundColor: '#ffe4e6', color: '#be123c', fontSize: '13px' }}>
                    {activeGroup.kode_produksi}
                  </span>
                  <div style={{ marginTop: '2px' }}>
                    <strong>Produk:</strong> {activeGroup.nama_produk || '-'} ({activeGroup.kategori})
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Tanggal Cetak:</strong> {new Date().toLocaleDateString('id-ID')}</div>
                  <div><strong>Petugas:</strong> {auditorName || '................'}</div>
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style={{ width: '30px' }}>No</th>
                  <th>Warna</th>
                  <th style={{ width: '60px' }}>Size</th>
                  <th style={{ width: '90px' }}>Qty Asli SJ</th>
                  <th style={{ width: '100px' }}>Hasil Fisik</th>
                  <th style={{ width: '80px' }}>Selisih</th>
                  <th>Keterangan / Kondisi Barang</th>
                </tr>
              </thead>
              <tbody>
                {activeVariants.map((v, i) => (
                  <tr key={i}>
                    <td className="text-center">{i + 1}</td>
                    <td className="font-bold">{v.warna}</td>
                    <td className="text-center font-bold">{v.size}</td>
                    <td className="text-center font-bold">{v.qty_asli}</td>
                    <td className="text-center" style={{ backgroundColor: '#f8fafc' }}></td>
                    <td className="text-center"></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9' }}>
                  <td colSpan={3} className="text-right">TOTAL PCS:</td>
                  <td className="text-center">{activeGroup.total_asli}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            <div className="sign-box">
              <div>
                Petugas Penghitung Fisik
                <div className="sign-line"></div>
                ( {auditorName || '.......................'} )
              </div>
              <div>
                Supervisor / Kepala Gudang
                <div className="sign-line"></div>
                ( ....................... )
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
