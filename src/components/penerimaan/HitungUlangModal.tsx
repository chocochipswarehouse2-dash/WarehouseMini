import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Printer,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Layers,
  Save,
  User,
  Calendar,
  Package,
  ArrowRight,
  ClipboardList,
  History,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';
import { PenerimaanProduksiItem } from '../../types';
import {
  pushSuratJalanToGoogleSheet,
  SuratJalanPushPayload,
  pushMasterRecountDeltaToGoogleSheet,
  MasterRecountDeltaItem,
  formatDatesSummary,
} from '../../services/gasProduksiSync';
import {
  updatePenerimaanProduksiItemsInSupabase,
  savePenerimaanRecountLog,
  fetchPenerimaanRecountLogs,
  deletePenerimaanRecountLog,
} from '../../services/supabase';
import { PenerimaanRecountLogItem } from '../../types';
import {
  exportHitungUlangToExcel,
  HitungUlangRowItem,
  HitungUlangExportPayload,
} from '../../utils/excelHitungUlangExporter';

interface HitungUlangModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataList: PenerimaanProduksiItem[];
  initialKodeProduksi?: string;
  initialTanggal?: string;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onApplyReCountToData?: (updatedItems: PenerimaanProduksiItem[]) => void;
}

export const HitungUlangModal: React.FC<HitungUlangModalProps> = ({
  isOpen,
  onClose,
  dataList,
  initialKodeProduksi = '',
  initialTanggal = '',
  onShowToast,
  onApplyReCountToData,
}) => {
  // Available Codes
  const distinctCodes = useMemo(() => {
    const set = new Set<string>();
    dataList.forEach((it) => {
      const c = (it.kode_produksi || '').trim().toUpperCase();
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [dataList]);

  // Selected State (Mendukung Single Code atau Multi-Choice Kode Terpilih)
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedCodesMulti, setSelectedCodesMulti] = useState<string[]>([]);
  const [isMultiCodeMode, setIsMultiCodeMode] = useState<boolean>(false);
  const [multiSearchQuery, setMultiSearchQuery] = useState<string>('');
  const [selectedTanggal, setSelectedTanggal] = useState<string>('all');
  const [auditorName, setAuditorName] = useState<string>('');
  const [auditDate, setAuditDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [generalNotes, setGeneralNotes] = useState<string>('');

  // Editable rows state: row id -> { recountQty: number | null, note: string }
  const [recountValues, setRecountValues] = useState<Record<string, { recountQty: number | null; note: string }>>({});

  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [isRePushingSheet, setIsRePushingSheet] = useState<boolean>(false);

  // Tab: 'hitung' | 'history'
  const [activeModalTab, setActiveModalTab] = useState<'hitung' | 'history'>('hitung');
  const [recountHistoryList, setRecountHistoryList] = useState<PenerimaanRecountLogItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadRecountHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const logs = await fetchPenerimaanRecountLogs();
      setRecountHistoryList(logs);
    } catch (err) {
      console.warn('Gagal load recount history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRecountHistory();
    }
  }, [isOpen]);

  // Sync initial props on open
  useEffect(() => {
    if (isOpen) {
      const code = initialKodeProduksi || distinctCodes[0] || '';
      setSelectedCode(code);
      setSelectedCodesMulti(code ? [code] : []);
      setIsMultiCodeMode(false);
      setSelectedTanggal(initialTanggal || 'all');
      setRecountValues({});
    }
  }, [isOpen, initialKodeProduksi, initialTanggal, distinctCodes]);

  // Available arrival dates for selected code
  // Filtered distinct codes based on dropsearch query
  const searchedDistinctCodes = useMemo(() => {
    if (!multiSearchQuery.trim()) return distinctCodes;
    const q = multiSearchQuery.trim().toLowerCase();
    return distinctCodes.filter((c) => c.toLowerCase().includes(q));
  }, [distinctCodes, multiSearchQuery]);

  const availableDatesForCode = useMemo(() => {
    if (!selectedCode) return [];
    const dates = new Set<string>();
    dataList.forEach((it) => {
      if ((it.kode_produksi || '').trim().toUpperCase() === selectedCode) {
        if (it.tanggal_penerimaan) dates.add(it.tanggal_penerimaan);
      }
    });
    return Array.from(dates).sort();
  }, [dataList, selectedCode]);

  // Active selected codes list (Single vs Multi)
  const activeSelectedCodes = useMemo(() => {
    if (isMultiCodeMode) {
      return selectedCodesMulti.length > 0 ? selectedCodesMulti : (selectedCode ? [selectedCode] : []);
    }
    return selectedCode ? [selectedCode] : [];
  }, [isMultiCodeMode, selectedCodesMulti, selectedCode]);

  // Standard apparel size hierarchy (Kecil ke Besar, lalu All Size di akhir)
  const STANDARD_SIZE_ORDER = useMemo(() => [
    'XXS', '2XS', 'XS', 'S', 'M', 'L', 'XL', '1X', '2X', 'XXL', '2XL', '3X', 'XXXL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL',
    'ALL SIZE', 'ALLSIZE', 'ALL-SIZE', 'FREESIZE', 'FREE SIZE', 'FREE-SIZE', 'OS', 'ONESIZE', 'ONE SIZE', 'DEFAULT'
  ], []);

  const compareSizes = (a?: string, b?: string): number => {
    const cleanA = (a || '').trim().toUpperCase();
    const cleanB = (b || '').trim().toUpperCase();
    if (cleanA === cleanB) return 0;
    const idxA = STANDARD_SIZE_ORDER.indexOf(cleanA);
    const idxB = STANDARD_SIZE_ORDER.indexOf(cleanB);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    const numA = parseFloat(cleanA);
    const numB = parseFloat(cleanB);
    if (!isNaN(numA) && !isNaN(numB) && String(numA) === cleanA && String(numB) === cleanB) {
      return numA - numB;
    }
    return cleanA.localeCompare(cleanB);
  };

  // Filtered raw items for active selected codes and arrival date, sorted by Warna & Size
  const filteredRawItems = useMemo(() => {
    if (activeSelectedCodes.length === 0) return [];
    const raw = dataList.filter((it) => {
      const itCode = (it.kode_produksi || '').trim().toUpperCase();
      const matchCode = activeSelectedCodes.includes(itCode);
      if (!matchCode) return false;
      if (selectedTanggal !== 'all' && !isMultiCodeMode) {
        return it.tanggal_penerimaan === selectedTanggal;
      }
      return true;
    });

    // Urutkan terstruktur:
    // 1. Kode Produksi (A-Z)
    // 2. Warna (A-Z) -> Semua warna yang sama berurutan & berkumpul
    // 3. Size (S, M, L, XL, XXL, dst.)
    // 4. Tanggal Kedatangan
    // 5. No Surat Jalan
    return [...raw].sort((a, b) => {
      const codeA = (a.kode_produksi || '').trim().toUpperCase();
      const codeB = (b.kode_produksi || '').trim().toUpperCase();
      if (codeA !== codeB) return codeA.localeCompare(codeB);

      const colorA = (a.warna || '').trim().toUpperCase();
      const colorB = (b.warna || '').trim().toUpperCase();
      if (colorA !== colorB) return colorA.localeCompare(colorB);

      const sizeCmp = compareSizes(a.size, b.size);
      if (sizeCmp !== 0) return sizeCmp;

      const dateA = (a.tanggal_penerimaan || '').trim();
      const dateB = (b.tanggal_penerimaan || '').trim();
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const sjA = (a.no_surat_jalan || '').trim();
      const sjB = (b.no_surat_jalan || '').trim();
      return sjA.localeCompare(sjB);
    });
  }, [dataList, activeSelectedCodes, selectedTanggal, isMultiCodeMode, STANDARD_SIZE_ORDER]);

  // Product metadata
  const productInfo = useMemo(() => {
    if (filteredRawItems.length === 0) return null;
    const first = filteredRawItems[0];
    const photo = filteredRawItems.find((i) => i.foto_url && i.foto_url.trim().length > 0)?.foto_url;
    const displayCode = isMultiCodeMode 
      ? activeSelectedCodes.join(', ') 
      : selectedCode;
    return {
      code: displayCode,
      productName: isMultiCodeMode && activeSelectedCodes.length > 1 ? `Multi-Kode (${activeSelectedCodes.length} Kode Terpilih)` : (first.nama_produk || ''),
      kategori: first.kategori || 'Lokal CMT',
      upVendor: first.keterangan || '',
      photoUrl: photo,
    };
  }, [filteredRawItems, selectedCode, activeSelectedCodes, isMultiCodeMode]);

  // Grouped rows for audit
  const auditRows: HitungUlangRowItem[] = useMemo(() => {
    return filteredRawItems.map((it, idx) => {
      const rowKey = `${it.id || idx}-${it.kode_produksi}-${it.warna}-${it.size}-${it.tanggal_penerimaan}`;
      const stateVal = recountValues[rowKey];
      const recountQty = stateVal !== undefined ? stateVal.recountQty : null;
      const prevQty = Number(it.qty) || 0;
      const selisih = recountQty !== null ? recountQty - prevQty : 0;

      return {
        id: it.id || idx,
        kode_produksi: it.kode_produksi,
        nama_produk: it.nama_produk,
        warna: it.warna || 'DEFAULT',
        size: it.size || 'Default',
        tanggal_penerimaan: it.tanggal_penerimaan,
        no_surat_jalan: it.no_surat_jalan || '-',
        foto_url: it.foto_url,
        qty_sebelumnya: prevQty,
        qty_hitung_ulang: recountQty,
        selisih,
        catatan: stateVal ? stateVal.note : '',
      };
    });
  }, [filteredRawItems, recountValues]);

  // Grouped rows by kode_produksi for separator display
  const auditRowsGroupedByCode = useMemo(() => {
    const map = new Map<string, HitungUlangRowItem[]>();
    auditRows.forEach((row) => {
      const code = (row.kode_produksi || 'LAINNYA').toUpperCase();
      if (!map.has(code)) map.set(code, []);
      map.get(code)!.push(row);
    });
    return Array.from(map.entries()).map(([code, items]) => {
      let subPrev = 0;
      let subRecount = 0;
      let subCounted = 0;
      items.forEach((it) => {
        subPrev += it.qty_sebelumnya;
        if (it.qty_hitung_ulang !== null) {
          subRecount += it.qty_hitung_ulang;
          subCounted++;
        }
      });
      const firstWithPhoto = items.find((i) => i.foto_url && i.foto_url.trim().length > 0);
      return {
        code,
        items,
        nama_produk: items[0]?.nama_produk || '',
        photo_url: firstWithPhoto?.foto_url,
        totalPrev: subPrev,
        totalRecount: subRecount,
        totalCounted: subCounted,
        totalSelisih: subCounted > 0 ? subRecount - subPrev : 0,
      };
    });
  }, [auditRows]);

  // Summary statistics
  const summary = useMemo(() => {
    let totalPrev = 0;
    let totalRecount = 0;
    let totalCountedRows = 0;
    let matchCount = 0;
    let mismatchCount = 0;

    auditRows.forEach((r) => {
      totalPrev += r.qty_sebelumnya;
      if (r.qty_hitung_ulang !== null) {
        totalRecount += r.qty_hitung_ulang;
        totalCountedRows++;
        if (r.qty_hitung_ulang === r.qty_sebelumnya) matchCount++;
        else mismatchCount++;
      }
    });

    return {
      totalPrev,
      totalRecount,
      totalCountedRows,
      matchCount,
      mismatchCount,
      totalSelisih: totalCountedRows > 0 ? totalRecount - totalPrev : 0,
    };
  }, [auditRows]);

  // Handle typing recount qty
  const handleTypeRecount = (rowKey: string, rawStr: string) => {
    const cleanDigits = rawStr.replace(/\D/g, '');
    const numVal = cleanDigits === '' ? null : parseInt(cleanDigits, 10);

    setRecountValues((prev) => ({
      ...prev,
      [rowKey]: {
        recountQty: numVal,
        note: prev[rowKey]?.note || '',
      },
    }));
  };

  // Handle typing row note
  const handleTypeNote = (rowKey: string, noteStr: string) => {
    setRecountValues((prev) => ({
      ...prev,
      [rowKey]: {
        recountQty: prev[rowKey]?.recountQty ?? null,
        note: noteStr,
      },
    }));
  };

  // Reset/Clear recount values
  const handleResetRecount = () => {
    if (window.confirm('Kosongkan semua input hitung ulang?')) {
      setRecountValues({});
    }
  };

  // Pre-fill recount values with previous values
  const handleFillAllWithPrev = () => {
    const next: Record<string, { recountQty: number | null; note: string }> = {};
    filteredRawItems.forEach((it, idx) => {
      const rowKey = `${it.id || idx}-${it.kode_produksi}-${it.warna}-${it.size}-${it.tanggal_penerimaan}`;
      next[rowKey] = {
        recountQty: Number(it.qty) || 0,
        note: 'Sesuai kedatangan awal',
      };
    });
    setRecountValues(next);
    onShowToast('Semua baris diisi dengan nilai hitungan sebelumnya.', 'info');
  };

  const printContainerRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Direct Dedicated IFrame Print (Mencegah tumpah ke 21+ lembar halaman latar belakang & 100% Pas 1 Halaman A4)
  const handlePrintDedicated = () => {
    setIsPrinting(true);
    try {
      const iframeId = 'hitung-ulang-direct-print-frame';
      let printFrame = document.getElementById(iframeId) as HTMLIFrameElement | null;
      if (printFrame) {
        document.body.removeChild(printFrame);
      }

      printFrame = document.createElement('iframe');
      printFrame.id = iframeId;
      printFrame.style.position = 'fixed';
      printFrame.style.top = '-9999px';
      printFrame.style.left = '-9999px';
      printFrame.style.width = '100%';
      printFrame.style.height = '100%';
      printFrame.style.border = 'none';
      document.body.appendChild(printFrame);

      const printableContent = printContainerRef.current?.innerHTML || '';
      const doc = printFrame.contentDocument || printFrame.contentWindow?.document;

      if (doc) {
        const fullHtml = `
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="utf-8" />
            <title>Hitung Ulang Fisik - ${isMultiCodeMode ? activeSelectedCodes.join(', ') : selectedCode}</title>
            <style>
              * {
                box-sizing: border-box !important;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              html, body {
                background: #ffffff !important;
                color: #0f172a !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              @page {
                size: A4 portrait;
                margin: 8mm 6mm;
              }
              .print-hide {
                display: none !important;
              }
              .print-show {
                display: block !important;
              }
              table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-size: 10.5px !important;
              }
              th, td {
                border: 1px solid #94a3b8 !important;
                padding: 4px 6px !important;
                text-align: center !important;
              }
              th {
                background-color: #f1f5f9 !important;
                font-weight: 800 !important;
                color: #1e293b !important;
                text-transform: uppercase !important;
                font-size: 10px !important;
              }
              .td-left {
                text-align: left !important;
              }
              .badge-code {
                display: inline-block;
                padding: 2px 8px;
                border: 1.5px solid #e11d48;
                border-radius: 6px;
                color: #e11d48;
                font-weight: 900;
                font-family: monospace;
                font-size: 14px;
              }
              .sig-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 40px;
                margin-top: 18px;
                text-align: center;
                font-size: 11px;
                page-break-inside: avoid;
              }
              .sig-box {
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                height: 75px;
              }
              .sig-line {
                border-top: 1px solid #1e293b;
                padding-top: 3px;
                font-weight: 700;
              }
            </style>
          </head>
          <body>
            ${printableContent}
          </body>
          </html>
        `;

        doc.open();
        doc.write(fullHtml);
        doc.close();

        // Allow styles/images to parse before triggering print
        setTimeout(() => {
          printFrame?.contentWindow?.focus();
          printFrame?.contentWindow?.print();
          setIsPrinting(false);
        }, 300);
      } else {
        setIsPrinting(false);
      }
    } catch (err) {
      console.error('Print iframe error:', err);
      setIsPrinting(false);
      window.print();
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    if (!productInfo) return;
    try {
      setIsExportingExcel(true);
      const payload: HitungUlangExportPayload = {
        kode_produksi: productInfo.code,
        nama_produk: productInfo.productName,
        kategori: productInfo.kategori,
        up_vendor: productInfo.upVendor,
        tanggal_pemeriksaan: auditDate,
        petugas_pemeriksa: auditorName || 'Auditor Gudang',
        foto_url: productInfo.photoUrl,
        items: auditRows,
      };

      await exportHitungUlangToExcel(payload);
      onShowToast(`File Excel Hitung Ulang Kode ${productInfo.code} berhasil diunduh!`, 'success');
    } catch (err: any) {
      console.error('Error exporting hitung ulang excel:', err);
      onShowToast(err?.message || 'Gagal ekspor Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Re-Push hasil hitung ulang fisik langsung ke Google Sheets (Update Tab Surat Jalan)
  const handleRePushRecountToSheet = async () => {
    if (auditRows.length === 0) {
      onShowToast('Tidak ada data hitung ulang untuk dikirim.', 'warning');
      return;
    }

    // Kelompokkan per Surat Jalan yang terlibat dalam audit ini
    const sjMap = new Map<string, typeof auditRows>();
    auditRows.forEach((row) => {
      const sjKey = (row.no_surat_jalan || `SJ-${row.kode_produksi}`).trim();
      if (!sjMap.has(sjKey)) sjMap.set(sjKey, []);
      sjMap.get(sjKey)!.push(row);
    });

    const payloads: SuratJalanPushPayload[] = Array.from(sjMap.entries()).map(([noSj, items]) => {
      const first = items[0];
      return {
        no_surat_jalan: noSj,
        tanggal: first.tanggal_penerimaan || auditDate,
        kategori: productInfo?.kategori || 'Lokal CMT',
        up_vendor: productInfo?.upVendor || '-',
        operator: auditorName || 'Auditor Fisik',
        is_recount: true,
        items: items.map((it) => ({
          kode_produksi: it.kode_produksi || '',
          nama_produk: it.nama_produk || '',
          warna: it.warna || '',
          size: it.size || '',
          // Gunakan qty hasil hitung ulang fisik jika diisi, atau qty sebelumnya
          qty: it.qty_hitung_ulang !== null ? it.qty_hitung_ulang : it.qty_sebelumnya,
          foto_url: it.foto_url || '',
          keterangan: it.catatan
            ? `Hasil Re-Count Fisik: ${it.catatan}`
            : (it.qty_hitung_ulang !== null ? `Hasil Re-Count Fisik (Semula: ${it.qty_sebelumnya} pcs)` : ''),
        })),
      };
    });

    try {
      setIsRePushingSheet(true);
      const res = await pushSuratJalanToGoogleSheet(payloads);
      if (res.success) {
        onShowToast(
          res.message || `Sukses re-push ${payloads.length} Surat Jalan hasil hitung ulang ke Sheets!`,
          'success'
        );
      } else {
        onShowToast(res.message || 'Gagal re-push ke Google Sheets', 'error');
      }
    } catch (err: any) {
      console.error('Error re-pushing recount:', err);
      onShowToast('Gagal re-push ke Google Sheets: ' + (err?.message || err), 'error');
    } finally {
      setIsRePushingSheet(false);
    }
  };

  // Apply recount to system data & save persistently to Supabase & Local Cache
  const handleApplyToSystem = async () => {
    if (summary.totalCountedRows === 0) {
      onShowToast('Belum ada data hitung ulang fisik yang diisi!', 'warning');
      return;
    }

    if (
      !window.confirm(
        `Yakin ingin menerapkan hasil hitung ulang fisik untuk Kode ${selectedCode}?\nTotal Qty Baru: ${summary.totalRecount} pcs (Sebelumnya: ${summary.totalPrev} pcs)`
      )
    ) {
      return;
    }

    try {
      setIsApplying(true);

      const updatedItems: PenerimaanProduksiItem[] = filteredRawItems.map((it, idx) => {
        const rowKey = `${it.id || idx}-${it.kode_produksi}-${it.warna}-${it.size}-${it.tanggal_penerimaan}`;
        const stateVal = recountValues[rowKey];
        const isCounted = stateVal && stateVal.recountQty !== null;
        const countFisik = isCounted ? stateVal.recountQty : it.recount_qty ?? null;
        const selisih = countFisik !== null ? countFisik - it.qty : null;
        const status = selisih === null ? undefined : selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH';
        const nextRound = isCounted ? (Number(it.recount_round) || 0) + 1 : it.recount_round;

        return {
          ...it,
          // PENTING: it.qty TETAP ASLI (IMMUTABLE/TIDAK DIUBAH)!
          qty: it.qty,
          recount_qty: countFisik,
          recount_selisih: selisih,
          recount_status: status,
          recount_round: nextRound,
          recount_notes: stateVal?.note || it.recount_notes,
          recount_auditor: auditorName || it.recount_auditor || 'Auditor',
          recount_updated_at: new Date().toISOString(),
          keterangan: stateVal?.note
            ? `${it.keterangan ? it.keterangan + ' | ' : ''}Audit Re-count: ${stateVal.note}`
            : it.keterangan,
        };
      });

      // 1. Simpan perubahan ke Supabase & LocalStorage secara permanen
      await updatePenerimaanProduksiItemsInSupabase(updatedItems);

      // 2. Simpan Riwayat Audit Hitung Ulang (History Log)
      try {
        const detailRecords = auditRows.map((r) => {
          const rowKey = `${r.id || ''}-${r.kode_produksi}-${r.warna}-${r.size}-${r.tanggal_penerimaan}`;
          const sv = recountValues[rowKey];
          const fisik = sv && sv.recountQty !== null ? sv.recountQty : r.qty_sebelumnya;
          return {
            id: r.id,
            kode_produksi: r.kode_produksi,
            nama_produk: r.nama_produk,
            warna: r.warna,
            size: r.size,
            tanggal_penerimaan: r.tanggal_penerimaan,
            no_surat_jalan: r.no_surat_jalan,
            qty_sebelumnya: r.qty_sebelumnya,
            qty_fisik: fisik,
            selisih: fisik - r.qty_sebelumnya,
            catatan: sv?.note || '',
          };
        });

        await savePenerimaanRecountLog({
          tanggal_audit: auditDate,
          auditor: auditorName || 'Auditor Fisik',
          kode_produksi: isMultiCodeMode ? activeSelectedCodes.join(', ') : selectedCode,
          total_sebelumnya: summary.totalPrev,
          total_fisik: summary.totalRecount,
          total_selisih: summary.totalSelisih,
          general_notes: generalNotes,
          details: detailRecords,
        });

        await loadRecountHistory();
      } catch (logErr) {
        console.warn('Gagal catat riwayat hitung ulang:', logErr);
      }

      // 3. AUTO-PUSH TARGETED DELTA KE MASTER SHEET DI GOOGLE SPREADSHEET (ANTI-TIMEOUT)
      try {
        const deltaItems: MasterRecountDeltaItem[] = [];
        const sizeMap = new Map<string, { qtyAsli: number; qtyFisik: number | null; note?: string; dates: Set<string> }>();

        updatedItems.forEach((it) => {
          const key = `${it.warna}_${it.size}`;
          if (!sizeMap.has(key)) {
            sizeMap.set(key, { qtyAsli: 0, qtyFisik: it.recount_qty ?? null, note: it.recount_notes, dates: new Set() });
          }
          sizeMap.get(key)!.qtyAsli += Number(it.qty) || 0;
          if (it.tanggal_penerimaan) {
            sizeMap.get(key)!.dates.add(it.tanggal_penerimaan);
          }
          if (it.recount_qty !== undefined && it.recount_qty !== null) {
            sizeMap.get(key)!.qtyFisik = it.recount_qty;
          }
        });

        // Tanggal kedatangan umum dari seluruh item kode ini
        const allDates = Array.from(new Set(updatedItems.map((it) => it.tanggal_penerimaan).filter(Boolean)));
        const defaultDateInfo = formatDatesSummary(allDates);

        sizeMap.forEach((val, key) => {
          const [warna, size] = key.split('_');
          const selisih = val.qtyFisik !== null ? val.qtyFisik - val.qtyAsli : 0;
          const status = val.qtyFisik === null ? 'BELUM' : selisih === 0 ? 'MATCH' : selisih < 0 ? 'KURANG' : 'LEBIH';
          const variantDateInfo = val.dates.size > 0 ? formatDatesSummary(Array.from(val.dates)) : defaultDateInfo;
          deltaItems.push({
            kode_produksi: selectedCode,
            warna,
            size,
            qty_asli: val.qtyAsli,
            qty_fisik: val.qtyFisik !== null ? val.qtyFisik : val.qtyAsli,
            selisih,
            status,
            round: (updatedItems[0]?.recount_round || 1),
            auditor: auditorName || 'Auditor',
            catatan: val.note || '',
            tanggal_kedatangan_info: variantDateInfo,
            updated_at: new Date().toISOString(),
          });
        });

        const deltaRes = await pushMasterRecountDeltaToGoogleSheet({
          activeTab: productInfo?.kategori === 'Kargo' ? 'Kargo' : 'CMT',
          kode_produksi: selectedCode,
          tanggal_hitung: auditDate,
          items: deltaItems,
        });

        // Persist ke Cloud settings
        try {
          await saveRecountAuditRecord({
            kode_produksi: selectedCode,
            tanggal_audit: auditDate,
            total_asli: summary.totalPrev,
            total_fisik: summary.totalRecount,
            total_selisih: summary.totalSelisih,
            status: summary.totalSelisih === 0 ? 'MATCH' : summary.totalSelisih < 0 ? 'KURANG' : 'LEBIH',
            round: (updatedItems[0]?.recount_round || 1),
            auditor: auditorName || 'Auditor',
            catatan: generalNotes,
            updated_at: new Date().toISOString(),
            variants: deltaItems.map((d) => ({
              warna: d.warna,
              size: d.size,
              qty_asli: d.qty_asli,
              qty_fisik: d.qty_fisik,
              selisih: d.selisih,
              status: d.status,
              note: d.catatan,
            })),
          });
        } catch (eR) {}

        if (deltaRes.success) {
          onShowToast(`Auto-push Master Sheet berhasil: Data hitung ulang Kode ${selectedCode} telah diperbarui di Google Sheets!`, 'success');
        } else {
          console.warn('Auto-push delta response:', deltaRes.message);
        }
      } catch (gasErr: any) {
        console.warn('Auto-push delta ke Google Sheet tertunda/gagal:', gasErr);
      }

      // 3. Panggil callback induk jika ada
      if (onApplyReCountToData) {
        onApplyReCountToData(updatedItems);
      }

      onShowToast(`Hasil hitung ulang Kode ${selectedCode} berhasil disimpan & dicatat ke Riwayat History!`, 'success');
      onClose();
    } catch (err: any) {
      console.error('Error applying recount:', err);
      onShowToast(err?.message || 'Gagal menerapkan hitung ulang ke database', 'error');
    } finally {
      setIsApplying(false);
    }
  };
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* ==================================================================== */}
      {/* HIDDEN PRINT TEMPLATE CONTAINER FOR DIRECT IFRAME PRINT (100% ISOLATED 1 PAGE) */}
      {/* ==================================================================== */}
      <div ref={printContainerRef} style={{ display: 'none' }}>
        <div style={{ padding: '4px', maxWidth: '100%', margin: '0 auto' }}>
          {/* HEADER CETAK RESMI */}
          <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: '8px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0f172a', margin: 0 }}>
                  LEMBAR VERIFIKASI & HITUNG ULANG FISIK
                </h1>
                <p style={{ fontSize: '10.5px', color: '#475569', margin: '2px 0 0 0', fontWeight: 600 }}>
                  WMS CHOCOCHIPS WAREHOUSE &bull; AUDIT RE-COUNT FISIK GUDANG
                </p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#0f172a', lineHeight: '1.4' }}>
                <div><span style={{ fontWeight: 700 }}>Kode Produksi:</span> <span className="badge-code" style={{ color: '#e11d48', fontWeight: 900, fontFamily: 'monospace', fontSize: '13px' }}>{isMultiCodeMode ? activeSelectedCodes.join(', ') : selectedCode}</span></div>
                <div><span style={{ fontWeight: 700 }}>Tanggal Audit:</span> <span>{auditDate}</span></div>
                {auditorName ? <div><span style={{ fontWeight: 700 }}>Auditor:</span> <span>{auditorName}</span></div> : null}
              </div>
            </div>

            {/* METADATA PRODUK SINGKAT */}
            {productInfo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #cbd5e1', fontSize: '11px' }}>
                {productInfo.photoUrl ? (
                  <img src={productInfo.photoUrl} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
                ) : null}
                <div>
                  <span style={{ fontWeight: 800, color: '#0f172a' }}>{productInfo.productName || 'Tanpa Nama'}</span>
                  <span style={{ color: '#64748b', marginLeft: '6px' }}>({productInfo.kategori || 'Produksi'})</span>
                  {productInfo.upVendor ? <span style={{ color: '#64748b', marginLeft: '6px' }}>&bull; UP: {productInfo.upVendor}</span> : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* TABEL RINCIAN FISIK HITUNG ULANG */}
          <table>
            <thead>
              <tr>
                <th style={{ width: '28px' }}>NO</th>
                <th style={{ width: '75px' }}>TANGGAL</th>
                <th>SURAT JALAN</th>
                <th className="td-left" style={{ width: '130px' }}>WARNA</th>
                <th style={{ width: '45px' }}>SIZE</th>
                <th style={{ width: '90px', backgroundColor: '#e0f2fe', color: '#0369a1' }}>HITUNG AWAL</th>
                <th style={{ width: '100px', backgroundColor: '#ffe4e6', color: '#be123c' }}>HITUNG ULANG</th>
                <th style={{ width: '70px' }}>SELISIH</th>
                <th style={{ width: '75px' }}>STATUS</th>
                <th className="td-left">CATATAN PEMERIKSAAN</th>
              </tr>
            </thead>
            <tbody>
              {auditRowsGroupedByCode.map((group, gIdx) => {
                return (
                  <React.Fragment key={group.code}>
                    {/* PEMISAH KODE CETAK DENGAN SUB-HEADER */}
                    {auditRowsGroupedByCode.length > 1 && (
                      <tr style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                        <td colSpan={10} style={{ textAlign: 'left', padding: '5px 8px', borderTop: gIdx > 0 ? '2.5px solid #0f172a' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ backgroundColor: '#e11d48', color: '#ffffff', padding: '2px 7px', borderRadius: '4px', fontWeight: 900, fontFamily: 'monospace', fontSize: '11px', marginRight: '8px' }}>
                                KODE: {group.code}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '10.5px' }}>{group.nama_produk || 'Produksi'}</span>
                            </div>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: '#e2e8f0' }}>
                              Subtotal Terdata: <strong style={{ color: '#38bdf8' }}>{group.totalPrev} pcs</strong>
                              {group.totalCounted > 0 && (
                                <span style={{ marginLeft: '10px' }}>
                                  Fisik: <strong style={{ color: '#fb7185' }}>{group.totalRecount} pcs</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* BARIS ITEM PER KODE */}
                    {group.items.map((row, idx) => {
                      const isCounted = row.qty_hitung_ulang !== null;
                      const isMatch = isCounted && row.qty_hitung_ulang === row.qty_sebelumnya;
                      return (
                        <tr key={`${group.code}-${idx}`}>
                          <td>{idx + 1}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '10px' }}>{row.tanggal_penerimaan || '-'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '10px', color: '#475569' }}>{row.no_surat_jalan}</td>
                          <td className="td-left" style={{ fontWeight: 700 }}>{row.warna}</td>
                          <td style={{ fontWeight: 700 }}>{row.size}</td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0284c7', backgroundColor: '#f0f9ff' }}>
                            {row.qty_sebelumnya} pcs
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 900, color: '#e11d48', backgroundColor: '#fff1f2' }}>
                            {row.qty_hitung_ulang !== null ? `${row.qty_hitung_ulang} pcs` : '...........'}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 800 }}>
                            {isCounted ? (
                              <span style={{ color: row.selisih === 0 ? '#16a34a' : row.selisih > 0 ? '#2563eb' : '#dc2626' }}>
                                {row.selisih > 0 ? `+${row.selisih}` : row.selisih}
                              </span>
                            ) : '-'}
                          </td>
                          <td style={{ fontSize: '10px', fontWeight: 700 }}>
                            {!isCounted ? (
                              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Belum Cek</span>
                            ) : isMatch ? (
                              <span style={{ color: '#16a34a' }}>Cocok</span>
                            ) : (
                              <span style={{ color: '#dc2626' }}>{row.selisih > 0 ? 'Lebih' : 'Kurang'}</span>
                            )}
                          </td>
                          <td className="td-left" style={{ fontSize: '10px', color: '#334155' }}>
                            {row.catatan || ''}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: 900, borderTop: '2px solid #475569' }}>
                <td colSpan={5} style={{ textAlign: 'right', paddingRight: '8px', textTransform: 'uppercase' }}>
                  TOTAL KESELURUHAN:
                </td>
                <td style={{ fontFamily: 'monospace', color: '#0284c7', fontSize: '11.5px' }}>
                  {summary.totalPrev} pcs
                </td>
                <td style={{ fontFamily: 'monospace', color: '#e11d48', fontSize: '11.5px' }}>
                  {summary.totalCountedRows > 0 ? `${summary.totalRecount} pcs` : '-'}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  {summary.totalCountedRows > 0 ? (
                    <span style={{ color: summary.totalSelisih === 0 ? '#16a34a' : '#dc2626' }}>
                      {summary.totalSelisih > 0 ? `+${summary.totalSelisih}` : summary.totalSelisih}
                    </span>
                  ) : '-'}
                </td>
                <td colSpan={2} className="td-left" style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>
                  {summary.totalCountedRows} dari {auditRows.length} baris dihitung fisik
                </td>
              </tr>
            </tfoot>
          </table>

          {/* TANDA TANGAN AUDIT FISIK */}
          <div className="sig-grid">
            <div className="sig-box">
              <div style={{ fontWeight: 700, color: '#334155' }}>Petugas Hitung Ulang Fisik:</div>
              <div className="sig-line">
                ( {auditorName || '...........................................'} )
              </div>
            </div>
            <div className="sig-box">
              <div style={{ fontWeight: 700, color: '#334155' }}>Kepala Gudang / Supervisor:</div>
              <div className="sig-line">
                ( ........................................... )
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* HEADER MODAL */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between ">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-2">
                <span>Lembar Verifikasi & Hitung Ulang Fisik</span>
                <span className="px-2 py-0.5 bg-rose-500 text-[10px] font-bold rounded-full uppercase">
                  Audit Stock
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                Panggil data kedatangan untuk pengecekan fisik ulang dengan melampirkan kode hitungan sebelumnya
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>



        {/* SUB-NAVBAR TABS (LEMBAR AUDIT vs RIWAYAT HISTORY) */}
        <div className="px-5 py-2.5 bg-slate-800 border-b border-slate-700/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveModalTab('hitung')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeModalTab === 'hitung'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Lembar Hitung Fisik</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveModalTab('history');
                loadRecountHistory();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeModalTab === 'history'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat Hitung Ulang</span>
              {recountHistoryList.length > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-500/30 text-rose-300 text-[10px] font-black rounded-full border border-rose-500/40">
                  {recountHistoryList.length}
                </span>
              )}
            </button>
          </div>

          <div className="text-[11px] text-slate-400 hidden sm:block">
            {activeModalTab === 'hitung'
              ? 'Mode Input & Verifikasi Fisik'
              : 'Daftar audit hitung ulang yang pernah diterapkan'}
          </div>
        </div>

        {activeModalTab === 'hitung' ? (
        <>
{/* FILTER & SELECTOR BAR */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 space-y-3 ">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Pilih Kode Produksi (Single vs Multi-Choice) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  {isMultiCodeMode ? 'Pilih Multiple Kode:' : 'Pilih Kode Produksi:'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = !isMultiCodeMode;
                    setIsMultiCodeMode(nextMode);
                    if (nextMode && !selectedCodesMulti.includes(selectedCode) && selectedCode) {
                      setSelectedCodesMulti([selectedCode]);
                    }
                  }}
                  className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  {isMultiCodeMode ? '← Mode 1 Kode' : '+ Multi-Choice Kode'}
                </button>
              </div>

              {!isMultiCodeMode ? (
                <select
                  value={selectedCode}
                  onChange={(e) => {
                    const newC = e.target.value;
                    setSelectedCode(newC);
                    setSelectedCodesMulti([newC]);
                    setSelectedTanggal('all');
                    setRecountValues({});
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {distinctCodes.map((code) => (
                    <option key={code} value={code}>
                      Kode: {code}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-1.5">
                  {/* Dropsearch Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Cari kode produksi..."
                      value={multiSearchQuery}
                      onChange={(e) => setMultiSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    {multiSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setMultiSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Dropsearch Multi-choice Checkbox List */}
                  <div className="max-h-36 overflow-y-auto p-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs space-y-0.5 divide-y divide-slate-100 dark:divide-slate-700/50 shadow-inner">
                    {searchedDistinctCodes.length === 0 ? (
                      <div className="py-3 text-center text-slate-400 italic text-[11px]">
                        Tidak ada kode "{multiSearchQuery}"
                      </div>
                    ) : (
                      searchedDistinctCodes.map((code) => {
                        const isChecked = selectedCodesMulti.includes(code);
                        return (
                          <label
                            key={code}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition select-none ${
                              isChecked
                                ? 'bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-black'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/60 font-semibold text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCodesMulti((prev) => [...prev, code]);
                                  } else {
                                    setSelectedCodesMulti((prev) => prev.filter((c) => c !== code));
                                  }
                                }}
                                className="rounded text-rose-600 focus:ring-rose-500 h-3.5 w-3.5 cursor-pointer accent-rose-600"
                              />
                              <span className="font-mono text-xs">{code}</span>
                            </div>
                            {isChecked && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-rose-500 text-white rounded font-bold">
                                Terpilih
                              </span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>

                  {/* Multi-choice Quick Actions Toolbar */}
                  <div className="flex justify-between items-center text-[10px] text-slate-500 px-1 pt-0.5">
                    <span className="font-semibold">
                      <strong className="text-rose-600">{selectedCodesMulti.length}</strong> dari {distinctCodes.length} kode dipilih
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          // Pilih semua yang tampil di hasil search
                          const newAdd = searchedDistinctCodes.filter(c => !selectedCodesMulti.includes(c));
                          setSelectedCodesMulti(prev => [...prev, ...newAdd]);
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-bold"
                      >
                        Pilih Hasil
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCodesMulti([])}
                        className="text-slate-400 hover:text-rose-600 font-bold"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Pilih Tanggal Kedatangan */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Pilih Kedatangan / Tanggal:
              </label>
              <select
                value={selectedTanggal}
                onChange={(e) => {
                  setSelectedTanggal(e.target.value);
                  setRecountValues({});
                }}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="all">Semua Tanggal Kedatangan ({availableDatesForCode.length} Tgl)</option>
                {availableDatesForCode.map((d) => (
                  <option key={d} value={d}>
                    Kedatangan: {d}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Petugas Auditor */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nama Petugas Checker / Auditor:
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Nama checker..."
                  value={auditorName}
                  onChange={(e) => setAuditorName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* 4. Tanggal Audit */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tanggal Pemeriksaan Fisik:
              </label>
              <input
                type="date"
                value={auditDate}
                onChange={(e) => setAuditDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Product Banner Summary */}
          {productInfo && (
            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs flex-wrap gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                {productInfo.photoUrl ? (
                  <img
                    src={productInfo.photoUrl}
                    alt={productInfo.code}
                    className="w-12 h-12 rounded-lg object-cover border border-slate-300 dark:border-slate-600 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-rose-600 dark:text-rose-400 font-mono">
                      KODE: {productInfo.code}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                      {productInfo.kategori}
                    </span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                    {productInfo.productName || 'Tanpa Nama Produk'} {productInfo.upVendor ? `• UP: ${productInfo.upVendor}` : ''}
                  </div>
                </div>
              </div>

              {/* Action shortcuts */}
              <div className="flex items-center gap-2 ">
                <button
                  type="button"
                  onClick={handleFillAllWithPrev}
                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition cursor-pointer"
                  title="Salin semua angka sebelumnya ke kolom hitung ulang"
                >
                  Salin Angka Terdata
                </button>

                <button
                  type="button"
                  onClick={handleResetRecount}
                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-red-100 hover:text-red-600 text-slate-500 rounded-lg text-xs font-bold transition cursor-pointer"
                  title="Kosongkan kolom hitung ulang"
                >
                  Reset Form
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RE-COUNT TABLE BODY */}
        <div className="flex-1 overflow-y-auto  p-4  space-y-4">
          <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl">
            <table className="w-full text-center border-collapse text-xs select-text">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold uppercase text-[11px] border-b border-slate-300 dark:border-slate-700 divide-x divide-slate-300 dark:divide-slate-700">
                  <th className="py-2.5 px-2 w-10">NO</th>
                  <th className="py-2.5 px-3">TANGGAL</th>
                  <th className="py-2.5 px-3">SURAT JALAN</th>
                  <th className="py-2.5 px-3">WARNA</th>
                  <th className="py-2.5 px-2 w-14">SIZE</th>
                  <th className="py-2.5 px-3 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 font-black">
                    HITUNGAN SEBELUMNYA
                  </th>
                  <th className="py-2.5 px-3 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 font-black min-w-[130px]">
                    HITUNG ULANG FISIK
                  </th>
                  <th className="py-2.5 px-3 min-w-[80px]">SELISIH (+/-)</th>
                  <th className="py-2.5 px-3 min-w-[100px]">STATUS</th>
                  <th className="py-2.5 px-3 min-w-[150px]">CATATAN AUDIT</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                {auditRows.map((row, idx) => {
                  const rowKey = `${row.id}-${row.kode_produksi}-${row.warna}-${row.size}-${row.tanggal_penerimaan}`;
                  const isCounted = row.qty_hitung_ulang !== null;
                  const isMatch = isCounted && row.qty_hitung_ulang === row.qty_sebelumnya;
                  const isDiscrepancy = isCounted && row.qty_hitung_ulang !== row.qty_sebelumnya;

                  return (
                    <tr
                      key={rowKey}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition divide-x divide-slate-200 dark:divide-slate-800 ${
                        isDiscrepancy ? 'bg-red-50/40 dark:bg-red-950/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-2 text-slate-500 font-semibold">{idx + 1}</td>
                      <td className="py-2.5 px-2 font-mono text-[11px]">{row.tanggal_penerimaan || '-'}</td>
                      <td className="py-2.5 px-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {row.no_surat_jalan}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white text-left">
                        {row.warna}
                      </td>
                      <td className="py-2.5 px-2 font-bold text-slate-800 dark:text-slate-200">{row.size}</td>

                      {/* 1. Hitungan Sebelumnya */}
                      <td className="py-2.5 px-3 font-mono font-black text-sm text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/20">
                        {row.qty_sebelumnya} pcs
                      </td>

                      {/* 2. Hitung Ulang Fisik (Input ketik tanpa panah) */}
                      <td className="p-1 bg-rose-50/30 dark:bg-rose-950/20">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="Ketik qty..."
                          value={row.qty_hitung_ulang !== null ? String(row.qty_hitung_ulang) : ''}
                          onChange={(e) => handleTypeRecount(rowKey, e.target.value)}
                          className="w-full py-1.5 px-2 text-center font-mono font-black text-sm text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-2xs"
                        />
                      </td>

                      {/* 3. Selisih */}
                      <td className="py-2.5 px-2 font-mono font-black text-xs">
                        {isCounted ? (
                          <span
                            className={
                              row.selisih === 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.selisih > 0
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          >
                            {row.selisih > 0 ? `+${row.selisih}` : row.selisih}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700">-</span>
                        )}
                      </td>

                      {/* 4. Status */}
                      <td className="py-2.5 px-2 text-[11px] font-bold">
                        {!isCounted ? (
                          <span className="text-slate-400 font-normal italic">Belum Cek</span>
                        ) : isMatch ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Cocok</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{row.selisih > 0 ? 'Lebih' : 'Kurang'}</span>
                          </span>
                        )}
                      </td>

                      {/* 5. Catatan */}
                      <td className="p-1">
                        <input
                          type="text"
                          placeholder="Catatan..."
                          value={row.catatan || ''}
                          onChange={(e) => handleTypeNote(rowKey, e.target.value)}
                          className="w-full py-1 px-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-rose-400"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* FOOTER TOTAL */}
              <tfoot>
                <tr className="bg-slate-100 dark:bg-slate-800 font-black text-xs divide-x divide-slate-300 dark:divide-slate-700 border-t-2 border-slate-400 dark:border-slate-600">
                  <td colSpan={5} className="py-3 px-3 text-right text-slate-900 dark:text-white uppercase">
                    TOTAL KESELURUHAN:
                  </td>
                  <td className="py-3 px-3 text-blue-600 dark:text-blue-400 font-mono text-sm">
                    {summary.totalPrev} pcs
                  </td>
                  <td className="py-3 px-3 text-rose-600 dark:text-rose-400 font-mono text-sm">
                    {summary.totalCountedRows > 0 ? `${summary.totalRecount} pcs` : '-'}
                  </td>
                  <td className="py-3 px-2 font-mono text-sm">
                    {summary.totalCountedRows > 0 ? (
                      <span className={summary.totalSelisih === 0 ? 'text-emerald-600' : 'text-red-600'}>
                        {summary.totalSelisih > 0 ? `+${summary.totalSelisih}` : summary.totalSelisih}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td colSpan={2} className="py-3 px-3 text-left text-slate-500 font-semibold text-[11px]">
                    {summary.totalCountedRows} dari {auditRows.length} baris dihitung fisik
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>


        </div>

        
        </>
      ) : (
        /* RIWAYAT HITUNG ULANG FISIK TAB VIEW */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/50 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari riwayat kode / auditor..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-rose-500 w-64 shadow-xs"
                />
              </div>
              <button
                type="button"
                onClick={loadRecountHistory}
                disabled={isLoadingHistory}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Total {recountHistoryList.length} sesi hitung ulang tercatat
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="py-16 text-center text-slate-400 text-xs">Memuat riwayat hitung ulang...</div>
          ) : recountHistoryList.length === 0 ? (
            <div className="py-16 text-center bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
              <History className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Belum Ada Riwayat Hitung Ulang</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Setiap kali Anda menekan tombol <strong>&apos;Terapkan Hasil Hitung&apos;</strong> pada tab Lembar Hitung Fisik, riwayat perubahan, auditor, tanggal, serta selisih akan otomatis tercatat permanen di sini.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recountHistoryList
                .filter((log) => {
                  if (!historySearchQuery) return true;
                  const q = historySearchQuery.toLowerCase();
                  return (
                    log.kode_produksi.toLowerCase().includes(q) ||
                    log.auditor.toLowerCase().includes(q) ||
                    (log.general_notes && log.general_notes.toLowerCase().includes(q))
                  );
                })
                .map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const formattedDate = new Date(log.created_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });

                  return (
                    <div
                      key={log.id}
                      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs transition"
                    >
                      {/* Log Header Summary */}
                      <div className="p-4 flex items-center justify-between flex-wrap gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750/50"
                           onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${
                            log.total_selisih === 0
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                          }`}>
                            {log.total_selisih === 0 ? (
                              <CheckCircle2 className="w-5 h-5" />
                            ) : (
                              <AlertTriangle className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2.5 py-0.5 bg-slate-900 dark:bg-slate-700 text-white font-mono font-black text-xs rounded-md">
                                {log.kode_produksi}
                              </span>
                              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                <User className="w-3.5 h-3.5" />
                                {log.auditor}
                              </span>
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {formattedDate}
                              </span>
                            </div>
                            {log.general_notes && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">
                                &quot;{log.general_notes}&quot;
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-[11px] text-slate-400 font-medium">
                              Sebelum: <strong className="text-slate-700 dark:text-slate-200">{log.total_sebelumnya}</strong> &bull; Fisik: <strong className="text-slate-700 dark:text-slate-200">{log.total_fisik} pcs</strong>
                            </div>
                            <div className={`text-xs font-black ${
                              log.total_selisih === 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : log.total_selisih > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {log.total_selisih === 0
                                ? 'MATCH (0)'
                                : `Selisih: ${log.total_selisih > 0 ? '+' : ''}${log.total_selisih} pcs`}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Hapus riwayat hitung ulang ini?')) {
                                  deletePenerimaanRecountLog(log.id).then(() => loadRecountHistory());
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                              title="Hapus riwayat ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Detail Expanded Table */}
                      {isExpanded && log.details && log.details.length > 0 && (
                        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 p-4 overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead>
                              <tr className="text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
                                <th className="pb-2">Warna</th>
                                <th className="pb-2 text-center">Size</th>
                                <th className="pb-2 text-center">Tgl Masuk</th>
                                <th className="pb-2 text-center">Qty Awal</th>
                                <th className="pb-2 text-center text-rose-600">Qty Fisik</th>
                                <th className="pb-2 text-center">Selisih</th>
                                <th className="pb-2">Catatan Audit</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {log.details.map((d, dIdx) => (
                                <tr key={dIdx} className="hover:bg-white dark:hover:bg-slate-800 transition">
                                  <td className="py-2 font-semibold text-slate-800 dark:text-slate-200">{d.warna}</td>
                                  <td className="py-2 text-center font-mono font-bold">{d.size}</td>
                                  <td className="py-2 text-center text-slate-500">{d.tanggal_penerimaan}</td>
                                  <td className="py-2 text-center font-mono">{d.qty_sebelumnya}</td>
                                  <td className="py-2 text-center font-mono font-black text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded">
                                    {d.qty_fisik}
                                  </td>
                                  <td className="py-2 text-center font-mono font-bold">
                                    <span className={d.selisih === 0 ? 'text-slate-400' : d.selisih > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                      {d.selisih > 0 ? `+${d.selisih}` : d.selisih}
                                    </span>
                                  </td>
                                  <td className="py-2 text-slate-500 italic">{d.catatan || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
{/* MODAL ACTION FOOTER */}
        {activeModalTab === 'hitung' && (
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">
              Status Cek: <strong className="text-emerald-600">{summary.matchCount} Cocok</strong>
              {summary.mismatchCount > 0 && (
                <> • <strong className="text-red-600">{summary.mismatchCount} Selisih</strong></>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Printout PDF */}
            <button
              type="button"
              onClick={handlePrintDedicated}
              disabled={isPrinting}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Cetak Lembar Hitung Ulang / Simpan PDF (1 Halaman Pas)"
            >
              <Printer className="w-3.5 h-3.5 text-rose-400" />
              <span>{isPrinting ? 'Menyiapkan...' : 'Cetak / PDF'}</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              disabled={isExportingExcel}
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              title="Download Format Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isExportingExcel ? 'Mengunduh...' : 'Export Excel'}</span>
            </button>

            {/* Apply to System */}
            <button
              type="button"
              disabled={isApplying || summary.totalCountedRows === 0}
              onClick={handleApplyToSystem}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              title="Terapkan hasil hitung ulang fisik ke sistem penerimaan"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isApplying ? 'Menerapkan...' : 'Terapkan Hasil Hitung'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
  );
};
