import React, { useMemo, useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Search,
  Printer,
  Trash2,
  ScanBarcode,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Link2,
  CheckSquare,
  Square,
  Layers,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { ProductItem, StockRealtimeItem, UserSession } from '../../types';
import { isSuperadmin } from '../../services/permissions';
import {
  analyzeStockTakeRecommendations,
  StockTakeLocationRecommendation,
} from '../../utils/stockTakeRecommendationUtils';

interface StockTakeRecommendationModalProps {
  isOpen: boolean;
  onClose: () => void;
  productCatalog: ProductItem[];
  stockRows: StockRealtimeItem[];
  session?: UserSession | null;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onOpenScanner?: () => void;
}

type FilterTab =
  | 'CRITICAL_WITH_RELATED'
  | 'ALL'
  | 'NEGATIVE'
  | 'ANOMALY'
  | 'RELATED'
  | 'DEALPOS';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const StockTakeRecommendationModal: React.FC<StockTakeRecommendationModalProps> = ({
  isOpen,
  onClose,
  productCatalog,
  stockRows,
  session,
  onNotify,
  onOpenScanner,
}) => {
  const userIsSuperadmin = isSuperadmin(session ?? null);

  const [filterTab, setFilterTab] = useState<FilterTab>('CRITICAL_WITH_RELATED');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocs, setSelectedLocs] = useState<Set<string>>(new Set());
  const [expandedLocs, setExpandedLocs] = useState<Set<string>>(new Set());
  const [copiedWa, setCopiedWa] = useState(false);

  const summary = useMemo(() => {
    if (!isOpen) {
      return {
        recommendations: [],
        totalLocations: 0,
        criticalLocations: 0,
        highLocations: 0,
        relatedLocations: 0,
        mediumLocations: 0,
        negativeStockLocations: 0,
        invalidLocationCount: 0,
        skuAnomalyLocations: 0,
        dealposMismatchLocations: 0,
      };
    }
    return analyzeStockTakeRecommendations(productCatalog, stockRows);
  }, [isOpen, productCatalog, stockRows]);

  // Set default tab smartly when opened
  useEffect(() => {
    if (!isOpen) return;
    setSelectedLocs(new Set());
    setExpandedLocs(new Set());
    if (summary.criticalLocations + summary.highLocations > 0) {
      setFilterTab('CRITICAL_WITH_RELATED');
    } else {
      setFilterTab('ALL');
    }
  }, [isOpen, summary.criticalLocations, summary.highLocations]);

  // Map for quick lookup of critical/high trigger locations
  const criticalOrHighSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of summary.recommendations) {
      if (
        r.reasonTypes.includes('NEGATIVE_STOCK') ||
        r.reasonTypes.includes('INVALID_LOCATION') ||
        r.reasonTypes.includes('SKU_ANOMALY') ||
        r.reasonTypes.includes('AREA_MISMATCH')
      ) {
        s.add(r.lokasi.toUpperCase());
      }
    }
    return s;
  }, [summary.recommendations]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return summary.recommendations.filter((rec) => {
      if (filterTab === 'CRITICAL_WITH_RELATED') {
        const isCritOrHigh = criticalOrHighSet.has(rec.lokasi.toUpperCase());
        const isRelatedToCrit = rec.relatedFromLocations.some((src) =>
          criticalOrHighSet.has(src.toUpperCase())
        );
        if (!isCritOrHigh && !isRelatedToCrit) return false;
      } else if (filterTab === 'NEGATIVE') {
        if (!rec.reasonTypes.includes('NEGATIVE_STOCK')) return false;
      } else if (filterTab === 'ANOMALY') {
        if (
          !rec.reasonTypes.includes('INVALID_LOCATION') &&
          !rec.reasonTypes.includes('SKU_ANOMALY') &&
          !rec.reasonTypes.includes('AREA_MISMATCH')
        ) {
          return false;
        }
      } else if (filterTab === 'RELATED') {
        if (!rec.isRelatedLocation) return false;
      } else if (filterTab === 'DEALPOS') {
        if (!rec.reasonTypes.includes('DEALPOS_MISMATCH')) return false;
      }

      if (!q) return true;
      if (rec.lokasi.toLowerCase().includes(q)) return true;
      if (rec.area.toLowerCase().includes(q)) return true;
      if (rec.affectedSkus.some((s) => s.toLowerCase().includes(q))) return true;
      if (rec.reasons.some((r) => r.toLowerCase().includes(q))) return true;
      if (rec.itemsInLocation.some((it) => it.nama_produk.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [summary.recommendations, filterTab, searchQuery, criticalOrHighSet]);

  if (!isOpen) return null;

  const toggleSelectLoc = (lok: string, includeRelated = false) => {
    const key = lok.toUpperCase();
    setSelectedLocs((prev) => {
      const next = new Set(prev);
      const willSelect = !next.has(key);
      if (willSelect) {
        next.add(key);
      } else {
        next.delete(key);
      }

      if (includeRelated && willSelect) {
        const rec = summary.recommendations.find((r) => r.lokasi.toUpperCase() === key);
        if (rec) {
          rec.linkedRelatedLocations.forEach((rel) => next.add(rel.toUpperCase()));
          rec.relatedFromLocations.forEach((src) => next.add(src.toUpperCase()));
        }
      }
      return next;
    });
  };

  const handleSelectWithRelated = (rec: StockTakeLocationRecommendation) => {
    setSelectedLocs((prev) => {
      const next = new Set(prev);
      next.add(rec.lokasi.toUpperCase());
      rec.linkedRelatedLocations.forEach((rel) => next.add(rel.toUpperCase()));
      rec.relatedFromLocations.forEach((src) => next.add(src.toUpperCase()));
      return next;
    });
  };

  const handleSelectAllFiltered = (withRelated: boolean) => {
    setSelectedLocs((prev) => {
      const next = new Set(prev);
      const allAlreadySelected =
        filteredList.length > 0 && filteredList.every((r) => next.has(r.lokasi.toUpperCase()));

      if (allAlreadySelected && !withRelated) {
        filteredList.forEach((r) => next.delete(r.lokasi.toUpperCase()));
        return next;
      }

      filteredList.forEach((r) => {
        next.add(r.lokasi.toUpperCase());
        if (withRelated) {
          r.linkedRelatedLocations.forEach((rel) => next.add(rel.toUpperCase()));
          r.relatedFromLocations.forEach((src) => next.add(src.toUpperCase()));
        }
      });
      return next;
    });
  };

  const toggleExpand = (lok: string) => {
    const key = lok.toUpperCase();
    setExpandedLocs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedRecommendations = summary.recommendations.filter((r) =>
    selectedLocs.has(r.lokasi.toUpperCase())
  );
  const selectedLocationNames = Array.from(selectedLocs);

  const handleOpenResetPurge = () => {
    if (selectedLocationNames.length === 0) {
      onNotify?.('Pilih minimal 1 lokasi terlebih dahulu.', 'warning');
      return;
    }
    if (!userIsSuperadmin) {
      onNotify?.('Fitur Reset Scan Data / Kosongkan Rak hanya dapat diakses oleh Superadmin.', 'warning');
      return;
    }
    onClose();
    window.dispatchEvent(
      new CustomEvent('wms_open_location_purge', {
        detail: { locations: selectedLocationNames },
      })
    );
  };

  const handleCopyWaList = async () => {
    const targets = selectedRecommendations.length > 0 ? selectedRecommendations : filteredList;
    if (targets.length === 0) {
      onNotify?.('Tidak ada lokasi untuk disalin.', 'warning');
      return;
    }
    const lines: string[] = [
      `*REKOMENDASI STOCK TAKE ULANG (SO)*`,
      `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      `Total Lokasi: ${targets.length} titik`,
      `────────────────────────`,
    ];
    targets.slice(0, 60).forEach((rec, idx) => {
      const tag = rec.isDirectTrigger ? '[TEMUAN]' : '[TERKAIT]';
      lines.push(`${idx + 1}. *${rec.lokasi}* (${rec.area}) ${tag}`);
      if (rec.reasons[0]) {
        lines.push(`   ↳ ${rec.reasons[0]}`);
      }
      if (rec.linkedRelatedLocations.length > 0) {
        lines.push(`   ↳ Terkait rak: ${rec.linkedRelatedLocations.join(', ')}`);
      }
    });
    if (targets.length > 60) {
      lines.push(`...dan ${targets.length - 60} lokasi lainnya.`);
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2000);
      onNotify?.(`Daftar ${targets.length} lokasi Stock Take berhasil disalin.`, 'success');
    } catch {
      onNotify?.('Gagal menyalin ke clipboard.', 'error');
    }
  };

  const handlePrintAuditSheet = () => {
    const targets = selectedRecommendations.length > 0 ? selectedRecommendations : filteredList;
    if (targets.length === 0) {
      onNotify?.('Tidak ada lokasi untuk dicetak.', 'warning');
      return;
    }

    const win = window.open('', '_blank', 'width=960,height=800');
    if (!win) {
      onNotify?.('Pop-up diblokir oleh browser. Izinkan pop-up untuk mencetak lembar audit.', 'warning');
      return;
    }

    const nowStr = new Date().toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const blocksHtml = targets
      .map((rec, idx) => {
        const rowsHtml =
          rec.itemsInLocation.length > 0
            ? rec.itemsInLocation
                .map(
                  (it, iIdx) => `
                  <tr>
                    <td style="text-align:center;">${iIdx + 1}</td>
                    <td style="font-family:monospace;font-weight:700;">${escapeHtml(it.sku)}</td>
                    <td>${escapeHtml(it.nama_produk)} ${it.size ? `(${escapeHtml(it.size)})` : ''}</td>
                    <td style="text-align:center;font-family:monospace;font-weight:700;">${it.qty}</td>
                    <td style="text-align:center;border-bottom:1px solid #000;"></td>
                    <td style="text-align:center;border-bottom:1px solid #000;"></td>
                    <td style="font-size:9px;">${escapeHtml(it.issues.join('; ') || '-')}</td>
                  </tr>`
                )
                .join('')
            : `<tr><td colspan="7" style="text-align:center;font-style:italic;color:#555;">Tidak ada stok tercatat di database (cek fisik & scan jika ada barang)</td></tr>`;

        const badgeText = rec.isDirectTrigger ? 'TEMUAN ANOMALI / MINUS' : 'LOKASI TERKAIT';

        return `
          <div class="loc-block">
            <div class="loc-header">
              <div>
                <span class="loc-num">#${idx + 1}</span>
                <span class="loc-code">${escapeHtml(rec.lokasi)}</span>
                <span class="loc-area">[${escapeHtml(rec.area)}]</span>
              </div>
              <span class="loc-badge">${badgeText}</span>
            </div>
            <div class="loc-reason">
              <strong>Alasan:</strong> ${escapeHtml(rec.reasons.join(' | '))}
              ${
                rec.linkedRelatedLocations.length > 0
                  ? `<br/><strong>Lokasi Terkait:</strong> ${escapeHtml(rec.linkedRelatedLocations.join(', '))}`
                  : ''
              }
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:28px;">No</th>
                  <th style="width:110px;">SKU</th>
                  <th>Nama Produk / Size</th>
                  <th style="width:55px;">Sistem</th>
                  <th style="width:55px;">Fisik</th>
                  <th style="width:55px;">Selisih</th>
                  <th style="width:140px;">Catatan Temuan</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        `;
      })
      .join('');

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Lembar Stock Take Ulang — ${targets.length} Lokasi</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11px; margin: 0; }
          .doc-header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
          .doc-title { font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
          .doc-meta { font-size: 10px; text-align: right; }
          .loc-block { border: 1.5px solid #000; border-radius: 4px; padding: 8px; margin-bottom: 10px; page-break-inside: avoid; }
          .loc-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 5px; }
          .loc-num { font-weight: 700; margin-right: 6px; }
          .loc-code { font-family: monospace; font-size: 14px; font-weight: 900; }
          .loc-area { font-size: 10px; font-weight: 700; margin-left: 6px; }
          .loc-badge { border: 1px solid #000; padding: 2px 6px; font-size: 9px; font-weight: 800; }
          .loc-reason { font-size: 10px; margin-bottom: 6px; line-height: 1.35; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #444; padding: 4px 5px; text-align: left; }
          th { background: #eee; font-weight: 700; text-transform: uppercase; font-size: 9px; }
          .sign-row { margin-top: 18px; display: flex; justify-content: space-between; page-break-inside: avoid; }
          .sign-box { width: 30%; text-align: center; font-size: 10px; }
          .sign-line { border-top: 1px solid #000; margin-top: 38px; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="doc-header">
          <div>
            <div class="doc-title">Lembar Tugas Stock Take Ulang (SO)</div>
            <div style="font-size:10px;margin-top:2px;">Audit Lokasi Anomali, Stok Minus &amp; Lokasi Terkait</div>
          </div>
          <div class="doc-meta">
            <div>Dicetak: ${escapeHtml(nowStr)}</div>
            <div>Total Lokasi: <strong>${targets.length} titik</strong></div>
          </div>
        </div>
        ${blocksHtml}
        <div class="sign-row">
          <div class="sign-box">Petugas Scan / Picker<div class="sign-line">( ________________ )</div></div>
          <div class="sign-box">Leader Gudang<div class="sign-line">( ________________ )</div></div>
          <div class="sign-box">Admin / Approval SO<div class="sign-line">( ________________ )</div></div>
        </div>
        <script>window.onload = function(){ window.print(); };</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const getPriorityBadge = (rec: StockTakeLocationRecommendation) => {
    if (rec.priority === 'critical') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          KRITIS
        </span>
      );
    }
    if (rec.priority === 'high') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          ANOMALI
        </span>
      );
    }
    if (rec.priority === 'related') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          TERKAIT
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        SELISIH DP
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4">
      <div className="w-full max-w-5xl max-h-[92dvh] bg-white dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 bg-slate-50/70 dark:bg-[#121824] shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">
                Rekomendasi Stock Take Ulang &amp; Reset Scan Data
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Deteksi otomatis lokasi minus, anomali, data tidak sesuai, beserta{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">lokasi lain yang berkaitan</strong>{' '}
                (SKU sama / salah ketik rak).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1420] grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
          <div className="p-2 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20">
            <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase">
              Lokasi Minus / Error
            </div>
            <div className="text-lg font-black font-mono text-rose-600 dark:text-rose-400">
              {(summary.negativeStockLocations + summary.invalidLocationCount).toLocaleString('id-ID')}
              <span className="text-[10px] font-normal text-slate-500 ml-1">lokasi</span>
            </div>
          </div>
          <div className="p-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
            <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase">
              Anomali SKU / Area
            </div>
            <div className="text-lg font-black font-mono text-amber-600 dark:text-amber-400">
              {summary.skuAnomalyLocations.toLocaleString('id-ID')}
              <span className="text-[10px] font-normal text-slate-500 ml-1">lokasi</span>
            </div>
          </div>
          <div className="p-2 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20">
            <div className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase">
              Lokasi Terkait (Ripple)
            </div>
            <div className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
              {summary.recommendations.filter((r) => r.isRelatedLocation).length.toLocaleString('id-ID')}
              <span className="text-[10px] font-normal text-slate-500 ml-1">lokasi</span>
            </div>
          </div>
          <div className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
            <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
              Selisih DealPOS vs Fisik
            </div>
            <div className="text-lg font-black font-mono text-slate-800 dark:text-slate-200">
              {summary.dealposMismatchLocations.toLocaleString('id-ID')}
              <span className="text-[10px] font-normal text-slate-500 ml-1">lokasi</span>
            </div>
          </div>
        </div>

        {/* Filter Tabs & Search */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0 bg-slate-50/40 dark:bg-[#101622]">
          <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-0.5">
            {(
              [
                {
                  id: 'CRITICAL_WITH_RELATED',
                  label: `Prioritas Kritis + Terkait`,
                },
                { id: 'ALL', label: `Semua (${summary.totalLocations})` },
                { id: 'NEGATIVE', label: `Stok Minus (${summary.negativeStockLocations})` },
                {
                  id: 'ANOMALY',
                  label: `Lokasi/SKU Anomali (${summary.invalidLocationCount + summary.skuAnomalyLocations})`,
                },
                {
                  id: 'RELATED',
                  label: `Lokasi Terkait (${summary.recommendations.filter((r) => r.isRelatedLocation).length})`,
                },
                { id: 'DEALPOS', label: `Selisih DealPOS (${summary.dealposMismatchLocations})` },
              ] as Array<{ id: FilterTab; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  filterTab === t.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari lokasi rak, SKU, nama produk, atau alasan temuan..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleSelectAllFiltered(false)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Pilih Tampil ({filteredList.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectAllFiltered(true)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer flex items-center gap-1"
                title="Pilih seluruh lokasi tampil beserta semua lokasi terkait (SKU sama / typo rak)"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Pilih + Lokasi Terkait</span>
              </button>
              {selectedLocs.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedLocs(new Set())}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Reset Pilihan
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Recommendation List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mx-auto">
                <Layers className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Tidak ada temuan pada filter ini
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Semua lokasi pada kategori ini terpantau bersih dan sinkron.
              </p>
            </div>
          ) : (
            filteredList.slice(0, 150).map((rec) => {
              const key = rec.lokasi.toUpperCase();
              const isSelected = selectedLocs.has(key);
              const isExpanded = expandedLocs.has(key);

              return (
                <div
                  key={key}
                  className={`rounded-xl border transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131b2a]'
                  }`}
                >
                  <div className="p-3 flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleSelectLoc(rec.lokasi)}
                      className="mt-0.5 text-slate-400 hover:text-indigo-600 cursor-pointer shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm font-black text-slate-900 dark:text-slate-100">
                          {rec.lokasi}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {rec.area}
                        </span>
                        {getPriorityBadge(rec)}
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {rec.itemsInLocation.length} SKU · {rec.totalPcs.toLocaleString('id-ID')} pcs
                        </span>
                      </div>

                      {/* Reasons */}
                      <ul className="mt-1.5 space-y-0.5">
                        {rec.reasons.slice(0, 3).map((reason, rIdx) => (
                          <li
                            key={rIdx}
                            className="text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-1.5"
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                            <span>{reason}</span>
                          </li>
                        ))}
                        {rec.reasons.length > 3 && (
                          <li className="text-[10px] text-slate-400 pl-4">
                            +{rec.reasons.length - 3} temuan lainnya
                          </li>
                        )}
                      </ul>

                      {/* Linked Related Locations Chips */}
                      {(rec.linkedRelatedLocations.length > 0 || rec.relatedFromLocations.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {rec.linkedRelatedLocations.length > 0 && (
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                              <Link2 className="w-3 h-3" />
                              Terkait ({rec.linkedRelatedLocations.length}):
                            </span>
                          )}
                          {rec.linkedRelatedLocations.slice(0, 8).map((rel) => (
                            <button
                              key={rel}
                              type="button"
                              onClick={() => toggleSelectLoc(rel)}
                              className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border cursor-pointer transition-colors ${
                                selectedLocs.has(rel.toUpperCase())
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                              }`}
                            >
                              {rel}
                            </button>
                          ))}
                          {rec.linkedRelatedLocations.length > 8 && (
                            <span className="text-[10px] text-slate-400">
                              +{rec.linkedRelatedLocations.length - 8} lagi
                            </span>
                          )}
                          {(rec.linkedRelatedLocations.length > 0 || rec.relatedFromLocations.length > 0) && (
                            <button
                              type="button"
                              onClick={() => handleSelectWithRelated(rec)}
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 cursor-pointer"
                            >
                              + Pilih Paket Terkait
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpand(rec.lokasi)}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <span className="hidden sm:inline">Detail SKU</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Expanded SKU Detail Table */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-200/80 dark:border-slate-800/80 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                            <th className="py-1.5 pr-2 font-bold">SKU</th>
                            <th className="py-1.5 pr-2 font-bold">Produk</th>
                            <th className="py-1.5 px-2 text-center font-bold">Fisik Rak</th>
                            <th className="py-1.5 px-2 text-center font-bold">DealPOS</th>
                            <th className="py-1.5 pl-2 font-bold">Status / Temuan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rec.itemsInLocation.map((it, idx) => (
                            <tr
                              key={`${it.sku}-${idx}`}
                              className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0"
                            >
                              <td className="py-1.5 pr-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                                {it.sku}
                              </td>
                              <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-300">
                                {it.nama_produk} {it.size ? `(${it.size})` : ''}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-center font-mono font-bold ${
                                  it.qty < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {it.qty}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono text-blue-600 dark:text-blue-400">
                                {it.dealposQty ?? '-'}
                              </td>
                              <td className="py-1.5 pl-2 text-slate-600 dark:text-slate-400">
                                {it.issues.length > 0 ? (
                                  <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                    {it.issues.join(', ')}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Normal</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {filteredList.length > 150 && (
            <div className="text-center text-[11px] text-slate-400 py-2">
              Menampilkan 150 dari {filteredList.length} lokasi. Gunakan pencarian untuk menyaring lebih spesifik.
            </div>
          )}
        </div>

        {/* Sticky Footer Action Bar */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#121824] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              {selectedLocs.size > 0
                ? `${selectedLocs.size} lokasi dipilih untuk tindakan`
                : `Menampilkan ${filteredList.length} lokasi rekomendasi`}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={handleCopyWaList}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1.5"
            >
              {copiedWa ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedWa ? 'Tersalin' : 'Salin Daftar'}</span>
            </button>

            {onOpenScanner && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenScanner();
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-1.5"
              >
                <ScanBarcode className="w-3.5 h-3.5" />
                <span>Buka Scanner SO</span>
              </button>
            )}

            {userIsSuperadmin && (
              <button
                type="button"
                disabled={selectedLocs.size === 0}
                onClick={handleOpenResetPurge}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Reset / Kosongkan data scan lokasi terpilih sebelum Stock Take Ulang (khusus Superadmin)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset Scan Data ({selectedLocs.size})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrintAuditSheet}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Lembar Stock Take ({selectedLocs.size > 0 ? selectedLocs.size : filteredList.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
