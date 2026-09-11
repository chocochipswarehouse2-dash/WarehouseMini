import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Upload, RefreshCw, Send, ChevronDown, ChevronUp, CheckCircle2,
  AlertTriangle, Package, FileText, Trash2, ClipboardCheck, X,
  Minus, Plus, RotateCcw, ArrowUpDown, ScanLine, Download,
  Edit3, ArrowLeftRight, Check, Search, Filter, Layers, ListFilter,
  Wifi, WifiOff, CloudOff
} from 'lucide-react';
import {
  UserSession,
  ProductItem,
  TarikanMDItem,
  TarikanMDScanResult,
  PengecekanSJItem,
  PengecekanSJDraft,
  PengecekanSJRecord,
} from '../types';
import { isSuperadmin, hasPermission } from '../services/permissions';
import { PhysicalScanInput } from './PhysicalScanInput';
import {
  fetchTarikanMDRecords,
  submitTarikanMD,
  deleteTarikanMD,
  editPengecekanSJ,
  loadSJDrafts,
  saveSJDrafts,
  deleteSJDraft,
  exportPengecekanToCsv,
  getPendingOfflinePengecekanSJ,
  syncPendingOfflinePengecekanSJ,
} from '../services/gasTarikanMD';
import { playSuccessBeep, playErrorBeep } from '../services/audio';

interface TarikanMDViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

// ==========================================
// CSV PARSER HELPER (ROBUST RFC-4180 COMPLIANT)
// ==========================================
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === ',' || char === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

interface ParsedSJGroup {
  no_sj: string;
  source: string;
  destination: string;
  tanggal_sj: string;
  file_name?: string;
  items: TarikanMDItem[];
}

/**
 * Membaca file CSV Surat Jalan.
 * Mendeteksi jika 1 CSV terisi lebih dari 1 No SJ, otomatis memisahkan menjadi draft-draft mandiri!
 */
function parseCsvContent(content: string, fileName: string): ParsedSJGroup[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error(`File ${fileName} kosong atau format tidak valid`);

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.replace(/"/g, '').trim().toLowerCase());

  const col = {
    date: headers.findIndex(h => h === 'date' || h === 'tanggal' || h === 'tgl' || h === 'delivery date'),
    noSj: headers.findIndex(h =>
      h === 'number delivery' || h === 'number_delivery' ||
      h === 'no sj' || h === 'no_sj' ||
      h === 'nomor delivery' || h === 'delivery number' ||
      h === 'no. sj' || h === 'no_surat_jalan' || h === 'surat jalan' ||
      h === 'delivery note'
    ),
    category: headers.findIndex(h => h === 'category' || h === 'kategori'),
    product:  headers.findIndex(h => h === 'product' || h === 'produk' || h === 'nama produk' || h === 'nama_produk' || h === 'item name'),
    variant:  headers.findIndex(h => h === 'variant' || h === 'variasi' || h === 'varian' || h === 'size' || h === 'warna'),
    code:     headers.findIndex(h => h === 'code' || h === 'sku' || h === 'item code' || h === 'kode produk' || h === 'barcode'),
    qty:      headers.findIndex(h => h === 'qty' || h === 'quantity' || h === 'jumlah' || h === 'qty sj'),
    source:   headers.findIndex(h => h === 'source' || h === 'asal' || h === 'dari' || h === 'pengirim' || h === 'outlet asal'),
    dest:     headers.findIndex(h => h === 'destination' || h === 'tujuan' || h === 'ke' || h === 'penerima' || h === 'outlet tujuan'),
  };

  if (col.code < 0) {
    throw new Error(`File ${fileName}: Kolom kode SKU/Code tidak ditemukan.`);
  }

  // Grouping map: Key = `${no_sj}___${source}___${destination}`
  const groupMap = new Map<string, {
    no_sj: string;
    source: string;
    destination: string;
    tanggal_sj: string;
    skuMap: Map<string, TarikanMDItem>;
  }>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    const get = (idx: number) => idx >= 0 ? (cols[idx] || '').replace(/"/g, '').trim() : '';

    const sku = get(col.code);
    if (!sku) continue;

    let rowNoSj = get(col.noSj);
    if (!rowNoSj) rowNoSj = fileName.replace(/\.[^/.]+$/, '').trim(); // Fallback ke nama file jika kosong
    const rowSource = get(col.source) || 'Gudang Pusat';
    const rowDest = get(col.dest) || 'Tujuan';
    const rowDate = get(col.date) || new Date().toISOString().slice(0, 10);
    const qty = parseInt(get(col.qty) || '0', 10) || 0;
    const nama = get(col.variant) || get(col.product) || sku;
    const category = get(col.category);

    const groupKey = `${rowNoSj.toUpperCase()}___${rowSource.toUpperCase()}___${rowDest.toUpperCase()}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        no_sj: rowNoSj,
        source: rowSource,
        destination: rowDest,
        tanggal_sj: rowDate,
        skuMap: new Map(),
      });
    }

    const group = groupMap.get(groupKey)!;
    if (group.skuMap.has(sku)) {
      group.skuMap.get(sku)!.qty_sj += qty;
    } else {
      group.skuMap.set(sku, { sku, nama_produk: nama, category, qty_sj: qty });
    }
  }

  if (groupMap.size === 0) {
    throw new Error(`File ${fileName}: Tidak ada data SKU yang valid.`);
  }

  const results: ParsedSJGroup[] = [];
  for (const group of groupMap.values()) {
    results.push({
      no_sj: group.no_sj,
      source: group.source,
      destination: group.destination,
      tanggal_sj: group.tanggal_sj,
      file_name: fileName,
      items: Array.from(group.skuMap.values()),
    });
  }

  return results;
}

// ==========================================
// SUBCOMPONENTS
// ==========================================
const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    COCOK:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800',
    KURANG:  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300 dark:border-rose-800',
    LEBIH:   'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-300 dark:border-amber-800',
    SELISIH: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300 dark:border-rose-800',
    PENDING: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-300 dark:border-blue-800',
    SELESAI: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400 border border-teal-300 dark:border-teal-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
};

// ==========================================
// MAIN COMPONENT: PENGECEKAN SURAT JALAN
// ==========================================
export const TarikanMDView: React.FC<TarikanMDViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  const userIsAdmin = isSuperadmin(session);
  const canAction = userIsAdmin || hasPermission(session, 'can_tarikan_md');

  // ---- TABS ----
  const [activeTab, setActiveTab] = useState<'pengecekan' | 'riwayat'>('pengecekan');

  // ---- DRAFT QUEUE (ANTREAN PENGECEKAN) ----
  const [drafts, setDrafts] = useState<PengecekanSJDraft[]>(() => loadSJDrafts());
  const [activeDraftId, setActiveDraftId] = useState<string | null>(() => {
    const loaded = loadSJDrafts();
    return loaded.length > 0 ? loaded[0].id : null;
  });

  // Sinkronisasi drafts ke localStorage
  useEffect(() => {
    saveSJDrafts(drafts);
    // Jika activeDraftId tidak lagi ada di daftar, reset ke draft pertama
    if (drafts.length > 0 && (!activeDraftId || !drafts.some(d => d.id === activeDraftId))) {
      setActiveDraftId(drafts[0].id);
    } else if (drafts.length === 0) {
      setActiveDraftId(null);
    }
  }, [drafts, activeDraftId]);

  // Active Draft object
  const activeDraft = useMemo(() => {
    return drafts.find(d => d.id === activeDraftId) || null;
  }, [drafts, activeDraftId]);

  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- RIWAYAT PENGECEKAN STATE ----
  const [records, setRecords] = useState<PengecekanSJRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'COCOK' | 'SELISIH'>('ALL');

  // Inline Edit Mode untuk Admin
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<PengecekanSJRecord | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Offline & Sync Detection
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(() => getPendingOfflinePengecekanSJ().length);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Begitu internet pulih, coba sinkronisasi otomatis
      syncPendingOfflinePengecekanSJ().then((res) => {
        if (res.successCount > 0) {
          onShowToast(`Koneksi internet pulih: ${res.successCount} hasil pengecekan berhasil disinkronkan ke Sheet!`, 'success');
          loadRecords();
        }
        setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSyncOffline = async () => {
    if (!isOnline) {
      onShowToast('Perangkat masih dalam kondisi offline. Sambungkan ke internet terlebih dahulu.', 'warning');
      return;
    }
    setIsSyncingOffline(true);
    try {
      const res = await syncPendingOfflinePengecekanSJ();
      if (res.successCount > 0) {
        onShowToast(`Berhasil menyinkronkan ${res.successCount} data surat jalan ke Google Sheets!`, 'success');
        loadRecords();
      } else if (res.remainingCount > 0) {
        onShowToast('Gagal menghubungi Google Sheets. Coba sesaat lagi.', 'warning');
      } else {
        onShowToast('Semua data pengecekan sudah tersinkronisasi!', 'info');
      }
      setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);
    } catch {
      onShowToast('Terjadi kesalahan saat sinkronisasi.', 'error');
    } finally {
      setIsSyncingOffline(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'riwayat') {
      loadRecords();
    }
  }, [activeTab]);

  // ---- COMPUTED STATS ACTIVE DRAFT ----
  const comparisonData = useMemo<TarikanMDScanResult[]>(() => {
    if (!activeDraft) return [];
    return activeDraft.items.map(item => {
      const qty_scan = activeDraft.scanQty[item.sku] ?? 0;
      const selisih = qty_scan - item.qty_sj;
      return {
        ...item,
        qty_scan,
        selisih,
        status: selisih === 0 ? 'COCOK' : selisih < 0 ? 'KURANG' : 'LEBIH',
      };
    });
  }, [activeDraft]);

  const summary = useMemo(() => {
    if (!activeDraft) {
      return { total_sj: 0, total_scan: 0, cocok: 0, kurang: 0, lebih: 0, unexpectedCount: 0, total_unexpected_qty: 0, has_selisih: false };
    }
    const total_sj    = comparisonData.reduce((s, i) => s + i.qty_sj, 0);
    const total_scan  = comparisonData.reduce((s, i) => s + i.qty_scan, 0);
    const cocok       = comparisonData.filter(i => i.status === 'COCOK').length;
    const kurang      = comparisonData.filter(i => i.status === 'KURANG').length;
    const lebih       = comparisonData.filter(i => i.status === 'LEBIH').length;
    const unexpectedCount = Object.keys(activeDraft.unexpected || {}).length;
    const total_unexpected_qty = Object.values(activeDraft.unexpected || {}).reduce((s, v) => s + v.qty, 0);
    const has_selisih = kurang > 0 || lebih > 0 || unexpectedCount > 0;
    return { total_sj, total_scan, cocok, kurang, lebih, unexpectedCount, total_unexpected_qty, has_selisih };
  }, [activeDraft, comparisonData]);

  // ==========================================
  // MULTI-CSV IMPORT & AUTO SPLIT MULTI-SJ
  // ==========================================
  const handleFilesChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let totalSjFound = 0;
    const newDrafts: PengecekanSJDraft[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const content = await file.text();
        const groups = parseCsvContent(content, file.name);

        for (const g of groups) {
          const draftId = `${g.no_sj.trim().toUpperCase()}___${(g.source || '').trim().toUpperCase()}___${(g.destination || '').trim().toUpperCase()}`;
          const existing = drafts.find(d => d.id === draftId);

          const draft: PengecekanSJDraft = {
            id: draftId,
            no_sj: g.no_sj,
            source: g.source,
            destination: g.destination,
            tanggal_sj: g.tanggal_sj,
            file_name: file.name,
            items: g.items,
            scanQty: existing ? existing.scanQty : {},
            unexpected: existing ? existing.unexpected : {},
            catatan: existing ? existing.catatan : '',
            status: 'draft',
            created_at: existing ? existing.created_at : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          newDrafts.push(draft);
          totalSjFound++;
        }
      } catch (err) {
        onShowToast(`Gagal membaca "${file.name}": ${err instanceof Error ? err.message : 'Format error'}`, 'error');
      }
    }

    if (newDrafts.length > 0) {
      setDrafts(prev => {
        // Timpa atau tambahkan draft dengan ID yang sama
        const map = new Map<string, PengecekanSJDraft>();
        prev.forEach(d => map.set(d.id, d));
        newDrafts.forEach(d => map.set(d.id, d));
        return Array.from(map.values());
      });

      // Otomatis pilih draft pertama yang baru diimport jika belum ada yang aktif
      setActiveDraftId(newDrafts[0].id);
      onShowToast(`Berhasil mengimpor ${totalSjFound} Surat Jalan ke Antrean Pengecekan!`, 'success');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [drafts, onShowToast]);

  // ==========================================
  // SCAN HANDLER & CATALOG LOOKUP
  // ==========================================
  const handleScan = useCallback((rawSku: string) => {
    const sku = rawSku.trim();
    if (!sku) return;
    if (!activeDraft) {
      onShowToast('Pilih atau import Surat Jalan di antrean sebelum scan!', 'warning');
      return;
    }

    const cleanSku = sku.toUpperCase();
    const foundInSj = activeDraft.items.find(
      item => item.sku.toUpperCase() === cleanSku
    );

    if (foundInSj) {
      // Ada di Surat Jalan -> Tambah Qty Scan
      setDrafts(prev => prev.map(d => {
        if (d.id === activeDraft.id) {
          const currentQty = d.scanQty[foundInSj.sku] ?? 0;
          return {
            ...d,
            scanQty: { ...d.scanQty, [foundInSj.sku]: currentQty + 1 },
            updated_at: new Date().toISOString(),
          };
        }
        return d;
      }));
      playSuccessBeep();
    } else {
      // TIDAK ADA DI SURAT JALAN -> Cari nama produk di master catalog
      const masterProduct = productCatalog.find(
        p => (p.k && p.k.toUpperCase() === cleanSku) ||
             (p.sku && String(p.sku).toUpperCase() === cleanSku)
      );

      const resolvedName = masterProduct
        ? (masterProduct.p || masterProduct.n || (masterProduct as any).nama_produk || sku)
        : 'SKU Tidak Terdaftar di Master Produk';

      const resolvedCategory = masterProduct?.category || masterProduct?.c || 'Lainnya';

      setDrafts(prev => prev.map(d => {
        if (d.id === activeDraft.id) {
          const currentVal = d.unexpected[sku] || { qty: 0 };
          return {
            ...d,
            unexpected: {
              ...d.unexpected,
              [sku]: {
                nama: resolvedName,
                qty: currentVal.qty + 1,
                category: resolvedCategory,
              },
            },
            updated_at: new Date().toISOString(),
          };
        }
        return d;
      }));

      playErrorBeep();
      onShowToast(`⚠️ SKU "${sku}" (${resolvedName}) tidak ada di SJ (dicatat sebagai Lebih)`, 'warning');
    }
  }, [activeDraft, productCatalog, onShowToast]);

  const handleManualQty = (sku: string, value: number) => {
    if (!activeDraft) return;
    setDrafts(prev => prev.map(d => {
      if (d.id === activeDraft.id) {
        return {
          ...d,
          scanQty: { ...d.scanQty, [sku]: Math.max(0, value) },
          updated_at: new Date().toISOString(),
        };
      }
      return d;
    }));
  };

  const handleManualUnexpectedQty = (sku: string, value: number) => {
    if (!activeDraft) return;
    setDrafts(prev => prev.map(d => {
      if (d.id === activeDraft.id) {
        if (value <= 0) {
          const unexp = { ...d.unexpected };
          delete unexp[sku];
          return { ...d, unexpected: unexp, updated_at: new Date().toISOString() };
        }
        return {
          ...d,
          unexpected: {
            ...d.unexpected,
            [sku]: { ...d.unexpected[sku], qty: value },
          },
          updated_at: new Date().toISOString(),
        };
      }
      return d;
    }));
  };

  const handleRemoveUnexpected = (sku: string) => {
    if (!activeDraft) return;
    setDrafts(prev => prev.map(d => {
      if (d.id === activeDraft.id) {
        const unexp = { ...d.unexpected };
        delete unexp[sku];
        return { ...d, unexpected: unexp, updated_at: new Date().toISOString() };
      }
      return d;
    }));
  };

  // ==========================================
  // SUBMIT PENGECEKAN KE DATABASE / GOOGLE SHEET
  // (KESELURUHAN DATA ITEM DITULIS SAMA SEPERTI MANUAL SHIPMENT)
  // ==========================================
  const handleSubmitPengecekan = async () => {
    if (!activeDraft) {
      onShowToast('Pilih Surat Jalan di antrean dahulu!', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const submittedBy = session?.name || session?.username || 'Operator';

      // 1. Kumpulkan baris item surat jalan reguler
      const regularRows: PengecekanSJItem[] = comparisonData.map(item => ({
        id: `${activeDraft.no_sj}-${item.sku}`,
        no_sj: activeDraft.no_sj,
        source: activeDraft.source,
        destination: activeDraft.destination,
        tanggal_sj: activeDraft.tanggal_sj,
        sku: item.sku,
        nama_produk: item.nama_produk,
        category: item.category || '',
        qty_sj: item.qty_sj,
        qty_scan: item.qty_scan,
        selisih: item.selisih,
        status_item: item.status,
        status_sj: 'pending',
        is_unexpected: false,
        submitted_by: submittedBy,
        created_at: nowIso,
        catatan: activeDraft.catatan || '',
      }));

      // 2. Kumpulkan baris item lebihan yang tidak ada di list surat jalan
      // Dicatat dengan variabel No SJ + Source + Destination yang SAMA persis!
      const unexpectedRows: PengecekanSJItem[] = Object.entries(activeDraft.unexpected || {}).map(([sku, val]) => ({
        id: `${activeDraft.no_sj}-${sku}-unexpected`,
        no_sj: activeDraft.no_sj,
        source: activeDraft.source,
        destination: activeDraft.destination,
        tanggal_sj: activeDraft.tanggal_sj,
        sku,
        nama_produk: val.nama || sku,
        category: val.category || 'Lebih',
        qty_sj: 0,
        qty_scan: val.qty,
        selisih: val.qty,
        status_item: 'LEBIH' as const,
        status_sj: 'pending',
        is_unexpected: true,
        submitted_by: submittedBy,
        created_at: nowIso,
        catatan: 'Lebihan barang tidak ada di Surat Jalan',
      }));

      const allRows: PengecekanSJItem[] = [...regularRows, ...unexpectedRows];

      const record: PengecekanSJRecord = {
        id: activeDraft.id,
        no_sj: activeDraft.no_sj,
        source: activeDraft.source,
        destination: activeDraft.destination,
        tanggal_sj: activeDraft.tanggal_sj,
        status: 'pending', // Sesuai instruksi: disubmit masuk ke list pengecekan otomatis langsung ditulis ke sheet dengan status pending
        status_komparasi: summary.has_selisih ? 'SELISIH' : 'COCOK',
        total_qty_sj: summary.total_sj,
        total_qty_terima: summary.total_scan + summary.total_unexpected_qty,
        total_sku: allRows.length,
        submitted_by: submittedBy,
        created_at: nowIso,
        catatan: activeDraft.catatan || '',
        items: allRows,
        items_json: JSON.stringify(allRows),
      };

      const result = await submitTarikanMD(record);
      if (result.success) {
        if (result.offline) {
          onShowToast(result.message || 'Tersimpan offline di perangkat. Otomatis dikirim ke Google Sheets saat internet kembali aktif.', 'info');
        } else {
          onShowToast(`Pengecekan SJ "${activeDraft.no_sj}" berhasil disubmit ke Sheet dengan status PENDING!`, 'success');
        }

        // Hapus dari antrean draft karena scan fisik sudah selesai
        deleteSJDraft(activeDraft.id);
        setDrafts(prev => prev.filter(d => d.id !== activeDraft.id));
        setPendingOfflineCount(getPendingOfflinePengecekanSJ().length);

        // Buka tab Riwayat Pengecekan
        setActiveTab('riwayat');
        loadRecords();
      } else {
        onShowToast('Gagal menyimpan hasil pengecekan.', 'error');
      }
    } catch (e) {
      console.error('Submit error:', e);
      onShowToast('Terjadi kesalahan saat submit data.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // RIWAYAT PENGECEKAN ACTIONS
  // ==========================================
  const loadRecords = async () => {
    setLoadingRecords(true);
    try {
      const data = await fetchTarikanMDRecords();
      setRecords(data.reverse()); // Terbaru di atas
    } catch {
      onShowToast('Gagal memuat riwayat pengecekan.', 'error');
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleDeleteRecord = async (rec: PengecekanSJRecord) => {
    if (!window.confirm(`Yakin hapus riwayat Surat Jalan "${rec.no_sj}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeletingId(rec.id);
    try {
      await deleteTarikanMD(rec.id, rec.no_sj);
      setRecords(prev => prev.filter(r => r.id !== rec.id));
      onShowToast(`Riwayat SJ "${rec.no_sj}" berhasil dihapus!`, 'success');
    } catch {
      onShowToast('Gagal menghapus riwayat.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * KEMBALIKAN KE TAB PENGECEKAN (Fitur yang diminta user)
   * Mengembalikan record dari riwayat ke antrean tab pengecekan agar bisa dicek / discan ulang
   */
  const handleKembalikanKePengecekan = (rec: PengecekanSJRecord) => {
    const draftId = rec.id || `${rec.no_sj.toUpperCase()}___${rec.source.toUpperCase()}___${rec.destination.toUpperCase()}`;

    // Ekstrak items reguler dan unexpected
    const items: TarikanMDItem[] = [];
    const scanQty: Record<string, number> = {};
    const unexpected: Record<string, { nama?: string; qty: number; category?: string }> = {};

    for (const item of rec.items) {
      if (item.is_unexpected || item.qty_sj === 0) {
        unexpected[item.sku] = {
          nama: item.nama_produk,
          qty: item.qty_scan,
          category: item.category,
        };
      } else {
        items.push({
          sku: item.sku,
          nama_produk: item.nama_produk,
          category: item.category,
          qty_sj: item.qty_sj,
        });
        scanQty[item.sku] = item.qty_scan;
      }
    }

    const restoredDraft: PengecekanSJDraft = {
      id: draftId,
      no_sj: rec.no_sj,
      source: rec.source,
      destination: rec.destination,
      tanggal_sj: rec.tanggal_sj,
      file_name: `SJ-${rec.no_sj}`,
      items,
      scanQty,
      unexpected,
      catatan: rec.catatan || '',
      status: 'draft',
      created_at: rec.created_at,
      updated_at: new Date().toISOString(),
    };

    // Tambahkan atau update di antrean drafts
    setDrafts(prev => {
      const filtered = prev.filter(d => d.id !== draftId);
      return [restoredDraft, ...filtered];
    });

    setActiveDraftId(draftId);
    setActiveTab('pengecekan');
    onShowToast(`Surat Jalan "${rec.no_sj}" berhasil dikembalikan ke tab Pengecekan untuk scan ulang.`, 'success');
  };

  // EDIT OLEH ADMIN
  const handleStartEdit = (rec: PengecekanSJRecord) => {
    setEditingRecordId(rec.id);
    // Deep clone record untuk editing
    setEditFormData(JSON.parse(JSON.stringify(rec)));
  };

  const handleSaveEdit = async () => {
    if (!editFormData) return;
    setSavingEdit(true);
    try {
      // Hitung ulang total dan status komparasi
      const total_sj = editFormData.items.reduce((acc, i) => acc + (i.qty_sj || 0), 0);
      const total_scan = editFormData.items.reduce((acc, i) => acc + (i.qty_scan || 0), 0);
      const has_selisih = editFormData.items.some(i => (i.qty_scan - i.qty_sj) !== 0);

      const updatedRecord: PengecekanSJRecord = {
        ...editFormData,
        total_qty_sj: total_sj,
        total_qty_terima: total_scan,
        status_komparasi: has_selisih ? 'SELISIH' : 'COCOK',
        updated_at: new Date().toISOString(),
        items_json: JSON.stringify(editFormData.items),
      };

      await editPengecekanSJ(updatedRecord);
      setRecords(prev => prev.map(r => (r.id === updatedRecord.id ? updatedRecord : r)));
      onShowToast(`Perubahan riwayat SJ "${updatedRecord.no_sj}" berhasil disimpan!`, 'success');
      setEditingRecordId(null);
      setEditFormData(null);
    } catch {
      onShowToast('Gagal menyimpan perubahan.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // FILTERED RIWAYAT RECORDS
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchSearch =
        !searchFilter ||
        r.no_sj.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.source.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.destination.toLowerCase().includes(searchFilter.toLowerCase()) ||
        r.items.some(i => i.sku.toLowerCase().includes(searchFilter.toLowerCase()) || i.nama_produk.toLowerCase().includes(searchFilter.toLowerCase()));

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PENDING' && r.status === 'pending') ||
        (statusFilter === 'COCOK' && r.status_komparasi === 'COCOK') ||
        (statusFilter === 'SELISIH' && r.status_komparasi === 'SELISIH');

      return matchSearch && matchStatus;
    });
  }, [records, searchFilter, statusFilter]);

  // ==========================================
  // RENDER VIEW
  // ==========================================
  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0b1324]">
      {/* ---- HEADER UTAMA ---- */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/30 flex items-center justify-center text-primary-500 shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                Pengecekan Surat Jalan
              </h1>
              <p className="text-xs text-slate-400">
                Pengecekan surat jalan, antrean draft, komparasi scan & riwayat penerimaan
              </p>
            </div>
          </div>

          {/* Quick Action Export Semua & Status Indikator */}
          <div className="flex items-center gap-2">
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
            }`}>
              {isOnline ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-500" />
                  <span>Offline</span>
                </>
              )}
            </div>

            {activeTab === 'riwayat' && records.length > 0 && (
              <button
                type="button"
                onClick={() => exportPengecekanToCsv(records, `Semua_Riwayat_Pengecekan_SJ_${new Date().toISOString().slice(0, 10)}.csv`)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export Semua Data</span>
                <span className="sm:hidden">Export</span>
              </button>
            )}
          </div>
        </div>

        {/* OFFLINE INDICATOR BANNER */}
        {!isOnline && (
          <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-700 dark:text-amber-300 text-xs">
            <div className="flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Mode Offline Aktif:</strong> Internet terputus. Anda tetap bisa melakukan scan barcode dan import; progres scan tersimpan otomatis di perangkat Anda tanpa hilang.
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-[10px] font-extrabold shrink-0 text-amber-700 dark:text-amber-300">
              Aman & Tersimpan
            </span>
          </div>
        )}

        {/* PENDING OFFLINE SYNC BANNER */}
        {pendingOfflineCount > 0 && (
          <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3 text-blue-700 dark:text-blue-300 text-xs">
            <div className="flex items-center gap-2.5">
              <CloudOff className="w-4 h-4 shrink-0 text-blue-500" />
              <span>
                <strong>{pendingOfflineCount} Surat Jalan</strong> telah selesai dicek secara offline dan menunggu dikirim ke Google Sheets.
              </span>
            </div>
            <button
              type="button"
              disabled={isSyncingOffline || !isOnline}
              onClick={handleManualSyncOffline}
              className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                !isOnline
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOffline ? 'animate-spin' : ''}`} />
              <span>{isSyncingOffline ? 'Menyinkronkan...' : isOnline ? 'Sinkronkan Sekarang' : 'Menunggu Internet'}</span>
            </button>
          </div>
        )}

        {/* TABS SELECTOR */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setActiveTab('pengecekan')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'pengecekan'
                ? 'bg-white dark:bg-[#131d31] text-primary-500 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>🔍 Pengecekan Barang</span>
            {drafts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-primary-500 text-white text-[10px] font-extrabold">
                {drafts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('riwayat')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeTab === 'riwayat'
                ? 'bg-white dark:bg-[#131d31] text-primary-500 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>📋 Riwayat Pengecekan</span>
            {records.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-extrabold">
                {records.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ---- TAB CONTENT BODY ---- */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">

        {/* ======================================================== */}
        {/* TAB 1: PENGECEKAN BARANG & ANTREAN DRAFT                 */}
        {/* ======================================================== */}
        {activeTab === 'pengecekan' && (
          <>
            {/* CARD IMPORT CSV */}
            <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-primary-500" />
                    Import File Surat Jalan (Bisa Banyak CSV)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    1 file CSV = 1 draft. Jika 1 file berisi banyak No SJ, sistem otomatis memisahkannya.
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                multiple
                onChange={handleFilesChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary-400 hover:bg-primary-50/20 dark:hover:bg-primary-950/10 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Upload className="w-4 h-4 text-primary-500" />
                <span>Pilih satu atau beberapa file CSV Surat Jalan untuk diimport</span>
              </button>
            </div>

            {/* ANTREAN PENGECEKAN (DRAFT PEKERJAAN STAY DI TAB PENGECEKAN) */}
            {drafts.length > 0 && (
              <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary-500" />
                    <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">
                      Antrean Pengecekan ({drafts.length} Surat Jalan)
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Draft tersimpan lokal, pilih SJ yang ingin dicek
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {drafts.map(draft => {
                    const isSelected = draft.id === activeDraftId;
                    const totalQtySj = draft.items.reduce((s, i) => s + i.qty_sj, 0);
                    const totalScanned = Object.values(draft.scanQty).reduce((s, v) => s + v, 0) +
                                         Object.values(draft.unexpected || {}).reduce((s, v) => s + v.qty, 0);
                    const progressPercent = totalQtySj > 0 ? Math.min(100, Math.round((totalScanned / totalQtySj) * 100)) : 0;

                    return (
                      <div
                        key={draft.id}
                        onClick={() => setActiveDraftId(draft.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50/30 dark:bg-primary-950/20 ring-2 ring-primary-500/20 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-mono text-xs font-black text-slate-800 dark:text-white">
                              {draft.no_sj}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isSelected ? 'bg-primary-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                              {isSelected ? 'Sedang Dicek' : 'Antrean'}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                            <span>{draft.source} → {draft.destination}</span>
                            <span className="mx-1.5">·</span>
                            <span>{draft.tanggal_sj}</span>
                          </div>

                          {/* Progress */}
                          <div className="mb-2">
                            <div className="flex justify-between text-[10px] font-bold mb-1">
                              <span className="text-slate-400">Progress Scan</span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {totalScanned} / {totalQtySj} pcs ({progressPercent}%)
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  progressPercent === 100 ? 'bg-emerald-500' : 'bg-primary-500'
                                }`}
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Card bottom actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-2">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {draft.items.length} SKU
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Hapus draft SJ "${draft.no_sj}" dari antrean?`)) {
                                  deleteSJDraft(draft.id);
                                  setDrafts(prev => prev.filter(d => d.id !== draft.id));
                                  onShowToast(`Draft SJ "${draft.no_sj}" dihapus.`, 'info');
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded-md transition-colors cursor-pointer"
                              title="Hapus draft dari antrean"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDraftId(draft.id);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-primary-500 text-white shadow-xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {isSelected ? 'Aktif' : 'Pilih SJ'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AREA SCAN & KOMPARASI UNTUK DRAFT YANG SEDANG AKTIF */}
            {activeDraft ? (
              <>
                {/* ACTIVE SJ HEADER BANNER */}
                <div className="bg-gradient-to-r from-primary-500/10 to-primary-500/5 dark:from-primary-950/40 dark:to-primary-950/20 border border-primary-500/30 rounded-2xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary-500 text-white">
                          Surat Jalan Aktif
                        </span>
                        <h2 className="text-base font-black text-slate-900 dark:text-white font-mono">
                          {activeDraft.no_sj}
                        </h2>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Asal: <strong>{activeDraft.source}</strong></span>
                        <span>→</span>
                        <span>Tujuan: <strong>{activeDraft.destination}</strong></span>
                        <span>·</span>
                        <span>Tanggal: <strong>{activeDraft.tanggal_sj}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Reset seluruh hasil scan untuk SJ "${activeDraft.no_sj}"?`)) {
                            setDrafts(prev => prev.map(d => d.id === activeDraft.id ? { ...d, scanQty: {}, unexpected: {} } : d));
                            onShowToast('Hasil scan direset.', 'info');
                          }
                        }}
                        className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset Scan
                      </button>
                    </div>
                  </div>
                </div>

                {/* SCAN INPUT */}
                <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <h3 className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ScanLine className="w-3.5 h-3.5 text-primary-500" />
                    Scan Barcode / Input Manual
                  </h3>
                  <PhysicalScanInput
                    onScan={handleScan}
                    products={[]}
                    placeholder="SCAN BARCODE ATAU KETIK SKU LALU ENTER..."
                  />
                  <p className="text-[10px] text-slate-400">
                    Setiap scan otomatis menambah +1 qty. Jika ada item yang tidak terdaftar di surat jalan, sistem akan mencari informasi nama barang di database produk.
                  </p>
                </div>

                {/* SUMMARY STATS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Qty SJ', value: summary.total_sj, color: 'text-slate-800 dark:text-white', bg: 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800' },
                    { label: 'Total Discan', value: summary.total_scan + summary.total_unexpected_qty, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900' },
                    { label: 'SKU Cocok', value: summary.cocok, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900' },
                    { label: 'SKU Selisih', value: summary.kurang + summary.lebih + summary.unexpectedCount, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`${bg} rounded-xl p-3 border`}>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                      <div className={`text-2xl font-black ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* KOMPARASI BARANG TABLE */}
                <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-3.5 h-3.5 text-primary-500" />
                      <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                        Komparasi Barang ({comparisonData.length} SKU di Surat Jalan)
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500">
                          <th className="text-left px-3 py-2.5 font-bold">SKU / Produk</th>
                          <th className="text-center px-3 py-2.5 font-bold w-16">Qty SJ</th>
                          <th className="text-center px-3 py-2.5 font-bold w-28">Qty Scan</th>
                          <th className="text-center px-3 py-2.5 font-bold w-16">Selisih</th>
                          <th className="text-center px-3 py-2.5 font-bold w-20">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {comparisonData.map(item => (
                          <tr
                            key={item.sku}
                            className={`transition-colors ${
                              item.status === 'COCOK'  ? 'bg-emerald-50/40 dark:bg-emerald-950/10' :
                              item.status === 'KURANG' ? 'bg-rose-50/40 dark:bg-rose-950/10' :
                              item.status === 'LEBIH'  ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                            }`}
                          >
                            <td className="px-3 py-2.5">
                              <div className="font-bold text-slate-800 dark:text-white font-mono text-[11px]">{item.sku}</div>
                              <div className="text-slate-400 text-[10px] truncate max-w-[200px]">{item.nama_produk}</div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-slate-700 dark:text-slate-200">{item.qty_sj}</td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleManualQty(item.sku, item.qty_scan - 1)}
                                  className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-900 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <input
                                  type="number"
                                  value={item.qty_scan}
                                  onChange={e => handleManualQty(item.sku, parseInt(e.target.value, 10) || 0)}
                                  className="w-11 text-center font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none border border-slate-300 dark:border-slate-600 rounded-lg text-xs py-0.5"
                                  min={0}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleManualQty(item.sku, item.qty_scan + 1)}
                                  className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-900 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`font-extrabold ${
                                item.selisih === 0 ? 'text-emerald-500' :
                                item.selisih < 0  ? 'text-rose-500' : 'text-amber-500'
                              }`}>
                                {item.selisih > 0 ? `+${item.selisih}` : item.selisih}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <StatusBadge status={item.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* UNEXPECTED ITEMS: BARANG LEBIH DI LUAR SURAT JALAN */}
                  {/* Sistem bantu menuliskan lebihan barang dengan pencatatan No SJ yang sama (No SJ + Source + Destination) */}
                  {Object.keys(activeDraft.unexpected || {}).length > 0 && (
                    <div className="border-t border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        Lebihan Barang Yang Tidak Ada di Surat Jalan ({Object.keys(activeDraft.unexpected).length} SKU)
                      </div>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        Saat disubmit, barang lebihan ini otomatis dicatat ke sheet dengan No SJ yang sama ({activeDraft.no_sj}) dan status pending.
                      </p>

                      <div className="space-y-1.5">
                        {Object.entries(activeDraft.unexpected).map(([sku, val]) => (
                          <div key={sku} className="flex items-center justify-between bg-white dark:bg-[#131d31] border border-amber-200 dark:border-amber-800/80 rounded-xl px-3 py-2">
                            <div className="min-w-0 flex-1 mr-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-amber-800 dark:text-amber-300">{sku}</span>
                                <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded">
                                  Di Luar SJ
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {val.nama || 'Produk Master'}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleManualUnexpectedQty(sku, val.qty - 1)}
                                  className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-900 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <Minus className="w-2.5 h-2.5" />
                                </button>
                                <span className="font-bold text-xs text-amber-700 dark:text-amber-300 w-8 text-center">
                                  +{val.qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleManualUnexpectedQty(sku, val.qty + 1)}
                                  className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-emerald-100 dark:hover:bg-emerald-900 flex items-center justify-center transition-colors cursor-pointer"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveUnexpected(sku)}
                                className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                                title="Hapus dari daftar lebihan"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* CATATAN TAMBAHAN (OPSIONAL) */}
                <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    Catatan Pengecekan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={activeDraft.catatan || ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      setDrafts(prev => prev.map(d => d.id === activeDraft.id ? { ...d, catatan: text } : d));
                    }}
                    placeholder="Contoh: Kondisi fisik barang rapi, dus luar ada sedikit sobek..."
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:border-primary-500"
                  />
                </div>

                {/* SUBMIT KE GOOGLE SHEET (STATUS PENDING) */}
                <div className={`rounded-2xl border-2 p-4 ${
                  summary.has_selisih
                    ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800'
                    : 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                }`}>
                  <div className="flex items-start gap-2 mb-3">
                    {summary.has_selisih
                      ? <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                      : <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />}
                    <div>
                      <div className={`text-sm font-bold ${summary.has_selisih ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                        {summary.has_selisih
                          ? `Terdapat ${summary.kurang + summary.lebih + summary.unexpectedCount} SKU berselisih. Data akan disubmit ke Sheet dengan status PENDING.`
                          : 'Semua barang cocok dengan Surat Jalan ✓ (Status PENDING saat disubmit ke sheet)'}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Keseluruhan data per baris produk akan ditulis ke database sheet (bukan JSON blob).
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmitPengecekan}
                    disabled={submitting}
                    className="w-full py-3.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-all shadow-md shadow-primary-500/20 cursor-pointer"
                  >
                    {submitting ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Menyimpan ke Sheet...</>
                    ) : (
                      <><Send className="w-4 h-4" /> Submit Pengecekan ke Sheet (Status Pending)</>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* EMPTY STATE APABILA ANTREAN KOSONG */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/10 to-primary-500/5 border border-primary-500/20 flex items-center justify-center mb-4">
                  <FileText className="w-10 h-10 text-primary-400" />
                </div>
                <h3 className="text-base font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Antrean Pengecekan Kosong
                </h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                  Import satu atau beberapa file CSV Surat Jalan untuk memulai antrean pekerjaan. Sistem akan otomatis memisahkan per No SJ.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-5 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-primary-500/20 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Import CSV Sekarang
                </button>
              </div>
            )}
          </>
        )}

        {/* ======================================================== */}
        {/* TAB 2: RIWAYAT PENGECEKAN (PENGGANTI REKAP PENERIMAAN)    */}
        {/* ======================================================== */}
        {activeTab === 'riwayat' && (
          <div className="space-y-3">
            {/* HEADER FILTER & STATS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#131d31] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  placeholder="Cari No SJ, Asal, Tujuan, atau SKU..."
                  className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1 flex-wrap">
                {(['ALL', 'PENDING', 'COCOK', 'SELISIH'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-primary-500 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {st === 'ALL' ? 'Semua' : st}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={loadRecords}
                  className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-500/10 rounded-xl transition-all cursor-pointer ml-1"
                  title="Refresh Data"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingRecords ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* RECORD LIST */}
            {loadingRecords ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <RefreshCw className="w-7 h-7 animate-spin text-primary-500" />
                <span className="text-sm font-medium">Memuat riwayat pengecekan...</span>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                <Package className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Belum ada data riwayat pengecekan</p>
                <p className="text-xs text-slate-400 mt-1">Submit pengecekan di tab Pengecekan Barang untuk mencatat ke riwayat.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRecords.map((rec) => {
                  const isExpanded = expandedRow === rec.id;
                  const isEditing = editingRecordId === rec.id;

                  return (
                    <div
                      key={rec.id}
                      className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs"
                    >
                      {/* ROW HEADER */}
                      <div
                        onClick={() => {
                          if (!isEditing) setExpandedRow(isExpanded ? null : rec.id);
                        }}
                        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          rec.status === 'pending' ? 'bg-blue-500' :
                          rec.status_komparasi === 'COCOK' ? 'bg-emerald-500' : 'bg-rose-500'
                        }`} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-slate-800 dark:text-white font-mono">{rec.no_sj}</span>
                            <StatusBadge status={rec.status_komparasi} />
                            {rec.status === 'pending' && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                PENDING
                              </span>
                            )}
                            {rec.sync_status === 'pending_sync' && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-700 flex items-center gap-1">
                                <CloudOff className="w-2.5 h-2.5" />
                                Menunggu Sync (Offline)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{rec.source} → {rec.destination}</span>
                            <span>·</span>
                            <span>{rec.tanggal_sj}</span>
                            <span>·</span>
                            <span>Pemeriksa: {rec.submitted_by}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                            {rec.total_qty_terima} / {rec.total_qty_sj} pcs
                          </div>
                          <div className="text-[10px] text-slate-400">terima / SJ</div>
                        </div>

                        <div className="shrink-0 text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>

                      {/* EXPANDED DETAIL & ACTIONS */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-800">
                          {/* TOOLBAR AKSI: KEMBALIKAN KE PENGECEKAN, EDIT, EXPORT, HAPUS */}
                          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* KEMBALIKAN KE TAB PENGECEKAN */}
                              <button
                                type="button"
                                onClick={() => handleKembalikanKePengecekan(rec)}
                                className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-amber-200 dark:border-amber-800 cursor-pointer"
                                title="Buka kembali SJ ini di tab pengecekan untuk scan ulang"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5 text-amber-500" />
                                Kembalikan ke Tab Pengecekan
                              </button>

                              {/* EXPORT DATA SJ INI */}
                              <button
                                type="button"
                                onClick={() => exportPengecekanToCsv([rec], `Pengecekan_SJ_${rec.no_sj}_${rec.tanggal_sj}.csv`)}
                                className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-slate-500" />
                                Export CSV
                              </button>
                            </div>

                            {/* ADMIN ACTIONS: EDIT & HAPUS */}
                            {userIsAdmin && (
                              <div className="flex items-center gap-2">
                                {!isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(rec)}
                                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-blue-200 dark:border-blue-800 cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={handleSaveEdit}
                                      disabled={savingEdit}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                    >
                                      {savingEdit ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                      Simpan
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRecordId(null);
                                        setEditFormData(null);
                                      }}
                                      className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteRecord(rec)}
                                  disabled={deletingId === rec.id}
                                  className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-rose-200 dark:border-rose-800 cursor-pointer disabled:opacity-50"
                                >
                                  {deletingId === rec.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  Hapus
                                </button>
                              </div>
                            )}
                          </div>

                          {/* EDIT METADATA FORM (JIKA SEDANG EDIT) */}
                          {isEditing && editFormData && (
                            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-900 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Status SJ</label>
                                <select
                                  value={editFormData.status}
                                  onChange={e => setEditFormData({ ...editFormData, status: e.target.value as any })}
                                  className="w-full text-xs font-bold px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                                >
                                  <option value="pending">PENDING</option>
                                  <option value="selesai">SELESAI</option>
                                  <option value="cocok">COCOK</option>
                                  <option value="selisih">SELISIH</option>
                                </select>
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Asal (Source)</label>
                                <input
                                  type="text"
                                  value={editFormData.source}
                                  onChange={e => setEditFormData({ ...editFormData, source: e.target.value })}
                                  className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Tujuan (Destination)</label>
                                <input
                                  type="text"
                                  value={editFormData.destination}
                                  onChange={e => setEditFormData({ ...editFormData, destination: e.target.value })}
                                  className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Catatan</label>
                                <input
                                  type="text"
                                  value={editFormData.catatan || ''}
                                  onChange={e => setEditFormData({ ...editFormData, catatan: e.target.value })}
                                  className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg"
                                />
                              </div>
                            </div>
                          )}

                          {/* TABEL KOMPARASI LENGKAP */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                                  <th className="text-left px-3 py-2 font-bold">SKU</th>
                                  <th className="text-left px-3 py-2 font-bold">Nama Produk</th>
                                  <th className="text-center px-3 py-2 font-bold w-16">SJ</th>
                                  <th className="text-center px-3 py-2 font-bold w-24">Terima</th>
                                  <th className="text-center px-3 py-2 font-bold w-16">Selisih</th>
                                  <th className="text-center px-3 py-2 font-bold w-20">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {(isEditing && editFormData ? editFormData.items : rec.items).map((item, i) => {
                                  const selisih = item.qty_scan - item.qty_sj;
                                  return (
                                    <tr
                                      key={`${item.sku}-${i}`}
                                      className={
                                        item.status_item === 'COCOK'  ? 'bg-emerald-50/30 dark:bg-emerald-950/10' :
                                        item.status_item === 'KURANG' ? 'bg-rose-50/30 dark:bg-rose-950/10' :
                                        item.status_item === 'LEBIH'  ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                                      }
                                    >
                                      <td className="px-3 py-2 font-mono text-[10px] text-slate-700 dark:text-slate-300 font-bold">
                                        {item.sku}
                                        {item.is_unexpected && (
                                          <span className="block text-[8px] text-amber-600 font-sans font-bold">LEBIHAN DI LUAR SJ</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                                        {item.nama_produk}
                                      </td>
                                      <td className="px-3 py-2 text-center font-bold text-slate-700 dark:text-slate-300">
                                        {item.qty_sj}
                                      </td>
                                      <td className="px-3 py-2 text-center font-bold">
                                        {isEditing && editFormData ? (
                                          <input
                                            type="number"
                                            value={item.qty_scan}
                                            onChange={e => {
                                              const newQty = parseInt(e.target.value, 10) || 0;
                                              const newItems = [...editFormData.items];
                                              newItems[i] = {
                                                ...newItems[i],
                                                qty_scan: newQty,
                                                selisih: newQty - newItems[i].qty_sj,
                                                status_item: (newQty - newItems[i].qty_sj) === 0 ? 'COCOK' : (newQty - newItems[i].qty_sj) < 0 ? 'KURANG' : 'LEBIH',
                                              };
                                              setEditFormData({ ...editFormData, items: newItems });
                                            }}
                                            className="w-14 text-center font-bold px-1 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs"
                                            min={0}
                                          />
                                        ) : (
                                          item.qty_scan
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <span className={`font-extrabold ${
                                          selisih === 0 ? 'text-emerald-500' :
                                          selisih < 0  ? 'text-rose-500' : 'text-amber-500'
                                        }`}>
                                          {selisih > 0 ? `+${selisih}` : selisih}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <StatusBadge status={item.status_item} />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
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
      </div>
    </div>
  );
};

// Export alias PengecekanSuratJalanView untuk kompatibilitas
export const PengecekanSuratJalanView = TarikanMDView;
export default TarikanMDView;
