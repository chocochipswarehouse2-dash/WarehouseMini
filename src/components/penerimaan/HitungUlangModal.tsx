import React, { useState, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import { PenerimaanProduksiItem } from '../../types';
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

  // Selected State
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedTanggal, setSelectedTanggal] = useState<string>('all');
  const [auditorName, setAuditorName] = useState<string>('');
  const [auditDate, setAuditDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [generalNotes, setGeneralNotes] = useState<string>('');

  // Editable rows state: row id -> { recountQty: number | null, note: string }
  const [recountValues, setRecountValues] = useState<Record<string, { recountQty: number | null; note: string }>>({});

  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);

  // Sync initial props on open
  useEffect(() => {
    if (isOpen) {
      const code = initialKodeProduksi || distinctCodes[0] || '';
      setSelectedCode(code);
      setSelectedTanggal(initialTanggal || 'all');
      setRecountValues({});
    }
  }, [isOpen, initialKodeProduksi, initialTanggal, distinctCodes]);

  // Available arrival dates for selected code
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

  // Filtered raw items for selected code and arrival date
  const filteredRawItems = useMemo(() => {
    if (!selectedCode) return [];
    return dataList.filter((it) => {
      const matchCode = (it.kode_produksi || '').trim().toUpperCase() === selectedCode;
      if (!matchCode) return false;
      if (selectedTanggal !== 'all') {
        return it.tanggal_penerimaan === selectedTanggal;
      }
      return true;
    });
  }, [dataList, selectedCode, selectedTanggal]);

  // Product metadata
  const productInfo = useMemo(() => {
    if (filteredRawItems.length === 0) return null;
    const first = filteredRawItems[0];
    const photo = filteredRawItems.find((i) => i.foto_url && i.foto_url.trim().length > 0)?.foto_url;
    return {
      code: selectedCode,
      productName: first.nama_produk || '',
      kategori: first.kategori || 'Lokal CMT',
      upVendor: first.keterangan || '',
      photoUrl: photo,
    };
  }, [filteredRawItems, selectedCode]);

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

  // Apply recount to system data
  const handleApplyToSystem = () => {
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
        const newQty = stateVal && stateVal.recountQty !== null ? stateVal.recountQty : it.qty;
        return {
          ...it,
          qty: newQty,
          keterangan: stateVal?.note
            ? `${it.keterangan ? it.keterangan + ' | ' : ''}Audit Re-count: ${stateVal.note}`
            : it.keterangan,
        };
      });

      if (onApplyReCountToData) {
        onApplyReCountToData(updatedItems);
      } else {
        // Fallback update to local storage
        try {
          const cached = localStorage.getItem('wms_local_penerimaan_produksi');
          if (cached) {
            let list: PenerimaanProduksiItem[] = JSON.parse(cached);
            list = list.map((item) => {
              const matched = updatedItems.find(
                (u) =>
                  u.kode_produksi === item.kode_produksi &&
                  u.warna === item.warna &&
                  u.size === item.size &&
                  u.tanggal_penerimaan === item.tanggal_penerimaan
              );
              return matched || item;
            });
            localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(list));
            window.dispatchEvent(
              new CustomEvent('wms_penerimaan_produksi_updated', {
                detail: { action: 'recount_applied', code: selectedCode },
              })
            );
          }
        } catch {}
      }

      onShowToast(`Hasil hitung ulang Kode ${selectedCode} berhasil diterapkan ke sistem!`, 'success');
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal menerapkan hitung ulang', 'error');
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:rounded-none">
        {/* HEADER MODAL */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between print:hidden">
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

        {/* PRINT ONLY OFFICIAL HEADER */}
        <div className="hidden print:block p-4 border-b-2 border-slate-900 text-center space-y-1">
          <h1 className="text-lg font-black uppercase tracking-wider">
            LEMBAR VERIFIKASI & HITUNG ULANG FISIK PENERIMAAN PRODUKSI
          </h1>
          <p className="text-xs text-slate-600">
            WMS INVENTORY • DOKUMEN AUDIT RE-COUNT FISIK GUDANG
          </p>
        </div>

        {/* FILTER & SELECTOR BAR */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Pilih Kode Produksi */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Pilih Kode Produksi:
              </label>
              <select
                value={selectedCode}
                onChange={(e) => {
                  setSelectedCode(e.target.value);
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
              <div className="flex items-center gap-2 print:hidden">
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

          {/* SIGNATURE SECTION FOR PRINTOUT */}
          <div className="hidden print:grid grid-cols-2 gap-12 pt-8 text-center text-xs">
            <div className="space-y-16">
              <p className="font-bold">Petugas Hitung Ulang Fisik:</p>
              <p className="border-t border-slate-800 pt-1 font-semibold">
                ( {auditorName || '...........................................'} )
              </p>
            </div>
            <div className="space-y-16">
              <p className="font-bold">Kepala Gudang / Supervisor Verifikasi:</p>
              <p className="border-t border-slate-800 pt-1 font-semibold">
                ( ........................................... )
              </p>
            </div>
          </div>
        </div>

        {/* MODAL ACTION FOOTER */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3 print:hidden">
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
              onClick={() => window.print()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              title="Cetak Lembar Hitung Ulang / Simpan PDF"
            >
              <Printer className="w-3.5 h-3.5 text-rose-400" />
              <span>Cetak / PDF</span>
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
      </div>
    </div>
  );
};
