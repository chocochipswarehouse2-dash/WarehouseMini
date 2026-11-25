import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Search,
  CheckSquare,
  Square,
  CloudUpload,
  ListPlus,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { PenerimaanProduksiItem } from '../../types';
import { formatDatesSummary } from '../../services/gasProduksiSync';
import { getSizeWeight } from '../../utils/sortUtils';
import type { CodeAuditGroup } from './AuditHitungUlangTab';

export interface MultiBatchAuditScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingGroups: CodeAuditGroup[];
  recountAuditMap: Record<string, any>;
  queueMap: Record<string, any>;
  onOpenCodeWorkspace: (code: string) => void;
  onBulkAddToQueue: (groups: CodeAuditGroup[]) => void;
  onBulkAutoMergeAndSave: (
    groups: CodeAuditGroup[],
    onProgress: (current: number, total: number, activeCode: string) => void
  ) => Promise<{ successCount: number; failedCodes: string[] }>;
  onBulkResyncMasterSheet: (
    categories: Array<'Kargo' | 'CMT'>,
    onProgress: (msg: string) => void
  ) => Promise<void>;
}

interface VariantBreakdown {
  warna: string;
  size: string;
  qtyAsli: number;
  auditedFisik: number | null;
  unauditedQty: number;
  mergedTarget: number;
}

function buildVariantBreakdown(
  group: CodeAuditGroup,
  auditRec: any
): VariantBreakdown[] {
  const auditVarAsliMap = new Map<string, number>();
  if (Array.isArray(auditRec?.variants)) {
    auditRec.variants.forEach((av: any) => {
      const avKey = `${av.warna || '-'}_${av.size || '-'}`;
      if (av.qty_asli !== undefined && av.qty_asli !== null) {
        auditVarAsliMap.set(avKey, Number(av.qty_asli) || 0);
      }
    });
  }

  const map = new Map<
    string,
    { warna: string; size: string; qtyAsli: number; auditedFisik: number | null; unauditedQty: number }
  >();

  group.items.forEach((it: PenerimaanProduksiItem) => {
    const w = it.warna || '-';
    const s = it.size || '-';
    const key = `${w}_${s}`;
    const q = Number(it.qty) || 0;
    const hasRecount = it.recount_qty !== undefined && it.recount_qty !== null;

    if (!map.has(key)) {
      map.set(key, {
        warna: w,
        size: s,
        qtyAsli: 0,
        auditedFisik: hasRecount ? Number(it.recount_qty) : null,
        unauditedQty: 0,
      });
    }
    const entry = map.get(key)!;
    entry.qtyAsli += q;
    if (hasRecount) {
      entry.auditedFisik = Number(it.recount_qty);
    } else if (q > 0) {
      entry.unauditedQty += q;
    }
  });

  if (group.has_pending_batch) {
    map.forEach((entry, key) => {
      if (entry.unauditedQty === 0 && auditVarAsliMap.has(key)) {
        const prevAsli = auditVarAsliMap.get(key)!;
        if (entry.qtyAsli > prevAsli) {
          entry.unauditedQty = entry.qtyAsli - prevAsli;
        }
      }
    });
  }

  return Array.from(map.values())
    .map((v) => ({
      ...v,
      mergedTarget:
        v.unauditedQty > 0
          ? (v.auditedFisik !== null ? v.auditedFisik : 0) + v.unauditedQty
          : v.auditedFisik !== null
          ? v.auditedFisik
          : v.qtyAsli,
    }))
    .sort((a, b) => {
      const c = a.warna.localeCompare(b.warna);
      if (c !== 0) return c;
      const wa = getSizeWeight(a.size);
      const wb = getSizeWeight(b.size);
      if (wa !== wb) return wa - wb;
      return a.size.localeCompare(b.size);
    });
}

export const MultiBatchAuditScannerModal: React.FC<MultiBatchAuditScannerModalProps> = ({
  isOpen,
  onClose,
  pendingGroups,
  recountAuditMap,
  queueMap,
  onOpenCodeWorkspace,
  onBulkAddToQueue,
  onBulkAutoMergeAndSave,
  onBulkResyncMasterSheet,
}) => {
  const [search, setSearch] = useState('');
  const [kategoriFilter, setKategoriFilter] = useState<'Semua' | 'Kargo' | 'Lokal CMT'>('Semua');
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');

  // Auto-select all pending groups whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedCodes(new Set(pendingGroups.map((g) => g.kode_produksi)));
      setExpandedCode(null);
      setProgressText('');
    }
  }, [isOpen, pendingGroups]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pendingGroups.filter((g) => {
      if (kategoriFilter !== 'Semua' && g.kategori !== kategoriFilter) return false;
      if (!q) return true;
      return (
        g.kode_produksi.toLowerCase().includes(q) ||
        (g.nama_produk || '').toLowerCase().includes(q) ||
        (g.vendor_up || '').toLowerCase().includes(q)
      );
    });
  }, [pendingGroups, search, kategoriFilter]);

  const selectedGroups = useMemo(
    () => pendingGroups.filter((g) => selectedCodes.has(g.kode_produksi)),
    [pendingGroups, selectedCodes]
  );

  const summary = useMemo(() => {
    let kargo = 0;
    let cmt = 0;
    let totalPendingQty = 0;
    pendingGroups.forEach((g) => {
      if (g.kategori === 'Kargo') kargo++;
      else cmt++;
      totalPendingQty += g.pending_batch_qty || 0;
    });
    return { kargo, cmt, totalPendingQty };
  }, [pendingGroups]);

  if (!isOpen) return null;

  const allFilteredSelected =
    filteredGroups.length > 0 && filteredGroups.every((g) => selectedCodes.has(g.kode_produksi));

  const toggleAllFiltered = () => {
    const next = new Set(selectedCodes);
    if (allFilteredSelected) {
      filteredGroups.forEach((g) => next.delete(g.kode_produksi));
    } else {
      filteredGroups.forEach((g) => next.add(g.kode_produksi));
    }
    setSelectedCodes(next);
  };

  const toggleOne = (code: string) => {
    const next = new Set(selectedCodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedCodes(next);
  };

  const handleRunBulkAutoMerge = async () => {
    if (selectedGroups.length === 0 || isProcessing) return;
    const totalAddPcs = selectedGroups.reduce((s, g) => s + (g.pending_batch_qty || 0), 0);
    const ok = window.confirm(
      `Auto-Gabungkan Batch Susulan untuk ${selectedGroups.length} kode (+${totalAddPcs} pcs)?\n\n` +
        `Sistem akan menjumlahkan hasil audit sebelumnya + qty batch baru untuk setiap varian, menyimpannya sebagai Revisi baru di Supabase, dan langsung memperbarui Google Sheet.\n\n` +
        `Pastikan barang batch susulan pada kode-kode terpilih memang sudah sesuai surat jalan (atau Anda bisa pilih "Audit Manual" untuk kode yang ada selisih).`
    );
    if (!ok) return;

    try {
      setIsProcessing(true);
      setProgressText(`Menyiapkan perbaikan ${selectedGroups.length} kode...`);
      await onBulkAutoMergeAndSave(selectedGroups, (cur, tot, activeCode) => {
        setProgressText(`Memperbaiki ${cur}/${tot}: ${activeCode}...`);
      });
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const handleRunBulkResyncSheet = async () => {
    if (isProcessing) return;
    const targetList = selectedGroups.length > 0 ? selectedGroups : pendingGroups;
    const cats = new Set<'Kargo' | 'CMT'>();
    targetList.forEach((g) => cats.add(g.kategori === 'Kargo' ? 'Kargo' : 'CMT'));
    const catArray = Array.from(cats);
    if (catArray.length === 0) return;

    const ok = window.confirm(
      `Re-Sync Master Google Sheet (${catArray.join(' & ')}) sekarang?\n\n` +
        `Ini akan memperbarui seluruh formula & status audit di Google Sheet agar kode dengan batch susulan tidak lagi memunculkan false-alarm merah (KURANG / selisih nota palsu), melainkan status amber "Parsial" / "BELUM LENGKAP".`
    );
    if (!ok) return;

    try {
      setIsProcessing(true);
      await onBulkResyncMasterSheet(catArray, (msg) => setProgressText(msg));
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => {
        if (!isProcessing) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-4xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Cek &amp; Perbaiki Batch Susulan (Multi-Batch Audit)
              </h3>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Memindai seluruh kode yang sudah pernah diaudit namun menerima kedatangan susulan baru.
            </p>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary Strip + Filters */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white dark:bg-slate-900">
          <div className="grid grid-cols-3 gap-2">
            <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                Kode Terdampak
              </span>
              <span className="text-base sm:text-lg font-extrabold text-amber-900 dark:text-amber-200 font-mono tabular-nums">
                {pendingGroups.length}
              </span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Total Qty Susulan
              </span>
              <span className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
                +{summary.totalPendingQty} pcs
              </span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Kargo / CMT
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                {summary.kargo} / {summary.cmt}
              </span>
            </div>
          </div>

          {pendingGroups.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari kode produksi, nama produk, UP..."
                  className="w-full min-h-[38px] pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {(['Semua', 'Kargo', 'Lokal CMT'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setKategoriFilter(cat)}
                    className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      kategoriFilter === cat
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {cat === 'Lokal CMT' ? 'CMT' : cat}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={toggleAllFiltered}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                >
                  {allFilteredSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{allFilteredSelected ? 'Batal Semua' : 'Pilih Semua'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {pendingGroups.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Semua Kode Aman — Tidak Ada Batch Susulan Tertinggal
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Seluruh kode yang sudah pernah diaudit saat ini sudah sinkron dengan seluruh tanggal kedatangan terbarunya.
              </p>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Tidak ada kode yang cocok dengan filter pencarian.
            </div>
          ) : (
            filteredGroups.map((g) => {
              const isSelected = selectedCodes.has(g.kode_produksi);
              const isExpanded = expandedCode === g.kode_produksi;
              const isInQueue = Boolean(queueMap[g.kode_produksi]);
              const variants = isExpanded
                ? buildVariantBreakdown(g, recountAuditMap[g.kode_produksi])
                : [];

              return (
                <div
                  key={g.kode_produksi}
                  className={`rounded-2xl border transition ${
                    isSelected
                      ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/20 dark:bg-indigo-950/15'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => toggleOne(g.kode_produksi)}
                        className="mt-0.5 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">
                            {g.kode_produksi}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {g.kategori}
                          </span>
                          {g.vendor_up && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              UP {g.vendor_up}
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-mono">
                            Susulan +{g.pending_batch_qty || 0} pcs
                          </span>
                          {isInQueue && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">
                              Di Antrean
                            </span>
                          )}
                        </div>

                        {g.nama_produk && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                            {g.nama_produk}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>
                            Audit Rev {g.last_round || 1}:{' '}
                            <strong className="font-mono text-slate-700 dark:text-slate-200">
                              {g.total_fisik ?? 0} pcs
                            </strong>
                            {g.audited_dates && g.audited_dates.length > 0
                              ? ` (${formatDatesSummary(g.audited_dates)})`
                              : ''}
                          </span>
                          <span>
                            Batch Baru:{' '}
                            <strong className="font-mono text-amber-700 dark:text-amber-300">
                              +{g.pending_batch_qty || 0} pcs
                            </strong>
                            {g.pending_batch_dates && g.pending_batch_dates.length > 0
                              ? ` (${formatDatesSummary(g.pending_batch_dates)})`
                              : ''}
                          </span>
                          <span>
                            Total Kini:{' '}
                            <strong className="font-mono text-slate-900 dark:text-white">
                              {g.total_asli} pcs
                            </strong>
                            {g.qty_nota !== null && g.qty_nota !== undefined
                              ? ` · Nota: ${g.qty_nota}`
                              : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pl-7 sm:pl-0">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCode(isExpanded ? null : g.kode_produksi)
                        }
                        className="min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                      >
                        <span>Rincian</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => {
                          onClose();
                          onOpenCodeWorkspace(g.kode_produksi);
                        }}
                        className="min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 flex items-center gap-1 cursor-pointer"
                      >
                        <span>Audit Manual</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Variant Breakdown */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 mt-2">
                        <table className="w-full text-[11px] text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">
                              <th className="py-1.5 px-2.5">Warna</th>
                              <th className="py-1.5 px-2 text-center">Size</th>
                              <th className="py-1.5 px-2 text-center">Audit Lama</th>
                              <th className="py-1.5 px-2 text-center">Batch Baru</th>
                              <th className="py-1.5 px-2 text-center">Total Awal</th>
                              <th className="py-1.5 px-2.5 text-center">Hasil Gabung</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                            {variants.map((v) => (
                              <tr key={`${v.warna}_${v.size}`} className="bg-white dark:bg-slate-900">
                                <td className="py-1.5 px-2.5 font-sans font-semibold text-slate-800 dark:text-slate-200">
                                  {v.warna}
                                </td>
                                <td className="py-1.5 px-2 text-center font-bold">{v.size}</td>
                                <td className="py-1.5 px-2 text-center text-slate-600 dark:text-slate-400">
                                  {v.auditedFisik !== null ? v.auditedFisik : '—'}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  {v.unauditedQty > 0 ? (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold">
                                      +{v.unauditedQty}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">0</span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-center font-bold text-slate-800 dark:text-slate-200">
                                  {v.qtyAsli}
                                </td>
                                <td className="py-1.5 px-2.5 text-center font-bold text-indigo-700 dark:text-indigo-300">
                                  {v.mergedTarget}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        {pendingGroups.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 space-y-2">
            {isProcessing && progressText && (
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">{progressText}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  disabled={isProcessing || selectedGroups.length === 0}
                  onClick={() => {
                    onBulkAddToQueue(selectedGroups);
                  }}
                  className="flex-1 sm:flex-initial min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 disabled:opacity-45 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  <span>Masuk Antrean ({selectedGroups.length})</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleRunBulkResyncSheet}
                  className="flex-1 sm:flex-initial min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 disabled:opacity-45 flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Perbarui formula Google Sheet agar selisih palsu berubah menjadi status Parsial / Belum Lengkap"
                >
                  <CloudUpload className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Bersihkan False-Alarm Sheet</span>
                </button>
              </div>

              <button
                type="button"
                disabled={isProcessing || selectedGroups.length === 0}
                onClick={handleRunBulkAutoMerge}
                className="min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                {isProcessing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Auto-Gabung &amp; Simpan ({selectedGroups.length})</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
